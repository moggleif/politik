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

# Gymnasieskolans nationella program, med den indelning som styr hur
# utbildningarna grupperas på sidorna. Namnen är de som gäller i dag;
# gamla namn i PROGRAM_BYTT_NAMN byts ut innan listorna används.
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

# Program som bytt namn men är samma utbildning. Handels- och
# administrationsprogrammet ersattes vid gymnasiereformen 2021 av
# Försäljnings- och serviceprogrammet; innehållet gjordes om, men det är
# samma utbildning som förts vidare, så åren läggs i samma serie.
PROGRAM_BYTT_NAMN = {
    "Handels- och administrationsprogrammet": "Försäljnings- och serviceprogrammet",
}


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
