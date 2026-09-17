# CLAUDE.md – Kungsbacka i siffror

Fristående, helt statiska sammanställningar av offentliga siffror om Kungsbacka –
från kommunen, SCB, Skolverket, Kolada, Göteborgsregionen och Valmyndigheten – med
alla källor länkade. Sidorna publiceras på GitHub Pages ur `docs/`.

Det här är den stående vägledningen för var och en som arbetar i repot, människa
som AI-agent. Den innehåller bara varaktiga regler: ingenting sessionsspecifikt,
och inga fakta som bor i koden eller i ett annat dokument. När vägledningen och
koden säger emot varandra har koden rätt och vägledningen en bugg – rätta
vägledningen i samma ändring. Tydlighet före fyndighet.

## Var varje sanning bor

| Sanning                                       | Ägare                                     |
| --------------------------------------------- | ----------------------------------------- |
| Vad varje sida visar och var datat kommer från | `README.md`                               |
| Hur en siffra räknats fram                     | byggskriptets modul-docstring i `scripts/` |
| Vad metoden är, för läsaren                    | `docs/metod.html` och sidans "Om den här sidan" |
| Var varje rapport hittades                     | `data/KALLOR.md`                          |
| Programindelning, skolor, betygsskalor         | `scripts/program.py`                      |
| Färger, talformat, delade komponenter          | `docs/gemensam.js`                        |
| Menyn och sidfoten                             | `scripts/bygg_sidmall.py`                 |
| Vad sidorna faktiskt ritar                     | `tests/facit/*.json`                      |

Skriv aldrig om ett annat dokuments fakta – länka till dem. Ett faktum som står
på två ställen är en bugg som väntar på att glida isär.

## Katalogernas roll

```
data/       Källdatat, ett uttag per fil. Ändras bara av hamta_*/extrahera_*.
scripts/    hamta_*.py hämtar, extrahera_*.py läser PDF, build_*.py bygger
            docs/data-*.json. *_webbplats.js granskar de färdiga sidorna.
docs/       Själva hemsidan. En .html + en .js per sida, plus de genererade
            data-*.json. Serveras som den är – inget byggsteg, ingen bundler.
tests/      test_berakningar.py (Python), test_gemensam.js (Node),
            fixtures/ (fruset data) och facit/ (vad sidorna ritar).
```

Datat går åt ett håll: `data/` → `build_*.py` → `docs/data-*.json` → sidan.
**Redigera aldrig `docs/data*.json` för hand** – de är genererade, och
reproducerbarhetstesterna faller om innehållet inte går att räkna fram ur
`data/` igen.

## Regler som inte förhandlas

- **Sidorna drar inga slutsatser.** De visar vad siffrorna är, var de kommer
  ifrån och hur de räknats fram. De väger inte samman till omdömen och säger
  ingenting om framtiden. Två beräkningar är undantag som beskrivs där de
  används: kohortframskrivningen och omräkningen till fasta priser.
- **Varje tal har en källa, och källan länkas på sidan.** Ett tal utan
  härkomst hör inte hemma i repot.
- **Tomt är inte noll.** Ett år utan uppgift blir `null` och ritas som en
  lucka, aldrig som en nolla. Skolverkets prickning (`..` färre än tio
  elever, `.` uppgift saknas) skiljs från "fanns inte".
- **Hellre stanna än spara siffror som inte går ihop.** Hämt- och
  byggskripten kontrollerar kolumnlayout och summor mot källans egna tal och
  avbryter vid avvikelse, i stället för att läsa fel kolumn under tystnad.
- **`docs/*.js` skrivs som ES5** och laddas med `<script>` utan moduler:
  `var`, `function`, inga pilfunktioner, ingen `let`/`const`. Granskas av
  `npx eslint`. `scripts/*.js` och `tests/*.js` är Node och får vara moderna.
- **Inget externt vid körning.** Chart.js ligger vendrad som
  `docs/chart.umd.js`, inga CDN:er, och sidornas Content Security Policy
  släpper bara igenom besöksräknaren. Nya externa resurser tillkommer inte.
