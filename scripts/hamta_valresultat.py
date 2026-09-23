#!/usr/bin/env python3
"""Hämtar valresultatet per valdistrikt i Kungsbacka ur Valmyndighetens
öppna data – tre val och fem valår, femton filer i fem olika format.

Samma valdistrikt röstar i tre val samma dag: till kommunfullmäktige (K),
till regionfullmäktige (L i de äldre filerna, RF i de nyare) och till
riksdagen (R respektive RD). Valmyndigheten publicerar dem i var sin fil
med i stort sett samma innehåll, och skriptet skriver om dem till en
gemensam form i data/<valets mapp>/<år>.json:

  kommunval    2010  slutligt_valresultat_valdistrikt_K_antal.skv
  regionval    2010  slutligt_valresultat_valdistrikt_L.skv
  riksdagsval  2010  slutligt_valresultat_valdistrikt_R.skv
  kommunval    2014  2014_kommunval_per_valdistrikt.skv
  regionval    2014  2014_landstingsval_per_valdistrikt.skv
  riksdagsval  2014  2014_riksdagsval_per_valdistrikt.skv
  …2018        xlsx, ett blad per val ("K antal", "L antal", "R antal")
  …2022        xlsx i lång form, ett blad per val (roster_KF/RF/RD)
  …2026        zip med JSON, en fil per val

Alla femton säger samma sak: hur många röster varje parti fick i varje
valdistrikt, plus blanka, ogiltiga, röstande och röstberättigade. Vad som
skiljer dem åt är bara layouten, och den ligger i tabellen KALLOR nedan –
en post per val och år, med kolumnernas platser och namn. Läsarna själva
är tre: bred form (en kolumn per parti), lång form (en rad per parti) och
2026 års JSON.

**Avsteg från hur förtidsrösterna sparas.** Där ligger Valmyndighetens
rikstäckande filer orörda i data/, för de är små. Här är riksfilerna
tillsammans över 100 MB – riksdagsvalet 2022 är ensamt 16 MB, och 2026
års riksdagsfil täcker alla 6 626 valdistrikt i landet – för att komma åt
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
data/valdistrikt/jamforbarhet.json. Den ligger för sig och inte i något
av valens mappar, för den handlar om valdistrikten och inte om vad som
stod på valsedeln: distrikten ritas om mellan valen, och Valmyndigheten
publicerar själv sin bedömning av vilka distrikt som går att jämföra:

  2010 -> 2014  ingen fil behövs: alla 41 distrikt har samma kod och
                samma namn båda åren, vilket skriptet kontrollerar
  2014 -> 2018  mappning_2014_2018.zip, viktad (13840102 delas 62/38)
  2018 -> 2022  jamforelser-2018-och-2022-…xlsx
  2022 -> 2026  ligger inbyggd i 2026 års JSON, som
                valdistriktskodForegaendeVal och statusJamforelse

Att bedömningen är gemensam för de tre valen är inget antagande utan
kontrolleras: de två övergångar som räknas fram ur resultatfilerna
(2010 -> 2014 och 2022 -> 2026) jämförs mot den sparade filen, och
skiljer de sig avbryts hämtningen.

Den bedömningen är strängare än namnen antyder: elva Kungsbackadistrikt
underkänns 2018 -> 2022 trots att sju av dem heter precis likadant. Att
matcha på namn hade alltså ritat en obruten kurva tvärs över en
distriktsändring. Därför används Valmyndighetens bedömning och aldrig
namnen.

Körs:  python3 scripts/hamta_valresultat.py                 (alla valen)
       python3 scripts/hamta_valresultat.py --val riksdag   (ett val)
       python3 scripts/hamta_valresultat.py --ar 2026       (ett år)
"""

import argparse
import json
import sys
import zipfile
from datetime import date
from io import BytesIO
from pathlib import Path

from val import (BLANKA, EJ_ANMALT, KOMMUN, LAN, OGILTIGA, OVRIGA, RIKET,
                 hamta, kolumn, las_blad, normalisera_parti,
                 okand_ar_forsumbar, tal)

ROT = Path(__file__).resolve().parent.parent
DELAT = ROT / "data" / "valdistrikt"

RADATA_2002_2022 = ("https://www.val.se/valresultat-och-statistik/"
                    "statistik-och-data/radata-fran-val-2002-2022")
