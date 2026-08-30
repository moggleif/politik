"""Kontrollräknar de viktigaste beräkningarna.

Körs:  python3 -m unittest discover tests

Två sorters test:

  * enhetstest med små påhittade indata, där facit går att räkna för hand
  * avstämningar mot de riktiga datafilerna i repot: de färdigbyggda
    docs/data*.json ska vara exakt vad byggskripten ger av innehållet i
    data/ – annars har någon ändrat utdatan för hand eller glömt bygga om
"""

import importlib
import itertools
import json
import re
import sys
import unittest
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent

# Skripten importerar varandra som vanliga moduler (import program) och
# räknar med att scripts/ ligger på sökvägen – det gör den när de körs
# som `python3 scripts/<skript>.py`, och här ordnas samma sak för testerna.
sys.path.insert(0, str(ROT / "scripts"))


def ladda(namn: str):
    """Importera ett byggskript från scripts/ som modul."""
    return importlib.import_module(namn)


build_data = ladda("build_data")
build_kull = ladda("build_kull")
build_befolkning = ladda("build_befolkning")
build_amnesbetyg = ladda("build_amnesbetyg")
build_nian_gymnasiet = ladda("build_nian_gymnasiet")
build_meritvarden = ladda("build_meritvarden")
build_slutbetyg = ladda("build_slutbetyg")
skolverket = ladda("skolverket")


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


class TestKohortframskrivning(unittest.TestCase):
    """build_data: barnen blir ett år äldre varje år.

    Underlaget är påhittat men gjort så att facit går att räkna för hand:
    varje ålder a år 2025 har exakt 100 + a personer."""

    def setUp(self):
        self.pa = {2025: {a: 100 + a for a in range(0, 20)}}
        self.scb = {
            "kommun": "Testköping",
            "matt": "Folkmängd",
            "kalla": "SCB",
            "kallaUrl": "https://example.org",
            "hamtad": "2026-01-01",
            "perAlder": {"2025": {str(a): 100 + a for a in range(0, 20)}},
        }

    def test_framskrivning_summerar_ratt_aldrar(self):
        """Om ett år är 16–19-åringarna dagens 15–18-åringar."""
        self.assertEqual(
            build_data.framskriv(self.pa[2025], 1, (16, 19)),
            115 + 116 + 117 + 118)
        self.assertEqual(
            build_data.framskriv(self.pa[2025], 16, (16, 19)),
            100 + 101 + 102 + 103)

    def test_ar_utanfor_underlaget_ger_inget_varde(self):
        """Ett halvt svar vore värre än inget: det skulle rita en tvär
        nedgång som bara beror på att åldrarna tagit slut."""
        self.assertIsNone(build_data.framskriv(self.pa[2025], 17, (16, 19)))
        self.assertIsNone(build_data.framskriv(self.pa[2025], 0, (16, 19)))

    def test_bygget_gar_sa_langt_underlaget_racker(self):
        ut = build_data.bygg_kohort(self.scb, [], {2025: 466}, (16, 19))
        self.assertEqual(ut["basAr"], 2025)
        self.assertEqual(ut["sistaAr"], 2041)          # 2025 + 16
        self.assertEqual(len(ut["framskrivning"]), 16)
        self.assertEqual(ut["framskrivning"]["2026"], 466)
        self.assertEqual(ut["ursprung"]["2026"][0], {"alder": 15, "antal": 115})

    def test_ingen_kohort_utan_aldersspann(self):
        """Totalsidan har inget åldersspann och ska inte få någon
        framskrivning – bara 16–19-serien."""
        self.assertIsNone(build_data.bygg_kohort(self.scb, [], {}, None))

    def test_argangarna_borjar_dar_prognoserna_borjar(self):
        """En prognos gjord år P hade folkmängden t.o.m. P−1 att utgå
        från, så första jämförbara årgången är basåret P−1. Annars
        jämförs modellerna på olika underlag."""
        pa = {"2024": {str(a): 100 + a for a in range(0, 20)},
              "2025": {str(a): 100 + a for a in range(0, 20)}}
        scb = dict(self.scb, perAlder=pa)
        prognoser = [{"prognosAr": 2025, "prognos": {}}]
        ut = build_data.bygg_kohort(scb, prognoser, {}, (16, 19))
        self.assertEqual(ut["forstaBasAr"], 2024)
        self.assertEqual([a["basAr"] for a in ut["argangar"]], [2024, 2025])

    def test_en_argang_per_basar_med_egna_avvikelser(self):
        rader = build_data.kohortargangar(
            self.pa, {2026: 500, 2027: 480}, (16, 19), 2025)
        self.assertEqual(len(rader), 1)
        arg = rader[0]
        self.assertEqual(arg["basAr"], 2025)
        self.assertEqual(arg["sistaAr"], 2041)
        self.assertEqual(arg["framskrivning"]["2026"], 466)   # 115+116+117+118
        self.assertEqual(arg["avvikelser"]["2026"]["diff"], -34)
        self.assertEqual(arg["avvikelser"]["2026"]["avstand"], 1)
        self.assertEqual(arg["antal"], 2)
        self.assertEqual(arg["ettArPct"], -6.8)

    def test_argang_utan_facit_far_inga_matt(self):
        """Den senaste årgången har inget att jämföras mot ännu – den ska
        finnas i diagrammet men inte räknas in i något medelvärde."""
        arg = build_data.kohortargangar(self.pa, {}, (16, 19), 2025)[0]
        self.assertEqual(arg["antal"], 0)
        self.assertIsNone(arg["medelAbsPct"])
        self.assertIsNone(arg["ettArPct"])
        self.assertIsNone(arg["maxAvstand"])

    def test_traffsakerheten_mater_avvikelsen_mot_utfallet(self):
        # Framskrivet 2026 = 466. Sätt utfallet till 500 -> -6,8 %.
        rader = build_data.kohortfel(self.pa, {2026: 500}, (16, 19))
        self.assertEqual(len(rader), 1)
        self.assertEqual(rader[0]["avstand"], 1)
        self.assertEqual(rader[0]["antal"], 1)
        self.assertAlmostEqual(rader[0]["medelPct"], -6.8)
        self.assertAlmostEqual(rader[0]["medelAbsPct"], 6.8)

    def test_jamforelsen_ger_kommunen_samma_utgangspunkt(self):
        """En prognos gjord 2026 har folkmängden t.o.m. 2025 att utgå
        från, så framskrivningen ska utgå från just 2025 – inte 2026."""
        prognoser = [{"prognosAr": 2026, "prognos": {"2026": 480}}]
        rader = build_data.kohortjamforelse(
            self.pa, prognoser, {2026: 500}, (16, 19))
        self.assertEqual(len(rader), 1)
        self.assertEqual(rader[0]["avstand"], 0)
        self.assertAlmostEqual(rader[0]["kommunAbsPct"], 4.0)   # 480 mot 500
        self.assertAlmostEqual(rader[0]["kohortAbsPct"], 6.8)   # 466 mot 500

    def test_jamforelsen_hoppar_over_ar_utan_facit(self):
        prognoser = [{"prognosAr": 2026, "prognos": {"2026": 480, "2027": 470}}]
        rader = build_data.kohortjamforelse(
            self.pa, prognoser, {2026: 500}, (16, 19))
        self.assertEqual([r["avstand"] for r in rader], [0])


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


