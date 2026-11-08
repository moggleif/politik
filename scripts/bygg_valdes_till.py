"""Kopplar personerna på valsedlarna till vad de valdes till efter valet:
kommunstyrelsen (KS), kommunstyrelsens arbetsutskott (KSAU), och ordförande
eller vice ordförande i en nämnd. Övriga poster (revisorer, bolag, stiftelser,
nämndledamöter) tas inte med.

Utgår från personfilerna (data/personer/<parti>.json: plats på valsedeln och om
platsen blev ett mandat i fullmäktige) och från protokollen:

  2022 (period 2023–2026)  fullmäktiges beslut 2022-12-06 + KS 2023-01-10 (KSAU)
  2014 (period 2015–2018)  fullmäktiges beslut 2014-12-09 + KS 2015-01-20 (KSAU)
  2018 (period 2019–2022)  beslut saknas: närvarolistor ur första protokollet
                           med text per organ (data/uppdrag/narvaro.json)
  2010 (period 2011–2014)  samma, närvarolistor

Beslut anger vilka som valdes (ledamot, ersättare, ordförande, vice ordförande);
närvarolistor anger bara vem som satt vid ett möte (och titeln om den står
efter namnet), så de ger ordförande, vice ordförande och närvarande ledamöter
men aldrig ersättare. Varje uppdrag har `kalla` (beslut eller närvaro) och
datum, så att läsaren ser hur säkert det är.

En person som i protokollet inte går att knyta till en plats på valsedeln
(listplats okänd, t.ex. för att namnet saknas för det valet eller personen inte
stod på listan) hamnar ändå med, med `listplats: null`, och räknas i
`luckor`.

Skriver data/valdes_till/<val>.json. Körs: python3 scripts/bygg_valdes_till.py
"""

import json
import re
from collections import Counter
from datetime import date
from pathlib import Path

from build_personer import nyckel, organisation

ROT = Path(__file__).resolve().parent.parent
DATA = ROT / "data"
UT = DATA / "valdes_till"

KALLOR = {
    2022: ("2023–2026", ["kf_val_2022-12-06", "ks_val_2023-01-10"]),
    2018: ("2019–2022", []),
    2014: ("2015–2018", ["kf_val_2014-12-09", "ks_val_2015-01-20"]),
    2010: ("2011–2014", []),
}
EXTERNA = re.compile(r"patientnämnd|gemensam nämnd|säkerhetsnämnden|samverkan|revision|överförmyndare i", re.I)


def organgrupp(namn: str):
    """('KS'|'KSAU'|'nämnd', visningsnamn) eller None för organ som inte ska med."""
    n = (namn or "").strip()
    nl = n.lower()
    if EXTERNA.search(nl):
        return None
    if nl.startswith("kommunstyrelsens arbetsutskott") or nl == "ksau":
        return "KSAU", "Kommunstyrelsens arbetsutskott"
    if nl.startswith("kommunstyrelse"):
        return "KS", "Kommunstyrelsen"
    if "arbetsutskott" in nl or "utskott" in nl:
        return None
    if "nämnd" in nl:
        return "nämnd", n[:1].upper() + n[1:]
    return None


def las_personer() -> dict:
    """{(parti, nyckel(namn)): person} ur data/personer/*.json."""
    idx = {}
    for f in sorted((DATA / "personer").glob("*.json")):
        if f.name.startswith("_"):
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        for p in d["personer"]:
            for v in p["namnvarianter"]:
                idx[(d["kortnamn"], nyckel(v))] = {**p, "kortnamn": d["kortnamn"]}
                for alias in d.get("aldre_kortnamn", []):
                    idx[(alias, nyckel(v))] = {**p, "kortnamn": d["kortnamn"]}
    return idx


def uppdrag_ur_beslut(filer: list) -> list:
    """[{parti, namn, organ, grupp, roll, kalla}] ur valbesluten."""
    ut = []
    for stam in filer:
        d = json.loads((DATA / "uppdrag" / f"{stam}.json").read_text(encoding="utf-8"))
        dat = d["protokoll"]["datum"]
        organ_prot = d["protokoll"]["organ"]
        for b in d["beslut"]:
            g = organgrupp(organisation(b["rubrik"]) or "")
            if g is None:
                continue
            for r in b["poster"]:
                roll = r["roll"]
                if g[0] == "nämnd" and "ordförande" not in roll:
                    continue
                if g[0] in ("KS", "KSAU") and roll not in ("ledamot", "ersättare", "ordförande", "vice ordförande",
                                                          "1:e vice ordförande", "2:e vice ordförande"):
                    continue
                ut.append({"parti": "L" if r["parti"] == "FP" else r["parti"], "namn": r["namn"], "grupp": g[0],
                           "organ": g[1], "roll": roll,
                           "kalla": {"typ": "beslut", "protokoll": f"{organ_prot} {dat}", "paragraf": b["paragraf"]}})
    return ut


