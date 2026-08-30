/* Rök-test av den färdiga webbplatsen: laddar varje sida i Chromium och
   faller på JavaScript-fel, misslyckade resursförfrågningar (404:or,
   datafiler som inte kan hämtas), saknad huvudrubrik eller saknat
   huvudinnehåll. Diagramsidorna ska dessutom ha ritat minst ett diagram
   och minst en tabellrad, så att ett trasigt databygge upptäcks.

   Sidor med regimmarkeringar granskas en gång till i en 360 px-vy: när
   Chart.js gallrar bort tickar vid smal skärm är det lätt att räkna fel på
   var markeringen ska stå, och den hamnar då på ett annat år än det den
   säger sig markera.

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

/* Diagram med regimmarkeringar, och de år markeringarna gäller. Åren står
   här och hämtas inte ur sidan – annars skulle testet bekräfta det koden
   råkar göra i stället för det den ska göra. */
const REGIMSIDOR = [
  ["meritvarden.html", "diagram-utveckling", [2022, 2025]],
  ["slutbetyg.html", "diagram-utveckling", [2025]],
  ["amnesbetyg.html", "diagram-amne", [2023]],
  ["amnesbetyg.html", "diagram-alla", [2023]],
];

/* Smal vy: bredden där Chart.js börjar gallra tickar. */
const SMAL_VY = { width: 360, height: 900 };

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

/* Varje markering ska stå i övergången mellan året före och det markerade
   året, ligga inne i ritytan, och inte sammanfalla med en annan markering i
   samma diagram. */
async function granskaRegimmarkering(browser, bas, sida, diagramId, aren) {
  const page = await browser.newPage({ viewport: SMAL_VY });
  const fel = [];
  page.on("pageerror", function (e) { fel.push("pageerror: " + e.message); });
  await page.goto(bas + "/" + sida, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const matt = await page.evaluate(function (args) {
    const c = Chart.getChart(document.getElementById(args.id));
    if (!c) return { saknas: true };
    const x = c.scales.x, etiketter = x.getLabels();
    return {
      gallrade: x.ticks.length < etiketter.length,
      yta: { vanster: c.chartArea.left, hoger: c.chartArea.right },
      markeringar: c.$regimmarkeringar || [],
      /* Facit: var åren faktiskt ligger på x-axeln */
      arPixel: args.aren.map(function (a) {
        const i = etiketter.indexOf(String(a));
        return i < 0 ? null : {
          ar: a,
          fore: i > 0 ? x.getPixelForValue(i - 1) : null,
          sjalv: x.getPixelForValue(i),
        };
      }),
    };
  }, { id: diagramId, aren: aren });

  if (matt.saknas) {
    fel.push(diagramId + ": diagrammet ritades aldrig");
    await page.close();
    return fel;
  }
  if (!matt.gallrade) {
    fel.push(diagramId + ": vyn gallrade inga tickar, testet prövar inte det "
      + "det ska (smalna av SMAL_VY)");
  }
  aren.forEach(function (ar) {
    const m = matt.markeringar.filter(function (v) { return v.vid === ar; })[0];
    const facit = matt.arPixel.filter(function (v) { return v && v.ar === ar; })[0];
    if (!m) { fel.push(diagramId + ": markeringen för " + ar + " ritades inte"); return; }
    if (!facit) { fel.push(diagramId + ": året " + ar + " finns inte på axeln"); return; }
    if (m.px <= matt.yta.vanster || m.px >= matt.yta.hoger) {
      fel.push(diagramId + ": markeringen för " + ar + " hamnade utanför ritytan ("
        + Math.round(m.px) + " av " + Math.round(matt.yta.vanster) + "–"
        + Math.round(matt.yta.hoger) + ")");
      return;
    }
    if (facit.fore !== null && !(m.px > facit.fore && m.px < facit.sjalv)) {
      fel.push(diagramId + ": markeringen för " + ar + " står på " + Math.round(m.px)
        + ", inte i övergången " + Math.round(facit.fore) + "–" + Math.round(facit.sjalv));
    }
  });
  const px = matt.markeringar.map(function (m) { return Math.round(m.px); });
  if (new Set(px).size !== px.length) {
    fel.push(diagramId + ": två markeringar hamnade på samma plats (" + px.join(", ") + ")");
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

  for (const par of REGIMSIDOR) {
    const fel = await granskaRegimmarkering(browser, bas, par[0], par[1], par[2]);
    console.log((fel.length ? "FEL " : "ok  ") + par[0] + " / " + par[1]
      + " (regimmarkering, " + SMAL_VY.width + " px)");
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
