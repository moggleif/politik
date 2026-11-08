"""Hämtar vilka listplatser som blev ledamöter i Kungsbackas kommunfullmäktige
vid valen 2010, 2014 och 2018: de ursprungligen valda, med parti, plats på
valsedeln, ålder och kön.

Källa: Valmyndighetens äldre valpresentationer, "Rådata från val 2002–2022"
(https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-fran-val-2002-2022):

  2010  https://historik.val.se/val/val2010/ledav/alla_ursprungliga_ledamoter_RLK.skv
  2014  https://historik.val.se/val/val2014/ledav/ursprungligt_valda_ledamoter_RLK.skv
  2018  https://historik.val.se/val/val2018/statistik/2018_ursprungligt_valda.xls
        (Excel 97; läses med xlrd, som bara behövs för det här skriptet)

**Namnen är gallrade av Valmyndigheten** ("Namnet gallrat"). Det som finns är
vilken plats på vilken lista som gav ett mandat, och ålder och kön för den
som tog det (2018 även födelseår). Det är det enda som visar *hur långt ner
på valsedeln* mandaten räckte 2010, där hela listan saknas.

`invalsordning` är ordningen mandaten fördelades i; `personvald` anger att
kandidaten kom in på personröster. `listplats` är kandidatens plats på
valsedeln (1 = överst).

Kontroller som avbryter hellre än sparar något som inte stämmer:
  * exakt 61 ledamöter,
  * mandaten per parti är de som kommunen själv redovisar
    (https://kungsbacka.se/kommun-och-politik/politik-och-demokrati/val-och-folkomrostningar/politisk-historia),
  * kommunen är Kungsbacka (län 13, kommun 84).

Körs: python3 scripts/hamta_valda_historik.py
"""

import csv
import io
import json
import sys
from pathlib import Path

from val import hamta

ROT = Path(__file__).resolve().parent.parent
UT = ROT / "data" / "valda"
KALLA = {
    2010: "https://historik.val.se/val/val2010/ledav/alla_ursprungliga_ledamoter_RLK.skv",
    2014: "https://historik.val.se/val/val2014/ledav/ursprungligt_valda_ledamoter_RLK.skv",
    2018: "https://historik.val.se/val/val2018/statistik/2018_ursprungligt_valda.xls",
}
# Mandat per parti enligt kommunens sida "Politisk historia" (summa 61).
# Filens egna partibeteckningar normaliseras med PARTI.
MANDAT = {
    2010: {"M": 24, "S": 10, "L": 7, "C": 5, "MP": 4, "KB": 4, "KD": 3, "SD": 3, "V": 1},
    2014: {"M": 21, "S": 10, "C": 7, "L": 6, "SD": 6, "MP": 4, "KB": 3, "KD": 2, "V": 2},
    2018: {"M": 19, "S": 9, "SD": 9, "C": 8, "L": 6, "KD": 4, "MP": 2, "V": 2, "KB": 2},
}
PARTI = {"FP": "L", "Kbabo": "KB", "KBABO": "KB"}   # Folkpartiet -> Liberalerna; Kungsbackaborna


def tal(x):
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return None


def rader_skv(raa: bytes) -> list:
    text = raa.decode("latin-1").replace("\r\n", "\n").replace("\r", "\n")
    rows = list(csv.reader(io.StringIO(text), delimiter=";"))
    i = {n: k for k, n in enumerate(rows[0])}
    ut = []
    for r in rows[1:]:
        if len(r) > 17 and r[i["valtyp"]] == "K" and r[i["länsnr"]] == "13" and r[i["kommunnr"]] == "84":
            ut.append({"parti": r[i["parti"]], "mandat": tal(r[i["invalsordning"]]),
                       "personvald": r[i["personvald"]] == "personvald",
                       "alder": tal(r[i["ålder"]]), "kon": r[i["kön"]], "fodelsear": None,
                       "lista": r[i["lista"]], "listplats": tal(r[i["listplats"]]),
                       "kandidatnummer": r[i["kandidatnr"]],
                       "valkrets": r[i["valkrets"]]})
    return ut


def rader_xls(raa: bytes) -> list:
    try:
        import xlrd
    except ImportError:
        sys.exit("2018 läses med xlrd: pip install xlrd")
    sh = xlrd.open_workbook(file_contents=raa).sheet_by_index(0)
    h = [str(c.value) for c in sh.row(0)]
    i = {n: k for k, n in enumerate(h)}
    ut = []
    for n in range(1, sh.nrows):
        r = [c.value for c in sh.row(n)]
        if r[i["Valtyp"]] == "K" and tal(r[i["Länsnummer"]]) == 13 and tal(r[i["Kommunnummer"]]) == 84:
            ut.append({"parti": r[i["Partiförkortning"]], "mandat": None,
                       "personvald": str(r[i["Personvald"]]).strip() == "personvald",
                       "alder": tal(r[i["Ålder valdag"]]), "kon": r[i["Kön"]],
                       "fodelsear": tal(r[i["Födelseår"]]),
                       "lista": r[i["Lista"]], "listplats": tal(r[i["Listplats"]]),
                       "kandidatnummer": str(tal(r[i["Kandnr"]])),
                       "valkrets": str(r[i["Valkrets"]])})
    return ut


def granska(ar: int, rader: list) -> None:
    if len(rader) != 61:
        sys.exit(f"{ar}: {len(rader)} ledamöter, väntade 61")
    antal = {}
    for r in rader:
        p = PARTI.get(r["parti"], r["parti"])
        antal[p] = antal.get(p, 0) + 1
    if antal != MANDAT[ar]:
        sys.exit(f"{ar}: mandat per parti {antal} stämmer inte med kommunens {MANDAT[ar]}")
    for r in rader:
        if r["listplats"] is None:
            sys.exit(f"{ar}: ledamot utan listplats: {r}")


def main() -> None:
    UT.mkdir(parents=True, exist_ok=True)
    for ar, url in KALLA.items():
        raa = hamta(url)
        rader = rader_xls(raa) if url.endswith(".xls") else rader_skv(raa)
        for r in rader:
            r["parti"] = PARTI.get(r["parti"], r["parti"])
        granska(ar, rader)
        rader.sort(key=lambda r: (r["parti"], r["listplats"]))
        ut = {"val": ar, "valtyp": "KF", "kommun": "1384", "kalla": url,
              "namn_status": "Namnet gallrat av Valmyndigheten – namn saknas",
              "ledamoter": rader}
        (UT / f"{ar}.json").write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        per = {}
        for r in rader:
            per.setdefault(r["parti"], []).append(r["listplats"])
        print(ar, {p: sorted(v) for p, v in sorted(per.items())})


if __name__ == "__main__":
    main()
