#!/usr/bin/env python3
"""Hämtar grundskolans kostnader per elev ur Kolada, för Kungsbacka och riket.

Kolada drivs av Rådet för främjande av kommunala analyser (RKA) och
samlar kommunernas nyckeltal. Kostnadsnyckeltalen bygger på kommunernas
räkenskapssammandrag och är samma underlag som Skolverket publicerar –
men Kolada redovisar också **riket** som ett eget område (kommunkod
0000), och gör det oavrundat. Det är därför sidans huvudkälla:
riksgenomsnittet blir ett publicerat tal i stället för ett vi räknar
fram själva, och Kungsbacka går att ställa mot det utan mellanled.

Två sätt att räkna kostnaden hämtas, för att de svarar på olika frågor:

  hemkommun (N15006)  Vad kommunen lägger på de elever som *bor* i
                      kommunen, oavsett var de går i skolan – alltså
                      inklusive ersättning till fristående skolor och
                      andra kommuner, och inklusive skolskjuts.
  kommunal (N15008)   Vad kommunens *egna* skolor kostar, per elev i dem.
                      Skolskjuts ingår inte. Det är det mått Skolverket
                      publicerar, och det enda som går att bryta ned på
                      kostnadsslag.

Kostnadsslagen (undervisning, lokaler, måltider, lärverktyg, elevhälsa,
övrigt) hör till det senare måttet och summerar till det.

API:t (v3; v2 är avvecklat):

  https://api.kolada.se/v3/data/kpi/<nyckeltal>/municipality/<kommuner>

Talen är i löpande priser. Omräkningen till fasta priser görs i bygget,
med KPI från hamta_kpi.py.

Resultatet sparas till data/kolada/kostnader_grundskola.json, med
nyckeltalens egna definitioner så att sidan kan visa vad varje serie
faktiskt mäter.

Körs:  python3 scripts/hamta_kolada.py
"""

import json
import ssl
import urllib.request
from datetime import date
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent

API = "https://api.kolada.se/v3"
# Mänsklig ingång till samma siffror, för källförteckningen på hemsidan.
KOLADA_URL = "https://www.kolada.se/"

OMRADEN = [
    {"kod": "1384", "namn": "Kungsbacka"},
    {"kod": "0000", "namn": "Riket"},
]

# De två sätten att räkna kostnaden per elev.
MATT = [
    {"nyckel": "hemkommun", "kolada": "N15006",
     "etikett": "Elever som bor i kommunen",
     "kort": "hemkommun"},
    {"nyckel": "kommunal", "kolada": "N15008",
     "etikett": "Kommunens egna skolor",
     "kort": "kommunal huvudman"},
]

# Kostnadsslagen inom "kommunens egna skolor". De summerar till N15008.
KOSTNADSSLAG = [
    {"nyckel": "undervisning", "kolada": "N15011", "etikett": "Undervisning"},
    {"nyckel": "lokaler", "kolada": "N15009", "etikett": "Lokaler och inventarier"},
    {"nyckel": "ovrigt", "kolada": "N15010", "etikett": "Övrigt"},
    {"nyckel": "maltider", "kolada": "N15013", "etikett": "Måltider"},
    {"nyckel": "larverktyg", "kolada": "N15012", "etikett": "Lärverktyg och skolbibliotek"},
    {"nyckel": "elevhalsa", "kolada": "N15014", "etikett": "Elevhälsa"},
]

# Skolskjutsen ingår i hemkommunmåttet men inte i skolornas kostnad, och
# redovisas därför för sig.
OVRIGA = [
    {"nyckel": "skolskjuts", "kolada": "U15015",
     "etikett": "Skolskjuts, reseersättning och inackordering"},
]

ALLA = MATT + KOSTNADSSLAG + OVRIGA


