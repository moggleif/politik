/* ESLint-inställningar för webbplatsens JavaScript.

   Reglerna är valda för att fånga fel, inte för att formatera om koden:
   oanvända variabler, skuggade namn, oavsiktliga globaler och grenar som
   aldrig nås. `node --check` säger bara om en fil parsar; det här säger om
   den håller ihop.

   Tre slags filer, tre miljöer:
   - docs/*.js      körs i webbläsaren, laddas med <script> utan moduler
   - scripts/*.js   kontrollskript som körs i Node med require()
   - tests/*.js     enhetstester, likaså Node

   Körs:  npx eslint
   Kräver eslint (npm install --no-save eslint@9). */

"use strict";

const js = require("@eslint/js");

/* Globalerna räknas upp för hand i stället för att hämtas ur paketet
   `globals`. Listorna är korta, och att de är korta är en poäng i sig: står
   något här som ingen fil längre rör har beroendet flyttat ut utan att
   listan hängde med. */

/* Sidorna skriver ES5-syntax men körs i dagens webbläsare, så Promise,
   Intl och MutationObserver finns även om de inte fanns i ES5. */
const WEBBLASARE = {
  Blob: "readonly",
  Chart: "readonly",
  Intl: "readonly",
  MutationObserver: "readonly",
  Promise: "readonly",
  ResizeObserver: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  devicePixelRatio: "readonly",
  document: "readonly",
  fetch: "readonly",
  getComputedStyle: "readonly",
  history: "readonly",
  location: "readonly",
  matchMedia: "readonly",
  navigator: "readonly",
  requestAnimationFrame: "readonly",
  setTimeout: "readonly",
  window: "readonly"
};

const NODE = {
  Buffer: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  console: "readonly",
  exports: "writable",
  module: "writable",
  process: "readonly",
  require: "readonly",
  setTimeout: "readonly"
};

const REGLER = {
  ...js.configs.recommended.rules,
  /* Oanvända variabler är antingen kvarglömda eller ett stavfel. Argument
     före ett som används går däremot inte att ta bort utan att flytta
     anropen, och ES5 saknar `catch {}` – felvariabeln måste skrivas ut
     även när grenen bara tystar ett undantag. */
  "no-unused-vars": ["error", { args: "after-used", caughtErrors: "none" }],
  /* Ett `var` på filens toppnivå blir en global som varenda annan sida ser.
     Sidskripten packar sig i IIFE:er just för att slippa det. */
  "no-implicit-globals": "error",
  /* Skuggning är hur `program`-modulen försvann bakom en loopvariabel med
     samma namn i build_slutbetyg.py. Samma fälla finns i JavaScript. */
  "no-shadow": "error",
  /* Kodbasen jämför med === utom mot null, där == fångar båda de tomma
     värdena och används avsiktligt. */
  eqeqeq: ["error", "always", { null: "ignore" }]
};

module.exports = [
  {
    /* chart.umd.js är vendrad tredjepartskod och granskas inte.
       node_modules hoppar ESLint över självt. */
    ignores: ["docs/chart.umd.js"]
  },

  {
    /* Sidskripten är medvetet ES5: `var`, IIFE:er, inga moduler, ingen
       byggkedja. ecmaVersion 5 gör stilen till en regel i stället för en
       överenskommelse – en `const` som smyger sig in blir ett fel. */
    files: ["docs/*.js"],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: "script",
      globals: WEBBLASARE
    },
    rules: REGLER
  },

  {
    files: ["scripts/*.js", "tests/*.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: NODE
    },
    rules: REGLER
  },

  {
    /* Kontrollskripten kör Chromium och skickar in funktioner som körs
       *i sidan* via page.evaluate. De två miljöerna bor i samma fil, så de
       här filerna måste få båda uppsättningarna globaler. Priset är att ett
       stavfel på document i skriptets Node-del inte fångas; alternativet
       vore att bryta ut varje evaluate-funktion till en egen fil för
       lintens skull, vilket gör skripten svårare att läsa. */
    files: [
      "scripts/smoke_webbplats.js",
      "scripts/tillganglighet.js",
      "scripts/facit_webbplats.js"
    ],
    languageOptions: { globals: { ...NODE, ...WEBBLASARE } }
  }
];
