/* Slutbetyg per ämne i årskurs 9 — hela Kungsbacka kommun.
   Två mått med olika skalor hålls isär: betygspoäng (0–20) och andelen
   med godkänt (0–100 %) visas aldrig i samma diagram.
   Läser docs/data-amnesbetyg.json, byggd av scripts/build_amnesbetyg.py. */
(function () {
  "use strict";

  var K = window.KIS;
  var FARG = K.FARG;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;
  var sakerUrl = K.sakerUrl;

  var DATAFIL = "data-amnesbetyg.json";
  var DATA = null;

  function sistaAr() { return DATA.ar[DATA.ar.length - 1]; }
  function lasar(a) { return DATA.lasar[String(a)] || String(a); }

  function cell(amne, ar, falt) {
    var r = amne.varden[String(ar)];
    return r ? r[falt] : null;
  }

  /* Ämnen som har minst ett år med värde — de helt dubbelprickade
     (teckenspråk m.fl.) hör hemma i noten, inte i diagrammen. */
  function redovisade() {
    return DATA.amnen.filter(function (a) { return a.redovisas; });
  }

  function basOptions(ytitel, tooltipEtikett, vagrat) {
    var matt = { title: { display: true, text: ytitel, color: FARG.muted },
                 grid: { color: FARG.grid }, border: { display: false } };
    var kat = { grid: { display: false }, border: { color: FARG.baseline },
                ticks: { autoSkip: false } };
    return {
      maintainAspectRatio: false,
      responsive: true,
      indexAxis: vagrat ? "y" : "x",
      interaction: { mode: vagrat ? "nearest" : "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: tooltipEtikett } }
      },
      scales: vagrat ? { x: matt, y: kat } : { x: kat, y: matt }
    };
  }

  /* ---------- 1. Alla ämnen, senaste läsåret ---------- */

  function ritaRangordning() {
    var ar = sistaAr();
    var rader = redovisade()
      .filter(function (a) { return cell(a, ar, "betygspoang") !== null; })
      .map(function (a) {
        return { namn: a.namn, v: cell(a, ar, "betygspoang") };
      })
      .sort(function (x, y) { return y.v - x.v; });

    var ctx = el("diagram-rang");
    ctx.parentElement.style.height = (90 + rader.length * 26) + "px";

    new Chart(ctx, {
      type: "bar",
      data: {
        labels: rader.map(function (r) { return r.namn; }),
        datasets: [{
          label: "Betygspoäng",
          data: rader.map(function (r) { return r.v; }),
          backgroundColor: FARG.bla,
          borderWidth: 0,
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: basOptions("Genomsnittlig betygspoäng (max " + DATA.maxPoang + ")",
        function (it) { return talSv(it.parsed.x, 1) + " av " + DATA.maxPoang; }, true)
    });

    el("kalla-rang").textContent =
      "Källa: Skolverket, läsåret " + lasar(ar) + ". Betygspoäng: A=20, E=10, F=0.";

    var hogst = rader[0], lagst = rader[rader.length - 1];
    el("slutsats-rang").innerHTML =
      "<p>Läsåret " + esc(lasar(ar)) + " hade <strong>" + esc(hogst.namn.toLowerCase()) +
      "</strong> den högsta genomsnittliga betygspoängen (" + talSv(hogst.v, 1) +
      ") och <strong>" + esc(lagst.namn.toLowerCase()) + "</strong> den lägsta (" +
      talSv(lagst.v, 1) + ").</p>";

    el("tabell-rang").innerHTML =
      "<thead><tr><th scope=\"col\">Ämne</th><th scope=\"col\">Betygspoäng</th>" +
      "<th scope=\"col\">Andel med A&ndash;E</th></tr></thead><tbody>" +
      rader.map(function (r) {
        var a = hittaAmne(r.namn);
        var ae = cell(a, ar, "andelAE");
        return "<tr><th scope=\"row\">" + esc(r.namn) + "</th><td>" + talSv(r.v, 1) +
          "</td><td>" + (ae === null ? ".." : talSv(ae, 1) + "&nbsp;%") + "</td></tr>";
      }).join("") + "</tbody>";
  }

  function hittaAmne(namn) {
    for (var i = 0; i < DATA.amnen.length; i++) {
      if (DATA.amnen[i].namn === namn) return DATA.amnen[i];
    }
    return null;
  }

  /* ---------- 2. Ett ämne över tid ---------- */

  function fyllValjare() {
    var v = el("amne-valjare");
    v.innerHTML = redovisade().map(function (a) {
      return '<option value="' + esc(a.namn) + '">' + esc(a.namn) + "</option>";
    }).join("");
    /* Matematik som förval om det finns — annars första ämnet. */
    if (hittaAmne("Matematik")) v.value = "Matematik";
  }

  var amneChart = null;

  function ritaAmne() {
    var namn = el("amne-valjare").value;
    var a = hittaAmne(namn);
    if (!a) return;
    var ar = DATA.ar;

    var poang = ar.map(function (y) { return cell(a, y, "betygspoang"); });
    var flickor = ar.map(function (y) { return cell(a, y, "betygspoangFlickor"); });
    var pojkar = ar.map(function (y) { return cell(a, y, "betygspoangPojkar"); });

    var ctx = el("diagram-amne");
    ctx.parentElement.style.height = "380px";

    var opt = basOptions("Betygspoäng (max " + DATA.maxPoang + ")", function (it) {
      return it.dataset.label + ": " + talSv(it.parsed.y, 1);
    });
    opt.plugins.legend.display = true;
    opt.scales.y.beginAtZero = false;
    opt.scales.x.ticks.autoSkip = true;

    function linje(etikett, varden, farg, streck, bredd) {
      return {
        label: etikett, data: varden,
        borderColor: farg, backgroundColor: farg,
        borderWidth: bredd || 2, borderDash: streck || [],
        pointRadius: 0, pointHoverRadius: 5,
        pointBorderColor: FARG.surface, pointBorderWidth: 2,
        spanGaps: false, tension: 0.1
      };
    }

    if (amneChart) amneChart.destroy();
    amneChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: ar.map(String),
        datasets: [
          linje("Alla elever", poang, K.PALETT[0], [], 3),
          linje("Flickor", flickor, K.PALETT[1], [7, 4]),
          linje("Pojkar", pojkar, K.PALETT[2], [2, 3])
        ]
      },
      options: opt
    });

    el("kalla-amne").textContent =
      "Källa: Skolverket. Ämne: " + namn + ", läsåren " +
      lasar(ar[0]) + "–" + lasar(ar[ar.length - 1]) + ".";

    var f = a.forsta, s = a.sista;
    var riktning = a.forandring === null ? "" :
      (a.forandring > 0 ? "stigit" : (a.forandring < 0 ? "sjunkit" : "legat stilla"));
    el("slutsats-amne").innerHTML = a.forandring === null
      ? "<p>" + esc(namn) + " redovisas bara " + esc(a.arMedPoang) + " av " + ar.length +
        " läsår, så någon utveckling går inte att läsa av.</p>"
      : "<p>I " + esc(namn.toLowerCase()) + " har betygspoängen <strong>" + riktning +
        "</strong> från " + talSv(f, 1) + " (" + esc(lasar(a.forstaAr)) + ") till " +
        talSv(s, 1) + " (" + esc(lasar(a.sistaAr)) + ") &ndash; en förändring på <strong>" +
        (a.forandring > 0 ? "+" : "") + talSv(a.forandring, 1) + "</strong> poäng.</p>";

    /* Dubbelprickade år ska synas, inte tigas ihjäl. */
    var dolda = ar.filter(function (y) { return cell(a, y, "betygspoang") === null; });
    K.sattDataNot("not-amne", dolda.length
      ? "Läsåren " + esc(dolda.map(lasar).join(", ")) + " redovisas inte för " +
        esc(namn.toLowerCase()) + ": uppgiften bygger på färre än tio elever."
      : "");

    el("tabell-amne").innerHTML =
      "<thead><tr><th scope=\"col\">Läsår</th><th scope=\"col\">Alla</th>" +
      "<th scope=\"col\">Flickor</th><th scope=\"col\">Pojkar</th>" +
      "<th scope=\"col\">Andel med A&ndash;E</th></tr></thead><tbody>" +
      ar.map(function (y, i) {
        var ae = cell(a, y, "andelAE");
        function t(v, dec) { return v === null ? ".." : talSv(v, dec); }
        return "<tr><th scope=\"row\">" + esc(lasar(y)) + "</th><td>" + t(poang[i], 1) +
          "</td><td>" + t(flickor[i], 1) + "</td><td>" + t(pojkar[i], 1) +
          "</td><td>" + (ae === null ? ".." : talSv(ae, 1) + "&nbsp;%") + "</td></tr>";
      }).join("") + "</tbody>";
  }

  /* ---------- 2b. Alla ämnen i samma diagram ----------
     Bara serien för alla elever — flickor och pojkar hör hemma i
     diagrammet ovanför, där ett ämne i taget får plats. Med ett tjugotal
     linjer bär färgen inte informationen ensam: varje ämne får också sin
     egen streckning och punktform ur den delade serieStil(). */

  var allaChart = null;

  function ritaAlla() {
    var ar = DATA.ar;
    var amnen = redovisade();

    /* Färgen följer ämnet, inte dess placering: stilen väljs på ämnets
       plats i den alfabetiska listan, inte på sorteringen nedan. Så
       byter ingen linje färg när ett ämne kläms bort eller datat växer. */
    var stilIndex = {};
    amnen.forEach(function (a, i) { stilIndex[a.namn] = i; });

    var serier = amnen.map(function (a) {
      return {
        namn: a.namn,
        varden: ar.map(function (y) { return cell(a, y, "betygspoang"); }),
        sist: a.sista === null ? -1 : a.sista
      };
    });
    /* Sortera efter senaste värdet, så att teckenförklaringen står i
       samma ordning som linjerna ligger i diagrammets högerkant. */
    serier.sort(function (x, y) { return y.sist - x.sist; });

    var ctx = el("diagram-alla");
    ctx.parentElement.style.height = "560px";

    var opt = basOptions("Betygspoäng (max " + DATA.maxPoang + ")", function (it) {
      return it.dataset.label + ": " + talSv(it.parsed.y, 1);
    });
    /* "nearest" i stället för "index": med tjugo linjer skulle en
       samlad ruta bli en vägg av text. */
    opt.interaction = { mode: "nearest", intersect: false };
    opt.plugins.tooltip.callbacks.title = function (it) {
      return "Läsåret " + lasar(Number(it[0].label));
    };
    opt.plugins.legend = {
      display: true,
      position: "bottom",
      labels: { boxWidth: 40, padding: 10 }
    };
    opt.scales.y.beginAtZero = false;
    opt.scales.x.ticks.autoSkip = true;

    if (allaChart) allaChart.destroy();
    allaChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: ar.map(String),
        datasets: serier.map(function (s) {
          var stil = K.serieStil(stilIndex[s.namn]);
          return {
            label: s.namn,
            data: s.varden,
            borderColor: stil.farg,
            backgroundColor: stil.farg,
            borderDash: stil.streck,
            pointStyle: stil.punkt,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 7,
            pointBorderColor: FARG.surface,
            pointBorderWidth: 1,
            spanGaps: false,
            tension: 0.1
          };
        })
      },
      options: opt
    });
    K.aktiveraToning(allaChart);

    el("kalla-alla").textContent =
      "Källa: Skolverket, " + amnen.length + " ämnen, läsåren " +
      lasar(ar[0]) + "–" + lasar(ar[ar.length - 1]) + ". Alla elever.";

    tabellAlla(serier);
  }

  /* Visa eller dölj samtliga linjer på en gång. Chart.js håller reda på
     vilka som är bortklickade; här sätts allihop i ett svep. */
  function sattAllaSynliga(synliga) {
    if (!allaChart) return;
    allaChart.data.datasets.forEach(function (_, i) {
      allaChart.setDatasetVisibility(i, synliga);
    });
    allaChart.update();
  }

  function tabellAlla(serier) {
    var ar = DATA.ar;
    var rubriker = serier.map(function (s) {
      return "<th scope=\"col\">" + esc(s.namn) + "</th>";
    }).join("");
    var rader = ar.map(function (y, i) {
      return "<tr><th scope=\"row\">" + esc(lasar(y)) + "</th>" +
        serier.map(function (s) {
          var v = s.varden[i];
          return "<td>" + (v === null ? ".." : talSv(v, 1)) + "</td>";
        }).join("") + "</tr>";
    }).join("");
    el("tabell-alla").innerHTML =
      "<thead><tr><th scope=\"col\">Läsår</th>" + rubriker + "</tr></thead>" +
      "<tbody>" + rader + "</tbody>";
  }

  /* ---------- 3. Årskullens två mått, över tid ----------
     Betygspoäng (0–20) och andel med godkänt (0–100 %) mäter olika saker
     på olika skalor. De får därför var sitt diagram — att lägga dem i
     samma bild skulle kräva två y-axlar och göra kurvorna jämförbara på
     ett sätt de inte är. Båda räknas över samma fasta ämnesurval. */

  function ritaOverTid(id, etikett, varden, ytitel, dec, suffix) {
    var ctx = el("diagram-" + id);
    ctx.parentElement.style.height = "360px";

    var opt = basOptions(ytitel, function (it) {
      return talSv(it.parsed.y, dec) + suffix;
    });
    opt.scales.y.beginAtZero = false;
    opt.scales.x.ticks.autoSkip = true;

    new Chart(ctx, {
      type: "line",
      data: {
        labels: DATA.ar.map(String),
        datasets: [{
          label: etikett,
          data: varden,
          borderColor: K.PALETT[0], backgroundColor: K.PALETT[0],
          borderWidth: 3, pointRadius: 3, pointHoverRadius: 6,
          pointBorderColor: FARG.surface, pointBorderWidth: 2, tension: 0.1
        }]
      },
      options: opt
    });

    el("kalla-" + id).textContent =
      "Källa: Skolverket. Medelvärde över de " + DATA.karnamnen.length +
      " ämnen som redovisas samtliga läsår.";
  }

  function ritaPoang() {
    var f = DATA.sammanfattning[0], s = DATA.sammanfattning[DATA.sammanfattning.length - 1];

    ritaOverTid("poang", "Betygspoäng",
      DATA.sammanfattning.map(function (r) { return r.betygspoang; }),
      "Genomsnittlig betygspoäng (max " + DATA.maxPoang + ")", 2, "");

    var diff = s.betygspoang - f.betygspoang;
    var riktning = diff > 0 ? "stigit" : (diff < 0 ? "sjunkit" : "legat stilla");
    el("slutsats-poang").innerHTML =
      "<p>Betygspoängen har <strong>" + riktning + "</strong> från " +
      talSv(f.betygspoang, 2) + " (" + esc(lasar(f.ar)) + ") till <strong>" +
      talSv(s.betygspoang, 2) + "</strong> (" + esc(lasar(s.ar)) + ") av " +
      esc(DATA.maxPoang) + " &ndash; en förändring på " + (diff > 0 ? "+" : "") +
      talSv(diff, 2) + " poäng. Ett snitt på 15 motsvarar ungefär betyget C.</p>";

    el("tabell-poang").innerHTML =
      "<thead><tr><th scope=\"col\">Läsår</th><th scope=\"col\">Betygspoäng</th>" +
      "<th scope=\"col\">Elever</th></tr></thead><tbody>" +
      DATA.sammanfattning.map(function (r) {
        return "<tr><th scope=\"row\">" + esc(lasar(r.ar)) + "</th><td>" +
          talSv(r.betygspoang, 2) + "</td><td>" +
          (r.elever === null ? ".." : talSv(r.elever)) + "</td></tr>";
      }).join("") + "</tbody>";
  }

  function ritaGodkant() {
    var f = DATA.sammanfattning[0], s = DATA.sammanfattning[DATA.sammanfattning.length - 1];

    ritaOverTid("godkant", "Andel med A–E",
      DATA.sammanfattning.map(function (r) { return r.andelAE; }),
      "Andel med betyget A–E (%)", 1, " %");

    el("slutsats-godkant").innerHTML =
      "<p>Andelen godkända betyg har gått från <strong>" + talSv(f.andelAE, 1) +
      "&nbsp;%</strong> (" + esc(lasar(f.ar)) + ") till <strong>" + talSv(s.andelAE, 1) +
      "&nbsp;%</strong> (" + esc(lasar(s.ar)) + "). Måttet räknas över samma fasta " +
      "ämnesurval varje år, så förändringen beror på betygen och inte på " +
      "vilka ämnen som råkat redovisas.</p>";

    el("tabell-godkant").innerHTML =
      "<thead><tr><th scope=\"col\">Läsår</th>" +
      "<th scope=\"col\">Andel med A&ndash;E</th></tr></thead><tbody>" +
      DATA.sammanfattning.map(function (r) {
        return "<tr><th scope=\"row\">" + esc(lasar(r.ar)) + "</th><td>" +
          talSv(r.andelAE, 1) + "&nbsp;%</td></tr>";
      }).join("") + "</tbody>";
  }

  /* ---------- 4. Skillnaden mellan flickor och pojkar ---------- */

  function ritaKon() {
    var ar = sistaAr();
    var rader = redovisade()
      .filter(function (a) { return cell(a, ar, "konsskillnad") !== null; })
      .map(function (a) { return { namn: a.namn, v: cell(a, ar, "konsskillnad") }; })
      .sort(function (x, y) { return y.v - x.v; });

    if (!rader.length) return false;

    var ctx = el("diagram-kon");
    ctx.parentElement.style.height = (90 + rader.length * 26) + "px";

    var opt = basOptions("Flickornas betygspoäng minus pojkarnas", function (it) {
      var v = it.parsed.x;
      return v > 0 ? "+" + talSv(v, 1) + " till flickornas fördel"
                   : talSv(v, 1) + " till pojkarnas fördel";
    }, true);
    opt.scales.x.grid.color = function (c) {
      return c.tick.value === 0 ? FARG.baseline : FARG.grid;
    };

    new Chart(ctx, {
      type: "bar",
      data: {
        labels: rader.map(function (r) { return r.namn; }),
        datasets: [{
          label: "Skillnad",
          data: rader.map(function (r) { return r.v; }),
          /* Tvåpolig skala kring noll: åt vilket håll skillnaden lutar. */
          backgroundColor: rader.map(function (r) {
            return r.v >= 0 ? K.PALETT[1] : K.PALETT[0];
          }),
          borderWidth: 0, borderRadius: 4, borderSkipped: false
        }]
      },
      options: opt
    });

    el("kalla-kon").textContent =
      "Källa: Skolverket, läsåret " + lasar(ar) +
      ". Stapel åt höger = flickorna har högre betygspoäng.";

    var flick = rader.filter(function (r) { return r.v > 0; }).length;
    el("slutsats-kon").innerHTML =
      "<p>Av " + rader.length + " redovisade ämnen läsåret " + esc(lasar(ar)) +
      " hade flickorna högre betygspoäng i <strong>" + flick + "</strong>. " +
      "Störst är skillnaden i " + esc(rader[0].namn.toLowerCase()) + " (" +
      (rader[0].v > 0 ? "+" : "") + talSv(rader[0].v, 1) + " poäng).</p>";

    el("tabell-kon").innerHTML =
      "<thead><tr><th scope=\"col\">Ämne</th><th scope=\"col\">Flickor</th>" +
      "<th scope=\"col\">Pojkar</th><th scope=\"col\">Skillnad</th></tr></thead><tbody>" +
      rader.map(function (r) {
        var a = hittaAmne(r.namn);
        return "<tr><th scope=\"row\">" + esc(r.namn) + "</th><td>" +
          talSv(cell(a, ar, "betygspoangFlickor"), 1) + "</td><td>" +
          talSv(cell(a, ar, "betygspoangPojkar"), 1) + "</td><td>" +
          (r.v > 0 ? "+" : "") + talSv(r.v, 1) + "</td></tr>";
      }).join("") + "</tbody>";
    return true;
  }

  /* ---------- Kort sagt, noter och metadata ---------- */

  function kortSagt() {
    var f = DATA.sammanfattning[0], s = DATA.sammanfattning[DATA.sammanfattning.length - 1];
    /* Bara ämnen med hela tidsserien — annars jämförs olika långa serier. */
    var med = DATA.amnen.filter(function (a) {
      return DATA.karnamnen.indexOf(a.namn) !== -1 && a.forandring !== null;
    });
    var upp = med.filter(function (a) { return a.forandring > 0; }).length;

    K.visaKortSagt([
      "Läsåret " + esc(lasar(s.ar)) + " var den genomsnittliga betygspoängen i " +
        "årskurs 9 <strong>" + talSv(s.betygspoang, 2) + "</strong> av " +
        esc(DATA.maxPoang) + ", över " + DATA.karnamnen.length + " ämnen.",
      "Andelen godkända betyg (A&ndash;E) var <strong>" + talSv(s.andelAE, 1) +
        "&nbsp;%</strong>, mot " + talSv(f.andelAE, 1) + "&nbsp;% läsåret " +
        esc(lasar(f.ar)) + ".",
      "Av " + med.length + " ämnen med hela tidsserien har betygspoängen stigit i <strong>" +
        upp + "</strong> sedan " + esc(lasar(f.ar)) + ".",
      "Siffrorna avser <strong>alla skolor i Kungsbacka kommun</strong>, " +
        "kommunala som fristående, sammanräknat."
    ]);
  }

  function noter() {
    var utan = DATA.amnen.filter(function (a) { return !a.redovisas; });
    if (utan.length) {
      K.sattDataNot("not-dolda",
        "Följande ämnen finns i statistiken men redovisas aldrig för Kungsbacka, " +
        "eftersom de bygger på färre än tio elever: <strong>" +
        esc(utan.map(function (a) { return a.namn.toLowerCase(); }).join(", ")) +
        "</strong>. De ingår inte i något diagram.");
    }
  }

  function start(data) {
    DATA = data;
    var sista = DATA.sammanfattning[DATA.sammanfattning.length - 1];

    K.visaMeta({
      kalla: "Skolverket, utbildningsstatistik",
      period: lasar(DATA.ar[0]) + "–" + lasar(sista.ar),
      senaste: lasar(sista.ar),
      hamtad: (DATA.kallor[DATA.kallor.length - 1] || {}).hamtad
    });

    kortSagt();
    noter();
    ritaRangordning();
    fyllValjare();
    K.kopplaValjare(el("amne-valjare"), "amne", ritaAmne);
    ritaAmne();
    ritaAlla();
    el("knapp-visa-alla").addEventListener("click", function () {
      sattAllaSynliga(true);
    });
    el("knapp-dolj-alla").addEventListener("click", function () {
      sattAllaSynliga(false);
    });
    ritaPoang();
    ritaGodkant();
    var harKon = ritaKon();

    var sektioner = ["rang", "amne", "alla", "poang", "godkant", "kallor", "om"];
    if (harKon) sektioner.push("kon");
    sektioner.forEach(function (id) {
      var s = el("sektion-" + id);
      if (s) s.hidden = false;
    });

    var lista = el("lista-kallor");
    if (lista) {
      lista.innerHTML = DATA.kallor.slice().reverse().map(function (k) {
        var url = sakerUrl(k.kallaUrl);
        var text = esc(k.rapportTitel) + ", läsåret " + esc(k.lasar);
        return "<li>" +
          (url ? '<a href="' + url + '">' + text + "</a>" : text) +
          " &ndash; " + esc(k.kalla) + ", hämtad " + esc(k.hamtad) + ".</li>";
      }).join("");
    }
    var upp = el("om-uppdaterad");
    if (upp) upp.textContent = "Datat på den här sidan hämtades " +
      (DATA.kallor[DATA.kallor.length - 1] || {}).hamtad + ".";
  }

  K.starta(DATAFIL, { init: start });
})();
