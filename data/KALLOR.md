# Källor och insamlingsstatus

Den här filen dokumenterar var varje siffra kommer ifrån, vad som är hittat
och vad som återstår.

## Status

| Del | Status |
|---|---|
| Statisk hemsida (`docs/`) | Klar |
| Skript (`scripts/`) | Klara och körda |
| Faktisk folkmängd 2000–2025 (SCB), totalt samt 0–15 och 16–19 år | Klar |
| Prognoser 2015–2026, samtliga tolv årgångar | Klara |
| Meritvärden 2017 och 2019–2026 (GR) | Klara, 2018 saknas |
| Slutbetyg 2014–2025 (Skolverket) | Klara, samtliga läsår |
| Ämnesbetyg åk 9, 2013–2025 (Skolverket) | Klara, samtliga läsår |

Prognosdelen bygger på tolv prognosårgångar (2015–2026) och ger 54
jämförelsepunkter mot faktiskt utfall. Meritvärdesdelen bygger på nio
årgångar av GR:s slutantagning, slutbetygsdelen på tolv läsår ur
Skolverkets statistik.

**Kommunbudgeten är nyckeln till de äldre årgångarna.** Varje års
kommunbudget innehåller ett avsnitt med den årets befolkningsprognos som
åldersfördelad tabell – rubriken är "Befolkningsprognos" i de nyare och
"Befolkningsförändringar" i de äldre. Kommunbudget år N innehåller
prognosen gjord år N−1. Det gör att årgångar vars fristående rapport är
raderad ändå går att återskapa.

## Faktisk folkmängd (SCB)

Hämtas med `python3 scripts/hamta_scb.py` ur två av SCB:s tabeller:

- 2000–2024: `BefolkningNy` via det äldre doris-API:t
- 2025: `TAB5557` via PxWeb API 2.0 (SCB lägger de senaste åren i egna tabeller)

Tabellen i Statistikdatabasen:
<https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__BE__BE0101__BE0101A/BefolkningNy/>

Siffrorna är dubbelkontrollerade mot kommunens egna årsredovisningar, som
anger exakt samma folkmängd (2021: 85 301, 2022: 85 801, 2023: 85 653,
2024: 85 792, 2025: 86 332).

Två åldersgrupper hämtas vid sidan av totalen, båda summerade ur SCB:s
ettårsklasser: **16–19 år** (gymnasieåldern) och **0–15 år** (förskole- och
grundskoleåldern). 0–15 hämtas medvetet som en enda grupp och bryts inte ned
på förskole-, låg-, mellan- och högstadieålder.

Sidan `barn-och-unga.html` bygger enbart på det här utfallet. Den innehåller
inga prognossiffror alls, och ett test i `tests/` stämmer av att ordet
"prognos" inte förekommer någonstans i dess datafil.

## Prognosrapporterna

Alla tolv årgångar finns som lokala kopior i `docs/rapporter/` och är
inlästa till `data/prognoser/`. Varje JSON-fil anger originallänk,
arkivlänk och sidhänvisning. Årgångarna är sorterade efter det år
prognosen gjordes.

| Prognosår | Källa | Hittad var |
|---|---|---|
| 2015 | Kommunbudget 2016 | Wayback |
| 2016 | Kommunbudget 2017–2019 | Wayback |
| 2017 | Kommunbudget 2018 | Wayback |
| 2018 | Kommunbudget 2019 | Wayback |
| 2019 | Kommunbudget 2020 (KS-handling) | Wayback |
| 2020 | Kommunbudget 2021 | Wayback |
| 2021 | Befolkningsprognos 2021–2050 (Sweco) | Wayback |
| 2022 | Befolkningsprognos 2022–2050 | Wayback |
| 2023 | Kommunbudget 2024 | Kommunens webbplats, aktuell fil |
| 2024 | Befolkningsprognos 2024–2033 | Wayback |
| 2025 | Befolkningsprognos 2025–2034 | Wayback (ögonblicksbild 2026-01-05) |
| 2026 | Befolkningsprognos 2026–2035 | Kommunens webbplats, aktuell fil |

Två slags källor används. De fristående prognosrapporterna läses med
`scripts/extrahera_prognos.py`, kommunbudgetarna med
`scripts/extrahera_budget.py`.

### Kvalitetskontroll

Varje källa inleder sin tabell med föregående års **utfall**. De raderna
rensas bort ur prognosserierna, och de kontrolleras mot SCB vid
inläsningen. Samtliga stämde exakt – för både total folkmängd och
åldersgruppen 16–19 – vilket bekräftar att rätt rad lästs av och att
gränsen mellan utfall och prognos dragits rätt.

