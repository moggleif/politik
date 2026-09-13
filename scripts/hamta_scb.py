#!/usr/bin/env python3
"""Hämtar faktisk folkmängd för en kommun från SCB:s öppna API.

Kungsbacka är standard; Varberg hämtas med  --kommun varberg.

Hämtar tre serier: hela befolkningen, åldersgruppen 16–19 år
(gymnasieåldern) och åldersgruppen 0–15 år (förskole- och
grundskoleåldern), den senare som en enda grupp.

Dessutom hämtas folkmängden **per enskild ålder 0–19 år**. Den behövs för
kohortframskrivningen på gymnasiesidan: barnen som redan bor i kommunen
blir ett år äldre varje år, så antalet 16–19-åringar om k år går att
räkna direkt ur dagens åldersklasser 16−k … 19−k. Den framskrivningen
kräver ingen modell och inga antaganden om födelsetal – bara att man vet
hur många som finns i varje ålder i dag.

Siffrorna kommer från två av SCB:s tabeller, eftersom SCB lagt de senaste
årens uppgifter i egna tabeller i det nya API:t:

  2000–2024  BefolkningNy   (det äldre doris-API:t)
  2025       TAB5557        (PxWeb API 2.0)

Båda är samma statistik: "Folkmängden efter region, civilstånd, ålder och
kön", folkmängd den 31 december. Vill man lägga till ett nytt år: sök upp
årets tabell med
  https://api.scb.se/OV0104/v2beta/api/v2/tables?query=folkmängd&lang=sv
och lägg till den i SENARE_TABELLER nedan.

Resultatet sparas till data/scb/folkmangd_<kommun>.json tillsammans med
metadata om när och hur datat hämtades, så att hämtningen är reproducerbar.

Körs:  python3 scripts/hamta_scb.py [--kommun kungsbacka|varberg]
"""

import argparse
import json
import ssl
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

API_URL = "https://api.scb.se/OV0104/v1/doris/sv/ssd/START/BE/BE0101/BE0101A/BefolkningNy"
# Mänsklig länk till samma tabell i Statistikdatabasen (används som källänk på hemsidan)
TABELL_URL = "https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__BE__BE0101__BE0101A/BefolkningNy/"

API2_URL = "https://api.scb.se/OV0104/v2beta/api/v2/tables/{tabell}/data?lang=sv&outputFormat=json-stat2"
SENARE_TABELLER = {"2025": "TAB5557"}

# Kommunerna som går att hämta: nyckel i filnamnet -> (namn, SCB:s regionkod,
# gymnasieåldern så som kommunens egna prognosrapporter delar in den).
# Kungsbacka redovisar 16–19 år; Varbergs rapporter drar gränsen vid 16–18
# och 19–24, så där hämtas 16–18 för att prognoserna ska gå att jämföra.
KOMMUNER = {
    "kungsbacka": ("Kungsbacka", "1384", (16, 19)),
    "varberg": ("Varberg", "1383", (16, 18)),
}
REGION = KOMMUNER["kungsbacka"][1]  # sätts om av --kommun i main()
FORSTA_AR = 2000


def aldersgrupper(gymnasie: tuple) -> dict:
    """Åldersgrupper som hämtas utöver totalen. Nyckeln används i utdatafilen."""
    lag, hog = gymnasie
    return {
        f"{lag}-{hog}": [str(a) for a in range(lag, hog + 1)],
        "0-15": [str(a) for a in range(0, 16)],
    }


# Enskilda åldrar som sparas var för sig. 0–19 räcker för att skriva fram
# 16–19-åringarna så långt som till dagens nyfödda.
ENSKILDA_ALDRAR = [str(a) for a in range(0, 20)]


def posta(url: str, kropp: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(kropp).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90, context=ssl.create_default_context()) as resp:
        return json.loads(resp.read().decode("utf-8-sig"))


def fraga(aldrar=None) -> dict:
    """Utelämnas ålder summerar SCB över alla åldrar; annars summerar vi själva."""
    q = [
        {"code": "Region",
         "selection": {"filter": "vs:RegionKommun07", "values": [REGION]}},
        {"code": "ContentsCode", "selection": {"filter": "item", "values": ["BE0101N1"]}},
    ]
    if aldrar:
        q.insert(1, {"code": "Alder", "selection": {"filter": "item", "values": aldrar}})
    return {"query": q, "response": {"format": "json"}}


def hamta_serie(aldrar=None) -> dict:
    """Folkmängd per år, summerad över de efterfrågade åldrarna."""
    raw = posta(API_URL, fraga(aldrar))
    per_ar = defaultdict(int)
    for rad in raw["data"]:
        ar = rad["key"][-1]  # sista nyckeln är Tid (år)
        if int(ar) >= FORSTA_AR:
            per_ar[ar] += int(rad["values"][0])
    return dict(per_ar)


