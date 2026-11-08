"""Hämtar fullmäktiges närvarologg för ordinarie ledamöter ur protokollet från
första sammanträdet efter valet: namn och parti för de 61 ledamöterna, i den
ordning protokollet har dem.

Källa: arkivet https://moggleif.github.io/kommunhandlingar/kungsbacka.html
(fullmäktiges protokoll som text). Loggen finns för 2014-11-11 (utan
löpnummer) och 2022-10-18 (löpnummer 1–61 per parti). 2010 och 2018 saknas
i arkivet. I loggen står ledamoten som valts; en tjänstgörande ersättare
nämns på samma rad men sparas inte här.

Ordningen i loggen är *inte* en pålitlig nyckel till Valmyndighetens
mandatordning (2022 stämmer 52 av 61 platser, 2014 inte), så den sparas
bara som ordning, inte som tolkning.

Kontroll: exakt 61 ledamöter. Körs: python3 scripts/hamta_kf_logg.py
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
MOTEN = ["2014-11-11", "2022-10-18"]


def logg(text: str) -> list:
    i = text.find("Närvarologg för")
    if i < 0:
        return []
    j = text.find("Närvarologg för ersättare", i + 20)
    seg = text[i:j if j > 0 else i + 9000]
    ut = []
    for m in re.finditer(r"^(?:\d+ )?([A-ZÅÄÖ][^\n(]*?) \(([A-Z]{1,3})\)", seg, re.M):
        namn = m.group(1).strip()
        if not namn.startswith("Närvarologg"):
            ut.append({"namn": namn, "parti": {"FP": "L", "Kbabo": "KB"}.get(m.group(2), m.group(2))})
    return ut


def main() -> None:
    for datum in MOTEN:
        url = ARKIV.format(ar=datum[:4], datum=datum)
        for n in range(4):
            try:
                html = hamta(url).decode("utf-8")
                break
            except (urllib.error.URLError, ConnectionError, TimeoutError):
                if n == 3:
                    raise
                time.sleep(2 ** (n + 1))
        poster = logg(text_ur_html(html))
        # Loggen listar ordinarie ledamöter först; de 61 första raderna är de.
        poster = poster[:61]
        if len(poster) != 61:
            sys.exit(f"{datum}: {len(poster)} ledamöter i loggen, väntade 61")
        for i, p in enumerate(poster, 1):
            p["ordning"] = i
        (UT / f"kf_logg_{datum}.json").write_text(json.dumps({"protokoll": url, "datum": datum, "ledamoter": poster},
                                                              ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        per = {}
        for p in poster:
            per[p["parti"]] = per.get(p["parti"], 0) + 1
        print(datum, per)


if __name__ == "__main__":
    main()
