#!/usr/bin/env python3
"""Hämtar Valmyndighetens statistik över mottagna förtidsröster, dag för
dag och per röstningslokal i hela landet, och sparar filen orörd.

Valmyndigheten publicerar en fil per val med en rad per röstningslokal i
hela landet, en kolumn per dag under förtidsröstningsperioden och en
SUMMA-rad för riket:

  2026  https://data.val.se/filer/val2026/rostmottagning/mottagna-fortidsroster-val2026.csv
        uppdateras kl. 06 och 14 varje dag under perioden; siffrorna är
        preliminära och kan justeras fram till den 16 september 2026
  2022  https://data.val.se/filer/val2022/rostmottagning/fortidsroster.csv
        historisk, ändras inte
  2018, 2014, 2010
        historik.val.se/val/val<år>/rostmottagning/fortidsrostning/mottagna_fortidsroster.skv
        Valmyndighetens äldre valpresentationer; historiska

Filerna är *inte* identiska i format. 2026 års fil är UTF-8 med BOM,
radbruten med LF och har rena datum som kolumnrubriker. 2022 års fil är
Latin-1, radbruten med enbart CR (vagnretur) och har kolumnrubriker som
"2022-08-24 00:00:00". De äldre filerna är Latin-1 med LF och har
rubrikerna med små bokstäver ("lan;län;kom;kommun;lokalid;lokal;…;Totalt").
Tolkningen här klarar alla: teckenkodningen provas som UTF-8 först och
faller tillbaka på Latin-1, alla slags radbrytningar normaliseras,
rubrikerna översätts till 2026 års namn, och datumet läses ur början av
rubriken. Hämtningen tolkar filen bara för att kontrollera att layouten
inte ändrats; det som sparas är originalet, byte för byte, i
data/fortidsroster/mottagna_<år>.csv. Filtreringen till kommun, län
eller rike görs i build_fortidsroster.py.

Filen skrivs bara om när innehållet faktiskt ändrats, och tidsstämpeln i
data/fortidsroster/hamtad.json anger därför när datat senast ändrades –
inte när skriptet senast kördes. Det är den uppgift sidan visar som
"senast uppdaterad", och det gör att det schemalagda jobbet inte
committar tomma ändringar.

Körs:  python3 scripts/hamta_fortidsroster.py            # 2026
       python3 scripts/hamta_fortidsroster.py --ar 2022  # en historisk
"""

import argparse
import csv
import json
import re
import ssl
import sys
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROT = Path(__file__).resolve().parent.parent
UT_MAPP = ROT / "data" / "fortidsroster"
HAMTAD_FIL = UT_MAPP / "hamtad.json"

# ---------- Valen ----------
HISTORIK = "https://historik.val.se/val/val{ar}/rostmottagning/fortidsrostning/mottagna_fortidsroster.skv"
HISTORIK_SIDA = "https://historik.val.se/val/val{ar}/statistik/index.html"

VAL = {
    2026: {
        "valdag": "2026-09-13",
        "url": "https://data.val.se/filer/val2026/rostmottagning/mottagna-fortidsroster-val2026.csv",
        "sidaUrl": "https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-val-2026",
        "kalla": "Valmyndigheten, Mottagna förtidsröster, val 2026",
        # Valmyndigheten anger att siffrorna kan justeras fram till dess
        "preliminarTom": "2026-09-16",
    },
    2022: {
        "valdag": "2022-09-11",
        "url": "https://data.val.se/filer/val2022/rostmottagning/fortidsroster.csv",
        "sidaUrl": "https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-fran-val-2002-2022",
        "kalla": "Valmyndigheten, Förtidsröster, val 2022 (rådata)",
        "preliminarTom": None,
    },
}
for _ar, _valdag in ((2018, "2018-09-09"), (2014, "2014-09-14"), (2010, "2010-09-19")):
    VAL[_ar] = {
        "valdag": _valdag,
        "url": HISTORIK.format(ar=_ar),
        "sidaUrl": HISTORIK_SIDA.format(ar=_ar),
        "kalla": f"Valmyndigheten, Mottagna förtidsröster, val {_ar} (valpresentationen)",
        "preliminarTom": None,
    }

TIDSZON = ZoneInfo("Europe/Stockholm")

# Kolumner som måste finnas, oavsett år
FASTA_KOLUMNER = ["LÄNSKOD", "LÄN", "KOMMUNKOD", "KOMMUN", "LOKALID", "LOKAL", "TOTAL"]

# De äldre filernas rubriker, översatta till 2026 års namn
RUBRIKALIAS = {"lan": "LÄNSKOD", "län": "LÄN", "kom": "KOMMUNKOD", "kommun": "KOMMUN",
               "lokalid": "LOKALID", "lokal": "LOKAL", "totalt": "TOTAL"}


