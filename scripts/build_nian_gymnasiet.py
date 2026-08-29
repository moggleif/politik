#!/usr/bin/env python3
"""Bygger docs/data-nian-gymnasiet.json: nian år X mot gymnasiet år X…X+3.

Sidan ställer tre mätpunkter på samma årskull bredvid varandra:

  nian år X        slutbetyget i årskurs 9 (rapport 109)
  starten år X     de som började gymnasiet hösten samma år, och hur
                   stor andel som var klara efter 3, 4 och 5 år
                   (genomströmningen, rapport 91)
  examen år X+3    avgångseleverna tre år senare (rapport 89)

Måtten har olika skalor och blandas aldrig i samma diagram:

  meritvärde      summan av grundskolebetygen, max 340
  andelar         procent, 0–100
  betygspoäng     genomsnittet av gymnasiebetygen, max 20

**Mätpunkterna följer inte samma individer.** Alla tre rapporterna
redovisar skolor som ligger i Kungsbacka. Ungefär tre av tio
gymnasieelever som är folkbokförda i kommunen läser någon annanstans,
och ungefär var femte elev i kommunens gymnasieskolor är folkbokförd i
en annan kommun. Därför byggs pendlingen in i samma datafil
(rapport 60 och 61): den mäter hur stort glappet är, år för år.

Av samma skäl räknas sambanden mellan mätpunkterna fram här, men bara
som korrelationer med sitt n utskrivet – underlaget är tolv kullar, och
sidan säger uttryckligen att det inte räcker för att slå fast något.

Programindelningen (yrkesprogram/högskoleförberedande) och namnbyten
kommer ur program.py, så att de bara underhålls på ett ställe.

Körs:  python3 scripts/build_nian_gymnasiet.py
"""

import json
from pathlib import Path

import program

ROT = Path(__file__).resolve().parent.parent

HUVUDMAN = "Samtliga"
MERIT_MAX = 340
POANG_MAX = 20
# De nationella programmen är treåriga: nian år X möter examen år X + 3.
FORSKJUTNING = 3

NATIONELLA = "Nationella program"
TOTALT_PREFIX = "Gymnasieskolan totalt"
INTRODUKTION = "Introduktionsprogram"
# Rapporternas sammanräknade rader. De är inte program utan summeringar,
# och ska inte hamna i programlistan.
SUMMARADER = {NATIONELLA, "Yrkesprogram", "Högskoleförberedande program",
              INTRODUKTION}


def lasa_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def samtliga(d: dict, program: str | None = None):
    """Raden för huvudmannatypen Samtliga, eventuellt för ett program."""
    for r in d["rader"]:
        if r["huvudman"] != HUVUDMAN:
            continue
        if program is None or r.get("program") == program:
            return r
    return None


def totalraden(d: dict):
    """Raden 'Gymnasieskolan totalt (nationella program samt
    introduktionsprogram)' – hela årskullen, inte bara de nationella."""
    for r in d["rader"]:
        if r["huvudman"] == HUVUDMAN and r.get("program", "").startswith(TOTALT_PREFIX):
            return r
    return None


def plocka(rad: dict, falt: tuple) -> dict:
    return {f: (rad or {}).get(f) for f in falt}


NIAN_FALT = ("antal", "meritvarde", "andelBehorigYrkes", "andelAllaAmnen")
START_FALT = ("antal", "examen3", "examen4", "examen5",
              "sammaProgram3", "sammaProgram4", "sammaProgram5")
EXAMEN_FALT = ("antal", "andelExamen", "andelStudiebevis",
               "andelGrundlBehorighet", "betygspoang", "betygspoangExamen")


# ------------------------------------------------------------- pendlingen

