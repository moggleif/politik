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
  "platser.html",
  "meritvarden.html",
  "slutbetyg.html", "antagning-till-examen.html", "fortidsrostning.html",
  /* Samma sida för ett län och för riket – servern bortser från
     frågesträngen, sidan läser den. */
  "fortidsrostning.html?omrade=hallands-lan", "fortidsrostning.html?omrade=hela-riket",
  "valresultat.html",
  /* Samma sida med markerade distrikt och ett annat parti – reglagen
     läses ur frågesträngen, så en delad länk ska ge samma vy. */
  "valresultat.html?parti=s&distrikt=innerstaden,hede&matt=antal",
  /* Tio markerade distrikt: fler än palettens åtta färger, och ska ändå
     ritas var för sig. */
  "valresultat.html?parti=m&distrikt=anneberg,bjorkris,fjaras-norra,fjaras-sodra," +
    "fors,frillesas-kust,gottskar,hammero,innerstaden,hede",
  "valresultat.html?parti=sd&distrikt=alla",
  /* Tre markerade distrikt: ett litet partidiagram vardera. Granskas
     närmare i granskaSmadiagram nedan. */
  "valresultat.html?parti=sd&distrikt=onsala-kyrka,innerstaden,anneberg",
  /* Ett distrikt som ritades upp först 2022 och därför har indikatorer
     bakåt. Granskas närmare i granskaHarkomst nedan. */
  "valresultat.html?parti=m&distrikt=kolla-norra,kolla-sodra",
  /* Samma sida, de två andra valen. Bytet självt granskas närmare i
     granskaValbyte nedan. */
  "valresultat.html?val=region",
  "valresultat.html?val=riksdag&parti=sd&distrikt=innerstaden,hede",
  /* Ett parti som bara finns i kommunvalet, tillsammans med ett val där
     det inte ställer upp: sidan ska falla tillbaka på förvalet och rita. */
  "valresultat.html?val=riksdag&parti=kbabo",
  /* Samma parti i ett val där det ställde upp förr men inte i det
     senaste: inget tal att öppna "Kort sagt" med. Granskas närmare i
     granskaTreVal nedan. */
  "valresultat.html?val=region&parti=kbabo&matt=antal",
  "fullmaktige.html",
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
  await page.goto(bas + "/valresultat.html?parti=sd&distrikt=" + slugar.join(","),
    { waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    return document.querySelectorAll("#smadiagram-rutnat canvas").length > 0;
  }, null, { timeout: 10000 }).catch(function () { /* bedöms nedan */ });

  const lage = await page.evaluate(function (slugarna) {
    return {
      antal: document.querySelectorAll("#smadiagram-rutnat canvas").length,
      teckenposter: document.querySelectorAll("#teckenforklaring-enskilt .teckenpost").length,
      skalor: slugarna.map(function (s) {
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

/* Ett valdistrikt som ritades upp först 2022 fylls på bakåt med
   siffrorna för det distrikt marken låg i: fem punkter i stället för
   två, de tre första streckade och ihåliga. Indikatorn får däremot
   aldrig läcka in i tabellen, som redovisar distriktets egna röster. */
async function granskaHarkomst(browser, bas) {
  const page = await browser.newPage();
  const fel = [];
  page.on("pageerror", function (e) { fel.push("pageerror: " + e.message); });
  await stubbaGoatcounter(page);
  await page.goto(bas + "/valresultat.html?parti=m&distrikt=kolla-norra",
    { waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    return document.querySelector("table tbody tr");
  }, null, { timeout: 10000 }).catch(function () { /* bedöms nedan */ });

  const lage = await page.evaluate(function () {
    const c = Chart.getChart(document.getElementById("diagram-andel"));
    if (!c) return { saknas: true };
    const ds = c.data.datasets.filter(function (d) {
      return d.label === "Kolla Norra";
    })[0];
    if (!ds) return { saknasSerie: true };
    const rad = Array.prototype.slice.call(
      document.querySelectorAll("#tabell-distrikt tbody tr")).filter(function (tr) {
        return tr.querySelector("th").textContent.trim() === "Kolla Norra";
      })[0];
    return {
      etiketter: c.data.labels,
      varden: ds.data,
      punktfarg: ds.pointBackgroundColor,
      linjefarg: ds.borderColor,
      streck: [0, 1, 2, 3].map(function (i) {
        return ds.segment.borderDash({ p0DataIndex: i }) ? "streck" : "hel";
      }),
      not: (document.getElementById("not-andel").textContent || "").trim(),
      tabellrad: rad ? Array.prototype.map.call(rad.querySelectorAll("td"),
        function (td) { return td.textContent.trim(); }) : null,
    };
  });

  if (lage.saknas) { fel.push("diagram-andel ritades aldrig"); }
  else if (lage.saknasSerie) { fel.push("ingen serie för Kolla Norra"); }
  else {
    if (lage.varden.length !== 5 || lage.varden.some(function (v) { return v === null; })) {
      fel.push("förväntade fem punkter utan hål, fick " + JSON.stringify(lage.varden));
    }
    /* Distriktet finns 2022 och 2026; 2010–2018 är indikatorer. */
    if (!Array.isArray(lage.punktfarg)) {
      fel.push("punkterna har en enda färg; indikatorpunkten ska vara ihålig");
    } else {
      lage.punktfarg.forEach(function (farg, i) {
        const skaVaraIhalig = i < 3;
        const ihalig = farg !== lage.linjefarg;
        if (ihalig !== skaVaraIhalig) {
          fel.push("punkten " + lage.etiketter[i] + " är "
            + (ihalig ? "ihålig" : "fylld") + ", förväntade "
            + (skaVaraIhalig ? "ihålig" : "fylld"));
        }
      });
    }
    const vantatStreck = ["streck", "streck", "streck", "hel"];
    if (lage.streck.join(",") !== vantatStreck.join(",")) {
      fel.push("streckningen är " + lage.streck.join(",")
        + ", förväntade " + vantatStreck.join(","));
    }
    if (!/indikator/.test(lage.not)) {
      fel.push("noten förklarar inte indikatorn: " + lage.not);
    }
    if (!lage.tabellrad) {
      fel.push("Kolla Norra saknas i tabellen");
    } else if (lage.tabellrad.slice(0, 3).join(",") !== "–,–,–") {
      fel.push("indikatorn har läckt in i tabellen: "
        + lage.tabellrad.join(" | "));
    }
  }

  /* Och samma sak i de små diagrammen – för *varje* markerat distrikt,
     inte bara det första. Array.prototype.map skickar med indexet som
     andra argument, och en serie som tar ett andra argument tappar då
     indikatorerna i alla diagram utom det första. */
  await page.goto(bas + "/valresultat.html?parti=m&distrikt=kolla-norra,asa-kust",
    { waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    return document.getElementById("diagram-enskilt-asa-kust");
  }, null, { timeout: 10000 }).catch(function () { /* bedöms nedan */ });
  const sma = await page.evaluate(function () {
    return ["kolla-norra", "asa-kust"].map(function (slug) {
      const c = Chart.getChart(document.getElementById("diagram-enskilt-" + slug));
      return {
        slug: slug,
        punkter: c ? c.data.datasets[0].data.filter(function (v) {
          return v !== null;
        }).length : -1,
      };
    });
  });
  sma.forEach(function (d) {
    if (d.punkter !== 5) {
      fel.push("det lilla diagrammet för " + d.slug + " har " + d.punkter
        + " punkter, förväntade 5 (indikatorerna saknas)");
    }
  });

  await page.close();
  return fel;
}

/* Väljaren högst upp byter vilket av de tre valen sidan visar. Bytet ska
   ske utan omladdning, byta både siffror och text, lägga valet i adressen
   – och framför allt låta de markerade distrikten stå kvar: det är hela
   skälet till att de tre valen ligger på samma sida. */
async function granskaValbyte(browser, bas) {
  const page = await browser.newPage();
  const fel = [];
  page.on("pageerror", function (e) { fel.push("pageerror: " + e.message); });
  await stubbaGoatcounter(page);
  await page.goto(bas + "/valresultat.html?parti=m&distrikt=innerstaden,hede",
    { waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    return document.querySelector("#tabell-distrikt tbody tr");
  }, null, { timeout: 10000 }).catch(function () { /* bedöms nedan */ });

  function lage() {
    return page.evaluate(function () {
      const c = Chart.getChart(document.getElementById("diagram-andel"));
      return {
        val: document.getElementById("valj-val").value,
        parti: document.getElementById("valj-parti").value,
        markerade: Array.prototype.slice.call(
          document.querySelectorAll("#distriktval-rutor input:checked"))
          .map(function (i) { return i.value; }),
        rubrik: (document.querySelector("#tabell-distrikt caption")
          || { textContent: "" }).textContent,
        varden: c ? c.data.datasets.map(function (d) { return d.data.join(","); }) : [],
        /* Alla sidans <select>: ett byte av val fyller om flera av dem,
           och en väljare som fylls om utan att först tömmas växer i
           stället för att bytas ut. */
        valjare: Array.prototype.slice.call(document.querySelectorAll("select"))
          .map(function (v) {
            return {
              id: v.id,
              varden: Array.prototype.slice.call(v.options).map(function (o) {
                return o.value;
              }),
            };
          }),
      };
    });
  }

  /* Ingen <select> får ha samma alternativ två gånger. */
  function granskaDubbletter(nulage, nar) {
    nulage.valjare.forEach(function (v) {
      const sedda = {}, dubbla = [];
      v.varden.forEach(function (x) {
        if (sedda[x]) { if (dubbla.indexOf(x) === -1) dubbla.push(x); }
        sedda[x] = true;
      });
      if (dubbla.length) {
        fel.push("väljaren #" + v.id + " har dubbla alternativ " + nar + ": "
          + dubbla.join(", ") + " (" + v.varden.length + " alternativ totalt)");
      }
    });
  }

  const fore = await lage();
  granskaDubbletter(fore, "vid start");
  if (fore.val !== "kommun") fel.push("sidan börjar inte i kommunvalet");
  if (!/kommunvalet/.test(fore.rubrik)) {
    fel.push("tabellen nämner inte kommunvalet: " + fore.rubrik);
  }

  await page.selectOption("#valj-val", "riksdag");
  await page.waitForFunction(function () {
    return /riksdagsvalet/.test(
      (document.querySelector("#tabell-distrikt caption") || {}).textContent || "");
  }, null, { timeout: 10000 }).catch(function () { /* bedöms nedan */ });
  const efter = await lage();
  granskaDubbletter(efter, "efter bytet till riksdagsvalet");

  if (efter.markerade.join(",") !== fore.markerade.join(",")) {
    fel.push("markeringen ändrades av bytet: " + fore.markerade.join(",")
      + " blev " + efter.markerade.join(","));
  }
  if (!efter.markerade.length) fel.push("inga distrikt markerade efter bytet");
  if (efter.parti !== fore.parti) {
    fel.push("partiet ändrades av bytet: " + fore.parti + " blev " + efter.parti);
  }
  if (!/riksdagsvalet/.test(efter.rubrik)) {
    fel.push("tabellen nämner inte riksdagsvalet: " + efter.rubrik);
  }
  if (efter.varden.join("|") === fore.varden.join("|")) {
    fel.push("samma siffror i diagrammet efter bytet – datafilen byttes inte");
  }
  const url = new URL(page.url());
  if (url.searchParams.get("val") !== "riksdag") {
    fel.push("valet hamnade inte i adressen: " + page.url());
  }

  /* Bakåt i webbläsaren ska ta sidan tillbaka till kommunvalet. */
  await page.goBack({ waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    return /kommunvalet/.test(
      (document.querySelector("#tabell-distrikt caption") || {}).textContent || "");
  }, null, { timeout: 10000 }).catch(function () { /* bedöms nedan */ });
  const tillbaka = await lage();
  granskaDubbletter(tillbaka, "efter bakåtknappen");
  if (tillbaka.val !== "kommun") {
    fel.push("bakåtknappen tog inte tillbaka till kommunvalet (" + tillbaka.val + ")");
  }
  if (tillbaka.varden.join("|") !== fore.varden.join("|")) {
    fel.push("bakåtknappen gav inte tillbaka kommunvalets siffror");
  }

  /* Och framåt igen: bytet får inte lägga en ny post i historiken, för
     då äts posten användaren är på väg tillbaka till upp. */
  await page.goForward({ waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    return /riksdagsvalet/.test(
      (document.querySelector("#tabell-distrikt caption") || {}).textContent || "");
  }, null, { timeout: 10000 }).catch(function () { /* bedöms nedan */ });
  const framat = await lage();
  granskaDubbletter(framat, "efter framåtknappen");
  if (framat.val !== "riksdag") {
    fel.push("framåtknappen kom inte tillbaka till riksdagsvalet ("
      + framat.val + ")");
  }

  await page.close();
  return fel;
}

/* Diagrammet över de tre valen: samma parti och samma område, en linje
   per val. Det val som är valt högst upp ska ritas tjockare än de andra,
   och diagrammet ska visa andel också när måttet står på antal.
   Jämförelsen gäller bara de partier som ställer upp i alla tre valen, så
   ett lokalt parti och restposten ÖVR ska ge en förklaring i stället för
   en bild. */
async function granskaTreVal(browser, bas) {
  const fel = [];
  const page = await browser.newPage();
  page.on("pageerror", function (e) { fel.push("pageerror: " + e.message); });
  await stubbaGoatcounter(page);

  async function las(sida) {
    await page.goto(bas + "/" + sida, { waitUntil: "networkidle" });
    await page.waitForFunction(function () {
      return Chart.getChart(document.getElementById("diagram-tre-val"));
    }, null, { timeout: 10000 }).catch(function () { /* bedöms nedan */ });
    return page.evaluate(function () {
      const c = Chart.getChart(document.getElementById("diagram-tre-val"));
      const lage = {
        saknas: !c,
        kortDolt: document.getElementById("kort-tre-val").hidden,
        not: (document.getElementById("not-tre-val").textContent || "").trim(),
        kort: Array.prototype.slice.call(
          document.querySelectorAll("#kort-sagt-lista li")).map(function (li) {
            return li.textContent.trim();
          }),
        valjarkar: (document.getElementById("om-valjarkaren").textContent
          || "").trim(),
      };
      if (c) {
        lage.ytitel = c.options.scales.y.title.text;
        lage.serier = c.data.datasets.map(function (d) {
          return { namn: d.label, bredd: d.borderWidth, data: d.data };
        });
      }
      return lage;
    });
  }

  /* Riksdagsvalet valt: tre linjer, och riksdagens ska vara den tjocka. */
  const sd = await las("valresultat.html?val=riksdag&parti=sd");
  if (sd.saknas) {
    fel.push("diagrammet över de tre valen ritades aldrig");
  } else {
    if (sd.serier.length !== 3) {
      fel.push("förväntade tre val i diagrammet, fann " + sd.serier.length);
    }
    const tjock = sd.serier.filter(function (s) { return s.bredd > 2; });
    if (tjock.length !== 1 || tjock[0].namn !== "Riksdagen") {
      fel.push("det valda valet ritas inte tjockast: "
        + JSON.stringify(sd.serier.map(function (s) {
            return s.namn + " " + s.bredd;
          })));
    }
    if (!/väljarkår/.test(sd.valjarkar)) {
      fel.push("stycket om väljarkåren saknas");
    }
    if (!/riksdagsvalet/.test(sd.kort.join(" "))
        || !/kommunvalet/.test(sd.kort.join(" "))) {
      fel.push("\"Kort sagt\" ställer inte valen mot varandra: "
        + sd.kort.join(" | "));
    }
  }

  /* Antal i måttväljaren: det här diagrammet ska ändå visa andel. */
  const antal = await las("valresultat.html?parti=m&matt=antal");
  if (!/Andel/.test(antal.ytitel || "")) {
    fel.push("diagrammet följde med till antal: y-axeln säger "
      + antal.ytitel);
  }

  /* Kungsbackaborna ställer inte upp i riksdagsvalet: ingen bild alls,
     utan en förklaring – och den ska nämna de val partiet finns i. */
  const kbabo = await las("valresultat.html?parti=kbabo");
  if (!kbabo.saknas) {
    fel.push("Kungsbackaborna ritas i diagrammet trots att partiet inte "
      + "ställer upp i alla tre valen");
  } else {
    if (!kbabo.kortDolt) fel.push("det tomma diagrammet ligger kvar synligt");
    if (!/alla tre valen/.test(kbabo.not)
        || !/kommunvalet/.test(kbabo.not) || !/regionvalet/.test(kbabo.not)) {
      fel.push("noten förklarar inte vilka val partiet finns i: " + kbabo.not);
    }
  }

  /* Restposten rymmer olika partier i de tre valen och ska inte heller
     ritas. */
  const ovriga = await las("valresultat.html?parti=ovr");
  if (!ovriga.saknas) {
    fel.push("övriga partier ritas i diagrammet, trots att restposten "
      + "rymmer olika partier i de tre valen");
  } else if (!/restposten/.test(ovriga.not)) {
    fel.push("noten förklarar inte varför restposten utelämnas: " + ovriga.not);
  }

  /* Ett riksdagsparti ska få tillbaka bilden när man byter till det. */
  await page.selectOption("#valj-parti", "M");
  await page.waitForTimeout(400);
  const tillbaka = await page.evaluate(function () {
    return {
      ritat: !!Chart.getChart(document.getElementById("diagram-tre-val")),
      dolt: document.getElementById("kort-tre-val").hidden,
    };
  });
  if (!tillbaka.ritat || tillbaka.dolt) {
    fel.push("diagrammet kom inte tillbaka när partiet byttes till M");
  }

  /* I regionvalet, där Kungsbackaborna ställde upp förr men inte 2026,
     ska "Kort sagt" säga det i stället för att stå tom. */
  const iRegion = await las("valresultat.html?val=region&parti=kbabo");
  if (!iRegion.kort.length) {
    fel.push("\"Kort sagt\" är tom för ett parti utan tal i det senaste valet");
  } else if (!/fanns inte på/.test(iRegion.kort[0])) {
    fel.push("\"Kort sagt\" förklarar inte det saknade valet: "
      + iRegion.kort[0]);
  }

  await page.close();
  return fel;
}

/* Den gamla adressen kommunval.html ligger kvar som en sida som skickar
   besökaren vidare till valresultat.html – GitHub Pages kan inte svara
   med en omdirigering. Frågesträngen ska följa med, så att en delad länk
   landar i samma vy, och sidan ska duga också utan JavaScript. */
async function granskaFlyttad(browser, bas) {
  const fraga = "?parti=sd&distrikt=innerstaden";
  const fel = [];

  const page = await browser.newPage();
  page.on("pageerror", function (e) { fel.push("pageerror: " + e.message); });
  await stubbaGoatcounter(page);
  await page.goto(bas + "/kommunval.html" + fraga, { waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    return document.querySelector("#tabell-distrikt tbody tr");
  }, null, { timeout: 10000 }).catch(function () { /* bedöms nedan */ });

  const url = new URL(page.url());
  if (!url.pathname.endsWith("/valresultat.html")) {
    fel.push("skickades inte vidare: " + page.url());
  }
  if (url.search !== fraga) {
    fel.push("frågesträngen följde inte med: " + (url.search || "(tom)"));
  }
  const lage = await page.evaluate(function () {
    return {
      rader: document.querySelectorAll("#tabell-distrikt tbody tr").length,
      parti: (document.getElementById("valj-parti") || {}).value,
      val: (document.getElementById("valj-val") || {}).value,
    };
  });
  if (!lage.rader) fel.push("den nya sidan ritade ingen tabell");
  if (lage.parti !== "SD") fel.push("partiet ur länken gick förlorat: " + lage.parti);
  if (lage.val !== "kommun") {
    fel.push("en länk till den gamla sidan ska landa i kommunvalet, inte "
      + lage.val);
  }
  await page.close();

  /* Utan JavaScript sker ingen vidaresändning, och då är länken på sidan
     det enda som finns. Den måste peka rätt. */
  const utanJs = await browser.newContext({ javaScriptEnabled: false });
  const sida = await utanJs.newPage();
  await sida.goto(bas + "/kommunval.html" + fraga, { waitUntil: "load" });
  const utan = await sida.evaluate(function () {
    const a = document.getElementById("vidare");
    return {
      h1: document.querySelectorAll("h1").length,
      main: !!document.getElementById("huvudinnehall"),
      href: a ? a.getAttribute("href") : null,
    };
  });
  if (utan.h1 !== 1) fel.push("utan JavaScript: förväntade en h1, fann " + utan.h1);
  if (!utan.main) fel.push("utan JavaScript: huvudinnehåll saknas");
  if (utan.href !== "valresultat.html") {
    fel.push("utan JavaScript: länken pekar på " + utan.href);
  }
  await utanJs.close();

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
    console.log((fel.length ? "FEL " : "ok  ") + "valresultat.html (ett diagram per markerat distrikt)");
    fel.forEach(function (f) { console.log("     " + f); });
    antalFel += fel.length;
  }

  {
    const fel = await granskaHarkomst(browser, bas);
    console.log((fel.length ? "FEL " : "ok  ") + "valresultat.html (indikator bakåt för ett nytt distrikt)");
    fel.forEach(function (f) { console.log("     " + f); });
    antalFel += fel.length;
  }

  {
    const fel = await granskaValbyte(browser, bas);
    console.log((fel.length ? "FEL " : "ok  ") + "valresultat.html (byte av val)");
    fel.forEach(function (f) { console.log("     " + f); });
    antalFel += fel.length;
  }

  {
    const fel = await granskaTreVal(browser, bas);
    console.log((fel.length ? "FEL " : "ok  ") + "valresultat.html (partiet i de tre valen)");
    fel.forEach(function (f) { console.log("     " + f); });
    antalFel += fel.length;
  }

  {
    const fel = await granskaFlyttad(browser, bas);
    console.log((fel.length ? "FEL " : "ok  ") + "kommunval.html (gammal adress skickar vidare)");
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
