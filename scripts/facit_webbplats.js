/* Facit över sidornas renderade utfall.

   Laddar varje sida i Chromium, plockar ut allt sidan *räknat fram* och
   jämför mot ett incheckat facit i tests/facit/. Går något isär utan att
   någon menade det, faller kontrollen och skillnaden skrivs ut med sin
   väg in i strukturen.

   Det här är enda sättet att täcka sidskripten i befintligt skick: de
   exporterar ingenting och skriver rakt i DOM:en, så det finns inget att
   enhetstesta. Vad de *ritar* går däremot att låsa fast, och det är det
   som gör en omskrivning säker – jämför facit före och efter, och varje
   kvarvarande skillnad ska gå att peka på och förklara.

   Per sida plockas:
   - varje diagrams config.data och config.options, funktioner som källtext
   - de tickar och gränser Chart.js faktiskt räknade ut, inte bara indatan
   - varje tabell cell för cell
   - varje reglages alternativ och valda värde
   - varje id-satt elements markup och om det är dolt – därmed
     kort-sagt-lista, meta-rad, lista-kallor, kalla-*, not-* och
     slutsats-*, men också startsidans räknade kort

   Körs:  node scripts/facit_webbplats.js
   Skriv om facit efter en avsedd ändring:
          node scripts/facit_webbplats.js --skriv-om
   Kräver playwright. CHROMIUM_BIN pekar ut en egen Chromium-binär. */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROT = path.join(__dirname, "..");
const DOCS = path.join(ROT, "docs");
const FIXTURER = path.join(ROT, "tests", "fixtures", "data");
const FACIT = path.join(ROT, "tests", "facit");

const SKRIV_OM = process.argv.indexOf("--skriv-om") !== -1;

/* Klockan fryses i webbläsaren. fortidsrostning.js och index.js räknar ut
   vilken dag som pågår vid laddning via K.idagSv(), så deras facit skulle
   annars driva varje dygn. Tidpunkten hör ihop med fixturdatat: den ligger
   efter valdagen 2026-09-13, som är sista dagen i de frysta
   förtidsröstsiffrorna. Byts fixturerna ut ska den här flyttas med. */
const FRUSEN_TID = "2026-09-15T09:00:00+02:00";

/* Sidorna med de lägen som ska låsas fast. Frågesträngen är en del av
   läget: samma sida med ett annat val, parti eller mått är en annan bild
   och förtjänar ett eget facit.

   Listan står här och inte i smoke_webbplats.js, trots att sidorna är
   desamma: rök-testet behöver veta vilka sidor som *ritar diagram* för att
   kunna kräva det, medan facit bara behöver veta vilka lägen som finns.
   Att slå ihop dem vore en lista med två syften. */
const SIDOR = [
  /* Textsidorna ritar inga diagram och laddar inte ens Chart.js, men
     startsidans kort fylls med räknade sammanfattningar. */
  "index.html",
  "metod.html",

  "befolkningsprognos.html",
  "gymnasiealdern.html",
  "barn-och-unga.html",
  "varberg-befolkningsprognos.html",
  "varberg-gymnasiealdern.html",
  "varberg-barn-och-unga.html",
  "amnesbetyg.html",
  "kostnad-per-elev.html",
  "resurser-till-skolan.html",
  "nian-till-gymnasiet.html",
  "meritvarden.html",
  "slutbetyg.html",
  "antagning-till-examen.html",

  /* Förtidsröstningen: kommunen, ett län och riket. Bara de tre områdenas
     datafiler är frysta, medan områdeslistan är hel – väljarens 312
     alternativ är en del av utfallet. */
  "fortidsrostning.html",
  "fortidsrostning.html?omrade=hallands-lan",
  "fortidsrostning.html?omrade=hela-riket",

  "valresultat.html",
  "valresultat.html?parti=s&distrikt=innerstaden,hede&matt=antal",
  /* Tio markerade distrikt: fler än palettens åtta färger. */
  "valresultat.html?parti=m&distrikt=anneberg,bjorkris,fjaras-norra,fjaras-sodra," +
    "fors,frillesas-kust,gottskar,hammero,innerstaden,hede",
  "valresultat.html?parti=sd&distrikt=alla",
  "valresultat.html?parti=sd&distrikt=onsala-kyrka,innerstaden,anneberg",
  /* Distrikt som ritades upp först 2022 och har indikatorer bakåt. */
  "valresultat.html?parti=m&distrikt=kolla-norra,kolla-sodra",
  "valresultat.html?val=region",
  "valresultat.html?val=riksdag&parti=sd&distrikt=innerstaden,hede",
  /* Ett parti som bara finns i kommunvalet, i ett val där det inte
     ställer upp: sidan ska falla tillbaka på förvalet. */
  "valresultat.html?val=riksdag&parti=kbabo",
  /* Samma parti i ett val där det ställde upp förr men inte senast. */
  "valresultat.html?val=region&parti=kbabo&matt=antal",
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".csv": "text/csv; charset=utf-8",
};

