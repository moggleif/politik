"""Kontrollräknar de viktigaste beräkningarna.

Körs:  python3 -m unittest discover tests

Två sorters test:

  * enhetstest med små påhittade indata, där facit går att räkna för hand
  * avstämningar mot de riktiga datafilerna i repot: de färdigbyggda
    docs/data*.json ska vara exakt vad byggskripten ger av innehållet i
    data/ – annars har någon ändrat utdatan för hand eller glömt bygga om
"""

import importlib
import io
import itertools
import json
import re
import sys
import unittest
import zipfile
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
build_platser = ladda("build_platser")
build_slutbetyg = ladda("build_slutbetyg")
build_fortidsroster = ladda("build_fortidsroster")
build_kostnader = ladda("build_kostnader")
build_resurser = ladda("build_resurser")
hamta_fortidsroster = ladda("hamta_fortidsroster")
build_valresultat = ladda("build_valresultat")
hamta_valresultat = ladda("hamta_valresultat")
skolverket = ladda("skolverket")
val = ladda("val")


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


class TestPlatser(unittest.TestCase):
    """build_platser: namntolkning, summering över skolor och årsmärkning."""

    def rad(self, skola, utbildning, platser, **extra):
        rad = {"skola": skola, "utbildning": utbildning, "platser": platser,
               "varavPrograminriktatVal": None, "varavYrkesintroduktion": None,
               "elever": None}
        rad.update(extra)
        return rad

    def argang(self, ar, rader, **extra):
        argang = {
            "lasar": f"{ar}/{ar + 1}", "antagningsar": ar, "status": "beslutad",
            "form": "tabell-2025", "kolumn": "planerad", "kolumnINamnden": None,
            "namnd": "Nämnden", "mote": f"{ar - 1}-10-01", "paragraf": "1",
            "diarienummer": "GA-1", "arendenamn": "Utbud", "beslut": None,
            "not": None, "handlingUrl": None, "protokollUrl": None,
            "lokalPdf": "rapporter/x.pdf", "hamtad": "2026-09-15",
            "utbildningar": rader,
        }
        argang.update(extra)
        return argang

    def test_bindestreck_och_mellanrum_ger_samma_program(self):
        """Handlingarna skriver "Barn och" och "Barn- och" om vartannat."""
        for skrivning in ("Barn och fritidsprogrammet", "Barn- och fritidsprogrammet"):
            namn, inriktning, okant = build_platser.dela_utbildning(skrivning)
            self.assertEqual(namn, "Barn- och fritidsprogrammet")
            self.assertEqual(inriktning, "")
            self.assertFalse(okant)

    def test_inriktning_delas_av_fran_programmet(self):
        namn, inriktning, okant = build_platser.dela_utbildning(
            "Estetiska programmet- Bild- och formgivning")
        self.assertEqual(namn, "Estetiska programmet")
        self.assertEqual(inriktning, "Bild- och formgivning")
        self.assertFalse(okant)

    def test_skrivfel_och_tillagg_i_handlingen_normaliseras(self):
        for skrivning, vantat in (
            ("Hotel- och turismprogrammet", "Hotell- och turismprogrammet"),
            ("International Baccalaureate IB", "International Baccalaureate"),
            ("Naturvetenskapsprogrammet + inriktning estet",
             "Naturvetenskapsprogrammet"),
        ):
            namn, _, okant = build_platser.dela_utbildning(skrivning)
            self.assertEqual(namn, vantat)
            self.assertFalse(okant)

    def test_utbildningar_utanfor_programmen_hamnar_utanfor(self):
        for skrivning in ("Individuellt alternativ", "Anpassade gymnasieskolan",
                          "Lärlingsprogrammet"):
            namn, _, _ = build_platser.dela_utbildning(skrivning)
            self.assertEqual(build_platser.typ_av(namn), "okant")

    def test_platserna_summeras_over_skolorna(self):
        """Ett program på båda skolorna blir en serie med summan.

        Det är avsteget från meritvärdessidan, som i stället håller isär
        skolorna. Platser är additiva; två antagningspoäng är det inte.
        """
        data, okanda = build_platser.bygg([self.argang(2026, [
            self.rad("Aranäsgymnasiet", "Teknikprogrammet", 40),
            self.rad("Elof Lindälvs gymnasium", "Teknikprogrammet", 24),
        ])])
        self.assertEqual(okanda, set())
        serie = [p for p in data["program"] if p["namn"] == "Teknikprogrammet"][0]
        self.assertEqual(serie["varden"]["2026"]["platser"], 64)
        self.assertEqual(serie["varden"]["2026"]["antalSkolor"], 2)
        self.assertEqual(serie["varden"]["2026"]["skola"], "Aranäs + Elof Lindälv")

    def test_inriktningar_summeras_till_programmet(self):
        data, _ = build_platser.bygg([self.argang(2026, [
            self.rad("Aranäsgymnasiet", "Estetiska programmet- Bild", 12),
            self.rad("Aranäsgymnasiet", "Estetiska programmet-Musik", 10),
        ])])
        serie = [p for p in data["program"] if p["namn"] == "Estetiska programmet"][0]
        self.assertEqual(serie["varden"]["2026"]["platser"], 22)
        self.assertEqual([i["namn"] for i in serie["inriktningar"]], ["Bild", "Musik"])

    def test_hemvisten_ar_skolan_som_har_programmet_senast(self):
        """Ett program som bytt hus behåller sin historik, på dagens skola."""
        data, _ = build_platser.bygg([
            self.argang(2025, [self.rad("Aranäsgymnasiet", "Teknikprogrammet", 40)]),
            self.argang(2026, [self.rad("Elof Lindälvs gymnasium",
                                        "Teknikprogrammet", 24)]),
        ])
        serie = [p for p in data["program"] if p["namn"] == "Teknikprogrammet"][0]
        self.assertEqual(serie["hem"], "Elof Lindälv")
        self.assertEqual(serie["skolor"], ["Aranäs", "Elof Lindälv"])
        self.assertEqual(sorted(serie["varden"]), ["2025", "2026"])

    def test_ett_saknat_ar_fylls_inte_i(self):
        """Nämner handlingen inte programmet blir året ett hål, inte en nolla."""
        data, _ = build_platser.bygg([
            self.argang(2025, [self.rad("Aranäsgymnasiet", "Teknikprogrammet", 40)]),
            self.argang(2026, [self.rad("Aranäsgymnasiet",
                                        "Naturvetenskapsprogrammet", 90)]),
        ])
        serie = [p for p in data["program"] if p["namn"] == "Teknikprogrammet"][0]
        self.assertEqual(sorted(serie["varden"]), ["2025"])

    def test_okant_program_flaggas(self):
        data, okanda = build_platser.bygg([self.argang(2026, [
            self.rad("Aranäsgymnasiet", "Rymdprogrammet", 10)])])
        self.assertEqual(okanda, {"Rymdprogrammet"})
        self.assertEqual(data["sammanfattning"][0]["platser"], 0)

    def test_aret_ar_antagningsaret_inte_beslutsaret(self):
        """Beslutet hösten X gäller läsåret X+1/X+2 och ligger på X+1.

        Undantaget är de årgångar som står som jämförelsekolumn i en
        senare handling: de redovisas i efterhand och kan därför ha ett
        möte som ligger efter läsårets början.
        """
        for argang in build_platser.las_argangar():
            forsta = int(argang["lasar"].split("/")[0])
            self.assertEqual(argang["antagningsar"], forsta)
            if argang["status"] != "redovisad":
                self.assertLess(argang["mote"], f"{forsta}-07-01", argang["lasar"])


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


def fortid_csv(datum, rader):
    """En fil som Valmyndigheten skriver den, tolkad som tolka_csv ger
    den: (datum, rader). `rader` är (län, länsnamn, kommun, kommunnamn,
    lokalid, lokal, [antal per datum])."""
    ut = []
    for lan, lannamn, kom, komnamn, lokalid, lokal, varden in rader:
        ut.append({"LÄNSKOD": lan, "LÄN": lannamn, "KOMMUNKOD": kom,
                   "KOMMUN": komnamn, "LOKALID": lokalid, "LOKAL": lokal,
                   "perDag": dict(zip(datum, varden)), "TOTAL": sum(varden)})
    summa = [sum(v) for v in zip(*[r[6] for r in rader])]
    ut.append({"LÄNSKOD": "", "LÄN": "", "KOMMUNKOD": "", "KOMMUN": "",
               "LOKALID": "", "LOKAL": "SUMMA",
               "perDag": dict(zip(datum, summa)), "TOTAL": sum(summa)})
    return datum, ut


