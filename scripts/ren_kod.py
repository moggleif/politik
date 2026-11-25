"""Mäter koden mot gränserna i "Ren kod – strikt" i CLAUDE.md.

Ger brotten, ett per fil eller funktion och mått; rapporten skrivs av
mat_ren_kod.py. Gränserna här och tabellen i CLAUDE.md hålls lika av
tests/test_ren_kod.py.

Fem mått, tre verktyg:
  * rader per fil räknas här, för Python och JavaScript lika;
  * rader per funktion i Python räknas här med ast, eftersom ruff saknar
    regeln; i JavaScript av ESLints max-lines-per-function, som inte
    räknar IIFE-höljet som sidskripten packar sig i;
  * komplexitet, parametrar och nästling av ruff (C901, PLR0913,
    PLR1702) och ESLint (complexity, max-params, max-depth).

Ruff anger nästlingen på det block som ligger för djupt, inte på
funktionen. För Python förs varje brott därför till den innersta funktion
som omsluter raden, så att "funktioner över gränsen" räknar funktioner
och inte brott. För JavaScript räknas bara brotten. Saknas ruff eller
ESLint faller mätningen, hellre än att rapportera noll brott."""

import ast
import json
import subprocess
from pathlib import Path
from typing import NamedTuple

ROT = Path(__file__).resolve().parent.parent


class Granser(NamedTuple):
    fil: int
    funktion: int
    parametrar: int
    nastling: int
    komplexitet: int


MAL = Granser(fil=150, funktion=15, parametrar=3, nastling=2, komplexitet=5)
GRANS = Granser(fil=250, funktion=30, parametrar=4, nastling=3, komplexitet=8)

DELAR = ["scripts/*.py", "tests/*.py", "docs/*.js", "scripts/*.js", "tests/*.js"]
UTOM = {"docs/chart.umd.js"}
RUFF = {"C901": "komplexitet", "PLR0913": "parametrar", "PLR1702": "nastling"}
ESLINT = {
    "max-lines-per-function": "funktion",
    "complexity": "komplexitet",
    "max-params": "parametrar",
    "max-depth": "nastling",
}


class Brott(NamedTuple):
    fil: str
    rad: int
    matt: str


def filer(rot: Path) -> dict[str, list[str]]:
    return {
        del_: sorted(
            str(f.relative_to(rot)) for f in rot.glob(del_)
            if str(f.relative_to(rot)) not in UTOM
        )
        for del_ in DELAR
    }


def funktioner(text: str) -> list[tuple[int, int]]:
    return [
        (nod.lineno, nod.end_lineno)
        for nod in ast.walk(ast.parse(text))
        if isinstance(nod, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]


def radbrott(namn: str, text: str, granser: Granser) -> list[Brott]:
    brott = [Brott(namn, 1, "fil")] if len(text.splitlines()) > granser.fil else []
    if namn.endswith(".py"):
        brott += [
            Brott(namn, start, "funktion")
            for start, slut in funktioner(text)
            if slut - start + 1 > granser.funktion
        ]
    return brott


def ruff_kommando(granser: Granser) -> list[str]:
    return [
        "ruff", "check", "--no-cache", "--preview", "--exit-zero",
        "--output-format", "json", "--select", ",".join(RUFF),
        "--config", f"lint.mccabe.max-complexity={granser.komplexitet}",
        "--config", f"lint.pylint.max-args={granser.parametrar}",
        "--config", f"lint.pylint.max-nested-blocks={granser.nastling}",
        "scripts", "tests",
    ]


def eslint_kommando(granser: Granser) -> list[str]:
    regler = {
        "max-lines-per-function": f"{{max: {granser.funktion}, IIFEs: false}}",
        "complexity": granser.komplexitet,
        "max-params": granser.parametrar,
        "max-depth": granser.nastling,
    }
    kommando = ["npx", "--no-install", "eslint", "--format", "json"]
    for regel, varde in regler.items():
        kommando += ["--rule", f"{regel}: [warn, {varde}]"]
    return kommando + ["docs", "scripts", "tests"]


def tolka_ruff(utdata: str, rot: Path) -> list[Brott]:
    return [
        Brott(str(Path(f["filename"]).relative_to(rot)), f["location"]["row"],
              RUFF[f["code"]])
        for f in json.loads(utdata)
    ]


def tolka_eslint(utdata: str, rot: Path) -> list[Brott]:
    return [
        Brott(str(Path(f["filePath"]).relative_to(rot)), m["line"],
              ESLINT[m["ruleId"]])
        for f in json.loads(utdata)
        for m in f["messages"]
        if m.get("ruleId") in ESLINT
    ]


def kor(kommando: list[str], rot: Path) -> str:
    return subprocess.run(
        kommando, cwd=rot, capture_output=True, text=True, check=False
    ).stdout


def mat(rot: Path, texter: dict[str, str], granser: Granser) -> list[Brott]:
    brott = [b for namn, text in texter.items() for b in radbrott(namn, text, granser)]
    brott += tolka_ruff(kor(ruff_kommando(granser), rot), rot)
    return brott + tolka_eslint(kor(eslint_kommando(granser), rot), rot)


def omslutande(rad: int, spann: list[tuple[int, int]]) -> tuple[int, int] | None:
    return max((s for s in spann if s[0] <= rad <= s[1]), default=None)


def funktioner_over(brott: list[Brott], texter: dict[str, str]) -> set:
    i_funktion = [b for b in brott if b.matt != "fil" and b.fil.endswith(".py")]
    spann = {fil: funktioner(texter[fil]) for fil in {b.fil for b in i_funktion}}
    return {(b.fil, omslutande(b.rad, spann[b.fil])) for b in i_funktion}
