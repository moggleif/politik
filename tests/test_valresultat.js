/* Enhetstest av valresultatsidans uppslagning och adressrad:
   docs/valresultat-uppslag.js och docs/valresultat-adress.js (#65).

   Datafilen är påhittad och liten nog att facit går att räkna för hand:
   två distrikt, två partier, tre valår. Distriktet "nytt" fanns inte 2018
   och har en härkomst det året; partiet "L" (lokalt) stod inte på
   valsedeln 2018.

   Körs:  node --test tests/*.js
   Kräver ingenting utöver Node. */

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

/* Filerna körs i samma sandlåda och i samma ordning som sidan laddar
   dem: adressmodulen behöver K.slug och VALUPPSLAG.distriktFor. */
function ladda() {
  const sandlada = {
    document: {
      readyState: "complete",
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
      createElement() { return { value: "", textContent: "" }; },
    },
    Intl, Date, console,
  };
  sandlada.window = sandlada;
  vm.createContext(sandlada);
  for (const fil of ["gemensam.js", "valresultat-uppslag.js", "valresultat-adress.js"]) {
    const kalla = fs.readFileSync(path.join(__dirname, "..", "docs", fil), "utf8");
    vm.runInContext(kalla, sandlada, { filename: fil });
  }
  return sandlada;
}

const { VALUPPSLAG: V, VALADRESS: A } = ladda();

const FIL = {
  partier: [{ kod: "S", namn: "Socialdemokraterna" }, { kod: "L", namn: "Lokalpartiet" }],
  kommunTotalt: {
    giltiga: { 2018: 300, 2022: 400, 2026: 500 },
    roster: { S: { 2018: 150, 2022: 200, 2026: 200 }, L: { 2018: null, 2022: 40, 2026: 100 } },
  },
  distrikt: [
    {
      slug: "gamla", namn: "Gamla",
      giltiga: { 2018: 200, 2022: 100, 2026: 100 },
      roster: { S: { 2018: 100, 2022: 50, 2026: 60 }, L: { 2018: null, 2022: 10, 2026: 20 } },
      jamforbart: { "2018-2022": false, "2022-2026": true },
    },
    {
      slug: "nytt", namn: "Nytt",
      giltiga: { 2018: null, 2022: 300, 2026: 400 },
      roster: { S: { 2018: null, 2022: 150, 2026: 160 }, L: { 2018: null, 2022: 30, 2026: 80 } },
      harkomst: { 2018: { giltiga: 100, roster: { S: 50 }, fran: [{ namn: "Gamla" }] } },
      jamforbart: { "2018-2022": false, "2022-2026": true },
    },
  ],
};
const gamla = FIL.distrikt[0], nytt = FIL.distrikt[1];

/* ---------- Uppslagning ---------- */

test("valetFor ger valet och faller tillbaka på kommunvalet", () => {
  assert.equal(V.valetFor("riksdag").fil, "data-riksdagsval.json");
  assert.equal(V.valetFor("okant").nyckel, "kommun");
  assert.equal(V.valetFor(null).nyckel, "kommun");
});

test("raknaUpp skriver ut en lista som löpande text", () => {
  assert.equal(V.raknaUpp([]), "");
  assert.equal(V.raknaUpp(["A"]), "A");
  assert.equal(V.raknaUpp(["A", "B"]), "A och B");
  assert.equal(V.raknaUpp(["A", "B", "C"]), "A, B och C");
});

test("distriktFor och partiNamn slår upp i den fil som skickas in", () => {
  assert.equal(V.distriktFor(FIL, "nytt"), nytt);
  assert.equal(V.distriktFor(FIL, "finns-inte"), null);
  assert.equal(V.partiNamn(FIL, "L"), "Lokalpartiet");
  assert.equal(V.partiNamn(FIL, "X"), "X", "okänd kod visas som den är");
});

test("egetAr och harkomst skiljer distriktets egna år från härkomsten", () => {
  assert.equal(V.egetAr(nytt, "2018"), false);
  assert.equal(V.egetAr(nytt, "2022"), true);
  assert.equal(V.harkomst(nytt, "2018").giltiga, 100);
  assert.equal(V.harkomst(gamla, "2018"), null);
});

test("kommunSerie läser kommunens totaler, saknat parti blir noll röster", () => {
  const k = V.kommunSerie(FIL);
  assert.equal(k.roster("S", "2022"), 200);
  assert.equal(k.roster("L", "2018"), 0);
  assert.equal(k.roster("X", "2022"), 0);
  assert.equal(k.giltiga("2026"), 500);
  assert.equal(k.komplett("2018"), true);
});

test("gruppSerie summerar röster och giltiga, med härkomst där distriktet saknas", () => {
  const g = V.gruppSerie(FIL, ["gamla", "nytt"]);
  assert.equal(g.namn, "2 markerade distrikt");
  assert.equal(g.roster("S", "2022"), 200);
  assert.equal(g.giltiga("2022"), 400);
  assert.equal(g.roster("S", "2018"), 150, "100 egna + 50 ur härkomsten");
  assert.equal(g.giltiga("2018"), 300);
  assert.equal(g.indikator("2018"), true);
  assert.equal(g.indikator("2022"), false);
  assert.equal(g.indikatorText("2018"), "indikator för Nytt");
});