RADATA_2026 = ("https://www.val.se/valresultat-och-statistik/"
               "statistik-och-data/radata-val-2026")

# Valmyndigheten publicerar resultatfilerna för 2026 löpande. index.md5
# listar vilka som finns; ./s/ är den slutliga räkningen och ./p/ den
# preliminära. Den preliminära innehåller bara rapportpartier.
INDEX_2026 = "https://resultat.val.se/resultatfiler/val2026/index.md5"
FIL_2026 = ("https://resultat.val.se/resultatfiler/val2026/"
            "{gren}/{valtyp}/Val_2026_{rakning}_{omrade}_{VALTYP}.zip")

# De tre valen. `mapp` är mappen under data/, `valtyp` Valmyndighetens
# egen beteckning i 2022 och 2026 års filer, och `omrade2026` det område
# 2026 års fil omfattar: kommunvalet publiceras per kommun, regionvalet
# per län och riksdagsvalet i en enda fil för hela riket. `etikett`,
# `namn`, `kort` och `valen` är valets namn som de ska skrivas ut –
# etiketten i sidans väljare, de andra i löpande text.
VALEN = {
    "kommun": {"mapp": "kommunval", "valtyp": "KF", "omrade2026": KOMMUN,
               "etikett": "Kommunfullmäktige",
               "namn": "Val till kommunfullmäktige",
               "kort": "kommunvalet", "valen": "kommunvalen"},
    "region": {"mapp": "regionval", "valtyp": "RF", "omrade2026": LAN,
               "etikett": "Regionfullmäktige",
               "namn": "Val till regionfullmäktige",
               "kort": "regionvalet", "valen": "regionvalen"},
    "riksdag": {"mapp": "riksdagsval", "valtyp": "RD", "omrade2026": RIKET,
                "etikett": "Riksdagen",
                "namn": "Val till riksdagen",
                "kort": "riksdagsvalet", "valen": "riksdagsvalen"},
}

# Layouten i de breda filerna, alltså de som har en kolumn per parti.
# `etiketter` är första partikolumnen, `kod_delar` platserna för länskod,
# kommunkod och distriktsnummer, och `steg` 2 i de filer som skriver både
# antal och procent per parti. Partikolumnerna löper från `etiketter` till
# och med den som heter `parti_slut`; efter den kommer blanka, ogiltiga
# och summorna, och var de står säger `falt`.
#
# 2010 och 2014 skriver riksdagsvalets kolumner kortare än de andras:
# OVR och BL i stället för ÖVR och BLANK.
SUMMOR_GAMLA = {"blanka": "BLANK", "ogiltiga": "OG", "giltiga": "Rost Giltiga",
                "rostande": "Rostande", "rostberattigade": "Rostb"}
SUMMOR_GAMLA_R = dict(SUMMOR_GAMLA, blanka="BL")
SUMMOR_2018 = {"ejAnmalt": "OGEJ", "blanka": "BLANK", "ogiltiga": "OG",
               "giltiga": "RÖSTER GILTIGA", "rostande": "RÖSTANDE",
               "rostberattigade": "RÖSTBERÄTTIGADE"}

# Två spaltuppställningar återkommer: den smala, där valdistriktskoden är
# tredje kolumnen och kommunen femte, och den breda med en valkretskolumn
# emellan.
SMAL = {"etiketter": 6, "kod_delar": (0, 1, 2), "kommun_kol": 4,
        "distrikt_kol": 5}
MED_VALKRETS = {"etiketter": 8, "kod_delar": (0, 1, 3), "kommun_kol": 5,
                "distrikt_kol": 7}

HISTORIK_2010 = "https://historik.val.se/val/val2010/statistik/"
HISTORIK_2014 = "https://historik.val.se/val/val2014/statistik/"
HISTORIK_2018 = "https://historik.val.se/val/val2018/statistik/"

