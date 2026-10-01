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
# `bekraftad` säger om kopplingen är belagd, och `kalla` var. Båda är
# belagda i kommunens pressmeddelanden:
#
#  * Åsa Gårdsskolas högstadium avvecklades och flyttades till Åsaskolan
#    (beslut juni 2021; en flytt av alla samtidigt utreddes nov 2021).
#    Åsa Gårdsskola finns kvar, som F–6, men har inte längre årskurs 9 –
#    serien slutar därför, utan att skolan lagts ned.
#  * När Skårbyskolan (4–9) öppnade hösten 2023 fick Hedeskolan och
#    Älvsåkersskolan, som blev F–6, sitt högstadium där; Björkris skola
#    (F–3) skickar också elever dit men har ingen årskurs 9.
#
# `anm` är en rad om skolan som visas på sidan. Toråsskolan är F–6 sedan
# hösten 2022 och dess elever i årskurs 7–9 går på Varlaskolan; Varlaskolans
# serie är obruten och får ingen streckad koppling, bara en anmärkning.
_MND = "https://www.mynewsdesk.com/se/kungsbacka-kommun/pressreleases/"
KALLA_ASA = _MND + ("vi-undersoeker-moejligheten-att-laata-alla-hoegstadieelever-"
                    "i-aasa-faa-sin-skolgaang-paa-aasaskolan-fraan-"
                    "laesaarsstart-2022-3143012")
KALLA_SKARBY = _MND + ("foerslag-om-ny-organisation-foer-hedeskolan-bjoerkris-"
                       "skola-samt-aelvsaakersskolan-naer-skaarbyskolan-"
                       "oeppnar-hoesten-2023-3154181")
KALLA_TORAS = _MND + "ny-organisering-av-toraasskolan-fraan-hoestterminen-2022-3027521"

GRUNDSKOLOR = [
    {"id": "asa-gard", "namn": "Åsa Gårdsskola", "enheter": ["16824824"],
     "anm": "Högstadiet flyttades till Åsaskolan. Skolan finns kvar som "
            "F–6 men har inte längre årskurs 9."},
    {"id": "asaskolan-fore", "namn": "Åsaskolan (före sammanslagningen)",
     "enheter": ["18035112"]},
    {"id": "asaskolan", "namn": "Åsaskolan",
     "enheter": ["62677187", "56285442"],
     "foregangare": [
         {"id": "asa-gard", "bekraftad": True,
          "anm": "Åsa Gårdsskolas högstadium flyttades till Åsaskolan.",
          "kalla": KALLA_ASA},
         {"id": "asaskolan-fore", "bekraftad": True,
          "anm": "Åsaskolan före sammanslagningen med Åsa Gårdsskolas "
                 "högstadium.",
          "kalla": KALLA_ASA},
     ]},
    {"id": "frillesasskolan", "namn": "Frillesåsskolan",
     "enheter": ["10927868", "67578984"]},
    {"id": "gottskar", "namn": "Gottskär Grundskola",
     "enheter": ["90784555"]},   # hette Onsala Montessoriskola till 2021
    {"id": "halabacksskolan", "namn": "Hålabäcksskolan",
     "enheter": ["99688470", "77323224", "77163912"]},
    {"id": "hedeskolan", "namn": "Hedeskolan",
     "enheter": ["11231816", "26372371", "27712268"],
     "anm": "Blev F–6 när Skårbyskolan öppnade; högstadiet finns där."},
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
         {"id": "hedeskolan", "bekraftad": True,
          "anm": "Hedeskolans högstadieelever fick Skårbyskolan när den "
                 "öppnade hösten 2023.",
          "kalla": KALLA_SKARBY},
         {"id": "alvsakersskolan", "bekraftad": True,
          "anm": "Älvsåkersskolans högstadieelever fick Skårbyskolan när "
                 "den öppnade hösten 2023.",
          "kalla": KALLA_SKARBY},
     ]},
    {"id": "smedingeskolan", "namn": "Smedingeskolan",
     "enheter": ["68861484", "29293076", "33752123", "35822371", "49555095"]},
    {"id": "saro", "namn": "Särö skola", "enheter": ["72090315"]},
    {"id": "torasskolan", "namn": "Toråsskolan", "enheter": ["14101582"],
     "anm": "F–6 sedan hösten 2022; elever i årskurs 7–9 går på "
            "Varlaskolan.", "kalla": KALLA_TORAS},
    {"id": "varlaskolan", "namn": "Varlaskolan",
     "enheter": ["37101902", "70143574", "28729598", "93339853", "84159690"]},
    {"id": "vittra", "namn": "Vittra Forsgläntan", "enheter": ["42568760"]},
    {"id": "alvsakersskolan", "namn": "Älvsåkersskolan",
     "enheter": ["74587667"],
     "anm": "Blev F–6 när Skårbyskolan öppnade; högstadiet finns där."},
]
