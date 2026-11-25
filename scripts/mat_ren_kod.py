"""Skriver en rapport över koden mot "Ren kod – strikt" i CLAUDE.md.

Körs:  python3 scripts/mat_ren_kod.py

Rapporten är Markdown och räknar brotten per del och per fil, mot den
hårda gränsen och mot målet; hur de mäts står i ren_kod.py. Den fäller
aldrig bygget: gränserna mäts som rapport tills koden klarar dem (#104).
CI lägger den i körningens sammanfattning."""

from collections import Counter
from pathlib import Path

import ren_kod

MATT = {"funktion": "långa", "komplexitet": "komplexa",
        "parametrar": "parametrar", "nastling": "nästling"}


def tabell(rubriker: list[str], rader: list[list]) -> list[str]:
    return [
        "| " + " | ".join(rubriker) + " |",
        "|" + " --- |" * len(rubriker),
        *("| " + " | ".join(str(c) for c in rad) + " |" for rad in rader),
    ]


def matning(rot: Path) -> dict:
    delar = ren_kod.filer(rot)
    texter = {n: (rot / n).read_text(encoding="utf-8") for d in delar.values() for n in d}
    mal = ren_kod.mat(rot, texter, ren_kod.MAL)
    grans = ren_kod.mat(rot, texter, ren_kod.GRANS)
    return {
        "delar": delar, "texter": texter,
        "per_matt": Counter((b.fil, b.matt) for b in grans),
        "brott": Counter(b.fil for b in grans),
        "mot_malet": Counter(b.fil for b in mal),
        "over_grans": Counter(f for f, _ in ren_kod.funktioner_over(grans, texter)),
        "over_mal": Counter(f for f, _ in ren_kod.funktioner_over(mal, texter)),
    }


def python_tal(namn: list[str], m: dict) -> list:
    if not namn or not namn[0].endswith(".py"):
        return ["–", "–", "–"]
    return [
        sum(len(ren_kod.funktioner(m["texter"][n])) for n in namn),
        sum(m["over_grans"][n] for n in namn),
        sum(m["over_mal"][n] for n in namn),
    ]


def delrad(del_: str, m: dict) -> list:
    namn = m["delar"][del_]
    return [
        f"`{del_}`", len(namn), *python_tal(namn, m),
        *(sum(m["per_matt"][(n, matt)] for n in namn) for matt in ["fil", *MATT]),
    ]


def filrad(namn: str, m: dict) -> list:
    return [
        f"`{namn}`", len(m["texter"][namn].splitlines()),
        *(m["per_matt"][(namn, matt)] for matt in MATT),
        m["over_grans"][namn] if namn.endswith(".py") else "–",
        m["mot_malet"][namn],
    ]


def rapport(m: dict) -> str:
    varst = sorted((n for n in m["texter"] if m["brott"][n]),
                   key=lambda n: (-m["brott"][n], n))
    return "\n".join([
        "## Ren kod – strikt", "",
        'Brotten mot gränserna i "Ren kod – strikt" i CLAUDE.md. '
        "Rapporten fäller inte bygget.", "",
        *tabell(["Del", "Filer", "Funktioner", "Funktioner över gräns",
                 "Över målet", "Filer över gräns", *MATT.values()],
                [delrad(d, m) for d in ren_kod.DELAR]),
        "", "### Filer över den hårda gränsen", "",
        *tabell(["Fil", "Rader", *MATT.values(), "Funktioner över gräns",
                 "Brott mot målet"], [filrad(n, m) for n in varst]),
    ])


if __name__ == "__main__":
    print(rapport(matning(ren_kod.ROT)))
