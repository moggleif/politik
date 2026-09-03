/* Tillgänglighetskontroll av den färdiga webbplatsen. Tre kontroller per
   sida, alla i riktig webbläsare:

     1. axe-core mot WCAG 2.1 A och AA – de regelbrott ett verktyg kan
        avgöra maskinellt (kontrast, namn på kontroller, landmärken …).
     2. Tangentbordsnavigation: varje interaktiv kontroll ska gå att nå
        med tabb, och den ska synas när den får fokus.
     3. Smal skärm (360 px): sidan själv får inte kunna rullas i sidled –
        breda tabeller ska rulla i sin egen behållare i stället.

   Körs:  node scripts/tillganglighet.js
   Kräver playwright och axe-core. CHROMIUM_BIN pekar ut egen binär. */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const DOCS = path.join(__dirname, "..", "docs");
const AXE = require.resolve("axe-core/axe.min.js");

const SIDOR = [
  "index.html", "befolkningsprognos.html", "gymnasiealdern.html",
  "barn-och-unga.html", "amnesbetyg.html", "nian-till-gymnasiet.html",
  "meritvarden.html", "slutbetyg.html", "antagning-till-examen.html",
  "fortidsrostning.html", "metod.html",
];

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf", ".csv": "text/csv; charset=utf-8",
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

/* Sidorna läser in GoatCounters count.js; besvaras lokalt så att
   kontrollen går utan nät (samma stubb som i smoke_webbplats.js). */
async function stubbaGoatcounter(page) {
  await page.route("https://gc.zgo.at/**", function (r) {
    r.fulfill({ status: 200, contentType: "text/javascript", body: "" });
  });
}

async function granska(browser, bas, sida) {
  const fel = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await stubbaGoatcounter(page);
  await page.goto(bas + "/" + sida, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  /* 1. axe-core. Sidornas CSP tillåter inga inline-skript, så koden
     körs via evaluate (som går utanför sidans skriptkontext) i stället
     för att injiceras som ett script-element. */
  await page.evaluate(fs.readFileSync(AXE, "utf-8"));
  const axeSvar = await page.evaluate(function () {
    return window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
  });
  axeSvar.violations.forEach(function (v) {
    fel.push("axe " + v.id + " (" + v.impact + "): " + v.help +
      " [" + v.nodes.length + " element, t.ex. " +
      (v.nodes[0] ? v.nodes[0].target.join(" ") : "?") + "]");
  });

  /* 2. Tangentbordsnavigation: nås varje synlig kontroll, och syns fokus? */
  const interaktiva = await page.evaluate(function () {
    const val = "a[href], button, select, summary, [tabindex]:not([tabindex='-1'])";
    return Array.from(document.querySelectorAll(val)).filter(function (e) {
      if (e.offsetParent === null) return false;
      /* Innehållet i en hopfälld <details> ska inte gå att tabba till –
         bara dess <summary>. Räkna därför inte med det. */
      const d = e.closest("details");
      return !d || d.open || e.tagName === "SUMMARY";
    }).length;
  });
  /* Märk varje element som faktiskt får fokus. Att räkna dem i en mängd
     av beskrivningar duger inte: två kolumnrubriker med samma text är
     olika element men skulle få samma nyckel. */
  let utanSynligFokus = 0;
  for (let i = 0; i < interaktiva * 2 + 20; i++) {
    await page.keyboard.press("Tab");
    const utanFokusmarkering = await page.evaluate(function () {
      const a = document.activeElement;
      if (!a || a === document.body) return false;
      if (a.dataset.tabbad) return false;          // redan räknad
      a.dataset.tabbad = "1";
      const st = getComputedStyle(a);
      /* Fokus ska markeras med kontur eller skugga – inte enbart färg. */
      const synligt = (st.outlineStyle !== "none" && parseFloat(st.outlineWidth) > 0)
        || st.boxShadow !== "none";
      return !synligt;
    });
    if (utanFokusmarkering) utanSynligFokus++;
  }
  const nadda = await page.evaluate(function () {
    return document.querySelectorAll("[data-tabbad]").length;
  });
  if (interaktiva && nadda < interaktiva) {
    const missade = await page.evaluate(function () {
      const val = "a[href], button, select, summary, [tabindex]:not([tabindex='-1'])";
      return Array.from(document.querySelectorAll(val)).filter(function (e) {
        if (e.offsetParent === null || e.dataset.tabbad) return false;
        const d = e.closest("details");
        return !d || d.open || e.tagName === "SUMMARY";
      }).slice(0, 3).map(function (e) {
        return e.tagName + " \"" + (e.textContent || "").trim().slice(0, 30) + "\"";
      });
    });
    fel.push("tangentbord: nådde " + nadda + " av " + interaktiva +
      " synliga kontroller med tabb; t.ex. missades " + missade.join("; "));
  }
  if (utanSynligFokus) {
    fel.push("tangentbord: " + utanSynligFokus + " kontroller saknar synlig fokusmarkering");
  }

  /* 3. Smal skärm: sidan får inte rulla i sidled */
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(300);
  const bredd = await page.evaluate(function () {
    return {
      dokument: document.documentElement.scrollWidth,
      fonster: document.documentElement.clientWidth,
    };
  });
  if (bredd.dokument > bredd.fonster + 1) {
    fel.push("smal skärm: sidan rullar i sidled (" + bredd.dokument +
      " px innehåll i " + bredd.fonster + " px fönster)");
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
  for (const sida of SIDOR) {
    const fel = await granska(browser, bas, sida);
    console.log((fel.length ? "FEL " : "ok  ") + sida);
    fel.forEach(function (f) { console.log("     " + f); });
    antalFel += fel.length;
  }

  await browser.close();
  server.close();
  if (antalFel) {
    console.error("\n" + antalFel + " tillgänglighetsproblem.");
    process.exit(1);
  }
  console.log("\nInga tillgänglighetsproblem hittade.");
})();
