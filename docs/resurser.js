/* Grundskolans resurser — vad kommunen valde, inte vad skolan kostade.
   Läser docs/data-resurser.json, byggd av scripts/build_resurser.py ur
   Kolada (avvikelse, referenskostnad, budgetandel) och SCB (skolåldern).

   Sidans genomgående egenskap: ingenting prisomräknas. Varje mått är en
   jämförelse inom samma år, så inflationen finns i båda leden och tar ut
   sig själv. Det gäller alla fem diagrammen och ska inte brytas. */
(function () {
  "use strict";

  var K = window.KIS;
  var FARG = K.FARG;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;
  var sakerUrl = K.sakerUrl;

  var DATAFIL = "data-resurser.json";
  var KUNGSBACKA = "1384";
  var RIKET = "0000";

  /* Fast färg per roll: blå är Kungsbacka, orange riket — samma
     färgspråk som kostnadssidan, så att en läsare som rör sig mellan dem
     inte behöver lära om. */
  var FARG_OMRADE = {};
  FARG_OMRADE[KUNGSBACKA] = FARG.bla;
  FARG_OMRADE[RIKET] = FARG.orange;

  var data = null;

  /* ---------- Uppslag ---------- */

  function serien(nyckel) {
    for (var i = 0; i < data.serier.length; i++) {
      if (data.serier[i].nyckel === nyckel) return data.serier[i];
    }
    return null;
  }

  function omrade(nyckel, kod) {
    var s = serien(nyckel);
    return s && s.omraden[kod] ? s.omraden[kod] : null;
  }

  function omradesnamn(kod) {
    for (var i = 0; i < data.omraden.length; i++) {
      if (data.omraden[i].kod === kod) return data.omraden[i].namn;
    }
    return kod;
  }

  function aren(o) {
    return o ? Object.keys(o.varden).map(Number).sort(function (a, b) {
      return a - b;
    }) : [];
  }

  function cell(o, ar) {
    if (!o) return null;
    var v = o.varden[String(ar)];
    return v === undefined ? null : v;
  }

  function visa(v, dec) {
    return (v === null || v === undefined) ? "&ndash;" : talSv(v, dec);
  }

  function medTecken(v, dec) {
    if (v === null || v === undefined) return "&ndash;";
    return (v > 0 ? "+" : "") + talSv(v, dec);
  }

  /* Reformåren som markeringar i de diagram som avvikelsen ritas i. */
  function reformer() {
    return (data.reformer || []).map(function (r) {
      return { vid: r.ar, text: r.text };
    });
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
          ticks: { callback: function (v) { return talSv(v); } }
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

  /* Staplar kring en nollinje. Medvetet **en** färg: en tvåpolig
     färgskala skulle säga att den ena sidan av noll är bättre än den
     andra, och det är ett omdöme sidan inte fäller. Nollinjen markeras i
     stället tydligt. */
  function stapelSerie(etikett, varden) {
    return {
      label: etikett,
      data: varden,
      backgroundColor: FARG.bla,
      borderWidth: 0,
      borderRadius: 4,
      borderSkipped: false
    };
  }

  function nollinje(opt) {
    opt.scales.y.grid.color = function (c) {
      return c.tick.value === 0 ? FARG.baseline : FARG.grid;
    };
    opt.scales.y.grid.lineWidth = function (c) {
      return c.tick.value === 0 ? 2 : 1;
    };
    opt.plugins.legend.display = false;
    return opt;
  }

  /* ---------- 1. Avvikelsen i procent ---------- */

  function ritaAvvikelse() {
    var o = omrade("avvikelseProcent", KUNGSBACKA);
    var ar = aren(o);
    var varden = ar.map(function (a) { return cell(o, a); });

    var opt = nollinje(basOptions("Avvikelse från referenskostnaden (%)",
      function (it) {
        var v = it.parsed.y;
        return (v > 0 ? "+" : "") + talSv(v, 1) + " % mot referenskostnaden";
      }));
    opt.scales.y.ticks.callback = function (v) { return talSv(v, 0) + " %"; };

    K.rita("diagram-avvikelse", {
      type: "bar",
      data: { labels: ar.map(String), datasets: [stapelSerie("Avvikelse", varden)] },
      options: opt,
      plugins: [K.regimmarkering(reformer())]
    }, 380);

    el("kalla-avvikelse").textContent =
      "Källa: " + data.kalla + ". Noll = kommunen lägger vad strukturen " +
      "motiverar, vilket också är rikets värde. Streckade linjer: år då " +
      "kostnadsutjämningen ändrades.";

    K.sattDataNot("not-avvikelse",
      "Ett negativt tal betyder att kommunen lägger <em>mindre</em> än " +
      "referenskostnaden, inte att den lägger för lite. Referenskostnaden " +
      "är vad en kommun med den här strukturen typiskt lägger &ndash; ingen norm.");

    /* Räknat ur serien, aldrig påstått: hur många år låg över respektive
       under noll. En text som säger "varje år" måste hålla för varje år. */
    var under = varden.filter(function (v) { return v < 0; }).length;
    var over = varden.filter(function (v) { return v > 0; }).length;
    el("slutsats-avvikelse").innerHTML =
      "<p>Av " + varden.length + " redovisade år låg Kungsbacka under sin " +
      "referenskostnad <strong>" + under + "</strong> år och över den " +
      over + " år. Avvikelsen har rört sig mellan " + talSv(o.lagsta, 1) +
      "&nbsp;% (" + esc(o.lagstaAr) + ") och " + medTecken(o.hogsta, 1) +
      "&nbsp;% (" + esc(o.hogstaAr) + "). Senast, " + esc(o.sistaAr) +
      ", låg den på <strong>" + talSv(o.sista, 1) + "&nbsp;%</strong>.</p>";

    var rader = ar.map(function (a) {
      return "<tr><th scope=\"row\">" + esc(a) + "</th><td>" +
        medTecken(cell(o, a), 1) + "&nbsp;%</td></tr>";
    }).join("");
    el("tabell-avvikelse").innerHTML =
      "<thead><tr><th scope=\"col\">År</th>" +
      "<th scope=\"col\">Avvikelse från referenskostnaden</th></tr></thead>" +
      "<tbody>" + rader + "</tbody>";
  }

  /* ---------- 2. Avvikelsen i kronor ---------- */

  function ritaKronor() {
    var o = omrade("avvikelseMkr", KUNGSBACKA);
    if (!o) { el("sektion-kronor").hidden = true; return; }
    var ar = aren(o);
    var varden = ar.map(function (a) { return cell(o, a); });

    var opt = nollinje(basOptions("Avvikelse (miljoner kronor)",
      function (it) {
        var v = it.parsed.y;
        return (v > 0 ? "+" : "") + talSv(v, 1) + " miljoner kronor";
      }));

    K.rita("diagram-kronor", {
      type: "bar",
      data: { labels: ar.map(String), datasets: [stapelSerie("Avvikelse", varden)] },
      options: opt,
      plugins: [K.regimmarkering(reformer())]
    }, 340);

    el("kalla-kronor").textContent =
      "Källa: " + data.kalla + ". Samma avvikelse som ovan, i pengar.";

    el("slutsats-kronor").innerHTML =
      "<p>År " + esc(o.sistaAr) + " motsvarade avvikelsen <strong>" +
      talSv(Math.abs(o.sista), 1) + " miljoner kronor</strong> " +
      (o.sista < 0 ? "under" : "över") + " referenskostnaden. Störst var " +
      "den " + esc(o.lagstaAr) + " (" + talSv(Math.abs(o.lagsta), 1) +
      " miljoner).</p>";

    var rader = ar.map(function (a) {
      return "<tr><th scope=\"row\">" + esc(a) + "</th><td>" +
        medTecken(cell(o, a), 1) + "</td></tr>";
    }).join("");
    el("tabell-kronor").innerHTML =
      "<thead><tr><th scope=\"col\">År</th>" +
      "<th scope=\"col\">Avvikelse (mkr)</th></tr></thead><tbody>" +
      rader + "</tbody>";
  }

  /* ---------- 3. Faktisk kostnad mot referenskostnad ---------- */

  function ritaReferens() {
    var faktisk = omrade("faktisk", KUNGSBACKA);
    var referens = omrade("referens", KUNGSBACKA);
    if (!faktisk || !referens) { el("sektion-referens").hidden = true; return; }
    /* Bara de år båda finns: en ensam faktisk-linje utan sin
       referenskostnad visar inte det sektionen handlar om. */
    var ar = aren(referens).filter(function (a) {
      return cell(faktisk, a) !== null;
    });

    var opt = basOptions("Kronor per elev", function (it) {
      return it.dataset.label + ": " + talSv(it.parsed.y) + " kr";
    });
    opt.scales.y.beginAtZero = true;

    var chart = K.rita("diagram-referens", {
      type: "line",
      data: {
        labels: ar.map(String),
        datasets: [
          linjeSerie("Kommunens kostnad", FARG_OMRADE[KUNGSBACKA],
            ar.map(function (a) { return cell(faktisk, a); })),
          linjeSerie("Referenskostnad", FARG.gra,
            ar.map(function (a) { return cell(referens, a); }), [7, 4])
        ]
      },
      options: opt
    }, 380);
    K.aktiveraToning(chart, true);

    el("kalla-referens").textContent =
      "Källa: " + data.kalla + ". Grundskolan F–9, elever som bor i " +
      "kommunen. Linjerna jämförs år för år – aldrig mellan år, och " +
      "därför behövs ingen prisomräkning.";

    var sista = ar[ar.length - 1];
    var diff = cell(faktisk, sista) - cell(referens, sista);
    el("slutsats-referens").innerHTML =
      "<p>År " + esc(sista) + " lade kommunen <strong>" +
      talSv(cell(faktisk, sista)) + " kr</strong> per elev, mot en " +
      "referenskostnad på " + talSv(cell(referens, sista)) + " kr &ndash; " +
      "en skillnad på " + talSv(Math.abs(diff)) + " kr per elev. " +
      "Referenskostnaden finns från " + esc(ar[0]) + ".</p>";

    var rader = ar.map(function (a) {
      var d = cell(faktisk, a) - cell(referens, a);
      return "<tr><th scope=\"row\">" + esc(a) + "</th><td>" +
        visa(cell(faktisk, a)) + "</td><td>" + visa(cell(referens, a)) +
        "</td><td>" + medTecken(d, 0) + "</td></tr>";
    }).join("");
    el("tabell-referens").innerHTML =
      "<thead><tr><th scope=\"col\">År</th>" +
      "<th scope=\"col\">Kommunens kostnad (kr/elev)</th>" +
      "<th scope=\"col\">Referenskostnad (kr/elev)</th>" +
      "<th scope=\"col\">Skillnad</th></tr></thead><tbody>" + rader + "</tbody>";
  }

  /* ---------- 4. Skolans andel av driftkostnaden ---------- */

  function ritaAndel() {
    var kb = omrade("andelDrift", KUNGSBACKA);
    var ri = omrade("andelDrift", RIKET);
    if (!kb) { el("sektion-andel").hidden = true; return; }
    var ar = aren(kb);

    var opt = basOptions("Andel av kommunens driftkostnad (%)",
      function (it) {
        return it.dataset.label + ": " + talSv(it.parsed.y, 1) + " %";
      });
    opt.scales.y.beginAtZero = false;
    opt.scales.y.ticks.callback = function (v) { return talSv(v, 0) + " %"; };

    var dataset = [linjeSerie(omradesnamn(KUNGSBACKA), FARG_OMRADE[KUNGSBACKA],
      ar.map(function (a) { return cell(kb, a); }))];
    if (ri) {
      dataset.push(linjeSerie(omradesnamn(RIKET), FARG_OMRADE[RIKET],
        ar.map(function (a) { return cell(ri, a); }), [7, 4]));
    }

    var chart = K.rita("diagram-andel", {
      type: "line",
      data: { labels: ar.map(String), datasets: dataset },
      options: opt
    }, 360);
    K.aktiveraToning(chart, true);

    el("kalla-andel").textContent =
      "Källa: " + data.kalla + ". Grundskolans kostnad delad med kommunens " +
      "hela driftkostnad samma år. Y-axeln börjar inte vid noll.";

    var txt = "<p>År " + esc(kb.sistaAr) + " gick <strong>" +
      talSv(kb.sista, 1) + "&nbsp;%</strong> av Kungsbackas driftkostnad " +
      "till grundskolan";
    if (ri && cell(ri, kb.sistaAr) !== null) {
      txt += ", mot " + talSv(cell(ri, kb.sistaAr), 1) + "&nbsp;% i riket";
    }
    txt += ". Andelen var som högst " + esc(kb.hogstaAr) + " (" +
      talSv(kb.hogsta, 1) + "&nbsp;%) och som lägst " + esc(kb.lagstaAr) +
      " (" + talSv(kb.lagsta, 1) + "&nbsp;%).</p>";
    el("slutsats-andel").innerHTML = txt;

    var rader = ar.map(function (a) {
      return "<tr><th scope=\"row\">" + esc(a) + "</th><td>" +
        visa(cell(kb, a), 1) + "&nbsp;%</td><td>" +
        (ri ? visa(cell(ri, a), 1) + "&nbsp;%" : "&ndash;") + "</td></tr>";
    }).join("");
    el("tabell-andel").innerHTML =
      "<thead><tr><th scope=\"col\">År</th>" +
      "<th scope=\"col\">Kungsbacka</th><th scope=\"col\">Riket</th>" +
      "</tr></thead><tbody>" + rader + "</tbody>";
  }

  /* ---------- 5. Val eller demografi ---------- */

  function ritaDemografi() {
    var j = data.jamforelse;
    if (!j) { el("sektion-demografi").hidden = true; return; }
    var ar = j.ar;

    var opt = basOptions("Index, " + j.basAr + " = 100", function (it) {
      return it.dataset.label + ": " + talSv(it.parsed.y, 1);
    });
    opt.scales.y.beginAtZero = false;
    opt.scales.y.ticks.callback = function (v) { return talSv(v, 0); };

    var chart = K.rita("diagram-demografi", {
      type: "line",
      data: {
        labels: ar.map(String),
        datasets: [
          linjeSerie("Skolans andel av budgeten", FARG_OMRADE[KUNGSBACKA],
            ar.map(function (a) { return j.budgetandel[String(a)]; })),
          linjeSerie("Skolålderns andel av befolkningen", FARG.orange,
            ar.map(function (a) { return j.barnandel[String(a)]; }), [7, 4])
        ]
      },
      options: opt
    }, 360);
    K.aktiveraToning(chart, true);

    el("kalla-demografi").textContent =
      "Källor: " + data.kalla + " (budgetandel) och " +
      data.befolkningKalla + " (6–15-åringar). Båda satta till 100 år " +
      j.basAr + ". Y-axeln börjar inte vid noll.";

    var sista = ar[ar.length - 1];
    var b = j.budgetandel[String(sista)], n = j.barnandel[String(sista)];

    /* Två ändpunkter som råkar mötas säger ingenting om vägen dit. Det
       största avståndet under perioden räknas därför fram och skrivs ut
       bredvid – annars kan en text kalla två linjer "samstämmiga" när de
       gått isär i tio år och råkat mötas igen på slutet. */
    var storst = { gap: 0, ar: null };
    ar.forEach(function (a) {
      var bu = j.budgetandel[String(a)], ba = j.barnandel[String(a)];
      if (bu === undefined || ba === undefined) return;
      if (Math.abs(bu - ba) > Math.abs(storst.gap)) {
        storst = { gap: bu - ba, ar: a };
      }
    });

    el("slutsats-demografi").innerHTML =
      "<p>Sedan " + esc(j.basAr) + " har skolans andel av budgeten rört sig " +
      "till index <strong>" + talSv(b, 1) + "</strong> och skolålderns andel " +
      "av befolkningen till <strong>" + talSv(n, 1) + "</strong> (" +
      esc(sista) + ") &ndash; " + talSv(Math.abs(b - n), 1) +
      " indexenheter isär. Vägen dit var inte rak: som mest skilde de " +
      "<strong>" + talSv(Math.abs(storst.gap), 1) + "</strong> indexenheter " +
      "(" + esc(storst.ar) + "), då budgetandelen låg " +
      (storst.gap < 0 ? "under" : "över") + " barnandelen.</p>";

    var rader = ar.map(function (a) {
      return "<tr><th scope=\"row\">" + esc(a) + "</th><td>" +
        visa(j.budgetandel[String(a)], 1) + "</td><td>" +
        visa(j.barnandel[String(a)], 1) + "</td><td>" +
        visa(data.befolkning[String(a)] ? data.befolkning[String(a)].antal : null) +
        "</td></tr>";
    }).join("");
    el("tabell-demografi").innerHTML =
      "<thead><tr><th scope=\"col\">År</th>" +
      "<th scope=\"col\">Skolans andel av budgeten (index)</th>" +
      "<th scope=\"col\">Skolålderns andel av befolkningen (index)</th>" +
      "<th scope=\"col\">Antal 6–15-åringar</th></tr></thead><tbody>" +
      rader + "</tbody>";
  }

  /* ---------- Kort sagt, källor och metadata ---------- */

  function kortSagt() {
    var avv = omrade("avvikelseProcent", KUNGSBACKA);
    var mkr = omrade("avvikelseMkr", KUNGSBACKA);
    var kb = omrade("andelDrift", KUNGSBACKA);
    var ri = omrade("andelDrift", RIKET);
    var punkter = [];

    punkter.push("År " + esc(avv.sistaAr) + " låg Kungsbacka <strong>" +
      talSv(Math.abs(avv.sista), 1) + "&nbsp;%</strong> " +
      (avv.sista < 0 ? "under" : "över") + " sin referenskostnad för " +
      "grundskolan – det utjämningssystemet räknar fram att en kommun med " +
      "den här strukturen förväntas lägga.");

    if (mkr) {
      punkter.push("I pengar motsvarar det <strong>" +
        talSv(Math.abs(mkr.sista), 1) + " miljoner kronor</strong>.");
    }

    punkter.push("Avvikelsen har gått från " + medTecken(avv.forsta, 1) +
      "&nbsp;% (" + esc(avv.forstaAr) + ") till " + medTecken(avv.sista, 1) +
      "&nbsp;% (" + esc(avv.sistaAr) + "). Kostnadsutjämningen byggdes om " +
      "2014 och 2020, vilket flyttar avvikelsen utan att kommunen gjort något.");

    if (kb) {
      var rad = "Grundskolan tog <strong>" + talSv(kb.sista, 1) +
        "&nbsp;%</strong> av kommunens driftkostnad " + esc(kb.sistaAr);
      if (ri && cell(ri, kb.sistaAr) !== null) {
        rad += ", mot " + talSv(cell(ri, kb.sistaAr), 1) + "&nbsp;% i riket";
      }
      punkter.push(rad + ".");
    }

    var j = data.jamforelse;
    if (j) {
      var sista = j.ar[j.ar.length - 1];
      punkter.push("Skolans andel av budgeten och skolålderns andel av " +
        "befolkningen står " + esc(sista) + " på index " +
        talSv(j.budgetandel[String(sista)], 1) + " respektive " +
        talSv(j.barnandel[String(sista)], 1) + " (" + esc(j.basAr) +
        " = 100) – men de har gått isär och mötts igen under vägen, " +
        "vilket syns i diagrammet.");
    }

    punkter.push("Inga belopp på sidan är inflationsjusterade – varje mått " +
      "jämför inom samma år, så frågan uppstår aldrig.");

    K.visaKortSagt(punkter);
  }

  function visaKallor() {
    var lista = el("lista-kallor");
    if (!lista) return;
    var rader = [];
    var kolada = sakerUrl(data.kallaUrl);
    rader.push("<li>" + (kolada
      ? '<a href="' + kolada + '">' + esc(data.kalla) + "</a>"
      : esc(data.kalla)) + " &ndash; hämtat ur Koladas öppna API " +
      esc(data.hamtad) + ".</li>");
    var scb = sakerUrl(data.befolkningKallaUrl);
    rader.push("<li>" + (scb
      ? '<a href="' + scb + '">' + esc(data.befolkningKalla) + "</a>"
      : esc(data.befolkningKalla)) + " &ndash; " + esc(data.befolkningMatt) +
      ", hämtat " + esc(data.befolkningHamtad) + ".</li>");
    (data.reformer || []).forEach(function (r) {
      var u = sakerUrl(r.kallaUrl);
      rader.push("<li>" + (u
        ? '<a href="' + u + '">' + esc(r.kalla) + "</a>"
        : esc(r.kalla)) + " &ndash; markeras i diagrammen.</li>");
    });
    lista.innerHTML = rader.join("");
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

    /* Sektionerna öppnas först, sedan ritas de. Ett diagram som saknar
       underlag stänger sin egen sektion igen – ordningen spelar roll, en
       öppning efteråt skulle visa tomma rutor. */
    ["ingen-prisomrakning", "avvikelse", "kronor", "referens", "andel",
     "demografi", "kallor", "om"].forEach(function (id) {
      var s = el("sektion-" + id);
      if (s) s.hidden = false;
    });

    kortSagt();
    ritaAvvikelse();
    ritaKronor();
    ritaReferens();
    ritaAndel();
    ritaDemografi();
    visaKallor();

    var upp = el("om-uppdaterad");
    if (upp) {
      upp.textContent = "Nyckeltalen hämtades " + data.hamtad +
        " och befolkningen " + data.befolkningHamtad + ".";
    }
  }

  K.starta(DATAFIL, { init: start });
})();
