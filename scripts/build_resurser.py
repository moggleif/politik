#!/usr/bin/env python3
"""Bygger docs/data-resurser.json: vad kommunen valt att lägga på skolan.

Läser:
  data/kolada/resurser_grundskola.json   (från hamta_kolada.py --del resurser)
  data/scb/folkmangd_kungsbacka.json     (från hamta_scb.py)
  data/scb/bnp.json                      (från hamta_bnp.py)

Skriver:
  docs/data-resurser.json

Kostnadssidan svarar på vad grundskolan kostade. Den här sidan svarar på
en annan fråga: vad kommunen *valde*. Skillnaden är inte akademisk –
kostnaden per elev rör sig när elevantalet ändras, när avtalen höjer
lönerna och när priserna stiger, och inget av det är ett beslut.

**Ingen prisomräkning görs här, och det är avsiktligt.** Varje mått på
sidan är en jämförelse inom samma år: en avvikelse mot en referenskostnad
för samma år, eller en andel av samma års driftkostnad. Inflationen finns
i båda leden och tar ut sig själv. Därför läses KPI-filen inte alls, och
därför är de här måtten robustare än kronor per elev när frågan gäller
politiken.

Det enda som räknas fram här är **skolålderns andel av folkmängden**:
antalet 6–15-åringar delat med hela folkmängden, ur SCB:s
befolkningsstatistik. Den behövs för att skolans andel av kommunens
driftkostnad ska gå att läsa. Faller skolans budgetandel i takt med att
barnen blir färre är det demografi; faller den snabbare är det ett val.
Utan barnandelen är det en brasklapp i text, med den är det något
läsaren ser.

De två andelarna mäter olika saker – andel av en budget och andel av en
befolkning – och får därför inte läsas mot samma axel. De ställs i stället
mot varandra som index med ett gemensamt basår, där bara *rörelsen*
jämförs.

Dessutom räknas **grundskolans andel av BNP i riket** fram. Den fyller en
blind fläck i resten av sidan: referenskostnaden är en relativ måttstock,
framräknad ur vad kommunerna faktiskt lägger. Drar alla kommuner ner
samtidigt sjunker referensen med dem, och en kommun kan närma sig noll
utan att ha lagt en krona mer. Avvikelsen mäter avstånd till genomsnittet,
aldrig genomsnittets nivå. BNP är en nämnare utanför kommunsektorn och
visar därmed om måttstocken själv rört sig.

    andel av BNP = kostnad per invånare × folkmängd / BNP

Alla tre talen avser samma år och löpande priser. Fasta priser i täljaren
eller nämnaren, men inte båda, vore ett räknefel.

Körs:  python3 scripts/build_resurser.py
"""

import json
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent

KUNGSBACKA = "1384"
RIKET = "0000"

# Grundskoleåldern: förskoleklass vid sex år till och med årskurs nio.
# Samma avgränsning som referenskostnaden avser (F–9).
SKOLALDER = range(6, 16)

# Kostnadsutjämningen har byggts om under periodens gång. En ändrad modell
# flyttar avvikelsen utan att kommunen gjort något, så åren markeras i
# diagrammet – men räknas aldrig bort. Att markera ett brott och att
# justera för det är två olika saker.
REFORMER = [
    {"ar": 2014,
     "text": "Modellen ändrad",
     "kalla": "Ändringar i kostnadsutjämningen, i kraft 1 januari 2014",
     "kallaUrl": "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/"
                 "betankande/andringar-i-kostnadsutjamningen-for-kommuner-och_H701FiU18/html/"},
    {"ar": 2020,
     "text": "Modellen ändrad",
     "kalla": "Prop. 2019/20:11, Ändringar i kostnadsutjämningen för "
              "kommuner och landsting, i kraft 1 januari 2020",
     "kallaUrl": "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/"
                 "proposition/andringar-i-kostnadsutjamningen-for-kommuner-och_H70311/html/"},
]


def lasa_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def serie(varden: dict, decimaler: int) -> dict:
    """En serie för ett område: värdena plus var den börjar, slutar och
    når sina ytterlägen."""
    ar = sorted(int(a) for a in varden)
    if not ar:
        return None
    v = {a: round(varden[str(a)], decimaler) for a in ar}
    return {
        "varden": v,
        "forstaAr": ar[0],
        "sistaAr": ar[-1],
        "forsta": v[ar[0]],
        "sista": v[ar[-1]],
        "hogsta": max(v.values()),
        "hogstaAr": max(v, key=lambda a: v[a]),
        "lagsta": min(v.values()),
        "lagstaAr": min(v, key=lambda a: v[a]),
    }


