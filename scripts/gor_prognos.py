#!/usr/bin/env python3
"""Ställer EN prognos för förtidsröstningen 2026 och fryser den till
data/fortidsroster/prognos.json.

Det här skriptet är avsiktligt ett engångsskript. Det körs en gång, vid
den brytpunkt som står i BRYTPUNKT, och filen det skriver ändras sedan
inte: en prognos som tyst räknar om sig varje dag kan aldrig ha fel, och
är därför inte värd något. Den här går att hålla räkning på. Därför
vägrar skriptet skriva över en befintlig fil utan --skriv-om, och
hämtjobbet i .github/workflows/fortidsroster.yml kör det inte.

Modellen, i sin helhet:

  I vart och ett av de tidigare valen var en viss andel av slutsumman
  inne vid samma antal dagar kvar till valdagen. Andelen har varit
  påfallande lika mellan valen. Årets tal delat med genomsnittet av de
  andelarna ger en slutsumma.

  Återstående dagar ritas som förra valets dagsmönster uppräknat med en
  faktor, så att helgdipparna och slutveckans ryck följer med. Varje
  scenario är just en sådan faktor: faktor 1 betyder att resten av
  perioden ger lika många röster som förra valet gav efter samma punkt
  (försprånget är då bara tidigareläggning, inte fler väljare), en
  faktor över 1 att försprånget håller i sig.

Osäkerheten sitter inte i räkningen utan i tolkningen: datat kan inte
skilja fler förtidsröstare från samma väljare tidigare. Därför skrivs
ett omfång, inte ett tal, och modellen prövas dessutom på de val som
redan är avgjorda – i samma område, vid samma punkt och på exakt det
sätt den används nu – så att felet går att läsa av i stället för att
uppskattas. Alla de valen följde ett stabilt mönster, så det felet är
ett golv för osäkerheten, inte ett tak.

Läser:
  data/fortidsroster/mottagna_<år>.csv    (Valmyndighetens filer orörda)

Skriver:
  data/fortidsroster/prognos.json         (en gång)

Körs:  python3 scripts/gor_prognos.py [--skriv-om]
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

from hamta_fortidsroster import VAL, tolka_csv

ROT = Path(__file__).resolve().parent.parent
IN_MAPP = ROT / "data" / "fortidsroster"
UT_FIL = IN_MAPP / "prognos.json"

AKTUELLT = 2026

# Prognosen ställs vid den här dagen: den sista *avslutade* dagen när
# den ställdes. Aldrig en pågående dag – dess siffra är ofullständig
# fram till nästa morgon.
BRYTPUNKT = "2026-09-03"

# Bara de två områden prognosen gäller. Fler områden vore fler
# engångsprognoser, inte en.
OMRADEN = {"00": "Hela riket", "1384": "Kungsbacka"}

METOD = ("Andelen av slutsumman som var inne vid samma antal dagar kvar "
         "till valdagen i tidigare val, tillämpad på årets tal. Omfånget "
         "går mellan två ytterlägen: att försprånget mot förra valet bara "
         "är tidigareläggning, och att det håller i sig hela vägen.")


def las_serier() -> dict:
    """{år: {dagar kvar: {"antal", "ack"}}} för varje område i OMRADEN,
    som {kod: {år: serie}}."""
    ut = {kod: {} for kod in OMRADEN}
    for fil in sorted(IN_MAPP.glob("mottagna_*.csv")):
        ar = int(fil.stem.split("_")[1])
        datum, rader = tolka_csv(fil.read_bytes())
        valdag = date.fromisoformat(VAL[ar]["valdag"])
        lokaler = [r for r in rader if r["LOKALID"]]
        for kod in OMRADEN:
            egna = (lokaler if kod == "00" else
                    [r for r in lokaler if r["LÄNSKOD"] + r["KOMMUNKOD"] == kod])
            serie, ack = {}, 0
            for d in datum:
                antal = sum(r["perDag"].get(d, 0) for r in egna)
                ack += antal
                serie[(valdag - date.fromisoformat(d)).days] = {"antal": antal, "ack": ack}
            ut[kod][ar] = serie
    return ut


def slutsumma(serie: dict) -> int:
    return serie[min(serie)]["ack"]


def andel_inne(serie: dict, kvar: int):
    """Andelen av slutsumman som var inne vid `kvar` dagar kvar."""
    total = slutsumma(serie)
    if kvar not in serie or not total:
        return None
    return serie[kvar]["ack"] / total


def traffsakerhet(fardiga: dict, kvar: int):
    """Modellen prövad på de val som redan är avgjorda, på exakt det sätt
    den används nu: varje val förutsagt ur snittet av de val som låg före
    det. Fel i procent."""
    fel = []
    aren = sorted(fardiga)
    for i, mal in enumerate(aren[1:], start=1):
        andelar = [a for a in (andel_inne(fardiga[k], kvar) for k in aren[:i]) if a]
        if not andelar or kvar not in fardiga[mal]:
            continue
        gissat = fardiga[mal][kvar]["ack"] / (sum(andelar) / len(andelar))
        fel.append(abs(gissat / slutsumma(fardiga[mal]) - 1) * 100)
    if not fel:
        return None
    return {"antal": len(fel), "medel": round(sum(fel) / len(fel), 2),
            "storsta": round(max(fel), 2)}


def bana(forra: dict, kvar_brytpunkt: int, ack: int, slut: float) -> list:
    """Ett scenario som kurva: förra valets dagsmönster efter brytpunkten,
    uppräknat så att det slutar på `slut`."""
    vid = forra[kvar_brytpunkt]["ack"]
    kvarvarande = slutsumma(forra) - vid
    f = (slut - ack) / kvarvarande if kvarvarande else 0
    return [(k, round(ack + (forra[k]["ack"] - vid) * f))
            for k in range(kvar_brytpunkt, -1, -1) if k in forra]


def stall_prognos(serier: dict, kvar: int) -> dict:
    aren = sorted(a for a in serier if a != AKTUELLT)
    forra_ar = aren[-1]
    nu, forra = serier[AKTUELLT], serier[forra_ar]
    if kvar not in nu:
        sys.exit(f"Brytpunkten {BRYTPUNKT} finns inte i {AKTUELLT} års data")
    ack = nu[kvar]["ack"]

    # Andelarna avrundas bara i utdatan; snittet räknas på de exakta.
    andelar = []
    punkter = []
    for a in sorted(aren, reverse=True):
        andel = andel_inne(serier[a], kvar)
        if andel:
            andelar.append(andel)
            punkter.append({"ar": a, "andel": round(andel, 5),
                            "slut": round(ack / andel)})
    if not punkter:
        sys.exit("Inget tidigare val har data vid brytpunkten")

    snitt = sum(andelar) / len(andelar)
    modell = ack / snitt
    som_forra = ack + (slutsumma(forra) - forra[kvar]["ack"])
    ytterlagen = [p["slut"] for p in punkter] + [som_forra]
    lag, hog = min(ytterlagen), max(ytterlagen)

    banor = {namn: dict(bana(forra, kvar, ack, slut))
             for namn, slut in (("lag", lag), ("modell", modell), ("hog", hog))}
    return {
        "ack": ack,
        "forraValet": forra_ar,
        "forraValetVid": forra[kvar]["ack"],
        "forraValetSlut": slutsumma(forra),
        "snittAndel": round(snitt, 5),
        "punkter": punkter,
        "modell": round(modell),
        "somForra": som_forra,
        "lag": round(lag),
        "hog": round(hog),
        "prov": traffsakerhet({a: serier[a] for a in aren}, kvar),
        "bana": [{"kvar": k, "lag": banor["lag"][k],
                  "modell": banor["modell"][k], "hog": banor["hog"][k]}
                 for k in sorted(banor["modell"], reverse=True)],
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--skriv-om", action="store_true",
                   help="skriv över en redan ställd prognos (gör den inte längre statisk)")
    args = p.parse_args()
    if UT_FIL.exists() and not args.skriv_om:
        sys.exit(f"{UT_FIL.relative_to(ROT)} finns redan. Prognosen är ställd och "
                 f"ska stå kvar; kör med --skriv-om bara om den var felaktig.")

    serier = las_serier()
    valdag = date.fromisoformat(VAL[AKTUELLT]["valdag"])
    kvar = (valdag - date.fromisoformat(BRYTPUNKT)).days

    ut = {
        "stalld": date.today().isoformat(),
        "brytpunkt": {"datum": BRYTPUNKT, "kvar": kvar},
        "val": AKTUELLT,
        "valdag": VAL[AKTUELLT]["valdag"],
        "metod": METOD,
        "kalla": (f"Egen framskrivning ur {VAL[AKTUELLT]['kalla']} "
                  f"t.o.m. {BRYTPUNKT}, med "
                  + ", ".join(str(a) for a in sorted(
                      (a for a in serier["00"] if a != AKTUELLT), reverse=True))
                  + " som mönster."),
        "skript": "scripts/gor_prognos.py",
        "omraden": {kod: dict(stall_prognos(serier[kod], kvar), omrade=namn)
                    for kod, namn in OMRADEN.items()},
    }
    UT_FIL.write_text(json.dumps(ut, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    for kod, namn in OMRADEN.items():
        o = ut["omraden"][kod]
        print(f"{namn}: {o['lag']} – {o['modell']} – {o['hog']} "
              f"(vid {kvar} dagar kvar, {o['ack']} röster inne)")
    print(f"Skrev {UT_FIL.relative_to(ROT)}")


if __name__ == "__main__":
    main()
