#!/usr/bin/env python3
"""Bygger docs/data-fortidsroster/<kod>.json: förtidsröstningen i varje
kommun, varje län och riket, dag för dag, ställd mot förra riksdagsvalet,
samt docs/data-fortidsroster/index.json med områdeslistan till sidans
väljare.

Läser:
  data/fortidsroster/mottagna_<år>.csv    (från hamta_fortidsroster.py,
                                           Valmyndighetens filer orörda)
  data/fortidsroster/hamtad.json          (när varje fil senast ändrades)
  data/fortidsroster/rostberattigade.json (från hamta_rostberattigade.py)
  data/fortidsroster/angerroster.json     (avskrift ur Valmyndighetens
                                           erfarenhetsrapport; rikssiffror)
  data/fortidsroster/prognos.json         (den engångsprognos som ställdes
                                           en gång av gor_prognos.py; läggs
                                           in oförändrad hos de områden den
                                           gäller, och räknas aldrig om här)

Skriver:
  docs/data-fortidsroster/<kod>.json      kommun (fyra siffror), län (två)
                                           eller riket ("00")
  docs/data-fortidsroster/index.json

Valen ligger inte på samma kalenderdatum – valdagen 2026 är söndagen
den 13 september, 2022 var den söndagen den 11 september – så åren
jämförs på **dagar kvar till valdagen**, med valdagen som 0. Då hamnar
samma veckodag på samma plats i alla serierna, vilket spelar roll:
röstmottagningen dippar tydligt de dagar lokalerna har kortare öppettider.

Dagar som ännu inte inträffat står som 0 i Valmyndighetens fil och
utelämnas här i stället för att ritas som nollor. Regeln följer
tidsstämpeln i hamtad.json: dagar före hämtningsdagen tas med,
hämtningsdagen själv bara om den har röster, senare dagar utelämnas.

Vilken dag som *pågår* (och därför har en ofullständig siffra – filen
uppdateras kl. 06 och 14) avgörs inte här utan i webbläsaren, som vet
vilken dag det är när sidan laddas. Byggskriptet lämnar bara fakta.

Körs:  python3 scripts/build_fortidsroster.py
"""

import json
import re
import unicodedata
from datetime import date, datetime
from pathlib import Path

from hamta_fortidsroster import VAL, tolka_csv

ROT = Path(__file__).resolve().parent.parent
IN_MAPP = ROT / "data" / "fortidsroster"
UT_MAPP = ROT / "docs" / "data-fortidsroster"

# Området sidan visar när adressraden inte säger något annat
STANDARD_OMRADE = "1384"   # Kungsbacka
RIKET = "00"

# Län och rike har tusentals lokaler; sidan visar de största
LOKALER_VISADE = 30

VECKODAG = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"]


def lasa_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def slug(text: str) -> str:
    """Samma regler som K.slug i docs/gemensam.js, så att ?omrade=
    i adressraden matchar åt båda hållen."""
    t = str(text).lower()
    t = t.replace("å", "a").replace("ä", "a").replace("ö", "o")
    t = t.replace("é", "e").replace("ü", "u")
    t = "".join(c for c in unicodedata.normalize("NFD", t)
                if not unicodedata.combining(c))
    t = re.sub(r"[^a-z0-9]+", "-", t)
    return t.strip("-")


# ---------- Områden ----------

def lokalrader(rader: list) -> list:
    """Bara riktiga lokaler: SUMMA-raden för riket saknar LOKALID."""
    return [r for r in rader if r["LOKALID"]]


def omradesregister(csvs: dict) -> dict:
    """{kod: {kod, namn, typ, lan, slug}} ur alla årens filer. Kommunnamnen
    tas ur det senaste år kommunen förekommer. Länen får det fullständiga
    namnet ("Hallands län") ur den senaste fil som skriver så – 2026 års
    fil skriver bara "Halland", vilket krockar med kommuner som
    Stockholm, Uppsala och Kalmar."""
    kommuner, lan, lan_kort = {}, {}, {}
    for ar in sorted(csvs):
        for r in lokalrader(csvs[ar][1]):
            kommuner[r["LÄNSKOD"] + r["KOMMUNKOD"]] = (r["KOMMUN"], r["LÄNSKOD"])
            if r["LÄN"].endswith(" län"):
                lan[r["LÄNSKOD"]] = r["LÄN"]
            lan_kort[r["LÄNSKOD"]] = r["LÄN"]
    ut = {RIKET: {"kod": RIKET, "namn": "Hela riket", "typ": "riket", "lan": None}}
    for kod, namn in lan_kort.items():
        ut[kod] = {"kod": kod, "namn": lan.get(kod, namn + " län"), "typ": "lan", "lan": None}
    for kod, (namn, lanskod) in kommuner.items():
        ut[kod] = {"kod": kod, "namn": namn, "typ": "kommun", "lan": lanskod}
    satt_slugs(ut)
    return ut


