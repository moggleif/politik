"""Gemensamt för skripten som hämtar ur Valmyndighetens öppna data.

hamta_rostberattigade.py och hamta_kommunval.py läser båda Excel-filer
från val.se med enbart standardbiblioteket (zip + XML), så att inget extra
beroende behövs. Här ligger det som betyder samma sak i alla filerna:
hämtningen, xlsx-läsaren, kolumnuppslagningen, valdistriktskoden och
partinormaliseringen. Det som skiljer per fil – vilken layout just den
har – bor kvar i respektive skript.

Om val.se:s adresser: i `https://www.val.se/download/18.<nodid>/<tid>/<namn>`
är det bara nod-id:t som betyder något. Tidsstämpeln och filnamnet kan
vara vad som helst och servern levererar ändå samma fil. Adresserna i
skripten skrivs därför med Valmyndighetens eget filnamn (så att det går
att se vilken fil som avses) men överlever att filen republiceras.
"""

import re
import ssl
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from io import BytesIO

KOMMUN = "1384"        # Kungsbacka
LAN = "13"             # Halland
RIKET = "00"

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


# ---------- Hämtning ----------

def hamta(url: str, forsok: int = 4) -> bytes:
    """Hämtar en fil. Valmyndigheten stryper hämtningen med 429 när
    belastningen är hög (det står uttryckligen i deras tekniska
    beskrivning), så 429 och 5xx får återförsök med växande paus."""
    req = urllib.request.Request(url, headers={"User-Agent": "kungsbacka-i-siffror"})
    for n in range(forsok):
        try:
            with urllib.request.urlopen(req, timeout=300,
                                        context=ssl.create_default_context()) as resp:
                return resp.read()
        except urllib.error.HTTPError as fel:
            if fel.code not in (429, 500, 502, 503, 504) or n == forsok - 1:
                raise
            paus = 2 ** (n + 1)
            print(f"  {fel.code} från val.se, väntar {paus} s …")
            time.sleep(paus)
    raise AssertionError("oåtkomlig")


# ---------- Excel (xlsx) med standardbiblioteket ----------