def csv_sokvag(ar: int) -> Path:
    return UT_MAPP / f"mottagna_{ar}.csv"


def hamta(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "kungsbacka-i-siffror"})
    with urllib.request.urlopen(req, timeout=120,
                                context=ssl.create_default_context()) as resp:
        return resp.read()


def avkoda(raa: bytes) -> str:
    """UTF-8 (med eller utan BOM) om det går, annars Latin-1."""
    try:
        return raa.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raa.decode("latin-1")


def tolka_csv(raa: bytes):
    """Läser filen till (datumkolumner, rader). Varje rad är en dict med
    de fasta kolumnerna plus ett värde per datum (som int). SUMMA-raden
    följer med (den saknar LOKALID); bygget sorterar bort den.

    Radbrytningarna normaliseras innan csv-modulen får texten: 2022 års
    fil är bruten med enbart CR, som csv.reader annars inte ser."""
    text = avkoda(raa).replace("\r\n", "\n").replace("\r", "\n")
    rader = list(csv.reader(text.split("\n"), delimiter=";"))
    rader = [r for r in rader if any(c.strip() for c in r)]
    if not rader:
        sys.exit("Tom fil")
    rubriker = [RUBRIKALIAS.get(r.strip().lower(), r.strip()) for r in rader[0]]

    saknas = [k for k in FASTA_KOLUMNER if k not in rubriker]
    if saknas:
        sys.exit(f"Filen saknar kolumnerna {saknas}; layouten har ändrats. "
                 f"Rubriker: {rubriker}")

    # Datumkolumner: "2026-08-26" eller "2022-08-24 00:00:00"
    datum = []
    for i, rubrik in enumerate(rubriker):
        m = re.match(r"^(\d{4}-\d{2}-\d{2})", rubrik)
        if m:
            datum.append((i, m.group(1)))
    if not datum:
        sys.exit("Filen har inga datumkolumner")

    index = {k: rubriker.index(k) for k in FASTA_KOLUMNER}
    ut = []
    for rad in rader[1:]:
        if len(rad) < len(rubriker):
            sys.exit(f"Rad med för få kolumner: {rad[:6]}")
        post = {k: rad[index[k]].strip() for k in FASTA_KOLUMNER}
        post["perDag"] = {d: heltal(rad[i]) for i, d in datum}
        post["TOTAL"] = heltal(post["TOTAL"])
        ut.append(post)
    return [d for _, d in datum], ut


def heltal(s: str) -> int:
    s = (s or "").strip().replace("\xa0", "").replace(" ", "")
    return int(s) if s else 0


def kontrollera_datum(datum: list, valdag: str) -> None:
    """Dagarna ska vara en sammanhängande följd som slutar på valdagen."""
    d0 = date.fromisoformat(datum[0])
    for i, d in enumerate(datum):
        if date.fromisoformat(d) != d0 + timedelta(days=i):
            sys.exit(f"Datumkolumnerna är inte sammanhängande vid {d}")
    if datum[-1] != valdag:
        print(f"Varning: sista datumkolumnen är {datum[-1]}, inte valdagen {valdag}")


def las_hamtad() -> dict:
    if HAMTAD_FIL.exists():
        return json.loads(HAMTAD_FIL.read_text(encoding="utf-8"))
    return {}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--ar", type=int, default=2026, choices=sorted(VAL))
    p.add_argument("--fil", help="läs en lokal fil i stället för att hämta")
    args = p.parse_args()

    v = VAL[args.ar]
    raa = Path(args.fil).read_bytes() if args.fil else hamta(v["url"])
    datum, rader = tolka_csv(raa)
    kontrollera_datum(datum, v["valdag"])
    lokaler = [r for r in rader if r["LOKALID"]]
    if not lokaler:
        sys.exit("Filen har inga lokalrader")

    UT_MAPP.mkdir(parents=True, exist_ok=True)
    ut = csv_sokvag(args.ar)
    hamtad = las_hamtad()
    if ut.exists() and ut.read_bytes() == raa:
        print(f"{ut.relative_to(ROT)}: oförändrad sedan {hamtad.get(str(args.ar), '?')}")
        return
    ut.write_bytes(raa)
    hamtad[str(args.ar)] = datetime.now(TIDSZON).isoformat(timespec="minutes")
    HAMTAD_FIL.write_text(json.dumps(dict(sorted(hamtad.items())), ensure_ascii=False, indent=2) + "\n",
                          encoding="utf-8")
    kommuner = {(r["LÄNSKOD"], r["KOMMUNKOD"]) for r in lokaler}
    print(f"Skrev {ut.relative_to(ROT)}: {len(lokaler)} lokaler i {len(kommuner)} kommuner, "
          f"{sum(r['TOTAL'] for r in lokaler)} förtidsröster t.o.m. senaste dag med data")


if __name__ == "__main__":
    main()
