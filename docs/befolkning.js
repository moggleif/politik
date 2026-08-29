/* Barn och unga 0–15 år — enbart faktiskt utfall ur SCB.
   Till skillnad från prognossidorna finns här inga prognossiffror alls:
   varje tal i diagrammen är folkmängd den 31 december ett år som varit.
   Läser docs/data-befolkning.json, byggd av scripts/build_befolkning.py. */
(function () {
  "use strict";

  var K = window.KIS;
  var FARG = K.FARG;
  var PALETT = K.PALETT;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;
  var sakerUrl = K.sakerUrl;

  var DATAFIL = "data-befolkning.json";
  var HUVUD = "0-15";           // sidans huvudgrupp
  var JAMFOR = "16-19";         // gymnasieåldern, som jämförelse

  /* Fast färg per serie — färgen följer gruppen, aldrig dess ordning
     i ett filtrerat urval. */
  var SERIEFARG = {
    "0-15": PALETT[0],
    "16-19": PALETT[1],
    "total": PALETT[2]
  };

  function hittaSerie(data, nyckel) {
    for (var i = 0; i < data.serier.length; i++) {
      if (data.serier[i].nyckel === nyckel) return data.serier[i];
    }
    return null;
  }

  function cell(serie, ar, falt) {
    var r = serie.varden[String(ar)];
    return r ? r[falt] : null;
  }

  /* Gemensamma axel- och rutinställningar, så att de fyra diagrammen
     ser ut som ett system. */
  function basOptions(ytitel, tooltipEtikett) {
    return {
      maintainAspectRatio: false,
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
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
          border: { display: false }
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

  /* ---------- 1. Utvecklingen i antal ---------- */

  function ritaAntal(data) {
    var s = hittaSerie(data, HUVUD);
    var ar = data.ar;
    var ctx = el("diagram-antal");
    ctx.parentElement.style.height = "380px";

    var opt = basOptions("Antal barn och unga 0–15 år", function (it) {
      return talSv(it.parsed.y) + " personer";
    });
    /* Antalet rör sig i ett smalt band högt över noll; en nollskalad
       axel skulle trycka ihop hela rörelsen till en rak linje. Axeln
       börjar därför vid närmaste tusental under lägsta värdet, och det
       står i bildtexten att skalan är beskuren. */
    opt.scales.y.beginAtZero = false;
    opt.scales.y.suggestedMin = Math.floor(s.lagsta / 1000) * 1000;

    new Chart(ctx, {
      type: "line",
      data: {
        labels: ar.map(String),
        datasets: [linjeSerie("0–15 år", SERIEFARG[HUVUD],
          ar.map(function (a) { return cell(s, a, "antal"); }))]
      },
      options: opt
    });

    el("kalla-antal").textContent =
      "Källa: SCB, folkmängd 31 december. Y-axeln börjar inte vid noll.";

    var topp = s.hogsta - s.sista;
    el("slutsats-antal").innerHTML =
      "<p>Antalet barn och unga 0&ndash;15 år var som störst <strong>" +
      esc(s.hogstaAr) + "</strong> (" + talSv(s.hogsta) + " personer) och har sedan dess " +
      "minskat med <strong>" + talSv(topp) + "</strong> personer, till " +
      talSv(s.sista) + " år " + esc(s.sistaAr) + ".</p>";

    tabellAntal(data, s);
  }

  function tabellAntal(data, s) {
    var rader = data.ar.map(function (a) {
      var f = cell(s, a, "forandring");
      return "<tr><th scope=\"row\">" + esc(a) + "</th><td>" + talSv(cell(s, a, "antal")) +
        "</td><td>" + (f === null ? "&ndash;" : (f > 0 ? "+" : "") + talSv(f)) +
        "</td><td>" + talSv(cell(s, a, "andel"), 1) + "&nbsp;%</td></tr>";
    }).join("");
    el("tabell-antal").innerHTML =
      "<thead><tr><th scope=\"col\">År</th><th scope=\"col\">Antal 0&ndash;15 år</th>" +
      "<th scope=\"col\">Förändring</th><th scope=\"col\">Andel av folkmängden</th></tr></thead>" +
      "<tbody>" + rader + "</tbody>";
  }

  /* ---------- 2. Andel av folkmängden ---------- */

  function ritaAndel(data) {
    var a15 = hittaSerie(data, HUVUD), a19 = hittaSerie(data, JAMFOR);
    var ar = data.ar;
    var ctx = el("diagram-andel");
    ctx.parentElement.style.height = "380px";

    var opt = basOptions("Andel av folkmängden (%)", function (it) {
      return it.dataset.label + ": " + talSv(it.parsed.y, 1) + " %";
    });
    opt.plugins.legend.display = true;
    opt.scales.y.beginAtZero = false;

    var chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: ar.map(String),
        datasets: [
          linjeSerie("0–15 år", SERIEFARG[HUVUD],
            ar.map(function (x) { return cell(a15, x, "andel"); })),
          linjeSerie("16–19 år", SERIEFARG[JAMFOR],
            ar.map(function (x) { return cell(a19, x, "andel"); }), [7, 4])
        ]
      },
      options: opt
    });
    K.aktiveraToning(chart);

    el("kalla-andel").textContent =
      "Källa: SCB. Andelen är gruppens storlek delad med hela folkmängden samma år.";

    var f = cell(a15, data.ar[0], "andel"), sist = cell(a15, a15.sistaAr, "andel");
    el("slutsats-andel").innerHTML =
      "<p>Andelen 0&ndash;15-åringar har fallit från <strong>" + talSv(f, 1) +
      "&nbsp;%</strong> år " + esc(data.ar[0]) + " till <strong>" + talSv(sist, 1) +
      "&nbsp;%</strong> år " + esc(a15.sistaAr) + ". Gruppen har alltså vuxit långsammare " +
      "än kommunen i övrigt &ndash; en del år har den krympt medan folkmängden ökat.</p>";

    tabellAndel(data, a15, a19);
  }

  function tabellAndel(data, a15, a19) {
    var rader = data.ar.map(function (a) {
      return "<tr><th scope=\"row\">" + esc(a) + "</th><td>" +
        talSv(cell(a15, a, "andel"), 1) + "&nbsp;%</td><td>" +
        talSv(cell(a19, a, "andel"), 1) + "&nbsp;%</td></tr>";
    }).join("");
    el("tabell-andel").innerHTML =
      "<thead><tr><th scope=\"col\">År</th><th scope=\"col\">0&ndash;15 år</th>" +
      "<th scope=\"col\">16&ndash;19 år</th></tr></thead><tbody>" + rader + "</tbody>";
  }

  /* ---------- 3. Förändring år för år ---------- */

  function ritaForandring(data) {
    var s = hittaSerie(data, HUVUD);
    /* Första året saknar föregående år att jämföras med. */
    var ar = data.ar.slice(1);
    var varden = ar.map(function (a) { return cell(s, a, "forandring"); });
    var ctx = el("diagram-forandring");
    ctx.parentElement.style.height = "360px";

    var opt = basOptions("Förändring mot föregående år (personer)", function (it) {
      var v = it.parsed.y;
      return (v > 0 ? "+" : "") + talSv(v) + " personer";
    });
    opt.scales.y.grid.color = function (c) {
      return c.tick.value === 0 ? FARG.baseline : FARG.grid;
    };

    new Chart(ctx, {
      type: "bar",
      data: {
        labels: ar.map(String),
        datasets: [{
          label: "Förändring",
          data: varden,
          /* Tvåpolig skala: ökning och minskning är motsatta tillstånd,
             inte två kategorier. Neutral nolllinje däremellan. */
          backgroundColor: varden.map(function (v) {
            return v >= 0 ? FARG.bla : FARG.rod;
          }),
          borderWidth: 0,
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: opt
    });

    el("kalla-forandring").textContent =
      "Källa: SCB. Blå stapel = fler barn och unga än året innan, röd = färre.";

    var minskande = varden.filter(function (v) { return v < 0; }).length;
    el("slutsats-forandring").innerHTML =
      "<p>Av " + varden.length + " år har gruppen minskat under <strong>" +
      minskande + "</strong> av dem. Minskningen är alltså inte en enstaka " +
      "svacka utan ett återkommande mönster under senare år.</p>";

    var rader = ar.map(function (a, i) {
      var v = varden[i];
      return "<tr><th scope=\"row\">" + esc(a) + "</th><td>" +
        (v > 0 ? "+" : "") + talSv(v) + "</td></tr>";
    }).join("");
    el("tabell-forandring").innerHTML =
      "<thead><tr><th scope=\"col\">År</th><th scope=\"col\">Förändring</th></tr></thead>" +
      "<tbody>" + rader + "</tbody>";
  }

  /* ---------- 4. Jämförelse, index ---------- */

  function ritaIndex(data) {
    var ar = data.ar;
    var ctx = el("diagram-index");
    ctx.parentElement.style.height = "380px";

    var opt = basOptions("Index, " + ar[0] + " = 100", function (it) {
      return it.dataset.label + ": " + talSv(it.parsed.y, 1);
    });
    opt.plugins.legend.display = true;
    opt.scales.y.beginAtZero = false;

    var streck = { "0-15": [], "16-19": [7, 4], "total": [2, 3] };
    var dataset = data.serier.map(function (s) {
      return linjeSerie(s.etikett, SERIEFARG[s.nyckel],
        ar.map(function (a) { return cell(s, a, "index"); }), streck[s.nyckel]);
    });

    var chart = new Chart(ctx, {
      type: "line",
      data: { labels: ar.map(String), datasets: dataset },
      options: opt
    });
    K.aktiveraToning(chart);

    el("kalla-index").textContent =
      "Källa: SCB. Varje serie är satt till 100 år " + ar[0] +
      ", så att grupper av olika storlek går att jämföra i samma bild.";

    var a15 = hittaSerie(data, HUVUD), tot = hittaSerie(data, "total");
    el("slutsats-index").innerHTML =
      "<p>Sedan " + esc(ar[0]) + " har hela folkmängden vuxit till index <strong>" +
      talSv(cell(tot, tot.sistaAr, "index"), 1) + "</strong>, medan 0&ndash;15-åringarna " +
      "bara nått <strong>" + talSv(cell(a15, a15.sistaAr, "index"), 1) +
      "</strong>. Kommunen växer alltså, men inte i barnkullarna.</p>";

    var rader = ar.map(function (a) {
      return "<tr><th scope=\"row\">" + esc(a) + "</th>" + data.serier.map(function (s) {
        return "<td>" + talSv(cell(s, a, "index"), 1) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    el("tabell-index").innerHTML =
      "<thead><tr><th scope=\"col\">År</th>" + data.serier.map(function (s) {
        return "<th scope=\"col\">" + esc(s.etikett) + "</th>";
      }).join("") + "</tr></thead><tbody>" + rader + "</tbody>";
  }

  /* ---------- Kort sagt och metadata ---------- */

  function kortSagt(data) {
    var a15 = hittaSerie(data, HUVUD), tot = hittaSerie(data, "total");
    var forstaAndel = cell(a15, data.ar[0], "andel");
    var sistaAndel = cell(a15, a15.sistaAr, "andel");
    var sedanTopp = a15.hogsta - a15.sista;

    K.visaKortSagt([
      "År " + esc(a15.sistaAr) + " fanns <strong>" + talSv(a15.sista) +
        "</strong> barn och unga 0&ndash;15 år i Kungsbacka.",
      "Gruppen var som störst <strong>" + esc(a15.hogstaAr) + "</strong> och har sedan dess " +
        "minskat med " + talSv(sedanTopp) + " personer.",
      "Andelen av befolkningen har fallit från " + talSv(forstaAndel, 1) +
        "&nbsp;% till <strong>" + talSv(sistaAndel, 1) + "&nbsp;%</strong> sedan " +
        esc(data.ar[0]) + ".",
      "Under samma tid växte hela folkmängden från " + talSv(tot.forsta) + " till " +
        talSv(tot.sista) + " invånare."
    ]);
  }

  /* ---------- Start ---------- */

  function start(data) {
    K.visaMeta({
      kalla: data.kalla,
      period: data.ar[0] + "–" + data.ar[data.ar.length - 1],
      senaste: String(data.ar[data.ar.length - 1]),
      hamtad: data.hamtad
    });

    kortSagt(data);
    ritaAntal(data);
    ritaAndel(data);
    ritaForandring(data);
    ritaIndex(data);

    ["antal", "andel", "forandring", "index", "kallor", "om"].forEach(function (id) {
      var s = el("sektion-" + id);
      if (s) s.hidden = false;
    });

    var lista = el("lista-kallor");
    if (lista) {
      var kallaUrl = sakerUrl(data.kallaUrl);
      lista.innerHTML =
        "<li>" + (kallaUrl
          ? '<a href="' + kallaUrl + '">' + esc(data.kalla) + '</a>'
          : esc(data.kalla)) +
        ' &ndash; folkmängd 31 december, hämtad ur SCB:s öppna API ' +
        esc(data.hamtad) + ".</li>";
    }
    var upp = el("om-uppdaterad");
    if (upp) upp.textContent = "Datat på den här sidan hämtades " + data.hamtad + ".";
  }

  K.starta(DATAFIL, { init: start });
})();