/* Adressen kommer utifrån, så den får aldrig bli en sökväg rakt av: en
   begäran om /../../nyckel läses annars utanför roten. path.resolve
   normaliserar bort varje .. innan svaret, och därefter måste resultatet
   fortfarande ligga under roten – annars finns filen inte. */
function underRot(rot, relativ) {
  const fil = path.resolve(rot, "." + relativ);
  return fil === rot || fil.startsWith(rot + path.sep) ? fil : null;
}

/* Datafilerna serveras ur tests/fixtures/data/, aldrig ur docs/.
   Förtidsröstjobbet skriver om docs/data-fortidsroster/ två gånger om
   dygnet och pushar till main; kördes facit mot de riktiga filerna vore
   det rött inom ett dygn och avstängt inom en vecka. Sidorna märker
   ingenting – de begär samma adresser som vanligt. */
function fixturFor(url) {
  if (!/^\/data[^/]*\.json$/.test(url) && !/^\/data-fortidsroster\/[^/]+\.json$/.test(url)) {
    return null;
  }
  return underRot(FIXTURER, url);
}

function startaServer() {
  return new Promise(function (klar) {
    const server = http.createServer(function (req, res) {
      const url = decodeURIComponent(req.url.split("?")[0]);
      const fil = fixturFor(url) || underRot(DOCS, url === "/" ? "/index.html" : url);
      if (!fil || !fs.existsSync(fil) || !fs.statSync(fil).isFile()) {
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

/* Körs i sidan. Chart.js länkar tillbaka till diagrammet från flera håll
   och options är full av callbacks, så strukturen måste rensas innan den
   går att serialisera: funktioner blir källtext, cykler blir en markör.
   Chart finns inte på alla sidor – index.html och metod.html laddar inte
   biblioteket – så plockningen får aldrig förutsätta det. */
const PLOCK = function () {
  function rensa(v, sedda, djup) {
    if (typeof v === "function") return "fn:" + v.toString().replace(/\s+/g, " ");
    /* Flyttal avrundas: Chart.js räknar ut gränser och tickar, och
       sista biten skiljer sig mellan maskiner utan att bilden ändras. */
    if (typeof v === "number") {
      return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : String(v);
    }
    if (v === null || typeof v !== "object") return v;
    if (djup > 12) return "…djup";
    if (sedda.indexOf(v) !== -1) return "…cykel";
    if (v instanceof Date) return v.toISOString();
    /* Diagrammet självt hänger i konfigurationen; bara att det sitter där
       är intressant, inte hela dess inre. */
    if (v.canvas || v.chart || v.ctx) return "…diagramobjekt";
    const nasta = sedda.concat([v]);
    if (Array.isArray(v)) {
      return v.map(function (x) { return rensa(x, nasta, djup + 1); });
    }
    const ut = {};
    Object.keys(v).sort().forEach(function (k) { ut[k] = rensa(v[k], nasta, djup + 1); });
    return ut;
  }

  const diagram = [];
  Array.prototype.forEach.call(document.querySelectorAll("canvas"), function (c) {
    const ch = typeof Chart === "undefined" ? null : Chart.getChart(c);
    if (!ch) return;
    const skalor = {};
    Object.keys(ch.scales).sort().forEach(function (namn) {
      const s = ch.scales[namn];
      skalor[namn] = {
        min: s.min,
        max: s.max,
        tickar: (s.ticks || []).map(function (t) {
          return { varde: t.value, text: String(t.label) };
        }),
      };
    });
    diagram.push({
      id: c.id,
      data: rensa(ch.config.data, [], 0),
      options: rensa(ch.config.options, [], 0),
      skalor: rensa(skalor, [], 0),
    });
  });

  const tabeller = Array.prototype.map.call(document.querySelectorAll("table"), function (t) {
    return {
      id: t.id || null,
      caption: t.caption ? t.caption.textContent : null,
      rader: Array.prototype.map.call(t.rows, function (r) {
        return Array.prototype.map.call(r.cells, function (c) {
          return { text: c.textContent, tagg: c.tagName, scope: c.getAttribute("scope") };
        });
      }),
    };
  });

  /* All text sidan räknat fram, inte en handskriven lista över id:n.
     En sådan lista missade startsidan helt: dess kort fylls i under
     fakta-* och undertext-*, som ingen av de uppräknade väljarna nådde,
     och facit såg täckt ut medan det var tomt.

     Regeln i stället: varje element med ett id, plus meta-raden. De som
     innehåller en tabell, ett diagram eller ett annat id-satt element
     bidrar bara med om de är dolda – deras innehåll fångas redan på annat
     håll, och att ta med det igen skulle dubblera facit utan att täcka
     något nytt. Övriga bidrar med sin markup, så att en ändrad länk i en
     källhänvisning syns och inte bara ändrad text.

     Dolt-läget hör hit: sektion-*, varning och status visas eller göms
     efter vad datat säger, och en sektion som tyst slutar visas är precis
     en sådan regression facit ska fånga. */
  const text = {};
  function anteckna(nyckel, n) {
    const sammansatt = n.querySelector("table, canvas, [id]") !== null;
    text[nyckel] = sammansatt
      ? { dold: n.hidden, innehall: "…tabell, diagram eller egna id:n" }
      : { dold: n.hidden, html: n.innerHTML };
  }
  Array.prototype.forEach.call(document.querySelectorAll("[id]"), function (n) {
    anteckna("#" + n.id, n);
  });
  Array.prototype.forEach.call(document.querySelectorAll(".meta-rad"), function (n, i) {
    anteckna(".meta-rad[" + (n.id || i) + "]", n);
  });

  /* Reglagen hör till utfallet. En väljare som fylls på i stället för att
     fyllas om växer varje gång den rörs – precis den bugg som låg ute med
     grön CI hela tiden, eftersom ingen kontroll läste av alternativen. */
  const reglage = Array.prototype.map.call(document.querySelectorAll("select"), function (s) {
    return {
      id: s.id,
      varde: s.value,
      alternativ: Array.prototype.map.call(s.options, function (o) {
        return o.value + "=" + o.textContent;
      }),
    };
  });

  return { diagram: diagram, tabeller: tabeller, text: text, reglage: reglage };
};

/* Kanonisk JSON: nycklarna i bokstavsordning hela vägen ned, så att en
   diff visar innehållsskillnader och inte iterationsordning. */
function kanoniskt(v) {
  if (Array.isArray(v)) return v.map(kanoniskt);
  if (v && typeof v === "object") {
    const ut = {};
    Object.keys(v).sort().forEach(function (k) { ut[k] = kanoniskt(v[k]); });
    return ut;
  }
  return v;
}

function facitfil(sida) {
  return path.join(FACIT, sida.replace(/[^a-z0-9]+/gi, "_") + ".json");
}

/* Första skillnaderna med sin väg in i strukturen. En rå textdiff av
   50 000 rader JSON säger inte vad som ändrats; "diagram[2].data
   .datasets[0].data[7]: 41,2 → 41,3" gör det. */
function skillnader(vantat, fick, vag, ut) {
  if (ut.length >= 10) return ut;
  const a = JSON.stringify(vantat);
  const b = JSON.stringify(fick);
  if (a === b) return ut;
  const bada = vantat && fick && typeof vantat === "object" && typeof fick === "object" &&
    Array.isArray(vantat) === Array.isArray(fick);
  if (bada) {
    const nycklar = Object.keys(vantat).concat(Object.keys(fick))
      .filter(function (k, i, alla) { return alla.indexOf(k) === i; }).sort();
    nycklar.forEach(function (k) {
      const stig = Array.isArray(vantat) ? vag + "[" + k + "]" : vag + "." + k;
      if (!(k in vantat)) ut.push(stig + ": saknas i facit, sidan gav " + kort(fick[k]));
      else if (!(k in fick)) ut.push(stig + ": finns i facit, sidan gav ingenting");
      else skillnader(vantat[k], fick[k], stig, ut);
    });
    return ut;
  }
  ut.push(vag + ": facit " + kort(vantat) + " → sidan " + kort(fick));
  return ut;
}

function kort(v) {
  const s = JSON.stringify(v);
  return s === undefined ? "undefined" : s.length > 90 ? s.slice(0, 90) + "…" : s;
}

async function plocka(browser, bas, sida) {
  const page = await browser.newPage();
  const fel = [];
  page.on("pageerror", function (e) { fel.push("pageerror: " + e.message); });
  await page.clock.setFixedTime(new Date(FRUSEN_TID));
  await stubbaGoatcounter(page);
  await page.goto(bas + "/" + sida, { waitUntil: "networkidle" });
  /* "networkidle" kan infalla innan sidan hunnit rita: vänta in en
     tabellrad eller sidans felruta i stället för en fast tid. */
  await page.waitForFunction(function () {
    const s = document.getElementById("status");
    return document.querySelector("table tbody tr") || (s && !s.hidden) ||
      document.readyState === "complete";
  }, null, { timeout: 15000 }).catch(function () { /* bedöms av innehållet */ });
  /* Chart.js räknar ut skalor i en animationsram; utan den saknar de tickar. */
  await page.waitForTimeout(500);
  const ut = await page.evaluate(PLOCK);
  await page.close();
  if (fel.length) throw new Error(sida + ": " + fel.join("; "));
  return kanoniskt(ut);
}

(async function () {
  const server = await startaServer();
  const bas = "http://127.0.0.1:" + server.address().port;
  const exe = process.env.CHROMIUM_BIN;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});

  fs.mkdirSync(FACIT, { recursive: true });
  let avvikande = 0;

  for (const sida of SIDOR) {
    const fick = await plocka(browser, bas, sida);
    const fil = facitfil(sida);
    const text = JSON.stringify(fick, null, 1) + "\n";

    if (SKRIV_OM) {
      const fanns = fs.existsSync(fil) && fs.readFileSync(fil, "utf-8") === text;
      fs.writeFileSync(fil, text);
      console.log((fanns ? "=   " : "nytt ") + sida);
      continue;
    }
    if (!fs.existsSync(fil)) {
      console.log("SAKNAS " + sida + " – inget facit; kör med --skriv-om");
      avvikande++;
      continue;
    }
    const vantat = JSON.parse(fs.readFileSync(fil, "utf-8"));
    const diff = skillnader(vantat, fick, "", []);
    if (diff.length) {
      console.log("SKILJER " + sida);
      diff.forEach(function (d) { console.log("     " + d); });
      avvikande++;
    } else {
      console.log("ok  " + sida);
    }
  }

  await browser.close();
  server.close();

  if (SKRIV_OM) {
    console.log("\nFacit omskrivet för " + SIDOR.length + " sidlägen. Granska diffen.");
    return;
  }
  if (avvikande) {
    console.error("\n" + avvikande + " sidlägen skiljer sig från facit.");
    console.error("Är skillnaden avsedd: node scripts/facit_webbplats.js --skriv-om");
    process.exit(1);
  }
  console.log("\nAlla " + SIDOR.length + " sidlägen stämmer med facit.");
})();
