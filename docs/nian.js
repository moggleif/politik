/* Från nian till gymnasiet — Kungsbacka kommun.
   Tre mätpunkter på samma årtal: slutbetyget i årskurs 9 år X,
   genomströmningen för dem som började gymnasiet hösten år X, och
   avgångsbetygen år X+3. Måtten har olika skalor (meritvärde 0–340,
   andelar 0–100 %, betygspoäng 0–20) och visas därför aldrig i samma
   diagram. Läser docs/data-nian-gymnasiet.json, byggd av
   scripts/build_nian_gymnasiet.py. */
(function () {
  "use strict";

  var K = window.KIS;
  var FARG = K.FARG;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;
  var sakerUrl = K.sakerUrl;

  var DATAFIL = "data-nian-gymnasiet.json";
  var DATA = null;
  var charts = {};

  function pct(v, dec) {
    return v === null || v === undefined ? ".." : talSv(v, dec === undefined ? 1 : dec) + " %";
  }
  function num(v, dec) {
    return v === null || v === undefined ? ".." : talSv(v, dec === undefined ? 1 : dec);
  }

  /* Gemensamma diagraminställningar. `ytitel` namnger enheten, så att
     ingen ska behöva gissa vilken skala en panel har. */
  function linjeOptions(ytitel, nollstall, formatera) {
    return {
      maintainAspectRatio: false,
      responsive: true,
      locale: "sv-SE",
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, position: "bottom",
                  labels: { boxWidth: 22, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: function (it) {
              return it.dataset.label + ": " +
                (it.parsed.y === null ? ".." : formatera(it.parsed.y));
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { color: FARG.baseline },
             ticks: { autoSkip: true, autoSkipPadding: 16, maxRotation: 0 } },
        y: { beginAtZero: !!nollstall,
             title: { display: true, text: ytitel, color: FARG.muted },
             grid: { color: FARG.grid }, border: { display: false } }
      }
    };
  }

  function linje(etikett, varden, i, bredd) {
    var stil = K.serieStil(i);
    return {
      label: etikett, data: varden,
      borderColor: stil.farg, backgroundColor: stil.farg,
      borderWidth: bredd || 2, borderDash: stil.streck,
      pointStyle: stil.punkt, pointRadius: 3, pointHoverRadius: 6,
      pointBorderColor: FARG.surface, pointBorderWidth: 1,
      spanGaps: false, tension: 0.1
    };
  }

  function rita(id, konfig) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(el(id), konfig);
    return charts[id];
  }

  function hojd(id, px) { el(id).parentElement.style.height = px + "px"; }

  function sistaMed(serie, falt) {
    for (var i = serie.length - 1; i >= 0; i--) {
      if (serie[i][falt] !== null && serie[i][falt] !== undefined) return serie[i];
    }
    return null;
  }
  function forstaMed(serie, falt) {
    for (var i = 0; i < serie.length; i++) {
      if (serie[i][falt] !== null && serie[i][falt] !== undefined) return serie[i];
    }
    return null;
  }

  /* ---------- 1. Nian ---------- */

  function ritaMerit() {
    var serie = DATA.nian;
    var ar = serie.map(function (p) { return p.ar; });
    var brott = DATA.meritamnenBrott;

    /* 16 och 17 ämnen mäter olika saker och får inte bindas ihop av en
       linje. De ritas som två serier över samma x-axel; året före
       brottet tas med i båda så att det syns var bytet skedde. */
    function del(amnen) {
      return serie.map(function (p) {
        return p.meritamnen === amnen ? p.meritvarde : null;
      });
    }
    var datasets = [];
    var har16 = serie.some(function (p) { return p.meritamnen === 16; });
    if (har16) datasets.push(linje("Meritvärde, 16 ämnen", del(16), 0, 3));
    datasets.push(linje("Meritvärde, 17 ämnen", del(17), 1, 3));

    hojd("diagram-merit", 340);
    rita("diagram-merit", {
      type: "line",
      data: { labels: ar.map(String), datasets: datasets },
      options: linjeOptions("Meritvärde (max " + DATA.meritMax + ")", false,
        function (v) { return talSv(v, 1); })
    });

    K.sattDataNot("not-merit", brott
      ? "Meritvärdet räknades över <strong>16 ämnen</strong> till och med " +
        "läsåret " + esc(lasarNian(brott - 1)) + " och över <strong>17 ämnen</strong> " +
        "från och med " + esc(lasarNian(brott)) + ". Hoppet mellan de åren är en " +
        "följd av regeländringen, inte av bättre betyg &ndash; därför två linjer."
      : "");
  }

  function lasarNian(ar) {
    for (var i = 0; i < DATA.nian.length; i++) {
      if (DATA.nian[i].ar === ar) return DATA.nian[i].lasar;
    }
    return String(ar);
  }

  function ritaBehorighet() {
    var serie = DATA.nian;
    hojd("diagram-behorighet", 340);
    rita("diagram-behorighet", {
      type: "line",
      data: {
        labels: serie.map(function (p) { return String(p.ar); }),
        datasets: [
          linje("Behöriga till yrkesprogram",
            serie.map(function (p) { return p.andelBehorigYrkes; }), 0, 3),
          linje("Godkänt i alla ämnen",
            serie.map(function (p) { return p.andelAllaAmnen; }), 2, 2)
        ]
      },
      options: linjeOptions("Andel av eleverna (%)", false,
        function (v) { return talSv(v, 1) + " %"; })
    });

    var f = DATA.nian[0], s = DATA.nian[DATA.nian.length - 1];
    var diff = s.andelBehorigYrkes - f.andelBehorigYrkes;
    el("kalla-nian").textContent =
      "Källa: Skolverket, slutbetyg i årskurs 9, läsåren " + f.lasar + "–" +
      s.lasar + ". Urval: samtliga elever utom nyinvandrade och elever med " +
      "okänd bakgrund.";
    el("slutsats-nian").innerHTML =
      "<p>Andelen niondeklassare i Kungsbacka som var behöriga till " +
      "gymnasiets yrkesprogram har gått från <strong>" +
      pct(f.andelBehorigYrkes) + "</strong> läsåret " + esc(f.lasar) + " till <strong>" +
      pct(s.andelBehorigYrkes) + "</strong> läsåret " + esc(s.lasar) + " &ndash; " +
      (diff < 0 ? "en minskning" : "en ökning") + " med " +
      talSv(Math.abs(diff), 1) + " procentenheter. Andelen med godkänt i " +
      "samtliga ämnen var " + pct(s.andelAllaAmnen) + " det sista läsåret.</p>";

    el("tabell-nian").innerHTML =
      "<thead><tr><th scope=\"col\">Läsår</th><th scope=\"col\">Elever</th>" +
      "<th scope=\"col\">Meritvärde</th><th scope=\"col\">Ämnen i meritvärdet</th>" +
      "<th scope=\"col\">Behöriga till yrkesprogram</th>" +
      "<th scope=\"col\">Godkänt i alla ämnen</th></tr></thead><tbody>" +
      DATA.nian.map(function (p) {
        return "<tr><th scope=\"row\">" + esc(p.lasar) + "</th><td>" +
          (p.antal === null ? ".." : talSv(p.antal)) + "</td><td>" +
          num(p.meritvarde) + "</td><td>" + esc(p.meritamnen) + "</td><td>" +
          pct(p.andelBehorigYrkes) + "</td><td>" + pct(p.andelAllaAmnen) +
          "</td></tr>";
      }).join("") + "</tbody>";
  }

  /* ---------- 2. Gymnasiet ---------- */

  function ritaGenomstromning() {
    var serie = DATA.start;
    hojd("diagram-genomstromning", 340);
    rita("diagram-genomstromning", {
      type: "line",
      data: {
        labels: serie.map(function (p) { return String(p.ar); }),
        datasets: [
          linje("Nationella program, inom 3 år",
            serie.map(function (p) { return p.examen3; }), 0, 3),
          linje("Nationella program, inom 4 år",
            serie.map(function (p) { return p.examen4; }), 1, 2),
          linje("Nationella program, inom 5 år",
            serie.map(function (p) { return p.examen5; }), 2, 2),
          linje("Hela gymnasieskolan, inom 3 år",
            serie.map(function (p) {
              return p.totalt ? p.totalt.examen3 : null;
            }), 3, 2)
        ]
      },
      options: linjeOptions("Andel med examen (%)", false,
        function (v) { return talSv(v, 1) + " %"; })
    });
  }

  function ritaPoang() {
    var serie = DATA.examen;
    hojd("diagram-poang", 340);
    rita("diagram-poang", {
      type: "line",
      data: {
        labels: serie.map(function (p) { return String(p.ar); }),
        datasets: [
          linje("Alla avgångselever",
            serie.map(function (p) { return p.betygspoang; }), 0, 3),
          linje("Bara de med examen",
            serie.map(function (p) { return p.betygspoangExamen; }), 1, 2)
        ]
      },
      options: linjeOptions("Betygspoäng (max " + DATA.poangMax + ")", false,
        function (v) { return talSv(v, 1); })
    });
  }

  function ritaExamen() {
    var serie = DATA.examen;
    hojd("diagram-examen", 340);
    rita("diagram-examen", {
      type: "line",
      data: {
        labels: serie.map(function (p) { return String(p.ar); }),
        datasets: [
          linje("Med gymnasieexamen",
            serie.map(function (p) { return p.andelExamen; }), 0, 3),
          linje("Med grundläggande högskolebehörighet",
            serie.map(function (p) { return p.andelGrundlBehorighet; }), 2, 2)
        ]
      },
      options: linjeOptions("Andel av avgångseleverna (%)", false,
        function (v) { return talSv(v, 1) + " %"; })
    });

    var s0 = DATA.start[0], s1 = sistaMed(DATA.start, "examen3");
    var e0 = DATA.examen[0], e1 = DATA.examen[DATA.examen.length - 1];
    el("kalla-gymnasiet").textContent =
      "Källa: Skolverket. Genomströmning för startläsåren " + s0.lasar + "–" +
      DATA.start[DATA.start.length - 1].lasar + ", avgångselever läsåren " +
      e0.lasar + "–" + e1.lasar + ".";
    el("slutsats-gymnasiet").innerHTML =
      "<p>Av dem som började ett nationellt program hösten " + esc(s0.ar) +
      " hade <strong>" + pct(s0.examen3) + "</strong> examen efter tre år. " +
      "För dem som började " + esc(s1.ar) + " var andelen <strong>" +
      pct(s1.examen3) + "</strong>. Bland avgångseleverna " + esc(e1.ar) +
      " var betygspoängen <strong>" + num(e1.betygspoang) + "</strong> av " +
      esc(DATA.poangMax) + " och <strong>" + pct(e1.andelExamen) +
      "</strong> fick en gymnasieexamen.</p>";

    el("tabell-gymnasiet").innerHTML =
      "<thead><tr><th scope=\"col\">År</th>" +
      "<th scope=\"col\">Nybörjare (nationella program)</th>" +
      "<th scope=\"col\">Examen inom 3 år</th><th scope=\"col\">Inom 5 år</th>" +
      "<th scope=\"col\">Avgångselever</th><th scope=\"col\">Betygspoäng</th>" +
      "<th scope=\"col\">Andel med examen</th>" +
      "<th scope=\"col\">Grundl. högskolebehörighet</th></tr></thead><tbody>" +
      arsrader().map(function (r) {
        var s = r.start, e = r.examen;
        return "<tr><th scope=\"row\">" + esc(r.ar) + "</th><td>" +
          (s && s.antal !== null && s.antal !== undefined ? talSv(s.antal) : "–") +
          "</td><td>" + (s ? pct(s.examen3) : "–") +
          "</td><td>" + (s ? pct(s.examen5) : "–") +
          "</td><td>" + (e && e.antal !== null && e.antal !== undefined ? talSv(e.antal) : "–") +
          "</td><td>" + (e ? num(e.betygspoang) : "–") +
          "</td><td>" + (e ? pct(e.andelExamen) : "–") +
          "</td><td>" + (e ? pct(e.andelGrundlBehorighet) : "–") +
          "</td></tr>";
      }).join("") + "</tbody>";
  }

  /* Ett år per rad, med den start- och avgångsserie som hör till året
     självt (inte till kullen) — tabellen under gymnasieavsnittet. */
  function arsrader() {
    var ar = {};
    DATA.start.forEach(function (p) {
      ar[p.ar] = ar[p.ar] || { ar: p.ar }; ar[p.ar].start = p;
    });
    DATA.examen.forEach(function (p) {
      ar[p.ar] = ar[p.ar] || { ar: p.ar }; ar[p.ar].examen = p;
    });
    return Object.keys(ar).map(Number).sort(function (a, b) { return a - b; })
      .map(function (a) { return ar[a]; });
  }

  /* ---------- 3. Kullkedjan ---------- */

  var STATUSTEXT = {
    framtid: "<span title=\"Året har inte inträffat än\">–</span>",
    rapport_saknas: "<span title=\"Rapporten saknas för året\">–</span>"
  };

  function kedjecell(del, falt, formatera) {
    if (del.status !== "ok") return STATUSTEXT[del.status] || "–";
    return formatera(del[falt]);
  }

  function ritaKedjan() {
    el("tabell-kedjan").innerHTML =
      "<thead><tr><th scope=\"col\">Ut ur nian</th>" +
      "<th scope=\"col\">Meritvärde</th>" +
      "<th scope=\"col\">Behöriga till yrkesprogram</th>" +
      "<th scope=\"col\">Nybörjare på gymnasiet</th>" +
      "<th scope=\"col\">Examen inom 3 år</th>" +
      "<th scope=\"col\">Examensår</th>" +
      "<th scope=\"col\">Betygspoäng vid examen</th>" +
      "<th scope=\"col\">Andel med examen</th></tr></thead><tbody>" +
      DATA.kullar.map(function (k) {
        return "<tr><th scope=\"row\">" + esc(k.lasarNian) + "</th><td>" +
          num(k.nian.meritvarde) + "</td><td>" +
          pct(k.nian.andelBehorigYrkes) + "</td><td>" +
          kedjecell(k.start, "antal", function (v) {
            return v === null ? ".." : talSv(v);
          }) + "</td><td>" +
          kedjecell(k.start, "examen3", pct) + "</td><td>" +
          esc(k.examensar) + "</td><td>" +
          kedjecell(k.examen, "betygspoang", num) + "</td><td>" +
          kedjecell(k.examen, "andelExamen", pct) + "</td></tr>";
      }).join("") + "</tbody>";

    var k = DATA.kullar.filter(function (x) {
      return x.start.status === "ok" && x.examen.status === "ok";
    });
    if (!k.length) return;
    var f = k[0], s = k[k.length - 1];
    var nianUpp = s.nian.andelBehorigYrkes > f.nian.andelBehorigYrkes;
    var gymUpp = s.start.examen3 > f.start.examen3;
    el("slutsats-kedjan").innerHTML =
      "<p><strong>" + k.length + "</strong> årskullar har alla tre " +
      "mätpunkterna: de som gick ut nian " + esc(f.ar) + "–" + esc(s.ar) + ". " +
      "Mellan den första och den sista av dem har andelen behöriga i nian " +
      (nianUpp ? "<strong>stigit</strong>" : "<strong>sjunkit</strong>") +
      " från " + pct(f.nian.andelBehorigYrkes) + " till " +
      pct(s.nian.andelBehorigYrkes) + ", medan andelen som tog examen inom " +
      "tre år " + (gymUpp ? "<strong>stigit</strong>" : "<strong>sjunkit</strong>") +
      " från " + pct(f.start.examen3) + " till " + pct(s.start.examen3) +
      ". Måtten rör sig alltså " + (nianUpp === gymUpp ? "åt samma håll" :
        "<strong>åt olika håll</strong>") + ".</p>";
  }

  /* ---------- 4. Sambanden ---------- */

  function sambandFor(nyckel) {
    for (var i = 0; i < DATA.samband.length; i++) {
      if (DATA.samband[i].nyckel === nyckel) return DATA.samband[i];
    }
    return DATA.samband[0];
  }

  function fyllSambandValjare() {
    el("samband-valjare").innerHTML = DATA.samband.map(function (s) {
      return '<option value="' + esc(s.nyckel) + '">' + esc(s.etikett) + "</option>";
    }).join("");
  }

  /* Hur stark en korrelation är, i ord. Gränserna är godtyckliga och
     står därför utskrivna i texten intill. */
  function styrka(r) {
    var a = Math.abs(r);
    if (a < 0.3) return "inget tydligt samband";
    if (a < 0.5) return "ett svagt samband";
    if (a < 0.7) return "ett måttligt samband";
    return "ett starkt samband";
  }

  function ritaSamband() {
    var s = sambandFor(el("samband-valjare").value);
    var stil = K.serieStil(0);

    hojd("diagram-samband", 400);
    rita("diagram-samband", {
      type: "scatter",
      data: {
        datasets: [{
          label: "En punkt per årskull",
          data: s.punkter.map(function (p) {
            return { x: p.x, y: p.y, ar: p.ar };
          }),
          backgroundColor: stil.farg,
          borderColor: stil.farg,
          pointStyle: stil.punkt,
          pointRadius: 6, pointHoverRadius: 9
        }]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        locale: "sv-SE",
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function (it) {
                return "Ut ur nian " + it[0].raw.ar;
              },
              label: function (it) {
                return [s.xNamn + ": " + talSv(it.parsed.x, 1),
                        s.yNamn + ": " + talSv(it.parsed.y, 1)];
              }
            }
          }
        },
        scales: {
          x: { type: "linear",
               title: { display: true, text: s.xNamn, color: FARG.muted },
               grid: { color: FARG.grid }, border: { display: false } },
          y: { title: { display: true, text: s.yNamn, color: FARG.muted },
               grid: { color: FARG.grid }, border: { display: false } }
        }
      }
    });

    el("kalla-samband").textContent =
      "Källa: Skolverket. " + s.n + " årskullar. " +
      (s.r === null ? "För få punkter för att räkna en korrelation."
                    : "Korrelation r = " + talSv(s.r, 2) + ".");

    K.sattDataNot("not-samband",
      "Korrelationen bygger på <strong>" + esc(s.n) + " punkter</strong> och på " +
      "mätpunkter som inte följer samma individer &ndash; " +
      "<a href=\"#sektion-pendling\">ungefär tre av tio av kommunens " +
      "gymnasieelever läser i en annan kommun</a>. Ett r nära noll betyder " +
      "här att måtten inte rör sig i takt; det säger ingenting om enskilda " +
      "elever, och ett r skilt från noll skulle inte visa någon orsak.");

    el("slutsats-samband").innerHTML = s.r === null
      ? "<p>Underlaget räcker inte för att räkna fram ett samband.</p>"
      : "<p>Över de " + esc(s.n) + " kullar som har båda måtten är korrelationen " +
        "<strong>r = " + talSv(s.r, 2) + "</strong>, vilket är " + styrka(s.r) +
        (s.r < 0 ? " &ndash; och det som finns pekar åt <em>motsatt</em> håll " +
          "mot vad man skulle vänta sig" : "") + ". Gränserna för vad som " +
        "kallas svagt, måttligt och starkt är godtyckliga; med ett dussin " +
        "punkter är osäkerheten under alla omständigheter större än " +
        "skillnaden mellan dem.</p>";

    el("tabell-samband").innerHTML =
      "<thead><tr><th scope=\"col\">Ut ur nian</th><th scope=\"col\">" +
      esc(s.xNamn) + "</th><th scope=\"col\">" + esc(s.yNamn) + "</th></tr></thead><tbody>" +
      s.punkter.map(function (p) {
        return "<tr><th scope=\"row\">" + esc(p.ar) + "</th><td>" + talSv(p.x, 1) +
          "</td><td>" + talSv(p.y, 1) + "</td></tr>";
      }).join("") + "</tbody>";
  }

  /* ---------- 5. Pendlingen ---------- */

  function ritaPendling() {
    var serie = DATA.pendling.filter(function (p) { return p.gymnasiet; });
    var etiketter = serie.map(function (p) { return p.lasar; });

    hojd("diagram-pendling", 340);
    rita("diagram-pendling", {
      type: "line",
      data: {
        labels: etiketter,
        datasets: [
          linje("Folkbokförda i Kungsbacka",
            serie.map(function (p) { return p.gymnasiet.folkbokforda; }), 0, 3),
          linje("Studerar i Kungsbacka",
            serie.map(function (p) { return p.gymnasiet.studerarHar; }), 1, 3),
          linje("Pendlar in från annan kommun",
            serie.map(function (p) { return p.gymnasiet.inpendling; }), 2, 2),
          linje("Pendlar ut till annan kommun",
            serie.map(function (p) { return p.gymnasiet.utpendling; }), 3, 2)
        ]
      },
      options: linjeOptions("Antal elever", true,
        function (v) { return talSv(v) + " elever"; })
    });

    hojd("diagram-utpendling", 340);
    rita("diagram-utpendling", {
      type: "line",
      data: {
        labels: etiketter,
        datasets: [
          linje("Gymnasiet",
            serie.map(function (p) { return p.gymnasiet.andelUt; }), 0, 3),
          linje("Grundskolan",
            serie.map(function (p) {
              return p.grundskolan ? p.grundskolan.andelUt : null;
            }), 2, 2)
        ]
      },
      options: linjeOptions("Andel som läser i annan kommun (%)", true,
        function (v) { return talSv(v, 1) + " %"; })
    });

    var f = serie[0], s = serie[serie.length - 1];
    function ytterst(falt, storst) {
      return serie.reduce(function (a, b) {
        return (storst ? b.gymnasiet[falt] > a.gymnasiet[falt]
                       : b.gymnasiet[falt] < a.gymnasiet[falt]) ? b : a;
      });
    }
    var mestIn = ytterst("inpendling", true);
    var bastNetto = ytterst("netto", true);
    var minAndel = ytterst("andelUt", false);
    var maxAndel = ytterst("andelUt", true);

    el("kalla-pendling").textContent =
      "Källa: Skolverket, pendling mellan hem- och skolkommun, läsåren " +
      f.lasar + "–" + s.lasar + ". Elevantalen är avrundade till närmaste " +
      "tiotal av Skolverket.";

    K.sattDataNot("not-pendling",
      "Rapporten säger <strong>hur många</strong> som pendlar, inte " +
      "<strong>vart</strong> eller <strong>varifrån</strong>. Vilka kommuner " +
      "eleverna rör sig mellan går inte att läsa ur den här statistiken.");

    var nettoText = s.gymnasiet.netto < 0
      ? "fler elever ut än in" : "fler elever in än ut";
    el("slutsats-pendling").innerHTML =
      "<p>Läsåret " + esc(s.lasar) + " var <strong>" +
      talSv(s.gymnasiet.folkbokforda) + "</strong> gymnasieelever " +
      "folkbokförda i Kungsbacka. Av dem läste <strong>" +
      talSv(s.gymnasiet.utpendling) + "</strong> (" + pct(s.gymnasiet.andelUt) +
      ") i en annan kommun. Samtidigt kom <strong>" +
      talSv(s.gymnasiet.inpendling) + "</strong> av eleverna i kommunens " +
      "gymnasieskolor utifrån &ndash; " + pct(s.gymnasiet.andelInAvEleverna) +
      " av alla som läser här. Netto ger det " + nettoText + " (" +
      (s.gymnasiet.netto > 0 ? "+" : "") + talSv(s.gymnasiet.netto) + ").</p>" +
      "<p>I grundskolan är rörligheten en helt annan storleksordning: där " +
      "läste " + pct(s.grundskolan.andelUt) + " av kommunens elever i en " +
      "annan kommun samma läsår, mot " + pct(s.gymnasiet.andelUt) +
      " på gymnasiet. Det är vid övergången till gymnasiet som årskullen " +
      "delar på sig &ndash; och det är därför sidans tre mätpunkter mäter " +
      "tre olika elevgrupper.</p>" +
      "<p>Andelen utpendlare har legat påfallande stilla: mellan " +
      pct(minAndel.gymnasiet.andelUt) + " och " + pct(maxAndel.gymnasiet.andelUt) +
      " under hela perioden. Det som förändrats är <em>inpendlingen</em>. Som " +
      "mest kom " + talSv(mestIn.gymnasiet.inpendling) + " elever utifrån (" +
      esc(mestIn.lasar) + "); " + esc(s.lasar) + " är de " +
      talSv(s.gymnasiet.inpendling) + ". Nettot har därmed gått från +" +
      talSv(bastNetto.gymnasiet.netto) + " elever (" + esc(bastNetto.lasar) +
      ") till " + talSv(s.gymnasiet.netto) + ".</p>";

    el("grav-vidare").innerHTML =
      "<strong>Värt att gräva vidare i.</strong> Kungsbacka ingår i " +
      "Göteborgsregionens gemensamma gymnasieantagning, där eleverna söker " +
      "på lika villkor till skolor i hela regionen. Att en stor del av " +
      "kommunens elever läser i Göteborg, och att en stor del av inpendlingen " +
      "kommer från grannkommunen Mölndal, är vad man skulle vänta sig av " +
      "geografin och av det gemensamma antagningsområdet &ndash; men det är " +
      "inget den här statistiken visar. Skolverkets pendlingsrapport ger " +
      "bara summorna. För att kunna säga vilka kommuner eleverna rör sig " +
      "mellan behövs en källa som redovisar hemkommun och skolkommun mot " +
      "varandra. Det vore nästa steg, och skulle också göra det möjligt att " +
      "följa kommunens <em>egna</em> elever genom gymnasiet i stället för " +
      "skolorna som ligger här.";

    el("tabell-pendling").innerHTML =
      "<thead><tr><th scope=\"col\">Läsår</th>" +
      "<th scope=\"col\">Folkbokförda</th><th scope=\"col\">Studerar här</th>" +
      "<th scope=\"col\">Inpendling</th><th scope=\"col\">Utpendling</th>" +
      "<th scope=\"col\">Andel ut, gymnasiet</th>" +
      "<th scope=\"col\">Andel ut, grundskolan</th></tr></thead><tbody>" +
      serie.map(function (p) {
        var g = p.gymnasiet, b = p.grundskolan;
        return "<tr><th scope=\"row\">" + esc(p.lasar) + "</th><td>" +
          talSv(g.folkbokforda) + "</td><td>" + talSv(g.studerarHar) +
          "</td><td>" + talSv(g.inpendling) + "</td><td>" +
          talSv(g.utpendling) + "</td><td>" + pct(g.andelUt) + "</td><td>" +
          (b ? pct(b.andelUt) : "–") + "</td></tr>";
      }).join("") + "</tbody>";
  }

  /* ---------- 6. Program för program ---------- */

  function program(namn) {
    for (var i = 0; i < DATA.program.length; i++) {
      if (DATA.program[i].namn === namn) return DATA.program[i];
    }
    return null;
  }

  function fyllProgramValjare() {
    var med = DATA.program.filter(function (p) { return p.antalMedVarde > 0; });
    el("program-valjare").innerHTML = med.map(function (p) {
      return '<option value="' + esc(p.namn) + '">' + esc(p.namn) + "</option>";
    }).join("");
    if (program("Naturvetenskapsprogrammet")) {
      el("program-valjare").value = "Naturvetenskapsprogrammet";
    }
    return med;
  }

  function ritaProgram() {
    var p = program(el("program-valjare").value);
    if (!p) return;
    var k = p.kohorter;

    hojd("diagram-program", 380);
    rita("diagram-program", {
      type: "line",
      data: {
        labels: k.map(function (r) { return String(r.startAr); }),
        datasets: [
          linje("Examen inom 3 år",
            k.map(function (r) { return r.start.examen3; }), 0, 3),
          linje("Inom 4 år", k.map(function (r) { return r.start.examen4; }), 1, 2),
          linje("Inom 5 år", k.map(function (r) { return r.start.examen5; }), 2, 2)
        ]
      },
      options: linjeOptions("Andel med examen (%)", false,
        function (v) { return talSv(v, 1) + " %"; })
    });

    el("kalla-program").textContent =
      "Källa: Skolverket, genomströmning per program. X-axeln är det år " +
      "eleverna började på programmet.";

    var dolda = k.filter(function (r) { return r.start.examen3 === null; });
    K.sattDataNot("not-program", dolda.length
      ? "Startåren " + esc(dolda.map(function (r) { return r.startAr; }).join(", ")) +
        " redovisas inte för " + esc(p.namn.toLowerCase()) + ": uppgiften bygger " +
        "på färre än tio elever."
      : "");

    var med = k.filter(function (r) { return r.start.examen3 !== null; });
    if (med.length >= 2) {
      var f = med[0], s = med[med.length - 1];
      el("slutsats-program").innerHTML =
        "<p>På " + esc(p.namn.toLowerCase()) + " tog <strong>" + pct(f.start.examen3) +
        "</strong> av dem som började " + esc(f.startAr) + " examen inom tre år. " +
        "För dem som började " + esc(s.startAr) + " var andelen <strong>" +
        pct(s.start.examen3) + "</strong>.</p>";
    } else {
      el("slutsats-program").innerHTML =
        "<p>" + esc(p.namn) + " har för få redovisade år för att en utveckling " +
        "ska gå att läsa av.</p>";
    }

    el("tabell-program").innerHTML =
      "<thead><tr><th scope=\"col\">Startår</th><th scope=\"col\">Nybörjare</th>" +
      "<th scope=\"col\">Examen inom 3 år</th><th scope=\"col\">Inom 4 år</th>" +
      "<th scope=\"col\">Inom 5 år</th><th scope=\"col\">Examensår</th>" +
      "<th scope=\"col\">Avgångselever</th><th scope=\"col\">Betygspoäng</th>" +
      "</tr></thead><tbody>" +
      k.map(function (r) {
        var e = r.examen;
        return "<tr><th scope=\"row\">" + esc(r.startAr) + "</th><td>" +
          (r.start.antal === null ? ".." : talSv(r.start.antal)) + "</td><td>" +
          pct(r.start.examen3) + "</td><td>" + pct(r.start.examen4) + "</td><td>" +
          pct(r.start.examen5) + "</td><td>" + esc(r.examensar) + "</td><td>" +
          (e ? (e.antal === null ? ".." : talSv(e.antal)) : "–") + "</td><td>" +
          (e ? num(e.betygspoang) : "–") + "</td></tr>";
      }).join("") + "</tbody>";
  }

  /* ---------- Kort sagt, källor och start ---------- */

  function kortSagt() {
    var n = DATA.nian[DATA.nian.length - 1];
    var n0 = forstaMed(DATA.nian, "andelBehorigYrkes");
    var s = sistaMed(DATA.start, "examen3");
    var e = DATA.examen[DATA.examen.length - 1];
    var p = DATA.pendling[DATA.pendling.length - 1].gymnasiet;
    var starkast = DATA.samband.filter(function (x) { return x.r !== null; })
      .sort(function (a, b) { return Math.abs(b.r) - Math.abs(a.r); })[0];

    var punkter = [
      "Läsåret " + esc(n.lasar) + " var <strong>" + pct(n.andelBehorigYrkes) +
        "</strong> av niondeklassarna i Kungsbacka behöriga till gymnasiets " +
        "yrkesprogram, mot " + pct(n0.andelBehorigYrkes) + " läsåret " +
        esc(n0.lasar) + ".",
      "Av dem som började ett nationellt gymnasieprogram i kommunen " + esc(s.ar) +
        " hade <strong>" + pct(s.examen3) + "</strong> examen inom tre år.",
      "Avgångseleverna " + esc(e.ar) + " hade en genomsnittlig betygspoäng på " +
        "<strong>" + num(e.betygspoang) + "</strong> av " + esc(DATA.poangMax) +
        ", och " + pct(e.andelExamen) + " tog examen.",
      "<strong>" + pct(p.andelUt) + "</strong> av kommunens gymnasieelever " +
        "läser i en annan kommun, och " + pct(p.andelInAvEleverna) +
        " av eleverna i kommunens gymnasieskolor kommer utifrån &ndash; " +
        "mätpunkterna ovan följer alltså inte samma individer."
    ];
    if (starkast) {
      punkter.push("Det starkaste sambandet mellan nian och gymnasiet i " +
        "materialet är <strong>r = " + talSv(starkast.r, 2) + "</strong> över " +
        esc(starkast.n) + " årskullar &ndash; " + styrka(starkast.r) +
        ", och alldeles för få punkter för att slå fast något.");
    }
    K.visaKortSagt(punkter);
  }

  function visaKallor() {
    var grupper = {};
    DATA.kallor.forEach(function (k) {
      (grupper[k.rapportTitel] = grupper[k.rapportTitel] || []).push(k);
    });
    el("kallgrupper").innerHTML = Object.keys(grupper).map(function (titel) {
      var rader = grupper[titel].slice().reverse();
      return "<details><summary>" + esc(titel) + " (" + rader.length +
        " år)</summary><ul class=\"kallista\">" +
        rader.map(function (k) {
          var url = sakerUrl(k.kallaUrl);
          var text = esc(k.lasar || k.ar);
          return "<li>" +
            (url ? '<a href="' + url + '">' + text + "</a>" : text) +
            " &ndash; " + esc(k.kalla) + ", hämtad " +
            esc(k.hamtad) + ".</li>";
        }).join("") + "</ul></details>";
    }).join("");
  }

  function start(data) {
    DATA = data;
    var n = DATA.nian[DATA.nian.length - 1];
    var hamtad = DATA.kallor.reduce(function (a, k) {
      return k.hamtad > a ? k.hamtad : a;
    }, "");

    K.visaMeta({
      kalla: "Skolverket, utbildningsstatistik",
      period: DATA.nian[0].lasar + "–" + n.lasar,
      senaste: n.lasar,
      hamtad: hamtad
    });

    kortSagt();
    ritaMerit();
    ritaBehorighet();
    ritaGenomstromning();
    ritaPoang();
    ritaExamen();
    ritaKedjan();

    fyllSambandValjare();
    K.kopplaValjare(el("samband-valjare"), "samband", ritaSamband);
    ritaSamband();

    ritaPendling();

    fyllProgramValjare();
    K.kopplaValjare(el("program-valjare"), "program", ritaProgram);
    ritaProgram();

    visaKallor();

    ["nian", "gymnasiet", "kedjan", "samband", "pendling", "program",
     "kallor", "om"].forEach(function (id) {
      var s = el("sektion-" + id);
      if (s) s.hidden = false;
    });

    var upp = el("om-uppdaterad");
    if (upp) upp.textContent = "Datat på den här sidan hämtades " + hamtad + ".";
  }

  K.starta(DATAFIL, { init: start });
})();
