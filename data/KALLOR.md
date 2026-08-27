# Källor och insamlingsstatus

Den här filen dokumenterar var varje siffra kommer ifrån, och vad som återstår
att samla in.

## Status

| Del | Status |
|---|---|
| Statisk hemsida (`docs/`) | Klar |
| Skript för SCB-hämtning och databygge (`scripts/`) | Klara, ej körda skarpt |
| Faktisk folkmängd från SCB | **Saknas** |
| Kungsbackas prognosrapporter 2015–2025 | **Saknas** |

`docs/data.json` innehåller i dag en tom platshållare. Hemsidan visar då ett
vänligt meddelande om att datat inte är på plats ännu.

## Vad som återstår

### 1. Faktisk folkmängd (SCB)

```bash
python3 scripts/fetch_scb.py
```

Hämtar Kungsbacka (regionkod 1384) ur SCB:s tabell *Folkmängden efter region,
civilstånd, ålder och kön* (BE0101, `BefolkningNy`) via PxWeb-API:t och skriver
`data/scb/folkmangd_kungsbacka.json`.

Tabellen i Statistikdatabasen:
<https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__BE__BE0101__BE0101A/BefolkningNy/>

### 2. Kungsbackas prognosrapporter

Leta upp befolkningsprognosrapporterna för ca 2015–2025, spara PDF:erna i
`docs/rapporter/` (måste ligga under `docs/` för att GitHub Pages ska kunna
servera dem) och notera nedan var varje rapport hittades.

**Uppslag att börja från** (funna via webbsökning, ej verifierade — kommunens
webbplats var inte åtkomlig när repot skapades):

- Kommunens sida för befolkningsstatistik:
  <https://kungsbacka.se/kommun-och-politik/kommunfakta/befolkningsstatistik>
- *Befolkningsprognos 2025–2050, total- och delområdesprognos* (PDF):
  <https://kungsbacka.se/download/18.3ae5986a198e623c951df996/1756727320521/Befolkningsprognos%202025-2050%20total-%20och%20delomr%C3%A5desprognos.pdf>
- *Underlag till bostadsförsörjningsplan för Kungsbacka kommun* (PDF, innehåller
  prognossiffror):
  <https://kungsbacka.se/download/18.348b667a196c7f4d0a31989c/1747230128135/Underlag%20till%20bostadsf%C3%B6rs%C3%B6rjningsplan%20f%C3%B6r%20Kungsbacka%20kommun.pdf>
- Äldre rapporter som tagits bort från kommunens webbplats: sök i Wayback
  Machine (<https://web.archive.org/>) på `kungsbacka.se` + befolkningsprognos.
- Kommunens pressmeddelanden om nya prognoser:
  <https://www.mynewsdesk.com/se/kungsbacka-kommun>

Luckor är helt OK — hemsidan och beräkningarna hanterar att vissa år saknas.
Notera i så fall här vilka år som saknas och varför.

### 3. Extrahera siffrorna

Skapa en fil per rapport, `data/prognoser/prognos_<prognosår>.json`:

```json
{
  "prognosAr": 2015,
  "rapportTitel": "Befolkningsprognos 2015–2024",
  "publicerad": "2015-05",
  "kallaUrl": "https://kungsbacka.se/…/rapport.pdf",
  "arkivUrl": null,
  "lokalPdf": "rapporter/befolkningsprognos-2015.pdf",
  "sidhanvisning": "Tabell 1, sid 7",
  "prognos": {
    "2015": 79800,
    "2016": 80600
  }
}
```

- `prognosAr` — året prognosen gjordes/publicerades.
- `prognos` — total folkmängd per målår, precis som rapporten anger den.
- `lokalPdf` — sökväg **relativt `docs/`**, eftersom hemsidan länkar dit.
- `arkivUrl` — sätt till Wayback-länken om originalet försvunnit, annars `null`.

Verifiera alltid siffrorna mot PDF:en; det är det felkänsligaste steget.

### 4. Bygg om och kontrollera

```bash
python3 scripts/build_data.py          # skriver docs/data.json
cd docs && python3 -m http.server 8000 # öppna http://localhost:8000
```

## Rapportförteckning

Fyll i allteftersom rapporterna hittas.

| Prognosår | Rapport | Hittad var | Lokal kopia |
|---|---|---|---|
| – | – | – | – |
