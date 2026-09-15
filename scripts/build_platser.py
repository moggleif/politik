#!/usr/bin/env python3
"""Bygger docs/data-platser.json: platser per program och läsår.

Nämnden för Gymnasium & Arbetsmarknad fastställer varje höst hur många
platser Kungsbackas två kommunala gymnasieskolor erbjuder på varje
program inför nästa läsår. Talen läses ur nämndhandlingarna med
extrahera_utbud.py och ligger i data/utbud/.

Tre val styr hur serierna byggs, och alla tre står också på metodsidan:

**Året är antagningsåret**, alltså läsårets första år: beslutet i oktober
2025 gäller läsåret 2026/2027 och hamnar på 2026, samma år som GR:s
antagning till det läsåret. Då går platserna att lägga bredvid
meritvärdena år för år.

**Serien följer programmet, inte skolan.** Kommunen flyttar program
mellan sina skolor, och en serie per skola skulle brytas av en
organisationsförändring i stället för av att utbildningen ändrats. Samma
princip som på meritvärdes- och slutbetygssidorna.

**Platserna summeras över skolorna.** Låg programmet på båda skolorna
samma år blir seriens värde summan. Det är ett avsteg från
meritvärdessidan, som i stället håller isär skolorna – men två
antagningspoäng går inte att slå ihop, medan platser är additiva. Summan
är det tal som svarar på frågan hur många som kan söka programmet i
Kungsbacka. Vilka skolor som ingår följer med varje år.

Körs:  python3 scripts/build_platser.py
"""

import json
import pathlib
import re
import sys
import unicodedata

from program import (
    HOGSKOLEFORBEREDANDE,
    SKOLOR,
    YRKESPROGRAM,
    programnamn,
    typ_av,
)

ROT = pathlib.Path(__file__).resolve().parent.parent
KALLA = ROT / "data" / "utbud"
UT = ROT / "docs" / "data-platser.json"

KORT = {s["namn"]: s["kort"] for s in SKOLOR}

# Utbildningar som inte är nationella program. De läses in och redovisas,
# men ligger utanför programserierna: den anpassade gymnasieskolan är en
# egen skolform, lärlingsprogrammet är en utbildningsform snarare än ett
# program, och individuellt alternativ är ett introduktionsprogram utan
# eget platstak i samma mening.
UTANFOR = {
    "anpassade gymnasieskolan": "Anpassade gymnasieskolan",
    "larlingsprogrammet": "Lärlingsprogrammet",
    "individuellt alternativ": "Individuellt alternativ",
}

# Skrivningar som inte fångas av nyckeln nedan. Bindestreck och mellanrum
# normaliseras bort automatiskt, så tabellen behöver bara de verkliga
# skillnaderna: en felstavning, ett efterhängt programkortnamn, och den
# rad där naturvetenskapsprogrammet skrivs ihop med sin estetiska variant.
PROGRAM_ALIAS = {
    "hotel och turismprogrammet": "Hotell- och turismprogrammet",
    "forsaljning och serviceprogrammet": "Försäljnings- och serviceprogrammet",
    "international baccalaureate ib": "International Baccalaureate",
    "naturvetenskapsprogrammet inriktning estet": "Naturvetenskapsprogrammet",
}


