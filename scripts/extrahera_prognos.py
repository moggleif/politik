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
    """Förändringstabell: '2026  86 424  656  735 ...' – ett år per rad.

    Vissa årgångar sätter en etikett före årtalet på den rad där prognosen
    tar vid ("Progn 2021 85 754 ..."), så ett inledande ord tillåts.
    """
    ut = {}
    monster = (
        r"^[ \t]*(?:[A-Za-zÅÄÖåäö.]+[ \t]+)?"
        r"(20\d\d)\s+(\d{2,3}(?:[  ]?\d{3}))\s+\d"
    )
    for m in re.finditer(monster, text, re.M):
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


GRUPPTAL = re.compile(r"\d{1,2}[  ]?\d{3}|\d{3,5}")


def aldersgrupp(lasare, grupp: str) -> dict:
    """Läser en åldersgrupps rad ur bilagans tabell "Antal per åldersgrupp".

    Den tabellen används framför tabellerna i löptexten: den har en egen
    årsrubrik och dess kolumner summerar till totalprognosen. Första året
    är rapportens utfallsår.
    """
    lag, hog = grupp.split("-")
    radmonster = re.compile(
        rf"^[ \t]*{lag}[ \t]*[-–][ \t]*{hog}[ \t]+([\d  ]{{10,}})$", re.M
    )
    arsmonster = re.compile(
        r"(?i)^[ \t]*Ålder[ \t]+((?:20\d\d[ \t]+)+20\d\d)[ \t]*$", re.M
    )

    for sida in lasare.pages:
        t = sida.extract_text() or ""
        if not re.search(r"(?i)antal per ålder", t):
            continue
        m_ar, m_rad = arsmonster.search(t), radmonster.search(t)
        if not (m_ar and m_rad):
            continue
        ar = m_ar.group(1).split()
        varden = [tal(m.group(0)) for m in GRUPPTAL.finditer(m_rad.group(1))]
        if len(ar) == len(varden):
            return dict(zip(ar, varden))
    return {}


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    pdf = sys.argv[1]
    grupper = sys.argv[2:]  # t.ex. 16-19

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

    if grupper:
        hittade = {}
        for g in grupper:
            serie = aldersgrupp(lasare, g)
            if serie:
                hittade[g] = serie
            else:
                print(
                    f"# Hittade ingen rad för åldersgruppen {g}. Rapporten kan "
                    "använda en annan indelning – kontrollera i PDF:en.",
                    file=sys.stderr,
                )
        if hittade:
            utkast["aldersgrupper"] = hittade

    print(json.dumps(utkast, ensure_ascii=False, indent=2))
    print(
        f"\n# {len(funna)} år funna ({min(funna)}–{max(funna)}) i {pdf}."
        "\n# Fyll i metadatafälten och KONTROLLERA siffrorna mot rapporten."
        "\n# Första året i varje serie är rapportens utfallsår, inte prognos.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
