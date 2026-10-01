#!/usr/bin/env python3
"""Hämtar källfilerna till elevenkätssidan och lägger dem i data/enkater/raw/.

Tre källor:

  Skolenkäten (Skolinspektionen)   Excel per respondentgrupp och omgång
      https://www.skolinspektionen.se/skolenkaten/resultat-fran-skolenkaten/
      Sidorna för HT 2015–VT 2020 är en per termin, från 2021 en per år.
  Regiongemensam elevenkät (GR)    PDF per årskurs och år, 2022–
      https://goteborgsregionen.se/kunskapsbank/regiongemensamelevenkat<år>…
      GR:s sidor för äldre år är borttagna och går inte att hämta.
  Skolenhetsregistret (Skolverket) Kungsbackas skolenheter, med status
      https://api.skolverket.se/skolenhetsregistret/v2/

**Råfilerna skrivs aldrig över.** Finns filen redan hoppas den över, också
om källan i dag skulle ge något annat: ett uttag som ändras under foten
är ett uttag man inte kan peka på. Vill man ha en ny version får man
flytta den gamla ur vägen för hand. Råfilerna är några hundra MB och
checkas inte in (de ligger i .gitignore); det som checkas in är
`data/enkater/KALLFILER.csv`, som säger vilken adress varje fil hämtats
från och dess kontrollsumma, så att varje siffra går att spåra tillbaka.

Körs:  python3 scripts/hamta_enkater.py              allt
       python3 scripts/hamta_enkater.py --skolenkaten
       python3 scripts/hamta_enkater.py --gr
       python3 scripts/hamta_enkater.py --register
"""

import argparse
import csv
import hashlib
import json
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent
KATALOG = ROT / "data" / "enkater"
RAW = KATALOG / "raw"
MANIFEST = KATALOG / "KALLFILER.csv"
REGISTER = KATALOG / "skolenheter_kungsbacka_skolverket.json"

SI = "https://www.skolinspektionen.se"
SI_RESULTAT = SI + "/skolenkaten/resultat-fran-skolenkaten/"
GR = "https://goteborgsregionen.se"

# Sidorna med Excelfilerna. Före 2021 en per termin.
SI_TERMINER = ["ht-2015", "vt-2015", "ht-2016", "vt-2016", "ht-2017", "vt-2017",
               "ht-2018", "vt-2018", "ht-2019", "vt-2019", "vt-2020"]
SI_AR = list(range(2021, 2027))

# GR:s årssidor har ett id i adressen som inte går att gissa; de är
# upplockade ur GR:s egna länkar. Tidigare år saknas på webbplatsen.
GR_SIDOR = {
    2022: "regiongemensamelevenkat2022.5.2899fac318093d2b728134c7.html",
    2023: "regiongemensamelevenkat2023.5.3bc843dd18851928cf7152ca.html",
    2024: "regiongemensamelevenkat2024.5.348949ac18f37979bc419da5.html",
    2025: "regiongemensamelevenkat2025.5.5e567a69196afc8a6c910519.html",
    2026: "regiongemensamelevenkat2026.5.53bd5b1e19ddcc4211c50f2.html",
}

KOMMUNKOD = "1384"
REGISTER_API = "https://api.skolverket.se/skolenhetsregistret/v2/school-units"
UA = "kungsbacka-i-siffror/1.0"


