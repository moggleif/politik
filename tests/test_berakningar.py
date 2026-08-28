"""Kontrollräknar de viktigaste beräkningarna.

Körs:  python3 -m unittest discover tests

Två sorters test:

  * enhetstest med små påhittade indata, där facit går att räkna för hand
  * avstämningar mot de riktiga datafilerna i repot: de färdigbyggda
    docs/data*.json ska vara exakt vad byggskripten ger av innehållet i
    data/ – annars har någon ändrat utdatan för hand eller glömt bygga om
"""

import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent


def ladda(namn: str):
    """Importera ett byggskript från scripts/ som modul."""
    spec = importlib.util.spec_from_file_location(
        namn, ROT / "scripts" / f"{namn}.py")
    modul = importlib.util.module_from_spec(spec)
    sys.modules[namn] = modul
    spec.loader.exec_module(modul)
    return modul


build_data = ladda("build_data")
build_kull = ladda("build_kull")


class TestPrognosberakningar(unittest.TestCase):
    """build_data: avvikelser, träffsäkerhet per horisont och skevhet."""

    def setUp(self):
        self.scb = {
            "kommun": "Testköping",
            "matt": "Folkmängd",
            "kalla": "SCB",
            "kallaUrl": "https://example.org",
            "hamtad": "2026-01-01",
        }
        # Utfall: 2020=1000, 2021=1100, 2022=1200
        self.utfall = {2020: 1000, 2021: 1100, 2022: 1200}
        self.rapporter = [
            {
                "prognosAr": 2020,
                "rapportTitel": "Prognos 2020",
                # 2020: träff (0 år), 2021: +110 = +10 % (1 år),
                # 2023: utanför utfallet -> ingen avvikelse
                "prognos": {"2020": 1000, "2021": 1210, "2023": 9999},
            },
            {
                "prognosAr": 2021,
                "rapportTitel": "Prognos 2021",
                # 2022: -120 = -10 % (1 år)
                "prognos": {"2022": 1080},
            },
        ]

    def bygg(self):
        return build_data.bygg(
            self.scb, self.rapporter, self.utfall, None, "Test")

    def test_avvikelser(self):
        ut = self.bygg()
        avv = ut["prognoser"][0]["avvikelser"]
        self.assertEqual(set(avv), {"2020", "2021"})  # 2023 saknar utfall
        self.assertEqual(avv["2021"]["diff"], 110)
        self.assertAlmostEqual(avv["2021"]["pct"], 10.0)
        self.assertEqual(avv["2021"]["avstand"], 1)
        self.assertEqual(avv["2020"]["avstand"], 0)

    def test_per_avstand(self):
        ut = self.bygg()
        per = {r["avstand"]: r for r in ut["perAvstand"]}
        # Ett års sikt: +10 % och -10 % -> absolut medel 10, medel 0
        self.assertAlmostEqual(per[1]["medelAbsPct"], 10.0)
        self.assertAlmostEqual(per[1]["medelPct"], 0.0)
        self.assertEqual(per[1]["antal"], 2)
        self.assertEqual(per[1]["antalOver"], 1)
        # Samma år: en träff
        self.assertAlmostEqual(per[0]["medelAbsPct"], 0.0)

    def test_skevhet_och_argangar(self):
        ut = self.bygg()
        # Tre jämförelser: 0 %, +10 %, -10 %
        self.assertEqual(ut["skevhet"]["antal"], 3)
        self.assertAlmostEqual(ut["skevhet"]["medelPct"], 0.0)
        self.assertAlmostEqual(ut["skevhet"]["medelAbsPct"], 6.67)
        # Årgångarna lutar åt olika håll -> riktningen har bytt
        self.assertTrue(ut["skevhet"]["bytterRiktning"])
        ettar = {r["prognosAr"]: r["ettArPct"] for r in ut["perArgang"]}
        self.assertAlmostEqual(ettar[2020], 10.0)
        self.assertAlmostEqual(ettar[2021], -10.0)

    def test_pct_ar_relativt_utfallet(self):
        ut = self.bygg()
        avv = ut["prognoser"][1]["avvikelser"]["2022"]
        self.assertEqual(avv["diff"], 1080 - 1200)
        self.assertAlmostEqual(avv["pct"], 100.0 * (1080 - 1200) / 1200, 2)


def merit_stub():
    return {
        "kommun": "Testköping",
        "ar": [2019, 2021, 2022],   # 2020 saknar rapport
        "skolor": [{"id": "a", "namn": "Aranäsgymnasiet", "kort": "Aranäs"},
                   {"id": "e", "namn": "Elof Lindälvs gymnasium",
                    "kort": "Elof Lindälv"}],
        "program": [
            {
                "namn": "Testprogrammet", "etikett": "Testprogrammet",
                "hem": "Aranäs", "typ": "yrkesprogram",
                "varden": {
                    "2019": {"medel": 200.0, "antal": 1, "skola": "Aranäs"},
                    "2021": {"medel": 210.0, "antal": 1, "skola": "Aranäs"},
                    "2022": {"medel": 220.0, "antal": 1, "skola": "Aranäs"},
                },
            },
            {
                # Antagning på Elof, men slutbetygen är bara redovisade på
                # Aranäs -> får inte paras
                "namn": "Spökprogrammet", "etikett": "Spökprogrammet",
                "hem": "Elof Lindälv", "typ": "yrkesprogram",
                "varden": {"2019": {"medel": 180.0, "antal": 1,
                                    "skola": "Elof Lindälv"}},
            },
        ],
        "kallor": [{"ar": 2019, "hamtad": "2026-01-01"},
                   {"ar": 2021, "hamtad": "2026-01-01"},
                   {"ar": 2022, "hamtad": "2026-01-01"}],
    }


