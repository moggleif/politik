"""Gemensamt för skripten som hämtar ur Skolverkets exporttjänst.

hamta_slutbetyg.py, hamta_amnesbetyg.py och hamta_kullkedjan.py läser
alla samma tjänst (den bakom "Sök statistik"), bara olika rapporter:

  https://siris.skolverket.se/siris/reports/export_api/runexport/
      ?pFormat=csv&pExportID=<rapport>&pAr=<år>&pKommun=1384&pFlikar=0

Här ligger det som är gemensamt: adresserna, kommunen, hämtningen med
återförsök och de parsningshjälpare som betyder samma sak i alla
rapporter. Det som skiljer per rapport – kolumnlayout och hur prickade
värden ska representeras i utdatan – bor kvar i respektive skript.
"""

import csv
import io
import ssl
import time
import urllib.request

EXPORT_URL = ("https://siris.skolverket.se/siris/reports/export_api/runexport/"
              "?pFormat=csv&pExportID={export}&pAr={ar}&pKommun={kommun}&pFlikar=0")

# Mänsklig ingång till samma statistik, för källförteckningarna på hemsidan.
STATISTIK_URL = ("https://www.skolverket.se/skolutveckling/statistik/"
                 "sok-statistik-om-forskola-skola-och-vuxenutbildning")

KOMMUN = "1384"          # skolkommun Kungsbacka
KOMMUNNAMN = "Kungsbacka"


def export_url(export: int, ar: int) -> str:
    return EXPORT_URL.format(export=export, ar=ar, kommun=KOMMUN)


def hamta_csv(export: int, ar: int) -> str:
    """CSV:en för ett år. Exporttjänsten bryter då och då kopplingen mitt
    i ett svar; det är övergående och ska inte stoppa hela hämtningen."""
    req = urllib.request.Request(
        export_url(export, ar),
        headers={"User-Agent": "kungsbacka-i-siffror/1.0"})
    sista = None
    for forsok in range(4):
        try:
            with urllib.request.urlopen(
                    req, timeout=120,
                    context=ssl.create_default_context()) as r:
                return r.read().decode("utf-8-sig")
        except Exception as fel:          # nätverksfel, avbruten koppling
            sista = fel
            time.sleep(2 ** forsok)
    raise sista


def rader_i(text: str) -> list:
    return list(csv.reader(io.StringIO(text), delimiter=";"))


def rubrikrad(rader: list, forsta_kolumn: str) -> int:
    """Radnumret för kolumnrubrikerna, hittad på sin första kolumn.

    Rapporterna har en inledande textdel vars längd har ändrats genom
    åren, så raden får inte pekas ut med ett fast index."""
    for i, rad in enumerate(rader):
        if rad and rad[0].strip() == forsta_kolumn:
            return i
    raise SystemExit(f"Hittade ingen rubrikrad som börjar med {forsta_kolumn!r} "
                     "– exportens layout verkar ha ändrats.")


def lasar_ur(rader: list, etikett: str) -> str:
    for rad in rader[:8]:
        if rad and rad[0].startswith(etikett):
            return rad[0].split(":", 1)[1].strip()
    return ""


def tal(text: str, tilde_ar_100: bool = False):
    """Skolverkets prickning: '..' = färre än tio elever (uppgiften döljs),
    '.' = uppgiften saknas helt. Båda blir None.

    Med `tilde_ar_100` läses '~100' – Skolverkets sätt att skriva att 1–4
    elever saknade måttet – som 100,0; annars blir det None.

    hamta_slutbetyg.py har medvetet en egen variant: den returnerar
    (värde, prickkod) och alltid float, eftersom det är så dess utdatafiler
    ser ut sedan starten."""
    t = (text or "").strip()
    if t in ("", ".", ".."):
        return None
    if t == "~100":
        return 100.0 if tilde_ar_100 else None
    t = t.replace("\xa0", "").replace(" ", "").replace(",", ".")
    try:
        return float(t) if "." in t else int(t)
    except ValueError:
        return None
