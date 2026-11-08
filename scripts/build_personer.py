"""Bygger en personfil för ett parti: varje person som förekommer på partiets
kandidatlistor eller i fullmäktiges valbeslut, med sina kandidaturer och
uppdrag per mandatperiod.

Indata (alla i data/, inget annat):
  kandidater/<år>.json         partiernas kandidatlistor (Valmyndigheten)
  uppdrag/<organ>_val_<datum>.json  valbeslut i fullmäktiges decemberprotokoll (kf)
                               och kommunstyrelsens första möte (ks)
  uppdrag/troman_<datum>.json  kommunens register – bara som bekräftelse
  uppdrag/narvaro.json         närvarolistor ur första protokollet med text
                               per organ och period – ersättningskälla för
                               perioder utan valbeslut (2011–2014, 2019–2022)

Det som sparas är det källorna säger, ihopparat på namn *inom partiet*:

  * Personen är nyckeln. Samma namn i samma parti i flera källor är samma
    person. Namnet jämförs utan versaler, accenter och bindestrechens
    skillnader ("Ermin Škorić" = "Ermin Skoric"); alla stavningar som
    förekommer sparas under `namnvarianter`.
  * Två personer med samma namn i samma parti går inte att skilja åt.
    Förekommer ett namn två gånger på samma kandidatlista, eller två
    gånger i samma roll i samma valbeslut, listas det under
    `tvetydiga_namn` i stället för att tyst slås ihop.
  * Troman bekräftar: `troman` anger registrets person-id och parti om
    namnet finns där *med samma parti*, annars `funnen: false`. Finns samma
    namn bara i ett annat parti sparas det som `annan_med_samma_namn` men
    räknas inte som bekräftelse. Ingen träff är inget fel – registret visar
    den som sitter nu.
  * Ingen tolkning av vad ett uppdrag "betyder": rubriken ur protokollet
    sparas ordagrant; `organisation` är rubriken med beslutsfrasen
    avskalad, och `null` när det inte går.

Perioder utan underlag syns i `perioder` med status "saknas" och en
anledning, i stället för att utebli. Kandidatlistor vars valbeslut inte
fattats än (2026) står med status "valbeslut ej fattat".

Körs: python3 scripts/build_personer.py [partinamn-i-kandidatfilen]
      (utan argument: alla partier i PARTIER)
"""

import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent
DATA = ROT / "data"
UT = DATA / "personer"

# Val -> (mandatperiod, protokoll med valbeslut ("organ/datum"), anledning).
# Fullmäktige (kf) väljer KS och nämnder; kommunstyrelsens första möte (ks)
# väljer arbetsutskottet (KSAU).
VAL = {
    2010: ("2011–2014", [], "Arkivet kommunhandlingar börjar 2013-08-13; kandidatlistor saknas hos data.val.se"),
    2014: ("2015–2018", ["kf/2014-12-09", "ks/2015-01-20"], None),
    2018: ("2019–2022", [], "Fullmäktiges decemberprotokoll 2018 ej funnet; kandidatlistor saknas hos data.val.se"),
    2022: ("2023–2026", ["kf/2022-12-06", "ks/2023-01-10"], None),
    2026: ("2027–2030", [], "Valbeslut ej fattat (nytt fullmäktige konstituerat 2026-10-15)"),
}


# Partierna i kandidatfilerna -> (kortnamn i protokollen, äldre förkortningar).
# Partier utan förkortning i protokollen (inga poster i nämnder) har bara
# kandidatlistor. Liberalerna hette Folkpartiet (FP) före 2018/2019.
PARTIER = {
    "Moderaterna": ("M", ()),
    "Arbetarepartiet-Socialdemokraterna": ("S", ()),
    "Centerpartiet": ("C", ()),
    "Kristdemokraterna": ("KD", ()),
    "Liberalerna (tidigare Folkpartiet)": ("L", ("FP",)),
    "Miljöpartiet de gröna": ("MP", ()),
    "Sverigedemokraterna": ("SD", ()),
    "Vänsterpartiet": ("V", ()),
    "Kungsbackaborna": ("KB", ()),
    "Alternativ för Sverige": ("AFS", ()),
    "Kristna Värdepartiet": ("KV", ()),
    "Kungsbacka Framtidsparti": ("KFP", ()),
    "Medborgerlig Samling": ("MED", ()),
}


def filnamn(partinamn: str) -> str:
    s = unicodedata.normalize("NFKD", partinamn.casefold().split(" (")[0])
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def nyckel(namn: str) -> str:
    """Jämförelsenyckel: utan versaler, accenter och skillnader i bindestreck
    och mellanrum. Jämförs bara inom ett parti."""
    s = unicodedata.normalize("NFKD", namn)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[\s\-–]+", " ", s).strip().casefold()