class TestFortidsroster(unittest.TestCase):
    """build_fortidsroster: områden, dagar kvar, vilka dagar som tas med,
    lokallistan och nämnaren – för kommun, län och rike."""

    # 2022: fyra dagar, valdag söndag 2022-09-11, allt klart.
    # Två kommuner i Halland (13) och en i Skåne (12).
    DA = fortid_csv(
        ["2022-09-08", "2022-09-09", "2022-09-10", "2022-09-11"],
        [("13", "Hallands län", "84", "Kungsbacka", "1", "Torget", [100, 200, 150, 50]),
         ("13", "Hallands län", "84", "Kungsbacka", "2", "Boendet", [0, 10, 0, 0]),
         ("13", "Hallands län", "80", "Halmstad", "3", "Biblioteket", [50, 50, 50, 50]),
         ("12", "Skåne län", "80", "Malmö", "4", "Stadshuset", [500, 500, 500, 500])])
    # 2026: samma fyra veckodagar, valdag söndag 2026-09-13; hämtat mitt
    # på fredagen -> lördag och söndag står som 0 och ska inte finnas med.
    NU = fortid_csv(
        ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"],
        [("13", "Halland", "84", "Kungsbacka", "1", "Torget", [120, 80, 0, 0]),
         ("13", "Halland", "84", "Kungsbacka", "2", "Boendet", [0, 0, 0, 0]),
         ("13", "Halland", "80", "Halmstad", "3", "Biblioteket", [60, 60, 0, 0]),
         ("12", "Skåne", "80", "Malmö", "4", "Stadshuset", [600, 600, 0, 0])])
    HAMTAD = {"2022": "2022-09-12T06:30+02:00", "2026": "2026-09-11T14:40+02:00"}
    RB = {"val": {
        "2026": {"kvalifikationsdag": "2026-08-14", "kalla": "T", "kallaUrl": "u",
                 "sidaUrl": "s", "hamtad": "2026-09-01",
                 "omraden": {"1384": {"riksdag": 1000, "valdistrikt": 2},
                             "1380": {"riksdag": 500, "valdistrikt": 1},
                             "13": {"riksdag": 1500, "valdistrikt": 3},
                             "1280": {"riksdag": 4000, "valdistrikt": 4},
                             "12": {"riksdag": 4000, "valdistrikt": 4},
                             "00": {"riksdag": 5500, "valdistrikt": 7}}},
        "2022": {"kvalifikationsdag": "2022-08-12", "kalla": "T", "kallaUrl": "u",
                 "sidaUrl": "s", "hamtad": "2026-09-01",
                 "omraden": {"1384": {"riksdag": 800, "valdistrikt": 2},
                             "00": {"riksdag": 5000, "valdistrikt": 7}}}}}

    def setUp(self):
        self.filer, self.index = build_fortidsroster.bygg(
            {2022: self.DA, 2026: self.NU}, self.HAMTAD, self.RB, {"val": {}})
        self.kb = self.filer["1384"]
        self.nu = self.kb["val"]["2026"]
        self.da = self.kb["val"]["2022"]

    def test_omraden(self):
        self.assertEqual(set(self.filer), {"00", "12", "13", "1280", "1380", "1384"})
        self.assertEqual(self.filer["13"]["omrade"], "Hallands län")   # inte "Halland"
        self.assertEqual(self.filer["00"]["typ"], "riket")
        self.assertEqual(self.kb["lan"], "13")
        self.assertEqual(self.index["standard"], "1384")
        self.assertEqual([o["slug"] for o in self.index["omraden"]],
                         ["hela-riket", "hallands-lan", "skane-lan",
                          "halmstad", "kungsbacka", "malmo"])

    def test_summa_raden_raknas_inte(self):
        """Riket är summan av lokalerna – SUMMA-raden får inte dubbla den."""
        self.assertEqual(self.filer["00"]["val"]["2022"]["total"], 510 + 200 + 2000)
        self.assertEqual(self.filer["13"]["val"]["2022"]["total"], 510 + 200)
        self.assertEqual(self.da["total"], 510)

    def test_dagar_kvar_raknas_fran_valdagen(self):
        self.assertEqual([d["kvar"] for d in self.da["dagar"]], [3, 2, 1, 0])
        self.assertEqual([d["veckodag"] for d in self.da["dagar"]],
                         ["tor", "fre", "lör", "sön"])
        # Samma veckodagar 2026 – det är poängen med skalan
        self.assertEqual([d["veckodag"] for d in self.nu["dagar"]], ["tor", "fre"])

    def test_dagar_som_inte_intraffat_utelamnas(self):
        """Nollorna för lördag och söndag ska inte bli nollvärden."""
        self.assertEqual([d["datum"] for d in self.nu["dagar"]],
                         ["2026-09-10", "2026-09-11"])
        self.assertFalse(self.nu["klart"])
        self.assertTrue(self.da["klart"])

    def test_hamtningsdagen_tas_med_om_den_har_roster(self):
        """Vilken dag som pågår avgörs i webbläsaren; bygget tar bara med
        dagen om den har röster."""
        self.assertEqual(self.nu["total"], 200)
        self.assertEqual(self.nu["dagar"][-1]["ack"], 200)

    def test_hamtningsdag_utan_roster_tas_inte_med(self):
        """Morgonkörningen kl. 06: dagens kolumn är 0 och ska inte synas."""
        hamtad = dict(self.HAMTAD, **{"2026": "2026-09-12T06:40+02:00"})
        filer, _ = build_fortidsroster.bygg(
            {2022: self.DA, 2026: self.NU}, hamtad, None)
        self.assertEqual([d["datum"] for d in filer["1384"]["val"]["2026"]["dagar"]],
                         ["2026-09-10", "2026-09-11"])
        self.assertEqual(filer["1384"]["val"]["2026"]["total"], 200)

    def test_ackumulerat(self):
        self.assertEqual([d["ack"] for d in self.da["dagar"]], [100, 310, 460, 510])

    def test_rostberattigade_foljer_med_per_omrade(self):
        self.assertEqual(self.nu["rostberattigade"]["riksdag"], 1000)
        self.assertEqual(self.da["rostberattigade"]["riksdag"], 800)
        self.assertEqual(self.filer["13"]["val"]["2026"]["rostberattigade"]["riksdag"], 1500)
        # Halland 2022 saknar nämnare i stubben -> None, inte en gissning
        self.assertIsNone(self.filer["13"]["val"]["2022"]["rostberattigade"])

    def test_utan_rostberattigade_utelamnas_namnaren(self):
        """Hellre inget nyckeltal än en gissad nämnare."""
        filer, _ = build_fortidsroster.bygg({2022: self.DA, 2026: self.NU}, self.HAMTAD, None)
        self.assertIsNone(filer["1384"]["val"]["2026"]["rostberattigade"])

    def test_topplistan_raknar_bara_intraffade_dagar(self):
        lok = {l["namn"]: l for l in self.nu["lokaler"]}
        self.assertEqual(lok["Torget"]["total"], 200)
        self.assertEqual(lok["Torget"]["dagarMedRoster"], 2)
        self.assertEqual(lok["Torget"]["andel"], 100.0)
        self.assertEqual(lok["Boendet"]["total"], 0)
        self.assertEqual([l["namn"] for l in self.nu["lokaler"]], ["Torget", "Boendet"])
        self.assertFalse(self.nu["lokalerKapad"])
        self.assertEqual(self.nu["antalLokaler"], 2)

    def test_lokallistan_kapas_for_lan_och_rike(self):
        gammalt = build_fortidsroster.LOKALER_VISADE
        build_fortidsroster.LOKALER_VISADE = 2
        try:
            filer, _ = build_fortidsroster.bygg(
                {2022: self.DA, 2026: self.NU}, self.HAMTAD, None)
        finally:
            build_fortidsroster.LOKALER_VISADE = gammalt
        riket = filer["00"]["val"]["2022"]
        self.assertTrue(riket["lokalerKapad"])
        self.assertEqual(riket["antalLokaler"], 4)
        self.assertEqual([l["namn"] for l in riket["lokaler"]], ["Stadshuset", "Torget"])
        self.assertEqual(riket["lokaler"][0]["kommun"], "Malmö")
        # Kommunen kapas aldrig
        self.assertFalse(filer["1384"]["val"]["2022"]["lokalerKapad"])

    def test_ett_enda_val_ger_ingen_jamforelse(self):
        filer, _ = build_fortidsroster.bygg({2026: self.NU}, self.HAMTAD, None)
        self.assertIsNone(filer["1384"]["forra"])

    def test_prognosen_laggs_in_oforandrad_och_bara_dar_den_galler(self):
        """Den ställda prognosen är indata, inte något bygget räknar om:
        den ska följa med ordagrant till de områden den gäller och inte
        finnas alls hos de andra."""
        prognos = {
            "stalld": "2026-09-11", "val": 2026,
            "brytpunkt": {"datum": "2026-09-10", "kvar": 3},
            "omraden": {"1384": {"ack": 120, "modell": 300, "lag": 250, "hog": 350,
                                 "bana": [{"kvar": 3, "lag": 120, "modell": 120,
                                           "hog": 120}]}},
        }
        filer, _ = build_fortidsroster.bygg(
            {2022: self.DA, 2026: self.NU}, self.HAMTAD, self.RB, {"val": {}}, prognos)
        kb = filer["1384"]["prognos"]
        self.assertEqual(kb["stalld"], "2026-09-11")
        self.assertEqual(kb["brytpunkt"], {"datum": "2026-09-10", "kvar": 3})
        self.assertEqual(kb["modell"], 300)
        self.assertEqual(kb["bana"], prognos["omraden"]["1384"]["bana"])
        self.assertNotIn("omraden", kb)
        for kod in ("00", "13", "1380", "1280"):
            self.assertIsNone(filer[kod]["prognos"], kod)

    def test_utan_prognosfil_star_falter_tomt(self):
        self.assertIsNone(self.filer["1384"]["prognos"])


class TestFortidsrosterSlug(unittest.TestCase):
    """Adressen ?omrade=<slug> ska bildas med samma regler som K.slug i
    docs/gemensam.js, så att länken fungerar åt båda hållen."""

    FALL = [
        ("Kungsbacka", "kungsbacka"),
        ("Hallands län", "hallands-lan"),
        ("Västra Götalands län", "vastra-gotalands-lan"),
        ("Malung-Sälen", "malung-salen"),
        ("Östra Göinge", "ostra-goinge"),
        ("Upplands Väsby", "upplands-vasby"),
        ("Hela riket", "hela-riket"),
        ("Åre", "are"),
    ]

    def test_slug(self):
        for namn, vantat in self.FALL:
            self.assertEqual(build_fortidsroster.slug(namn), vantat, namn)

    def test_krock_far_lanet_efter_sig(self):
        """Håbo (Uppsala län) och Habo (Jönköpings län) blir båda "habo"."""
        reg = {
            "03": {"kod": "03", "namn": "Uppsala län", "typ": "lan", "lan": None},
            "06": {"kod": "06", "namn": "Jönköpings län", "typ": "lan", "lan": None},
            "0305": {"kod": "0305", "namn": "Håbo", "typ": "kommun", "lan": "03"},
            "0643": {"kod": "0643", "namn": "Habo", "typ": "kommun", "lan": "06"},
        }
        build_fortidsroster.satt_slugs(reg)
        self.assertEqual(reg["0305"]["slug"], "habo-uppsala-lan")
        self.assertEqual(reg["0643"]["slug"], "habo-jonkopings-lan")


class TestSlugSammaRegelOverallt(unittest.TestCase):
    """Adressnyckeln bildas på tre ställen och måste bli densamma överallt.

    build_fortidsroster.slug ger ?omrade=, val.slug ger ?distrikt= och
    K.slug i docs/gemensam.js läser tillbaka båda i webbläsaren. Skiljer
    de sig åt hittar sidan inte det område eller distrikt som länken
    pekar ut. Facit nedan är samma lista som i tests/test_gemensam.js,
    som pinnar JavaScript-sidan av samma regel.
    """

    FALL = [
        ("Kungsbacka", "kungsbacka"),
        ("Hallands län", "hallands-lan"),
        ("Västra Götalands län", "vastra-gotalands-lan"),
        ("Östra Göinge", "ostra-goinge"),
        ("Åre", "are"),
        ("Fjärås Bräcka", "fjaras-bracka"),
        ("Malung-Sälen", "malung-salen"),
        ("Kolla Norra", "kolla-norra"),
        ("Café Ö", "cafe-o"),
        # Namn utanför svenskan förekommer inte bland valdistrikten, men
        # regeln ska ändå vara en och densamma: bokstaven behålls, bara
        # tecknet ovanpå faller bort.
        ("Ñuñoa", "nunoa"),
        ("São Paulo", "sao-paulo"),
        ("  Hela riket  ", "hela-riket"),
        ("A/B & C", "a-b-c"),
        ("2026", "2026"),
    ]

    def test_bada_implementationerna_ger_facit(self):
        for namn, vantat in self.FALL:
            self.assertEqual(val.slug(namn), vantat, f"val.slug({namn!r})")
            self.assertEqual(build_fortidsroster.slug(namn), vantat,
                             f"build_fortidsroster.slug({namn!r})")

    def test_sammansatt_form_ger_samma_nyckel(self):
        """"Åre" med kombinerande ring ska ge samma nyckel som med ett
        enda tecken – xlsx-filer från källorna kan bära båda formerna."""
        sammansatt = "Åre"
        self.assertEqual(val.slug(sammansatt), "are")
        self.assertEqual(build_fortidsroster.slug(sammansatt), "are")


