#!/usr/bin/env python3
"""Bygger docs/data-enkater.json och docs/enkater.csv av
data/enkater/clean/enkater.csv.

Underlaget är den rensade tidy-filen (en rad per källa, omgång, enhet,
respondentgrupp, årskurs och frågeområde; se extrahera_enkater.py).
Här sätts den ihop till tidsserier för sidan.

**En serie** är en källa, en respondentgrupp, en enhet (en skola,
Kungsbacka kommun, riket eller GR som region) och ett frågeområde. Serier
som heter olika i olika år men är samma sak i mappningstabellen
(`serie`-kolumnen) bildar en serie.

**Skolor med flera enheter.** Skolverkets enheter byter kod när en skola
byter namn eller delas (program.ENKATSKOLOR). Har en skola flera enheter ett
år blir dess värde ett medelvärde av enheternas, vägt med antal svar (exakt, med
Decimal, och avrundat till två decimaler). Är
något av enhetens värden dolt – färre än fem svar – blir skolans värde
dolt: ett medelvärde av det som syns vore ett annat mått. En enhet utan
några svar alls räknas inte med; den har inget värde att dölja.

**Brott.** En trendlinje får aldrig dras över något som inte är samma
mått. Varje serie delas därför i *segment*, och sidan ritar linje bara
inom ett segment. Ett nytt segment börjar när
  * skalan ändrats (GR:s rapport 2023 redovisades på 0–10, de andra åren
    på 0–100; `skala_original`),
  * frågorna eller beräkningen ändrats (`frågesats`: Skolenkäten bytte
    frågor i HT 2018 och 2022, och GR:s rapporter bytte ord och skala),
  * det saknas en mätning på mer än två år (Skolenkäten görs vartannat
    år, GR:s årskurs 5, 8 och gy 2 likaså; två år mellan punkterna är alltså
    normalt, tre är ett glapp), eller
  * ett värde är dolt, vilket gör punkten till en lucka i linjen.
Orsaken följer med i `brott` så att sidan kan säga den.

**Utesluten rad.** GR:s rapport för 2025 har en Kungsbacka-rad i
årskurs 5 och 8 trots att kommunen det året mätte via Skolinspektionen
(de flesta enheterna deltog inte) och talen avviker kraftigt från året
före och året efter (tryggheten 69 respektive 85 mot 85 och 84 i åk 5).
Raderna bygger troligen på enstaka enheter och är inget kommunvärde;
de ligger kvar i CSV:en men tas inte med i serierna (UTESLUTNA).

**Kontroll.** Skolenkätens kommunrad är kommunala skolor sammanräknade;
bygget stannar om summan av de kommunala enheternas antal svar inte är
kommunens, eller om deras viktade medelindex avviker mer än `TOLERANS`
från kommunens. Då har en enhet fallit bort eller hamnat i fel skola.

Körs:  python3 scripts/build_enkater.py
"""

import csv
import json
import shutil
import sys
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from program import enkatskolor

ROT = Path(__file__).resolve().parent.parent
KATALOG = ROT / "data" / "enkater"
CLEAN = KATALOG / "clean" / "enkater.csv"
KALLFILER = KATALOG / "KALLFILER.csv"
UT_JSON = ROT / "docs" / "data-enkater.json"
UT_CSV = ROT / "docs" / "enkater.csv"

# Viktat medelindex över kommunala enheter mot kommunraden, i indexpoäng.
# Skolinspektionen avrundar till en decimal och prickar enheter med färre än
# fem svar ur enhetslistan men inte ur kommunraden, så en liten skillnad är
# väntad.
TOLERANS = 0.35

# (källa, år, årskurs): rader som tas med i CSV:en men inte i serierna.
UTESLUTNA = {
    ("GR-enkäten", 2025, "åk 5"):
        "Kungsbacka mätte via Skolinspektionen 2025; raden bygger troligen på enstaka enheter",
    ("GR-enkäten", 2025, "åk 8"):
        "Kungsbacka mätte via Skolinspektionen 2025; raden bygger troligen på enstaka enheter",
}

