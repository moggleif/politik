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
  "varberg-befolkningsprognos.html", "varberg-gymnasiealdern.html",
  "varberg-barn-och-unga.html",
  "amnesbetyg.html", "kostnad-per-elev.html", "resurser-till-skolan.html",
  "nian-till-gymnasiet.html",
  "meritvarden.html",
  "slutbetyg.html", "antagning-till-examen.html", "fortidsrostning.html",
  /* Samma sida för ett län och för riket – servern bortser från
     frågesträngen, sidan läser den. */
  "fortidsrostning.html?omrade=hallands-lan", "fortidsrostning.html?omrade=hela-riket",
  "kommunval.html",
  /* Samma sida med markerade distrikt och ett annat parti – reglagen
     läses ur frågesträngen, så en delad länk ska ge samma vy. */
  "kommunval.html?parti=s&distrikt=innerstaden,hede&matt=antal",
  /* Tio markerade distrikt: fler än palettens åtta färger, och ska ändå
     ritas var för sig. */
  "kommunval.html?parti=m&distrikt=anneberg,bjorkris,fjaras-norra,fjaras-sodra," +
    "fors,frillesas-kust,gottskar,hammero,innerstaden,hede",
  "kommunval.html?parti=sd&distrikt=alla",
  /* Tre markerade distrikt: ett litet partidiagram vardera. Granskas
     närmare i granskaSmadiagram nedan. */
  "kommunval.html?parti=sd&distrikt=onsala-kyrka,innerstaden,anneberg",
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

/* Sidorna läser in GoatCounters count.js. Testet ska gå utan nät, så
   skriptet besvaras här med en tom fil (och räknas gör ändå inget från
   127.0.0.1 – count.js hoppar över lokala adresser). */
