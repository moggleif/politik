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
     Ingen modell och inga födelsetal – men den är inte antagandefri:
     att bära kohorten rakt fram förutsätter att kohorterna är oförändrade,
     alltså noll nettoflyttning, ingen dödlighet och inga ändringar i
     folkbokföringen. Skillnaden mot utfallet mäter de tre tillsammans, i
     proportioner datat inte visar.
     Sektionerna finns
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
    /* Riktningen på felet skiftar med horisonten och får därför inte
       sammanfattas till ett håll. Båda tecknen läses ur datat. Varför de
       skiftar går inte att läsa ur samma tal: felet är nettoförändringen
       i kohorterna, och datat delar inte upp den i flyttning, dödlighet
       och folkbokföringsändringar. */
    function riktning(r) {
      return (r.medelPct > 0 ? "för högt" : "för lågt") + " (" +
        (r.medelPct > 0 ? "+" : "−") + talSv(Math.abs(r.medelPct), 1) + " %)";
    }
    K.sattDataNot("not-kohort",
      "Framskrivningen räknar <strong>varken in- eller utflyttning</strong> " +
      "och ingen dödlighet. Den säger hur många som skulle bli " +
      esc(k.aldrar[0]) + "–" + esc(k.aldrar[1]) + " år om kohorterna vore " +
      "oförändrade. Historiskt " +
      "har den missat med i snitt " + talSv(kort.medelAbsPct, 1) + " % ett år " +
      "framåt och " + talSv(langt.medelAbsPct, 1) + " % " + esc(langt.avstand) +
      " år framåt. Riktningen skiftar: ett år framåt har den legat " +
      riktning(kort) + ", " + esc(langt.avstand) + " år framåt " + riktning(langt) +
      (langt.medelPct < 0
        ? " – på den sikten har nettoförändringen i kohorterna varit " +
          "positiv, alltså lagt till fler än framskrivningen räknar med, " +
          "så den har <em>historiskt tenderat att underskatta</em> " +
          "utfallet. Det är ingen undre gräns för framtiden: blir " +
          "nettoförändringen negativ kan utfallet lika gärna hamna under."
        : "."));

    /* Slutsats: var kommunens prognos ligger i förhållande till de barn
       som redan bor här. */
    var mot = k.motSenaste;
    if (mot.length && senaste) {
      var under = mot.filter(function (r) { return r.diff < 0; });
      var forsta = mot[0];
      var txt = "<p>Om kohorterna vore oförändrade skulle Kungsbacka ha <strong>" +
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
          "den ska slå in krävs en negativ nettoförändring i de kohorterna, " +
          "vilket i den här åldersgruppen huvudsakligen skulle kunna komma " +
          "från nettoutflyttning. Framskrivningen har legat " +
          talSv(kort.medelPct, 1) + " % för högt ett år framåt, men i en helt " +
          "annan storleksordning än den skillnaden.</p>";
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
       eftersom var och en saknar den nettoförändring i kohorterna som hann
       ske efter dess basår. */
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
    txt += "<p>Linjerna ligger på rad under varandra: varje årgång saknar " +
      "det som hann hända med kohorterna efter dess basår. Avståndet mellan " +
      "två årgångar är därför inte modellfel utan den nettoförändring " +
      "framskrivningen utelämnar – flyttning, dödlighet och ändringar i " +
      "folkbokföringen tillsammans, i de proportioner datat inte visar. Ju " +
      "längre höger i diagrammet, desto mer hinner samlas.</p>";
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

    el("kalla-kohortfel").textContent =
      "Genomsnittligt fel utan tecken, i procent av det faktiska antalet. " +
      "Bara målår där båda har ett värde och facit finns; antalet " +
      "jämförelser per stapel står i tooltipen.";

    /* Beskrivning av vad staplarna visar – vilken modell som ligger lägst
       vid vilken horisont läser var och en ur diagrammet och tabellen. */
    el("slutsats-kohortfel").innerHTML =
      "<p>Diagrammet ställer kommunens prognos mot framskrivningen vid " +
      "samma horisont: båda utgår från samma basår, och bara målår där " +
      "båda har ett värde och facit finns räknas. Staplarna vid de " +
      "längsta horisonterna bygger på färre jämförelser än de korta &ndash; " +
      "antalet står i tabellen nedan.</p>";

    var t = "<caption>Genomsnittligt fel utan tecken, per antal år i " +
      "förväg.</caption><thead><tr><th scope=\"col\">År i förväg</th>" +
      "<th scope=\"col\">Jämförelser</th>" +
      "<th scope=\"col\">Kommunens prognos</th>" +
      "<th scope=\"col\">Framskrivning</th></tr></thead><tbody>";
    rader.forEach(function (r) {
      t += "<tr><th scope=\"row\">" + esc(r.avstand) + "</th><td>" + esc(r.antal) +
        "</td><td>" + talSv(r.kommunAbsPct, 1) + " %</td><td>" +
        talSv(r.kohortAbsPct, 1) + " %</td></tr>";
    });
    el("tabell-kohortfel").innerHTML = t + "</tbody>";
    el("sektion-kohortfel").hidden = false;
  }

  /* Spagettidiagrammet i app.js ritar in kohortlinjen när den finns */
  K.kohortDataset = kohortDataset;

  K.kohortInit = function (data) {
    initKohort(data);
    initKohortAlla(data);
    initKohortfel(data);
  };
})();
