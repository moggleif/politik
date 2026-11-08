"""Hämtar fullmäktiges närvarologg för ordinarie ledamöter ur första
fullmäktigeprotokoll med logg i varje mandatperiod: namn och parti för de 61
ledamöterna.

Källa: arkivet https://moggleif.github.io/kommunhandlingar/kungsbacka.html
(fullmäktiges protokoll som text). Protokollens logg heter "Närvarologg för
ordinarie ledamöter" (nyare) eller "Närvarolista för ordinarie ledamöter".

  2011–2014  2013-10-08   (arkivet saknar fullmäktige före 2013-08, och
                           protokollen 2013-08/09 saknar text)
  2015–2018  2014-11-11   första mötet efter valet
  2019–2022  2019-08-13   (hela 2018 saknas i arkivet; första protokollet med logg)
  2023–2026  2022-10-18   första mötet efter valet

Det är det första fullmäktigeprotokoll med logg som finns i arkivet för
perioden. Bara 2014-11-11 och 2022-10-18 är *första mötet efter valet* och
därmed de ursprungligen valda 61; i de andra två kan ledamöter redan ha
ersatts. Det sparas som `forsta_motet_efter_valet` så att den som använder
loggen kan skilja på "uttömmande lista över de valda" och "namn som fanns
i fullmäktige vid det mötet". Ledamöter vars parti saknas i systemet står med
parti `-` (2013); de kan inte föras till något parti.

Loggens ordning är inte en pålitlig nyckel till Valmyndighetens
mandatordning (2022 stämmer 52 av 61 platser, 2014 inte) och sparas bara
som ordning.

Kontroll: 61 ledamöter på första mötet; på de övriga 55–67 (ersättare som
ersatt någon kan ge några fler).
Körs: python3 scripts/hamta_kf_logg.py
"""

import json
import re
import sys
import time
import urllib.error
from pathlib import Path

from hamta_kf_val import text_ur_html
from val import hamta

ROT = Path(__file__).resolve().parent.parent
UT = ROT / "data" / "uppdrag"
ARKIV = "https://moggleif.github.io/kommunhandlingar/kungsbacka/kf/{ar}/{datum}/protokoll.html"
# (datum, mandatperiod, första mötet efter valet?, valdag)
MOTEN = [
    ("2013-10-08", "2011–2014", False, "2010-09-19"),
    ("2014-11-11", "2015–2018", True, "2014-09-14"),
    ("2019-08-13", "2019–2022", False, "2018-09-09"),
    ("2022-10-18", "2023–2026", True, "2022-09-11"),
]
LEDAMOT = re.compile(r"Ledamot\s*(?:\||\n)\s*Logg")
ERSATTARE = re.compile(r"Ersättare\s*(?:\||\n)\s*Logg|Närvaro(?:logg|lista) för ersättare|Närvaro(?:logg|lista) för ordinarie|Beslutsgång|^§ \d+", re.M)
PARTIBYTE = {"FP": "L", "Kbabo": "KB"}


def logg(text: str) -> list:
    """Alla tabeller med rubriken "Ledamot / Logg" (loggen kan fortsätta över
    flera sidor), till nästa "Ersättare / Logg" eller nästa loggrubrik."""
    ut = []
    for m in LEDAMOT.finditer(text):
        start = m.end()
        slut = ERSATTARE.search(text, start)
        seg = text[start:slut.start() if slut else start + 9000]
        for rad in seg.splitlines():
            r = re.match(r"^(\*?\s*[A-ZÅÄÖ][^\n(]*?) \(([A-Z]{1,3}|-)\)(.*)$", rad)
            if not r or re.search(r"ersätter|autoers|\bers\.", r.group(3)):
                continue
            namn = r.group(1).strip(" *")
            if namn.startswith("Närvaro"):
                continue
            ut.append({"namn": namn, "parti": PARTIBYTE.get(r.group(2), r.group(2))})
    if ut:
        return ut
    # Nyare format (2022): "Närvarologg för ledamöter" med löpnummer 1–61 per rad.
    i = text.find("Närvarologg för ledamöter")
    if i >= 0:
        for r in re.finditer(r"^(\d+) ([A-ZÅÄÖ][^\n(]*?) \(([A-Z]{1,3})\)", text[i:i + 6000], re.M):
            if int(r.group(1)) <= 61:
                ut.append({"namn": r.group(2).strip(), "parti": PARTIBYTE.get(r.group(3), r.group(3))})
    return ut


def hamta_text(url: str) -> str:
    for n in range(4):
        try:
            return hamta(url).decode("utf-8")
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            if n == 3:
                raise
            time.sleep(2 ** (n + 1))
    return ""


def main() -> None:
    for datum, period, forsta, valdag in MOTEN:
        url = ARKIV.format(ar=datum[:4], datum=datum)
        poster = logg(text_ur_html(hamta_text(url)))
        if forsta and len(poster) != 61:
            sys.exit(f"{datum}: {len(poster)} ledamöter i loggen, väntade 61 (första mötet efter valet)")
        if not forsta and not 55 <= len(poster) <= 67:
            sys.exit(f"{datum}: {len(poster)} ledamöter i loggen, väntade 55–67")
        for i, p in enumerate(poster, 1):
            p["ordning"] = i
        dagar = (__import__("datetime").date.fromisoformat(datum) - __import__("datetime").date.fromisoformat(valdag)).days
        (UT / f"kf_logg_{datum}.json").write_text(json.dumps({
            "protokoll": url, "datum": datum, "mandatperiod": period,
            "forsta_motet_efter_valet": forsta, "dagar_efter_valdagen": dagar, "ledamoter": poster},
            ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        per = {}
        for p in poster:
            per[p["parti"]] = per.get(p["parti"], 0) + 1
        print(datum, period, f"{dagar} dagar efter valet,", len(poster), "ledamöter", dict(sorted(per.items())))


if __name__ == "__main__":
    main()
