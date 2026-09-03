# Kungsbacka i siffror

**Hemsidan:** <https://moggleif.github.io/politik/>

Fristående, helt statiska sammanställningar av offentliga siffror om
Kungsbacka &ndash; från kommunen, SCB, Skolverket och Göteborgsregionen
&ndash; med alla källor länkade.

Sidorna visar vad siffrorna är, var de kommer ifrån och hur de är
framräknade. De drar inga slutsatser, väger inte samman till omdömen och
säger ingenting om framtiden. Den enda beräkning som inte kommer ur en
källa är kohortframskrivningen på 16&ndash;19-sidan, och den är utmärkt
som sådan.

**Befolkningsprognoser** &ndash; hur träffsäkra kommunens prognoser har varit,
inklusive långtidsprognoserna. Prognossiffrorna kommer ur kommunens egna
prognosrapporter och jämförs med den faktiska folkmängden enligt SCB:s
officiella befolkningsstatistik.

- [Hela befolkningen](https://moggleif.github.io/politik/befolkningsprognos.html)
- [16–19 år, gymnasieåldern](https://moggleif.github.io/politik/gymnasiealdern.html)
  &ndash; innehåller också en **kohortframskrivning**: de barn som redan bor i
  kommunen blir ett år äldre varje år, så antalet 16&ndash;19-åringar om
  k år är summan av dagens 16&nbsp;&minus;&nbsp;k … 19&nbsp;&minus;&nbsp;k-åringar.
  Ingen modell och inga födelsetal, men inte antagandefri: att bära varje
  kohort rakt fram förutsätter noll nettoflyttning och ingen dödlighet.
  Just därför fungerar den som jämförelsepunkt mot kommunens prognos
  &ndash; det syns tydligt vad den utelämnar. Den ritas orange, och görs i en
  årgång per årsskifte &ndash; precis som kommunen gör en ny prognos varje
  år &ndash; så att de två modellerna går att ställa mot varandra vid samma
  horisont. Årgångarna har ett eget diagram; att lägga två linjeknippen med
  var sin färgramp i samma bild går inte att läsa.

**Betygen på gymnasiet** &ndash; vad eleverna hade med sig in, och vad de gick
ut med, program för program. Enheten är programmet och inte skolan på båda
sidorna: kommunen flyttar program mellan Aranäsgymnasiet och Elof Lindälvs
gymnasium, och en serie per skola skulle brytas av en organisationsförändring
i stället för av att utbildningen ändrats.

- [Meritvärden vid antagningen](https://moggleif.github.io/politik/meritvarden.html)
  &ndash; meritvärdena hos dem som antogs, ur Göteborgsregionens (GR)
  statistik över slutantagningen, 2017–2026
- [Slutbetyg från gymnasiet](https://moggleif.github.io/politik/slutbetyg.html)
  &ndash; betygspoäng, examensgrad och högskolebehörighet hos avgångseleverna
  på Aranäsgymnasiet och Elof Lindälvs gymnasium, ur Skolverkets statistik,
  2014–2025
- [Från antagning till examen](https://moggleif.github.io/politik/antagning-till-examen.html)
  &ndash; antagningen år X ställd mot avgångseleverna år X&nbsp;+&nbsp;3 för
  samma program. Grupperna jämförs som helheter &ndash; inga individer
  följs, och elever kan ha bytt program, gjort uppehåll eller tillkommit
  på vägen. Måtten har olika skalor och visas därför i skilda paneler
  &ndash; aldrig i samma diagram.

**Från nian till gymnasiet** &ndash; samma årtal genom tre mätpunkter:
slutbetyget i årskurs 9 år X, genomströmningen för dem som *började*
gymnasiet hösten samma år, och avgångsbetygen tre år senare. Här räknas
hela kommunen, också de fristående gymnasieskolorna.

- [Från nian till gymnasiet](https://moggleif.github.io/politik/nian-till-gymnasiet.html)
  &ndash; meritvärde och behörighet i nian, examen inom 3/4/5 år,
  avgångsbetyg och pendling mellan hem- och skolkommun,
  läsåren 2008/09&ndash;2025/26

Sidan innehåller också svaret på varför de tre mätpunkterna inte kan
behandlas som samma elever: ungefär tre av tio av kommunens
gymnasieelever läser i en annan kommun, och ungefär var femte elev i
kommunens gymnasieskolor kommer utifrån. I grundskolan är motsvarande
rörlighet drygt en procent.

**Betygen i grundskolan** &ndash; vad niondeklassarna i Kungsbacka fick,
ämne för ämne. Den gymnasiestatistik på skol- och programnivå som används
här redovisar resultaten som samlad betygspoäng; grundskolestatistiken
finns per ämne.

- [Slutbetyg per ämne i årskurs 9](https://moggleif.github.io/politik/amnesbetyg.html)
  &ndash; betygspoäng och andel godkända per ämne, hela kommunen,
  läsåren 2012/13&ndash;2024/25, ur Skolverkets statistik

**Barn och unga** &ndash; hur många 0&ndash;15-åringar kommunen faktiskt har
haft. Till skillnad från prognossidorna innehåller den inga prognoser alls.

- [0–15 år, förskole- och grundskoleåldern](https://moggleif.github.io/politik/barn-och-unga.html)
  &ndash; enbart faktiskt utfall enligt SCB, 2000&ndash;2025

**Valet 2026** &ndash; hur många som förtidsröstat i Kungsbacka, dag för
dag, jämfört med riksdagsvalet 2022 vid samma antal dagar kvar till
valdagen &ndash; och samma sak för varje annan kommun, varje län och
hela riket. Siffrorna kommer från Valmyndighetens öppna data och hämtas
automatiskt två gånger om dagen under förtidsröstningen. Sidan visar hur
många som röstat &ndash; inte vad de röstat på.

- [Förtidsröstningen dag för dag](https://moggleif.github.io/politik/fortidsrostning.html)
  &ndash; ackumulerat och per dag, andel av de röstberättigade, och en
  topplista över röstningslokalerna, 26 augusti&ndash;13 september 2026.
  Välj område i sidans väljare eller i adressen:
  [`?omrade=hallands-lan`](https://moggleif.github.io/politik/fortidsrostning.html?omrade=hallands-lan),
  [`?omrade=hela-riket`](https://moggleif.github.io/politik/fortidsrostning.html?omrade=hela-riket)

Hur allting hämtas, räknas och kan reproduceras beskrivs på
[metodsidan](https://moggleif.github.io/politik/metod.html).

## Så är repot uppbyggt

```
data/
  prognoser/prognos_<år>.json   Extraherade prognossiffror ur varje rapport,
                                med källänk och sidhänvisning
  antagning/antagning_<år>.json Meritvärden per utbildning ur GR:s rapport
                                efter varje års slutantagning
  slutbetyg/slutbetyg_<år>.json Avgångselevernas slutbetyg per skolenhet och
                                program, ur Skolverkets statistik
  amnesbetyg/amnesbetyg_<år>.json Niondeklassarnas slutbetyg per ämne, hela
                                kommunen, ur Skolverkets statistik
  arskurs9/arskurs9_<år>.json   Meritvärde och behörighet i årskurs 9,
                                kommunnivå, ur Skolverkets statistik
  genomstromning/genomstromning_<år>.json  Andel med gymnasieexamen inom
                                3, 4 och 5 år, efter startläsår
  avgangskommun/avgangskommun_<år>.json    Avgångseleverna på kommunnivå,
                                alltså inklusive de fristående skolorna
  pendling/pendling_<år>.json   Pendling mellan hem- och skolkommun,
                                gymnasiet och grundskolan
  scb/folkmangd_kungsbacka.json Faktisk folkmängd, hämtad från SCB:s öppna API
  fortidsroster/mottagna_<år>.csv  Valmyndighetens filer med mottagna
                                förtidsröster per lokal och dag i hela
                                landet, orörda (2010, 2014, 2018, 2022, 2026)
  fortidsroster/hamtad.json     När varje fil senast ändrades
  fortidsroster/rostberattigade.json  Röstberättigade per kommun, län och
                                rike på kvalifikationsdagen, 2026 och 2022
  fortidsroster/angerroster.json  Ångerröster i riket 2018 och 2022, ur
                                Valmyndighetens erfarenhetsrapport
  KALLOR.md                     Dokumentation av var varje rapport hittades
scripts/
  hamta_scb.py                  Hämtar faktiskt utfall från SCB (PxWeb-API):
                                total folkmängd, åldersgrupper och
                                folkmängden per enskild ålder 0–19 år
  extrahera_prognos.py          Läser folkmängdstabellen ur en fristående
                                prognosrapport
  extrahera_budget.py           Läser prognostabellen ur en kommunbudget
  extrahera_antagning.py        Läser meritvärdena för Kungsbackas
                                gymnasieskolor ur GR:s antagningsrapport
  hamta_slutbetyg.py            Hämtar avgångselevernas slutbetyg ur
                                Skolverkets exporttjänst, ett läsår per fil
  hamta_amnesbetyg.py           Hämtar niondeklassarnas betyg per ämne ur
                                samma exporttjänst, ett läsår per fil
  hamta_kullkedjan.py           Hämtar de fyra rapporter som sidan om nian
                                och gymnasiet bygger på (109, 91, 89, 61/60)
  hamta_fortidsroster.py        Hämtar Valmyndighetens mottagna förtidsröster
                                för hela landet och sparar filen orörd
  hamta_rostberattigade.py      Hämtar antalet röstberättigade per kommun,
                                län och rike ur Valmyndighetens Excel-filer
  build_data.py                 Bygger docs/data.json och docs/data-16-19.json,
                                inklusive kohortframskrivningen för 16–19 år
  build_meritvarden.py          Bygger docs/data-meritvarden.json, med en
                                serie per program i stället för per skola
  build_slutbetyg.py            Bygger docs/data-slutbetyg.json, på samma sätt
  build_kull.py                 Bygger docs/data-kull.json: antagningen år X
                                parad med avgångseleverna år X+3, per program
  build_amnesbetyg.py           Bygger docs/data-amnesbetyg.json, en serie per
                                ämne i årskurs 9
  build_befolkning.py           Bygger docs/data-befolkning.json: folkmängden
                                efter ålder, enbart faktiskt utfall
  build_nian_gymnasiet.py       Bygger docs/data-nian-gymnasiet.json: nian
                                år X mot gymnasiet år X…X+3, plus pendlingen
  build_fortidsroster.py        Bygger docs/data-fortidsroster/<kod>.json, en
                                fil per kommun, län och rike: förtidsröstningen
                                på dagar kvar till valdagen, 2026 mot 2022,
                                samt index.json med områdeslistan
tests/
  test_berakningar.py           Kontrollräknar beräkningarna och stämmer av
                                att docs/data*.json går att reproducera ur
                                data/ (python3 -m unittest discover tests)
docs/                           Själva hemsidan (serveras av GitHub Pages)
  index.html                    Startsida; ämneskorten fylls med beräknade
                                sammanfattningar av index.js
  befolkningsprognos.html       Befolkningsprognoser, hela befolkningen
  gymnasiealdern.html           Befolkningsprognoser, åldersgruppen 16–19 år
  barn-och-unga.html            Barn och unga 0–15 år, enbart faktiskt utfall
  amnesbetyg.html               Slutbetyg per ämne i årskurs 9
  nian-till-gymnasiet.html      Från nian till gymnasiet, tre mätpunkter
  meritvarden.html              Meritvärden vid antagningen till gymnasiet
  slutbetyg.html                Slutbetyg från gymnasiet, program för program
  antagning-till-examen.html    Antagningen mot examen tre år senare
  fortidsrostning.html          Förtidsröstningen inför valet 2026, mot 2022,
                                för valfri kommun, län eller riket (?omrade=)
  metod.html                    Metodsidan: källor, transformationer, viktning
  style.css                     Delas av alla sidor
  gemensam.js                   Delade byggstenar: färger, delbara URL:er
                                (?year=, ?program=, …), sorterbara tabeller
                                med CSV-nedladdning, "Kort sagt"-rutan,
                                metadataraden och tonade linjer vid pekning
  app.js                        Driver de två prognossidorna; varje sida anger
                                datafil och ordval via data-attribut på <body>
  kohort.js                     Kohortframskrivningens sektioner; läses bara
                                av 16–19-sidan
  merit.js                      Driver meritvärdessidan
  slutbetyg.js                  Driver slutbetygssidan
  kull.js                       Driver antagning-till-examen-sidan
  amnen.js                      Driver ämnesbetygssidan
  nian.js                       Driver sidan om nian och gymnasiet
  befolkning.js                 Driver sidan om barn och unga 0–15 år
  fortidsrostning.js            Driver förtidsröstningssidan
  index.js                      Driver startsidans sammanfattningar
  data.json, data-16-19.json    Data till prognossidorna (genereras)
  data-meritvarden.json         Data till meritvärdessidan (genereras)
  data-slutbetyg.json           Data till slutbetygssidan (genereras)
  data-kull.json                Data till antagning-till-examen (genereras)
  data-amnesbetyg.json          Data till ämnesbetygssidan (genereras)
  data-nian-gymnasiet.json      Data till sidan om nian och gymnasiet (genereras)
  data-befolkning.json          Data till sidan om barn och unga (genereras)
  data-fortidsroster/<kod>.json Data till förtidsröstningssidan, en fil per
                                område, plus index.json (genereras, två gånger
                                om dagen under förtidsröstningen)
  rapporter/*.pdf               Lokala kopior av käll­rapporterna
  rapporter/slutbetyg-*.csv     Skolverkets exportfiler, en per läsår
  chart.umd.js                  Chart.js v4.5.1 (vendrad UMD-build från
                                npm-paketet chart.js, ingen CDN)
```

## Uppdatera datat

Befolkningsprognoserna:

```bash
python3 scripts/hamta_scb.py    # hämtar senaste utfallet från SCB
python3 scripts/build_data.py   # bygger om docs/data.json
```

`hamta_scb.py` hämtar också folkmängden per enskild ålder 0&ndash;19 år, som
kohortframskrivningen bygger på, och varnar om de enskilda åldrarna inte
summerar till åldersgrupperna &ndash; då har de två frågorna hämtat olika
saker. `build_data.py` prövar dessutom framskrivningen bakåt mot facit och
ställer den mot kommunens egen modell vid samma horisont, årgång för
årgång.

Nya prognosrapporter läggs till genom att spara PDF:en i `docs/rapporter/`,
skapa en `data/prognoser/prognos_<år>.json` med siffrorna och källänken, och
köra `build_data.py` igen.

Meritvärdena (kräver `pip install -r requirements.txt` &ndash; pdfplumber
för antagnings-PDF:erna; pypdf används av `extrahera_prognos.py` och
`extrahera_budget.py`):

```bash
# spara årets rapport som docs/rapporter/antagning-slutantagning-<år>.pdf
python3 scripts/extrahera_antagning.py docs/rapporter/antagning-slutantagning-2026.pdf \
  > data/antagning/antagning_2026.json     # fyll i kallaUrl och arkivUrl för hand
python3 scripts/build_meritvarden.py       # bygger om docs/data-meritvarden.json
```

GR publicerar en ny rapport efter varje slutantagning i juni. Skriptet varnar
om samma utbildning läses olika i rapportens två sorteringar, och
`build_meritvarden.py` varnar om ett programnamn inte känns igen &ndash; båda
är tecken på att layouten ändrats och att inläsningen behöver ses över.

Slutbetygen:

```bash
python3 scripts/hamta_slutbetyg.py    # hämtar alla läsår från Skolverket
python3 scripts/build_slutbetyg.py    # bygger om docs/data-slutbetyg.json
```

Betygen per ämne i årskurs 9:

```bash
python3 scripts/hamta_amnesbetyg.py   # hämtar alla läsår från Skolverket
python3 scripts/build_amnesbetyg.py   # bygger om docs/data-amnesbetyg.json
```

Samma exporttjänst som slutbetygen, men rapport 92 i stället för 88, och på
kommunnivå i stället för per skolenhet. Skriptet stannar av sig själv på ett
läsår som ännu inte publicerats.

Kedjan från nian till gymnasiet:

```bash
python3 scripts/hamta_kullkedjan.py        # alla fyra rapporterna, alla år
python3 scripts/hamta_kullkedjan.py --del arskurs9   # eller en i taget
python3 scripts/build_nian_gymnasiet.py    # bygger om docs/data-nian-gymnasiet.json
```

Samma exporttjänst som slutbetygen, men fyra andra rapporter: 109
(slutbetyg årskurs 9, kommunnivå), 91 (genomströmning inom 3, 4 och 5
år), 89 (avgångselever, kommunnivå) och 60/61 (pendling mellan hem- och
skolkommun). Skriptet stannar av sig själv på ett år som ännu inte
publicerats och avbryter om en rapports kolumner har ändrats. Rapport 109
redovisar flera elevurval bredvid varandra, och vilka har ändrats genom
åren &ndash; kolumnerna letas därför upp via grupprubriken och aldrig via
position.

Barn och unga 0&ndash;15 år (enbart utfall, inga prognoser):

```bash
python3 scripts/hamta_scb.py          # hämtar 0–15 och 16–19 samtidigt
python3 scripts/build_befolkning.py   # bygger om docs/data-befolkning.json
```

Förtidsröstningen (inget extra beroende; Excel-filerna läses med
standardbiblioteket):

```bash
python3 scripts/hamta_fortidsroster.py            # 2026, Valmyndighetens fil
python3 scripts/hamta_fortidsroster.py --ar 2022  # de historiska, en gång
python3 scripts/hamta_fortidsroster.py --ar 2018  # (även 2014 och 2010)
python3 scripts/hamta_rostberattigade.py          # röstberättigade, en gång
python3 scripts/build_fortidsroster.py            # bygger om docs/data-fortidsroster/
```

Under förtidsröstningen 2026 gör GitHub Actions det här automatiskt två
gånger om dagen, strax efter att Valmyndigheten uppdaterat sin fil kl. 06
och 14 (`.github/workflows/fortidsroster.yml`, går även att starta för
hand). Hämtskriptet sparar Valmyndighetens fil orörd och skriver bara om den
när innehållet ändrats, så tidsstämpeln i `hamtad.json` anger när datat
senast ändrades och jobbet committar inte tomma uppdateringar. Jobbet
pushar till `main` med secreten `FORTIDSROSTER_TOKEN` (en fine-grained
personlig token från repots ägare, bara detta repo, *Contents: read and
write*), och ägaren står i bypass-listan för regeluppsättningen "Main
rules" &ndash; annars stoppas pushen av kravet på pull request. Utan
secreten hämtar och bygger jobbet ändå, men stannar vid pushen med en
varning. Bygget
ger en fil per kommun, län och rike (312 områden, med en SUMMA-rad för
riket i Valmyndighetens fil bortsorterad); sidan hämtar bara det område
som visas, med Kungsbacka som standard (`data-omrade` på `<body>`) och
`?omrade=<namn>` i adressen för alla andra. De historiska filerna har
andra format än 2026 års (Latin-1; 2022 med enbart vagnretur som
radbrytning och tidsstämplade kolumnrubriker, 2010&ndash;2018 med gemena
rubriker); tolkningen klarar alla och avbryter om kolumnerna ändrats.
2018, 2014 och 2010 ritas bara som tunna linjer i huvudgrafen. Siffrorna över förtidsröster är preliminära och kan
justeras fram till den 16 september 2026. Sidan jämför åren på *dagar
kvar till valdagen*, inte på kalenderdatum, så att samma veckodag hamnar
på samma plats.

Kullarna (kör efter att meritvärdena och slutbetygen byggts om &ndash;
skriptet läser de färdiga docs-filerna så att namnbyten och skolflyttar
bara hanteras på ett ställe):

```bash
python3 scripts/build_kull.py         # bygger om docs/data-kull.json
python3 -m unittest discover tests    # kontrollräknar beräkningarna
```

Alla medelvärden summeras exakt med `math.fsum`, så att bygget ger
samma siffror oavsett Python-version &ndash; vanlig flyttalsaddition
gjorde utdatan versionsberoende på andra decimalen, eftersom Python 3.12
införde kompenserad summering i `sum()`.

Testerna stämmer bland annat av att samtliga datafiler i `docs/` är
exakt vad byggskripten ger av innehållet i `data/` &ndash; inga siffror
i utdatan får vara ändrade för hand &ndash; och vaktar dessutom
presentationen: startsidan får inte visa det horisontblandade
samlingsmåttet som ett generellt prognosfel, och kulljämförelsen får
inte beskrivas som individuppföljning. Vid varje push och pull request
körs testerna i GitHub Actions (`.github/workflows/test.yml`),
tillsammans med fyra kontroller av den färdiga webbplatsen: interna
länkar och lokala källfiler (`scripts/kontrollera_lankar.py`),
HTML-validering (html-validate), ett rök-test som laddar varje sida i
webbläsare och faller på JavaScript-fel, saknade resurser eller sidor
som inte ritar sina diagram (`scripts/smoke_webbplats.js`), och en
tillgänglighetskontroll (`scripts/tillganglighet.js`) som kör axe-core
mot WCAG 2.1 A och AA, tabbar igenom varje sida för att se att alla
kontroller nås och har synlig fokusmarkering, och kontrollerar att
sidan inte rullar i sidled på en 360 pixlar bred skärm.

Hämtningen är helt automatisk &ndash; både CSV-filerna i `docs/rapporter/`
och JSON-filerna i `data/slutbetyg/` skrivs om. Skolverket publicerar det
gångna läsåret i november; dessförinnan svarar exporttjänsten med en tom
tabell och hämtningen stannar där. `hamta_slutbetyg.py` avbryter om
kolumnerna i exportfilen har ändrats, och `build_slutbetyg.py` varnar om ett
skol- eller programnamn inte känns igen &ndash; ett namnbyte som inte fångas
upp blir annars två serier i stället för en.

## Publicering (GitHub Pages)

Sidan serveras från `docs/`-mappen. Aktivera under
**Settings → Pages → Build and deployment**: *Deploy from a branch*,
branch `main`, mapp `/docs`.

## Källor

- Kungsbacka kommuns befolkningsprognosrapporter (länkade på hemsidan,
  lokala kopior i `docs/rapporter/`)
- SCB, Befolkningsstatistik (BE0101), tabellen *Folkmängden efter region,
  civilstånd, ålder och kön* — hämtas via [SCB:s öppna API](https://www.scb.se/vara-tjanster/oppna-data/api-for-statistikdatabasen/)
- Göteborgsregionen (GR), Gymnasieantagningen: *Antagningspoäng och
  medelvärde* efter varje års slutantagning
  ([antagningsstatistiken](https://goteborgsregionen.se/kunskapsbank/antagningsstatistikgymnasieantagning.5.51f49f9317c1158e1c21ba83.html))
- Skolverket, Utbildningsstatistik: *Gymnasieskola &ndash; Avgångselever,
  nationella program*, hämtad ur Skolverkets exporttjänst
  ([statistiken](https://www.skolverket.se/skolutveckling/statistik/sok-statistik-om-forskola-skola-och-vuxenutbildning))
- Skolverket, Utbildningsstatistik: *Grundskola &ndash; Slutbetyg per ämne
  årskurs 9*, ur samma exporttjänst (rapport 92, kommunnivå)
- Skolverket, Utbildningsstatistik: *Grundskola &ndash; Slutbetyg årskurs 9*
  (rapport 109), *Gymnasieskola &ndash; Genomströmning inom 3, 4 och 5 år,
  GY11* (91), *Gymnasieskola &ndash; Avgångselever, nationella program*
  på kommunnivå (89) samt *Pendling mellan hem- och skolkommun* för
  gymnasiet (61) och grundskolan (60), ur samma exporttjänst
- Valmyndigheten, *Mottagna förtidsröster* per röstningslokal och dag
  ([rådata val 2026](https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-val-2026),
  [rådata val 2002–2022](https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-fran-val-2002-2022))
  samt *Antal röstberättigade per valdistrikt och valtyp* på
  kvalifikationsdagen

## Gemensamma byggstenar på sidorna

Alla analyssidor delar samma komponenter (docs/gemensam.js):

- **"Kort sagt"** överst: de viktigaste observationerna, beräknade ur
  sidans datafil vid varje sidvisning &ndash; ingenting är hårdkodat.
- **Delbara URL:er**: valen i reglagen speglas i adressraden
  (t.ex. `slutbetyg.html?grupp=yrkesprogram&matt=andelexamen&year=2024`),
  så att en länk ger samma vy; bakåt/framåt i webbläsaren fungerar.
- **Tabeller**: sorterbara på kolumn, nedladdningsbara som CSV och
  kopierbara. Saknade värden skiljer på sekretess (&rdquo;..&rdquo;,
  färre än tio elever) och &rdquo;fanns inte&rdquo; (&ndash;).
- **Databegränsningar** visas i en liten ruta intill det diagram där
  begränsningen märks (2018 års saknade antagningsrapport, Skolverkets
  dubbelprickning, prognosrapporten 2021 med annan åldersindelning).
- **Metadataraden** under ingressen: källa, period, senaste data och
  när datat hämtades.
- I diagram med många linjer tonas övriga linjer ned när användaren
  pekar på en linje eller på ett namn i teckenförklaringen. Serierna
  skiljs åt med färg *och* punktform/streckning, så att ingen
  information bärs av färgen ensam.

## Licens

MIT — se [LICENSE](LICENSE). Diagrammens färgsättning följer en
kontrast- och färgblindhetsvaliderad standardpalett.