# Grupperna: (id, respondentgrupp, årskurs, namn, skolform)
GRUPPER = [
    ("elever-ak2", "Elever", "åk 2", "Elever åk 2", "grundskola"),
    ("elever-ak5", "Elever", "åk 5", "Elever åk 5", "grundskola"),
    ("elever-ak8", "Elever", "åk 8", "Elever åk 8", "grundskola"),
    ("elever-ak9", "Elever", "åk 9", "Elever åk 9 (till och med 2021)", "grundskola"),
    ("elever-gy2", "Elever", "gymnasiet år 2", "Elever gymnasiet år 2", "gymnasium"),
    ("larare-grundskola", "Undervisande lärare", "grundskola",
     "Lärare i grundskolan", "grundskola"),
    ("larare-gymnasium", "Undervisande lärare", "gymnasieskola",
     "Lärare i gymnasieskolan", "gymnasium"),
    ("vh-forskoleklass", "Vårdnadshavare", "förskoleklass",
     "Vårdnadshavare, förskoleklass", "grundskola"),
    ("vh-grundskola", "Vårdnadshavare", "grundskola",
     "Vårdnadshavare, grundskola", "grundskola"),
    ("vh-anpassad", "Vårdnadshavare", "anpassad grundskola",
     "Vårdnadshavare, anpassad grundskola", "grundskola"),
]
GRUPP_AV = {(g[1], g[2]): g[0] for g in GRUPPER}

# Harmoniserade frågeområden i visningsordning. De som saknas här men finns
# i mappningen (tom harmoniserad kolumn) hamnar under "ovrigt".
OMRADEN = [
    ("trygghet", "Trygghet"),
    ("studiero", "Studiero"),
    ("stöd", "Stöd"),
    ("stimulans", "Stimulans"),
    ("bemötande", "Bemötande"),
    ("inflytande", "Inflytande"),
    ("elevhälsa", "Elevhälsa"),
    ("kränkningar", "Förhindra kränkningar"),
    ("information_bedömning", "Information och bedömning"),
    ("kritiskt_tänkande", "Kritiskt tänkande"),
    ("nöjdhet", "Nöjdhet med skolan"),
    ("skola_framtid", "Skola och framtid"),
    ("jämställdhet", "Jämställdhet"),
    ("samverkan", "Samverkan"),
    ("pedagogiskt_ledarskap", "Pedagogiskt ledarskap"),
    ("fritidshem", "Fritidshem"),
]
OVRIGT = "ovrigt"

KALLKOD = {"Skolenkäten": "SI", "GR-enkäten": "GR"}


def las_rader(sokvag=CLEAN):
    with open(sokvag, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def tal(s):
    return None if s == "" else float(s)


def slut_ihop(enheter):
    """Skolans värde och antal svar ur enheternas, [(värde|None, antal)].
    Enheter utan svar (antal 0) räknas inte med. Dolt värde i någon
    enhet ger dolt värde för skolan."""
    med = [(v, n) for v, n in enheter if n != 0]
    if not med:
        return None, 0
    n_tot = sum(n for _, n in med)
    if any(v is None for v, _ in med):
        return None, n_tot
    # Decimal i stället för flyttal: värdena är decimaltal ur CSV:en och
    # medelvärdet ska avrundas till två decimaler på samma sätt på varje
    # dator och Python-version (ett flyttalsmedel som hamnar på 7,725 gav
    # 7,72 på en maskin och 7,73 på en annan).
    summa = sum(Decimal(repr(v)) * n for v, n in med)
    return float((summa / n_tot).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)), n_tot


def dela_i_segment(punkter):
    """punkter: [{ar, v, n, sats, skala}] sorterade på år. Returnerar
    ([[ar, v, n, segment]], [[ar, orsak]]). Se modulens docstring."""
    ut, brott = [], []
    seg, fore = 0, None
    for p in punkter:
        if fore is not None:
            orsak = None
            if p["v"] is None or fore["v"] is None:
                orsak = "dolt"
            elif p["skala"] != fore["skala"]:
                orsak = "skala"
            elif p["sats"] != fore["sats"]:
                orsak = "fragor"
            elif p["ar"] - fore["ar"] > 2:
                orsak = "glapp"
            if orsak:
                seg += 1
                if orsak != "dolt":
                    brott.append([p["ar"], orsak])
        ut.append([p["ar"], p["v"], p["n"], seg])
        fore = p
    return ut, brott