**Korskontroll budget mot fristående rapport:** Kommunbudget 2025 och den
fristående *Befolkningsprognos 2024–2033* redovisar samma prognos, med som
mest en persons skillnad per år (2033: 94 064 i båda, samma siffra som
underlaget till bostadsförsörjningsplanen anger). De två källtyperna
bekräftar alltså varandra.

### Att tänka på vid hämtning

**Kommunen skriver över filerna.** Samma URL-nod återanvänds när en ny
årgång publiceras, så äldre versioner finns bara i Wayback. Sökningen som
hittade dem:

```bash
curl -g "https://web.archive.org/cdx/search/cdx?url=kungsbacka.se&matchType=domain\
&fl=timestamp,original&collapse=urlkey&filter=urlkey:.*befolkning.*&limit=1000"
```

Hämta sedan varje träff med `https://web.archive.org/web/<timestamp>id_/<url>`.

**Wayback-fällan:** varje dokument har flera arkivkopior, och de kapas
ibland tyst vid 1 MiB. För budgetarna gäller att kopiorna från september
2020 är obrukbara medan de från mars 2022 är kompletta. Kontrollera alltid
att filen slutar med `%%EOF` innan du litar på den – annars får du en halv
tabell utan att märka det. Wayback bryter också anslutningen ofta, så kör
med omförsök.

**Prognoshorisonten växer över tid.** Kommunbudget 2016 redovisar fyra år
framåt, 2018–2019 åtta år, och från 2020 elva–tolv år. De äldsta
årgångarna ger därför färre jämförelsepunkter, och budgettabellerna är ett
tunnare underlag än de fristående rapporterna.

**Producent:** 2015 års prognos är enligt Kommunbudget 2016 framtagen av
kommunstyrelsens förvaltning i februari 2015, och 2016 års av
kommunledningskontoret i april 2016 – alltså internt. Först 2021 anlitades
konsult (Sweco). Det förklarar varför inga fristående rapporter
publicerades före hösten 2020: prognosen var ett internt planeringsunderlag
som redovisades i budgeten.

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

## Meritvärden på gymnasiet (GR:s antagningsstatistik)

Gymnasieantagningen för Kungsbacka sköts av Göteborgsregionen (GR), som
efter varje antagningsomgång publicerar rapporten *Antagningspoäng och
medelvärde*. Sidan använder genomgående **slutantagningen** – omgången i
juni – eftersom siffrorna skiljer sig åt mellan preliminär-, slut- och
reservantagning.

Rapporterna läses med `scripts/extrahera_antagning.py` och sätts ihop till
tidsserier med `scripts/build_meritvarden.py`.

| Antagningsår | Status | Hittad var |
|---|---|---|
| 2017 | Inläst | Wayback (originalet borttaget) |
| 2018 | **Saknas** | Varken original eller arkivkopia hittad |
| 2019 | Inläst | GR:s webbplats, avlistad men kvar |
| 2020 | Inläst | GR:s webbplats, avlistad men kvar |
| 2021 | Inläst | Wayback (originalet borttaget) |
| 2022 | Inläst | GR:s webbplats, aktuell fil |
| 2023 | Inläst | GR:s webbplats, aktuell fil |
| 2024 | Inläst | GR:s webbplats, aktuell fil |
| 2025 | Inläst | GR:s webbplats, aktuell fil |
| 2026 | Inläst | GR:s webbplats, aktuell fil |

GR:s sida med antagningsstatistik listar bara de tre senaste åren, men
avlistade filer ligger kvar på sina adresser. Årgångarna 2019 och 2020
laddades upp på nytt i oktober 2021 (nodid `18.7da94c2d17c11704d8743…`)
och svarar fortfarande, trots att inget längre länkar till dem. Notera att
Internet Archive svarar 404 på just de adresserna – det säger ingenting om
originalet, som svarar 200. Kontrollera alltid källan direkt innan en
årgång skrivs av som förlorad.

Kvar saknas bara 2018. Den filen låg under GR:s förra webbplats
(`18.2e7e10e71643e5052412bc7d`, uppladdad 2018-06-27) och togs bort vid
webbplatsbytet utan att fångas av Internet Archive. Kungsbackas nämnd för
Gymnasium & Arbetsmarknad fick antagningen redovisad för sig den 23 oktober
2018 – ärende 6, "Utfall av antagningen till gymnasieskolan läsåret
2018/2019" – men som muntlig föredragning, så siffrorna finns inte i
handlingarna. Nämndens handlingar för 2019 och 2020 finns inte heller kvar
på webben, varken hos kommunen eller i Internet Archive. Dyker rapporten
upp räcker det att spara PDF:en i `docs/rapporter/`, köra
extraheringsskriptet och bygga om.

