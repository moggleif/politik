"""Bygger docs/data-efter-valet.json: för varje val 2010–2026 och varje parti som
suttit i fullmäktige, partiets lista i nummerordning med vad varje plats blev
(fullmäktigeledamot, kommunstyrelsen, kommunstyrelsens arbetsutskott,
ordförande och vice ordförande i en nämnd).

Allt kommer ur data/ (ingenting hämtas här):
  data/kandidater/<år>.json     alla platser på partiets lista (plats, ålder, kön,
                                uppgift; namn för 2022 och 2026)
  data/valda/<år>.json          vilka listplatser som blev mandat i fullmäktige
  data/valda/ersattare_<år>.json  ersättarna i fullmäktige med listplats (bara 2022 och
                                2026; Valmyndigheten har inga ersättarfiler för äldre val)
  data/uppdrag/narvaro.json     datum för första protokollet med text per organ (visas
                                för perioder där uppdragen kommer ur närvarolistor)
  data/personer/<parti>.json    namn på platserna 2010–2018 (matchningen, med
                                säkerhetsgrad) och 2022/2026
  data/valdes_till/<år>.json    uppdrag per person (ur fullmäktiges beslut eller,
                                där beslut saknas, närvarolistor)
  data/styre.json               vilka partier som styrde (för sorteringen)

Raderna är listans platser i nummerordning. Per rad:
  vald          platsen blev ett mandat i fullmäktige
  kfErsattare   ersättarordningen i fullmäktige (1 = första ersättare) eller null;
                null betyder "inte ersättare" 2022/2026 och "okänt" för äldre val
  ort           orten ur Valmyndighetens uppgiftsrad (2014, 2018, 2026); null där
                Valmyndigheten inte angav ort (2010, 2022)
  ks, ksau      "ledamot" (även ordförande och vice), "ersättare" eller null.
                I perioder med närvarolistor betyder "ersättare" att personen
                tjänstgjorde som ersättare vid något av mötena
  ordforande    [{organ, senare}] – organ där personen var ordförande
  vice          [{organ, ordning, senare}] – organ där personen var vice
                ordförande (ordning "1:e", "2:e" eller "")
  senare        uppdraget syntes inte vid organets första möte (byte under
                perioden; bara i perioder där uppgifterna kommer ur närvarolistor)
  namnSakerhet  hur namnet är framtaget när Valmyndigheten gallrat det: "bestämd",
                "stark", "möjlig" (annars null)
Namn som saknas är null, aldrig ett tomt namn: "tomt är inte noll".
Uppdrag för personer vars plats på listan inte är känd ligger i `utanPlats`.

Per val finns `protokollDatum` {KS, KSAU}: datumet för det första protokollet
med text som närvarolistan kommer ur (bara perioder utan valbeslut), så att
läsaren ser hur långt in i perioden ögonblicksbilden är tagen.

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


def ort_ur(k: dict, ar: int):
    """Orten ur kandidatraden. 2018 har ett eget fält; 2014 ("yrke, ort") och 2026
    ("ålder, yrke, ort") har den sist i uppgiftsraden. 2010 saknar uppgift och 2022
    har bara yrke, så där blir det None."""
    if k.get("ort"):
        return k["ort"]
    delar = [d.strip() for d in (k.get("uppgift") or "").split(",")]
    if ar == 2014 and len(delar) >= 2:
        return delar[-1] or None
    if ar == 2026 and len(delar) >= 3:
        return delar[-1] or None
    return None


def protokolldatum(period: str) -> dict:
    """{'KS': datum, 'KSAU': datum} för första protokollet med text i perioden, ur narvaro.json."""
    d = las("uppdrag/narvaro.json")
    ut = {}
    for p in d["poster"]:
        if p["period"] == period and p["slug"] in ("ks", "ks-au"):
            ut["KS" if p["slug"] == "ks" else "KSAU"] = p.get("datum")
    return ut


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
    """En rad per organ. Står samma organ både med ordning ("1:e") och utan – närvarolistor
    skriver titeln olika vid olika möten – slås raderna ihop: ordningen behålls, och `senare`
    är sant bara om ingen av raderna kommer från organets första möte."""
    per = {}
    for r in rader:
        g = per.get(r["organ"])
        if g is None:
            per[r["organ"]] = dict(r)
            continue
        if not g.get("ordning") and r.get("ordning"):
            g["ordning"] = r["ordning"]
        g["senare"] = g["senare"] and r["senare"]   # syntes vid första mötet i någon av raderna
    return list(per.values())


def bygg_val(ar: int, personer: dict, styre: dict) -> dict:
    kand = las(f"kandidater/{ar}.json")
    valda = las(f"valda/{ar}.json")["ledamoter"]
    vald_set = {(r["parti"], r["listplats"]) for r in valda}
    mandat = {}
    for r in valda:
        mandat[r["parti"]] = mandat.get(r["parti"], 0) + 1
    vt = las(f"valdes_till/{ar}.json") if (DATA / "valdes_till" / f"{ar}.json").exists() else None
    ers_fil = DATA / "valda" / f"ersattare_{ar}.json"
    ers = las(f"valda/ersattare_{ar}.json") if ers_fil.exists() else None
    ers_plats = {(e["parti"], e["listplats"]): e["ordning"] for e in (ers["ersattare"] if ers else [])}
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
                   "ort": ort_ur(k, ar), "vald": (kort, plats) in vald_set,
                   "kfErsattare": ers_plats.get((kort, plats))}
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
                       "alder": v["alder"], "kon": v["kon"], "uppgift": None, "ort": None, "vald": True,
                       "kfErsattare": None, "platsSaknasPaLista": True}
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
            "uppdragKalla": (vt["kalla"] if vt else None),
            "protokollDatum": (protokolldatum(period) if UPPDRAG_STATUS[ar] == "partiell" else None),
            "ersattareKalla": ({"url": ers["kalla"], "uppgiftPer": ers["uppgift_per"]} if ers else None),
            "partier": partier}


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
