/* Kostnad per elev i grundskolan — Kungsbacka och riket, i fasta priser.
   Läser docs/data-kostnader.json, byggd av scripts/build_kostnader.py ur
   Kolada (kostnaderna) och SCB (konsumentprisindex).

   Sidans genomgående val är *måttet*: kostnaden för de elever som bor i
   kommunen, eller kostnaden för kommunens egna skolor. De två svarar på
   olika frågor och får aldrig ritas i samma linje. Valet ligger i
   adressen (?matt=), så att en länk ger samma vy. */
(function () {
  "use strict";

  var K = window.KIS;
  var FARG = K.FARG;
  var PALETT = K.PALETT;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;
  var sakerUrl = K.sakerUrl;

  var DATAFIL = "data-kostnader.json";
  var KUNGSBACKA = "1384";
  var RIKET = "0000";

  /* Fast färg per roll: blå är alltid Kungsbacka, orange alltid riket,
     grå alltid löpande priser. Färgen följer serien, inte ordningen. */
  var FARG_OMRADE = {};
  FARG_OMRADE[KUNGSBACKA] = FARG.bla;
  FARG_OMRADE[RIKET] = FARG.orange;

  var data = null;

  /* ---------- Uppslag ---------- */

  function mattet() {
    var vald = el("matt-valjare").value;
    for (var i = 0; i < data.kostnadPerElev.length; i++) {
      if (data.kostnadPerElev[i].nyckel === vald) return data.kostnadPerElev[i];
    }
    return data.kostnadPerElev[0];
  }

  function omradesnamn(kod) {
    for (var i = 0; i < data.omraden.length; i++) {
      if (data.omraden[i].kod === kod) return data.omraden[i].namn;
    }
    return kod;
  }

  function omrade(post, kod) { return post.omraden[kod] || null; }

  function cell(o, ar, falt) {
    if (!o) return null;
    var r = o.varden[String(ar)];
    return r ? r[falt] : null;
  }

  /* Åren som en serie faktiskt har, i stigande ordning. */
  function aren(o) {
    return o ? Object.keys(o.varden).map(Number).sort(function (a, b) {
      return a - b;
    }) : [];
  }

  function kronor(v) { return talSv(v) + " kr"; }

  /* Serierna är olika långa – riket börjar senare än kommunen, och
     skolskjutsen senare än båda. Ett saknat år ska bli ett tankstreck i
     tabellen, inte ett undantag mitt i uppritningen. */
  function visa(v, dec) {
    return (v === null || v === undefined) ? "&ndash;" : talSv(v, dec);
  }

  /* ---------- Gemensamma diagraminställningar ---------- */

  function basOptions(ytitel, tooltipEtikett) {
    return {
      maintainAspectRatio: false,
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            title: function (it) { return "År " + it[0].label; },
            label: tooltipEtikett
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: FARG.baseline },
          ticks: { maxRotation: 0, autoSkipPadding: 12 }
        },
        y: {
          title: { display: true, text: ytitel, color: FARG.muted },
          grid: { color: FARG.grid },
          border: { display: false },
          ticks: {
            callback: function (v) { return talSv(v); }
          }
        }
      }
    };
  }

  function linjeSerie(etikett, farg, varden, streck) {
    return {
      label: etikett,
      data: varden,
      borderColor: farg,
      backgroundColor: farg,
      borderWidth: 2,
      borderDash: streck || [],
      pointRadius: 0,
      pointHoverRadius: 5,
      pointBorderColor: FARG.surface,
      pointBorderWidth: 2,
      spanGaps: false,
      tension: 0.1
    };
  }

  /* ---------- 1. Löpande mot fasta priser ---------- */

  function ritaFast() {
    var post = mattet();
    var o = omrade(post, KUNGSBACKA);
    var ar = aren(o);

    var opt = basOptions("Kronor per elev", function (it) {
      return it.dataset.label + ": " + kronor(it.parsed.y);
    });
    opt.scales.y.beginAtZero = true;

    var chart = K.rita("diagram-fast", {
      type: "line",
      data: {
        labels: ar.map(String),
        datasets: [
          linjeSerie("Fasta priser (" + data.prisniva + " års prisnivå)",
            FARG_OMRADE[KUNGSBACKA],
            ar.map(function (a) { return cell(o, a, "fast"); })),
          linjeSerie("Löpande priser (som det stod i redovisningen)",
            FARG.gra,
            ar.map(function (a) { return cell(o, a, "nominell"); }), [7, 4])
        ]
      },
      options: opt
    }, 380);
    K.aktiveraToning(chart, true);

    el("kalla-fast").textContent =
      "Källa: " + data.kalla + ". Omräknat med " + data.kpiMatt +
      " till " + data.prisniva + " års prisnivå.";

    var forsta = o.forstaAr, sista = o.sistaAr;
    el("slutsats-fast").innerHTML =
      "<p>I löpande priser gick kostnaden per elev från <strong>" +
      kronor(o.forsta) + "</strong> (" + esc(forsta) + ") till <strong>" +
      kronor(o.sista) + "</strong> (" + esc(sista) + "). Räknat i " +
      esc(data.prisniva) + " års prisnivå motsvarar " + esc(forsta) +
      " års kostnad <strong>" + kronor(o.forstaFast) + "</strong>, vilket " +
      "gör förändringen fram till " + esc(sista) + " till <strong>" +
      (o.realTotal > 0 ? "+" : "") + talSv(o.realTotal, 1) +
      "&nbsp;%</strong> i fasta priser.</p>";

    var rader = ar.map(function (a) {
      return "<tr><th scope=\"row\">" + esc(a) + "</th><td>" +
        visa(cell(o, a, "nominell")) + "</td><td>" +
        visa(cell(o, a, "fast")) + "</td><td>" +
        visa(data.kpi[String(a)], 2) + "</td></tr>";
    }).join("");
    el("tabell-fast").innerHTML =
      "<thead><tr><th scope=\"col\">År</th>" +
      "<th scope=\"col\">Löpande priser (kr)</th>" +
      "<th scope=\"col\">Fasta priser (kr)</th>" +
      "<th scope=\"col\">KPI, 1980=100</th></tr></thead><tbody>" +
      rader + "</tbody>";
  }

  /* ---------- 2. Kungsbacka mot riket ---------- */

  function ritaRiket() {
    var post = mattet();
    var kb = omrade(post, KUNGSBACKA), ri = omrade(post, RIKET);
    /* Rikets serie börjar senare; x-axeln är ändå kommunens hela span,
       så att det syns var jämförelsen först går att göra. */
    var ar = aren(kb);

    var opt = basOptions("Kronor per elev, " + data.prisniva + " års prisnivå",
      function (it) {
        return it.dataset.label + ": " + kronor(it.parsed.y);
      });
    opt.scales.y.beginAtZero = true;

    var dataset = [linjeSerie(omradesnamn(KUNGSBACKA), FARG_OMRADE[KUNGSBACKA],
      ar.map(function (a) { return cell(kb, a, "fast"); }))];
    if (ri) {
      dataset.push(linjeSerie(omradesnamn(RIKET), FARG_OMRADE[RIKET],
        ar.map(function (a) { return cell(ri, a, "fast"); }), [7, 4]));
    }

    var chart = K.rita("diagram-riket", {
      type: "line",
      data: { labels: ar.map(String), datasets: dataset },
      options: opt
    }, 380);
    K.aktiveraToning(chart, true);

    el("kalla-riket").textContent = ri
      ? "Källa: " + data.kalla + ". Rikets serie börjar " + ri.forstaAr +
        "; Kungsbackas " + kb.forstaAr + "."
      : "Källa: " + data.kalla + ". Riket saknas för det här måttet.";

    if (ri) {
      var jamfor = ar.filter(function (a) {
        return cell(kb, a, "motRiket") !== null;
      });
      var sistaJamfor = jamfor[jamfor.length - 1];
      var diff = cell(kb, sistaJamfor, "motRiket");
      var under = jamfor.filter(function (a) {
        return cell(kb, a, "motRiket") < 0;
      }).length;
      el("slutsats-riket").innerHTML =
        "<p>År " + esc(sistaJamfor) + " låg Kungsbacka <strong>" +
        talSv(Math.abs(diff), 1) + "&nbsp;%</strong> " +
        (diff < 0 ? "under" : "över") + " riket: " +
        kronor(cell(kb, sistaJamfor, "fast")) + " mot " +
        kronor(cell(ri, sistaJamfor, "fast")) + " per elev. Av de " +
        jamfor.length + " år som går att jämföra låg Kungsbacka under " +
        "riket under <strong>" + under + "</strong> av dem.</p>";
    } else {
      el("slutsats-riket").innerHTML = "";
    }

    var rader = ar.map(function (a) {
      var d = cell(kb, a, "motRiket");
      return "<tr><th scope=\"row\">" + esc(a) + "</th><td>" +
        visa(cell(kb, a, "fast")) + "</td><td>" +
        (ri ? visa(cell(ri, a, "fast")) : "&ndash;") + "</td><td>" +
        (d === null ? "&ndash;" : (d > 0 ? "+" : "") + talSv(d, 1) + "&nbsp;%") +
        "</td></tr>";
    }).join("");
    el("tabell-riket").innerHTML =
      "<thead><tr><th scope=\"col\">År</th>" +
      "<th scope=\"col\">Kungsbacka (kr)</th>" +
      "<th scope=\"col\">Riket (kr)</th>" +
      "<th scope=\"col\">Kungsbacka mot riket</th></tr></thead><tbody>" +
      rader + "</tbody>";
  }

  /* ---------- 3. Utvecklingen, gemensamt basår ---------- */

  function ritaIndex() {
    var post = mattet();
    var kb = omrade(post, KUNGSBACKA), ri = omrade(post, RIKET);
    var bas = post.indexBasAr;
    var ar = aren(kb);

    var opt = basOptions("Index, " + bas + " = 100", function (it) {
      return it.dataset.label + ": " + talSv(it.parsed.y, 1);
    });
    /* Skalan börjar inte vid noll: rörelsen ligger i ett smalt band
       kring 100, och en nollskalad axel trycker ihop den till en rak
       linje. Att skalan är beskuren står i bildtexten. */
    opt.scales.y.beginAtZero = false;
    opt.scales.y.ticks.callback = function (v) { return talSv(v, 0); };

    var dataset = [linjeSerie(omradesnamn(KUNGSBACKA), FARG_OMRADE[KUNGSBACKA],
      ar.map(function (a) { return cell(kb, a, "index"); }))];
    if (ri) {
      dataset.push(linjeSerie(omradesnamn(RIKET), FARG_OMRADE[RIKET],
        ar.map(function (a) { return cell(ri, a, "index"); }), [7, 4]));
    }

    var chart = K.rita("diagram-index", {
      type: "line",
      data: { labels: ar.map(String), datasets: dataset },
      options: opt
    }, 380);
    K.aktiveraToning(chart, true);

    el("kalla-index").textContent =
      "Källa: " + data.kalla + ". Båda serierna satta till 100 år " + bas +
      ", räknat på fasta priser. Y-axeln börjar inte vid noll.";

    var kbSist = cell(kb, kb.sistaAr, "index");
    var riSist = ri ? cell(ri, ri.sistaAr, "index") : null;
    el("slutsats-index").innerHTML = riSist === null
      ? "<p>Med år " + esc(bas) + " satt till 100 låg Kungsbacka på index " +
        "<strong>" + talSv(kbSist, 1) + "</strong> år " + esc(kb.sistaAr) +
        ".</p>"
      : "<p>Med år " + esc(bas) + " satt till 100 låg Kungsbacka på index " +
        "<strong>" + talSv(kbSist, 1) + "</strong> år " + esc(kb.sistaAr) +
        " och riket på <strong>" + talSv(riSist, 1) + "</strong>. Kostnaden " +
        "per elev har alltså stigit " +
        (kbSist > riSist ? "mer" : kbSist < riSist ? "mindre" : "lika mycket") +
        " i Kungsbacka än i riket sedan " + esc(bas) +
        ", räknat i fasta priser.</p>";

    var rader = ar.map(function (a) {
      return "<tr><th scope=\"row\">" + esc(a) + "</th><td>" +
        visa(cell(kb, a, "index"), 1) + "</td><td>" +
        (ri ? visa(cell(ri, a, "index"), 1) : "&ndash;") + "</td></tr>";
    }).join("");
    el("tabell-index").innerHTML =
      "<thead><tr><th scope=\"col\">År</th>" +
      "<th scope=\"col\">Kungsbacka</th>" +
      "<th scope=\"col\">Riket</th></tr></thead><tbody>" + rader + "</tbody>";
  }

  /* ---------- 4. Förändring år för år ---------- */

  function ritaForandring() {
    var post = mattet();
    var kb = omrade(post, KUNGSBACKA), ri = omrade(post, RIKET);
    /* Första året i varje serie saknar föregående år att jämföras med. */
    var ar = aren(kb).filter(function (a) {
      return cell(kb, a, "forandring") !== null;
    });
    var varden = ar.map(function (a) { return cell(kb, a, "forandring"); });

    var opt = basOptions("Förändring mot föregående år (%)", function (it) {
      var v = it.parsed.y;
      return it.dataset.label + ": " + (v > 0 ? "+" : "") + talSv(v, 1) + " %";
    });
    opt.scales.y.grid.color = function (c) {
      return c.tick.value === 0 ? FARG.baseline : FARG.grid;
    };
    opt.scales.y.ticks.callback = function (v) { return talSv(v, 1) + " %"; };

    var dataset = [{
      label: omradesnamn(KUNGSBACKA),
      data: varden,
      /* Tvåpolig skala: dyrare och billigare är motsatta tillstånd, inte
         två kategorier. Neutral nollinje däremellan. */
      backgroundColor: varden.map(function (v) {
        return v >= 0 ? FARG.bla : FARG.rod;
      }),
      borderWidth: 0,
      borderRadius: 4,
      borderSkipped: false,
      order: 2
    }];
    if (ri) {
      dataset.push({
        label: omradesnamn(RIKET),
        type: "line",
        data: ar.map(function (a) { return cell(ri, a, "forandring"); }),
        borderColor: FARG_OMRADE[RIKET],
        backgroundColor: FARG_OMRADE[RIKET],
        borderWidth: 2,
        borderDash: [7, 4],
        pointRadius: 0,
        pointHoverRadius: 5,
        spanGaps: false,
        order: 1
      });
    }

    K.rita("diagram-forandring", {
      type: "bar",
      data: { labels: ar.map(String), datasets: dataset },
      options: opt
    }, 360);

    el("kalla-forandring").textContent =
      "Källa: " + data.kalla + ". Blå stapel = dyrare per elev än året " +
      "innan i fasta priser, röd = billigare.";

    var lagre = varden.filter(function (v) { return v < 0; }).length;
    var storst = varden.indexOf(Math.max.apply(null, varden));
    el("slutsats-forandring").innerHTML =
      "<p>Av " + varden.length + " år med ett föregående år att jämföra " +
      "med var kostnaden per elev lägre än året innan under <strong>" +
      lagre + "</strong> av dem, räknat i fasta priser. Den största " +
      "ökningen kom " + esc(ar[storst]) + " (<strong>+" +
      talSv(varden[storst], 1) + "&nbsp;%</strong>).</p>";

    var rader = ar.map(function (a, i) {
      var r = ri ? cell(ri, a, "forandring") : null;
      return "<tr><th scope=\"row\">" + esc(a) + "</th><td>" +
        (varden[i] > 0 ? "+" : "") + talSv(varden[i], 1) + "&nbsp;%</td><td>" +
        (r === null ? "&ndash;" : (r > 0 ? "+" : "") + talSv(r, 1) + "&nbsp;%") +
        "</td></tr>";
    }).join("");
    el("tabell-forandring").innerHTML =
      "<thead><tr><th scope=\"col\">År</th>" +
      "<th scope=\"col\">Kungsbacka</th>" +
      "<th scope=\"col\">Riket</th></tr></thead><tbody>" + rader + "</tbody>";
  }

  /* ---------- 5. Kostnadsslagen ---------- */

  function ritaSlag() {
    var slag = data.kostnadsslag;
    /* Alla år som något kostnadsslag har, inte bara det första slagets. */
    var arMed = {};
    slag.forEach(function (s) {
      aren(s.omraden[KUNGSBACKA]).forEach(function (a) { arMed[a] = true; });
    });
    var ar = Object.keys(arMed).map(Number).sort(function (a, b) {
      return a - b;
    });

    var opt = basOptions("Kronor per elev, " + data.prisniva + " års prisnivå",
      function (it) {
        return it.dataset.label + ": " + kronor(it.parsed.y);
      });
    opt.scales.x.stacked = true;
    opt.scales.y.stacked = true;
    opt.scales.y.beginAtZero = true;

    var dataset = slag.map(function (s, i) {
      var o = s.omraden[KUNGSBACKA];
      return {
        label: s.etikett,
        data: ar.map(function (a) { return cell(o, a, "fast"); }),
        backgroundColor: PALETT[i % PALETT.length],
        borderWidth: 0
      };
    });

    K.rita("diagram-slag", {
      type: "bar",
      data: { labels: ar.map(String), datasets: dataset },
      options: opt
    }, 420);

    el("kalla-slag").textContent =
      "Källa: " + data.kalla + ". Kommunens egna skolor, Kungsbacka, i " +
      data.prisniva + " års prisnivå. Skolskjuts ingår inte i de här posterna.";

    var sista = ar[ar.length - 1];
    var andelar = slag.map(function (s) {
      return { etikett: s.etikett, v: cell(s.omraden[KUNGSBACKA], sista, "fast") };
    }).filter(function (x) { return x.v !== null; })
      .sort(function (a, b) { return b.v - a.v; });
    var summa = andelar.reduce(function (s, x) { return s + x.v; }, 0);
    el("slutsats-slag").innerHTML = andelar.length
      ? "<p>År " + esc(sista) + " var <strong>" + esc(andelar[0].etikett) +
        "</strong> den största posten med " + kronor(andelar[0].v) + " per " +
        "elev, eller " + talSv(100 * andelar[0].v / summa, 1) + "&nbsp;% av " +
        "kostnaden." + (andelar.length > 1
          ? " Näst störst var " + esc(andelar[1].etikett.toLowerCase()) +
            " med " + kronor(andelar[1].v) + "."
          : "") + "</p>"
      : "";

    var rader = ar.map(function (a) {
      return "<tr><th scope=\"row\">" + esc(a) + "</th>" +
        slag.map(function (s) {
          return "<td>" + visa(cell(s.omraden[KUNGSBACKA], a, "fast")) + "</td>";
        }).join("") + "</tr>";
    }).join("");
    el("tabell-slag").innerHTML =
      "<thead><tr><th scope=\"col\">År</th>" +
      slag.map(function (s) {
        return "<th scope=\"col\">" + esc(s.etikett) + "</th>";
      }).join("") + "</tr></thead><tbody>" + rader + "</tbody>";
  }

  /* ---------- Måttväljaren ---------- */

  function fyllValjare() {
    var v = el("matt-valjare");
    data.kostnadPerElev.forEach(function (m) {
      var o = document.createElement("option");
      o.value = m.nyckel;
      o.textContent = m.etikett;
      v.appendChild(o);
    });
    /* Kommunens egna skolor är förvalt: det är den serie som går längst
       tillbaka för båda områdena och den enda som går att bryta ned. */
    v.value = "kommunal";
  }

  function beskrivMatt() {
    var lista = el("lista-matt");
    lista.innerHTML = data.kostnadPerElev.map(function (m) {
      var kb = omrade(m, KUNGSBACKA), ri = omrade(m, RIKET);
      return "<li><strong>" + esc(m.etikett) + "</strong> &ndash; " +
        esc(m.definition) + " Kungsbacka " +
        (kb ? esc(kb.forstaAr) + "&ndash;" + esc(kb.sistaAr) : "saknas") +
        ", riket " + (ri ? esc(ri.forstaAr) + "&ndash;" + esc(ri.sistaAr) : "saknas") +
        ". (Kolada " + esc(m.kolada) + ".)</li>";
    }).join("");
  }

  function ritaOm() {
    ritaFast();
    ritaRiket();
    ritaIndex();
    ritaForandring();
    notOmMattet();
  }

  function notOmMattet() {
    var post = mattet();
    var ri = omrade(post, RIKET);
    var kb = omrade(post, KUNGSBACKA);
    if (!ri || !kb || ri.forstaAr <= kb.forstaAr) {
      K.sattDataNot("not-matt", "");
      return;
    }
    K.sattDataNot("not-matt",
      "Riket redovisas för det här måttet först från " + esc(ri.forstaAr) +
      ", medan Kungsbacka finns från " + esc(kb.forstaAr) +
      ". Åren dessförinnan går alltså inte att jämföra mot riket.");
  }

  /* ---------- Kort sagt och metadata ---------- */

  function kortSagt() {
    var kommunal = null, hemkommun = null;
    data.kostnadPerElev.forEach(function (m) {
      if (m.nyckel === "kommunal") kommunal = m;
      if (m.nyckel === "hemkommun") hemkommun = m;
    });
    var kb = omrade(kommunal, KUNGSBACKA), ri = omrade(kommunal, RIKET);
    var punkter = [];

    punkter.push("År " + esc(kb.sistaAr) + " kostade en elev i Kungsbackas " +
      "egna grundskolor <strong>" + kronor(kb.sista) + "</strong>.");

    /* Jämförelsen över tid görs på det första år båda områdena har, så
       att kommunens och rikets förändring avser samma period. */
    if (ri) {
      var from = ri.forstaAr;
      var kbFrom = cell(kb, from, "fast"), kbTill = cell(kb, kb.sistaAr, "fast");
      var riFrom = cell(ri, from, "fast"), riTill = cell(ri, ri.sistaAr, "fast");
      punkter.push("I fasta priser har kostnaden per elev stigit <strong>" +
        talSv(100 * (kbTill / kbFrom - 1), 1) + "&nbsp;%</strong> i " +
        "Kungsbacka sedan " + esc(from) + ". I riket steg den " +
        talSv(100 * (riTill / riFrom - 1), 1) + "&nbsp;% under samma år.");
      var diff = cell(kb, kb.sistaAr, "motRiket");
      if (diff !== null) {
        punkter.push("Kungsbacka ligger <strong>" + talSv(Math.abs(diff), 1) +
          "&nbsp;%</strong> " + (diff < 0 ? "under" : "över") + " riket " +
          esc(kb.sistaAr) + ".");
      }
    }

    if (hemkommun) {
      var h = omrade(hemkommun, KUNGSBACKA);
      punkter.push("Räknat på de elever som <em>bor</em> i kommunen &ndash; " +
        "alltså med ersättningen till fristående skolor och andra kommuner " +
        "inräknad &ndash; var kostnaden " + kronor(h.sista) + " per elev " +
        esc(h.sistaAr) + ".");
    }

    punkter.push("Alla belopp är omräknade till " + esc(data.prisniva) +
      " års prisnivå med konsumentprisindex.");

    K.visaKortSagt(punkter);
  }

  function visaKallor() {
    var lista = el("lista-kallor");
    if (!lista) return;
    var kolada = sakerUrl(data.kallaUrl);
    var kpi = sakerUrl(data.kpiKallaUrl);
    lista.innerHTML =
      "<li>" + (kolada
        ? '<a href="' + kolada + '">' + esc(data.kalla) + "</a>"
        : esc(data.kalla)) +
      " &ndash; hämtat ur Koladas öppna API " + esc(data.hamtad) + ".</li>" +
      "<li>" + (kpi
        ? '<a href="' + kpi + '">' + esc(data.kpiKalla) + "</a>"
        : esc(data.kpiKalla)) +
      " &ndash; " + esc(data.kpiMatt) + ", hämtat " + esc(data.kpiHamtad) +
      " och använt för omräkningen till " + esc(data.prisniva) +
      " års prisnivå.</li>";
  }

  /* ---------- Start ---------- */

  function start(inlast) {
    data = inlast;

    K.visaMeta({
      kalla: data.kalla,
      period: data.ar[0] + "–" + data.ar[data.ar.length - 1],
      senaste: String(data.ar[data.ar.length - 1]),
      hamtad: data.hamtad
    });

    fyllValjare();
    beskrivMatt();
    kortSagt();
    ritaOm();
    ritaSlag();
    visaKallor();

    ["matt", "fast", "riket", "index", "forandring", "slag", "kallor", "om"]
      .forEach(function (id) {
        var s = el("sektion-" + id);
        if (s) s.hidden = false;
      });

    K.kopplaValjare(el("matt-valjare"), "matt", ritaOm);

    var upp = el("om-uppdaterad");
    if (upp) {
      upp.textContent = "Kostnaderna hämtades " + data.hamtad +
        " och konsumentprisindex " + data.kpiHamtad + ".";
    }
  }

  K.starta(DATAFIL, { init: start });
})();
