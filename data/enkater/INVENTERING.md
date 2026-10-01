# Inventering: elevenkäter i Kungsbacka (steg 1)

Underlag inför en samlingssida för Skolenkäten (Skolinspektionen) och den
regiongemensamma elevenkäten (GR). Inventeringen gjordes 2026-10-01 genom att
ladda ned och öppna källfilerna, inte bara läsa om dem. Inget av detta är
inbyggt i en sida än.

Filerna i den här katalogen:

- `skolenheter_kungsbacka_skolverket.json` – alla 135 skolenheter i Kungsbacka
  (kommunkod 1384) ur Skolverkets skolenhetsregister, 2026-10-01.
- `skolenkaten_enheter_per_omgang.json` – vilka av dem som har en elevrad i
  vilken Skolenkäts-omgång och årskurs (87 enheter).

## 1. Skolenhetsregistret (nyckeln)

`https://api.skolverket.se/skolenhetsregistret/v2/school-units?municipality_code=1384`
med `Accept: application/json`; detaljer per enhet på `.../school-units/<kod>`.

| Status | Antal | Varav fristående |
|---|---|---|
| AKTIV | 82 | 14 |
| VILANDE | 27 | 0 |
| UPPHORT | 26 | 0 |

Skolformer (en enhet kan ha flera): GR 98, FTH 73, FKLASS 41, GY 20, GRAN 6,
VUX 4, GYAN 3. Registret har startdatum och status men inga fält för
efterträdare, så sammanslagningar och delningar måste kartläggas för hand.

Kodbyten som kräver manuell mappning (exempel ur filerna): Hedeskolan 4-9 →
4-6/7-9, Kullaviksskolan 4-6 + 7-9 → 4-9B, Varlaskolan norra/södra →
Nord/Syd/Sydväst, Smedingeskolan Norr har två koder (29293076 upphörd,
35822371 aktiv), Åsaskolan 4-6/7-9 → 7-9AD/7-9FI. Skolenkäten 2017 har
avkortade namn ("Elof Lindälvs gymn" på fem olika koder).

## 2. Skolenkäten (Skolinspektionen)