def bygg(rader, kallfiler=None):
    skolnamn = enkatskolor()
    # (källa, grupp, entitet, omrade, serie, år) -> [(v, n, sats, skala, enhet)]
    insamling = defaultdict(list)
    skoldata = defaultdict(lambda: {"namn": defaultdict(set), "grupper": set(),
                                    "huvudman": set(), "enheter": {}})
    anvanda_filer = set()
    # Rikets rad hör till samma omgång som kommunens. Två omgångar samma år
    # (HT och VT 2015) skulle annars ge två riksvärden för ett år, och år
    # då kommunen inte deltog skulle få en riksserie utan kommun bredvid.
    kommunens_omgangar = {(r["källa"], r["år"], r["respondentgrupp"], r["årskurs"], r["omgång"])
                          for r in rader if r["nivå"] == "kommun"}
    for r in rader:
        kalla = KALLKOD[r["källa"]]
        ar = int(r["år"])
        if r["nivå"] == "riket" and (r["källa"], r["år"], r["respondentgrupp"],
                                     r["årskurs"], r["omgång"]) not in kommunens_omgangar:
            continue
        if (r["källa"], ar, r["årskurs"]) in UTESLUTNA and r["nivå"] in ("kommun", "region"):
            continue
        grupp = GRUPP_AV.get((r["respondentgrupp"], r["årskurs"]))
        if grupp is None:
            raise SystemExit(f"okänd grupp: {r['respondentgrupp']} / {r['årskurs']}")
        if r["nivå"] == "skola":
            entitet = r["skola_id"]
            if entitet not in skolnamn:
                raise SystemExit(f"skola {entitet} saknas i program.ENKATSKOLOR")
        else:
            entitet = {"kommun": "kungsbacka", "riket": "riket", "region": "gr"}[r["nivå"]]
        v = tal(r["index_0_10"])
        if v is not None and not 0 <= v <= 10:
            raise SystemExit(f"index utanför 0–10: {r}")
        n = None if r["antal_svar"] == "" else int(r["antal_svar"])
        omrade = r["frågeområde_harmoniserat"] or OVRIGT
        insamling[(kalla, grupp, entitet, omrade, r["serie"], ar)].append(
            (v, n, r["frågesats"], r["skala_original"], r["skolenhetskod"], r["omgång"]))
        anvanda_filer.add(r["källfil"])
        if r["nivå"] == "skola":
            sd = skoldata[entitet]
            sd["namn"][r["skolnamn_vid_tillfället"]].add(ar)
            sd["grupper"].add(grupp)
            sd["huvudman"].add("Kommunal" if r["huvudman"] == "Kungsbacka kommun" else "Fristående")
            e = sd["enheter"].setdefault(r["skolenhetskod"], [ar, ar])
            e[0], e[1] = min(e[0], ar), max(e[1], ar)

    serier = defaultdict(lambda: defaultdict(list))   # entitet -> grupp -> [serie]
    per_serie = defaultdict(dict)
    for (kalla, grupp, entitet, omrade, serie, ar), poster in insamling.items():
        sat = {p[2] for p in poster}
        skalor = {p[3] for p in poster}
        if len(sat) != 1 or len(skalor) != 1:
            raise SystemExit(f"{entitet} {ar} {serie}: blandade frågesatser {sat}")
        enhetskoder = [p[4] for p in poster]
        if len(set((p[4], p[5]) for p in poster)) != len(poster):
            raise SystemExit(f"{entitet} {ar} {serie}: dubbla rader")
        if entitet in ("kungsbacka", "riket", "gr") and len(poster) != 1:
            raise SystemExit(f"{kalla} {entitet} {ar} {serie}: {len(poster)} rader")
        if enhetskoder == [""]:
            v, n = poster[0][0], poster[0][1]      # kommun, riket, region: en rad
        else:
            if any(p[1] is None for p in poster):
                raise SystemExit(f"{entitet} {ar} {serie}: antal svar saknas")
            v, n = slut_ihop([(p[0], p[1]) for p in poster])
        per_serie[(kalla, grupp, entitet, omrade, serie)][ar] = {
            "ar": ar, "v": v, "n": n, "sats": next(iter(sat)), "skala": next(iter(skalor))}

    for (kalla, grupp, entitet, omrade, serie), perar in sorted(per_serie.items()):
        punkter, brott = dela_i_segment([perar[a] for a in sorted(perar)])
        post = {"kalla": kalla, "omrade": omrade, "serie": serie, "punkter": punkter}
        if brott:
            post["brott"] = brott
        serier[entitet][grupp].append(post)

    kontrollera_kommunraden(per_serie, rader)

    skolor = []
    for id_ in sorted(skoldata, key=lambda i: skolnamn[i]):
        sd = skoldata[id_]
        if len(sd["huvudman"]) != 1:
            raise SystemExit(f"{id_}: blandad huvudman {sd['huvudman']}")
        skolform = sorted({g[4] for g in GRUPPER if g[0] in sd["grupper"]})
        skolor.append({
            "id": id_, "namn": skolnamn[id_], "huvudman": next(iter(sd["huvudman"])),
            "skolform": skolform,
            "namnVidTillfallet": [[n, min(a), max(a)] for n, a in sorted(sd["namn"].items())],
            "enheter": [[k, a[0], a[1]] for k, a in sorted(sd["enheter"].items())],
        })

    omr = [{"id": i, "namn": n} for i, n in OMRADEN]
    omr.append({"id": OVRIGT, "namn": "Övriga områden (inte harmoniserade)"})
    kalllista = []
    if kallfiler is not None:
        for fil in sorted(anvanda_filer):
            k = kallfiler.get(fil)
            if k:
                kalllista.append({"fil": fil, "kalla": k["kalla"], "omgang": k["omgang"],
                                  "url": k["url"], "hamtad": k["hamtad"]})
    ar_alla = sorted({int(r["år"]) for r in rader})
    return {
        "kommun": "Kungsbacka",
        "ar": [ar_alla[0], ar_alla[-1]],
        "grupper": [{"id": g[0], "respondentgrupp": g[1], "arskurs": g[2], "namn": g[3],
                     "skolform": g[4], "svagare": g[1] == "Vårdnadshavare"} for g in GRUPPER],
        "omraden": omr,
        "skolor": skolor,
        "serier": {e: dict(g) for e, g in sorted(serier.items())},
        "kallor": kalllista,
        "uteslutna": [{"kalla": k[0], "ar": k[1], "arskurs": k[2], "orsak": o}
                      for k, o in sorted(UTESLUTNA.items())],
        "hamtad": max((k["hamtad"] for k in (kallfiler or {}).values() if k["hamtad"]),
                      default=""),
    }


