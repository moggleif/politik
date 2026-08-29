#!/usr/bin/env python3
"""Läser meritvärdena för Kungsbackas gymnasieskolor ur GR:s antagningsrapport.

Göteborgsregionen (GR) sköter gymnasieantagningen för Kungsbacka och
publicerar efter varje slutantagning en PDF med två tal per utbildning:

  antagningspoäng   den sist antagna elevens meritvärde, alltså den gräns
                    som gällde för att komma in
  medelmeritvärde   medelvärdet av de antagna elevernas meritvärden

Rapporternas layout har bytt form tre gånger. Skriptet klarar alla tre:

  grupperad   2017–2024. En avdelning per kommun, raden inleds med
              "Skola,Utbildning" (eller "Utbildning,Skola" – samma tabell
              trycks två gånger, sorterad på olika sätt). Kolumnerna är
              prel/slut/reserv i par.
  platt-6     2025. En rad per utbildning med egna kolumner för kommun och
              skola, och bara slutantagningens två tal.
  platt-9     2026. Som ovan, men med både preliminär- och slutantagning.

Talen sitter i sina kolumner utan att raderna har någon avgränsare i
texten, så tabellen läses ur ordens koordinater: de vågräta linjerna i
PDF:en avgränsar raderna och kolumnernas x-lägen tas ur tabellhuvudet.

Att samma tabell trycks två gånger i de äldre rapporterna är en fördel:
skriptet läser båda och jämför. Skiljer sig talen åt flaggas raden.

Körs:  python3 scripts/extrahera_antagning.py <rapport.pdf> [--ar 2022]
Utskriften är ett JSON-utkast att spara som data/antagning/antagning_<år>.json
efter att källänkarna fyllts i.
"""

import argparse
import collections
import json
import re
import sys

try:
    import pdfplumber
except ImportError:
    sys.exit("Saknar pdfplumber. Installera med:  pip install pdfplumber")

# Kungsbackas två kommunala gymnasieskolor. GR:s rapport täcker hela
# regionen; allt annat sorteras bort här.
SKOLOR = ("Aranäsgymnasiet", "Elof Lindälvs gymnasium")

# Fotnoterna i rapporten. Står en av dem i stället för ett tal betyder det
# att utbildningen inte hade någon antagningsgräns det året – viktigast är
# 1), som betyder att alla behöriga sökande kom in.
KODER = {
    "1": "Alla behöriga sökande antagna",
    "2": "Enbart test",
    "3": "Ingen antagen på poäng",
    "4": "Ingen preliminärantagning görs",
    "5": "Placering sker manuellt",
    "6": "Meddelas på annat sätt",
}


# Markör för fetstil, som bärs med genom cellinläsningen och plockas bort
# när cellen tolkas. Ett tecken som inte kan förekomma i rapporten.
FET = "\x00"


def slaihop(xs, tol=3):
    """Slår ihop x- eller y-lägen som ligger så nära att de är samma linje."""
    ut = []
    for x in sorted(xs):
        if ut and x - ut[-1] <= tol:
            continue
        ut.append(x)
    return ut


def radlinjer(sida):
    return slaihop([e["top"] for e in sida.edges if e["orientation"] == "h"], tol=2)


def celler(sida, xgranser, ygranser):
    """Delar in sidans ord i ett rutnät efter kolumn- och radgränserna.

    Fetstil bärs med: från 2025 markerar rapporten med fet stil de
    utbildningar som inte hade några lediga platser kvar.
    """
    ord_ = sida.extract_words(extra_attrs=["fontname"])
    rader = []
    for topp, botten in zip(ygranser, ygranser[1:]):
        rad = ["" for _ in range(len(xgranser) - 1)]
        for o in ord_:
            if not (topp - 1 <= o["top"] < botten - 1):
                continue
            mitt = (o["x0"] + o["x1"]) / 2
            text = o["text"]
            if "Bold" in o.get("fontname", ""):
                text = FET + text
            for k in range(len(xgranser) - 1):
                if xgranser[k] <= mitt < xgranser[k + 1]:
                    rad[k] = (rad[k] + " " + text).strip()
                    break
        if any(rad):
            rader.append(rad)
    return rader


def tal(text):
    """Första talet i en cell. Sidfoten kan ha runnit in efter talet."""
    m = re.match(r"^(\d+[.,]\d+)", text.strip().replace(FET, ""))
    return float(m.group(1).replace(",", ".")) if m else None


def kod(text):
    m = re.match(r"^(\d)\)", text.strip().replace(FET, ""))
    return m.group(1) if m else None