def slut_stub():
    return {
        "kommun": "Testköping",
        "maxPoang": 20,
        "ar": [2022, 2023, 2024],
        "skolor": [{"id": "a", "namn": "Aranäsgymnasiet", "kort": "Aranäs"},
                   {"id": "e", "namn": "Elof Lindälvs gymnasium",
                    "kort": "Elof Lindälv"}],
        "utbildningar": [
            {
                "program": "Testprogrammet", "namn": "Testprogrammet",
                "skola": "Aranäsgymnasiet",
                "skolar": ["Aranäsgymnasiet"],
                "skolhistorik": [{"skola": "Aranäsgymnasiet",
                                  "forstaAr": 2022, "sistaAr": 2024}],
                "delad": False, "typ": "yrkesprogram",
                "varden": {
                    "2022": {"betygspoang": 13.0, "betygspoangExamen": 13.5,
                             "andelExamen": 90.0,
                             "andelGrundlBehorighet": 50.0,
                             "antal": 20, "skola": "Aranäsgymnasiet"},
                    # 2024: dubbelprickat år (färre än tio elever)
                    "2024": {"betygspoang": None, "betygspoangExamen": None,
                             "andelExamen": None,
                             "andelGrundlBehorighet": None,
                             "antal": None, "skola": "Aranäsgymnasiet"},
                },
            },
            {
                # Spökprogrammet: fanns på Elof men alla värden kommer
                # från Aranäs -> ska inte paras med Elof-antagningen
                "program": "Spökprogrammet", "namn": "Spökprogrammet",
                "skola": "Aranäsgymnasiet",
                "skolar": ["Aranäsgymnasiet", "Elof Lindälvs gymnasium"],
                "skolhistorik": [{"skola": "Aranäsgymnasiet",
                                  "forstaAr": 2022, "sistaAr": 2024}],
                "delad": False, "typ": "yrkesprogram",
                "varden": {"2022": {"betygspoang": 12.0,
                                    "betygspoangExamen": None,
                                    "andelExamen": None,
                                    "andelGrundlBehorighet": None,
                                    "antal": 15,
                                    "skola": "Aranäsgymnasiet"}},
            },
        ],
        "kallor": [{"ar": 2022, "hamtad": "2026-01-01"},
                   {"ar": 2023, "hamtad": "2026-01-01"},
                   {"ar": 2024, "hamtad": "2026-01-01"}],
    }


class TestKullparning(unittest.TestCase):
    """build_kull: parningen och kullarnas statusar."""

    def test_parning_kraver_redovisad_skola(self):
        par, merit_utan, slut_utan = build_kull.para_program(
            merit_stub(), slut_stub())
        self.assertEqual([mp["namn"] for mp, _ in par], ["Testprogrammet"])
        self.assertEqual([mp["namn"] for mp in merit_utan], ["Spökprogrammet"])
        self.assertEqual([u["namn"] for u in slut_utan], ["Spökprogrammet"])

    def test_kohorter(self):
        ut = build_kull.bygg(merit_stub(), slut_stub())
        self.assertEqual(len(ut["program"]), 1)
        rader = {r["antagningsar"]: r for r in ut["program"][0]["kohorter"]}

        # 2019 -> 2022: komplett kull
        self.assertEqual(rader[2019]["examensar"], 2022)
        self.assertEqual(rader[2019]["antagning"]["medel"], 200.0)
        self.assertEqual(rader[2019]["examen"]["betygspoang"], 13.0)

        # 2020 -> 2023: antagningsrapporten saknas, examen ej redovisad
        self.assertEqual(rader[2020]["antagning"]["status"], "rapport_saknas")
        self.assertEqual(rader[2020]["examen"]["status"], "ej_redovisad")

        # 2021 -> 2024: dubbelprickad examen = sekretess, inte "saknas"
        self.assertEqual(rader[2021]["examen"]["status"], "sekretess")

        # 2022 -> 2025: examensåret ligger bortom sista rapporten
        self.assertEqual(rader[2022]["examen"]["status"], "framtid")

        self.assertEqual(ut["program"][0]["antalKompletta"], 1)
        self.assertEqual(ut["oparade"]["antagningUtanSlutbetyg"],
                         ["Spökprogrammet"])

    def test_forskjutning_ar_tre_ar(self):
        ut = build_kull.bygg(merit_stub(), slut_stub())
        for r in ut["program"][0]["kohorter"]:
            self.assertEqual(r["examensar"] - r["antagningsar"],
                             build_kull.FORSKJUTNING)


class TestGenereradeFiler(unittest.TestCase):
    """Datafilerna i docs/ ska vara exakt vad byggskripten ger av data/.

    Det är repots reproducerbarhetslöfte: inga siffror i utdatan får vara
    ändrade för hand.
    """

    def las(self, namn):
        return json.loads((ROT / "docs" / namn).read_text(encoding="utf-8"))

    def test_data_json_ar_reproducerbar(self):
        scb = json.loads(
            (ROT / "data" / "scb" / "folkmangd_kungsbacka.json")
            .read_text(encoding="utf-8"))
        rapporter = [
            json.loads(f.read_text(encoding="utf-8"))
            for f in sorted((ROT / "data" / "prognoser").glob("prognos_*.json"))
        ]
        utfall = {int(a): v for a, v in scb["folkmangd"].items()}
        ombyggd = build_data.bygg(scb, rapporter, utfall, None,
                                  "Hela befolkningen")
        self.assertEqual(ombyggd, self.las("data.json"))

    def test_data_kull_ar_reproducerbar(self):
        ombyggd = build_kull.bygg(self.las("data-meritvarden.json"),
                                  self.las("data-slutbetyg.json"))
        self.assertEqual(ombyggd, self.las("data-kull.json"))


if __name__ == "__main__":
    unittest.main()
