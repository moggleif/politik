"""Hämtar partiernas kandidatlistor till kommunfullmäktige i Kungsbacka.

Källa: Valmyndighetens valpresentation, som är en webbapp som läser en öppen
JSON-fil per val och valtyp:

    https://data.val.se/assets/valtillfallen/val<år>/valdata/partier/kandidatur_KF_1384.json

(sidan för människor: https://data.val.se/val<år>/partier/valsedlar/valtyp/KF/omrade/13/kommun/1384).
Filen innehåller varje partis valsedlar så som de trycktes: listplats
("ordning"), namn och en uppgiftsrad med ålder, yrke och ort.

Läget just nu: tjänsten har bara valen 2022 och 2026. För 2010, 2014 och
2018 svarar samma adress med 404, och de listorna måste hämtas ur annan
källa (se data/KALLOR.md). Skriptet försöker ändå alla fem valen och
säger tydligt vilka som saknas – ett saknat val är en lucka, inte en tom
lista.

Kontroller, som avbryter hellre än sparar något som inte stämmer:
  * kommunkoden i filen är den vi bad om (KF_1384),
  * varje valsedels listplatser är 1, 2, 3 … utan hopp eller dubbletter,
  * inga tomma namn.
Partier utan valsedel (anmälda men utan tryckt lista) sparas inte; de har
inga kandidater att visa.

Skriver data/kandidater/<år>.json. Körs: python3 scripts/hamta_valsedlar.py
"""

import json
import sys
import urllib.error
from pathlib import Path

from val import KOMMUN, hamta

ROT = Path(__file__).resolve().parent.parent
UT = ROT / "data" / "kandidater"
VAL = [2010, 2014, 2018, 2022, 2026]
ADRESS = ("https://data.val.se/assets/valtillfallen/val{ar}/valdata/"
          "partier/kandidatur_KF_{kommun}.json")


def granska(ar: int, data: dict) -> None:
    if data.get("fileKey") != f"KF_{KOMMUN}":
        sys.exit(f"{ar}: fileKey {data.get('fileKey')!r}, väntade KF_{KOMMUN}")
    for parti in data["partier"]:
        for sedel in parti["valsedlar"]:
            # Raderna ligger sorterade som text ("1, 10, 11 … 2"); sorteras
            # numeriskt här, och på samma sätt i forenkla().
            sedel["rader"].sort(key=lambda r: int(r["ordning"]))
            ordning = [int(r["ordning"]) for r in sedel["rader"]]
            if ordning != list(range(1, len(ordning) + 1)):
                sys.exit(f"{ar}: {parti['namn']} lista {sedel['listnummer']} "
                         f"har listplatser som inte är 1..n: {ordning}")
            for r in sedel["rader"]:
                if not r["namn"].strip():
                    sys.exit(f"{ar}: {parti['namn']} har en kandidat utan namn")


def forenkla(ar: int, data: dict) -> dict:
    partier = []
    for p in data["partier"]:
        if not p["valsedlar"]:
            continue
        partier.append({
            "kod": p["kod"],
            "namn": p["namn"],
            "listor": [{
                "listnamn": s["listnamn"],
                "listnummer": s["listnummer"],
                "kandidater": [{
                    "plats": int(r["ordning"]),
                    "namn": r["namn"],
                    "samtycke": r["samtycke"],
                    "uppgift": r["uppgift"],
                } for r in s["rader"]],
            } for s in p["valsedlar"]],
        })
    return {
        "val": ar,
        "valtyp": "KF",
        "kommun": KOMMUN,
        "kalla": ADRESS.format(ar=ar, kommun=KOMMUN),
        "partier": partier,
    }


def main() -> None:
    UT.mkdir(parents=True, exist_ok=True)
    saknas = []
    for ar in VAL:
        url = ADRESS.format(ar=ar, kommun=KOMMUN)
        try:
            data = json.loads(hamta(url))
        except urllib.error.HTTPError as fel:
            if fel.code != 404:
                raise
            saknas.append(ar)
            print(f"{ar}: finns inte hos Valmyndigheten (404)")
            continue
        granska(ar, data)
        ut = forenkla(ar, data)
        (UT / f"{ar}.json").write_text(
            json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        antal = sum(len(s["kandidater"]) for p in ut["partier"] for s in p["listor"])
        print(f"{ar}: {len(ut['partier'])} partier, {antal} kandidater")
    if saknas:
        print(f"Saknas: {', '.join(map(str, saknas))} – hämtas ur annan källa.")


if __name__ == "__main__":
    main()
