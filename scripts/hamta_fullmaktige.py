#!/usr/bin/env python3
"""Hämtar uppgifterna om kommunfullmäktiges inspelade sammanträden.

Kungsbacka sänder fullmäktige direkt och lägger upp mötena i efterhand,
men på två ställen:

  2022–2024  kommunens YouTube-kanal, spellistan "Kungsbacka
             kommunfullmäktige"
  2024–      Screen9 (QC Network), som kommunen länkar till från sidan
             "Webbsändningar från kommunfullmäktige", ett år per rubrik

Tre saker hämtas, och vart och ett sparas som en egen fil i
data/fullmaktige/:

  kommunsidan.json  länkarna på kommunens sida, med årsrubriken och
                    länktexten ("11 augusti") de står under – så att det
                    går att se vilket möte kommunen *säger* att länken går
                    till
  screen9.json      för varje länkad sändning: titeln, längden i sekunder
                    och kapitelmarkeringarna. Nivå 0 är ett ärende, nivå 1
                    ett inlägg ("Namn (Parti)", "Namn (Parti) - Replik").
                    Allt står i spelarens inställningar, som sidan
                    skickar med i klartext.
  youtube.json      för varje video i spellistan: titeln, längden och
                    antalet visningar. Längden står i spellistan;
                    visningarna och sändningsdatumet ("Streamades live
                    12 dec. 2024") läses ur videons egen sida, som anger
                    det exakta talet också när spellistan förkortar det.

**Hellre stanna än spara fel.** Skriptet avbryter om kommunsidan saknar
årsrubriker eller länkar, om en Screen9-sida saknar längd eller titel,
om en video saknar längd, visningar eller sändningsdatum, eller om
spellistan säger sig ha färre videor än som gick att läsa ut. Spellistan
får däremot ange *fler* videor än som syns: en dold eller privat video
räknas med i YouTubes tal men visas inte, och det antalet sparas för sig.

**Visningarna är en ögonblicksbild.** Talet växer så länge videon ligger
uppe; tidsstämpeln i filen anger när det lästes.

YouTube kräver ibland inloggning för att visa en videosida för en
okänd klient ("bekräfta att du inte är en robot"). Uppgifterna som
behövs står ändå i sidans data; saknas de avbryter skriptet.

Körs:  python3 scripts/hamta_fullmaktige.py
"""

import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROT = Path(__file__).resolve().parent.parent
UT_MAPP = ROT / "data" / "fullmaktige"

KOMMUNSIDA = ("https://kungsbacka.se/kommun-och-politik/politik-och-demokrati/"
              "politiska-moten-och-sammantraden/kommunfullmaktiges-sammantraden/"
              "webbsandningar-fran-kommunfullmaktige")
SPELLISTA_ID = "PLR8w9H5fc00oBGucMV-UzR7SuCO4kzfGU"
SPELLISTA = f"https://www.youtube.com/playlist?list={SPELLISTA_ID}"
VIDEO = "https://www.youtube.com/watch?v={id}&hl=sv"

HUVUDEN = {"User-Agent": "Mozilla/5.0 (kungsbacka-i-siffror)",
           "Accept-Language": "sv-SE,sv;q=0.9"}

SCREEN9_LANK = re.compile(
    r"https://(?:qcnl\.tv/p/|api\.screen9\.com/preview/)[A-Za-z0-9_-]+")


def hamta(url: str, paus: float = 0) -> str:
    """Sidan som text. YouTube svarar 429 på för täta anrop; då väntar
    skriptet allt längre och försöker igen, i stället för att ge upp."""
    for forsok in range(5):
        time.sleep(paus + (2 ** forsok - 1) * 10)
        try:
            req = urllib.request.Request(url, headers=HUVUDEN)
            with urllib.request.urlopen(req, timeout=60) as svar:
                return svar.read().decode("utf-8")
        except urllib.error.HTTPError as fel:
            if fel.code != 429:
                raise
    raise SystemExit(f"{url}: för många anrop, försök igen senare")