def organisation(rubrik: str):
    """'Val av ledamöter … till nämnden för Teknik 2023-01-01–2026-12-31'
    -> 'Nämnden för Teknik'; '"Kommunstyrelsen 2015-…' -> 'Kommunstyrelsen'."""
    m = re.match(r"^Val av .*? till (.+?)(?:\s+\d{4}-\d\d-\d\d.*)?$", rubrik)
    if not m and not rubrik.startswith("Val av"):
        m = re.match(r"^(.+?)\s+\d{4}-\d\d-\d\d", rubrik)
    if not m:
        return None
    namn = m.group(1).strip()
    return namn[:1].upper() + namn[1:]


def las_json(sokvag: Path):
    return json.loads(sokvag.read_text(encoding="utf-8"))


class Personer:
    def __init__(self):
        self.perso = {}
        self.tvetydiga = []
        self.ej_personer = []

    def finns(self, namn: str) -> dict:
        k = nyckel(namn)
        p = self.perso.setdefault(k, {"namn": namn, "namnvarianter": [],
                                      "kandidaturer": [], "uppdrag": []})
        if namn not in p["namnvarianter"]:
            p["namnvarianter"].append(namn)
        return p


def troman_index(troman: dict) -> dict:
    """nyckel -> {id, parti} för alla personer med uppdragsrader i registret."""
    ut = {}
    for o in troman["organisationer"]:
        for r in o["uppdrag"]:
            k = nyckel(f"{r['fornamn']} {r['efternamn']}")
            ut.setdefault(k, {"id": r["person_id"], "parti": set()})
            if r["parti"]:
                ut[k]["parti"].add(r["parti"])
    return ut


def bygg(partinamn: str, kort: str, kandidater: dict, valbeslut: dict, troman: dict,
         narvaro: dict | None = None, alias: tuple = ()) -> dict:
    korts = {kort, *alias}
    """kandidater: {år: kandidatfil}, valbeslut: {datum: kf_val-fil}."""
    P = Personer()
    for ar, fil in sorted(kandidater.items()):
        parti = next((p for p in fil["partier"] if p["namn"] == partinamn), None)
        if parti is None:
            continue
        for lista in parti["listor"]:
            sedda = {}
            for k in lista["kandidater"]:
                p = P.finns(k["namn"])
                p["kandidaturer"].append({
                    "val": ar, "listnamn": lista["listnamn"], "listnummer": lista["listnummer"],
                    "plats": k["plats"], "samtycke": k["samtycke"], "uppgift": k["uppgift"]})
                n = nyckel(k["namn"])
                if n in sedda:
                    P.tvetydiga.append({"namn": k["namn"], "var": f"kandidatlista {ar} (plats {sedda[n]} och {k['plats']})"})
                sedda[n] = k["plats"]
    for datum, fil in sorted(valbeslut.items()):
        ar = next(a for a, (_, d, _) in VAL.items() if datum in d)
        period = VAL[ar][0]
        for b in fil["beslut"]:
            sedda = {}
            for r in b["poster"]:
                if r["parti"] not in korts:
                    continue
                if re.search(r"(?i)\bvakant\b", r["namn"]):
                    P.ej_personer.append({"protokoll": datum, "paragraf": b["paragraf"], "rad": r["namn"]})
                    continue   # "Vakant" är en tom plats, ingen person
                p = P.finns(r["namn"])
                p["uppdrag"].append({
                    "mandatperiod": period, "val": ar, "protokoll": datum,
                    "paragraf": b["paragraf"], "rubrik": b["rubrik"],
                    "organisation": organisation(b["rubrik"]),
                    "roll": r["roll"], "ordning": r["ordning"]})
                k = (nyckel(r["namn"]), r["roll"])
                if k in sedda and organisation(b["rubrik"]):
                    P.tvetydiga.append({"namn": r["namn"], "var": f"{datum} § {b['paragraf']} ({r['roll']})"})
                sedda[k] = True
    # Perioder utan valbeslut: närvarolistan på organets första protokoll med
    # text är ersättningskälla. Märks `kalla: "närvarolista"` så att den aldrig
    # förväxlas med ett fastställt val.
    for post in (narvaro or {}).get("poster", []):
        ar = next((a for a, (per, _, _) in VAL.items() if per == post["period"]), None)
        if ar is None or not post.get("datum"):
            continue
        if VAL[ar][1] and all(d in valbeslut for d in VAL[ar][1]):
            continue   # perioden har valbeslut; närvarolistan behövs inte
        for u in post["utlasning"]:
            if u["parti"] not in korts:
                continue
            roll = u["titel"] or u["roll"]
            P.finns(u["namn"])["uppdrag"].append({
                "mandatperiod": post["period"], "val": ar, "protokoll": post["datum"],
                "kalla": "närvarolista", "organisation": post["organ"], "roll": roll,
                "rubrik": None, "paragraf": None, "ordning": None})
    for p in P.perso.values():
        for u in p["uppdrag"]:
            u.setdefault("kalla", "valbeslut")
    tidx = troman_index(troman)
    for k, p in P.perso.items():
        t = tidx.get(k)
        if t and korts & t["parti"]:
            p["troman"] = {"funnen": True, "id": t["id"], "parti": sorted(t["parti"])}
        elif t:
            # Samma namn finns i registret men i ett annat parti: troligen en
            # annan person, så den räknas inte som bekräftelse.
            p["troman"] = {"funnen": False, "annan_med_samma_namn": {
                "id": t["id"], "parti": sorted(t["parti"])}}
        else:
            p["troman"] = {"funnen": False}
    perioder = []
    for ar, (period, datum, orsak) in VAL.items():
        perioder.append({
            "val": ar, "mandatperiod": period,
            "kandidatlista": "finns" if ar in kandidater else "saknas",
            "valbeslut": ("finns" if datum and all(d in valbeslut for d in datum)
                          else "valbeslut ej fattat" if ar == 2026 else "saknas"),
            "protokoll": datum,
            "narvarolista": sum(1 for q in (narvaro or {}).get("poster", [])
                                if q["period"] == period and q.get("datum")),
            "anledning": None if (ar in kandidater and datum and all(d in valbeslut for d in datum)) else orsak})
    personer = sorted(P.perso.values(), key=lambda p: nyckel(p["namn"]))
    for i, p in enumerate(personer, 1):
        p["id"] = f"{kort.lower()}-{i:03d}"
    return {
        "parti": partinamn, "kortnamn": kort, "aldre_kortnamn": list(alias), "byggd": date.today().isoformat(),
        "kallor": {
            "kandidatlistor": "data/kandidater/<år>.json (Valmyndighetens valpresentation)",
            "valbeslut": "data/uppdrag/kf_val_<datum>.json (fullmäktiges protokoll)",
            "bekraftelse": "data/uppdrag/troman_<datum>.json (kommunens register, nuläget)"},
        "perioder": perioder,
        "tvetydiga_namn": P.tvetydiga,
        "ej_personer": P.ej_personer,
        "personer": personer,
    }


