"""Hämtar förtroendevaldas uppdrag ur kommunens register (Troman) och sparar
dem som de står – inga tolkningar.

Källa: https://kungsbacka.tromanpublik.se/ – kommunens register över
förtroendevalda, vanlig HTML, uppdateras varje natt. Registret visar bara
*nuläget*:

  * Varje organisation (kommunfullmäktige, kommunstyrelsen, utskott,
    nämnder, kommunalråd) har en sida med dem som sitter där nu, under den
    mandatperiod sidan anger. Perioden 2023-01-01 – 2026-12-31 är den som
    valdes efter valet 2022. Perioden efter valet 2026 finns inte i
    registret förrän fullmäktige valt den; en ögonblicksbild som tas före
    dess beskriver alltså fortfarande 2023–2026.
  * Varje person har en sida med sina nuvarande uppdrag (med start och
    slut) och en "Uppdragshistorik". Historiken innehåller i praktiken bara
    perioder som fullmäktigeledamot; avslutade poster i kommunstyrelse och
    nämnder ligger inte kvar. Det är en lucka i källan, inte i hämtningen,
    och den fylls för 2010–2018 ur fullmäktiges protokoll (se
    data/KALLOR.md).

Ändringar under mandatperioden (avgångna, inträdande ersättare) tas inte
ut särskilt: sidan visar den som sitter nu, och start- och slutdatum
sparas som källan anger dem.

Sparas i data/uppdrag/troman_<hämtdatum>.json:
  organisationer  en post per hämtad organisation med mandatperiod och
                  alla uppdragsrader (person-id, namn, parti, uppdrag,
                  ordningsnummer)
  personer        en post per person som förekommer, med uppdrag och
                  uppdragshistorik som sidan anger dem
  utelamnade      organisationer som finns i registret men inte hämtas
                  (bolag och stiftelser), så att luckan syns

Kontroller som avbryter hellre än sparar något som inte stämmer:
antalet rader i tabellen är det sidan själv anger ("(30 st)"), varje rad
har ett person-id, och kolumnrubrikerna är de vi väntar oss.

Körs: python3 scripts/hamta_uppdrag.py
"""

import json
import re
import sys
import time
import urllib.error
from datetime import date
from html import unescape
from html.parser import HTMLParser
from pathlib import Path

from val import hamta

ROT = Path(__file__).resolve().parent.parent
UT = ROT / "data" / "uppdrag"
BAS = "https://kungsbacka.tromanpublik.se"
PAUS = 0.15   # sekunder mellan sidor; registret är kommunens, var snäll

# Organisationstyper på startsidan som hämtas. Bolag och stiftelser
# hämtas inte (det är ointressanta poster) men listas som utelämnade.
HAMTA_TYPER = {"Nämnder", "Utskott", "Övrigt"}
ORG_KOLUMNER = ["Efternamn", "Förnamn", "Parti", "Uppdrag", "Ordningsnummer"]


def hamta_sida(url: str, forsok: int = 5) -> str:
    """Hämtar en sida som text. Utöver val.hamta:s återförsök vid HTTP-fel
    görs nya försök när anslutningen bryts, vilket händer vid hundratals
    anrop i rad."""
    for n in range(forsok):
        try:
            return hamta(url).decode("utf-8")
        except (urllib.error.URLError, ConnectionError, TimeoutError) as fel:
            if n == forsok - 1:
                raise
            paus = 2 ** (n + 1)
            print(f"  {type(fel).__name__} för {url}, väntar {paus} s …")
            time.sleep(paus)
    raise AssertionError("oåtkomlig")


