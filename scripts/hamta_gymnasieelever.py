#!/usr/bin/env python3
"""Hämtar antalet gymnasieelever per program och årskurs ur Skolverket.

Platssidan visar hur många platser nämnden ställer fram på varje program.
Den frågan har en tvilling: hur många som sedan faktiskt går där. Talet
finns i Skolverkets exporttjänst – samma tjänst som slutbetygen och
genomströmningen redan hämtas ur, på kommunnivå:

  https://siris.skolverket.se/siris/reports/export_api/runexport/
      ?pFormat=csv&pExportID=58&pAr=<år>&pKommun=1384&pFlikar=0

  pExportID=58  Gymnasieskola – Antal elever, per program
  pAr           läsårets första år: 2025 är läsåret 2025/26
  pKommun       skolkommun, 1384 = Kungsbacka

Rapporten redovisar varje program i tre rader – huvudmannatyperna
Samtliga, Kommunal och Enskild – och för var och en antalet elever
totalt, uppdelat på skolår 1, 2 och 3. **Kolumnen "Antal elever skolår
1" är den som svarar mot platserna**: eleverna som började på programmet
det läsåret.

**Skolkommun, inte hemkommun.** Rapporten räknar skolor som *ligger i*
Kungsbacka, oavsett var eleverna bor – samma avgränsning som platserna,
som erbjuds alla sökande oavsett hemkommun. Huvudmannatypen Kommunal är
Kungsbackas två kommunala gymnasieskolor, alltså precis de skolor
nämndens utbudsbeslut gäller.

**Mätpunkten är den 15 oktober**, inte antagningsbeskedet i juni. Den som
antogs men aldrig dök upp, eller hoppade av under september, är inte med;
den som kom till efter antagningen är det. Talet är alltså hur många som
gick på programmet en bit in på terminen, inte hur många som antogs.

Skolverkets prickning skiljer sig åt mellan kolumnerna:

  andelskolumnerna    ".." när färre än tio elever ligger bakom talet,
                      "." när uppgiften saknas – båda blir null
  antalskolumnerna    dubbelprickas aldrig. Punkten betyder att det inte
                      finns några elever, och läses som noll

Att punkten betyder noll är inget antagande: skriptet kontrollerar för
varje rad att skolår 1 + 2 + 3 går ihop med totalen, och avbryter annars.
Kontrollen håller i samtliga rader 2011/12–2025/26.

Ett läsår per fil, data/gymnasieelever/gymnasieelever_<år>.json.

Körs:  python3 scripts/hamta_gymnasieelever.py            # alla läsår
       python3 scripts/hamta_gymnasieelever.py --ar 2025  # ett enskilt
"""

import argparse
import json
from datetime import date
from pathlib import Path

import skolverket

ROT = Path(__file__).resolve().parent.parent
UTKATALOG = ROT / "data" / "gymnasieelever"

EXPORT_ID = 58
FORSTA_AR = 2011         # äldre årgångar har inga rader för Kungsbacka

# Kolumnernas ordning i exportfilen. Kontrollerad läsår för läsår
# 2011/12–2025/26 och oförändrad hela vägen – men kontrolleras vid varje
# inläsning ändå, så att en omlagd export stannar skriptet i stället för
# att flytta talen en kolumn i tysthet.
KOLUMNER = [
    "Kommun", "Kommun-kod", "Län", "Läns-kod", "Typ av huvudman", "Program",
    "Antal elever", "Andel kvinnor (%)", "Andel m utl bakgr (%)",
    "Andel m högutb föräldrar (%)", "Antal elever skolår 1",
    "Antal elever skolår 2", "Antal elever skolår 3",
]

KODER = {
    "..": "Färre än tio elever bakom andelen – Skolverket dubbelprickar den",
    ".": "I andelskolumnerna: uppgiften saknas. I antalskolumnerna: inga elever",
}

# Kolumn i exporten -> fält i utdatan.
ANDELAR = {
    "Andel kvinnor (%)": "andelKvinnor",
    "Andel m utl bakgr (%)": "andelUtlBakgrund",
    "Andel m högutb föräldrar (%)": "andelHogutbForaldrar",
}
ANTAL = {
    "Antal elever": "antal",
    "Antal elever skolår 1": "arskurs1",
    "Antal elever skolår 2": "arskurs2",
    "Antal elever skolår 3": "arskurs3",
}


def lasar(ar: int) -> str:
    return f"{ar}/{str(ar + 1)[-2:]}"


