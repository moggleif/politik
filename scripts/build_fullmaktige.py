#!/usr/bin/env python3
"""Bygger docs/data-fullmaktige.json: kommunfullmäktiges inspelade möten.

Läser:
  data/fullmaktige/kommunsidan.json   (från hamta_fullmaktige.py)
  data/fullmaktige/screen9.json
  data/fullmaktige/youtube.json

Skriver:
  docs/data-fullmaktige.json

**Ett möte per datum.** Mötets datum är det som står i inspelningens
titel ("Kommunfullmäktige 11 augusti 2026"), och det som står i länken
på kommunens sida (årsrubriken plus "11 augusti"). Inspelningarna på
Screen9 och på YouTube förs till mötet med samma datum. Möten 2024 finns
på båda ställena och får därför två inspelningar.

Tre avvikelser mellan källorna redovisas i stället för att rättas:

  - En länk på kommunens sida som leder till en inspelning med ett annat
    datum i titeln. Mötet i länktexten står då kvar, men utan inspelning,
    och inspelningen förs till sitt eget datum.
  - En YouTube-video vars sändningsdatum ("Streamades live 8 feb. 2022")
    inte är datumet i titeln. Titelns datum gäller; sändningsdatumet
    följer med och visas.
  - Spellistan anger fler videor än den visar – en dold eller privat
    video räknas i YouTubes tal men går inte att se.

**Mötets längd** är inspelningens längd. Har mötet två inspelningar
används Screen9:s, eftersom det är den kommunen själv länkar till i dag;
YouTube-längden redovisas ändå vid sidan av. Längden är hela sändningen,
inklusive ajourneringar som sänts, och säger inget om hur länge själva
sammanträdet pågick.

**Ärenden och inlägg** kommer ur Screen9:s kapitelmarkeringar. Nivå 0 är
ett ärende på dagordningen, nivå 1 ett inlägg inom det. Ett inlägg har
formen "Namn (Parti)", med tillägget " - Replik" eller
" - Ordningsfråga" när det är något annat än ett anförande.
Partibeteckningen skrivs som i källan: "KB" och "Kbabo" slås inte ihop,
eftersom det vore en gissning. Ett inlägg utan beteckning inom parentes
räknas för sig, som "utan partibeteckning". Markeringarna finns bara för
sändningarna från 2025 och framåt.

**Visningarna** gäller bara YouTube: Screen9 visar inga visningstal
publikt. Talet är en ögonblicksbild från hämtningen och växer så länge
videon ligger uppe, så äldre videor har haft längre tid på sig.

Körs:  python3 scripts/build_fullmaktige.py
"""

import json
import re
from collections import Counter
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent
DATA = ROT / "data" / "fullmaktige"
UT = ROT / "docs" / "data-fullmaktige.json"

MANADER = {
    "januari": 1, "jan": 1, "februari": 2, "feb": 2, "mars": 3, "mar": 3,
    "april": 4, "apr": 4, "maj": 5, "juni": 6, "jun": 6, "juli": 7, "jul": 7,
    "augusti": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9,
    "oktober": 10, "okt": 10, "november": 11, "nov": 11, "december": 12,
    "dec": 12,
}
DATUM = re.compile(r"(\d{1,2})\s+([A-Za-zåäöÅÄÖ]+)\.?\s+(\d{4})")
DAG_MANAD = re.compile(r"^(\d{1,2})\s+([A-Za-zåäöÅÄÖ]+)")
INLAGG = re.compile(r"^(?P<namn>.+?)\s*\((?P<parti>[^()]+)\)\s*(?:[-–]\s*(?P<typ>.+))?$")

UTAN_PARTI = "utan partibeteckning"
TYPER = {None: "anforanden", "replik": "repliker", "ordningsfråga": "ordningsfragor"}


def datum(ar: int, manad: str, dag: int) -> str:
    m = MANADER.get(manad.lower())
    if m is None:
        raise SystemExit(f"Okänd månad: {manad!r}")
    return f"{ar:04d}-{m:02d}-{dag:02d}"


def datum_ur_text(text: str) -> str | None:
    """Första datumet i en text som "Kommunfullmäktige 7  mars 2023"
    eller "Streamades live 8 feb. 2022"."""
    m = DATUM.search(text)
    return datum(int(m.group(3)), m.group(2), int(m.group(1))) if m else None


