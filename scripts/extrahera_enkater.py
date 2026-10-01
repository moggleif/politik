#!/usr/bin/env python3
"""Läser råfilerna i data/enkater/raw/ och skriver den rensade tidy-filen
data/enkater/clean/enkater.csv, en rad per källa, omgång, enhet,
respondentgrupp, årskurs och frågeområde.

Två källor, två format:

**Skolenkäten (Excel).** Skolinspektionens filer har en rad per skolenhet
och ett block kolumner per fråga, med frågeområdets index (0–10) i en
egen kolumn överst i varje block. Layouten har ändrats flera gånger
(2015, 2017, 2018, 2021 och 2022 ser olika ut) och läses därför inte på
fasta kolumnnummer: rubrikraderna letas upp ("Antal i gruppen" och
"Index"), frågeområdena hämtas ur kolumnerna där det står "Index", och
radernas skolenhetskod, namn och huvudman identifieras på typ. Raden
avgör nivån: kommunraden ("Kungsbacka kommun"), riksraden ("Samtliga
deltagande skolor") eller en skolenhet vars kod finns i Skolverkets
register över Kungsbackas enheter. Kommer en rad med Kungsbacka som
lägeskommun men en kod som registret inte känner till loggas den i
omatchade.csv i stället för att tyst tas med eller tappas.

Varje frågeområde får ett *frågesatsmärke*: en kortkod över de frågor som
ingår, i den ordning de står. Byter frågorna – och Skolenkäten bytte i
HT 2018 och igen 2022 – byter märket, och det är det märket som sidan
använder för att veta var en trendlinje måste brytas. Det är en
mekanisk jämförelse av frågetexten, inte ett omdöme om vad som är
jämförbart.

**Regiongemensam elevenkät (GR, PDF).** Rapporterna är på regionnivå;
tabellen "Frågeområde per enhet" har en rad för GR som helhet och en för
varje kommun, och Kungsbacka plockas därifrån. Kolumnrubrikerna bryts
över flera rader i PDF:en och läses därför ur ordens koordinater: varje
rubrikord tillhör den talkolumn dess mittpunkt ligger närmast. Skalan
skiljer sig mellan åren och är en del av datat (se SKALOR): 2022 index
0–100, 2023 index 0–10 ("likt Skolinspektionens enkät"), 2024– medelvärde
0–100. Värden på 0–100 räknas om till 0–10 genom division med 10, men
raden bär sin originalskala och ett märke om skalbyte i kommentaren.

Körs:  python3 scripts/extrahera_enkater.py
"""

import csv
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from program import KOMMUN_ORGNR, skola_av_enhet

ROT = Path(__file__).resolve().parent.parent
KATALOG = ROT / "data" / "enkater"
RAW = KATALOG / "raw"
REGISTER = KATALOG / "skolenheter_kungsbacka_skolverket.json"
MAPPNING = KATALOG / "mapping_fragomraden.csv"
UT = KATALOG / "clean" / "enkater.csv"
OMATCHADE = KATALOG / "clean" / "omatchade.csv"

KOLUMNER = [
    "källa", "år", "omgång", "nivå", "skolenhetskod", "skola_id",
    "skolnamn_vid_tillfället", "huvudman", "respondentgrupp", "årskurs",
    "frågeområde_original", "frågeområde_harmoniserat", "serie", "index_0_10",
    "index_original", "skala_original", "antal_svar", "svarsfrekvens",
    "frågesats", "kommentar", "källfil",
]

SKOLENKATEN = "Skolenkäten"
GR = "GR-enkäten"
RIKET_NAMN = "Samtliga deltagande skolor"
KOMMUN_RAD = "Kungsbacka kommun"


# ---------------------------------------------------------------------
# Hjälpare

