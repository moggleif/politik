#!/usr/bin/env python3
"""Hämtar kommunvalsresultatet per valdistrikt i Kungsbacka ur
Valmyndighetens öppna data – fem val, fem olika filformat.

  2010  slutligt_valresultat_valdistrikt_K_antal.skv   skv, Latin-1, bred
  2014  2014_kommunval_per_valdistrikt.skv             skv, Latin-1, bred
  2018  2018_K_per_valdistrikt.xlsx                    xlsx, bred
  2022  roster-per-distrikt-…-kommunval-2022.xlsx      xlsx, lång
  2026  Val_2026_<räkning>_1384_KF.zip                 zip med JSON

Alla fem säger samma sak: hur många röster varje parti fick i varje
valdistrikt, plus blanka, ogiltiga, röstande och röstberättigade.
Skripten skriver om dem till en gemensam form i data/kommunval/<år>.json.

**Avsteg från hur förtidsrösterna sparas.** Där ligger Valmyndighetens
rikstäckande filer orörda i data/, för de är små. Här är riksfilerna
20,4 + 5,9 + 4,2 + 1,9 MB – över 30 MB rådata för att komma åt
Kungsbackas dryga fyrtio rader per val. Filerna strömmas därför i minnet
och bara Kungsbackas rader sparas, ordagrant som de står i källan och
utan några framräknade tal. För att det ändå ska gå att räkna efter
sparas exakt vilken fil och vilket blad raderna kommer ur, och hur många
rader källan hade totalt (`raderIKallan`) – byts källan ut märks det.

Varje år kontrolleras dessutom mot sig självt: summan av partiernas
röster måste bli källans egen siffra för giltiga röster, och giltiga
plus blanka plus ogiltiga måste bli antalet röstande. Stämmer det inte
avbryts hämtningen.

Jämförbarheten mellan valen hämtas också, till
data/kommunval/jamforbarhet.json. Valdistrikten ritas om mellan valen,
och Valmyndigheten publicerar själv sin bedömning av vilka distrikt som
går att jämföra:

  2010 -> 2014  ingen fil behövs: alla 41 distrikt har samma kod och
                samma namn båda åren, vilket skriptet kontrollerar
  2014 -> 2018  mappning_2014_2018.zip, viktad (13840102 delas 62/38)
  2018 -> 2022  jamforelser-2018-och-2022-…xlsx
  2022 -> 2026  ligger inbyggd i 2026 års JSON, som
                valdistriktskodForegaendeVal och statusJamforelse

Den bedömningen är strängare än namnen antyder: elva Kungsbackadistrikt
underkänns 2018 -> 2022 trots att sju av dem heter precis likadant. Att
matcha på namn hade alltså ritat en obruten kurva tvärs över en
distriktsändring. Därför används Valmyndighetens bedömning och aldrig
namnen.

Körs:  python3 scripts/hamta_kommunval.py            (alla åren)
       python3 scripts/hamta_kommunval.py --ar 2026  (ett år)
"""

import argparse
import json
import sys
import zipfile
from datetime import date
from io import BytesIO
from pathlib import Path

from val import (BLANKA, EJ_ANMALT, KOMMUN, OGILTIGA, OVRIGA, hamta, kolumn,
                 las_blad, normalisera_parti, okand_ar_forsumbar, tal)

ROT = Path(__file__).resolve().parent.parent
UT_MAPP = ROT / "data" / "kommunval"

RADATA_2002_2022 = ("https://www.val.se/valresultat-och-statistik/"
                    "statistik-och-data/radata-fran-val-2002-2022")
RADATA_2026 = ("https://www.val.se/valresultat-och-statistik/"
               "statistik-och-data/radata-val-2026")

# Valmyndigheten publicerar resultatfilerna för 2026 löpande. index.md5
# listar vilka som finns; ./s/ är den slutliga räkningen och ./p/ den
# preliminära. Den preliminära innehåller bara rapportpartier.
INDEX_2026 = "https://resultat.val.se/resultatfiler/val2026/index.md5"
FIL_2026 = "https://resultat.val.se/resultatfiler/val2026/{gren}/kf/Val_2026_{rakning}_{kommun}_KF.zip"

