#!/usr/bin/env python3
"""Räknar ut var Kungsbackas nya valdistrikt 2022 kom ifrån, ur
Valmyndighetens egna valdistriktskartor.

Bakgrunden är ett hål i den officiella mappningen. För övergångarna
2010 -> 2014, 2014 -> 2018 och 2022 -> 2026 talar Valmyndigheten om
vilket tidigare distrikt varje distrikt kommer ur, och 2014 -> 2018 till
och med med vikt (Tölö Landsbygd delas 47,1/52,9 mellan Tölö och
Björkris). Men i jamforelser-2018-och-2022-…xlsx står ursprungskolumnerna
tomma på exakt de rader där de skulle behövas: de elva distrikt som
ritades om, däribland de fyra som är helt nya. Filen svarar på frågan
"går det att jämföra?", inte på frågan "var kommer distriktet ifrån?".

Kartorna svarar på den andra frågan. Valmyndigheten publicerar
valdistriktens gränser för både 2018 och 2022, båda i SWEREF99 TM, så de
kan läggas ovanpå varandra:

  2018  2018_valgeografi_valdistrikt.zip   ESRI-shapefil, hela riket
  2022  valdistrikt-hallands-lan.zip       GeoJSON, ett län

Skriptet rastrerar varje nytt distrikt i punkter och slår upp vilket
2018-distrikt varje punkt låg i. Andelen punkter är andelen yta.

**Ytandel är inte väljarandel.** Punkterna vet ingenting om var
människor bor, så ett stort skogsområde väger lika tungt som ett
villakvarter. Talen används därför bara till att väga ihop en
*indikator* för de val distriktet inte fanns, aldrig till att påstå ett
valresultat, och sidan ritar indikatorn med streckad linje.

Metoden kontrollerar sig själv: de distrikt Valmyndigheten *har*
bedömt som jämförbara mellan 2018 och 2022 ska hamna på sig själva.
Gör de inte det stämmer inte kartorna, rastreringen eller koderna, och
skriptet avbryter hellre än att skriva en fil som ser rimlig ut.

Skriver:  data/kommunval/harkomst.json

Körs:  python3 scripts/hamta_harkomst.py
Tar en dryg minut: rastreringen är ren python, och 2018 års shapefil är
31 MB som läses i sin helhet för att komma åt Kungsbackas 43 distrikt.
"""

import json
import struct
import zipfile
from datetime import date
from io import BytesIO
from pathlib import Path

from val import KOMMUN, hamta

ROT = Path(__file__).resolve().parent.parent
UT_MAPP = ROT / "data" / "kommunval"
UT = UT_MAPP / "harkomst.json"

OVERGANG = "2018-2022"

KARTA_2018 = {
    "url": "https://historik.val.se/val/val2018/statistik/"
           "2018_valgeografi_valdistrikt.zip",
    "kalla": "Valmyndigheten, Valgeografi 2018: valdistrikt",
    "sidaUrl": "https://historik.val.se/val/val2018/statistik/index.html",
}
KARTA_2022 = {
    "url": "https://www.val.se/download/18.162047b519a91d053311a218/"
           "1662820377293/valdistrikt-hallands-lan.zip",
    "kalla": "Valmyndigheten, Valdistrikt 2022: Hallands län",
    "sidaUrl": "https://www.val.se/valresultat-och-statistik/statistik-och-data/"
               "radata-fran-val-2002-2022.html",
}

# Ungefär så många rutor läggs över distriktets omslutande rektangel.
# Talet är en avvägning: 40 000 rutor ger tiondelar som inte flyttar sig
# när det körs om, och en körtid på drygt en minut för hela kommunen.
RUTOR = 40000

# Rutor mindre än så är meningslösa – kartornas egna gränser är inte
# ritade med den noggrannheten.
MINSTA_RUTA_M = 5.0

