/* Interaktionstester: reglagen, adressraden, bakåt och framåt.

   Rök-testet och facit granskar sidorna som de *laddas*. Den här granskar
   dem som de *används*, och det är skillnaden som lät partiväljarbuggen
   ligga ute: valresultatsidans partiväljare växte från 10 alternativ till
   49 när valet byttes fram och tillbaka, med Moderaterna fem gånger i
   listan. Samtliga kontroller var gröna hela tiden. Ingen av dem rörde ett
   reglage.

   Roten satt i en delad funktion, K.fyllValjare, så felet kunde lika
   gärna ha slagit på slutbetygssidan. Därför gäller kontrollerna här alla
   sidor med reglage, inte bara den där buggen råkade synas.

   Per sida:
   - varje reglage ställs om och tillbaka; efter rundturen ska både
     reglagen och det ritade vara exakt som vid start
   - ingen <select> får någonsin ha samma alternativ två gånger, avläst
     efter varje steg och på hela sidan – inte bara den väljare som rördes
   - adressraden ska spegla läget, och en delad länk ge samma vy
   - bakåt ska ge tillbaka föregående läge fullt ut, och inte kräva två
     tryck för ett byte

   Körs mot fixturdatat via testserver.js, aldrig mot levande data.

   Körs:  node scripts/interaktion_webbplats.js
   Kräver playwright. CHROMIUM_BIN pekar ut en egen Chromium-binär. */

"use strict";

const { chromium } = require("playwright");
const { startaServer, nySida } = require("./testserver");

/* Sidorna med reglage. Väljare med många alternativ provas i urval –
   först, mitten och sist – medan de korta provas i sin helhet. Att köra
   312 områden vore en halvtimme utan att pröva något nytt. */
const SIDOR = [
  "befolkningsprognos.html",
  "gymnasiealdern.html",
  "varberg-befolkningsprognos.html",
  "varberg-gymnasiealdern.html",
  "amnesbetyg.html",
  "kostnad-per-elev.html",
  "nian-till-gymnasiet.html",
  "platser.html",
  "meritvarden.html",
  "slutbetyg.html",
  "antagning-till-examen.html",
  "fortidsrostning.html",
  "valresultat.html",
  "fullmaktige.html",
];

/* Hur många alternativ per väljare som provas. Fler ger inte mer: det som
   ska fångas är att omfyllningen ersätter i stället för att lägga till,
   och det syns redan vid andra bytet. */
const MAX_ALTERNATIV = 4;

/* Läget på sidan: reglagen, och tillräckligt av det ritade för att en
   rundtur ska gå att jämföra. Diagrammens siffror och tabellernas text
   räcker – hela facit vore för trubbigt att jämföra steg för steg, och
   det jobbet gör facit_webbplats.js. */
const LAGE = function () {
  const valjare = Array.prototype.map.call(document.querySelectorAll("select"), function (s) {
    return {
      id: s.id,
      varde: s.value,
      alternativ: Array.prototype.map.call(s.options, function (o) { return o.value; }),
      etiketter: Array.prototype.map.call(s.options, function (o) { return o.textContent; }),
    };
  });
  const kryss = Array.prototype.map.call(
    document.querySelectorAll("input[type=checkbox]"), function (i) {
      return i.value + (i.checked ? ":i" : ":ur");
    });
  const diagram = Array.prototype.map.call(document.querySelectorAll("canvas"), function (c) {
    const ch = typeof Chart === "undefined" ? null : Chart.getChart(c);
    if (!ch) return c.id + ":inget";
    return c.id + ":" + ch.config.data.datasets.map(function (d) {
      return (d.label || "") + "=" + (d.data || []).join(",");
    }).join("|");
  });
  const tabeller = Array.prototype.map.call(document.querySelectorAll("table"), function (t) {
    return (t.id || "") + ":" + Array.prototype.map.call(t.rows, function (r) {
      return Array.prototype.map.call(r.cells, function (c) { return c.textContent; }).join("");
    }).join("");
  });
  return {
    valjare: valjare,
    kryss: kryss,
    diagram: diagram,
    tabeller: tabeller,
    sok: location.search,
  };
};

/* Ingen <select> får ha samma alternativ två gånger. Läses av på hela
   sidan efter varje steg: buggen satt i en delad funktion, så väljaren som
   rördes är inte nödvändigtvis den som går sönder. */
