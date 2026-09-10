#!/usr/bin/env python3
"""Bygger docs/data-kostnader.json: kostnaden per elev i grundskolan.

Läser:
  data/kolada/kostnader_grundskola.json   (från hamta_kolada.py)
  data/scb/kpi.json                       (från hamta_kpi.py)

Skriver:
  docs/data-kostnader.json

Två områden redovisas, Kungsbacka och riket, och två sätt att räkna
kostnaden: elever som *bor* i kommunen (hemkommun) och kommunens *egna*
skolor (kommunal huvudman). Kostnadsslagen hör till det senare.

**Fasta priser.** Löpande priser går inte att jämföra mellan år. Varje
års kostnad räknas därför om till det senaste årets prisnivå med kvoten
mellan årens konsumentprisindex:

    fast pris = nominell kostnad × KPI(prisnivåår) / KPI(året)

Det är den vanliga KPI-omräkningen, och den enda beräkning på sidan som
inte kommer direkt ur en källa. Basåret i KPI-serien (1980 = 100) spelar
ingen roll: bara kvoten mellan två år används.

Prisnivåret är det senaste år som både har kostnadstal och ett fastställt
KPI-årsmedeltal. Saknar ett kostnadsår sitt KPI-tal får det året inget
fast pris alls, i stället för ett tal räknat på fel nivå.

Utöver det räknas tre saker fram, alla direkt ur de fasta priserna:

  forandring   den reala förändringen mot föregående år, i procent
  motRiket     Kungsbacka jämfört med riket samma år, i procent
               (positivt = dyrare än riket)
  index        utvecklingen med ett gemensamt basår som 100

Indexbasåret är det första år som *båda* områdena har. Kungsbacka och
riket ligger på nästan samma kostnadsnivå, så deras kronlinjer löper
parallellt och det går inte att se vilken som stigit snabbast; med samma
startpunkt går det. Basåret måste vara gemensamt – två serier med var
sitt basår mäter inte samma sak, och att jämföra dem vore fel. År före
basåret får också ett indextal, räknat mot samma bas, så att kommunens
längre historia inte tappas bort.

Körs:  python3 scripts/build_kostnader.py
"""

import json
import math
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent

KUNGSBACKA = "1384"
RIKET = "0000"


def lasa_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def prisnivaar(kolada: dict, kpi: dict) -> int | None:
    """Senaste år med både kostnadstal och fastställt KPI-årsmedeltal."""
    kostnadsar = {int(a)
                  for post in kolada["nyckeltal"]
                  for varden in post["omraden"].values()
                  for a in varden}
    gemensamma = kostnadsar & {int(a) for a in kpi}
    return max(gemensamma) if gemensamma else None


def fast_pris(nominell: float, ar: int, kpi: dict, prisniva: int):
    """Nominellt tal omräknat till prisnivåårets prisnivå."""
    indexAr = kpi.get(str(ar))
    indexNiva = kpi.get(str(prisniva))
    if indexAr is None or indexNiva is None or indexAr == 0:
        return None
    return nominell * indexNiva / indexAr


def basar(post: dict) -> int | None:
    """Första år som samtliga redovisade områden har – indexets bas.

    Saknas ett område (bara kommunen redovisas) blir det kommunens eget
    första år."""
    serier = [set(v) for v in post["omraden"].values() if v]
    if not serier:
        return None
    gemensamma = set.intersection(*serier)
    return min(int(a) for a in gemensamma) if gemensamma else None


def bygg_omrade(varden: dict, kpi: dict, prisniva: int, riket: dict | None,
                bas: int | None = None) -> dict:
    """En serie för ett område: nominellt, fast pris, real förändring,
    jämförelsen mot riket och indextalet – allt avrundat först på vägen ut.

    `bas` är indexets gemensamma basår; utan ett fast pris det året går
    inget index att räkna, och då utelämnas det."""
    ar = sorted(int(a) for a in varden)
    basvarde = None
    if bas is not None and str(bas) in varden:
        basvarde = fast_pris(varden[str(bas)], bas, kpi, prisniva)
    rader = {}
    forra = None
    for a in ar:
        nominell = varden[str(a)]
        fast = fast_pris(nominell, a, kpi, prisniva)
        forandring = None
        if fast is not None and forra is not None and forra != 0:
            forandring = round(100.0 * (fast / forra - 1), 1)
        motRiket = None
        if riket is not None and str(a) in riket and riket[str(a)]:
            motRiket = round(100.0 * (nominell / riket[str(a)] - 1), 1)
        index = None
        if fast is not None and basvarde:
            index = round(100.0 * fast / basvarde, 1)
        rader[a] = {
            "nominell": round(nominell),
            "fast": None if fast is None else round(fast),
            "forandring": forandring,
            "motRiket": motRiket,
            "index": index,
        }
        if fast is not None:
            forra = fast

    fasta = {a: r["fast"] for a, r in rader.items() if r["fast"] is not None}
    ut = {
        "varden": rader,
        "forstaAr": ar[0] if ar else None,
        "sistaAr": ar[-1] if ar else None,
        "forsta": rader[ar[0]]["nominell"] if ar else None,
        "sista": rader[ar[-1]]["nominell"] if ar else None,
    }
    if fasta:
        ut.update({
            "forstaFast": fasta[min(fasta)],
            "sistaFast": fasta[max(fasta)],
            "hogsta": max(fasta.values()),
            "hogstaAr": max(fasta, key=lambda a: fasta[a]),
            "lagsta": min(fasta.values()),
            "lagstaAr": min(fasta, key=lambda a: fasta[a]),
            # Real förändring över hela serien, i procent
            "realTotal": round(100.0 * (fasta[max(fasta)] / fasta[min(fasta)] - 1), 1)
            if fasta[min(fasta)] else None,
        })
    return ut