class TestSkolverketParsning(unittest.TestCase):
    """skolverket: den delade tolkningen av exporttjänstens filer."""

    def test_tal_lasar_svenska_tal(self):
        self.assertEqual(skolverket.tal("16,7"), 16.7)
        self.assertEqual(skolverket.tal("1 234"), 1234)
        self.assertEqual(skolverket.tal("1\xa0234"), 1234)

    def test_tal_prickning_blir_none(self):
        self.assertIsNone(skolverket.tal(".."))
        self.assertIsNone(skolverket.tal("."))
        self.assertIsNone(skolverket.tal(""))
        self.assertIsNone(skolverket.tal(None))

    def test_tal_tilde100_styrs_av_flaggan(self):
        self.assertIsNone(skolverket.tal("~100"))
        self.assertEqual(skolverket.tal("~100", tilde_ar_100=True), 100.0)

    def test_rubrikrad_hittas_pa_forsta_kolumnen(self):
        rader = [["Rapportens titel"], [], ["Skola", "Program"], ["Aranäs", "NA"]]
        self.assertEqual(skolverket.rubrikrad(rader, "Skola"), 2)
        with self.assertRaises(SystemExit):
            skolverket.rubrikrad(rader, "Kommun")

    def test_lasar_ur_lases_ur_inledningen(self):
        rader = [["Valt läsår: 2024/25"], ["Skola"]]
        self.assertEqual(skolverket.lasar_ur(rader, "Valt läsår"), "2024/25")
        self.assertEqual(skolverket.lasar_ur([["Skola"]], "Valt läsår"), "")


class TestMeritvarden(unittest.TestCase):
    """build_meritvarden: namntolkning och medelvärden."""

    def test_dela_utbildning_program_kod_inriktning(self):
        program, inriktning, aretsnamn = build_meritvarden.dela_utbildning(
            "Naturvetenskapsprogrammet NA - Naturvetenskap")
        self.assertEqual(program, "Naturvetenskapsprogrammet")
        self.assertEqual(inriktning, "Naturvetenskap")
        self.assertIsNone(aretsnamn)

    def test_dela_utbildning_utan_inriktning(self):
        program, inriktning, aretsnamn = build_meritvarden.dela_utbildning(
            "Teknikprogrammet TE")
        self.assertEqual(program, "Teknikprogrammet")
        self.assertEqual(inriktning, "")
        self.assertIsNone(aretsnamn)

    def test_dela_utbildning_namnbyte_ger_aretsnamn(self):
        """Handels ska föras till dagens namn men minnas rapportens."""
        program, _, aretsnamn = build_meritvarden.dela_utbildning(
            "Handels- och administrationsprogrammet HA - Handel och service")
        self.assertEqual(program, "Försäljnings- och serviceprogrammet")
        self.assertEqual(aretsnamn, "Handels- och administrationsprogrammet")

    def test_inriktning_som_upprepar_programnamnet_stryks(self):
        program, inriktning, _ = build_meritvarden.dela_utbildning(
            "Vård- och omsorgsprogrammet VO - Vård- och omsorgsprogrammet")
        self.assertEqual(program, "Vård- och omsorgsprogrammet")
        self.assertEqual(inriktning, "")

    def test_inriktningsnyckel_ar_ordningsokanslig(self):
        a = build_meritvarden.inriktningsnyckel(
            "Särskild variant inom det estetiska området, Bild")
        b = build_meritvarden.inriktningsnyckel(
            "Bild, Särskild variant inom det estetiska området")
        self.assertEqual(a, b)

    def test_inriktningsnyckel_skiljer_anstalld_larling_fran_larling(self):
        """Två utbildningsformer, inte två stavningar.

        GR:s rapporter använder båda orden samtidigt: Vård- och omsorg står
        som "Anställd lärling" 2025 och 2026, medan de industritekniska
        lärlingsutbildningarna bytte till "Lärling" samma år.
        """
        self.assertNotEqual(build_meritvarden.inriktningsnyckel("Anställd lärling"),
                            build_meritvarden.inriktningsnyckel("Lärling"))

    def test_typ_av(self):
        self.assertEqual(build_meritvarden.typ_av("Naturvetenskapsprogrammet"),
                         "hogskoleforberedande")
        self.assertEqual(build_meritvarden.typ_av("Vård- och omsorgsprogrammet"),
                         "yrkesprogram")
        self.assertEqual(
            build_meritvarden.typ_av("Introduktionsprogram, yrkesintroduktion"),
            "introduktion")
        self.assertEqual(build_meritvarden.typ_av("Påhittade programmet"),
                         "okant")

    def test_medel_ar_ovagt_och_avrundat(self):
        self.assertEqual(build_meritvarden.medel([200.0, 250.5]), 225.25)
        self.assertIsNone(build_meritvarden.medel([]))


