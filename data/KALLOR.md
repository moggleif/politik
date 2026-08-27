# Källor och insamlingsstatus

Den här filen dokumenterar var varje siffra kommer ifrån, vad som är hittat
och vad som återstår.

## Status

| Del | Status |
|---|---|
| Statisk hemsida (`docs/`) | Klar |
| Skript (`scripts/`) | Klara och körda |
| Faktisk folkmängd 2000–2025 (SCB) | Klar |
| Prognosrapporter 2021, 2022, 2024, 2025, 2026 | Klara |
| Prognoser 2015–2020 och 2023 | Saknas i Wayback-arkivet |

Sajten bygger på fem prognosårgångar och ger 12 jämförelsepunkter mot
faktiskt utfall.

## Faktisk folkmängd (SCB)

Hämtas med `python3 scripts/fetch_scb.py` ur två av SCB:s tabeller:

- 2000–2024: `BefolkningNy` via det äldre doris-API:t
- 2025: `TAB5557` via PxWeb API 2.0 (SCB lägger de senaste åren i egna tabeller)

Tabellen i Statistikdatabasen:
<https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__BE__BE0101__BE0101A/BefolkningNy/>

Siffrorna är dubbelkontrollerade mot kommunens egna årsredovisningar, som
anger exakt samma folkmängd (2021: 85 301, 2022: 85 801, 2023: 85 653,
2024: 85 792, 2025: 86 332).

## Prognosrapporterna

Alla fem finns som lokala kopior i `docs/rapporter/` och är inlästa till
`data/prognoser/`. Varje JSON-fil anger originallänk, arkivlänk och
sidhänvisning.

| Prognosår | Rapport | Hittad var |
|---|---|---|
| 2021 | Befolkningsprognos 2021–2050 (Sweco) | Wayback, `globalassets`-sökväg |
| 2022 | Befolkningsprognos 2022–2050 | Wayback |
| 2024 | Befolkningsprognos 2024–2033 | Wayback |
| 2025 | Befolkningsprognos 2025–2034 | Wayback (ögonblicksbild 2026-01-05) |
| 2026 | Befolkningsprognos 2026–2035 | Kommunens webbplats, aktuell fil |

Kommunen återanvänder samma URL-nod och skriver över filen när en ny
årgång publiceras, så äldre versioner finns bara i Wayback. Sökningen som
hittade dem:

```bash
curl -g "https://web.archive.org/cdx/search/cdx?url=kungsbacka.se&matchType=domain\
&fl=timestamp,original&collapse=urlkey&filter=urlkey:.*befolkning.*&limit=1000"
```

Hämta sedan varje träff med `https://web.archive.org/web/<timestamp>id_/<url>`.
Wayback bryter anslutningen ofta – kör med omförsök.

**Kvalitetskontroll:** varje rapport inleder sin tabell med föregående års
*utfall*. De raderna är bortrensade ur prognosserierna, och de kontrolleras
mot SCB vid inläsningen – alla stämde exakt, vilket bekräftar att
extraheringen och gränsdragningen är rätt.

## Åldersgruppen 16–19 år (gymnasieåldern)

Utfallet hämtas från samma SCB-tabell, summerat över ettårsklasserna
16, 17, 18 och 19. Prognossiffrorna kommer ur tabellen "Antal per
åldersgrupp" i varje rapports bilaga – inte ur tabellerna i löptexten,
som i 2026 års rapport ger något andra tal. Bilagetabellen har en egen
årsrubrik och dess kolumner summerar till totalprognosen.

**2021 års rapport ingår inte.** Sweco redovisar där åldersgruppen
16–18 år i stället för 16–19, vilket inte går att jämföra rakt av.

Kontroll mot SCB av rapporternas utfallsrader:

| Rapport | Utfallsår | Rapporten | SCB |
|---|---|---|---|
| 2022 | 2021 | 4 749 | 4 749 |
| 2024 | 2023 | 4 971 | 4 971 |
| 2025 | 2024 | 5 011 | 5 011 |
| 2026 | 2025 | 5 046 | 5 043 |

De tre första stämmer exakt. 2026 års rapport avviker med tre personer,
troligen genom avrundning vid summering av delområden. Sidan använder
genomgående SCB som facit.

## Årgångar som saknas (2015–2020, 2023)

Wayback har inga ögonblicksbilder av dem. Vägar som provats utan resultat:
kommunens sökfunktion (JavaScript-driven), årsredovisningar (innehåller bara
utfall), kommunstyrelsens kallelser och protokoll 2024–2026 (befolknings-
prognosen är inget eget ärende), nämnden för Förskola & Grundskolas
lokalbehov (refererar prognoserna, men siffrorna ligger i bilder), samt
alternativa webbarkiv (archive.ph, timetravel, cachedview – ej nåbara).

Återstående möjlighet: begära rapporterna av kommunen med stöd av
offentlighetsprincipen (info@kungsbacka.se, 0300-83 40 00).

## Lägga in en ny rapport

1. Spara PDF:en i `docs/rapporter/` (måste ligga under `docs/` för att
   GitHub Pages ska kunna servera den).
2. Kör `python3 scripts/extrahera_prognos.py <pdf>` för ett JSON-utkast.
3. Kontrollera siffrorna mot rapporten, fyll i metadatafälten och spara som
   `data/prognoser/prognos_<prognosår>.json`:

```json
{
  "prognosAr": 2015,
  "rapportTitel": "Befolkningsprognos 2015–2024",
  "publicerad": "2015-05",
  "kallaUrl": "https://kungsbacka.se/…/rapport.pdf",
  "arkivUrl": null,
  "lokalPdf": "rapporter/befolkningsprognos-2015.pdf",
  "sidhanvisning": "Tabell 1, sid 7",
  "prognos": { "2015": 79800, "2016": 80600 }
}
```

`prognosAr` är året prognosen gjordes. `lokalPdf` anges relativt `docs/`.
Ta bara med prognosår – rapporterna inleder ofta tabellen med föregående
års **utfall**, som inte hör hemma i prognosserien.

4. Kör `python3 scripts/build_data.py` och kontrollera sidan lokalt:
   `cd docs && python3 -m http.server 8000`
