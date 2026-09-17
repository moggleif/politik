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

**Platserna paras med hur många som började.** Skolverkets rapport
*Antal elever, per program* (data/gymnasieelever/, hämtad av
hamta_gymnasieelever.py) har kolumnen "Antal elever skolår 1": eleverna
som gick första året på programmet den 15 oktober. Huvudmannatypen
Kommunal är just Aranäsgymnasiet och Elof Lindälvs gymnasium, alltså
precis de skolor nämndens utbudsbeslut gäller, och läsåret märks med
samma år som platserna. Talen läggs därför rakt bredvid platserna, år
för år.

De två serierna är olika långa, och det är inte ett fel som ska döljas:
platserna finns från 2024, eleverna från 2011. Nybörjartalen får därför
ett eget block med en egen årslista, medan de år som finns i båda också
läggs in bredvid platserna. Sista platsåret saknar elevtal tills
Skolverket publicerar läsåret, vilket sker våren efter.

**Bara de nationella programmen får nybörjartal.** På
introduktionsprogrammen är skolår 1 ingen årskurs – de redovisar i
praktiken hela elevgruppen där – och den anpassade gymnasieskolan är en
annan skolform som rapporten inte täcker. Lärlingsutbildningen ligger
inbakad i respektive program och har ingen egen rad. De tre
utbildningarna utanför programserierna står därför kvar utan nybörjartal,
och det är riktigare än att para dem med ett tal som betyder något annat.

**Skillnaden räknas fram, med sin varning intill.** De år som har både
ett utbudsbeslut och räknade elever får `skillnad` = började − platser,
per program, och en `jamforelse` i sammanfattningen med samma subtraktion
på totalerna. Talen mäter inte samma sak: platserna är ett beslut fattat
hösten innan, eleverna är en räkning gjord den 15 oktober läsåret därpå,
och mellan dem ligger ansökan, antagningen, omvalen och avhoppen.
Skillnaden är alltså inte "outnyttjade platser" utan avståndet mellan
plan och utfall, och sidan skriver ut det.

**Jämförelsen täcker bara de program som har båda talen.** Totalerna i
`jamforelse` summeras över samma programlista på båda sidorna – ett
program utan elevtal det året får inte räknas med bland platserna och
sedan saknas bland eleverna, för då vore differensen ett artefakt av
vilka rader som fanns.

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
ELEVKALLA = ROT / "data" / "gymnasieelever"
UT = ROT / "docs" / "data-platser.json"

# Huvudmannatypen som svarar mot utbudsbesluten. Rapporten redovisar
# också Enskild och Samtliga; de fristående skolorna i kommunen sätter
# sina egna platser och hör inte till nämndens beslut. Samtliga sparas
# ändå på sammanfattningsnivå, som bakgrund till kommunens egna tal.
ELEVHUVUDMAN = "Kommunal"
ALLA_HUVUDMAN = "Samtliga"

# Rapportens summeringsrader. De är inte program och ska aldrig hamna i
# programserierna – men de är svaret på hur många som började totalt,
# och används till sammanfattningen.
#
# Introduktionsprogrammen saknas medvetet. Där är "skolår 1" inte en
# årskurs: individuellt alternativ och språkintroduktion redovisar i
# praktiken hela elevgruppen som skolår 1 varje år (2025: 136 av 136
# respektive 17 av 18). Talet skulle alltså inte betyda "började" utan
# "går på", och de två går inte att lägga i samma serie.
SUMMARADER = {
    "Nationella program": "nationella",
    "Högskoleförberedande program": "hogskoleforberedande",
    "Yrkesprogram": "yrkesprogram",
}

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


def las_elevargangar():
    """Skolverkets elevtal, ett läsår per fil. Saknas de är det inte ett fel.

    Hämtningen är ett eget steg (hamta_gymnasieelever.py), och sidan ska
    gå att bygga utan den – då blir nybörjardelen tom i stället för att
    bygget stannar.
    """
    argangar = []
    for fil in sorted(ELEVKALLA.glob("gymnasieelever_*.json")):
        with open(fil, encoding="utf-8") as f:
            argangar.append(json.load(f))
    return sorted(argangar, key=lambda a: a["ar"])


def elevtal(elevargangar):
    """Delar upp elevtalen i programserier och summeringsrader.

    Ger (per_program, summor, ar_lista). Programnamnen normaliseras med
    samma nycklingsrutin som handlingarnas namn, så att en serie hittar
    rätt oavsett hur källan skriver bindestrecken. Bara huvudmannatypen
    Kommunal blir programserier – det är de skolor utbudsbeslutet gäller.
    """
    per_program, summor, ar_lista = {}, {}, []
    for argang in elevargangar:
        ar = str(argang["ar"])
        ar_lista.append(argang["ar"])
        for rad in argang["rader"]:
            namn = rad["program"]
            if namn in SUMMARADER:
                falt = SUMMARADER[namn]
                if rad["huvudman"] == ELEVHUVUDMAN:
                    summor.setdefault(ar, {})[falt] = rad["arskurs1"]
                elif rad["huvudman"] == ALLA_HUVUDMAN:
                    summor.setdefault(ar, {})[falt + "AllaHuvudman"] = rad["arskurs1"]
                continue
            if rad["huvudman"] != ELEVHUVUDMAN:
                continue
            nyckel = nyckla(namn)
            dagens = KANDA.get(nyckel) or programnamn(namn)
            # Summera, skriv inte över. Under reformåren står det gamla och
            # det nya namnet som var sin rad samma läsår – 2022 och 2023 har
            # både Handels- och administrationsprogrammet och Försäljnings-
            # och serviceprogrammet. Båda hör till samma serie, och den som
            # råkar stå sist i filen får inte radera den andra.
            ar_till_tal = per_program.setdefault(dagens, {})
            ar_till_tal[ar] = ar_till_tal.get(ar, 0) + rad["arskurs1"]
    return per_program, summor, ar_lista


