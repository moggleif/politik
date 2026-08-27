#!/usr/bin/env python3
"""Bygger docs/data-meritvarden.json av data/antagning/antagning_*.json.

Varje inläst rapport är en årgång av GR:s slutantagning. Här sätts
årgångarna ihop till tidsserier per utbildning, vilket kräver att samma
utbildning känns igen från år till år trots att rapporterna skrivit
namnen olika. Tre saker skiljer sig åt:

  programkoden   "Barn- och fritidsprogrammet BF" (2017–2024) mot
                 "Barn- och fritidsprogrammet" (2025–)
  ordföljden     "Särskild variant inom det estetiska området, bild" mot
                 "Bild, Särskild variant inom det estetiska området"
  stavningen     "lärling" mot "Lärling", "anställd lärling" mot "Anställd
                 lärling", och inriktningar som upprepar programnamnet

Programnamn som bytts av en skolreform (Handels- och administrations-
programmet ersattes 2021 av Försäljnings- och serviceprogrammet) slås
däremot INTE ihop. Det är olika utbildningar med olika innehåll, och en
linje som byter namn mitt i skulle dölja just det.

Körs:  python3 scripts/build_meritvarden.py
"""

import json
import re
import unicodedata
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent

SKOLOR = [
    {"id": "aranas", "namn": "Aranäsgymnasiet", "kort": "Aranäs"},
    {"id": "elof", "namn": "Elof Lindälvs gymnasium", "kort": "Elof Lindälv"},
]
KORT = {s["namn"]: s["kort"] for s in SKOLOR}

# Gymnasieskolans nationella program, med den indelning som styr hur
# utbildningarna grupperas på sidan. Listan är också en kontroll: ett
# program som inte står här är ett tecken på att namnet lästs fel.
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
    "Handels- och administrationsprogrammet",
    "Hantverksprogrammet",
    "Hotell- och turismprogrammet",
    "Industritekniska programmet",
    "Naturbruksprogrammet",
    "Restaurang- och livsmedelsprogrammet",
    "VVS- och fastighetsprogrammet",
    "Vård- och omsorgsprogrammet",
}

# Programnamn som behöver städas innan de matchar listorna ovan.
PROGRAM_ALIAS = {
    # 2017 skrev in hela lärlingsupplägget i programnamnet
    "Industritekniska programmet (Svensk Gymnasial lärlingsutbildning "
    "med anställning, GLA)": "Industritekniska programmet",
    # 2025 och 2026 skriver introduktionsprogrammets del som en del av namnet
    "Introduktionsprogram, Programinriktat val": "Introduktionsprogram",
    "Introduktionsprogram Programinriktat val": "Introduktionsprogram",
    "Introduktionsprogram Yrkesintroduktion": "Introduktionsprogram",
}

# Inriktningsnamn som betyder samma sak men skrivits olika mellan åren.
# Nyckeln är normaliserad (gemener, utan skiljetecken) – se nyckla().
INRIKTNING_ALIAS = {
    "larling": "Lärling",
    "anstalld larling": "Anställd lärling",
    "svensk gymnasial larlingsutbildning med anstallning gla": "Anställd lärling",
    "hotell och turism": "",
    "forsaljnings och service": "",
    "vard och omsorg": "",
}