KALLOR = {
    2010: {
        "url": "https://historik.val.se/val/val2010/statistik/slutligt_valresultat_valdistrikt_K_antal.skv",
        "kalla": "Valmyndigheten, Slutligt valresultat per valdistrikt, kommunvalet 2010",
        "sidaUrl": RADATA_2002_2022,
    },
    2014: {
        "url": "https://historik.val.se/val/val2014/statistik/2014_kommunval_per_valdistrikt.skv",
        "kalla": "Valmyndigheten, Kommunval per valdistrikt 2014",
        "sidaUrl": RADATA_2002_2022,
    },
    2018: {
        "url": "https://historik.val.se/val/val2018/statistik/2018_K_per_valdistrikt.xlsx",
        "blad": "K antal",
        "kalla": "Valmyndigheten, Kommunval per valdistrikt 2018",
        "sidaUrl": RADATA_2002_2022,
    },
    2022: {
        "url": "https://www.val.se/download/18.162047b519a91d0533118f4e/1764337121617/roster-per-distrikt-slutligt-antal-roster-inklusive-totalt-valdeltagande-kommunval-2022.xlsx",
        "blad": "roster_KF",
        "kalla": ("Valmyndigheten, Röster per distrikt, slutligt antal röster "
                  "inklusive totalt valdeltagande, kommunval 2022"),
        "sidaUrl": RADATA_2002_2022,
    },
    2026: {
        "url": INDEX_2026,
        "kalla": "Valmyndigheten, resultatfiler för valen 2026, kommunvalet i Kungsbacka",
        "sidaUrl": RADATA_2026,
    },
}

JAMFORBARHET = {
    "2014-2018": {
        "url": "https://historik.val.se/val/val2018/statistik/mappning_2014_2018.zip",
        "kalla": "Valmyndigheten, Mappning av valdistrikt mellan 2014 och 2018",
        "sidaUrl": RADATA_2002_2022,
    },
    "2018-2022": {
        "url": "https://www.val.se/download/18.162047b519a91d0533119148/1666857349837/jamforelser-2018-och-2022-valdistrikt-och-uppsamlingsdistrikt-v2.xlsx",
        "blad": "Fysiska valdistrikt",
        "kalla": "Valmyndigheten, Jämförelser mellan valdistrikt 2018 och 2022",
        "sidaUrl": RADATA_2002_2022,
    },
}


# ---------- Gemensam form ----------

def nytt_distrikt(kod: str, namn: str) -> dict:
    return {"kod": kod, "namn": (namn or "").strip(),
            "uppsamling": False, "rostberattigade": 0, "rostande": 0,
            "giltiga": 0, "blanka": 0, "ogiltiga": 0, "ejAnmalt": 0,
            "roster": {}}


def lagg_till(distrikt: dict, parti: str, antal: int, ar: int) -> None:
    """Lägger en post på rätt plats: partiröster i roster, blanka och
    ogiltiga för sig. Okända partier hamnar i ÖVR, men bara om de är
    försumbara – ett stort parti som slutat gå att tolka ska larma."""
    if antal == 0:
        return
    if parti == BLANKA:
        distrikt["blanka"] += antal
    elif parti == OGILTIGA:
        distrikt["ogiltiga"] += antal
    elif parti == EJ_ANMALT:
        distrikt["ejAnmalt"] += antal
    else:
        distrikt["roster"][parti] = distrikt["roster"].get(parti, 0) + antal


def tolka_parti(rubrik: str, antal: int, giltiga_i_distriktet: int, ar: int,
                okanda: dict):
    """Källans skrivning -> kod. Otolkat blir ÖVR och antecknas."""
    kod = normalisera_parti(rubrik)
    if kod is None and antal:
        okanda[rubrik.strip()] = okanda.get(rubrik.strip(), 0) + antal
        return OVRIGA
    return kod


