#!/usr/bin/env python3
"""Hämtar slutbetygen per ämne i årskurs 9 ur Skolverkets exporttjänst.

Skolverket publicerar varje höst hur niondeklassarna klarade varje enskilt
ämne: genomsnittlig betygspoäng och andelen som fick godkänt (A–E).
Statistiken börjar läsåret 2012/13.

Samma exporttjänst som slutbetygen från gymnasiet använder, men rapport 92
i stället för 88:

  https://siris.skolverket.se/siris/reports/export_api/runexport/
      ?pFormat=csv&pExportID=92&pAr=<år>&pKommun=1384&pFlikar=0

`pAr` är det år eleverna gick ut nian och `pKommun` skolkommunen. Ett år
som ännu inte publicerats svarar med en tom tabell i stället för ett fel –
hämtningen stannar då av sig själv. Läsåret publiceras i november.

**Kommunnivå, inte skolenhet.** Rapport 92 redovisar hela kommunen; det
finns en systerrapport (93) per skolenhet som medvetet inte används här.
Urvalet är skolkommun, alltså alla skolor som ligger i Kungsbacka –
även de fristående.

Filerna sparas som data/amnesbetyg/amnesbetyg_<år>.json, ett läsår per fil.
Alla tre huvudmannatyper som rapporten redovisar sparas (Samtliga,
Kommunal, Enskild); sidan använder Samtliga.

Körs:  python3 scripts/hamta_amnesbetyg.py            (alla år)
       python3 scripts/hamta_amnesbetyg.py --ar 2025  (ett år)
"""

import argparse
import csv
import io
import json
import ssl
import urllib.request
from datetime import date
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent

EXPORT_URL = ("https://siris.skolverket.se/siris/reports/export_api/runexport/"
              "?pFormat=csv&pExportID={export}&pAr={ar}&pKommun={kommun}&pFlikar=0")
EXPORT_ID = 92
KOMMUN = "1384"
KOMMUNNAMN = "Kungsbacka"
FORSTA_AR = 2013

STATISTIK_URL = ("https://www.skolverket.se/skolutveckling/statistik/"
                 "sok-statistik-om-forskola-skola-och-vuxenutbildning")

# Kolumnernas ordning i CSV:en. Rubrikraden är tvådelad (en rad med
# grupprubriker och en med kolumnnamn), så positionerna läses direkt.
KOL = {
    "kommun": 0, "kommunkod": 1, "huvudman": 4, "amne": 5,
    "antal": 6, "antalFlickor": 7, "antalPojkar": 8,
    "betygspoang": 9, "andelAE": 10,
    "betygspoangFlickor": 11, "andelAEFlickor": 12,
    "betygspoangPojkar": 13, "andelAEPojkar": 14,
}
TAL_FALT = [k for k in KOL if k not in ("kommun", "kommunkod", "huvudman", "amne")]


def hamta_csv(ar: int) -> str:
    url = EXPORT_URL.format(export=EXPORT_ID, ar=ar, kommun=KOMMUN)
    req = urllib.request.Request(url, headers={"User-Agent": "kungsbacka-i-siffror/1.0"})
    with urllib.request.urlopen(req, timeout=120, context=ssl.create_default_context()) as r:
        return r.read().decode("utf-8-sig")


def tal(text: str):
    """Skolverkets prickning: '..' = färre än tio elever (uppgiften döljs),
    '.' = uppgiften saknas helt. Båda blir None, men skiljs åt i utdatan."""
    t = (text or "").strip()
    if t in ("", ".", ".."):
        return None
    t = t.replace("\xa0", "").replace(" ", "").replace(",", ".")
    try:
        return float(t) if "." in t else int(t)
    except ValueError:
        return None


def lasa_ar(ar: int) -> dict | None:
    text = hamta_csv(ar)
    rader = list(csv.reader(io.StringIO(text), delimiter=";"))

    lasar = ""
    for rad in rader[:8]:
        if rad and rad[0].startswith("Valt läsår"):
            lasar = rad[0].split(":", 1)[1].strip()

    amnen = []
    for rad in rader:
        if len(rad) <= KOL["andelAEPojkar"]:
            continue
        if rad[KOL["kommun"]] != KOMMUNNAMN or rad[KOL["kommunkod"]] != KOMMUN:
            continue
        post = {
            "amne": rad[KOL["amne"]].strip(),
            "huvudman": rad[KOL["huvudman"]].strip(),
            # Behåll originaltecknet, så att '..' (dolt) går att skilja
            # från '.' (saknas) längre fram i bygget.
            "markor": rad[KOL["betygspoang"]].strip() if tal(rad[KOL["betygspoang"]]) is None else None,
        }
        for falt in TAL_FALT:
            post[falt] = tal(rad[KOL[falt]])
        amnen.append(post)

    if not amnen:
        return None

    return {
        "ar": ar,
        "lasar": lasar,
        "kommun": KOMMUNNAMN,
        "kommunkod": KOMMUN,
        "niva": "Skolkommun, samtliga skolor i kommunen",
        "rapportTitel": "Grundskola – Slutbetyg per ämne årskurs 9",
        "kalla": "Skolverket, utbildningsstatistik",
        "kallaUrl": EXPORT_URL.format(export=EXPORT_ID, ar=ar, kommun=KOMMUN),
        "statistikUrl": STATISTIK_URL,
        "hamtad": date.today().isoformat(),
        "amnen": amnen,
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--ar", type=int, help="hämta bara det här året")
    p.add_argument("--tom", type=int, default=date.today().year,
                   help="sista år att försöka med")
    args = p.parse_args()

    ut = ROT / "data" / "amnesbetyg"
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
            print(f"  {ar}: inga rader – året verkar inte publicerat ännu")
            continue
        fil = ut / f"amnesbetyg_{ar}.json"
        fil.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        samtliga = [a for a in data["amnen"] if a["huvudman"] == "Samtliga"]
        print(f"  {ar} ({data['lasar']}): {len(samtliga)} ämnen → {fil.name}")
        skrivna += 1

    print(f"Skrev {skrivna} läsår till {ut}")


if __name__ == "__main__":
    main()
