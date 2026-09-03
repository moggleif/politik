#!/usr/bin/env python3
"""Kontrollerar att webbplatsens interna referenser pekar på filer som finns.

Tre kontroller, alla utan nätverk:

  1. Varje relativ href/src i docs/*.html ska peka på en fil i docs/.
  2. Varje docs/data*.json och docs/data-*/*.json ska gå att läsa som JSON.
  3. Varje lokalPdf/lokalFil i data/**/*.json ska peka på en fil i docs/.

Körs:  python3 scripts/kontrollera_lankar.py
Avslutar med felkod och en lista över brutna referenser om något saknas.
"""

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROT = Path(__file__).resolve().parent.parent
DOCS = ROT / "docs"

fel = []


def ar_intern(url: str) -> bool:
    p = urlparse(url)
    return not p.scheme and not p.netloc and bool(p.path)


for html in sorted(DOCS.glob("*.html")):
    text = html.read_text(encoding="utf-8")
    for m in re.finditer(r'\b(?:href|src)="([^"]+)"', text):
        url = m.group(1)
        if not ar_intern(url):
            continue
        mal = (DOCS / urlparse(url).path).resolve()
        if not mal.is_file():
            fel.append(f"{html.name}: {url}")

for datafil in sorted(list(DOCS.glob("data*.json")) + list(DOCS.glob("data-*/*.json"))):
    try:
        json.loads(datafil.read_text(encoding="utf-8"))
    except ValueError as e:
        fel.append(f"{datafil.name}: ogiltig JSON ({e})")


def leta_lokala(objekt, kalla):
    if isinstance(objekt, dict):
        for nyckel, varde in objekt.items():
            if nyckel in ("lokalPdf", "lokalFil") and isinstance(varde, str):
                if not (DOCS / varde).is_file():
                    fel.append(f"{kalla}: {nyckel} -> {varde}")
            else:
                leta_lokala(varde, kalla)
    elif isinstance(objekt, list):
        for varde in objekt:
            leta_lokala(varde, kalla)


for datafil in sorted((ROT / "data").rglob("*.json")):
    leta_lokala(json.loads(datafil.read_text(encoding="utf-8")),
                str(datafil.relative_to(ROT)))

if fel:
    print(f"{len(fel)} brutna referenser:")
    for rad in fel:
        print("  " + rad)
    sys.exit(1)
print("Alla interna referenser hittade sina filer.")