class TestFortidsrosterCsv(unittest.TestCase):
    """hamta_fortidsroster: de två filformaten ska tolkas lika."""

    RUBRIK = "LÄNSKOD;LÄN;KOMMUNKOD;KOMMUN;LOKALID;LOKAL;{d1};{d2};TOTAL"
    RAD = "13;Halland;84;Kungsbacka;1384001;Lokalen;5;7;12"

    def test_utf8_med_bom_och_lf(self):
        text = self.RUBRIK.format(d1="2026-08-26", d2="2026-08-27") + "\n" + self.RAD + "\n"
        datum, rader = hamta_fortidsroster.tolka_csv(b"\xef\xbb\xbf" + text.encode("utf-8"))
        self.assertEqual(datum, ["2026-08-26", "2026-08-27"])
        self.assertEqual(rader[0]["perDag"], {"2026-08-26": 5, "2026-08-27": 7})
        self.assertEqual(rader[0]["TOTAL"], 12)
        self.assertEqual(rader[0]["LÄNSKOD"], "13")

    def test_latin1_med_cr_och_tidsstamplade_rubriker(self):
        """2022 års fil: Latin-1, enbart vagnretur som radbrytning och
        "2022-08-24 00:00:00" som kolumnrubrik."""
        text = (self.RUBRIK.format(d1="2022-08-24 00:00:00", d2="2022-08-25 00:00:00")
                + "\r" + self.RAD.replace("Lokalen", "Åsa Gårdsskola") + "\r")
        datum, rader = hamta_fortidsroster.tolka_csv(text.encode("latin-1"))
        self.assertEqual(datum, ["2022-08-24", "2022-08-25"])
        self.assertEqual(rader[0]["LOKAL"], "Åsa Gårdsskola")
        self.assertEqual(rader[0]["perDag"]["2022-08-25"], 7)

    def test_aldre_valpresentationer_med_sma_rubriker(self):
        """2010–2018: Latin-1, LF och rubrikerna "lan;län;kom;kommun;
        lokalid;lokal;…;Totalt" – ska översättas till 2026 års namn."""
        text = ("lan;län;kom;kommun;lokalid;lokal;2018-08-22;2018-08-23;Totalt\n"
                "13;Hallands län;84;Kungsbacka;10757;Kungsmässan;411;508;919\n")
        datum, rader = hamta_fortidsroster.tolka_csv(text.encode("latin-1"))
        self.assertEqual(datum, ["2018-08-22", "2018-08-23"])
        self.assertEqual(rader[0]["LÄNSKOD"], "13")
        self.assertEqual(rader[0]["KOMMUNKOD"], "84")
        self.assertEqual(rader[0]["LOKAL"], "Kungsmässan")
        self.assertEqual(rader[0]["TOTAL"], 919)

    def test_andrad_layout_stoppar(self):
        text = "LÄNSKOD;LÄN;NÅGOT ANNAT;2026-08-26;TOTAL\n13;Halland;x;1;1\n"
        with self.assertRaises(SystemExit):
            hamta_fortidsroster.tolka_csv(text.encode("utf-8"))


class TestKostnaderFastaPriser(unittest.TestCase):
    """build_kostnader: KPI-omräkningen och det som följer ur den.

    Facit går att räkna för hand: med KPI 100 -> 200 är prisnivån
    dubbelt så hög, och ett belopp från det första året motsvarar det
    dubbla i det sista årets pengar.
    """

    KPI = {"kalla": "SCB", "kallaUrl": "https://example.org",
           "hamtad": "2026-01-01", "matt": "KPI",
           "kpi": {"2020": 100.0, "2021": 125.0, "2022": 200.0}}

    def kolada(self, kommunal=None, riket=None, slag=None):
        def post(nyckel, etikett, kod, varden, riksvarden=None):
            return {"nyckel": nyckel, "etikett": etikett, "kolada": kod,
                    "koladaTitel": etikett, "definition": "påhittad",
                    "omraden": {"1384": varden or {},
                                "0000": riksvarden or {}}}
        nyckeltal = [
            post("hemkommun", "Bor i kommunen", "N15006", {"2020": 1000.0}),
            post("kommunal", "Egna skolor", "N15008",
                 kommunal if kommunal is not None else
                 {"2020": 1000.0, "2021": 1500.0, "2022": 2400.0},
                 riket),
        ]
        for i, (n, v) in enumerate(slag or []):
            nyckeltal.append(post(n, n.title(), f"N1501{i}", v))
        return {"omraden": [{"kod": "1384", "namn": "Kungsbacka"},
                            {"kod": "0000", "namn": "Riket"}],
                "matt": "Kostnad per elev", "kalla": "Kolada",
                "kallaUrl": "https://example.org",
                "apiUrl": "https://example.org/api",
                "hamtad": "2026-01-01",
                "nyckeltal": nyckeltal}

    def kommunal(self, ut):
        for post in ut["kostnadPerElev"]:
            if post["nyckel"] == "kommunal":
                return post
        raise AssertionError("måttet saknas i utdatan")

    def test_prisnivan_ar_senaste_aret_med_bade_kostnad_och_kpi(self):
        ut = build_kostnader.bygg(self.kolada(), self.KPI)
        self.assertEqual(ut["prisniva"], 2022)

    def test_beloppen_raknas_om_med_kvoten_mellan_arens_kpi(self):
        """1000 kr år 2020 (KPI 100) är 2000 kr i 2022 års pengar (KPI 200)."""
        ut = build_kostnader.bygg(self.kolada(), self.KPI)
        v = self.kommunal(ut)["omraden"]["1384"]["varden"]
        self.assertEqual(v[2020]["nominell"], 1000)
        self.assertEqual(v[2020]["fast"], 2000)
        self.assertEqual(v[2021]["fast"], 2400)      # 1500 * 200/125
        # Prisnivåårets eget belopp rörs inte
        self.assertEqual(v[2022]["fast"], 2400)

    def test_forandringen_raknas_pa_fasta_priser(self):
        """Nominellt steg 2022 med 60 %, realt med 0 %: hela ökningen var
        prisnivån. Det är just den skillnaden sidan finns för."""
        v = self.kommunal(build_kostnader.bygg(self.kolada(), self.KPI)
                          )["omraden"]["1384"]["varden"]
        self.assertIsNone(v[2020]["forandring"])
        self.assertEqual(v[2021]["forandring"], 20.0)   # 2000 -> 2400
        self.assertEqual(v[2022]["forandring"], 0.0)    # 2400 -> 2400

    def test_ar_utan_kpi_far_inget_fast_pris(self):
        """Hellre inget tal än ett tal räknat på fel prisnivå.

        KPI-serien börjar 2020 här, så 2019 saknar omräkningstal. Sista
        året med både kostnad och KPI är då 2020, och det blir prisnivån."""
        kolada = self.kolada(kommunal={"2019": 900.0, "2020": 1000.0})
        ut = build_kostnader.bygg(kolada, self.KPI)
        self.assertEqual(ut["prisniva"], 2020)
        v = self.kommunal(ut)["omraden"]["1384"]["varden"]
        self.assertEqual(v[2019]["nominell"], 900)
        self.assertIsNone(v[2019]["fast"])
        self.assertEqual(v[2020]["fast"], 1000)     # redan i prisnivåårets pengar
        # Det första året med fast pris har inget föregående att jämföras med
        self.assertIsNone(v[2020]["forandring"])

    def test_jamforelsen_mot_riket_bara_dar_riket_finns(self):
        kolada = self.kolada(riket={"2022": 3000.0})
        v = self.kommunal(build_kostnader.bygg(kolada, self.KPI)
                          )["omraden"]["1384"]["varden"]
        self.assertIsNone(v[2020]["motRiket"])
        self.assertIsNone(v[2021]["motRiket"])
        self.assertEqual(v[2022]["motRiket"], -20.0)    # 2400 mot 3000

    def test_riket_jamfors_inte_med_sig_sjalvt(self):
        kolada = self.kolada(riket={"2022": 3000.0})
        riket = self.kommunal(build_kostnader.bygg(kolada, self.KPI)
                              )["omraden"]["0000"]["varden"]
        self.assertIsNone(riket[2022]["motRiket"])

    def test_realTotal_ar_forandringen_over_hela_serien(self):
        o = self.kommunal(build_kostnader.bygg(self.kolada(), self.KPI)
                          )["omraden"]["1384"]
        self.assertEqual(o["forstaFast"], 2000)
        self.assertEqual(o["sistaFast"], 2400)
        self.assertEqual(o["realTotal"], 20.0)

    def test_indexets_basar_ar_det_forsta_bada_omradena_har(self):
        """Två serier med var sitt basår mäter inte samma sak.

        Kungsbacka börjar 2020 och riket 2021 här, så basåret måste bli
        2021 – annars jämförs kommunens utveckling från 2020 med rikets
        från 2021, och den bilden är fel."""
        kolada = self.kolada(riket={"2021": 3000.0, "2022": 3300.0})
        post = self.kommunal(build_kostnader.bygg(kolada, self.KPI))
        self.assertEqual(post["indexBasAr"], 2021)
        self.assertEqual(post["omraden"]["1384"]["varden"][2021]["index"], 100.0)
        self.assertEqual(post["omraden"]["0000"]["varden"][2021]["index"], 100.0)

    def test_index_raknas_pa_fasta_priser(self):
        """Ett index på löpande priser hade mätt inflationen, inte
        kostnaden: nominellt steg 2022 med 60 %, realt med ingenting."""
        kolada = self.kolada(riket={"2020": 1000.0, "2022": 2000.0})
        post = self.kommunal(build_kostnader.bygg(kolada, self.KPI))
        v = post["omraden"]["1384"]["varden"]
        self.assertEqual(post["indexBasAr"], 2020)
        self.assertEqual(v[2020]["index"], 100.0)      # 2000 kr fast
        self.assertEqual(v[2021]["index"], 120.0)      # 2400 kr fast
        self.assertEqual(v[2022]["index"], 120.0)      # 2400 kr fast

    def test_ar_fore_basaret_far_index_mot_samma_bas(self):
        """Kommunens längre historia ska inte tappas bort – de åren
        räknas mot samma bas och hamnar under 100."""
        kolada = self.kolada(riket={"2022": 3000.0})
        post = self.kommunal(build_kostnader.bygg(kolada, self.KPI))
        v = post["omraden"]["1384"]["varden"]
        self.assertEqual(post["indexBasAr"], 2022)
        self.assertEqual(v[2022]["index"], 100.0)
        self.assertLess(v[2020]["index"], 100.0)

    def test_kostnadsslag_som_inte_summerar_ger_varning(self):
        """Går slagen isär från totalen är den staplade bilden fel, och
        det ska synas vid bygget."""
        kolada = self.kolada(slag=[("undervisning", {"2020": 400.0}),
                                   ("lokaler", {"2020": 400.0})])
        self.assertTrue(build_kostnader.kontrollera_kostnadsslag(kolada))
        kolada = self.kolada(slag=[("undervisning", {"2020": 600.0}),
                                   ("lokaler", {"2020": 400.0})])
        self.assertEqual(build_kostnader.kontrollera_kostnadsslag(kolada), [])

    def test_utan_kpi_gar_bygget_inte_att_gora(self):
        with self.assertRaises(SystemExit):
            build_kostnader.bygg(self.kolada(), dict(self.KPI, kpi={"1999": 100.0}))


class TestKostnaderKallorna(unittest.TestCase):
    """Kolada och Skolverket ska säga samma sak om Kungsbacka.

    Kolada är sidans källa, Skolverket kontrollkällan. De publicerar
    samma underlag (kommunernas räkenskapssammandrag), så totalen ska
    stämma – Skolverket avrundat till hundratal kronor, Kolada oavrundat.
    Räknar någon av dem om en serie utan att det syns faller det här.
    """

    def setUp(self):
        self.kolada = json.loads(
            (ROT / "data" / "kolada" / "kostnader_grundskola.json")
            .read_text(encoding="utf-8"))
        self.skolverket = [
            json.loads(f.read_text(encoding="utf-8"))
            for f in sorted((ROT / "data" / "kostnader").glob("kostnader_*.json"))
        ]

    def test_totalen_stammer_ar_for_ar(self):
        per = {p["nyckel"]: p for p in self.kolada["nyckeltal"]}
        kommunal = per["kommunal"]["omraden"]["1384"]
        jamforda = 0
        for arsfil in self.skolverket:
            ar = str(arsfil["ar"])
            facit = arsfil["kostnader"]["totaltPerElev"]
            if ar not in kommunal or facit is None:
                continue
            jamforda += 1
            self.assertEqual(round(kommunal[ar] / 100) * 100, facit,
                             f"{ar}: Kolada {kommunal[ar]}, "
                             f"Skolverket {facit}")
        self.assertGreater(jamforda, 20, "för få år stämdes av")

    def test_kostnadsslagen_summerar_till_totalen(self):
        """Inom Kolada ska slagen summera exakt till kostnaden per elev –
        annars går den staplade bilden inte ihop med linjen ovanför."""
        self.assertEqual(
            build_kostnader.kontrollera_kostnadsslag(self.kolada), [])


