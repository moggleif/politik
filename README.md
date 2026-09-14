# Kungsbacka i siffror

**Hemsidan:** <https://moggleif.github.io/politik/>

Fristående, helt statiska sammanställningar av offentliga siffror om
Kungsbacka &ndash; från kommunen, SCB, Skolverket, Kolada och
Göteborgsregionen &ndash; med alla källor länkade.

Sidorna visar vad siffrorna är, var de kommer ifrån och hur de är
framräknade. De drar inga slutsatser, väger inte samman till omdömen och
säger ingenting om framtiden. Två beräkningar kommer inte färdiga ur en
källa: kohortframskrivningen på 16&ndash;19-sidan och omräkningen till
fasta priser på kostnadssidan. Båda är utmärkta som sådana, och båda
beskrivs där de används.

**Befolkningsprognoser** &ndash; hur träffsäkra kommunens prognoser har varit,
inklusive långtidsprognoserna. Prognossiffrorna kommer ur kommunens egna
prognosrapporter och jämförs med den faktiska folkmängden enligt SCB:s
officiella befolkningsstatistik.

- [Hela befolkningen](https://moggleif.github.io/politik/befolkningsprognos.html)
- [16–19 år, gymnasieåldern](https://moggleif.github.io/politik/gymnasiealdern.html)
  &ndash; innehåller också en **kohortframskrivning**: de barn som redan bor i
  kommunen blir ett år äldre varje år, så antalet 16&ndash;19-åringar om
  k år är summan av dagens 16&nbsp;&minus;&nbsp;k … 19&nbsp;&minus;&nbsp;k-åringar.
  Ingen modell och inga födelsetal, men inte antagandefri: att bära varje
  kohort rakt fram förutsätter noll nettoflyttning och ingen dödlighet.
  Just därför fungerar den som jämförelsepunkt mot kommunens prognos
  &ndash; det syns tydligt vad den utelämnar. Den ritas orange, och görs i en
  årgång per årsskifte &ndash; precis som kommunen gör en ny prognos varje
  år &ndash; så att de två modellerna går att ställa mot varandra vid samma
  horisont. Årgångarna har ett eget diagram; att lägga två linjeknippen med
  var sin färgramp i samma bild går inte att läsa.

**Befolkningsprognoser i Varberg** &ndash; exakt samma tre sidor för
grannkommunen Varberg, byggda med samma skript och samma beräkningar:
kommunens prognoser 2017&ndash;2026 mot SCB:s utfall. Två skillnader
följer av Varbergs eget material: gymnasieåldern är **16&ndash;18 år**
(Varbergs prognoser delar in ungdomarna i 16&ndash;18 och 19&ndash;24 år,
så 16&ndash;19 går inte att läsa ut ur dem), och årgångarna
2017&ndash;2021 kommer ur kommunbudgetarnas prognostabeller, som bara
redovisar ett urval år. 2022 års rapport är raderad och finns inte
arkiverad. Vad som finns och vad som saknas står i `data/KALLOR.md`.

- [Hela befolkningen](https://moggleif.github.io/politik/varberg-befolkningsprognos.html)
- [16–18 år, gymnasieåldern](https://moggleif.github.io/politik/varberg-gymnasiealdern.html)
  &ndash; med kohortframskrivningen av 16&ndash;18-åringarna
- [0–15 år, förskole- och grundskoleåldern](https://moggleif.github.io/politik/varberg-barn-och-unga.html)
  &ndash; enbart faktiskt utfall enligt SCB

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
  på Aranäsgymnasiet och Elof Lindälvs gymnasium, ur Skolverkets statistik,
  2014–2025
- [Från antagning till examen](https://moggleif.github.io/politik/antagning-till-examen.html)
  &ndash; antagningen år X ställd mot avgångseleverna år X&nbsp;+&nbsp;3 för
  samma program. Grupperna jämförs som helheter &ndash; inga individer
  följs, och elever kan ha bytt program, gjort uppehåll eller tillkommit
  på vägen. Måtten har olika skalor och visas därför i skilda paneler
  &ndash; aldrig i samma diagram.

**Från nian till gymnasiet** &ndash; samma årtal genom tre mätpunkter:
slutbetyget i årskurs 9 år X, genomströmningen för dem som *började*
gymnasiet hösten samma år, och avgångsbetygen tre år senare. Här räknas
hela kommunen, också de fristående gymnasieskolorna.

- [Från nian till gymnasiet](https://moggleif.github.io/politik/nian-till-gymnasiet.html)
  &ndash; meritvärde och behörighet i nian, examen inom 3/4/5 år,
  avgångsbetyg och pendling mellan hem- och skolkommun,
  läsåren 2008/09&ndash;2025/26

Sidan innehåller också svaret på varför de tre mätpunkterna inte kan
behandlas som samma elever: ungefär tre av tio av kommunens
gymnasieelever läser i en annan kommun, och ungefär var femte elev i
kommunens gymnasieskolor kommer utifrån. I grundskolan är motsvarande
rörlighet drygt en procent.

**Betygen i grundskolan** &ndash; vad niondeklassarna i Kungsbacka fick,
ämne för ämne. Den gymnasiestatistik på skol- och programnivå som används
här redovisar resultaten som samlad betygspoäng; grundskolestatistiken
finns per ämne.

- [Slutbetyg per ämne i årskurs 9](https://moggleif.github.io/politik/amnesbetyg.html)
  &ndash; betygspoäng och andel godkända per ämne, hela kommunen,
  läsåren 2012/13&ndash;2024/25, ur Skolverkets statistik

**Vad grundskolan kostar** &ndash; hur mycket pengar som går åt per elev,
år för år, i pengar som går att jämföra mellan åren. Beloppen räknas om
till senaste årets prisnivå med SCB:s fastställda KPI-årsmedeltal, och
ställs mot riket.

- [Kostnad per elev i grundskolan](https://moggleif.github.io/politik/kostnad-per-elev.html)
  &ndash; Kungsbacka och riket, i löpande och fasta priser, med den
  indexerade utvecklingen från ett gemensamt basår, förändringen år för
  år och uppdelningen på kostnadsslag, ur Kolada (RKA), 1998&ndash;2025

Två mått redovisas, för att de svarar på olika frågor: kostnaden för de
elever som *bor* i kommunen (inklusive ersättningen till fristående
skolor och andra kommuner) och kostnaden för kommunens *egna* skolor.
Kostnadsslagen &ndash; undervisning, lokaler, måltider, lärverktyg,
elevhälsa, övrigt &ndash; hör till det senare och summerar till det.
Kostnadsstatistiken omfattar bara kommunala skolor; de fristående
skolornas kostnader hålls inne med hänvisning till ekonomisk
statistisksekretess. Riket är Koladas publicerade rikstal, inte ett
medelvärde räknat här. Skolverkets egen kostnadsstatistik hämtas som
kontrollkälla, och ett test stämmer av att de två källorna säger samma
sak om Kungsbacka.

**Resurserna till skolan** &ndash; vad kommunen *valde*, till skillnad från
vad skolan kostade. Kostnaden per elev rör sig när elevantalet ändras, när
avtalen höjer lönerna och när priserna stiger, och inget av det är ett
beslut. Här ställs utgifterna i stället mot referenskostnaden &ndash; vad en
kommun med Kungsbackas demografi och struktur förväntas lägga &ndash; och mot
kommunens övriga verksamhet.

- [Resurser jämfört med referenskostnaden](https://moggleif.github.io/politik/resurser-till-skolan.html)
  &ndash; avvikelsen i procent och i kronor, nettokostnad mot
  referenskostnad, grundskolans andel av kommunens driftkostnad, den
  andelen ställd mot skolålderns andel av befolkningen, och grundskolans
  andel av BNP i riket, ur Kolada och SCB, 1998&ndash;2025

**Ingenting på den sidan prisomräknas**, och det är hela poängen: varje mått
är en jämförelse inom samma år, så inflationen finns i båda leden och tar ut
sig själv. Sidan visar också grundskolans andel av BNP i riket, eftersom
referenskostnaden är en *relativ* måttstock &ndash; den räknas fram ur vad
kommunerna faktiskt lägger, så en minskad avvikelse kan betyda antingen att
kommunen höjt sig eller att riket sänkt sig mot kommunen. Bara en nämnare
utanför kommunsektorn skiljer de två åt. Två förbehåll står utskrivna på sidan &ndash; avvikelsen mäter inte
bara politisk vilja (den fångar också effektivitet och redovisningspraxis),
och kostnadsutjämningen byggdes om 2014 och 2020, vilket flyttar avvikelsen
utan att kommunen gjort något. De åren markeras i diagrammen men räknas
aldrig bort.

**Barn och unga** &ndash; hur många 0&ndash;15-åringar kommunen faktiskt har
haft. Till skillnad från prognossidorna innehåller den inga prognoser alls.

- [0–15 år, förskole- och grundskoleåldern](https://moggleif.github.io/politik/barn-och-unga.html)
  &ndash; enbart faktiskt utfall enligt SCB, 2000&ndash;2025

**Valet 2026** &ndash; hur många som förtidsröstat i Kungsbacka, dag för
dag, jämfört med riksdagsvalet 2022 vid samma antal dagar kvar till
valdagen &ndash; och samma sak för varje annan kommun, varje län och
hela riket. Siffrorna kommer från Valmyndighetens öppna data och hämtas
automatiskt två gånger om dagen under förtidsröstningen. Sidan visar hur
många som röstat &ndash; inte vad de röstat på.

- [Förtidsröstningen dag för dag](https://moggleif.github.io/politik/fortidsrostning.html)
  &ndash; ackumulerat och per dag, andel av de röstberättigade, en
  prognos för slutsumman (riket och Kungsbacka) och en topplista över
  röstningslokalerna, 26 augusti&ndash;13 september 2026.
  Välj område i sidans väljare eller i adressen:
  [`?omrade=hallands-lan`](https://moggleif.github.io/politik/fortidsrostning.html?omrade=hallands-lan),
  [`?omrade=hela-riket`](https://moggleif.github.io/politik/fortidsrostning.html?omrade=hela-riket)

**Valresultat per valdistrikt** &ndash; vad väljarna röstade på, till
skillnad från sidan ovan. Kommunfullmäktige, regionfullmäktige och
riksdagen i Kungsbacka i de fem senaste valen, parti för parti och
valdistrikt för valdistrikt, ur Valmyndighetens öppna data.

- [Valresultat per valdistrikt](https://moggleif.github.io/politik/valresultat.html)
  &ndash; valen 2010, 2014, 2018, 2022 och 2026. Välj högst upp vilket av
  de tre valen sidan visar: samma valdistrikt röstar i alla tre samma dag,
  så markeringen står kvar när valet byts och bara rösterna byts ut.
  Kryssa i vilka valdistrikt som helst, fritt kombinerade, och se dem som
  en grupp mot kommunen i övrigt; byt parti, se förändringen mellan två
  val distrikt för distrikt, och ställ alla partier bredvid varandra i
  samma område.
  Längst ned får dessutom vart och ett av de markerade distrikten ett
  eget diagram med hela partifältet, alla med samma y-axel så att
  bilderna går att jämföra med ögat. Fem distrikt fanns inte 2010, och
  för de valen ritas i stället siffrorna för det distrikt marken låg i
  &ndash; streckat och med ihålig punkt, som en indikator för området.
  Vyn följer med i adressen:
  [`?val=riksdag&parti=m&distrikt=innerstaden,hede`](https://moggleif.github.io/politik/valresultat.html?val=riksdag&parti=m&distrikt=innerstaden,hede).

  Hela sidan handlar om Kungsbacka: också riksdagsvalet är de röster som
  lades här, inte rikets.

  Partier redovisas för sig om de någon gång nått **över 3&nbsp;%** av de
  giltiga rösterna i kommunen, räknat för varje val för sig. I kommunvalet
  är det nio &ndash; de åtta riksdagspartierna och Kungsbackaborna &ndash;
  och i region- och riksdagsvalet de åtta riksdagspartierna. Övriga ligger
  samlade under *övriga partier*, samma restpost som Valmyndighetens egna
  filer använder, så att partiernas röster fortfarande summerar till
  antalet giltiga. Deras siffror ligger kvar oavkortat i
  `data/kommunval/`, `data/regionval/` och `data/riksdagsval/`.

  Valdistrikten ritas om mellan valen: Kungsbacka hade 41 distrikt 2010
  och 46 i dag. Det gäller lika i de tre valen, så bedömningen ligger för
  sig i `data/valdistrikt/` &ndash; och att den verkligen säger samma sak
  i alla tre kontrolleras vid hämtningen. Valmyndighetens egen bedömning
  av vilka distrikt som går att jämföra &ndash; inte distriktets namn &ndash; avgör vad sidan
  påstår är jämförbart, och en övergång de underkänner ritas med
  streckad linje i stället för att döljas. Den bedömningen är strängare
  än namnen antyder: elva distrikt underkänns mellan 2018 och 2022, sju
  av dem med oförändrat namn.

  Fem av dagens distrikt fanns inte 2010. Marken gjorde det, och låg då i
  ett annat valdistrikt, så för de valen ritar sidan det distriktets
  siffror som en **indikator** för området &ndash; streckad linje, ihålig
  punkt, och aldrig i tabellen eller i förändringstalen. Ursprunget
  kommer från Valmyndigheten där de anger det; för 2018&ndash;2022 står
  deras ursprungskolumner tomma på just de raderna, och då räknas det ut
  ur deras egna valdistriktskartor (`hamta_harkomst.py`). Ytandel är inte
  väljarandel, vilket gör *andelen* pålitlig &ndash; den ärvs från det
  gamla distriktet &ndash; men *antalet* röster grovt.

Hur allting hämtas, räknas och kan reproduceras beskrivs på
[metodsidan](https://moggleif.github.io/politik/metod.html).

## Så är repot uppbyggt

```
data/
  prognoser/prognos_<år>.json   Extraherade prognossiffror ur varje rapport,
                                med källänk och sidhänvisning
  prognoser/varberg/prognos_<år>.json  Detsamma för Varbergs rapporter
  antagning/antagning_<år>.json Meritvärden per utbildning ur GR:s rapport
                                efter varje års slutantagning
  slutbetyg/slutbetyg_<år>.json Avgångselevernas slutbetyg per skolenhet och
                                program, ur Skolverkets statistik
  amnesbetyg/amnesbetyg_<år>.json Niondeklassarnas slutbetyg per ämne, hela
                                kommunen, ur Skolverkets statistik
  arskurs9/arskurs9_<år>.json   Meritvärde och behörighet i årskurs 9,
                                kommunnivå, ur Skolverkets statistik
  genomstromning/genomstromning_<år>.json  Andel med gymnasieexamen inom
                                3, 4 och 5 år, efter startläsår
  avgangskommun/avgangskommun_<år>.json    Avgångseleverna på kommunnivå,
                                alltså inklusive de fristående skolorna
  pendling/pendling_<år>.json   Pendling mellan hem- och skolkommun,
                                gymnasiet och grundskolan
  kolada/kostnader_grundskola.json  Grundskolans kostnader per elev för
                                Kungsbacka och riket, ur Koladas API
  kolada/resurser_grundskola.json   Avvikelse från referenskostnaden,
                                referenskostnad och budgetandel
  kostnader/kostnader_<år>.json Skolverkets egna kostnadstal för
                                Kungsbacka, kontrollkälla till Kolada
  scb/kpi.json                  Fastställda KPI-årsmedeltal, för
                                omräkningen till fasta priser
  scb/bnp.json                  BNP i löpande priser och rikets folkmängd,
                                nämnare till den nationella nivån
  scb/folkmangd_kungsbacka.json Faktisk folkmängd, hämtad från SCB:s öppna API
  scb/folkmangd_varberg.json    Detsamma för Varberg (gymnasieåldern 16–18 år)
  fortidsroster/mottagna_<år>.csv  Valmyndighetens filer med mottagna
                                förtidsröster per lokal och dag i hela
                                landet, orörda (2010, 2014, 2018, 2022, 2026)
  fortidsroster/hamtad.json     När varje fil senast ändrades
  fortidsroster/rostberattigade.json  Röstberättigade per kommun, län och
                                rike på kvalifikationsdagen, 2026 och 2022
  fortidsroster/angerroster.json  Ångerröster i riket 2018 och 2022, ur
                                Valmyndighetens erfarenhetsrapport
  fortidsroster/prognos.json    Den prognos som ställdes en gång, den 3
                                september 2026 vid tio dagar kvar, för
                                riket och Kungsbacka. Skrivs en gång och
                                ändras inte (se gor_prognos.py)
  kommunval/<år>.json           Kommunvalets resultat per valdistrikt i
  regionval/<år>.json           Kungsbacka, parti för parti (2010, 2014,
  riksdagsval/<år>.json         2018, 2022, 2026) – ett val per mapp. Bara
                                Kungsbackas rader ur Valmyndighetens
                                riksfiler, som tillsammans är över 100 MB
  valdistrikt/jamforbarhet.json Valmyndighetens bedömning av vilka
                                valdistrikt som går att jämföra mellan två
                                val, per övergång, och vilket distrikt
                                varje distrikt kommer ur. Gäller
                                distrikten och därmed alla tre valen
  valdistrikt/harkomst.json     Var 2022 års nya valdistrikt kom ifrån,
                                uträknat ur Valmyndighetens valdistrikts-
                                kartor – för de rader där deras egen
                                mappning är tom (se hamta_harkomst.py)
  KALLOR.md                     Dokumentation av var varje rapport hittades
scripts/
  hamta_scb.py                  Hämtar faktiskt utfall från SCB (PxWeb-API):
                                total folkmängd, åldersgrupper och
                                folkmängden per enskild ålder 0–19 år
                                (--kommun kungsbacka|varberg)
  extrahera_prognos.py          Läser folkmängdstabellen ur en fristående
                                prognosrapport
  extrahera_budget.py           Läser prognostabellen ur en kommunbudget
  extrahera_antagning.py        Läser meritvärdena för Kungsbackas
                                gymnasieskolor ur GR:s antagningsrapport
  hamta_kolada.py               Hämtar grundskolans nyckeltal ur Koladas
                                API, i två delar (--del kostnader|resurser)
  hamta_kostnader.py            Hämtar Skolverkets kostnadsstatistik för
                                Kungsbacka (rapport 32), som kontrollkälla
  hamta_kpi.py                  Hämtar SCB:s fastställda KPI-årsmedeltal
  hamta_bnp.py                  Hämtar BNP och rikets folkmängd från SCB
  hamta_slutbetyg.py            Hämtar avgångselevernas slutbetyg ur
                                Skolverkets exporttjänst, ett läsår per fil
  hamta_amnesbetyg.py           Hämtar niondeklassarnas betyg per ämne ur
                                samma exporttjänst, ett läsår per fil
  hamta_kullkedjan.py           Hämtar de fyra rapporter som sidan om nian
                                och gymnasiet bygger på (109, 91, 89, 61/60)
  hamta_fortidsroster.py        Hämtar Valmyndighetens mottagna förtidsröster
                                för hela landet och sparar filen orörd
  hamta_rostberattigade.py      Hämtar antalet röstberättigade per kommun,
                                län och rike ur Valmyndighetens Excel-filer
  build_data.py                 Bygger docs/data.json och docs/data-16-19.json,
                                inklusive kohortframskrivningen för 16–19 år
                                – och för Varberg docs/data-varberg.json och
                                docs/data-varberg-16-18.json
  build_meritvarden.py          Bygger docs/data-meritvarden.json, med en
                                serie per program i stället för per skola
  build_slutbetyg.py            Bygger docs/data-slutbetyg.json, på samma sätt
  build_kull.py                 Bygger docs/data-kull.json: antagningen år X
                                parad med avgångseleverna år X+3, per program
  build_amnesbetyg.py           Bygger docs/data-amnesbetyg.json, en serie per
                                ämne i årskurs 9
  build_befolkning.py           Bygger docs/data-befolkning.json och
                                docs/data-varberg-befolkning.json: folkmängden
                                efter ålder, enbart faktiskt utfall
  build_kostnader.py            Bygger docs/data-kostnader.json: kostnaden
                                per elev i löpande och fasta priser, med
                                förändringen år för år och mot riket
  build_resurser.py             Bygger docs/data-resurser.json: avvikelsen
                                från referenskostnaden, budgetandelen och
                                skolålderns andel av befolkningen. Gör
                                ingen prisomräkning – varje mått jämför
                                inom samma år
  build_nian_gymnasiet.py       Bygger docs/data-nian-gymnasiet.json: nian
                                år X mot gymnasiet år X…X+3, plus pendlingen
  build_fortidsroster.py        Bygger docs/data-fortidsroster/<kod>.json, en
                                fil per kommun, län och rike: förtidsröstningen
                                på dagar kvar till valdagen, 2026 mot 2022,
                                samt index.json med områdeslistan. Lägger in
                                den ställda prognosen oförändrad hos de två
                                områden den gäller
  hamta_valresultat.py          Hämtar kommun-, region- och riksdagsvalets
                                resultat per valdistrikt i Kungsbacka ur
                                femton filer i fem format (skv, xlsx i två
                                layouter och zippad JSON) till data/
                                kommunval/, regionval/ och riksdagsval/.
                                Kontrollerar varje år mot källans egna
                                summor och avbryter hellre än att spara
                                siffror som inte går ihop
  hamta_harkomst.py             Räknar ut var 2022 års nya valdistrikt kom
                                ifrån, ur Valmyndighetens valdistriktskartor
                                för 2018 och 2022 (båda i SWEREF99 TM): det
                                nya distriktet rastreras i punkter, och
                                andelen punkter är andelen yta. Kontrollerar
                                metoden mot Valmyndighetens egen bedömning –
                                jämförbara distrikt ska hamna på sig själva –
                                och avbryter annars
  build_valresultat.py          Bygger docs/data-kommunval.json och de två
                                andra valens filer: rösterna per distrikt,
                                parti och val, med jämförbarheten mellan
                                valen och en indikator bakåt för de val ett
                                distrikt inte fanns
  val.py                        Gemensamt för de skript som läser
                                Valmyndighetens filer: hämtningen med
                                återförsök, xlsx-läsaren, valdistriktskoden
                                och partinormaliseringen
  bygg_sidmall.py               Skriver in samma meny och samma sidfot på
                                alla sidor i docs/. Menyn finns bara här;
                                --kontrollera faller om någon sida hamnat
                                i otakt (körs i CI)
  gor_prognos.py                Engångsskript: ställde prognosen för valet
                                2026 och frös den till
                                data/fortidsroster/prognos.json. Körs inte
                                av hämtjobbet och vägrar skriva över filen
tests/
  test_berakningar.py           Kontrollräknar beräkningarna och stämmer av
                                att docs/data*.json går att reproducera ur
                                data/ (python3 -m unittest discover tests)
docs/                           Själva hemsidan (serveras av GitHub Pages)
  index.html                    Startsida: en översikt med ett kort per ämne,
                                som fylls med beräknade sammanfattningar av
                                index.js. Navigeringen ligger i sidhuvudet,
                                som på alla andra sidor
  befolkningsprognos.html       Befolkningsprognoser, hela befolkningen
  gymnasiealdern.html           Befolkningsprognoser, åldersgruppen 16–19 år
  barn-och-unga.html            Barn och unga 0–15 år, enbart faktiskt utfall
  varberg-befolkningsprognos.html, varberg-gymnasiealdern.html,
  varberg-barn-och-unga.html    Samma tre sidor för Varberg (16–18 år)
  amnesbetyg.html               Slutbetyg per ämne i årskurs 9
  kostnad-per-elev.html         Kostnaden per elev i grundskolan, fasta priser
  resurser-till-skolan.html     Resurserna mot referenskostnaden
  nian-till-gymnasiet.html      Från nian till gymnasiet, tre mätpunkter
  meritvarden.html              Meritvärden vid antagningen till gymnasiet
  slutbetyg.html                Slutbetyg från gymnasiet, program för program
  antagning-till-examen.html    Antagningen mot examen tre år senare
  fortidsrostning.html          Förtidsröstningen inför valet 2026, mot 2022,
                                för valfri kommun, län eller riket (?omrade=)
  valresultat.html              Kommun-, region- och riksdagsvalets resultat
                                per valdistrikt i Kungsbacka 2010–2026
                                (?val=, ?parti=, ?distrikt=)
  metod.html                    Metodsidan: källor, transformationer, viktning
  style.css                     Delas av alla sidor
  gemensam.js                   Delade byggstenar: färger, delbara URL:er
                                (?year=, ?program=, …), sorterbara tabeller
                                med CSV-nedladdning, "Kort sagt"-rutan,
                                metadataraden och tonade linjer vid pekning
  app.js                        Driver de två prognossidorna; varje sida anger
                                datafil och ordval via data-attribut på <body>
  kohort.js                     Kohortframskrivningens sektioner; läses bara
                                av 16–19-sidan
  merit.js                      Driver meritvärdessidan
  slutbetyg.js                  Driver slutbetygssidan
  kull.js                       Driver antagning-till-examen-sidan
  amnen.js                      Driver ämnesbetygssidan
  kostnader.js                  Driver kostnadssidan; måttet ligger i
                                adressen (?matt=)
  resurser.js                   Driver resurssidan
  nian.js                       Driver sidan om nian och gymnasiet
  befolkning.js                 Driver sidan om barn och unga 0–15 år
  fortidsrostning.js            Driver förtidsröstningssidan; ritar också
                                ut den ställda prognosen, som den läser
                                färdig ur datafilen
  valresultat.js                Driver sidan om valresultat per valdistrikt;
                                vilket av de tre valen som visas ligger i
                                adressen (?val=) och byter datafil utan att
                                sidan laddas om
  index.js                      Driver startsidans sammanfattningar
  data.json, data-16-19.json    Data till prognossidorna (genereras)
  data-meritvarden.json         Data till meritvärdessidan (genereras)
  data-slutbetyg.json           Data till slutbetygssidan (genereras)
  data-kull.json                Data till antagning-till-examen (genereras)
  data-amnesbetyg.json          Data till ämnesbetygssidan (genereras)
  data-nian-gymnasiet.json      Data till sidan om nian och gymnasiet (genereras)
  data-befolkning.json          Data till sidan om barn och unga (genereras)
  data-kostnader.json           Data till kostnadssidan (genereras)
  data-resurser.json            Data till resurssidan (genereras)
  data-fortidsroster/<kod>.json Data till förtidsröstningssidan, en fil per
                                område, plus index.json (genereras, två gånger
                                om dagen under förtidsröstningen)
  data-kommunval.json           Data till sidan om valresultat per
  data-regionval.json           valdistrikt, en fil per val (genereras)
  data-riksdagsval.json
  rapporter/*.pdf               Lokala kopior av käll­rapporterna
  rapporter/slutbetyg-*.csv     Skolverkets exportfiler, en per läsår
  chart.umd.js                  Chart.js v4.5.1 (vendrad UMD-build från
                                npm-paketet chart.js, ingen CDN)
```

## Uppdatera datat

Befolkningsprognoserna:

```bash
python3 scripts/hamta_scb.py    # hämtar senaste utfallet från SCB (Kungsbacka)
python3 scripts/hamta_scb.py --kommun varberg   # detsamma för Varberg
python3 scripts/build_data.py   # bygger om docs/data*.json för båda kommunerna
```

`hamta_scb.py` hämtar också folkmängden per enskild ålder 0&ndash;19 år, som
kohortframskrivningen bygger på, och varnar om de enskilda åldrarna inte
summerar till åldersgrupperna &ndash; då har de två frågorna hämtat olika
saker. `build_data.py` prövar dessutom framskrivningen bakåt mot facit och
ställer den mot kommunens egen modell vid samma horisont, årgång för
årgång.

Nya prognosrapporter läggs till genom att spara PDF:en i `docs/rapporter/`,
skapa en `data/prognoser/prognos_<år>.json` (Varberg:
`data/prognoser/varberg/prognos_<år>.json`) med siffrorna och källänken, och
köra `build_data.py` igen. En rapportfil som bara har vissa år får bara de
åren; sidan ritar den då streckad med en punkt per redovisat år.

Meritvärdena (kräver `pip install -r requirements.txt` &ndash; pdfplumber
för antagnings-PDF:erna; pypdf används av `extrahera_prognos.py` och
`extrahera_budget.py`):

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

Kedjan från nian till gymnasiet:

```bash
python3 scripts/hamta_kullkedjan.py        # alla fyra rapporterna, alla år
python3 scripts/hamta_kullkedjan.py --del arskurs9   # eller en i taget
python3 scripts/build_nian_gymnasiet.py    # bygger om docs/data-nian-gymnasiet.json
```

Samma exporttjänst som slutbetygen, men fyra andra rapporter: 109
(slutbetyg årskurs 9, kommunnivå), 91 (genomströmning inom 3, 4 och 5
år), 89 (avgångselever, kommunnivå) och 60/61 (pendling mellan hem- och
skolkommun). Skriptet stannar av sig själv på ett år som ännu inte
publicerats och avbryter om en rapports kolumner har ändrats. Rapport 109
redovisar flera elevurval bredvid varandra, och vilka har ändrats genom
åren &ndash; kolumnerna letas därför upp via grupprubriken och aldrig via
position.

Barn och unga 0&ndash;15 år (enbart utfall, inga prognoser):

```bash
python3 scripts/hamta_scb.py          # hämtar 0–15 och 16–19 samtidigt
python3 scripts/build_befolkning.py   # bygger om docs/data-befolkning.json
                                      # och docs/data-varberg-befolkning.json
```

Kostnaden per elev i grundskolan:

```bash
python3 scripts/hamta_kolada.py       # båda delarna, Kungsbacka och riket
python3 scripts/hamta_kpi.py          # SCB:s fastställda KPI-årsmedeltal
python3 scripts/hamta_bnp.py          # BNP och rikets folkmängd
python3 scripts/hamta_kostnader.py    # Skolverkets tal, kontrollkälla
python3 scripts/build_kostnader.py    # bygger om docs/data-kostnader.json
python3 scripts/build_resurser.py     # bygger om docs/data-resurser.json
```

Kolada publicerar ett kostnadsår i slutet av augusti året efter, och
Skolverket något senare; båda hämtskripten stannar av sig själva på ett
år som inte finns ännu. KPI-hämtningen behövs bara när ett nytt
årsmedeltal fastställts (mitten av januari) &ndash; utan det får det
senaste kostnadsåret inget fast pris, och prisnivån stannar på året
innan. Att Kolada och Skolverket säger samma sak om Kungsbacka
kontrolleras av testsviten, liksom att kostnadsslagen summerar till
kostnaden per elev.

Förtidsröstningen (inget extra beroende; Excel-filerna läses med
standardbiblioteket):

```bash
python3 scripts/hamta_fortidsroster.py            # 2026, Valmyndighetens fil
python3 scripts/hamta_fortidsroster.py --ar 2022  # de historiska, en gång
python3 scripts/hamta_fortidsroster.py --ar 2018  # (även 2014 och 2010)
python3 scripts/hamta_rostberattigade.py          # röstberättigade, en gång
python3 scripts/build_fortidsroster.py            # bygger om docs/data-fortidsroster/
```

Valresultatet per valdistrikt (inget extra beroende):

```bash
python3 scripts/hamta_valresultat.py                 # alla tre valen, fem år
python3 scripts/hamta_valresultat.py --val riksdag  # bara ett val
python3 scripts/hamta_valresultat.py --ar 2026      # bara ett år
python3 scripts/hamta_harkomst.py                   # var 2022 års nya distrikt kom ifrån
python3 scripts/build_valresultat.py                # bygger om docs/data-*val.json
```

De fyra äldre valen är färdigräknade och ändras inte; de behöver hämtas en
enda gång. **2026 är undantaget.** Just nu ligger Valmyndighetens
preliminära räkning i filen: den innehåller bara rapportpartier, saknar de
små lokala partierna, och de sent inkomna förtidsrösterna och
brevrösterna är inte med. Hämtskriptet läser
`https://resultat.val.se/resultatfiler/val2026/index.md5` och tar den
slutliga räkningen så fort den finns där *och* omfattar Kungsbackas alla
valdistrikt &ndash; riksdagsvalets slutliga fil täcker hela riket och
publiceras så fort det första distriktet i landet är räknat, och en fil
utan Kungsbacka säger mindre än den preliminära. Bytet sker inte av sig
självt &ndash; kör om de två kommandona ovan när räkningen är fastställd.
Sidan skriver ut vilken räkning den visar, så det syns om det inte gjorts.

Prognosen ingår inte i den kedjan. Den ställdes en gång med
`python3 scripts/gor_prognos.py`, och skriptet vägrar sedan skriva över
filen &ndash; det krävs `--skriv-om`, och då är prognosen inte längre
densamma som den som publicerades.

Under förtidsröstningen 2026 gör GitHub Actions det här automatiskt två
gånger om dagen, strax efter att Valmyndigheten uppdaterat sin fil kl. 06
och 14 (`.github/workflows/fortidsroster.yml`, går även att starta för
hand). Hämtskriptet sparar Valmyndighetens fil orörd och skriver bara om den
när innehållet ändrats, så tidsstämpeln i `hamtad.json` anger när datat
senast ändrades och jobbet committar inte tomma uppdateringar. Jobbet
pushar till `main` med secreten `FORTIDSROSTER_TOKEN` (en fine-grained
personlig token från repots ägare, bara detta repo, *Contents: read and
write*), och ägaren står i bypass-listan för regeluppsättningen "Main
rules" &ndash; annars stoppas pushen av kravet på pull request. Utan
secreten hämtar och bygger jobbet ändå, men stannar vid pushen med en
varning. Bygget
ger en fil per kommun, län och rike (312 områden, med en SUMMA-rad för
riket i Valmyndighetens fil bortsorterad); sidan hämtar bara det område
som visas, med Kungsbacka som standard (`data-omrade` på `<body>`) och
`?omrade=<namn>` i adressen för alla andra. De historiska filerna har
andra format än 2026 års (Latin-1; 2022 med enbart vagnretur som
radbrytning och tidsstämplade kolumnrubriker, 2010&ndash;2018 med gemena
rubriker); tolkningen klarar alla och avbryter om kolumnerna ändrats.
2018, 2014 och 2010 ritas bara som tunna linjer i huvudgrafen. Siffrorna över förtidsröster är preliminära och kan
justeras fram till den 16 september 2026. Sidan jämför åren på *dagar
kvar till valdagen*, inte på kalenderdatum, så att samma veckodag hamnar
på samma plats.

Sidan visar också **en prognos** för hur många förtidsröster valet
slutar på, för hela riket och för Kungsbacka. Den ställdes en enda gång,
den 3 september 2026 vid tio dagar kvar, av `scripts/gor_prognos.py`, och
ligger frusen i `data/fortidsroster/prognos.json`. Den räknas aldrig om:
skriptet vägrar skriva över filen, hämtjobbet kör det inte, och sidan
ritar bara ut de tal som står där. Det är avsiktligt &ndash; en prognos som
räknas om vid varje sidvisning följer med datat och kan aldrig ha fel,
medan den här går att jämföra med utfallet. Sidan visar också hur långt
ifrån den ligger.

Modellen: den andel av slutsumman som var inne vid samma antal dagar kvar
i tidigare val, tillämpad på årets tal, med ett omfång mellan två
ytterlägen &ndash; att försprånget mot förra valet bara är tidigareläggning,
och att det håller i sig hela vägen. Modellens fel vid tidigare val är
uträknat för samma område och står i rutan. Prognosen ritas i orange och
prickat, aldrig i sidans blå, som betyder uppmätt. Metoden beskrivs på
[metodsidan](https://moggleif.github.io/politik/metod.html).

Kullarna (kör efter att meritvärdena och slutbetygen byggts om &ndash;
skriptet läser de färdiga docs-filerna så att namnbyten och skolflyttar
bara hanteras på ett ställe):

```bash
python3 scripts/build_kull.py         # bygger om docs/data-kull.json
python3 -m unittest discover tests    # kontrollräknar beräkningarna
```

Alla medelvärden summeras exakt med `math.fsum`, så att bygget ger
samma siffror oavsett Python-version &ndash; vanlig flyttalsaddition
gjorde utdatan versionsberoende på andra decimalen, eftersom Python 3.12
införde kompenserad summering i `sum()`.

Testerna stämmer bland annat av att samtliga datafiler i `docs/` är
exakt vad byggskripten ger av innehållet i `data/` &ndash; inga siffror
i utdatan får vara ändrade för hand &ndash; och vaktar dessutom
presentationen: startsidan får inte visa det horisontblandade
samlingsmåttet som ett generellt prognosfel, och kulljämförelsen får
inte beskrivas som individuppföljning. Vid varje push och pull request
körs testerna i GitHub Actions (`.github/workflows/test.yml`),
tillsammans med fyra kontroller av den färdiga webbplatsen: interna
länkar och lokala källfiler (`scripts/kontrollera_lankar.py`),
HTML-validering (html-validate), ett rök-test som laddar varje sida i
webbläsare och faller på JavaScript-fel, saknade resurser eller sidor
som inte ritar sina diagram (`scripts/smoke_webbplats.js`), och en
tillgänglighetskontroll (`scripts/tillganglighet.js`) som kör axe-core
mot WCAG 2.1 A och AA, tabbar igenom varje sida för att se att alla
kontroller nås och har synlig fokusmarkering, och kontrollerar att
sidan inte rullar i sidled på en 360 pixlar bred skärm.

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
- Varbergs kommuns befolkningsprognoser: Swecos rapporter 2023&ndash;2026
  och prognostabellerna i kommunbudgetarna 2018&ndash;2022 (lokala kopior
  `docs/rapporter/varberg-*.pdf`)
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
- Skolverket, Utbildningsstatistik: *Grundskola &ndash; Slutbetyg årskurs 9*
  (rapport 109), *Gymnasieskola &ndash; Genomströmning inom 3, 4 och 5 år,
  GY11* (91), *Gymnasieskola &ndash; Avgångselever, nationella program*
  på kommunnivå (89) samt *Pendling mellan hem- och skolkommun* för
  gymnasiet (61) och grundskolan (60), ur samma exporttjänst
- Valmyndigheten, *Mottagna förtidsröster* per röstningslokal och dag
  ([rådata val 2026](https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-val-2026),
  [rådata val 2002–2022](https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-fran-val-2002-2022))
  samt *Antal röstberättigade per valdistrikt och valtyp* på
  kvalifikationsdagen

## Gemensamma byggstenar på sidorna

Alla sidor delar samma ram, och analyssidorna dessutom samma
komponenter (docs/gemensam.js):

- **Samma sidhuvud och samma sidfot på varje sida.** Högst upp ligger
  en navigeringsrad med webbplatsens namn och ämnena som utfällbara
  menyer; längst ner en sidfot med länkar till startsidan, metodsidan,
  [källkoden på GitHub](https://github.com/moggleif/politik) och
  felanmälan, sidans egna källor och en rad om att sidorna är
  fristående. Båda byggs av `scripts/bygg_sidmall.py`, som skriver in
  dem i varje docs/*.html &ndash; menyn finns alltså bara på ett ställe,
  och CI faller om en sida hamnat i otakt. Menyerna är `<details>` och
  fungerar utan JavaScript; skriptet lägger bara till att en öppen meny
  stängs av Escape, av ett klick utanför och när en annan öppnas.
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
- **Besöksstatistik**: sidvisningarna räknas med
  [GoatCounter](https://www.goatcounter.com/) &ndash; öppen källkod,
  inga kakor, inga sparade IP-adresser &ndash; via count.js-taggen sist
  på varje sida. Inget visas på sidorna. Sidornas Content Security
  Policy släpper därför igenom `gc.zgo.at` (skriptet) och
  `moderat.goatcounter.com` (räkningen); allt annat externt är
  fortfarande blockerat. Testerna besvarar skriptet lokalt.

## Licens

MIT — se [LICENSE](LICENSE). Diagrammens färgsättning följer en
kontrast- och färgblindhetsvaliderad standardpalett.
