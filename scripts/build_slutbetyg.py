#!/usr/bin/env python3
"""Bygger docs/data-slutbetyg.json av data/slutbetyg/slutbetyg_*.json.

Varje inläst årgång är ett läsår ur Skolverkets statistik över
avgångseleverna. Här sätts årgångarna ihop till tidsserier – en serie per
utbildning, inte per skola, eftersom kommunen flyttar program mellan sina
gymnasieskolor och en linje som bryts vid varje flytt döljer just det som
är intressant. Tre saker måste hanteras på vägen:

  skolenheterna   Skolverket redovisar per skolenhet, inte per skola.
                  Aranäsgymnasiet har haft upp till sex enheter samtidigt
                  och Elof Lindälv sex – och ett program kan ligga på två
                  enheter samma år. Enheterna vägs därför ihop till skola
                  med antalet avgångselever som vikt. Det är en riktig
                  vikt, till skillnad från meritvärdessidans ovägda snitt:
                  den här rapporten redovisar antalet elever.

  skolnamnen      Rapporterna skriver samma skola olika mellan åren:
                  "Elof Lindälvs gymn" mot "Elof Lindälvs Gymnasium".
                  Namnbyten som bara är namnbyten slås ihop.

  flytt mot       Redovisas ett program på två skolor samma år är det två
  parallell       utbildningar som konkurrerar, och båda behåller sin egen
  utbildning      serie med skolan i namnet. Redovisas det bara på en skola
                  i taget blir det en enda serie som tar de gamla åren med
                  sig, oavsett vilken skola de kommer från. Vilken skola
                  varje enskilt år hör till följer med i utdatan, så att
                  sidan kan skriva ut det.

Sidan visar Aranäsgymnasiet och Elof Lindälvs gymnasium. Skolverkets
statistik gäller skolkommun och omfattar därför samtliga skolenheter i
Kungsbacka – också de fristående skolorna och Beda Hallbergs gymnasium.
Deras rader läses in men sorteras bort här, summeringsraderna med, så att
sammanfattningen räknar på samma elever som programmen.

Program som bytt namn slås ihop till en serie under det namn de har i
dag – Handels- och administrationsprogrammet heter sedan 2021
Försäljnings- och serviceprogrammet. Samma regel som på
meritvärdessidan, så att de två sidorna går att läsa mot varandra.

Körs:  python3 scripts/build_slutbetyg.py
"""

import json
import re
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent

# Skolans namn utan enhetsnummer, som det ska stå på sidan. Nyckeln är det
# rapporten skriver; värdet det namn skolan går under i dag. Står en skola
# inte här varnar bygget – ett okänt namn är oftast en skola som bytt namn
# och som annars skulle bli två linjer i stället för en. Skolorna som inte
# ska med står kvar i listan just därför: en bortsorterad skola ska gå att
# skilja från en okänd.
SKOLNAMN = {
    "Aranäsgymnasiet": "Aranäsgymnasiet",
    "Elof Lindälvs gymn": "Elof Lindälvs gymnasium",
    "Elof Lindälvs Gymnasium": "Elof Lindälvs gymnasium",
    "Beda Hallbergs gymnasium": "Beda Hallbergs gymnasium",
    "Drottning Blankas Gymn. Kungsbacka": "Drottning Blankas gymnasieskola",
    "Drottning Blankas Gymnasieskola Kungsbacka": "Drottning Blankas gymnasieskola",
    "LBS Ljud & Bildskolan Kungsbacka": "LBS Kreativa Gymnasiet",
    "LBS Kreativa Gymnasiet Kungsbacka": "LBS Kreativa Gymnasiet",
    "Praktiska Kungsbacka": "Praktiska Gymnasiet",
    "Praktiska Gymnasiet Kungsbacka": "Praktiska Gymnasiet",
    "Sveriges Ridgymnasium Kungsbacka": "Sveriges Ridgymnasium",
}

# Skolorna sidan visar, med den korta form som används när ett programnamn
# behöver skiljas på skola i ett diagram. Rader från övriga skolenheter i
# rapporten sorteras bort.
SKOLOR = [
    ("Aranäsgymnasiet", "Aranäs"),
    ("Elof Lindälvs gymnasium", "Elof Lindälv"),
]
SKOLORDNING = [namn for namn, _ in SKOLOR]
KORTNAMN = dict(SKOLOR)
MEDTAGNA = set(SKOLORDNING)

# Rapportens sammanräknade rader. De är inte program utan summeringar av
# enhetens program, och används till avsnittet om programgrupperna.
SUMMARADER = {
    "Nationella program": "alla",
    "Högskoleförberedande program": "hogskoleforberedande",
    "Yrkesprogram": "yrkesprogram",
}

