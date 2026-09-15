/* Enhetstest av de delade byggstenarna i docs/gemensam.js.

   Testerna är ett regressionsnät: de låser fast vad KIS-funktionerna
   svarar i dag, så att omskrivningar av sidskripten kan göras utan att
   någon detalj tyst ändrar sig. Facit är skrivet för hand – ingenting
   räknas fram ur koden som testas.

   Bara de rena funktionerna prövas, alltså de som svarar på indata utan
   att röra sidan. Det som ritar och bygger markup granskas i stället i
   riktig webbläsare av scripts/smoke_webbplats.js och
   scripts/tillganglighet.js.

   Körs:  node --test tests/*.js
     eller node tests/test_gemensam.js
   Kräver ingenting utöver Node (node:test ingår). */

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

/* gemensam.js är skrivet för webbläsaren och sätter window.KIS när det
   körs. Här körs det i en sandlåda med precis så mycket DOM som filen rör
   vid när den läses in: readyState (så att uppstarten inte väntar på
   DOMContentLoaded) och en toppnav som inte finns (så att
   aktiveraToppnav avbryter direkt). Ingen webbläsare behövs. */
function laddaKis() {
  const kalla = fs.readFileSync(
    path.join(__dirname, "..", "docs", "gemensam.js"), "utf8");
  const dokument = {
    readyState: "complete",
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement() { return { value: "", textContent: "" }; },
  };
  const sandlada = { document: dokument, Intl, Date, console };
  sandlada.window = sandlada;
  vm.createContext(sandlada);
  vm.runInContext(kalla, sandlada, { filename: "gemensam.js" });
  return sandlada.KIS;
}

const K = laddaKis();

test("gemensam.js exponerar sig som window.KIS", () => {
  assert.equal(typeof K, "object");
});

/* ---------- esc: allt ur datafilerna passerar hit ---------- */

test("esc växlar de fem tecken som kan bryta ut ur markupen", () => {
  assert.equal(K.esc("<script>"), "&lt;script&gt;");
  assert.equal(K.esc('han sa "nej"'), "han sa &quot;nej&quot;");
  assert.equal(K.esc("Ove's"), "Ove&#39;s");
  assert.equal(K.esc("R&D"), "R&amp;D");
  /* Ampersanden växlas först, annars dubbelväxlas de andra. */
  assert.equal(K.esc("&lt;"), "&amp;lt;");
});

test("esc släpper igenom svenska tecken och gör om icke-strängar", () => {
  assert.equal(K.esc("Fjärås Bräcka"), "Fjärås Bräcka");
  assert.equal(K.esc(2026), "2026");
  assert.equal(K.esc(null), "null");
});

/* ---------- sakerUrl: adresser ur datafilerna ---------- */

test("sakerUrl släpper igenom https och relativa sökvägar", () => {
  assert.equal(K.sakerUrl("https://www.scb.se/x?a=1&b=2"),
    "https://www.scb.se/x?a=1&amp;b=2");
  assert.equal(K.sakerUrl("rapporter/prognos-2026.pdf"),
    "rapporter/prognos-2026.pdf");
  assert.equal(K.sakerUrl("  https://example.org/a  "), "https://example.org/a");
});

test("sakerUrl stoppar allt som inte är https eller relativt", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,<b>x", "//evil.example",
                     "http://example.org", "JavaScript:alert(1)", "vbscript:x"]) {
    assert.equal(K.sakerUrl(url), "", url);
  }
});

test("sakerUrl ger tom sträng för tomt och saknat värde", () => {
  assert.equal(K.sakerUrl(""), "");
  assert.equal(K.sakerUrl(null), "");
  assert.equal(K.sakerUrl(undefined), "");
  assert.equal(K.sakerUrl("   "), "");
});

/* ---------- slug: nyckeln i adressraden ----------
   Samma regel måste gälla i byggskripten (scripts/val.py och
   scripts/build_fortidsroster.py), annars matchar inte ?omrade= och
   ?distrikt= det sidan räknar fram. Facit här och i
   tests/test_berakningar.py är samma lista. */