KALLOR = {
    "kommun": {
        2010: {
            "url": HISTORIK_2010 + "slutligt_valresultat_valdistrikt_K_antal.skv",
            "kalla": ("Valmyndigheten, Slutligt valresultat per valdistrikt, "
                      "kommunvalet 2010"),
            "las": "bred", "steg": 1, "parti_slut": "ÖVR",
            "falt": SUMMOR_GAMLA, **SMAL,
        },
        2014: {
            "url": HISTORIK_2014 + "2014_kommunval_per_valdistrikt.skv",
            "kalla": "Valmyndigheten, Kommunval per valdistrikt 2014",
            "las": "bred", "steg": 2, "parti_slut": "ÖVR",
            "falt": SUMMOR_GAMLA, **SMAL,
        },
        2018: {
            "url": HISTORIK_2018 + "2018_K_per_valdistrikt.xlsx",
            "blad": "K antal",
            "kalla": "Valmyndigheten, Kommunval per valdistrikt 2018",
            "las": "bred", "steg": 1, "parti_slut": "ÖVR",
            "falt": SUMMOR_2018, **MED_VALKRETS,
        },
        2022: {
            "url": "https://www.val.se/download/18.162047b519a91d0533118f4e/1764337121617/roster-per-distrikt-slutligt-antal-roster-inklusive-totalt-valdeltagande-kommunval-2022.xlsx",
            "blad": "roster_KF",
            "kalla": ("Valmyndigheten, Röster per distrikt, slutligt antal "
                      "röster inklusive totalt valdeltagande, kommunval 2022"),
            "las": "lang",
        },
        2026: {
            "kalla": ("Valmyndigheten, resultatfiler för valen 2026, "
                      "kommunvalet i Kungsbacka"),
            "las": "json2026",
        },
    },
    "region": {
        2010: {
            "url": HISTORIK_2010 + "slutligt_valresultat_valdistrikt_L.skv",
            "kalla": ("Valmyndigheten, Slutligt valresultat per valdistrikt, "
                      "landstingsvalet 2010"),
            "las": "bred", "steg": 2, "parti_slut": "ÖVR",
            "falt": SUMMOR_GAMLA, **SMAL,
        },
        2014: {
            "url": HISTORIK_2014 + "2014_landstingsval_per_valdistrikt.skv",
            "kalla": "Valmyndigheten, Landstingsval per valdistrikt 2014",
            "las": "bred", "steg": 2, "parti_slut": "ÖVR",
            "falt": SUMMOR_GAMLA, **SMAL,
        },
        2018: {
            "url": HISTORIK_2018 + "2018_L_per_valdistrikt.xlsx",
            "blad": "L antal",
            "kalla": "Valmyndigheten, Landstingsval per valdistrikt 2018",
            "las": "bred", "steg": 1, "parti_slut": "ÖVR",
            "falt": SUMMOR_2018, **MED_VALKRETS,
        },
        2022: {
            "url": "https://www.val.se/download/18.162047b519a91d0533118f4d/1764336772618/roster-per-distrikt-slutligt-antal-roster-inklusive-totalt-valdeltagande-regionval-2022.xlsx",
            "blad": "roster_RF",
            "kalla": ("Valmyndigheten, Röster per distrikt, slutligt antal "
                      "röster inklusive totalt valdeltagande, regionval 2022"),
            "las": "lang",
        },
        2026: {
            "kalla": ("Valmyndigheten, resultatfiler för valen 2026, "
                      "regionvalet i Hallands län"),
            "las": "json2026",
        },
    },
    "riksdag": {
        2010: {
            "url": HISTORIK_2010 + "slutligt_valresultat_valdistrikt_R.skv",
            "kalla": ("Valmyndigheten, Slutligt valresultat per valdistrikt, "
                      "riksdagsvalet 2010"),
            "las": "bred", "steg": 2, "parti_slut": "OVR",
            "falt": SUMMOR_GAMLA_R, **SMAL,
        },
        2014: {
            "url": HISTORIK_2014 + "2014_riksdagsval_per_valdistrikt.skv",
            "kalla": "Valmyndigheten, Riksdagsval per valdistrikt 2014",
            "las": "bred", "steg": 2, "parti_slut": "OVR",
            "falt": SUMMOR_GAMLA_R, **MED_VALKRETS,
        },
        2018: {
            "url": HISTORIK_2018 + "2018_R_per_valdistrikt.xlsx",
            "blad": "R antal",
            "kalla": "Valmyndigheten, Riksdagsval per valdistrikt 2018",
            "las": "bred", "steg": 1, "parti_slut": "ÖVR",
            "falt": SUMMOR_2018, **MED_VALKRETS,
        },
        2022: {
            "url": "https://www.val.se/download/18.162047b519a91d0533118f4b/1764336897948/Roster-per-distrikt-slutligt-antal-roster-inklusive-totalt-valdeltagande-riksdagsvalet-2022.xlsx",
            "blad": "roster_RD",
            "kalla": ("Valmyndigheten, Röster per distrikt, slutligt antal "
                      "röster inklusive totalt valdeltagande, riksdagsvalet "
                      "2022"),
            "las": "lang",
        },
        2026: {
            "kalla": ("Valmyndigheten, resultatfiler för valen 2026, "
                      "riksdagsvalet"),
            "las": "json2026",
        },
    },
}

