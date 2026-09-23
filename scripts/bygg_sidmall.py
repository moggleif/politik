#!/usr/bin/env python3
"""Skriver in samma sidhuvud och samma sidfot på alla sidor i docs/.

Menyn och sidfoten är likadana på varje sida, och ska därför bara finnas
på ett ställe: här. Skriptet bygger navigeringen ur MENY nedan och sidfoten
ur SIDFOT_LANKAR, och skriver in dem i varje docs/*.html. Det som är
sidans eget rör skriptet inte: rubriken, ingressen, innehållet och den rad
i sidfoten som räknar upp sidans egna källor (<p class="sidfot-data">)
skrivs av sidan själv.

    python3 scripts/bygg_sidmall.py                skriv in menyn i sidorna
    python3 scripts/bygg_sidmall.py --kontrollera  faller om någon sida
                                                   har hamnat i otakt

Den senare körs i CI, så att en sida inte kan bli kvar med en gammal meny.
"""

import argparse
import pathlib
import re
import sys

DOCS = pathlib.Path(__file__).resolve().parent.parent / "docs"

START = "index.html"
MARKESNAMN = "Kungsbacka i siffror"
GITHUB = "https://github.com/moggleif/politik"

# Menyn: antingen ("rubrik", [(fil, etikett), ...]) för en meny som fälls
# ut, eller (fil, "etikett") för en ensam länk.
MENY = [
    ("Befolkning", [
        ("befolkningsprognos.html", "Hela befolkningen"),
        ("barn-och-unga.html", "0–15 år"),
        ("gymnasiealdern.html", "16–19 år"),
    ]),
    ("Grundskolan", [
        ("amnesbetyg.html", "Betyg per ämne i nian"),
        ("kostnad-per-elev.html", "Kostnad per elev"),
        ("resurser-till-skolan.html", "Resurser mot referenskostnad"),
    ]),
    ("Gymnasiet", [
        ("platser.html", "Platser på programmen"),
        ("meritvarden.html", "Meritvärden vid antagningen"),
        ("slutbetyg.html", "Slutbetyg från gymnasiet"),
        ("antagning-till-examen.html", "Från antagning till examen"),
        ("nian-till-gymnasiet.html", "Från nian till gymnasiet"),
    ]),
    ("Valen", [
        ("fortidsrostning.html", "Förtidsröstningen 2026"),
        ("valresultat.html", "Valresultat per distrikt"),
    ]),
    ("Kommunfullmäktige", [
        ("fullmaktige.html", "Inspelade möten"),
    ]),
    ("Varberg", [
        ("varberg-befolkningsprognos.html", "Hela befolkningen"),
        ("varberg-barn-och-unga.html", "0–15 år"),
        ("varberg-gymnasiealdern.html", "16–18 år"),
    ]),
    ("metod.html", "Metod"),
]

SIDFOT_LANKAR = [
    (START, "Start"),
    ("metod.html", "Metod och källor"),
    (GITHUB, "Källkod och data på GitHub"),
    (GITHUB + "/issues", "Hittade du ett fel?"),
]

SIDFOT_NOT = (
    "Fristående sammanställning av offentliga siffror &ndash; sidorna drivs "
    "inte av Kungsbacka kommun. Alla beräkningar är öppna och koden är "
    "MIT-licensierad."
)

NAV_MONSTER = re.compile(r'[ \t]*<nav class="toppnav".*?</nav>\n', re.S)
GAMMAL_NAV = re.compile(r'[ \t]*<nav class="huvudnav".*?</nav>\n', re.S)
SIDFOT_MONSTER = re.compile(r'[ \t]*<footer.*?</footer>\n', re.S)
DATARAD = re.compile(r'<p class="sidfot-data">(.*?)</p>', re.S)
GAMMAL_DATARAD = re.compile(r'<p>\s*(Data:.*?)</p>', re.S)
KALLKODSMENING = re.compile(r'\s*Källkod:\s*<a[^>]*>.*?</a>\s*\.\s*$', re.S)


def sidor():
    return sorted(DOCS.glob("*.html"))


