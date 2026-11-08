"""Hämtar ersättarna i Kungsbackas kommunfullmäktige efter valen 2022 och 2026,
med plats på valsedeln, ur Valmyndighetens "ledamöter och ersättare, utökad".

Källa: https://resultat.val.se/filer/val<år>/info/ledamoter_och_ersattare_utokad.csv
(länkad från https://www.val.se/valresultat-och-statistik/riksdags--region--och-kommunval/nuvarande-och-avgangna-ledamoter).
Filen har en rad per ledamot *och* ersättare (korsprodukt inom partiets
ersättargrupp); här plockas varje ersättare ut en gång, med sin
ersättarordning. Listplatsen fås genom att namnet matchas mot partiets lista
i data/kandidater/<år>.json, på samma sätt som för ledamöterna.

Filen visar den *nuvarande* uppsättningen (datumet står i filens första rad
och sparas som `uppgift_per`), inte de ursprungligen utsedda: för 2022 kan
ersättare ha tillkommit eller avgått under perioden. Det finns ingen
ursprungsfil för ersättare hos Valmyndigheten, och för 2010, 2014 och 2018
finns inga ersättarfiler alls (sökt 2026-11-08, se data/KALLOR.md).

Kontroller som avbryter hellre än sparar fel: varje namn ska matcha exakt en
plats på partiets lista, och varje parti i fullmäktige ska ha minst en
ersättare.

Skriver data/valda/ersattare_<år>.json. Körs: python3 scripts/hamta_kf_ersattare.py
"""

import csv
import io
import json
import re
import sys
from datetime import date
from pathlib import Path

from hamta_valda_historik import PARTI, listor_per_parti, matcha_listplats
from val import hamta

ROT = Path(__file__).resolve().parent.parent
UT = ROT / "data" / "valda"
KALLA = {ar: f"https://resultat.val.se/filer/val{ar}/info/ledamoter_och_ersattare_utokad.csv" for ar in (2022, 2026)}


def ersattare_ur_csv(raa: bytes, per_parti: dict) -> tuple:
    """([{parti, ordning, namn, kandidatnummer, personvald, listplats, namn_pa_listan}], uppgift_per)."""
    text = raa.decode("utf-8-sig", "replace").replace("\r\n", "\n").replace("\r", "\n")
    rows = list(csv.reader(io.StringIO(text), delimiter=";"))
    m = re.search(r"Valmyndigheten (\d{4}-\d\d-\d\d)", text[:200])
    uppgift_per = m.group(1) if m else None
    hi = next(i for i, r in enumerate(rows) if "Valtyp" in r)
    ix = {n: k for k, n in enumerate(rows[hi])}
    sett, ut = set(), []
    for r in rows[hi + 1:]:
        if len(r) <= ix["Namn ersättare"] or r[0] != "KF" or r[ix["Kommun"]] != "Kungsbacka":
            continue
        namn = r[ix["Namn ersättare"]].strip()
        if not namn:
            continue
        parti = PARTI.get(r[ix["Partiförkortning"]], r[ix["Partiförkortning"]])
        nyckel = (parti, r[ix["Kandidatnummer ersättare"]], namn)
        if nyckel in sett or parti not in per_parti:
            continue
        sett.add(nyckel)
        träffar = matcha_listplats(namn, per_parti[parti])
        if len(träffar) != 1:
            sys.exit(f"{namn} ({parti}) matchar {len(träffar)} platser på listan – tolkas inte")
        ut.append({"parti": parti, "ordning": int(r[ix["Ersättarordning"]]), "namn": namn,
                   "kandidatnummer": r[ix["Kandidatnummer ersättare"]],
                   "personvald": r[ix["Personvald ersättare"]].strip().lower().startswith("j"),
                   "listplats": träffar[0]["plats"], "namn_pa_listan": träffar[0]["namn"]})
    ut.sort(key=lambda e: (e["parti"], e["ordning"]))
    return ut, uppgift_per


def main() -> None:
    UT.mkdir(parents=True, exist_ok=True)
    for ar, url in KALLA.items():
        per_parti = listor_per_parti(ar)
        rader, uppgift_per = ersattare_ur_csv(hamta(url), per_parti)
        saknas = sorted(set(per_parti) - {r["parti"] for r in rader})
        if saknas:
            sys.exit(f"{ar}: inga ersättare för {saknas} – ändrad fil?")
        ut = {"val": ar, "valtyp": "KF", "kommun": "1384", "kalla": url, "hamtad": date.today().isoformat(),
              "uppgift_per": uppgift_per,
              "observera": "Nuvarande ersättare enligt Valmyndigheten vid uppgift_per, inte de ursprungligen utsedda.",
              "ersattare": rader}
        (UT / f"ersattare_{ar}.json").write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        per = {}
        for r in rader:
            per.setdefault(r["parti"], []).append(r["listplats"])
        print(ar, uppgift_per, {p: v for p, v in sorted(per.items())})


if __name__ == "__main__":
    main()