def pendeltal(d: dict, del_: str) -> dict | None:
    """Summerar kommunal och enskild huvudman och räknar ut andelarna.

    `folkbokforda` ska gå ihop som (folkbokförda som studerar här) +
    (utpendling); stämmer det inte är något fel i inläsningen, och
    kontrollen görs därför här i stället för att tigas ihjäl."""
    r = d.get(del_)
    if not r or r.get("folkbokforda") is None:
        return None

    def summa(a, b):
        x, y = r.get(a), r.get(b)
        if x is None and y is None:
            return None
        return (x or 0) + (y or 0)

    studerar_har = summa("studerandeKom", "studerandeEnsk")
    hemma = summa("folkbokfordaStuderandeKom", "folkbokfordaStuderandeEnsk")
    in_ = summa("inpendlingKom", "inpendlingEnsk")
    ut = summa("utpendlingKom", "utpendlingEnsk")
    folkbokforda = r["folkbokforda"]

    def andel(taljare, namnare):
        if taljare is None or not namnare:
            return None
        return round(100 * taljare / namnare, 1)

    return {
        "folkbokforda": folkbokforda,
        "studerarHar": studerar_har,
        "folkbokfordaSomStuderarHar": hemma,
        "inpendling": in_,
        "utpendling": ut,
        "netto": None if in_ is None or ut is None else in_ - ut,
        "andelUt": andel(ut, folkbokforda),
        "andelInAvEleverna": andel(in_, studerar_har),
        # Skolverket avrundar elevantalen till närmaste tiotal, så
        # summan går sällan ihop på eleven när – därför "ungefär".
        "stammer": (hemma is not None and ut is not None
                    and abs(hemma + ut - folkbokforda) <= 20),
    }


# ---------------------------------------------------------------- samband

def pearson(par: list):
    """Korrelationen mellan två mått över de kullar där båda finns.

    Returnerar None när färre än tre punkter återstår: ett r på två
    punkter är alltid ±1 och säger ingenting."""
    par = [(x, y) for x, y in par if x is not None and y is not None]
    n = len(par)
    if n < 3:
        return None
    mx = sum(x for x, _ in par) / n
    my = sum(y for _, y in par) / n
    sx = sum((x - mx) ** 2 for x, _ in par) ** 0.5
    sy = sum((y - my) ** 2 for _, y in par) ** 0.5
    if sx == 0 or sy == 0:
        return None
    tackning = sum((x - mx) * (y - my) for x, y in par) / (sx * sy)
    return {"r": round(tackning, 3), "n": n}


SAMBAND = [
    {
        "nyckel": "behorighet-examen3",
        "etikett": "Andel behöriga till yrkesprogram i nian → andel med "
                   "examen inom 3 år",
        "xFalt": "andelBehorigYrkes", "xDel": "nian",
        "yFalt": "examen3", "yDel": "start",
        "xNamn": "Behöriga till yrkesprogram i nian (%)",
        "yNamn": "Examen inom 3 år (%)",
        "baraMerit17": False,
    },
    {
        "nyckel": "behorighet-betygspoang",
        "etikett": "Andel behöriga till yrkesprogram i nian → betygspoäng "
                   "vid gymnasieexamen",
        "xFalt": "andelBehorigYrkes", "xDel": "nian",
        "yFalt": "betygspoang", "yDel": "examen",
        "xNamn": "Behöriga till yrkesprogram i nian (%)",
        "yNamn": "Betygspoäng vid examen (max 20)",
        "baraMerit17": False,
    },
    {
        "nyckel": "meritvarde-examen3",
        "etikett": "Meritvärde i nian → andel med examen inom 3 år",
        "xFalt": "meritvarde", "xDel": "nian",
        "yFalt": "examen3", "yDel": "start",
        "xNamn": "Genomsnittligt meritvärde i nian (max 340)",
        "yNamn": "Examen inom 3 år (%)",
        "baraMerit17": True,
    },
    {
        "nyckel": "meritvarde-betygspoang",
        "etikett": "Meritvärde i nian → betygspoäng vid gymnasieexamen",
        "xFalt": "meritvarde", "xDel": "nian",
        "yFalt": "betygspoang", "yDel": "examen",
        "xNamn": "Genomsnittligt meritvärde i nian (max 340)",
        "yNamn": "Betygspoäng vid examen (max 20)",
        "baraMerit17": True,
    },
]


def samband_for(kullar: list, spec: dict) -> dict:
    """Punkterna och korrelationen för ett av sambanden.

    Meritvärdet räknas över 16 ämnen t.o.m. 2014 och 17 ämnen därefter –
    de två går inte att lägga i samma serie, så sambanden som utgår från
    meritvärdet använder bara 17-ämnesåren."""
    punkter = []
    for k in kullar:
        if spec["baraMerit17"] and k["nian"].get("meritamnen") != 17:
            continue
        x = k[spec["xDel"]].get(spec["xFalt"])
        y = k[spec["yDel"]].get(spec["yFalt"])
        if x is None or y is None:
            continue
        punkter.append({"ar": k["ar"], "x": x, "y": y})

    matt = pearson([(p["x"], p["y"]) for p in punkter])
    ut = dict(spec)
    ut.pop("baraMerit17")
    ut["punkter"] = punkter
    ut["r"] = matt["r"] if matt else None
    ut["n"] = matt["n"] if matt else len(punkter)
    return ut


