#!/usr/bin/env python3
"""Läser platserna per program ur nämndens utbudsbeslut.

Nämnden för Gymnasium & Arbetsmarknad fastställer varje höst hur många
platser kommunens två gymnasieskolor erbjuder på varje program inför
nästa läsår. Talen står i tjänsteskrivelsen i mötets handlingar;
protokollet återger dem inte, det belägger bara att beslutet fattades.

Handlingen har haft tre former, och skriptet klarar alla tre:

  bilaga-2024   "Utbudsplanering 25/26", nämnden 2024-11-20. En bifogad
                tabell per skola med fem talkolumner: organisationen för
                innevarande läsår, antalet elever i årskurs 1 i oktober,
                den planerade organisationen för nästa läsår, och hur
                många av platserna som är sökbara via
                introduktionsprogrammens programinriktade val respektive
                yrkesintroduktion. Ger alltså två läsår i ett dokument.

  tabell-2025   "Planerat utbud på gymnasieskolorna läsår 2026/2027",
                nämnden 2025-10-16. En tabell per skola med två
                talkolumner: antal platser, och varav sökbara via
                programinriktat val.

  lista-2026    "Planerat utbud ... läsår 2027/2028", nämnden 2026-09-17.
                Samma uppgift, men som punktlista i löptext.

Talen sitter i kolumner utan avgränsare i texten, så tabellformerna läses
ur ordens koordinater med rutnätet i pdftabell.py. Namnen skrivs av som
de står i handlingen; normaliseringen hör hemma i build_platser.py, av
samma skäl som på meritvärdessidan.

Körs:  python3 scripts/extrahera_utbud.py docs/rapporter/utbud-2026-2027.pdf
Utskriften är ett JSON-utkast att spara som data/utbud/utbud_<år>.json
efter att källänkarna fyllts i.
"""

import argparse
import json
import re
import sys

try:
    import pdfplumber
except ImportError:
    sys.exit("Saknar pdfplumber. Installera med:  pip install pdfplumber")

from pdftabell import celler, kolumnlinjer, radlinjer, ren

# Kungsbackas två kommunala gymnasieskolor. Handlingarna skriver dem på
# flera sätt – "ELOF LINDÄLV GYMNASIUM", "Elof Lindälvs gymnasieskola",
# "Elof Lindälvs gymnasium" – så de känns igen på ett kännetecknande ord.
SKOLORD = {"aranäs": "Aranäsgymnasiet", "elof": "Elof Lindälvs gymnasium"}


def skolan(text: str):
    """Skolans namn om cellen är en skolrubrik, annars None."""
    liten = text.lower()
    if "program" in liten:          # "Estetiska programmet" är ingen rubrik
        return None
    for ord_, namn in SKOLORD.items():
        if ord_ in liten:
            return namn
    return None


def heltal(text: str):
    """Cellens tal, om den är ett tal. Tomma celler och skräptecken ger None."""
    text = ren(text).strip()
    return int(text) if re.fullmatch(r"\d+", text) else None


def rutnat(sida):
    return celler(sida, kolumnlinjer(sida), radlinjer(sida))


def talkolumner(rader, fran):
    """Kolumnerna som innehåller tal, från vänster till höger."""
    kolumner = set()
    for rad in rader[fran:]:
        for i, cell in enumerate(rad):
            if heltal(cell) is not None:
                kolumner.add(i)
    return sorted(kolumner)


def namnet(rad, forsta_talkolumn):
    """Radens programnamn: allt som står till vänster om talen."""
    return " ".join(ren(c).strip() for c in rad[:forsta_talkolumn] if c.strip()).strip()


# ---------- tabell-2025 ----------

def las_tabell_2025(pdf):
    """En tabell per skola, med kolumnerna antal platser och varav IMV.

    Kolumnrubrikerna står inte alltid rakt ovanför sina tal – på
    Aranässidan delar rutnätet upp "Antal platser" i två celler bredvid
    talkolumnen. Kolumnerna tas därför ur talen själva: tabellen har
    precis två talkolumner, och den vänstra är platserna.
    """
    rader_ut = []
    for sida in pdf.pages:
        rader = rutnat(sida)
        start = next((i + 1 for i, r in enumerate(rader)
                      if any("Antal platser" in ren(c) for c in r)
                      or ("Antal" in " ".join(ren(c) for c in r)
                          and "platser" in " ".join(ren(c) for c in r))), None)
        if start is None:
            continue
        skola = next((skolan(ren(c)) for c in rader[start - 1] if skolan(ren(c))), None)
        if skola is None:
            continue
        kolumner = talkolumner(rader, start)
        if len(kolumner) != 2:
            print(f"# VARNING: {skola}: {len(kolumner)} talkolumner, väntade 2",
                  file=sys.stderr)
            continue
        i_platser, i_varav = kolumner
        for rad in rader[start:]:
            platser = heltal(rad[i_platser])
            if platser is None:
                continue
            rader_ut.append({
                "skola": skola,
                "utbildning": namnet(rad, i_platser),
                "platser": platser,
                "varavPrograminriktatVal": heltal(rad[i_varav]),
                "varavYrkesintroduktion": None,
                "elever": None,
            })
    return rader_ut, "tabell-2025"


