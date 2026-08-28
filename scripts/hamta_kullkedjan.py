#!/usr/bin/env python3
"""Hämtar kedjan nian → gymnasiestart → gymnasieexamen ur Skolverket.

Sidan "Från nian till gymnasiet" mäter samma årskull i tre punkter, och
varje punkt är en egen rapport i Skolverkets exporttjänst – samma tjänst
som slutbetygen och ämnesbetygen redan hämtas ur, men på kommunnivå:

  109  Grundskola – Slutbetyg årskurs 9, utan nyinvandrade och elever
       med okänd bakgrund. Ger meritvärdet och behörigheten till
       gymnasiet för dem som gick ut nian år X.
   91  Gymnasieskola – Genomströmning inom 3, 4 och 5 år, GY11. Ger hur
       det gick för dem som *började* gymnasiet hösten år X.
   89  Gymnasieskola – Avgångselever, nationella program. Ger betygen
       hos dem som *gick ut* gymnasiet år X, per program.
   61  Gymnasieskola – Pendling mellan hem- och skolkommun.
   60  Grundskola – Pendling mellan hem- och skolkommun.

  https://siris.skolverket.se/siris/reports/export_api/runexport/
      ?pFormat=csv&pExportID=<rapport>&pAr=<år>&pKommun=1384&pFlikar=0

**Skolkommun, inte hemkommun.** Alla fem rapporterna redovisar skolor
som *ligger i* Kungsbacka. Kontrollerat mot en kommun utan eget
gymnasium (Bollebygd), där rapport 91 bara har fyra rader trots 370
folkbokförda gymnasieelever. Det är hela poängen med att också hämta
pendlingen: den mäter hur stort glappet mellan de två är.

Filerna sparas ett år per fil:

  data/arskurs9/arskurs9_<år>.json           år = det år eleverna gick ut nian
  data/genomstromning/genomstromning_<år>.json  år = startläsårets höst
  data/avgangskommun/avgangskommun_<år>.json år = det år eleverna gick ut gymnasiet
  data/pendling/pendling_<år>.json           år = läsårets höst

Körs:  python3 scripts/hamta_kullkedjan.py                  (allt)
       python3 scripts/hamta_kullkedjan.py --del arskurs9   (en del)
       python3 scripts/hamta_kullkedjan.py --ar 2025        (ett år)
"""

import argparse
import csv
import io
import json
import ssl
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent

EXPORT_URL = ("https://siris.skolverket.se/siris/reports/export_api/runexport/"
              "?pFormat=csv&pExportID={export}&pAr={ar}&pKommun={kommun}&pFlikar=0")
KOMMUN = "1384"
KOMMUNNAMN = "Kungsbacka"

STATISTIK_URL = ("https://www.skolverket.se/skolutveckling/statistik/"
                 "sok-statistik-om-forskola-skola-och-vuxenutbildning")

KODER = {
    "..": "Färre än tio elever – Skolverket dubbelprickar uppgiften",
    ".": "Uppgiften saknas",
    "~100": "Färre än fem elever saknade måttet – Skolverket skriver ~100",
}


# ---------------------------------------------------------------- hämtning

def hamta_csv(export: int, ar: int) -> str:
    """CSV:en för ett år. Exporttjänsten bryter då och då kopplingen mitt
    i ett svar; det är övergående och ska inte stoppa hela hämtningen."""
    url = EXPORT_URL.format(export=export, ar=ar, kommun=KOMMUN)
    req = urllib.request.Request(
        url, headers={"User-Agent": "kungsbacka-i-siffror/1.0"})
    sista = None
    for forsok in range(4):
        try:
            with urllib.request.urlopen(
                    req, timeout=120,
                    context=ssl.create_default_context()) as r:
                return r.read().decode("utf-8-sig")
        except Exception as fel:          # nätverksfel, avbruten koppling
            sista = fel
            time.sleep(2 ** forsok)
    raise sista


def rader_i(text: str) -> list:
    return list(csv.reader(io.StringIO(text), delimiter=";"))