def hamta(url: str) -> dict:
    req = urllib.request.Request(
        url, headers={"User-Agent": "kungsbacka-i-siffror/1.0"})
    with urllib.request.urlopen(req, timeout=90,
                                context=ssl.create_default_context()) as resp:
        return json.loads(resp.read().decode("utf-8"))


def hamta_definitioner(nyckeltal: list) -> dict:
    """Nyckeltalens titel och definition, som de står i Kolada."""
    svar = hamta(f"{API}/kpi/{','.join(nyckeltal)}")
    return {k["id"]: {"titel": k["title"],
                      "definition": " ".join(k["description"].split()),
                      "kalla": k.get("auspice"),
                      "publicerad": k.get("publication_date")}
            for k in svar.get("values", [])}


def hamta_serier(nyckeltal: list, omraden: list) -> dict:
    """{nyckeltal: {kommunkod: {år: värde}}}, oavrundat.

    Kolada svarar med en post per nyckeltal, område och år, och sidbryter
    svaret (högst 5000 poster åt gången) – nästa sida pekas ut av
    `next_url`, som följs tills den tar slut. Poster utan värde (status
    "Missing") hoppas över i stället för att bli nollor."""
    url = (f"{API}/data/kpi/{','.join(nyckeltal)}"
           f"/municipality/{','.join(omraden)}?per_page=5000")
    ut = {}
    while url:
        svar = hamta(url)
        for rad in svar.get("values", []):
            for v in rad.get("values", []):
                if v.get("gender") not in (None, "T"):
                    continue      # serierna är inte könsuppdelade
                if v.get("value") is None:
                    continue
                (ut.setdefault(rad["kpi"], {})
                   .setdefault(rad["municipality"], {})[str(rad["period"])]) = v["value"]
        url = svar.get("next_url") if svar.get("values") else None
    return ut


def main() -> None:
    nyckeltal = [m["kolada"] for m in ALLA]
    koder = [o["kod"] for o in OMRADEN]

    definitioner = hamta_definitioner(nyckeltal)
    serier = hamta_serier(nyckeltal, koder)

    saknade = [n for n in nyckeltal if n not in serier]
    if saknade:
        raise SystemExit(f"Kolada svarade utan data för {', '.join(saknade)} – "
                         "nyckeltalen kan ha bytt beteckning.")

    poster = []
    for m in ALLA:
        rad = dict(m)
        rad["definition"] = definitioner.get(m["kolada"], {}).get("definition")
        rad["koladaTitel"] = definitioner.get(m["kolada"], {}).get("titel")
        rad["omraden"] = {
            kod: dict(sorted(serier[m["kolada"]].get(kod, {}).items()))
            for kod in koder
        }
        poster.append(rad)

    ut = {
        "omraden": OMRADEN,
        "matt": "Kostnad för grundskolan per elev, kalenderår, löpande priser",
        "kalla": "Kolada (Rådet för främjande av kommunala analyser, RKA), "
                 "nyckeltal ur kommunernas räkenskapssammandrag",
        "kallaUrl": KOLADA_URL,
        "apiUrl": f"{API}/data/kpi/{','.join(nyckeltal)}"
                  f"/municipality/{','.join(koder)}",
        "hamtad": date.today().isoformat(),
        "nyckeltal": poster,
    }

    utfil = ROT / "data" / "kolada" / "kostnader_grundskola.json"
    utfil.parent.mkdir(parents=True, exist_ok=True)
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n",
                     encoding="utf-8")

    print(f"Skrev {len(poster)} nyckeltal till {utfil}")
    for rad in poster:
        for kod, varden in rad["omraden"].items():
            if not varden:
                print(f"  {rad['kolada']} {rad['nyckel']:13s} {kod}: inga år")
                continue
            ar = sorted(varden)
            print(f"  {rad['kolada']} {rad['nyckel']:13s} {kod}: "
                  f"{ar[0]}–{ar[-1]} ({len(ar)} år), "
                  f"senast {varden[ar[-1]]:.0f} kr")


if __name__ == "__main__":
    main()