class TestSlutbetyg(unittest.TestCase):
    """build_slutbetyg: elevvägd sammanslagning och seriebygget."""

    def rad(self, antal, poang, examen=None):
        r = {"antal": antal, "betygspoang": poang, "betygspoangExamen": None,
             "andelExamen": examen, "andelGrundlBehorighet": None}
        return r

    def test_vag_ihop_vager_med_antal_elever(self):
        # 10 elever à 10,0 och 30 elever à 14,0 -> (100+420)/40 = 13,0
        ut = build_slutbetyg.vag_ihop([self.rad(10, 10.0), self.rad(30, 14.0)])
        self.assertEqual(ut["antal"], 40)
        self.assertEqual(ut["betygspoang"], 13.0)
        self.assertEqual(ut["betygspoangVikt"], 40)

    def test_vag_ihop_vager_varje_matt_for_sig(self):
        """En rad med dold examensandel får inte vikt i det måttet."""
        ut = build_slutbetyg.vag_ihop([
            self.rad(10, 10.0, examen=80.0),
            self.rad(30, 14.0, examen=None),
        ])
        self.assertEqual(ut["betygspoang"], 13.0)     # båda raderna
        self.assertEqual(ut["andelExamen"], 80.0)     # bara första raden
        self.assertEqual(ut["andelExamenVikt"], 10)
        self.assertEqual(ut["dolda"], 0)

    def test_vag_ihop_helt_dolda_rader(self):
        ut = build_slutbetyg.vag_ihop([self.rad(None, None)])
        self.assertIsNone(ut["antal"])
        self.assertIsNone(ut["betygspoang"])
        self.assertEqual(ut["dolda"], 1)

    def test_gor_serie_odelad_lagger_skolornas_ar_efter_varandra(self):
        """Ett program som flyttat tar de gamla åren med sig i en serie."""
        v1 = {"antal": 50, "betygspoang": 13.0, "betygspoangExamen": None,
              "andelExamen": None, "andelGrundlBehorighet": None}
        v2 = dict(v1, betygspoang=14.0)
        serie = build_slutbetyg.gor_serie(
            "Testprogrammet",
            {"Aranäsgymnasiet": {"2014": v1},
             "Elof Lindälvs gymnasium": {"2015": v2}},
            {"Aranäsgymnasiet": ["2014"],
             "Elof Lindälvs gymnasium": ["2015"]},
            delad=False)
        self.assertEqual(serie["namn"], "Testprogrammet")
        self.assertEqual(serie["skola"], "Elof Lindälvs gymnasium")
        self.assertEqual(serie["forstaAr"], 2014)
        self.assertEqual(serie["sistaAr"], 2015)
        self.assertEqual(serie["forandring"], 1.0)
        self.assertEqual(serie["varden"]["2014"]["skola"], "Aranäsgymnasiet")

    def test_gor_serie_delad_far_skolan_i_namnet(self):
        v = {"antal": 50, "betygspoang": 13.0, "betygspoangExamen": None,
             "andelExamen": None, "andelGrundlBehorighet": None}
        serie = build_slutbetyg.gor_serie(
            "Testprogrammet", {"Aranäsgymnasiet": {"2014": v}},
            {"Aranäsgymnasiet": ["2014"]}, delad=True)
        self.assertIn("–", serie["namn"])
        self.assertTrue(serie["delad"])

    def test_tom_skola_skuggar_inte_redovisat_ar(self):
        """Skolan som redovisar året vinner över en tom rad för samma år."""
        tom = {"antal": None, "betygspoang": None, "betygspoangExamen": None,
               "andelExamen": None, "andelGrundlBehorighet": None}
        full = dict(tom, antal=50, betygspoang=13.0)
        serie = build_slutbetyg.gor_serie(
            "Testprogrammet",
            {"Aranäsgymnasiet": {"2014": full},
             "Elof Lindälvs gymnasium": {"2014": tom}},
            {"Aranäsgymnasiet": ["2014"]},
            delad=False)
        self.assertEqual(serie["varden"]["2014"]["skola"], "Aranäsgymnasiet")
        self.assertEqual(serie["varden"]["2014"]["betygspoang"], 13.0)


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

    def test_data_16_19_ar_reproducerbar(self):
        """Kohortfilen – den mest komplexa utdatan – ska också gå att bygga om."""
        scb = json.loads(
            (ROT / "data" / "scb" / "folkmangd_kungsbacka.json")
            .read_text(encoding="utf-8"))
        rapporter = [
            json.loads(f.read_text(encoding="utf-8"))
            for f in sorted((ROT / "data" / "prognoser").glob("prognos_*.json"))
        ]
        utfall = {int(a): v
                  for a, v in scb["aldersgrupper"]["16-19"].items()}
        ombyggd = build_data.bygg(scb, rapporter, utfall, "16-19",
                                  "16–19 år", (16, 19))
        self.assertEqual(ombyggd, self.las("data-16-19.json"))

    def test_data_meritvarden_ar_reproducerbar(self):
        argangar = [
            json.loads(f.read_text(encoding="utf-8"))
            for f in sorted((ROT / "data" / "antagning").glob("antagning_*.json"))
        ]
        ombyggd, okanda = build_meritvarden.bygg(argangar)
        self.assertEqual(okanda, set())
        self.assertEqual(ombyggd, self.las("data-meritvarden.json"))

    def test_data_slutbetyg_ar_reproducerbar(self):
        argangar = [
            json.loads(f.read_text(encoding="utf-8"))
            for f in sorted((ROT / "data" / "slutbetyg").glob("slutbetyg_*.json"))
        ]
        ombyggd, okanda_skolor, okanda_program, _ = build_slutbetyg.bygg(argangar)
        self.assertEqual(okanda_skolor, set())
        self.assertEqual(okanda_program, set())
        self.assertEqual(ombyggd, self.las("data-slutbetyg.json"))

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