test("slug följer reglerna för adressnycklar", () => {
  const fall = [
    ["Kungsbacka", "kungsbacka"],
    ["Hallands län", "hallands-lan"],
    ["Västra Götalands län", "vastra-gotalands-lan"],
    ["Östra Göinge", "ostra-goinge"],
    ["Åre", "are"],
    ["Fjärås Bräcka", "fjaras-bracka"],
    ["Malung-Sälen", "malung-salen"],
    ["Kolla Norra", "kolla-norra"],
    ["Café Ö", "cafe-o"],
    ["Ñuñoa", "nunoa"],
    ["São Paulo", "sao-paulo"],
    ["  Hela riket  ", "hela-riket"],
    ["A/B & C", "a-b-c"],
    ["2026", "2026"],
  ];
  for (const [namn, vantat] of fall) {
    assert.equal(K.slug(namn), vantat, namn);
  }
});

test("slug tål sammansatt form av samma bokstav", () => {
  /* "Åre" skrivet med kombinerande ring i stället för ett enda tecken. */
  assert.equal(K.slug("Åre"), K.slug("Åre"));
});

/* ---------- Årsskala och luckor ---------- */

test("arsskala fyller i åren mellan första och sista mätår", () => {
  assert.deepEqual(K.arsskala([2017, 2019, 2020]), [2017, 2018, 2019, 2020]);
  assert.deepEqual(K.arsskala([2021]), [2021]);
  assert.deepEqual(K.arsskala([2021, 2022]), [2021, 2022]);
});

test("saknadeAr pekar ut de år som inte har någon rapport", () => {
  assert.deepEqual(K.saknadeAr([2017, 2019, 2020]), [2018]);
  assert.deepEqual(K.saknadeAr([2017, 2018]), []);
  assert.deepEqual(K.saknadeAr([2015, 2018, 2021]), [2016, 2017, 2019, 2020]);
});

test("saknadeArText skriver ut luckorna i klartext", () => {
  assert.equal(K.saknadeArText([2017, 2018]), "");
  assert.equal(K.saknadeArText([2017, 2019]),
    " Året 2018 saknar rapport, därav luckan.");
  assert.equal(K.saknadeArText([2017, 2020]),
    " Åren 2018 och 2019 saknar rapport, därav luckorna.");
  assert.equal(K.saknadeArText([2017, 2021]),
    " Åren 2018, 2019 och 2020 saknar rapport, därav luckorna.");
});

/* ---------- Tal ---------- */

test("talSv skriver tal på svenskt vis", () => {
  /* Tusentalsavgränsaren är ett hårt mellanslag (U+00A0), så att talet
     aldrig bryts över en radbrytning. Minustecknet är U+2212. */
  assert.equal(K.talSv(135993), "135 993");
  assert.equal(K.talSv(14.53, 1), "14,5");
  assert.equal(K.talSv(14.55, 1), "14,6");
  assert.equal(K.talSv(0), "0");
  assert.equal(K.talSv(-4.7, 1), "−4,7");
});

test("talSv utan decimalargument avrundar till heltal", () => {
  assert.equal(K.talSv(14.53), "15");
  assert.equal(K.talSv(2.5), "3");
});

/* ---------- Seriestilar: ingen information bärs av färgen ensam ---------- */

test("serieStil ger de åtta första serierna var sin färg och punktform", () => {
  const farger = new Set();
  for (let i = 0; i < 8; i++) {
    const s = K.serieStil(i);
    assert.equal(s.farg, K.PALETT[i]);
    assert.deepEqual(s.streck, [], "de åtta första är heldragna");
    farger.add(s.farg);
  }
  assert.equal(farger.size, 8, "åtta olika färger");
});

test("serieStil börjar strecka när paletten tar slut", () => {
  assert.equal(K.serieStil(8).farg, K.PALETT[0]);
  assert.deepEqual(K.serieStil(8).streck, [7, 4]);
  assert.deepEqual(K.serieStil(16).streck, [2, 3]);
  /* Punktformen växlar snabbare än färgen, så två serier med samma färg
     ändå skiljer sig på mer än streckningen. */
  assert.equal(K.serieStil(0).punkt, "circle");
  assert.equal(K.serieStil(1).punkt, "rect");
});

test("rampFarg går från ljust till mörkt över antalet årgångar", () => {
  assert.equal(K.rampFarg(0, 5), "#86b6ef");
  assert.equal(K.rampFarg(4, 5), "#104281");
  /* En ensam årgång får rampens mörkaste ände, inte dess ljusaste. */
  assert.equal(K.rampFarg(0, 1), "#104281");
  assert.equal(K.rampFargOrange(0, 5), "#f2d08a");
  assert.equal(K.rampFargOrange(4, 5), "#845a00");
  assert.equal(K.rampFargOrange(0, 1), "#845a00");
});

/* ---------- Språk ---------- */