def rubrikrad(rader: list, forsta_kolumn: str) -> int:
    """Radnumret för kolumnrubrikerna, hittad på sin första kolumn.

    Rapporterna har en inledande textdel vars längd har ändrats genom
    åren, så raden får inte pekas ut med ett fast index."""
    for i, rad in enumerate(rader):
        if rad and rad[0].strip() == forsta_kolumn:
            return i
    raise SystemExit(f"Hittade ingen rubrikrad som börjar med {forsta_kolumn!r} "
                     "– exportens layout verkar ha ändrats.")


def lasar_ur(rader: list, etikett: str) -> str:
    for rad in rader[:8]:
        if rad and rad[0].startswith(etikett):
            return rad[0].split(":", 1)[1].strip()
    return ""


def tal(text: str):
    """Skolverkets prickning: '..' = färre än tio elever, '.' = uppgiften
    saknas. Båda blir None. '~100' betyder att 1–4 elever saknade måttet
    och läses som 100,0 – markören sparas separat av `las_tal`."""
    t = (text or "").strip()
    if t in ("", ".", ".."):
        return None
    if t == "~100":
        return 100.0
    t = t.replace("\xa0", "").replace(" ", "").replace(",", ".")
    try:
        return float(t) if "." in t else int(t)
    except ValueError:
        return None


def las_tal(rad: list, kol: dict, namn: str, ungefarliga: list, radnamn: str):
    """Talet i en kolumn, och en anteckning om det stod '~100' där."""
    if namn not in kol:
        return None
    ratext = (rad[kol[namn]] or "").strip()
    if ratext == "~100":
        ungefarliga.append(f"{radnamn}: {namn}")
    return tal(ratext)


def skriv(mapp: str, filnamn: str, data: dict) -> Path:
    ut = ROT / "data" / mapp
    ut.mkdir(parents=True, exist_ok=True)
    fil = ut / filnamn
    fil.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n",
                   encoding="utf-8")
    return fil


def gemensamt(export: int, ar: int, titel: str, niva: str) -> dict:
    return {
        "kommun": KOMMUNNAMN,
        "kommunkod": KOMMUN,
        "niva": niva,
        "rapportTitel": titel,
        "kalla": "Skolverket, utbildningsstatistik",
        "kallaUrl": EXPORT_URL.format(export=export, ar=ar, kommun=KOMMUN),
        "statistikUrl": STATISTIK_URL,
        "koder": KODER,
        "hamtad": date.today().isoformat(),
    }


# ------------------------------------------------- 109: slutbetyg årskurs 9

# Rapport 109 redovisar flera elevurval bredvid varandra, och vilka de är
# har ändrats: t.o.m. 2013/14 "Totalt exklusive nyinvandrade elever" och
# "Nyinvandrade elever", därefter "Samtliga elever" och "Samtl. elever,
# exklusive nyinvandrade och med okänd bakgr.", och fr.o.m. 2023/24 bara
# den sistnämnda. Det enda urval som finns *alla* år är det som utesluter
# nyinvandrade, så det är det serien följer – kolumnerna letas upp via
# grupprubriken, aldrig på position.
AK9_URVAL_ORD = ("nyinvandrade",)
AK9_URVAL_EXKL = ("exkl", "utan")

AK9_FALT = {
    "antal": ("Antal elever",),
    "andelAllaAmnen": ("Andel (%) elever som uppfyllt betygskriterierna i alla ämnen",
                       "Andel (%) uppnått kunskapskraven i alla ämnen"),
    "andelBehorigYrkes": ("Andel (%) elever behöriga till yrkesprog.",),
    "meritvarde": ("Genomsnittligt meritvärde (17 ämnen)",
                   "Genomsnittligt meritvärde (16 ämnen)"),
}