class TestExaktSummering(unittest.TestCase):
    """Medelvärdena ska vara oberoende av summeringsordning – och därmed
    av Python-version.

    Python 3.12 införde kompenserad summering i sum() för float. Ett snitt
    räknat med sum() kunde därför landa på 3,81 i 3.11 och 3,80 i 3.12,
    vilket gjorde de incheckade datafilerna versionsberoende. Byggskripten
    använder math.fsum, som summerar exakt: samma svar oavsett ordning och
    tolkversion. Testet permuterar indata, vilket fångar ett återfall till
    sum() på vilken version som helst.
    """

    # Verkliga avvikelser ur data.json vid horisonten fyra år; deras snitt
    # ligger precis på en avrundningsgräns (3,805).
    VARDEN = [-0.06, 1.67, 3.98, 5.14, 6.5, 5.48]

    def test_medelabs_ar_permutationsinvariant(self):
        svar = {build_data.medelabs(list(p))
                for p in itertools.permutations(self.VARDEN)}
        self.assertEqual(svar, {3.8})

    def test_medelpct_ar_permutationsinvariant(self):
        svar = {build_data.medelpct(list(p))
                for p in itertools.permutations(self.VARDEN)}
        self.assertEqual(len(svar), 1, svar)

    def test_byggskripten_summerar_floats_exakt(self):
        """Ingen ny round(sum(...)/len(...)) får smyga sig in."""
        for namn in ("build_data", "build_amnesbetyg", "build_meritvarden",
                     "build_slutbetyg", "build_nian_gymnasiet"):
            kod = (ROT / "scripts" / f"{namn}.py").read_text(encoding="utf-8")
            self.assertNotIn("round(sum(", kod, namn)


class TestAvskrifter(unittest.TestCase):
    """Vaktar avskrifterna mot kända fel i PDF-utläsningen."""

    def test_inga_sidbrytningsfragment_i_antagningen(self):
        """Ett utbildningsnamn som bryts mot en radlinje i GR:s rapport
        blir en extra rad med avhugget namn och sidfotstext i
        talkolumnerna. Kännetecknet: namnet är ett äkta prefix av ett
        annat namn på samma skola, brottet ligger vid en ordgräns, och
        raden saknar egna mätvärden. Ett sådant fragment låg i
        antagning_2022 och blev en egen tom utbildning på sidan.
        """
        for fil in sorted((ROT / "data" / "antagning").glob("antagning_*.json")):
            rader = json.loads(fil.read_text(encoding="utf-8"))["utbildningar"]
            for u in rader:
                if (u["antagningspoang"] is not None
                        or u["medelmeritvarde"] is not None):
                    continue
                for annan in rader:
                    if (annan is u or annan["skola"] != u["skola"]
                            or not annan["utbildning"].startswith(u["utbildning"])
                            or annan["utbildning"] == u["utbildning"]):
                        continue
                    rest = annan["utbildning"][len(u["utbildning"]):]
                    self.assertNotIn(rest[:1], (" ", ","),
                                     f"{fil.name}: {u['utbildning']!r} ser ut att "
                                     f"vara ett avhugget {annan['utbildning']!r}")


