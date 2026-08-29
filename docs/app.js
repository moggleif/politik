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
  var esc = K.esc;
  var sakerUrl = K.sakerUrl;

  var KONF = document.body.dataset;
  var DATAFIL = KONF.datafil || "data.json";
  var ENHET = KONF.enhet || "invånare";                 // "invånare" / "ungdomar"
  var ENHET_LANG = KONF.enhetLang || "Antal invånare";  // axelrubrik
  var JAMFORFIL = KONF.jamforfil || null;               // seriens jämförelsefil
  var JAMFORSERIE = KONF.jamforserie || "";

  var talSv = K.talSv;

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
    html += "<p><strong>Tidigaste prognosen</strong> (gjord " + esc(forsta.prognosAr) + ", " +
      esc(forsta.avv.avstand) + " år i förväg) trodde på " + talSv(forsta.avv.prognos) +
      " " + ENHET + " år " + malAr + ". Det blev " + talSv(forsta.avv.utfall) +
      " – prognosen låg " + talSv(Math.abs(forsta.avv.diff)) + " personer " +
      (forsta.avv.diff >= 0 ? "för högt" : "för lågt") +
      " (" + talSv(Math.abs(forsta.avv.pct), 1) + " %).</p>";
    if (sista !== forsta) {
      html += "<p><strong>Senaste prognosen</strong> (gjord " + esc(sista.prognosAr) + ", " +
        (sista.avv.avstand === 0 ? "samma år" : esc(sista.avv.avstand) + " år i förväg") +
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
      t += "<tr><td>" + esc(p.prognosAr) + "</td><td>" + talSv(p.avv.prognos) + "</td><td>" +
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
      (langt.avstand === 0 ? "samma år" : esc(langt.avstand) + " år i förväg") +
      "</strong> missat med " + talSv(langt.medelAbsPct, 1) + " %, medan de som gjorts " +
      (kort.avstand === 0 ? "<strong>samma år</strong>" : "<strong>" + esc(kort.avstand) + " år i förväg</strong>") +
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
              return r.avstand === 0 ? "samma år" : esc(r.avstand) + " år före";
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
      t += "<tr><td>" + (r.avstand === 0 ? "Samma år" : esc(r.avstand) + " år före") + "</td><td>" +
        talSv(r.medelAbsPct, 1) + " %</td><td>" + talSv(r.maxAbsPct, 1) + " %</td><td>" +
        esc(r.antal) + "</td></tr>";
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

    var html = "<p><strong>" + dominans + " av " + esc(n) + "</strong> jämförelser " +
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
        esc(lag.map(function (r) { return r.prognosAr; }).join(", ")) +
        " låg för lågt, medan de från " +
        esc(hog.map(function (r) { return r.prognosAr; }).join(", ")) +
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
        esc(varst.prognosAr) + " års prognos sämst (" + tecken(varst.ettArPct) +
        ") och " + esc(senast.prognosAr) + " års senast mätbar (" +
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
        esc(n) + " jämförelser. Riktningen är tydlig, men underlaget är litet.</p>";
    }
    el("slutsats-skevhet").innerHTML = html;

    var t = "<caption>Genomsnittligt fel med riktning, per antal år i förväg. " +
      "Plus betyder att prognosen låg för högt.</caption>";
    t += "<thead><tr><th scope=\"col\">Hur långt i förväg</th>" +
      "<th scope=\"col\">Genomsnittligt fel</th>" +
      "<th scope=\"col\">Antal för höga</th>" +
      "<th scope=\"col\">Antal prognosvärden</th></tr></thead><tbody>";
    rader.forEach(function (r) {
      t += "<tr><td>" + (r.avstand === 0 ? "Samma år" : esc(r.avstand) + " år före") +
        "</td><td>" + (r.medelPct >= 0 ? "+" : "−") + talSv(Math.abs(r.medelPct), 1) +
        " %</td><td>" + esc(r.antalOver) + "</td><td>" + esc(r.antal) + "</td></tr>";
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
        t += "<tr><td>" + esc(r.prognosAr) + "</td><td>" + e + "</td><td>" +
          (r.medelPct >= 0 ? "+" : "−") + talSv(Math.abs(r.medelPct), 1) +
          " %</td><td>" + (r.maxAvstand === 0 ? "samma år" : esc(r.maxAvstand) + " år framåt") +
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
      t += "<th scope=\"col\">Prognos " + esc(p.prognosAr) + "</th>";
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
    var t = "<caption>" + (data.serie ? esc(data.serie) + ". " : "") +
      esc(data.utfallMeta.matt) + " enligt SCB. Hämtad " + esc(data.utfallMeta.hamtad) +
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
      html += "<li><span class=\"titel\">" + esc(p.rapportTitel) + "</span>";
      if (p.sidhanvisning) {
        html += "<br><span class=\"detalj\">Siffrorna hämtade ur: " +
          esc(p.sidhanvisning) + "</span>";
      }
      html += "<div class=\"lankar\">";
      /* sakerUrl ger tom sträng för otillåtna adresser — då ritas länken inte. */
      var pdfUrl = sakerUrl(p.lokalPdf), origUrl = sakerUrl(p.kallaUrl),
          arkivUrl = sakerUrl(p.arkivUrl);
      if (p.lokalPdf && pdfUrl) html += "<a href=\"" + pdfUrl + "\">Läs rapporten (PDF)</a>";
      if (p.kallaUrl && origUrl) html += "<a href=\"" + origUrl + "\">Original hos källan</a>";
      if (p.arkivUrl && arkivUrl) html += "<a href=\"" + arkivUrl + "\">Arkiverad kopia</a>";
      html += "</div></li>";
    });
    var scbUrl = sakerUrl(data.utfallMeta.kallaUrl);
    html += "<li><span class=\"titel\">Faktisk folkmängd: " + esc(data.utfallMeta.kalla) + "</span>" +
      "<br><span class=\"detalj\">" + esc(data.utfallMeta.matt) +
      ". Hämtad " + esc(data.utfallMeta.hamtad) + ".</span>" +
      (scbUrl ? "<div class=\"lankar\"><a href=\"" + scbUrl +
        "\">Öppna tabellen hos SCB</a></div>" : "") + "</li>";
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

    punkter.push("I de <strong>" + esc(sk.antal) + " jämförelser</strong> som kan " +
      "göras har prognoserna i genomsnitt avvikit <strong>" +
      talSv(sk.medelAbsPct, 1) + " %</strong> från utfallet.");

    var over = sk.antalOver, under = sk.antal - over;
    if (over >= Math.ceil(sk.antal * 0.75)) {
      punkter.push("Felen lutar åt ett håll: <strong>" + esc(over) + " av " + esc(sk.antal) +
        "</strong> prognosvärden låg över utfallet.");
    } else if (under >= Math.ceil(sk.antal * 0.75)) {
      punkter.push("Felen lutar åt ett håll: <strong>" + under + " av " + esc(sk.antal) +
        "</strong> prognosvärden låg under utfallet.");
    } else {
      punkter.push("Felen går åt båda hållen: " + esc(over) + " av " + esc(sk.antal) +
        " prognosvärden låg över utfallet, " + under + " under.");
    }

    var rader = data.perAvstand || [];
    if (rader.length > 1) {
      var kort = rader[0], langt = rader[rader.length - 1];
      var kortText = kort.avstand === 0 ? "samma år" : esc(kort.avstand) + " år i förväg";
      punkter.push("Felet " + (langt.medelAbsPct > kort.medelAbsPct
        ? "växer med prognoshorisonten" : "har inte vuxit entydigt med horisonten") +
        ": i snitt " + talSv(kort.medelAbsPct, 1) + " % för prognoser gjorda " +
        kortText + ", mot " + talSv(langt.medelAbsPct, 1) + " % för dem gjorda " +
        esc(langt.avstand) + " år i förväg.");
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
        "<strong>" + esc(bast.prognosAr) + "</strong> hittills varit träffsäkrast (" +
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
        " i åldern " + esc(kf.aldrar[0]) + "–" + esc(kf.aldrar[1]) + " år " + esc(forsta.ar) +
        " och <strong>" + talSv(kf.framskrivning[String(kf.sistaAr)]) +
        "</strong> år " + esc(kf.sistaAr) + ", om ingen flyttade – en ren " +
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
      "<p>Prognosrapporten från <strong>" + esc(saknade.join(", ")) + "</strong> " +
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

    var dataset = [{
      label: "Faktiskt utfall (SCB)",
      data: ar.map(function (a) {
        var v = data.utfall[String(a)];
        return v === undefined ? null : v;
      }),
      borderColor: FARG.ink, backgroundColor: FARG.ink,
      borderWidth: 3, pointRadius: 3, pointHoverRadius: 6,
      pointBorderColor: FARG.surface, pointBorderWidth: 2,
      spanGaps: false, tension: 0.1
    }];
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
               title: { display: true, text: "Genomsnittligt fel (%)", color: FARG.muted },
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
               title: { display: true, text: "Genomsnittligt fel (%)", color: FARG.muted },
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

  /* ---------- Start ---------- */

  K.starta(DATAFIL, {
    jamforfil: JAMFORFIL,
    tomt: function (data) { return !data.prognoser || !data.prognoser.length; },
    tomtText: "Prognossiffrorna håller på att samlas in.",
    vidTomt: function (data) { if (data.utfallMeta) initKallor(data); },
    init: function (data, jamfor) {
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
      initKvoter(data);
      initKompenserad(data);
      initVarianter(data);
      initKohortfel(data);
      initSpagetti(data);
      initUtfall(data);
      initKallor(data);
    }
  });
})();
