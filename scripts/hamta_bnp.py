#!/usr/bin/env python3
"""Hämtar BNP och rikets folkmängd från SCB, för nämnaren på resurssidan.

Referenskostnaden som resurssidan mäter mot är en **relativ** måttstock:
den räknas fram ur vad kommunerna faktiskt lägger. Drar alla kommuner ner
samtidigt sjunker referensen med dem, och en kommun kan närma sig noll
utan att ha lagt en krona mer. Sidan kan alltså inte se en nationell
trend – den mäter avstånd till genomsnittet, inte genomsnittets nivå.

Det går bara att avgöra med en nämnare utanför kommunsektorn, och BNP är
den naturliga: grundskolans kostnad som andel av BNP säger hur stor del
av det samhället producerar som går till grundskolan. Som alla mått på
resurssidan är det en kvot inom samma år, så ingen prisomräkning behövs.

Två serier hämtas:

  BNP till marknadspris, löpande priser (tabell TAB5621, 1950–)
  Folkmängd i riket 31 december (samma tabell som hamta_scb.py använder)

Folkmängden behövs för att Koladas kostnadstal är kronor per invånare;
andelen av BNP blir kostnad per invånare gånger folkmängd, delat med BNP.

Att BNP anges i löpande priser är avsiktligt och nödvändigt: kvoten ska
ställa samma års kronor mot samma års kronor. Fasta priser i täljaren
eller nämnaren, men inte båda, vore ett räknefel.

Resultatet sparas till data/scb/bnp.json.

Körs:  python3 scripts/hamta_bnp.py
"""

import json
import ssl
import urllib.request
from datetime import date
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent

BNP_TABELL = "TAB5621"
BNP_URL = ("https://api.scb.se/OV0104/v2beta/api/v2/tables/"
           f"{BNP_TABELL}/data?lang=sv&outputFormat=json-stat2")
BNP_TABELL_URL = ("https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/"
                  "START__NR__NR0103__NR0103A/NR0103ENS2010T01A/")

FOLK_URL = ("https://api.scb.se/OV0104/v1/doris/sv/ssd/START/BE/BE0101/"
            "BE0101A/BefolkningNy")
FOLK_TABELL_URL = ("https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/"
                   "START__BE__BE0101__BE0101A/BefolkningNy/")

BNPM = "BNPM"              # BNP till marknadspris
LOPANDE = "000004BZ"       # Löpande priser, mnkr
FORSTA_AR = 2000           # längre bak än kostnadsserierna räcker


def posta(url: str, kropp: dict) -> dict:
    req = urllib.request.Request(
        url, data=json.dumps(kropp).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(url=req, timeout=90,
                                context=ssl.create_default_context()) as resp:
        return json.loads(resp.read().decode("utf-8-sig"))


def hamta_bnp() -> dict:
    """BNP till marknadspris i löpande priser, miljoner kronor per år.

    Svaret är json-stat2: `value` är en platt lista i samma ordning som
    `dimension.Tid.category.index`, så åren läses därifrån."""
    svar = posta(BNP_URL, {"selection": [
        {"variableCode": "Anvandningstyp", "valueCodes": [BNPM]},
        {"variableCode": "ContentsCode", "valueCodes": [LOPANDE]},
        {"variableCode": "Tid", "valueCodes": ["*"]},
    ]})
    tid = svar["dimension"]["Tid"]["category"]["index"]
    varden = svar["value"]
    return {ar: float(varden[i]) for ar, i in tid.items()
            if varden[i] is not None and int(ar) >= FORSTA_AR}


def hamta_folkmangd() -> dict:
    """Folkmängden i riket 31 december, per år."""
    svar = posta(FOLK_URL, {
        "query": [
            {"code": "Region",
             "selection": {"filter": "vs:RegionRiket99", "values": ["00"]}},
            {"code": "ContentsCode",
             "selection": {"filter": "item", "values": ["BE0101N1"]}},
        ],
        "response": {"format": "json"},
    })
    return {rad["key"][-1]: int(rad["values"][0]) for rad in svar["data"]
            if int(rad["key"][-1]) >= FORSTA_AR}


def main() -> None:
    bnp = hamta_bnp()
    folk = hamta_folkmangd()
    if not bnp or not folk:
        raise SystemExit("SCB svarade utan tal – hämtningen avbryts.")

    ut = {
        "omrade": "Hela riket",
        "matt": "BNP till marknadspris, löpande priser (miljoner kronor), "
                "och folkmängd 31 december",
        "kalla": "SCB, Nationalräkenskaperna (NR0103), BNP från "
                 "användningssidan, samt Befolkningsstatistik (BE0101)",
        "kallaUrl": BNP_TABELL_URL,
        "folkmangdKallaUrl": FOLK_TABELL_URL,
        "apiUrl": BNP_URL,
        "hamtad": date.today().isoformat(),
        "bnpLopandePriser": dict(sorted(bnp.items())),
        "folkmangd": dict(sorted(folk.items())),
    }

    utfil = ROT / "data" / "scb" / "bnp.json"
    utfil.parent.mkdir(parents=True, exist_ok=True)
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=2) + "\n",
                     encoding="utf-8")

    bar, far = sorted(bnp), sorted(folk)
    print(f"Sparade till {utfil}")
    print(f"  BNP: {bar[0]}–{bar[-1]}, {bar[-1]}: {bnp[bar[-1]]:,.0f} mnkr"
          .replace(",", " "))
    print(f"  Folkmängd: {far[0]}–{far[-1]}, {far[-1]}: {folk[far[-1]]:,}"
          .replace(",", " "))


if __name__ == "__main__":
    main()