function granskaDubbletter(lage, nar, fel) {
  lage.valjare.forEach(function (v) {
    const sedda = Object.create(null);
    const dubbla = [];
    v.alternativ.forEach(function (x) {
      if (sedda[x] && dubbla.indexOf(x) === -1) dubbla.push(x);
      sedda[x] = true;
    });
    if (dubbla.length) {
      fel.push("#" + v.id + " har dubbla alternativ " + nar + ": " + dubbla.join(", ") +
        " (" + v.alternativ.length + " alternativ totalt)");
    }
  });
}

function likaLagen(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* Samma vy, oavsett vad som står i adressen. En rundtur fram och tillbaka
   lämnar adressen med det uttryckliga valet i stället för tom – sidan
   började på "inget val gjort" och slutar på "valt just det som ändå var
   förvalt". Det är en delbar länk, inte en förändrad sida, och att kräva
   tom adress igen vore att kräva att sidan glömmer. Att adressen speglar
   valet, och att länken ger samma vy, prövas i granskaAdressOchHistorik. */
function sammaVy(a, b) {
  return JSON.stringify({ valjare: a.valjare, kryss: a.kryss, diagram: a.diagram, tabeller: a.tabeller }) ===
    JSON.stringify({ valjare: b.valjare, kryss: b.kryss, diagram: b.diagram, tabeller: b.tabeller });
}

/* Var två lägen skiljer sig, i klartext. */
function beskrivSkillnad(fore, efter) {
  const delar = [];
  ["valjare", "kryss", "diagram", "tabeller"].forEach(function (nyckel) {
    const a = JSON.stringify(fore[nyckel]);
    const b = JSON.stringify(efter[nyckel]);
    if (a !== b) {
      if (nyckel === "valjare") {
        fore.valjare.forEach(function (v, i) {
          const e = efter.valjare[i];
          if (!e) { delar.push("väljaren #" + v.id + " försvann"); return; }
          if (v.varde !== e.varde) delar.push("#" + v.id + " står på " + e.varde + " i stället för " + v.varde);
          if (v.alternativ.length !== e.alternativ.length) {
            delar.push("#" + v.id + " har " + e.alternativ.length + " alternativ i stället för " +
              v.alternativ.length);
          } else if (JSON.stringify(v.alternativ) !== JSON.stringify(e.alternativ)) {
            delar.push("#" + v.id + " har bytt ordning eller innehåll på sina alternativ");
          }
        });
      } else {
        delar.push(nyckel + " skiljer sig");
      }
    }
  });
  return delar.length ? delar.join("; ")
    : "okänd skillnad (adressen: " + (efter.sok || "tom") + ")";
}

/* Sidan ritar om sig själv i en händelse; vänta in att det lugnat sig.
   Chart.js räknar dessutom ut sina skalor i en animationsram. */
async function lugn(page) {
  await page.waitForTimeout(350);
}

function urval(alternativ) {
  if (alternativ.length <= MAX_ALTERNATIV) return alternativ.slice();
  const mitt = Math.floor(alternativ.length / 2);
  return [alternativ[0], alternativ[1], alternativ[mitt], alternativ[alternativ.length - 1]];
}

async function granskaSida(browser, bas, sida) {
  const fel = [];
  const page = await nySida(browser);
  page.on("pageerror", function (e) { fel.push("pageerror: " + e.message); });
  await page.goto(bas + "/" + sida, { waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    const s = document.getElementById("status");
    return document.querySelector("table tbody tr") || (s && !s.hidden);
  }, null, { timeout: 15000 }).catch(function () { /* bedöms nedan */ });
  await lugn(page);

  const start = await page.evaluate(LAGE);
  granskaDubbletter(start, "vid start", fel);
  if (!start.valjare.length) {
    fel.push("sidan sägs ha reglage men har ingen <select>");
    await page.close();
    return fel;
  }

  for (const v of start.valjare) {
    const fore = await page.evaluate(LAGE);
    const denna = fore.valjare.filter(function (x) { return x.id === v.id; })[0];
    if (!denna || denna.alternativ.length < 2) continue;

    for (const alt of urval(denna.alternativ)) {
      if (alt === denna.varde) continue;
      await page.selectOption("#" + v.id, alt);
      await lugn(page);
      const efter = await page.evaluate(LAGE);
      granskaDubbletter(efter, "efter att #" + v.id + " ställts på " + alt, fel);

      /* Adressraden ska spegla läget. Alla väljare utom valresultatsidans
         valväljare kopplas via K.kopplaValjare, som skriver in värdet;
         valväljaren skriver in sig själv i byteAvVal. Nyckeln i adressen
         heter inte alltid som id:t, så det räcker att värdet står där i
         någon form – kravet är att en delad länk ger samma vy, och det
         provas nedan. */
      const valt = efter.valjare.filter(function (x) { return x.id === v.id; })[0];
      if (valt.varde !== alt) {
        fel.push("#" + v.id + " ställdes på " + alt + " men står på " + valt.varde);
      }
    }

    /* Tillbaka till utgångsläget: rundturen ska inte lämna spår. */
    await page.selectOption("#" + v.id, denna.varde);
    await lugn(page);
    const tillbaka = await page.evaluate(LAGE);
    granskaDubbletter(tillbaka, "efter rundturen i #" + v.id, fel);
    if (!sammaVy(fore, tillbaka)) {
      fel.push("rundturen i #" + v.id + " lämnade sidan förändrad: " +
        beskrivSkillnad(fore, tillbaka));
    }
  }

  await page.close();
  return fel;
}

/* En delad länk ska ge samma vy som att klicka sig dit, och bakåtknappen
   ska ge tillbaka föregående läge fullt ut – inte bara reglaget. */
async function granskaAdressOchHistorik(browser, bas, sida, valjarId) {
  const fel = [];
  const page = await nySida(browser);
  page.on("pageerror", function (e) { fel.push("pageerror: " + e.message); });
  await page.goto(bas + "/" + sida, { waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    return document.querySelector("table tbody tr");
  }, null, { timeout: 15000 }).catch(function () { /* bedöms nedan */ });
  await lugn(page);

  const start = await page.evaluate(LAGE);
  const denna = start.valjare.filter(function (x) { return x.id === valjarId; })[0];
  if (!denna || denna.alternativ.length < 2) {
    await page.close();
    return fel;
  }
  const nytt = denna.alternativ.filter(function (a) { return a !== denna.varde; })[0];

  await page.selectOption("#" + valjarId, nytt);
  await lugn(page);
  const klickat = await page.evaluate(LAGE);
  if (klickat.sok === start.sok) {
    fel.push(sida + ": #" + valjarId + " ändrades men adressen står kvar på " +
      (start.sok || "tom"));
  }

  /* Samma adress i en ny flik ska ge samma vy. */
  const delad = await nySida(browser);
  await delad.goto(bas + "/" + sida.split("?")[0] + klickat.sok, { waitUntil: "networkidle" });
  await delad.waitForFunction(function () {
    return document.querySelector("table tbody tr");
  }, null, { timeout: 15000 }).catch(function () { /* bedöms nedan */ });
  await lugn(delad);
  const frånLank = await delad.evaluate(LAGE);
  await delad.close();
  if (!sammaVy(klickat, frånLank)) {
    fel.push(sida + ": den delade länken " + klickat.sok + " ger en annan vy än att klicka sig dit: " +
      beskrivSkillnad(klickat, frånLank));
  }

  /* Ett byte ska kosta exakt ett tryck bakåt. */
  await page.goBack();
  await lugn(page);
  const bakat = await page.evaluate(LAGE);
  granskaDubbletter(bakat, "efter bakåtknappen på " + sida, fel);
  if (!sammaVy(start, bakat)) {
    fel.push(sida + ": bakåtknappen gav inte tillbaka utgångsläget: " +
      beskrivSkillnad(start, bakat));
  }

  await page.goForward();
  await lugn(page);
  const framat = await page.evaluate(LAGE);
  granskaDubbletter(framat, "efter framåtknappen på " + sida, fel);
  if (!sammaVy(klickat, framat)) {
    fel.push(sida + ": framåtknappen gav inte tillbaka det valda läget: " +
      beskrivSkillnad(klickat, framat));
  }

  await page.close();
  return fel;
}

/* Valresultatsidans egna fall: valbytet fyller om flera väljare på en
   gång, och det var där partiväljaren växte. Ett parti som inte ställer
   upp i det valda valet, och ett urval av distrikt som ändras, hör till
   samma reglagefamilj. */
async function granskaValbyten(browser, bas) {
  const fel = [];
  const page = await nySida(browser);
  page.on("pageerror", function (e) { fel.push("pageerror: " + e.message); });
  await page.goto(bas + "/valresultat.html", { waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    return document.querySelector("#tabell-distrikt tbody tr");
  }, null, { timeout: 15000 }).catch(function () { /* bedöms nedan */ });
  await lugn(page);

  const start = await page.evaluate(LAGE);
  granskaDubbletter(start, "vid start på valresultat.html", fel);

  /* Fram och tillbaka mellan alla tre valen, två varv. Buggen syntes först
     vid andra bytet: 10 alternativ blev 20 blev 49. */
  const val = ["riksdag", "region", "kommun", "riksdag", "region", "kommun"];
  for (const v of val) {
    await page.selectOption("#valj-val", v);
    await lugn(page);
    const lage = await page.evaluate(LAGE);
    granskaDubbletter(lage, "efter bytet till " + v, fel);
    const parti = lage.valjare.filter(function (x) { return x.id === "valj-parti"; })[0];
    const start_ = start.valjare.filter(function (x) { return x.id === "valj-parti"; })[0];
    if (v === "kommun" && parti && start_ && parti.alternativ.length !== start_.alternativ.length) {
      fel.push("partiväljaren har " + parti.alternativ.length +
        " alternativ tillbaka i kommunvalet, men hade " + start_.alternativ.length + " vid start");
    }
  }

  const slut = await page.evaluate(LAGE);
  const slutParti = slut.valjare.filter(function (x) { return x.id === "valj-parti"; })[0];
  const startParti = start.valjare.filter(function (x) { return x.id === "valj-parti"; })[0];
  if (slutParti && startParti && !likaLagen(slutParti.alternativ, startParti.alternativ)) {
    fel.push("partiväljaren är inte densamma efter sex valbyten: " +
      startParti.alternativ.length + " → " + slutParti.alternativ.length + " alternativ");
  }

  await page.close();
  return fel;
}

/* Vilka reglage sidan faktiskt har. Läses av sidan själv i stället för
   att räknas upp här: en ny väljare ska omfattas utan att någon minns
   att fylla på en lista. */
async function valjarnaPa(browser, bas, sida) {
  const page = await nySida(browser);
  await page.goto(bas + "/" + sida, { waitUntil: "networkidle" });
  await page.waitForFunction(function () {
    const s = document.getElementById("status");
    return document.querySelector("table tbody tr") || (s && !s.hidden);
  }, null, { timeout: 15000 }).catch(function () { /* bedöms i granskaSida */ });
  await lugn(page);
  const ider = await page.evaluate(function () {
    return Array.prototype.filter.call(document.querySelectorAll("select"), function (s) {
      return s.id && s.options.length > 1;
    }).map(function (s) { return s.id; });
  });
  await page.close();
  return ider;
}

(async function () {
  const server = await startaServer();
  const bas = "http://127.0.0.1:" + server.address().port;
  const exe = process.env.CHROMIUM_BIN;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});

  let antalFel = 0;
  function rapportera(namn, fel) {
    console.log((fel.length ? "FEL " : "ok  ") + namn);
    fel.forEach(function (f) { console.log("     " + f); });
    antalFel += fel.length;
  }

  for (const sida of SIDOR) {
    rapportera(sida, await granskaSida(browser, bas, sida));
  }

  /* Adress och historik provas för *varje* reglage, inte ett per sida.
     Ett urval hade nästan missat kostnadssidan: där ritades sidan innan
     måttväljaren kopplats till adressen, så en delad ?matt=-länk visade
     förvalets siffror med det delade måttet i väljaren. Sådant sitter i
     ett enskilt reglage, inte i sidan som helhet. */
  for (const sida of SIDOR) {
    for (const valjare of await valjarnaPa(browser, bas, sida)) {
      rapportera(sida + " · " + valjare + " (adress, bakåt, framåt)",
        await granskaAdressOchHistorik(browser, bas, sida, valjare));
    }
  }

  rapportera("valresultat.html · sex valbyten", await granskaValbyten(browser, bas));

  await browser.close();
  server.close();

  if (antalFel) {
    console.error("\n" + antalFel + " problem med reglagen.");
    process.exit(1);
  }
  console.log("\nReglagen tål att användas.");
})();
