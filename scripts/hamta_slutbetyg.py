#!/usr/bin/env python3
"""Hämtar slutbetygen från Kungsbackas gymnasieskolor ur Skolverkets statistik.

Skolverket publicerar varje höst rapporten *Avgångselever, nationella
program* – vad eleverna som gick ut gymnasiet i juni fick för betyg, per
skolenhet och program. Rapporten går att hämta som CSV ur Skolverkets
exporttjänst (den som ligger bakom "Sök statistik"), en fil per läsår:

  https://siris.skolverket.se/siris/reports/export_api/runexport/
      ?pFormat=csv&pExportID=88&pAr=<år>&pKommun=1384&pFlikar=0

  pExportID=88  Gymnasieskola – Avgångselever, nationella program (fr.o.m. 2013/14)
  pAr           det år eleverna gick ut, alltså läsårets senare halva
  pKommun       skolkommun, 1384 = Kungsbacka

Antalet elever och fem tal per skolenhet och program läses in:

  antal                    avgångselever
  andelExamen              andel (%) som fick en gymnasieexamen
  andelStudiebevis         andel (%) som fick studiebevis i stället
  andelGrundlBehorighet    andel (%) med grundläggande högskolebehörighet
  betygspoang              genomsnittlig betygspoäng, samtliga avgångselever
  betygspoangExamen        samma, men bara för dem som fick examen

Betygspoängen går från 0 till 20 (E = 10, C = 15, A = 20).

Skolverket döljer uppgifter som bygger på färre än tio elever – då står
".." i filen. Saknas uppgiften helt står ".". Båda blir null i utdatan.
Är det antalet avgångselever som är dolt gäller det hela raden, och
markören sparas i "dolt" – då finns programmet, men inga siffror.

Varje läsår sparas dels som CSV rakt av i docs/rapporter/, så att källan
går att läsa själv, dels inläst som data/slutbetyg/slutbetyg_<år>.json.

Körs:  python3 scripts/hamta_slutbetyg.py            # alla läsår
       python3 scripts/hamta_slutbetyg.py --ar 2025  # ett enskilt läsår
"""

import argparse
import csv
import io
import json
import re
import ssl
import urllib.request
from datetime import date
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent

EXPORT_URL = ("https://siris.skolverket.se/siris/reports/export_api/runexport/"
              "?pFormat=csv&pExportID={export}&pAr={ar}&pKommun={kommun}&pFlikar=0")
EXPORT_ID = 88
KOMMUN = "1384"          # Kungsbacka
FORSTA_AR = 2014         # rapporten börjar läsåret 2013/14

# Mänsklig ingång till samma statistik, för källförteckningen på hemsidan.
STATISTIK_URL = ("https://www.skolverket.se/skolutveckling/statistik/"
                 "sok-statistik-om-forskola-skola-och-vuxenutbildning")

# Kolumnernas ordning i exportfilen. Den har varit densamma sedan 2013/14,
# men kontrolleras vid varje inläsning – ändras den ska skriptet stanna,
# inte läsa fel kolumn under tystnad.
KOLUMNER = [
    "Skola", "Skol-enhetskod", "Skolkommun", "Kommun-kod", "Typ av huvudman",
    "Huvudman", "Huvudman orgnr", "Program", "Totalt antal",
    "Andel (%) med examen", "Andel (%) med studiebevis",
    "Andel (%) med grundl. behörighet", "Andel (%) med utökat prog.",
    "GBP för elever med examen eller studiebevis", "GBP för elever med examen",
]

KODER = {
    "..": "Färre än tio elever – Skolverket dubbelprickar uppgiften",
    ".": "Uppgiften saknas",
}


def lasar(ar: int) -> str:
    return f"{ar - 1}/{str(ar)[-2:]}"


def hamta(ar: int) -> str:
    url = EXPORT_URL.format(export=EXPORT_ID, ar=ar, kommun=KOMMUN)
    req = urllib.request.Request(url, headers={"User-Agent": "kungsbacka-i-siffror"})
    with urllib.request.urlopen(req, timeout=120,
                                context=ssl.create_default_context()) as resp:
        return resp.read().decode("utf-8-sig")