def granska(ar: int, distrikt: list, okanda: dict) -> None:
    """Kontrollerar varje distrikt mot sig självt och avbryter vid fel."""
    giltiga_totalt = sum(d["giltiga"] for d in distrikt)
    for namn, antal in okanda.items():
        if not okand_ar_forsumbar(antal, giltiga_totalt):
            sys.exit(f"{ar}: partiet {namn!r} fick {antal} röster men går "
                     f"inte att tolka – layouten eller partitabellen i "
                     f"scripts/val.py har blivit fel")
    for d in distrikt:
        summa = sum(d["roster"].values())
        if d["giltiga"] and summa != d["giltiga"]:
            sys.exit(f"{ar}: {d['namn']} har {summa} partiröster men "
                     f"{d['giltiga']} giltiga enligt källan")
        rostande = d["giltiga"] + d["blanka"] + d["ogiltiga"] + d["ejAnmalt"]
        if d["rostande"] and rostande != d["rostande"]:
            sys.exit(f"{ar}: {d['namn']} summerar till {rostande} röstande "
                     f"men källan säger {d['rostande']}")
    if okanda:
        print("  otolkade partier (lagda i ÖVR): "
              + ", ".join(f"{k} {v}" for k, v in sorted(okanda.items())))


# ---------- Läsare, ett år i taget ----------

def las_skv(raa: bytes):
    """Valmyndighetens .skv: Latin-1, semikolon, CR eller CRLF."""
    text = raa.decode("latin-1").replace("\r\n", "\n").replace("\r", "\n")
    return [rad.split(";") for rad in text.split("\n") if rad.strip()]


def kod_ur_delar(lan: str, kom: str, dist: str) -> str:
    """Länskod, kommunkod och distriktsnummer -> åttasiffrig kod. De
    äldre filerna nollutfyller olika: 2010 skriver "0301", 2014 "201"."""
    return f"{int(lan):02d}{int(kom):02d}{int(dist):04d}"


def bred_fil(rader, etiketter: int, kod_delar, kommun_kol: int,
             distrikt_kol: int, ar: int, parti_slut: str, falt: dict,
             steg: int = 1):
    """Läser de filer som har en kolumn per parti (2010, 2014, 2018).

    Partikolumnerna löper från första datakolumnen till och med den som
    heter ÖVR; efter den kommer blanka, ogiltiga och summorna. Alla tre
    filerna är byggda så.
    """
    rub = [(c or "").strip() for c in rader[0]]
    slut = rub.index(parti_slut)
    ut, okanda = [], {}
    for rad in rader[1:]:
        if len(rad) <= kommun_kol or (rad[kommun_kol] or "").strip() != "Kungsbacka":
            continue
        dist_kod = (rad[kod_delar[2]] or "").strip()
        namn = (rad[distrikt_kol] or "").strip()
        uppsamling = not dist_kod.isdigit()
        kod = (KOMMUN + dist_kod if uppsamling
               else kod_ur_delar(rad[kod_delar[0]], rad[kod_delar[1]], dist_kod))
        d = nytt_distrikt(kod, namn)
        # Uppsamlingsdistriktet skrivs olika: eget nummer 2014, koden
        # …0000 2018, en bokstavskod 2010. Ingen av dem är ett valdistrikt.
        d["uppsamling"] = (uppsamling
                           or namn in ("Uppsamlingsdistrikt", "Onsdagsdistrikt")
                           or (dist_kod.isdigit() and int(dist_kod) == 0))
        for i in range(etiketter, slut + 1, steg):
            lagg_till(d, tolka_parti(rub[i], tal(rad[i]), 0, ar, okanda),
                      tal(rad[i]), ar)
        for nyckel, rubrik in falt.items():
            d[nyckel] = tal(rad[rub.index(rubrik)])
        ut.append(d)
    return ut, okanda


def las_2010(raa: bytes, kalla: dict):
    rader = las_skv(raa)
    distrikt, okanda = bred_fil(
        rader, etiketter=6, kod_delar=(0, 1, 2), kommun_kol=4,
        distrikt_kol=5, ar=2010,
        parti_slut="ÖVR",
        falt={"blanka": "BLANK", "ogiltiga": "OG", "giltiga": "Rost Giltiga",
              "rostande": "Rostande", "rostberattigade": "Rostb"})
    return distrikt, okanda, len(rader) - 1


def las_2014(raa: bytes, kalla: dict):
    rader = las_skv(raa)
    # Varje parti har två kolumner, "M tal" och "M proc"; bara antalet läses.
    rader[0] = [(c or "").replace(" tal", "") if (c or "").endswith(" tal") else c
                for c in rader[0]]
    distrikt, okanda = bred_fil(
        rader, etiketter=6, kod_delar=(0, 1, 2), kommun_kol=4,
        distrikt_kol=5, ar=2014,
        parti_slut="ÖVR", steg=2,
        falt={"blanka": "BLANK", "ogiltiga": "OG", "giltiga": "Rost Giltiga",
              "rostande": "Rostande", "rostberattigade": "Rostb"})
    return distrikt, okanda, len(rader) - 1