def text(markup: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", markup)).split())


# ---------- Kommunens sida ----------

def las_kommunsidan(sida: str) -> list[dict]:
    """Länkarna till Screen9 under varje årsrubrik, i sidans ordning.

    Länken överst på sidan ("Du kan även se sändningen i fullskärm …")
    står inte under någon årsrubrik och pekar på samma sändning som den
    första länken i årslistan; den räknas inte. Länktexten avslutas av
    kommunens webbplats med en osynlig "Länk till annan webbplats.", som
    skalas av."""
    lankar = []
    ar = None
    monster = re.compile(r'<h2[^>]*>(.*?)</h2>|<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', re.S)
    for m in monster.finditer(sida):
        if m.group(1) is not None:
            rubrik = text(m.group(1))
            ar = rubrik if re.fullmatch(r"\d{4}(?:-\d{4})?", rubrik) else None
            continue
        url = m.group(2)
        if ar is None or not SCREEN9_LANK.fullmatch(url):
            continue
        etikett = text(m.group(3)).replace("Länk till annan webbplats.", "").strip()
        lankar.append({"rubrik": ar, "text": etikett, "url": url})
    if not lankar:
        raise SystemExit("Kommunsidan: hittade inga länkar till Screen9 under någon årsrubrik")
    if not any(re.fullmatch(r"\d{4}", l["rubrik"]) for l in lankar):
        raise SystemExit("Kommunsidan: inga länkar under en årsrubrik – har sidan byggts om?")
    if SPELLISTA_ID not in sida:
        raise SystemExit("Kommunsidan länkar inte längre till YouTube-spellistan")
    return lankar


# ---------- Screen9 ----------

def las_screen9(url: str, sida: str) -> dict:
    """Titeln, längden och kapitelmarkeringarna ur spelarens inställningar."""
    titel = re.search(r"<title>(.*?)</title>", sida, re.S)
    langd = re.search(r'"duration":\s*([\d.]+)\s*\},\s*"playbackRates"', sida)
    if not titel or not langd:
        raise SystemExit(f"Screen9 {url}: hittade inte titel och längd")
    kapitel = [
        {"titel": json.loads('"' + t + '"'), "start": float(s), "niva": int(n)}
        for t, s, n in re.findall(
            r'"title":\s*"((?:[^"\\]|\\.)*)",\s*"startTime":\s*([\d.]+),\s*"level":\s*(\d)',
            sida)
    ]
    return {"url": url, "titel": text(titel.group(1)),
            "sekunder": float(langd.group(1)), "kapitel": kapitel}


# ---------- YouTube ----------

def ytdata(sida: str, namn: str) -> dict:
    m = re.search(r"var ytInitialData = (\{.*?\});</script>", sida, re.S)
    if not m:
        raise SystemExit(f"YouTube: hittade ingen sidata i {namn}")
    return json.loads(m.group(1))


def noder(o, nyckel):
    if isinstance(o, dict):
        if nyckel in o:
            yield o[nyckel]
        for v in o.values():
            yield from noder(v, nyckel)
    elif isinstance(o, list):
        for v in o:
            yield from noder(v, nyckel)


def texter(o) -> list[str]:
    return [t for k in ("text", "content", "simpleText")
            for t in noder(o, k) if isinstance(t, str)]


LANGD = re.compile(r"(?:\d+:)?\d{1,2}:\d{2}")


def las_spellistan(sida: str) -> tuple[list[dict], int]:
    """Videorna i spellistan och det antal spellistan själv anger."""
    data = ytdata(sida, "spellistan")
    videor = []
    for post in noder(data, "lockupViewModel"):
        vid = post.get("contentId")
        alla = texter(post)
        langder = [t for t in alla if LANGD.fullmatch(t)]
        titlar = [t for t in alla if "ullmäktige" in t]
        if not vid or len(langder) != 1 or not titlar:
            raise SystemExit(f"Spellistan: kunde inte läsa längd och titel för {vid}")
        videor.append({"id": vid, "titel": titlar[0], "langd": langder[0]})
    antal = re.search(r'"(\d+) videor"', sida) or re.search(r"(\d+) videor", sida)
    if not videor or not antal:
        raise SystemExit("Spellistan: inga videor, eller inget antal angivet")
    return videor, int(antal.group(1))


def las_video(vid: str, sida: str) -> dict:
    """Exakta visningar och sändningsdatum ur videons sida."""
    data = ytdata(sida, vid)
    vy = next(noder(data, "videoViewCountRenderer"), None)
    visn = texter(vy.get("viewCount", {})) if vy else []
    datum = [t for t in texter(next(noder(data, "dateText"), {}))]
    if len(visn) != 1 or not re.fullmatch(r"[\d\s  ]+ visningar?", visn[0]):
        raise SystemExit(f"YouTube {vid}: kunde inte läsa antalet visningar ({visn})")
    if len(datum) != 1:
        raise SystemExit(f"YouTube {vid}: kunde inte läsa sändningsdatumet")
    return {"visningar": int(re.sub(r"\D", "", visn[0])), "datumtext": datum[0]}


def skriv(namn: str, innehall: dict):
    UT_MAPP.mkdir(parents=True, exist_ok=True)
    (UT_MAPP / namn).write_text(
        json.dumps(innehall, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main():
    nu = datetime.now(ZoneInfo("Europe/Stockholm")).strftime("%Y-%m-%d %H:%M")

    lankar = las_kommunsidan(hamta(KOMMUNSIDA))
    print(f"Kommunsidan: {len(lankar)} länkar")

    sandningar = []
    for url in dict.fromkeys(l["url"] for l in lankar):
        s = las_screen9(url, hamta(url))
        print(f"  {s['titel']}: {s['sekunder'] / 3600:.2f} h, {len(s['kapitel'])} kapitel")
        sandningar.append(s)

    videor, angivet = las_spellistan(hamta(SPELLISTA))
    if angivet < len(videor):
        raise SystemExit(f"Spellistan anger {angivet} videor men {len(videor)} gick att läsa")
    for v in videor:
        v.update(las_video(v["id"], hamta(VIDEO.format(id=v["id"]), paus=3)))
        print(f"  {v['titel']}: {v['langd']}, {v['visningar']} visningar, {v['datumtext']}")

    skriv("kommunsidan.json", {"hamtad": nu, "url": KOMMUNSIDA, "lankar": lankar})
    skriv("screen9.json", {"hamtad": nu, "sandningar": sandningar})
    skriv("youtube.json", {"hamtad": nu, "spellista": SPELLISTA,
                           "antalEnligtSpellistan": angivet, "videor": videor})
    return 0


if __name__ == "__main__":
    sys.exit(main())