def bygg_post(post: dict) -> dict:
    """Ett nyckeltal med sina områdesserier.

    Antal decimaler följer måttet: procent och miljoner kronor redovisas
    med en decimal, kronor per elev som hela kronor."""
    decimaler = 0 if post.get("enhet") == "kronor per elev" else 1
    rad = {
        "nyckel": post["nyckel"],
        "etikett": post["etikett"],
        "enhet": post.get("enhet"),
        "kolada": post["kolada"],
        "koladaTitel": post.get("koladaTitel"),
        "definition": post.get("definition"),
        "omraden": {},
    }
    if "tecken" in post:
        rad["tecken"] = post["tecken"]
    for kod, varden in post["omraden"].items():
        s = serie(varden, decimaler)
        if s is not None:
            rad["omraden"][kod] = s
    return rad


def skolalderns_andel(scb: dict) -> dict:
    """Antalet 6–15-åringar och deras andel av folkmängden, per år.

    SCB:s enskilda åldrar summeras här; åldersgruppen 0–15 i samma fil
    duger inte, eftersom den innehåller förskolebarnen."""
    per_alder = scb.get("perAlder", {})
    folk = scb.get("folkmangd", {})
    ut = {}
    for ar, rad in per_alder.items():
        if ar not in folk:
            continue
        if any(str(a) not in rad for a in SKOLALDER):
            continue          # ofullständigt år räknas inte
        antal = sum(int(rad[str(a)]) for a in SKOLALDER)
        ut[int(ar)] = {
            "antal": antal,
            "andel": round(100.0 * antal / int(folk[ar]), 2),
        }
    return dict(sorted(ut.items()))


def indexerad(varden: dict, bas: int) -> dict:
    """Serien med basåret som 100. Används bara för att jämföra *rörelsen*
    hos två andelar som mäter olika saker och därför inte får dela axel."""
    basvarde = varden.get(bas)
    if not basvarde:
        return {}
    return {a: round(100.0 * v / basvarde, 1) for a, v in varden.items()}


# Nettokostnad delad med referenskostnad ska ge avvikelsen. Så är det
# från 2018, men för 2016 och 2017 går Koladas två serier isär med flera
# procentenheter – referenskostnaden per elev verkar räknad på en annan
# grund de åren. Att ändå rita dem bredvid varandra skulle sätta en synlig
# motsägelse på sidan: läsaren kan räkna kvoten ur tabellen och få ett
# annat tal än stapeln visar. Åren utelämnas därför ur just den bilden –
# men hårdkodas inte, utan prövas mot avvikelsen år för år, så att de
# kommer tillbaka av sig själva om källan rättas.
TOLERANS = 0.1          # procentenheter


def referensaren(per_nyckel: dict) -> dict:
    """Vilka år nettokostnad, referenskostnad och avvikelse hänger ihop."""
    def varden(nyckel, kod="1384"):
        s = per_nyckel.get(nyckel, {}).get("omraden", {}).get(kod)
        return s["varden"] if s else {}

    netto = varden("faktisk")
    referens = varden("referens")
    avvikelse = varden("avvikelseProcent")

    stammer, utelamnade = [], []
    for ar in sorted(referens):
        if ar not in netto or ar not in avvikelse or not referens[ar]:
            continue
        kvot = 100.0 * (netto[ar] / referens[ar] - 1)
        (stammer if abs(kvot - avvikelse[ar]) <= TOLERANS
         else utelamnade).append(ar)
    return {"ar": stammer, "utelamnade": utelamnade, "tolerans": TOLERANS}


def andel_av_bnp(per_nyckel: dict, bnpfil: dict) -> dict:
    """Grundskolans kostnad i riket som andel av BNP, per år.

    Koladas tal är kronor per invånare, BNP är miljoner kronor, så
    folkmängden behövs för att få dem i samma enhet. Ett år utan alla tre
    talen utelämnas – serien har luckor i källan, och de ska synas som
    luckor och inte överbryggas."""
    serie = per_nyckel.get("perInvanare", {}).get("omraden", {}).get(RIKET)
    if not serie:
        return {}
    bnp = bnpfil.get("bnpLopandePriser", {})
    folk = bnpfil.get("folkmangd", {})
    ut = {}
    for ar, per_inv in serie["varden"].items():
        nyckel = str(ar)
        if nyckel not in bnp or nyckel not in folk or not bnp[nyckel]:
            continue
        total_mnkr = per_inv * int(folk[nyckel]) / 1_000_000
        ut[int(ar)] = {
            "perInvanare": round(per_inv),
            "totalMnkr": round(total_mnkr),
            "andel": round(100.0 * total_mnkr / float(bnp[nyckel]), 2),
        }
    return dict(sorted(ut.items()))


