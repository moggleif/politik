/* Prognoskollen Kungsbacka — läser data.json och ritar diagrammen. */
(function () {
  "use strict";

  var FARG = {
    ink: "#0b0b0b",
    ink2: "#52514e",
    muted: "#898781",
    grid: "#e1e0d9",
    baseline: "#c3c2b7",
    surface: "#fcfcfb",
    bla: "#2a78d6",
    blaMork: "#1c5cab",
    rod: "#e34948",
    gra: "#c3c2b7"
  };

  function el(id) { return document.getElementById(id); }

  function talSv(n, dec) {
    return n.toLocaleString("sv-SE", {
      minimumFractionDigits: dec || 0,
      maximumFractionDigits: dec || 0
    });
  }

  function visaStatus(html) {
    var s = el("status");
    s.innerHTML = html;
    s.hidden = false;
  }

  function installChartDefaults() {
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    Chart.defaults.font.size = 15;
    Chart.defaults.color = FARG.ink2;
    Chart.defaults.borderColor = FARG.grid;
    Chart.defaults.plugins.tooltip.backgroundColor = FARG.ink;
    Chart.defaults.plugins.tooltip.titleFont = { size: 15, weight: "600" };
    Chart.defaults.plugins.tooltip.bodyFont = { size: 15 };
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.displayColors = false;
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
                  "Prognosen sa: " + talSv(a.prognos) + " invånare",
                  "Det blev: " + talSv(a.utfall) + " invånare",
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
      "Utfall " + malAr + ": " + talSv(utfall) + " invånare (SCB). " +
      "Röd stapel = prognosen för hög, blå = för låg. Källor: se längst ned.";

    /* Klarspråkssammanfattning */
    var forsta = punkter[0], sista = punkter[punkter.length - 1];
    var html = "";
    html += "<p><strong>Tidigaste prognosen</strong> (gjord " + forsta.prognosAr + ", " +
      forsta.avv.avstand + " år i förväg) trodde på " + talSv(forsta.avv.prognos) +
      " invånare år " + malAr + ". Det blev " + talSv(forsta.avv.utfall) +
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
      talSv(utfall) + " invånare.</caption>";
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
    valjare.addEventListener("change", function () { ritaMalar(data, Number(valjare.value)); });
    ritaMalar(data, lista[0]);
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

  /* ---------- Sektion 3: Spagettidiagram ---------- */

  function initSpagetti(data) {
    var utfallAr = Object.keys(data.utfall).map(Number);
    var allaAr = {};
    utfallAr.forEach(function (a) { allaAr[a] = true; });
    data.prognoser.forEach(function (p) {
      Object.keys(p.prognos).forEach(function (a) { allaAr[a] = true; });
    });
    var ar = Object.keys(allaAr).map(Number).sort(function (a, b) { return a - b; });
    /* Begränsa till ett läsbart fönster: från fem år före första prognosen */
    var forstaPrognosAr = data.prognoser.length
      ? Math.min.apply(null, data.prognoser.map(function (p) { return p.prognosAr; }))
      : ar[0];
    ar = ar.filter(function (a) { return a >= forstaPrognosAr - 5; });

    var dataset = [];
    data.prognoser.forEach(function (p) {
      dataset.push({
        label: "Prognos " + p.prognosAr,
        data: ar.map(function (a) {
          return p.prognos[String(a)] !== undefined ? p.prognos[String(a)] : null;
        }),
        borderColor: FARG.gra,
        backgroundColor: FARG.gra,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        spanGaps: false,
        tension: 0.1
      });
    });
    dataset.push({
      label: "Faktisk folkmängd (SCB)",
      data: ar.map(function (a) {
        return data.utfall[String(a)] !== undefined ? data.utfall[String(a)] : null;
      }),
      borderColor: FARG.bla,
      backgroundColor: FARG.bla,
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
    new Chart(ctx, {
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
              /* Visa bara två poster: utfallet och en samlad "Prognoser" */
              generateLabels: function (chart) {
                return [
                  { text: "Faktisk folkmängd (SCB)", strokeStyle: FARG.bla, fillStyle: FARG.bla, lineWidth: 3 },
                  { text: "Kommunens prognoser", strokeStyle: FARG.gra, fillStyle: FARG.gra, lineWidth: 2 }
                ];
              }
            }
          },
          tooltip: {
            callbacks: {
              title: function (it) { return "År " + it[0].label; },
              label: function (it) {
                return it.dataset.label + ": " + talSv(it.parsed.y) + " invånare";
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
            title: { display: true, text: "Antal invånare", color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            ticks: { callback: function (v) { return talSv(v); } }
          }
        }
      }
    });

    el("kalla-spagetti").textContent =
      "Blå linje: SCB:s faktiska folkmängd 31 december. Grå linjer: kommunens prognoser.";

    /* Tabell: matris år × prognos */
    var t = "<caption>Faktisk folkmängd och samtliga prognoser, antal invånare.</caption>";
    t += "<thead><tr><th scope=\"col\">År</th><th scope=\"col\">Utfall (SCB)</th>";
    data.prognoser.forEach(function (p) {
      t += "<th scope=\"col\">Prognos " + p.prognosAr + "</th>";
    });
    t += "</tr></thead><tbody>";
    ar.forEach(function (a) {
      t += "<tr><td>" + a + "</td><td>" +
        (data.utfall[String(a)] !== undefined ? talSv(data.utfall[String(a)]) : "–") + "</td>";
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

  /* ---------- Start ---------- */

  fetch("data.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      installChartDefaults();
      if (!data.prognoser || !data.prognoser.length) {
        visaStatus("<strong>Datat är inte på plats ännu.</strong> " +
          "Prognossiffrorna håller på att samlas in. Titta gärna tillbaka snart.");
        if (data.utfallMeta) initKallor(data);
        return;
      }
      initMalar(data);
      initAvstand(data);
      initSpagetti(data);
      initKallor(data);
    })
    .catch(function (fel) {
      visaStatus("<strong>Kunde inte läsa in datat.</strong> Tekniskt fel: " + fel.message);
    });
})();
