#!/usr/bin/env python3
"""Hämtar faktisk folkmängd för Kungsbacka kommun från SCB:s öppna API.

Hämtar två serier: hela befolkningen och åldersgruppen 16–19 år
(gymnasieåldern).

Siffrorna kommer från två av SCB:s tabeller, eftersom SCB lagt de senaste
årens uppgifter i egna tabeller i det nya API:t:

  2000–2024  BefolkningNy   (det äldre doris-API:t)
  2025       TAB5557        (PxWeb API 2.0)

Båda är samma statistik: "Folkmängden efter region, civilstånd, ålder och
kön", folkmängd den 31 december. Vill man lägga till ett nytt år: sök upp
årets tabell med
  https://api.scb.se/OV0104/v2beta/api/v2/tables?query=folkmängd&lang=sv
och lägg till den i SENARE_TABELLER nedan.

Resultatet sparas till data/scb/folkmangd_kungsbacka.json tillsammans med
metadata om när och hur datat hämtades, så att hämtningen är reproducerbar.

Körs:  python3 scripts/fetch_scb.py
"""

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

REGION_KUNGSBACKA = "1384"
FORSTA_AR = 2000

# Åldersgrupper som hämtas utöver totalen. Nyckeln används i utdatafilen.
ALDERSGRUPPER = {"16-19": ["16", "17", "18", "19"]}


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
         "selection": {"filter": "vs:RegionKommun07", "values": [REGION_KUNGSBACKA]}},
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


def hamta_senare_ar(ar: str, tabell: str, aldrar=None) -> int:
    """Ett enskilt år ur PxWeb API 2.0. TotSA/TotSa/SC = summa över ålder,
    kön och civilstånd; 000007ME är måttet Folkmängd."""
    svar = posta(API2_URL.format(tabell=tabell), {
        "selection": [
            {"variableCode": "Region", "valueCodes": [REGION_KUNGSBACKA]},
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


def main() -> None:
    folkmangd = komplettera(hamta_serie())

    grupper = {}
    for namn, aldrar in ALDERSGRUPPER.items():
        grupper[namn] = komplettera(hamta_serie(aldrar), aldrar)

    ut = {
        "kommun": "Kungsbacka",
        "regionkod": REGION_KUNGSBACKA,
        "matt": "Folkmängd 31 december respektive år",
        "kalla": "SCB, Befolkningsstatistik (BE0101), Folkmängden efter region, "
                 "civilstånd, ålder och kön",
        "kallaUrl": TABELL_URL,
        "apiUrl": API_URL,
        "apiUrlSenareAr": API2_URL.format(tabell=",".join(SENARE_TABELLER.values())),
        "hamtad": date.today().isoformat(),
        "folkmangd": folkmangd,
        "aldersgrupper": grupper,
    }

    utfil = Path(__file__).resolve().parent.parent / "data" / "scb" / "folkmangd_kungsbacka.json"
    utfil.parent.mkdir(parents=True, exist_ok=True)
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Sparade {len(folkmangd)} år ({min(folkmangd)}–{max(folkmangd)}) till {utfil}")
    for namn, serie in grupper.items():
        print(f"  åldersgrupp {namn}: {len(serie)} år, senast {max(serie)} = {serie[max(serie)]}")


if __name__ == "__main__":
    main()