def utan_parti(valbeslut: dict, narvaro: dict | None) -> list:
    """Poster där protokollet inte anger något parti: de kan inte föras till
    ett parti utan tolkning och samlas här så att de inte försvinner."""
    ut = []
    for nyck, fil in sorted(valbeslut.items()):
        for b in fil["beslut"]:
            for r in b["poster"]:
                if not r["parti"]:
                    ut.append({"kalla": "valbeslut", "protokoll": nyck, "paragraf": b["paragraf"],
                               "rubrik": b["rubrik"], "roll": r["roll"], "namn": r["namn"]})
    return ut


def main(argv: list) -> None:
    kandidater = {int(f.stem): las_json(f) for f in sorted((DATA / "kandidater").glob("*.json"))}
    valbeslut = {}
    for f in sorted((DATA / "uppdrag").glob("*_val_*.json")):
        organ, datum = f.stem.split("_val_")
        valbeslut[f"{organ}/{datum}"] = las_json(f)
    trom = sorted((DATA / "uppdrag").glob("troman_*.json"))
    if not trom:
        sys.exit("Ingen Troman-fil i data/uppdrag/ – kör hamta_uppdrag.py")
    narv_fil = DATA / "uppdrag" / "narvaro.json"
    narvaro = las_json(narv_fil) if narv_fil.exists() else None
    troman = las_json(trom[-1])
    partier = [argv[0]] if argv else list(PARTIER)
    UT.mkdir(parents=True, exist_ok=True)
    for partinamn in partier:
        kort, alias = PARTIER[partinamn]
        ut = bygg(partinamn, kort, kandidater, valbeslut, troman, narvaro, alias)
        fil = UT / f"{filnamn(partinamn)}.json"
        fil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        pp = ut["personer"]
        print(f"{partinamn[:36]:36} {len(pp):4} personer, {sum(1 for p in pp if p['kandidaturer']):3} med kandidatur, "
              f"{sum(1 for p in pp if p['uppdrag']):3} med uppdrag, {sum(1 for p in pp if p['troman']['funnen']):3} i Troman, "
              f"{len(ut['tvetydiga_namn'])} tvetydiga")
    if not argv:
        saknar = utan_parti(valbeslut, narvaro)
        (UT / "_utan_parti.json").write_text(json.dumps({
            "forklaring": "Poster i valbesluten där protokollet inte anger något parti.",
            "poster": saknar}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"Utan parti i protokollen: {len(saknar)} poster (data/personer/_utan_parti.json)")


if __name__ == "__main__":
    main(sys.argv[1:])
