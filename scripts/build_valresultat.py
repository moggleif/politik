#!/usr/bin/env python3
"""Bygger docs/data-<valets mapp>.json: ett av de tre valen per
valdistrikt i Kungsbacka 2010–2026, parti för parti.

Samma valdistrikt röstar i tre val samma dag, och sidan visar ett i taget:
kommunfullmäktige, regionfullmäktige eller riksdagen. De tre datafilerna
är byggda likadant och av samma kod; det enda som skiljer dem är vilken
mapp rösterna lästs ur och vad valet heter.

Läser:
  data/<valets mapp>/<år>.json        (från hamta_valresultat.py,
                                       Kungsbackas rader ur
                                       Valmyndighetens filer)
  data/valdistrikt/jamforbarhet.json  (Valmyndighetens egen bedömning av
                                       vilka valdistrikt som går att
                                       jämföra mellan två val, med vilket
                                       distrikt varje distrikt kommer ur)
  data/valdistrikt/harkomst.json      (frivillig; från hamta_harkomst.py,
                                       ursprunget uträknat ur kartorna för
                                       de distrikt Valmyndigheten inte
                                       anger något ursprung för)

De två sista ligger under data/valdistrikt/ och inte i valens mappar: de
handlar om hur distrikten ritats om, vilket är detsamma i alla tre valen.

Skriver:
  docs/data-kommunval.json, docs/data-regionval.json,
  docs/data-riksdagsval.json

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

För de åren räknas i stället en **härkomst** fram: siffrorna från det
distrikt området låg i då. Kolla Norra fanns inte 2010, men marken
gjorde det, och den låg i Västra Villastaden/Kolla. Kedjan följs val för
val bakåt – Kolla Norra kom ur Kolla, som kom ur Västra Villastaden/
Kolla – och vikterna multipliceras på vägen. Rösterna skalas med hur
stor del av det gamla distriktet som blev det nya, så att andelen blir
det gamla distriktets andel.

Härkomsten ligger i ett eget fält och aldrig i `roster`: den är en
indikator för området, inte ett valresultat för distriktet, och sidan
ritar den med streckad linje. Tabellen och förändringstalen rör den
inte.

Körs:  python3 scripts/build_valresultat.py               (alla tre valen)
       python3 scripts/build_valresultat.py --val region  (ett val)
"""

import argparse
import json
from pathlib import Path

from hamta_valresultat import VALEN
from val import KOMMUN, OVRIGA, partinamn, slug

ROT = Path(__file__).resolve().parent.parent
DELAT = ROT / "data" / "valdistrikt"

AR = [2010, 2014, 2018, 2022, 2026]
OVERGANGAR = [f"{a}-{b}" for a, b in zip(AR, AR[1:])]

# Fälten som följer med per distrikt och år, utöver partirösterna.
SUMMOR = ["giltiga", "rostande", "rostberattigade"]

# Ett parti redovisas för sig om det någon gång nått hit, räknat på de
# giltiga rösterna i hela kommunen. Övriga läggs i ÖVR – samma restpost
# som källorna själva använder – så att summan av partierna fortfarande
# blir antalet giltiga röster.
#
# Nio partier klarar tröskeln i Kungsbacka: de åtta riksdagspartierna och
# Kungsbackaborna. De nitton som inte gör det fick tillsammans under en
# procent varje val. Utan tröskeln blir kryssrutorna på sidan en lista
# med tjugonio namn, varav tjugo har en handfull röster.
#
# Tröskeln mäts på kommunen och inte på enskilda valdistrikt. Ett enda
# parti under tröskeln har någon gång gått över den i ett distrikt: Din
# Förening fick 4,3 % i Fjärås Södra 2010. Alla partiernas röster ligger
# kvar oavkortat i data/kommunval/<år>.json för den som vill räkna på dem.
TROSKEL_PROCENT = 3.0


def per_kod(kalla: dict) -> dict:
    return {d["kod"]: d for d in kalla["distrikt"]}


def summera_kommunen(distrikt_per_ar: dict, ar: list) -> dict:
    """Kommunen som helhet: alla distrikt, uppsamlingsdistriktet inräknat."""
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
    return totalt


def stora_partier(totalt: dict, ar: list) -> set:
    """Partierna som någon gång nått TROSKEL_PROCENT i kommunen."""
    stora = set()
    for p, per_ar in totalt["roster"].items():
        if p == OVRIGA:
            continue
        for a in ar:
            giltiga = totalt["giltiga"][str(a)]
            if giltiga and 100 * per_ar[str(a)] / giltiga > TROSKEL_PROCENT:
                stora.add(p)
                break
    return stora