class Sida(HTMLParser):
    """Plockar rubriker, brödsmulor och tabeller (med länkarna i cellerna)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rubriker = []          # (nivå, text)
        self.tabeller = []          # {"rubrik", "id", "rader": [[(text, href)]]}
        self.lankar = []            # (href, text)
        self._rub = None
        self._senaste_rubrik = ""
        self._tabell = None
        self._rad = None
        self._cell = None
        self._lank = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("h1", "h2", "h3"):
            self._rub = [tag, ""]
        elif tag == "table":
            self._tabell = {"rubrik": self._senaste_rubrik, "id": a.get("id"),
                            "rader": []}
        elif tag == "tr" and self._tabell is not None:
            self._rad = []
        elif tag in ("td", "th") and self._rad is not None:
            self._cell = {"text": "", "href": None}
        elif tag == "a":
            self._lank = [a.get("href"), ""]
            if self._cell is not None and self._cell["href"] is None:
                self._cell["href"] = a.get("href")

    def handle_endtag(self, tag):
        if tag in ("h1", "h2", "h3") and self._rub:
            text = " ".join(self._rub[1].split())
            self.rubriker.append((self._rub[0], text))
            self._senaste_rubrik = text
            self._rub = None
        elif tag in ("td", "th") and self._cell is not None:
            self._rad.append((" ".join(self._cell["text"].split()),
                              self._cell["href"]))
            self._cell = None
        elif tag == "tr" and self._rad is not None:
            if self._rad:
                self._tabell["rader"].append(self._rad)
            self._rad = None
        elif tag == "table" and self._tabell is not None:
            self.tabeller.append(self._tabell)
            self._tabell = None
        elif tag == "a" and self._lank is not None:
            self.lankar.append((self._lank[0], " ".join(self._lank[1].split())))
            self._lank = None

    def handle_data(self, data):
        if self._rub is not None:
            self._rub[1] += data
        if self._cell is not None:
            self._cell["text"] += data
        if self._lank is not None:
            self._lank[1] += data


def tolka(html: str) -> Sida:
    s = Sida()
    s.feed(html)
    return s


def id_ur(href: str, prefix: str) -> str:
    m = re.fullmatch(rf"(?:{re.escape(BAS)})?/{prefix}/([0-9a-f-]{{36}})", href or "")
    if not m:
        sys.exit(f"Väntade en adress /{prefix}/<id>, fick {href!r}")
    return m.group(1)


def organisationer_pa_startsidan(html: str) -> list:
    """[(typ, namn, id)] i den ordning startsidan visar dem. En typ är en
    länk till /organisationstyp/…, följd av organisationerna under den."""
    s = tolka(html)
    ut, typ = [], None
    for href, text in s.lankar:
        if not href:
            continue
        if href.startswith("/organisationstyp/"):
            typ = text
        elif href.startswith("/organisation/") and typ:
            ut.append((typ, text, id_ur(href, "organisation")))
    return ut


def organisationssida(html: str) -> dict:
    s = tolka(html)
    perioder = re.findall(r"Mandatperiod:\s*</strong>\s*(\d{4}-\d\d-\d\d)\s*-\s*"
                          r"(\d{4}-\d\d-\d\d)?", html)
    tabell = next((t for t in s.tabeller if t["id"] == "engagementTable"), None)
    antal = re.search(r"Uppdrag\s*<small>\((\d+) st\)", html)
    if tabell is None:
        return {"mandatperiod": perioder[0] if perioder else None,
                "antal_enligt_sidan": int(antal.group(1)) if antal else 0,
                "uppdrag": []}
    rubrik = [t for t, _ in tabell["rader"][0]]
    if rubrik != ORG_KOLUMNER:
        sys.exit(f"Oväntade kolumner i organisationstabellen: {rubrik}")
    rader = []
    for rad in tabell["rader"][1:]:
        efternamn, fornamn, parti, uppdrag, ordning = rad
        rader.append({
            "person_id": id_ur(efternamn[1], "person"),
            "efternamn": efternamn[0],
            "fornamn": fornamn[0],
            "parti": parti[0] or None,
            "parti_id": id_ur(parti[1], "parti") if parti[1] else None,
            "uppdrag": uppdrag[0],
            "ordningsnummer": int(ordning[0]) if ordning[0].isdigit() else None,
        })
    if not antal or int(antal.group(1)) != len(rader):
        sys.exit(f"Sidan anger {antal.group(1) if antal else '?'} uppdrag "
                 f"men tabellen har {len(rader)} rader")
    return {"mandatperiod": list(perioder[0]) if perioder else None,
            "antal_enligt_sidan": int(antal.group(1)), "uppdrag": rader}


def personsida(html: str) -> dict:
    s = tolka(html)
    namn = next((t for n, t in s.rubriker if n == "h1"), None)
    ut = {"namn": namn, "uppdrag": [], "uppdragshistorik": []}
    for t in s.tabeller:
        rader = [[c for c, _ in r] for r in t["rader"]]
        if not rader:
            continue
        hdr, kropp = rader[0], rader[1:]
        if hdr == ["Organisation", "Uppdrag", "Start", "Slut"]:
            ut["uppdrag"] = [dict(zip(["organisation", "uppdrag", "start", "slut"], r))
                             for r in kropp]
        elif hdr == ["Organisation", "Uppdrag", "Parti", "Start", "Slut"]:
            ut["uppdragshistorik"] = [
                dict(zip(["organisation", "uppdrag", "parti", "start", "slut"], r))
                for r in kropp]
    return ut


def main() -> None:
    start = hamta_sida(BAS + "/")
    alla = organisationer_pa_startsidan(start)
    if not alla:
        sys.exit("Hittade inga organisationer på startsidan – ändrad layout?")
    organisationer, utelamnade, personer = [], [], {}
    for typ, namn, oid in alla:
        if typ not in HAMTA_TYPER and namn != "Kommunfullmäktige":
            utelamnade.append({"typ": typ, "namn": namn, "id": oid})
            continue
        sida = organisationssida(hamta_sida(f"{BAS}/organisation/{oid}"))
        time.sleep(PAUS)
        organisationer.append({"id": oid, "typ": typ, "namn": namn, **sida})
        for r in sida["uppdrag"]:
            personer.setdefault(r["person_id"], None)
        print(f"{namn}: {len(sida['uppdrag'])} uppdrag, period {sida['mandatperiod']}")
    for pid in personer:
        personer[pid] = personsida(hamta_sida(f"{BAS}/person/{pid}"))
        time.sleep(PAUS)
    print(f"{len(personer)} personer, {len(utelamnade)} organisationer utelämnade")
    ut = {
        "kalla": BAS + "/",
        "hamtad": date.today().isoformat(),
        "uppdaterad_enligt_kallan": (re.search(r"Senast uppdaterad:\s*([\d-]+ [\d:]+)", unescape(start)) or [None, None])[1],
        "organisationer": organisationer,
        "personer": personer,
        "utelamnade": utelamnade,
    }
    UT.mkdir(parents=True, exist_ok=True)
    fil = UT / f"troman_{ut['hamtad']}.json"
    fil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("Skrev", fil.relative_to(ROT))


if __name__ == "__main__":
    main()
