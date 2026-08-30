"""Gymnasieprogrammen och kommunens gymnasieskolor, delade mellan skripten.

Meritvärdes-, slutbetygs- och nian-till-gymnasiet-sidorna måste dela in
programmen likadant för att gå att läsa mot varandra, och ett namnbyte
ska bara behöva föras in på ett ställe. Listorna är också en kontroll:
ett program som inte står här är ett tecken på att ett namn lästs fel.

Skripten körs som `python3 scripts/<skript>.py`; Python lägger då
skriptets katalog först på sökvägen, så `import program` räcker.
Testerna lägger själva scripts/ på sökvägen.
"""

# Kungsbackas två kommunala gymnasieskolor, i den ordning de visas.
SKOLOR = [
    {"id": "aranas", "namn": "Aranäsgymnasiet", "kort": "Aranäs"},
    {"id": "elof", "namn": "Elof Lindälvs gymnasium", "kort": "Elof Lindälv"},
]

# Indelningen som styr hur utbildningarna grupperas på sidorna. Namnen är
# de som gäller i dag; gamla namn i PROGRAM_BYTT_NAMN byts ut innan
# listorna används.
#
# OBS: gymnasieskolan har sex nationella högskoleförberedande program.
# International Baccalaureate ligger i samma grupp här därför att den är
# högskoleförberedande i praktisk mening och redovisas tillsammans med
# de övriga i statistiken – men IB är formellt inte ett nationellt
# program och ingår inte i skolformen gymnasieskola. Där gruppen skrivs
# ut för läsaren ska den därför heta "högskoleförberedande program
# (inkl. IB)", inte "nationella högskoleförberedande program".
HOGSKOLEFORBEREDANDE = {
    "Ekonomiprogrammet",
    "Estetiska programmet",
    "Humanistiska programmet",
    "International Baccalaureate",
    "Naturvetenskapsprogrammet",
    "Samhällsvetenskapsprogrammet",
    "Teknikprogrammet",
}
YRKESPROGRAM = {
    "Barn- och fritidsprogrammet",
    "Bygg- och anläggningsprogrammet",
    "El- och energiprogrammet",
    "Fordons- och transportprogrammet",
    "Försäljnings- och serviceprogrammet",
    "Hantverksprogrammet",
    "Hotell- och turismprogrammet",
    "Industritekniska programmet",
    "Naturbruksprogrammet",
    "Restaurang- och livsmedelsprogrammet",
    "VVS- och fastighetsprogrammet",
    "Vård- och omsorgsprogrammet",
}

# Program som normaliseras till samma serie. Handels- och
# administrationsprogrammet ersattes vid gymnasiereformen 2021 av
# Försäljnings- och serviceprogrammet, och reformen gjorde om innehållet.
# Åren läggs i samma serie under dagens namn så att den går att följa över
# tid – en räkneregel för sidorna, inte ett påstående om att utbildningen
# är densamma före och efter. Sidorna markerar reformåret i diagrammen.
PROGRAM_BYTT_NAMN = {
    "Handels- och administrationsprogrammet": "Försäljnings- och serviceprogrammet",
}


# Betygsskalorna och programlängden, delade mellan sidorna: meritvärdet
# i nian är summan av grundskolebetygen (max 340 med 17 ämnen),
# gymnasiets betygspoäng går 0–20, och de nationella programmen är
# treåriga – antagning/nian år X möter examen år X + FORSKJUTNING.
MERIT_MAX = 340
POANG_MAX = 20
FORSKJUTNING = 3


def programnamn(program: str) -> str:
    """Dagens namn för ett program som kan ha bytt namn."""
    program = program.strip()
    return PROGRAM_BYTT_NAMN.get(program, program)


def typ_av(program: str) -> str:
    if program.startswith("Introduktionsprogram"):
        return "introduktion"
    if program in HOGSKOLEFORBEREDANDE:
        return "hogskoleforberedande"
    if program in YRKESPROGRAM:
        return "yrkesprogram"
    return "okant"
