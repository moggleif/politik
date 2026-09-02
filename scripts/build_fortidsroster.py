#!/usr/bin/env python3
"""Bygger docs/data-fortidsroster.json: förtidsröstningen i det område
sidan följer, dag för dag, ställd mot förra riksdagsvalet.

Läser:
  data/fortidsroster/fortidsroster_<år>.json   (från hamta_fortidsroster.py)
  data/fortidsroster/rostberattigade.json      (från hamta_rostberattigade.py)

Skriver:
  docs/data-fortidsroster.json

Valen ligger inte på samma kalenderdatum – valdagen 2026 är söndagen
den 13 september, 2022 var den söndagen den 11 september – så åren
jämförs på **dagar kvar till valdagen**, med valdagen som 0. Då hamnar
samma veckodag på samma plats i båda serierna, vilket spelar roll:
röstmottagningen dippar tydligt de dagar lokalerna har kortare öppettider.

Dagar som ännu inte inträffat står som 0 i Valmyndighetens fil och
utelämnas här i stället för att ritas som nollor. Regeln följer
tidsstämpeln `hamtad` i datafilen: dagar före hämtningsdagen räknas som
avslutade, hämtningsdagen själv tas med bara om den har röster och
markeras då som pågående (filen uppdateras kl. 06 och 14, så mitt på
dagen är dagens siffra ofullständig), senare dagar utelämnas.

Nyckeltalen jämför vid senaste *avslutade* dag, så att en halv dag inte
ställs mot en hel.

Körs:  python3 scripts/build_fortidsroster.py
"""

import json
from datetime import date, datetime
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent
IN_MAPP = ROT / "data" / "fortidsroster"
UT = ROT / "docs" / "data-fortidsroster.json"

VECKODAG = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"]


def lasa_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def hamtningsdag(post: dict) -> date:
    """Datumet (svensk tid) ur `hamtad`, som är en ISO-tidsstämpel med
    tidszon – eller bara ett datum i äldre filer."""
    return datetime.fromisoformat(post["hamtad"]).date()


def dagserie(post: dict) -> list:
    """Dagarna i ordning, med bara de dagar som inträffat."""
    valdag = date.fromisoformat(post["valdag"])
    idag = hamtningsdag(post)
    ut = []
    ack = 0
    for d in post["datum"]:
        datum = date.fromisoformat(d)
        antal = sum(l["perDag"].get(d, 0) for l in post["lokaler"])
        if datum > idag:
            break
        pagar = datum == idag
        if pagar and antal == 0:
            break
        ack += antal
        ut.append({
            "datum": d,
            "veckodag": VECKODAG[datum.weekday()],
            "kvar": (valdag - datum).days,
            "antal": antal,
            "ack": ack,
            "pagar": pagar,
        })
    return ut


def lokallista(post: dict, dagar: list) -> list:
    """Lokalerna sorterade efter mottagna röster under de dagar som
    inträffat. Lokaler helt utan röster tas med, så att listan visar
    vilka som ännu inte öppnat (särskilda röstmottagningsställen som
    vård- och omsorgsboenden har ofta en enda dag)."""
    med = [d["datum"] for d in dagar]
    ut = []
    for l in post["lokaler"]:
        varden = [l["perDag"].get(d, 0) for d in med]
        total = sum(varden)
        ut.append({
            "namn": l["namn"],
            "lokalId": l["lokalId"],
            "total": total,
            "dagarMedRoster": sum(1 for v in varden if v > 0),
            "storstaDag": (max(varden) if varden else 0),
        })
    ut.sort(key=lambda l: (-l["total"], l["namn"]))
    summa = sum(l["total"] for l in ut)
    for l in ut:
        l["andel"] = round(100.0 * l["total"] / summa, 1) if summa else None
    return ut


def andel(antal, namnare):
    if antal is None or not namnare:
        return None
    return round(100.0 * antal / namnare, 1)