def tal(text: str):
    """Ett tal, eller None med en anteckning om varför det saknas."""
    text = text.strip()
    if text in KODER:
        return None, text
    if not text:
        return None, None
    return float(text.replace(",", ".").replace("\xa0", "").replace(" ", "")), None


def las(csvtext: str, ar: int) -> dict:
    rader = list(csv.reader(io.StringIO(csvtext), delimiter=";"))

    rubrik = next((r for r in rader if r and r[0].strip() == "Skola"), None)
    if rubrik is None:
        raise SystemExit(f"{ar}: hittar ingen tabellrubrik i exportfilen")
    if [k.strip() for k in rubrik[:len(KOLUMNER)]] != KOLUMNER:
        raise SystemExit(f"{ar}: kolumnerna har ändrats – läs om KOLUMNER i skriptet\n"
                         f"  fick: {rubrik[:len(KOLUMNER)]}")

    # Rapportens egen rubrik, utan parentesen om vilket läsår serien
    # börjar – den står i varje årgång och säger inget om just den här.
    titel = next((r[0].strip() for r in rader
                  if r and r[0].strip().startswith("Gymnasieskola")), "")
    titel = re.sub(r"\s*\(fr\.o\.m\..*?\)", "", titel).replace(" - ", " – ")

    ut = []
    for rad in rader[rader.index(rubrik) + 1:]:
        # Efter tabellen följer rapportens definitioner som lösa textrader.
        # Bara rader med en skolenhetskod är data.
        if len(rad) < len(KOLUMNER) or not rad[1].strip().isdigit():
            continue
        antal, antal_dolt = tal(rad[8])
        post = {
            "skolenhet": rad[0].strip(),
            "skolenhetskod": rad[1].strip(),
            "huvudmanTyp": rad[4].strip(),
            "huvudman": rad[5].strip(),
            "program": rad[7].strip(),
            "antal": int(antal) if antal is not None else None,
            "dolt": antal_dolt,
        }
        for nyckel, kol in (("andelExamen", 9), ("andelStudiebevis", 10),
                            ("andelGrundlBehorighet", 11), ("betygspoang", 13),
                            ("betygspoangExamen", 14)):
            post[nyckel] = tal(rad[kol])[0]
        ut.append(post)

    return {
        "ar": ar,
        "lasar": lasar(ar),
        "rapportTitel": f"{titel or 'Gymnasieskola – Avgångselever, nationella program'}, "
                        f"läsåret {lasar(ar)}",
        "kalla": "Skolverket, Utbildningsstatistik",
        "kallaUrl": EXPORT_URL.format(export=EXPORT_ID, ar=ar, kommun=KOMMUN),
        "statistikUrl": STATISTIK_URL,
        "lokalFil": f"rapporter/slutbetyg-gymnasiet-{ar - 1}-{str(ar)[-2:]}.csv",
        "hamtad": date.today().isoformat(),
        "koder": KODER,
        "rader": ut,
    }


def spara(argang: dict, csvtext: str) -> None:
    (ROT / "data" / "slutbetyg").mkdir(parents=True, exist_ok=True)
    (ROT / "docs" / "rapporter" / Path(argang["lokalFil"]).name).write_text(
        csvtext, encoding="utf-8")
    ut = ROT / "data" / "slutbetyg" / f"slutbetyg_{argang['ar']}.json"
    ut.write_text(json.dumps(argang, ensure_ascii=False, indent=1) + "\n",
                  encoding="utf-8")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--ar", type=int, help="hämta ett enskilt läsår (avgångsåret)")
    args = p.parse_args()

    ar_lista = [args.ar] if args.ar else range(FORSTA_AR, date.today().year + 1)

    for ar in ar_lista:
        csvtext = hamta(ar)
        argang = las(csvtext, ar)
        if not argang["rader"]:
            # Årets rapport publiceras i november. Tomma år bortom det
            # senaste publicerade är väntade och avslutar hämtningen.
            print(f"{ar}: ingen statistik publicerad ännu")
            if not args.ar:
                break
            continue
        spara(argang, csvtext)
        skolor = len({r["skolenhetskod"] for r in argang["rader"]})
        print(f"{ar} (läsåret {argang['lasar']}): {len(argang['rader'])} rader, "
              f"{skolor} skolenheter")


if __name__ == "__main__":
    main()
