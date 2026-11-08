"""Hämtar närvarolistan ("Beslutande") ur första protokollet med text i varje
mandatperiod, för varje organ: kommunstyrelsen, arbetsutskott och nämnder.

Bakgrund: valbesluten saknas för mandatperioderna 2011–2014 och 2019–2022
(fullmäktiges decemberprotokoll finns inte i arkivet). Deltagarna vid ett
tidigt sammanträde säger ändå vilka som satt i organet, och vem som var
ordförande och vice ordförande. Närvarolistan är därför ersättningskälla,
och märks så: den visar de närvarande vid *ett* möte, inte organets
fastställda sammansättning. Ändringar under perioden bortses från (se
data/KALLOR.md), men ju längre in i perioden första protokollet med text
ligger, desto större risk för det; datumet står i varje post.

Källa: arkivet https://moggleif.github.io/kommunhandlingar/kungsbacka.html,
som återger kommunens protokoll som text. För varje organ och period tas
det första protokollet i fönstret vars text innehåller en närvarolista.
Fönstren är valdagens period: 2013-08-01–2014-10-14 (arkivet börjar
2013-08-13), 2015-01-01–2018-10-14, 2019-01-01–2022-10-14 och
2023-01-01–2026-10-14. Perioderna 2015–2018 och 2023–2026 hämtas som
kontroll mot valbesluten.

Vad som sparas är blocket mellan "Beslutande" och "Övriga närvarande"
*ordagrant* (`block`), och en försiktig utläsning ur det:
  * närvarolistan är tryckt i två kolumner (ledamöter till vänster,
    tjänstgörande ersättare till höger) men återges som text rad för rad;
  * ett namn med parti, "Namn (M)", först på raden är en ledamot, om inte
    raden fortsätter med "ersätter"/"för" – då är det en tjänstgörande
    ersättare;
  * en titel (ordförande, 1:e/2:e vice ordförande, vice ordförande) räknas
    bara när den står direkt efter namnet på samma rad ("Namn (M),
    ordförande");
  * allt annat – brutna efternamn, titlar som hamnat på nästa rad – tolkas
    inte, men finns kvar i `block`.
Utläsningen kontrolleras mot valbesluten i tester (kontrollperioderna).

Körs: python3 scripts/hamta_narvaro.py
"""

import html as htmlmod
import json
import re
import sys
import time
import urllib.error
from datetime import date
from pathlib import Path

from hamta_kf_val import text_ur_html
from val import hamta

ROT = Path(__file__).resolve().parent.parent
UT = ROT / "data" / "uppdrag"
BAS = "https://moggleif.github.io/kommunhandlingar/kungsbacka"

PERIODER = {
    "2011–2014": ("2013-08-01", "2014-10-14"),
    "2015–2018": ("2015-01-01", "2018-10-14"),
    "2019–2022": ("2019-01-01", "2022-10-14"),
    "2023–2026": ("2023-01-01", "2026-10-14"),
}
KONTROLL = {"2015–2018", "2023–2026"}
FLERA_PERIODER = {"2011–2014", "2019–2022"}   # perioder utan fullmäktiges valbeslut
FLERA_ANTAL = 12   # perioder där valbeslut finns att jämföra med

NAMN_PARTI = re.compile(r"([A-ZÅÄÖÉ][\wÅÄÖåäöéüáèçšć'’.\-]*(?: [A-Za-zÅÄÖåäöéüáèçšć'’.\-]+){1,4}) \(([A-Z]{1,2})\)")
TITEL = re.compile(r"^,\s*(första vice ordförande|andra vice ordförande|förste vice ordförande|"
                   r"andre vice ordförande|1:e vice ordförande|2:e vice ordförande|"
                   r"vice ordförande|ordförande)\b", re.I)
TITELNORM = {"första vice ordförande": "1:e vice ordförande", "förste vice ordförande": "1:e vice ordförande",
             "andra vice ordförande": "2:e vice ordförande", "andre vice ordförande": "2:e vice ordförande"}


def hamta_text(url: str) -> str:
    for n in range(4):
        try:
            return hamta(url).decode("utf-8")
        except urllib.error.HTTPError as fel:
            if fel.code == 404:
                return ""
            raise
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            if n == 3:
                raise
            time.sleep(2 ** (n + 1))
    return ""


def organ_ur_startsidan(html: str) -> dict:
    """slug -> organets namn, ur länkarna på arkivets startsida."""
    ut = {}
    for slug, namn in re.findall(r'href="kungsbacka/([a-z-]+)\.html"[^>]*>\s*([^<0-9][^<]*)<', html):
        if slug not in ("kalender", "status"):
            ut.setdefault(slug, " ".join(htmlmod.unescape(namn).split()))
    return ut


def protokolldatum(html: str, slug: str) -> list:
    return sorted({d for _, d in re.findall(rf"{slug}/(\d{{4}})/(\d{{4}}-\d\d-\d\d)/protokoll", html)})


UNDERSKRIFT = re.compile(r"Ordförande\s+(?:_+\s*)?([A-ZÅÄÖ][^\n(_]+?) \(([A-Z]{1,2})\)")