**Rapporternas layout har bytt form tre gånger**, vilket skriptet hanterar:

- 2017–2024: en avdelning per kommun, med samma tabell tryckt två gånger
  (sorterad per skola respektive per utbildning). Att den trycks två gånger
  används som kontroll – skriptet läser båda och jämför.
- 2025: en rad per utbildning, med kommun och skola i egna kolumner, och
  bara slutantagningens två tal.
- 2026: som 2025, men med både preliminär- och slutantagning.

**Ett mått bytte form 2025.** Till och med 2024 skrev rapporten fotnoten
"1) Alla behöriga sökande är antagna" i stället för en antagningspoäng. Från
2025 skrivs poängen alltid ut, och de utbildningar som inte hade några
lediga platser kvar markeras i stället med fet stil. Skriptet läser båda
formerna – fetstilen ur teckensnittet – och sidan redovisar öppet att
serien vilar på två olika markörer.

**Skolorna som ingår** är Kungsbackas två kommunala gymnasieskolor,
Aranäsgymnasiet och Elof Lindälvs gymnasium. Rapporterna täcker hela
Göteborgsregionen; urvalet görs i `scripts/extrahera_antagning.py`.

**Ett program som bytt namn förs ihop.** Handels- och
administrationsprogrammet ersattes av Försäljnings- och serviceprogrammet i
2021 års gymnasiereform, och GR:s rapporter använder det nya namnet från och
med antagningen 2022. Serierna förs ihop till en, och vilket namn som gällde
vilket år följer med i utdatan så att sidan kan skriva ut det. Tabellen står
i `PROGRAM_BYTT_NAMN` i `scripts/build_meritvarden.py`.

**Inriktningar som bytt namn förs ihop på samma sätt**, under det namn de
har i dag. Tabellen står i `INRIKTNING_BYTT_NAMN` i
`scripts/build_meritvarden.py` och omfattar reformerna 2021 och 2025:
Karosseri och lackering blev Fordonsskadeteknik och lackering, Plåtslageri
blev Byggnadsplåtslageri, Hästhållning fick lärlingsmarkering, barn- och
fritidsprogrammets Pedagogiskt arbete och Socialt arbete blev en enda
inriktning, och lärlingsspåren på hotell- och turismprogrammet respektive
försäljnings- och serviceprogrammet blev ett spår var.

Till skillnad från programnamnen förs de gamla raderna **inte** ihop i
utbildningslistan. Där står varje rad kvar som rapporten skrev den, med sin
egen antagningspoäng: 2017 gick det att söka till pedagogiskt och till
socialt arbete var för sig, och de hade var sin antagning. Namnet används i
stället när inriktningarna vägs ihop till serier, precis som flera
inriktningar under samma program annars vägs ihop. De år då två inriktningar
som sedan slagits ihop båda hade antagning blir seriens värde ett ovägt
medelvärde av dem, och antalet syns i diagrammets ruta.

**Serien följer programmet, inte skolan.** Kommunen flyttar program mellan
sina två gymnasieskolor, och en serie per skola skulle då brytas av en
organisationsförändring i stället för av att utbildningen ändrats.
`build_meritvarden.py` grupperar därför så här:

- Har ett program legat på flera skolor **utan** att något år finnas på
  båda, förs åren ihop till en normaliserad serie, hemmahörande på den skola
  som har programmet i dag – det gamla datat följer med.
- Fanns programmet på **båda** skolorna samma år är det två utbildningar med
  var sin antagning. Då hålls skolorna isär, en serie var, och skolans namn
  skrivs ut i etiketten.

Den första punkten är en **analyskonvention**, inte ett belägg. Att raderna
aldrig sammanfaller i tid är ett mönster i datat: en utbildning som lagts ned
på den ena skolan och senare startats på den andra ser precis likadan ut som
en som bytt hus, och antagningsstatistiken skiljer inte på fallen.

I dagens data överlappar samtliga program som funnits på båda skolorna
(barn- och fritids-, bygg- och anläggnings-, natur-, teknik- och vård- och
omsorgsprogrammet), så regeln slår inte ihop någonting. Ett test i
`tests/test_berakningar.py` faller den dag den börjar göra det, så att en
sammanslagning inte smyger in osedd.