async function stubbaGoatcounter(page) {
  await page.route("https://gc.zgo.at/**", function (r) {
    r.fulfill({ status: 200, contentType: "text/javascript", body: "" });
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
  await stubbaGoatcounter(page);

  const svar = await page.goto(bas + "/" + sida, { waitUntil: "networkidle" });
  if (!svar || svar.status() !== 200) fel.push("sidan svarade " + (svar ? svar.status() : "inget"));
  /* "networkidle" kan infalla innan sidan börjat hämta sina datafiler:
     på en kall maskin tar det ibland över en halv sekund att köra
     skripten efter att de laddats. Vänta därför in att sidan ritat sina
     tabeller (eller visat sin felruta) i stället för en fast tid. */
  if (medDiagram) {
    await page.waitForFunction(function () {
      const s = document.getElementById("status");
      return document.querySelector("table tbody tr") || (s && !s.hidden);
    }, null, { timeout: 10000 }).catch(function () { /* bedöms nedan */ });
  }
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
  await stubbaGoatcounter(page);
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

/* Ett litet partidiagram per markerat valdistrikt: lika många diagram som
   markeringar, en gemensam y-axel så att bilderna går att jämföra med
   ögat, och inga kvarglömda diagram när markeringen ändras. */
async function granskaSmadiagram(browser, bas) {
  const slugar = ["onsala-kyrka", "innerstaden", "anneberg"];
  const page = await browser.newPage();
  const fel = [];
  page.on("pageerror", function (e) { fel.push("pageerror: " + e.message); });
  await stubbaGoatcounter(page);
  await page.goto(bas + "/kommunval.html?parti=sd&distrikt=" + slugar.join(","),
    { waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    return document.querySelectorAll("#smadiagram-rutnat canvas").length > 0;
  }, null, { timeout: 10000 }).catch(function () { /* bedöms nedan */ });

  const lage = await page.evaluate(function (slugar) {
    return {
      antal: document.querySelectorAll("#smadiagram-rutnat canvas").length,
      teckenposter: document.querySelectorAll("#teckenforklaring-enskilt .teckenpost").length,
      skalor: slugar.map(function (s) {
        const c = Chart.getChart(document.getElementById("diagram-enskilt-" + s));
        return c ? [c.scales.y.min, c.scales.y.max] : null;
      }),
    };
  }, slugar);

  if (lage.antal !== slugar.length) {
    fel.push("förväntade " + slugar.length + " små diagram, fann " + lage.antal);
  }
  if (!lage.teckenposter) fel.push("teckenförklaringen över rutnätet är tom");
  lage.skalor.forEach(function (skala, i) {
    if (!skala) { fel.push(slugar[i] + ": diagrammet ritades aldrig"); return; }
    const forsta = lage.skalor[0];
    if (forsta && (skala[0] !== forsta[0] || skala[1] !== forsta[1])) {
      fel.push(slugar[i] + ": y-axeln " + skala.join("–") + " skiljer sig från "
        + slugar[0] + "s " + forsta.join("–") + "; diagrammen ska dela skala");
    }
  });

  /* Alla 46 distrikt är fler än taket: diagrammen ska då rivas, inte
     ligga kvar med gammal data, och sidan säga varför. */
  await page.click("#valj-alla");
  await page.waitForTimeout(400);
  const efter = await page.evaluate(function () {
    return {
      antal: document.querySelectorAll("#smadiagram-rutnat canvas").length,
      not: (document.getElementById("not-enskilt").textContent || "").trim().length,
    };
  });
  if (efter.antal !== 0) {
    fel.push("alla distrikt markerade: " + efter.antal
      + " små diagram ligger kvar, förväntade noll");
  }
  if (!efter.not) fel.push("alla distrikt markerade: ingen not om taket");

  await page.close();
  return fel;
}

/* Valdistrikt som ritades upp efter 2010 har ingenting att visa de första
   valen. x-axeln ska då börja vid det första val distriktet fanns – och
   streckningen (de övergångar Valmyndigheten inte anser jämförbara) ska
   följa med beskärningen i stället för att hamna på fel övergång.
   Björkris fanns från 2018 och är jämförbart både 2018–2022 och
   2022–2026: ingen del av linjen ska vara streckad. */
async function granskaBeskurenAxel(browser, bas) {
  const page = await browser.newPage();
  const fel = [];
  page.on("pageerror", function (e) { fel.push("pageerror: " + e.message); });
  await stubbaGoatcounter(page);
  await page.goto(bas + "/kommunval.html?parti=m&distrikt=bjorkris",
    { waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    return document.getElementById("diagram-enskilt-bjorkris");
  }, null, { timeout: 10000 }).catch(function () { /* bedöms nedan */ });

  const lage = await page.evaluate(function () {
    const c = Chart.getChart(document.getElementById("diagram-enskilt-bjorkris"));
    if (!c) return { saknas: true };
    const ds = c.data.datasets[0];
    return {
      etiketter: c.data.labels,
      punkter: ds.data.length,
      /* Chart.js frågar segmentet per delsträcka; index 0 är den första
         som ritas, alltså 2018–2022 i det beskurna fönstret. */
      streck: [0, 1].map(function (i) {
        return ds.segment.borderDash({ p0DataIndex: i }) || null;
      }),
      not: (document.getElementById("not-enskilt").textContent || "").trim(),
    };
  });

  if (lage.saknas) {
    fel.push("diagrammet för björkris ritades aldrig");
    await page.close();
    return fel;
  }
  if (lage.etiketter.join(",") !== "2018,2022,2026") {
    fel.push("x-axeln är " + lage.etiketter.join(",")
      + ", förväntade att de val distriktet inte fanns beskurits bort "
      + "(2018,2022,2026)");
  }
  if (lage.punkter !== lage.etiketter.length) {
    fel.push("serien har " + lage.punkter + " punkter mot axelns "
      + lage.etiketter.length + " år");
  }
  lage.streck.forEach(function (streck, i) {
    if (streck) {
      fel.push("segment " + i + " ritades streckat; båda övergångarna är "
        + "jämförbara, så streckningen har följt med fel årsindex");
    }
  });
  if (!/2010, 2014 visas inte/.test(lage.not)) {
    fel.push("noten säger inte vilka val som beskurits bort: " + lage.not);
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

  {
    const fel = await granskaSmadiagram(browser, bas);
    console.log((fel.length ? "FEL " : "ok  ") + "kommunval.html (ett diagram per markerat distrikt)");
    fel.forEach(function (f) { console.log("     " + f); });
    antalFel += fel.length;
  }

  {
    const fel = await granskaBeskurenAxel(browser, bas);
    console.log((fel.length ? "FEL " : "ok  ") + "kommunval.html (beskuren x-axel för ett nyare distrikt)");
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