# Program som bytt namn. Nyckeln är det gamla namnet, värdet det namn
# programmet går under i dag. Handels- och administrationsprogrammet
# ersattes vid gymnasiereformen 2021 av Försäljnings- och
# serviceprogrammet; innehållet gjordes om, men det är samma utbildning
# som förts vidare, så åren läggs i samma serie.
PROGRAM_ALIAS = {
    "Handels- och administrationsprogrammet": "Försäljnings- och serviceprogrammet",
}

# Samma indelning som på meritvärdessidan, och samma kontroll: ett program
# som inte står här är ett tecken på att rapporten ändrat namnsättning.
# Gamla namn i PROGRAM_ALIAS behöver inte stå här – de byts ut först.
HOGSKOLEFORBEREDANDE = {
    "Ekonomiprogrammet",
    "Estetiska programmet",
    "Humanistiska programmet",
    "International Baccalaureate",
    "Naturvetenskapsprogrammet",
    "Samhällsvetenskapsprogrammet",
    "Teknikprogrammet",
}
YRKESPROGRAM = {
    "Barn- och fritidsprogrammet",
    "Bygg- och anläggningsprogrammet",
    "El- och energiprogrammet",
    "Fordons- och transportprogrammet",
    "Försäljnings- och serviceprogrammet",
    "Hantverksprogrammet",
    "Hotell- och turismprogrammet",
    "Industritekniska programmet",
    "Naturbruksprogrammet",
    "Restaurang- och livsmedelsprogrammet",
    "VVS- och fastighetsprogrammet",
    "Vård- och omsorgsprogrammet",
}

# Talen som vägs ihop från skolenhet till skola. Alla är medelvärden eller
# andelar per elev, så vikten är antalet avgångselever i varje fall.
MATT = ("betygspoang", "betygspoangExamen", "andelExamen",
        "andelGrundlBehorighet")


def skolnamn(skolenhet: str, okanda: set) -> str:
    namn = re.sub(r"\s+Enhet\s+\d+$", "", skolenhet.strip())
    if namn not in SKOLNAMN:
        okanda.add(namn)
    return SKOLNAMN.get(namn, namn)


def programnamn(program: str) -> str:
    return PROGRAM_ALIAS.get(program.strip(), program.strip())


def typ_av(program: str) -> str:
    if program in HOGSKOLEFORBEREDANDE:
        return "hogskoleforberedande"
    if program in YRKESPROGRAM:
        return "yrkesprogram"
    return "okant"


def vag_ihop(rader: list) -> dict:
    """Väger ihop skolenheternas rader till en siffra per mått.

    Varje mått vägs för sig, med antalet elever i de rader som faktiskt
    redovisar måttet. En rad kan ha betygspoäng men dold examensandel, och
    då ska examensandelen inte tyst få en vikt den inte har.
    """
    ut = {"antal": sum(r["antal"] for r in rader if r["antal"] is not None) or None}
    for matt in MATT:
        med = [r for r in rader
               if r.get(matt) is not None and r["antal"] not in (None, 0)]
        vikt = sum(r["antal"] for r in med)
        ut[matt] = round(sum(r[matt] * r["antal"] for r in med) / vikt, 2) if vikt else None
        # Hur stor del av eleverna måttet faktiskt bygger på. Är den mindre
        # än hela årskullen saknas en eller flera enheter i snittet.
        ut[matt + "Vikt"] = vikt or None
    ut["enheter"] = len(rader)
    ut["dolda"] = sum(1 for r in rader if r["antal"] is None)
    return ut


def har_nagot(varde: dict) -> bool:
    """Redovisar årgången något alls för utbildningen?"""
    return any(varde.get(m) is not None for m in MATT)


def nyckel_skola(skola: str) -> int:
    return SKOLORDNING.index(skola) if skola in SKOLORDNING else len(SKOLORDNING)


