#!/usr/bin/env python3
"""Hämtar årskurs 9-resultaten per skolenhet i Kungsbacka ur Skolverket.

Sidan "Grundskolorna i årskurs 9" följer varje skola i nian över tid, och
hämtar därför två rapporter i Skolverkets exporttjänst – samma tjänst som
ämnesbetygen och kullkedjan, men på *skolenhetsnivå*:

  139  Grundskola – Slutbetyg årskurs 9, samtliga elever.
       Genomsnittligt meritvärde (17 ämnen), andel som uppfyllt
       betygskriterierna i alla ämnen och andel behöriga till
       yrkesprogram, per skolenhet, med antal elever.
    5  Grundskola – Behörighet till gymnasieskolan, fr.o.m. 2011.
       Andel behöriga till yrkesprogram och till de tre
       högskoleförberedande programgrupperna, per skolenhet och kön.
       Bara raden för "Samtliga" används här.

  https://siris.skolverket.se/siris/reports/export_api/runexport/
      ?pFormat=csv&pExportID=<rapport>&pAr=<år>&pKommun=1384&pFlikar=0

`pAr` är det år eleverna gick ut nian (läsåret 2025/26 är 2026).
Urvalet är skolkommun, alltså alla skolenheter som ligger i Kungsbacka –
även de fristående. Rapport 139 ("samtliga elever") är den som också tar
med nyinvandrade; systerrapporten 110 utan dem ger lägre spridning men
inte de siffror som skolorna själva möts av.

**Skolenheter, inte skolor.** Skolverket redovisar per skolenhet, och en
skola kan bestå av flera enheter (Varlaskolan Nord/Syd/Sydväst) eller byta
enhetskod när den byter namn eller årskurser. Att föra ihop enheterna till
skolor är ett arbete för byggskriptet (`build_grundskolor.py`, och
`program.py` för själva mappningen) – här sparas enheterna som de kommer.

Prickningen bevaras: `..` = färre än tio elever, `.` = uppgiften saknas,
`~100` = 1–4 elever saknade måttet. Värdet blir då `null` och tecknet
sparas under `markor`, så att det går att skilja från "fanns inte".

Hellre stanna än spara fel: kolumnrubrikerna kontrolleras mot de
förväntade, och de två rapporterna kontrolleras mot varandra (samma
enhet ska ha samma andel behöriga till yrkesprogram i båda).

**Kommunsnitt.** Rapport 138 och 53 är motsvarigheterna till 139 och 5 på
kommunnivå, med en rad för samtliga skolor i Kungsbacka och en för de
kommunala respektive fristående. De sparas under `snitt` och används som
snittlinjer: Skolverkets eget tal, inte ett medelvärde av skolorna. Rikssnitt
finns inte som egen rad i exporten och hämtas inte.

Filerna sparas som data/grundskolor/grundskolor_<år>.json.

Körs:  python3 scripts/hamta_grundskolor.py            (alla år)
       python3 scripts/hamta_grundskolor.py --ar 2026  (ett år)
"""

import argparse
import json
from datetime import date
from pathlib import Path

import skolverket
from skolverket import KOMMUN, KOMMUNNAMN, tal

ROT = Path(__file__).resolve().parent.parent

BETYG_ID = 139
BEHORIGHET_ID = 5
KOMMUN_BETYG_ID = 138
KOMMUN_BEHORIGHET_ID = 53
FORSTA_AR = 2017          # tio läsår: 2016/17–2025/26

# Kolumnrubrikerna som måste stå där de förväntas. Hellre ett tydligt
# stopp än att läsa fel kolumn under tystnad.
# Rubriken för andelen som klarat alla ämnen har bytt ordalydelse mellan år
# och rapporter (kunskapskrav → kriterier) men är samma mått; alla former
# godtas.
ALLA_AMNEN = ("Andel (%) elever som uppfyllt betygskriterierna i alla ämnen",
              "Andel som uppnått kunskapskraven i alla ämnen",
              "Andel (%) som uppnått kunskapskraven i alla ämnen")
RUBRIK_BETYG = [
    "Skola", "Skol-enhetskod", "Skolkommun", "Kommun-kod", "Typ av huvudman",
    "Huvudman", "Huvudman orgnr", "Antal elever",
    ALLA_AMNEN,
    "Andel (%) elever behöriga till yrkesprog.",
    "Genomsnittligt meritvärde (17 ämnen)",
]
RUBRIK_BEHORIGHET = [
    "Skola", "Skol-enhetskod", "Skolkommun", "Kommun-kod", "Typ av huvudman",
    "Huvudman", "Huvudman orgnr", "Kön", "Antal elever",
    "Andel (%) elever behöriga till yrkesprog.",
    "Andel (%) elever behöriga till estetiskt program",
    "Andel (%) elever behöriga till Ekonomi-, humanistiska och "
    "samhällsvetenskaps- program",
    "Andel (%) elever behöriga till Naturvetenskapligt och tekniskt program",
]

