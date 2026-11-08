"""Läser ur kommunfullmäktiges protokoll vilka som valdes till nämnder och
styrelser inför en ny mandatperiod, och sparar dem som de står.

Källa: protokollen från fullmäktiges decembermöte efter valet, så som
arkivet https://moggleif.github.io/kommunhandlingar/kungsbacka.html
återger kommunens PDF-protokoll som text (varje protokollsida länkar till
kommunens egen PDF eller en Wayback-kopia). I protokollet har varje
valbeslut en paragraf med ledamöter, ersättare, ordförande och vice
ordförande, en person per rad med parti:

    § 173  Kommunstyrelsen 2015-01-01-2018-12-31   (2014-12-09)
    Ledamöter Hans Forsberg M
    Lisa Andersson M …
    Ordförande Hans Forsberg M

Det som sparas är raderna, inte en tolkning av dem: roll, namn, parti,
radens ordning inom rollen och paragrafen. Namn och parti kopplas till
Troman-id och kandidatlistor i ett senare steg.

Vad som *inte* finns i fullmäktiges protokoll:
  * Kommunstyrelsens arbetsutskott (KSAU). Kommunstyrelsen utser det själv
    ("val av utskott"), så det står i kommunstyrelsens protokoll.
  * Val som sker vid andra möten än det protokoll man ger skriptet.
Sådana beslut sparas inte här och listas som luckor i data/KALLOR.md.

Kontroller, som avbryter hellre än sparar något som inte stämmer:
  * varje valbeslut har minst en ledamot, ersättare eller revisor,
  * högst en ordförande per beslut,
  * rader som liknar en person men inte går att tolka hamnar under
    "ej_tolkade" i stället för att tyst försvinna.

Körs: python3 scripts/hamta_kf_val.py [organ/protokolldatum …]   (t.ex. kf/2022-12-06)
      (utan argument hämtas de kända decembermötena)
"""

import json
import re
import sys
import time
import urllib.error
from html import unescape
from pathlib import Path

from val import hamta

ROT = Path(__file__).resolve().parent.parent
UT = ROT / "data" / "uppdrag"
ARKIV = "https://moggleif.github.io/kommunhandlingar/kungsbacka/{organ}/{ar}/{datum}/protokoll.html"

# Decembermötena efter valen som finns i arkivet. 2018 saknas helt i
# arkivet (inga möten 2018), 2010 ligger före dess början (2013-08-13).
# organ/datum. Kommunstyrelsens första möte efter valet väljer
# kommunstyrelsens arbetsutskott (KSAU), som inte väljs av fullmäktige.
MOTEN = ["kf/2014-12-09", "kf/2022-12-06", "ks/2015-01-20", "ks/2023-01-10"]

PARTIER = {"M", "S", "C", "L", "KD", "V", "MP", "SD", "KB", "FP"}

# Rollrubriker som inleder en lista. Längst först, så att "Vice
# ordförande" inte läses som "Ordförande".
ROLLER = [
    ("Styrelseledamöter", "styrelseledamot"),
    ("Styrelseledamot", "styrelseledamot"),
    ("Förste vice ordförande", "1:e vice ordförande"),
    ("Andre vice ordförande", "2:e vice ordförande"),
    ("Lekmannarevisorer", "lekmannarevisor"),
    ("Lekmannarevisor", "lekmannarevisor"),
    ("Partirepresentanter", "partirepresentant"),
    ("1:e v ordförande", "1:e vice ordförande"),
    ("2:e v ordförande", "2:e vice ordförande"),
    ("1:e vice ordförande", "1:e vice ordförande"),
    ("2:e vice ordförande", "2:e vice ordförande"),
    ("Vice ordförande", "vice ordförande"),
    ("Ordförande", "ordförande"),
    ("Ledamöter", "ledamot"),
    ("Ledamot", "ledamot"),
    ("Ersättare", "ersättare"),
    ("Suppleanter", "suppleant"),
    ("Suppleant", "suppleant"),
    ("Revisorer", "revisor"),
    ("Revisor", "revisor"),
]
STOPP = re.compile(r"^(Proposition|Beslutsgång|Beslutsunderlag|Beslutet skickas|"
                   r"Beslutsexpediering|Yrkande|Sammanfattning|Ordföranden |Kommunfullmäktiges |"
                   r"Valberedningens |Kommunfullmäktige beslutar)")
BRUS = re.compile(r"^(Justerare|Sida \d+|Kommunfullmäktige$|Datum$|\d{4}-\d\d-\d\d$|"
                  r"Kvalitet:|KUNGSBACKA KOMMUN)")
PARAGRAF = re.compile(r"^§ (\d+)(?: Dnr ([\w/:.-]+))?\s*$")
VALRUBRIK = re.compile(r"(?i)\bval\b|\d{4}-\d\d-\d\d\s*[-–]\s*\d{4}")
NAMN = re.compile(r"^[A-ZÅÄÖÉÜ][\wÅÄÖåäöéüáèçš'’.\-]*(?: [A-Za-zÅÄÖåäöéüáèçšć'’.\-]+){1,4}$")


def text_ur_html(html: str) -> str:
    html = re.sub(r"(?s)<(script|style|head).*?</\1>", "", html)
    text = unescape(re.sub(r"<[^>]+>", "", html))
    return "\n".join(" ".join(rad.split()) for rad in text.splitlines())


