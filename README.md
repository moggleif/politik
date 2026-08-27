# Prognoskollen Kungsbacka

**Hemsidan:** <https://moggleif.github.io/politik/>

Två vyer med samma metod:

- [Hela befolkningen](https://moggleif.github.io/politik/)
- [16–19 år, gymnasieåldern](https://moggleif.github.io/politik/gymnasiealdern.html)

En fristående, helt statisk hemsida som visar hur träffsäkra Kungsbacka kommuns
befolkningsprognoser har varit genom åren — inklusive långtidsprognoserna.
Prognossiffrorna kommer ur kommunens egna prognosrapporter och jämförs med den
faktiska folkmängden enligt SCB:s officiella befolkningsstatistik. Sidan länkar
till samtliga källrapporter.

## Så är repot uppbyggt

```
data/
  rapporter/ …             (arbetsyta för rapportinsamling, se docs/rapporter/)
  prognoser/prognos_<år>.json   Extraherade prognossiffror ur varje rapport,
                                med källänk och sidhänvisning
  scb/folkmangd_kungsbacka.json Faktisk folkmängd, hämtad från SCB:s öppna API
  KALLOR.md                     Dokumentation av var varje rapport hittades
scripts/
  fetch_scb.py                  Hämtar faktiskt utfall från SCB (PxWeb-API),
                                både total folkmängd och åldersgrupper
  extrahera_prognos.py          Läser folkmängdstabellen ur en fristående
                                prognosrapport
  extrahera_budget.py           Läser prognostabellen ur en kommunbudget
  build_data.py                 Bygger docs/data.json och docs/data-16-19.json
docs/                           Själva hemsidan (serveras av GitHub Pages)
  index.html                    Hela befolkningen
  gymnasiealdern.html           Åldersgruppen 16–19 år
  style.css, app.js             Delas av båda sidorna; varje sida anger
                                datafil och ordval via data-attribut på <body>
  data.json, data-16-19.json    All data sidorna visar (genereras)
  rapporter/*.pdf               Lokala kopior av prognosrapporterna
  chart.umd.js                  Chart.js v4 (vendrad, ingen CDN)
```

## Uppdatera datat

```bash
python3 scripts/fetch_scb.py    # hämtar senaste utfallet från SCB
python3 scripts/build_data.py   # bygger om docs/data.json
```

Nya prognosrapporter läggs till genom att spara PDF:en i `docs/rapporter/`,
skapa en `data/prognoser/prognos_<år>.json` med siffrorna och källänken, och
köra `build_data.py` igen.

## Publicering (GitHub Pages)

Sidan serveras från `docs/`-mappen. Aktivera under
**Settings → Pages → Build and deployment**: *Deploy from a branch*,
branch `main`, mapp `/docs`.

## Källor

- Kungsbacka kommuns befolkningsprognosrapporter (länkade på hemsidan,
  lokala kopior i `docs/rapporter/`)
- SCB, Befolkningsstatistik (BE0101), tabellen *Folkmängden efter region,
  civilstånd, ålder och kön* — hämtas via [SCB:s öppna API](https://www.scb.se/vara-tjanster/oppna-data/api-for-statistikdatabasen/)

## Licens

MIT — se [LICENSE](LICENSE). Diagrammens färgsättning följer en
kontrast- och färgblindhetsvaliderad standardpalett.