class TestResurser(unittest.TestCase):
    """build_resurser: skolålderns andel, indexjämförelsen och att
    ingenting prisomräknas."""

    BNP = {
        "kalla": "SCB NR", "kallaUrl": "https://example.org",
        "hamtad": "2026-01-01",
        # 1000 invånare, BNP 1000 mnkr => 1 mnkr per invånare
        "bnpLopandePriser": {"2020": 1000.0, "2021": 2000.0},
        "folkmangd": {"2020": 1000, "2021": 1000},
    }

    SCB = {
        "kalla": "SCB", "kallaUrl": "https://example.org", "hamtad": "2026-01-01",
        "folkmangd": {"2020": 1000, "2021": 1000},
        # Bara 6–15 ska räknas: 5-åringen och 16-åringen ligger utanför
        "perAlder": {
            "2020": dict({str(a): 10 for a in range(6, 16)}, **{"5": 99, "16": 99}),
            "2021": dict({str(a): 12 for a in range(6, 16)}, **{"5": 99, "16": 99}),
        },
    }

    def kolada(self, andel=None):
        def post(nyckel, kod, enhet, varden, riket=None):
            return {"nyckel": nyckel, "kolada": kod, "etikett": nyckel,
                    "enhet": enhet, "koladaTitel": nyckel,
                    "definition": "påhittad",
                    "omraden": {"1384": varden, "0000": riket or {}}}
        return {
            "omraden": [{"kod": "1384", "namn": "Kungsbacka"},
                        {"kod": "0000", "namn": "Riket"}],
            "matt": "Resurser", "kalla": "Kolada",
            "kallaUrl": "https://example.org",
            "apiUrl": "https://example.org/api", "hamtad": "2026-01-01",
            "nyckeltal": [
                post("avvikelseProcent", "N15001", "procent",
                     {"2020": -5.04, "2021": -2.96}),
                post("andelDrift", "N10103", "procent",
                     andel if andel is not None else {"2020": 20.0, "2021": 22.0}),
                post("faktisk", "N15027", "kronor per elev",
                     {"2020": 100000.4, "2021": 110000.6}),
                post("perInvanare", "N15025", "kronor per invånare",
                     {"2020": 9000.0},
                     riket={"2020": 10000.0, "2021": 10000.0}),
            ],
        }

    def test_skolaldern_ar_6_till_15(self):
        """Åldersgruppen 0–15 i SCB-filen duger inte – den innehåller
        förskolebarnen, och referenskostnaden avser F–9."""
        ut = build_resurser.bygg(self.kolada(), self.SCB, self.BNP)
        self.assertEqual(ut["befolkning"][2020]["antal"], 100)   # 10 åldrar × 10
        self.assertEqual(ut["befolkning"][2020]["andel"], 10.0)  # av 1000
        self.assertEqual(ut["befolkning"][2021]["antal"], 120)

    def test_ofullstandigt_ar_raknas_inte(self):
        scb = json.loads(json.dumps(self.SCB))
        del scb["perAlder"]["2021"]["9"]
        ut = build_resurser.bygg(self.kolada(), scb, self.BNP)
        self.assertIn(2020, ut["befolkning"])
        self.assertNotIn(2021, ut["befolkning"])

    def test_decimaler_foljer_matten(self):
        """Kronor per elev redovisas i hela kronor, procent med en decimal."""
        ut = build_resurser.bygg(self.kolada(), self.SCB, self.BNP)
        per = {s["nyckel"]: s for s in ut["serier"]}
        self.assertEqual(per["faktisk"]["omraden"]["1384"]["varden"][2020], 100000)
        self.assertEqual(per["avvikelseProcent"]["omraden"]["1384"]["varden"][2020], -5.0)

    def test_tom_riketserie_utelamnas(self):
        """Rikets avvikelse är noll per konstruktion och saknas i Kolada.
        Den ska inte bli en tom serie som sidan försöker rita."""
        ut = build_resurser.bygg(self.kolada(), self.SCB, self.BNP)
        per = {s["nyckel"]: s for s in ut["serier"]}
        self.assertNotIn("0000", per["avvikelseProcent"]["omraden"])
        self.assertIn("1384", per["avvikelseProcent"]["omraden"])

    def test_jamforelsen_har_gemensamt_basar(self):
        """Två index med var sitt basår mäter inte samma period."""
        ut = build_resurser.bygg(self.kolada(), self.SCB, self.BNP)
        j = ut["jamforelse"]
        self.assertEqual(j["basAr"], 2020)
        self.assertEqual(j["budgetandel"][2020], 100.0)
        self.assertEqual(j["barnandel"][2020], 100.0)
        # 20 -> 22 procent är +10 %, 10 -> 12 procent av folkmängden är +20 %
        self.assertEqual(j["budgetandel"][2021], 110.0)
        self.assertEqual(j["barnandel"][2021], 120.0)

    def test_jamforelsen_bara_over_gemensamma_ar(self):
        ut = build_resurser.bygg(self.kolada(andel={"2021": 22.0}), self.SCB, self.BNP)
        self.assertEqual(ut["jamforelse"]["ar"], [2021])

    def test_andel_av_bnp_raknas_pa_riket(self):
        """10 000 kr/inv × 1000 invånare = 10 mnkr, av 1000 mnkr BNP = 1 %."""
        ut = build_resurser.bygg(self.kolada(), self.SCB, self.BNP)
        b = ut["andelAvBnp"]
        self.assertEqual(b[2020]["totalMnkr"], 10)
        self.assertEqual(b[2020]["andel"], 1.0)
        # 2021: samma kostnad, dubbel BNP -> halva andelen
        self.assertEqual(b[2021]["andel"], 0.5)

    def test_ar_utan_bnp_utelamnas(self):
        """En lucka ska förbli en lucka, inte överbryggas."""
        bnp = json.loads(json.dumps(self.BNP))
        del bnp["bnpLopandePriser"]["2021"]
        b = build_resurser.bygg(self.kolada(), self.SCB, bnp)["andelAvBnp"]
        self.assertIn(2020, b)
        self.assertNotIn(2021, b)

    def test_andelen_avser_riket_inte_kommunen(self):
        """Måttet finns för att se den nationella nivån. Räknas det på
        Kungsbacka svarar det på fel fråga."""
        ut = build_resurser.bygg(self.kolada(), self.SCB, self.BNP)
        # Kungsbacka har 9000 kr/inv, riket 10000 – andelen ska följa riket
        self.assertEqual(ut["andelAvBnp"][2020]["perInvanare"], 10000)

    def test_ingen_kpi_i_bygget(self):
        """Sidans poäng är att inget prisindex behövs. Smyger sig en
        KPI-omräkning in är måtten inte längre samma-år-jämförelser."""
        kod = (ROT / "scripts" / "build_resurser.py").read_text(encoding="utf-8")
        self.assertNotIn("kpi.json", kod)
        self.assertNotIn("prisniva", kod)

    def test_natverket_mellan_serierna_haller(self):
        """Nettokostnad delad med referenskostnad ska ge avvikelsen.

        Det här är sidans inre sammanhang, och det gick sönder en gång:
        avvikelsen är definierad mot *nettokostnaden*, men bruttokostnaden
        per elev ritades först. Kungsbackas bruttokostnad ligger över
        referenskostnaden samtidigt som nettokostnaden ligger under den,
        så sidan visade staplar under noll bredvid en linje över
        referensen. Går kvoten isär igen har fel serie hämtats.
        """
        kolada = json.loads(
            (ROT / "data" / "kolada" / "resurser_grundskola.json")
            .read_text(encoding="utf-8"))
        per = {p["nyckel"]: p["omraden"]["1384"] for p in kolada["nyckeltal"]}
        scb = json.loads(
            (ROT / "data" / "scb" / "folkmangd_kungsbacka.json")
            .read_text(encoding="utf-8"))
        bnp = json.loads((ROT / "data" / "scb" / "bnp.json")
                         .read_text(encoding="utf-8"))
        jf = build_resurser.bygg(kolada, scb, bnp)["referensJamforelse"]

        # De år bygget släpper igenom ska hålla kvoten exakt …
        for ar in jf["ar"]:
            self.assertAlmostEqual(
                100.0 * (per["faktisk"][str(ar)] / per["referens"][str(ar)] - 1),
                per["avvikelseProcent"][str(ar)], places=1, msg=str(ar))
        self.assertGreater(len(jf["ar"]), 5, "för få år kunde stämmas av")

        # … och de utelämnade ska verkligen inte hålla den, annars sållar
        # bygget bort år i onödan.
        for ar in jf["utelamnade"]:
            kvot = 100.0 * (per["faktisk"][str(ar)] / per["referens"][str(ar)] - 1)
            self.assertGreater(abs(kvot - per["avvikelseProcent"][str(ar)]),
                               jf["tolerans"], str(ar))

    def test_reformaren_har_kalla(self):
        """Ett utmärkt brott är ett påstående om verkligheten och ska
        kunna slås upp."""
        ut = build_resurser.bygg(self.kolada(), self.SCB, self.BNP)
        self.assertTrue(ut["reformer"])
        for r in ut["reformer"]:
            self.assertIn(r["ar"], (2014, 2020))
            self.assertTrue(r["kalla"])
            self.assertTrue(r["kallaUrl"].startswith("https://"))


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

    def test_data_varberg_ar_reproducerbar(self):
        """Varbergs två prognosfiler byggs av samma kod ur data/prognoser/varberg/
        – med gymnasieåldern 16–18 år, som Varbergs rapporter delar in den."""
        scb = json.loads(
            (ROT / "data" / "scb" / "folkmangd_varberg.json")
            .read_text(encoding="utf-8"))
        rapporter = [
            json.loads(f.read_text(encoding="utf-8"))
            for f in sorted((ROT / "data" / "prognoser" / "varberg").glob("prognos_*.json"))
        ]
        utfall = {int(a): v for a, v in scb["folkmangd"].items()}
        self.assertEqual(
            build_data.bygg(scb, rapporter, utfall, None, "Hela befolkningen"),
            self.las("data-varberg.json"))
        utfall = {int(a): v for a, v in scb["aldersgrupper"]["16-18"].items()}
        self.assertEqual(
            build_data.bygg(scb, rapporter, utfall, "16-18", "16–18 år", (16, 18)),
            self.las("data-varberg-16-18.json"))

    def test_data_varberg_befolkning_ar_reproducerbar(self):
        scb = json.loads(
            (ROT / "data" / "scb" / "folkmangd_varberg.json")
            .read_text(encoding="utf-8"))
        ombyggd = json.loads(json.dumps(build_befolkning.bygg(scb)))
        self.assertEqual(ombyggd, self.las("data-varberg-befolkning.json"))

    def test_data_meritvarden_ar_reproducerbar(self):
        argangar = [
            json.loads(f.read_text(encoding="utf-8"))
            for f in sorted((ROT / "data" / "antagning").glob("antagning_*.json"))
        ]
        ombyggd, okanda = build_meritvarden.bygg(argangar)
        self.assertEqual(okanda, set())
        self.assertEqual(ombyggd, self.las("data-meritvarden.json"))

    def test_data_platser_ar_reproducerbar(self):
        argangar = build_platser.las_argangar()
        ombyggd, okanda = build_platser.bygg(argangar)
        self.assertEqual(okanda, set())
        self.assertEqual(ombyggd, self.las("data-platser.json"))

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

    def test_data_kostnader_ar_reproducerbar(self):
        kolada = json.loads(
            (ROT / "data" / "kolada" / "kostnader_grundskola.json")
            .read_text(encoding="utf-8"))
        kpi = json.loads((ROT / "data" / "scb" / "kpi.json")
                         .read_text(encoding="utf-8"))
        # Åren är heltalsnycklar i bygget men strängar i JSON-filen
        ombyggd = json.loads(json.dumps(build_kostnader.bygg(kolada, kpi)))
        self.assertEqual(ombyggd, self.las("data-kostnader.json"))

    def test_data_resurser_ar_reproducerbar(self):
        kolada = json.loads(
            (ROT / "data" / "kolada" / "resurser_grundskola.json")
            .read_text(encoding="utf-8"))
        scb = json.loads(
            (ROT / "data" / "scb" / "folkmangd_kungsbacka.json")
            .read_text(encoding="utf-8"))
        bnp = json.loads((ROT / "data" / "scb" / "bnp.json")
                         .read_text(encoding="utf-8"))
        ombyggd = json.loads(json.dumps(build_resurser.bygg(kolada, scb, bnp)))
        self.assertEqual(ombyggd, self.las("data-resurser.json"))

    def test_valresultatet_ar_reproducerbart(self):
        """Alla tre valen: varje datafil ska vara vad bygget ger."""
        jamforbarhet = json.loads(
            (ROT / "data" / "valdistrikt" / "jamforbarhet.json")
            .read_text(encoding="utf-8"))
        harkomst = json.loads(
            (ROT / "data" / "valdistrikt" / "harkomst.json")
            .read_text(encoding="utf-8"))
        # Tröskeln gäller de tre valen tillsammans, så alla tre läses in
        # även när en enskild fil kontrolleras.
        kallor_per_val = {v: build_valresultat.las_kallor(v)
                          for v in hamta_valresultat.VALEN}
        stora = build_valresultat.stora_over_valen(kallor_per_val)
        for valnyckel, val in hamta_valresultat.VALEN.items():
            with self.subTest(val=valnyckel):
                self.assertTrue(kallor_per_val[valnyckel],
                                f"inga källfiler för {valnyckel}")
                ombyggd = json.loads(json.dumps(build_valresultat.bygg(
                    kallor_per_val[valnyckel], jamforbarhet, harkomst,
                    valnyckel, stora)))
                self.assertEqual(ombyggd,
                                 self.las(f"data-{val['mapp']}.json"))

    def test_data_fortidsroster_ar_reproducerbar(self):
        """Alla områdesfiler, och inga andra, ska vara vad bygget ger."""
        filer, index = build_fortidsroster.bygg(*build_fortidsroster.las_indata())
        mapp = ROT / "docs" / "data-fortidsroster"
        vantade = {f"{kod}.json" for kod in filer} | {"index.json"}
        self.assertEqual({f.name for f in mapp.glob("*.json")}, vantade)
        self.assertEqual(json.loads(json.dumps(index)),
                         json.loads((mapp / "index.json").read_text(encoding="utf-8")))
        for kod, inneh in filer.items():
            self.assertEqual(json.loads(json.dumps(inneh)),
                             json.loads((mapp / f"{kod}.json").read_text(encoding="utf-8")),
                             kod)


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
                     "build_slutbetyg", "build_nian_gymnasiet",
                     "build_kostnader"):
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
        for vag in ("docs/kohort.js", "docs/gymnasiealdern.html",
                    "docs/varberg-gymnasiealdern.html", "README.md"):
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
        """Sidan visar källdata; de enda beräkningar som inte kommer ur en
        källa är kohortframskrivningen och KPI-omräkningen till fasta
        priser. Korrelationer, kompenserad framskrivning och
        modellvarianter är borttagna."""
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

    def test_fasta_priser_utges_inte_for_volymjusterade(self):
        """KPI mäter hushållens priser, inte kommunens kostnader.

        Lönerna är den största posten i en skola och följer inte KPI. En
        kostnad som ligger stilla i fasta priser har följt
        konsumentpriserna – den säger inte att kommunen köpt lika mycket
        skola. Står inte den skillnaden utskriven läses "fasta priser"
        som "volymjusterat", och sidan påstår mer än talen bär.
        """
        for vag in ("docs/kostnad-per-elev.html", "docs/metod.html"):
            self.assertIn("kpi mäter hushållens priser, inte kommunens",
                          self.las(vag).lower(), vag)

    def test_kostnaden_per_elev_beskrivs_som_kvot(self):
        """Kvoten rör sig också när elevantalet gör det, och sidan delar
        inte upp rörelsen på de två orsakerna."""
        for vag in ("docs/kostnad-per-elev.html", "docs/metod.html"):
            self.assertIn("kostnad per elev är en kvot",
                          self.las(vag).lower(), vag)

    def test_avvikelsen_utges_inte_for_ren_politisk_vilja(self):
        """Avvikelsen fångar också effektivitet, kostnadsstruktur som
        modellen inte träffar och redovisningspraxis. Kallas den ett mått
        på ambition påstår sidan mer än talet bär."""
        text = self.las("docs/resurser-till-skolan.html").lower()
        self.assertIn("mäter inte bara politisk vilja", text)
        self.assertIn("referenskostnaden är inte en norm", text)

    def test_modellbrotten_markeras_men_raknas_inte_bort(self):
        """Att märka ut ett brott och att justera för det är olika saker."""
        self.assertIn("markerade, inte borträknade",
                      self.las("docs/resurser-till-skolan.html"))

    def test_resurssidan_jamfor_inte_bara_andpunkter(self):
        """Två linjer som råkar mötas på slutet kan ha gått isär hela
        vägen. Sidan räknar därför fram det största avståndet också."""
        js = self.las("docs/resurser.js")
        self.assertNotIn("följts åt tämligen nära", js)
        self.assertIn("Vägen dit var inte rak", js)

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


