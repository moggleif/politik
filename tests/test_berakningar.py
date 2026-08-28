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
build_befolkning = ladda("build_befolkning")
build_amnesbetyg = ladda("build_amnesbetyg")
build_nian_gymnasiet = ladda("build_nian_gymnasiet")


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


class TestBefolkningEfterAlder(unittest.TestCase):
    """Andel, förändring och index räknas för hand på små tal."""

    SCB = {
        "kommun": "Testköping",
        "folkmangd": {"2000": "100", "2001": "110", "2002": "120"},
        "aldersgrupper": {
            "0-15": {"2000": "20", "2001": "22", "2002": "18"},
            "16-19": {"2000": "10", "2001": "11", "2002": "12"},
        },
    }

    def setUp(self):
        self.ut = build_befolkning.bygg(self.SCB)
        self.serier = {s["nyckel"]: s for s in self.ut["serier"]}

    def test_andel_ar_gruppen_delad_med_folkmangden(self):
        v = self.serier["0-15"]["varden"]
        self.assertEqual(v[2000]["andel"], 20.0)   # 20/100
        self.assertEqual(v[2002]["andel"], 15.0)   # 18/120

    def test_forandring_saknas_forsta_aret(self):
        v = self.serier["0-15"]["varden"]
        self.assertIsNone(v[2000]["forandring"])
        self.assertEqual(v[2001]["forandring"], 2)    # 22 - 20
        self.assertEqual(v[2002]["forandring"], -4)   # 18 - 22

    def test_index_utgar_fran_forsta_aret(self):
        v = self.serier["0-15"]["varden"]
        self.assertEqual(v[2000]["index"], 100.0)
        self.assertEqual(v[2001]["index"], 110.0)   # 22/20
        self.assertEqual(v[2002]["index"], 90.0)    # 18/20

    def test_hogsta_och_lagsta_ar(self):
        s = self.serier["0-15"]
        self.assertEqual((s["hogsta"], s["hogstaAr"]), (22, 2001))
        self.assertEqual((s["lagsta"], s["lagstaAr"]), (18, 2002))

    def test_inga_prognoser_i_utdatan(self):
        """Sidan ska bara innehålla utfall – aldrig prognossiffror."""
        text = json.dumps(self.ut, ensure_ascii=False).lower()
        self.assertNotIn("prognos", text)


class TestAmnesbetyg(unittest.TestCase):
    """Det fasta ämnesurvalet och dubbelprickningen."""

    def arsfil(self, ar, lasar, rader):
        return {
            "ar": ar, "lasar": lasar, "kommun": "Testköping",
            "niva": "Skolkommun", "rapportTitel": "T", "kalla": "T",
            "kallaUrl": "u", "statistikUrl": "s", "hamtad": "2026-01-01",
            "amnen": rader,
        }

    def rad(self, amne, poang, ae=None, antal=100, flickor=None, pojkar=None):
        return {
            "amne": amne, "huvudman": "Samtliga",
            "markor": ".." if poang is None else None,
            "antal": antal, "antalFlickor": None, "antalPojkar": None,
            "betygspoang": poang, "andelAE": ae,
            "betygspoangFlickor": flickor, "andelAEFlickor": None,
            "betygspoangPojkar": pojkar, "andelAEPojkar": None,
        }

    def setUp(self):
        # Matematik finns båda åren, Slöjd bara det första:
        # bara Matematik hör till kärnurvalet.
        self.ut = build_amnesbetyg.bygg([
            self.arsfil(2024, "2023/24", [
                self.rad("Matematik", 12.0, ae=90.0, flickor=13.0, pojkar=11.0),
                self.rad("Slöjd", 16.0, ae=100.0),
            ]),
            self.arsfil(2025, "2024/25", [
                self.rad("Matematik", 14.0, ae=94.0),
                self.rad("Slöjd", None, ae=None),
            ]),
        ])
        self.amnen = {a["namn"]: a for a in self.ut["amnen"]}

    def test_karnamnen_ar_de_som_finns_alla_ar(self):
        self.assertEqual(self.ut["karnamnen"], ["Matematik"])

    def test_arssnittet_raknas_bara_over_karnamnen(self):
        """Slöjd (16,0) får inte lyfta 2024 – annars driver
        sammansättningen serien i stället för betygen."""
        s = {r["ar"]: r for r in self.ut["sammanfattning"]}
        self.assertEqual(s[2024]["betygspoang"], 12.0)
        self.assertEqual(s[2025]["betygspoang"], 14.0)

    def test_dubbelprickat_ar_ger_inget_varde(self):
        slojd = self.amnen["Slöjd"]
        self.assertIsNone(slojd["varden"][2025]["betygspoang"])
        self.assertTrue(slojd["varden"][2025]["dolt"])
        self.assertEqual(slojd["arMedPoang"], 1)
        self.assertIsNone(slojd["forandring"])  # går inte att mäta på ett år

    def test_forandring_over_hela_serien(self):
        self.assertEqual(self.amnen["Matematik"]["forandring"], 2.0)

    def test_konsskillnad_kraver_bada_talen(self):
        m = self.amnen["Matematik"]["varden"]
        self.assertEqual(m[2024]["konsskillnad"], 2.0)   # 13,0 - 11,0
        self.assertIsNone(m[2025]["konsskillnad"])       # kön saknas 2025