class TestTolkningsregler(unittest.TestCase):
    """Vaktar att presentationen inte går längre än beräkningen bär.

    Fynden kommer ur en granskning som letade efter överdrivna utsagor
    snarare än efter räknefel: koden räknade rätt, men de svenska
    meningarna påstod mer än talen visar.
    """

    def las(self, vag):
        return (ROT / vag).read_text(encoding="utf-8")

    def test_forbattring_jamfors_inte_mot_rekordfelet(self):
        """Att ställa senaste årgången mot den sämsta någonsin är inget
        test av förbättring över tid – nästan vilket värde som helst slår
        ett rekordfel."""
        js = self.las("docs/app.js")
        self.assertNotIn("Felet har alltså minskat", js)
        self.assertNotIn("Felet har alltså inte minskat", js)

    def test_ingen_mekanismforklaring_av_teckenbyte(self):
        """Ett teckenbyte mellan årgångar visar inte att modellen missar
        vändpunkter."""
        self.assertNotIn("missar vändpunkter", self.las("docs/app.js"))

    def test_skevheten_utges_inte_for_statistiskt_faststalld(self):
        js = self.las("docs/app.js")
        self.assertNotIn("kallas systematiskt", js)
        self.assertNotIn("det går att räkna bort", js)

    def test_kohortframskrivningen_pastas_inte_antagandefri(self):
        """Att bära kohorten rakt fram förutsätter noll nettoflyttning
        och ingen dödlighet – det är ett antagande, inte frånvaron av ett."""
        for vag in ("docs/kohort.js", "docs/gymnasiealdern.html", "README.md"):
            text = self.las(vag).lower()
            for forbjudet in ("inga antaganden", "antar ingenting alls",
                              "inte antar något alls", "fri från antaganden"):
                if forbjudet == "fri från antaganden" and "inte" in text:
                    continue        # "är inte längre fri från antaganden" är korrekt
                self.assertNotIn(forbjudet, text, f"{vag}: {forbjudet!r}")

    def test_framskrivningen_kallas_inte_undre_grans(self):
        """Historisk underskattning skapar ingen undre gräns för framtiden."""
        self.assertNotIn("undre gräns</em>", self.las("docs/kohort.js"))

    def test_slutbetygen_utges_inte_for_hela_kullen(self):
        """Sammanfattningen bygger på summeringsraden Nationella program."""
        for vag in ("docs/slutbetyg.html", "docs/slutbetyg.js"):
            self.assertNotIn("hela avgångskullen", self.las(vag).lower(), vag)

    def test_inga_lasanvisningar_eller_omdomen(self):
        """Sidorna beskriver datat; de talar inte om hur det ska läsas."""
        import glob
        for vag in sorted(glob.glob(str(ROT / "docs" / "*.js")) +
                          glob.glob(str(ROT / "docs" / "*.html"))):
            if vag.endswith("chart.umd.js"):
                continue
            text = open(vag, encoding="utf-8").read()
            for forbjudet in ("Läs med försiktighet", "ska inte övertolkas",
                              "tyder på", "talar för att"):
                self.assertNotIn(forbjudet, text,
                                 f"{Path(vag).name}: {forbjudet!r}")

    def test_inga_egna_analysmodeller_kvar(self):
        """Sidan visar källdata; den enda beräkning som inte kommer ur en
        källa är kohortframskrivningen. Korrelationer, kompenserad
        framskrivning och modellvarianter är borttagna."""
        for namn in ("data-nian-gymnasiet.json",):
            d = json.loads((ROT / "docs" / namn).read_text(encoding="utf-8"))
            self.assertNotIn("samband", d, namn)
        kohort = json.loads(
            (ROT / "docs" / "data-16-19.json").read_text(encoding="utf-8"))["kohort"]
        for falt in ("kompenserad", "kvoter", "varianter"):
            self.assertNotIn(falt, kohort, falt)
        self.assertIn("framskrivning", kohort)

    def test_gapet_pastas_inte_ha_vidgats(self):
        """Gruppsnitten är sammansättningskänsliga: utbudet ändras."""
        for vag in ("docs/merit.js", "docs/slutbetyg.js"):
            self.assertNotIn("Gapet har alltså", self.las(vag), vag)

    def test_programsiffran_kallas_inte_elevernas_medelmeritvarde(self):
        """Programmets tal är ett ovägt snitt av inriktningarnas medelvärden.

        GR redovisar inte antal antagna, så talet kan inte vägas efter hur
        många eleverna var. Barn- och fritidsprogrammet på Elof Lindälv
        2026 visar varför etiketten spelar roll: (141,25 + 206,25) / 2 =
        173,75, ett tal som ingen elevgrupp behöver ha haft.
        """
        d = json.loads((ROT / "docs" / "data-meritvarden.json")
                       .read_text(encoding="utf-8"))
        traff = [p for p in d["program"]
                 if p["namn"].startswith("Barn- och fritid")
                 and "2026" in p["varden"]
                 and p["varden"]["2026"]["skola"].startswith("Elof")]
        self.assertEqual(len(traff), 1)
        v = traff[0]["varden"]["2026"]
        delar = [u["varden"]["2026"]["medel"] for u in d["utbildningar"]
                 if u["program"] == traff[0]["namn"]
                 and u["skola"].startswith("Elof")
                 and u["varden"].get("2026")
                 and u["varden"]["2026"]["medel"] is not None]
        self.assertEqual(sorted(delar), [141.25, 206.25])
        self.assertEqual(v["antal"], len(delar))
        self.assertAlmostEqual(v["medel"], sum(delar) / len(delar), places=2)

        # Ingen sida får kalla programnivåns tal elevernas genomsnitt.
        for vag in ("docs/merit.js", "docs/meritvarden.html", "docs/kull.js",
                    "docs/antagning-till-examen.html"):
            text = self.las(vag)
            for forbjudet in ("medelmeritvärdet för de antagna eleverna",
                              "Medelmeritvärdet för de antagna eleverna"):
                self.assertNotIn(forbjudet, text, vag)

    def test_programnivan_beskrivs_som_ovagd(self):
        """Där programsiffran visas ska ovägningen stå i klartext."""
        for vag in ("docs/meritvarden.html", "docs/antagning-till-examen.html",
                    "docs/metod.html"):
            self.assertIn("ovägt", self.las(vag).lower(), vag)
        self.assertIn("Ovägt genomsnitt av inriktningarnas medelmeritvärden",
                      self.las("docs/merit.js"))

    def test_antagningspoangen_kallas_inte_alltid_en_intagningsgrans(self):
        """Från 2025 skrivs poängen ut även när alla behöriga kom in.

        Då är den sist antagnas meritvärde ingen gräns som krävdes: någon
        med lägre värde kunde ha kommit in om personen sökt.
        """
        text = self.las("docs/meritvarden.html")
        self.assertNotIn("alltså den gräns som gällde för att komma in", text)
        self.assertIn("faktisk konkurrensgräns när det fanns fler", text)

        d = json.loads((ROT / "docs" / "data-meritvarden.json")
                       .read_text(encoding="utf-8"))
        # Efter definitionsbytet finns poäng även för utbildningar med
        # lediga platser kvar – annars vore texten ovan onödig.
        utan_konkurrens = [v for u in d["utbildningar"]
                           for a, v in u["varden"].items()
                           if int(a) >= 2025 and v.get("utanPlatser") is False
                           and v.get("poang") is not None]
        self.assertTrue(utan_konkurrens)

    def test_prognoserna_avgor_ingenting(self):
        """Sidan visar prognoser och utfall, inte vad de styr.

        Elever pendlar över kommungränsen i båda riktningarna, vilket
        sidan om nian till gymnasiet mäter – antalet 16–19-åringar avgör
        alltså inte antalet gymnasieplatser.
        """
        for vag in ("docs/index.html", "docs/index.js", "docs/gymnasiealdern.html"):
            text = self.las(vag)
            for forbjudet in ("avgör behovet", "avgör hur många gymnasieplatser",
                              "Prognoserna styr"):
                self.assertNotIn(forbjudet, text, vag)

    def test_systematiska_fel_pastas_inte_kunna_raknas_bort(self):
        """Ett riktat historiskt fel går inte utan vidare att räkna bort."""
        for vag in ("docs/befolkningsprognos.html", "docs/gymnasiealdern.html",
                    "docs/app.js"):
            text = self.las(vag)
            self.assertNotIn("räknas bort i modellen", text, vag)
            self.assertNotIn("kan mätas och räknas bort", text, vag)