def tal(v):
    """Ett tal ur en cell, eller None. Skolinspektionens prickning ('-',
    '*') och GR:s tomma celler blir None – tomt är inte noll."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).strip().replace(",", ".").replace(" ", ""))
    except ValueError:
        return None


def fmt(x, dec=4):
    """Ett tal som kort text i CSV:en: heltal utan decimaler, annars högst
    `dec`, utan efterföljande nollor. Tomt för None."""
    if x is None:
        return ""
    s = f"{round(x, dec):.{dec}f}".rstrip("0").rstrip(".")
    return "0" if s in ("", "-0") else s


def kod_text(v):
    """Skolenhetskod som text ('11231816'), oavsett om cellen är heltal,
    flyttal eller text."""
    if v is None:
        return ""
    if isinstance(v, float) and v == int(v):
        v = int(v)
    return str(v).strip()


def normalisera(text):
    return re.sub(r"\s+", " ", str(text or "")).strip()


def omrade_utan_nummer(text):
    """'9. Trygghet' -> 'Trygghet'."""
    return re.sub(r"^\d+\.\s*", "", normalisera(text))


def frasatsmarke(fragor):
    """Kortkod över frågorna i ett frågeområde, i ordning. Gemener och
    enkla blanksteg så att en ändrad radbrytning inte räknas som en ny
    fråga; ett ändrat ord gör det."""
    underlag = "|".join(normalisera(f).lower() for f in fragor)
    return hashlib.sha1(underlag.encode("utf-8")).hexdigest()[:8]


def omgang_av(mapp):
    """'ht-2015' -> (2015, 'HT 2015'); '2021' -> (2021, '2021')."""
    m = re.fullmatch(r"(ht|vt)-(\d{4})", mapp)
    if m:
        return int(m.group(2)), f"{m.group(1).upper()} {m.group(2)}"
    if re.fullmatch(r"\d{4}", mapp):
        return int(mapp), mapp
    raise ValueError(f"okänd omgång: {mapp}")


def las_register(sokvag=REGISTER):
    with open(sokvag, encoding="utf-8") as f:
        return {r["kod"]: r for r in json.load(f)}


# ---------------------------------------------------------------------
# Skolenkäten

def respondentgrupp(titel):
    """(respondentgrupp, årskurs) ur bladets och rubrikcellens text."""
    t = normalisera(titel).lower()
    if "elever" in t:
        m = re.search(r"(?:åk|årskurs)\s*(\d)", t)
        if m:
            return "Elever", f"åk {m.group(1)}"
        if re.search(r"år\s*2", t):
            return "Elever", "gymnasiet år 2"
    if "lärare" in t or "pedagogisk personal" in t:
        if re.search(r"gymn|gysk", t):
            return "Undervisande lärare", "gymnasieskola"
        if "grund" in t:
            return "Undervisande lärare", "grundskola"
    if "vårdnadshavare" in t or re.search(r"\bvh\b", t):
        if re.search(r"förskoleklass|fklass", t):
            return "Vårdnadshavare", "förskoleklass"
        if re.search(r"anp|särskola|grundsär", t):
            return "Vårdnadshavare", "anpassad grundskola"
        if "grundskola" in t:
            return "Vårdnadshavare", "grundskola"
    raise ValueError(f"kan inte avgöra respondentgrupp ur: {titel!r}")


class Layout:
    """Var i bladet rubriker, personuppgifter och frågeområden ligger.

    Kolumnerna för antal och svarsfrekvens heter olika i olika filer:
    elevfilerna har "Antal i gruppen", "Antal (svar)" och "Svarsfrekvens",
    de äldre vårdnadshavarfilerna bara "Antal" (svar). Första
    räknekolumnen avgör var skolans namn står, kolumnen innan."""

    def __init__(self, rubrik):
        self.n = None          # första räknekolumnen
        self.c_svar = None
        self.c_frek = None
        self.idxrad = None     # raden där "Index" står
        self.omraden = []      # [(kolumn, namn, frågor)]
        antal_rad = None
        for i, r in enumerate(rubrik):
            namn = [normalisera(c).lower() for c in r]
            if "huvudman" not in namn and "orgnummer" not in namn:
                continue
            antal_rad = i
            kol = [(j, v) for j, v in enumerate(namn)
                   if v in ("antal i gruppen", "antal", "antal svar")]
            if not kol:
                continue
            self.n = kol[0][0]
            # Svarskolumnen: "Antal svar", annars "Antal" (efter "Antal i
            # gruppen" om den finns, annars den första).
            svar = [j for j, v in kol if v != "antal i gruppen"]
            self.c_svar = svar[0] if svar else None
            for j, v in enumerate(namn):
                if v.endswith("svarsfrekvens"):
                    self.c_frek = j
            break
        if antal_rad is None:
            raise ValueError("hittar inte rubrikraden (Huvudman/Orgnummer)")
        for i, r in enumerate(rubrik):
            if self.n is not None and any(
                    normalisera(c).lower().startswith("index")
                    for c in r[self.n + 1:]):
                self.idxrad = i
                break
        if self.n is None or self.idxrad is None or self.c_svar is None:
            raise ValueError("hittar inte rubrikraderna (antal / index)")
        self.databorjan = max(antal_rad, self.idxrad) + 1
        idx = [c for c, v in enumerate(rubrik[self.idxrad])
               if c > self.n and normalisera(v).lower().startswith("index")]
        # Frågorna för ett frågeområde ligger i raden under områdesnamnet
        # (2015–2017) eller i samma rad (2018–): leta i raderna över
        # indexraden efter text i kolumnerna efter indexkolumnen.
        for k, c in enumerate(idx):
            slut = idx[k + 1] if k + 1 < len(idx) else len(rubrik[0])
            namn = None
            for rad in rubrik[:self.idxrad]:
                if c < len(rad) and re.match(r"^\d+\.\s", normalisera(rad[c])):
                    namn = normalisera(rad[c])
                    break
            if namn is None:
                continue
            fragor = []
            for rad in rubrik[:self.idxrad]:
                for cc in range(c + 1, min(slut, len(rad))):
                    v = normalisera(rad[cc])
                    if v and not re.match(r"^\d+\.\s", v):
                        fragor.append(v)
            self.omraden.append((c, namn, fragor))


def radtyp(celler, register, kod_ar_enhet):
    """Vad en rad är: ('riket'|'kommun'|'enhet'|'omatchad'|None, kod)."""
    text = [normalisera(c) for c in celler if isinstance(c, str)]
    if RIKET_NAMN in text:
        return "riket", ""
    koder = [kod_text(c) for c in celler if kod_text(c)]
    for k in koder:
        if k in register:
            return "enhet", k
    kandidat = [k for k in koder if kod_ar_enhet(k)]
    if kandidat and ("Kungsbacka" in text or KOMMUN_RAD in text):
        # Kungsbacka som lägeskommun eller huvudman men en enhetskod som
        # registret inte känner till: loggas, inte tyst med eller bort.
        return "omatchad", kandidat[0]
    if KOMMUN_RAD in text:
        return "kommun", ""
    return None, ""


def ar_enhetskod(k):
    return bool(re.fullmatch(r"\d{7,8}", k))


def tolka_blad(rader, titel, omgang_mapp, register, kallfil):
    """Tolkar ett Excelblad. `rader` är bladets alla rader som tuplar.
    Returnerar (poster, omatchade) där poster är dictar med KOLUMNER utom
    frågeområde_harmoniserat, som sätts senare ur mappningstabellen."""
    rader = list(rader)
    lay = Layout(rader[:8])
    ar, omgang = omgang_av(omgang_mapp)
    rubrikcell = next((normalisera(r[0]) for r in rader[:4]
                       if r and isinstance(r[0], str) and r[0].startswith("Skolenkäten")), "")
    grupp, arskurs = respondentgrupp(rubrikcell or titel)
    n = lay.n
    poster, omatchade = [], []
    for r in rader[lay.databorjan:]:
        if not r or all(c is None for c in r):
            continue
        celler = r[:n]
        typ, kod = radtyp(celler, register, ar_enhetskod)
        if typ is None:
            continue
        namn = normalisera(r[n - 1]) if n >= 1 else ""
        huvudman = ""
        orgnr = ""
        for c in celler[:n - 1]:
            if (isinstance(c, str) and normalisera(c) not in ("", "Kungsbacka")
                    and not normalisera(c).isdigit()):
                if not huvudman and normalisera(c) != namn:
                    huvudman = normalisera(c)
            k = kod_text(c)
            if re.fullmatch(r"\d{10}", k):
                orgnr = k
        if typ == "omatchad":
            omatchade.append({"omgång": omgang, "kod": kod, "namn": namn,
                              "huvudman": huvudman, "källfil": kallfil})
            continue
        if typ == "kommun":
            namn, huvudman, nivå, kod = KOMMUN_RAD, KOMMUN_RAD, "kommun", ""
        elif typ == "riket":
            namn, huvudman, nivå, kod = RIKET_NAMN, "", "riket", ""
        else:
            nivå = "skola"
            if orgnr == KOMMUN_ORGNR:
                huvudman = KOMMUN_RAD
            elif not huvudman and orgnr:
                huvudman = "orgnr " + orgnr
        antal = tal(r[lay.c_svar]) if len(r) > lay.c_svar else None
        frekvens = (tal(r[lay.c_frek])
                    if lay.c_frek is not None and len(r) > lay.c_frek else None)
        for c, omrade, fragor in lay.omraden:
            if "bildar ej index" in omrade:
                continue            # nöjdhetsfrågor m.fl. som saknar index
            v = tal(r[c]) if c < len(r) else None
            kommentar = ""
            if v is None:
                kommentar = ("inga svar" if antal == 0
                             else "ej redovisat (färre än fem svar eller prickat)")
            poster.append({
                "källa": SKOLENKATEN, "år": ar, "omgång": omgang, "nivå": nivå,
                "skolenhetskod": kod,
                "skola_id": skola_av_enhet(kod) if kod else "",
                "skolnamn_vid_tillfället": namn, "huvudman": huvudman,
                "respondentgrupp": grupp, "årskurs": arskurs,
                "frågeområde_original": omrade_utan_nummer(omrade),
                "frågeområde_harmoniserat": "", "serie": "",
                "index_0_10": fmt(v), "index_original": fmt(v),
                "skala_original": "0-10",
                "antal_svar": "" if antal is None else str(int(antal)),
                "svarsfrekvens": fmt(frekvens),
                "frågesats": frasatsmarke(fragor),
                "kommentar": kommentar, "källfil": kallfil, "orgnr": orgnr,
            })
    # Ett frågeområde utan index på någon rad i filen (VT 2015 redovisar
    # bara medelvärden) har inget att visa; det tas bort i stället för att
    # fylla CSV:en med tomma rader.
    harindex = {p["frågeområde_original"] for p in poster if p["index_0_10"] != ""}
    poster = [p for p in poster if p["frågeområde_original"] in harindex]
    return poster, omatchade


def las_excel(sokvag, register):
    import openpyxl
    wb = openpyxl.load_workbook(sokvag, read_only=True)
    ws = wb.worksheets[0]
    omgang_mapp = Path(sokvag).parent.name
    rel = str(Path(sokvag).relative_to(RAW))
    rader = ws.iter_rows(values_only=True)
    try:
        return tolka_blad(rader, ws.title, omgang_mapp, register, rel)
    except ValueError as fel:
        raise ValueError(f"{rel}: {fel}") from fel


# ---------------------------------------------------------------------
# GR (PDF)

# Skalan per år, såsom rapporten själv anger den. "Index" och "Medelvärde"
# är rapportens egna ord för samma 0–100-tal; 2023 redovisades i stället
# på 0–10 "likt i Skolinspektionens enkät".
SKALOR = {
    2022: ("0-100", "Indexvärde"),
    2023: ("0-10", "Indexvärde"),
    2024: ("0-100", "Medelvärde"),
    2025: ("0-100", "Medelvärde"),
    2026: ("0-100", "Medelvärde"),
}

def gr_arskurs(filnamn):
    """Årskursen ur rapportens filnamn, eller None för de rapporter som
    inte ingår (anpassad grund- och gymnasieskola). Filnamnen har gjorts
    ASCII-säkra vid nedladdningen: "Grundskola åk 5" blir
    "Grundskola_a_k_5" (å blir "a" plus ett blanksteg) och 2023 års
    "årskurs" blir "_rskurs" (å försvinner)."""
    n = re.sub(r"[_\s]+", " ", filnamn.lower())
    if re.search(r"anpassad|s rskola|s rskolan|sa rskola|sa rskolan", n):
        return None
    m = re.search(r"(?:\ba k|\ba? ?rskurs) (\d)\b", n)
    if m and m.group(1) in "258":
        return f"åk {m.group(1)}"
    if re.search(r"gymnasieskolan? (?:a )?r 2", n):
        return "gymnasiet år 2"
    return None


def rubrikord(ord_, y_rad, x_forsta):
    """De ord som är rubrik till talkolumnerna: raderna närmast ovanför
    dataraden, uppåt så länge ingen ord på raden börjar till vänster om
    första talkolumnen. Rapportens inledningsmening ("Medelvärde per enhet
    för respektive frågeområde …") börjar vid vänstermarginalen och stoppar
    därför uppgången, hur många rader den än bryts över – rubrikerna är
    centrerade över talen och börjar aldrig så långt åt vänster."""
    ovan = [o for o in ord_ if o["top"] < y_rad]
    rader = defaultdict(list)
    for o in ovan:
        rader[round(o["top"] / 2)].append(o)
    ut = []
    for nyckel in sorted(rader, reverse=True):
        if any(o["x0"] < x_forsta - 80 for o in rader[nyckel]):
            break
        ut += rader[nyckel]
    return ut


def rubrikkolumner(ord_, x_tal):
    """Rubrikerna för en tabell med talkolumner på x-lägena `x_tal`.
    Varje rubrikord hör till den kolumn vars mittpunkt ligger närmast;
    orden i en kolumn läses uppifrån och ned."""
    kol = defaultdict(list)
    for o in ord_:
        mitt = (o["x0"] + o["x1"]) / 2
        i = min(range(len(x_tal)), key=lambda k: abs(x_tal[k] - mitt))
        kol[i].append(o)
    ut = []
    for i in range(len(x_tal)):
        ordlista = sorted(kol[i], key=lambda o: (round(o["top"] / 3), o["x0"]))
        ut.append(normalisera(" ".join(o["text"] for o in ordlista)))
    return ut


# Raden för regionen heter "GR" i de flesta rapporter och "Göteborgsregionen"
# i 2022 års.
REGIONENS_NAMN = {"GR": "GR", "Göteborgsregionen": "GR", "Kungsbacka": "Kungsbacka"}

# Rubriker som PDF:en bryter mitt i ordet ("Argumentati" / "on").
RUBRIKFEL = {"Argumentati on": "Argumentation"}


def rensa_rubrik(text):
    for fel, ratt in RUBRIKFEL.items():
        text = text.replace(fel, ratt)
    return text


def tolka_enhetssida(ord_):
    """Ur ett sidas ord: rubrikerna och värdena för raderna i `enhet_namn`
    i tabellen "Frågeområde per enhet". Returnerar (rubriker, {enhet: [tal]})
    eller None om sidan inte har tabellen. Orden är pdfplumbers
    (x0, x1, top, bottom, text)."""
    if not [o for o in ord_ if o["text"] == "Frågeområde"]:
        return None
    rader = defaultdict(list)
    for o in ord_:
        rader[round(o["top"] / 2)].append(o)
    rad_per_enhet = {}
    for nyckel in sorted(rader):
        orden = sorted(rader[nyckel], key=lambda o: o["x0"])
        forst = REGIONENS_NAMN.get(orden[0]["text"])
        if forst and len(orden) > 1 and tal(orden[1]["text"]) is not None:
            rad_per_enhet[forst] = orden
    if "GR" not in rad_per_enhet:
        return None
    gr = rad_per_enhet["GR"]
    x_tal = [(o["x0"] + o["x1"]) / 2 for o in gr[1:] if tal(o["text"]) is not None]
    rubr = [rensa_rubrik(r) for r in
            rubrikkolumner(rubrikord(ord_, gr[0]["top"] - 1, x_tal[0]), x_tal)]
    varden = {}
    for namn, orden in rad_per_enhet.items():
        tal_ord = [o for o in orden[1:] if tal(o["text"]) is not None]
        varden[namn] = [tal(o["text"]) for o in tal_ord]
        if len(tal_ord) != len(x_tal):
            raise ValueError(f"{namn}: {len(tal_ord)} tal men {len(x_tal)} kolumner")
    return rubr, varden


def las_gr_pdf(sokvag):
    """Alla (frågeområde, {GR: v, Kungsbacka: v}) i en GR-rapport. Tal som
    inte går att tolka eller kolumner utan rubrik stoppar inläsningen."""
    import pdfplumber
    ut = []
    tabeller = 0
    with pdfplumber.open(sokvag) as pdf:
        for sida in pdf.pages:
            text = sida.extract_text() or ""
            if "per enhet" not in text.split("\n")[0] and "per enhet" not in text[:200]:
                continue
            ord_ = sida.extract_words(keep_blank_chars=False, use_text_flow=False)
            res = tolka_enhetssida(ord_)
            if res is None:
                continue
            rubr, varden = res
            tabeller += 1
            if "Kungsbacka" not in varden:
                continue
            for i, r in enumerate(rubr):
                if not r:
                    raise ValueError(f"{sokvag}: kolumn {i} utan rubrik")
                ut.append((r, {k: v[i] for k, v in varden.items()}))
    if not tabeller:
        raise ValueError(f"{sokvag}: hittade ingen tabell 'Frågeområde per enhet'")
    # Tabellen finns men Kungsbacka saknas: kommunen deltog inte i den här
    # rapporten (årskurs och år då Skolinspektionen mäter i stället).
    return ut


def gr_poster(sokvag):
    ar = int(Path(sokvag).parent.name)
    namn = Path(sokvag).name
    arskurs = gr_arskurs(namn)
    if arskurs is None:
        return []
    skala, ordet = SKALOR[ar]
    delare = 10.0 if skala == "0-100" else 1.0
    rel = str(Path(sokvag).relative_to(RAW))
    poster = []
    for omrade, v in las_gr_pdf(sokvag):
        for enhet in ("Kungsbacka", "GR"):
            varde = v.get(enhet)
            if varde is None:
                continue
            kom = []
            if skala == "0-100":
                kom.append(f"skalbyte: {ordet.lower()} 0–100 delat med 10")
            else:
                kom.append("skala 0–10 endast detta år")
            poster.append({
                "källa": GR, "år": ar, "omgång": str(ar),
                "nivå": "kommun" if enhet == "Kungsbacka" else "region",
                "skolenhetskod": "", "skola_id": "",
                "skolnamn_vid_tillfället": KOMMUN_RAD if enhet == "Kungsbacka" else "GR (13 kommuner)",
                "huvudman": "inkl. fristående skolor i kommunen",
                "respondentgrupp": "Elever", "årskurs": arskurs,
                "frågeområde_original": omrade, "frågeområde_harmoniserat": "",
                "serie": "", "index_0_10": fmt(varde / delare), "index_original": fmt(varde),
                "skala_original": skala, "antal_svar": "", "svarsfrekvens": "",
                "frågesats": f"gr-{skala}-{ordet.lower()}", "kommentar": "; ".join(kom),
                "källfil": rel,
            })
    return poster


# ---------------------------------------------------------------------
# Mappning till harmoniserade frågeområden

MAPPNINGSRUBRIK = ["källa", "respondentgrupp", "frågeområde_original", "från_år",
                   "till_år", "frågeområde_harmoniserat", "serie", "kommentar"]


def las_mappning(sokvag=MAPPNING):
    """{(källa, respondentgrupp, original): [(från_år, till_år, harmoniserat)]}"""
    kart = defaultdict(list)
    if not Path(sokvag).exists():
        return kart
    with open(sokvag, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            nyckel = (r["källa"], r["respondentgrupp"], normalisera(r["frågeområde_original"]).lower())
            kart[nyckel].append((int(r["från_år"]), int(r["till_år"]),
                                 r["frågeområde_harmoniserat"], r["serie"]))
    return kart


def harmonisera(post, kart):
    nyckel = (post["källa"], post["respondentgrupp"],
              normalisera(post["frågeområde_original"]).lower())
    for fran, till, harm, serie in kart.get(nyckel, []):
        if fran <= post["år"] <= till:
            return harm, serie or normalisera(post["frågeområde_original"])
    raise KeyError(nyckel + (post["år"],))


# ---------------------------------------------------------------------

def main():
    register = las_register()
    poster, omatchade = [], []
    for fil in sorted((RAW / "skolenkaten").glob("*/*.xlsx")):
        if fil.name.startswith("huvudman-som"):
            continue
        p, o = las_excel(fil, register)
        poster += p
        omatchade += o
        print(f"{fil.relative_to(RAW)}: {len(p)} rader")
    for fil in sorted((RAW / "gr").glob("*/*.pdf")):
        p = gr_poster(fil)
        poster += p
        if p:
            print(f"{fil.relative_to(RAW)}: {len(p)} rader")

    # Äldre layouter har bara huvudmannens organisationsnummer. Namnet
    # hämtas då ur närmaste år med samma organisationsnummer som har ett
    # (huvudmannens namn vid tillfället, där filen ger det).
    org_namn = defaultdict(dict)
    for p in poster:
        m = re.fullmatch(r"orgnr (\d{10})", p["huvudman"])
        if not m and p["huvudman"] and p["nivå"] == "skola":
            org_namn[p["orgnr"]][p["år"]] = p["huvudman"]
    for p in poster:
        m = re.fullmatch(r"orgnr (\d{10})", p["huvudman"])
        if m and org_namn.get(m.group(1)):
            ar = min(org_namn[m.group(1)], key=lambda a: abs(a - p["år"]))
            p["huvudman"] = org_namn[m.group(1)][ar]

    # Samma sak där raden saknar organisationsnummer helt (KMS, VT 2015):
    # namnet från närmaste år för samma skolenhetskod.
    kod_namn = defaultdict(dict)
    for p in poster:
        if p["nivå"] == "skola" and p["huvudman"]:
            kod_namn[p["skolenhetskod"]][p["år"]] = p["huvudman"]
    for p in poster:
        if p["nivå"] == "skola" and not p["huvudman"] and kod_namn.get(p["skolenhetskod"]):
            ar = min(kod_namn[p["skolenhetskod"]], key=lambda a: abs(a - p["år"]))
            p["huvudman"] = kod_namn[p["skolenhetskod"]][ar]

    kart = las_mappning()
    saknas = defaultdict(set)
    for p in poster:
        try:
            p["frågeområde_harmoniserat"], p["serie"] = harmonisera(p, kart)
        except KeyError:
            saknas[(p["källa"], p["respondentgrupp"], p["frågeområde_original"])].add(p["år"])
    if saknas:
        # Nya frågeområden läggs till som utkast med "?" i den harmoniserade
        # kolumnen. Mappningen fylls i för hand och körningen upprepas; ett
        # kvarvarande "?" stoppar bygget.
        ny_fil = not MAPPNING.exists()
        with open(MAPPNING, "a", encoding="utf-8", newline="") as f:
            w = csv.writer(f, lineterminator="\n")
            if ny_fil:
                w.writerow(MAPPNINGSRUBRIK)
            for (kalla, grupp, omr), ar in sorted(saknas.items()):
                w.writerow([kalla, grupp, omr, min(ar), max(ar), "?", "", ""])
        raise SystemExit(f"{len(saknas)} nya frågeområden lades till i "
                         f"{MAPPNING.relative_to(ROT)} med '?'. Fyll i den "
                         "harmoniserade kolumnen (tom = lämnas oharmoniserat) "
                         "och kör igen.")
    if any(p["frågeområde_harmoniserat"] == "?" for p in poster):
        raise SystemExit("mapping_fragomraden.csv har rader med '?' kvar.")

    for p in poster:
        p.pop("orgnr", None)
    poster.sort(key=lambda p: (p["källa"], p["år"], p["omgång"], p["respondentgrupp"],
                               p["årskurs"], p["nivå"], p["skolenhetskod"],
                               p["frågeområde_original"]))
    UT.parent.mkdir(parents=True, exist_ok=True)
    with open(UT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=KOLUMNER, lineterminator="\n")
        w.writeheader()
        w.writerows(poster)
    with open(OMATCHADE, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["omgång", "kod", "namn", "huvudman", "källfil"],
                           lineterminator="\n")
        w.writeheader()
        w.writerows(omatchade)
    print(f"{len(poster)} rader → {UT.relative_to(ROT)}; "
          f"{len(omatchade)} omatchade → {OMATCHADE.relative_to(ROT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