def ak9_kolumner(rader: list, rubrik_i: int) -> tuple:
    """Kolumnindex för det urval som utesluter nyinvandrade elever.

    Returnerar (kolumner, urvalets namn, antal ämnen i meritvärdet)."""
    grupper = rader[rubrik_i - 1] if rubrik_i else []
    namn = rader[rubrik_i]

    traffar = set()
    for i, g in enumerate(grupper):
        g = (g or "").strip()
        low = g.lower()
        if any(o in low for o in AK9_URVAL_ORD) and any(e in low for e in AK9_URVAL_EXKL):
            traffar.add(g)
    if len(traffar) != 1:
        raise SystemExit(
            "Kunde inte peka ut urvalet 'exklusive nyinvandrade' i rapport 109 "
            f"– hittade {sorted(traffar)}. Layouten verkar ha ändrats.")
    urval = traffar.pop()

    kol = {}
    for i, g in enumerate(grupper):
        if (g or "").strip() != urval:
            continue
        rubrik = (namn[i] if i < len(namn) else "").strip()
        for falt, alias in AK9_FALT.items():
            if rubrik in alias and falt not in kol:
                kol[falt] = i
    saknas = [f for f in AK9_FALT if f not in kol]
    if saknas:
        raise SystemExit(f"Rapport 109 saknar kolumnerna {saknas} i urvalet "
                         f"{urval!r} – layouten verkar ha ändrats.")

    merit = namn[kol["meritvarde"]]
    amnen = 17 if "17" in merit else 16
    return kol, urval, amnen


def las_arskurs9(ar: int) -> dict | None:
    rader = rader_i(hamta_csv(109, ar))
    rubrik_i = rubrikrad(rader, "Kommun")
    kol, urval, meritamnen = ak9_kolumner(rader, rubrik_i)

    ungefarliga = []
    ut = []
    for rad in rader[rubrik_i + 1:]:
        if len(rad) < 5 or rad[0] != KOMMUNNAMN or rad[1] != KOMMUN:
            continue
        huvudman = rad[4].strip()
        post = {"huvudman": huvudman}
        for falt in AK9_FALT:
            post[falt] = las_tal(rad, kol, falt, ungefarliga, huvudman)
        ut.append(post)

    if not ut:
        return None

    d = gemensamt(109, ar, "Grundskola – Slutbetyg årskurs 9, utan "
                           "nyinvandrade och elever med okänd bakgrund",
                  "Skolkommun, samtliga skolor i kommunen")
    d.update({
        "ar": ar,
        "lasar": lasar_ur(rader, "Valt läsår"),
        "urval": urval,
        "meritamnen": meritamnen,
        "ungefarliga": ungefarliga,
        "rader": ut,
    })
    return d


# ---------------------------------------------------- 91: genomströmning

GENOM_FALT = [
    ("examen", "Andel (%) som slutfört med examen"),
    ("studiebevis", "Andel (%) som slutfört med studiebevis om 2500 poäng"),
    ("sammaProgram", "Andel (%) som startat och slutfört utbildningen inom samma program"),
]
GENOM_AR = [("3", "Inom 3 år"), ("4", "Inom 4 år"), ("5", "Inom 5 år")]


def genom_kolumner(rader: list, rubrik_i: int) -> dict:
    """Kolumnindex per (mått, antal år). Rubriken är tvådelad: en rad med
    måttets namn och en med 'Inom 3/4/5 år', så paret måste läsas ihop."""
    grupper = rader[rubrik_i - 1]
    namn = rader[rubrik_i]
    kol = {}
    for i, g in enumerate(grupper):
        g = (g or "").strip()
        rubrik = (namn[i] if i < len(namn) else "").strip()
        for falt, gruppnamn in GENOM_FALT:
            if g != gruppnamn:
                continue
            for suffix, arnamn in GENOM_AR:
                if rubrik == arnamn:
                    kol[falt + suffix] = i
    for falt, _ in GENOM_FALT:
        for suffix, _ in GENOM_AR:
            if falt + suffix not in kol:
                raise SystemExit(f"Rapport 91 saknar kolumnen {falt}{suffix} "
                                 "– layouten verkar ha ändrats.")
    for rubrik, falt in (("Program", "program"), ("Totalt antal", "antal"),
                         ("Typ av huvudman", "huvudman")):
        if rubrik not in namn:
            raise SystemExit(f"Rapport 91 saknar kolumnen {rubrik!r}.")
        kol[falt] = namn.index(rubrik)
    return kol


