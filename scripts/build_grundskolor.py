#!/usr/bin/env python3
"""Bygger docs/data-grundskolor.json av data/grundskolor/.

Sätter ihop Skolverkets skolenheter (en rad per enhet och år) till
skolor med en tidsserie vardera. Vilka enheter som hör till vilken skola
står i `program.GRUNDSKOLOR`; en enhet som saknas där stoppar bygget.

Fyra mått följer med per skola och år, alla ur årskurs 9:

  meritvarde          genomsnittligt meritvärde, 17 ämnen, max 340
  behorigYrkes        andel (%) behöriga till yrkesprogram
  behorigEstetiskt    … till estetiska programmet
  behorigEkoHumSam    … till ekonomi-, humanistiska och
                      samhällsvetenskapsprogrammen
  behorigNaturTeknik  … till naturvetenskaps- och teknikprogrammen

**Enheter blir skolor genom elevviktat medelvärde.** Varlaskolans
meritvärde är medelvärdet av dess enheters meritvärden, vägt med antalet
elever i varje enhet; det ger de tal skolornas egna sammanställningar
visar. Andelarna vägs med antalet elever i behörighetsrapporten och
meritvärdet med antalet i betygsrapporten – de två är lika, men varje mått
vägs med siffran i sin egen rapport.

**Prickning.** Är en enhets värde dolt (`..`, färre än tio elever) blir
skolans värde för året `null` med märket `dolt`: ett medelvärde av det
som syns vore ett annat mått än det som anges. Utan värde blir det aldrig
en nolla. En skola som saknar rad ett år (ingen årskurs 9 det året – det
händer de skolor vars nior växlar mellan enheter) får ingen post alls för
det året, vilket är något annat än dolt.

**≈100.** Skolverket skriver `~100` när 1–4 elever saknade behörigheten.
Det går inte att räkna med; sidan ritar det som **99 %**, och märket
`ca100` (alla enheter ≈100) eller `ungefar` (någon enhet ≈100, resten
exakta) följer med så att sidan kan säga det. Det sanna värdet ligger
under 100 men över 100 − 4/n för en skola med n elever, och kan för en
liten skola alltså vara klart lägre än 99.

**Kommunsnitt.** Skolverkets egna tal för Kungsbacka som helhet – alla,
kommunala och fristående skolor – följer med som `snitt`, med samma mått.
De är inte ett medelvärde av skolorna utan en egen rad i Skolverkets
kommunrapporter, och används därför också som kontroll: summan av enheternas
elevantal ska vara exakt kommunens, och det elevviktade meritvärdet över
enheterna ska ligga inom avrundningen (0,2) från kommunens. Avviker något
stannar bygget – då har en enhet fallit bort eller hamnat i fel skola.

Körs:  python3 scripts/build_grundskolor.py
"""

import json
import math
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from program import GRUNDSKOLOR, MERIT_MAX

ROT = Path(__file__).resolve().parent.parent

# (fält i utdatan, fält i enhetsraden, vikt i enhetsraden)
MATT = [
    ("meritvarde", "meritvarde", "antal"),
    ("behorigYrkes", "behorigYrkes", "antalBehorighet"),
    ("behorigEstetiskt", "behorigEstetiskt", "antalBehorighet"),
    ("behorigEkoHumSam", "behorigEkoHumSam", "antalBehorighet"),
    ("behorigNaturTeknik", "behorigNaturTeknik", "antalBehorighet"),
]

CIRKA_100 = 99.0      # hur ~100 ritas – se modul-docstringen
MERIT_TOLERANS = 0.2  # avrundning: enheternas tal har en decimal vardera

# (huvudmannatyp i Skolverkets rapport, id, namn)
SNITT = [
    ("Samtliga", "kommun-alla", "Kungsbacka, alla skolor"),
    ("Kommunal", "kommun-kommunala", "Kungsbacka, kommunala skolor"),
    ("Enskild", "kommun-fristaende", "Kungsbacka, fristående skolor"),
]


