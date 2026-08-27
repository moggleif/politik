# Prognoskollen Kungsbacka

**Hemsidan:** <https://moggleif.github.io/politik/>

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
  fetch_scb.py                  Hämtar faktisk folkmängd från SCB (PxWeb-API)
  build_data.py                 Bygger docs/data.json av innehållet i data/
docs/                           Själva hemsidan (serveras av GitHub Pages)
  index.html, style.css, app.js
  data.json                     All data sidan visar (genereras av build_data.py)
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