def blad_sokvag(z: zipfile.ZipFile, namn: str) -> str:
    rels = {r.get("Id"): r.get("Target")
            for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    for s in ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", NS):
        if s.get("name") == namn:
            mal = rels[s.get(f"{{{NS['r']}}}id")]
            return mal.lstrip("/") if mal.startswith("/") else "xl/" + mal
    sys.exit(f"Bladet {namn!r} finns inte i filen")


def kolumnindex(referens: str):
    """Cellreferensen "D5" -> kolumnindex 3. None om referensen saknas."""
    if not referens:
        return None
    n = 0
    for tecken in referens:
        if not tecken.isalpha():
            break
        n = n * 26 + (ord(tecken.upper()) - 64)
    return n - 1 if n else None


def las_blad(raa: bytes, namn: str):
    """Raderna i ett blad som listor av strängar (None för tom cell).

    Tomma celler skrivs inte ut i xlsx-filens XML. Cellens plats måste
    därför läsas ur attributet r ("D5"), inte ur ordningen mellan
    <c>-elementen – annars glider kolumnerna åt vänster så fort en cell
    mitt i raden är tom. Det händer på riktigt: i Valmyndighetens fil
    2018_K_per_valdistrikt.xlsx saknar kommuner med en enda valkrets
    både VALKRETSKOD och VALKRETSNAMN, och varje partikolumn hamnar då
    två steg fel.

    Alla rader fylls ut till den längsta radens längd, så att ett
    kolumnindex från rubrikraden alltid går att slå upp.
    """
    z = zipfile.ZipFile(BytesIO(raa))
    strangar = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            strangar.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
    rader = []
    bredd = 0
    for _, elem in ET.iterparse(z.open(blad_sokvag(z, namn))):
        if elem.tag != f"{{{NS['m']}}}row":
            continue
        celler = {}
        for i, c in enumerate(elem.findall("m:c", NS)):
            plats = kolumnindex(c.get("r"))
            if plats is None:
                plats = i
            v = c.find("m:v", NS)
            if v is not None:
                celler[plats] = strangar[int(v.text)] if c.get("t") == "s" else v.text
            elif c.get("t") == "inlineStr":
                celler[plats] = "".join(t.text or ""
                                        for t in c.iter(f"{{{NS['m']}}}t"))
        rad = [celler.get(i) for i in range(max(celler) + 1)] if celler else []
        bredd = max(bredd, len(rad))
        rader.append(rad)
        elem.clear()
    for rad in rader:
        rad.extend([None] * (bredd - len(rad)))
    return rader


def kolumn(rubriker, namn):
    rensade = [(r or "").strip() for r in rubriker]
    if namn not in rensade:
        sys.exit(f"Kolumnen {namn!r} saknas; rubriker: {rensade}")
    return rensade.index(namn)


def distriktskod(cell) -> str:
    """Valdistriktskoden som sträng, eller "" för rader som inte är
    distrikt (summeringsrader, tomma rader). Riktiga koder är sex siffror
    (uppsamlingsdistrikt) eller åtta (valdistrikt)."""
    kod = (cell or "").strip()
    return kod if kod.isdigit() and len(kod) in (6, 8) else ""


def omraden_for(kod: str):
    """Kommun, län och rike som distriktet räknas till."""
    return kod[:4], kod[:2], RIKET


# ---------- Partier ----------

# Partierna skrivs olika i de fem kommunvalen: 2010, 2014 och 2018 har en
# kolumn per parti med förkortningen som rubrik, 2022 har en rad per parti
# med hela partibeteckningen, och 2026 har både förkortning, beteckning och
# partikod i sin JSON. Förkortningarna är sig lika hela vägen – också de
# lokala ("Kbabo" står för Kungsbackaborna i alla fem valen) – så
# förkortningen används som kanonisk nyckel, och beteckningarna översätts
# hit. Samma roll som scripts/program.py har för gymnasieprogrammen.
#
# Folkpartiet bytte namn till Liberalerna 2015. Det är samma parti, och
# redovisas som en serie med Valmyndighetens egen skrivning
# "Liberalerna (tidigare Folkpartiet)".
PARTIER = [
    ("M", "Moderaterna", ("M", "Moderaterna")),
    ("S", "Socialdemokraterna",
     ("S", "Arbetarepartiet-Socialdemokraterna", "Socialdemokraterna")),
    ("SD", "Sverigedemokraterna", ("SD", "Sverigedemokraterna")),
    ("C", "Centerpartiet", ("C", "Centerpartiet")),
    ("L", "Liberalerna (tidigare Folkpartiet)",
     ("L", "FP", "Liberalerna", "Liberalerna (tidigare Folkpartiet)",
      "Folkpartiet liberalerna")),
    ("KD", "Kristdemokraterna", ("KD", "Kristdemokraterna")),
    ("V", "Vänsterpartiet", ("V", "Vänsterpartiet")),
    ("MP", "Miljöpartiet de gröna", ("MP", "Miljöpartiet de gröna")),
    ("Kbabo", "Kungsbackaborna", ("Kbabo", "Kungsbackaborna")),
    ("MED", "Medborgerlig Samling", ("MED", "Medborgerlig Samling")),
    ("AFS", "Alternativ för Sverige", ("AFS", "Alternativ för Sverige")),
    ("KBFP", "Kungsbacka Framtidsparti", ("KBFP", "Kungsbacka Framtidsparti")),
    ("FI", "Feministiskt initiativ", ("FI", "Feministiskt initiativ")),
    ("SPI", "SPI Välfärden", ("SPI", "SPI Välfärden", "SPI-Välfärden")),
    ("DinF", "Din Förening", ("DinF", "Din F", "Din Förening")),
    ("PP", "Piratpartiet", ("PP", "Piratpartiet")),
    ("DD", "Direktdemokraterna", ("DD", "Direktdemokraterna")),
    ("KrVp", "Kristna Värdepartiet", ("KrVp", "Kristna Värdepartiet")),
    ("MoD", "MoD", ("MoD",)),
    ("NYANS", "Partiet Nyans", ("NYANS", "Partiet Nyans")),
    ("LPo", "Landsbygdspartiet Oberoende",
     ("LPo", "Landsbygdspartiet Oberoende")),
    ("SKP", "Sveriges Kommunistiska Parti", ("SKP",)),
    ("ENH", "Enhet", ("ENH", "Enhet")),
    ("KLP", "Klassiskt liberala partiet", ("KLP", "Klassiskt liberala partiet")),
    ("VÄNDP", "Partiet Vändpunkt", ("VÄNDP", "Partiet Vändpunkt")),
    ("BIP", "Basinkomstpartiet", ("BIP", "Basinkomstpartiet")),
    ("KNAPP", "Knapptryckarna", ("KNAPP", "Knapptryckarna")),
    ("OKP", "Ond Kyckling Partiet", ("OKP", "Ond Kyckling Partiet")),
]

# Poster i källorna som inte är partier. ÖVR finns som egen kolumn eller
# rad i varje år och bär de partier som Valmyndigheten inte särredovisar.
OVRIGA = "ÖVR"
BLANKA = "BLANK"
OGILTIGA = "OG"
EJ_ANMALT = "OGEJ"

ICKE_PARTI = {
    "ÖVR": OVRIGA, "ÖVRIGA": OVRIGA, "övriga anmälda partier": OVRIGA,
    "BLANK": BLANKA, "blanka röster": BLANKA,
    "OG": OGILTIGA, "övriga ogiltiga": OGILTIGA,
    "OGEJ": EJ_ANMALT, "ej anmält deltagande": EJ_ANMALT,
}

# Rader som är summeringar, inte poster: de räknas ut ur delarna i stället
# för att läsas in, så att summan alltid stämmer med det som visas.
SUMMARADER = {"Summa giltiga röster", "Valdeltagande"}

_ALIAS = {}
for _kod, _namn, _alias in PARTIER:
    for _a in _alias:
        _ALIAS[_a.casefold()] = _kod
_PARTINAMN = {kod: namn for kod, namn, _ in PARTIER}
# ÖVR är ingen egen politisk riktning utan en restpost, och ska skrivas ut
# som det den är – på sidan står den i väljaren bredvid partierna.
_PARTINAMN[OVRIGA] = "Övriga partier"


def partinamn(kod: str) -> str:
    """Partiets namn som det ska skrivas ut."""
    return _PARTINAMN.get(kod, kod)


def normalisera_parti(text: str):
    """Källans skrivning -> kanonisk partikod, eller en ICKE_PARTI-kod,
    eller None om posten är en summerad rad som inte ska läsas in.

    Okänt parti ger None tillsammans med att anroparen får avgöra: se
    okand_ar_forsumbar() nedan.
    """
    namn = (text or "").strip()
    if not namn:
        return None
    if namn in SUMMARADER:
        return None
    if namn in ICKE_PARTI:
        return ICKE_PARTI[namn]
    return _ALIAS.get(namn.casefold())


# Ett parti som inte går att tolka blir ÖVR. Det är rimligt för de
# enstaka röster som alltid finns, men skulle tysta ett verkligt fel om
# källan bytte skrivsätt på ett stort parti. Går ett otolkat parti över
# den här andelen av de giltiga rösterna avbryter hämtskriptet i stället.
LARM_ANDEL = 0.005


def okand_ar_forsumbar(roster: int, giltiga: int) -> bool:
    return giltiga <= 0 or roster / giltiga < LARM_ANDEL


def tal(cell) -> int:
    """Heltal ur en cell som kan vara None, tom, "1 234" eller "1234.0"."""
    if cell is None:
        return 0
    text = str(cell).replace("\xa0", "").replace(" ", "").strip()
    if not text:
        return 0
    return int(float(text.replace(",", ".")))


def slug(text: str) -> str:
    """Distriktsnamn -> adressvänlig nyckel, samma regel som K.slug på
    webbsidorna: gemener, å/ä/ö -> a/a/o, allt annat till bindestreck."""
    ut = (text or "").casefold()
    for fran, till in (("å", "a"), ("ä", "a"), ("ö", "o"), ("é", "e"), ("ü", "u")):
        ut = ut.replace(fran, till)
    ut = re.sub(r"[^a-z0-9]+", "-", ut).strip("-")
    return ut
