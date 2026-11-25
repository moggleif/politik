"""Enhetstest av mätningen mot "Ren kod – strikt": scripts/ren_kod.py.

Körs:  python3 -m unittest discover tests

Filerna är påhittade och så små att facit går att räkna för hand. Ruff
och ESLint körs inte här; deras JSON-utdata är påhittad likaså."""

import json
import re
import sys
import unittest
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROT / "scripts"))

import ren_kod

SMA = ren_kod.Granser(fil=6, funktion=3, parametrar=1, nastling=1, komplexitet=1)

KORT_OCH_LANG = """def kort():
    return 1


def lang():
    a = 1
    b = 2
    return a + b
"""


class Radbrott(unittest.TestCase):
    def test_lang_funktion_och_lang_fil(self):
        brott = ren_kod.radbrott("x.py", KORT_OCH_LANG, SMA)
        self.assertEqual(brott, [ren_kod.Brott("x.py", 1, "fil"),
                                 ren_kod.Brott("x.py", 5, "funktion")])

    def test_precis_pa_gransen_ar_inget_brott(self):
        granser = SMA._replace(fil=8, funktion=4)
        self.assertEqual(ren_kod.radbrott("x.py", KORT_OCH_LANG, granser), [])

    def test_javascript_far_bara_radbrott_for_filen(self):
        text = "function f() {\n" + "  a();\n" * 9 + "}\n"
        self.assertEqual(ren_kod.radbrott("x.js", text, SMA),
                         [ren_kod.Brott("x.js", 1, "fil")])


class FunktionerOver(unittest.TestCase):
    TEXT = """def yttre():
    def inre():
        if a:
            if b:
                return 1
    return inre
"""

    def test_innersta_funktionen_omsluter(self):
        spann = ren_kod.funktioner(self.TEXT)
        self.assertEqual(ren_kod.omslutande(4, spann), (2, 5))
        self.assertEqual(ren_kod.omslutande(6, spann), (1, 6))
        self.assertIsNone(ren_kod.omslutande(7, spann))

    def test_flera_brott_i_samma_funktion_raknas_en_gang(self):
        brott = [ren_kod.Brott("x.py", 2, "komplexitet"),
                 ren_kod.Brott("x.py", 4, "nastling"),
                 ren_kod.Brott("x.py", 1, "funktion"),
                 ren_kod.Brott("x.py", 1, "fil")]
        over = ren_kod.funktioner_over(brott, {"x.py": self.TEXT})
        self.assertEqual(over, {("x.py", (2, 5)), ("x.py", (1, 6))})


class Tolka(unittest.TestCase):
    def test_ruff(self):
        utdata = json.dumps([
            {"code": "C901", "filename": str(ROT / "scripts/a.py"),
             "location": {"row": 3, "column": 5}},
            {"code": "PLR1702", "filename": str(ROT / "tests/b.py"),
             "location": {"row": 9, "column": 9}},
        ])
        self.assertEqual(ren_kod.tolka_ruff(utdata, ROT), [
            ren_kod.Brott("scripts/a.py", 3, "komplexitet"),
            ren_kod.Brott("tests/b.py", 9, "nastling"),
        ])

    def test_eslint_tar_bara_matten(self):
        utdata = json.dumps([{
            "filePath": str(ROT / "docs/a.js"),
            "messages": [
                {"ruleId": "max-params", "line": 2},
                {"ruleId": "no-unused-vars", "line": 4},
                {"ruleId": None, "line": 1},
                {"ruleId": "max-lines-per-function", "line": 7},
            ],
        }])
        self.assertEqual(ren_kod.tolka_eslint(utdata, ROT), [
            ren_kod.Brott("docs/a.js", 2, "parametrar"),
            ren_kod.Brott("docs/a.js", 7, "funktion"),
        ])

    def test_kommandona_bar_gransernas_varden(self):
        ruff = " ".join(ren_kod.ruff_kommando(ren_kod.GRANS))
        eslint = " ".join(ren_kod.eslint_kommando(ren_kod.GRANS))
        self.assertIn("max-complexity=8", ruff)
        self.assertIn("max-nested-blocks=3", ruff)
        self.assertIn("max-lines-per-function: [warn, {max: 30, IIFEs: false}]", eslint)
        self.assertIn("max-params: [warn, 4]", eslint)


class Filer(unittest.TestCase):
    def test_vendrad_kod_mats_inte(self):
        alla = sum(ren_kod.filer(ROT).values(), [])
        self.assertIn("docs/gemensam.js", alla)
        self.assertNotIn("docs/chart.umd.js", alla)


class ClaudeMd(unittest.TestCase):
    """Tabellen i CLAUDE.md och gränserna i skriptet är samma tal."""

    RADER = {"Rader per funktion": "funktion", "Rader per fil": "fil",
             "Parametrar per funktion": "parametrar",
             "Nästlingsnivåer": "nastling", "Cyklomatisk komplexitet": "komplexitet"}

    def test_tabellen_stammer_med_skriptet(self):
        text = (ROT / "CLAUDE.md").read_text(encoding="utf-8")
        avsnitt = text.split("## Ren kod – strikt")[1].split("\n## ")[0]
        tabell = {
            m[1]: (int(m[2]), int(m[3]))
            for m in re.finditer(r"^\| ([^|]+?) +\| (\d+) +\| (\d+) +\|$", avsnitt, re.M)
        }
        self.assertEqual(tabell, {
            namn: (getattr(ren_kod.MAL, f), getattr(ren_kod.GRANS, f))
            for namn, f in self.RADER.items()
        })


if __name__ == "__main__":
    unittest.main()
