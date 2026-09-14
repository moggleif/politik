#!/usr/bin/env python3
"""Bygger docs/data-kommunval.json: kommunvalet per valdistrikt i
Kungsbacka 2010–2026, parti för parti.

Läser:
  data/kommunval/<år>.json          (från hamta_kommunval.py, Kungsbackas
                                     rader ur Valmyndighetens filer)
  data/kommunval/jamforbarhet.json  (Valmyndighetens egen bedömning av
                                     vilka valdistrikt som går att jämföra
                                     mellan två val)

Skriver:
  docs/data-kommunval.json

Filen innehåller **antal röster**, aldrig andelar. Andelarna räknas i
webbläsaren, och skälet är sidans viktigaste reglage: användaren kryssar
i en fritt vald grupp distrikt, och då måste rösterna summeras först och
andelen räknas på summan. Ett medelvärde av distriktens procenttal hade
vägt ett distrikt med 400 röster lika tungt som ett med 1 400. Ligger
bara rösterna i filen kan sidan inte råka göra fel.

Ett distrikt identifieras med sin valdistriktskod, som visar sig vara
stabil i Kungsbacka: alla 41 distrikt 2010 finns kvar med samma kod 2014,
41 av dem 2018, och koderna 2022 och 2026 är identiska. Att koden lever
vidare betyder däremot inte att gränserna är desamma – det avgör
Valmyndigheten, och deras bedömning följer med som `jamforbart` per
övergång. Sidan ritar de åren med bruten linje.

Distrikt som inte finns ett visst år får `null`, aldrig 0. Skillnaden
mellan "fanns inte" och "fick inga röster" är hela poängen när
indelningen ändrats.

Körs:  python3 scripts/build_kommunval.py
"""

import json
from datetime import date
from pathlib import Path

from val import KOMMUN, OVRIGA, partinamn, slug

ROT = Path(__file__).resolve().parent.parent
IN_MAPP = ROT / "data" / "kommunval"
UT = ROT / "docs" / "data-kommunval.json"

AR = [2010, 2014, 2018, 2022, 2026]
OVERGANGAR = [f"{a}-{b}" for a, b in zip(AR, AR[1:])]

# Fälten som följer med per distrikt och år, utöver partirösterna.
SUMMOR = ["giltiga", "rostande", "rostberattigade"]


def per_kod(kalla: dict) -> dict:
    return {d["kod"]: d for d in kalla["distrikt"]}


