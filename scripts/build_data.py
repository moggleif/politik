#!/usr/bin/env python3
"""Bygger sidornas datafiler av innehållet i data/.

Läser:
  data/scb/folkmangd_kungsbacka.json   (faktiskt utfall, från fetch_scb.py)
  data/prognoser/prognos_*.json        (en fil per prognosrapport)

Skriver en fil per serie:
  docs/data.json          hela befolkningen
  docs/data-16-19.json    åldersgruppen 16–19 år (gymnasieåldern)

För varje prognos beräknas avvikelsen mot utfallet per målår, samt
träffsäkerheten som funktion av hur många år i förväg prognosen gjordes.

Körs:  python3 scripts/build_data.py
"""

import json
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent

# serienyckel -> (utfil, etikett, hur prognosserien hämtas ur en rapportfil)
SERIER = {
    "total": ("data.json", "Hela befolkningen", None),
    "16-19": ("data-16-19.json", "16–19 år", "16-19"),
}


def lasa_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def serie_ur_rapport(rapport: dict, grupp) -> dict:
    if grupp is None:
        return rapport["prognos"]
    return rapport.get("aldersgrupper", {}).get(grupp, {})


def bygg(scb: dict, rapporter: list, utfall: dict, grupp, etikett: str) -> dict:
    prognoser = []
    for rapport in rapporter:
        rad = serie_ur_rapport(rapport, grupp)
        if not rad:
            continue  # rapporten saknar den här serien, t.ex. annan åldersindelning
        prognos = {int(a): v for a, v in rad.items()}

        avvikelser = {}
        for ar, varde in prognos.items():
            if ar in utfall:
                diff = varde - utfall[ar]
                avvikelser[ar] = {
                    "prognos": varde,
                    "utfall": utfall[ar],
                    "diff": diff,
                    "pct": round(100.0 * diff / utfall[ar], 2),
                    "avstand": ar - rapport["prognosAr"],
                }

        p = {k: v for k, v in rapport.items() if k not in ("prognos", "aldersgrupper")}
        if grupp is not None:
            # åldersgruppssiffrorna står i en annan tabell än totalprognosen
            p["sidhanvisning"] = (
                f'Tabellen "Antal per åldersgrupp" i rapportens bilaga, raden {grupp} år'
            )
        p["prognos"] = {str(k): v for k, v in sorted(prognos.items())}
        p["avvikelser"] = {str(k): v for k, v in sorted(avvikelser.items())}
        prognoser.append(p)

    prognoser.sort(key=lambda p: p["prognosAr"])

    # Träffsäkerhet per avstånd (0 år = prognosens eget startår, 1 år i förväg, ...)
    #
    # Två olika mått, och skillnaden är själva poängen:
    #   medelAbsPct  hur STORT felet är (riktningen borträknad)
    #   medelPct     åt vilket HÅLL felet lutar, med tecken
    # Slumpmässiga fel tar ut varandra och ger medelPct nära noll. Ligger
    # medelPct tydligt skilt från noll är felet systematiskt, alltså något
    # en modell kan korrigera för.
    per_avstand = {}
    for p in prognoser:
        for a in p["avvikelser"].values():
            per_avstand.setdefault(a["avstand"], []).append(a["pct"])
    avstand_lista = [
        {
            "avstand": avst,
            "medelAbsPct": round(sum(abs(x) for x in v) / len(v), 2),
            "maxAbsPct": round(max(abs(x) for x in v), 2),
            "medelPct": round(sum(v) / len(v), 2),
            "antalOver": sum(1 for x in v if x > 0),
            "antal": len(v),
        }
        for avst, v in sorted(per_avstand.items())
        if avst >= 0
    ]

    alla = [a["pct"] for p in prognoser for a in p["avvikelser"].values()]
    skevhet = None
    if alla:
        skevhet = {
            "antal": len(alla),
            "antalOver": sum(1 for x in alla if x > 0),
            "medelPct": round(sum(alla) / len(alla), 2),
            "medelAbsPct": round(sum(abs(x) for x in alla) / len(alla), 2),
        }

    # Skevhet per årgång. En modell kan ha bytt riktning över tid – t.ex.
    # underskattat under en tillväxtperiod och överskattat efter en
    # vändning. Det är en annan sorts fel än en konstant skevhet, och
    # kräver en annan åtgärd, så det redovisas separat.
    per_argang = []
    for p in prognoser:
        v = [a["pct"] for a in p["avvikelser"].values()]
        if v:
            per_argang.append({
                "prognosAr": p["prognosAr"],
                "medelPct": round(sum(v) / len(v), 2),
                "antalOver": sum(1 for x in v if x > 0),
                "antal": len(v),
            })
    if skevhet is not None:
        riktningar = {x["medelPct"] > 0 for x in per_argang}
        skevhet["bytterRiktning"] = len(riktningar) > 1

    return {
        "kommun": scb["kommun"],
        "serie": etikett,
        "utfall": {str(k): v for k, v in sorted(utfall.items())},
        "utfallMeta": {
            "matt": scb["matt"],
            "kalla": scb["kalla"],
            "kallaUrl": scb["kallaUrl"],
            "hamtad": scb["hamtad"],
        },
        "prognoser": prognoser,
        "perAvstand": avstand_lista,
        "perArgang": per_argang,
        "skevhet": skevhet,
    }


def main() -> None:
    scb = lasa_json(ROT / "data" / "scb" / "folkmangd_kungsbacka.json")
    rapporter = [lasa_json(f) for f in sorted((ROT / "data" / "prognoser").glob("prognos_*.json"))]

    for nyckel, (utnamn, etikett, grupp) in SERIER.items():
        if grupp is None:
            utfall = {int(a): v for a, v in scb["folkmangd"].items()}
        else:
            rad = scb.get("aldersgrupper", {}).get(grupp)
            if not rad:
                print(f"Hoppar över {nyckel}: SCB-utfall saknas")
                continue
            utfall = {int(a): v for a, v in rad.items()}

        ut = bygg(scb, rapporter, utfall, grupp, etikett)
        utfil = ROT / "docs" / utnamn
        utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        n_avv = sum(len(p["avvikelser"]) for p in ut["prognoser"])
        print(
            f"Skrev {utfil.name}: {len(ut['prognoser'])} prognoser, "
            f"{len(utfall)} utfallsår, {n_avv} jämförelsepunkter"
        )


if __name__ == "__main__":
    main()
