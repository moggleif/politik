#!/usr/bin/env python3
"""Bygger docs/data-befolkning.json: den faktiska befolkningen efter ålder.

Till skillnad från build_data.py, som ställer kommunens prognoser mot
utfallet, innehåller den här filen **enbart faktiskt utfall** från SCB.
Inga prognossiffror ingår.

Läser:
  data/scb/folkmangd_kungsbacka.json   (från hamta_scb.py)

Skriver:
  docs/data-befolkning.json

Tre serier redovisas: 0–15 år (förskole- och grundskoleåldern), 16–19 år
(gymnasieåldern) och hela folkmängden. Utöver antalen räknas tre saker
fram, som alla följer direkt ur samma tal:

  andel        gruppens andel av folkmängden, i procent
  forandring   förändringen mot föregående år, i personer
  index        utvecklingen med första året som 100, så att grupper av
               helt olika storlek går att jämföra i samma diagram

Körs:  python3 scripts/build_befolkning.py
"""

import json
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent

# utdatanyckel -> (etikett, var serien hämtas i SCB-filen)
SERIER = [
    ("0-15", "0–15 år", "aldersgrupper"),
    ("16-19", "16–19 år", "aldersgrupper"),
    ("total", "Hela folkmängden", None),
]


def lasa_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def serie_ur_scb(scb: dict, nyckel: str, var) -> dict:
    """Åren som heltal, så att sortering och differenser blir rätt."""
    rad = scb["folkmangd"] if var is None else scb.get("aldersgrupper", {}).get(nyckel, {})
    return {int(a): int(v) for a, v in rad.items()}


def bygg(scb: dict) -> dict:
    """Hela utdatan som en ren funktion av SCB-filen, så att den går att
    kontrollräkna i testerna utan att skriva någon fil."""
    total = serie_ur_scb(scb, "total", None)
    ar = sorted(total)

    serier = []
    for nyckel, etikett, var in SERIER:
        varden = serie_ur_scb(scb, nyckel, var)
        if not varden:
            print(f"Hoppar över {nyckel}: saknas i SCB-filen")
            continue

        forsta = varden[min(varden)]
        rader = {}
        forra = None
        for a in sorted(varden):
            v = varden[a]
            rader[a] = {
                "antal": v,
                "andel": round(100.0 * v / total[a], 2) if a in total else None,
                "forandring": (v - forra) if forra is not None else None,
                "index": round(100.0 * v / forsta, 1),
            }
            forra = v

        yngst, aldst = min(varden), max(varden)
        serier.append({
            "nyckel": nyckel,
            "etikett": etikett,
            "arGrupp": nyckel != "total",
            "varden": rader,
            "forsta": varden[yngst],
            "sista": varden[aldst],
            "forstaAr": yngst,
            "sistaAr": aldst,
            "hogsta": max(varden.values()),
            "hogstaAr": max(varden, key=lambda a: varden[a]),
            "lagsta": min(varden.values()),
            "lagstaAr": min(varden, key=lambda a: varden[a]),
        })

    ut = {
        "kommun": scb.get("kommun", "Kungsbacka"),
        "serie": "Folkmängd efter ålder, faktiskt utfall",
        "matt": scb.get("matt"),
        "kalla": scb.get("kalla"),
        "kallaUrl": scb.get("kallaUrl"),
        "apiUrl": scb.get("apiUrl"),
        "hamtad": scb.get("hamtad"),
        "ar": ar,
        "serier": serier,
    }

    return ut


def main() -> None:
    scb = lasa_json(ROT / "data" / "scb" / "folkmangd_kungsbacka.json")
    ut = bygg(scb)
    ar, serier = ut["ar"], ut["serier"]
    utfil = ROT / "docs" / "data-befolkning.json"
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Skrev {utfil.name}: {len(serier)} serier, {len(ar)} år ({ar[0]}–{ar[-1]})")
    for s in serier:
        print(f"  {s['etikett']}: {s['forsta']} ({s['forstaAr']}) → {s['sista']} ({s['sistaAr']}), "
              f"högst {s['hogsta']} år {s['hogstaAr']}")


if __name__ == "__main__":
    main()
