"""Hämtar kandidaturerna (listplats, ålder, kön, ort, yrke) till
kommunfullmäktige i Kungsbacka 2010, 2014 och 2018 ur Valmyndighetens rådata.

Källa: Valmyndighetens äldre valpresentationer, "Rådata från val 2002–2022"
(https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-fran-val-2002-2022):

  2018  https://historik.val.se/val/val2018/valsedlar/partier/kandidaturer.skv
  2014  https://historik.val.se/val/val2014/alkon/alkandur_K.skv
  2010  https://historik.val.se/val/val2010/valsedlar/K/kommun/13/84/1384K.xml
        (sidan för människor: …/valsedlar/K/kommun/13/84/valsedlar.html).
        Bara plats, kön och ålder – ingen ort eller yrke. Den stora
        riksfilen alkandur_K.skv för 2010 är gallrad (404).

Filerna är riksfiler (28 MB respektive 12 MB, Latin-1, semikolon). Här sparas
bara Kungsbackas rader. **Namnen är gallrade av Valmyndigheten** ("Namnet
gallrat"): det som finns är vilken plats på valsedeln varje kandidat hade,
tillsammans med ålder på valdagen, kön, folkbokföringsort och
valsedelsuppgiften (ålder, yrke, ort) – men inte vem det var. Posterna sparas
därför med `namn: null`; vem som stod var får avgöras i ett separat steg.

Kandidatnumret är ett id inom ett val: det återkommer när samma person
står på flera listor samma år, men är inte detsamma mellan valen (Lisa
Andersson har olika nummer 2018 och 2022). Det sparas som `kandidatnummer`
för spårbarhet men kan inte användas för att para ihop valen.

2014 hade två valkretsar i Kungsbacka (västra och östra) med samma
kandidater på samma plats på båda; listorna slås ihop om de är identiska,
annars avbryter skriptet (hellre än att gissa vilken som gäller).

Kontroller: kommunen är Kungsbacka (län 13, kommun 84), listplatserna är
1..n utan hopp, och 2014:s två valkretsar är identiska per parti.

Körs: python3 scripts/hamta_kandidaturer_historik.py
"""

import csv
import io
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from val import hamta

ROT = Path(__file__).resolve().parent.parent
UT = ROT / "data" / "kandidater"
KALLA = {
    2018: "https://historik.val.se/val/val2018/valsedlar/partier/kandidaturer.skv",
    2014: "https://historik.val.se/val/val2014/alkon/alkandur_K.skv",
    2010: "https://historik.val.se/val/val2010/valsedlar/K/kommun/13/84/1384K.xml",
}
KOMMUN, LAN, KOMMUNDEL = "1384", "13", "84"


def las(raa: bytes) -> list:
    text = raa.decode("latin-1").replace("\r\n", "\n").replace("\r", "\n")
    return list(csv.reader(io.StringIO(text), delimiter=";"))


def rader_2018(raa: bytes) -> list:
    rows = las(raa)
    i = {n: k for k, n in enumerate(rows[0])}
    ut = []
    for r in rows[1:]:
        if len(r) > 20 and r[i["VALTYP"]] == "K" and r[i["VALOMRÅDESKOD"]] == KOMMUN:
            if not r[i["ORDNING"]]:
                continue   # parti som anmält men saknar tryckt lista
            ut.append({"parti": r[i["PARTIBETECKNING"]], "kod": r[i["PARTIKOD"]],
                       "listnummer": r[i["LISTNUMMER"]], "valkrets": r[i["VALKRETSNAMN"]],
                       "plats": int(r[i["ORDNING"]]), "kandidatnummer": r[i["KANDIDATNUMMER"]],
                       "namn_i_kallan": r[i["NAMN"]], "alder": r[i["ÅLDER_PÅ_VALDAGEN"]],
                       "kon": r[i["KÖN"]], "ort": r[i["FOLKBOKFÖRINGSORT"]],
                       "uppgift": r[i["VALSEDELSUPPGIFT"]]})
    return ut


def rader_2014(raa: bytes) -> list:
    ut = []
    for r in las(raa):
        # VALTYP;LÄNSKOD;LÄN;KOMMUNKOD;KOMMUN;VALKRETSKOD;VALKRETS;PARTI;STATUS;LISTNR;ORDNING;KANDNR;NAMN;ÅLDER;KÖN;UPPGIFT
        if len(r) > 15 and r[0] == "K" and r[1] == LAN and r[3] == KOMMUNDEL:
            if r[4] != "Kungsbacka":
                sys.exit(f"2014: kommunkod {LAN}{KOMMUNDEL} är {r[4]!r}, väntade Kungsbacka")
            ut.append({"parti": r[7], "kod": None, "listnummer": r[9], "valkrets": r[6],
                       "plats": int(r[10]), "kandidatnummer": r[11], "namn_i_kallan": r[12],
                       "alder": r[13], "kon": r[14], "ort": None, "uppgift": r[15]})
    return ut


