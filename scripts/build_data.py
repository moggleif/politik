#!/usr/bin/env python3
"""Bygger docs/data.json av innehållet i data/.

Läser:
  data/scb/folkmangd_kungsbacka.json   (faktisk folkmängd, från fetch_scb.py)
  data/prognoser/prognos_*.json        (en fil per prognosrapport)

Beräknar för varje prognos avvikelsen mot utfallet per målår, samt
träffsäkerheten som funktion av hur många år i förväg prognosen gjordes.

Körs:  python3 scripts/build_data.py
"""

import json
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent


def lasa_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def main() -> None:
    scb = lasa_json(ROT / "data" / "scb" / "folkmangd_kungsbacka.json")
    utfall = {int(ar): v for ar, v in scb["folkmangd"].items()}

    prognoser = []
    for fil in sorted((ROT / "data" / "prognoser").glob("prognos_*.json")):
        p = lasa_json(fil)
        prognos = {int(ar): v for ar, v in p["prognos"].items()}

        avvikelser = {}
        for ar, varde in prognos.items():
            if ar in utfall:
                diff = varde - utfall[ar]
                avvikelser[ar] = {
                    "prognos": varde,
                    "utfall": utfall[ar],
                    "diff": diff,
                    "pct": round(100.0 * diff / utfall[ar], 2),
                    "avstand": ar - p["prognosAr"],
                }
        p["prognos"] = {str(k): v for k, v in sorted(prognos.items())}
        p["avvikelser"] = {str(k): v for k, v in sorted(avvikelser.items())}
        prognoser.append(p)

    prognoser.sort(key=lambda p: p["prognosAr"])

    # Träffsäkerhet per avstånd (0 år = prognosens eget startår, 1 år i förväg, ...)
    per_avstand = {}
    for p in prognoser:
        for a in p["avvikelser"].values():
            per_avstand.setdefault(a["avstand"], []).append(abs(a["pct"]))
    avstand_lista = [
        {
            "avstand": avst,
            "medelAbsPct": round(sum(v) / len(v), 2),
            "maxAbsPct": round(max(v), 2),
            "antal": len(v),
        }
        for avst, v in sorted(per_avstand.items())
        if avst >= 0
    ]

    ut = {
        "kommun": scb["kommun"],
        "utfall": {str(k): v for k, v in sorted(utfall.items())},
        "utfallMeta": {
            "matt": scb["matt"],
            "kalla": scb["kalla"],
            "kallaUrl": scb["kallaUrl"],
            "hamtad": scb["hamtad"],
        },
        "prognoser": prognoser,
        "perAvstand": avstand_lista,
    }

    utfil = ROT / "docs" / "data.json"
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n_avv = sum(len(p["avvikelser"]) for p in prognoser)
    print(
        f"Skrev {utfil}: {len(prognoser)} prognoser, {len(utfall)} utfallsår, "
        f"{n_avv} jämförelsepunkter"
    )


if __name__ == "__main__":
    main()
