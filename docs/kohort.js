/* Kohortframskrivningen på 16–19-årssidan – läses bara av
   gymnasiealdern.html, efter gemensam.js och före app.js. Registrerar
   K.kohortInit, som app.js anropar när datat är läst; på sidor utan
   den här filen (totalsidan) finns varken funktionen eller kohortdatat,
   och app.js hoppar då över den. */
(function () {
  "use strict";

  var K = window.KIS;
  var FARG = K.FARG;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;

  var KONF = document.body.dataset;
  var ENHET = KONF.enhet || "invånare";                 // "invånare" / "ungdomar"
  var ENHET_LANG = KONF.enhetLang || "Antal invånare";  // axelrubrik

  /* ---------- Kohortframskrivningen ----------
     Barnen som redan bor i kommunen blir ett år äldre varje år, så
     antalet 16–19-åringar om k år är summan av dagens 16−k … 19−k-åringar.
     Ingen modell, inga antaganden – men också ingen in- eller utflyttning,
     vilket är precis vad skillnaden mot utfallet mäter. Sektionerna finns
     bara på åldersgruppssidan, och datat bara i dess datafil, så båda
     kontrolleras innan något ritas. */

  function kohortAr(data) {
    var k = data.kohort;
    var utfallAr = Object.keys(data.utfall).map(Number);
    var sistaUtfall = Math.max.apply(null, utfallAr);
    /* Några år bakåt som sammanhang, sedan hela framskrivningen. */
    var ar = [];
    for (var a = sistaUtfall - 8; a <= k.sistaAr; a++) ar.push(a);
    return ar;
  }

  function initKohort(data) {
    if (!data.kohort || !el("diagram-kohort")) return;
    var k = data.kohort;
    var ar = kohortAr(data);
    var senaste = data.prognoser.filter(function (p) {
      return p.prognosAr === k.senastePrognosAr;
    })[0];

    var dataset = [K.utfallDataset(data, ar)];
    if (senaste) {
      dataset.push({
        label: "Kommunens prognos " + senaste.prognosAr,
        data: ar.map(function (a) {
          var v = senaste.prognos[String(a)];
          return v === undefined ? null : v;
        }),
        borderColor: FARG.bla,
        backgroundColor: FARG.bla,
        borderWidth: 2,
        borderDash: [7, 4],
        pointStyle: "rect",
        pointRadius: 3,
        pointHoverRadius: 6,
        spanGaps: false,
        tension: 0.1
      });
    }
    dataset.push(kohortDataset(data, ar, 3));

    var ctx = el("diagram-kohort");
    ctx.parentElement.style.height = "420px";
    new Chart(ctx, {
      type: "line",
      data: { labels: ar.map(String), datasets: dataset },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        locale: "sv-SE",
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: true, position: "bottom",
                    labels: { boxWidth: 22, usePointStyle: true } },
          tooltip: {
            callbacks: {
              title: function (it) { return "År " + it[0].label; },
              label: function (it) {
                return it.dataset.label + ": " +
                  (it.parsed.y === null ? "–"
                    : talSv(it.parsed.y) + " " + ENHET);
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { color: FARG.baseline },
               ticks: { maxRotation: 0, autoSkipPadding: 12 } },
          y: { title: { display: true, text: ENHET_LANG, color: FARG.muted },
               grid: { color: FARG.grid }, border: { color: FARG.baseline },
               ticks: { callback: function (v) { return talSv(v); } } }
        }
      }
    });

    el("kalla-kohort").textContent =
      "Orange linje: SCB:s folkmängd per enskild ålder den 31 december " +
      k.basAr + ", framskriven ett år i taget. Sista året som går att " +
      "skriva fram är " + k.sistaAr + " – då är det " + k.basAr +
      " års nyfödda som fyller " + k.aldrar[1] + ".";

    /* Vad framskrivningen medvetet utelämnar, med siffror på hur mycket
       det historiskt har betytt. */
    var kort = k.traffsakerhet[0];
    var langt = k.traffsakerhet[k.traffsakerhet.length - 1];
    /* Riktningen på felet skiftar med horisonten, så den får inte
       sammanfattas till ett håll: på ett par års sikt flyttar en del
       18–19-åringar ut, på lång sikt flyttar det in fler barnfamiljer
       än det flyttar ut. Båda tecknen läses ur datat. */
    function riktning(r) {
      return (r.medelPct > 0 ? "för högt" : "för lågt") + " (" +
        (r.medelPct > 0 ? "+" : "−") + talSv(Math.abs(r.medelPct), 1) + " %)";
    }
    K.sattDataNot("not-kohort",
      "Framskrivningen räknar <strong>varken in- eller utflyttning</strong> " +
      "och ingen dödlighet. Den säger hur många som skulle bli " +
      esc(k.aldrar[0]) + "–" + esc(k.aldrar[1]) + " år om ingen flyttade. Historiskt " +
      "har den missat med i snitt " + talSv(kort.medelAbsPct, 1) + " % ett år " +
      "framåt och " + talSv(langt.medelAbsPct, 1) + " % " + esc(langt.avstand) +
      " år framåt. Riktningen skiftar: ett år framåt har den legat " +
      riktning(kort) + ", " + esc(langt.avstand) + " år framåt " + riktning(langt) +
      (langt.medelPct < 0
        ? " – på den sikten hinner det flytta in fler barnfamiljer än det " +
          "flyttar ut, och framskrivningen blir snarare en <em>undre gräns</em> " +
          "än en prognos."
        : "."));

    /* Slutsats: var kommunens prognos ligger i förhållande till de barn
       som redan bor här. */
    var mot = k.motSenaste;
    if (mot.length && senaste) {
      var under = mot.filter(function (r) { return r.diff < 0; });
      var forsta = mot[0];
      var txt = "<p>Om ingen flyttade skulle Kungsbacka ha <strong>" +
        talSv(k.framskrivning[String(forsta.ar)]) + "</strong> " + ENHET +
        " i åldern " + esc(k.aldrar[0]) + "–" + esc(k.aldrar[1]) + " år " + esc(forsta.ar) +
        " – de finns redan i kommunen, de är bara yngre än så. År " +
        esc(k.sistaAr) + " är samma tal <strong>" +
        talSv(k.framskrivning[String(k.sistaAr)]) + "</strong>, en minskning " +
        "med " + talSv(Math.round(100 * (1 -
          k.framskrivning[String(k.sistaAr)] /
          k.framskrivning[String(forsta.ar)])), 0) + " %.</p>";
      if (under.length) {
        var storst = under.reduce(function (a, b) {
          return Math.abs(b.diff) > Math.abs(a.diff) ? b : a;
        });
        var storstPct = 100 * Math.abs(storst.diff) / storst.kohort;
        txt += "<p>Kommunens prognos från " + esc(senaste.prognosAr) + " ligger " +
          "<strong>under</strong> framskrivningen för " +
          (under.length === 1 ? "år " + esc(under[0].ar)
            : esc(under[0].ar) + "–" + esc(under[under.length - 1].ar)) +
          " – som mest " + talSv(Math.abs(storst.diff)) + " " + ENHET +
          " (" + talSv(storstPct, 1) + " %) år " + esc(storst.ar) + ". För att " +
          "den ska slå in krävs alltså en nettoutflyttning i de åldrarna. " +
          "Det sker – framskrivningen har legat " + talSv(kort.medelPct, 1) +
          " % för högt ett år framåt – men i en helt annan storleksordning " +
          "än den skillnaden.</p>";
      }
      el("slutsats-kohort").innerHTML = txt;
    }

    var tabell = "<caption>Kohortframskrivningen jämförd med kommunens " +
      "senaste prognos, antal " + ENHET + ".</caption>" +
      "<thead><tr><th scope=\"col\">År</th>" +
      "<th scope=\"col\">Kohortframskrivning</th>" +
      "<th scope=\"col\">Åldrar " + esc(k.basAr) + "</th>" +
      "<th scope=\"col\">Kommunens prognos</th>" +
      "<th scope=\"col\">Skillnad</th></tr></thead><tbody>";
    Object.keys(k.framskrivning).map(Number).sort(function (a, b) { return a - b; })
      .forEach(function (a) {
        var rad = mot.filter(function (r) { return r.ar === a; })[0];
        var kallor = k.ursprung[String(a)];
        tabell += "<tr><th scope=\"row\">" + a + "</th><td>" +
          talSv(k.framskrivning[String(a)]) + "</td><td>" +
          esc(kallor[0].alder) + "–" + esc(kallor[kallor.length - 1].alder) + " år</td><td>" +
          (rad ? talSv(rad.kommun) : "–") + "</td><td>" +
          (rad ? (rad.diff > 0 ? "+" : "−") + talSv(Math.abs(rad.diff)) : "–") +
          "</td></tr>";
      });
    el("tabell-kohort").innerHTML = tabell + "</tbody>";
    el("sektion-kohort").hidden = false;
  }

  /* Den orange linjen, återanvänd i tre diagram. `bredd` skiljer det
     diagram där den är huvudsaken från dem där den är en linje bland
     många. */
  function kohortDataset(data, ar, bredd) {
    var f = data.kohort.framskrivning;
    return {
      label: "Kohortframskrivning (SCB " + data.kohort.basAr + ")",
      data: ar.map(function (a) {
        return f[String(a)] === undefined ? null : f[String(a)];
      }),
      borderColor: FARG.orange,
      backgroundColor: FARG.orange,
      borderWidth: bredd,
      pointStyle: "triangle",
      pointRadius: bredd > 2 ? 3 : 0,
      pointHoverRadius: 6,
      spanGaps: false,
      tension: 0.1
    };
  }

  /* Alla kohortårgångar i en egen bild. Kommunens prognoser ligger i sitt
     eget spagettidiagram: två linjeknippen med var sin ramp i samma
     diagram går inte att skilja åt, hur bra färgerna än är valda. */
  function initKohortAlla(data) {
    if (!data.kohort || !el("diagram-kohortalla")) return;
    var argangar = data.kohort.argangar || [];
    if (argangar.length < 2) return;

    var utfallAr = Object.keys(data.utfall).map(Number);
    var forsta = Math.min.apply(null, argangar.map(function (a) { return a.basAr; }));
    var sista = Math.max.apply(null, argangar.map(function (a) { return a.sistaAr; }));
    var ar = [];
    for (var a = forsta; a <= sista; a++) ar.push(a);

    var dataset = argangar.map(function (arg, i) {
      return {
        label: "Framskrivning från " + arg.basAr,
        data: ar.map(function (y) {
          var v = arg.framskrivning[String(y)];
          return v === undefined ? null : v;
        }),
        borderColor: K.rampFargOrange(i, argangar.length),
        backgroundColor: K.rampFargOrange(i, argangar.length),
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        spanGaps: false,
        tension: 0.1
      };
    });
    dataset.push(K.utfallDataset(data, ar));

    var ctx = el("diagram-kohortalla");
    ctx.parentElement.style.height = "440px";
    var chart = new Chart(ctx, {
      type: "line",
      data: { labels: ar.map(String), datasets: dataset },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        locale: "sv-SE",
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: {
            display: true,
            labels: {
              /* Sammanfatta rampen till sina ändpunkter, som i
                 prognosdiagrammet – tolv poster ryms inte. */
              generateLabels: function () {
                var n = argangar.length;
                return [
                  { text: "Faktiskt utfall (SCB)", strokeStyle: FARG.ink,
                    fillStyle: FARG.ink, lineWidth: 3 },
                  { text: "Äldsta framskrivningen (" + argangar[0].basAr + ")",
                    strokeStyle: K.rampFargOrange(0, n),
                    fillStyle: K.rampFargOrange(0, n), lineWidth: 2 },
                  { text: "Senaste framskrivningen (" + argangar[n - 1].basAr + ")",
                    strokeStyle: K.rampFargOrange(n - 1, n),
                    fillStyle: K.rampFargOrange(n - 1, n), lineWidth: 2 }
                ];
              }
            }
          },
          tooltip: {
            callbacks: {
              title: function (it) { return "År " + it[0].label; },
              label: function (it) {
                return it.dataset.label + ": " + talSv(it.parsed.y) + " " + ENHET;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { color: FARG.baseline },
               ticks: { maxRotation: 0, autoSkipPadding: 12 } },
          y: { title: { display: true, text: ENHET_LANG, color: FARG.muted },
               grid: { color: FARG.grid }, border: { color: FARG.baseline },
               ticks: { callback: function (v) { return talSv(v); } } }
        }
      }
    });
    K.aktiveraToning(chart, false);

    el("kalla-kohortalla").textContent =
      "Varje orange linje är dagens åldersklasser ett visst år, framskrivna " +
      "ett år i taget. Årgångarna börjar " + argangar[0].basAr + " – det är " +
      "folkmängden kommunens första prognos hade att utgå från. Peka på en " +
      "linje så tonas de övriga ned.";

    /* Vad bilden faktiskt visar: årgångarna ligger på rad under varandra,
       eftersom var och en saknar den inflyttning som hann ske efteråt. */
    var med = argangar.filter(function (a) { return a.medelAbsPct !== null; });
    var txt = "";
    if (med.length) {
      var bast = med.reduce(function (x, y) {
        return y.medelAbsPct < x.medelAbsPct ? y : x;
      });
      var langst = med.reduce(function (x, y) {
        return (y.maxAvstand || 0) > (x.maxAvstand || 0) ? y : x;
      });
      txt += "<p><strong>" + argangar.length + "</strong> årgångar, en per " +
        "årsskifte från " + esc(argangar[0].basAr) + " till " +
        esc(argangar[argangar.length - 1].basAr) + ". Den äldsta (" +
        esc(langst.basAr) + ") går att pröva " + esc(langst.maxAvstand) + " år framåt " +
        "och har då missat med i snitt " + talSv(langst.medelAbsPct, 1) +
        " %; " + esc(bast.basAr) + " års årgång är den träffsäkraste så här långt (" +
        talSv(bast.medelAbsPct, 1) + " %).</p>";
    }
    txt += "<p>Linjerna ligger på rad under varandra, och det är hela " +
      "poängen: varje årgång saknar den inflyttning som hann ske efter dess " +
      "basår. Avståndet mellan två årgångar är alltså inte modellfel utan " +
      "just den flyttning som modellen medvetet utelämnar. Ju längre höger " +
      "i diagrammet, desto mer hinner samlas.</p>";
    el("slutsats-kohortalla").innerHTML = txt;

    var tab = "<caption>Faktiskt utfall och samtliga kohortframskrivningar, " +
      "antal " + ENHET + ".</caption><thead><tr><th scope=\"col\">År</th>" +
      "<th scope=\"col\">Utfall (SCB)</th>";
    argangar.forEach(function (arg) {
      tab += "<th scope=\"col\">Från " + esc(arg.basAr) + "</th>";
    });
    tab += "</tr></thead><tbody>";
    ar.forEach(function (y) {
      var u = data.utfall[String(y)];
      tab += "<tr><th scope=\"row\">" + y + "</th><td>" +
        (u === undefined ? "–" : talSv(u)) + "</td>";
      argangar.forEach(function (arg) {
        var v = arg.framskrivning[String(y)];
        tab += "<td>" + (v === undefined ? "–" : talSv(v)) + "</td>";
      });
      tab += "</tr>";
    });
    el("tabell-kohortalla").innerHTML = tab + "</tbody>";
    el("sektion-kohortalla").hidden = false;
  }

  /* ---------- Kvoterna: vad deltat mellan årgångarna består av ----------
     r(a) = N(a+1, T+1) / N(a, T) — hur mycket en åldersklass växer på ett
     år. Det är hela skillnaden mellan två framskrivningsårgångar, och den
     är ett procenttal per ålder, inte ett enda tal. */

  function initKvoter(data) {
    if (!data.kohort || !data.kohort.kvoter || !el("diagram-kvoter")) return;
    var q = data.kohort.kvoter;
    if (!q.length) return;

    var etiketter = q.map(function (r) { return r.alder + "→" + (r.alder + 1); });
    var ctx = el("diagram-kvoter");
    ctx.parentElement.style.height = "400px";
    new Chart(ctx, {
      data: {
        labels: etiketter,
        datasets: [
          {
            /* Spannet ritas som flytande staplar bakom medelvärdet, så
               att stabiliteten syns: ett smalt spann betyder att kvoten
               varit ungefär densamma varje år. */
            type: "bar",
            label: "Svagaste till starkaste året",
            data: q.map(function (r) { return [r.minPct, r.maxPct]; }),
            backgroundColor: "rgba(230,159,0,0.25)",
            borderWidth: 0,
            borderRadius: 3,
            order: 2
          },
          {
            type: "line",
            label: "Genomsnitt",
            data: q.map(function (r) { return r.nettoPct; }),
            borderColor: FARG.orangeMork,
            backgroundColor: FARG.orangeMork,
            borderWidth: 3,
            pointRadius: 3,
            pointHoverRadius: 6,
            tension: 0.1,
            order: 1
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        locale: "sv-SE",
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: true, position: "bottom", labels: { boxWidth: 22 } },
          tooltip: {
            callbacks: {
              title: function (it) {
                var r = q[it[0].dataIndex];
                return r.alder + " år → " + (r.alder + 1) + " år";
              },
              label: function (it) {
                var r = q[it.dataIndex];
                if (it.dataset.type === "bar") {
                  return "Spann: " + tecknat(r.minPct) + " till " + tecknat(r.maxPct);
                }
                return "Genomsnitt: " + tecknat(r.nettoPct) + " per år (" +
                  r.antal + " år)";
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { color: FARG.baseline },
               title: { display: true, text: "Åldersklassens steg", color: FARG.muted },
               ticks: { autoSkip: false, maxRotation: 90, minRotation: 45 } },
          y: { title: { display: true, text: "Förändring på ett år (%)", color: FARG.muted },
               grid: { color: FARG.grid }, border: { display: false },
               ticks: { callback: function (v) { return tecknat(v); } } }
        }
      }
    });

    var storst = q.reduce(function (a, b) { return b.nettoPct > a.nettoPct ? b : a; });
    var minst = q.reduce(function (a, b) { return b.nettoPct < a.nettoPct ? b : a; });
    var ar = data.kohort.kvotAr || [];
    el("kalla-kvoter").textContent =
      "Källa: SCB:s folkmängd per enskild ålder" +
      (ar.length === 2 ? ", årsskiftena " + ar[0] + "–" + ar[1] : "") +
      ". Geometriskt medel, eftersom kvoterna multipliceras ihop.";

    el("slutsats-kvoter").innerHTML =
      "<p>Svaret på frågan är alltså: <strong>ja, det är ett procenttal " +
      "&ndash; men ett per ålder.</strong> Störst är det för de allra " +
      "yngsta: en årskull " + esc(storst.alder) + "-åringar är " +
      tecknat(storst.nettoPct) + " större när den fyller " +
      esc(storst.alder + 1) + ". Sedan faller det snabbt och planar ut kring " +
      "noll i tonåren, för att bli tydligt negativt i steget " +
      esc(minst.alder) + "→" + esc(minst.alder + 1) + " år (" + tecknat(minst.nettoPct) +
      ") &ndash; då flyttar ungdomarna hemifrån.</p>" +
      "<p>Det här är barnfamiljer som flyttar in, inte fler födda: kurvan " +
      "gäller barn som redan är födda och bara byter kommun. Spannen visar " +
      "att mönstret är stabilt &ndash; det är samma bild år efter år, " +
      "inte enskilda utfall.</p>";

    el("tabell-kvoter").innerHTML =
      "<caption>Årlig förändring per åldersklass, i procent.</caption>" +
      "<thead><tr><th scope=\"col\">Steg</th><th scope=\"col\">Genomsnitt</th>" +
      "<th scope=\"col\">Svagaste året</th><th scope=\"col\">Starkaste året</th>" +
      "<th scope=\"col\">Antal år</th></tr></thead><tbody>" +
      q.map(function (r) {
        return "<tr><th scope=\"row\">" + esc(r.alder) + " → " + esc(r.alder + 1) +
          " år</th><td>" + tecknat(r.nettoPct) + "</td><td>" +
          tecknat(r.minPct) + "</td><td>" + tecknat(r.maxPct) + "</td><td>" +
          esc(r.antal) + "</td></tr>";
      }).join("") + "</tbody>";
    el("sektion-kvoter").hidden = false;
  }

  function tecknat(v) {
    return (v > 0 ? "+" : v < 0 ? "−" : "") + talSv(Math.abs(v), 1) + " %";
  }

  /* ---------- Den kompenserade framskrivningen ---------- */

  function initKompenserad(data) {
    if (!data.kohort || !data.kohort.kompenserad || !el("diagram-kompenserad")) return;
    var k = data.kohort;
    var komp = k.kompenserad;
    if (!Object.keys(komp).length) return;

    var ar = kohortAr(data);
    var senaste = data.prognoser.filter(function (p) {
      return p.prognosAr === k.senastePrognosAr;
    })[0];

    var dataset = [K.utfallDataset(data, ar)];
    if (senaste) {
      dataset.push({
        label: "Kommunens prognos " + senaste.prognosAr,
        data: ar.map(function (a) {
          var v = senaste.prognos[String(a)];
          return v === undefined ? null : v;
        }),
        borderColor: FARG.bla, backgroundColor: FARG.bla,
        borderWidth: 2, borderDash: [7, 4], pointStyle: "rect",
        pointRadius: 3, pointHoverRadius: 6, spanGaps: false, tension: 0.1
      });
    }
    dataset.push({
      label: "Enkel framskrivning",
      data: ar.map(function (a) {
        var v = k.framskrivning[String(a)];
        return v === undefined ? null : v;
      }),
      borderColor: FARG.orange, backgroundColor: FARG.orange,
      borderWidth: 2, borderDash: [2, 3], pointStyle: "triangle",
      pointRadius: 0, pointHoverRadius: 6, spanGaps: false, tension: 0.1
    });
    dataset.push({
      label: "Kompenserad framskrivning",
      data: ar.map(function (a) {
        var v = komp[String(a)];
        return v === undefined ? null : v;
      }),
      borderColor: FARG.orangeMork, backgroundColor: FARG.orangeMork,
      borderWidth: 3, pointStyle: "triangle",
      pointRadius: 3, pointHoverRadius: 6, spanGaps: false, tension: 0.1
    });

    var ctx = el("diagram-kompenserad");
    ctx.parentElement.style.height = "440px";
    new Chart(ctx, {
      type: "line",
      data: { labels: ar.map(String), datasets: dataset },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        locale: "sv-SE",
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: true, position: "bottom",
                    labels: { boxWidth: 22, usePointStyle: true } },
          tooltip: {
            callbacks: {
              title: function (it) { return "År " + it[0].label; },
              label: function (it) {
                return it.dataset.label + ": " +
                  (it.parsed.y === null ? "–" : talSv(it.parsed.y) + " " + ENHET);
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { color: FARG.baseline },
               ticks: { maxRotation: 0, autoSkipPadding: 12 } },
          y: { title: { display: true, text: ENHET_LANG, color: FARG.muted },
               grid: { color: FARG.grid }, border: { color: FARG.baseline },
               ticks: { callback: function (v) { return talSv(v); } } }
        }
      }
    });

    el("kalla-kompenserad").textContent =
      "Båda framskrivningarna utgår från åldersklasserna " + k.basAr +
      ". Den kompenserade multiplicerar varje kohort med kvoten för varje " +
      "år den åldras.";

    K.sattDataNot("not-kompenserad",
      "Den kompenserade framskrivningen är <strong>inte</strong> längre " +
      "fri från antaganden. Den förutsätter att flyttmönstret består. " +
      "Håller det inte &ndash; för att bostadsbyggandet ändras, eller för " +
      "att kommunen blir mindre attraktiv för barnfamiljer &ndash; slår " +
      "den fel åt precis det håll som antagandet lutar. Den enkla " +
      "framskrivningen har kvar sitt värde just därför att den inte " +
      "antar något alls.");

    var sista = k.sistaAr;
    var lyft = komp[String(sista)] - k.framskrivning[String(sista)];
    var forsta = k.basAr + 1;
    var jam = (k.jamforelse || []).filter(function (r) {
      return r.kompenseradAbsPct !== undefined && r.kompenseradAbsPct !== null;
    });
    /* Första året är korrigeringen negativ: där dominerar 18-åringarna
       som flyttar hemifrån. Formuleringen måste klara båda tecknen. */
    var forstaDiff = komp[String(forsta)] - k.framskrivning[String(forsta)];
    var txt = "<p>Kompensationen lyfter framskrivningen med <strong>" +
      talSv(lyft) + "</strong> " + ENHET + " år " + esc(sista) + " (" +
      talSv(100 * lyft / k.framskrivning[String(sista)], 1) + " %). År " +
      esc(forsta) + " gör den tvärtom: " +
      (forstaDiff < 0
        ? "där <strong>drar</strong> den ned framskrivningen med " +
          talSv(Math.abs(forstaDiff)) + " " + ENHET + ", eftersom det som " +
          "hinner hända på ett år framför allt är att 18-åringar flyttar " +
          "hemifrån"
        : "där lyfter den bara " + talSv(forstaDiff) + " " + ENHET) +
      ". Ju längre fram, desto fler år med små barn hinner räknas in, och " +
      "då tar inflyttningen över &ndash; kvoterna multipliceras ihop ett " +
      "år i taget.</p>";
    if (jam.length) {
      var langst = jam[jam.length - 1];
      txt += "<p>Prövad bakåt, med kvoter skattade enbart ur åren före varje " +
        "basår, halverar kompensationen felet på lång sikt: " +
        esc(langst.avstand) + " år framåt " + talSv(langst.kompenseradAbsPct, 1) +
        " % mot den enkla framskrivningens " + talSv(langst.kohortAbsPct, 1) +
        " %. På kort sikt gör den ingen nytta &ndash; där är korrigeringen " +
        "mindre än bruset.</p>";
    }
    el("slutsats-kompenserad").innerHTML = txt;

    var rader = Object.keys(komp).map(Number)
      .sort(function (a, b) { return a - b; });
    var tab = "<caption>Enkel och kompenserad framskrivning, med kommunens " +
      "senaste prognos, antal " + ENHET + ".</caption><thead><tr>" +
      "<th scope=\"col\">År</th><th scope=\"col\">Enkel</th>" +
      "<th scope=\"col\">Kompenserad</th><th scope=\"col\">Skillnad</th>" +
      "<th scope=\"col\">Kommunens prognos</th></tr></thead><tbody>";
    rader.forEach(function (a) {
      var e = k.framskrivning[String(a)];
      var c = komp[String(a)];
      var pv = senaste ? senaste.prognos[String(a)] : undefined;
      tab += "<tr><th scope=\"row\">" + a + "</th><td>" +
        (e === undefined ? "–" : talSv(e)) + "</td><td>" + talSv(c) +
        "</td><td>" + (e === undefined ? "–" : "+" + talSv(c - e)) +
        "</td><td>" + (pv === undefined ? "–" : talSv(pv)) + "</td></tr>";
    });
    el("tabell-kompenserad").innerHTML = tab + "</tbody>";
    el("sektion-kompenserad").hidden = false;
  }

  /* ---------- Modellvarianter ----------
     Samma framskrivning med två rattar: hur långt tillbaka kvoterna
     hämtas, och hur många år som lämnas okompenserade. Alla varianter
     räknas fram med samma regler och redovisas med sitt utfall, också de
     sämre — annars vore det bara att välja i efterhand. */

  function initVarianter(data) {
    if (!data.kohort || !data.kohort.varianter || !el("diagram-varianter")) return;
    var v = data.kohort.varianter;
    var mod = v.modeller || [];
    if (mod.length < 2) return;

    var horisonter = [];
    mod.forEach(function (m) {
      m.perAvstand.forEach(function (r) {
        if (horisonter.indexOf(r.avstand) === -1) horisonter.push(r.avstand);
      });
    });
    horisonter.sort(function (a, b) { return a - b; });

    function felFor(m, k) {
      for (var i = 0; i < m.perAvstand.length; i++) {
        if (m.perAvstand[i].avstand === k) return m.perAvstand[i];
      }
      return null;
    }

    var ctx = el("diagram-varianter");
    ctx.parentElement.style.height = "440px";
    new Chart(ctx, {
      type: "line",
      data: {
        labels: horisonter.map(String),
        datasets: mod.map(function (m, i) {
          var farg = K.rampFargOrange(i, mod.length);
          return {
            label: m.namn,
            data: horisonter.map(function (k) {
              var r = felFor(m, k);
              return r ? r.medelAbsPct : null;
            }),
            borderColor: farg,
            backgroundColor: farg,
            borderWidth: 2,
            borderDash: K.STRECK[i % K.STRECK.length],
            pointStyle: ["circle", "rect", "triangle", "rectRot", "star"][i % 5],
            pointRadius: 3,
            pointHoverRadius: 6,
            spanGaps: false,
            tension: 0.1
          };
        })
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        locale: "sv-SE",
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: true, position: "bottom",
                    labels: { boxWidth: 22, usePointStyle: true } },
          tooltip: {
            callbacks: {
              title: function (it) {
                var k = horisonter[it[0].dataIndex];
                var r = felFor(mod[0], k);
                return k + " år framåt" + (r ? " (" + r.antal + " jämförelser)" : "");
              },
              label: function (it) {
                return it.dataset.label + ": " +
                  (it.parsed.y === null ? "–" : talSv(it.parsed.y, 1) + " % fel");
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { color: FARG.baseline },
               title: { display: true, text: "Antal år i förväg", color: FARG.muted } },
          y: { beginAtZero: true,
               title: { display: true, text: "Genomsnittligt absolut fel (%)", color: FARG.muted },
               grid: { color: FARG.grid }, border: { display: false },
               ticks: { callback: function (x) { return talSv(x, 0) + " %"; } } }
        }
      }
    });

    el("kalla-varianter").textContent =
      "Genomsnittligt fel utan tecken, ur " + v.antalBasAr + " basår (" +
      v.basAr[0] + "–" + v.basAr[1] + ") mot varje senare år med känt " +
      "utfall: " + mod[0].antal + " jämförelser per variant.";

    /* Vilken variant som vinner räknas fram, den skrivs inte in. */
    var ordnad = mod.slice().sort(function (a, b) {
      return a.medelAbsPct - b.medelAbsPct;
    });
    var bast = ordnad[0], samst = ordnad[ordnad.length - 1];
    /* Flera varianter kan sluta lika. Att utropa en av dem till vinnare
       vore att låtsas om en skillnad som materialet inte visar. */
    var delad = ordnad.filter(function (m) {
      return m.medelAbsPct - bast.medelAbsPct < 0.05;
    });
    var hela = mod.filter(function (m) {
      return m.nyckel === "hela";
    })[0];
    var fonster = mod.filter(function (m) {
      return m.fonster && !m.fordrojning;
    })[0];

    /* Var fönstret hjälper respektive stjälper — gränsen läses ur datat. */
    var vandpunkt = null;
    if (hela && fonster) {
      horisonter.forEach(function (k) {
        var a = felFor(hela, k), b = felFor(fonster, k);
        if (!a || !b) return;
        if (vandpunkt === null && b.medelAbsPct < a.medelAbsPct) vandpunkt = k;
        if (vandpunkt !== null && b.medelAbsPct >= a.medelAbsPct &&
            k < vandpunkt) vandpunkt = null;
      });
    }

    var txt = "<p>Sett över alla jämförelser är " +
      (delad.length > 1
        ? "<strong>" + delad.length + " varianter likvärdiga</strong> på " +
          talSv(bast.medelAbsPct, 1) + " % i genomsnittligt fel &ndash; " +
          esc(delad.map(function (m) { return m.namn.toLowerCase(); }).join(" och "))
        : "<strong>" + esc(bast.namn.toLowerCase()) + "</strong> bäst med " +
          talSv(bast.medelAbsPct, 1) + " % i genomsnittligt fel") +
      ", mot " + talSv(samst.medelAbsPct, 1) + " % för " +
      esc(samst.namn.toLowerCase()) + ". Det gemensamma för dem som ligger " +
      "främst är det korta fönstret.</p>";

    if (hela && fonster && vandpunkt !== null) {
      var kortH = felFor(hela, 1), kortF = felFor(fonster, 1);
      txt += "<p><strong>Kortare fönster hjälper &ndash; men först på " +
        "längre sikt.</strong> Ett år framåt är hela historiken bättre (" +
        talSv(kortH.medelAbsPct, 1) + " % mot " + talSv(kortF.medelAbsPct, 1) +
        " %); från <strong>" + esc(vandpunkt) + " år</strong> och framåt vänder " +
        "det, och då växer försprånget. Det är där en trend hinner göra " +
        "skillnad: flyttmönstret ändrar sig långsamt, men på den sikten " +
        "hinner avståndet mellan de senaste årens takt och " +
        "tjugofemårssnittet bli större än bruset i skattningen.</p>";
    }

    if (hela) {
      var hybridH = mod.filter(function (m) {
        return m.fordrojning && !m.fonster;
      })[0];
      if (hybridH) {
        var skillnad = hybridH.medelAbsPct - hela.medelAbsPct;
        txt += "<p><strong>Att lämna de första åren okompenserade gör " +
          (Math.abs(skillnad) < 0.1 ? "varken till eller från" :
            (skillnad < 0 ? "nytta" : "skada")) + ".</strong> " +
          talSv(hybridH.medelAbsPct, 1) + " % mot " + talSv(hela.medelAbsPct, 1) +
          " % &ndash; korrigeringen är så liten på de horisonterna att det " +
          "mest handlar om brus. Tanken stämmer i sak (de närmaste årens " +
          "ungdomar bor redan här), men den syns knappt i siffrorna.</p>";
      }
    }

    /* Vad trendkänsligheten säger just nu: åt vilket håll det korta
       fönstret drar jämfört med hela historiken. */
    if (hela && fonster) {
      var sista = data.kohort.sistaAr;
      var hv = hela.framskrivning[String(sista)];
      var fv = fonster.framskrivning[String(sista)];
      if (hv !== undefined && fv !== undefined && hv !== fv) {
        txt += "<p><strong>Just nu drar trenden " +
          (fv < hv ? "nedåt" : "uppåt") + ".</strong> Med hela historiken " +
          "skrivs " + esc(sista) + " fram till " + talSv(hv) + " " + ENHET +
          ", med de tre senaste årens kvoter till " + talSv(fv) + " &ndash; " +
          talSv(Math.abs(fv - hv)) + " " +
          (fv < hv ? "färre" : "fler") + ". Inflyttningen av små barn har " +
          "alltså varit " + (fv < hv ? "svagare" : "starkare") + " de " +
          "senaste åren än den varit i genomsnitt sedan 2001. Det är precis " +
          "den känsligheten ett kort fönster är till för &ndash; och samma " +
          "känslighet gör att en enskild avvikande årgång slår igenom " +
          "hårdare.</p>";
      }
    }

    txt += "<p>Jämförelserna överlappar varandra: samma målår räknas från " +
      "flera basår, så de " + esc(mod[0].antal) + " punkterna är färre än de ser " +
      "ut att vara. Skillnader under någon tiondels procentenhet ska inte " +
      "tolkas. Sidans <a href=\"#sektion-kompenserad\">kompenserade " +
      "framskrivning</a> använder hela historiken &ndash; den enklaste " +
      "regeln, inte den som råkar vinna på det här materialet.</p>";
    el("slutsats-varianter").innerHTML = txt;

    var sistaAr = data.kohort.sistaAr;
    var langa = horisonter.filter(function (k) { return k >= 8; });
    function snitt(m, ks) {
      var vikt = 0, summa = 0;
      ks.forEach(function (k) {
        var r = felFor(m, k);
        if (r) { summa += r.medelAbsPct * r.antal; vikt += r.antal; }
      });
      return vikt ? summa / vikt : null;
    }
    var korta = horisonter.filter(function (k) { return k <= 3; });

    var tab = "<caption>Varianterna prövade mot facit. Sista kolumnen är " +
      "vad varje variant skriver fram till " + esc(sistaAr) + ".</caption>" +
      "<thead><tr><th scope=\"col\">Variant</th><th scope=\"col\">Så räknar den</th>" +
      "<th scope=\"col\">Fel totalt</th><th scope=\"col\">1–3 år</th>" +
      "<th scope=\"col\">8 år och mer</th>" +
      "<th scope=\"col\">Framskrivning " + esc(sistaAr) + "</th></tr></thead><tbody>";
    mod.forEach(function (m) {
      var l = snitt(m, langa), kt = snitt(m, korta);
      var f = m.framskrivning[String(sistaAr)];
      tab += "<tr><th scope=\"row\">" + esc(m.namn) + "</th><td>" + esc(m.kort) +
        "</td><td>" + talSv(m.medelAbsPct, 1) + " %</td><td>" +
        (kt === null ? "–" : talSv(kt, 1) + " %") + "</td><td>" +
        (l === null ? "–" : talSv(l, 1) + " %") + "</td><td>" +
        (f === undefined ? "–" : talSv(f)) + "</td></tr>";
    });
    el("tabell-varianter").innerHTML = tab + "</tbody>";
    el("sektion-varianter").hidden = false;
  }

  function initKohortfel(data) {
    if (!data.kohort || !el("diagram-kohortfel")) return;
    var rader = data.kohort.jamforelse;
    if (rader.length < 2) return;

    var ctx = el("diagram-kohortfel");
    ctx.parentElement.style.height = "380px";
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: rader.map(function (r) {
          return r.avstand === 0 ? "Samma år" : r.avstand + " år";
        }),
        datasets: [
          {
            label: "Kommunens prognos",
            data: rader.map(function (r) { return r.kommunAbsPct; }),
            backgroundColor: FARG.bla,
            borderWidth: 0, borderRadius: 4
          },
          {
            label: "Enkel framskrivning",
            data: rader.map(function (r) { return r.kohortAbsPct; }),
            backgroundColor: FARG.orange,
            borderWidth: 0, borderRadius: 4
          },
          {
            label: "Kompenserad framskrivning",
            data: rader.map(function (r) { return r.kompenseradAbsPct; }),
            backgroundColor: FARG.orangeMork,
            borderWidth: 0, borderRadius: 4
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        locale: "sv-SE",
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: true, position: "bottom",
                    labels: { boxWidth: 22 } },
          tooltip: {
            callbacks: {
              title: function (it) {
                var r = rader[it[0].dataIndex];
                return (r.avstand === 0 ? "Samma år" : r.avstand + " år i förväg") +
                  " (" + r.antal + " jämförelser)";
              },
              label: function (it) {
                return it.dataset.label + ": " + talSv(it.parsed.y, 1) + " % fel";
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { color: FARG.baseline },
               title: { display: true, text: "Antal år i förväg", color: FARG.muted } },
          y: { beginAtZero: true,
               title: { display: true, text: "Genomsnittligt absolut fel (%)", color: FARG.muted },
               grid: { color: FARG.grid }, border: { display: false },
               ticks: { callback: function (v) { return talSv(v, 1) + " %"; } } }
        }
      }
    });

    /* Vinnare per horisont, med avrundningen inräknad: två staplar som
       båda skrivs "1,9 %" ska inte utropas till olika. */
    function vinnare(r) {
      var namn = ["Kommunens prognos", "Enkel framskrivning",
                  "Kompenserad framskrivning"];
      var v = [r.kommunAbsPct, r.kohortAbsPct, r.kompenseradAbsPct];
      var avrundat = v.map(function (x) {
        return x === null || x === undefined ? Infinity : Math.round(x * 10);
      });
      var minsta = Math.min.apply(null, avrundat);
      var traff = [];
      avrundat.forEach(function (x, i) { if (x === minsta) traff.push(namn[i]); });
      return traff.length === 1 ? traff[0] : null;
    }
    var enkelBast = rader.filter(function (r) {
      return vinnare(r) === "Enkel framskrivning";
    });
    var kompBast = rader.filter(function (r) {
      return vinnare(r) === "Kompenserad framskrivning";
    });
    var kommunBast = rader.filter(function (r) {
      return vinnare(r) === "Kommunens prognos";
    });
    function horisonter(lista) {
      return lista.map(function (r) {
        return r.avstand === 0 ? "samma år" : esc(r.avstand) + " år";
      }).join(", ");
    }

    el("kalla-kohortfel").textContent =
      "Genomsnittligt fel utan tecken, i procent av det faktiska antalet. " +
      "Bara målår där alla tre har ett värde och facit finns.";

    var delar = [];
    if (enkelBast.length) {
      delar.push("den <strong>enkla framskrivningen</strong> vid " +
        horisonter(enkelBast));
    }
    if (kompBast.length) {
      delar.push("den <strong>kompenserade</strong> vid " + horisonter(kompBast));
    }
    if (kommunBast.length) {
      delar.push("<strong>kommunens modell</strong> vid " + horisonter(kommunBast));
    }
    /* Kompensationens egen insats syns tydligast mot den enkla
       framskrivningen, inte i vem som vinner totalt. */
    var kompBattreAnEnkel = rader.filter(function (r) {
      return r.kompenseradAbsPct !== null && r.kompenseradAbsPct !== undefined &&
        Math.round(r.kompenseradAbsPct * 10) < Math.round(r.kohortAbsPct * 10);
    });
    var langsta = rader[rader.length - 1];
    el("slutsats-kohortfel").innerHTML =
      "<p>Ingen modell vinner överallt: " + delar.join(", ") + "." +
      " Mönstret är att det som redan bor i kommunen räcker långt på " +
      "kort sikt, medan flyttningen tar över på lång.</p>" +
      (kompBattreAnEnkel.length
        ? "<p>Kompensationen gör sin nytta just där: den slår den enkla " +
          "framskrivningen vid " + horisonter(kompBattreAnEnkel) + " framåt, " +
          "och " + esc(langsta.avstand) + " år framåt skiljer det " +
          talSv(langsta.kohortAbsPct, 1) + " % mot " +
          talSv(langsta.kompenseradAbsPct, 1) + " % &ndash; nära kommunens " +
          talSv(langsta.kommunAbsPct, 1) + " %. Priset är antagandet att " +
          "flyttmönstret består.</p>"
        : "") +
      "<p>Staplarna bygger på få jämförelser vid de längsta horisonterna; " +
      "antalet står i tooltipen.</p>";

    var t = "<caption>Genomsnittligt fel utan tecken, per antal år i " +
      "förväg.</caption><thead><tr><th scope=\"col\">År i förväg</th>" +
      "<th scope=\"col\">Jämförelser</th>" +
      "<th scope=\"col\">Kommunens prognos</th>" +
      "<th scope=\"col\">Enkel framskrivning</th>" +
      "<th scope=\"col\">Kompenserad framskrivning</th></tr></thead><tbody>";
    rader.forEach(function (r) {
      t += "<tr><th scope=\"row\">" + esc(r.avstand) + "</th><td>" + esc(r.antal) +
        "</td><td>" + talSv(r.kommunAbsPct, 1) + " %</td><td>" +
        talSv(r.kohortAbsPct, 1) + " %</td><td>" +
        (r.kompenseradAbsPct === null || r.kompenseradAbsPct === undefined
          ? "–" : talSv(r.kompenseradAbsPct, 1) + " %") + "</td></tr>";
    });
    el("tabell-kohortfel").innerHTML = t + "</tbody>";
    el("sektion-kohortfel").hidden = false;
  }

  /* Spagettidiagrammet i app.js ritar in kohortlinjen när den finns */
  K.kohortDataset = kohortDataset;

  K.kohortInit = function (data) {
    initKohort(data);
    initKohortAlla(data);
    initKvoter(data);
    initKompenserad(data);
    initVarianter(data);
    initKohortfel(data);
  };
})();