def las_genomstromning(ar: int) -> dict | None:
    rader = rader_i(hamta_csv(91, ar))
    rubrik_i = rubrikrad(rader, "Kommun")
    kol = genom_kolumner(rader, rubrik_i)

    ungefarliga = []
    ut, sedda = [], set()
    for rad in rader[rubrik_i + 1:]:
        if len(rad) <= max(kol.values()) or rad[0] != KOMMUNNAMN or rad[1] != KOMMUN:
            continue
        huvudman = rad[kol["huvudman"]].strip()
        program = rad[kol["program"]].strip()
        if (huvudman, program) in sedda:
            continue                      # exporten upprepar sina rader
        sedda.add((huvudman, program))
        post = {"huvudman": huvudman, "program": program,
                "antal": tal(rad[kol["antal"]])}
        for falt, _ in GENOM_FALT:
            for suffix, _ in GENOM_AR:
                nyckel = falt + suffix
                post[nyckel] = las_tal(rad, kol, nyckel, ungefarliga,
                                       f"{huvudman}/{program}")
        ut.append(post)

    if not ut:
        return None

    d = gemensamt(91, ar, "Gymnasieskola – Genomströmning inom 3, 4 och 5 år, GY11",
                  "Skolkommun, samtliga gymnasieskolor i kommunen")
    d.update({
        "startAr": ar,
        "startLasar": lasar_ur(rader, "Valt startläsår"),
        "ungefarliga": ungefarliga,
        "rader": ut,
    })
    return d


# ------------------------------------------------- 89: avgångselever, kommun

AVGANG_FALT = {
    "antal": "Totalt antal",
    "andelExamen": "Andel (%) med examen",
    "andelStudiebevis": "Andel (%) med studiebevis",
    "andelGrundlBehorighet": "Andel (%) med grundl. behörighet",
    "betygspoang": "GBP för elever med examen eller studiebevis",
    "betygspoangExamen": "GBP för elever med examen",
}


def las_avgang(ar: int) -> dict | None:
    rader = rader_i(hamta_csv(89, ar))
    rubrik_i = rubrikrad(rader, "Kommun")
    namn = rader[rubrik_i]
    kol = {}
    for falt, rubrik in AVGANG_FALT.items():
        if rubrik not in namn:
            raise SystemExit(f"Rapport 89 saknar kolumnen {rubrik!r} "
                             "– layouten verkar ha ändrats.")
        kol[falt] = namn.index(rubrik)
    for rubrik, falt in (("Program", "program"), ("Typ av huvudman", "huvudman")):
        kol[falt] = namn.index(rubrik)

    ungefarliga = []
    ut, sedda = [], set()
    for rad in rader[rubrik_i + 1:]:
        if len(rad) <= max(kol.values()) or rad[0] != KOMMUNNAMN or rad[1] != KOMMUN:
            continue
        huvudman = rad[kol["huvudman"]].strip()
        program = rad[kol["program"]].strip()
        if (huvudman, program) in sedda:
            continue                      # exporten upprepar sina rader
        sedda.add((huvudman, program))
        post = {"huvudman": huvudman, "program": program}
        for falt in AVGANG_FALT:
            post[falt] = las_tal(rad, kol, falt, ungefarliga,
                                 f"{huvudman}/{program}")
        ut.append(post)

    if not ut:
        return None

    d = gemensamt(89, ar, "Gymnasieskola – Avgångselever, nationella program",
                  "Skolkommun, samtliga gymnasieskolor i kommunen")
    d.update({
        "ar": ar,
        "lasar": lasar_ur(rader, "Valt läsår"),
        "ungefarliga": ungefarliga,
        "rader": ut,
    })
    return d