# Andelar under så här mycket av det nya distriktet är kantbrus: två
# kartor ritade vid olika tillfällen följs inte åt på metern, och en
# gräns som glider några meter ger en handfull punkter i grannen.
MINSTA_ANDEL = 1.0

# Ett distrikt som Valmyndigheten anser jämförbart ska hamna på sig
# självt. Lägsta egenträffen bland Kungsbackas jämförbara distrikt är
# 92,6 % (Frillesås Kust), så 85 % är en gräns som fångar ett verkligt
# fel utan att larma för kartornas egen ritnoggrannhet.
KRAV_EGENTRAFF = 85.0


# ---------- Shapefil ----------
# Formatet är dokumenterat och enkelt, och bara polygoner behövs. Ett
# eget beroende (pyshp, geopandas) för två filer vore en tyngre sak att
# underhålla än de sextio raderna nedan.

def las_dbf(raa: bytes) -> list:
    """Attributtabellen som en lista dictar. Filen är UTF-8 (.cpg)."""
    antal, huvudlangd, postlangd = struct.unpack("<IHH", raa[4:12])
    falt, pos = [], 32
    while raa[pos] != 0x0D:
        namn = raa[pos:pos + 11].split(b"\0")[0].decode("utf-8")
        falt.append((namn, raa[pos + 16]))
        pos += 32
    poster = []
    for i in range(antal):
        rad = raa[huvudlangd + i * postlangd:][:postlangd]
        post, off = {}, 1
        for namn, langd in falt:
            post[namn] = rad[off:off + langd].decode("utf-8").strip()
            off += langd
        poster.append(post)
    return poster


def las_shp(raa: bytes) -> list:
    """En lista ringar per form: [[(x, y), ...], ...]. Andra former än
    polygoner (typ 5) ger en tom lista och hoppas över."""
    former, pos = [], 100
    while pos < len(raa):
        _, langd = struct.unpack(">II", raa[pos:pos + 8])
        innehall = raa[pos + 8:pos + 8 + langd * 2]
        pos += 8 + langd * 2
        if struct.unpack("<I", innehall[0:4])[0] != 5:
            former.append([])
            continue
        delar, punkter = struct.unpack("<II", innehall[36:44])
        index = list(struct.unpack(f"<{delar}I", innehall[44:44 + 4 * delar]))
        p0 = 44 + 4 * delar
        koord = struct.unpack(f"<{punkter * 2}d",
                              innehall[p0:p0 + 16 * punkter])
        index.append(punkter)
        former.append([[(koord[2 * k], koord[2 * k + 1])
                        for k in range(index[d], index[d + 1])]
                       for d in range(delar)])
    return former


# ---------- Geometri ----------

