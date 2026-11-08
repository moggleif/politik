"""Oberoende kontroller av namnförslagen i data/matchning/forslag.json.

Varje förslag (plats, ålder, kön, parti → namn) kontrolleras mot sådant som inte användes
för att ta fram det:

  A. ålder    samma namn (samma parti) i ett annat val: ålder ska skilja lika många år som
              valen (±1; födelsedagarna ligger olika)
  B. kön      samma namn på en plats i ett annat val: könet ska vara detsamma
              (Valmyndighetens uppgift om platsens kön, inte en gissning från namnet)
  C. logg     namnet står på samma plats i en andra fullmäktigelogg (2014-04-08 för 2010,
              som är läsbar bara delvis; Moderaterna är komplett)
  D. protokoll  namnet finns bland partiets namn i protokollen för perioden (valbeslut,
              närvarolistor, fullmäktiges logg) – bekräftar att personen fanns i politiken då

Ett avvikande resultat (A eller B) betyder att förslaget troligen är fel (t.ex. en
ersättare). Resultatet skrivs till data/matchning/kontroller.json och skrivs ut per
säkerhetsgrad.

Körs: python3 scripts/kontrollera_matchning.py
"""

import json
import re
import urllib.request
from collections import Counter
from pathlib import Path

from bygg_matchning import FuzzyNamn, nyckel, protokollnamn
from hamta_kf_logg import logg as las_logg
from hamta_kf_val import text_ur_html

ROT = Path(__file__).resolve().parent.parent
DATA = ROT / "data"
ARKIV = "https://moggleif.github.io/kommunhandlingar/kungsbacka/kf/{ar}/{d}/protokoll.html"
VAL = (2010, 2014, 2018, 2022, 2026)
PARTI_AB = {"Moderaterna": "M", "Moderata Samlingspartiet": "M", "Arbetarepartiet-Socialdemokraterna": "S",
            "Centerpartiet": "C", "Liberalerna (tidigare Folkpartiet)": "L", "Folkpartiet liberalerna": "L",
            "Kristdemokraterna": "KD", "Miljöpartiet de gröna": "MP", "Sverigedemokraterna": "SD",
            "Vänsterpartiet": "V", "Kungsbackaborna": "KB"}


def json_(sokvag):
    return json.loads((DATA / sokvag).read_text(encoding="utf-8"))


def kanda_platser():
    """{(parti, namn): [(val, ålder, kön)]} för alla personer vars plats vi känner ur något val:
    namn på listan 2022/2026 (kön saknas där) samt bekräftade/bestämda platser och valda."""
    ut = {}

    def lagg(parti, namn, ar, alder, kon):
        if alder is not None or kon:
            ut.setdefault((parti, nyckel(namn)), []).append((ar, alder, kon))
    for ar in (2022, 2026):
        for p in json_(f"kandidater/{ar}.json")["partier"]:
            a = PARTI_AB.get(p["namn"])
            for k in (p["listor"][0]["kandidater"] if a else []):
                m = re.search(r"(\d{2})\s*år", k.get("uppgift") or "") or re.match(r"\s*(\d{2})\b", k.get("uppgift") or "")
                lagg(a, k["namn"], ar, int(m.group(1)) if m else None, None)
        for r in json_(f"valda/{ar}.json")["ledamoter"]:
            lagg(r["parti"], r["namn"], ar, r["alder"], r["kon"])
    for b in json_("matchning/bekraftade.json")["platser"]:
        k = next((k for p in json_(f"kandidater/{b['val']}.json")["partier"] if PARTI_AB.get(p["namn"]) == b["parti"]
                  for k in p["listor"][0]["kandidater"] if k["plats"] == b["plats"]), None)
        if k:
            lagg(b["parti"], b["namn"], b["val"], k["alder"], k["kon"])
    for b in json_("kopplingar_platser.json")["platser"]:
        k = next((k for p in json_(f"kandidater/{b['val']}.json")["partier"] if PARTI_AB.get(p["namn"]) == b["parti"]
                  for k in p["listor"][0]["kandidater"] if k["plats"] == b["plats"]), None)
        if k:
            lagg(b["parti"], b["namn"], b["val"], k["alder"], k["kon"])
    return ut


def andra_logg_2014_04():
    for n in range(4):
        try:
            h = urllib.request.urlopen(urllib.request.Request(
                ARKIV.format(ar=2014, d="2014-04-08"), headers={"User-Agent": "kungsbacka-i-siffror"}), timeout=60).read().decode()
            return las_logg(text_ur_html(h))
        except Exception:
            continue
    return []


def kontrollera(ar: int, forslag: list, kanda: dict, pn: dict, logg2: list | None) -> dict:
    res = {"A_alder": Counter(), "B_kon": Counter(), "C_logg": Counter(), "D_protokoll": Counter()}
    avvik = []
    period = {2010: "2011–2014", 2014: "2015–2018", 2018: "2019–2022"}[ar]
    log_per_parti = {}
    for r in (logg2 or []):
        log_per_parti.setdefault(r["parti"], []).append(r["namn"])
    for r in forslag:
        if not r["namn_forslag"]:
            continue
        g = r["sakerhet"] or "-"
        andra = [x for x in kanda.get((r["parti"], nyckel(r["namn_forslag"])), []) if x[0] != ar]
        for val, alder, kon in andra:
            if alder is not None:
                ok = abs((alder - (val - ar)) - r["alder"]) <= 1
                res["A_alder"][(g, ok)] += 1
                if not ok:
                    avvik.append(("ålder", ar, r["parti"], r["listplats"], r["namn_forslag"], r["alder"], val, alder))
            if kon:
                ok = kon == r["kon"]
                res["B_kon"][(g, ok)] += 1
                if not ok:
                    avvik.append(("kön", ar, r["parti"], r["listplats"], r["namn_forslag"], r["kon"], val, kon))
        sets = pn.get((r["parti"], period), {})
        if sets:
            res["D_protokoll"][(g, FuzzyNamn(list(sets)).hitta(r["namn_forslag"]) is not None or nyckel(r["namn_forslag"]) in sets)] += 1
    if ar == 2010 and log_per_parti:
        # C: samma plats i andra loggen (läsbar del). Hela partiblocket jämförs i ordning.
        first = json_("uppdrag/kf_logg_2013-10-08.json")["ledamoter"]
        for parti, namn2 in log_per_parti.items():
            namn1 = [x["namn"] for x in first if x["parti"] == parti]
            for a, b in zip(namn1, namn2):
                res["C_logg"][(parti, FuzzyNamn([b]).hitta(a) is not None)] += 1
    return {k: {str(kk): vv for kk, vv in v.items()} for k, v in res.items()}, avvik


def main() -> None:
    forslag = json_("matchning/forslag.json")
    kanda = kanda_platser()
    pn = protokollnamn()
    logg2 = andra_logg_2014_04()
    ut = {}
    for ar in (2010, 2014, 2018):
        res, avvik = kontrollera(ar, forslag["valda"][str(ar)], kanda, pn, logg2 if ar == 2010 else None)
        ut[str(ar)] = {"resultat": res, "avvikelser": avvik}
        print(f"\n=== {ar} ===")
        for k, v in res.items():
            print(f"  {k:12}", dict(sorted(v.items())))
        for a in avvik:
            print("   AVVIKER:", a)
    (DATA / "matchning" / "kontroller.json").write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