Excel per respondentgrupp, en fil per omgång, sidor under
`https://www.skolinspektionen.se/skolenkaten/resultat-fran-skolenkaten/`.
Kungsbacka-sidorna tillgängliga: **HT 2015 till 2026** (2015–2020 har en
sida per termin, 2021– en per år). Före HT 2015 ligger inget på webbplatsen
(sidorna för 2011–2014 ger 404), trots att enkäten startade 2010 enligt
rapporten
[Tio år av elevers röster](https://www.skolinspektionen.se/globalassets/02-beslut-rapporter-stat/statistikrapporter/skolenkaten/skolenkaten-10-ar/skolenkaten_2010-2020.pdf).

Alla 137 xlsx-filer hämtades och skannades efter Kungsbacka. Antal
skolenheter med resultatrad (K = kommunrad finns):

| Omgång | Elever åk 5 | Elever åk 8/9 | Elever gy år 2 | Lärare gr | Lärare gy | Vårdn. gr | Vårdn. fklass | Vårdn. anp. gr |
|---|---|---|---|---|---|---|---|---|
| HT 2015 | 23 K | 18 K | 11 K | 50 K | 12 K | 50 K | 26 K | 3 K |
| VT 2015 | 1 (KMS) | 1 (KMS) | – | 1 | – | 1 | 1 | 1 |
| HT 2016 | – | – | 1 | – | 1 | – | – | – |
| HT 2017 | – | – | 2 | – | 2 | – | – | – |
| VT 2017 | 25 K | 20 K | 12 K | 51 K | 12 K | 51 K | 27 K | 6 K |
| HT 2018 | – | – | 1 | – | 1 | – | – | – |
| HT 2019 | – | – | 2 | – | 2 | – | – | – |
| VT 2019 | 25 K | 21 K | 12 K | 54 K | 12 K | 54 K | 27 K | 23 K |
| 2021 | 26 K | 20 K | 13 K | 56 K | 13 K | 55 K | 27 K | 14 K |
| 2022 | – | – | 2 | – | 2 | – | – | – |
| 2023 | 27 K | 20 K | 17 K | 61 K | 17 K | 61 K | 28 K | 13 K |
| 2024 | – | – | 2 | – | 2 | – | – | – |
| 2025 | 27 K | 20 K | 12 K | 60 K | 13 K | 60 K | 28 K | 12 K |
| 2026 | – | – | 2 | – | 2 | – | – | – |

Streck betyder att ingen enhet i Kungsbacka finns i filen. Det som står i
jämna år är fristående gymnasier (Praktiska, LBS, Sveriges Ridgymnasium,
Drottning Blanka) som har egen cykel; deras enstaka rader har inget
kommunjämförvärde. Kommunen och nästan alla grundskolor deltar HT 2015,
VT 2017, VT 2019, 2021, 2023 och 2025. Det ger sex mätpunkter per skola
(med glapp mellan HT 2015 och VT 2017), inte årliga.

Rapporter per skola som PDF finns också (Skolverkets SIRIS, t.ex.
"Enkätresultat 2025 Åsaskolan 7-9AD"), men Excelfilerna räcker.

### Format- och frågebyten

| Period | Frågeområden (elever åk 5) | Anmärkning |
|---|---|---|
| HT 2015–VT 2017 | 14 st (åk 9: 15) | Svarsalternativ "Stämmer helt och hållet…" i bredd; rubriker i rad 1–3 |
| HT 2018–2021 | 11 st, sammanslagna | "Veta vad som krävs/Tillit", "Argumentation/Delaktighet", "Grundläggande värden/Elevhälsa" – inte delbara i efterhand |
| 2022– | 12 st, helt ny frågeuppsättning | Bl.a. nya "Bemötande – lärare/elever", "Kritiskt tänkande", "Stöd"; **trendbrott** mot 2021 |

Kolumnen för kommun heter "Kommun" till och med 2023 och "Lägeskommun" från
2024; orgnummer och skolenhetskod står på olika kolumnplats i 2015-filerna.
Index är 0–10 i alla omgångar jag öppnat. Tolkningsstödsfliken i filerna
säger att vårdnadshavarsvaren har en inloggning per skolenhet, inte per
person; riksgenomsnittet för svarsfrekvens är 31,5 % (grundskola 2025) och
Åsaskolan 7-9AD hade 14 %. Resultat redovisas inte vid färre än fem svar.

## 3. Regiongemensam elevenkät (GR)

Rapporter som PDF, en per årskurs och år, på
`https://goteborgsregionen.se/kunskapsbank/regiongemensamelevenkat<år>.…`
Åk 2 görs varje år, åk 5, åk 8 och gy år 2 vartannat år (Kungsbacka i de år
Skolinspektionen inte mäter: 2022, 2024, 2026).

**Rapporterna är på regionnivå. Kungsbacka syns som en rad bland GR:s elva
andra kommuner ("Frågeområde per enhet"), aldrig per skola.** Skolrapporter
går till kommunen; Kungsbacka publicerar dem inte utan hänvisar till
`forskola.grundskola@kungsbacka.se`. (Göteborg publicerar sina på
enkater.goteborg.se, vilket Kungsbacka inte gör.)

| År | Åk 2 | Åk 5 | Åk 8 | Gy år 2 | Skala | Nivå för Kungsbacka |
|---|---|---|---|---|---|---|
| 2011–2021 | okänt | okänt | okänt | okänt | okänt | GR:s sidor för äldre år är borttagna (410/404). Kungsbacka-rapporter finns som tredjepartskopior (docplayer, "Skolrapport för Kungsbacka Gy 2", 2021), ej nåbara härifrån |
| 2022 | finns | finns | finns | finns | 0–100 ("Indexvärde") | kommun |
| 2023 | finns | SI-år (ingen Kungsbacka-rad) | SI-år | finns (båda i 2023) | **0–10** | kommun |
| 2024 | finns | finns | finns | finns | **0–100** ("Medelvärde") | kommun |
| 2025 | finns | rad finns men avviker kraftigt (se nedan) | dito | finns | 0–100 | kommun |
| 2026 | finns | finns | finns | finns | 0–100 | kommun |

Alla 20 rapporter 2022–2026 för åk 2, 5, 8 och gy 2 hämtades och lästes;
Kungsbacka-raden finns i "Frågeområde per enhet". Anpassad grund- och
gymnasieskola ingår inte i inventeringen ovan (rapporter finns 2022–2026).
Svar under sju redovisas inte. Svarsfrekvens GR 2024–2026: 68–84 % beroende på årskurs.

### Skalbytet stämmer bara delvis

Uppdraget förutsätter 0–100 före 2023 och 0–10 efter. Rapporterna visar något
annat: **2023 är på 0–10 ("likt i Skolinspektionens enkät"), men 2024–2026 är
tillbaka på 0–100**, och rubriken har ändrats från "Indexvärde" till
"Medelvärde". Alltså två skalbyten, och bara 2023 (en omgång) ligger på
0–10. Åk 2 fick dessutom ny frågeuppsättning 2023, och områdenas uppsättning
skiljer sig mellan 2022, 2023 och 2024–2026 (kolumnerna i "Frågeområde per
enhet" är inte desamma). 2022 → 2023 → 2024 går alltså inte att dra som en
linje.

2025 åk 5 och åk 8: Kungsbacka-raden (t.ex. åk 8 "Studiero" 74 mot GR 56)
avviker så mycket från alla andra år att den troligen bygger på enstaka
enheter som körde GR-enkäten trots Skolinspektionsår. Måste kontrolleras
innan den används.

## 4. Nämndens handlingar

Kungsbackas nämnd för Förskola & Grundskola redovisar elevenkäten på
kommunnivå:

- Protokoll 2025-06-11 §67 (åk 2, GR 2025): text, inga siffror.
- Delårsrapport augusti 2025: "Jag är nöjd med min skola som helhet" – åk 5:
  81, 71, 75, 74, 74 (2021–2025); åk 8: 71, 65, 69,2, 64, 63. Serien blandar
  Skolinspektionen (2021, 2023, 2025) och GR (2022, 2024): exakt den sorts
  brutna serie som sidan inte ska dra en linje över, men användbar som
  kontroll av kommunvärdena.
- Enkätens frågor: `kungsbacka.se` "Områden och frågor i enkät till elever
  årskurs 2, 5 och 8" (samma frågor som GR).

Inte genomsökt: nämndhandlingar före 2025 och gymnasienämnden. Skolnivåsiffror
från GR-enkäten har inte hittats i några handlingar.

## 5. Vad som saknas jämfört med uppdraget

| Önskat | Läge |
|---|---|
| Skolenkäten per skola 2010–2014 | Finns ej publicerat på skolinspektionen.se. Kan begäras som allmän handling från Skolinspektionen |
| GR per skola, något år | Finns hos Kungsbacka kommun men inte publicerat. Kan begäras som allmän handling (forskola.grundskola@kungsbacka.se) |
| GR kommunnivå 2011–2021 | GR:s sidor borttagna; GR kan kontaktas, tredjepartskopior finns |
| Trend från 2010–2012 | Kommunnivå går bara tillbaka till HT 2015 (Skolenkäten) respektive 2022 (GR, säkert) utan nya underlag |