def gor_serie(program: str, skolor_har: dict, med_data: dict, delad: bool) -> dict:
    """En serie ur en eller flera skolors årgångar av samma program.

    Är serien odelad har programmet legat på en skola i taget, och åren
    läggs efter varandra till en enda linje: flyttar programmet tar det
    de gamla åren med sig. Året hämtas från den skola som redovisar det.
    """
    varden = {}
    for skola in sorted(skolor_har, key=nyckel_skola):
        for ar, v in skolor_har[skola].items():
            # Den skola som faktiskt redovisar året vinner. Övriga skolors
            # rader för samma år är tomma och skulle bara skugga det.
            if ar in varden and not har_nagot(v):
                continue
            varden[ar] = dict(v, skola=skola)

    poang = {a: v["betygspoang"] for a, v in varden.items()
             if v["betygspoang"] is not None}

    # Var programmet ligger nu: skolan i det senaste året som redovisats.
    historik = [{"skola": skola,
                 "forstaAr": ar[0],
                 "sistaAr": ar[-1]}
                for skola, ar in sorted(med_data.items(),
                                        key=lambda kv: (kv[1][0], nyckel_skola(kv[0])))]
    nuvarande = max(historik, key=lambda h: h["sistaAr"])["skola"] if historik \
        else sorted(skolor_har, key=nyckel_skola)[0]

    serie = {
        "program": program,
        "skola": nuvarande,
        "skolar": sorted(skolor_har, key=nyckel_skola),
        "skolhistorik": historik,
        "delad": delad,
        # Namnet bär skolan bara när den behövs för att skilja två
        # utbildningar åt. Ett program som flyttat är fortfarande ett program.
        "namn": f"{program} – {KORTNAMN.get(nuvarande, nuvarande)}" if delad else program,
        "typ": typ_av(program),
        "varden": varden,
        "antalArMedPoang": len(poang),
    }
    if poang:
        forsta, sista = min(poang), max(poang)
        serie["forstaAr"], serie["sistaAr"] = int(forsta), int(sista)
        serie["forsta"], serie["sista"] = poang[forsta], poang[sista]
        serie["forstaSkola"] = varden[forsta]["skola"]
        serie["sistaSkola"] = varden[sista]["skola"]
        # Förändringen är bara meningsfull mellan två skilda år
        serie["forandring"] = (round(poang[sista] - poang[forsta], 2)
                               if forsta != sista else None)
    else:
        serie["forstaAr"] = serie["sistaAr"] = None
        serie["forandring"] = None
    return serie