## Slutbetyg från gymnasiet (Skolverkets utbildningsstatistik)

Skolverket publicerar varje höst hur det gick för dem som gick ut
gymnasiet i juni: *Gymnasieskola – Avgångselever, nationella program*,
per skolenhet och program. Statistiken börjar läsåret 2013/14, när
Gy 2011-reformens första kull gick ut, och finns till och med 2024/25.

Filerna hämtas med `scripts/hamta_slutbetyg.py` och sätts ihop till
tidsserier med `scripts/build_slutbetyg.py`.

### Hämtningen

Uppgifterna ligger inte i Skolverkets PxWeb-databas
(`statistikdatabasen.skolverket.se`) – den redovisar gymnasieskolan bara
på kommunnivå, utan uppdelning per skola och program. Statistiken per
skolenhet finns däremot i exporttjänsten bakom "Sök statistik", som
svarar med CSV utan inloggning eller nyckel:

```
https://siris.skolverket.se/siris/reports/export_api/runexport/
    ?pFormat=csv&pExportID=88&pAr=<år>&pKommun=1384&pFlikar=0
```

`pExportID=88` är rapporten *Avgångselever, nationella program*, `pAr` det
år eleverna gick ut och `pKommun` skolkommunen. Andra rapport-ID:n i samma
tjänst som kan bli aktuella: 58 (antal elever per program), 82
(personalstatistik) och 54 (äldre slutbetyg till och med 2012/13, alltså
programmen före Gy 2011).

Ett år som ännu inte publicerats svarar med en tom tabell i stället för
ett fel – hämtningen stannar då av sig själv. Läsåret publiceras i
november.

**Ett tredje alternativ, som inte används:** Skolverkets
`planned-educations`-API (`api.skolverket.se`) redovisar också betygspoäng
per skolenhet och program, men bara fem år bakåt och med luckor. Det gör
det olämpligt som tidsserie.

### Vad som behövde hanteras i inläsningen

**En serie per utbildning, inte per skola.** Samma regel som på
meritvärdessidan: redovisas ett program på två skolor samma år är det två
utbildningar som får varsin serie med skolan i namnet; redovisas det bara
på en skola i taget blir det en serie som tar de gamla åren med sig.
Vilken skola varje år hör till följer med i utdatan. Med statistiken till
och med 2024/25 blir det 22 serier, varav 8 delade på skola – det är
parallella utbildningar (naturvetenskaps-, teknik-, samhällsvetenskaps-
samt bygg- och anläggningsprogrammen), inte flyttar.
Kommunens omflyttningar från antagningen 2026 syns här först tre år
senare, när den första kullen gått ut.

**Skolenheter, inte skolor.** Skolverket redovisar per skolenhet.
Aranäsgymnasiet har haft sex enheter samtidigt och Elof Lindälv sex, och
ett program kan ligga på två enheter samma år. `build_slutbetyg.py` väger
ihop enheterna till skola med antalet avgångselever som vikt. Att antalet
elever redovisas är en skillnad mot GR:s antagningsrapporter, där
meritvärdessidan måste nöja sig med ett ovägt snitt.

**Skolnamnen skrivs olika mellan åren.** Fyra av de sju gymnasieskolorna
i exporten har bytt namn i statistiken utan att byta skola:

| Skrivs till och med | Skrivs från och med |
|---|---|
| Elof Lindälvs gymn | Elof Lindälvs Gymnasium (2021/22) |
| Praktiska Kungsbacka | Praktiska Gymnasiet Kungsbacka (2018/19) |
| Drottning Blankas Gymn. Kungsbacka | Drottning Blankas Gymnasieskola Kungsbacka (2018/19) |
| LBS Ljud & Bildskolan Kungsbacka | LBS Kreativa Gymnasiet Kungsbacka (2018/19) |

Namnen slås ihop i `SKOLNAMN` i `build_slutbetyg.py`. Listan tar med
också de skolor som sorteras bort, just för att en bortsorterad skola ska
gå att skilja från en okänd: ett skolnamn som inte står där ger en
varning vid bygget – annars skulle skolan tyst bli två linjer i stället
för en.

**Dubbelprickning.** Uppgifter som bygger på färre än tio elever
redovisas inte, utan skrivs `..` (`.` betyder att uppgiften saknas helt).
Små program syns därför bara de år de var tillräckligt stora, och
Kungsbackas IB-elever är så få att programmet aldrig redovisas. Sidan
skriver ut den begränsningen. Rapportens egna summeringar –
"Nationella program", "Yrkesprogram" och "Högskoleförberedande program" –
räknar däremot med de dolda programmen, och används därför till
avsnitten om examensgrad och programgrupper.

