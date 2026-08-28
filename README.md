# Kungsbacka i siffror

**Hemsidan:** <https://moggleif.github.io/politik/>

Fristående, helt statiska sammanställningar av kommunens egna siffror,
med alla källor länkade.

**Befolkningsprognoser** &ndash; hur träffsäkra kommunens prognoser har varit,
inklusive långtidsprognoserna. Prognossiffrorna kommer ur kommunens egna
prognosrapporter och jämförs med den faktiska folkmängden enligt SCB:s
officiella befolkningsstatistik.

- [Hela befolkningen](https://moggleif.github.io/politik/befolkningsprognos.html)
- [16–19 år, gymnasieåldern](https://moggleif.github.io/politik/gymnasiealdern.html)

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
  i hela kommunen, ur Skolverkets statistik, 2014–2025
- [Från antagning till examen](https://moggleif.github.io/politik/antagning-till-examen.html)
  &ndash; antagningen år X ställd mot avgångseleverna år X&nbsp;+&nbsp;3 för
  samma program: samma kull, in och ut ur systemet. Måtten har olika skalor
  och visas därför i skilda paneler &ndash; aldrig i samma diagram.

**Betygen i grundskolan** &ndash; vad niondeklassarna i Kungsbacka fick,
ämne för ämne. Gymnasiestatistiken redovisar bara ett samlat betygssnitt;
grundskolan redovisas per ämne.

- [Slutbetyg per ämne i årskurs 9](https://moggleif.github.io/politik/amnesbetyg.html)
  &ndash; betygspoäng och andel godkända per ämne, hela kommunen,
  läsåren 2012/13&ndash;2024/25, ur Skolverkets statistik

**Barn och unga** &ndash; hur många 0&ndash;15-åringar kommunen faktiskt har
haft. Till skillnad från prognossidorna innehåller den inga prognoser alls.

- [0–15 år, förskole- och grundskoleåldern](https://moggleif.github.io/politik/barn-och-unga.html)
  &ndash; enbart faktiskt utfall enligt SCB, 2000&ndash;2025

Hur allting hämtas, räknas och kan reproduceras beskrivs på
[metodsidan](https://moggleif.github.io/politik/metod.html).

## Så är repot uppbyggt

```
data/
  rapporter/ …             (arbetsyta för rapportinsamling, se docs/rapporter/)
  prognoser/prognos_<år>.json   Extraherade prognossiffror ur varje rapport,
                                med källänk och sidhänvisning
  antagning/antagning_<år>.json Meritvärden per utbildning ur GR:s rapport
                                efter varje års slutantagning
  slutbetyg/slutbetyg_<år>.json Avgångselevernas slutbetyg per skolenhet och
                                program, ur Skolverkets statistik
  amnesbetyg/amnesbetyg_<år>.json Niondeklassarnas slutbetyg per ämne, hela
                                kommunen, ur Skolverkets statistik
  scb/folkmangd_kungsbacka.json Faktisk folkmängd, hämtad från SCB:s öppna API
  KALLOR.md                     Dokumentation av var varje rapport hittades
scripts/
  fetch_scb.py                  Hämtar faktiskt utfall från SCB (PxWeb-API),
                                både total folkmängd och åldersgrupper
  extrahera_prognos.py          Läser folkmängdstabellen ur en fristående
                                prognosrapport
  extrahera_budget.py           Läser prognostabellen ur en kommunbudget
  extrahera_antagning.py        Läser meritvärdena för Kungsbackas
                                gymnasieskolor ur GR:s antagningsrapport
  hamta_slutbetyg.py            Hämtar avgångselevernas slutbetyg ur
                                Skolverkets exporttjänst, ett läsår per fil
  hamta_amnesbetyg.py           Hämtar niondeklassarnas betyg per ämne ur
                                samma exporttjänst, ett läsår per fil
  build_data.py                 Bygger docs/data.json och docs/data-16-19.json
  build_meritvarden.py          Bygger docs/data-meritvarden.json, med en
                                serie per program i stället för per skola
  build_slutbetyg.py            Bygger docs/data-slutbetyg.json, på samma sätt
  build_kull.py                 Bygger docs/data-kull.json: antagningen år X
                                parad med avgångseleverna år X+3, per program
  build_amnesbetyg.py           Bygger docs/data-amnesbetyg.json, en serie per
                                ämne i årskurs 9
  build_befolkning.py           Bygger docs/data-befolkning.json: folkmängden
                                efter ålder, enbart faktiskt utfall
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
  meritvarden.html              Meritvärden vid antagningen till gymnasiet
  slutbetyg.html                Slutbetyg från gymnasiet, program för program
  antagning-till-examen.html    Antagningen mot examen tre år senare
  metod.html                    Metodsidan: källor, transformationer, viktning
  style.css                     Delas av alla sidor
  gemensam.js                   Delade byggstenar: färger, delbara URL:er
                                (?year=, ?program=, …), sorterbara tabeller
                                med CSV-nedladdning, "Kort sagt"-rutan,
                                metadataraden och tonade linjer vid pekning
  app.js                        Driver de två prognossidorna; varje sida anger
                                datafil och ordval via data-attribut på <body>
  merit.js                      Driver meritvärdessidan
  slutbetyg.js                  Driver slutbetygssidan
  kull.js                       Driver antagning-till-examen-sidan
  amnen.js                      Driver ämnesbetygssidan
  befolkning.js                 Driver sidan om barn och unga 0–15 år
  index.js                      Driver startsidans sammanfattningar
  data.json, data-16-19.json    Data till prognossidorna (genereras)
  data-meritvarden.json         Data till meritvärdessidan (genereras)
  data-slutbetyg.json           Data till slutbetygssidan (genereras)
  data-kull.json                Data till antagning-till-examen (genereras)
  data-amnesbetyg.json          Data till ämnesbetygssidan (genereras)
  data-befolkning.json          Data till sidan om barn och unga (genereras)
  rapporter/*.pdf               Lokala kopior av käll­rapporterna
  rapporter/slutbetyg-*.csv     Skolverkets exportfiler, en per läsår
  chart.umd.js                  Chart.js v4 (vendrad, ingen CDN)
```

## Uppdatera datat

Befolkningsprognoserna:

```bash
python3 scripts/fetch_scb.py    # hämtar senaste utfallet från SCB
python3 scripts/build_data.py   # bygger om docs/data.json
```

Nya prognosrapporter läggs till genom att spara PDF:en i `docs/rapporter/`,
skapa en `data/prognoser/prognos_<år>.json` med siffrorna och källänken, och
köra `build_data.py` igen.

Meritvärdena (kräver `pip install pdfplumber`):

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

Barn och unga 0&ndash;15 år (enbart utfall, inga prognoser):

```bash
python3 scripts/fetch_scb.py          # hämtar 0–15 och 16–19 samtidigt
python3 scripts/build_befolkning.py   # bygger om docs/data-befolkning.json
```

Kullarna (kör efter att meritvärdena och slutbetygen byggts om &ndash;
skriptet läser de färdiga docs-filerna så att namnbyten och skolflyttar
bara hanteras på ett ställe):

```bash
python3 scripts/build_kull.py         # bygger om docs/data-kull.json
python3 -m unittest discover tests    # kontrollräknar beräkningarna
```

Testerna stämmer bland annat av att datafilerna i `docs/` är exakt vad
byggskripten ger av innehållet i `data/` &ndash; inga siffror i utdatan
får vara ändrade för hand.

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