def lasa_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def avrunda(v: float) -> float:
    """En decimal, halvor uppåt – som Skolverket och tabellerna skolorna
    själva möts av. Pythons round() avrundar halvor mot jämnt och ger
    217,3 för 217,35, vilket är ett annat tal än det som publiceras."""
    return float(Decimal(repr(round(v, 6))).quantize(Decimal("0.1"), ROUND_HALF_UP))


def kopplingar() -> dict:
    """enhetskod -> skol-id, med kontroll att ingen enhet ligger i två."""
    ut = {}
    for s in GRUNDSKOLOR:
        for kod in s["enheter"]:
            if kod in ut:
                raise SystemExit(f"Enhet {kod} ligger i både {ut[kod]} och {s['id']}")
            ut[kod] = s["id"]
    return ut


def slå_ihop(enheter: list, falt: str, vikt: str) -> dict:
    """Ett mått för en skola och ett år ur dess enheter det året.

    Returnerar {"v": värde eller None, "mark": None | "dolt" | "ca100" |
    "ungefar"}. Se modul-docstringen för reglerna."""
    varden, vikter, cirka = [], [], 0
    for e in enheter:
        v = e.get(falt)
        if v is None:
            if e["markor"].get(falt) == "~100":
                v, cirka = CIRKA_100, cirka + 1
            else:
                return {"v": None, "mark": "dolt"}
        varden.append(v)
        vikter.append(e.get(vikt))
    if len(enheter) > 1:
        if any(w is None or w <= 0 for w in vikter):
            return {"v": None, "mark": "dolt"}
        v = math.fsum(a * w for a, w in zip(varden, vikter)) / math.fsum(vikter)
    else:
        v = varden[0]
    mark = None
    if cirka:
        mark = "ca100" if cirka == len(enheter) else "ungefar"
    return {"v": avrunda(v), "mark": mark}


def kontrollera_snitt(arsfil: dict) -> None:
    """Enheterna ska gå ihop med Skolverkets kommunrad, per huvudmannatyp."""
    for typ, _, namn in SNITT:
        enheter = [e for e in arsfil["enheter"] if typ == "Samtliga" or e["huvudman"] == typ]
        snitt = arsfil["snitt"][typ]
        antal = [e["antal"] for e in enheter]
        if None in antal or sum(antal) != snitt["antal"]:
            raise SystemExit(f"{arsfil['ar']} {namn}: enheternas elevantal "
                             f"({sum(a or 0 for a in antal)}) går inte ihop med "
                             f"kommunens ({snitt['antal']}) – saknas en enhet?")
        if not antal:
            continue            # ingen enhet av den typen: inget att väga
        vagt = math.fsum(e["antal"] * e["meritvarde"] for e in enheter) / sum(antal)
        if abs(vagt - snitt["meritvarde"]) > MERIT_TOLERANS:
            raise SystemExit(f"{arsfil['ar']} {namn}: elevviktat meritvärde över "
                             f"enheterna ({vagt:.2f}) avviker från kommunens "
                             f"({snitt['meritvarde']})")


def bygg_snitt(arsfiler: list) -> list:
    ut = []
    for typ, id_, namn in SNITT:
        varden = {}
        for d in arsfiler:
            post = d["snitt"][typ]
            varden[str(d["ar"])] = {"antal": post["antal"], **{
                m: slå_ihop([post], falt, vikt) for m, falt, vikt in MATT}}
        ut.append({"id": id_, "namn": namn, "huvudman": typ, "varden": varden})
    return ut


