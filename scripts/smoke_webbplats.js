/* Rök-test av den färdiga webbplatsen: laddar varje sida i Chromium och
   faller på JavaScript-fel, misslyckade resursförfrågningar (404:or,
   datafiler som inte kan hämtas), saknad huvudrubrik eller saknat
   huvudinnehåll. Diagramsidorna ska dessutom ha ritat minst ett diagram
   och minst en tabellrad, så att ett trasigt databygge upptäcks.

   Körs:  node scripts/smoke_webbplats.js
   Kräver playwright (npm install playwright && npx playwright install chromium).
   Sätt CHROMIUM_BIN för att peka på en egen Chromium-binär. */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const DOCS = path.join(__dirname, "..", "docs");

/* Sidor med diagram och tabeller; metod.html och index.html är rena
   textsidor (startsidans fakta fylls i men ritar inga diagram). */
const DIAGRAMSIDOR = [
  "befolkningsprognos.html", "gymnasiealdern.html", "barn-och-unga.html",
  "amnesbetyg.html", "nian-till-gymnasiet.html", "meritvarden.html",
  "slutbetyg.html", "antagning-till-examen.html",
];
const TEXTSIDOR = ["index.html", "metod.html"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".csv": "text/csv; charset=utf-8",
};

function startaServer() {
  return new Promise(function (klar) {
    const server = http.createServer(function (req, res) {
      const url = decodeURIComponent(req.url.split("?")[0]);
      const fil = path.join(DOCS, url === "/" ? "index.html" : url);
      if (!fil.startsWith(DOCS) || !fs.existsSync(fil) || !fs.statSync(fil).isFile()) {
        res.writeHead(404); res.end("saknas"); return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(fil)] || "application/octet-stream" });
      fs.createReadStream(fil).pipe(res);
    });
    server.listen(0, "127.0.0.1", function () { klar(server); });
  });
}

async function granska(browser, bas, sida, medDiagram) {
  const page = await browser.newPage();
  const fel = [];
  page.on("console", function (m) { if (m.type() === "error") fel.push("konsol: " + m.text()); });
  page.on("pageerror", function (e) { fel.push("pageerror: " + e.message); });
  page.on("requestfailed", function (r) { fel.push("förfrågan föll: " + r.url()); });
  page.on("response", function (r) {
    if (r.status() >= 400) fel.push("HTTP " + r.status() + ": " + r.url());
  });

  const svar = await page.goto(bas + "/" + sida, { waitUntil: "networkidle" });
  if (!svar || svar.status() !== 200) fel.push("sidan svarade " + (svar ? svar.status() : "inget"));
  await page.waitForTimeout(400);

  const inneh = await page.evaluate(function () {
    return {
      h1: document.querySelectorAll("h1").length,
      main: !!document.getElementById("huvudinnehall"),
      canvas: document.querySelectorAll("canvas").length,
      tabellrader: document.querySelectorAll("table tbody tr").length,
      status: (function () {
        const s = document.getElementById("status");
        return s && !s.hidden ? s.textContent.trim().slice(0, 120) : null;
      })(),
    };
  });
  if (inneh.h1 !== 1) fel.push("förväntade exakt en h1, fann " + inneh.h1);
  if (!inneh.main) fel.push("huvudinnehåll (#huvudinnehall) saknas");
  if (inneh.status) fel.push("felruta visas: " + inneh.status);
  if (medDiagram) {
    if (inneh.canvas === 0) fel.push("inga diagram ritade");
    if (inneh.tabellrader === 0) fel.push("inga tabellrader ritade");
  }
  await page.close();
  return fel;
}

(async function () {
  const server = await startaServer();
  const bas = "http://127.0.0.1:" + server.address().port;
  const exe = process.env.CHROMIUM_BIN;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});

  let antalFel = 0;
  const sidor = DIAGRAMSIDOR.map(function (s) { return [s, true]; })
    .concat(TEXTSIDOR.map(function (s) { return [s, false]; }));
  for (const par of sidor) {
    const fel = await granska(browser, bas, par[0], par[1]);
    console.log((fel.length ? "FEL " : "ok  ") + par[0]);
    fel.forEach(function (f) { console.log("     " + f); });
    antalFel += fel.length;
  }

  await browser.close();
  server.close();
  if (antalFel) {
    console.error("\n" + antalFel + " fel.");
    process.exit(1);
  }
  console.log("\nAlla sidor laddade utan fel.");
})();