# Kommunrapporterna: samma mått, men en rad per huvudmannatyp i stället för
# per skolenhet, och rubrikerna är skrivna något annorlunda.
RUBRIK_KOMMUN_BETYG = [
    "Kommun", "Kommun-kod", "Län", "Läns-kod", "Typ av huvudman", "Antal elever",
    ALLA_AMNEN, "Andel (%) elever behöriga till yrkesprog.",
    "Genomsnittligt meritvärde (17 ämnen)",
]
RUBRIK_KOMMUN_BEHORIGHET = [
    "Kommun", "Kommun-kod", "Län", "Läns-kod", "Typ av huvudman", "Kön",
    "Antal elever",
    ("Andel (%) elever behöriga till yrkesprog.",
     "Andel elever (%) behöriga till yrkesprog."),
    ("Andel (%) elever behöriga till estetiskt program",
     "Andel elever (%) behöriga till estetiskt program"),
    ("Andel (%) elever behöriga till Ekonomi-, humanistiska och "
     "samhällsvetenskaps- program",
     "Andel elever (%) behöriga till Ekonomi-, humanistiska och "
     "samhällsvetenskaps- program"),
    ("Andel (%) elever behöriga till Naturvetenskapligt och tekniskt program",
     "Andel elever (%) behöriga till Naturvetenskapligt och tekniskt program"),
]
HUVUDMAN = ["Samtliga", "Kommunal", "Enskild"]

# Ordningen i rapporterna, efter de sju identifierande kolumnerna.
FALT_BETYG = ["antal", "alleAmnen", "behorigYrkes", "meritvarde"]
FALT_BEHORIGHET = ["antalBehorighet", "behorigYrkes5", "behorigEstetiskt",
                   "behorigEkoHumSam", "behorigNaturTeknik"]

TOLERANS = 0.05   # avrundningsskillnad mellan rapport 139 och 5


def markor(text: str):
    """Tecknet som stod i stället för ett tal, annars None."""
    t = (text or "").strip()
    return t if t and tal(t) is None else None


def kontrollera_rubrik(rader: list, forvantad: list, rapport: int,
                       forsta: str = "Skola") -> int:
    i = skolverket.rubrikrad(rader, forsta)
    har = [c.strip() for c in rader[i]]
    # Rubriken kan ha radbrytningar i sig; jämför utan blanksteg.
    def norm(c):
        return " ".join(c.split())

    def stammer(fanns, vantat):
        alternativ = vantat if isinstance(vantat, tuple) else (vantat,)
        return norm(fanns) in [norm(a) for a in alternativ]

    if len(har) < len(forvantad) or not all(
            stammer(f, v) for f, v in zip(har, forvantad)):
        raise SystemExit(f"Rapport {rapport}: kolumnrubrikerna är inte de "
                         f"förväntade – layouten verkar ha ändrats.\n"
                         f"  fanns:     {har}\n  förväntat: {forvantad}")
    return i


def lasa_rapport(rader: list, forvantad: list, falt: list, rapport: int,
                 bara_samtliga: bool = False) -> tuple:
    """Enheterna ur en rapport, en post per skolenhetskod.

    Exporten kan upprepa rader; första förekomsten vinner, och en
    avvikande upprepning avbryter i stället för att väljas bort."""
    i = kontrollera_rubrik(rader, forvantad, rapport)
    forsta = len(RUBRIK_BETYG) - len(FALT_BETYG) if rapport == BETYG_ID else 8
    ut = {}
    for rad in rader[i + 1:]:
        if len(rad) < len(forvantad):
            continue
        if rad[2] != KOMMUNNAMN or rad[3] != KOMMUN:
            continue
        if bara_samtliga and rad[7].strip() != "Samtliga":
            continue
        kod = rad[1].strip()
        post = {"kod": kod, "namn": rad[0].strip(),
                "huvudman": rad[4].strip(), "huvudmanNamn": rad[5].strip()}
        ms = {}
        for n, f in enumerate(falt):
            text = rad[forsta + n]
            post[f] = tal(text)
            if markor(text):
                ms[f] = markor(text)
        post["markor"] = ms
        if kod in ut:
            if ut[kod] != post:
                raise SystemExit(f"Rapport {rapport}: enhet {kod} upprepas "
                                 "med olika innehåll")
            continue
        ut[kod] = post
    return ut