def hamta_per_alder(aldrar: list) -> dict:
    """Folkmängd per år OCH ålder, alltså utan summering över åldrarna.

    Svarets nyckel är [Region, Alder, Tid] när ålder väljs som item."""
    raw = posta(API_URL, fraga(aldrar))
    per_ar = defaultdict(dict)
    for rad in raw["data"]:
        _, alder, ar = rad["key"]
        if int(ar) >= FORSTA_AR:
            per_ar[ar][alder] = int(rad["values"][0])
    return dict(per_ar)


def komplettera_per_alder(serie: dict, aldrar: list) -> dict:
    """De senaste åren ligger i egna tabeller i det nya API:t, som bara
    svarar för ett år i taget – där hämtas en ålder per anrop."""
    for ar, tabell in SENARE_TABELLER.items():
        rad = {}
        for alder in aldrar:
            try:
                rad[alder] = hamta_senare_ar(ar, tabell, [alder])
            except Exception as fel:
                print(f"Varning: kunde inte hämta ålder {alder} år {ar}: {fel}")
        if rad:
            serie[ar] = rad
    return {a: dict(sorted(v.items(), key=lambda x: int(x[0])))
            for a, v in sorted(serie.items())}


def hamta_senare_ar(ar: str, tabell: str, aldrar=None) -> int:
    """Ett enskilt år ur PxWeb API 2.0. TotSA/TotSa/SC = summa över ålder,
    kön och civilstånd; 000007ME är måttet Folkmängd."""
    svar = posta(API2_URL.format(tabell=tabell), {
        "selection": [
            {"variableCode": "Region", "valueCodes": [REGION]},
            {"variableCode": "Civilstand", "valueCodes": ["SC"]},
            {"variableCode": "Alder", "valueCodes": aldrar or ["TotSA"]},
            {"variableCode": "Kon", "valueCodes": ["TotSa"]},
            {"variableCode": "ContentsCode", "valueCodes": ["000007ME"]},
            {"variableCode": "Tid", "valueCodes": [ar]},
        ]
    })
    return sum(int(v) for v in svar["value"])


def komplettera(serie: dict, aldrar=None) -> dict:
    for ar, tabell in SENARE_TABELLER.items():
        try:
            serie[ar] = hamta_senare_ar(ar, tabell, aldrar)
        except Exception as fel:  # ett saknat år ska inte stoppa hämtningen
            print(f"Varning: kunde inte hämta {ar} ur {tabell}: {fel}")
    return dict(sorted(serie.items()))


def kontrollera(per_alder: dict, grupper: dict, grupper_def: dict) -> None:
    """De enskilda åldrarna ska summera till åldersgrupperna.

    Gör de inte det har någon av frågorna hämtat något annat än den andra,
    och då är kohortframskrivningen byggd på fel underlag. Det ska synas
    direkt, inte upptäckas i ett diagram långt senare."""
    for namn, aldrar in grupper_def.items():
        for ar, rad in per_alder.items():
            facit = grupper.get(namn, {}).get(ar)
            if facit is None:
                continue
            summa = sum(rad.get(a, 0) for a in aldrar)
            if summa != facit:
                print(f"Varning: {ar} ålder {namn} summerar till {summa}, "
                      f"men åldersgruppen säger {facit}")


def main() -> None:
    global REGION
    arg = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    arg.add_argument("--kommun", choices=sorted(KOMMUNER), default="kungsbacka")
    val = arg.parse_args()
    kommun, REGION, gymnasie = KOMMUNER[val.kommun]
    grupper_def = aldersgrupper(gymnasie)

    folkmangd = komplettera(hamta_serie())

    grupper = {}
    for namn, aldrar in grupper_def.items():
        grupper[namn] = komplettera(hamta_serie(aldrar), aldrar)

    per_alder = komplettera_per_alder(hamta_per_alder(ENSKILDA_ALDRAR),
                                      ENSKILDA_ALDRAR)
    kontrollera(per_alder, grupper, grupper_def)

    ut = {
        "kommun": kommun,
        "regionkod": REGION,
        "matt": "Folkmängd 31 december respektive år",
        "kalla": "SCB, Befolkningsstatistik (BE0101), Folkmängden efter region, "
                 "civilstånd, ålder och kön",
        "kallaUrl": TABELL_URL,
        "apiUrl": API_URL,
        "apiUrlSenareAr": API2_URL.format(tabell=",".join(SENARE_TABELLER.values())),
        "hamtad": date.today().isoformat(),
        "folkmangd": folkmangd,
        "aldersgrupper": grupper,
        "perAlder": per_alder,
    }

    utfil = (Path(__file__).resolve().parent.parent / "data" / "scb"
             / f"folkmangd_{val.kommun}.json")
    utfil.parent.mkdir(parents=True, exist_ok=True)
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Sparade {len(folkmangd)} år ({min(folkmangd)}–{max(folkmangd)}) till {utfil}")
    for namn, serie in grupper.items():
        print(f"  åldersgrupp {namn}: {len(serie)} år, senast {max(serie)} = {serie[max(serie)]}")
    sista = max(per_alder)
    print(f"  per enskild ålder 0–19: {len(per_alder)} år, "
          f"{len(per_alder[sista])} åldrar senast ({sista})")


if __name__ == "__main__":
    main()
