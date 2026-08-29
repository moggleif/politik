#!/usr/bin/env python3
"""Bygger docs/data-amnesbetyg.json av data/amnesbetyg/.

Sätter ihop läsåren till tidsserier, ett ämne per serie, för hela
Kungsbacka kommun (huvudmannatypen "Samtliga" i Skolverkets rapport).

Två mått följer med, och de blandas aldrig i samma diagram eftersom de
har olika skalor:

  betygspoang   genomsnittlig betygspoäng i ämnet, 0–20
                (A=20, B=17,5, C=15, D=12,5, E=10, F=0)
  andelAE       andelen elever som fick godkänt betyg, 0–100 %

För varje ämne räknas dessutom skillnaden mellan flickors och pojkars
betygspoäng fram, och för varje läsår ett medelvärde över ett fast urval
ämnen – de som redovisas samtliga läsår. Se kommentaren vid `karnamnen`
för varför urvalet är fast och varför snittet inte elevviktas.

Dubbelprickning: uppgifter som bygger på färre än tio elever redovisas
inte av Skolverket. Ämnen som aldrig når över gränsen – i Kungsbacka
teckenspråk och delar av moderna språk – får inga värden alls. De tas
med i utdatan ändå, markerade, så att sidan kan skriva ut att de finns
men inte går att redovisa.

Körs:  python3 scripts/build_amnesbetyg.py
"""

import json
import math
from pathlib import Path

from program import POANG_MAX

ROT = Path(__file__).resolve().parent.parent
HUVUDMAN = "Samtliga"

# Mått som bärs över per ämne och år
FALT = ["antal", "antalFlickor", "antalPojkar", "betygspoang", "andelAE",
        "betygspoangFlickor", "andelAEFlickor", "betygspoangPojkar", "andelAEPojkar"]


def lasa_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def bygg(arsfiler: list) -> dict:
    """Hela utdatan som en ren funktion av läsårsfilerna, så att den går
    att kontrollräkna i testerna utan att skriva någon fil."""
    ar = [d["ar"] for d in arsfiler]

    # ämne -> år -> mätvärden
    per_amne = {}
    for d in arsfiler:
        for rad in d["amnen"]:
            if rad["huvudman"] != HUVUDMAN:
                continue
            per_amne.setdefault(rad["amne"], {})[d["ar"]] = rad

    amnen = []
    for namn in sorted(per_amne):
        varden = {}
        for a in ar:
            rad = per_amne[namn].get(a)
            if rad is None:
                varden[a] = None
                continue
            post = {f: rad.get(f) for f in FALT}
            f, p = rad.get("betygspoangFlickor"), rad.get("betygspoangPojkar")
            # Könsskillnaden är bara meningsfull när båda talen redovisas
            post["konsskillnad"] = round(f - p, 1) if f is not None and p is not None else None
            post["dolt"] = rad.get("markor") == ".."
            varden[a] = post

        med = [a for a in ar if varden[a] and varden[a]["betygspoang"] is not None]
        amnen.append({
            "namn": namn,
            "varden": varden,
            "arMedPoang": len(med),
            "forstaAr": med[0] if med else None,
            "sistaAr": med[-1] if med else None,
            "forsta": varden[med[0]]["betygspoang"] if med else None,
            "sista": varden[med[-1]]["betygspoang"] if med else None,
            "forandring": (round(varden[med[-1]]["betygspoang"] - varden[med[0]]["betygspoang"], 1)
                           if len(med) > 1 else None),
            "redovisas": bool(med),
        })

    # Årssnittet räknas över ett **fast** ämnesurval: de ämnen som har
    # betygspoäng samtliga läsår. Två skäl:
    #
    #  1. Annars driver sammansättningen serien. Faller ett ämne bort ett
    #     år ändras snittet av vilka ämnen som ingår, inte av betygen.
    #  2. Elevantalet går inte att vikta med. Läsåret 2024/25 dubbelprickar
    #     Skolverket antalet elever i engelska, matematik och svenska men
    #     redovisar ändå betygen. En elevviktning skulle tyst utesluta just
    #     de ämnena och lyfta snittet – matematik är ett av de lägsta.
    #
    # Ämnena läses av samma årskull och är nästan lika stora, så ett ovägt
    # medelvärde över det fasta urvalet ligger mycket nära ett elevviktat.
    karnamnen = [x["namn"] for x in amnen if x["arMedPoang"] == len(ar)]

    def medel(varden):
        v = [x for x in varden if x is not None]
        return round(math.fsum(v) / len(v), 2) if v else None

    sammanfattning = []
    for d in arsfiler:
        a = d["ar"]
        karna = [x["varden"][a] for x in amnen
                 if x["namn"] in karnamnen and x["varden"].get(a)]
        alla = [x["varden"][a] for x in amnen
                if x["varden"].get(a) and x["varden"][a]["betygspoang"] is not None]
        antal = [r["antal"] for r in alla if r["antal"]]
        sammanfattning.append({
            "ar": a,
            "lasar": d.get("lasar"),
            "antalAmnen": len([x for x in amnen if x["varden"].get(a)]),
            "amnenMedPoang": len(alla),
            "betygspoang": medel([r["betygspoang"] for r in karna]),
            "andelAE": medel([r["andelAE"] for r in karna]),
            "elever": max(antal) if antal else None,
        })

    ut = {
        "kommun": arsfiler[-1]["kommun"],
        "serie": "Slutbetyg per ämne i årskurs 9",
        "niva": arsfiler[-1]["niva"],
        "matt": "Genomsnittlig betygspoäng (0–20) och andel med betyget A–E (%)",
        "maxPoang": POANG_MAX,
        "huvudman": HUVUDMAN,
        "karnamnen": karnamnen,
        "ar": ar,
        "lasar": {d["ar"]: d.get("lasar") for d in arsfiler},
        "amnen": amnen,
        "sammanfattning": sammanfattning,
        "kallor": [{k: d.get(k) for k in
                    ("ar", "lasar", "rapportTitel", "kalla", "kallaUrl", "statistikUrl", "hamtad")}
                   for d in arsfiler],
    }

    return ut


def main() -> None:
    filer = sorted((ROT / "data" / "amnesbetyg").glob("amnesbetyg_*.json"))
    if not filer:
        raise SystemExit("Inga filer i data/amnesbetyg/ – kör hamta_amnesbetyg.py först")

    arsfiler = [lasa_json(f) for f in filer]
    ut = bygg(arsfiler)
    ar, amnen = ut["ar"], ut["amnen"]
    utfil = ROT / "docs" / "data-amnesbetyg.json"
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    redovisade = [a for a in amnen if a["redovisas"]]
    print(f"Skrev {utfil.name}: {len(amnen)} ämnen ({len(redovisade)} med värden), "
          f"{len(ar)} läsår ({ar[0]}–{ar[-1]})")
    for a in amnen:
        if not a["redovisas"]:
            print(f"  utan värden (dubbelprickat alla år): {a['namn']}")
        elif a["arMedPoang"] < len(ar):
            print(f"  ofullständig: {a['namn']} ({a['arMedPoang']}/{len(ar)} år)")


if __name__ == "__main__":
    main()