def rader_2010(raa: bytes) -> list:
    """2010 års XML: LÄN/VALKRETS/PARTI/VALSEDEL/KANDIDAT med ORDNING, KÖN, ÅLDER."""
    rot = ET.fromstring(raa)
    if rot.find("OMRÅDE").get("KOD") != KOMMUN:
        sys.exit("2010: XML-filen gäller inte Kungsbacka (1384)")
    ut = []
    for kr in rot.iter("VALKRETS"):
        for parti in kr.findall("PARTI"):
            for sedel in parti.findall("VALSEDEL"):
                for k in sedel.findall("KANDIDAT"):
                    ut.append({"parti": parti.get("BETECKNING"), "kod": parti.get("KOD"),
                               "listnummer": sedel.get("LISTNUMMER"), "valkrets": kr.get("NAMN"),
                               "plats": int(k.get("ORDNING")), "kandidatnummer": None,
                               "namn_i_kallan": k.get("KANDIDATUPPGIFT"), "alder": k.get("ÅLDER"),
                               "kon": {"Man": "M", "Kvinna": "K"}.get(k.get("KÖN"), k.get("KÖN")),
                               "ort": None, "uppgift": None})
    return ut


def bygg(ar: int, rader: list) -> dict:
    """Grupperar per parti och lista. Identiska valkretslistor slås ihop."""
    per_parti = {}
    for r in rader:
        per_parti.setdefault((r["parti"], r["kod"]), []).append(r)
    partier = []
    for (parti, kod), rs in sorted(per_parti.items()):
        per_krets = {}
        for r in rs:
            per_krets.setdefault((r["valkrets"], r["listnummer"]), []).append(r)
        listor_text = {}
        for (krets, nr), kand in per_krets.items():
            kand.sort(key=lambda r: r["plats"])
            plats = [r["plats"] for r in kand]
            if plats != list(range(1, len(plats) + 1)):
                sys.exit(f"{ar} {parti} lista {nr} ({krets}): listplatserna är inte 1..n: {plats}")
            listor_text[(krets, nr)] = [(r["plats"], r["alder"], r["kon"], r["uppgift"]) for r in kand]
        olika = {tuple(v) for v in listor_text.values()}
        if len(olika) > 1:
            sys.exit(f"{ar} {parti}: valkretsarnas listor skiljer sig åt – tolkas inte, avbryter")
        (krets0, nr0) = sorted(per_krets)[0]
        kand = sorted(per_krets[(krets0, nr0)], key=lambda r: r["plats"])
        partier.append({
            "kod": kod, "namn": parti,
            "valkretsar_med_samma_lista": sorted({k for k, _ in per_krets}),
            "listor": [{
                "listnamn": "Kungsbacka", "listnummer": nr0,
                "kandidater": [{
                    "plats": r["plats"], "namn": None, "samtycke": None,
                    "alder": int(r["alder"]) if r["alder"].isdigit() else None,
                    "kon": r["kon"], "ort": r["ort"] or None,
                    "uppgift": r["uppgift"], "kandidatnummer": r["kandidatnummer"]} for r in kand]}]})
    return {"val": ar, "valtyp": "KF", "kommun": KOMMUN, "kalla": KALLA[ar],
            "namn_status": "Namnet gallrat av Valmyndigheten – namn saknas" + (", plats/ålder/kön finns" if ar == 2010 else ", plats/ålder/kön/ort/yrke finns"),
            "partier": partier}


def main() -> None:
    for ar, url in KALLA.items():
        raa = hamta(url)
        rader = {2018: rader_2018, 2014: rader_2014, 2010: rader_2010}[ar](raa)
        if not rader:
            sys.exit(f"{ar}: inga rader för Kungsbacka – ändrad layout?")
        ut = bygg(ar, rader)
        fil = UT / f"{ar}.json"
        fil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        for p in ut["partier"]:
            print(f"{ar} {p['namn']:36} {sum(len(l['kandidater']) for l in p['listor']):3} platser")


if __name__ == "__main__":
    main()
