/* Prognoskollen Kungsbacka — läser en datafil och ritar diagrammen.
   Vilken fil och vilket ord som används om de räknade personerna styrs
   från sidans <body data-datafil="…" data-enhet="…" data-enhet-lang="…">,
   så att samma kod driver både totalsidan och åldersgruppssidan. */
(function () {
  "use strict";

  /* Färger, talformat och diagraminställningar delas med de andra
     sidorna via gemensam.js (window.KIS). */
  var K = window.KIS;
  var FARG = K.FARG;
  var rampFarg = K.rampFarg;
  var el = K.el;
  var visaStatus = K.visaStatus;
  var installChartDefaults = K.installChartDefaults;

  var KONF = document.body.dataset;
  var DATAFIL = KONF.datafil || "data.json";
  var ENHET = KONF.enhet || "invånare";                 // "invånare" / "ungdomar"
  var ENHET_LANG = KONF.enhetLang || "Antal invånare";  // axelrubrik
  var JAMFORFIL = KONF.jamforfil || null;               // seriens jämförelsefil
  var JAMFORSERIE = KONF.jamforserie || "";

  function talSv(n, dec) {
    return n.toLocaleString("sv-SE", {
      minimumFractionDigits: dec || 0,
      maximumFractionDigits: dec || 0
    });
  }

  /* ---------- Sektion 1: Vad sa prognoserna om år X? ---------- */

  var malarChart = null;

  function ritaMalar(data, malAr) {
    var punkter = [];
    data.prognoser.forEach(function (p) {
      var a = p.avvikelser[String(malAr)];
      if (a) punkter.push({ prognosAr: p.prognosAr, avv: a });
    });
    punkter.sort(function (x, y) { return x.prognosAr - y.prognosAr; });
    if (!punkter.length) return;

    var utfall = punkter[0].avv.utfall;

    var ctx = el("diagram-malar");
    if (malarChart) malarChart.destroy();
    var hojd = Math.max(220, punkter.length * 44 + 80);
    ctx.parentElement.style.height = hojd + "px";

    malarChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: punkter.map(function (p) { return String(p.prognosAr); }),
        datasets: [{
          data: punkter.map(function (p) { return p.avv.diff; }),
          backgroundColor: punkter.map(function (p) { return p.avv.diff >= 0 ? FARG.rod : FARG.bla; }),
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 24
        }]
      },
      options: {
        indexAxis: "y",
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function (it) { return "Prognosen gjord " + it[0].label; },
              label: function (it) {
                var a = punkter[it.dataIndex].avv;
                return [
                  "Prognosen sa: " + talSv(a.prognos) + " " + ENHET,
                  "Det blev: " + talSv(a.utfall) + " " + ENHET,
                  (a.diff >= 0 ? "För högt: " : "För lågt: ") + talSv(Math.abs(a.diff)) +
                    " personer (" + talSv(Math.abs(a.pct), 1) + " %)"
                ];
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: "Avvikelse mot utfallet, antal personer", color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            ticks: { callback: function (v) { return talSv(v); } }
          },
          y: {
            title: { display: true, text: "Prognos gjord år", color: FARG.muted },
            grid: { display: false },
            border: { color: FARG.baseline }
          }
        }
      }
    });

    el("kalla-malar").innerHTML =
      "Utfall " + malAr + ": " + talSv(utfall) + " " + ENHET + " (SCB). " +
      "Röd stapel = prognosen för hög, blå = för låg. Källor: se längst ned.";

    /* Klarspråkssammanfattning */
    var forsta = punkter[0], sista = punkter[punkter.length - 1];
    var html = "";
    html += "<p><strong>Tidigaste prognosen</strong> (gjord " + forsta.prognosAr + ", " +
      forsta.avv.avstand + " år i förväg) trodde på " + talSv(forsta.avv.prognos) +
      " " + ENHET + " år " + malAr + ". Det blev " + talSv(forsta.avv.utfall) +
      " – prognosen låg " + talSv(Math.abs(forsta.avv.diff)) + " personer " +
      (forsta.avv.diff >= 0 ? "för högt" : "för lågt") +
      " (" + talSv(Math.abs(forsta.avv.pct), 1) + " %).</p>";
    if (sista !== forsta) {
      html += "<p><strong>Senaste prognosen</strong> (gjord " + sista.prognosAr + ", " +
        (sista.avv.avstand === 0 ? "samma år" : sista.avv.avstand + " år i förväg") +
        ") trodde på " + talSv(sista.avv.prognos) + ". Den låg " +
        talSv(Math.abs(sista.avv.diff)) + " personer " +
        (sista.avv.diff >= 0 ? "för högt" : "för lågt") +
        " (" + talSv(Math.abs(sista.avv.pct), 1) + " %).</p>";
    }
    el("slutsats-malar").innerHTML = html;

    /* Tabell */
    var t = "<caption>Prognoser för år " + malAr + " jämfört med utfallet " +
      talSv(utfall) + " " + ENHET + ".</caption>";
    t += "<thead><tr><th scope=\"col\">Prognos gjord år</th><th scope=\"col\">Prognosen sa</th>" +
      "<th scope=\"col\">Skillnad (personer)</th><th scope=\"col\">Fel i procent</th></tr></thead><tbody>";
    punkter.forEach(function (p) {
      t += "<tr><td>" + p.prognosAr + "</td><td>" + talSv(p.avv.prognos) + "</td><td>" +
        (p.avv.diff >= 0 ? "+" : "−") + talSv(Math.abs(p.avv.diff)) + "</td><td>" +
        talSv(p.avv.pct, 1) + " %</td></tr>";
    });
    t += "</tbody>";
    el("tabell-malar").innerHTML = t;
  }

  function initMalar(data) {
    var ar = {};
    data.prognoser.forEach(function (p) {
      Object.keys(p.avvikelser).forEach(function (a) { ar[a] = true; });
    });
    var lista = Object.keys(ar).map(Number).sort(function (a, b) { return b - a; });
    if (!lista.length) return false;

    var valjare = el("ar-valjare");
    lista.forEach(function (a) {
      var o = document.createElement("option");
      o.value = a; o.textContent = a;
      valjare.appendChild(o);
    });
    /* Valt år speglas i adressraden (?year=) så att vyn går att länka */
    K.kopplaValjare(valjare, "year", function () {
      ritaMalar(data, Number(valjare.value));
    });
    valjare.addEventListener("change", function () { ritaMalar(data, Number(valjare.value)); });
    ritaMalar(data, Number(valjare.value) || lista[0]);
    el("sektion-malar").hidden = false;
    return true;
  }

  /* ---------- Sektion 2: Träffsäkerhet per avstånd ---------- */

  function initAvstand(data) {
    var rader = data.perAvstand;
    if (!rader || !rader.length) return;

    var ctx = el("diagram-avstand");
    ctx.parentElement.style.height = "340px";
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: rader.map(function (r) {
          return r.avstand === 0 ? "Samma år" : r.avstand + " år före";
        }),
        datasets: [{
          data: rader.map(function (r) { return r.medelAbsPct; }),
          backgroundColor: FARG.bla,
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 24
        }]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (it) {
                var r = rader[it.dataIndex];
                return [
                  "Genomsnittligt fel: " + talSv(r.medelAbsPct, 1) + " %",
                  "Största fel: " + talSv(r.maxAbsPct, 1) + " %",
                  "Bygger på " + r.antal + " prognosvärden"
                ];
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: "Hur långt i förväg prognosen gjordes", color: FARG.muted },
            grid: { display: false },
            border: { color: FARG.baseline }
          },
          y: {
            title: { display: true, text: "Genomsnittligt fel i procent", color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            beginAtZero: true,
            ticks: { callback: function (v) { return talSv(v, 1) + " %"; } }
          }
        }
      }
    });

    el("kalla-avstand").textContent =
      "Genomsnitt av felet (utan hänsyn till riktning) för alla prognoser och år där utfall finns.";

    var kort = rader[0], langt = rader[rader.length - 1];
    var html = "<p>I genomsnitt har prognoserna som gjorts <strong>" +
      (langt.avstand === 0 ? "samma år" : langt.avstand + " år i förväg") +
      "</strong> missat med " + talSv(langt.medelAbsPct, 1) + " %, medan de som gjorts " +
      (kort.avstand === 0 ? "<strong>samma år</strong>" : "<strong>" + kort.avstand + " år i förväg</strong>") +
      " missat med " + talSv(kort.medelAbsPct, 1) + " %.</p>";
    var battre = langt.medelAbsPct > kort.medelAbsPct;
    html += "<p>" + (battre
      ? "Prognoserna blir alltså i regel träffsäkrare ju närmare året man kommer – men även korta prognoser kan slå fel."
      : "Prognoserna har alltså inte blivit tydligt träffsäkrare av att göras närmare året.") + "</p>";

    /* Var öppen med hur tunt underlaget är – flera staplar kan vila på en
       enda prognos, och då säger jämförelsen mindre än den ser ut att göra. */
    var tunna = rader.filter(function (r) { return r.antal < 3; });
    if (tunna.length) {
      html += "<p><strong>Läs med försiktighet:</strong> " +
        (tunna.length === rader.length
          ? "samtliga staplar bygger på färre än tre prognosvärden"
          : "staplarna för " + tunna.map(function (r) {
              return r.avstand === 0 ? "samma år" : r.avstand + " år före";
            }).join(", ") + " bygger på färre än tre prognosvärden") +
        ". Så få mätpunkter kan slå åt vilket håll som helst, så skillnaderna " +
        "mellan staplarna ska inte övertolkas. Antalet syns när du pekar på en " +
        "stapel, och i tabellen nedan.</p>";
    }
    el("slutsats-avstand").innerHTML = html;

    var t = "<caption>Genomsnittligt prognosfel per antal år i förväg.</caption>";
    t += "<thead><tr><th scope=\"col\">Hur långt i förväg</th><th scope=\"col\">Genomsnittligt fel</th>" +
      "<th scope=\"col\">Största fel</th><th scope=\"col\">Antal prognosvärden</th></tr></thead><tbody>";
    rader.forEach(function (r) {
      t += "<tr><td>" + (r.avstand === 0 ? "Samma år" : r.avstand + " år före") + "</td><td>" +
        talSv(r.medelAbsPct, 1) + " %</td><td>" + talSv(r.maxAbsPct, 1) + " %</td><td>" +
        r.antal + "</td></tr>";
    });
    t += "</tbody>";
    el("tabell-avstand").innerHTML = t;
    el("sektion-avstand").hidden = false;
  }

  /* ---------- Sektion 2b: Systematisk skevhet ---------- */

  function initSkevhet(data) {
    var sk = data.skevhet, rader = data.perAvstand;
    if (!sk || !rader || !rader.length) return;

    var ctx = el("diagram-skevhet");
    ctx.parentElement.style.height = "340px";
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: rader.map(function (r) {
          return r.avstand === 0 ? "Samma år" : r.avstand + " år före";
        }),
        datasets: [{
          data: rader.map(function (r) { return r.medelPct; }),
          backgroundColor: rader.map(function (r) {
            return r.medelPct >= 0 ? FARG.rod : FARG.bla;
          }),
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 24
        }]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (it) {
                var r = rader[it.dataIndex];
                return [
                  "Genomsnittligt fel: " + (r.medelPct >= 0 ? "+" : "−") +
                    talSv(Math.abs(r.medelPct), 1) + " %",
                  r.antalOver + " av " + r.antal + " prognoser låg för högt"
                ];
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: "Hur långt i förväg prognosen gjordes", color: FARG.muted },
            grid: { display: false },
            border: { color: FARG.baseline }
          },
          y: {
            title: { display: true, text: "Genomsnittligt fel, med riktning", color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            ticks: {
              callback: function (v) { return (v > 0 ? "+" : "") + talSv(v, 1) + " %"; }
            }
          }
        }
      }
    });

    el("kalla-skevhet").textContent =
      "Staplar över nollstrecket = prognosen låg för högt, under = för lågt. " +
      "Slumpmässiga fel skulle ge staplar på båda sidor, nära noll.";

    var over = sk.antalOver, n = sk.antal, under = n - over;
    var dominans = Math.max(over, under);
    var hall = over >= under ? "för högt" : "för lågt";
    var systematiskt = dominans >= Math.ceil(n * 0.75);

    var html = "<p><strong>" + dominans + " av " + n + "</strong> jämförelser " +
      "ligger " + hall + ". Vore felen slumpmässiga skulle ungefär hälften " +
      "hamna på var sida.</p>";
    html += "<p>Genomsnittet över alla prognoser är <strong>" +
      (sk.medelPct >= 0 ? "+" : "−") + talSv(Math.abs(sk.medelPct), 1) +
      " %</strong>. En modell utan systematisk skevhet skulle landa nära noll.</p>";
    var arg = data.perArgang || [];
    var skiftar = sk.bytterRiktning && arg.length > 1;

    if (systematiskt) {
      html += "<p>Felet drar alltså konsekvent åt samma håll. Ett sådant fel " +
        "kallas systematiskt, och skiljer sig från slumpmässigt fel på en " +
        "avgörande punkt: det går att räkna bort. Den som tar fram prognosen " +
        "kan mäta skevheten mot tidigare utfall och justera modellens " +
        "antaganden.</p>";
    } else if (skiftar) {
      html += "<p>Felen går inte alla åt samma håll, men de är inte heller " +
        "slumpmässiga: de följer ett mönster över tid. Se nästa stycke.</p>";
    } else {
      html += "<p>Felen fördelar sig åt båda håll utan tydligt mönster, " +
        "vilket tyder på slumpmässig spridning snarare än en systematisk " +
        "skevhet i modellen.</p>";
    }

    /* Har skevheten bytt riktning över tid? Det är ett annat fel än en
       konstant lutning, och kräver en annan åtgärd. */
    if (skiftar) {
      var lag = arg.filter(function (r) { return r.medelPct < 0; });
      var hog = arg.filter(function (r) { return r.medelPct > 0; });
      html += "<p><strong>Riktningen har skiftat.</strong> Prognoserna från " +
        lag.map(function (r) { return r.prognosAr; }).join(", ") +
        " låg för lågt, medan de från " +
        hog.map(function (r) { return r.prognosAr; }).join(", ") +
        " låg för högt. Det talar för att modellen skriver fram den utveckling " +
        "som varit och därför missar vändpunkter &ndash; åt båda hållen. Ett " +
        "sådant fel försvinner inte genom att lägga på en fast korrigering; " +
        "det är känsligheten för trendbrott som behöver ses över.</p>";
    }

    /* Har modellen blivit bättre? Bara jämförbart vid samma horisont –
       en gammal årgång har utvärderats många år framåt, en ny bara på
       kort sikt, så medelvärdena i sig går inte att ställa mot varandra. */
    var ett = arg.filter(function (r) { return r.ettArPct !== null && r.ettArPct !== undefined; });
    if (ett.length >= 4) {
      var varst = ett.reduce(function (a, b) {
        return Math.abs(b.ettArPct) > Math.abs(a.ettArPct) ? b : a;
      });
      var senast = ett[ett.length - 1];
      var tecken = function (v) { return (v >= 0 ? "+" : "−") + talSv(Math.abs(v), 1) + " %"; };
      html += "<p><strong>Har det blivit bättre?</strong> För att svara måste " +
        "man jämföra prognoser på samma sikt &ndash; en gammal prognos har " +
        "hunnit prövas många år framåt, en ny bara på kort sikt. Ser man bara " +
        "på hur fel prognoserna slagit <em>ett år framåt</em>, var " +
        varst.prognosAr + " års prognos sämst (" + tecken(varst.ettArPct) +
        ") och " + senast.prognosAr + " års senast mätbar (" +
        tecken(senast.ettArPct) + "). " +
        (Math.abs(senast.ettArPct) < Math.abs(varst.ettArPct)
          ? "Felet har alltså minskat" +
            (senast.ettArPct * varst.ettArPct > 0
              ? ", men lutar fortfarande åt samma håll."
              : " och bytt riktning.")
          : "Felet har alltså inte minskat.") + "</p>";
    }

    if (n < 10) {
      html += "<p><strong>Läs med försiktighet:</strong> slutsatsen bygger på " +
        n + " jämförelser. Riktningen är tydlig, men underlaget är litet.</p>";
    }
    el("slutsats-skevhet").innerHTML = html;

    var t = "<caption>Genomsnittligt fel med riktning, per antal år i förväg. " +
      "Plus betyder att prognosen låg för högt.</caption>";
    t += "<thead><tr><th scope=\"col\">Hur långt i förväg</th>" +
      "<th scope=\"col\">Genomsnittligt fel</th>" +
      "<th scope=\"col\">Antal för höga</th>" +
      "<th scope=\"col\">Antal prognosvärden</th></tr></thead><tbody>";
    rader.forEach(function (r) {
      t += "<tr><td>" + (r.avstand === 0 ? "Samma år" : r.avstand + " år före") +
        "</td><td>" + (r.medelPct >= 0 ? "+" : "−") + talSv(Math.abs(r.medelPct), 1) +
        " %</td><td>" + r.antalOver + "</td><td>" + r.antal + "</td></tr>";
    });
    t += "</tbody>";
    if (arg.length) {
      t += "<thead><tr><th scope=\"col\">Prognos gjord år</th>" +
        "<th scope=\"col\">Fel ett år framåt</th>" +
        "<th scope=\"col\">Genomsnitt, alla år</th>" +
        "<th scope=\"col\">Prövad t.o.m.</th></tr></thead><tbody>";
      arg.forEach(function (r) {
        var e = (r.ettArPct === null || r.ettArPct === undefined)
          ? "–"
          : (r.ettArPct >= 0 ? "+" : "−") + talSv(Math.abs(r.ettArPct), 1) + " %";
        t += "<tr><td>" + r.prognosAr + "</td><td>" + e + "</td><td>" +
          (r.medelPct >= 0 ? "+" : "−") + talSv(Math.abs(r.medelPct), 1) +
          " %</td><td>" + (r.maxAvstand === 0 ? "samma år" : r.maxAvstand + " år framåt") +
          "</td></tr>";
      });
      t += "</tbody>";
    }
    el("tabell-skevhet").innerHTML = t;
    el("sektion-skevhet").hidden = false;
  }

  /* ---------- Sektion 3: Spagettidiagram ---------- */

  /* Årsfönstret som diagrammet och dess tabeller visar: börja vid den
     tidigaste prognosen, men visa alltid minst tio års faktisk utveckling
     som bakgrund. Delas av spagettidiagrammet och utfallstabellen så att
     de visar samma period. */
  function arsfonster(data) {
    var utfallAr = Object.keys(data.utfall).map(Number);
    var allaAr = {};
    utfallAr.forEach(function (a) { allaAr[a] = true; });
    data.prognoser.forEach(function (p) {
      Object.keys(p.prognos).forEach(function (a) { allaAr[a] = true; });
    });
    /* Kohortframskrivningen räcker längre fram än prognoserna. Klipps
       fönstret vid sista prognosåret ser den orange linjen ut att ta slut
       där, som om datat vore slut. */
    if (data.kohort) {
      Object.keys(data.kohort.framskrivning).forEach(function (a) { allaAr[a] = true; });
    }
    var ar = Object.keys(allaAr).map(Number).sort(function (a, b) { return a - b; });
    var forstaPrognosAr = data.prognoser.length
      ? Math.min.apply(null, data.prognoser.map(function (p) { return p.prognosAr; }))
      : ar[0];
    var start = Math.min(forstaPrognosAr, Math.max.apply(null, utfallAr) - 10);
    return ar.filter(function (a) { return a >= start; });
  }

  function initSpagetti(data) {
    var ar = arsfonster(data);

    var dataset = [];
    data.prognoser.forEach(function (p, i) {
      dataset.push({
        label: "Prognos " + p.prognosAr,
        data: ar.map(function (a) {
          return p.prognos[String(a)] !== undefined ? p.prognos[String(a)] : null;
        }),
        borderColor: rampFarg(i, data.prognoser.length),
        backgroundColor: rampFarg(i, data.prognoser.length),
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        spanGaps: false,
        tension: 0.1
      });
    });
    if (data.kohort) dataset.push(kohortDataset(data, ar, 2));
    dataset.push({
      label: "Faktiskt utfall (SCB)",
      data: ar.map(function (a) {
        return data.utfall[String(a)] !== undefined ? data.utfall[String(a)] : null;
      }),
      borderColor: FARG.ink,
      backgroundColor: FARG.ink,
      borderWidth: 3,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBorderColor: FARG.surface,
      pointBorderWidth: 2,
      spanGaps: false,
      tension: 0.1
    });

    var ctx = el("diagram-spagetti");
    ctx.parentElement.style.height = "420px";
    var chart = new Chart(ctx, {
      type: "line",
      data: { labels: ar.map(String), datasets: dataset },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: {
            display: true,
            labels: {
              /* Sammanfatta: utfallet plus rampens ändpunkter */
              generateLabels: function () {
                var n = data.prognoser.length;
                var poster = [{ text: "Faktiskt utfall (SCB)", strokeStyle: FARG.ink, fillStyle: FARG.ink, lineWidth: 3 }];
                if (data.kohort) {
                  poster.push({
                    text: "Kohortframskrivning (SCB " + data.kohort.basAr + ")",
                    strokeStyle: FARG.orange, fillStyle: FARG.orange, lineWidth: 2
                  });
                }
                if (n > 1) {
                  poster.push({
                    text: "Äldsta prognosen (" + data.prognoser[0].prognosAr + ")",
                    strokeStyle: rampFarg(0, n), fillStyle: rampFarg(0, n), lineWidth: 2
                  });
                  poster.push({
                    text: "Senaste prognosen (" + data.prognoser[n - 1].prognosAr + ")",
                    strokeStyle: rampFarg(n - 1, n), fillStyle: rampFarg(n - 1, n), lineWidth: 2
                  });
                } else if (n === 1) {
                  poster.push({
                    text: "Prognos " + data.prognoser[0].prognosAr,
                    strokeStyle: rampFarg(0, 1), fillStyle: rampFarg(0, 1), lineWidth: 2
                  });
                }
                return poster;
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
          x: {
            grid: { display: false },
            border: { color: FARG.baseline },
            ticks: { maxRotation: 0, autoSkipPadding: 12 }
          },
          y: {
            title: { display: true, text: ENHET_LANG, color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            ticks: { callback: function (v) { return talSv(v); } }
          }
        }
      }
    });

    /* Peka på en linje så tonas de andra ned – teckenförklaringen är
       sammanfattad, så toningen styrs bara från själva diagrammet. */
    K.aktiveraToning(chart, false);

    el("kalla-spagetti").textContent = (data.prognoser.length > 1
      ? "Svart linje: SCB:s faktiska siffror 31 december. Blå linjer: kommunens " +
        "prognoser – ju mörkare linje, desto senare är prognosen gjord. " +
        "Peka på en linje så tonas de övriga ned."
      : "Svart linje: SCB:s faktiska siffror 31 december. Blå linje: kommunens prognos.") +
      (data.kohort ? " Orange linje: kohortframskrivningen ur åldersklasserna "
        + data.kohort.basAr + "." : "");

    /* Tabell: matris år × prognos */
    var t = "<caption>Faktiskt utfall och samtliga prognoser, antal " + ENHET + ".</caption>";
    t += "<thead><tr><th scope=\"col\">År</th><th scope=\"col\">Utfall (SCB)</th>";
    if (data.kohort) t += "<th scope=\"col\">Kohortframskrivning</th>";
    data.prognoser.forEach(function (p) {
      t += "<th scope=\"col\">Prognos " + p.prognosAr + "</th>";
    });
    t += "</tr></thead><tbody>";
    ar.forEach(function (a) {
      t += "<tr><td>" + a + "</td><td>" +
        (data.utfall[String(a)] !== undefined ? talSv(data.utfall[String(a)]) : "–") + "</td>";
      if (data.kohort) {
        var kv = data.kohort.framskrivning[String(a)];
        t += "<td>" + (kv !== undefined ? talSv(kv) : "–") + "</td>";
      }
      data.prognoser.forEach(function (p) {
        var v = p.prognos[String(a)];
        t += "<td>" + (v !== undefined ? talSv(v) : "–") + "</td>";
      });
      t += "</tr>";
    });
    t += "</tbody>";
    el("tabell-spagetti").innerHTML = t;
    el("sektion-spagetti").hidden = false;
  }

  /* ---------- Samma bild, inzoomad på åren med känt utfall ---------- */

  function initUtfall(data) {
    /* Samma serier som spagettidiagrammet, men klippta vid sista året med
       utfall. Där måste skalan rymma prognoser ända till 2050, vilket
       trycker ihop kurvorna; här följer skalan de år som faktiskt går att
       jämföra. */
    var utfallAr = Object.keys(data.utfall).map(Number);
    var sistaUtfall = Math.max.apply(null, utfallAr);
    var ar = arsfonster(data).filter(function (a) { return a <= sistaUtfall; });
    if (ar.length < 2) return;

    var n = data.prognoser.length;
    var dataset = [];
    data.prognoser.forEach(function (p, i) {
      var v = ar.map(function (a) {
        return p.prognos[String(a)] !== undefined ? p.prognos[String(a)] : null;
      });
      if (!v.some(function (x) { return x !== null; })) return;  // ingen överlappning
      dataset.push({
        label: "Prognos " + p.prognosAr,
        data: v,
        borderColor: rampFarg(i, n),
        backgroundColor: rampFarg(i, n),
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        spanGaps: false,
        tension: 0.1
      });
    });
    dataset.push({
      label: "Faktiskt utfall (SCB)",
      data: ar.map(function (a) { return data.utfall[String(a)]; }),
      borderColor: FARG.ink,
      backgroundColor: FARG.ink,
      borderWidth: 3,
      pointRadius: 4,
      pointHoverRadius: 7,
      pointBorderColor: FARG.surface,
      pointBorderWidth: 2,
      tension: 0.1
    });

    var ctx = el("diagram-utfall");
    ctx.parentElement.style.height = "420px";
    var chart = new Chart(ctx, {
      type: "line",
      data: { labels: ar.map(String), datasets: dataset },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: {
            display: true,
            labels: {
              generateLabels: function () {
                var poster = [{ text: "Faktiskt utfall (SCB)", strokeStyle: FARG.ink, fillStyle: FARG.ink, lineWidth: 3 }];
                if (n > 1) {
                  poster.push({ text: "Äldsta prognosen (" + data.prognoser[0].prognosAr + ")",
                    strokeStyle: rampFarg(0, n), fillStyle: rampFarg(0, n), lineWidth: 2 });
                  poster.push({ text: "Senaste prognosen (" + data.prognoser[n - 1].prognosAr + ")",
                    strokeStyle: rampFarg(n - 1, n), fillStyle: rampFarg(n - 1, n), lineWidth: 2 });
                }
                return poster;
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
          x: {
            grid: { display: false },
            border: { color: FARG.baseline },
            ticks: { maxRotation: 0, autoSkipPadding: 12 }
          },
          y: {
            title: { display: true, text: ENHET_LANG, color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            beginAtZero: false,
            grace: "8%",   // luft runt kurvorna, men låt skalan välja runda tal
            ticks: { callback: function (v) { return talSv(v); } }
          }
        }
      }
    });

    K.aktiveraToning(chart, false);

    el("kalla-utfall").textContent =
      "Svart linje: SCB:s faktiska siffror. Blå linjer: kommunens prognoser, " +
      "klippta vid " + sistaUtfall + ". Skalan börjar inte på noll, utan följer " +
      "kurvorna – det gör skillnaderna synliga, men får dem också att se större ut. " +
      "Peka på en linje så tonas de övriga ned.";

    /* Tabell: utfallet med förändring, som facit att läsa mot */
    var t = "<caption>" + (data.serie ? data.serie + ". " : "") +
      data.utfallMeta.matt + " enligt SCB. Hämtad " + data.utfallMeta.hamtad +
      ".</caption>";
    t += "<thead><tr><th scope=\"col\">År</th><th scope=\"col\">Utfall</th>" +
      "<th scope=\"col\">Förändring</th></tr></thead><tbody>";
    ar.forEach(function (a, i) {
      var v = data.utfall[String(a)];
      var forra = i === 0 ? data.utfall[String(a - 1)] : data.utfall[String(ar[i - 1])];
      var d = forra === undefined ? null : v - forra;
      t += "<tr><td>" + a + "</td><td>" + talSv(v) + "</td><td>" +
        (d === null ? "–" : (d >= 0 ? "+" : "−") + talSv(Math.abs(d))) + "</td></tr>";
    });
    t += "</tbody>";
    el("tabell-utfall").innerHTML = t;
    el("sektion-utfall").hidden = false;
  }

  /* ---------- Källor ---------- */

  function initKallor(data) {
    var ul = el("lista-kallor");
    var html = "";
    data.prognoser.forEach(function (p) {
      html += "<li><span class=\"titel\">" + p.rapportTitel + "</span>";
      if (p.sidhanvisning) {
        html += "<br><span style=\"color:#898781;font-size:0.95rem\">Siffrorna hämtade ur: " +
          p.sidhanvisning + "</span>";
      }
      html += "<div class=\"lankar\">";
      if (p.lokalPdf) html += "<a href=\"" + p.lokalPdf + "\">Läs rapporten (PDF)</a>";
      if (p.kallaUrl) html += "<a href=\"" + p.kallaUrl + "\">Original hos källan</a>";
      if (p.arkivUrl) html += "<a href=\"" + p.arkivUrl + "\">Arkiverad kopia</a>";
      html += "</div></li>";
    });
    html += "<li><span class=\"titel\">Faktisk folkmängd: " + data.utfallMeta.kalla + "</span>" +
      "<br><span style=\"color:#898781;font-size:0.95rem\">" + data.utfallMeta.matt +
      ". Hämtad " + data.utfallMeta.hamtad + ".</span>" +
      "<div class=\"lankar\"><a href=\"" + data.utfallMeta.kallaUrl +
      "\">Öppna tabellen hos SCB</a></div></li>";
    ul.innerHTML = html;
    el("sektion-kallor").hidden = false;
    el("om-uppdaterad").textContent =
      "Utfallssiffrorna hämtades från SCB " + data.utfallMeta.hamtad + ".";
  }

  /* ---------- Kort sagt ----------
     De viktigaste observationerna, beräknade ur datafilen och försiktigt
     formulerade: inga slutsatser utöver vad talen faktiskt visar. */

  function initKortSagt(data, jamfor) {
    var sk = data.skevhet;
    if (!sk || !sk.antal) return;
    var punkter = [];
    var tecken = function (v) { return (v >= 0 ? "+" : "−") + talSv(Math.abs(v), 1) + " %"; };

    punkter.push("I de <strong>" + sk.antal + " jämförelser</strong> som kan " +
      "göras har prognoserna i genomsnitt avvikit <strong>" +
      talSv(sk.medelAbsPct, 1) + " %</strong> från utfallet.");

    var over = sk.antalOver, under = sk.antal - over;
    if (over >= Math.ceil(sk.antal * 0.75)) {
      punkter.push("Felen lutar åt ett håll: <strong>" + over + " av " + sk.antal +
        "</strong> prognosvärden låg över utfallet.");
    } else if (under >= Math.ceil(sk.antal * 0.75)) {
      punkter.push("Felen lutar åt ett håll: <strong>" + under + " av " + sk.antal +
        "</strong> prognosvärden låg under utfallet.");
    } else {
      punkter.push("Felen går åt båda hållen: " + over + " av " + sk.antal +
        " prognosvärden låg över utfallet, " + under + " under.");
    }

    var rader = data.perAvstand || [];
    if (rader.length > 1) {
      var kort = rader[0], langt = rader[rader.length - 1];
      var kortText = kort.avstand === 0 ? "samma år" : kort.avstand + " år i förväg";
      punkter.push("Felet " + (langt.medelAbsPct > kort.medelAbsPct
        ? "växer med prognoshorisonten" : "har inte vuxit entydigt med horisonten") +
        ": i snitt " + talSv(kort.medelAbsPct, 1) + " % för prognoser gjorda " +
        kortText + ", mot " + talSv(langt.medelAbsPct, 1) + " % för dem gjorda " +
        langt.avstand + " år i förväg.");
    }

    /* Träffsäkraste årgången – jämför bara vid samma horisont (ett år
       framåt), annars blandas kort och lång sikt. */
    var ettar = (data.perArgang || []).filter(function (r) {
      return r.ettArPct !== null && r.ettArPct !== undefined;
    });
    if (ettar.length >= 3) {
      var bast = ettar.reduce(function (a, b) {
        return Math.abs(b.ettArPct) < Math.abs(a.ettArPct) ? b : a;
      });
      punkter.push("Mätt på samma sikt – ett år framåt – har prognosen från " +
        "<strong>" + bast.prognosAr + "</strong> hittills varit träffsäkrast (" +
        tecken(bast.ettArPct) + ").");
    }

    if (jamfor && jamfor.skevhet && jamfor.skevhet.antal) {
      var eget = sk.medelAbsPct, andra = jamfor.skevhet.medelAbsPct;
      punkter.push("Osäkerheten är <strong>" +
        (eget > andra ? "större" : "mindre") + "</strong> för den här " +
        "åldersgruppen än för " + JAMFORSERIE + ": i snitt " +
        talSv(eget, 1) + " % fel mot " + talSv(andra, 1) + " %.");
    }

    if (data.kohort && data.kohort.motSenaste.length) {
      var kf = data.kohort;
      var forsta = kf.motSenaste[0];
      punkter.push("De barn som redan bor i kommunen räcker till <strong>" +
        talSv(kf.framskrivning[String(forsta.ar)]) + "</strong> " + ENHET +
        " i åldern " + kf.aldrar[0] + "–" + kf.aldrar[1] + " år " + forsta.ar +
        " och <strong>" + talSv(kf.framskrivning[String(kf.sistaAr)]) +
        "</strong> år " + kf.sistaAr + ", om ingen flyttade – en ren " +
        "framskrivning av dagens åldersklasser.");
    }

    K.visaKortSagt(punkter);
  }

  /* Årgångar som finns för hela befolkningen men inte i den här serien –
     på 16–19-sidan är det 2021 års rapport, som redovisar en annan
     åldersindelning. Räknas fram ur de två filerna i stället för att
     hårdkodas. */
  function initNotArgangar(data, jamfor) {
    if (!jamfor) return;
    var egna = {};
    data.prognoser.forEach(function (p) { egna[p.prognosAr] = true; });
    var saknade = jamfor.prognoser
      .map(function (p) { return p.prognosAr; })
      .filter(function (a) { return !egna[a]; });
    if (!saknade.length) return;
    K.sattDataNot("not-argangar",
      "<p>Prognosrapporten från <strong>" + saknade.join(", ") + "</strong> " +
      "ingår inte på den här sidan: den redovisar åldersgrupperna på ett " +
      "annat sätt (16–18 år i stället för 16–19) och går därför inte att " +
      "jämföra rakt av. Den finns med på " +
      "<a href=\"befolkningsprognos.html\">sidan för hela befolkningen</a>.</p>");
  }

  function initMeta(data) {
    var prognosAr = data.prognoser.map(function (p) { return p.prognosAr; });
    var utfallAr = Object.keys(data.utfall).map(Number);
    K.visaMeta({
      kalla: "Kungsbacka kommuns prognosrapporter och SCB",
      period: "prognoser " + Math.min.apply(null, prognosAr) + "–" +
        Math.max.apply(null, prognosAr),
      senaste: "utfall t.o.m. " + Math.max.apply(null, utfallAr),
      hamtad: data.utfallMeta.hamtad
    });
  }

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

    var dataset = [{
      label: "Faktiskt utfall (SCB)",
      data: ar.map(function (a) {
        var v = data.utfall[String(a)];
        return v === undefined ? null : v;
      }),
      borderColor: FARG.ink,
      backgroundColor: FARG.ink,
      borderWidth: 3,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBorderColor: FARG.surface,
      pointBorderWidth: 2,
      spanGaps: false,
      tension: 0.1
    }];
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
      k.aldrar[0] + "–" + k.aldrar[1] + " år om ingen flyttade. Historiskt " +
      "har den missat med i snitt " + talSv(kort.medelAbsPct, 1) + " % ett år " +
      "framåt och " + talSv(langt.medelAbsPct, 1) + " % " + langt.avstand +
      " år framåt. Riktningen skiftar: ett år framåt har den legat " +
      riktning(kort) + ", " + langt.avstand + " år framåt " + riktning(langt) +
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
        " i åldern " + k.aldrar[0] + "–" + k.aldrar[1] + " år " + forsta.ar +
        " – de finns redan i kommunen, de är bara yngre än så. År " +
        k.sistaAr + " är samma tal <strong>" +
        talSv(k.framskrivning[String(k.sistaAr)]) + "</strong>, en minskning " +
        "med " + talSv(Math.round(100 * (1 -
          k.framskrivning[String(k.sistaAr)] /
          k.framskrivning[String(forsta.ar)])), 0) + " %.</p>";
      if (under.length) {
        var storst = under.reduce(function (a, b) {
          return Math.abs(b.diff) > Math.abs(a.diff) ? b : a;
        });
        var storstPct = 100 * Math.abs(storst.diff) / storst.kohort;
        txt += "<p>Kommunens prognos från " + senaste.prognosAr + " ligger " +
          "<strong>under</strong> framskrivningen för " +
          (under.length === 1 ? "år " + under[0].ar
            : under[0].ar + "–" + under[under.length - 1].ar) +
          " – som mest " + talSv(Math.abs(storst.diff)) + " " + ENHET +
          " (" + talSv(storstPct, 1) + " %) år " + storst.ar + ". För att " +
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
      "<th scope=\"col\">Åldrar " + k.basAr + "</th>" +
      "<th scope=\"col\">Kommunens prognos</th>" +
      "<th scope=\"col\">Skillnad</th></tr></thead><tbody>";
    Object.keys(k.framskrivning).map(Number).sort(function (a, b) { return a - b; })
      .forEach(function (a) {
        var rad = mot.filter(function (r) { return r.ar === a; })[0];
        var kallor = k.ursprung[String(a)];
        tabell += "<tr><th scope=\"row\">" + a + "</th><td>" +
          talSv(k.framskrivning[String(a)]) + "</td><td>" +
          kallor[0].alder + "–" + kallor[kallor.length - 1].alder + " år</td><td>" +
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
    dataset.push({
      label: "Faktiskt utfall (SCB)",
      data: ar.map(function (y) {
        var v = data.utfall[String(y)];
        return v === undefined ? null : v;
      }),
      borderColor: FARG.ink,
      backgroundColor: FARG.ink,
      borderWidth: 3,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBorderColor: FARG.surface,
      pointBorderWidth: 2,
      spanGaps: false,
      tension: 0.1
    });

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
        "årsskifte från " + argangar[0].basAr + " till " +
        argangar[argangar.length - 1].basAr + ". Den äldsta (" +
        langst.basAr + ") går att pröva " + langst.maxAvstand + " år framåt " +
        "och har då missat med i snitt " + talSv(langst.medelAbsPct, 1) +
        " %; " + bast.basAr + " års årgång är den träffsäkraste så här långt (" +
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
      tab += "<th scope=\"col\">Från " + arg.basAr + "</th>";
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
            label: "Kohortframskrivning",
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
               title: { display: true, text: "Genomsnittligt fel (%)", color: FARG.muted },
               grid: { color: FARG.grid }, border: { display: false },
               ticks: { callback: function (v) { return talSv(v, 1) + " %"; } } }
        }
      }
    });

    var kohortBast = rader.filter(function (r) {
      /* Bara horisonter där skillnaden syns även efter avrundningen till
         en decimal – annars läses "1,9 % mot 1,9 %" som ett skrivfel. */
      return r.kohortAbsPct < r.kommunAbsPct &&
        Math.round(r.kommunAbsPct * 10) !== Math.round(r.kohortAbsPct * 10);
    });
    var vand = rader.filter(function (r) {
      return r.kohortAbsPct >= r.kommunAbsPct;
    });
    el("kalla-kohortfel").textContent =
      "Genomsnittligt fel utan tecken, i procent av det faktiska antalet. " +
      "Bara målår där båda har ett värde och facit finns.";
    el("slutsats-kohortfel").innerHTML =
      "<p>På kort sikt är den enkla framskrivningen " +
      (kohortBast.length
        ? "<strong>träffsäkrare</strong> än kommunens modell: " +
          kohortBast.map(function (r) {
            return (r.avstand === 0 ? "samma år" : r.avstand + " år framåt") +
              " " + talSv(r.kohortAbsPct, 1) + " % mot " +
              talSv(r.kommunAbsPct, 1) + " %";
          }).join(", ") + "."
        : "inte träffsäkrare än kommunens modell vid någon horisont.") +
      (vand.length
        ? " Från " + vand[0].avstand + " år och framåt vänder det: då " +
          "börjar inflyttningen betyda mer än vilka barn som redan bor här, " +
          "och kommunens modell &ndash; som räknar med flyttning &ndash; " +
          "tar över."
        : "") +
      " Staplarna bygger på få jämförelser vid de längsta horisonterna; " +
      "antalet står i tooltipen.</p>";

    var t = "<caption>Genomsnittligt fel utan tecken, per antal år i " +
      "förväg.</caption><thead><tr><th scope=\"col\">År i förväg</th>" +
      "<th scope=\"col\">Jämförelser</th>" +
      "<th scope=\"col\">Kommunens prognos</th>" +
      "<th scope=\"col\">Kohortframskrivning</th></tr></thead><tbody>";
    rader.forEach(function (r) {
      t += "<tr><th scope=\"row\">" + r.avstand + "</th><td>" + r.antal +
        "</td><td>" + talSv(r.kommunAbsPct, 1) + " %</td><td>" +
        talSv(r.kohortAbsPct, 1) + " %</td></tr>";
    });
    el("tabell-kohortfel").innerHTML = t + "</tbody>";
    el("sektion-kohortfel").hidden = false;
  }

  /* ---------- Start ---------- */

  function hamtaJson(fil) {
    return fetch(fil).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  Promise.all([
    hamtaJson(DATAFIL),
    JAMFORFIL ? hamtaJson(JAMFORFIL).catch(function () { return null; })
              : Promise.resolve(null)
  ])
    .then(function (svar) {
      var data = svar[0], jamfor = svar[1];
      installChartDefaults();
      if (!data.prognoser || !data.prognoser.length) {
        visaStatus("<strong>Datat är inte på plats ännu.</strong> " +
          "Prognossiffrorna håller på att samlas in. Titta gärna tillbaka snart.");
        if (data.utfallMeta) initKallor(data);
        return;
      }
      var antalJamforelser = data.prognoser.reduce(function (n, p) {
        return n + Object.keys(p.avvikelser || {}).length;
      }, 0);
      if (!antalJamforelser) {
        visaStatus("<strong>Jämförelserna är inte klara ännu.</strong> För att kunna " +
          "visa hur väl prognoserna slagit in behövs äldre prognosrapporter, som " +
          "gäller år där facit redan finns. De samlas in nu. Så länge visas " +
          "kommunens senaste prognos tillsammans med den faktiska utvecklingen.");
      }
      initKortSagt(data, jamfor);
      initNotArgangar(data, jamfor);
      initMeta(data);
      initMalar(data);
      initAvstand(data);
      initSkevhet(data);
      initKohort(data);
      initKohortAlla(data);
      initKohortfel(data);
      initSpagetti(data);
      initUtfall(data);
      initKallor(data);
      K.aktiveraTabellverktyg();
    })
    .catch(function (fel) {
      visaStatus("<strong>Kunde inte läsa in datat.</strong> Tekniskt fel: " + fel.message);
    });
})();