# ---------- bilaga-2024 ----------

RUBRIKER = [
    ("organisation", "innevarande"),      # "Organisation läsår 24/25"
    ("oktober", "elever"),                # "ÅK 1 elever oktober 2024"
    ("planerad", "planerad"),             # "Planerad organisation låsår 25/26"
    ("programinriktat", "imv"),
    ("yrkesintroduktion", "imy"),
]

# Ord som bara förekommer i tabellhuvudet. Rubrikraderna går inte att
# känna igen på att de saknar tal – raden med skolans namn bär också
# årtalet 2024 – så de känns igen på vad som står i dem.
RUBRIKORD = ("rganisation", "elever", "oktober", "sökbart", "planerad",
             "programinriktat", "yrkesintroduktion", "läsår", "låsår")


def ar_rubrikrad(rad):
    for cell in rad:
        text = ren(cell).strip()
        if skolan(text) or text == "IM":
            return True
        if any(ord_ in text.lower() for ord_ in RUBRIKORD):
            return True
    return False


def las_bilaga_2024(pdf):
    """Bilagan med två läsår, elevutfall och de två IM-kolumnerna.

    Tabellhuvudet sträcker sig över fyra rutnätsrader och skolans namn
    står i en av dem. Sidan delas i block: rubrikrader känns igen på sina
    ord, resten är data. Varje datablock hör till rubriken närmast före.
    Här står rubrikerna rakt ovanför sina tal, så kolumnerna tas ur dem.
    """
    rader_ut, lasar = [], {}
    for sida in pdf.pages:
        rader = rutnat(sida)
        skola, plats, fortsattning = None, None, ""
        i = 0
        while i < len(rader):
            if ar_rubrikrad(rader[i]):
                block = []
                while i < len(rader) and ar_rubrikrad(rader[i]):
                    block.append(rader[i])
                    i += 1
                ny_skola, ny_plats = tolka_rubrik(block, lasar)
                if ny_plats:
                    skola, plats, fortsattning = ny_skola, ny_plats, ""
                continue
            rad = rader[i]
            i += 1
            if plats is None:
                continue
            namn = namnet(rad, min(plats.values()))
            if heltal(rad[plats["innevarande"]]) is None:
                # Namnet bryts över två rader ("Naturvetenskapsprogrammet +
                # / inriktning estet"); det bärs vidare till talraden.
                fortsattning = (fortsattning + " " + namn).strip()
                continue
            rader_ut.append({
                "skola": skola,
                "utbildning": (fortsattning + " " + namn).strip(),
                "innevarande": heltal(rad[plats["innevarande"]]),
                "planerad": heltal(rad[plats["planerad"]]),
                "elever": heltal(rad[plats["elever"]]),
                "varavPrograminriktatVal": heltal(rad[plats["imv"]])
                if "imv" in plats else None,
                "varavYrkesintroduktion": heltal(rad[plats["imy"]])
                if "imy" in plats else None,
            })
            fortsattning = ""
    return rader_ut, "bilaga-2024", lasar


def tolka_rubrik(block, lasar):
    """Läser skola, kolumnroller och läsår ur ett rubrikblock.

    Ger (skola, kolumnroller) – eller (None, None) om blocket inte är ett
    tabellhuvud. Läsåren skrivs in i lasar, som delas mellan sidorna:
    Elofsidans rubrik säger samma sak som Aranässidans. Bara celler som
    också nämner organisationen räknas, så att årtal i den löpande texten
    inte smyger in.
    """
    bredd = max(len(rad) for rad in block)
    rubrik = ["" for _ in range(bredd)]
    skola = None
    for rad in block:
        for k, cell in enumerate(rad):
            text = ren(cell).strip()
            if skolan(text):
                skola = skolan(text)
            elif text:
                rubrik[k] = (rubrik[k] + " " + text).strip()
    # Tjänsteskrivelsens löptext hamnar också i rutnätet, och den nämner
    # både organisationen och den 23 oktober. Tabellhuvudet känns igen på
    # att det står över flera rader och har elevkolumnens egen rubrik.
    text = " ".join(rubrik).lower()
    if len(block) < 3 or "rganisation" not in text or "åk 1 elever" not in text:
        return None, None
    plats = {}
    for k, cell in enumerate(rubrik):
        liten = cell.lower()
        for nyckelord, roll in RUBRIKER:
            if nyckelord in liten and roll not in plats:
                plats[roll] = k
    saknas = {r for _, r in RUBRIKER[:3]} - set(plats)
    if saknas:
        print(f"# VARNING: hittade inte kolumnerna {sorted(saknas)}", file=sys.stderr)
        return None, None
    # Läsåren läses först när blocket visat sig vara ett tabellhuvud, och
    # bara ur de två kolumner som bär dem. Annars smyger "Utbudsplanering
    # 25/26" ur den löpande texten in som innevarande läsår.
    for roll in ("innevarande", "planerad"):
        m = re.search(r"(\d\d)/(\d\d)", rubrik[plats[roll]])
        if m:
            lasar.setdefault(roll, f"20{m.group(1)}/20{m.group(2)}")
    return skola, plats