def satt_slugs(register: dict) -> None:
    """Adressen ?omrade=<slug>. Håbo och Habo blir båda "habo"; en
    kommun vars slug krockar får länets namn efter sig."""
    for o in register.values():
        o["slug"] = slug(o["namn"])
    antal = {}
    for o in register.values():
        antal[o["slug"]] = antal.get(o["slug"], 0) + 1
    for o in register.values():
        if antal[o["slug"]] > 1 and o["typ"] == "kommun":
            o["slug"] = slug(o["namn"] + " " + register[o["lan"]]["namn"])
    kvar = [s for s in [o["slug"] for o in register.values()]
            if [o["slug"] for o in register.values()].count(s) > 1]
    if kvar:
        raise SystemExit(f"Två områden får samma adress: {sorted(set(kvar))}")


def rader_for(omrade: dict, rader: list) -> list:
    if omrade["typ"] == "riket":
        return lokalrader(rader)
    if omrade["typ"] == "lan":
        return [r for r in lokalrader(rader) if r["LÄNSKOD"] == omrade["kod"]]
    return [r for r in lokalrader(rader)
            if r["LÄNSKOD"] + r["KOMMUNKOD"] == omrade["kod"]]


# ---------- Ett val i ett område ----------

def dagserie(datum: list, rader: list, valdag: str, hamtad: str) -> list:
    """Dagarna i ordning, med bara de dagar som inträffat."""
    valdag = date.fromisoformat(valdag)
    idag = datetime.fromisoformat(hamtad).date()
    ut = []
    ack = 0
    for d in datum:
        dag = date.fromisoformat(d)
        antal = sum(r["perDag"].get(d, 0) for r in rader)
        if dag > idag:
            break
        if dag == idag and antal == 0:
            break
        ack += antal
        ut.append({
            "datum": d,
            "veckodag": VECKODAG[dag.weekday()],
            "kvar": (valdag - dag).days,
            "antal": antal,
            "ack": ack,
        })
    return ut


def lokallista(rader: list, dagar: list, tak) -> tuple:
    """Lokalerna sorterade efter mottagna röster under de dagar som
    inträffat. Lokaler helt utan röster tas med, så att listan visar
    vilka som ännu inte öppnat (särskilda röstmottagningsställen som
    vård- och omsorgsboenden har ofta en enda dag). Med `tak` kapas
    listan till de största."""
    med = [d["datum"] for d in dagar]
    ut = []
    for r in rader:
        varden = [r["perDag"].get(d, 0) for d in med]
        total = sum(varden)
        ut.append({
            "namn": r["LOKAL"],
            "kommun": r["KOMMUN"],
            "lokalId": r["LOKALID"],
            "total": total,
            "dagarMedRoster": sum(1 for v in varden if v > 0),
            "storstaDag": (max(varden) if varden else 0),
        })
    ut.sort(key=lambda l: (-l["total"], l["namn"], l["lokalId"]))
    summa = sum(l["total"] for l in ut)
    for l in ut:
        l["andel"] = round(100.0 * l["total"] / summa, 1) if summa else None
    antal = len(ut)
    if tak is not None and antal > tak:
        ut = ut[:tak]
    return ut, antal


def bygg_val(ar: int, omrade: dict, datum: list, rader: list, hamtad: str, rb) -> dict:
    v = VAL[ar]
    dagar = dagserie(datum, rader, v["valdag"], hamtad)
    tak = None if omrade["typ"] == "kommun" else LOKALER_VISADE
    lokaler, antal_lokaler = lokallista(rader, dagar, tak)
    rostberattigade = None
    if rb and omrade["kod"] in rb.get("omraden", {}):
        rostberattigade = dict(rb["omraden"][omrade["kod"]])
        rostberattigade.update({k: rb.get(k) for k in
                                ("kvalifikationsdag", "kalla", "kallaUrl", "sidaUrl", "hamtad")})
    return {
        "ar": ar,
        "valdag": v["valdag"],
        "forstaDag": datum[0],
        "antalDagar": len(datum),
        "omrade": omrade["namn"],
        "typ": omrade["typ"],
        "kalla": v["kalla"],
        "kallaUrl": v["url"],
        "sidaUrl": v["sidaUrl"],
        "preliminarTom": v["preliminarTom"],
        "hamtad": hamtad,
        "klart": len(dagar) == len(datum),
        "dagar": dagar,
        "total": dagar[-1]["ack"] if dagar else 0,
        "rostberattigade": rostberattigade,
        "lokaler": lokaler,
        "antalLokaler": antal_lokaler,
        "lokalerKapad": len(lokaler) < antal_lokaler,
    }