def bygg_post(post: dict, kpi: dict, prisniva: int) -> dict:
    riket = post["omraden"].get(RIKET) or None
    bas = basar(post)
    rad = {
        "nyckel": post["nyckel"],
        "etikett": post["etikett"],
        "kolada": post["kolada"],
        "koladaTitel": post.get("koladaTitel"),
        "definition": post.get("definition"),
        "indexBasAr": bas,
        "omraden": {},
    }
    if "kort" in post:
        rad["kort"] = post["kort"]
    for kod, varden in post["omraden"].items():
        if not varden:
            continue
        rad["omraden"][kod] = bygg_omrade(
            varden, kpi, prisniva, riket if kod != RIKET else None, bas)
    return rad


def kontrollera_kostnadsslag(kolada: dict) -> list:
    """Kostnadsslagen ska summera till kostnaden för kommunens egna skolor.

    Går de isär har något nyckeltal bytt innebörd, och då är den staplade
    bilden fel. Det ska synas vid bygget, inte i diagrammet."""
    per = {p["nyckel"]: p for p in kolada["nyckeltal"]}
    slag = [n for n in per if n not in ("hemkommun", "kommunal", "skolskjuts")]
    varningar = []
    total = per["kommunal"]["omraden"]
    for kod, varden in total.items():
        for a, facit in varden.items():
            delar = [per[n]["omraden"].get(kod, {}).get(a) for n in slag]
            if any(d is None for d in delar):
                continue
            summa = math.fsum(delar)
            if abs(summa - facit) > 1:
                varningar.append(
                    f"{kod} {a}: kostnadsslagen summerar till {summa:.0f} kr, "
                    f"men totalen säger {facit:.0f} kr")
    return varningar


def bygg(kolada: dict, kpifil: dict) -> dict:
    """Hela utdatan som en ren funktion av indatafilerna, så att den går
    att kontrollräkna i testerna utan att skriva någon fil."""
    kpi = kpifil["kpi"]
    prisniva = prisnivaar(kolada, kpi)
    if prisniva is None:
        raise SystemExit("Inget år har både kostnadstal och KPI – "
                         "omräkningen till fasta priser går inte att göra.")

    per_nyckel = {p["nyckel"]: p for p in kolada["nyckeltal"]}
    matt = [bygg_post(per_nyckel[n], kpi, prisniva)
            for n in ("hemkommun", "kommunal") if n in per_nyckel]
    slag = [bygg_post(p, kpi, prisniva) for p in kolada["nyckeltal"]
            if p["nyckel"] not in ("hemkommun", "kommunal", "skolskjuts")]
    ovriga = [bygg_post(per_nyckel[n], kpi, prisniva)
              for n in ("skolskjuts",) if n in per_nyckel]

    ar = sorted({a for post in matt + slag + ovriga
                 for omrade in post["omraden"].values()
                 for a in omrade["varden"]})

    return {
        "kommun": "Kungsbacka",
        "kommunkod": KUNGSBACKA,
        "serie": "Kostnad per elev i grundskolan, Kungsbacka och riket",
        "matt": kolada["matt"],
        "prisniva": prisniva,
        "prisnivaText": f"fasta priser, {prisniva} års prisnivå",
        "kalla": kolada["kalla"],
        "kallaUrl": kolada["kallaUrl"],
        "apiUrl": kolada["apiUrl"],
        "hamtad": kolada["hamtad"],
        "kpiKalla": kpifil["kalla"],
        "kpiKallaUrl": kpifil["kallaUrl"],
        "kpiHamtad": kpifil["hamtad"],
        "kpiMatt": kpifil["matt"],
        "kpi": {a: kpi[a] for a in sorted(kpi) if int(a) in ar},
        "omraden": kolada["omraden"],
        "ar": ar,
        "kostnadPerElev": matt,
        "kostnadsslag": slag,
        "ovriga": ovriga,
    }


def main() -> None:
    kolada = lasa_json(ROT / "data" / "kolada" / "kostnader_grundskola.json")
    kpifil = lasa_json(ROT / "data" / "scb" / "kpi.json")

    for varning in kontrollera_kostnadsslag(kolada):
        print(f"Varning: {varning}")

    ut = json.loads(json.dumps(bygg(kolada, kpifil)))
    utfil = ROT / "docs" / "data-kostnader.json"
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n",
                     encoding="utf-8")

    ar = ut["ar"]
    print(f"Skrev {utfil.name}: {len(ar)} år ({ar[0]}–{ar[-1]}), "
          f"prisnivå {ut['prisniva']}")
    for post in ut["kostnadPerElev"]:
        for kod, o in post["omraden"].items():
            namn = next(x["namn"] for x in ut["omraden"] if x["kod"] == kod)
            print(f"  {post['nyckel']:10s} {namn:11s} "
                  f"{o['forstaAr']}–{o['sistaAr']}: "
                  f"{o['forstaFast']} → {o['sistaFast']} kr i fasta priser "
                  f"({o['realTotal']:+.1f} %)")


if __name__ == "__main__":
    main()