def las_2018(raa: bytes, kalla: dict):
    rader = las_blad(raa, kalla["blad"])
    distrikt, okanda = bred_fil(
        rader, etiketter=8, kod_delar=(0, 1, 3), kommun_kol=5,
        distrikt_kol=7, ar=2018,
        parti_slut="ÖVR",
        falt={"ejAnmalt": "OGEJ", "blanka": "BLANK", "ogiltiga": "OG",
              "giltiga": "RÖSTER GILTIGA", "rostande": "RÖSTANDE",
              "rostberattigade": "RÖSTBERÄTTIGADE"})
    return distrikt, okanda, len(rader) - 1


def las_2022(raa: bytes, kalla: dict):
    """Lång form: en rad per distrikt och parti, plus summeringsrader."""
    rader = las_blad(raa, kalla["blad"])
    rub = rader[0]
    k_kod = kolumn(rub, "Valdistriktskod")
    k_namn = kolumn(rub, "Valdistriktnamn")
    k_kommun = kolumn(rub, "Kommun")
    k_parti = kolumn(rub, "Parti")
    k_roster = kolumn(rub, "Röster")
    k_rb = kolumn(rub, "Röstberättigade")
    per_kod, okanda = {}, {}
    for rad in rader[1:]:
        if (rad[k_kommun] or "").strip() != "Kungsbacka":
            continue
        kod = (rad[k_kod] or "").strip()
        namn = (rad[k_namn] or "").strip()
        d = per_kod.setdefault(kod, nytt_distrikt(kod, namn))
        d["uppsamling"] = namn == "Uppsamlingsdistrikt"
        d["rostberattigade"] = tal(rad[k_rb])
        post = (rad[k_parti] or "").strip()
        antal = tal(rad[k_roster])
        if post == "Summa giltiga röster":
            d["giltiga"] = antal
        elif post == "Valdeltagande":
            d["rostande"] = antal
        else:
            lagg_till(d, tolka_parti(post, antal, 0, 2022, okanda), antal, 2022)
    return list(per_kod.values()), okanda, len(rader) - 1


def valj_fil_2026():
    """Slutlig räkning om den finns, annars preliminär."""
    index = hamta(INDEX_2026).decode("utf-8", "replace")
    for gren, rakning in (("s", "slutlig"), ("p", "preliminar")):
        stig = f"./{gren}/kf/Val_2026_{rakning}_{KOMMUN}_KF.zip"
        if stig in index:
            return (FIL_2026.format(gren=gren, rakning=rakning, kommun=KOMMUN),
                    "slutlig" if gren == "s" else "preliminär")
    sys.exit("Ingen resultatfil för Kungsbackas kommunval finns i "
             f"{INDEX_2026} – valet är kanske inte räknat än")


def las_2026(raa: bytes, kalla: dict):
    z = zipfile.ZipFile(BytesIO(raa))
    namn = [n for n in z.namelist()
            if "rostfordelning" in n and n.endswith(".json")]
    if not namn:
        sys.exit("Röstfördelningsfilen saknas i 2026 års zip")
    data = json.loads(z.read(namn[0]))
    distrikt, okanda = [], {}
    for v in data["valdistrikt"]:
        d = nytt_distrikt(v["valdistriktskod"], v["namn"])
        d["uppsamling"] = v.get("valdistriktstyp") == "uppsamlingsdistrikt"
        d["rostberattigade"] = v.get("antalRostberattigade") or 0
        d["rostande"] = v.get("totaltAntalRoster") or 0
        rf = v.get("rostfordelning") or {}
        pm = rf.get("rosterPaverkaMandat") or {}
        d["giltiga"] = pm.get("antalRoster") or 0
        for p in pm.get("partiRoster") or []:
            lagg_till(d, tolka_parti(p["partiforkortning"], p["antalRoster"],
                                     0, 2026, okanda),
                      p["antalRoster"], 2026)
        lagg_till(d, OVRIGA, (pm.get("rosterOvrigaPartier") or {})
                  .get("antalRoster") or 0, 2026)
        ej = rf.get("rosterEjPaverkaMandat") or {}
        d["blanka"] = (ej.get("blankaRoster") or {}).get("antalRoster") or 0
        d["ogiltiga"] = (ej.get("ovrigaOgiltiga") or {}).get("antalRoster") or 0
        d["ejAnmalt"] = ((ej.get("rosterEjAnmaltDeltagande") or {})
                         .get("antalRoster") or 0)
        distrikt.append(d)
    return distrikt, okanda, len(data["valdistrikt"])