test("kommunGenitiv sätter s bara där namnet inte slutar på vokal", () => {
  assert.equal(K.kommunGenitiv("Kungsbacka"), "Kungsbacka");
  assert.equal(K.kommunGenitiv("Varberg"), "Varbergs");
  assert.equal(K.kommunGenitiv("Mölndal"), "Mölndals");
  assert.equal(K.kommunGenitiv("Åre"), "Åre");
  assert.equal(K.kommunGenitiv("Halmstad"), "Halmstads");
});

/* ---------- Utfallslinjen ---------- */

test("utfallDataset följer årsskalan och lämnar hål där utfall saknas", () => {
  const data = { utfall: { 2020: 85000, 2022: 86000 } };
  const d = K.utfallDataset(data, [2020, 2021, 2022, 2023]);
  assert.equal(d.label, "Faktiskt utfall (SCB)");
  assert.deepEqual(d.data, [85000, null, 86000, null]);
  assert.equal(d.borderColor, K.FARG.ink);
  assert.equal(d.spanGaps, false, "luckan ska synas, inte överbryggas");
});

/* ---------- Programtyper ---------- */

test("TYPNAMN skriver ut Skolverkets två typer i klartext", () => {
  assert.equal(K.TYPNAMN.hogskoleforberedande,
    "Högskoleförberedande program (inkl. IB)");
  assert.equal(K.TYPNAMN.yrkesprogram, "Yrkesprogram");
});

/* ---------- Paletten ---------- */

test("paletten är åtta kontrastvaliderade färger i fast ordning", () => {
  assert.deepEqual(K.PALETT, [
    "#1c5cab", "#e69f00", "#009e73", "#cc79a7",
    "#56b4e9", "#d55e00", "#7a5195", "#6b8f00",
  ]);
  assert.equal(K.FARG.bla, "#2a78d6");
  assert.equal(K.FARG.orange, "#e69f00");
  assert.equal(K.FARG.ink, "#0b0b0b");
});

/* ---------- Väljare ----------
   En <select> som fylls om vid varje byte (valresultatsidans partiväljare
   byter val, slutbetygssidans årväljare byter filter) måste bli av med
   sina gamla alternativ. Gör den inte det växer listan för varje byte och
   fylls med dubbletter. */

/* Så mycket <select> som funktionerna rör vid. */
function valjarstump() {
  const options = [];
  return {
    options: options,
    appendChild(o) { options.push(o); },
    set innerHTML(v) { if (v === "") options.length = 0; },
    get innerHTML() { return ""; },
    etiketter() { return options.map((o) => o.textContent); },
    varden() { return options.map((o) => o.value); },
  };
}

test("fyllValjare lägger in värdena som alternativ", () => {
  const v = valjarstump();
  K.fyllValjare(v, ["2024", "2025", "2026"]);
  assert.deepEqual(v.varden(), ["2024", "2025", "2026"]);
  assert.deepEqual(v.etiketter(), ["2024", "2025", "2026"]);
});

test("fyllValjare skriver etiketten när den skiljer sig från värdet", () => {
  const v = valjarstump();
  K.fyllValjare(v, ["m", "s"], (k) => (k === "m" ? "Moderaterna" : "Socialdemokraterna"));
  assert.deepEqual(v.varden(), ["m", "s"]);
  assert.deepEqual(v.etiketter(), ["Moderaterna", "Socialdemokraterna"]);
});

test("fyllValjare fyller om från grunden i stället för att växa", () => {
  /* Det här är felet som gjorde att valresultatsidans partiväljare fick
     tio alternativ till för varje byte av val: efter fyra byten stod
     Moderaterna fem gånger i listan. */
  const v = valjarstump();
  K.fyllValjare(v, ["m", "s", "sd"]);
  K.fyllValjare(v, ["m", "s", "sd"]);
  K.fyllValjare(v, ["m", "s"]);
  assert.deepEqual(v.varden(), ["m", "s"],
    "en omfyllning ska ersätta de gamla alternativen, inte läggas till dem");
});

test("laggTillAlternativ bygger vidare på en väljare som redan har alternativ", () => {
  /* Ett par väljare byggs av två anrop: ett inledande "Alla program" och
     listan sedan. Det ska fortfarande gå. */
  const v = valjarstump();
  K.fyllValjare(v, [""], () => "Alla program");
  K.laggTillAlternativ(v, ["Teknik", "Natur"]);
  assert.deepEqual(v.varden(), ["", "Teknik", "Natur"]);
  assert.deepEqual(v.etiketter(), ["Alla program", "Teknik", "Natur"]);
});