def nav_html(fil):
    """Menyn för en sida. Sidan själv märks med aria-current, och den
    grupp den ligger i får klassen "aktuell" så att den syns även när
    menyn är hopfälld."""
    rader = ['<nav class="toppnav" aria-label="Webbplatsens sidor">',
             '  <div class="toppnav-inre">']
    markes = f'    <a class="markesnamn" href="{START}"'
    if fil == START:
        markes += ' aria-current="page"'
    rader.append(markes + f">{MARKESNAMN}</a>")
    rader.append('    <ul class="navrad">')
    for post in MENY:
        if isinstance(post[1], list):
            rubrik, lankar = post
            aktuell = any(mal == fil for mal, _ in lankar)
            klass = "navmeny aktuell" if aktuell else "navmeny"
            rader.append('      <li class="navpost">')
            rader.append(f'        <details class="{klass}">')
            rader.append(f"          <summary>{rubrik}</summary>")
            rader.append('          <ul class="navpanel">')
            for mal, etikett in lankar:
                nu = ' aria-current="page"' if mal == fil else ""
                rader.append(f'            <li><a href="{mal}"{nu}>{etikett}</a></li>')
            rader.append("          </ul>")
            rader.append("        </details>")
            rader.append("      </li>")
        else:
            mal, etikett = post
            nu = ' aria-current="page"' if mal == fil else ""
            rader.append(f'      <li class="navpost"><a href="{mal}"{nu}>{etikett}</a></li>')
    rader += ["    </ul>", "  </div>", "</nav>"]
    return "\n".join(rader) + "\n"


def sidfot_html(datarad):
    rader = ['<footer class="sidfot">',
             '  <div class="sidfot-inre">',
             '    <nav class="sidfot-nav" aria-label="Om webbplatsen">',
             "      <ul>"]
    for mal, etikett in SIDFOT_LANKAR:
        rader.append(f'        <li><a href="{mal}">{etikett}</a></li>')
    rader += ["      </ul>", "    </nav>"]
    rader.append(f'    <p class="sidfot-data">{datarad}</p>')
    rader.append(f'    <p class="sidfot-not">{SIDFOT_NOT}</p>')
    rader += ["  </div>", "</footer>"]
    return "\n".join(rader) + "\n"


def las_datarad(text, fil):
    """Sidans egen källrad ur den befintliga sidfoten. Tål den äldre
    formen, där raden saknade klass och slutade med en länk till
    källkoden – den länken ligger numera i sidfotens länkrad."""
    traff = DATARAD.search(text) or GAMMAL_DATARAD.search(text)
    if not traff:
        raise SystemExit(f"{fil.name}: hittade ingen källrad i sidfoten")
    rad = KALLKODSMENING.sub("", traff.group(1).strip())
    # Radbrytningarna i källan säger inget – normalisera dem.
    return " ".join(rad.split())


def dra_in(block, steg):
    prefix = " " * steg
    return "".join(prefix + r if r.strip() else r for r in block.splitlines(True))


def bygg(fil):
    text = fil.read_text(encoding="utf-8")
    ny = text

    nav = nav_html(fil.name)
    if NAV_MONSTER.search(ny):
        ny = NAV_MONSTER.sub(lambda _: dra_in(nav, 0), ny, count=1)
    elif GAMMAL_NAV.search(ny):
        # Den gamla menyn låg inuti .sidhuvud-inre; den nya ligger före.
        ny = GAMMAL_NAV.sub("", ny, count=1)
        ny = ny.replace('<header class="sidhuvud">\n',
                        '<header class="sidhuvud">\n' + nav, 1)
    else:
        ny = ny.replace('<header class="sidhuvud">\n',
                        '<header class="sidhuvud">\n' + nav, 1)

    sidfot = sidfot_html(las_datarad(ny, fil))
    if not SIDFOT_MONSTER.search(ny):
        raise SystemExit(f"{fil.name}: hittade ingen sidfot")
    ny = SIDFOT_MONSTER.sub(lambda _: sidfot, ny, count=1)
    return text, ny


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--kontrollera", action="store_true",
                   help="skriv inte, fall om någon sida är i otakt")
    args = p.parse_args()

    otakt = []
    for fil in sidor():
        gammal, ny = bygg(fil)
        if gammal == ny:
            continue
        otakt.append(fil.name)
        if not args.kontrollera:
            fil.write_text(ny, encoding="utf-8")

    if args.kontrollera and otakt:
        print("Sidhuvudet eller sidfoten är i otakt på: " + ", ".join(otakt))
        print("Kör: python3 scripts/bygg_sidmall.py")
        return 1
    if args.kontrollera:
        print(f"Alla {len(sidor())} sidor har samma meny och sidfot.")
    else:
        print(f"Skrev om {len(otakt)} av {len(sidor())} sidor."
              + (" " + ", ".join(otakt) if otakt else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