# ------------------------------------------------------------------ bygget

def bygg(nian_filer: list, start_filer: list, examen_filer: list,
         pendel_filer: list) -> dict:
    """Hela utdatan som en ren funktion av årsfilerna."""
    nian = {d["ar"]: d for d in nian_filer}
    start = {d["startAr"]: d for d in start_filer}
    examen = {d["ar"]: d for d in examen_filer}

    sista_start = max(start) if start else None
    sista_examen = max(examen) if examen else None

    # ---- de tre tidsserierna, var för sig
    serie_nian = []
    for ar in sorted(nian):
        rad = samtliga(nian[ar])
        post = {"ar": ar, "lasar": nian[ar]["lasar"],
                "meritamnen": nian[ar]["meritamnen"]}
        post.update(plocka(rad, NIAN_FALT))
        serie_nian.append(post)

    serie_start = []
    for ar in sorted(start):
        d = start[ar]
        post = {"ar": ar, "lasar": d["startLasar"]}
        post.update(plocka(samtliga(d, NATIONELLA), START_FALT))
        tot = totalraden(d)
        post["totalt"] = plocka(tot, START_FALT) if tot else None
        im = samtliga(d, INTRODUKTION)
        post["introduktion"] = plocka(im, START_FALT) if im else None
        serie_start.append(post)

    serie_examen = []
    for ar in sorted(examen):
        d = examen[ar]
        post = {"ar": ar, "lasar": d["lasar"]}
        post.update(plocka(samtliga(d, NATIONELLA), EXAMEN_FALT))
        serie_examen.append(post)

    # ---- kullkedjan: nian år X, starten år X, examen år X+3
    per_ar_nian = {p["ar"]: p for p in serie_nian}
    per_ar_start = {p["ar"]: p for p in serie_start}
    per_ar_examen = {p["ar"]: p for p in serie_examen}

    kullar = []
    for ar in sorted(per_ar_nian):
        n = per_ar_nian[ar]
        examensar = ar + FORSKJUTNING

        s = dict(per_ar_start.get(ar) or {})
        if ar not in per_ar_start:
            s = {"status": "framtid" if sista_start is not None and ar > sista_start
                 else "rapport_saknas"}
        else:
            s["status"] = "ok"

        e = dict(per_ar_examen.get(examensar) or {})
        if examensar not in per_ar_examen:
            e = {"status": "framtid" if sista_examen is not None
                 and examensar > sista_examen else "rapport_saknas"}
        else:
            e["status"] = "ok"

        kullar.append({
            "ar": ar,
            "lasarNian": n["lasar"],
            "examensar": examensar,
            "nian": dict(n, status="ok"),
            "start": s,
            "examen": e,
        })

    kompletta = [k for k in kullar
                 if k["start"].get("status") == "ok"
                 and k["examen"].get("status") == "ok"]

    # ---- programmen: starten år X mot examen år X+3, program för program
    program = bygg_program(start, examen)

    # ---- pendlingen
    pendling = []
    for d in sorted(pendel_filer, key=lambda x: x["ar"]):
        pendling.append({
            "ar": d["ar"], "lasar": d["lasar"],
            "gymnasiet": pendeltal(d, "gymnasiet"),
            "grundskolan": pendeltal(d, "grundskolan"),
        })

    return {
        "kommun": nian_filer[0]["kommun"] if nian_filer else "",
        "forskjutning": FORSKJUTNING,
        "meritMax": MERIT_MAX,
        "poangMax": POANG_MAX,
        "meritamnenBrott": brottsar(serie_nian),
        "nian": serie_nian,
        "start": serie_start,
        "examen": serie_examen,
        "kullar": kullar,
        "antalKompletta": len(kompletta),
        "program": program,
        "pendling": pendling,
        "samband": [samband_for(kompletta, s) for s in SAMBAND],
        "kallor": kallor(nian_filer, start_filer, examen_filer, pendel_filer),
    }