def kontrollera_kommunraden(per_serie, rader):
    """Se modulens docstring, avsnittet Kontroll."""
    komm = {}
    for r in rader:
        if (r["källa"] == "Skolenkäten" and r["nivå"] == "skola"
                and r["huvudman"] == "Kungsbacka kommun" and r["antal_svar"] != ""):
            komm.setdefault((GRUPP_AV[(r["respondentgrupp"], r["årskurs"])], int(r["år"]),
                             r["serie"], r["omgång"]), []).append(r)
    kommunrad = {}
    for r in rader:
        if r["källa"] == "Skolenkäten" and r["nivå"] == "kommun":
            kommunrad[(GRUPP_AV[(r["respondentgrupp"], r["årskurs"])], int(r["år"]),
                       r["serie"], r["omgång"])] = r
    for nyckel, enheter in komm.items():
        k = kommunrad.get(nyckel)
        if k is None:
            continue
        med_svar = [e for e in enheter if int(e["antal_svar"]) > 0]
        if not med_svar or k["index_0_10"] == "" or any(
                e["index_0_10"] == "" for e in med_svar):
            continue          # något värde är dolt: kommunens går inte att räkna om
        med_vard = [(float(e["index_0_10"]), int(e["antal_svar"])) for e in med_svar]
        n_enh = sum(int(e["antal_svar"]) for e in enheter)
        n_kom = int(k["antal_svar"])
        # Enheter med färre än fem svar prickas ur värdet men räknas i
        # kommunens summa, och en enhet som saknas i registret syns inte
        # här alls: antalet får därför inte överstiga kommunens, men
        # får vara lägre.
        if n_enh > n_kom:
            raise SystemExit(f"{nyckel}: enheterna har {n_enh} svar, kommunen {n_kom}")
        vikt = sum(v * n for v, n in med_vard) / sum(n for _, n in med_vard)
        if abs(vikt - float(k["index_0_10"])) > TOLERANS and n_enh >= 0.95 * n_kom:
            raise SystemExit(
                f"{nyckel}: viktat index {vikt:.2f} mot kommunens {k['index_0_10']}")


def main():
    rader = las_rader()
    kallfiler = {}
    if KALLFILER.exists():
        with open(KALLFILER, encoding="utf-8", newline="") as f:
            kallfiler = {r["fil"]: r for r in csv.DictReader(f)}
    ut = bygg(rader, kallfiler)
    UT_JSON.write_text(json.dumps(ut, ensure_ascii=False, separators=(",", ":")) + "\n",
                       encoding="utf-8")
    shutil.copyfile(CLEAN, UT_CSV)
    antal = sum(len(s["punkter"]) for g in ut["serier"].values()
                for lista in g.values() for s in lista)
    print(f"Skrev {UT_JSON.name}: {len(ut['skolor'])} skolor, "
          f"{sum(len(l) for g in ut['serier'].values() for l in g.values())} serier, "
          f"{antal} punkter; kopierade {UT_CSV.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
