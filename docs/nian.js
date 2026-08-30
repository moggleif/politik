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
  var rita = K.rita;

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
    el("slutsats-kedjan").innerHTML =
      "<p><strong>" + k.length + "</strong> årskullar har alla tre " +
      "mätpunkterna: de som gick ut nian " + esc(f.ar) + "–" + esc(s.ar) + ". " +
      "Mellan den första och den sista av dem gick andelen behöriga i nian " +
      "från " + pct(f.nian.andelBehorigYrkes) + " till " +
      pct(s.nian.andelBehorigYrkes) + ", och andelen som tog examen inom tre " +
      "år från " + pct(f.start.examen3) + " till " + pct(s.start.examen3) +
      ". Måtten har olika skalor och olika urval, och de tre mätpunkterna " +
      "följer inte samma individer.</p>";
  }

  /* ---------- 4. Pendlingen ---------- */

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

    el("slutsats-pendling").innerHTML =
      "<p>Läsåret " + esc(s.lasar) + " var <strong>" +
      talSv(s.gymnasiet.folkbokforda) + "</strong> gymnasieelever " +
      "folkbokförda i Kungsbacka. Av dem läste <strong>" +
      talSv(s.gymnasiet.utpendling) + "</strong> (" + pct(s.gymnasiet.andelUt) +
      ") i en annan kommun. Samtidigt kom <strong>" +
      talSv(s.gymnasiet.inpendling) + "</strong> av eleverna i kommunens " +
      "gymnasieskolor utifrån &ndash; " + pct(s.gymnasiet.andelInAvEleverna) +
      " av alla som läser här. Inpendling minus utpendling ger " +
      (s.gymnasiet.netto > 0 ? "+" : "") + talSv(s.gymnasiet.netto) +
      " elever.</p>" +
      "<p>Samma läsår läste " + pct(s.grundskolan.andelUt) + " av kommunens " +
      "grundskoleelever i en annan kommun, mot " + pct(s.gymnasiet.andelUt) +
      " av gymnasieeleverna. Uppgifterna avser folkbokförda elever i " +
      "Kungsbacka; sidans övriga mått avser i stället skolor som ligger i " +
      "kommunen.</p>" +
      "<p>Över läsåren " + esc(f.lasar) + "&ndash;" + esc(s.lasar) +
      " ligger andelen utpendlare på gymnasiet mellan " +
      pct(minAndel.gymnasiet.andelUt) + " (" + esc(minAndel.lasar) + ") och " +
      pct(maxAndel.gymnasiet.andelUt) + " (" + esc(maxAndel.lasar) +
      "). Inpendlingens högsta värde är " +
      talSv(mestIn.gymnasiet.inpendling) + " elever (" + esc(mestIn.lasar) +
      "), mot " + talSv(s.gymnasiet.inpendling) + " läsåret " + esc(s.lasar) +
      ". Nettots högsta värde är " +
      (bastNetto.gymnasiet.netto > 0 ? "+" : "") +
      talSv(bastNetto.gymnasiet.netto) +
      " elever (" + esc(bastNetto.lasar) + "), mot " +
      talSv(s.gymnasiet.netto) + " sista läsåret.</p>";

    el("grav-vidare").innerHTML =
      "<strong>Urvalet är skolkommun.</strong> De tre mätpunkterna ovanför " +
      "redovisar skolor som ligger i Kungsbacka, inte kommunens folkbokförda " +
      "elever. Att i stället följa de folkbokförda eleverna genom gymnasiet " +
      "kräver en källa som redovisar hemkommun mot skolkommun; " +
      "pendlingsrapporten redovisar bara summorna per läsår.";

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

  /* ---------- 5. Program för program ---------- */

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
        "<p>" + esc(p.namn) + " har färre än två startår med redovisad andel " +
        "examen inom tre år.</p>";
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

    ritaPendling();

    fyllProgramValjare();
    K.kopplaValjare(el("program-valjare"), "program", ritaProgram);
    ritaProgram();

    visaKallor();

    ["nian", "gymnasiet", "kedjan", "pendling", "program",
     "kallor", "om"].forEach(function (id) {
      var s = el("sektion-" + id);
      if (s) s.hidden = false;
    });

    var upp = el("om-uppdaterad");
    if (upp) upp.textContent = "Datat på den här sidan hämtades " + hamtad + ".";
  }

  K.starta(DATAFIL, { init: start });
})();