def nyckla(text: str) -> str:
    """Jämförbar form: gemener, utan accenter och skiljetecken."""
    t = unicodedata.normalize("NFKD", text.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return " ".join(t.split())


def dela_utbildning(text: str):
    """Delar "Program KOD - Inriktning" i program och inriktning."""
    text = text.strip()
    m = re.match(r"^(.*?)\s([A-ZÅÄÖ]{2})(?:\s*-\s*(.*))?$", text)
    if m:
        program, inriktning = m.group(1).strip(), (m.group(3) or "").strip()
    elif " - " in text:
        program, inriktning = (d.strip() for d in text.split(" - ", 1))
    else:
        program, inriktning = text, ""

    program = PROGRAM_ALIAS.get(program, program)

    # En inriktning som bara upprepar programnamnet är ingen inriktning.
    if nyckla(inriktning) == nyckla(program):
        inriktning = ""
    inriktning = INRIKTNING_ALIAS.get(nyckla(inriktning), inriktning)
    return program, inriktning


# Delar av ett inriktningsnamn som betyder samma sak. "anställd lärling"
# och "lärling" är samma upplägg – rapporterna skrev om det 2025.
DELALIAS = {"anstalld larling": "larling"}


def inriktningsnyckel(inriktning: str) -> str:
    """Samma inriktning oavsett i vilken ordning delarna skrivits.

    "Särskild variant inom det estetiska området, bild" och "Bild, Särskild
    variant inom det estetiska området" är samma utbildning.
    """
    delar = [nyckla(d) for d in inriktning.split(",") if d.strip()]
    return " | ".join(sorted(DELALIAS.get(d, d) for d in delar))


def typ_av(program: str) -> str:
    if program.startswith("Introduktionsprogram"):
        return "introduktion"
    if program in HOGSKOLEFORBEREDANDE:
        return "hogskoleforberedande"
    if program in YRKESPROGRAM:
        return "yrkesprogram"
    return "okant"


def medel(varden):
    return round(sum(varden) / len(varden), 2) if varden else None


def bygg(argangar: list) -> dict:
    ar_lista = sorted(a["ar"] for a in argangar)

    # (skola, program, inriktningsnyckel) -> serie
    serier = {}
    okanda = set()

    for argang in argangar:
        ar = str(argang["ar"])
        for rad in argang["utbildningar"]:
            program, inriktning = dela_utbildning(rad["utbildning"])
            if typ_av(program) == "okant":
                okanda.add(program)
            nyckel = (rad["skola"], program, inriktningsnyckel(inriktning))
            serie = serier.setdefault(nyckel, {
                "skola": rad["skola"],
                "program": program,
                "inriktning": inriktning,
                "typ": typ_av(program),
                "varden": {},
            })
            # Senaste årets stavning vinner – den är den som gäller i dag.
            serie["inriktning"] = inriktning
            serie["varden"][ar] = {
                "medel": rad["medelmeritvarde"],
                "poang": rad["antagningspoang"],
                "kod": rad["antagningspoangKod"],
                "utanPlatser": rad["utanLedigaPlatser"],
            }

    utbildningar = []
    for serie in serier.values():
        medelar = {a: v["medel"] for a, v in serie["varden"].items() if v["medel"] is not None}
        serie["namn"] = serie["program"] + (
            " – " + serie["inriktning"] if serie["inriktning"] else "")
        serie["skolaKort"] = KORT[serie["skola"]]
        serie["antalArMedMedel"] = len(medelar)
        if medelar:
            forsta, sista = min(medelar), max(medelar)
            serie["forstaAr"], serie["sistaAr"] = int(forsta), int(sista)
            serie["forsta"], serie["sista"] = medelar[forsta], medelar[sista]
            # Förändringen är bara meningsfull mellan två skilda år
            serie["forandring"] = (round(medelar[sista] - medelar[forsta], 2)
                                   if forsta != sista else None)
        else:
            serie["forstaAr"] = serie["sistaAr"] = None
            serie["forandring"] = None
        utbildningar.append(serie)

    utbildningar.sort(key=lambda s: (s["skola"], s["program"], s["inriktning"]))

    # Programserier. Kungsbacka flyttar program mellan sina två
    # gymnasieskolor, och en serie per skola skulle då brytas mitt i av en
    # organisationsförändring i stället för av att utbildningen ändrats.
    # Serien följer därför programmet, inte skolan:
    #
    #   flyttat program   Har programmet legat på flera skolor utan att
    #                     något år finnas på båda, är det samma utbildning
    #                     som bytt hus. Åren slås ihop till en serie, med
    #                     den skola som har programmet i dag som hemvist –
    #                     det gamla datat följer med.
    #   dubblett          Fanns programmet på båda skolorna samma år är det
    #                     två utbildningar som konkurrerar om samma sökande.
    #                     Då hålls skolorna isär, en serie var, och skolans
    #                     namn skrivs ut i etiketten.
    #
    # Inom en och samma skola och år kan programmet ha flera inriktningar.
    # De vägs ihop ovägt, av samma skäl som tidigare: rapporterna säger inte
    # hur många som antogs, så varje annan vikt vore påhittad.
    def skolordning(namn):
        return [x["namn"] for x in SKOLOR].index(namn)

    per_program = {}
    for u in utbildningar:
        if u["typ"] == "introduktion":
            continue
        per_skola = per_program.setdefault(u["program"], {})
        for ar_s, v in u["varden"].items():
            if v["medel"] is None:
                continue
            per_skola.setdefault(u["skola"], {}).setdefault(ar_s, []).append(v["medel"])

    def gruppera(per_skola: dict) -> list:
        """Delar upp skolorna i serier: hopslagna om åren inte överlappar."""
        kvar = sorted(per_skola,
                      key=lambda n: (-max(int(a) for a in per_skola[n]), skolordning(n)))
        grupper = []
        while kvar:
            hem = kvar.pop(0)                 # skolan med programmet senast
            grupp, ar_i_grupp = [hem], set(per_skola[hem])
            for annan in list(kvar):
                if not ar_i_grupp & set(per_skola[annan]):
                    grupp.append(annan)
                    ar_i_grupp |= set(per_skola[annan])
                    kvar.remove(annan)
            grupper.append((hem, grupp))
        return grupper

    program = []
    for namn in sorted(per_program):
        per_skola = per_program[namn]
        grupper = gruppera(per_skola)
        for hem, grupp in grupper:
            varden = {}
            for skola in grupp:
                for ar_s, lista in per_skola[skola].items():
                    varden[ar_s] = {
                        "medel": medel(lista),
                        "antal": len(lista),
                        "skola": KORT[skola],
                    }
            serie = {
                "namn": namn,
                # Skolan skrivs bara ut när programmet gått parallellt på
                # båda skolorna – annars säger den inget läsaren behöver.
                "etikett": namn + (" (%s)" % KORT[hem] if len(grupper) > 1 else ""),
                "hem": KORT[hem],
                "skolor": [KORT[s] for s in sorted(grupp, key=skolordning)],
                "typ": typ_av(namn),
                "varden": varden,
            }
            medelar = {a: v["medel"] for a, v in varden.items()}
            serie["antalArMedMedel"] = len(medelar)
            if medelar:
                forsta, sista = min(medelar), max(medelar)
                serie["forstaAr"], serie["sistaAr"] = int(forsta), int(sista)
                serie["forsta"], serie["sista"] = medelar[forsta], medelar[sista]
                serie["forandring"] = (round(medelar[sista] - medelar[forsta], 2)
                                       if forsta != sista else None)
            else:
                serie["forstaAr"] = serie["sistaAr"] = None
                serie["forandring"] = None
            program.append(serie)
    program.sort(key=lambda p: p["etikett"])

    # Sammanfattning per år för kommunens båda skolor tillsammans.
    # Medelvärdet är ovägt: varje utbildning räknas lika mycket oavsett hur
    # många elever som antogs, eftersom rapporten inte redovisar antalet.
    # Det står också i sidans text.
    nationella = [u for u in utbildningar if u["typ"] != "introduktion"]
    sammanfattning = []
    for ar in ar_lista:
        poster = [u["varden"][str(ar)] for u in nationella if str(ar) in u["varden"]]
        varden = [p["medel"] for p in poster if p["medel"] is not None]
        if not varden:
            continue
        # Hur rapporten säger att alla behöriga sökande kom in har bytt
        # form. Till och med 2024 stod fotnoten 1) i stället för en
        # antagningspoäng; från 2025 skrivs poängen alltid ut, och de
        # utbildningar som inte hade några lediga platser kvar markeras i
        # stället med fet stil. De två markörerna är varandras spegelbild –
        # utom i gränsfallet där antalet behöriga sökande exakt fyllde
        # platserna, som räknas åt olika håll. Vilken markör året vilar på
        # följer med i utdatan.
        fetstil = any(p["utanPlatser"] is not None for p in poster)
        if fetstil:
            med_grans = sum(1 for p in poster if p["utanPlatser"])
            alla_antagna = sum(1 for p in poster
                               if p["utanPlatser"] is False and p["poang"] is not None)
        else:
            med_grans = sum(1 for p in poster if p["poang"] is not None)
            alla_antagna = sum(1 for p in poster if p["kod"] == "1")
        sammanfattning.append({
            "ar": ar,
            "antal": len(varden),
            "medel": medel(varden),
            "lagsta": min(varden),
            "hogsta": max(varden),
            "antalUtbildningar": len(poster),
            "allaAntagna": alla_antagna,
            "medGrans": med_grans,
            "ovrigt": len(poster) - alla_antagna - med_grans,
            "markor": "fetstil" if fetstil else "fotnot",
        })

    # Yrkesprogram mot högskoleförberedande, per år, båda skolorna ihop.
    per_typ = []
    for typ in ("hogskoleforberedande", "yrkesprogram"):
        rad = {"typ": typ, "varden": {}}
        for ar in ar_lista:
            varden = [u["varden"][str(ar)]["medel"] for u in nationella
                      if u["typ"] == typ and str(ar) in u["varden"]
                      and u["varden"][str(ar)]["medel"] is not None]
            if varden:
                rad["varden"][str(ar)] = {"medel": medel(varden), "antal": len(varden)}
        if rad["varden"]:
            per_typ.append(rad)

    return {
        "kommun": "Kungsbacka",
        "serie": "Meritvärden vid antagningen till gymnasiet",
        "ar": ar_lista,
        "skolor": SKOLOR,
        "program": program,
        "utbildningar": utbildningar,
        "sammanfattning": sammanfattning,
        "perTyp": per_typ,
        "kallor": [{
            "ar": a["ar"],
            "rapportTitel": a["rapportTitel"],
            "kalla": a["kalla"],
            "kallaUrl": a["kallaUrl"],
            "arkivUrl": a["arkivUrl"],
            "lokalPdf": a["lokalPdf"],
            "hamtad": a["hamtad"],
        } for a in sorted(argangar, key=lambda a: a["ar"])],
    }, okanda


def main() -> None:
    filer = sorted((ROT / "data" / "antagning").glob("antagning_*.json"))
    if not filer:
        raise SystemExit("Hittar inga filer i data/antagning/")
    argangar = [json.loads(f.read_text(encoding="utf-8")) for f in filer]

    ut, okanda = bygg(argangar)
    for program in sorted(okanda):
        print(f"VARNING: okänt program {program!r} – kontrollera inläsningen")

    utfil = ROT / "docs" / "data-meritvarden.json"
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    med_serie = sum(1 for u in ut["utbildningar"] if u["antalArMedMedel"] >= 2)
    print(f"Skrev {utfil.name}: {len(ut['ar'])} år ({ut['ar'][0]}–{ut['ar'][-1]}), "
          f"{len(ut['utbildningar'])} utbildningar, "
          f"{med_serie} med mätvärden för minst två år")


if __name__ == "__main__":
    main()