**Bara Aranäs och Elof Lindälv.** Skolverkets export gäller skolkommun –
urvalet är skolor som ligger i Kungsbacka, alltså även de fristående och
Beda Hallbergs gymnasium. Sidan visar samma två skolor som
meritvärdessidan, så `build_slutbetyg.py` sorterar bort övriga skolors
rader. Det gäller också rapportens summeringsrader, som hör till sin
skolenhet: annars skulle avsnitten om examensgrad och programgrupper
räkna på fler elever än programmen. Kungsbackaelever som går i skola i en
annan kommun ingår inte i något av fallen.

**Programnamn** hanteras som på meritvärdessidan: Handels- och
administrationsprogrammet ersattes av Försäljnings- och serviceprogrammet
vid gymnasiereformen 2021, och raderna förs ihop till en normaliserad serie
under det nya namnet. Det är en räkneregel som gör serien följbar, inte ett
påstående om att utbildningen är densamma före och efter reformen. I slutbetygen sker bytet 2025 och i
antagningen 2022 – tre års skillnad, eftersom slutbetygen avser den kull
som antogs tre år tidigare.

## Slutbetyg per ämne i årskurs 9 (Skolverkets utbildningsstatistik)

Där gymnasiet bara redovisas med ett samlat betygssnitt redovisas
grundskolan **ämne för ämne**: genomsnittlig betygspoäng (0–20) och
andelen som fick godkänt (A–E), per ämne och läsår. Statistiken börjar
läsåret 2012/13 och finns till och med 2024/25.

Filerna hämtas med `scripts/hamta_amnesbetyg.py` och sätts ihop till
tidsserier med `scripts/build_amnesbetyg.py`.

### Hämtningen

Samma exporttjänst som gymnasiets slutbetyg, men rapport 92:

```
https://siris.skolverket.se/siris/reports/export_api/runexport/
    ?pFormat=csv&pExportID=92&pAr=<år>&pKommun=1384&pFlikar=0
```

`pAr` är det år eleverna gick ut nian. Ett år som ännu inte publicerats
svarar med en tom tabell i stället för ett fel – hämtningen stannar då av
sig själv. Läsåret publiceras i november.

Rapport **93** är samma statistik per skolenhet. Den används medvetet
inte: små skolor och små ämnen skulle till stor del döljas av
sekretessgränsen, och sidan skulle bli mest tomma rutor.

### Vad som behövde hanteras i inläsningen

**Kommunnivå, inte skolenhet.** Urvalet är skolkommun, alltså alla skolor
som ligger i Kungsbacka – även de fristående. Rapporten redovisar tre
huvudmannatyper (Samtliga, Kommunal, Enskild); alla tre sparas i
`data/amnesbetyg/`, men sidan använder **Samtliga**.

**Arton ämnen har hela tidsserien.** Fyra ämnen har det inte:

| Ämne | Läsår med värde |
|---|---|
| Svenska som andraspråk | 11 av 13 |
| Moderna språk, elevens val | 1 av 13 |
| Moderna språk, skolans val | 0 av 13 |
| Teckenspråk | 0 av 13 |

De två sista redovisas aldrig för Kungsbacka – de bygger genomgående på
färre än tio elever. Sidan skriver ut vilka ämnen det gäller i stället
för att tyst utelämna dem.

**Dubbelprickningen flyttade sig 2024/25.** Till och med 2023/24 dolde
Skolverket bara små ämnen. Från läsåret 2024/25 dubbelprickas dessutom
**elevantalet** i engelska, matematik och svenska, medan betygen för samma
ämnen fortfarande redovisas.

Det gör att årssnittet inte kan elevviktas: en viktning skulle tyst
utesluta just de tre ämnena, och matematik är ett av de lägsta – snittet
skulle lyftas av att ett lågt ämne försvann, inte av att betygen
förbättrats. Snittet räknas därför som ett ovägt medelvärde över ett
**fast ämnesurval**: de ämnen som redovisas samtliga läsår. Då beror
förändringen på betygen och inte på vilka ämnen som råkade redovisas ett
visst år. Ämnena läses av samma årskull och är nästan lika stora, så det
ovägda snittet ligger mycket nära ett elevviktat.

**Två mått, två skalor.** Betygspoäng (0–20) och andel med A–E (0–100 %)
visas aldrig i samma diagram.