def omslutande(ringar: list) -> tuple:
    xs = [p[0] for r in ringar for p in r]
    ys = [p[1] for r in ringar for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def yta(ringar: list) -> float:
    """Nettoytan: hål räknas bort, eftersom de ritas åt andra hållet."""
    summa = 0.0
    for ring in ringar:
        for i in range(len(ring)):
            x1, y1 = ring[i]
            x2, y2 = ring[(i + 1) % len(ring)]
            summa += x1 * y2 - x2 * y1
    return abs(summa) / 2


def inuti(x: float, y: float, ringar: list) -> bool:
    """Jämnt-udda över *alla* ringar, så att en punkt i ett hål hamnar
    utanför: den korsar då både ytterkanten och hålets kant."""
    inne = False
    for ring in ringar:
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]
            xj, yj = ring[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                inne = not inne
            j = i
    return inne


def rastrera(nytt: dict, gamla: list) -> tuple:
    """Lägger ett rutnät över det nya distriktet och räknar var punkterna
    låg förut. Ger (antal punkter i distriktet, {gammal kod: antal},
    rutans sida i meter)."""
    x0, y0, x1, y1 = nytt["bbox"]
    steg = max(((x1 - x0) * (y1 - y0) / RUTOR) ** 0.5, MINSTA_RUTA_M)
    kandidater = [g for g in gamla
                  if not (g["bbox"][2] < x0 or g["bbox"][0] > x1
                          or g["bbox"][3] < y0 or g["bbox"][1] > y1)]
    traff, inne = {}, 0
    y = y0 + steg / 2
    while y < y1:
        x = x0 + steg / 2
        while x < x1:
            if inuti(x, y, nytt["ringar"]):
                inne += 1
                for g in kandidater:
                    b = g["bbox"]
                    if (b[0] <= x <= b[2] and b[1] <= y <= b[3]
                            and inuti(x, y, g["ringar"])):
                        traff[g["kod"]] = traff.get(g["kod"], 0) + 1
                        break
            x += steg
        y += steg
    return inne, traff, steg


# ---------- Kartorna ----------

def distrikt_2018() -> list:
    z = zipfile.ZipFile(BytesIO(hamta(KARTA_2018["url"])))
    poster = las_dbf(z.read("alla_valdistrikt.dbf"))
    former = las_shp(z.read("alla_valdistrikt.shp"))
    ut = []
    for post, ringar in zip(poster, former):
        if post["KOM"] != KOMMUN or not ringar:
            continue
        ut.append({"kod": post["VD"], "namn": post["VD_NAMN"],
                   "ringar": ringar, "bbox": omslutande(ringar),
                   "yta": yta(ringar)})
    return ut


def distrikt_2022() -> list:
    z = zipfile.ZipFile(BytesIO(hamta(KARTA_2022["url"])))
    karta = json.loads(z.read(z.namelist()[0]))
    ut = []
    for f in karta["features"]:
        kod = f["properties"]["Lkfv"]
        if not kod.startswith(KOMMUN):
            continue
        g = f["geometry"]
        delar = ([g["coordinates"]] if g["type"] == "Polygon"
                 else g["coordinates"])
        ringar = [[(p[0], p[1]) for p in ring] for poly in delar for ring in poly]
        ut.append({"kod": kod, "namn": f["properties"]["Vdnamn"].strip(),
                   "ringar": ringar, "bbox": omslutande(ringar)})
    return ut


# ---------- Uträkningen ----------

def rakna(nya: list, gamla: list) -> dict:
    """{ny kod: {"namn": …, "fran": [{"kod", "namn", "andelAvNytt",
    "andelAvGammalt"}]}} för alla distrikt i den nya indelningen."""
    namn_2018 = {g["kod"]: g["namn"] for g in gamla}
    yta_2018 = {g["kod"]: g["yta"] for g in gamla}
    ut = {}
    for nytt in sorted(nya, key=lambda d: d["kod"]):
        inne, traff, steg = rastrera(nytt, gamla)
        if not inne:
            raise SystemExit(f"{nytt['kod']} {nytt['namn']}: ingen punkt "
                             "hamnade i distriktet – rastreringen fungerar inte")
        behallna = {k: n for k, n in traff.items()
                    if 100.0 * n / inne >= MINSTA_ANDEL}
        summa = sum(behallna.values())
        fran = []
        for kod, antal in sorted(behallna.items(), key=lambda kv: -kv[1]):
            fran.append({
                "kod": kod,
                "namn": namn_2018[kod],
                # Andelen av det *nya* distriktet, normaliserad över de
                # andelar som behållits, så att de summerar till 100.
                "andelAvNytt": round(100.0 * antal / summa, 1),
                # Andelen av det *gamla* distriktet: rutornas yta delad
                # med det gamla distriktets yta. Det är den vikt som
                # röstetal ska skalas med.
                "andelAvGammalt": round(
                    100.0 * antal * steg * steg / yta_2018[kod], 1),
            })
        ut[nytt["kod"]] = {"namn": nytt["namn"], "fran": fran}
    return ut


def kontrollera(harkomst: dict, jamforbarhet: dict) -> dict:
    """Distrikt som Valmyndigheten anser jämförbara ska hamna på sig
    själva. Annars är det något fel på kartorna eller på uträkningen, och
    då ska ingen fil skrivas."""
    officiellt = jamforbarhet.get("overgangar", {}).get(OVERGANG, {})
    egentraffar = []
    for kod, post in harkomst.items():
        if not (officiellt.get(kod) or {}).get("jamforbart"):
            continue
        egen = next((f["andelAvNytt"] for f in post["fran"] if f["kod"] == kod), 0.0)
        egentraffar.append((egen, kod, post["namn"]))
        if egen < KRAV_EGENTRAFF:
            raise SystemExit(
                f"{kod} {post['namn']} är jämförbart enligt Valmyndigheten, "
                f"men bara {egen} % av ytan låg i samma distrikt 2018. "
                "Kartorna, koderna eller rastreringen stämmer inte.")
    if not egentraffar:
        raise SystemExit("Inget jämförbart distrikt att kontrollera metoden "
                         "mot – kör hamta_kommunval.py först.")
    egentraffar.sort()
    return {
        "jamforbaraDistrikt": len(egentraffar),
        "lagstaEgentraff": egentraffar[0][0],
        "lagstaEgentraffDistrikt": egentraffar[0][2],
        "kravEgentraff": KRAV_EGENTRAFF,
    }


def main() -> None:
    jamforbarhet = json.loads(
        (UT_MAPP / "jamforbarhet.json").read_text(encoding="utf-8"))

    print("Hämtar valdistriktskartorna …")
    gamla = distrikt_2018()
    nya = distrikt_2022()
    print(f"  2018: {len(gamla)} distrikt, 2022: {len(nya)} distrikt")

    print("Rastrerar …")
    alla = rakna(nya, gamla)
    kontroll = kontrollera(alla, jamforbarhet)
    print(f"  metoden kontrollerad mot {kontroll['jamforbaraDistrikt']} "
          f"jämförbara distrikt, lägsta egenträff "
          f"{kontroll['lagstaEgentraff']} % "
          f"({kontroll['lagstaEgentraffDistrikt']})")

    # Bara de distrikt Valmyndigheten inte anger något ursprung för
    # skrivs. Där de själva svarar är det deras svar som gäller, och en
    # egen uträkning bredvid hade bara varit ännu ett tal att välja mellan.
    officiellt = jamforbarhet.get("overgangar", {}).get(OVERGANG, {})
    utan_ursprung = {kod: post for kod, post in alla.items()
                     if not (officiellt.get(kod) or {}).get("foregaende")}

    data = {
        "overgang": OVERGANG,
        "kalla": {
            "kalla": f"{KARTA_2018['kalla']}; {KARTA_2022['kalla']}",
            "kallaUrl": KARTA_2018["url"],
            "kallaUrl2022": KARTA_2022["url"],
            "sidaUrl": KARTA_2022["sidaUrl"],
        },
        "metod": (
            "Andelen av det nya valdistriktets yta som 2018 låg i ett visst "
            "valdistrikt, uträknad genom att distriktet rastreras i punkter "
            "ur Valmyndighetens egna valdistriktskartor (båda i SWEREF99 TM). "
            "Ytandel är inte väljarandel: punkterna vet inte var människor "
            "bor. Talen används bara för att väga ihop en indikator för de "
            "val distriktet inte fanns."
        ),
        "kontroll": kontroll,
        "minstaAndel": MINSTA_ANDEL,
        "distrikt": utan_ursprung,
        "hamtad": date.today().isoformat(),
    }
    UT.parent.mkdir(parents=True, exist_ok=True)
    UT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                  encoding="utf-8")
    print(f"Skrev {UT.relative_to(ROT)}: {len(utan_ursprung)} distrikt utan "
          "officiellt ursprung")
    for kod, post in sorted(utan_ursprung.items()):
        print(f"  {post['namn']}: " + ", ".join(
            f"{f['namn']} {f['andelAvNytt']} %" for f in post["fran"]))


if __name__ == "__main__":
    main()