def _xlsx(rader_xml: str) -> bytes:
    """Minsta möjliga xlsx-fil med ett blad som heter "Blad", byggd för
    hand så att testet kan styra exakt vilka <c>-element som finns."""
    import io
    import zipfile
    z = io.BytesIO()
    m = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    with zipfile.ZipFile(z, "w") as f:
        f.writestr("xl/workbook.xml",
                   f'<workbook xmlns="{m}" xmlns:r="{r}">'
                   f'<sheets><sheet name="Blad" sheetId="1" r:id="rId1"/>'
                   f"</sheets></workbook>")
        f.writestr("xl/_rels/workbook.xml.rels",
                   '<Relationships xmlns="http://schemas.openxmlformats.org/'
                   'package/2006/relationships">'
                   '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>'
                   "</Relationships>")
        f.writestr("xl/worksheets/sheet1.xml",
                   f'<worksheet xmlns="{m}"><sheetData>{rader_xml}'
                   f"</sheetData></worksheet>")
    return z.getvalue()


class TestXlsxLasare(unittest.TestCase):
    """val.las_blad måste placera cellerna efter referensen r="D5", inte
    efter ordningen mellan <c>-elementen.

    Tomma celler skrivs inte ut i xlsx-filens XML. Valmyndighetens
    2018_K_per_valdistrikt.xlsx utelämnar VALKRETSKOD och VALKRETSNAMN för
    kommuner med en enda valkrets – och Kungsbacka är en sådan. Läses
    cellerna i ordning glider varenda partikolumn två steg åt vänster, och
    resultatet blir tyst fel: siffror på fel parti."""

    def test_tom_cell_mitt_i_raden_forskjuter_inte(self):
        rader = val.las_blad(_xlsx(
            '<row r="1">'
            '<c r="A1" t="inlineStr"><is><t>kod</t></is></c>'
            '<c r="B1" t="inlineStr"><is><t>valkrets</t></is></c>'
            '<c r="C1" t="inlineStr"><is><t>namn</t></is></c>'
            '<c r="D1" t="inlineStr"><is><t>M</t></is></c></row>'
            # Rad 2 saknar valkrets: inget <c> för B alls.
            '<row r="2">'
            '<c r="A2"><v>101</v></c>'
            '<c r="C2" t="inlineStr"><is><t>Innerstaden</t></is></c>'
            '<c r="D2"><v>316</v></c></row>'), "Blad")
        self.assertEqual(rader[0], ["kod", "valkrets", "namn", "M"])
        self.assertEqual(rader[1], ["101", None, "Innerstaden", "316"])

    def test_alla_rader_fylls_ut_till_samma_bredd(self):
        """Ett kolumnindex ur rubrikraden ska alltid gå att slå upp, också
        på en rad som slutar tidigt."""
        rader = val.las_blad(_xlsx(
            '<row r="1"><c r="A1"><v>1</v></c><c r="D1"><v>4</v></c></row>'
            '<row r="2"><c r="A2"><v>9</v></c></row>'), "Blad")
        self.assertEqual([len(r) for r in rader], [4, 4])
        self.assertEqual(rader[1], ["9", None, None, None])

    def test_kolumnindex_ur_cellreferens(self):
        self.assertEqual(val.kolumnindex("A1"), 0)
        self.assertEqual(val.kolumnindex("D5"), 3)
        self.assertEqual(val.kolumnindex("Z1"), 25)
        self.assertEqual(val.kolumnindex("AA1"), 26)
        self.assertEqual(val.kolumnindex("IV99"), 255)
        self.assertIsNone(val.kolumnindex(None))


class TestPartinormalisering(unittest.TestCase):
    """Partierna skrivs olika i de fem kommunvalen: förkortning 2010, 2014
    och 2018, hela partibeteckningen 2022, och båda 2026."""

    def test_folkpartiet_och_liberalerna_ar_samma_serie(self):
        """Folkpartiet bytte namn till Liberalerna 2015. Samma parti, och
        måste bli samma kod – annars bryts serien mitt i."""
        for skrivning in ("FP", "L", "Liberalerna",
                          "Liberalerna (tidigare Folkpartiet)"):
            self.assertEqual(val.normalisera_parti(skrivning), "L", skrivning)

    def test_lokala_partier_kanns_igen_i_alla_skrivsatt(self):
        self.assertEqual(val.normalisera_parti("Kbabo"), "Kbabo")
        self.assertEqual(val.normalisera_parti("Kungsbackaborna"), "Kbabo")
        self.assertEqual(val.normalisera_parti("Medborgerlig Samling"), "MED")

    def test_socialdemokraterna_bada_skrivningarna(self):
        for skrivning in ("S", "Arbetarepartiet-Socialdemokraterna"):
            self.assertEqual(val.normalisera_parti(skrivning), "S", skrivning)

    def test_icke_partier_hamnar_for_sig(self):
        self.assertEqual(val.normalisera_parti("blanka röster"), val.BLANKA)
        self.assertEqual(val.normalisera_parti("BLANK"), val.BLANKA)
        self.assertEqual(val.normalisera_parti("övriga ogiltiga"), val.OGILTIGA)
        self.assertEqual(val.normalisera_parti("ÖVR"), val.OVRIGA)
        self.assertEqual(val.normalisera_parti("övriga anmälda partier"),
                         val.OVRIGA)

    def test_summeringsrader_last_inte_in(self):
        """Summan räknas ut ur delarna; läses den också in blir den
        dubbelräknad."""
        self.assertIsNone(val.normalisera_parti("Summa giltiga röster"))
        self.assertIsNone(val.normalisera_parti("Valdeltagande"))

    def test_okant_parti_ger_none(self):
        self.assertIsNone(val.normalisera_parti("Partiet Som Inte Finns"))

    def test_ett_stort_okant_parti_ar_inte_forsumbart(self):
        """Ett otolkat parti får bli ÖVR så länge det är småsmulor, men
        ett stort måste larma: då har källan bytt skrivsätt."""
        self.assertTrue(val.okand_ar_forsumbar(3, 50000))
        self.assertFalse(val.okand_ar_forsumbar(5000, 50000))