def bygg_val(post: dict, rb) -> dict:
    dagar = dagserie(post)
    avslutade = [d for d in dagar if not d["pagar"]]
    pagaende = dagar[-1] if dagar and dagar[-1]["pagar"] else None
    total = dagar[-1]["ack"] if dagar else 0
    total_avslutad = avslutade[-1]["ack"] if avslutade else 0
    rostberattigade = None
    if rb:
        rostberattigade = {k: rb.get(k) for k in
                           ("kvalifikationsdag", "riksdag", "kommun", "region",
                            "minstEtt", "valdistrikt", "kalla", "kallaUrl",
                            "sidaUrl", "hamtad")}
    storsta = max(avslutade, key=lambda d: d["antal"]) if avslutade else None
    return {
        "ar": post["ar"],
        "valdag": post["valdag"],
        "forstaDag": post["datum"][0],
        "antalDagar": len(post["datum"]),
        "omrade": post["omrade"],
        "lan": post["lan"],
        "kalla": post["kalla"],
        "kallaUrl": post["kallaUrl"],
        "sidaUrl": post["sidaUrl"],
        "preliminarTom": post.get("preliminarTom"),
        "hamtad": post["hamtad"],
        "klart": len(avslutade) == len(post["datum"]),
        "dagar": dagar,
        "total": total,
        "totalAvslutad": total_avslutad,
        "sistaAvslutadDag": avslutade[-1]["datum"] if avslutade else None,
        "sistaAvslutadKvar": avslutade[-1]["kvar"] if avslutade else None,
        "pagaende": pagaende,
        "storstaDag": storsta,
        "rostberattigade": rostberattigade,
        "andelAvRostberattigade": andel(
            total_avslutad, rostberattigade and rostberattigade["riksdag"]),
        "lokaler": lokallista(post, dagar),
    }


def jamfor(aktuellt: dict, forra: dict):
    """Läget vid senaste avslutade dag, ställt mot förra valet vid samma
    antal dagar kvar."""
    if aktuellt["sistaAvslutadKvar"] is None:
        return None
    kvar = aktuellt["sistaAvslutadKvar"]
    da = next((d for d in forra["dagar"] if d["kvar"] == kvar), None)
    if da is None:
        return None
    nu = aktuellt["totalAvslutad"]
    diff = nu - da["ack"]
    rb_nu = aktuellt["rostberattigade"] and aktuellt["rostberattigade"]["riksdag"]
    rb_da = forra["rostberattigade"] and forra["rostberattigade"]["riksdag"]
    return {
        "kvar": kvar,
        "datumNu": aktuellt["sistaAvslutadDag"],
        "datumDa": da["datum"],
        "veckodag": da["veckodag"],
        "antalNu": nu,
        "antalDa": da["ack"],
        "diff": diff,
        "diffPct": round(100.0 * diff / da["ack"], 1) if da["ack"] else None,
        "andelNu": andel(nu, rb_nu),
        "andelDa": andel(da["ack"], rb_da),
        "slutDa": forra["total"],
        "andelSlutDa": andel(forra["total"], rb_da),
    }


def bygg(valfiler: list, rostberattigade) -> dict:
    """Hela utdatan som en ren funktion av indatafilerna, så att den går
    att kontrollräkna i testerna."""
    rb_val = (rostberattigade or {}).get("val", {})
    val = {}
    for post in sorted(valfiler, key=lambda p: p["ar"]):
        val[str(post["ar"])] = bygg_val(post, rb_val.get(str(post["ar"])))
    ar = sorted(int(a) for a in val)
    aktuellt = val[str(ar[-1])]
    forra = val[str(ar[-2])] if len(ar) > 1 else None
    return {
        "omrade": aktuellt["omrade"],
        "lan": aktuellt["lan"],
        "kalla": "Valmyndigheten",
        "kallaUrl": aktuellt["sidaUrl"],
        "aktuellt": ar[-1],
        "forra": ar[-2] if forra else None,
        "senastUppdaterad": aktuellt["hamtad"],
        "preliminarTom": aktuellt["preliminarTom"],
        "val": val,
        "jamforelse": jamfor(aktuellt, forra) if forra else None,
    }


def main() -> None:
    valfiler = [lasa_json(f) for f in sorted(IN_MAPP.glob("fortidsroster_*.json"))]
    if not valfiler:
        raise SystemExit("Inga datafiler i data/fortidsroster/")
    rb_fil = IN_MAPP / "rostberattigade.json"
    rb = lasa_json(rb_fil) if rb_fil.exists() else None
    ut = bygg(valfiler, rb)
    UT.write_text(json.dumps(ut, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    a = ut["val"][str(ut["aktuellt"])]
    print(f"Skrev {UT.relative_to(ROT)}: {a['omrade']} {a['ar']}, "
          f"{len(a['dagar'])} dagar, {a['total']} förtidsröster"
          + (f" (jämfört med {ut['jamforelse']['antalDa']} vid samma punkt {ut['forra']})"
             if ut["jamforelse"] else ""))


if __name__ == "__main__":
    main()