def bygg(kolada: dict, scb: dict, bnpfil: dict) -> dict:
    """Hela utdatan som en ren funktion av indatafilerna, så att den går
    att kontrollräkna i testerna utan att skriva någon fil."""
    serier = [bygg_post(p) for p in kolada["nyckeltal"]]
    per_nyckel = {s["nyckel"]: s for s in serier}

    befolkning = skolalderns_andel(scb)

    # Jämförelsen budgetandel mot barnandel: gemensamt basår är det första
    # år båda finns. Utan ett gemensamt basår mäter indexen inte samma
    # period, och då är jämförelsen meningslös.
    andel = per_nyckel.get("andelDrift", {}).get("omraden", {}).get(KUNGSBACKA)
    jamforelse = None
    if andel and befolkning:
        gemensamma = sorted(set(andel["varden"]) & set(befolkning))
        if gemensamma:
            bas = gemensamma[0]
            budget = {a: andel["varden"][a] for a in gemensamma}
            barn = {a: befolkning[a]["andel"] for a in gemensamma}
            jamforelse = {
                "basAr": bas,
                "ar": gemensamma,
                "budgetandel": indexerad(budget, bas),
                "barnandel": indexerad(barn, bas),
            }

    referens = referensaren(per_nyckel)
    bnp = andel_av_bnp(per_nyckel, bnpfil)

    ar = sorted({a
                 for s in serier
                 for o in s["omraden"].values()
                 for a in o["varden"]} | set(befolkning))

    return {
        "kommun": "Kungsbacka",
        "kommunkod": KUNGSBACKA,
        "serie": "Grundskolans resurser jämförda med referenskostnaden och "
                 "med kommunens övriga verksamhet",
        "matt": kolada["matt"],
        "prisomrakning": "Ingen. Varje mått är en jämförelse inom samma år, "
                         "så inflationen finns i båda leden och tar ut sig själv.",
        "kalla": kolada["kalla"],
        "kallaUrl": kolada["kallaUrl"],
        "apiUrl": kolada["apiUrl"],
        "hamtad": kolada["hamtad"],
        "befolkningKalla": scb.get("kalla"),
        "befolkningKallaUrl": scb.get("kallaUrl"),
        "befolkningHamtad": scb.get("hamtad"),
        "befolkningMatt": f"Antal {SKOLALDER.start}–{SKOLALDER.stop - 1}-åringar "
                          "och deras andel av folkmängden, 31 december",
        "omraden": kolada["omraden"],
        "reformer": REFORMER,
        "ar": ar,
        "serier": serier,
        "befolkning": befolkning,
        "jamforelse": jamforelse,
        "referensJamforelse": referens,
        "bnpKalla": bnpfil.get("kalla"),
        "bnpKallaUrl": bnpfil.get("kallaUrl"),
        "bnpHamtad": bnpfil.get("hamtad"),
        "andelAvBnp": bnp,
    }


def main() -> None:
    kolada = lasa_json(ROT / "data" / "kolada" / "resurser_grundskola.json")
    scb = lasa_json(ROT / "data" / "scb" / "folkmangd_kungsbacka.json")
    bnpfil = lasa_json(ROT / "data" / "scb" / "bnp.json")

    ut = json.loads(json.dumps(bygg(kolada, scb, bnpfil)))
    utfil = ROT / "docs" / "data-resurser.json"
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n",
                     encoding="utf-8")

    ar = ut["ar"]
    print(f"Skrev {utfil.name}: {len(ar)} år ({ar[0]}–{ar[-1]})")
    for s in ut["serier"]:
        for kod, o in s["omraden"].items():
            namn = next(x["namn"] for x in ut["omraden"] if x["kod"] == kod)
            print(f"  {s['nyckel']:17s} {namn:11s} {o['forstaAr']}–{o['sistaAr']}: "
                  f"{o['forsta']} → {o['sista']} ({s['enhet']})")
    b = ut["andelAvBnp"]
    if b:
        bar = sorted(b, key=int)
        print(f"  grundskolan i riket som andel av BNP: {bar[0]}–{bar[-1]}, "
              f"{b[bar[0]]['andel']} % → {b[bar[-1]]['andel']} %")
    r = ut["referensJamforelse"]
    print(f"  referensjämförelse: {len(r['ar'])} år hänger ihop"
          + (f", {len(r['utelamnade'])} utelämnade ({', '.join(map(str, r['utelamnade']))})"
             if r["utelamnade"] else ""))
    j = ut["jamforelse"]
    if j:
        sista = j["ar"][-1]
        print(f"  jämförelse (bas {j['basAr']}): budgetandel index "
              f"{j['budgetandel'][str(sista)]}, barnandel index "
              f"{j['barnandel'][str(sista)]} år {sista}")


if __name__ == "__main__":
    main()
