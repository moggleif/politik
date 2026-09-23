/* Kommunfullmäktiges inspelade möten — längd, visningar, ärenden och
   inlägg, med länk till varje inspelning.
   Läser docs/data-fullmaktige.json, byggd av scripts/build_fullmaktige.py
   ur kommunens sida om webbsändningarna, Screen9-sändningarna och
   YouTube-spellistan.

   Sidans enda reglage är mötet vars dagordning visas. Valet ligger i
   adressen (?mote=2026-08-11), så att en länk ger samma vy. */
(function () {
  "use strict";

  var K = window.KIS;
  var FARG = K.FARG;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;
  var sakerUrl = K.sakerUrl;
  var visa = K.visaTal;

  var DATAFIL = "data-fullmaktige.json";

  var MANAD = ["januari", "februari", "mars", "april", "maj", "juni", "juli",
               "augusti", "september", "oktober", "november", "december"];

  var data = null;

  /* ---------- Tid och datum ---------- */

  function datumSv(iso) {
    var d = String(iso).split("-");
    return parseInt(d[2], 10) + " " + MANAD[parseInt(d[1], 10) - 1] + " " + d[0];
  }

  /* Längd som "3 h 55 min", avrundad till hel minut. */
  function langd(sek) {
    if (sek === null || sek === undefined) return "&ndash;";
    var min = Math.round(sek / 60);
    var h = Math.floor(min / 60);
    return (h ? h + "\u00a0h " : "") + (min % 60) + "\u00a0min";
  }

  /* Tidpunkt i inspelningen som "1:02:03". */
  function klocka(sek) {
    var h = Math.floor(sek / 3600), m = Math.floor(sek % 3600 / 60), s = sek % 60;
    return h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function timmar(sek) { return sek === null ? null : Math.round(sek / 36) / 100; }

  function lank(url, text) {
    var u = sakerUrl(url);
    return u ? '<a href="' + u + '">' + esc(text) + "</a>" : esc(text);
  }

  function inspelade() {
    return data.moten.filter(function (m) { return m.sekunder !== null; });
  }

  /* ---------- 1. Alla möten ---------- */

  function ritaMoten() {
    var rader = data.moten.slice().reverse().map(function (m) {
      var lankar = [];
      if (m.screen9) lankar.push(lank(m.screen9.url, "Screen9"));
      if (m.youtube) lankar.push(lank(m.youtube.url, "YouTube"));
      var s9 = m.screen9 || {};
      return "<tr><th scope=\"row\">" + esc(datumSv(m.datum)) + "</th><td>" +
        langd(m.sekunder) + "</td><td>" +
        visa(s9.antalArenden === undefined ? null : s9.antalArenden) + "</td><td>" +
        visa(s9.antalInlagg === undefined ? null : s9.antalInlagg) + "</td><td>" +
        visa(m.youtube ? m.youtube.visningar : null) + "</td><td>" +
        (lankar.length ? lankar.join(" · ") : "Ingen inspelning länkad") + "</td></tr>";
    }).join("");
    el("tabell-moten").innerHTML =
      "<thead><tr><th scope=\"col\">Möte</th><th scope=\"col\">Längd</th>" +
      "<th scope=\"col\">Ärenden</th><th scope=\"col\">Inlägg</th>" +
      "<th scope=\"col\">Visningar på YouTube</th>" +
      "<th scope=\"col\">Inspelning</th></tr></thead><tbody>" + rader + "</tbody>";

    el("kalla-moten").textContent = "Källa: Kungsbacka kommun, Screen9 och YouTube, hämtat " +
      data.hamtad.kommunsidan + ".";

    var noter = data.anmarkningar.map(function (a) {
      if (a.slag === "kommunlank") {
        return "Kommunens länk för mötet <strong>" + esc(datumSv(a.datum)) +
          "</strong> leder till inspelningen av mötet " + esc(datumSv(a.lederTill)) +
          ". Någon egen inspelning av mötet " + esc(datumSv(a.datum)) + " är inte länkad.";
      }
      return "YouTube-videon av mötet <strong>" + esc(datumSv(a.datum)) +
        "</strong> har det datumet i titeln, men sändes enligt YouTube den " +
        esc(datumSv(a.sandningsdatum)) + ".";
    });
    if (data.youtubeAngivet > data.youtubeSynliga) {
      noter.push("Spellistan på YouTube anger " + esc(data.youtubeAngivet) +
        " videor, men bara " + esc(data.youtubeSynliga) + " går att se. Resten är " +
        "dolda eller privata och finns inte med här.");
    }
    K.sattDataNot("not-moten", noter.length
      ? "<p><strong>Där källorna inte stämmer överens</strong></p><ul>" +
        noter.map(function (n) { return "<li>" + n + "</li>"; }).join("") + "</ul>"
      : "");
  }

  /* ---------- 2. Längden ---------- */

  /* Punkter, inte en sammanhängande linje: varje möte är ett eget mått,
     och de två inspelningarna skiljs med både färg och punktform. 2024
     finns båda och är nästan lika långa, så den ena ritas som en ihålig
     ring – annars döljer den den andra helt. */
  function punktserie(etikett, i, varden, ihalig) {
    var stil = K.serieStil(i);
    var s = K.linjeSerie(etikett, stil.farg, varden);
    s.showLine = false;
    s.pointStyle = stil.punkt;
    s.pointRadius = ihalig ? 6 : 4;
    s.pointHoverRadius = ihalig ? 8 : 6;
    s.pointBorderColor = stil.farg;
    s.pointBorderWidth = ihalig ? 2 : 1;
    s.pointBackgroundColor = ihalig ? FARG.surface : stil.farg;
    return s;
  }

  function ritaLangd() {
    var moten = inspelade();
    var opt = K.diagramStomme({
      legend: { display: true, labels: { usePointStyle: true } },
      tooltip: {
        title: function (it) { return "Mötet " + it[0].label; },
        label: function (it) {
          return it.dataset.label + ": " + langd(Math.round(it.parsed.y * 3600));
        }
      }
    });
    opt.scales = {
      x: K.kategoriAxel({ ticks: { maxRotation: 0, autoSkipPadding: 16 } }),
      y: K.mattAxel({ titel: "Timmar", franNoll: true })
    };
    K.rita("diagram-langd", {
      type: "line",
      data: {
        labels: moten.map(function (m) { return datumSv(m.datum); }),
        datasets: [
          punktserie("Screen9", 0, moten.map(function (m) {
            return m.screen9 ? timmar(m.screen9.sekunder) : null;
          }), true),
          punktserie("YouTube", 1, moten.map(function (m) {
            return m.youtube ? timmar(m.youtube.sekunder) : null;
          }))
        ]
      },
      options: opt
    }, 380);
    el("kalla-langd").textContent = "Källa: inspelningarnas längd på Screen9 och YouTube.";

    var langst = moten[0], kortast = moten[0];
    moten.forEach(function (m) {
      if (m.sekunder > langst.sekunder) langst = m;
      if (m.sekunder < kortast.sekunder) kortast = m;
    });
    el("slutsats-langd").innerHTML =
      "<p>Det längsta inspelade mötet är <strong>" + esc(datumSv(langst.datum)) +
      "</strong>, " + langd(langst.sekunder) + ". Det kortaste är <strong>" +
      esc(datumSv(kortast.datum)) + "</strong>, " + langd(kortast.sekunder) + ".</p>";

    el("tabell-ar").innerHTML =
      "<thead><tr><th scope=\"col\">År</th><th scope=\"col\">Möten</th>" +
      "<th scope=\"col\">Varav inspelade</th><th scope=\"col\">Sammanlagd längd</th>" +
      "<th scope=\"col\">Snittlängd</th><th scope=\"col\">Längsta mötet</th>" +
      "<th scope=\"col\">Visningar på YouTube</th><th scope=\"col\">Ärenden</th>" +
      "<th scope=\"col\">Inlägg</th></tr></thead><tbody>" +
      data.ar.map(function (a) {
        return "<tr><th scope=\"row\">" + esc(a.ar) + "</th><td>" + visa(a.moten) +
          "</td><td>" + visa(a.inspelade) + "</td><td>" + langd(a.sekunder) +
          "</td><td>" + langd(a.snittSekunder) + "</td><td>" +
          (a.langst ? esc(datumSv(a.langst.datum)) + ", " + langd(a.langst.sekunder) : "&ndash;") +
          "</td><td>" + visa(a.visningar) + "</td><td>" + visa(a.arenden) +
          "</td><td>" + visa(a.inlagg) + "</td></tr>";
      }).join("") + "</tbody>";
  }

  /* ---------- 3. Visningarna ---------- */

  function ritaVisningar() {
    var moten = data.moten.filter(function (m) { return m.youtube; });
    var opt = K.diagramStomme({
      legend: { display: false },
      tooltip: {
        title: function (it) { return "Mötet " + it[0].label; },
        label: function (it) { return talSv(it.parsed.y) + " visningar"; }
      }
    });
    opt.scales = {
      x: K.kategoriAxel({ ticks: { maxRotation: 0, autoSkipPadding: 16 } }),
      y: K.mattAxel({ titel: "Visningar", franNoll: true })
    };
    K.rita("diagram-visningar", {
      type: "bar",
      data: {
        labels: moten.map(function (m) { return datumSv(m.datum); }),
        datasets: [{
          label: "Visningar på YouTube",
          data: moten.map(function (m) { return m.youtube.visningar; }),
          backgroundColor: FARG.bla,
          borderRadius: 3,
          maxBarThickness: 28
        }]
      },
      options: opt
    }, 340);
    el("kalla-visningar").textContent = "Källa: YouTube, antalet visningar " +
      data.hamtad.youtube + ".";

    var varden = moten.map(function (m) { return m.youtube.visningar; });
    var summa = varden.reduce(function (a, b) { return a + b; }, 0);
    el("slutsats-visningar").innerHTML =
      "<p>De " + esc(moten.length) + " videorna har sammanlagt <strong>" +
      talSv(summa) + "</strong> visningar, från " + talSv(Math.min.apply(null, varden)) +
      " till " + talSv(Math.max.apply(null, varden)) + " per video.</p>";

    el("tabell-visningar").innerHTML =
      "<thead><tr><th scope=\"col\">Möte</th><th scope=\"col\">Visningar</th>" +
      "<th scope=\"col\">Längd</th><th scope=\"col\">Sänd direkt</th></tr></thead><tbody>" +
      moten.map(function (m) {
        return "<tr><th scope=\"row\">" + esc(datumSv(m.datum)) + "</th><td>" +
          visa(m.youtube.visningar) + "</td><td>" + langd(m.youtube.sekunder) +
          "</td><td>" + (m.youtube.live ? "Ja, " + esc(datumSv(m.youtube.sandningsdatum)) : "Nej") +
          "</td></tr>";
      }).join("") + "</tbody>";
  }

  /* ---------- 4. Ett mötes dagordning ---------- */

  function motenMedArenden() {
    return data.moten.filter(function (m) {
      return m.screen9 && m.screen9.arenden;
    }).reverse();
  }

  function ritaArenden() {
    var vald = el("mote-valjare").value;
    var m = motenMedArenden().filter(function (x) { return x.datum === vald; })[0];
    if (!m) return;
    var s = m.screen9;
    el("mote-lank").innerHTML = "Mötet " + esc(datumSv(m.datum)) + ": " +
      esc(talSv(s.antalArenden)) + " ärenden och " + esc(talSv(s.antalInlagg)) +
      " inlägg på " + langd(s.sekunder) + ". " + lank(s.url, "Se inspelningen på Screen9") + ".";
    el("tabell-arenden").innerHTML =
      "<thead><tr><th scope=\"col\">Ärende</th><th scope=\"col\">Börjar i inspelningen</th>" +
      "<th scope=\"col\">Inlägg</th></tr></thead><tbody>" +
      s.arenden.map(function (a) {
        return "<tr><td>" + (a.titel === null ? "<em>Före första ärendet</em>" : esc(a.titel)) +
          "</td><td>" + klocka(a.start) + "</td><td>" + visa(a.inlagg) + "</td></tr>";
      }).join("") + "</tbody>";
  }

  /* ---------- 5. Inlägg per parti ---------- */

  function ritaPartier() {
    var p = data.partier;
    var rader = p.totalt;
    var opt = K.diagramStomme({
      legend: { display: false },
      tooltip: {
        title: function (it) { return it[0].label; },
        label: function (it) {
          var r = rader[it.dataIndex];
          return [talSv(r.totalt) + " inlägg", talSv(r.anforanden) + " anföranden, " +
            talSv(r.repliker) + " repliker, " + talSv(r.ordningsfragor) + " ordningsfrågor"];
        }
      }
    });
    opt.indexAxis = "y";
    opt.scales = {
      x: K.mattAxel({ titel: "Antal inlägg " + p.ar[0] + "–" + p.ar[p.ar.length - 1], franNoll: true }),
      y: K.kategoriAxel({ ticks: { autoSkip: false } })
    };
    K.rita("diagram-partier", {
      type: "bar",
      data: {
        labels: rader.map(function (r) { return r.parti; }),
        datasets: [{
          label: "Inlägg",
          data: rader.map(function (r) { return r.totalt; }),
          backgroundColor: FARG.bla,
          borderRadius: 3,
          maxBarThickness: 24
        }]
      },
      options: opt
    }, Math.max(260, rader.length * 34 + 80));
    el("kalla-partier").textContent = "Källa: kapitelmarkeringarna i Screen9-sändningarna " +
      p.ar[0] + "–" + p.ar[p.ar.length - 1] + ".";

    K.sattDataNot("not-partier",
      "Beteckningarna står som i kapitelmarkeringarna och har inte ändrats här. " +
      "Samma parti kan därför förekomma under två beteckningar. Ett inlägg utan " +
      "partibeteckning räknas för sig.");

    el("tabell-partier").innerHTML =
      "<thead><tr><th scope=\"col\">Parti</th>" +
      p.ar.map(function (a) { return "<th scope=\"col\">" + esc(a) + "</th>"; }).join("") +
      "<th scope=\"col\">Anföranden</th><th scope=\"col\">Repliker</th>" +
      "<th scope=\"col\">Ordningsfrågor</th><th scope=\"col\">Totalt</th></tr></thead><tbody>" +
      rader.map(function (r) {
        return "<tr><th scope=\"row\">" + esc(r.parti) + "</th>" +
          p.ar.map(function (a) {
            var t = (p.perAr[String(a)] || []).filter(function (x) { return x.parti === r.parti; })[0];
            return "<td>" + visa(t ? t.totalt : null) + "</td>";
          }).join("") +
          "<td>" + visa(r.anforanden) + "</td><td>" + visa(r.repliker) + "</td><td>" +
          visa(r.ordningsfragor) + "</td><td>" + visa(r.totalt) + "</td></tr>";
      }).join("") + "</tbody>";
  }

  /* ---------- Kort sagt, källor, start ---------- */

  function kortSagt() {
    var moten = inspelade();
    var sek = moten.reduce(function (a, m) { return a + m.sekunder; }, 0);
    var punkter = [
      "<strong>" + esc(moten.length) + " möten</strong> från " +
        esc(datumSv(moten[0].datum)) + " till " + esc(datumSv(moten[moten.length - 1].datum)) +
        " har en inspelning som går att se, sammanlagt <strong>" +
        talSv(Math.round(sek / 3600)) + " timmar</strong>."
    ];
    var yt = data.moten.filter(function (m) { return m.youtube; });
    if (yt.length) {
      var v = yt.map(function (m) { return m.youtube.visningar; });
      punkter.push("De " + esc(yt.length) + " mötena på YouTube har mellan <strong>" +
        talSv(Math.min.apply(null, v)) + " och " + talSv(Math.max.apply(null, v)) +
        "</strong> visningar var.");
    }
    var medArenden = data.ar.filter(function (a) { return a.arenden !== null; });
    if (medArenden.length) {
      punkter.push("Under " + esc(medArenden[0].ar) +
        (medArenden.length > 1 ? "–" + esc(medArenden[medArenden.length - 1].ar) : "") +
        " behandlades <strong>" + talSv(medArenden.reduce(function (s, a) { return s + a.arenden; }, 0)) +
        " ärenden</strong> med <strong>" +
        talSv(medArenden.reduce(function (s, a) { return s + a.inlagg; }, 0)) +
        " inlägg</strong>.");
    }
    data.anmarkningar.forEach(function (a) {
      if (a.slag !== "kommunlank") return;
      punkter.push("Mötet " + esc(datumSv(a.datum)) + " saknar länkad inspelning: " +
        "kommunens länk leder till mötet " + esc(datumSv(a.lederTill)) + ".");
    });
    K.visaKortSagt(punkter);
  }

  function visaKallor() {
    el("lista-kallor").innerHTML = [
      K.kallpost({
        titel: "Kungsbacka kommun: Webbsändningar från kommunfullmäktige",
        detalj: "Länkarna till Screen9, år för år. Hämtat " + data.hamtad.kommunsidan + ".",
        lankar: [[data.kallor.kommunsida, "Kommunens sida"]]
      }),
      K.kallpost({
        titel: "Screen9 (QC Network): sändningarna 2024 och framåt",
        detalj: "Längd och kapitelmarkeringar ur varje sändning. Länk per möte i tabellen ovan.",
        lankar: []
      }),
      K.kallpost({
        titel: "YouTube: spellistan Kungsbacka kommunfullmäktige, 2022–2024",
        detalj: "Längd, visningar och sändningsdatum för varje video. Hämtat " +
          data.hamtad.youtube + ".",
        lankar: [[data.kallor.spellista, "Spellistan på YouTube"]]
      })
    ].join("");
  }

  function start(inlast) {
    data = inlast;
    var moten = inspelade();

    K.visaMeta({
      kalla: "Kungsbacka kommun, Screen9 och YouTube",
      period: moten[0].datum.slice(0, 4) + "–" + moten[moten.length - 1].datum.slice(0, 4),
      senaste: datumSv(moten[moten.length - 1].datum),
      hamtad: data.hamtad.kommunsidan
    });

    kortSagt();
    ritaMoten();
    ritaLangd();
    ritaVisningar();

    var valjare = el("mote-valjare");
    K.fyllValjare(valjare, motenMedArenden().map(function (m) { return m.datum; }), datumSv);
    K.kopplaValjare(valjare, "mote", ritaArenden);
    ritaArenden();

    ritaPartier();
    visaKallor();

    ["moten", "langd", "visningar", "arenden", "partier", "kallor", "om"]
      .forEach(function (id) { el("sektion-" + id).hidden = false; });

    el("om-uppdaterad").textContent = "Uppgifterna hämtades " + data.hamtad.kommunsidan +
      ". Visningarna på YouTube är en ögonblicksbild från det tillfället.";
  }

  K.starta(DATAFIL, { init: start });
})();