class TestNianTillGymnasiet(unittest.TestCase):
    """build_nian_gymnasiet: kullkedjan, meritvärdesbrottet, korrelationen
    och pendlingens kontrollsumma."""

    def nianfil(self, ar, lasar, meritamnen, meritvarde, behorig):
        return {
            "ar": ar, "lasar": lasar, "kommun": "Testköping",
            "kommunkod": "0000", "niva": "Skolkommun", "urval": "T",
            "meritamnen": meritamnen, "ungefarliga": [],
            "rapportTitel": "Nian", "kalla": "T", "kallaUrl": "u",
            "statistikUrl": "s", "koder": {}, "hamtad": "2026-01-01",
            "rader": [{"huvudman": "Samtliga", "antal": 100,
                       "meritvarde": meritvarde, "andelBehorigYrkes": behorig,
                       "andelAllaAmnen": 80.0}],
        }

    def startfil(self, ar, examen3, program="Naturvetenskapsprogrammet"):
        return {
            "startAr": ar, "startLasar": f"{ar}/{str(ar + 1)[-2:]}",
            "kommun": "Testköping", "kommunkod": "0000", "niva": "Skolkommun",
            "ungefarliga": [], "rapportTitel": "Genomströmning", "kalla": "T",
            "kallaUrl": "u", "statistikUrl": "s", "koder": {},
            "hamtad": "2026-01-01",
            "rader": [
                {"huvudman": "Samtliga", "program": "Nationella program",
                 "antal": 90, "examen3": examen3, "examen4": None,
                 "examen5": None, "sammaProgram3": None,
                 "sammaProgram4": None, "sammaProgram5": None},
                {"huvudman": "Samtliga", "program": program, "antal": 40,
                 "examen3": examen3, "examen4": None, "examen5": None,
                 "sammaProgram3": None, "sammaProgram4": None,
                 "sammaProgram5": None},
                {"huvudman": "Kommunal", "program": "Nationella program",
                 "antal": 80, "examen3": 1.0, "examen4": None,
                 "examen5": None, "sammaProgram3": None,
                 "sammaProgram4": None, "sammaProgram5": None},
            ],
        }

    def examensfil(self, ar, betygspoang):
        return {
            "ar": ar, "lasar": f"{ar - 1}/{str(ar)[-2:]}",
            "kommun": "Testköping", "kommunkod": "0000", "niva": "Skolkommun",
            "ungefarliga": [], "rapportTitel": "Avgång", "kalla": "T",
            "kallaUrl": "u", "statistikUrl": "s", "koder": {},
            "hamtad": "2026-01-01",
            "rader": [{"huvudman": "Samtliga", "program": "Nationella program",
                       "antal": 85, "andelExamen": 90.0,
                       "andelStudiebevis": 10.0, "andelGrundlBehorighet": 70.0,
                       "betygspoang": betygspoang, "betygspoangExamen": None}],
        }

    def pendelfil(self, ar, folkbokforda, hemma, ut, in_):
        def del_(f, h, u, i):
            return {"folkbokforda": f, "skolorKom": 1, "skolorEnsk": 0,
                    "studerandeKom": h + i, "studerandeEnsk": 0,
                    "folkbokfordaStuderandeKom": h,
                    "folkbokfordaStuderandeEnsk": 0,
                    "inpendlingKom": i, "inpendlingEnsk": 0,
                    "utpendlingKom": u, "utpendlingEnsk": 0}
        return {
            "ar": ar, "lasar": f"{ar}/{str(ar + 1)[-2:]}",
            "kommun": "Testköping", "kommunkod": "0000", "niva": "Pendling",
            "rapportTitel": "Pendling", "kalla": "T", "kallaUrl": "u",
            "kallaUrlGrundskolan": "u2", "statistikUrl": "s", "koder": {},
            "hamtad": "2026-01-01",
            "gymnasiet": del_(folkbokforda, hemma, ut, in_),
            "grundskolan": del_(1000, 990, 10, 5),
        }

    def setUp(self):
        # Nian 2014–2017; gymnasiestart 2014–2015; examen 2017–2018.
        # Bara 2014 och 2015 har alla tre mätpunkterna.
        self.ut = build_nian_gymnasiet.bygg(
            [self.nianfil(2014, "2013/14", 16, 228.0, 94.0),
             self.nianfil(2015, "2014/15", 17, 242.0, 93.0),
             self.nianfil(2016, "2015/16", 17, 244.0, 95.0),
             self.nianfil(2017, "2016/17", 17, 240.0, 92.0)],
            [self.startfil(2014, 77.0), self.startfil(2015, 79.0)],
            [self.examensfil(2017, 13.8), self.examensfil(2018, 14.0)],
            [self.pendelfil(2024, 1000, 700, 300, 200)])
        self.kullar = {k["ar"]: k for k in self.ut["kullar"]}

    def test_kullen_paras_med_examen_tre_ar_senare(self):
        k = self.kullar[2015]
        self.assertEqual(k["examensar"], 2018)
        self.assertEqual(k["examen"]["ar"], 2018)
        self.assertEqual(k["examen"]["betygspoang"], 14.0)
        self.assertEqual(k["start"]["ar"], 2015)

    def test_ar_utan_gymnasiedata_markeras_som_framtid(self):
        """Ett år vars mätpunkter inte hunnit publiceras ska synas som en
        lucka med orsak – inte som ett saknat värde utan förklaring."""
        k = self.kullar[2017]
        self.assertEqual(k["start"]["status"], "framtid")
        self.assertEqual(k["examen"]["status"], "framtid")
        self.assertEqual(self.ut["antalKompletta"], 2)

    def test_brottsaret_for_meritvardet_hittas(self):
        self.assertEqual(self.ut["meritamnenBrott"], 2015)

    def test_meritsamband_hoppar_over_16_amnesaren(self):
        """16 och 17 ämnen mäter olika saker och får inte ligga i samma
        punktmoln. Kvar blir en enda punkt – för få för ett r."""
        s = {x["nyckel"]: x for x in self.ut["samband"]}
        merit = s["meritvarde-examen3"]
        self.assertEqual([p["ar"] for p in merit["punkter"]], [2015])
        self.assertIsNone(merit["r"])
        # Behörigheten är jämförbar alla år och behåller båda kullarna
        self.assertEqual(len(s["behorighet-examen3"]["punkter"]), 2)

    def test_korrelation_kraver_minst_tre_punkter(self):
        self.assertIsNone(build_nian_gymnasiet.pearson([(1, 2), (2, 4)]))
        self.assertEqual(
            build_nian_gymnasiet.pearson([(1, 2), (2, 4), (3, 6)])["r"], 1.0)

    def test_pendlingen_summeras_och_stams_av(self):
        g = self.ut["pendling"][0]["gymnasiet"]
        self.assertEqual(g["utpendling"], 300)
        self.assertEqual(g["inpendling"], 200)
        self.assertEqual(g["studerarHar"], 900)     # 700 hemma + 200 inpendlare
        self.assertEqual(g["netto"], -100)
        self.assertEqual(g["andelUt"], 30.0)        # 300 av 1000
        self.assertAlmostEqual(g["andelInAvEleverna"], 22.2)
        self.assertTrue(g["stammer"])               # 700 + 300 = 1000

    def test_summarader_hamnar_inte_bland_programmen(self):
        namn = [p["namn"] for p in self.ut["program"]]
        self.assertEqual(namn, ["Naturvetenskapsprogrammet"])
        self.assertNotIn("Nationella program", namn)

    def test_bara_huvudmannatypen_samtliga_anvands(self):
        """Rapporterna upprepar varje rad per huvudman; tas fel rad blir
        siffrorna kommunala skolors i stället för hela kommunens."""
        self.assertEqual(self.kullar[2014]["start"]["examen3"], 77.0)


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

    def test_data_befolkning_ar_reproducerbar(self):
        scb = json.loads(
            (ROT / "data" / "scb" / "folkmangd_kungsbacka.json")
            .read_text(encoding="utf-8"))
        # Åren är heltalsnycklar i bygget men strängar i JSON-filen
        ombyggd = json.loads(json.dumps(build_befolkning.bygg(scb)))
        self.assertEqual(ombyggd, self.las("data-befolkning.json"))

    def test_data_nian_gymnasiet_ar_reproducerbar(self):
        def las_mapp(mapp, prefix):
            return [json.loads(f.read_text(encoding="utf-8"))
                    for f in sorted((ROT / "data" / mapp).glob(f"{prefix}_*.json"))]
        ombyggd = build_nian_gymnasiet.bygg(
            las_mapp("arskurs9", "arskurs9"),
            las_mapp("genomstromning", "genomstromning"),
            las_mapp("avgangskommun", "avgangskommun"),
            las_mapp("pendling", "pendling"))
        self.assertEqual(ombyggd, self.las("data-nian-gymnasiet.json"))

    def test_data_amnesbetyg_ar_reproducerbar(self):
        arsfiler = [
            json.loads(f.read_text(encoding="utf-8"))
            for f in sorted((ROT / "data" / "amnesbetyg").glob("amnesbetyg_*.json"))
        ]
        ombyggd = json.loads(json.dumps(build_amnesbetyg.bygg(arsfiler)))
        self.assertEqual(ombyggd, self.las("data-amnesbetyg.json"))


if __name__ == "__main__":
    unittest.main()
