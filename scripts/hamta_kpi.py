#!/usr/bin/env python3
"""Hämtar konsumentprisindex (KPI) för hela riket från SCB:s öppna API.

Kostnader i löpande priser går inte att jämföra mellan år: en krona 2002
och en krona 2024 är olika mycket. KPI är den serie som gör dem
jämförbara – kostnadssidan räknar om varje års kostnad till det senaste
årets prisnivå med kvoten mellan årens indextal.

Serien som hämtas är **fastställda årsmedeltal, totalt, 1980 = 100**
(tabell TAB4352 i PxWeb API 2.0, statistikprodukt PR0101). Fastställda
årsmedeltal är det tal SCB själv anvisar för omräkning mellan år: det är
slutgiltigt och revideras inte, till skillnad från månadstalen. Basåret
1980 spelar ingen roll för omräkningen – bara kvoten mellan två år
används, och den är densamma oavsett bas.

Årsmedeltalet passar kostnadsstatistiken: kostnaden avser ett helt
kalenderår, inte en tidpunkt i det.

Resultatet sparas till data/scb/kpi.json.

Körs:  python3 scripts/hamta_kpi.py
"""

import json
import ssl
import urllib.request
from datetime import date
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent

TABELL = "TAB4352"
API_URL = ("https://api.scb.se/OV0104/v2beta/api/v2/tables/"
           f"{TABELL}/data?lang=sv&outputFormat=json-stat2")
# Mänsklig länk till samma tabell i Statistikdatabasen (källänk på hemsidan)
TABELL_URL = ("https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/"
              "START__PR__PR0101__PR0101A/KPIFastAr/")

FORSTA_AR = 1980
INNEHALL = "000000KL"     # måttet Index


def posta(url: str, kropp: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(kropp).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90,
                                context=ssl.create_default_context()) as resp:
        return json.loads(resp.read().decode("utf-8-sig"))


def hamta() -> dict:
    """Hela serien, år -> indextal.

    Svaret är json-stat2: `value` är en platt lista i samma ordning som
    `dimension.Tid.category.index`, så åren måste läsas därifrån och
    aldrig antas ligga i stigande ordning."""
    svar = posta(API_URL, {
        "selection": [
            {"variableCode": "ContentsCode", "valueCodes": [INNEHALL]},
            {"variableCode": "Tid", "valueCodes": ["*"]},
        ]
    })
    tid = svar["dimension"]["Tid"]["category"]["index"]
    varden = svar["value"]
    serie = {}
    for ar, i in tid.items():
        if varden[i] is None or int(ar) < FORSTA_AR:
            continue
        serie[ar] = float(varden[i])
    return dict(sorted(serie.items()))


def main() -> None:
    serie = hamta()
    if not serie:
        raise SystemExit("SCB svarade utan indextal – hämtningen avbryts.")

    ut = {
        "matt": "Konsumentprisindex (KPI), fastställda årsmedeltal, totalt, 1980=100",
        "omrade": "Hela riket",
        "kalla": "SCB, Konsumentprisindex (PR0101), fastställda årsmedeltal",
        "kallaUrl": TABELL_URL,
        "apiUrl": API_URL,
        "hamtad": date.today().isoformat(),
        "kpi": serie,
    }

    utfil = ROT / "data" / "scb" / "kpi.json"
    utfil.parent.mkdir(parents=True, exist_ok=True)
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=2) + "\n",
                     encoding="utf-8")
    ar = sorted(serie)
    print(f"Sparade {len(serie)} år ({ar[0]}–{ar[-1]}) till {utfil}")
    print(f"  {ar[-1]}: {serie[ar[-1]]}  ({ar[0]}: {serie[ar[0]]})")


if __name__ == "__main__":
    main()