def bygg(arsfiler: list) -> dict:
    """Hela utdatan som en ren funktion av årsfilerna, så att den går att
    kontrollräkna i testerna utan att skriva någon fil."""
    skol_av = kopplingar()
    ar = [d["ar"] for d in arsfiler]
    for d in arsfiler:
        kontrollera_snitt(d)

    per_skola = {s["id"]: {} for s in GRUNDSKOLOR}
    enhetsnamn = {}
    for d in arsfiler:
        for e in d["enheter"]:
            skola = skol_av.get(e["kod"])
            if skola is None:
                raise SystemExit(
                    f"Skolenheten {e['namn']} ({e['kod']}, {d['ar']}) finns inte i "
                    "program.GRUNDSKOLOR – lägg till den, annars ritas den inte.")
            per_skola[skola].setdefault(d["ar"], []).append(e)
            enhetsnamn.setdefault((skola, e["kod"]), {})[d["ar"]] = e["namn"]

    skolor = []
    for s in GRUNDSKOLOR:
        ar_med = sorted(per_skola[s["id"]])
        if not ar_med:
            continue                    # en skola utan rad i något år i fönstret
        varden = {}
        for a in ar_med:
            rader = per_skola[s["id"]][a]
            post = {"enheter": len(rader)}
            antal = [e["antal"] for e in rader]
            post["antal"] = sum(antal) if all(x is not None for x in antal) else None
            for ut, falt, vikt in MATT:
                post[ut] = slå_ihop(rader, falt, vikt)
            varden[str(a)] = post
        huvudman = {e["huvudman"] for a in ar_med for e in per_skola[s["id"]][a]}
        if len(huvudman) != 1:
            raise SystemExit(f"{s['namn']}: blandad huvudmannatyp {sorted(huvudman)}")
        koder = []
        for (skola, kod), namn_ar in sorted(enhetsnamn.items()):
            if skola != s["id"]:
                continue
            fa, sa = min(namn_ar), max(namn_ar)
            koder.append({"kod": kod, "namn": namn_ar[sa], "forstaAr": fa, "sistaAr": sa})
        koder.sort(key=lambda k: (k["forstaAr"], k["namn"]))
        skolor.append({
            "id": s["id"],
            "namn": s["namn"],
            "huvudman": huvudman.pop(),
            "forstaAr": ar_med[0],
            "sistaAr": ar_med[-1],
            "aktuell": ar_med[-1] == ar[-1],
            "enheter": koder,
            "foregangare": [{"kalla": None, **f} for f in s.get("foregangare", [])],
            "anm": s.get("anm"),
            "kalla": s.get("kalla"),
            "varden": varden,
        })

    ids = {s["id"] for s in skolor}
    for s in skolor:
        for f in s["foregangare"]:
            if f["id"] not in ids:
                raise SystemExit(f"{s['namn']}: föregångaren {f['id']} saknar data")
    skolor.sort(key=lambda s: s["namn"])

    return {
        "kommun": arsfiler[-1]["kommun"],
        "serie": "Grundskolorna i årskurs 9",
        "niva": arsfiler[-1]["niva"],
        "maxMerit": MERIT_MAX,
        "ar": ar,
        "lasar": {d["ar"]: d.get("lasar") for d in arsfiler},
        "skolor": skolor,
        "snitt": bygg_snitt(arsfiler),
        "kallor": [{"ar": d["ar"], "lasar": d.get("lasar"),
                    "kalla": d.get("kalla"), "statistikUrl": d.get("statistikUrl"),
                    "hamtad": d.get("hamtad"), "rapporter": d.get("kallor")}
                   for d in arsfiler],
    }


def main() -> None:
    filer = sorted((ROT / "data" / "grundskolor").glob("grundskolor_*.json"))
    if not filer:
        raise SystemExit("Inga filer i data/grundskolor/ – kör hamta_grundskolor.py först")
    ut = bygg([lasa_json(f) for f in filer])
    utfil = ROT / "docs" / "data-grundskolor.json"
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Skrev {utfil.name}: {len(ut['skolor'])} skolor, {len(ut['ar'])} läsår "
          f"({ut['ar'][0]}–{ut['ar'][-1]})")
    for s in ut["skolor"]:
        luckor = [a for a in ut["ar"] if s["forstaAr"] <= a <= s["sistaAr"]
                  and str(a) not in s["varden"]]
        print(f"  {s['namn']}: {s['forstaAr']}–{s['sistaAr']}"
              + (f", utan rad {luckor}" if luckor else ""))


if __name__ == "__main__":
    main()