def bygg(argangar: list):
    ar_lista = sorted(a["ar"] for a in argangar)
    okanda_skolor, okanda_program = set(), set()

    # (program, skola) -> värden per år, och grupp -> summering per år för
    # hela kommunen. Sidan visar programmen, inte skolorna, så grupperna
    # summeras över samtliga skolor.
    per_skola = {}
    grupper = {}

    bortsorterade = 0
    for argang in argangar:
        ar = str(argang["ar"])

        # Först: samla rader per (program, skola) inom årgången, eftersom
        # ett program kan ligga på flera skolenheter samma år.
        rader_program, rader_grupp = {}, {}
        for rad in argang["rader"]:
            skola = skolnamn(rad["skolenhet"], okanda_skolor)
            if skola not in MEDTAGNA:
                # Rapporten gäller skolkommun och tar med varje skolenhet i
                # Kungsbacka. Summeringsraderna hör till sin skolenhet och
                # faller därför bort på samma villkor som programraderna.
                bortsorterade += 1
                continue
            if rad["program"] in SUMMARADER:
                rader_grupp.setdefault(SUMMARADER[rad["program"]], []).append(rad)
                continue
            program = programnamn(rad["program"])
            if typ_av(program) == "okant":
                okanda_program.add(program)
            rader_program.setdefault((program, skola), []).append(rad)

        for nyckel, rader in rader_program.items():
            per_skola.setdefault(nyckel, {})[ar] = vag_ihop(rader)
        for grupp, rader in rader_grupp.items():
            grupper.setdefault(grupp, {})[ar] = vag_ihop(rader)

    utbildningar = []
    for program in sorted({p for p, _ in per_skola}):
        skolor_har = {s: v for (p, s), v in per_skola.items() if p == program}

        # Vilka år varje skola faktiskt redovisar programmet. Rader utan en
        # enda siffra räknas inte – de flesta skolor har rader för program
        # med så få avgångselever att allt är dubbelprickat, och de säger
        # inget om var programmet legat.
        med_data = {s: sorted(int(a) for a, v in varden.items() if har_nagot(v))
                    for s, varden in skolor_har.items()}
        med_data = {s: ar for s, ar in med_data.items() if ar}
        if not med_data:
            # Programmet finns i rapporten men har aldrig redovisats.
            med_data = {s: sorted(int(a) for a in varden)
                        for s, varden in skolor_har.items()}

        # Låg programmet på två skolor samtidigt är det två utbildningar,
        # inte en – då behåller vi uppdelningen. Har det bara flyttat blir
        # det en enda serie som tar de gamla åren med sig.
        delad = any(sum(1 for ar in med_data.values() if a in ar) > 1
                    for a in ar_lista)

        if delad:
            for skola in sorted(med_data, key=nyckel_skola):
                utbildningar.append(gor_serie(
                    program, {skola: skolor_har[skola]}, {skola: med_data[skola]},
                    delad=True))
        else:
            utbildningar.append(gor_serie(program, skolor_har, med_data, delad=False))

    utbildningar.sort(key=lambda s: (s["typ"] != "hogskoleforberedande", s["namn"]))

    skolor = [{"id": re.sub(r"[^a-z]+", "-", namn.lower()),
               "namn": namn, "kort": kort}
              for namn, kort in SKOLOR
              if any(namn in u["skolar"] for u in utbildningar)]

    # Sammanfattning per år för hela kommunen, ur rapportens egen summering
    # för samtliga nationella program. Antalet elever utan examen räknas
    # fram ur andelen, så att avsnittet kan visa hela årskullen som staplar.
    sammanfattning = []
    for ar in ar_lista:
        alla = grupper.get("alla", {}).get(str(ar))
        if not alla or alla["antal"] is None:
            continue
        redovisade = [u for u in utbildningar if str(ar) in u["varden"]]
        med_poang = [u for u in redovisade
                     if u["varden"][str(ar)]["betygspoang"] is not None]
        med_examen = (round(alla["antal"] * alla["andelExamen"] / 100)
                      if alla["andelExamen"] is not None else None)
        sammanfattning.append({
            "ar": ar,
            "antal": alla["antal"],
            "betygspoang": alla["betygspoang"],
            "betygspoangExamen": alla["betygspoangExamen"],
            "andelExamen": alla["andelExamen"],
            "andelGrundlBehorighet": alla["andelGrundlBehorighet"],
            "medExamen": med_examen,
            "utanExamen": (alla["antal"] - med_examen
                           if med_examen is not None else None),
            "antalProgram": len(redovisade),
            "programMedPoang": len(med_poang),
        })

    # Yrkesprogram mot högskoleförberedande, per år, hela kommunen. Också ur
    # rapportens egen summering – den räknar med de program som är för små
    # för att redovisas var för sig.
    per_typ = []
    for grupp in ("hogskoleforberedande", "yrkesprogram"):
        varden = {a: v for a, v in grupper.get(grupp, {}).items()
                  if v["betygspoang"] is not None}
        if varden:
            per_typ.append({"typ": grupp, "varden": varden})

    ut = {
        "kommun": "Kungsbacka",
        "serie": "Slutbetyg från gymnasiet",
        "matt": {
            "betygspoang": "Genomsnittlig betygspoäng, samtliga avgångselever",
            "betygspoangExamen": "Genomsnittlig betygspoäng, elever med examen",
            "andelExamen": "Andel (%) med gymnasieexamen",
            "andelGrundlBehorighet": "Andel (%) med grundläggande högskolebehörighet",
        },
        "maxPoang": 20,
        "ar": ar_lista,
        "skolor": skolor,
        "utbildningar": utbildningar,
        "sammanfattning": sammanfattning,
        "perTyp": per_typ,
        "kallor": [{
            "ar": a["ar"],
            "lasar": a["lasar"],
            "rapportTitel": a["rapportTitel"],
            "kalla": a["kalla"],
            "kallaUrl": a["kallaUrl"],
            "statistikUrl": a["statistikUrl"],
            "lokalFil": a["lokalFil"],
            "hamtad": a["hamtad"],
        } for a in sorted(argangar, key=lambda a: a["ar"])],
    }
    return ut, okanda_skolor, okanda_program, bortsorterade


def main() -> None:
    filer = sorted((ROT / "data" / "slutbetyg").glob("slutbetyg_*.json"))
    if not filer:
        raise SystemExit("Hittar inga filer i data/slutbetyg/ – kör "
                         "scripts/hamta_slutbetyg.py först")
    argangar = [json.loads(f.read_text(encoding="utf-8")) for f in filer]

    ut, okanda_skolor, okanda_program, bortsorterade = bygg(argangar)
    for skola in sorted(okanda_skolor):
        print(f"VARNING: okänd skola {skola!r} – lägg till den i SKOLNAMN")
    for program in sorted(okanda_program):
        print(f"VARNING: okänt program {program!r} – kontrollera inläsningen")

    utfil = ROT / "docs" / "data-slutbetyg.json"
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n",
                     encoding="utf-8")

    med_serie = sum(1 for u in ut["utbildningar"] if u["antalArMedPoang"] >= 2)
    print(f"Skrev {utfil.name}: {len(ut['ar'])} år ({ut['ar'][0]}–{ut['ar'][-1]}), "
          f"{len(ut['skolor'])} skolor, {len(ut['utbildningar'])} program, "
          f"{med_serie} med betygspoäng för minst två år "
          f"({bortsorterade} rader från övriga skolor bortsorterade)")


if __name__ == "__main__":
    main()