def brottsar(serie_nian: list):
    """Första året meritvärdet räknas över 17 ämnen i stället för 16.

    Serien får inte ritas som en obruten linje över det året: 2014 års
    228,1 och 2015 års 242,7 mäter olika saker."""
    forra = None
    for p in serie_nian:
        if forra is not None and p["meritamnen"] != forra:
            return p["ar"]
        forra = p["meritamnen"]
    return None


def bygg_program(start: dict, examen: dict) -> list:
    """En serie per gymnasieprogram, med starten och examen var för sig.

    Programnamnen normaliseras med samma alias som slutbetygssidan, så
    att ett program som bytt namn blir en serie och inte två."""
    per_program = {}

    def hamta(namn):
        return per_program.setdefault(namn, {
            "namn": namn,
            "typ": program.typ_av(namn),
            "start": {},
            "examen": {},
        })

    for ar, d in start.items():
        for rad in d["rader"]:
            if rad["huvudman"] != HUVUDMAN:
                continue
            namn = program.programnamn(rad["program"])
            if namn in SUMMARADER or namn.startswith(TOTALT_PREFIX):
                continue
            hamta(namn)["start"][str(ar)] = plocka(rad, START_FALT)

    for ar, d in examen.items():
        for rad in d["rader"]:
            if rad["huvudman"] != HUVUDMAN:
                continue
            namn = program.programnamn(rad["program"])
            if namn in SUMMARADER or namn.startswith(TOTALT_PREFIX):
                continue
            hamta(namn)["examen"][str(ar)] = plocka(rad, EXAMEN_FALT)

    ut = []
    for namn in sorted(per_program):
        p = per_program[namn]
        p["kohorter"] = [
            {"startAr": int(a), "examensar": int(a) + FORSKJUTNING,
             "start": p["start"][a],
             "examen": p["examen"].get(str(int(a) + FORSKJUTNING))}
            for a in sorted(p["start"])
        ]
        p["antalMedVarde"] = sum(
            1 for k in p["kohorter"] if k["start"].get("examen3") is not None)
        # Uppslagen behövdes bara för att para ihop kullarna
        del p["start"], p["examen"]
        ut.append(p)

    # Högskoleförberedande först, som på de andra sidorna, och inom
    # gruppen i bokstavsordning.
    ut.sort(key=lambda p: (p["typ"] != "hogskoleforberedande",
                           p["typ"] == "okant", p["namn"]))
    return ut


def kallor(*grupper) -> list:
    ut = []
    for filer in grupper:
        for d in sorted(filer, key=lambda x: x.get("ar", x.get("startAr"))):
            ut.append({
                "ar": d.get("ar", d.get("startAr")),
                "lasar": d.get("lasar", d.get("startLasar")),
                "rapportTitel": d["rapportTitel"],
                "kalla": d["kalla"],
                "kallaUrl": d["kallaUrl"],
                "hamtad": d["hamtad"],
            })
    return ut


def las_mapp(mapp: str, prefix: str) -> list:
    return [lasa_json(f)
            for f in sorted((ROT / "data" / mapp).glob(f"{prefix}_*.json"))]


def main() -> None:
    nian = las_mapp("arskurs9", "arskurs9")
    start = las_mapp("genomstromning", "genomstromning")
    examen = las_mapp("avgangskommun", "avgangskommun")
    pendel = las_mapp("pendling", "pendling")

    if not (nian and start and examen and pendel):
        raise SystemExit("Saknar årsfiler – kör scripts/hamta_kullkedjan.py först.")

    ut = bygg(nian, start, examen, pendel)

    for p in ut["program"]:
        if p["typ"] == "okant":
            print(f"  okänt program: {p['namn']} – kontrollera indelningen "
                  "i program.py")
    for rad in ut["pendling"]:
        for del_ in ("gymnasiet", "grundskolan"):
            v = rad[del_]
            if v and not v["stammer"]:
                print(f"  {rad['ar']} {del_}: folkbokförda går inte ihop med "
                      "utpendling + folkbokförda som studerar här")

    utfil = ROT / "docs" / "data-nian-gymnasiet.json"
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n",
                     encoding="utf-8")
    print(f"Skrev {utfil.name}: {len(ut['kullar'])} årskullar "
          f"({ut['antalKompletta']} med alla tre mätpunkterna), "
          f"{len(ut['program'])} program, {len(ut['pendling'])} pendlingsår")
    for s in ut["samband"]:
        print(f"  {s['nyckel']}: r = {s['r']} (n = {s['n']})")


if __name__ == "__main__":
    main()
