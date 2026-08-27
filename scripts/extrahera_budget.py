#!/usr/bin/env python3
"""Plockar ut befolkningsprognosen ur en av kommunens budgetar.

Varje års kommunbudget innehåller årets befolkningsprognos som en
åldersfördelad tabell. Rubriken varierar mellan årgångarna
("Befolkningsförändringar" i de äldre, "Befolkningsprognos" i de nyare),
men tabellen ser likadan ut: en rad med årtal, en rad per åldersgrupp och
en summarad.

Två egenheter i de äldre utgåvorna hanteras här:

* Årsrubriken kan brytas över flera rader ("Ålder 2014 2015" följt av
  "Prognos" / "2016" / "Prognos" / "2017" …). Därför läses årtalen från
  hela sidans text fram till första datarad, inte bara från en rad.
* Summaraden kan skrivas med versaler ("SUMMA").

Skriptet skiljer inte utfallsår från prognosår – de första kolumnerna är
utfall och antalet varierar mellan årgångarna. Kontrollera dem mot SCB
och ange rätt startår när JSON-filen skapas.

Körs:  python3 scripts/extrahera_budget.py <kommunbudget.pdf> [åldersgrupp ...]
"""

import json
import re
import sys

try:
    import pypdf
except ImportError:
    sys.exit("Saknar pypdf. Installera med:  pip install pypdf")

# Tillåter sexsiffriga tal (100 199) – annars delas de i två.
TAL = re.compile(r"\d{1,3}[  ]?\d{3}|\d{3,6}")


def tal(text: str) -> list:
    return [int(m.group(0).replace(" ", "").replace("\xa0", "")) for m in TAL.finditer(text)]


def rad(text: str, monster: str):
    m = re.search(monster, text, re.M | re.I)
    return tal(m.group(1)) if m else None


def las_sida(text: str, grupper: list):
    """Returnerar (år, summa, {grupp: värden}) om sidan bär prognostabellen."""
    summa = rad(text, r"^[ \t]*Summa[ \t]+([\d  ]+)$")
    if not summa:
        return None

    # Årtalen står mellan "Ålder" och första åldersraden.
    m = re.search(r"^[ \t]*Ålder\b(.*?)^[ \t]*0[ \t]+\d", text, re.M | re.S)
    if not m:
        return None
    ar = re.findall(r"(?:19|20)\d\d", m.group(1))
    if len(ar) != len(summa):
        return None

    ut = {}
    for g in grupper:
        lag, hog = g.split("-")
        v = rad(text, rf"^[ \t]*{lag}[ \t]*[-–][ \t]*{hog}[ \t]+([\d  ]+)$")
        if v and len(v) == len(ar):
            ut[g] = dict(zip(ar, v))
    return ar, dict(zip(ar, summa)), ut


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    pdf = sys.argv[1]
    grupper = sys.argv[2:] or ["16-19"]

    lasare = pypdf.PdfReader(pdf)
    for i, sida in enumerate(lasare.pages):
        res = las_sida(sida.extract_text() or "", grupper)
        if not res:
            continue
        ar, summa, gruppdata = res
        print(json.dumps({
            "sid": i + 1,
            "forstaAr": ar[0],
            "sistaAr": ar[-1],
            "prognos": summa,
            "aldersgrupper": gruppdata,
        }, ensure_ascii=False, indent=2))
        print(
            f"\n# {len(ar)} kolumner ({ar[0]}–{ar[-1]}) på sid {i + 1} i {pdf}."
            "\n# De första kolumnerna är UTFALL – kontrollera mot SCB och ta"
            "\n# bara med prognosåren.",
            file=sys.stderr,
        )
        return

    sys.exit("Hittade ingen prognostabell. Kontrollera rubriken i PDF:en.")


if __name__ == "__main__":
    main()