def datum_ur_lank(rubrik: str, text: str) -> str:
    """Kommunens länktext ("13 juni - budetdebatt") under en årsrubrik."""
    m = DAG_MANAD.match(text)
    if not m or not re.fullmatch(r"\d{4}", rubrik):
        raise SystemExit(f"Kommunsidan: kan inte läsa ett datum ur {rubrik!r} / {text!r}")
    return datum(int(rubrik), m.group(2), int(m.group(1)))


def sekunder(langd: str) -> int:
    """"1:49:50" eller "49:50" som sekunder."""
    tal = [int(x) for x in langd.split(":")]
    while len(tal) < 3:
        tal.insert(0, 0)
    return tal[0] * 3600 + tal[1] * 60 + tal[2]


def tolka_inlagg(titel: str) -> dict:
    """Ett kapitel på nivå 1 som namn, parti och slag av inlägg."""
    m = INLAGG.match(titel.strip())
    if not m:
        return {"namn": titel.strip(), "parti": UTAN_PARTI, "typ": "anforanden"}
    typ = (m.group("typ") or "").strip().lower() or None
    if typ not in TYPER:
        raise SystemExit(f"Okänt slag av inlägg: {titel!r}")
    return {"namn": m.group("namn"), "parti": m.group("parti").strip(), "typ": TYPER[typ]}


def arenden(kapitel: list[dict]) -> list[dict]:
    """Ärendena (nivå 0) med sina inlägg (nivå 1) räknade.

    Inlägg före det första ärendet hör inte till något ärende. De samlas
    i en egen post med titeln None, som sidan visar som "före första
    ärendet" och som inte räknas som ett ärende – de tappas alltså inte
    bort, men blir inte heller en punkt på dagordningen."""
    ut = []
    for k in kapitel:
        if k["niva"] == 0:
            ut.append({"titel": k["titel"], "start": round(k["start"]), "inlagg": 0})
        elif k["niva"] == 1:
            if not ut:
                ut.append({"titel": None, "start": round(k["start"]), "inlagg": 0})
            ut[-1]["inlagg"] += 1
        else:
            raise SystemExit(f"Okänd kapitelnivå {k['niva']}: {k['titel']!r}")
    return ut


def partiraknare(kapitel: list[dict]) -> dict[str, Counter]:
    per_parti: dict[str, Counter] = {}
    for k in kapitel:
        if k["niva"] != 1:
            continue
        i = tolka_inlagg(k["titel"])
        per_parti.setdefault(i["parti"], Counter())[i["typ"]] += 1
    return per_parti


