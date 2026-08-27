#!/usr/bin/env python3
"""Hämtar faktisk folkmängd för Kungsbacka kommun från SCB:s öppna API (PxWeb).

Tabell: Folkmängden efter region, civilstånd, ålder och kön. År 1968–
(BE/BE0101/BE0101A/BefolkningNy, mått BE0101N1 Folkmängd)

Resultatet sparas till data/scb/folkmangd_kungsbacka.json tillsammans med
metadata om när och hur datat hämtades, så att hämtningen är reproducerbar.

Körs:  python3 scripts/fetch_scb.py
"""

import json
import ssl
import urllib.request
from datetime import date
from pathlib import Path

API_URL = "https://api.scb.se/OV0104/v1/doris/sv/ssd/START/BE/BE0101/BE0101A/BefolkningNy"
# Mänsklig länk till samma tabell i Statistikdatabasen (används som källänk på hemsidan)
TABELL_URL = "https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__BE__BE0101__BE0101A/BefolkningNy/"

REGION_KUNGSBACKA = "1384"
FORSTA_AR = 2000

QUERY = {
    "query": [
        {
            "code": "Region",
            "selection": {"filter": "vs:RegionKommun07", "values": [REGION_KUNGSBACKA]},
        },
        {
            "code": "ContentsCode",
            "selection": {"filter": "item", "values": ["BE0101N1"]},
        },
        # Civilstånd, ålder och kön utelämnas => SCB summerar över dem.
    ],
    "response": {"format": "json"},
}


def main() -> None:
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(QUERY).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
        raw = json.loads(resp.read().decode("utf-8-sig"))

    folkmangd = {}
    for rad in raw["data"]:
        ar = rad["key"][-1]  # sista nyckeln är Tid (år)
        if int(ar) >= FORSTA_AR:
            folkmangd[ar] = int(rad["values"][0])

    ut = {
        "kommun": "Kungsbacka",
        "regionkod": REGION_KUNGSBACKA,
        "matt": "Folkmängd 31 december respektive år",
        "kalla": "SCB, Befolkningsstatistik (BE0101), tabell BefolkningNy",
        "kallaUrl": TABELL_URL,
        "apiUrl": API_URL,
        "hamtad": date.today().isoformat(),
        "folkmangd": dict(sorted(folkmangd.items())),
    }

    utfil = Path(__file__).resolve().parent.parent / "data" / "scb" / "folkmangd_kungsbacka.json"
    utfil.parent.mkdir(parents=True, exist_ok=True)
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Sparade {len(folkmangd)} år ({min(folkmangd)}–{max(folkmangd)}) till {utfil}")


if __name__ == "__main__":
    main()