def prognos_for(omrade: dict, prognos) -> dict:
    """Den ställda prognosen för ett område, om den gäller området.
    Innehållet följer med oförändrat – det här skriptet räknar inte om
    den, och ska inte göra det: den är ställd en gång, vid en dag som
    står i filen, och ska gå att jämföra med utfallet efteråt."""
    if not prognos:
        return None
    egen = prognos.get("omraden", {}).get(omrade["kod"])
    if not egen:
        return None
    ut = {k: v for k, v in prognos.items() if k != "omraden"}
    ut.update(egen)
    return ut


def bygg_omrade(omrade: dict, csvs: dict, hamtad: dict, rostberattigade, angerroster,
                prognos=None) -> dict:
    rb_val = (rostberattigade or {}).get("val", {})
    val = {}
    for ar in sorted(csvs):
        datum, rader = csvs[ar]
        egna = rader_for(omrade, rader)
        if not egna:
            continue
        val[str(ar)] = bygg_val(ar, omrade, datum, egna, hamtad[str(ar)], rb_val.get(str(ar)))
    aren = sorted(int(a) for a in val)
    aktuellt = val[str(aren[-1])]
    return {
        "kod": omrade["kod"],
        "omrade": omrade["namn"],
        "typ": omrade["typ"],
        "lan": omrade["lan"],
        "kalla": "Valmyndigheten",
        "kallaUrl": aktuellt["sidaUrl"],
        "aktuellt": aren[-1],
        "forra": aren[-2] if len(aren) > 1 else None,
        "senastUppdaterad": aktuellt["hamtad"],
        "preliminarTom": aktuellt["preliminarTom"],
        "val": val,
        "angerroster": angerroster,
        "prognos": prognos_for(omrade, prognos),
    }


def bygg(csvs: dict, hamtad: dict, rostberattigade, angerroster=None,
         prognos=None) -> tuple:
    """Hela utdatan som en ren funktion av indatafilerna, så att den går
    att kontrollräkna i testerna: ({kod: områdesfil}, index).

    csvs är {år: (datum, rader)} som tolka_csv ger dem."""
    register = omradesregister(csvs)
    filer = {kod: bygg_omrade(o, csvs, hamtad, rostberattigade, angerroster, prognos)
             for kod, o in register.items()}
    ordning = {"riket": 0, "lan": 1, "kommun": 2}
    index = {
        "standard": STANDARD_OMRADE,
        "senastUppdaterad": filer[RIKET]["senastUppdaterad"],
        "omraden": [
            {"kod": o["kod"], "namn": o["namn"], "typ": o["typ"], "lan": o["lan"],
             "slug": o["slug"]}
            for o in sorted(register.values(),
                            key=lambda o: (ordning[o["typ"]], o["namn"]))
        ],
    }
    return filer, index


def las_indata() -> tuple:
    csvs = {}
    for f in sorted(IN_MAPP.glob("mottagna_*.csv")):
        ar = int(f.stem.split("_")[1])
        csvs[ar] = tolka_csv(f.read_bytes())
    if not csvs:
        raise SystemExit("Inga datafiler i data/fortidsroster/")
    hamtad = lasa_json(IN_MAPP / "hamtad.json")
    rb_fil = IN_MAPP / "rostberattigade.json"
    anger_fil = IN_MAPP / "angerroster.json"
    prognos_fil = IN_MAPP / "prognos.json"
    return (csvs, hamtad,
            lasa_json(rb_fil) if rb_fil.exists() else None,
            lasa_json(anger_fil) if anger_fil.exists() else None,
            lasa_json(prognos_fil) if prognos_fil.exists() else None)


def main() -> None:
    filer, index = bygg(*las_indata())
    UT_MAPP.mkdir(parents=True, exist_ok=True)
    skrivna = set()
    for kod, inneh in filer.items():
        (UT_MAPP / f"{kod}.json").write_text(
            json.dumps(inneh, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        skrivna.add(f"{kod}.json")
    (UT_MAPP / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    skrivna.add("index.json")
    for gammal in UT_MAPP.glob("*.json"):
        if gammal.name not in skrivna:
            gammal.unlink()
            print(f"Tog bort {gammal.relative_to(ROT)}")
    r = filer[RIKET]["val"][str(filer[RIKET]["aktuellt"])]
    s = filer[STANDARD_OMRADE]["val"][str(filer[STANDARD_OMRADE]["aktuellt"])]
    print(f"Skrev {len(skrivna)} filer i {UT_MAPP.relative_to(ROT)}/: "
          f"riket {r['total']} och {s['omrade']} {s['total']} förtidsröster "
          f"{r['ar']}, {len(r['dagar'])} dagar")


if __name__ == "__main__":
    main()