def vik_ihop(roster: dict, stora: set) -> dict:
    """Partier under tröskeln läggs i ÖVR. Summan är oförändrad."""
    ut, ovriga = {}, 0
    for p, n in roster.items():
        if p in stora:
            ut[p] = ut.get(p, 0) + n
        else:
            ovriga += n
    if ovriga or OVRIGA in roster:
        ut[OVRIGA] = ovriga
    return ut


def ursprung(kod: str, overgang: str, jamforbarhet: dict,
             harkomst: dict) -> dict:
    """Vilka distrikt ett distrikt kommer ur i den tidigare indelningen,
    som {tidigare kod: andel av det tidigare distriktet, 0–1}.

    Valmyndighetens egen uppgift går först. Där den saknas – och den
    saknas för de distrikt som ritades om mellan 2018 och 2022 – används
    den uträknade härkomsten ur kartorna. Finns ingendera vet vi inte,
    och då ritas ingen indikator.

    Vikten är andelen av det *gamla* distriktet, för det är den som
    röstetal ska skalas med: Björkris fick 52,9 % av Tölö Landsbygds
    yta, och indikatorn för Björkris 2014 är 52,9 % av Tölö Landsbygds
    röster. Andelen blir därmed Tölö Landsbygds andel, vilket är
    poängen: partiets ställning i området.

    Saknas andelen i källan (2018 -> 2022 och 2022 -> 2026 anger bara
    koder) betyder posten att hela det gamla distriktet gick in i det
    nya, alltså 100 %."""
    post = (jamforbarhet.get("overgangar", {}).get(overgang, {})).get(kod)
    if post and post.get("foregaende"):
        return {f["kod"]: (f["andel"] if f["andel"] is not None else 100.0) / 100.0
                for f in post["foregaende"]}
    if harkomst.get("overgang") == overgang:
        post = harkomst.get("distrikt", {}).get(kod)
        if post:
            return {f["kod"]: f["andelAvGammalt"] / 100.0 for f in post["fran"]}
    return {}