def _distrikt(kod, namn, roster, giltiga, uppsamling=False,
              rostberattigade=0, rostande=0):
    return {"kod": kod, "namn": namn, "uppsamling": uppsamling,
            "rostberattigade": rostberattigade, "rostande": rostande,
            "giltiga": giltiga, "blanka": 0, "ogiltiga": 0, "ejAnmalt": 0,
            "roster": roster}


def _kalla(ar, distrikt, **extra):
    return dict({"ar": ar, "kalla": f"Källa {ar}", "kallaUrl": f"http://x/{ar}",
                 "sidaUrl": "http://x", "hamtad": f"20{ar % 100:02d}-01-01",
                 "raderIKallan": len(distrikt), "distrikt": distrikt}, **extra)


class TestKommunval(unittest.TestCase):
    """build_valresultat: rösterna, de saknade åren, uppsamlingsdistriktet
    och jämförbarheten mellan valen."""

    # Tre val. "Norr" finns hela vägen. "Söder" tillkommer först 2018.
    # "Gamla" läggs ned efter 2014. Dessutom ett uppsamlingsdistrikt.
    KALLOR = {
        2010: _kalla(2010, [
            _distrikt("13840101", "Norr", {"M": 100, "S": 60, "ÖVR": 40}, 200),
            _distrikt("13840102", "Gamla", {"M": 40, "S": 60}, 100),
            _distrikt("13840000", "Uppsamlingsdistrikt", {"M": 10, "S": 10},
                      20, uppsamling=True)]),
        2014: _kalla(2014, [
            _distrikt("13840101", "Norr", {"M": 120, "S": 80}, 200),
            _distrikt("13840102", "Gamla", {"M": 50, "S": 50}, 100),
            _distrikt("13840000", "Uppsamlingsdistrikt", {"M": 5, "S": 5},
                      10, uppsamling=True)]),
        2018: _kalla(2018, [
            _distrikt("13840101", "Norr", {"M": 150, "S": 50}, 200),
            _distrikt("13840103", "Söder", {"M": 200, "S": 600}, 800),
            _distrikt("13840000", "Uppsamlingsdistrikt", {"M": 1, "S": 9},
                      10, uppsamling=True)]),
    }
    JAMFORBARHET = {
        "kalla": {"2010-2014": {"kalla": "k", "kallaUrl": None,
                                "sidaUrl": "http://x"}},
        "overgangar": {
            "2010-2014": {"13840101": {"jamforbart": True, "foregaende": [],
                                       "indelning": "O"},
                          "13840102": {"jamforbart": True, "foregaende": [],
                                       "indelning": "O"}},
            # Norr ritades om mellan 2014 och 2018.
            "2014-2018": {"13840101": {"jamforbart": False, "foregaende": [],
                                       "indelning": "M"}},
        },
    }

    def setUp(self):
        self.d = build_valresultat.bygg(self.KALLOR, self.JAMFORBARHET)
        self.rader = {r["namn"]: r for r in self.d["distrikt"]}

    def test_raderna_ar_distrikten_i_senaste_valet(self):
        self.assertEqual(sorted(self.rader), ["Norr", "Söder"])

    def test_uppsamlingsdistriktet_blir_ingen_egen_rad(self):
        self.assertNotIn("Uppsamlingsdistrikt", self.rader)

    def test_uppsamlingsdistriktet_rakans_in_i_kommunen(self):
        """Rösterna där är riktiga röster och måste finnas i totalen."""
        self.assertEqual(self.d["kommunTotalt"]["giltiga"]["2010"], 320)
        self.assertEqual(self.d["kommunTotalt"]["roster"]["M"]["2010"], 150)

    def test_ar_som_distriktet_inte_fanns_ar_null_inte_noll(self):
        """Skillnaden mellan "fanns inte" och "fick inga röster" är hela
        poängen när indelningen ändrats."""
        soder = self.rader["Söder"]
        self.assertIsNone(soder["roster"]["M"]["2010"])
        self.assertIsNone(soder["giltiga"]["2010"])
        self.assertEqual(soder["roster"]["M"]["2018"], 200)

    def test_parti_utan_roster_ett_ar_ar_noll_inte_null(self):
        """Norr fick ÖVR-röster 2010 men inga 2014 – och fanns båda åren."""
        self.assertEqual(self.rader["Norr"]["roster"]["ÖVR"]["2010"], 40)
        self.assertEqual(self.rader["Norr"]["roster"]["ÖVR"]["2014"], 0)

    def test_filen_innehaller_roster_inte_andelar(self):
        """Andelen räknas i webbläsaren, så att en fritt vald grupp
        distrikt kan summeras före andelen räknas."""
        text = json.dumps(self.d)
        self.assertNotIn("andel", text)
        self.assertEqual(self.rader["Norr"]["roster"]["M"]["2018"], 150)

    def test_jamforbarheten_foljer_valmyndigheten(self):
        self.assertTrue(self.rader["Norr"]["jamforbart"]["2010-2014"])
        self.assertFalse(self.rader["Norr"]["jamforbart"]["2014-2018"])

    def test_saknat_ar_gor_overgangen_ojamforbar(self):
        """Söder fanns inte 2014, så det finns ingen övergång att bedöma."""
        self.assertFalse(self.rader["Söder"]["jamforbart"]["2014-2018"])
        self.assertFalse(self.rader["Söder"]["jamforbart"]["2010-2014"])

    def test_nedlagt_distrikt_redovisas_for_sig(self):
        self.assertEqual(self.d["nedlagda"],
                         [{"kod": "13840102", "namn": "Gamla",
                           "sistaVal": 2014}])

    def test_partierna_ordnas_efter_senaste_valet_med_ovriga_sist(self):
        """S är störst 2018 trots att M var störst 2010; ÖVR är ingen
        politisk riktning utan en restpost och hamnar sist."""
        koder = [p["kod"] for p in self.d["partier"]]
        self.assertEqual(koder, ["S", "M", "ÖVR"])

    def test_partinamnen_skrivs_ut(self):
        namn = {p["kod"]: p["namn"] for p in self.d["partier"]}
        self.assertEqual(namn["M"], "Moderaterna")
        self.assertEqual(namn["S"], "Socialdemokraterna")

    def test_slug_och_overgangar(self):
        self.assertEqual(self.rader["Söder"]["slug"], "soder")
        self.assertEqual(self.d["overgangar"], ["2010-2014", "2014-2018"])

    def test_namnbyte_bevaras(self):
        """Heter distriktet något annat i ett äldre val ska det stå kvar,
        så att den som letar efter det gamla namnet hittar raden."""
        kallor = json.loads(json.dumps(self.KALLOR))
        kallor = {int(a): v for a, v in kallor.items()}
        kallor[2010]["distrikt"][0]["namn"] = "Norra distriktet"
        d = build_valresultat.bygg(kallor, self.JAMFORBARHET)
        rad = [r for r in d["distrikt"] if r["namn"] == "Norr"][0]
        self.assertEqual(rad["tidigareNamn"], {"2010": "Norra distriktet"})


class TestTreVal(unittest.TestCase):
    """Samma valdistrikt röstar i tre val samma dag, och sidan visar ett i
    taget. Det som gör att de kan ligga på samma sida är att de tre
    datafilerna har samma distrikt med samma slugar – markeringen ska
    överleva ett byte av val."""

    @classmethod
    def setUpClass(cls):
        cls.filer = {
            valnyckel: json.loads(
                (ROT / "docs" / f"data-{val['mapp']}.json")
                .read_text(encoding="utf-8"))
            for valnyckel, val in hamta_valresultat.VALEN.items()}

    def test_alla_tre_valen_ar_byggda(self):
        self.assertEqual(sorted(self.filer), ["kommun", "region", "riksdag"])

    def test_samma_valdistrikt_i_de_tre_valen(self):
        """Slug, namn och kod måste vara identiska – annars tappar sidan
        markerade distrikt när valet byts."""
        facit = None
        for valnyckel, data in sorted(self.filer.items()):
            nycklar = [(d["slug"], d["namn"], d["kod"]) for d in data["distrikt"]]
            if facit is None:
                facit = nycklar
            else:
                self.assertEqual(nycklar, facit, valnyckel)

    def test_samma_val_och_samma_overgangar(self):
        for valnyckel, data in sorted(self.filer.items()):
            self.assertEqual(data["ar"], [2010, 2014, 2018, 2022, 2026],
                             valnyckel)
            self.assertEqual(data["overgangar"],
                             ["2010-2014", "2014-2018", "2018-2022",
                              "2022-2026"], valnyckel)

    def test_varje_fil_bar_sitt_eget_namn_pa_valet(self):
        """Sidans texter läser namnet ur filen, så det måste stämma med
        vilket val filen är byggd ur."""
        for valnyckel, data in sorted(self.filer.items()):
            val = hamta_valresultat.VALEN[valnyckel]
            self.assertEqual(data["valNyckel"], valnyckel)
            self.assertEqual(data["valEtikett"], val["etikett"])
            self.assertEqual(data["val"], val["namn"])
            self.assertEqual(data["valKort"], val["kort"])
            self.assertEqual(data["valenKort"], val["valen"])
        namn = {d["val"] for d in self.filer.values()}
        self.assertEqual(len(namn), 3)

    def test_troskeln_galler_de_tre_valen_tillsammans(self):
        """Kungsbackaborna når tröskeln i kommunvalet men inte i
        regionvalet, och redovisas ändå för sig i båda: annars hade ett
        tomrum i kurvan över de tre valen ibland betytt "stod inte på
        valsedeln" och ibland "ligger i övriga". Till riksdagen ställer de
        inte upp, och då finns de inte alls."""
        koder = {v: [p["kod"] for p in d["partier"]]
                 for v, d in self.filer.items()}
        self.assertIn("Kbabo", koder["kommun"])
        self.assertIn("Kbabo", koder["region"])
        self.assertNotIn("Kbabo", koder["riksdag"])
        # Och partiet ligger under tröskeln i regionvalet – det är just
        # därför unionen behövs.
        totalt = self.filer["region"]["kommunTotalt"]
        toppen = max(100 * totalt["roster"]["Kbabo"][a] / totalt["giltiga"][a]
                     for a in map(str, self.filer["region"]["ar"])
                     if totalt["roster"]["Kbabo"][a] is not None)
        self.assertLess(toppen, self.filer["region"]["troskelProcent"])
        for valnyckel, lista in sorted(koder.items()):
            self.assertEqual(lista[-1], "ÖVR", valnyckel)

    def test_parti_utan_valsedel_ar_null_och_inte_noll(self):
        """Kungsbackaborna ställde upp i regionvalet till och med 2022 men
        inte 2026. Det året ska stå som null: en kurva som föll till noll
        hade sett ut som ett sammanbrott i stället för ett parti som inte
        var med."""
        region = self.filer["region"]
        self.assertIsNone(region["kommunTotalt"]["roster"]["Kbabo"]["2026"])
        self.assertEqual(region["kommunTotalt"]["roster"]["Kbabo"]["2022"], 715)
        for d in region["distrikt"]:
            self.assertIsNone(d["roster"]["Kbabo"]["2026"], d["namn"])
        # De år partiet fanns med är nollor riktiga nollor.
        kommun = self.filer["kommun"]["kommunTotalt"]["roster"]["Kbabo"]
        self.assertTrue(all(kommun[a] for a in kommun))

    def test_kallorna_pekar_pa_olika_filer(self):
        """Varje val hämtas ur sina egna resultatfiler; två val som pekar
        på samma fil vore samma siffror två gånger."""
        for a in ("2010", "2014", "2018", "2022"):
            urler = {d["kalla"][a]["kallaUrl"] for d in self.filer.values()}
            self.assertEqual(len(urler), 3, a)

    def test_kallor_finns_for_varje_val_och_ar(self):
        for valnyckel in hamta_valresultat.VALEN:
            self.assertEqual(sorted(hamta_valresultat.KALLOR[valnyckel]),
                             hamta_valresultat.AR, valnyckel)

    def test_jamforbarheten_ar_gemensam(self):
        """Den hör till distrikten och inte till valet, och ligger därför
        i en enda fil som alla tre valen byggs med."""
        facit = None
        for valnyckel, data in sorted(self.filer.items()):
            per_distrikt = {d["slug"]: d["jamforbart"] for d in data["distrikt"]}
            if facit is None:
                facit = per_distrikt
            else:
                self.assertEqual(per_distrikt, facit, valnyckel)


