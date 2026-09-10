#!/usr/bin/env python3
"""Hämtar grundskolans kostnader per elev ur Skolverkets exporttjänst.

Det här är sidans **kontrollkälla**. Själva serierna på kostnadssidan
kommer från Kolada (`hamta_kolada.py`), som redovisar både Kungsbacka och
riket och dessutom oavrundade tal. Skolverket är den myndighet som
publicerar kostnadsstatistiken för kommunala skolor, och deras egna tal
hämtas här för att kunna ställas mot Kolada – ett test räknar av att de
två källorna säger samma sak om Kungsbacka, år för år. Skulle Kolada
räkna om en serie utan att det syns, faller det testet.

Samma exporttjänst som slutbetygen använder, men rapport 32:

  https://siris.skolverket.se/siris/reports/export_api/runexport/
      ?pFormat=csv&pExportID=32&pAr=<år>&pKommun=1384&pFlikar=0

`pAr` är kalenderåret kostnaden avser. Ett år som ännu inte publicerats
svarar med en tom tabell i stället för ett fel – hämtningen stannar då av
sig själv. Skolverket publicerar ett kostnadsår i september året efter,
och ligger något senare än Kolada.

**Bara kommunal huvudman.** Rapporten redovisar enbart kommunala skolor:
Skolverket håller inne de fristående skolornas kostnader med hänvisning
till ekonomisk statistisksekretess.

**Talen är avrundade.** Skolverket skriver ut kostnaden per elev i hela
hundratal kronor (133 700, elevhälsan i tiotal), medan Kolada har samma
tal oavrundat (133 719,99). Avstämningen jämför därför totalen på
hundratalet. Kostnadsslagen stäms inte av mot Skolverket – där ligger
enstaka år någon promille utanför avrundningen, eftersom källorna
räknats fram vid olika tillfällen. Att slagen hänger ihop kontrolleras
i stället inom Kolada: de ska summera till totalen, vilket de gör exakt.

Två kolumnnamn har bytts genom åren: *Elevvård per elev* heter
*Elevhälsa per elev* från och med 2013. Kolumnerna letas därför upp på
sina rubriker och aldrig på position, och båda namnen godtas.

Filerna sparas som data/kostnader/kostnader_<år>.json, ett år per fil.

Körs:  python3 scripts/hamta_kostnader.py            (alla år)
       python3 scripts/hamta_kostnader.py --ar 2024  (ett år)
"""

import argparse
import json
import re
from datetime import date
from pathlib import Path

import skolverket
from skolverket import KOMMUN, tal

ROT = Path(__file__).resolve().parent.parent

EXPORT_ID = 32
FORSTA_AR = 2002          # första året exporten svarar med Kungsbacka

# Utdatanyckel -> rubriken i CSV:en. Flera namn betyder att rubriken bytt
# namn genom åren; den första som finns används.
KOLUMNER = {
    "kommun": ["Kommun"],
    "kommunkod": ["Kommunkod"],
    "huvudman": ["Typ av huvudman"],
    "elever": ["Genomsnittligt elevantal"],
    "totaltTkr": ["Totalt"],
    "undervisningTkr": ["Undervisning"],
    "totaltPerElev": ["Totalt per elev"],
    "undervisningPerElev": ["Undervisning per elev"],
    "lokalerPerElev": ["Lokaler per elev"],
    "maltiderPerElev": ["Måltider per elev"],
    "larverktygPerElev": ["Lärverktyg per elev"],
    "elevhalsaPerElev": ["Elevhälsa per elev", "Elevvård per elev"],
    "ovrigtPerElev": ["Övrigt per elev"],
}
TEXT_FALT = ("kommun", "kommunkod", "huvudman")


def kolumnindex(rubriker: list) -> dict:
    """Kolumnernas platser, hittade på sina rubriker.

    Layouten har ändrats förr (Elevvård -> Elevhälsa), och en export som
    fått en ny kolumn ska stoppa hämtningen i stället för att tyst läsa
    fel tal."""
    plats = {r.strip(): i for i, r in enumerate(rubriker)}
    index = {}
    for nyckel, namn in KOLUMNER.items():
        for n in namn:
            if n in plats:
                index[nyckel] = plats[n]
                break
        else:
            raise SystemExit(
                f"Hittade ingen kolumn {' eller '.join(namn)!r} i exporten – "
                "layouten verkar ha ändrats.")
    return index


def lasa_ar(ar: int) -> dict | None:
    text = skolverket.hamta_csv(EXPORT_ID, ar)
    rader = skolverket.rader_i(text)
    index = kolumnindex(rader[skolverket.rubrikrad(rader, "Kommun")])

    post = None
    for rad in rader:
        if len(rad) <= max(index.values()):
            continue
        if rad[index["kommunkod"]].strip() != KOMMUN:
            continue                      # rubrik-, text- och definitionsrader
        if rad[index["huvudman"]].strip() != "Kommunal":
            continue
        post = {}
        for nyckel in KOLUMNER:
            varde = rad[index[nyckel]]
            post[nyckel] = (varde.strip().replace("\xa0", " ")
                            if nyckel in TEXT_FALT else tal(varde))

    if post is None:
        return None

    return {
        "ar": ar,
        "matt": "Kostnader för grundskolan, kalenderåret, löpande priser",
        "huvudman": "Kommunal",
        "niva": "Skolkommun Kungsbacka",
        "avrundning": "Skolverket redovisar kostnaderna per elev i hela hundratal kronor",
        "rapportTitel": "Grundskola – Kostnader per kommun",
        "kalla": "Skolverket, utbildningsstatistik (kommunernas räkenskapssammandrag)",
        "kallaUrl": skolverket.export_url(EXPORT_ID, ar),
        "statistikUrl": skolverket.STATISTIK_URL,
        "hamtad": date.today().isoformat(),
        "kostnader": post,
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--ar", type=int, help="hämta bara det här året")
    p.add_argument("--tom", type=int, default=date.today().year,
                   help="sista år att försöka med")
    args = p.parse_args()

    ut = ROT / "data" / "kostnader"
    ut.mkdir(parents=True, exist_ok=True)

    ar_lista = [args.ar] if args.ar else range(FORSTA_AR, args.tom + 1)
    skrivna = 0
    for ar in ar_lista:
        try:
            data = lasa_ar(ar)
        except Exception as fel:
            print(f"  {ar}: kunde inte hämta ({fel})")
            continue
        if data is None:
            print(f"  {ar}: ingen rad – året verkar inte publicerat ännu")
            continue
        fil = ut / f"kostnader_{ar}.json"
        fil.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n",
                       encoding="utf-8")
        k = data["kostnader"]
        print(f"  {ar}: {k['totaltPerElev']} kr/elev, "
              f"{k['elever']} elever → {fil.name}")
        skrivna += 1

    print(f"Skrev {skrivna} år till {ut}")


if __name__ == "__main__":
    main()
