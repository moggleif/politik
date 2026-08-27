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
  build_data.py                 Bygger docs/data.json och docs/data-16-19.json
  build_meritvarden.py          Bygger docs/data-meritvarden.json, med en
                                serie per program i stället för per skola
  build_slutbetyg.py            Bygger docs/data-slutbetyg.json, på samma sätt
docs/                           Själva hemsidan (serveras av GitHub Pages)
  index.html                    Huvudmeny
  befolkningsprognos.html       Befolkningsprognoser, hela befolkningen
  gymnasiealdern.html           Befolkningsprognoser, åldersgruppen 16–19 år
  meritvarden.html              Meritvärden vid antagningen till gymnasiet
  slutbetyg.html                Slutbetyg från gymnasiet, program för program
  style.css                     Delas av alla sidor
  app.js                        Driver de två prognossidorna; varje sida anger
                                datafil och ordval via data-attribut på <body>
  merit.js                      Driver meritvärdessidan
  slutbetyg.js                  Driver slutbetygssidan
  data.json, data-16-19.json    Data till prognossidorna (genereras)
  data-meritvarden.json         Data till meritvärdessidan (genereras)
  data-slutbetyg.json           Data till slutbetygssidan (genereras)
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

## Licens

MIT — se [LICENSE](LICENSE). Diagrammens färgsättning följer en
kontrast- och färgblindhetsvaliderad standardpalett.