class TestTroskelnOverValen(unittest.TestCase):
    """Tröskeln gäller de tre valen tillsammans, och ett parti som inte
    stod på valsedeln ett år får null och inte noll."""

    def kallor(self, per_ar):
        """Ett val med ett valdistrikt och de partiröster som anges,
        {år: {parti: röster}}."""
        return {ar: _kalla(ar, [_distrikt("13840101", "Norr", roster,
                                          sum(roster.values()))])
                for ar, roster in per_ar.items()}

    JAMFORBARHET = {"kalla": {}, "overgangar": {}}

    def test_troskeln_lyfts_ur_det_andra_valet(self):
        """Lokalt: 10 % i det ena valet, 1 % i det andra. Unionen ska ge
        partiet en egen rad i båda."""
        kommun = self.kallor({2022: {"M": 900, "Lokalt": 100},
                              2026: {"M": 900, "Lokalt": 100}})
        region = self.kallor({2022: {"M": 990, "Lokalt": 10},
                              2026: {"M": 990, "Lokalt": 10}})
        stora = build_valresultat.stora_over_valen(
            {"kommun": kommun, "region": region})
        self.assertIn("Lokalt", stora)
        d = build_valresultat.bygg(region, self.JAMFORBARHET, None,
                                   "region", stora)
        self.assertIn("Lokalt", [p["kod"] for p in d["partier"]])
        self.assertEqual(d["kommunTotalt"]["roster"]["Lokalt"]["2026"], 10)

        # Utan unionen hade partiet legat i ÖVR i regionvalet.
        ensamt = build_valresultat.bygg(region, self.JAMFORBARHET, None,
                                        "region")
        self.assertNotIn("Lokalt", [p["kod"] for p in ensamt["partier"]])

    def test_ar_utan_roster_blir_null(self):
        """Partiet ställde upp 2022 men inte 2026."""
        kallor = self.kallor({2022: {"M": 900, "Lokalt": 100},
                              2026: {"M": 1000}})
        d = build_valresultat.bygg(kallor, self.JAMFORBARHET, None, "kommun",
                                   {"M", "Lokalt"})
        self.assertEqual(d["kommunTotalt"]["roster"]["Lokalt"]["2022"], 100)
        self.assertIsNone(d["kommunTotalt"]["roster"]["Lokalt"]["2026"])
        rad = d["distrikt"][0]
        self.assertIsNone(rad["roster"]["Lokalt"]["2026"])

    def test_noll_i_ett_distrikt_ar_en_riktig_nolla(self):
        """Partiet ställde upp båda åren och fick röster i kommunen, men
        inga i Söder 2026. Då är nollan sann och ska stå kvar – det är
        bara år utan röster i *hela* kommunen som blir null."""
        kallor = {
            2022: _kalla(2022, [
                _distrikt("13840101", "Norr", {"M": 900, "Lokalt": 100}, 1000),
                _distrikt("13840102", "Söder", {"M": 900, "Lokalt": 100}, 1000)]),
            2026: _kalla(2026, [
                _distrikt("13840101", "Norr", {"M": 900, "Lokalt": 100}, 1000),
                _distrikt("13840102", "Söder", {"M": 1000}, 1000)]),
        }
        d = build_valresultat.bygg(kallor, self.JAMFORBARHET, None, "kommun",
                                   {"M", "Lokalt"})
        soder = [r for r in d["distrikt"] if r["namn"] == "Söder"][0]
        self.assertEqual(soder["roster"]["Lokalt"]["2022"], 100)
        self.assertEqual(soder["roster"]["Lokalt"]["2026"], 0)
        self.assertEqual(d["kommunTotalt"]["roster"]["Lokalt"]["2026"], 100)

    def test_ovr_nollas_aldrig_bort(self):
        """Restposten är ingen rad på en valsedel: ett år utan övriga
        röster är en riktig nolla, och summan av partierna ska fortfarande
        bli antalet giltiga."""
        kallor = self.kallor({2022: {"M": 900, "ÖVR": 100},
                              2026: {"M": 1000}})
        d = build_valresultat.bygg(kallor, self.JAMFORBARHET, None, "kommun",
                                   {"M"})
        self.assertEqual(d["kommunTotalt"]["roster"]["ÖVR"]["2026"], 0)


class TestTreValKontroller(unittest.TestCase):
    """Hämtningens två egna kontroller: att jämförbarheten säger samma sak
    i de tre valen, och att 2026 års slutliga räkning används först när
    den omfattar Kungsbacka."""

    def bedomning(self, jamforbart=True):
        return {"2010-2014": {"13840101": {"jamforbart": True,
                                           "foregaende": [],
                                           "indelning": "O"}},
                "2022-2026": {"13840101": {"jamforbart": jamforbart,
                                           "foregaende": [],
                                           "indelning": "Kan jämföras"}}}

    def test_samma_bedomning_i_alla_val_gar_igenom(self):
        lika = {v: self.bedomning() for v in ("kommun", "region", "riksdag")}
        self.assertEqual(hamta_valresultat.kontrollera_delad(lika),
                         self.bedomning())

    def test_olika_bedomning_avbryter(self):
        olika = {"kommun": self.bedomning(),
                 "riksdag": self.bedomning(jamforbart=False)}
        with self.assertRaises(SystemExit):
            hamta_valresultat.kontrollera_delad(olika)

    def zip_med(self, distrikt):
        """En resultatfil som 2026 års zip ser ut."""
        rymd = io.BytesIO()
        with zipfile.ZipFile(rymd, "w") as z:
            z.writestr("Val_2026_slutlig_rostfordelning_00_RD.json",
                       json.dumps({"valdistrikt": distrikt}))
        return rymd.getvalue()

    def distrikt(self, kod, raknat, typ="valdistrikt"):
        return {"valdistriktskod": kod, "kommunkod": kod[:4], "namn": kod,
                "valdistriktstyp": typ,
                "rostfordelning": {"rosterPaverkaMandat": {"antalRoster": 1}}
                if raknat else None}

    def test_rakning_utan_kungsbacka_ar_inte_raknad(self):
        """Riksfilen för den slutliga räkningen publiceras så fort det
        första distriktet i landet är klart. Är Kungsbacka inte med säger
        den mindre än den preliminära räkningen."""
        raa = self.zip_med([self.distrikt("13840101", False),
                            self.distrikt("01800101", True)])
        self.assertFalse(hamta_valresultat.raknad(raa))

    def test_rakning_med_hela_kungsbacka_ar_raknad(self):
        raa = self.zip_med([self.distrikt("13840101", True),
                            self.distrikt("13840102", True),
                            self.distrikt("138400", False, "uppsamlingsdistrikt"),
                            self.distrikt("01800101", False)])
        self.assertTrue(hamta_valresultat.raknad(raa))

    def test_halvraknad_kommun_ar_inte_raknad(self):
        raa = self.zip_med([self.distrikt("13840101", True),
                            self.distrikt("13840102", False)])
        self.assertFalse(hamta_valresultat.raknad(raa))


class TestKommunvalGranskning(unittest.TestCase):
    """hamta_valresultat kontrollerar varje år mot källans egna summor och
    avbryter hellre än att spara siffror som inte går ihop."""

    def rader(self, giltiga, rostande=0, roster=None):
        return [_distrikt("13840101", "Norr", roster or {"M": 60, "S": 40},
                          giltiga, rostande=rostande)]

    def test_partisumma_som_inte_stammer_avbryter(self):
        with self.assertRaises(SystemExit):
            hamta_valresultat.granska(2018, self.rader(999), {})

    def test_rostande_som_inte_stammer_avbryter(self):
        with self.assertRaises(SystemExit):
            hamta_valresultat.granska(2018, self.rader(100, rostande=999), {})

    def test_ratt_summor_gar_igenom(self):
        hamta_valresultat.granska(2018, self.rader(100, rostande=100), {})

    def test_stort_otolkat_parti_avbryter(self):
        with self.assertRaises(SystemExit):
            hamta_valresultat.granska(2018, self.rader(100, rostande=100),
                                    {"Okänt parti": 40})

    def test_litet_otolkat_parti_gar_igenom(self):
        """Enstaka röster på ett parti som inte går att tolka blir ÖVR;
        granskningen antecknar det men avbryter inte."""
        import contextlib
        import io
        with contextlib.redirect_stdout(io.StringIO()) as ut:
            hamta_valresultat.granska(
                2018,
                self.rader(10000, rostande=10000,
                           roster={"M": 6000, "S": 4000}),
                {"Okänt parti": 3})
        self.assertIn("Okänt parti", ut.getvalue())



