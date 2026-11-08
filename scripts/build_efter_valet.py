"""Bygger docs/data-efter-valet.json: för varje val 2010–2026 och varje parti som
suttit i fullmäktige, partiets lista i nummerordning med vad varje plats blev
(fullmäktigeledamot, kommunstyrelsen, kommunstyrelsens arbetsutskott,
ordförande och vice ordförande i en nämnd).

Allt kommer ur data/ (ingenting hämtas här):
  data/kandidater/<år>.json     alla platser på partiets lista (plats, ålder, kön,
                                uppgift; namn för 2022 och 2026)
  data/valda/<år>.json          vilka listplatser som blev mandat i fullmäktige
  data/personer/<parti>.json    namn på platserna 2010–2018 (matchningen, med
                                säkerhetsgrad) och 2022/2026
  data/valdes_till/<år>.json    uppdrag per person (ur fullmäktiges beslut eller,
                                där beslut saknas, närvarolistor)
  data/styre.json               vilka partier som styrde (för sorteringen)

Raderna är listans platser i nummerordning. Per rad:
  vald          platsen blev ett mandat i fullmäktige
  ks, ksau      "ledamot" (även ordförande och vice), "ersättare" eller null
  ordforande    [{organ, senare}] – organ där personen var ordförande
  vice          [{organ, ordning, senare}] – organ där personen var vice
                ordförande (ordning "1:e", "2:e" eller "")
  senare        uppdraget syntes inte vid organets första möte (byte under
                perioden; bara i perioder där uppgifterna kommer ur närvarolistor)
  namnSakerhet  hur namnet är framtaget när Valmyndigheten gallrat det: "bestämd",
                "stark", "möjlig" (annars null)
Namn som saknas är null, aldrig ett tomt namn: "tomt är inte noll".
Uppdrag för personer vars plats på listan inte är känd ligger i `utanPlats`.

Partierna sorteras i sidan: styrande först (data/styre.json), därefter efter
antal mandat.

Körs: python3 scripts/build_efter_valet.py
"""

import json
from datetime import date
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent
DATA = ROT / "data"
UT = ROT / "docs" / "data-efter-valet.json"

VAL = [2026, 2022, 2018, 2014, 2010]
PERIOD = {2010: "2011–2014", 2014: "2015–2018", 2018: "2019–2022", 2022: "2023–2026", 2026: "2027–2030"}
UPPDRAG_STATUS = {2022: "komplett", 2014: "komplett", 2018: "partiell", 2010: "partiell", 2026: "ejBeslutat"}
PARTIER = {
    "M": "Moderaterna", "S": "Socialdemokraterna", "C": "Centerpartiet", "L": "Liberalerna",
    "KD": "Kristdemokraterna", "MP": "Miljöpartiet", "SD": "Sverigedemokraterna",
    "V": "Vänsterpartiet", "KB": "Kungsbackaborna",
}
PARTI_AB = {
    "Moderaterna": "M", "Moderata Samlingspartiet": "M", "Arbetarepartiet-Socialdemokraterna": "S",
    "Centerpartiet": "C", "Liberalerna (tidigare Folkpartiet)": "L", "Folkpartiet liberalerna": "L",
    "Kristdemokraterna": "KD", "Miljöpartiet de gröna": "MP", "Sverigedemokraterna": "SD",
    "Vänsterpartiet": "V", "Kungsbackaborna": "KB",
}
KS, KSAU = "Kommunstyrelsen", "Kommunstyrelsens arbetsutskott"
ORDNING = {"1:e vice ordförande": "1:e", "2:e vice ordförande": "2:e", "vice ordförande": ""}


def las(sokvag: str):
    return json.loads((DATA / sokvag).read_text(encoding="utf-8"))


def kortnamn_organ(organ: str) -> str:
    """'Nämnden för Teknik' -> 'Teknik'; övriga namn som de står."""
    for prefix in ("Nämnden för ", "nämnden för "):
        if organ.startswith(prefix):
            return organ[len(prefix):]
    return organ


def personer_per_plats() -> dict:
    """{(parti, val, plats): (namn, säkerhet)} ur personfilerna."""
    ut = {}
    for f in sorted((DATA / "personer").glob("*.json")):
        if f.name.startswith("_"):
            continue
        d = las(f"personer/{f.name}")
        for p in d["personer"]:
            for c in p["kandidaturer"]:
                sak = c.get("sakerhet") if c.get("kalla") != "Valmyndighetens kandidatlista" else None
                ut[(d["kortnamn"], c["val"], c["plats"])] = (p["namn"], sak)
    return ut


def sakerhetsord(s):
    """Normaliserar personfilernas säkerhetsgrad ('stark', 'möjlig', 'bestämd …') till tre värden."""
    if not s:
        return None
    s = s.lower()
    if s.startswith("bestämd"):
        return "bestämd"
    if s.startswith("trolig") or s.startswith("mycket trolig"):
        return "stark"
    if s.startswith("stark"):
        return "stark"
    if s.startswith("möjlig"):
        return "möjlig"
    return None