test("gruppSerie: ett distrikt heter som distriktet, okända slugar hoppas över", () => {
  const g = V.gruppSerie(FIL, ["gamla", "finns-inte"]);
  assert.equal(g.namn, "Gamla");
  assert.equal(g.antalDistrikt, 1);
});

test("gruppSerie är jämförbar bara om varje distrikt är det, och tom grupp aldrig", () => {
  assert.equal(V.gruppSerie(FIL, ["gamla", "nytt"]).jamforbart("2022-2026"), true);
  assert.equal(V.gruppSerie(FIL, ["gamla", "nytt"]).jamforbart("2018-2022"), false);
  assert.equal(V.gruppSerie(FIL, []).jamforbart("2022-2026"), false);
  assert.equal(V.gruppSerie(FIL, []).komplett("2022"), false);
});

test("gruppSerie är inte komplett när ett distrikt saknas utan härkomst", () => {
  const utan = Object.assign({}, nytt, { slug: "utan", harkomst: undefined });
  const fil = Object.assign({}, FIL, { distrikt: [gamla, utan] });
  assert.equal(V.gruppSerie(fil, ["gamla", "utan"]).komplett("2018"), false);
});

test("distriktSerie använder härkomsten, utom när bara egna år efterfrågas", () => {
  const vanlig = V.distriktSerie(nytt);
  assert.equal(vanlig.roster("S", "2018"), 50);
  assert.equal(vanlig.komplett("2018"), true);
  assert.equal(vanlig.indikatorText("2018"), "siffrorna för Gamla");
  const egna = V.distriktSerie(nytt, true);
  assert.equal(egna.roster("S", "2018"), 0);
  assert.equal(egna.komplett("2018"), false);
  assert.equal(egna.indikator("2018"), false);
});

test("partietFanns: null i kommunens totaler betyder att partiet inte stod på valsedeln", () => {
  assert.equal(V.partietFanns(FIL, "L", "2018"), false);
  assert.equal(V.partietFanns(FIL, "L", "2022"), true);
  assert.equal(V.partietFanns(FIL, "X", "2022"), false);
});

test("varde: andelen räknas på områdets summor, inte som snitt av procenttal", () => {
  const g = V.gruppSerie(FIL, ["gamla", "nytt"]);
  /* 2026: Gamla 60 av 100 (60 %), Nytt 160 av 400 (40 %). Summorna ger
     220 av 500 = 44 %; ett snitt av procenttalen hade gett 50 %. */
  assert.equal(V.varde(FIL, g, "S", "2026", "andel"), 44);
  assert.equal(V.varde(FIL, g, "S", "2022", "andel"), 50);
  assert.equal(V.varde(FIL, g, "S", "2026", "antal"), 220);
});

test("varde är null – aldrig noll – när partiet saknas eller området inte är komplett", () => {
  const g = V.gruppSerie(FIL, ["gamla", "nytt"]);
  assert.equal(V.varde(FIL, g, "L", "2018", "andel"), null);
  assert.equal(V.varde(FIL, V.distriktSerie(nytt, true), "S", "2018", "antal"), null);
});

/* ---------- Adressraden ---------- */

test("lasDistrikt: tom adress ger inget urval, okända slugar hoppas över", () => {
  assert.deepEqual(Object.keys(A.lasDistrikt(FIL, null)), []);
  assert.deepEqual(Object.keys(A.lasDistrikt(FIL, "nytt,finns-inte")), ["nytt"]);
  assert.deepEqual(Object.keys(A.lasDistrikt(FIL, "alla")).sort(), ["gamla", "nytt"]);
});

test("distriktVarde skriver i filens ordning och förkortar alla till \"alla\"", () => {
  assert.equal(A.distriktVarde(FIL, {}), null);
  assert.equal(A.distriktVarde(FIL, { nytt: true }), "nytt");
  assert.equal(A.distriktVarde(FIL, { nytt: true, gamla: true }), "alla");
});

test("distrikten går fram och tillbaka genom adressen utan att ändras", () => {
  for (const v of ["gamla", "nytt", "alla"]) {
    assert.equal(A.distriktVarde(FIL, A.lasDistrikt(FIL, v)), v);
  }
});

test("lasPartier läser slugar och faller tillbaka på de största partierna", () => {
  assert.deepEqual(Object.keys(A.lasPartier(FIL, "l", 9)), ["L"]);
  assert.deepEqual(Object.keys(A.lasPartier(FIL, null, 1)), ["S"]);
  assert.deepEqual(Object.keys(A.lasPartier(FIL, "finns-inte", 9)), ["S", "L"]);
});

test("partierVarde skriver slugar i filens ordning, tomt urval tar bort parametern", () => {
  assert.equal(A.partierVarde(FIL, { L: true, S: true }), "s,l");
  assert.equal(A.partierVarde(FIL, {}), null);
});
