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
                var rad = [
                  "Genomsnittligt absolut fel: " + talSv(r.medelAbsPct, 1) + " %",
                  "Största fel: " + talSv(r.maxAbsPct, 1) + " %",
                  "Bygger på " + r.antal + " prognosvärden"
                ];
                if (r.argangar && r.argangar.length) {
                  rad.push("Prognosårgångar: " + r.argangar.join(", "));
                }
                return rad;
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: "Kalenderår mellan prognosårgång och målår", color: FARG.muted },
            grid: { display: false },
            border: { color: FARG.baseline }
          },
          y: {
            title: { display: true, text: "Genomsnittligt absolut fel i procent", color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            beginAtZero: true,
            ticks: { callback: function (v) { return talSv(v, 1) + " %"; } }
          }
        }
      }
    });

    el("kalla-avstand").textContent =
      "Genomsnitt av felet (utan hänsyn till riktning) för alla prognoser och " +
      "år där utfall finns. Avståndet är antalet kalenderår mellan " +
      "prognosårgången och målåret. Rapporterna publiceras vid olika tider " +
      "på året, så \u201dsamma år\u201d betyder en prognos gjord någon gång " +
      "under målåret \u2013 inte vid dess slut. Staplarna bygger på olika " +
      "prognosårgångar och beskriver materialet; de mäter inte vad en längre " +
      "prognoshorisont orsakar.";

    var kort = rader[0], langt = rader[rader.length - 1];
    /* Vilka årgångar varje stapel vilar på är en uppgift om datat, och
       den avgör vad jämförelsen mellan två staplar kan betyda. */
    function argangstext(r) {
      var a = r.argangar || [];
      if (!a.length) return "";
      return a.length === 1
        ? " (årgången " + esc(a[0]) + ")"
        : " (" + esc(a.length) + " årgångar, " + esc(a[0]) + "\u2013" +
          esc(a[a.length - 1]) + ")";
    }
    var html = "<p>I genomsnitt har prognoserna som gjorts <strong>" +
      (langt.avstand === 0 ? "samma år" : esc(langt.avstand) + " år i förväg") +
      "</strong> missat med " + talSv(langt.medelAbsPct, 1) + " %" +
      argangstext(langt) + ", medan de som gjorts " +
      (kort.avstand === 0 ? "<strong>samma år</strong>" : "<strong>" + esc(kort.avstand) + " år i förväg</strong>") +
      " missat med " + talSv(kort.medelAbsPct, 1) + " %" + argangstext(kort) +
      ". Det är olika prognosårgångar bakom de två talen.</p>";
    /* Hur många prognosvärden varje stapel vilar på är en uppgift om
       datat, och står därför utskriven. */
    var tunna = rader.filter(function (r) { return r.antal < 3; });
    if (tunna.length) {
      html += "<p>" +
        (tunna.length === rader.length
          ? "Samtliga staplar bygger på färre än tre prognosvärden"
          : "Staplarna för " + tunna.map(function (r) {
              return r.avstand === 0 ? "samma år" : esc(r.avstand) + " år före";
            }).join(", ") + " bygger på färre än tre prognosvärden") +
        ". Antalet bakom varje stapel syns när du pekar på den, och i " +
        "tabellen nedan.</p>";
    }
    el("slutsats-avstand").innerHTML = html;

    var t = "<caption>Genomsnittligt absolut prognosfel per antal år i " +
      "förväg, med de prognosårgångar varje rad bygger på.</caption>";
    t += "<thead><tr><th scope=\"col\">Kalenderår före målåret</th><th scope=\"col\">Genomsnittligt absolut fel</th>" +
      "<th scope=\"col\">Största fel</th><th scope=\"col\">Antal prognosvärden</th>" +
      "<th scope=\"col\">Prognosårgångar</th></tr></thead><tbody>";
    rader.forEach(function (r) {
      t += "<tr><td>" + (r.avstand === 0 ? "Samma år" : esc(r.avstand) + " år före") + "</td><td>" +
        talSv(r.medelAbsPct, 1) + " %</td><td>" + talSv(r.maxAbsPct, 1) + " %</td><td>" +
        esc(r.antal) + "</td><td>" + esc((r.argangar || []).join(", ")) + "</td></tr>";
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
                  "Genomsnittligt fel med riktning: " + (r.medelPct >= 0 ? "+" : "−") +
                    talSv(Math.abs(r.medelPct), 1) + " %",
                  r.antalOver + " av " + r.antal + " prognoser låg för högt"
                ];
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: "Kalenderår mellan prognosårgång och målår", color: FARG.muted },
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
    /* Tröskeln är en läshjälp för att avgöra om obalansen är värd att
       kommentera – inte ett statistiskt test. Se brasklappen nedan. */
    var tydligObalans = dominans >= Math.ceil(n * 0.75);

    var html = "<p><strong>" + dominans + " av " + esc(n) + "</strong> jämförelser " +
      "ligger " + hall + ".</p>";
    html += "<p>Genomsnittet över alla jämförelser är <strong>" +
      (sk.medelPct >= 0 ? "+" : "−") + talSv(Math.abs(sk.medelPct), 1) +
      " %</strong>.</p>";
    var arg = data.perArgang || [];
    var skiftar = sk.bytterRiktning && arg.length > 1;

    if (tydligObalans) {
      html += "<p>Övervikten åt ett håll är alltså tydlig i materialet. " +
        "Hur mycket den säger går däremot inte att avgöra härifrån: " +
        "jämförelserna är inte oberoende av varandra. Samma utfallsår ingår " +
        "i flera prognosårgångar, och alla prognoshorisonter är " +
        "sammanräknade. Läs siffran som en beskrivning av det här " +
        "materialet, inte som ett fastställt systematiskt fel.</p>";
    } else {
      html += "<p>Felen fördelar sig åt båda håll utan någon tydlig övervikt. " +
        "Notera att jämförelserna inte är oberoende: samma utfallsår ingår " +
        "i flera prognosårgångar, och alla prognoshorisonter är " +
        "sammanräknade.</p>";
    }

    /* Har skevheten bytt riktning över tid? Det är ett annat fel än en
       konstant lutning, och kräver en annan åtgärd. */
    if (skiftar) {
      var lag = arg.filter(function (r) { return r.medelPct < 0; });
      var hog = arg.filter(function (r) { return r.medelPct > 0; });
      html += "<p><strong>Riktningen skiljer sig mellan årgångar.</strong> " +
        "Prognoserna från " +
        esc(lag.map(function (r) { return r.prognosAr; }).join(", ")) +
        " låg i genomsnitt för lågt, medan de från " +
        esc(hog.map(function (r) { return r.prognosAr; }).join(", ")) +
        " låg för högt. Vad skillnaden beror på går inte att avgöra ur de " +
        "här siffrorna. Den kan spegla något i modellen, men lika gärna att " +
        "åren i sig varit olika svåra att förutsäga &ndash; och med så få " +
        "årgångar kan enstaka teckenbyten vara slumpmässiga.</p>";
    }

    /* Har modellen blivit bättre? Bara jämförbart vid samma horisont –
       en gammal årgång har utvärderats många år framåt, en ny bara på
       kort sikt, så medelvärdena i sig går inte att ställa mot varandra. */
    var ett = arg.filter(function (r) { return r.ettArPct !== null && r.ettArPct !== undefined; });
    if (ett.length >= 4) {
      /* Bara samma horisont går att jämföra mellan årgångar – en gammal
         årgång har prövats många år framåt, en ny bara på kort sikt.
         Serien redovisas som den är: att ställa den senaste årgången mot
         den sämsta någonsin vore inget mått på utveckling över tid, för
         nästan vilket värde som helst slår ett rekordfel. */
      var absfel = ett.map(function (r) { return Math.abs(r.ettArPct); });
      var minsta = Math.min.apply(null, absfel);
      var storsta = Math.max.apply(null, absfel);
      var senast = ett[ett.length - 1];
      var tecken = function (v) { return (v >= 0 ? "+" : "−") + talSv(Math.abs(v), 1) + " %"; };
      html += "<p><strong>Har det blivit bättre?</strong> Frågan kräver att " +
        "årgångarna jämförs på samma sikt &ndash; en gammal prognos har " +
        "hunnit prövas många år framåt, en ny bara på kort sikt. Mätt " +
        "<em>ett år framåt</em> har felet i de " + esc(ett.length) +
        " årgångar som går att mäta legat mellan " + talSv(minsta, 1) +
        " och " + talSv(storsta, 1) + " procent, och den senaste mätbara (" +
        esc(senast.prognosAr) + ") hamnade på " + tecken(senast.ettArPct) +
        ". Värdena hoppar upp och ned mellan årgångarna. Så få mätpunkter " +
        "räcker inte för att avgöra om prognoserna blivit bättre eller " +
        "sämre över tid &ndash; hela serien står i tabellen nedan.</p>";
    }

    html += "<p>Fördelningen bygger på " + esc(n) + " jämförelser.</p>";
    el("slutsats-skevhet").innerHTML = html;

    var t = "<caption>Genomsnittligt fel med riktning, per antal år i förväg. " +
      "Plus betyder att prognosen låg för högt.</caption>";
    t += "<thead><tr><th scope=\"col\">Kalenderår före målåret</th>" +
      "<th scope=\"col\">Genomsnittligt fel med riktning</th>" +
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
    /* Kohortlinjen ritas bara när 16–19-sidans kohort.js är inläst */
    if (data.kohort && K.kohortDataset) dataset.push(K.kohortDataset(data, ar, 2));
    dataset.push(K.utfallDataset(data, ar));

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
      talSv(sk.medelAbsPct, 1) + " %</strong> från utfallet &ndash; alla " +
      "prognoshorisonter sammanräknade. Felet per horisont, som är det " +
      "jämförbara måttet, visas i diagrammet nedan.");

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
      punkter.push("Felet är i snitt " + talSv(kort.medelAbsPct, 1) +
        " % för prognoser gjorda " + kortText + " och " +
        talSv(langt.medelAbsPct, 1) + " % för dem gjorda " +
        esc(langt.avstand) + " år i förväg. Talen bygger på olika " +
        "prognosårgångar och säger inte vad horisonten orsakar.");
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

    /* Jämför serierna vid samma prognoshorisont – de samlade snitten
       blandar olika horisonter med olika vikt och går inte att ställa
       mot varandra. */
    function felVidTreAr(d) {
      var r = (d.perAvstand || []).filter(function (x) { return x.avstand === 3; })[0];
      return r && r.medelAbsPct !== null && r.medelAbsPct !== undefined
        ? r.medelAbsPct : null;
    }
    if (jamfor) {
      var eget = felVidTreAr(data), andra = felVidTreAr(jamfor);
      if (eget !== null && andra !== null && eget !== andra) {
        punkter.push("Mätt vid samma horisont &ndash; tre år framåt &ndash; har " +
          "det absoluta felet varit <strong>" +
          (eget > andra ? "större" : "mindre") + "</strong> för den här " +
          "åldersgruppen än för " + JAMFORSERIE + ": " +
          talSv(eget, 1) + " % mot " + talSv(andra, 1) + " %.");
      }
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
      /* Kohortsektionerna finns bara på 16–19-sidan; den läser in
         kohort.js, som registrerar initieraren. */
      if (K.kohortInit) K.kohortInit(data);
      initSpagetti(data);
      initUtfall(data);
      initKallor(data);
    }
  });
})();