def lasa_kommun(ar: int, lasar: str) -> dict:
    """Kungsbacka som helhet, per huvudmannatyp: raderna för Samtliga,
    Kommunal och Enskild ur rapport 138 och 53 (kön: Samtliga)."""
    rader_b = skolverket.rader_i(skolverket.hamta_csv(KOMMUN_BETYG_ID, ar))
    rader_h = skolverket.rader_i(skolverket.hamta_csv(KOMMUN_BEHORIGHET_ID, ar))
    for rader, rapport in ((rader_b, KOMMUN_BETYG_ID), (rader_h, KOMMUN_BEHORIGHET_ID)):
        if skolverket.lasar_ur(rader, "Valt läsår") != lasar:
            raise SystemExit(f"{ar}: rapport {rapport} gäller ett annat läsår")
    kontrollera_rubrik(rader_b, RUBRIK_KOMMUN_BETYG, KOMMUN_BETYG_ID, "Kommun")
    kontrollera_rubrik(rader_h, RUBRIK_KOMMUN_BEHORIGHET, KOMMUN_BEHORIGHET_ID, "Kommun")

    def rad_for(rader, huvudman, kon=None):
        traffar = [r for r in rader
                   if len(r) > 6 and r[0] == KOMMUNNAMN and r[1] == KOMMUN
                   and r[4].strip() == huvudman and (kon is None or r[5].strip() == kon)]
        if len(traffar) != 1:
            raise SystemExit(f"{ar}: väntade en rad för {huvudman}"
                             f"{'/' + kon if kon else ''}, hittade {len(traffar)}")
        return traffar[0]

    ut = {}
    for h in HUVUDMAN:
        b = rad_for(rader_b, h)
        k = rad_for(rader_h, h, "Samtliga")
        post, ms = {}, {}
        for falt, text in (("antal", b[5]), ("alleAmnen", b[6]),
                           ("behorigYrkes", b[7]), ("meritvarde", b[8]),
                           ("antalBehorighet", k[6]), ("behorigYrkes5", k[7]),
                           ("behorigEstetiskt", k[8]), ("behorigEkoHumSam", k[9]),
                           ("behorigNaturTeknik", k[10])):
            post[falt] = tal(text)
            if markor(text):
                ms[falt] = markor(text)
        # Samma tal i båda rapporterna, annars har någon kolumn flyttat sig.
        if (post["behorigYrkes"] is None) != (post["behorigYrkes5"] is None) or (
                post["behorigYrkes"] is not None
                and abs(post["behorigYrkes"] - post["behorigYrkes5"]) > TOLERANS):
            raise SystemExit(f"{ar} {h}: yrkesbehörigheten skiljer mellan "
                             "rapport 138 och 53")
        if post["antal"] != post["antalBehorighet"]:
            raise SystemExit(f"{ar} {h}: elevantalet skiljer mellan rapport 138 och 53")
        if ms.get("behorigYrkes") != ms.get("behorigYrkes5"):
            raise SystemExit(f"{ar} {h}: prickningen skiljer mellan rapport 138 och 53")
        del post["behorigYrkes5"]
        ms.pop("behorigYrkes5", None)
        post["markor"] = ms
        ut[h] = post
    return ut