- **Färger kommer ur `FARG`/`PALETT` i `docs/gemensam.js`** – inga hexvärden
  i sidskripten. Ingen information får bäras av färgen ensam: serier skiljs
  med färg *och* punktform eller streckning.
- **All text som byggs ihop till markup går genom `esc()`**, och varje adress
  genom `sakerUrl()`.
- **Menyn och sidfoten finns bara i `scripts/bygg_sidmall.py`.** Skriv dem
  aldrig för hand i en enskild sida; `--kontrollera` faller i CI om en sida
  hamnat i otakt.
- **Namn skrivs på svenska**, i kod som i data: `varden`, `argangar`,
  `lasaret`, `platser`. Följ omgivningens ordval.

## Återanvänd – skriv inte av

Delade byggstenar ligger i `docs/gemensam.js` (`diagramStomme`,
`kategoriAxel`, `mattAxel`, `arsOptions`, `linjeSerie`, `kallpost`,
`visaKortSagt`, `visaMeta`, tabellverktygen) och i `scripts/program.py`
(programlistor, skolor, namnbyten, skalor). Behöver en ny sida något som en
annan sida redan gör, lyft det dit i stället för att kopiera – och om två
diagram på samma sida skiljer sig bara i axelrubrik och pekruta, är det en
funktion med parametrar, inte två.

## Klart betyder det här – gå listan varje gång

1. **Förankra det.** Ändras vad en sida *visar* ska sidans egen "Om den här
   sidan"-text och `README.md` uppdateras i samma ändring. Ändras hur ett tal
   räknas fram ska byggskriptets docstring säga varför.
2. **Testa först.** Räknelogik testas i `tests/test_berakningar.py` med små
   påhittade indata där facit går att räkna för hand, och stäms av mot de
   riktiga filerna. Försvaga eller ta aldrig bort ett befintligt test för att
   få grönt – de kodar verkliga buggar.
3. **Bygg om datat** med berört `build_*.py` och checka in resultatet.
   Reproducerbarhetstestet jämför `docs/data-*.json` mot en ombyggnad.
4. **Uppdatera fixturen.** Facit serveras ur `tests/fixtures/data/`, inte ur
   `docs/`. Ändrad datafil som ska synas i facit måste kopieras dit.
5. **Allt grönt före incheckning:**
   `ruff check && python3 -m unittest discover tests && npx eslint &&
   node --test tests/*.js && node scripts/smoke_webbplats.js &&
   node scripts/facit_webbplats.js && node scripts/interaktion_webbplats.js &&
   node scripts/tillganglighet.js && python3 scripts/bygg_sidmall.py --kontrollera`
6. **Att skriva om facit är en avsedd handling, inte en utväg.** Faller
   facit är första frågan om ändringen var menad. Var den det, kör
   `node scripts/facit_webbplats.js --skriv-om` och låt diffen följa med i
   samma ändring. Var den inte det, är det en bugg.
7. **Gren, inte `main`.** Arbeta på en egen gren. Öppna ingen pull request om
   ingen bett om det.

## Konventioner värda att känna till

- **`CHROMIUM_BIN`**: sid-kontrollerna startar Chromium via Playwright och
  tar sökvägen ur den variabeln när den är satt – vägen att köra dem i en
  miljö där webbläsaren redan finns installerad.
- **Fruset data och frusen klocka**: facit serveras ur fixturerna och
  webbläsarens klocka ställs i skriptet, eftersom förtidsröstjobbet skriver
  om riktiga datafiler två gånger om dygnet. Byts fixturerna ut ska
  tidpunkten flyttas med.
- **Året är antagningsåret** på gymnasiesidorna: läsåret 2026/2027 ligger på
  2026, så att platser, meritvärden och elevtal går att lägga bredvid
  varandra år för år.
- **Delbara adresser**: reglagens val speglas i frågesträngen
  (`?year=`, `?program=`, `?matt=`, `?omrade=`, …) via `K.kopplaValjare`, och
  bakåt/framåt i webbläsaren ska fungera.
- **Python klarar sig på standardbiblioteket.** `requirements.txt` behövs
  bara för PDF-extraheringen; hämt- och byggskripten har inga beroenden.
