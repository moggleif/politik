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


# ---------------------------------------------------------------------
# Skolorna i elevenkäterna
#
# Elevenkäterna redovisas per skolenhet, och enhetskoderna byts när en
# skola byter namn, delas eller slås ihop (se GRUNDSKOLOR ovan). För
# enkätsidan förs enheterna ihop till skolor efter namn och historik i
# Skolverkets register (data/enkater/skolenheter_kungsbacka_skolverket.json):
# en skola är en rad här, och har den flera enheter ett år blir dess värde
# ett medelvärde av enheternas, vägt med antal svar (build_enkater.py).
#
# Det här är en förenkling med ett pris: Åsaskolan 7–9 fick Åsa
# Gårdsskolas högstadieelever 2022 och räknas ändå som samma skola, och
# Aranäsgymnasiets sju "enheter" är inriktningar, inte skolor. Frågesatsen
# (se extrahera_enkater.py) och årskursen bryter trendlinjerna där
# enkäten själv byter; skolornas egna sammanslagningar gör det inte.
#
# LBS Kreativa Gymnasiet och Praktiska Gymnasiet Kungsbacka heter i
# registret i dag "Drottning Blankas Gymnasieskola Kungsbacka 2" och "3".
# Namnet i varje enkätomgång är det som stod i filen
# (skolnamn_vid_tillfället), och huvudmännen skiljer sig åt, så de är
# egna skolor här.
#
# En enhet som saknas i tabellen stoppar bygget (skola_av_enhet): hellre
# det än att en skola tyst släpps ur en serie.
KOMMUN_ORGNR = "2120001256"

ENKATSKOLOR = [
    ('aranasgymnasiet', 'Aranäsgymnasiet',
     ['15567070', '41358402', '56021320', '58191646', '68640992', '69859216', '76860623', '80405898']),
    ('aranas-sar', 'Aranäsgymnasiet gymnasiesärskola',
     ['46056119']),
    ('beda-hallberg', 'Beda Hallbergs gymnasium',
     ['63179610']),
    ('bjorkris', 'Björkris skola',
     ['51445699', '65390344']),
    ('drottning-blanka', 'Drottning Blankas Gymnasieskola Kungsbacka',
     ['64569393']),
    ('lbs', 'LBS Kreativa Gymnasiet Kungsbacka',
     ['86888278']),
    ('praktiska', 'Praktiska Gymnasiet Kungsbacka',
     ['23457902']),
    ('elof-lindalv', 'Elof Lindälvs Gymnasium',
     ['41844601', '48217580', '50228904', '51620045', '61252599', '64160122', '87262566']),
    ('fjordskolan', 'Fjordskolan',
     ['36470223', '44247625', '48791537', '79252996']),
    ('fjaras-bracka', 'Fjärås Bräckaskolan',
     ['19922386', '22251626', '22938661', '93665842']),
    ('frillesasskolan', 'Frillesåsskolan',
     ['10927868', '67578984', '67682956', '99043601']),
    ('maleviksskolan', 'Maleviksskolan',
     ['33170625', '39915890', '96836168']),
    ('furulidsskolan', 'Furulidsskolan',
     ['59624096']),
    ('gottskar', 'Gottskär Grundskola',
     ['90784555']),
    ('gullregnsskolan', 'Gullregnsskolan',
     ['13789284', '24479132', '70505032']),
    ('gallingeskolan', 'Gällingeskolan',
     ['15914381', '15968044', '16454364', '44593023', '94552753']),
    ('hedeskolan', 'Hedeskolan',
     ['11231816', '26372371', '27712268', '29443968']),
    ('halabacksskolan', 'Hålabäcksskolan',
     ['77163912', '77323224', '99688470']),
    ('ies', 'Internationella Engelska Skolan Kungsbacka',
     ['25278170']),
    ('iseraasskolan', 'Iseråsskolan',
     ['53535119', '54466386', '55913658', '62941799', '65922396']),
    ('kms', 'KMS Kullaviks Montessoriskola',
     ['10902849']),
    ('kapareskolan', 'Kapareskolan',
     ['28803215', '84111198']),
    ('kollaskolan-agr', 'Kollaskolan, anpassad grundskola',
     ['30143047', '51563299', '69389523', '78189734']),
    ('kollaskolan', 'Kollaskolan',
     ['10220991', '21047778', '47579620', '55017747', '68864563', '98037942']),
    ('kullaviksskolan', 'Kullaviksskolan',
     ['10368319', '11782417', '16481707', '40745095', '75835202']),
    ('nova', 'Nova Montessoriskola',
     ['47832100', '56655808']),
    ('pontos', 'Pontos Grundskola',
     ['70319074']),
    ('presseskolan', 'Presseskolan',
     ['27211026', '67641022']),
    ('skarbyskolan', 'Skårbyskolan',
     ['39992436', '46721838', '77647085']),
    ('smedingeskolan', 'Smedingeskolan',
     ['29293076', '33752123', '35822371', '49555095', '68861484']),
    ('ridgymnasiet', 'Sveriges Ridgymnasium Kungsbacka',
     ['27597104']),
    ('saro-montessori', 'Särö Montessoriskola Daggdroppen',
     ['57869288']),
    ('saro-skola', 'Särö skola',
     ['32837182', '72090315']),
    ('tingbergsskolan', 'Tingbergsskolan',
     ['50013979', '69028103']),
    ('torasskolan', 'Toråsskolan',
     ['14101582', '17237309', '27963955', '67978353']),
    ('varlaskolan-sar', 'Varlaskolan, grundsärskola',
     ['24375194']),
    ('varlaskolan', 'Varlaskolan',
     ['28729598', '37101902', '70143574', '84159690', '93339853']),
    ('vittra', 'Vittra Forsgläntan',
     ['42568760']),
    ('alvsakersskolan', 'Älvsåkersskolan',
     ['16772632', '38174928', '53651817', '55524589', '74587667', '84583942']),
    ('asa-gard', 'Åsa Gårdsskola',
     ['16824824', '38085441', '41877112']),
    ('asaskolan', 'Åsaskolan',
     ['18035112', '24981372', '44974182', '56285442', '62677187']),
    ('resursskolan-angen', 'Resursskolan Ängen', ['10234292']),
    ('sprakintroduktion', 'Språkintroduktion Kungsbacka', ['30375335']),
    ('kullenskolan', 'Kullenskolan', ['77574230']),
]

_ENKAT_ENHET = {kod: (id_, namn)
                for id_, namn, koder in ENKATSKOLOR for kod in koder}


def skola_av_enhet(kod: str) -> str:
    """Skolans id för en enhetskod, eller KeyError om koden saknas."""
    try:
        return _ENKAT_ENHET[kod][0]
    except KeyError:
        raise KeyError(f"enhetskod {kod} saknas i program.ENKATSKOLOR") from None


def enkatskolor():
    """{id: namn} över skolorna i elevenkäterna."""
    return {id_: namn for id_, namn, _ in ENKATSKOLOR}