def uppdrag_ur_narvaro(period: str) -> list:
    """Närvarolistor: ordförande/vice (titel efter namnet) och närvarande ledamöter i KS och KSAU,
    ur de (upp till) sex första protokollen med text per organ. Samma person, organ och roll
    slås ihop med alla mötesdatum där den syns."""
    d = json.loads((DATA / "uppdrag" / "narvaro.json").read_text(encoding="utf-8"))
    samlat = {}
    forsta = {}   # organets första möte med text i perioden
    for post in d["poster"]:
        if post["period"] != period or not post.get("datum"):
            continue
        g = organgrupp(post["organ"])
        if g is None:
            continue
        moten = post.get("flera_moten") or [{"datum": post["datum"], "utlasning": post["utlasning"]}]
        forsta[(post["slug"])] = post["datum"]
        for m in moten:
            # Ordförandens underskrift (m["ordforande_underskrift"]) är lagrad i narvaro.json men används inte
            # som uppdragsrad: den visar vem som ledde just det mötet, så vice ordförande dyker upp som ordförande.
            for u in m["utlasning"]:
                roll = u["titel"] or ("ledamot" if u["roll"] == "ledamot" else None)
                if roll is None or u["roll"] != "ledamot":
                    continue
                if g[0] == "nämnd" and not u["titel"]:
                    continue
                parti = "L" if u["parti"] == "FP" else u["parti"]
                k = (parti, u["namn"], g[0], g[1], roll)
                samlat.setdefault(k, set()).add((post["slug"], m["datum"]))
    return [{"parti": k[0], "namn": k[1], "grupp": k[2], "organ": k[3], "roll": k[4],
             "kalla": {"typ": "närvarolista", "moten": sorted(f"{sl} {dt}" for sl, dt in v),
                       "fran_forsta_motet": any(dt == forsta.get(sl) for sl, dt in v)}}
            for k, v in sorted(samlat.items())]


def bygg(ar: int, idx: dict) -> dict:
    period, filer = KALLOR[ar]
    uppdrag = uppdrag_ur_beslut(filer) if filer else uppdrag_ur_narvaro(period)
    personer = {}
    for u in uppdrag:
        p = idx.get((u["parti"], nyckel(u["namn"])))
        nyck = (u["parti"], nyckel(u["namn"]))
        if p is not None:
            nyck = (p["kortnamn"], p["id"])
        post = personer.setdefault(nyck, {"parti": u["parti"], "namn": u["namn"], "person_id": p["id"] if p else None,
                                          "listplats": None, "vald": None, "uppdrag": []})
        if p is not None:
            k = [c for c in p["kandidaturer"] if c["val"] == ar]
            if k:
                post["listplats"], post["vald"] = k[0]["plats"], k[0].get("vald")
        rad = {"organ": u["organ"], "roll": u["roll"], "kalla": u["kalla"]}
        if rad not in post["uppdrag"]:
            post["uppdrag"].append(rad)
    lista = sorted(personer.values(), key=lambda p: (p["parti"], p["listplats"] is None, p["listplats"] or 0, p["namn"]))
    luckor = {
        "utan_listplats": [p["namn"] for p in lista if p["listplats"] is None],
        "inte_valda_i_fullmaktige": [p["namn"] for p in lista if p["listplats"] is not None and not p["vald"]],
    }
    return {"val": ar, "mandatperiod": period, "byggd": date.today().isoformat(),
            "kalla": "beslut" if filer else "närvarolistor (första protokollet med text per organ)",
            "personer": lista, "luckor": luckor}


def main() -> None:
    idx = las_personer()
    UT.mkdir(parents=True, exist_ok=True)
    for ar in (2022, 2018, 2014, 2010):
        d = bygg(ar, idx)
        (UT / f"{ar}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        p = d["personer"]
        roller = Counter(({"Kommunstyrelsen": "KS", "Kommunstyrelsens arbetsutskott": "KSAU"}.get(u["organ"], "nämnd"), u["roll"])
                         for x in p for u in x["uppdrag"])
        print(f"{ar} ({d['mandatperiod']}, {d['kalla'][:7]}): {len(p)} personer med uppdrag; "
              f"{sum(1 for x in p if x['listplats'] is not None)} med känd listplats, "
              f"{sum(1 for x in p if x['vald'])} av dem valda i fullmäktige; "
              f"utan listplats: {len(d['luckor']['utan_listplats'])}")
        print("   ", {f"{o} {r}": n for (o, r), n in sorted(roller.items())})


if __name__ == "__main__":
    main()