# ------------------------------------------------------ 60/61: pendlingen

PENDEL_FALT = {
    "folkbokforda": "Folkbokförda elever",
    "skolorKom": "Antal skolor, kom",
    "skolorEnsk": "Antal skolor, ensk",
    "studerandeKom": "Studerande, kom",
    "studerandeEnsk": "Studerande, ensk",
    "folkbokfordaStuderandeKom": "Folkbokf. stud., kom",
    "folkbokfordaStuderandeEnsk": "Folkbokf. stud., ensk",
    "inpendlingKom": "Inpendling, kom",
    "inpendlingEnsk": "Inpendling, ensk",
    "utpendlingKom": "Utpendling, kom",
    "utpendlingEnsk": "Utpendling, ensk",
}


def las_pendling_del(export: int, ar: int) -> tuple:
    rader = rader_i(hamta_csv(export, ar))
    rubrik_i = rubrikrad(rader, "Kommun")
    namn = rader[rubrik_i]
    kol = {}
    for falt, rubrik in PENDEL_FALT.items():
        if rubrik not in namn:
            raise SystemExit(f"Rapport {export} saknar kolumnen {rubrik!r} "
                             "– layouten verkar ha ändrats.")
        kol[falt] = namn.index(rubrik)

    for rad in rader[rubrik_i + 1:]:
        if len(rad) <= max(kol.values()) or rad[0] != KOMMUNNAMN or rad[1] != KOMMUN:
            continue
        return ({f: tal(rad[kol[f]]) for f in PENDEL_FALT},
                lasar_ur(rader, "Valt läsår"))
    return None, lasar_ur(rader, "Valt läsår")


def las_pendling(ar: int) -> dict | None:
    gy, lasar = las_pendling_del(61, ar)
    gr, _ = las_pendling_del(60, ar)
    if gy is None and gr is None:
        return None

    d = gemensamt(61, ar, "Pendling mellan hem- och skolkommun per typ av huvudman",
                  "Hemkommun och skolkommun, Kungsbacka")
    d.update({
        "ar": ar,
        "lasar": lasar,
        "kallaUrlGrundskolan": EXPORT_URL.format(export=60, ar=ar, kommun=KOMMUN),
        "gymnasiet": gy,
        "grundskolan": gr,
    })
    return d


# ------------------------------------------------------------------ körning

DELAR = {
    # namn: (mapp, filprefix, läsfunktion, första år)
    "arskurs9": ("arskurs9", "arskurs9", las_arskurs9, 2009),
    "genomstromning": ("genomstromning", "genomstromning", las_genomstromning, 2011),
    "avgangskommun": ("avgangskommun", "avgangskommun", las_avgang, 2014),
    "pendling": ("pendling", "pendling", las_pendling, 2010),
}


def kor(namn: str, ar_lista) -> int:
    mapp, prefix, las, forsta = DELAR[namn]
    print(f"{namn}:")
    skrivna = 0
    for ar in ar_lista if ar_lista else range(forsta, date.today().year + 1):
        if ar < forsta:
            continue
        try:
            data = las(ar)
        except SystemExit:
            raise
        except Exception as fel:
            print(f"  {ar}: kunde inte hämta ({fel})")
            continue
        if data is None:
            print(f"  {ar}: inga rader – året verkar inte publicerat ännu")
            continue
        fil = skriv(mapp, f"{prefix}_{ar}.json", data)
        print(f"  {ar}: {fil.name}")
        skrivna += 1
    return skrivna


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--del", dest="delen", choices=sorted(DELAR),
                   help="hämta bara en av delarna")
    p.add_argument("--ar", type=int, help="hämta bara det här året")
    args = p.parse_args()

    ar_lista = [args.ar] if args.ar else None
    delar = [args.delen] if args.delen else list(DELAR)
    totalt = sum(kor(d, ar_lista) for d in delar)
    print(f"Skrev {totalt} årsfiler")


if __name__ == "__main__":
    main()
