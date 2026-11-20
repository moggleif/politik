"""Sökindexet docs/sok.json för knappen Sök i projektets gemensamma sajtrad.

Formatet bestäms av Giffå (beslut 0018 där): grupper med poster, där varje
post har det som visas (rubrik, adress, om) och det som söks i (traff och
text, i små bokstäver). Här är det en grupp, sidorna, med en post per sida i
menyns ordning och startsidan först. Posten har sidans h1, var den står i
menyn och, att söka i, rubriken, menyns namn på sidan och ingressen först
och mellanrubrikerna sedan. En sida som bara skickar vidare (flyttad.js)
tas inte med.

    python3 scripts/bygg_sokindex.py                skriv docs/sok.json
    python3 scripts/bygg_sokindex.py --kontrollera  faller om filen är i otakt
"""

import argparse
import json
import sys
from html.parser import HTMLParser

from bygg_sidmall import DOCS, MENY, START

UT = DOCS / "sok.json"


class Rubriker(HTMLParser):
    """h1, ingressen och h2 ur en sida, som text."""

    def __init__(self):
        super().__init__()
        self.delar = {"h1": [], "ingress": [], "h2": []}
        self.nu = None

    def handle_starttag(self, tagg, attribut):
        if tagg in ("h1", "h2"):
            self.nu = [tagg, []]
        elif tagg == "p" and ("class", "ingress") in attribut:
            self.nu = ["ingress", []]

    def handle_endtag(self, tagg):
        if self.nu and tagg in (self.nu[0], "p"):
            self.delar[self.nu[0]].append(" ".join("".join(self.nu[1]).split()))
            self.nu = None

    def handle_data(self, data):
        if self.nu:
            self.nu[1].append(data)


def menyplatser():
    """Varje sida i menyns ordning med var den står: (fil, etikett, stig)."""
    for rubrik, innehall in MENY:
        if isinstance(innehall, str):
            yield rubrik, innehall, []
            continue
        for forsta, andra in innehall:
            if isinstance(andra, str):
                yield forsta, andra, [rubrik]
            else:
                yield from ((fil, etikett, [rubrik, forsta]) for fil, etikett in andra)


def post(fil, etikett, stig):
    text = (DOCS / fil).read_text(encoding="utf-8")
    delar = Rubriker()
    delar.feed(text)
    h1 = delar.delar["h1"][0]
    return {
        "rubrik": h1,
        "adress": fil,
        "om": [" · ".join(stig + [etikett])],
        "traff": " ".join([h1, etikett, *delar.delar["ingress"]]).lower(),
        "text": " ".join(delar.delar["h2"]).lower(),
    }


def index():
    poster = [post(START, "Start", [])]
    poster += [post(fil, etikett, stig) for fil, etikett, stig in menyplatser()]
    return json.dumps({"grupper": [{"rubrik": "Sidorna", "poster": poster}]},
                      ensure_ascii=False, indent=1) + "\n"


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--kontrollera", action="store_true",
                   help="skriv inte, fall om docs/sok.json är i otakt")
    args = p.parse_args()
    nytt = index()
    if args.kontrollera:
        if not UT.exists() or UT.read_text(encoding="utf-8") != nytt:
            print("docs/sok.json är i otakt. Kör: python3 scripts/bygg_sokindex.py")
            return 1
        print("docs/sok.json stämmer med sidorna.")
        return 0
    UT.write_text(nytt, encoding="utf-8")
    print(f"Skrev docs/sok.json med {len(json.loads(nytt)['grupper'][0]['poster'])} sidor.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
