#!/usr/bin/env python3
"""Hämtar antalet röstberättigade per kommun, län och rike ur
Valmyndighetens statistik – nämnaren för "andel av de röstberättigade"
på förtidsröstningssidan.

Två filer, båda Excel-filer från val.se, lästa med enbart standardbiblioteket
(zip + XML), så att inget extra beroende behövs:

  2026  "Antal röstberättigade per valdistrikt och valtyp, 14 augusti 2026"
        – kvalifikationsdagen, alltså den dag röstlängden fastställs.
        Ger antalet röstberättigade i vart och ett av de tre valen och i
        minst ett val.
  2022  "Röster per distrikt, slutligt antal röster inklusive totalt
        valdeltagande, riksdagsvalet 2022" – ur den slutliga
        sammanräkningen, där antalet röstberättigade per valdistrikt
        anges. Röstlängden fastställs på kvalifikationsdagen, så det är
        samma tal som gällde under förtidsröstningen 2022. Bara
        riksdagsvalet finns i den filen.

Jämförelsen mellan åren görs därför på röstberättigade i *riksdagsvalet*,
som finns för båda. Personer som bara får rösta i kommun- och regionvalen
(utan svenskt medborgarskap) ingår inte i den nämnaren.

Valdistriktskoden börjar med länskod (två siffror) och kommunkod (två
siffror). Summorna sparas per kommun (fyra siffror), per län (två
siffror) och för riket ("00") i data/fortidsroster/rostberattigade.json.

Körs:  python3 scripts/hamta_rostberattigade.py
"""

import json
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

from val import RIKET, distriktskod, hamta, kolumn, las_blad, omraden_for

ROT = Path(__file__).resolve().parent.parent
UT = ROT / "data" / "fortidsroster" / "rostberattigade.json"

KALLOR = {
    2026: {
        "kvalifikationsdag": "2026-08-14",
        "url": "https://www.val.se/download/18.1a2972da19f159e73fd3c73/1787125120381/antal-rostberattigade-per-valdistrikt-och-valtyp-14-augusti-2026.xlsx",
        "sidaUrl": "https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-val-2026",
        "kalla": "Valmyndigheten, Antal röstberättigade per valdistrikt och valtyp, kvalifikationsdagen 14 augusti 2026",
        "blad": "Antal röstberättigade",
    },
    2022: {
        "kvalifikationsdag": "2022-08-12",
        "url": "https://www.val.se/download/18.162047b519a91d0533118f4b/1764336897948/Roster-per-distrikt-slutligt-antal-roster-inklusive-totalt-valdeltagande-riksdagsvalet-2022.xlsx",
        "sidaUrl": "https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-fran-val-2002-2022",
        "kalla": "Valmyndigheten, Röster per distrikt, slutligt antal röster inklusive totalt valdeltagande, riksdagsvalet 2022",
        "blad": "roster_RD",
    },
}

def summera(per_distrikt: dict) -> dict:
    """{distriktskod: {fält: tal}} -> {områdeskod: {fält: summa, valdistrikt: n}}.
    Uppsamlingsdistrikt (0 röstberättigade) räknas inte som valdistrikt."""
    ut = defaultdict(lambda: defaultdict(int))
    for kod, falt in per_distrikt.items():
        for omrade in omraden_for(kod):
            for k, v in falt.items():
                ut[omrade][k] += v
            if falt.get("riksdag", 0) > 0:
                ut[omrade]["valdistrikt"] += 1
    return {k: dict(v) for k, v in sorted(ut.items())}


def rostberattigade_2026(rader) -> dict:
    rub = rader[0]
    k_kod = kolumn(rub, "Valdistriktskod")
    falt = {
        "riksdag": kolumn(rub, "Röstberättigade val till riksdagen"),
        "kommun": kolumn(rub, "Röstberättigade val till kommunfullmäktige"),
        "region": kolumn(rub, "Röstberättigade val till regionfullmäktige"),
        "minstEtt": kolumn(rub, "Röstberättigade minst ett val"),
    }
    per_distrikt = {}
    for rad in rader[1:]:
        kod = distriktskod(rad[k_kod]) if len(rad) > k_kod else ""
        if not kod:
            continue
        if kod in per_distrikt:
            sys.exit(f"Distrikt {kod} förekommer två gånger")
        # Gotland har inget regionval (kommunen är också region): tom cell = 0
        per_distrikt[kod] = {k: int(float(rad[i])) if rad[i] not in (None, "") else 0
                             for k, i in falt.items()}
    return summera(per_distrikt)


def rostberattigade_2022(rader) -> dict:
    """Filen har en rad per parti och distrikt, med distriktets antal
    röstberättigade upprepat på varje rad – summera därför per distrikt,
    inte per rad."""
    rub = rader[0]
    k_kod = kolumn(rub, "Valdistriktskod")
    k_rb = kolumn(rub, "Röstberättigade")
    per_distrikt = {}
    for rad in rader[1:]:
        kod = distriktskod(rad[k_kod]) if len(rad) > k_kod else ""
        if not kod:
            continue
        varde = int(float(rad[k_rb]))
        if kod in per_distrikt and per_distrikt[kod]["riksdag"] != varde:
            sys.exit(f"Distrikt {kod} har olika antal röstberättigade på olika rader")
        per_distrikt[kod] = {"riksdag": varde}
    return summera(per_distrikt)


def main() -> None:
    ut = {"riket": RIKET, "val": {}}
    for ar, k in KALLOR.items():
        print(f"Hämtar {ar} …")
        rader = las_blad(hamta(k["url"]), k["blad"])
        omraden = rostberattigade_2026(rader) if ar == 2026 else rostberattigade_2022(rader)
        ut["val"][str(ar)] = {
            "kvalifikationsdag": k["kvalifikationsdag"],
            "kalla": k["kalla"], "kallaUrl": k["url"], "sidaUrl": k["sidaUrl"],
            "hamtad": date.today().isoformat(),
            "omraden": omraden,
        }
        print(f"  {len(omraden)} områden; riket: {omraden[RIKET]}")
    UT.parent.mkdir(parents=True, exist_ok=True)
    UT.write_text(json.dumps(ut, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Skrev {UT.relative_to(ROT)}")


if __name__ == "__main__":
    main()