# ---------- lista-2026 ----------

# "• El- och energiprogrammet: 60 platser. Utökning med 12 platser."
LISTRAD = re.compile(r"^[•\-\s]*(.+?):\s*(\d+)\s*platser", re.M)
LISTRUBRIK = re.compile(r"Utbudsplanering\s+inför\s+läsåret\s+\S+\s+vid\s+(.+?):", re.I)
# Nationell idrottsutbildning redovisas i samma lista men är inte ett
# program – platserna där ligger inom programmen och skulle dubbelräknas.
NIU = re.compile(r"Utbudsplanering.*NIU", re.I)


def las_lista_2026(pdf):
    """Punktlista i löptext: en rad per program, med platsantalet i klartext."""
    text = "\n".join((sida.extract_text() or "") for sida in pdf.pages)
    rader_ut, skola = [], None
    for stycke in text.split("\n"):
        if NIU.search(stycke):
            skola = None
            continue
        rubrik = LISTRUBRIK.search(stycke)
        if rubrik:
            skola = skolan(rubrik.group(1)) or skola
            continue
        if skola is None:
            continue
        m = LISTRAD.match(stycke)
        if not m:
            continue
        namn = m.group(1).strip().lstrip("0123456789. ")
        rader_ut.append({
            "skola": skola,
            "utbildning": namn,
            "platser": int(m.group(2)),
            "varavPrograminriktatVal": None,
            "varavYrkesintroduktion": None,
            "elever": None,
        })
    return rader_ut, "lista-2026"


# ---------- val av form ----------

def las_handling(sokvag):
    with pdfplumber.open(sokvag) as pdf:
        text = "\n".join((sida.extract_text() or "") for sida in pdf.pages)
        if "Utbudsplanering inför läsåret" in text:
            rader, form = las_lista_2026(pdf)
            return rader, form, {}
        if "ÅK 1 elever" in text:
            rader, form, lasar = las_bilaga_2024(pdf)
            return rader, form, lasar
        rader, form = las_tabell_2025(pdf)
        return rader, form, {}


def lasaret(text):
    m = re.search(r"(20\d\d)\s*[/–-]\s*(20\d\d)", text)
    return f"{m.group(1)}/{m.group(2)}" if m else None


def vald_kolumn(rader, kolumn):
    """Gör bilagans två läsår till en rad var, med samma fält som de andra formerna.

    Elevtalet är årskurs 1 i oktober och hör till det innevarande läsåret.
    IM-kolumnerna står till höger om den planerade organisationen och
    läses som en del av den; att de saknar eget läsår i rubriken står i
    data/KALLOR.md.
    """
    ut = []
    for rad in rader:
        planerad = kolumn == "planerad"
        ut.append({
            "skola": rad["skola"],
            "utbildning": rad["utbildning"],
            "platser": rad["planerad"] if planerad else rad["innevarande"],
            "varavPrograminriktatVal": rad["varavPrograminriktatVal"] if planerad else None,
            "varavYrkesintroduktion": rad["varavYrkesintroduktion"] if planerad else None,
            "elever": None if planerad else rad["elever"],
        })
    return ut


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("pdf")
    p.add_argument("--lasar", help="läsåret utbudet gäller, t.ex. 2026/2027")
    p.add_argument("--kolumn", choices=("innevarande", "planerad"), default="planerad",
                   help="vilket av bilagans två läsår som ska läsas (bara bilaga-2024)")
    args = p.parse_args()

    rader, form, lasar = las_handling(args.pdf)
    if not rader:
        sys.exit("Hittade ingen utbudstabell i handlingen.")
    if form == "bilaga-2024":
        rader = vald_kolumn(rader, args.kolumn)

    with pdfplumber.open(args.pdf) as pdf:
        rubrik = pdf.pages[0].extract_text() or ""
    valt = args.lasar or lasar.get(args.kolumn) or lasaret(rubrik)

    utkast = {
        "lasar": valt,
        "antagningsar": int(valt.split("/")[0]) if valt else None,
        "form": form,
        "beslutsdatum": "FYLL I",
        "paragraf": "FYLL I",
        "diarienummer": "FYLL I",
        "arendenamn": "FYLL I",
        "status": "FYLL I",
        "kallaUrl": "FYLL I",
        "lokalPdf": "rapporter/" + args.pdf.split("/")[-1],
        "utbildningar": rader,
    }
    if lasar:
        utkast["lasarIHandlingen"] = lasar
    print(json.dumps(utkast, ensure_ascii=False, indent=1))
    print(f"\n# {len(rader)} rader lästa ur {args.pdf} ({form}).", file=sys.stderr)


if __name__ == "__main__":
    main()
