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
| Prognoser 2020 och 2023 | Identifierade, filerna raderade – finns i diariet |
| Prognoser 2015–2019 | Publicerades sannolikt aldrig på webben |

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

## Årgångar som saknas – och varför

Efter en genomsökning av Wayback, kommunens webbplats, nämndhandlingar och
regionala källor är bilden den här:

### 2015–2019: kommunen publicerade sannolikt ingen prognosrapport

Wayback-ögonblicksbilder av befolkningssidan från januari 2015 till augusti
2020 länkar **enbart** faktabladen "Kungsbacka FAKTA / BARN / i siffror"
(2014–2019). Ingen prognosfil förekommer. Den första prognosfilen dyker upp
i oktober 2020. Det handlar alltså inte om att rapporterna tagits bort –
de verkar aldrig ha legat på webben. Eventuella prognossiffror för de åren
finns i så fall i faktabladen eller i budgetunderlag.

### 2020 och 2023: filerna är identifierade men raderade

Båda är utpekade med exakt filnamn i arkiverade versioner av kommunens
sidor, men filerna finns varken kvar live eller i Wayback:

| År | Filnamn | Period | Publicerad |
|---|---|---|---|
| 2020 | `befolkningsprognos-2020-2029.xlsx` | 2020–2029 | hösten 2020 |
| 2023 | `Befolkningsprognos Kungsbacka 2023-2032.pdf` | 2023–2032 | ca 2023-09-22 |

2023 års fil låg på
`https://kungsbacka.se/download/18.605f308f18a930360c4166c8/1695374703094/Befolkningsprognos%20Kungsbacka%202023-2032.pdf`
(ger 404 i dag). Belägg för att den funnits: Wayback-kopior av
befolkningsstatistiksidan från 2023-12-09 och 2024-06-12 länkar den, medan
kopian från 2023-06-09 fortfarande länkar 2022 års rapport.

### Så kan de hämtas

Kommunen har ett **öppet webbdiarium**, `ciceronsok.kungsbacka.se`
(ärenden från och med 2019-11-27), med anslagstavla och e-arkiv på
`ciceronanslagstavla.kungsbacka.se` respektive `arkiv.kungsbacka.se`.
Befolkningsprognosen ingår som bilaga till ärendet "Underlag till
kommunbudget". Relevanta diarienummer:

- **KS 2022-00723** – underlag kommunbudget 2024, bör innehålla 2023 års prognos
- **KS 2023-00686** – underlag kommunbudget 2025
- **KS 2025-00785** – underlag kommunbudget 2027

Diarietjänsterna nås inte från den här utvecklingsmiljön, men fungerar i en
vanlig webbläsare. Alternativt går filerna att begära ut som allmän handling
(`kommunarkivet@kungsbacka.se`) – ange de exakta filnamnen ovan.

Nämndsidorna listar bara omkring två år bakåt, och 2023 års kallelser och
handlingar ger 404 live. Deras URL:er går dock att återvinna ur
Wayback-kopior av nämndsidorna (t.ex. 2023-12-02 för kommunstyrelsen).

### Övriga källor som undersökts utan resultat

| Källa | Utfall |
|---|---|
| Göteborgsregionen (GR) | Publicerar bara utfall, inga kommunvisa prognoser |
| Region Halland | Statistik via Shiny-app och Power BI, inga årgångsvisa PDF:er; politikerportalens träffar rör inte Kungsbacka |
| Sweco / Statisticon | Inga ytterligare årgångar publicerade |
| Kommunens sökfunktion | Serverrenderad på `/om-webbplatsen/sok?query=…&startAtHit=…`; 28 träffar på "befolkningsprognos", men bara den senaste rapporten finns kvar |
| Wayback, dokumentmappar | 56 filer under `fakta-om-kommunen`, 78 under `for-fortroendevalda`, 1 886 under `moten-handlingar-och-protokoll` – inga fler prognoser |
| Kommunbudgetunderlag | Bara mappen för budget 2023 är arkiverad; från budget 2024 flyttades underlagen till diariet |
| Mynewsdesk | Pressmeddelandena länkar till sidan, inte till PDF:erna |

### En mellanversion värd att känna till

`2.-uppdaterad-befolkningsprognos-2021-2030-.pdf` (bilaga till
kommunbudgetunderlag 2023, arkiverad 2022-03-19) är en presentation där
2021 års prognos reviderats under våren 2022. Den redovisar folkmängd
**96 897 år 2030**, mot 98 017 i 2021 års rapport och 95 497 i 2022 års.
Siffrorna finns bara som bilder, och eftersom den ligger mellan två
årgångar vi redan har är den inte inlagd som en egen prognosserie.

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