class TestAnalyskonventioner(unittest.TestCase):
    """Skiljer på transformation, normalisering och analyskonvention.

    En namnnormalisering byter stavning. En analyskonvention räknar två
    utbildningar som en serie. Det senare är ett beslut om hur datat
    bearbetas, inte ett påstående om att utbildningarna var desamma, och
    det ska stå utskrivet på metodsidan.
    """

    def las(self, vag):
        return (ROT / vag).read_text(encoding="utf-8")

    def metodtext(self):
        return build_meritvarden.nyckla(self.las("docs/metod.html"))

    def sammanslagningar(self):
        """Varje fall där två eller fler gamla namn pekar på samma nya."""
        per_nytt = {}
        for (program, gammal), ny in build_meritvarden.INRIKTNING_BYTT_NAMN.items():
            per_nytt.setdefault((program, ny), []).append(gammal)
        return {k: v for k, v in per_nytt.items() if len(v) > 1}

    def test_varje_sammanslagning_ar_dokumenterad_pa_metodsidan(self):
        """Läggs en fjärde sammanslagning till i koden ska testet falla.

        Nyckeln i INRIKTNING_BYTT_NAMN är inriktningens gamla namn i
        normaliserad form, ibland med utbildningsformen sist ("handel och
        service larling"). Formen räknas bort; själva inriktningsnamnet
        ska gå att hitta i metodsidans text.
        """
        text = self.metodtext()
        slagna = self.sammanslagningar()
        self.assertTrue(slagna, "inga sammanslagningar hittades i byggkoden")
        for (program, ny), gamla in sorted(slagna.items()):
            self.assertIn(build_meritvarden.nyckla(program), text,
                          f"{program} saknas på metodsidan")
            for gammal in gamla:
                namn = gammal.removesuffix(" larling").strip()
                self.assertIn(namn, text,
                              f"sammanslagningen {gammal!r} → {ny!r} i "
                              f"{program} står inte på metodsidan")

    def test_sammanslagningarna_kallas_konvention_inte_identitet(self):
        """Konventionen får inte återuppstå som historiskt påstående."""
        text = self.las("docs/metod.html")
        self.assertIn("analyskonvention", text.lower())
        self.assertIn("normaliserad programserie", text)
        for vag in ("docs/metod.html", "docs/meritvarden.html",
                    "docs/slutbetyg.html"):
            for forbjudet in ("samma utbildning i kommunens utbud",
                              "är samma program",
                              "men det är samma utbildning som förts vidare"):
                self.assertNotIn(forbjudet, self.las(vag), vag)

    def test_anstalld_larling_hålls_isar_fran_larling(self):
        """Aliaset motsades av repots eget data och är borttaget.

        Vård- och omsorgsprogrammet står som "Anställd lärling" också i
        2025 och 2026 års rapporter, samtidigt som de industritekniska
        lärlingsutbildningarna bytte till "Lärling" 2025. GR skiljer
        alltså på formerna.
        """
        for ar in (2025, 2026):
            rapport = json.loads(
                (ROT / "data" / "antagning" / f"antagning_{ar}.json")
                .read_text(encoding="utf-8"))
            namn = [r["utbildning"] for r in rapport["utbildningar"]]
            self.assertTrue(
                any("Vård- och omsorg" in n and "Anställd lärling" in n
                    for n in namn),
                f"{ar}: Vård- och omsorg står inte som anställd lärling")

        self.assertFalse(hasattr(build_meritvarden, "DELALIAS"))
        # Nycklarna ska skilja formerna åt
        self.assertNotEqual(
            build_meritvarden.inriktningsnyckel("Svetsteknik, anställd lärling"),
            build_meritvarden.inriktningsnyckel("Svetsteknik, Lärling"))

        # …och serierna ska därför brytas vid formbytet, inte spänna över det
        d = json.loads((ROT / "docs" / "data-meritvarden.json")
                       .read_text(encoding="utf-8"))
        for u in d["utbildningar"]:
            if "anställd lärling" not in (u["inriktning"] or "").lower():
                continue
            if not u["namn"].startswith("Industritekniska"):
                continue
            ar = [int(a) for a, v in u["varden"].items() if v["medel"] is not None]
            self.assertTrue(ar and max(ar) <= 2024,
                            f"{u['namn']}: anställd lärling spänner över 2025")

    def test_byggkoden_beskriver_normalisering_inte_identitet(self):
        """Kodkommentarerna lyder under samma regel som sidtexten.

        Byggskripten är den ärligaste beskrivningen av vad som händer med
        datat, och den som en granskare läser efter presentationen. Går
        identitetsspråket att hitta där spelar det ingen roll att det är
        borta ur HTML:en.
        """
        import glob

        def flytande(vag):
            """Radbrytningar borträknade – texten bryts mitt i en fras."""
            return " ".join(Path(vag).read_text(encoding="utf-8").split())

        # Hela repot, inte bara byggkoden: formuleringen satt kvar i
        # källförteckningen sedan den städats ur skripten.
        filer = (glob.glob(str(ROT / "scripts" / "*.py"))
                 + glob.glob(str(ROT / "docs" / "*.js"))
                 + glob.glob(str(ROT / "docs" / "*.html"))
                 + glob.glob(str(ROT / "data" / "*.md"))
                 + glob.glob(str(ROT / "*.md")))
        for vag in sorted(filer):
            if Path(vag).name == "chart.umd.js":
                continue
            text = flytande(vag)
            for forbjudet in ("är fortfarande samma utbildning",
                              "är samma utbildning",
                              "är samma program",
                              "samma utbildning som bytt hus"):
                # Ordgränser: "när samma program" innehåller "är samma
                # program" som ren delsträng, och är inget identitetspåstående.
                self.assertIsNone(
                    re.search(r"\b" + re.escape(forbjudet) + r"\b", text),
                    f"{Path(vag).name}: {forbjudet!r}")

        self.assertIn("analyskonvention", flytande(ROT / "data" / "KALLOR.md"))

        bygg = flytande(ROT / "scripts" / "build_meritvarden.py")
        self.assertIn("normaliseras till samma serie", bygg)
        self.assertIn("ANALYSKONVENTION", bygg)
        self.assertIn("analyskonvention", flytande(ROT / "scripts" / "program.py").lower()
                      + bygg)

    def test_kohortfelets_tecken_tillskrivs_inte_flyttningen_ensam(self):
        """Framskrivningen utelämnar tre saker, inte en.

        Skillnaden mot utfallet är nettoförändringen i kohorterna –
        flyttning, dödlighet och ändringar i folkbokföringen tillsammans.
        Datat delar inte upp den, så varken texten eller kommentarerna får
        peka ut migration som orsaken.
        """
        # Både kohort.js och app.js skriver text om framskrivningen –
        # den senare i sidornas "Kort sagt".
        for vag in ("docs/kohort.js", "docs/app.js"):
            text = " ".join(self.las(vag).split())
            for forbjudet in ("nettoinflyttningen hunnit",
                              "flyttar det in fler barnfamiljer",
                              "vänder flyttnettot",
                              "om ingen flyttade",
                              "saknar den inflyttning"):
                self.assertIsNone(
                    re.search(r"\b" + re.escape(forbjudet) + r"\b", text),
                    f"{Path(vag).name}: {forbjudet!r}")

        text = self.las("docs/kohort.js")
        self.assertIn("nettoförändringen i kohorterna", text)
        # Där de tre räknas upp ska alla tre stå med
        for del_ in ("flyttning", "dödlighet", "folkbokföring"):
            self.assertIn(del_, text, del_)

    def test_flyttheuristiken_slar_inte_ihop_nagon_serie_i_dagens_data(self):
        """"Aldrig samtidigt" är ett mönster i datat, inte ett belägg.

        Regeln kan inte skilja ett program som bytt hus från ett som lagts
        ned och senare startats på den andra skolan. I dagens data slår den
        inte ihop någonting – testet faller den dag den börjar göra det, så
        att sammanslagningen inte smyger in osedd.
        """
        d = json.loads((ROT / "docs" / "data-meritvarden.json")
                       .read_text(encoding="utf-8"))
        per_program = {}
        for u in d["utbildningar"]:
            for a, v in u["varden"].items():
                if v["medel"] is not None:
                    per_program.setdefault(u["program"], {}).setdefault(
                        a, set()).add(u["skola"])
        for program, per_ar in sorted(per_program.items()):
            skolor = {s for ss in per_ar.values() for s in ss}
            if len(skolor) < 2:
                continue
            samtidigt = [a for a, s in per_ar.items() if len(s) > 1]
            self.assertTrue(
                samtidigt,
                f"{program} förs ihop av flyttheuristiken utan belägg – "
                "kontrollera att sammanslagningen är dokumenterad")

    def test_horisontdiagrammet_utger_sig_inte_for_att_identifiera_orsak(self):
        """Staplarna beskriver materialet, de mäter ingen effekt.

        Grupperna innehåller olika prognosårgångar med olika prognoslängd
        och olika målår, så skillnaden mellan en ett- och en femårsstapel
        kan inte tillskrivas horisonten.
        """
        for vag in ("docs/befolkningsprognos.html", "docs/gymnasiealdern.html"):
            text = self.las(vag)
            self.assertNotIn("Blir prognoserna bättre ju närmare året", text, vag)
            self.assertIn(
                "Det identifierar inte hur mycket större fel\n      som orsakas "
                "av en längre prognoshorisont.", text, vag)
        self.assertIn("de mäter inte vad en längre", self.las("docs/app.js"))

        # Årgångarna bakom varje stapel ska finnas i datat att skriva ut
        for namn in ("data.json", "data-16-19.json"):
            d = json.loads((ROT / "docs" / namn).read_text(encoding="utf-8"))
            for rad in d["perAvstand"]:
                self.assertEqual(len(rad["argangar"]), rad["antal"], namn)
            # Olika horisonter vilar på olika årgångar – det är hela poängen
            argangar = [tuple(r["argangar"]) for r in d["perAvstand"]]
            self.assertGreater(len(set(argangar)), 1, namn)

    def test_amnessnittet_ar_robust_mot_valet_av_matt(self):
        """Stresstest av det ovägda ämnessnittet.

        Ovägt över ett fast urval ger varje ämne vikten 1/n, och det är
        ett val. Prövas mot tre alternativ: bara obligatoriska ämnen,
        medianen av ämnena, och ett elevviktat snitt. Ger de samma
        utveckling är slutsatsen inte beroende av måttet. Skiljer de sig
        ska testet falla, för då är huvudmåttet modellberoende och det
        måste sidan i så fall berätta.
        """
        import math
        d = json.loads((ROT / "docs" / "data-amnesbetyg.json")
                       .read_text(encoding="utf-8"))
        ar = [str(a) for a in d["ar"]]
        karn = [a for a in d["amnen"] if a["arMedPoang"] == len(ar)]
        obligatoriska = [a for a in karn
                         if a["namn"] not in ("Modersmål", "Moderna språk, språkval")]

        def serie(rakna, urval):
            ut = {}
            for y in ar:
                rader = [a["varden"][y] for a in urval
                         if a["varden"].get(y)
                         and a["varden"][y]["betygspoang"] is not None]
                if rader:
                    ut[y] = rakna(rader)
            return ut

        def ovagt(r):
            return math.fsum(x["betygspoang"] for x in r) / len(r)

        def elevviktat(r):
            r = [x for x in r if x.get("antal")]
            n = math.fsum(x["antal"] for x in r)
            return math.fsum(x["betygspoang"] * x["antal"] for x in r) / n

        def median(r):
            v = sorted(x["betygspoang"] for x in r)
            m = len(v) // 2
            return v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2

        varianter = {
            "ovagt": serie(ovagt, karn),
            "obligatoriska": serie(ovagt, obligatoriska),
            "median": serie(median, karn),
            "elevviktat": serie(elevviktat, karn),
        }
        forandring = {namn: s[ar[-1]] - s[ar[0]] for namn, s in varianter.items()}

        # Samma riktning över hela perioden…
        self.assertTrue(all(v > 0 for v in forandring.values()) or
                        all(v < 0 for v in forandring.values()),
                        f"varianterna pekar åt olika håll: {forandring}")
        # …och inom en tiondels betygspoäng av varandra
        self.assertLess(max(forandring.values()) - min(forandring.values()), 0.15,
                        f"måttet är känsligt för viktningen: {forandring}")
        # Samma form år för år: ingen variant får avvika mer än 0,3 poäng
        for y in ar:
            varden = [s[y] for s in varianter.values() if y in s]
            self.assertLess(max(varden) - min(varden), 0.35,
                            f"{y}: varianterna skiljer sig åt ({varden})")