def bygg(kallor: dict, jamforbarhet: dict, harkomst: dict = None,
         valnyckel: str = "kommun") -> dict:
    """kallor: {år: innehållet i data/<valets mapp>/<år>.json}."""
    harkomst = harkomst or {}
    val = VALEN[valnyckel]
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

    # Tröskeln avgörs på kommunens siffror, så de räknas först. Därefter
    # viks de små partierna ihop till ÖVR överallt – både i distrikten och
    # i kommunsumman – så att de två alltid säger samma sak.
    stora = stora_partier(summera_kommunen(distrikt_per_ar, ar), ar)
    for a in ar:
        for d in distrikt_per_ar[a].values():
            d["roster"] = vik_ihop(d["roster"], stora)

    def harkomst_for(kod: str) -> dict:
        """Indikator för de val distriktet inte fanns: siffrorna från de
        distrikt området låg i då, skalade med hur stor del av dem som
        blev det här distriktet.

        Kedjan följs ett val i taget bakåt från det första val distriktet
        finns, och vikterna multipliceras. Tappas spåret – ingen källa
        anger något ursprung – slutar kedjan där, och de valen får ingen
        indikator."""
        finns = [a for a in ar if kod in distrikt_per_ar[a]]
        if not finns:
            return {}
        vikter = {kod: 1.0}
        ut = {}
        for i in range(ar.index(finns[0]), 0, -1):
            senare, tidigare = ar[i], ar[i - 1]
            nya = {}
            for k, vikt in vikter.items():
                for fore, andel in ursprung(k, f"{tidigare}-{senare}",
                                            jamforbarhet, harkomst).items():
                    nya[fore] = nya.get(fore, 0.0) + vikt * andel
            # Bara distrikt som verkligen har siffror det året; ett
            # ursprung utan data för oss ingenstans.
            nya = {k: v for k, v in nya.items() if k in distrikt_per_ar[tidigare]}
            if not nya:
                break
            vikter = nya
            roster = {}
            for k, vikt in vikter.items():
                for p, n in distrikt_per_ar[tidigare][k]["roster"].items():
                    roster[p] = roster.get(p, 0.0) + vikt * n
            giltiga = sum(vikt * distrikt_per_ar[tidigare][k]["giltiga"]
                          for k, vikt in vikter.items())
            if not giltiga:
                break
            # Namnen som indikatorn vilar på, störst först, med hur stor
            # del av indikatorn var och en står för. Det är den andelen
            # en läsare behöver för att veta hur mycket ett namn betyder,
            # inte hur stor del av det gamla distriktet som togs i
            # anspråk.
            delar = sorted(
                ((k, distrikt_per_ar[tidigare][k]["namn"],
                  vikt * distrikt_per_ar[tidigare][k]["giltiga"])
                 for k, vikt in vikter.items()),
                key=lambda knv: -knv[2])
            ut[str(tidigare)] = {
                "roster": {p: round(n) for p, n in roster.items()},
                "giltiga": round(giltiga),
                # Koden följer med så att sidan kan se när ett markerat
                # distrikt också är ursprung för ett annat markerat
                # distrikt; då ligger samma röster i summan två gånger.
                "fran": [{"kod": k, "namn": namn,
                          "andel": round(100 * n / giltiga, 1)}
                         for k, namn, n in delar],
            }
        return ut

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
        harkomst_rad = harkomst_for(kod)
        if harkomst_rad:
            rad["harkomst"] = harkomst_rad
        return rad

    rader = [serie(k) for k in aktuella]

    totalt = summera_kommunen(distrikt_per_ar, ar)

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
        # Valets namn i fyra längder, för sidans fyra slags text:
        # nyckeln i adressraden, etiketten i väljaren, rubrikens "Val
        # till …" och den löpande textens "i kommunvalet 2026".
        "valNyckel": valnyckel,
        "valEtikett": val["etikett"],
        "val": val["namn"],
        "valKort": val["kort"],
        "valenKort": val["valen"],
        "ar": ar,
        "overgangar": overgangar,
        "rakningstillfalle": {str(a): kallor[a]["rakningstillfalle"]
                              for a in ar if kallor[a].get("rakningstillfalle")},
        "partier": partilista,
        "troskelProcent": TROSKEL_PROCENT,
        "distrikt": rader,
        "kommunTotalt": totalt,
        "nedlagda": nedlagda,
        "kalla": {str(a): {"kalla": kallor[a]["kalla"],
                           "kallaUrl": kallor[a]["kallaUrl"],
                           "sidaUrl": kallor[a]["sidaUrl"],
                           "hamtad": kallor[a]["hamtad"]} for a in ar},
        "kallaJamforbarhet": jamforbarhet.get("kalla", {}),
        "kallaHarkomst": ({"kalla": harkomst["kalla"]["kalla"],
                           "kallaUrl": harkomst["kalla"].get("sidaUrl"),
                           "metod": harkomst["metod"]}
                          if harkomst.get("kalla") else None),
        "senastUppdaterad": max(kallor[a]["hamtad"] for a in ar),
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--val", choices=sorted(VALEN),
                   help="bygg bara det här valet")
    args = p.parse_args()

    jamforbarhet = json.loads(
        (DELAT / "jamforbarhet.json").read_text(encoding="utf-8"))
    # Härkomsten är frivillig: utan den ritas inga indikatorer för de
    # distrikt Valmyndigheten inte anger något ursprung för, och resten
    # av sidan är sig lik.
    harkomstfil = DELAT / "harkomst.json"
    harkomst = (json.loads(harkomstfil.read_text(encoding="utf-8"))
                if harkomstfil.exists() else {})

    for valnyckel in ([args.val] if args.val else sorted(VALEN)):
        mapp = VALEN[valnyckel]["mapp"]
        in_mapp = ROT / "data" / mapp
        kallor = {}
        for a in AR:
            fil = in_mapp / f"{a}.json"
            if fil.exists():
                kallor[a] = json.loads(fil.read_text(encoding="utf-8"))
        if not kallor:
            raise SystemExit(f"Inga källfiler i data/{mapp}/ – kör "
                             f"scripts/hamta_valresultat.py först")
        data = bygg(kallor, jamforbarhet, harkomst, valnyckel)
        ut = ROT / "docs" / f"data-{mapp}.json"
        ut.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
        print(f"Skrev {ut.relative_to(ROT)}: {len(data['distrikt'])} "
              f"valdistrikt, {len(data['partier'])} partier, "
              f"{len(data['ar'])} val")
        print("  redovisade partier: "
              + ", ".join(p["kod"] for p in data["partier"]))
        for o in data["overgangar"]:
            ja = sum(1 for d in data["distrikt"] if d["jamforbart"][o])
            print(f"  {o}: {ja} av {len(data['distrikt'])} distrikt jämförbara")
        med = [d["namn"] for d in data["distrikt"] if d.get("harkomst")]
        if med:
            print("  indikator bakåt för: " + ", ".join(med))
        if data["nedlagda"]:
            print("  nedlagda distrikt: "
                  + ", ".join(f"{d['namn']} (t.o.m. {d['sistaVal']})"
                              for d in data["nedlagda"]))


if __name__ == "__main__":
    main()