def uppdrag_rad(uppdrag: list) -> dict:
    ks = ksau = None
    ordf, vice = [], []
    for u in uppdrag:
        organ, roll = u["organ"], u["roll"]
        senare = u["kalla"].get("fran_forsta_motet") is False
        if organ in (KS, KSAU):
            niva = "ledamot" if roll != "ersättare" else "ersättare"
            if organ == KS:
                ks = "ledamot" if ks == "ledamot" or niva == "ledamot" else "ersättare"
            else:
                ksau = "ledamot" if ksau == "ledamot" or niva == "ledamot" else "ersättare"
        if roll == "ordförande":
            ordf.append({"organ": kortnamn_organ(organ), "senare": senare})
        elif roll in ORDNING:
            vice.append({"organ": kortnamn_organ(organ), "ordning": ORDNING[roll], "senare": senare})
    # samma organ två gånger (ordförande tidigt och senare) – behåll en rad per organ
    return {"ks": ks, "ksau": ksau, "ordforande": _unika(ordf), "vice": _unika(vice)}


def _unika(rader: list) -> list:
    sett, ut = set(), []
    for r in rader:
        k = (r["organ"], r.get("ordning", ""))
        if k not in sett:
            sett.add(k)
            ut.append(r)
    return ut


def bygg_val(ar: int, personer: dict, styre: dict) -> dict:
    kand = las(f"kandidater/{ar}.json")
    valda = las(f"valda/{ar}.json")["ledamoter"]
    vald_set = {(r["parti"], r["listplats"]) for r in valda}
    mandat = {}
    for r in valda:
        mandat[r["parti"]] = mandat.get(r["parti"], 0) + 1
    vt = las(f"valdes_till/{ar}.json") if (DATA / "valdes_till" / f"{ar}.json").exists() else None
    uppdrag_pl, utan_plats = {}, {}
    for p in (vt["personer"] if vt else []):
        if p["listplats"] is None:
            utan_plats.setdefault(p["parti"], []).append(p)
        else:
            uppdrag_pl[(p["parti"], p["listplats"])] = p
    period = PERIOD[ar]
    st = styre["perioder"].get(period)
    partier = []
    for p in kand["partier"]:
        kort = PARTI_AB.get(p["namn"])
        if kort not in PARTIER:
            continue
        rader = []
        for k in p["listor"][0]["kandidater"]:
            plats = k["plats"]
            namn, sak = personer.get((kort, ar, plats), (None, None))
            if ar >= 2022:                 # namnen står på Valmyndighetens lista
                namn, sak = k["namn"], None
            rad = {"plats": plats, "namn": namn, "namnSakerhet": sakerhetsord(sak),
                   "alder": k.get("alder"), "kon": k.get("kon"), "uppgift": k.get("uppgift"),
                   "vald": (kort, plats) in vald_set}
            if vt:
                rad.update(uppdrag_rad(uppdrag_pl[(kort, plats)]["uppdrag"]) if (kort, plats) in uppdrag_pl
                           else {"ks": None, "ksau": None, "ordforande": [], "vice": []})
            else:
                rad.update({"ks": None, "ksau": None, "ordforande": [], "vice": []})
            rader.append(rad)
        # Valda platser som saknas på den hämtade listan (SD 2010 plats 3: Valmyndighetens XML-fil
        # har bara två SD-platser) läggs till med ålder och kön ur mandatfilen.
        har = {r["plats"] for r in rader}
        for v in valda:
            if v["parti"] == kort and v["listplats"] not in har:
                namn, sak = personer.get((kort, ar, v["listplats"]), (None, None))
                rad = {"plats": v["listplats"], "namn": namn, "namnSakerhet": sakerhetsord(sak),
                       "alder": v["alder"], "kon": v["kon"], "uppgift": None, "vald": True, "platsSaknasPaLista": True}
                rad.update(uppdrag_rad(uppdrag_pl[(kort, v["listplats"])]["uppdrag"]) if (kort, v["listplats"]) in uppdrag_pl
                           else {"ks": None, "ksau": None, "ordforande": [], "vice": []})
                rader.append(rad)
        rader.sort(key=lambda r: r["plats"])
        post = {"kod": kort, "namn": PARTIER[kort], "mandat": mandat.get(kort, 0),
                "styrande": bool(st and kort in st["partier"]), "rader": rader}
        if kort in utan_plats:
            post["utanPlats"] = [{"namn": q["namn"], **uppdrag_rad(q["uppdrag"])} for q in utan_plats[kort]]
        partier.append(post)
    partier.sort(key=lambda q: (not q["styrande"], -q["mandat"], q["namn"]))
    return {"ar": ar, "mandatperiod": period, "uppdragStatus": UPPDRAG_STATUS[ar],
            "styre": ({"partier": st["partier"], "kalla": st["kalla"], "url": st["url"], "styrkt": st["styrkt"]}
                      if st else None),
            "uppdragKalla": (vt["kalla"] if vt else None), "partier": partier}


def main() -> None:
    personer = personer_per_plats()
    styre = las("styre.json")
    ut = {"byggd": date.today().isoformat(), "val": [bygg_val(ar, personer, styre) for ar in VAL]}
    UT.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for v in ut["val"]:
        n = sum(len(p["rader"]) for p in v["partier"])
        namn = sum(1 for p in v["partier"] for r in p["rader"] if r["namn"])
        print(f"{v['ar']}: {len(v['partier'])} partier, {n} platser, {namn} med namn, "
              f"{sum(1 for p in v['partier'] for r in p['rader'] if r['vald'])} valda; "
              f"ordning {[p['kod'] for p in v['partier']]}")


if __name__ == "__main__":
    main()