def roll_pa_rad(rad: str):
    """('ledamot', 'Hans Forsberg M') om raden inleds med en rollrubrik.

    Rubriken räknas bara som en roll om resten är ett namn, tomt, eller en
    tidsangivelse ("Styrelse, från bolagsstämman 2015 …"). Brödtext som
    råkar börja med ordet ("Ordförande Anders Ekström (M) prövar …") är
    ingen rolllista.
    """
    rad = re.sub(r"^((?:" + "|".join(re.escape(r) for r, _ in ROLLER) + r")):", r"\1", rad)
    for rubrik, roll in ROLLER:
        if rad == rubrik or rad.startswith(rubrik + " "):
            rest = rad[len(rubrik):].strip()
            if not rest or namn_och_parti(rest) or re.search(r"\d{4}", rest) or rest.startswith(","):
                return roll, ("" if re.search(r"\d{4}", rest) or rest.startswith(",") else rest)
            return None, rad
    return None, rad


def namn_och_parti(rad: str):
    """('Hans Forsberg', 'M') eller ('Daniel Hogner', None). None om raden
    inte ser ut som en person."""
    # Kommunstyrelsens protokoll skriver partiet inom parentes: "Hans Forsberg (M)".
    rad = re.sub(r" \(([A-Z]{1,2})\)$", r" \1", rad)
    if not NAMN.match(rad):
        return None
    delar = rad.split(" ")
    if delar[-1] in PARTIER:
        return " ".join(delar[:-1]), delar[-1]
    return rad, None


def valbeslut(text: str) -> list:
    """Alla paragrafer som innehåller rollistor. Innehållsförteckningen
    längst fram (paragrafrader utan ett "Beslut" efter sig) hoppas över."""
    rader = text.splitlines()
    starter = [i for i, r in enumerate(rader) if PARAGRAF.match(r)]
    ut = []
    for k, i in enumerate(starter):
        slut = starter[k + 1] if k + 1 < len(starter) else len(rader)
        kropp = rader[i:slut]
        if "Beslut" not in kropp:
            continue
        m = PARAGRAF.match(kropp[0])
        # Rubriken: raderna mellan paragrafraden och "Beslut".
        rubrik = " ".join(kropp[1:kropp.index("Beslut")]).strip()
        poster, ejtolkade, roll, n = [], [], None, 0
        for rad in kropp[kropp.index("Beslut") + 1:]:
            if not rad or BRUS.match(rad) or rad.endswith(" fortsätter"):
                continue
            ny, rest = roll_pa_rad(rad)
            if ny:
                roll, n = ny, 0
                rad = rest
                if not rad:
                    continue
            elif STOPP.match(rad):
                roll = None
                continue
            if roll is None:
                continue
            np_ = namn_och_parti(rad)
            if np_ is None:
                ejtolkade.append({"roll": roll, "rad": rad})
                continue
            n += 1
            poster.append({"roll": roll, "ordning": n, "namn": np_[0], "parti": np_[1]})
        if poster and VALRUBRIK.search(rubrik):
            ut.append({"paragraf": int(m.group(1)), "dnr": m.group(2),
                       "rubrik": rubrik, "poster": poster, "ej_tolkade": ejtolkade})
    return ut


def granska(datum: str, beslut: list) -> None:
    if not beslut:
        sys.exit(f"{datum}: hittade inga valbeslut – ändrad layout?")
    for b in beslut:
        roller = [p["roll"] for p in b["poster"]]
        if not set(roller) & {"ledamot", "ersättare", "revisor", "styrelseledamot", "suppleant"}:
            sys.exit(f"{datum} § {b['paragraf']}: inga ledamöter/ersättare")
        if roller.count("ordförande") > 1:
            sys.exit(f"{datum} § {b['paragraf']}: flera ordförande {b['rubrik']!r}")


def kalla_lank(html: str):
    m = re.search(r'href="([^"]+)"[^>]*>\s*källan', html)
    return m.group(1) if m else None


def hamta_protokoll(organ: str, datum: str) -> dict:
    url = ARKIV.format(organ=organ, ar=datum[:4], datum=datum)
    for n in range(4):
        try:
            html = hamta(url).decode("utf-8")
            break
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            if n == 3:
                raise
            time.sleep(2 ** (n + 1))
    beslut = valbeslut(text_ur_html(html))
    granska(datum, beslut)
    return {"protokoll": {"organ": organ, "datum": datum, "arkiv": url,
                          "originalet": kalla_lank(html)},
            "beslut": beslut}


def main(argv: list) -> None:
    UT.mkdir(parents=True, exist_ok=True)
    for mote in argv or MOTEN:
        organ, datum = mote.split("/")
        ut = hamta_protokoll(organ, datum)
        fil = UT / f"{organ}_val_{datum}.json"
        fil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        antal = sum(len(b["poster"]) for b in ut["beslut"])
        ej = sum(len(b["ej_tolkade"]) for b in ut["beslut"])
        print(f"{organ} {datum}: {len(ut['beslut'])} beslut, {antal} poster, {ej} rader ej tolkade")


if __name__ == "__main__":
    main(sys.argv[1:])