class TestPresentationsregler(unittest.TestCase):
    """Regressionsvakter för metodproblem i presentationen.

    Texttesterna är medvetet bokstavliga: de låser inte designen, bara
    specifika misstag som en granskning hittat och som inte får komma
    tillbaka – ett blandat felmått på startsidan, individpåståenden om
    aggregerade kullar och för kategoriska påståenden om betygsstatistik.
    """

    def las_text(self, vag):
        return (ROT / vag).read_text(encoding="utf-8")

    def las_json(self, namn):
        return json.loads((ROT / "docs" / namn).read_text(encoding="utf-8"))

    def test_startsidan_laser_inte_det_horisontblandade_felmattet(self):
        """skevhet.medelAbsPct blandar prognoshorisonter och låter gamla
        årgångar väga tyngre; startsidan ska visa felet per horisont ur
        perAvstand i stället."""
        js = self.las_text("docs/index.js")
        self.assertNotIn("data.skevhet.medelAbsPct", js)
        self.assertIn("perAvstand", js)

    def test_startsidan_vaktar_sista_arrayelementet(self):
        """Sammanfattningsrader ska bygga på senaste post MED data, inte
        blint på sista arrayelementet."""
        self.assertIn("sistaMed", self.las_text("docs/index.js"))

    def test_anvandartext_pastarr_inte_individuppfoljning(self):
        """Kulljämförelsen parar aggregerade grupper (antagning år X mot
        avgångselever år X+3); användartexten får inte antyda att samma
        individer följs."""
        for vag in ("docs/index.html", "README.md",
                    "docs/antagning-till-examen.html", "docs/index.js"):
            text = self.las_text(vag).lower()
            for forbjudet in ("följ samma kull", "samma kull, in och ut",
                              "följ en årskull", "kan följas hela vägen",
                              "följas från antagning till examen"):
                self.assertNotIn(forbjudet, text, f"{vag}: {forbjudet!r}")

    def test_gymnasiebetygen_pastas_inte_bara_publiceras_samlat(self):
        """Att gymnasiet 'bara' publicerar ett samlat betygssnitt är för
        kategoriskt – det som är sant är att statistiken som används HÄR
        redovisar en samlad betygspoäng per program."""
        for vag in ("docs/index.html", "README.md", "docs/amnesbetyg.html"):
            self.assertNotIn("bara ett samlat betygssnitt",
                             self.las_text(vag), vag)

    def test_perAvstand_har_startsidans_horisonter(self):
        for namn in ("data.json", "data-16-19.json"):
            avstand = {r["avstand"] for r in self.las_json(namn)["perAvstand"]}
            for k in (1, 3, 5):
                self.assertIn(k, avstand, namn)

    def test_procenttal_i_sammanfattningarna_ar_rimliga(self):
        for namn in ("data.json", "data-16-19.json"):
            d = self.las_json(namn)
            for r in d["perAvstand"]:
                self.assertTrue(0 <= r["medelAbsPct"] <= 100, (namn, r))
                self.assertTrue(-100 <= r["medelPct"] <= 100, (namn, r))
            self.assertTrue(0 <= d["skevhet"]["medelAbsPct"] <= 100, namn)
        for r in self.las_json("data-slutbetyg.json")["sammanfattning"]:
            if r["andelExamen"] is not None:
                self.assertTrue(0 <= r["andelExamen"] <= 100, r["ar"])
        for r in self.las_json("data-amnesbetyg.json")["sammanfattning"]:
            self.assertTrue(0 <= r["andelAE"] <= 100, r)
            self.assertTrue(0 <= r["betygspoang"] <= 20, r)
        for r in self.las_json("data-nian-gymnasiet.json")["pendling"]:
            for del_ in ("gymnasiet", "grundskolan"):
                andel = (r.get(del_) or {}).get("andelUt")
                if andel is not None:
                    self.assertTrue(0 <= andel <= 100, (r.get("ar"), del_))

    def test_slutbetygens_sammanfattning_ar_kronologisk_med_data(self):
        """Bygget ska hoppa över år utan data, så att sista posten alltid
        är den senaste observationen med data."""
        rader = self.las_json("data-slutbetyg.json")["sammanfattning"]
        ar = [r["ar"] for r in rader]
        self.assertEqual(ar, sorted(ar))
        for r in rader:
            self.assertIsNotNone(r["antal"], r["ar"])


if __name__ == "__main__":
    unittest.main()