def lasa_ar(ar: int) -> dict | None:
    text_b = skolverket.hamta_csv(BETYG_ID, ar)
    rader_b = skolverket.rader_i(text_b)
    betyg = lasa_rapport(rader_b, RUBRIK_BETYG, FALT_BETYG, BETYG_ID)
    if not betyg:
        return None
    lasar = skolverket.lasar_ur(rader_b, "Valt läsår")

    text_h = skolverket.hamta_csv(BEHORIGHET_ID, ar)
    rader_h = skolverket.rader_i(text_h)
    behorighet = lasa_rapport(rader_h, RUBRIK_BEHORIGHET, FALT_BEHORIGHET,
                              BEHORIGHET_ID, bara_samtliga=True)
    if skolverket.lasar_ur(rader_h, "Valt läsår") != lasar:
        raise SystemExit(f"{ar}: rapporterna gäller olika läsår")

    # Samma enheter i båda, och samma andel behöriga till yrkesprogram.
    if set(betyg) != set(behorighet):
        raise SystemExit(
            f"{ar}: rapporterna redovisar olika enheter: "
            f"bara 139 {sorted(set(betyg) - set(behorighet))}, "
            f"bara 5 {sorted(set(behorighet) - set(betyg))}")

    enheter = []
    for kod in sorted(betyg, key=lambda k: (betyg[k]["namn"], k)):
        b, h = betyg[kod], behorighet[kod]
        if b["behorigYrkes"] is not None and h["behorigYrkes5"] is not None \
                and abs(b["behorigYrkes"] - h["behorigYrkes5"]) > TOLERANS:
            raise SystemExit(
                f"{ar} {b['namn']}: andelen behöriga till yrkesprogram "
                f"skiljer mellan rapport 139 ({b['behorigYrkes']}) och 5 "
                f"({h['behorigYrkes5']})")
        if b["markor"].get("behorigYrkes") != h["markor"].get("behorigYrkes5"):
            raise SystemExit(f"{ar} {b['namn']}: prickningen av "
                             "yrkesbehörigheten skiljer mellan rapporterna")
        post = {
            "kod": kod, "namn": b["namn"],
            "huvudman": b["huvudman"], "huvudmanNamn": b["huvudmanNamn"],
            "antal": b["antal"],
            "meritvarde": b["meritvarde"],
            "alleAmnen": b["alleAmnen"],
            "behorigYrkes": b["behorigYrkes"],
            "antalBehorighet": h["antalBehorighet"],
            "behorigEstetiskt": h["behorigEstetiskt"],
            "behorigEkoHumSam": h["behorigEkoHumSam"],
            "behorigNaturTeknik": h["behorigNaturTeknik"],
        }
        ms = dict(b["markor"])
        for f in ("antalBehorighet", "behorigEstetiskt", "behorigEkoHumSam",
                  "behorigNaturTeknik"):
            if f in h["markor"]:
                ms[f] = h["markor"][f]
        post["markor"] = ms
        enheter.append(post)

    snitt = lasa_kommun(ar, lasar)
    return {
        "ar": ar,
        "lasar": lasar,
        "kommun": KOMMUNNAMN,
        "kommunkod": KOMMUN,
        "niva": "Skolenhet, skolkommun Kungsbacka",
        "kallor": [
            {"rapport": BETYG_ID,
             "rapportTitel": "Grundskola – Slutbetyg årskurs 9, samtliga elever",
             "kallaUrl": skolverket.export_url(BETYG_ID, ar)},
            {"rapport": BEHORIGHET_ID,
             "rapportTitel": "Grundskola – Behörighet till gymnasieskolan, fr.o.m. 2011",
             "kallaUrl": skolverket.export_url(BEHORIGHET_ID, ar)},
            {"rapport": KOMMUN_BETYG_ID,
             "rapportTitel": "Grundskola – Slutbetyg årskurs 9, samtliga elever "
                             "(Kungsbacka som helhet)",
             "kallaUrl": skolverket.export_url(KOMMUN_BETYG_ID, ar)},
            {"rapport": KOMMUN_BEHORIGHET_ID,
             "rapportTitel": "Grundskola – Behörighet till gymnasieskolan "
                             "(Kungsbacka som helhet)",
             "kallaUrl": skolverket.export_url(KOMMUN_BEHORIGHET_ID, ar)},
        ],
        "snitt": snitt,
        "kalla": "Skolverket, utbildningsstatistik",
        "statistikUrl": skolverket.STATISTIK_URL,
        "hamtad": date.today().isoformat(),
        "enheter": enheter,
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--ar", type=int, help="hämta bara det här året")
    p.add_argument("--tom", type=int, default=date.today().year,
                   help="sista år att försöka med")
    args = p.parse_args()

    ut = ROT / "data" / "grundskolor"
    ut.mkdir(parents=True, exist_ok=True)

    ar_lista = [args.ar] if args.ar else range(FORSTA_AR, args.tom + 1)
    skrivna = 0
    for ar in ar_lista:
        try:
            data = lasa_ar(ar)
        except SystemExit:
            raise
        except Exception as fel:
            print(f"  {ar}: kunde inte hämta ({fel})")
            continue
        if data is None:
            print(f"  {ar}: inga rader – året verkar inte publicerat ännu")
            continue
        fil = ut / f"grundskolor_{ar}.json"
        fil.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n",
                       encoding="utf-8")
        print(f"  {ar} ({data['lasar']}): {len(data['enheter'])} skolenheter "
              f"→ {fil.name}")
        skrivna += 1

    print(f"Skrev {skrivna} läsår till {ut}")


if __name__ == "__main__":
    main()