def nyckla(text: str) -> str:
    """Jämförelsenyckel: gemener utan accenter, bindestreck eller dubbla mellanrum.

    Samma rutin som build_meritvarden.py använder. Den gör att "Barn och
    fritidsprogrammet" och "Barn- och fritidsprogrammet" blir samma sak
    utan att någon tabell behöver räkna upp varianterna.
    """
    t = unicodedata.normalize("NFKD", text.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return " ".join(t.split())


# Nyckel -> dagens programnamn, byggt ur den delade listan i program.py.
KANDA = {nyckla(namn): namn
         for namn in HOGSKOLEFORBEREDANDE | YRKESPROGRAM}


def dela_utbildning(text: str):
    """Delar "Estetiska programmet-Musik" i program och inriktning.

    Ger (program, inriktning, okant). Programnamnet är det som gäller i
    dag; namnbyten går genom PROGRAM_BYTT_NAMN i program.py, precis som
    på de andra gymnasiesidorna.
    """
    text = " ".join(text.split())
    namn, inriktning = text, ""
    m = re.match(r"^(.*?programmet)\s*-\s*(.+)$", text)
    if m:
        namn, inriktning = m.group(1), m.group(2).strip()
    nyckel = nyckla(namn)
    if nyckel in UTANFOR:
        return UTANFOR[nyckel], "", False
    namn = PROGRAM_ALIAS.get(nyckel) or KANDA.get(nyckel) or programnamn(namn)
    return namn, inriktning, typ_av(namn) == "okant"


def skolordning(namn: str) -> int:
    return [s["namn"] for s in SKOLOR].index(namn)


def las_argangar():
    argangar = []
    for fil in sorted(KALLA.glob("utbud_*.json")):
        with open(fil, encoding="utf-8") as f:
            argangar.append(json.load(f))
    if not argangar:
        sys.exit(f"Hittade inga årgångar i {KALLA}")
    return sorted(argangar, key=lambda a: a["antagningsar"])


def bygg(argangar):
    ar_lista = [a["antagningsar"] for a in argangar]
    okanda = set()

    # (program, år) -> platser summerade över skolor och inriktningar
    serier = {}
    for argang in argangar:
        ar = str(argang["antagningsar"])
        for rad in argang["utbildningar"]:
            namn, inriktning, okant = dela_utbildning(rad["utbildning"])
            if okant:
                okanda.add(rad["utbildning"])
            serie = serier.setdefault(namn, {
                "namn": namn,
                "typ": typ_av(namn),
                "varden": {},
                "inriktningar": {},
            })
            post = serie["varden"].setdefault(ar, {
                "platser": 0, "varavIMV": None, "elever": None,
                "skolor": set(),
            })
            post["platser"] += rad["platser"]
            post["skolor"].add(rad["skola"])
            for falt, kalla in (("varavIMV", "varavPrograminriktatVal"),
                                ("elever", "elever")):
                if rad[kalla] is not None:
                    post[falt] = (post[falt] or 0) + rad[kalla]
            if inriktning:
                per = serie["inriktningar"].setdefault(inriktning, {})
                per[ar] = per.get(ar, 0) + rad["platser"]

    program = []
    for serie in serier.values():
        varden = {}
        for ar, post in sorted(serie["varden"].items()):
            varden[ar] = {
                "platser": post["platser"],
                "varavIMV": post["varavIMV"],
                "elever": post["elever"],
                "skola": " + ".join(KORT[s] for s in
                                    sorted(post["skolor"], key=skolordning)),
                "antalSkolor": len(post["skolor"]),
            }
        # Hemvisten är skolan – eller skolorna – som har programmet senast.
        skolor_i_hemaret = serie["varden"][max(serie["varden"], key=int)]["skolor"]
        program.append(satt_statistik({
            "namn": serie["namn"],
            "typ": serie["typ"],
            "hem": " + ".join(KORT[s] for s in
                              sorted(skolor_i_hemaret, key=skolordning)),
            "skolor": [KORT[s] for s in
                       sorted({s for p in serie["varden"].values()
                               for s in p["skolor"]}, key=skolordning)],
            "varden": varden,
            "inriktningar": [
                {"namn": namn, "varden": {ar: v for ar, v in sorted(ar_v.items())}}
                for namn, ar_v in sorted(serie["inriktningar"].items())
            ],
        }))
    program.sort(key=lambda p: (p["typ"] == "okant", p["namn"]))

    # Summan per år: hur många platser kommunen sätter totalt. De
    # utbildningar som ligger utanför programserierna räknas för sig, så
    # att totalen går att läsa både med och utan dem.
    sammanfattning = []
    for ar in ar_lista:
        s = str(ar)
        nationella = [p for p in program if p["typ"] != "okant" and s in p["varden"]]
        ovriga = [p for p in program if p["typ"] == "okant" and s in p["varden"]]
        sammanfattning.append({
            "ar": ar,
            "platser": sum(p["varden"][s]["platser"] for p in nationella),
            # Null, inte noll: handlingarna från 2025 och framåt räknar inte
            # upp utbildningarna utanför programmen, och att skriva noll vore
            # att påstå att de lagts ned.
            "platserOvrigt": sum(p["varden"][s]["platser"] for p in ovriga)
            if ovriga else None,
            "antalProgram": len(nationella),
        })

    return {
        "kommun": "Kungsbacka",
        "serie": "Platser på gymnasieprogrammen",
        "ar": ar_lista,
        "skolor": [s["kort"] for s in SKOLOR],
        "program": program,
        "sammanfattning": sammanfattning,
        "kallor": [{
            "lasar": a["lasar"],
            "ar": a["antagningsar"],
            "status": a["status"],
            "form": a["form"],
            "kolumn": a.get("kolumnINamnden"),
            "namnd": a["namnd"],
            "mote": a["mote"],
            "paragraf": a["paragraf"],
            "diarienummer": a["diarienummer"],
            "arendenamn": a["arendenamn"],
            "beslut": a["beslut"],
            "not": a["not"],
            "handlingUrl": a["handlingUrl"],
            "protokollUrl": a["protokollUrl"],
            "lokalPdf": a["lokalPdf"],
            "hamtad": a["hamtad"],
        } for a in argangar],
    }, okanda


def satt_statistik(serie):
    ar = sorted(serie["varden"], key=int)
    serie["forstaAr"] = int(ar[0])
    serie["sistaAr"] = int(ar[-1])
    serie["forsta"] = serie["varden"][ar[0]]["platser"]
    serie["sista"] = serie["varden"][ar[-1]]["platser"]
    serie["forandring"] = serie["sista"] - serie["forsta"]
    serie["antalAr"] = len(ar)
    return serie


def main() -> None:
    argangar = las_argangar()
    data, okanda = bygg(argangar)
    for namn in sorted(okanda):
        print(f"# VARNING: okänt program: {namn}", file=sys.stderr)
    with open(UT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"{UT.relative_to(ROT)}: {len(data['program'])} program, "
          f"{len(data['ar'])} år ({data['ar'][0]}–{data['ar'][-1]})")


if __name__ == "__main__":
    main()