def fet(text):
    """Sant om cellen står i fet stil, alltså utbildning utan lediga platser."""
    return FET in text


def ren(text):
    """Cellens text utan fetstilsmarkörer."""
    return text.replace(FET, "")


# ---------- grupperad layout (2017–2024) ----------

def kolumner_grupperad(sida):
    """Kolumnerna syns som upprepade vågräta streck – ett per cell och rad."""
    antal = collections.Counter()
    for e in sida.edges:
        if e["orientation"] == "h":
            antal[(round(e["x0"]), round(e["x1"]))] += 1
    segment = [k for k, v in antal.items() if v >= 3]
    return slaihop({s[0] for s in segment} | {s[1] for s in segment})


def dela_namn(text):
    """Raden är "Skola,Utbildning" eller "Utbildning,Skola" – båda förekommer."""
    for skola in SKOLOR:
        if text.startswith(skola + ","):
            return skola, text[len(skola) + 1:].strip()
        if text.endswith("," + skola):
            return skola, text[: -(len(skola) + 1)].strip()
    return None, None


def las_grupperad(pdf):
    for sida in pdf.pages:
        text = sida.extract_text() or ""
        if not any(s in text for s in SKOLOR):
            continue
        xg = kolumner_grupperad(sida)
        if len(xg) < 6:
            continue
        for rad in celler(sida, xg, radlinjer(sida)):
            kolumn = next((i for i, c in enumerate(rad)
                           if any(s in ren(c) for s in SKOLOR)), None)
            if kolumn is None:
                continue
            # Sidfotens fotnotsförklaring kan ha runnit in i namnet.
            namncell = re.split(r"\s\d\)[A-ZÅÄÖa-zåäö]", ren(rad[kolumn]))[0].strip()
            skola, utbildning = dela_namn(namncell)
            # Långa utbildningsnamn kan brytas mot nästa radlinje. Bara den
            # rad som bär programkoden ("… BF", "… NA") är hela raden;
            # fortsättningen är en dubblett av samma tal.
            if not skola or not re.search(r"\b[A-ZÅÄÖ]{2}\b", utbildning):
                continue
            resten = rad[kolumn + 1:]
            if len(resten) < 4:
                continue
            # prel-poäng, prel-medel, slut-poäng, slut-medel
            yield skola, utbildning, resten[2], resten[3]


# ---------- platt layout (2025–) ----------

def kolumner_platt(sida):
    lodrat = slaihop([e["x0"] for e in sida.edges if e["orientation"] == "v"])
    if len(lodrat) >= 6:                      # 2026 har utritade kolumnlinjer
        return [round(x) for x in lodrat] + [10_000]

    ord_ = sida.extract_words()
    lage = [o for o in ord_ if o["text"] == "Lägeskommun"]
    if not lage:
        return None
    topp = lage[0]["top"]
    rubriker = ("Lägeskommun", "Gymnasieskola", "Program", "Inriktning")
    # Bara rubrikraden – samma ord förekommer även i skolnamn längre ned.
    xg = slaihop([o["x0"] for o in ord_
                  if o["text"] in rubriker and abs(o["top"] - topp) < 3])
    # Talkolumnerna är högerställda, så deras vänsterkant tas ur rubriken.
    tal_ = slaihop([o["x0"] for o in ord_
                    if o["text"].startswith(("Antagningspoäng", "Medelmeritvärde"))
                    and o["top"] < topp + 30 and o["x0"] > xg[-1]], tol=20)
    return [round(x) for x in xg + tal_] + [10_000]


def las_platt(pdf, i_poang, i_medel):
    for sida in pdf.pages:
        text = sida.extract_text() or ""
        if not any(s in text for s in SKOLOR):
            continue
        xg = kolumner_platt(sida)
        if not xg:
            continue
        for rad in celler(sida, xg, radlinjer(sida)):
            if len(rad) < 5 or not any(s in ren(rad[1]) for s in SKOLOR):
                continue
            varden = rad[4:]
            if len(varden) <= max(i_poang, i_medel):
                continue
            skola = next(s for s in SKOLOR if s in ren(rad[1]))
            utbildning = ren(rad[2]) + (" - " + ren(rad[3]) if rad[3] else "")
            yield skola, utbildning, varden[i_poang], varden[i_medel]


# ---------- gemensamt ----------