def ordforande_underskrift(text: str):
    """Ordförandens namn och parti på underskriftsraden ("Ordförande Thure Sandén (M)")."""
    i = text.find("Underskrifter")
    m = UNDERSKRIFT.search(text[i if i >= 0 else 0:(i if i >= 0 else 0) + 2500])
    return {"namn": m.group(1).strip(), "parti": "L" if m.group(2) == "FP" else m.group(2)} if m else None


def narvarobock(text: str):
    """Blocket mellan "Beslutande" och "Övriga närvarande", eller None."""
    i = text.find("Beslutande")
    if i < 0:
        return None
    j = text.find("Övriga närvarande", i)
    if j < 0:
        return None
    return text[i:j].strip()


TITEL_BRUTEN = re.compile(r"^,\s*(första vice|andra vice|förste vice|andre vice|1:e vice|2:e vice|vice)\b(?!\s*ordförande)", re.I)


def utlasning(block: str) -> list:
    """Se modulens docstring för reglerna. Titlar som bryts över två rader
    ("…, 1:e vice" följd av en rad som börjar med "ordförande") läses som hela titeln."""
    ut = []
    rader = [r.strip() for r in block.splitlines()]
    for i, rad in enumerate(rader):
        m = NAMN_PARTI.match(rad)
        if not m:
            continue
        namn, parti = m.group(1), m.group(2)
        rest = rad[m.end():]
        t = TITEL.match(rest)
        titel = None
        if t:
            titel = TITELNORM.get(t.group(1).lower(), t.group(1).lower())
            rest = rest[t.end():]
        else:
            tb = TITEL_BRUTEN.match(rest)
            nasta = next((r for r in rader[i + 1:i + 3] if r), "")
            if tb and nasta.lower().startswith("ordförande"):
                bas = tb.group(1).lower()
                titel = TITELNORM.get(bas + " ordförande", bas + " ordförande")
                rest = rest[tb.end():]
        tjanstg = bool(re.match(r"\s*(ersätter|för)\b", rest))
        ut.append({"namn": namn, "parti": parti,
                   "roll": "tjänstgörande ersättare" if tjanstg else "ledamot",
                   "titel": titel, "rad": rad})
        # Andra kolumnen på samma rad: "… ordförande Hampus Jägnert (SD) ersätter Roger"
        for m2 in NAMN_PARTI.finditer(rest):
            efter = rest[m2.end():]
            if re.match(r"\s*(ersätter|för)\b", efter):
                ut.append({"namn": re.sub(r"^(?:\S*ordförande|\S*vice)\s+", "", m2.group(1)),
                           "parti": m2.group(2), "roll": "tjänstgörande ersättare",
                           "titel": None, "rad": rad})
    return ut


def hamta_alla() -> dict:
    start = hamta_text(BAS + ".html")
    organ = organ_ur_startsidan(start)
    if not organ:
        sys.exit("Hittade inga organ på arkivets startsida – ändrad layout?")
    ut = {}
    for slug, namn in organ.items():
        sida = hamta_text(f"{BAS}/{slug}.html")
        datum = protokolldatum(sida, slug)
        for period, (a, b) in PERIODER.items():
            kand = [d for d in datum if a <= d <= b]
            post = {"organ": namn, "slug": slug, "period": period,
                    "protokoll_i_fonstret": len(kand), "provade": 0, "datum": None}
            flera = []
            for d in kand:
                post["provade"] += 1
                url = f"{BAS}/{slug}/{d[:4]}/{d}/protokoll.html"
                protokolltext = text_ur_html(hamta_text(url))
                block = narvarobock(protokolltext)
                time.sleep(0.1)
                if block and len(block) > 40:
                    if post["datum"] is None:
                        post.update({"datum": d, "arkiv": url, "block": block,
                                     "utlasning": utlasning(block)})
                    flera.append({"datum": d, "arkiv": url, "utlasning": utlasning(block),
                                  "ordforande_underskrift": ordforande_underskrift(protokolltext)})
                    # De sex första protokollen med text i perioder utan valbeslut ger en fullare bild
                    # (alla ledamöter är sällan med vid ett enda möte); övriga perioder: bara det första.
                    if period not in FLERA_PERIODER or len(flera) >= FLERA_ANTAL:
                        break
            if period in FLERA_PERIODER:
                post["flera_moten"] = flera
            ut[f"{slug}|{period}"] = post
            print(f"{namn:42} {period}: {post['datum'] or 'inget protokoll med text'} "
                  f"({post['protokoll_i_fonstret']} i fönstret)")
    return ut


def main() -> None:
    poster = hamta_alla()
    fil = UT / "narvaro.json"
    UT.mkdir(parents=True, exist_ok=True)
    fil.write_text(json.dumps({
        "kalla": BAS + ".html", "hamtad": date.today().isoformat(),
        "kontrollperioder": sorted(KONTROLL),
        "observera": "Närvarolistan visar de närvarande vid ett möte, inte organets fastställda sammansättning.",
        "poster": list(poster.values())}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("Skrev", fil.relative_to(ROT))


if __name__ == "__main__":
    main()