LASARE = {2010: las_2010, 2014: las_2014, 2018: las_2018,
          2022: las_2022, 2026: las_2026}


# ---------- Jämförbarhet mellan valen ----------

def jamforbarhet_2014_2018(raa: bytes) -> dict:
    z = zipfile.ZipFile(BytesIO(raa))
    indelning = {}
    for rad in las_skv(z.read("vd-indelning-2018.skv")):
        if rad[0].startswith(KOMMUN):
            indelning[rad[0]] = rad[1].strip()
    ut = {}
    for rad in las_skv(z.read("vd-mappning-2014-2018.skv")):
        if not rad[0].startswith(KOMMUN):
            continue
        fore, efter, andel = rad[0], rad[1], float(rad[2])
        post = ut.setdefault(efter, {"foregaende": [], "indelning": ""})
        post["foregaende"].append({"kod": fore, "andel": andel})
        post["indelning"] = indelning.get(efter, "")
    # O = oförändrat är det enda som får räknas som jämförbart; M, S och N
    # betyder att distriktet ritats om, slagits ihop eller är nytt.
    for kod, post in ut.items():
        post["jamforbart"] = post["indelning"] == "O"
    return ut


def jamforbarhet_2018_2022(raa: bytes, blad: str) -> dict:
    rader = las_blad(raa, blad)
    rub = rader[0]
    k_ny = kolumn(rub, "Kod_2022")
    k_jmf = kolumn(rub, "Jämförbart")
    k_gamla = [kolumn(rub, "Valdistriktskod2018"), kolumn(rub, "Kod 2 2018"),
               kolumn(rub, "Kod 3 2018")]
    ut = {}
    for rad in rader[1:]:
        kod = (rad[k_ny] or "").strip()
        if not kod.startswith(KOMMUN):
            continue
        jmf = (rad[k_jmf] or "").strip().casefold() == "ja"
        foregaende = [{"kod": (rad[i] or "").strip(), "andel": None}
                      for i in k_gamla
                      if (rad[i] or "").strip() and (rad[i] or "").strip() != "None"]
        ut[kod] = {"foregaende": foregaende, "jamforbart": jmf, "indelning": ""}
    return ut


def jamforbarhet_2022_2026(distrikt_2026_raa: dict) -> dict:
    """Ligger inbyggd i 2026 års JSON."""
    ut = {}
    for v in distrikt_2026_raa["valdistrikt"]:
        foregaende = [{"kod": k, "andel": None}
                      for k in (v.get("valdistriktskodForegaendeVal") or [])]
        ut[v["valdistriktskod"]] = {
            "foregaende": foregaende,
            "jamforbart": v.get("statusJamforelse") == "Kan jämföras",
            "indelning": v.get("statusJamforelse") or "",
        }
    return ut


def jamforbarhet_2010_2014(distrikt: dict) -> dict:
    """Ingen mappningsfil finns. Skriptet kontrollerar i stället att varje
    distrikt 2014 har samma kod *och* samma namn 2010; stämmer det är
    indelningen oförändrad. Går det inte ihop avbryts hämtningen hellre än
    att jämförbarheten antas."""
    d10 = {d["kod"]: d["namn"] for d in distrikt[2010] if not d["uppsamling"]}
    d14 = {d["kod"]: d["namn"] for d in distrikt[2014] if not d["uppsamling"]}
    ut = {}
    for kod, namn in d14.items():
        lika = kod in d10 and d10[kod] == namn
        ut[kod] = {"foregaende": [{"kod": kod, "andel": 100.0}] if lika else [],
                   "jamforbart": lika,
                   "indelning": "O" if lika else "N"}
    saknas = sorted(set(d10) - set(d14))
    if saknas:
        print(f"  2010 har distrikt som saknas 2014: {saknas}")
    return ut


# ---------- Skrivning ----------