def bygg(kommunsidan: dict, screen9: dict, youtube: dict) -> dict:
    moten: dict[str, dict] = {}
    anmarkningar = []

    def mote(d: str) -> dict:
        return moten.setdefault(d, {"datum": d, "ar": int(d[:4]),
                                    "screen9": None, "youtube": None,
                                    "kommunlank": None})

    # Screen9, till titelns datum
    per_url = {}
    for s in screen9["sandningar"]:
        d = datum_ur_text(s["titel"])
        if d is None:
            raise SystemExit(f"Screen9: inget datum i titeln {s['titel']!r}")
        m = mote(d)
        if m["screen9"] is not None:
            raise SystemExit(f"Två Screen9-sändningar med datumet {d}")
        a = arenden(s["kapitel"])
        m["screen9"] = {
            "url": s["url"],
            "titel": s["titel"],
            "sekunder": round(s["sekunder"]),
            "arenden": a if a else None,
            "antalArenden": sum(1 for x in a if x["titel"] is not None) if a else None,
            "antalInlagg": sum(x["inlagg"] for x in a) if a else None,
        }
        per_url[s["url"]] = d

    # Kommunens länkar, till länktextens datum
    for lank in kommunsidan["lankar"]:
        d = datum_ur_lank(lank["rubrik"], lank["text"])
        mal = per_url.get(lank["url"])
        if mal is None:
            raise SystemExit(f"Kommunsidan länkar till {lank['url']}, som inte hämtats")
        mote(d)["kommunlank"] = {"text": lank["text"], "url": lank["url"], "lederTill": mal}
        if mal != d:
            anmarkningar.append({"datum": d, "slag": "kommunlank", "lederTill": mal})

    # YouTube, till titelns datum
    for v in youtube["videor"]:
        d = datum_ur_text(v["titel"])
        if d is None:
            raise SystemExit(f"YouTube: inget datum i titeln {v['titel']!r}")
        sand = datum_ur_text(v["datumtext"])
        if sand is None:
            raise SystemExit(f"YouTube {v['id']}: inget datum i {v['datumtext']!r}")
        m = mote(d)
        if m["youtube"] is not None:
            raise SystemExit(f"Två YouTube-videor med datumet {d}")
        m["youtube"] = {
            "url": f"https://www.youtube.com/watch?v={v['id']}",
            "titel": " ".join(v["titel"].split()),
            "sekunder": sekunder(v["langd"]),
            "visningar": v["visningar"],
            "live": v["datumtext"].startswith("Streamades live"),
            "sandningsdatum": sand,
        }
        if sand != d:
            anmarkningar.append({"datum": d, "slag": "sandningsdatum",
                                 "sandningsdatum": sand})

    lista = sorted(moten.values(), key=lambda m: m["datum"])
    for m in lista:
        inspelning = m["screen9"] or m["youtube"]
        m["sekunder"] = inspelning["sekunder"] if inspelning else None
        m["plattform"] = ("Screen9" if m["screen9"] else "YouTube") if inspelning else None

    # År för år
    ar = []
    for a in sorted({m["ar"] for m in lista}):
        pa = [m for m in lista if m["ar"] == a]
        med = [m for m in pa if m["sekunder"] is not None]
        yt = [m["youtube"]["visningar"] for m in pa if m["youtube"]]
        s9 = [m["screen9"] for m in pa if m["screen9"] and m["screen9"]["arenden"]]
        langst = max(med, key=lambda m: m["sekunder"]) if med else None
        ar.append({
            "ar": a,
            "moten": len(pa),
            "inspelade": len(med),
            "sekunder": sum(m["sekunder"] for m in med) if med else None,
            "snittSekunder": round(sum(m["sekunder"] for m in med) / len(med)) if med else None,
            "langst": {"datum": langst["datum"], "sekunder": langst["sekunder"]} if langst else None,
            "youtubeVideor": len(yt),
            "visningar": sum(yt) if yt else None,
            "snittVisningar": round(sum(yt) / len(yt)) if yt else None,
            "arenden": sum(x["antalArenden"] for x in s9) if s9 else None,
            "inlagg": sum(x["antalInlagg"] for x in s9) if s9 else None,
        })

    # Inlägg per parti, per år och totalt
    per_ar: dict[int, dict[str, Counter]] = {}
    for s in screen9["sandningar"]:
        a = int(datum_ur_text(s["titel"])[:4])
        for parti, c in partiraknare(s["kapitel"]).items():
            per_ar.setdefault(a, {}).setdefault(parti, Counter()).update(c)

    def partilista(raknare: dict[str, Counter]) -> list[dict]:
        rader = [{"parti": p, "anforanden": c["anforanden"], "repliker": c["repliker"],
                  "ordningsfragor": c["ordningsfragor"], "totalt": sum(c.values())}
                 for p, c in raknare.items()]
        return sorted(rader, key=lambda r: (-r["totalt"], r["parti"]))

    totalt: dict[str, Counter] = {}
    for raknare in per_ar.values():
        for p, c in raknare.items():
            totalt.setdefault(p, Counter()).update(c)

    return {
        "kallor": {
            "kommunsida": kommunsidan["url"],
            "spellista": youtube["spellista"],
        },
        "hamtad": {
            "kommunsidan": kommunsidan["hamtad"],
            "screen9": screen9["hamtad"],
            "youtube": youtube["hamtad"],
        },
        "youtubeAngivet": youtube["antalEnligtSpellistan"],
        "youtubeSynliga": len(youtube["videor"]),
        "moten": lista,
        "ar": ar,
        "partier": {
            "ar": sorted(per_ar),
            "totalt": partilista(totalt),
            "perAr": {str(a): partilista(r) for a, r in sorted(per_ar.items())},
        },
        "anmarkningar": sorted(anmarkningar, key=lambda x: x["datum"]),
    }


def las(namn: str) -> dict:
    return json.loads((DATA / namn).read_text(encoding="utf-8"))


def las_indata() -> tuple[dict, dict, dict]:
    return las("kommunsidan.json"), las("screen9.json"), las("youtube.json")


def main():
    ut = bygg(*las_indata())
    UT.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    inspelade = sum(1 for m in ut["moten"] if m["sekunder"] is not None)
    print(f"Skrev {UT.relative_to(ROT)}: {len(ut['moten'])} möten, {inspelade} inspelade, "
          f"{len(ut['anmarkningar'])} anmärkningar")


if __name__ == "__main__":
    main()