def hamta_bytes(url: str, rubriker: dict | None = None) -> bytes:
    """Hämtar med återförsök: kopplingen bryts då och då mitt i ett svar."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(rubriker or {})})
    sista = None
    for forsok in range(4):
        try:
            with urllib.request.urlopen(
                    req, timeout=180, context=ssl.create_default_context()) as r:
                return r.read()
        except Exception as fel:
            sista = fel
            time.sleep(2 ** forsok)
    raise sista


def lankar_i(html: str, andelse: str) -> list:
    """Alla href:ar som slutar på `andelse` (t.ex. ".xlsx"), i sidans ordning
    och utan dubletter."""
    ut = []
    for h in re.findall(r'href="([^"]+)"', html):
        if h.lower().split("?")[0].endswith(andelse) and h not in ut:
            ut.append(h)
    return ut


def lokal_sokvag(kalla: str, undermapp: str, url: str) -> Path:
    namn = urllib.parse.unquote(url.split("?")[0].rsplit("/", 1)[-1])
    namn = re.sub(r"[^A-Za-z0-9._-]+", "_", namn)
    if namn.endswith(".xlsx.xlsx"):          # VT 2017: dubbel ändelse i källan
        namn = namn[:-5]
    return RAW / kalla / undermapp / namn


def las_manifest() -> dict:
    if not MANIFEST.exists():
        return {}
    with open(MANIFEST, encoding="utf-8", newline="") as f:
        return {r["fil"]: r for r in csv.DictReader(f)}


def skriv_manifest(poster: dict) -> None:
    falt = ["fil", "kalla", "omgang", "url", "bytes", "sha256", "hamtad"]
    with open(MANIFEST, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=falt, lineterminator="\n")
        w.writeheader()
        for nyckel in sorted(poster):
            w.writerow(poster[nyckel])


def hamta_fil(url: str, kalla: str, omgang: str, poster: dict) -> bool:
    """Hämtar en fil om den inte redan finns. Returnerar True om den hämtades."""
    mal = lokal_sokvag(kalla, omgang, url)
    rel = str(mal.relative_to(RAW))
    if mal.exists():
        if rel not in poster:      # fanns sedan förut men saknar manifestpost
            data = mal.read_bytes()
            poster[rel] = {"fil": rel, "kalla": kalla, "omgang": omgang, "url": url,
                           "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                           "hamtad": ""}
        return False
    data = hamta_bytes(url)
    mal.parent.mkdir(parents=True, exist_ok=True)
    mal.write_bytes(data)
    poster[rel] = {"fil": rel, "kalla": kalla, "omgang": omgang, "url": url,
                   "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                   "hamtad": date.today().isoformat()}
    print(f"  hämtade {rel} ({len(data) // 1024} kB)")
    return True


def hamta_skolenkaten(poster: dict) -> None:
    sidor = [(t, f"{SI_RESULTAT}skolenkaten-{t}/") for t in SI_TERMINER]
    sidor += [(str(a), f"{SI_RESULTAT}resultat-skolenkaten-{a}/") for a in SI_AR]
    for omgang, sida in sidor:
        html = hamta_bytes(sida).decode("utf-8", "replace")
        excel = [h for h in lankar_i(html, ".xlsx") + lankar_i(html, ".xlsx.xlsx")
                 if "statistik-skolenkaten" in h]
        if not excel:
            raise SystemExit(f"{sida}: inga Excelfiler hittades – har sidan ändrats?")
        print(f"Skolenkäten {omgang}: {len(excel)} filer")
        for h in excel:
            hamta_fil(SI + h, "skolenkaten", omgang, poster)


def hamta_gr(poster: dict) -> None:
    for ar, sida in sorted(GR_SIDOR.items()):
        html = hamta_bytes(f"{GR}/kunskapsbank/{sida}").decode("utf-8", "replace")
        pdf = [h for h in lankar_i(html, ".pdf") if h.startswith("/download/")]
        if not pdf:
            raise SystemExit(f"GR {ar}: inga PDF:er hittades – har sidan ändrats?")
        print(f"GR {ar}: {len(pdf)} rapporter")
        for h in pdf:
            hamta_fil(GR + h, "gr", str(ar), poster)


def hamta_register() -> None:
    """Kungsbackas skolenheter ur Skolverkets register, alla statusar. Skrivs
    över varje gång – det är en ögonblicksbild av registret, med datum – men
    bara när hämtningen lyckats helt."""
    rubr = {"Accept": "application/json"}
    lista = json.loads(hamta_bytes(f"{REGISTER_API}?municipality_code={KOMMUNKOD}", rubr))
    koder = sorted(x["schoolUnitCode"] for x in lista["data"]["attributes"])
    ut = []
    for kod in koder:
        d = json.loads(hamta_bytes(f"{REGISTER_API}/{kod}", rubr))
        a = d["data"]["attributes"]
        inkl = d.get("included", {})
        hm = inkl.get("attributes", {})
        ut.append({
            "kod": kod, "namn": a.get("displayName"), "status": a.get("status"),
            "typer": a.get("schoolTypes"), "start": a.get("startdate"),
            "slut": a.get("enddate"), "huvudman": hm.get("displayName"),
            "hm_typ": hm.get("organizerType"), "orgnr": inkl.get("organizationNumber"),
            "arskurser": {k: v.get("grades")
                          for k, v in (a.get("schoolTypeProperties") or {}).items()},
        })
    if len(ut) < 100:
        raise SystemExit(f"Registret gav bara {len(ut)} enheter – avbryter.")
    REGISTER.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n",
                        encoding="utf-8")
    print(f"Skolenhetsregistret: {len(ut)} enheter → {REGISTER.relative_to(ROT)}")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--skolenkaten", action="store_true")
    p.add_argument("--gr", action="store_true")
    p.add_argument("--register", action="store_true")
    a = p.parse_args()
    allt = not (a.skolenkaten or a.gr or a.register)
    poster = las_manifest()
    if a.skolenkaten or allt:
        hamta_skolenkaten(poster)
    if a.gr or allt:
        hamta_gr(poster)
    skriv_manifest(poster)
    print(f"Manifest: {len(poster)} filer → {MANIFEST.relative_to(ROT)}")
    if a.register or allt:
        hamta_register()
    return 0


if __name__ == "__main__":
    sys.exit(main())