AR = [2010, 2014, 2018, 2022, 2026]

JAMFORBARHET = {
    "2014-2018": {
        "url": HISTORIK_2018 + "mappning_2014_2018.zip",
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


def sida_for(ar: int) -> str:
    return RADATA_2026 if ar == 2026 else RADATA_2002_2022


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


# ---------- Läsare, ett format i taget ----------

def las_skv(raa: bytes):
    """Valmyndighetens .skv: Latin-1, semikolon, CR eller CRLF."""
    text = raa.decode("latin-1").replace("\r\n", "\n").replace("\r", "\n")
    return [rad.split(";") for rad in text.split("\n") if rad.strip()]


def kod_ur_delar(lan: str, kom: str, dist: str) -> str:
    """Länskod, kommunkod och distriktsnummer -> åttasiffrig kod. De
    äldre filerna nollutfyller olika: 2010 skriver "0301", 2014 "201"."""
    return f"{int(lan):02d}{int(kom):02d}{int(dist):04d}"


def las_bred(raa: bytes, kalla: dict, ar: int):
    """Filerna som har en kolumn per parti (2010, 2014 och 2018).

    Partikolumnerna löper från första datakolumnen till och med den som
    heter ÖVR (OVR i riksdagsvalets äldre filer); efter den kommer
    blanka, ogiltiga och summorna. Alla nio filerna är byggda så.
    """
    rader = las_blad(raa, kalla["blad"]) if kalla.get("blad") else las_skv(raa)
    rub = [(c or "").strip() for c in rader[0]]
    # Filerna med både antal och procent per parti skriver "M tal" och
    # "M proc"; bara antalet läses, och rubriken är då partiets namn.
    if kalla["steg"] == 2:
        rub = [c[:-4] if c.endswith(" tal") else c for c in rub]
    slut = rub.index(kalla["parti_slut"])
    kommun_kol, distrikt_kol = kalla["kommun_kol"], kalla["distrikt_kol"]
    kod_delar = kalla["kod_delar"]
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
        for i in range(kalla["etiketter"], slut + 1, kalla["steg"]):
            lagg_till(d, tolka_parti(rub[i], tal(rad[i]), 0, ar, okanda),
                      tal(rad[i]), ar)
        for nyckel, rubrik in kalla["falt"].items():
            d[nyckel] = tal(rad[rub.index(rubrik)])
        ut.append(d)
    return ut, okanda, len(rader) - 1


def las_lang(raa: bytes, kalla: dict, ar: int):
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
            lagg_till(d, tolka_parti(post, antal, 0, ar, okanda), antal, ar)
    return list(per_kod.values()), okanda, len(rader) - 1


def rostfordelningen(raa: bytes) -> dict:
    """JSON-filen med röstfördelningen ur 2026 års zip."""
    z = zipfile.ZipFile(BytesIO(raa))
    namn = [n for n in z.namelist()
            if "rostfordelning" in n and n.endswith(".json")]
    if not namn:
        sys.exit("Röstfördelningsfilen saknas i 2026 års zip")
    return json.loads(z.read(namn[0]))


def kungsbackas_distrikt(data: dict) -> list:
    """Kungsbackas rader ur 2026 års fil. Kommunvalets fil innehåller
    bara Kungsbacka, regionvalets hela länet och riksdagsvalets hela
    riket – kommunkoden avgör, inte filen."""
    return [v for v in data["valdistrikt"]
            if str(v.get("kommunkod") or "") == KOMMUN]


def las_2026(raa: bytes, kalla: dict, ar: int):
    data = rostfordelningen(raa)
    distrikt, okanda = [], {}
    for v in kungsbackas_distrikt(data):
        d = nytt_distrikt(v["valdistriktskod"], v["namn"])
        d["uppsamling"] = v.get("valdistriktstyp") == "uppsamlingsdistrikt"
        d["rostberattigade"] = v.get("antalRostberattigade") or 0
        d["rostande"] = v.get("totaltAntalRoster") or 0
        rf = v.get("rostfordelning") or {}
        pm = rf.get("rosterPaverkaMandat") or {}
        d["giltiga"] = pm.get("antalRoster") or 0
        for p in pm.get("partiRoster") or []:
            # Den slutliga räkningen tar med småpartier som saknar
            # förkortning; då får partibeteckningen tala för dem.
            rubrik = p.get("partiforkortning") or p.get("partibeteckning")
            lagg_till(d, tolka_parti(rubrik, p["antalRoster"], 0, ar, okanda),
                      p["antalRoster"], ar)
        lagg_till(d, OVRIGA, (pm.get("rosterOvrigaPartier") or {})
                  .get("antalRoster") or 0, ar)
        ej = rf.get("rosterEjPaverkaMandat") or {}
        d["blanka"] = (ej.get("blankaRoster") or {}).get("antalRoster") or 0
        d["ogiltiga"] = (ej.get("ovrigaOgiltiga") or {}).get("antalRoster") or 0
        d["ejAnmalt"] = ((ej.get("rosterEjAnmaltDeltagande") or {})
                         .get("antalRoster") or 0)
        distrikt.append(d)
    return distrikt, okanda, len(data["valdistrikt"])


LASARE = {"bred": las_bred, "lang": las_lang, "json2026": las_2026}


# ---------- 2026: vilken räkning som finns ----------

def url_2026(gren: str, rakning: str, val: dict) -> str:
    return FIL_2026.format(gren=gren, rakning=rakning,
                           valtyp=val["valtyp"].lower(),
                           VALTYP=val["valtyp"], omrade=val["omrade2026"])


def raknad(raa: bytes) -> bool:
    """Är Kungsbacka färdigräknat i den här filen? Den slutliga räkningen
    publiceras så fort det första distriktet i landet är klart, och en fil
    där Kungsbackas distrikt ännu saknar röstfördelning säger mindre än
    den preliminära räkningen gör."""
    fysiska = [v for v in kungsbackas_distrikt(rostfordelningen(raa))
               if v.get("valdistriktstyp") != "uppsamlingsdistrikt"]
    return bool(fysiska) and all(v.get("rostfordelning") for v in fysiska)


def hamta_2026(val: dict):
    """Slutlig räkning om den är klar för Kungsbacka, annars preliminär.
    Returnerar (rådata, url, räkningstillfälle)."""
    index = hamta(INDEX_2026).decode("utf-8", "replace")
    for gren, rakning in (("s", "slutlig"), ("p", "preliminar")):
        stig = (f"./{gren}/{val['valtyp'].lower()}/"
                f"Val_2026_{rakning}_{val['omrade2026']}_{val['valtyp']}.zip")
        if stig not in index:
            continue
        url = url_2026(gren, rakning, val)
        raa = hamta(url)
        if gren == "p" or raknad(raa):
            return raa, url, "slutlig" if gren == "s" else "preliminär"
        print("  den slutliga räkningen har ännu inte nått Kungsbacka "
              "– tar den preliminära")
    sys.exit(f"Ingen resultatfil för {val['kort']} i Kungsbacka finns i "
             f"{INDEX_2026} – valet är kanske inte räknat än")


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
    for v in kungsbackas_distrikt(distrikt_2026_raa):
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


def hamta_valet(valnyckel: str, ar_att_hamta: list) -> tuple:
    """Hämtar ett val, år för år. Returnerar distrikten per år och 2026
    års råa JSON, som jämförbarheten 2022–2026 läses ur."""
    val = VALEN[valnyckel]
    ut_mapp = ROT / "data" / val["mapp"]
    distrikt_per_ar, raa_2026 = {}, None
    for ar in ar_att_hamta:
        kalla = dict(KALLOR[valnyckel][ar])
        print(f"Hämtar {val['kort']} {ar} …")
        if ar == 2026:
            raa, kalla["url"], rakning = hamta_2026(val)
            kalla["rakningstillfalle"] = rakning
            print(f"  {rakning} räkning: {kalla['url']}")
            raa_2026 = rostfordelningen(raa)
        else:
            raa = hamta(kalla["url"])
        distrikt, okanda, rader_i_kallan = LASARE[kalla["las"]](raa, kalla, ar)
        granska(ar, distrikt, okanda)
        distrikt.sort(key=lambda d: d["kod"])
        distrikt_per_ar[ar] = distrikt
        data = {
            "val": val["namn"],
            "ar": ar,
            "kalla": kalla["kalla"], "kallaUrl": kalla["url"],
            "sidaUrl": sida_for(ar),
            "hamtad": date.today().isoformat(),
            "raderIKallan": rader_i_kallan,
            "distrikt": distrikt,
        }
        if kalla.get("blad"):
            data["blad"] = kalla["blad"]
        if kalla.get("rakningstillfalle"):
            data["rakningstillfalle"] = kalla["rakningstillfalle"]
        andrad = skriv(ut_mapp / f"{ar}.json", data)
        fysiska = [d for d in distrikt if not d["uppsamling"]]
        print(f"  {len(fysiska)} valdistrikt, "
              f"{sum(d['giltiga'] for d in distrikt)} giltiga röster"
              f"{'' if andrad else ' (oförändrad)'}")
    return distrikt_per_ar, raa_2026


def ur_resultatfilerna(hamtat: dict) -> dict:
    """De två övergångar som räknas fram ur valens egna resultatfiler,
    ett val i taget: {valnyckel: {övergång: bedömning}}."""
    return {valnyckel: {
        "2010-2014": jamforbarhet_2010_2014(distrikt_per_ar),
        "2022-2026": jamforbarhet_2022_2026(raa_2026),
    } for valnyckel, (distrikt_per_ar, raa_2026) in hamtat.items()}


def kontrollera_delad(per_val: dict) -> dict:
    """Valdistriktens jämförbarhet hör till distrikten och inte till
    valet: samma distrikt röstar i alla tre valen, och ritas ett distrikt
    om gäller det alla tre. Filen är därför gemensam. Att de två
    övergångar som räknas fram ur resultatfilerna verkligen säger samma
    sak i de tre valen kontrolleras hellre än antas."""
    valen = sorted(per_val)
    forst = valen[0]
    for annat in valen[1:]:
        for nyckel, bedomning in per_val[forst].items():
            if per_val[annat][nyckel] != bedomning:
                sys.exit(f"Valdistriktens jämförbarhet {nyckel} ser "
                         f"annorlunda ut i {VALEN[annat]['kort']} än i "
                         f"{VALEN[forst]['kort']}. Indelningen ska vara "
                         f"densamma i alla tre valen – kontrollera källorna.")
    return per_val[forst]


def hamta_jamforbarhet(hamtat: dict) -> None:
    print("Hämtar jämförbarheten mellan valen …")
    egna = kontrollera_delad(ur_resultatfilerna(hamtat))
    ut = {"kalla": {}, "overgangar": {"2010-2014": egna["2010-2014"]}}
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
    ut["overgangar"]["2022-2026"] = egna["2022-2026"]
    ut["kalla"]["2022-2026"] = {
        "kalla": ("Valmyndigheten, resultatfilerna för 2026 "
                  "(valdistriktskodForegaendeVal och statusJamforelse)"),
        "kallaUrl": INDEX_2026, "sidaUrl": RADATA_2026}
    ut["hamtad"] = date.today().isoformat()
    skriv(DELAT / "jamforbarhet.json", ut)
    print("  kontrollerad mot " + ", ".join(VALEN[v]["kort"] for v in sorted(hamtat)))
    for nyckel, overgang in sorted(ut["overgangar"].items()):
        ja = sum(1 for v in overgang.values() if v["jamforbart"])
        print(f"  {nyckel}: {ja} av {len(overgang)} distrikt jämförbara")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--val", choices=sorted(VALEN),
                   help="hämta bara det här valet")
    p.add_argument("--ar", type=int, choices=AR,
                   help="hämta bara det här året")
    args = p.parse_args()
    valen = [args.val] if args.val else sorted(VALEN)
    ar_att_hamta = [args.ar] if args.ar else AR

    hamtat = {}
    for valnyckel in valen:
        hamtat[valnyckel] = hamta_valet(valnyckel, ar_att_hamta)

    # Jämförbarheten vilar på alla fem åren och hämtas därför bara vid en
    # full körning. Den är gemensam för de tre valen, och de val som
    # hämtats den här körningen får säga emot varandra innan den skrivs.
    if not args.ar:
        hamta_jamforbarhet(hamtat)


if __name__ == "__main__":
    main()