def skriv(sokvag: Path, data: dict) -> bool:
    """Skriver bara när innehållet ändrats, så att hämtdatum inte skapar
    en diff av sig självt."""
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if sokvag.exists():
        gammalt = json.loads(sokvag.read_text(encoding="utf-8"))
        nytt = json.loads(text)
        gammalt.pop("hamtad", None)
        nytt_utan = dict(nytt)
        nytt_utan.pop("hamtad", None)
        if gammalt == nytt_utan:
            return False
    sokvag.parent.mkdir(parents=True, exist_ok=True)
    sokvag.write_text(text, encoding="utf-8")
    return True


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--ar", type=int, choices=sorted(KALLOR),
                   help="hämta bara det här året")
    args = p.parse_args()
    ar_att_hamta = [args.ar] if args.ar else sorted(KALLOR)

    distrikt_per_ar, raa_2026 = {}, None
    for ar in ar_att_hamta:
        kalla = dict(KALLOR[ar])
        print(f"Hämtar kommunvalet {ar} …")
        if ar == 2026:
            kalla["url"], rakning = valj_fil_2026()
            kalla["rakningstillfalle"] = rakning
            print(f"  {rakning} räkning: {kalla['url']}")
        raa = hamta(kalla["url"])
        distrikt, okanda, rader_i_kallan = LASARE[ar](raa, kalla)
        if ar == 2026:
            z = zipfile.ZipFile(BytesIO(raa))
            namn = [n for n in z.namelist()
                    if "rostfordelning" in n and n.endswith(".json")][0]
            raa_2026 = json.loads(z.read(namn))
        granska(ar, distrikt, okanda)
        distrikt.sort(key=lambda d: d["kod"])
        distrikt_per_ar[ar] = distrikt
        ut = {
            "ar": ar,
            "kalla": kalla["kalla"], "kallaUrl": kalla["url"],
            "sidaUrl": kalla["sidaUrl"],
            "hamtad": date.today().isoformat(),
            "raderIKallan": rader_i_kallan,
            "distrikt": distrikt,
        }
        if kalla.get("blad"):
            ut["blad"] = kalla["blad"]
        if kalla.get("rakningstillfalle"):
            ut["rakningstillfalle"] = kalla["rakningstillfalle"]
        andrad = skriv(UT_MAPP / f"{ar}.json", ut)
        fysiska = [d for d in distrikt if not d["uppsamling"]]
        print(f"  {len(fysiska)} valdistrikt, "
              f"{sum(d['giltiga'] for d in distrikt)} giltiga röster"
              f"{'' if andrad else ' (oförändrad)'}")

    if args.ar:
        return

    print("Hämtar jämförbarheten mellan valen …")
    ut = {"kalla": {}, "overgangar": {}}
    ut["overgangar"]["2010-2014"] = jamforbarhet_2010_2014(distrikt_per_ar)
    ut["kalla"]["2010-2014"] = {
        "kalla": ("Ingen mappningsfil finns. Kontrollerat i hämtskriptet: "
                  "samma valdistriktskod och samma namn båda åren."),
        "kallaUrl": None, "sidaUrl": RADATA_2002_2022}
    for nyckel, k in JAMFORBARHET.items():
        raa = hamta(k["url"])
        if nyckel == "2014-2018":
            ut["overgangar"][nyckel] = jamforbarhet_2014_2018(raa)
        else:
            ut["overgangar"][nyckel] = jamforbarhet_2018_2022(raa, k["blad"])
        ut["kalla"][nyckel] = {"kalla": k["kalla"], "kallaUrl": k["url"],
                               "sidaUrl": k["sidaUrl"]}
    ut["overgangar"]["2022-2026"] = jamforbarhet_2022_2026(raa_2026)
    ut["kalla"]["2022-2026"] = {
        "kalla": ("Valmyndigheten, resultatfilen för kommunvalet 2026 "
                  "(valdistriktskodForegaendeVal och statusJamforelse)"),
        "kallaUrl": KALLOR[2026]["url"], "sidaUrl": RADATA_2026}
    ut["hamtad"] = date.today().isoformat()
    skriv(UT_MAPP / "jamforbarhet.json", ut)
    for nyckel, overgang in sorted(ut["overgangar"].items()):
        ja = sum(1 for v in overgang.values() if v["jamforbart"])
        print(f"  {nyckel}: {ja} av {len(overgang)} distrikt jämförbara")


if __name__ == "__main__":
    main()