def bygg(argangar, elevargangar=None):
    ar_lista = [a["antagningsar"] for a in argangar]
    okanda = set()
    elev_per_program, elev_summor, elevar = elevtal(elevargangar or [])

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
            # Hur många som gick första året på programmet det läsåret.
            # Null när Skolverket inte publicerat läsåret än – aldrig
            # noll, som vore påståendet att ingen började.
            borjade = elev_per_program.get(serie["namn"], {}).get(ar)
            varden[ar] = {
                "platser": post["platser"],
                "varavIMV": post["varavIMV"],
                "elever": post["elever"],
                "borjade": borjade,
                # Avståndet mellan beslutet och utfallet: hur många fler
                # (+) eller färre (−) som gick första året än det fanns
                # platser. Null när elevtalet saknas – aldrig noll, som
                # vore påståendet att beslutet träffade precis.
                "skillnad": None if borjade is None
                else borjade - post["platser"],
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
            # Hela nybörjarserien, även de år som ligger före första
            # utbudsbeslutet. Tom när programmet aldrig funnits på en
            # kommunal skola i Skolverkets redovisning.
            "borjade": dict(sorted(
                elev_per_program.get(serie["namn"], {}).items())),
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
        # Jämförelsen mellan beslut och utfall räknas över de program som
        # har båda talen det året, och över dem på båda sidorna. Ett
        # program utan elevtal får alltså inte heller sina platser med:
        # annars vore differensen delvis ett mått på vilka rader som fanns.
        jamforbara = [p for p in nationella
                      if p["varden"][s]["borjade"] is not None]
        sammanfattning.append({
            "ar": ar,
            "platser": sum(p["varden"][s]["platser"] for p in nationella),
            # Null, inte noll: handlingarna från 2025 och framåt räknar inte
            # upp utbildningarna utanför programmen, och att skriva noll vore
            # att påstå att de lagts ned.
            "platserOvrigt": sum(p["varden"][s]["platser"] for p in ovriga)
            if ovriga else None,
            "antalProgram": len(nationella),
            # Skolverkets summering, inte summan av programserierna:
            # rapporten räknar också program som inte står i handlingen.
            "borjade": elev_summor.get(s, {}).get("nationella"),
            # Null de år elevtalen ännu inte publicerats. Antalet program
            # följer med: det är inte självklart lika med antalProgram.
            "jamforelse": {
                "antalProgram": len(jamforbara),
                "platser": sum(p["varden"][s]["platser"] for p in jamforbara),
                "borjade": sum(p["varden"][s]["borjade"] for p in jamforbara),
                "skillnad": sum(p["varden"][s]["skillnad"] for p in jamforbara),
            } if jamforbara else None,
        })

    return {
        "kommun": "Kungsbacka",
        "serie": "Platser på gymnasieprogrammen",
        "ar": ar_lista,
        "skolor": [s["kort"] for s in SKOLOR],
        "program": program,
        "sammanfattning": sammanfattning,
        # Nybörjarserien för sig, med sin egen årslista: den är längre än
        # platsserien och får inte tvinga in tomma år i platsdiagrammen.
        "borjade": {
            "matt": "Antal elever i årskurs 1 den 15 oktober",
            "huvudman": ELEVHUVUDMAN,
            "ar": elevar,
            "sammanfattning": [
                dict(ar=a, **elev_summor.get(str(a), {})) for a in elevar
            ],
            "kallor": [{
                "ar": a["ar"],
                "lasar": a["lasar"],
                "rapportTitel": a["rapportTitel"],
                "kalla": a["kalla"],
                "kallaUrl": a["kallaUrl"],
                "statistikUrl": a["statistikUrl"],
                "hamtad": a["hamtad"],
            } for a in (elevargangar or [])],
        } if elevar else None,
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
    elevargangar = las_elevargangar()
    data, okanda = bygg(argangar, elevargangar)
    for namn in sorted(okanda):
        print(f"# VARNING: okänt program: {namn}", file=sys.stderr)
    with open(UT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    borjade = data["borjade"]
    print(f"{UT.relative_to(ROT)}: {len(data['program'])} program, "
          f"{len(data['ar'])} platsår ({data['ar'][0]}–{data['ar'][-1]}), "
          + (f"{len(borjade['ar'])} elevår "
             f"({borjade['ar'][0]}–{borjade['ar'][-1]})"
             if borjade else "inga elevår"))


if __name__ == "__main__":
    main()