def bygg(kallor: dict, jamforbarhet: dict) -> dict:
    """kallor: {år: innehållet i data/kommunval/<år>.json}."""
    ar = [a for a in AR if a in kallor]
    overgangar = [f"{a}-{b}" for a, b in zip(ar, ar[1:])]
    distrikt_per_ar = {a: per_kod(kallor[a]) for a in ar}
    senaste = ar[-1]

    # Raderna är valdistrikten i det senaste valet. Distrikt som lagts ned
    # på vägen redovisas för sig i stället för att skräpa ned kryssrutorna;
    # deras röster finns kvar i kommunens totalsiffror.
    aktuella = [k for k, d in distrikt_per_ar[senaste].items()
                if not d["uppsamling"]]
    aktuella.sort(key=lambda k: distrikt_per_ar[senaste][k]["namn"])

    def jamforbart(kod: str, overgang: str) -> bool:
        """Valmyndighetens bedömning för övergången, uppslagen på det
        senare årets kod. Saknas distriktet något av åren finns ingen
        övergång att bedöma."""
        tidigare, senare = overgang.split("-")
        if kod not in distrikt_per_ar[int(tidigare)]:
            return False
        if kod not in distrikt_per_ar[int(senare)]:
            return False
        post = (jamforbarhet.get("overgangar", {}).get(overgang, {})).get(kod)
        return bool(post and post["jamforbart"])

    def serie(kod: str) -> dict:
        d = {a: distrikt_per_ar[a].get(kod) for a in ar}
        partier = sorted({p for v in d.values() if v for p in v["roster"]})
        rad = {
            "slug": slug(d[senaste]["namn"]),
            "namn": d[senaste]["namn"],
            "kod": {str(a): kod for a in ar if d[a]},
            "jamforbart": {o: jamforbart(kod, o) for o in overgangar},
            "roster": {p: {str(a): (d[a]["roster"].get(p, 0) if d[a] else None)
                           for a in ar}
                       for p in partier},
        }
        for falt in SUMMOR:
            rad[falt] = {str(a): (d[a][falt] if d[a] else None) for a in ar}
        tidigare_namn = {str(a): d[a]["namn"] for a in ar
                         if d[a] and d[a]["namn"] != d[senaste]["namn"]}
        if tidigare_namn:
            rad["tidigareNamn"] = tidigare_namn
        return rad

    rader = [serie(k) for k in aktuella]

    # Kommunen som helhet: alla distrikt, uppsamlingsdistriktet inräknat.
    totalt = {"roster": {}, **{f: {} for f in SUMMOR}}
    for a in ar:
        for d in distrikt_per_ar[a].values():
            for p, n in d["roster"].items():
                totalt["roster"].setdefault(p, {}).setdefault(str(a), 0)
                totalt["roster"][p][str(a)] += n
            for falt in SUMMOR:
                totalt[falt][str(a)] = totalt[falt].get(str(a), 0) + d[falt]
    for p in totalt["roster"]:
        for a in ar:
            totalt["roster"][p].setdefault(str(a), 0)

    # Partierna ordnas efter hur stora de var i det senaste valet, så att
    # sidans teckenförklaring och tabell börjar med de största. ÖVR sist:
    # det är ingen egen politisk riktning utan en restpost.
    partier = sorted(totalt["roster"],
                     key=lambda p: (p == OVRIGA,
                                    -totalt["roster"][p].get(str(senaste), 0),
                                    p))
    partilista = [{"kod": p, "namn": partinamn(p)} for p in partier]

    nedlagda = []
    for a in ar[:-1]:
        for kod, d in distrikt_per_ar[a].items():
            if d["uppsamling"] or kod in aktuella:
                continue
            if any(kod in distrikt_per_ar[b] for b in ar if b > a):
                continue
            nedlagda.append({"kod": kod, "namn": d["namn"], "sistaVal": a})
    nedlagda.sort(key=lambda d: d["namn"])

    return {
        "kommun": "Kungsbacka",
        "kommunkod": KOMMUN,
        "val": "Val till kommunfullmäktige",
        "ar": ar,
        "overgangar": overgangar,
        "rakningstillfalle": {str(a): kallor[a]["rakningstillfalle"]
                              for a in ar if kallor[a].get("rakningstillfalle")},
        "partier": partilista,
        "distrikt": rader,
        "kommunTotalt": totalt,
        "nedlagda": nedlagda,
        "kalla": {str(a): {"kalla": kallor[a]["kalla"],
                           "kallaUrl": kallor[a]["kallaUrl"],
                           "sidaUrl": kallor[a]["sidaUrl"],
                           "hamtad": kallor[a]["hamtad"]} for a in ar},
        "kallaJamforbarhet": jamforbarhet.get("kalla", {}),
        "senastUppdaterad": max(kallor[a]["hamtad"] for a in ar),
    }


def main() -> None:
    kallor = {}
    for a in AR:
        fil = IN_MAPP / f"{a}.json"
        if fil.exists():
            kallor[a] = json.loads(fil.read_text(encoding="utf-8"))
    if not kallor:
        raise SystemExit("Inga källfiler i data/kommunval/ – kör "
                         "scripts/hamta_kommunval.py först")
    jamforbarhet = json.loads(
        (IN_MAPP / "jamforbarhet.json").read_text(encoding="utf-8"))
    data = bygg(kallor, jamforbarhet)
    UT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                  encoding="utf-8")
    print(f"Skrev {UT.relative_to(ROT)}: {len(data['distrikt'])} valdistrikt, "
          f"{len(data['partier'])} partier, {len(data['ar'])} val")
    for o in data["overgangar"]:
        ja = sum(1 for d in data["distrikt"] if d["jamforbart"][o])
        print(f"  {o}: {ja} av {len(data['distrikt'])} distrikt jämförbara")
    if data["nedlagda"]:
        print("  nedlagda distrikt: "
              + ", ".join(f"{d['namn']} (t.o.m. {d['sistaVal']})"
                          for d in data["nedlagda"]))


if __name__ == "__main__":
    main()