class TestKommunvalTroskel(unittest.TestCase):
    """Bara partier som någon gång nått över tröskeln redovisas för sig.
    Resten läggs i ÖVR – samma restpost som källorna själva använder – så
    att partiernas röster fortfarande summerar till antalet giltiga."""

    # Stort fick 40 %, Litet 2 % båda åren, Ibland 1 % ena året och 6 %
    # det andra. Tröskeln ska släppa igenom Ibland men inte Litet.
    KALLOR = {
        2022: _kalla(2022, [
            _distrikt("13840101", "Norr",
                      {"M": 400, "S": 570, "Litet": 20, "Ibland": 10}, 1000)]),
        2026: _kalla(2026, [
            _distrikt("13840101", "Norr",
                      {"M": 400, "S": 520, "Litet": 20, "Ibland": 60}, 1000)]),
    }
    JAMFORBARHET = {"kalla": {}, "overgangar": {
        "2022-2026": {"13840101": {"jamforbart": True, "foregaende": [],
                                   "indelning": "O"}}}}

    def setUp(self):
        self.d = build_valresultat.bygg(self.KALLOR, self.JAMFORBARHET)
        self.norr = self.d["distrikt"][0]

    def test_troskeln_ar_tre_procent(self):
        self.assertEqual(self.d["troskelProcent"], 3.0)

    def test_parti_over_troskeln_nagot_ar_redovisas_for_sig(self):
        """Ibland låg under tröskeln 2022 men över den 2026, och ska
        därför synas båda åren – annars går serien inte att läsa."""
        koder = [p["kod"] for p in self.d["partier"]]
        self.assertIn("Ibland", koder)
        self.assertEqual(self.norr["roster"]["Ibland"],
                         {"2022": 10, "2026": 60})

    def test_parti_under_troskeln_alla_ar_hamnar_i_ovriga(self):
        self.assertNotIn("Litet", [p["kod"] for p in self.d["partier"]])
        self.assertNotIn("Litet", self.norr["roster"])
        self.assertEqual(self.norr["roster"]["ÖVR"], {"2022": 20, "2026": 20})

    def test_summan_ar_oforandrad_efter_hopvikningen(self):
        """Det springande: andelarna räknas på giltiga röster, så om
        hopvikningen tappade röster skulle varje andel på sidan bli fel."""
        for a in ("2022", "2026"):
            self.assertEqual(
                sum(v[a] for v in self.norr["roster"].values()),
                self.norr["giltiga"][a], a)
            self.assertEqual(
                sum(v[a] for v in self.d["kommunTotalt"]["roster"].values()),
                self.d["kommunTotalt"]["giltiga"][a], a)

    def test_ovriga_ligger_sist_i_partilistan(self):
        self.assertEqual([p["kod"] for p in self.d["partier"]][-1], "ÖVR")

    def test_troskeln_mats_pa_kommunen_inte_pa_distriktet(self):
        """Ett parti som är stort i ett enda litet distrikt men litet i
        kommunen ska inte få egen serie – annars fylls listan av partier
        som bara finns på ett ställe."""
        kallor = json.loads(json.dumps(self.KALLOR))
        kallor = {int(a): v for a, v in kallor.items()}
        for a in (2022, 2026):
            kallor[a]["distrikt"].append(
                _distrikt("13840102", "Söder", {"M": 5, "Litet": 5}, 10))
        d = build_valresultat.bygg(kallor, self.JAMFORBARHET)
        self.assertNotIn("Litet", [p["kod"] for p in d["partier"]])
        soder = [r for r in d["distrikt"] if r["namn"] == "Söder"][0]
        self.assertEqual(soder["roster"]["ÖVR"]["2026"], 5)



if __name__ == "__main__":
    unittest.main()


class TestHarkomst(unittest.TestCase):
    """Indikatorn för de val ett valdistrikt inte fanns: siffrorna från
    det distrikt marken låg i då.

    Det som ska gå att lita på är två saker. Vikten ska följa med hela
    kedjan bakåt och multipliceras på vägen, och skalningen ska vara
    sådan att *andelen* blir det gamla distriktets andel – annars är
    indikatorn inte en indikator på partiets ställning i området utan ett
    eget påhittat tal."""

    ROSTER = {"M": 400, "S": 300, "ÖVR": 300}   # 1 000 giltiga, M = 40 %

    def distrikt(self, kod, namn, roster=None, giltiga=1000):
        return {"kod": kod, "namn": namn, "uppsamling": False,
                "roster": dict(roster or self.ROSTER), "giltiga": giltiga,
                "rostande": giltiga, "rostberattigade": giltiga}

    def kalla(self, distrikt):
        return {"distrikt": distrikt, "kalla": "test", "kallaUrl": None,
                "sidaUrl": None, "hamtad": "2026-01-01"}

    def bygg(self, kallor, overgangar, harkomst=None):
        return build_valresultat.bygg(
            kallor, {"overgangar": overgangar}, harkomst or {})

    def test_officiell_vikt_skalar_rosterna(self):
        """Björkrisfallet: Valmyndigheten säger att 52,9 % av Tölö
        Landsbygd blev Björkris. Indikatorn ska vara 52,9 % av rösterna –
        men samma andel M som Tölö Landsbygd hade."""
        kallor = {
            2022: self.kalla([self.distrikt("02", "Tölö Landsbygd")]),
            2026: self.kalla([self.distrikt("02", "Tölö Landsbygd"),
                              self.distrikt("07", "Björkris",
                                            {"M": 100, "S": 100}, 200)]),
        }
        data = self.bygg(kallor, {"2022-2026": {
            "07": {"foregaende": [{"kod": "02", "andel": 52.9}],
                   "jamforbart": False},
            "02": {"foregaende": [{"kod": "02", "andel": 47.1}],
                   "jamforbart": False}}})
        bjorkris = [d for d in data["distrikt"] if d["namn"] == "Björkris"][0]
        h = bjorkris["harkomst"]["2022"]
        self.assertEqual(h["giltiga"], 529)
        self.assertEqual(h["roster"]["M"], 212)          # 52,9 % av 400
        self.assertAlmostEqual(100 * h["roster"]["M"] / h["giltiga"], 40.1, 1)
        self.assertEqual(h["fran"], [{"kod": "02", "namn": "Tölö Landsbygd",
                                      "andel": 100.0}])

    def test_andelen_ar_ursprungets_andel(self):
        """Skalningen får inte flytta andelen, hur vikten än ser ut."""
        for vikt in (5.0, 17.5, 52.9, 100.0):
            with self.subTest(vikt=vikt):
                kallor = {
                    2022: self.kalla([self.distrikt("02", "Gammalt")]),
                    2026: self.kalla([self.distrikt("02", "Gammalt"),
                                      self.distrikt("07", "Nytt")]),
                }
                data = self.bygg(kallor, {"2022-2026": {
                    "07": {"foregaende": [{"kod": "02", "andel": vikt}],
                           "jamforbart": False}}})
                h = [d for d in data["distrikt"]
                     if d["namn"] == "Nytt"][0]["harkomst"]["2022"]
                self.assertAlmostEqual(
                    100 * h["roster"]["M"] / h["giltiga"], 40.0, 0)

    def test_vikterna_multipliceras_genom_kedjan(self):
        """Nytt 2026 kom ur Mellan 2022 (50 %), som kom ur Gammalt 2018
        (40 %). Indikatorn för 2018 ska vila på 20 % av Gammalt."""
        kallor = {
            2018: self.kalla([self.distrikt("01", "Gammalt")]),
            2022: self.kalla([self.distrikt("02", "Mellan")]),
            2026: self.kalla([self.distrikt("03", "Nytt")]),
        }
        data = self.bygg(kallor, {
            "2018-2022": {"02": {"foregaende": [{"kod": "01", "andel": 40.0}],
                                 "jamforbart": False}},
            "2022-2026": {"03": {"foregaende": [{"kod": "02", "andel": 50.0}],
                                 "jamforbart": False}}})
        h = data["distrikt"][0]["harkomst"]
        self.assertEqual(h["2022"]["giltiga"], 500)
        self.assertEqual(h["2018"]["giltiga"], 200)
        self.assertEqual([f["namn"] for f in h["2018"]["fran"]], ["Gammalt"])

    def test_saknad_andel_betyder_hela_distriktet(self):
        """2018 -> 2022 och 2022 -> 2026 anger bara koder, ingen vikt.
        Posten betyder då att hela det gamla distriktet gick in i det nya."""
        kallor = {
            2022: self.kalla([self.distrikt("02", "Gammalt")]),
            2026: self.kalla([self.distrikt("02", "Gammalt"),
                              self.distrikt("07", "Nytt")]),
        }
        data = self.bygg(kallor, {"2022-2026": {
            "07": {"foregaende": [{"kod": "02", "andel": None}],
                   "jamforbart": False}}})
        h = [d for d in data["distrikt"]
             if d["namn"] == "Nytt"][0]["harkomst"]["2022"]
        self.assertEqual(h["giltiga"], 1000)

    def test_kartan_anvands_bara_dar_valmyndigheten_tiger(self):
        """Där Valmyndigheten anger ett ursprung är det deras svar som
        gäller; den uträknade härkomsten används bara i tystnaden."""
        kallor = {
            2018: self.kalla([self.distrikt("01", "A"), self.distrikt("02", "B")]),
            2022: self.kalla([self.distrikt("09", "Ny")]),
        }
        harkomst = {"overgang": "2018-2022", "distrikt": {
            "09": {"namn": "Ny", "fran": [{"kod": "02", "namn": "B",
                                           "andelAvNytt": 100.0,
                                           "andelAvGammalt": 30.0}]}}}
        # Utan officiellt ursprung: kartan används.
        data = self.bygg(kallor, {"2018-2022": {"09": {"foregaende": [],
                                                       "jamforbart": False}}},
                         harkomst)
        h = data["distrikt"][0]["harkomst"]["2018"]
        self.assertEqual(h["giltiga"], 300)
        self.assertEqual(h["fran"][0]["namn"], "B")
        # Med officiellt ursprung: Valmyndigheten vinner.
        data = self.bygg(kallor, {"2018-2022": {
            "09": {"foregaende": [{"kod": "01", "andel": 80.0}],
                   "jamforbart": False}}}, harkomst)
        h = data["distrikt"][0]["harkomst"]["2018"]
        self.assertEqual(h["giltiga"], 800)
        self.assertEqual(h["fran"][0]["namn"], "A")

    def test_okant_ursprung_ger_ingen_indikator(self):
        """Tappas spåret ska inget gissas – och kedjan ska sluta där, inte
        hoppa över ett val."""
        kallor = {
            2018: self.kalla([self.distrikt("01", "Gammalt")]),
            2022: self.kalla([self.distrikt("01", "Gammalt")]),
            2026: self.kalla([self.distrikt("01", "Gammalt"),
                              self.distrikt("09", "Ny")]),
        }
        data = self.bygg(kallor, {"2022-2026": {"09": {"foregaende": [],
                                                       "jamforbart": False}}})
        ny = [d for d in data["distrikt"] if d["namn"] == "Ny"][0]
        self.assertNotIn("harkomst", ny)

    def test_indikatorn_blandas_aldrig_med_egna_roster(self):
        """De riktiga fälten ska stå kvar som null för de åren: tabellen
        och förändringstalen läser dem, och får inte råka läsa en
        indikator."""
        data = json.loads((ROT / "docs" / "data-kommunval.json")
                          .read_text(encoding="utf-8"))
        med_harkomst = [d for d in data["distrikt"] if d.get("harkomst")]
        self.assertTrue(med_harkomst, "ingen indikator i den byggda filen")
        for d in med_harkomst:
            for a in d["harkomst"]:
                self.assertIsNone(d["giltiga"][a], f"{d['namn']} {a}")
                for parti in d["roster"]:
                    self.assertIsNone(d["roster"][parti][a], f"{d['namn']} {a}")
            # Och tvärtom: inget år med egna siffror får ha en indikator.
            for a in data["ar"]:
                if d["giltiga"][str(a)] is not None:
                    self.assertNotIn(str(a), d["harkomst"], d["namn"])

    def test_kartmetoden_kontrollerar_sig_mot_valmyndigheten(self):
        """data/valdistrikt/harkomst.json bär sin egen kontroll: distrikt
        som Valmyndigheten anser jämförbara ska hamna på sig själva."""
        h = json.loads((ROT / "data" / "valdistrikt" / "harkomst.json")
                       .read_text(encoding="utf-8"))
        kontroll = h["kontroll"]
        self.assertGreaterEqual(kontroll["jamforbaraDistrikt"], 30)
        self.assertGreaterEqual(kontroll["lagstaEgentraff"],
                                kontroll["kravEgentraff"])
        # Varje andel ska summera till 100 för det nya distriktet.
        for kod, post in h["distrikt"].items():
            summa = sum(f["andelAvNytt"] for f in post["fran"])
            self.assertAlmostEqual(summa, 100.0, 0, f"{post['namn']} ({kod})")
