#!/usr/bin/env python3
"""Plockar ut total folkmängd per år ur en prognosrapport i PDF-format.

Kommunens rapporter redovisar totalprognosen i en tabell där åren står på
en rad och folkmängden på nästa ("Tabell 1 Folkmängd och folkökning..."),
eller i en förändringstabell med ett år per rad. Skriptet klarar båda
formerna och skriver ut ett färdigt JSON-utkast.

Siffrorna MÅSTE kontrolleras mot rapporten innan de används – layouten
skiljer sig mellan årgångar och textextraktion ur PDF är aldrig helt
tillförlitlig.

Körs:  python3 scripts/extrahera_prognos.py <rapport.pdf>
"""

import json
import re
import sys

try:
    import pypdf
except ImportError:
    sys.exit("Saknar pypdf. Installera med:  pip install pypdf")

# Rimlighetsintervall för Kungsbackas folkmängd; filtrerar bort årtal,
# sidnummer och andra tal som råkar stå i tabellerna.
MIN_FOLKMANGD = 50_000
MAX_FOLKMANGD = 200_000


def tal(s: str) -> int:
    return int(s.replace(" ", "").replace(" ", ""))


def rader_per_ar(text: str) -> dict:
    """Förändringstabell: '2026  86 424  656  735 ...' – ett år per rad."""
    ut = {}
    for m in re.finditer(r"^(20\d\d)\s+(\d{2,3}(?:[  ]?\d{3}))\s+\d", text, re.M):
        v = tal(m.group(2))
        if MIN_FOLKMANGD <= v <= MAX_FOLKMANGD:
            ut[m.group(1)] = v
    return ut


def ar_rad_och_vardesrad(text: str) -> dict:
    """Tabell 1: en rad med årtal följd av en rad med folkmängder."""
    ut = {}
    rader = text.splitlines()
    for i, rad in enumerate(rader):
        ar = re.findall(r"\b(20\d\d)\b", rad)
        if len(ar) < 3:
            continue
        for nasta in rader[i + 1:i + 4]:
            if not re.search(r"(?i)folkm[aä]ngd", nasta):
                continue
            varden = [
                tal(v) for v in re.findall(r"\d{2,3}(?:[  ]?\d{3})", nasta)
            ]
            varden = [v for v in varden if MIN_FOLKMANGD <= v <= MAX_FOLKMANGD]
            if len(varden) == len(ar):
                ut.update(dict(zip(ar, varden)))
            break
    return ut


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    pdf = sys.argv[1]

    lasare = pypdf.PdfReader(pdf)
    text = "\n".join((sida.extract_text() or "") for sida in lasare.pages)

    funna = ar_rad_och_vardesrad(text)
    funna.update(rader_per_ar(text))  # förändringstabellen täcker fler år

    if not funna:
        sys.exit(
            "Hittade ingen folkmängdstabell. Öppna rapporten och läs av "
            "siffrorna för hand – layouten skiljer sig mellan årgångar."
        )

    utkast = {
        "prognosAr": None,
        "rapportTitel": None,
        "publicerad": None,
        "kallaUrl": None,
        "arkivUrl": None,
        "lokalPdf": None,
        "sidhanvisning": None,
        "prognos": dict(sorted(funna.items())),
    }
    print(json.dumps(utkast, ensure_ascii=False, indent=2))
    print(
        f"\n# {len(funna)} år funna ({min(funna)}–{max(funna)}) i {pdf}."
        "\n# Fyll i metadatafälten och KONTROLLERA siffrorna mot rapporten.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
