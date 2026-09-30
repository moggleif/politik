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
    # Eget nationellt program sedan den 1 juli 2023; dessförinnan en
    # inriktning på hantverksprogrammet. I Kungsbacka finns det bara hos
    # en fristående huvudman, men listan ska vara programmen som finns,
    # inte bara de kommunen själv erbjuder.
    "Frisör- och stylistprogrammet",
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


# ---------------------------------------------------------------------
# Grundskolorna i årskurs 9
#
# Skolverket redovisar årskurs 9 per *skolenhet*, och en skola kan vara
# flera enheter (Varlaskolan Nord/Syd/Sydväst) eller byta enhetskod när
# den byter namn eller årskurser. Här förs enheterna ihop till de skolor
# sidan visar. Mappningen görs för hand ur skolenhetskoderna i
# data/grundskolor/ – koderna är det enda som är stabilt, namnen byts.
#
# En enhet hör till exakt en skola. build_grundskolor.py stannar om en
# enhet i datat saknas här, hellre än att tyst släppa den ur en serie.
#
# Skolor som bara bytt namn, årskurser eller delats i flera enheter är
# *samma* skola och får en obruten serie (enheterna summeras,
# elevviktat). En skola som tas upp i en annan blir en egen, avslutad
# serie med `foregangare` på efterträdaren: sidan ritar då en streckad
# linje från föregångarens sista år till efterträdarens första.
#
# `bekraftad` säger om kopplingen är belagd. Åsa Gårds skola och Åsaskolan
# gick samman 2024 (bekräftad av sidans beställare). Kopplingen till
# Skårbyskolan är däremot en *gissning ur årtalen* – Hedeskolan och
# Älvsåkersskolan upphör 2023 och Skårbyskolan dyker upp 2024 – och ska
# inte läsas som ett beslut förrän den stämts av mot kommunens handlingar.
GRUNDSKOLOR = [
    {"id": "asa-gard", "namn": "Åsa Gårdsskola", "enheter": ["16824824"]},
    {"id": "asaskolan-fore", "namn": "Åsaskolan (före sammanslagningen)",
     "enheter": ["18035112"]},
    {"id": "asaskolan", "namn": "Åsaskolan",
     "enheter": ["62677187", "56285442"],
     "foregangare": [
         {"id": "asa-gard", "bekraftad": True,
          "anm": "Åsa Gårdsskola gick upp i Åsaskolan 2024."},
         {"id": "asaskolan-fore", "bekraftad": True,
          "anm": "Åsaskolan före sammanslagningen med Åsa Gårdsskola."},
     ]},
    {"id": "frillesasskolan", "namn": "Frillesåsskolan",
     "enheter": ["10927868", "67578984"]},
    {"id": "gottskar", "namn": "Gottskär Grundskola",
     "enheter": ["90784555"]},   # hette Onsala Montessoriskola till 2021
    {"id": "halabacksskolan", "namn": "Hålabäcksskolan",
     "enheter": ["99688470", "77323224", "77163912"]},
    {"id": "hedeskolan", "namn": "Hedeskolan",
     "enheter": ["11231816", "26372371", "27712268"]},
    {"id": "ies", "namn": "Internationella Engelska Skolan",
     "enheter": ["25278170"]},
    {"id": "kapareskolan", "namn": "Kapareskolan",
     "enheter": ["28803215", "84111198"]},
    {"id": "kms", "namn": "KMS Kullaviks Montessoriskola",
     "enheter": ["10902849"]},
    {"id": "kollaskolan", "namn": "Kollaskolan", "enheter": ["47579620"]},
    {"id": "kullaviksskolan", "namn": "Kullaviksskolan",
     "enheter": ["75835202", "11782417", "10368319"]},
    {"id": "maleviksskolan", "namn": "Maleviksskolan",   # Fullriggaren Malevik
     "enheter": ["33170625", "39915890"]},
    {"id": "nova", "namn": "Nova Montessoriskola",
     "enheter": ["47832100", "56655808"]},
    {"id": "skarbyskolan", "namn": "Skårbyskolan",
     "enheter": ["39992436", "46721838"],
     "foregangare": [
         {"id": "hedeskolan", "bekraftad": False,
          "anm": "Gissning ur årtalen: Hedeskolan upphör 2023 och "
                 "Skårbyskolan börjar 2024."},
         {"id": "alvsakersskolan", "bekraftad": False,
          "anm": "Gissning ur årtalen: Älvsåkersskolan upphör 2023 och "
                 "Skårbyskolan börjar 2024."},
     ]},
    {"id": "smedingeskolan", "namn": "Smedingeskolan",
     "enheter": ["68861484", "29293076", "33752123", "35822371", "49555095"]},
    {"id": "saro", "namn": "Särö skola", "enheter": ["72090315"]},
    {"id": "torasskolan", "namn": "Toråsskolan", "enheter": ["14101582"]},
    {"id": "varlaskolan", "namn": "Varlaskolan",
     "enheter": ["37101902", "70143574", "28729598", "93339853", "84159690"]},
    {"id": "vittra", "namn": "Vittra Forsgläntan", "enheter": ["42568760"]},
    {"id": "alvsakersskolan", "namn": "Älvsåkersskolan",
     "enheter": ["74587667"]},
]