def heltal(text: str, ar: int, program: str, kolumn: str) -> int:
    """Ett tal ur en antalskolumn. Punkten är noll, dubbelprick finns inte.

    Skulle Skolverket börja dubbelpricka antalen vore noll fel svar, och
    null skulle tyst bryta summakontrollen nedan. Då ska skriptet stanna.
    """
    text = text.strip()
    if text == ".":
        return 0
    if text == "..":
        raise SystemExit(
            f"{ar}: {program}, {kolumn} är dubbelprickad. Antalen har aldrig "
            "prickats förut – läs om hur rapporten redovisar antal innan "
            "punkten fortsätter läsas som noll.")
    return int(text.replace("\xa0", "").replace(" ", ""))


def andel(text: str):
    text = text.strip()
    return None if text in KODER or not text else float(text.replace(",", "."))


def las(csvtext: str, ar: int) -> dict:
    rader = skolverket.rader_i(csvtext)
    rubrik_i = skolverket.rubrikrad(rader, "Kommun")
    rubrik = [k.strip() for k in rader[rubrik_i]]
    if rubrik[:len(KOLUMNER)] != KOLUMNER:
        raise SystemExit(f"{ar}: kolumnerna har ändrats – läs om KOLUMNER i "
                         f"skriptet\n  fick: {rubrik[:len(KOLUMNER)]}")
    kol = {namn: i for i, namn in enumerate(rubrik)}

    ut, sedda = [], set()
    for rad in rader[rubrik_i + 1:]:
        # Efter tabellen följer rapportens egna förklaringar som lösa
        # textrader. Bara Kungsbackas rader är data.
        if (len(rad) <= kol["Antal elever skolår 3"]
                or rad[0] != skolverket.KOMMUNNAMN or rad[1] != skolverket.KOMMUN):
            continue
        huvudman = rad[kol["Typ av huvudman"]].strip()
        program = rad[kol["Program"]].strip()
        # Exporten upprepar sina rader; första förekomsten vinner.
        if (huvudman, program) in sedda:
            continue
        sedda.add((huvudman, program))

        post = {"huvudman": huvudman, "program": program}
        for kolumn, falt in ANTAL.items():
            post[falt] = heltal(rad[kol[kolumn]], ar, program, kolumn)
        for kolumn, falt in ANDELAR.items():
            post[falt] = andel(rad[kol[kolumn]])

        delsumma = post["arskurs1"] + post["arskurs2"] + post["arskurs3"]
        if delsumma != post["antal"]:
            raise SystemExit(
                f"{ar}: {huvudman}, {program}: skolår 1–3 summerar till "
                f"{delsumma} men totalen är {post['antal']}. Antingen betyder "
                "punkten inte längre noll, eller så räknar rapporten om "
                "årskurserna – kontrollera innan talen sparas.")
        ut.append(post)

    return {
        "kommun": skolverket.KOMMUNNAMN,
        "kommunkod": skolverket.KOMMUN,
        "niva": "Skolkommun, samtliga gymnasieskolor i kommunen",
        "rapportTitel": "Gymnasieskola – Antal elever, per program",
        "kalla": "Skolverket, utbildningsstatistik",
        "kallaUrl": skolverket.export_url(EXPORT_ID, ar),
        "statistikUrl": skolverket.STATISTIK_URL,
        "matpunkt": "15 oktober",
        "koder": KODER,
        "hamtad": date.today().isoformat(),
        "ar": ar,
        "lasar": skolverket.lasar_ur(rader, "Valt läsår") or lasar(ar),
        "rader": ut,
    }


def spara(argang: dict) -> None:
    UTKATALOG.mkdir(parents=True, exist_ok=True)
    ut = UTKATALOG / f"gymnasieelever_{argang['ar']}.json"
    ut.write_text(json.dumps(argang, ensure_ascii=False, indent=1) + "\n",
                  encoding="utf-8")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--ar", type=int,
                   help="hämta ett enskilt läsår (läsårets första år)")
    args = p.parse_args()

    ar_lista = [args.ar] if args.ar else range(FORSTA_AR, date.today().year + 1)

    for ar in ar_lista:
        argang = las(skolverket.hamta_csv(EXPORT_ID, ar), ar)
        if not argang["rader"]:
            # Läsårets statistik publiceras våren därpå. Att de senaste
            # läsåren är tomma är väntat och avslutar hämtningen.
            print(f"{ar}: ingen statistik publicerad ännu")
            if not args.ar:
                break
            continue
        spara(argang)
        akt1 = next((r["arskurs1"] for r in argang["rader"]
                     if r["huvudman"] == "Kommunal"
                     and r["program"] == "Nationella program"), None)
        print(f"{ar} (läsåret {argang['lasar']}): {len(argang['rader'])} rader, "
              f"{akt1} elever i årskurs 1 på kommunala nationella program")


if __name__ == "__main__":
    main()
