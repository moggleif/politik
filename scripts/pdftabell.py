"""Läser tabeller ur PDF:er genom ordens koordinater.

Talen i kommunens och Göteborgsregionens rapporter sitter i kolumner utan
att raderna har någon avgränsare i texten. Att läsa sidan som text ger
därför "Barn- och fritidsprogrammet 26 3" utan att säga vilken kolumn 3
hör till. Tabellerna är däremot ritade med linjer, och de linjerna
avgränsar cellerna exakt: de vågräta ger raderna, de lodräta kolumnerna.

Rutinerna är delade mellan extraheringsskripten. De vet ingenting om vad
som står i tabellen – tolkningen hör hemma i det skript som anropar dem.
"""

# Markör för fetstil, som bärs med genom cellinläsningen och plockas bort
# när cellen tolkas. Ett tecken som inte kan förekomma i rapporterna.
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


def kolumnlinjer(sida, tol=3):
    """Kolumngränserna ur de lodräta linjerna."""
    return slaihop([e["x0"] for e in sida.edges if e["orientation"] == "v"], tol=tol)


def celler(sida, xgranser, ygranser):
    """Delar in sidans ord i ett rutnät efter kolumn- och radgränserna.

    Fetstil bärs med: GR:s antagningsrapporter markerar från 2025 med fet
    stil de utbildningar som inte hade några lediga platser kvar.
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


def fet(text):
    """Sant om cellen står i fet stil."""
    return FET in text


def ren(text):
    """Cellens text utan fetstilsmarkörer."""
    return text.replace(FET, "")
