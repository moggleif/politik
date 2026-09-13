#!/usr/bin/env python3
"""Bygger datafilerna över den faktiska befolkningen efter ålder.

Till skillnad från build_data.py, som ställer kommunens prognoser mot
utfallet, innehåller de här filerna **enbart faktiskt utfall** från SCB.
Inga prognossiffror ingår.

Läser, för varje kommun i KOMMUNER:
  data/scb/folkmangd_<kommun>.json   (från hamta_scb.py)

Skriver:
  docs/data-befolkning.json           Kungsbacka
  docs/data-varberg-befolkning.json   Varberg

Tre serier redovisas: 0–15 år (förskole- och grundskoleåldern),
gymnasieåldern (16–19 år i Kungsbacka, 16–18 år i Varberg – den indelning
respektive kommuns prognoser använder, hämtad så ur SCB) och hela
folkmängden. Utöver antalen räknas tre saker fram, som alla följer direkt
ur samma tal:

  andel        gruppens andel av folkmängden, i procent
  forandring   förändringen mot föregående år, i personer
  index        utvecklingen med första året som 100, så att grupper av
               helt olika storlek går att jämföra i samma diagram

Körs:  python3 scripts/build_befolkning.py [--kommun kungsbacka|varberg]
"""

import argparse
import json
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent

# kommun -> (SCB-fil, utfil)
KOMMUNER = {
    "kungsbacka": ("folkmangd_kungsbacka.json", "data-befolkning.json"),
    "varberg": ("folkmangd_varberg.json", "data-varberg-befolkning.json"),
}


def serier_for(scb: dict) -> list:
    """utdatanyckel -> (etikett, var serien hämtas i SCB-filen).

    0–15 först, sedan gymnasieåldern så som SCB-filen har den (16–19 eller
    16–18), sist hela folkmängden – samma ordning oavsett kommun."""
    grupper = scb.get("aldersgrupper", {})
    gymnasie = [g for g in grupper if g != "0-15"]
    ut = [("0-15", "0–15 år", "aldersgrupper")]
    for g in gymnasie:
        ut.append((g, g.replace("-", "–") + " år", "aldersgrupper"))
    ut.append(("total", "Hela folkmängden", None))
    return ut


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
    for nyckel, etikett, var in serier_for(scb):
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


def bygg_kommun(kommun: str) -> None:
    scbfil, utnamn = KOMMUNER[kommun]
    scb = lasa_json(ROT / "data" / "scb" / scbfil)
    ut = bygg(scb)
    ar, serier = ut["ar"], ut["serier"]
    utfil = ROT / "docs" / utnamn
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Skrev {utfil.name}: {len(serier)} serier, {len(ar)} år ({ar[0]}–{ar[-1]})")
    for s in serier:
        print(f"  {s['etikett']}: {s['forsta']} ({s['forstaAr']}) → {s['sista']} ({s['sistaAr']}), "
              f"högst {s['hogsta']} år {s['hogstaAr']}")


def main() -> None:
    arg = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    arg.add_argument("--kommun", choices=sorted(KOMMUNER),
                     help="bygg bara den här kommunen (annars alla)")
    val = arg.parse_args()
    for kommun in ([val.kommun] if val.kommun else sorted(KOMMUNER)):
        bygg_kommun(kommun)


if __name__ == "__main__":
    main()