def las_rapport(sokvag):
    with pdfplumber.open(sokvag) as pdf:
        forsta = " ".join((s.extract_text() or "") for s in pdf.pages[:2])
        if "Lägeskommun" in forsta:
            # 2026 redovisar både preliminär- och slutantagning, 2025 bara slut
            kolumnpar = (2, 3) if "prel" in forsta else (0, 1)
            rader = list(las_platt(pdf, *kolumnpar))
            layout = "platt-9" if kolumnpar == (2, 3) else "platt-6"
        else:
            rader = list(las_grupperad(pdf))
            layout = "grupperad"
        artal = re.search(r"(?:[Ss]lutantagning\w*|[Aa]ntagningsår)[^\n]{0,25}?(20\d\d)", forsta)
    return rader, layout, int(artal.group(1)) if artal else None


def sammanfoga(rader, fetmarkering: bool):
    """Slår ihop rapportens två sorteringar och flaggar tal som inte stämmer."""
    sammanslaget = {}
    avvikande = []
    for skola, utbildning, poang, medel in rader:
        nyckel = (skola, utbildning)
        ny = {
            "antagningspoang": tal(poang),
            "antagningspoangKod": kod(poang),
            "medelmeritvarde": tal(medel),
            # Fetstilen finns bara i de nyare rapporterna. I de äldre går
            # samma sak att läsa ur koden 1) (alla behöriga antagna), så
            # fältet lämnas tomt i stället för att gissa.
            "utanLedigaPlatser": fet(poang) if fetmarkering else None,
        }
        gammal = sammanslaget.get(nyckel)
        if gammal is None:
            sammanslaget[nyckel] = ny
            continue
        for falt in ny:
            if gammal[falt] is None:
                gammal[falt] = ny[falt]
            elif ny[falt] is not None and ny[falt] != gammal[falt]:
                avvikande.append((skola, utbildning, falt, gammal[falt], ny[falt]))
    # Ett namn som bryts mot en radlinje ger en extra rad med avhugget
    # namn ("… - Svetsteknik," eller "… - Bageri") och sidfotstext i
    # talkolumnerna. Den fullständiga raden finns i rapportens andra
    # sortering. Tre kännetecken måste stämma samtidigt, så att en riktig
    # utbildning vars namn råkar vara ett prefix av en annan inte tas bort:
    #
    #   * namnet är ett äkta prefix av ett annat namn på samma skola
    #   * brottet ligger vid en ordgräns (nästa tecken är blanksteg eller
    #     komma) – annars är det två skilda namn
    #   * raden saknar egna mätvärden; det som står i talkolumnerna kommer
    #     från sidfoten och blir aldrig ett tal
    def ar_fragment(skola, utbildning):
        post = sammanslaget[(skola, utbildning)]
        if post["antagningspoang"] is not None or post["medelmeritvarde"] is not None:
            return False
        for s2, u2 in sammanslaget:
            if s2 != skola or u2 == utbildning or not u2.startswith(utbildning):
                continue
            if u2[len(utbildning):len(utbildning) + 1] in (" ", ","):
                return True
        return False

    for nyckel in [n for n in sammanslaget if ar_fragment(*n)]:
        del sammanslaget[nyckel]

    return sammanslaget, avvikande


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("pdf")
    p.add_argument("--ar", type=int, help="antagningsår, om det inte kan läsas ur filen")
    args = p.parse_args()

    rader, layout, artal = las_rapport(args.pdf)
    artal = args.ar or artal
    if artal is None:
        sys.exit("Kunde inte läsa antagningsåret ur rapporten – ange det med --ar")

    sammanslaget, avvikande = sammanfoga(rader, layout != "grupperad")
    for skola, utbildning, falt, a, b in avvikande:
        print(f"# VARNING: {skola}, {utbildning}: {falt} läses som {a} och {b}",
              file=sys.stderr)

    utbildningar = [
        {"skola": skola, "utbildning": utbildning, **varden}
        for (skola, utbildning), varden in sorted(sammanslaget.items())
    ]
    utkast = {
        "ar": artal,
        "omgang": "slutantagning",
        "rapportTitel": f"Antagningspoäng och medelvärde, slutantagningen {artal}",
        "kallaUrl": "FYLL I",
        "arkivUrl": None,
        "lokalPdf": f"rapporter/antagning-slutantagning-{artal}.pdf",
        "layout": layout,
        "koder": KODER,
        "utbildningar": utbildningar,
    }
    print(json.dumps(utkast, ensure_ascii=False, indent=1))
    print(f"\n# {len(utbildningar)} utbildningar lästa ur {args.pdf} ({layout}).",
          file=sys.stderr)


if __name__ == "__main__":
    main()
