/* Slutbetyg från Kungsbackas gymnasieskolor – läser docs/data-slutbetyg.json
   och ritar diagrammen.

   Sidan är program för program, inte skola för skola: en linje är ett
   program på Aranäsgymnasiet eller Elof Lindälvs gymnasium – övriga
   skolenheter i Skolverkets rapport sorteras bort redan i bygget. Ett
   program som flyttat mellan de två skolorna är fortfarande ett program
   och tar sina gamla år med sig. Låg samma program på två skolor
   samtidigt är det däremot två utbildningar, och då står skolan i
   namnet. Uppdelningen görs i scripts/build_slutbetyg.py. */
(function () {
  "use strict";

  /* Färger, kategorisk palett (validerad för färgblindhet), talformat
     och diagraminställningar delas med de andra sidorna via gemensam.js.
     Serierna skiljs inte bara med färg utan också med punktform, och
     efter åtta serier med streckning. */
  var K = window.KIS;
  var FARG = K.FARG;
  var serieStil = K.serieStil;

  /* De fyra talen rapporten redovisar. Betygspoängen är sidans huvudmått
     och styr rangordning och förändring; utvecklingen över tid går att
     följa för vilket som helst av dem. */
  var MATT = [
    {
      id: "betygspoang",
      namn: "Genomsnittlig betygspoäng",
      axel: "Betygspoäng (0–20)",
      forklaring: "Genomsnittet av avgångselevernas slutbetyg. Skalan går " +
        "till 20: E ger 10 poäng, C ger 15 och A ger 20.",
      max: 20, dec: 1, suffix: ""
    },
    {
      id: "betygspoangExamen",
      namn: "Betygspoäng, elever med examen",
      axel: "Betygspoäng (0–20)",
      forklaring: "Samma mått, men bara för de elever som fick en " +
        "gymnasieexamen.",
      max: 20, dec: 1, suffix: ""
    },
    {
      id: "andelExamen",
      namn: "Andel med gymnasieexamen",
      axel: "Andel av avgångseleverna (%)",
      forklaring: "Hur stor andel av avgångseleverna som klarade " +
        "examenskraven. Övriga fick studiebevis.",
      max: 100, dec: 1, suffix: " %"
    },
    {
      id: "andelGrundlBehorighet",
      namn: "Andel med grundläggande högskolebehörighet",
      axel: "Andel av avgångseleverna (%)",
      forklaring: "Hur stor andel som kom ut med rätt att söka till " +
        "högskolan.",
      max: 100, dec: 1, suffix: " %"
    }
  ];
  var HUVUDMATT = MATT[0];

  var TYPNAMN = K.TYPNAMN;

  function mattMed(id) {
    for (var i = 0; i < MATT.length; i++) {
      if (MATT[i].id === id) return MATT[i];
    }
    return HUVUDMATT;
  }

  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;
  var sakerUrl = K.sakerUrl;

  function visaTal(v, matt) {
    return v === null || v === undefined
      ? "–" : talSv(v, matt.dec) + matt.suffix;
  }

  /* Saknade värden i tabellerna, med orsaken utskriven: ".." är
     Skolverkets dubbelprickning (sekretess), "–" betyder att utbildningen
     inte redovisas alls det året. */
  var SEKRETESS_CELL = '<abbr class="sekretess" title="Färre än tio ' +
    'avgångselever – Skolverket redovisar inte värdet">..</abbr>';
  var FANNS_EJ_CELL = '<span class="fanns-ej" title="Utbildningen ' +
    'redovisas inte det året – den fanns inte, eller hade inga ' +
    'avgångselever">–</span>';

  function visaTalMedOrsak(u, ar, matt) {
    var v = u.varden[String(ar)];
    if (!v) return FANNS_EJ_CELL;
    var tal = v[matt.id];
    if (tal === null || tal === undefined) return SEKRETESS_CELL;
    return talSv(tal, matt.dec) + matt.suffix;
  }

  var TECKENFORKLARING =
    "<strong>..</strong> = färre än tio avgångselever; Skolverket " +
    "dubbelprickar uppgiften så att enskilda elever inte ska gå att räkna " +
    "ut (sekretess). <strong>–</strong> = utbildningen redovisas inte det " +
    "året: den fanns inte, eller hade inga avgångselever. En redovisad " +
    "nolla skrivs ut som 0.";

  /* ---------- Gemensamt tillstånd ---------- */

  var DATA = null;
  var KORT = {};           // skolans fulla namn -> kortform
  var rita = K.rita;

  /* Årsskalan och de år som saknar rapport delas med meritvärdessidan via
     gemensam.js; wrapparna skickar in sidans egen årslista. */
  function arsskala() { return K.arsskala(DATA.ar); }

  function saknadeAr() { return K.saknadeAr(DATA.ar); }

  function saknadeArText() { return K.saknadeArText(DATA.ar); }

  /* Programmen som filtret släpper fram. Tomt filter = alla. */
  function valdGrupp() { return el("grupp-valjare").value; }

  function synligaProgram() {
    var grupp = valdGrupp();
    return DATA.utbildningar.filter(function (u) {
      return !grupp || u.typ === grupp;
    });
  }

  function gruppText() {
    var grupp = valdGrupp();
    return grupp ? TYPNAMN[grupp].toLowerCase() : "program";
  }

  function varde(u, ar, matt) {
    var v = u.varden[String(ar)];
    return v && v[matt.id] !== null && v[matt.id] !== undefined ? v[matt.id] : null;
  }

  function antalElever(u, ar) {
    var v = u.varden[String(ar)];
    return v && v.antal !== null ? v.antal : null;
  }

  function skolaAr(u, ar) {
    var v = u.varden[String(ar)];
    return v ? v.skola : null;
  }

  function kort(skola) { return KORT[skola] || skola; }

  /* Var programmet legat. Ett delat program hör till en skola; ett som
     flyttat får sin väg utskriven, eftersom linjen då spänner över flera. */
  function skolText(u) {
    if (!u.skolhistorik.length) return kort(u.skola);
    return u.skolhistorik.map(function (h) {
      return kort(h.skola) + " " +
        (h.forstaAr === h.sistaAr ? h.forstaAr : h.forstaAr + "–" + h.sistaAr);
    }).join(" → ");
  }

  function harFlyttat(u) { return u.skolhistorik.length > 1; }

  /* De år något av de synliga programmen redovisar betygspoäng. */
  function arMedProgram() {
    var ar = {};
    synligaProgram().forEach(function (u) {
      Object.keys(u.varden).forEach(function (a) {
        if (u.varden[a].betygspoang !== null) ar[a] = true;
      });
    });
    return Object.keys(ar).map(Number).sort(function (a, b) { return b - a; });
  }

  /* ---------- Avsnitt 1: utvecklingen program för program ---------- */

  function ritaUtveckling() {
    var matt = mattMed(el("matt-valjare").value);
    var ar = arsskala();
    var lista = synligaProgram();

    /* Finns inget att visa för något av måtten göms avsnittet. Finns det
       något, men inte för det valda måttet, står avsnittet kvar med en
       förklaring – annars försvinner måttväljaren och läsaren kommer inte
       tillbaka. */
    var harNagot = lista.some(function (u) {
      return MATT.some(function (m) {
        return ar.some(function (a) { return varde(u, a, m) !== null; });
      });
    });
    if (!harNagot) {
      el("sektion-utveckling").hidden = true;
      return;
    }
    el("sektion-utveckling").hidden = false;

    var serier = lista.map(function (u) {
      return {
        u: u,
        etikett: u.namn,
        varden: ar.map(function (a) { return varde(u, a, matt); }),
        antal: ar.map(function (a) { return antalElever(u, a); }),
        skolor: ar.map(function (a) { return skolaAr(u, a); })
      };
    }).filter(function (s) {
      return s.varden.some(function (v) { return v !== null; });
    });

    var kortDiv = el("diagram-utveckling").closest(".kort");
    if (!serier.length) {
      K.taBortDiagram("diagram-utveckling");
      kortDiv.hidden = true;
      el("slutsats-utveckling").innerHTML = "<p>Inget av de två skolornas " +
        gruppText() + " har " + matt.namn.toLowerCase() + " redovisad något " +
        "år. Skolverket redovisar inte uppgifter som bygger på färre än tio " +
        "elever.</p>";
      el("tabell-utveckling").innerHTML = "";
      return;
    }
    kortDiv.hidden = false;

    /* Sortera efter senaste kända värde, så att teckenförklaringen står i
       samma ordning som linjerna ligger i diagrammets högerkant. */
    function sist(s) {
      for (var i = s.varden.length - 1; i >= 0; i--) {
        if (s.varden[i] !== null) return s.varden[i];
      }
      return -1;
    }
    serier.sort(function (a, b) { return sist(b) - sist(a); });

    rita("diagram-utveckling", {
      type: "line",
      data: {
        labels: ar.map(String),
        datasets: serier.map(function (s, i) {
          var stil = serieStil(i);
          return {
            label: s.etikett,
            data: s.varden,
            antal: s.antal,
            skolor: s.skolor,
            visaSkola: harFlyttat(s.u),
            borderColor: stil.farg,
            backgroundColor: stil.farg,
            borderDash: stil.streck,
            pointStyle: stil.punkt,
            borderWidth: 2.5,
            pointRadius: 3.5,
            pointHoverRadius: 7,
            spanGaps: false,
            tension: 0.1
          };
        })
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { display: true, position: "bottom", labels: { boxWidth: 40 } },
          tooltip: {
            callbacks: {
              title: function (it) { return "Avgångna " + it[0].label; },
              label: function (it) {
                var d = it.dataset;
                var n = d.antal ? d.antal[it.dataIndex] : null;
                return d.label + ": " + visaTal(it.parsed.y, matt) +
                  (n ? " (" + n + " avgångselever)" : "");
              },
              afterLabel: function (it) {
                var d = it.dataset;
                var s = d.skolor ? d.skolor[it.dataIndex] : null;
                return (d.visaSkola && s) ? s : "";
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: FARG.baseline },
            ticks: { maxRotation: 0, autoSkipPadding: 8 }
          },
          y: {
            title: { display: true, text: matt.axel, color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            beginAtZero: false,
            grace: "8%",
            ticks: { callback: function (v) { return talSv(v); } }
          }
        }
      }
    }, Math.max(420, 300 + serier.length * 14));

    /* Många linjer: peka på en linje eller ett namn i teckenförklaringen
       så tonas de övriga ned. */
    if (serier.length >= 3) K.aktiveraToning(K.diagramFor("diagram-utveckling"));

    el("kalla-utveckling").textContent = matt.forklaring +
      " Året är det år eleverna gick ut, i juni." + saknadeArText() +
      (serier.length > 3
        ? " Peka på ett namn i teckenförklaringen så tonas de andra " +
          "linjerna ned; klicka för att dölja linjen."
        : "");

    K.sattDataNot("not-utveckling",
      "<p>En linje bryts de år utbildningen hade <strong>färre än tio " +
      "avgångselever</strong> – Skolverket redovisar då inte värdet, av " +
      "sekretesskäl. I tabellen visas de åren som &rdquo;..&rdquo;.</p>");

    ritaSlutsatsUtveckling(serier, matt);
    ritaTabellUtveckling(matt);
  }

  function ritaSlutsatsUtveckling(serier, matt) {
    var ar = arsskala();
    var forsta = DATA.ar[0], sista = DATA.ar[DATA.ar.length - 1];

    /* Bara serier som finns både första och sista året går att jämföra över
       hela perioden. Övriga har startat, lagts ned eller varit för små
       däremellan. */
    var helaPerioden = serier.map(function (s) {
      var a = s.varden[ar.indexOf(forsta)], b = s.varden[ar.indexOf(sista)];
      return (a !== null && b !== null)
        ? { etikett: s.etikett, forsta: a, sista: b, diff: b - a } : null;
    }).filter(Boolean);

    var html = "";
    var senast = serier.map(function (s) {
      var v = s.varden[ar.indexOf(sista)];
      return v === null ? null : { etikett: s.etikett, v: v };
    }).filter(Boolean);

    if (senast.length) {
      var hogst = senast[0], lagst = senast[senast.length - 1];
      html += "<p><strong>" + esc(sista) + "</strong> hade " + esc(hogst.etikett) +
        " högst " + matt.namn.toLowerCase() + " i Kungsbacka (" +
        visaTal(hogst.v, matt) + ")";
      if (senast.length > 1) {
        html += " och " + esc(lagst.etikett) + " lägst (" + visaTal(lagst.v, matt) + ").";
      } else {
        html += ".";
      }
      html += "</p>";
    }

    if (helaPerioden.length) {
      helaPerioden.sort(function (a, b) { return b.diff - a.diff; });
      var upp = helaPerioden[0], ner = helaPerioden[helaPerioden.length - 1];
      var stigande = helaPerioden.filter(function (r) { return r.diff > 0; }).length;
      html += "<p>Av de " + helaPerioden.length + " utbildningar som redovisas både " +
        esc(forsta) + " och " + esc(sista) + " har <strong>" + stigande +
        "</strong> högre värde i dag än då.";
      if (upp.diff > 0) {
        html += " Mest har " + esc(upp.etikett) + " stigit: " +
          visaTal(upp.forsta, matt) + " till " + visaTal(upp.sista, matt) + " (+" +
          talSv(upp.diff, matt.dec) + ").";
      }
      if (ner.diff < 0) {
        html += " Mest har " + esc(ner.etikett) + " sjunkit: " +
          visaTal(ner.forsta, matt) + " till " + visaTal(ner.sista, matt) + " (−" +
          talSv(Math.abs(ner.diff), matt.dec) + ").";
      }
      html += "</p>";
    }

    html += "<p><strong>Läs med försiktighet:</strong> ett program med en " +
      "liten avgångskull kan svänga kraftigt mellan åren av rena " +
      "tillfälligheter &ndash; tio elever räcker för att redovisas. Hur " +
      "många eleverna var syns när du pekar på en punkt.</p>";

    el("slutsats-utveckling").innerHTML = html;
  }

  function ritaTabellUtveckling(matt) {
    var ar = DATA.ar;
    var lista = synligaProgram();
    var t = "<caption>" + matt.namn + " per utbildning och år, Kungsbacka. " +
      "Teckenförklaring under tabellen.</caption>";
    t += "<thead><tr><th scope=\"col\">Utbildning</th><th scope=\"col\">Skola</th>";
    ar.forEach(function (a) { t += "<th scope=\"col\">" + esc(a) + "</th>"; });
    t += "</tr></thead><tbody>";
    lista.forEach(function (u) {
      t += "<tr><td>" + esc(u.namn) + "</td><td>" + esc(skolText(u)) + "</td>";
      ar.forEach(function (a) {
        t += "<td>" + visaTalMedOrsak(u, a, matt) + "</td>";
      });
      t += "</tr>";
    });
    t += "</tbody>";
    el("tabell-utveckling").innerHTML = t;
    el("teckenforklaring-utveckling").innerHTML = TECKENFORKLARING;
  }

  /* ---------- Avsnitt 2: rangordning ett enskilt år ---------- */

  function ritaRangordning() {
    var valtAr = Number(el("ar-valjare").value);
    var rader = synligaProgram().map(function (u) {
      var v = u.varden[String(valtAr)];
      return (v && v.betygspoang !== null) ? { u: u, v: v } : null;
    }).filter(Boolean);
    rader.sort(function (a, b) { return b.v.betygspoang - a.v.betygspoang; });

    if (!rader.length) {
      el("sektion-rangordning").hidden = true;
      return;
    }
    el("sektion-rangordning").hidden = false;

    rita("diagram-rangordning", {
      type: "bar",
      data: {
        labels: rader.map(function (r) { return r.u.namn; }),
        datasets: [{
          data: rader.map(function (r) { return r.v.betygspoang; }),
          backgroundColor: rader.map(function (r) {
            return r.u.typ === "hogskoleforberedande" ? FARG.blaMork : FARG.bla;
          }),
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 22
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
              label: function (it) {
                var r = rader[it.dataIndex];
                var rad = [
                  r.v.skola,
                  "Betygspoäng: " + visaTal(r.v.betygspoang, HUVUDMATT),
                  "Avgångselever: " + (r.v.antal === null ? "–" : r.v.antal)
                ];
                if (r.v.andelExamen !== null) {
                  rad.push("Med examen: " + talSv(r.v.andelExamen, 1) + " %");
                }
                if (r.v.andelGrundlBehorighet !== null) {
                  rad.push("Med högskolebehörighet: " +
                    talSv(r.v.andelGrundlBehorighet, 1) + " %");
                }
                rad.push(TYPNAMN[r.u.typ] || r.u.typ);
                return rad;
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: HUVUDMATT.axel, color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            beginAtZero: true,
            max: DATA.maxPoang,
            ticks: { callback: function (v) { return talSv(v); } }
          },
          y: { grid: { display: false }, border: { color: FARG.baseline } }
        }
      }
    }, Math.max(260, rader.length * 30 + 90));

    el("kalla-rangordning").textContent =
      "Mörk stapel = högskoleförberedande program, ljus = yrkesprogram. " +
      "Skalan går till 20, som är högsta möjliga betygspoäng.";

    var hogst = rader[0], lagst = rader[rader.length - 1];
    var html = "<p>Högst betygspoäng " + valtAr + " hade <strong>" +
      esc(hogst.u.namn) + "</strong> (" + visaTal(hogst.v.betygspoang, HUVUDMATT) +
      "), lägst <strong>" + esc(lagst.u.namn) + "</strong> (" +
      visaTal(lagst.v.betygspoang, HUVUDMATT) + "). Skillnaden är " +
      talSv(hogst.v.betygspoang - lagst.v.betygspoang, 1) + " betygspoäng.</p>";
    var sammanfattning = DATA.sammanfattning.filter(function (s) {
      return s.ar === valtAr;
    })[0];
    if (sammanfattning && !valdGrupp()) {
      html += "<p>Hela avgångskullen på de två skolorna var " +
        esc(sammanfattning.antal) + " elever med " +
        visaTal(sammanfattning.betygspoang, HUVUDMATT) +
        " i snitt. Här räknas varje elev lika mycket, så de stora " +
        "utbildningarna väger tyngre än de små.";
      if (sammanfattning.antalProgram > sammanfattning.programMedPoang) {
        html += " " + (sammanfattning.antalProgram - sammanfattning.programMedPoang) +
          " av de " + esc(sammanfattning.antalProgram) + " utbildningarna hade " +
          "för få avgångselever för att redovisas var för sig, men ingår i " +
          "snittet.";
      }
      html += "</p>";
    }
    el("slutsats-rangordning").innerHTML = html;

    var t = "<caption>Slutbetyg per utbildning, avgångna " + valtAr +
      ", Kungsbacka.</caption>";
    t += "<thead><tr><th scope=\"col\">Utbildning</th>" +
      "<th scope=\"col\">Skola</th>" +
      "<th scope=\"col\">Avgångselever</th>" +
      "<th scope=\"col\">Betygspoäng</th>" +
      "<th scope=\"col\">Betygspoäng, med examen</th>" +
      "<th scope=\"col\">Med examen</th>" +
      "<th scope=\"col\">Med högskolebehörighet</th></tr></thead><tbody>";
    rader.forEach(function (r) {
      t += "<tr><td>" + esc(r.u.namn) + "</td>" +
        "<td>" + esc(r.v.skola) + "</td>" +
        "<td>" + (r.v.antal === null ? "–" : esc(r.v.antal)) + "</td>" +
        "<td>" + visaTal(r.v.betygspoang, MATT[0]) + "</td>" +
        "<td>" + visaTal(r.v.betygspoangExamen, MATT[1]) + "</td>" +
        "<td>" + visaTal(r.v.andelExamen, MATT[2]) + "</td>" +
        "<td>" + visaTal(r.v.andelGrundlBehorighet, MATT[3]) + "</td></tr>";
    });
    t += "</tbody>";
    el("tabell-rangordning").innerHTML = t;
  }

  /* ---------- Avsnitt 3: förändring över mätperioden ---------- */

  function ritaForandring() {
    var rader = synligaProgram().filter(function (u) {
      return u.forandring !== null && u.antalArMedPoang >= 2;
    });
    rader.sort(function (a, b) { return b.forandring - a.forandring; });

    if (!rader.length) {
      el("sektion-forandring").hidden = true;
      return;
    }
    el("sektion-forandring").hidden = false;

    rita("diagram-forandring", {
      type: "bar",
      data: {
        labels: rader.map(function (u) { return u.namn; }),
        datasets: [{
          data: rader.map(function (u) { return u.forandring; }),
          backgroundColor: rader.map(function (u) {
            return u.forandring >= 0 ? FARG.bla : FARG.rod;
          }),
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 22
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
              label: function (it) {
                var u = rader[it.dataIndex];
                var flyttat = harFlyttat(u);
                return [
                  u.forstaAr + ": " + talSv(u.forsta, 1) +
                    (flyttat ? " (" + kort(u.forstaSkola) + ")" : ""),
                  u.sistaAr + ": " + talSv(u.sista, 1) +
                    (flyttat ? " (" + kort(u.sistaSkola) + ")" : ""),
                  (u.forandring >= 0 ? "Upp " : "Ner ") +
                    talSv(Math.abs(u.forandring), 1) + " betygspoäng"
                ];
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Förändring i betygspoäng, första till sista mätår",
              color: FARG.muted
            },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            ticks: { callback: function (v) { return (v > 0 ? "+" : "") + talSv(v, 1); } }
          },
          y: { grid: { display: false }, border: { color: FARG.baseline } }
        }
      }
    }, Math.max(260, rader.length * 30 + 100));

    el("kalla-forandring").textContent =
      "Blå stapel = högre betygspoäng än vid första mätåret, röd = lägre. " +
      "Färgen visar bara riktningen, inte om utvecklingen är bra eller dålig.";

    var upp = rader.filter(function (u) { return u.forandring > 0; }).length;
    var ner = rader.filter(function (u) { return u.forandring < 0; }).length;
    var html = "<p><strong>" + upp + " av " + rader.length +
      "</strong> utbildningar i Kungsbacka har högre betygspoäng vid sitt " +
      "sista mätår än vid sitt första, " + ner + " har lägre.</p>";
    var flyttade = rader.filter(harFlyttat).length;
    if (flyttade) {
      html += "<p>" + flyttade + " av dem har bytt skola under perioden. " +
        "Jämförelsen gäller programmet, inte skolan &ndash; peka på stapeln " +
        "för att se var respektive mätår ligger.</p>";
    }
    var kortaste = rader.filter(function (u) { return u.antalArMedPoang === 2; }).length;
    if (kortaste) {
      html += "<p><strong>Läs med försiktighet:</strong> " + kortaste +
        " av utbildningarna har bara två mätår. Då är &rdquo;förändringen&rdquo; " +
        "skillnaden mellan två enskilda årskullar, inte en trend.</p>";
    }
    el("slutsats-forandring").innerHTML = html;

    var t = "<caption>Förändring i genomsnittlig betygspoäng per utbildning, " +
      "Kungsbacka.</caption>";
    t += "<thead><tr><th scope=\"col\">Utbildning</th><th scope=\"col\">Skola</th>" +
      "<th scope=\"col\">Första mätåret</th>" +
      "<th scope=\"col\">Sista mätåret</th><th scope=\"col\">Förändring</th>" +
      "<th scope=\"col\">Antal mätår</th></tr></thead><tbody>";
    rader.forEach(function (u) {
      t += "<tr><td>" + esc(u.namn) + "</td><td>" + esc(skolText(u)) + "</td><td>" +
        esc(u.forstaAr) + ": " + talSv(u.forsta, 1) +
        "</td><td>" + esc(u.sistaAr) + ": " + talSv(u.sista, 1) + "</td><td>" +
        (u.forandring >= 0 ? "+" : "−") + talSv(Math.abs(u.forandring), 1) +
        "</td><td>" + esc(u.antalArMedPoang) + "</td></tr>";
    });
    t += "</tbody>";
    el("tabell-forandring").innerHTML = t;
  }

  /* ---------- Avsnitt 4: examen eller studiebevis ----------
     Båda skolorna, oberoende av programfiltret: siffrorna kommer ur
     rapportens egen summering för deras skolenheter, som också räknar med
     de utbildningar som är för små för att redovisas var för sig. */

  function ritaExamen() {
    var rader = DATA.sammanfattning.filter(function (r) {
      return r.medExamen !== null;
    });
    if (!rader.length) {
      el("sektion-examen").hidden = true;
      return;
    }
    el("sektion-examen").hidden = false;

    rita("diagram-examen", {
      type: "bar",
      data: {
        labels: rader.map(function (r) { return String(r.ar); }),
        datasets: [
          {
            label: "Gymnasieexamen",
            data: rader.map(function (r) { return r.medExamen; }),
            backgroundColor: FARG.blaMork,
            maxBarThickness: 44
          },
          {
            label: "Studiebevis, ingen examen",
            data: rader.map(function (r) { return r.utanExamen; }),
            backgroundColor: FARG.blaLjus,
            maxBarThickness: 44
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
          legend: { display: true, position: "bottom", labels: { boxWidth: 18 } },
          tooltip: {
            callbacks: {
              title: function (it) { return "Avgångna " + it[0].label; },
              label: function (it) {
                var r = rader[it.dataIndex];
                return it.dataset.label + ": " + it.parsed.y + " av " +
                  r.antal + " elever";
              },
              footer: function (it) {
                var r = rader[it[0].dataIndex];
                return r.andelExamen === null ? "" :
                  talSv(r.andelExamen, 1) + " % med examen";
              }
            }
          }
        },
        scales: {
          x: { stacked: true, grid: { display: false }, border: { color: FARG.baseline } },
          y: {
            stacked: true,
            title: { display: true, text: "Antal avgångselever", color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            beginAtZero: true,
            ticks: { precision: 0 }
          }
        }
      }
    }, 380);

    el("kalla-examen").textContent =
      "Antalet elever är framräknat ur andelen med examen och avrundat till " +
      "hela elever. Staplarna omfattar samtliga nationella program på de " +
      "två skolorna, även de för små för att redovisas var för sig.";

    var forsta = rader[0], sista = rader[rader.length - 1];
    var html = "<p>" + esc(sista.ar) + " gick <strong>" + esc(sista.medExamen) + " av " +
      esc(sista.antal) + "</strong> avgångselever ut Aranäs och Elof Lindälv " +
      "med en gymnasieexamen (" + talSv(sista.andelExamen, 1) + " procent). " +
      esc(forsta.ar) + " var det " + esc(forsta.medExamen) + " av " + esc(forsta.antal) +
      " (" + talSv(forsta.andelExamen, 1) + " procent).</p>";
    if (sista.andelGrundlBehorighet !== null) {
      html += "<p>" + talSv(sista.andelGrundlBehorighet, 1) + " procent av " +
        esc(sista.ar) + " års avgångselever hade grundläggande " +
        "högskolebehörighet. Det är ett annat krav än examen: en elev kan " +
        "ha examen från ett yrkesprogram utan att ha läst till behörigheten.</p>";
    }
    el("slutsats-examen").innerHTML = html;

    var t = "<caption>Avgångselever med och utan gymnasieexamen per år, " +
      "samtliga gymnasieskolor i Kungsbacka.</caption>";
    t += "<thead><tr><th scope=\"col\">År</th>" +
      "<th scope=\"col\">Avgångselever</th>" +
      "<th scope=\"col\">Med examen</th>" +
      "<th scope=\"col\">Andel med examen</th>" +
      "<th scope=\"col\">Andel med högskolebehörighet</th>" +
      "<th scope=\"col\">Betygspoäng</th></tr></thead><tbody>";
    rader.forEach(function (r) {
      t += "<tr><td>" + esc(r.ar) + "</td><td>" + esc(r.antal) + "</td><td>" +
        esc(r.medExamen) + "</td><td>" + visaTal(r.andelExamen, MATT[2]) +
        "</td><td>" + visaTal(r.andelGrundlBehorighet, MATT[3]) +
        "</td><td>" + visaTal(r.betygspoang, HUVUDMATT) + "</td></tr>";
    });
    t += "</tbody>";
    el("tabell-examen").innerHTML = t;
  }

  /* ---------- Avsnitt 5: yrkesprogram mot högskoleförberedande ---------- */

  function ritaTyp() {
    var ar = arsskala();
    var rader = DATA.perTyp;
    if (!rader.length) {
      el("sektion-typ").hidden = true;
      return;
    }
    el("sektion-typ").hidden = false;

    rita("diagram-typ", {
      type: "line",
      data: {
        labels: ar.map(String),
        datasets: rader.map(function (r, i) {
          return {
            label: TYPNAMN[r.typ] || r.typ,
            data: ar.map(function (a) {
              var v = r.varden[String(a)];
              return v ? v.betygspoang : null;
            }),
            antal: ar.map(function (a) {
              var v = r.varden[String(a)];
              return v ? v.antal : null;
            }),
            borderColor: i === 0 ? FARG.blaMork : FARG.bla,
            backgroundColor: i === 0 ? FARG.blaMork : FARG.bla,
            borderWidth: 3,
            pointRadius: 4,
            pointHoverRadius: 7,
            spanGaps: false,
            tension: 0.1
          };
        })
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: true, position: "bottom", labels: { boxWidth: 40 } },
          tooltip: {
            callbacks: {
              title: function (it) { return "Avgångna " + it[0].label; },
              label: function (it) {
                var n = it.dataset.antal ? it.dataset.antal[it.dataIndex] : null;
                return it.dataset.label + ": " + talSv(it.parsed.y, 1) +
                  (n ? " (" + n + " avgångselever)" : "");
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: FARG.baseline },
            ticks: { maxRotation: 0, autoSkipPadding: 8 }
          },
          y: {
            title: { display: true, text: HUVUDMATT.axel, color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            beginAtZero: false,
            grace: "10%",
            ticks: { callback: function (v) { return talSv(v); } }
          }
        }
      }
    }, 380);

    el("kalla-typ").textContent =
      "Genomsnittlig betygspoäng för alla avgångselever i respektive grupp, " +
      "på Aranäs och Elof Lindälv. Varje elev räknas lika mycket.";

    var sista = DATA.ar[DATA.ar.length - 1];
    var html = "";
    var hf = rader.filter(function (r) { return r.typ === "hogskoleforberedande"; })[0];
    var yp = rader.filter(function (r) { return r.typ === "yrkesprogram"; })[0];
    if (hf && yp && hf.varden[String(sista)] && yp.varden[String(sista)]) {
      var a = hf.varden[String(sista)].betygspoang;
      var b = yp.varden[String(sista)].betygspoang;
      var grupperna = talSv(a, 1) + " för de högskoleförberedande programmen och " +
        talSv(b, 1) + " för yrkesprogrammen";
      /* Under ett halvt tiondels poäng skulle skrivas ut som "0,0" – då är
         det ärligare att säga att grupperna ligger lika. */
      html += Math.abs(a - b) < 0.05
        ? "<p>" + esc(sista) + " låg grupperna <strong>i princip lika</strong>: " +
          grupperna + ".</p>"
        : "<p>" + esc(sista) + " skilde det <strong>" + talSv(Math.abs(a - b), 1) +
          " betygspoäng</strong> mellan grupperna: " + grupperna + ".</p>";
      var forsta = DATA.ar[0];
      if (hf.varden[String(forsta)] && yp.varden[String(forsta)]) {
        var gammal = Math.abs(hf.varden[String(forsta)].betygspoang -
          yp.varden[String(forsta)].betygspoang);
        var nu = Math.abs(a - b);
        html += "<p>" + esc(forsta) + " var skillnaden " + talSv(gammal, 1) +
          ". Gapet har alltså " +
          (Math.abs(nu - gammal) < 0.05 ? "hållit sig"
            : nu > gammal ? "vidgats" : "krympt") + ".</p>";
      }
    }
    el("slutsats-typ").innerHTML = html;

    var t = "<caption>Genomsnittlig betygspoäng per programgrupp och år, " +
      "Kungsbacka. Antal avgångselever bakom varje siffra inom parentes.</caption>";
    t += "<thead><tr><th scope=\"col\">År</th>";
    rader.forEach(function (r) {
      t += "<th scope=\"col\">" + esc(TYPNAMN[r.typ] || r.typ) + "</th>";
    });
    t += "</tr></thead><tbody>";
    DATA.ar.forEach(function (a) {
      t += "<tr><td>" + esc(a) + "</td>";
      rader.forEach(function (r) {
        var v = r.varden[String(a)];
        t += "<td>" + (v ? talSv(v.betygspoang, 1) + " (" + esc(v.antal) + ")" : "–") + "</td>";
      });
      t += "</tr>";
    });
    t += "</tbody>";
    el("tabell-typ").innerHTML = t;
  }

  /* ---------- Källor ---------- */

  function initKallor() {
    var html = "";
    DATA.kallor.slice().reverse().forEach(function (k) {
      var lokalFil = sakerUrl(k.lokalFil);
      var kallaUrl = sakerUrl(k.kallaUrl);
      var statistikUrl = sakerUrl(k.statistikUrl);
      html += "<li><span class=\"titel\">" + esc(k.rapportTitel) + "</span>";
      html += "<br><span class=\"undertext\">" + esc(k.kalla) + "</span>";
      html += "<div class=\"lankar\">";
      if (lokalFil) html += "<a href=\"" + lokalFil + "\">Läs filen (CSV)</a>";
      if (kallaUrl) html += "<a href=\"" + kallaUrl + "\">Hämta från Skolverket</a>";
      if (statistikUrl) html += "<a href=\"" + statistikUrl + "\">Skolverkets statistik</a>";
      html += "</div></li>";
    });
    el("lista-kallor").innerHTML = html;
    el("sektion-kallor").hidden = false;
    el("om-uppdaterad").textContent =
      "Statistiken hämtades " + DATA.kallor[DATA.kallor.length - 1].hamtad +
      ". Sidan omfattar " + DATA.kallor.length + " läsår och " +
      DATA.skolor.length + " gymnasieskolor.";
  }

  /* Skolorna räknas upp i klartext, med den kortform som används i
     diagrammens etiketter. */
  function initSkollista() {
    var lista = DATA.skolor.map(function (s) {
      return s.namn === s.kort ? s.namn : s.namn + " (" + s.kort + ")";
    });
    el("lista-skolor").textContent = lista.join(", ") + ".";
  }

  /* ---------- Reglage och start ---------- */

  var fyllValjare = K.fyllValjare;

  function ritaAllt() {
    // Årväljaren visar bara de år som har någon redovisad utbildning i det
    // valda urvalet. Året behålls vid filterbyte om det finns kvar.
    var arVal = el("ar-valjare");
    var tidigare = arVal.value;
    arVal.innerHTML = "";
    fyllValjare(arVal, arMedProgram());
    if (tidigare) arVal.value = tidigare;
    if (!arVal.value && arVal.options.length) arVal.selectedIndex = 0;

    ritaUtveckling();
    ritaRangordning();
    ritaForandring();
  }

  /* ---------- Kort sagt ---------- */

  function initKortSagt() {
    var punkter = [];
    var sam = DATA.sammanfattning;
    var medPoang = sam.filter(function (r) { return r.betygspoang !== null; });
    if (!medPoang.length) return;
    var forsta = medPoang[0], sista = medPoang[medPoang.length - 1];

    punkter.push("Sidan följer <strong>" + DATA.utbildningar.length +
      " utbildningar</strong> på " +
      esc(DATA.skolor.map(function (s) { return s.namn; }).join(" och ")) +
      " genom " + DATA.ar.length + " läsår, " + esc(DATA.ar[0]) +
      "–" + esc(DATA.ar[DATA.ar.length - 1]) + ".");

    var diff = sista.betygspoang - forsta.betygspoang;
    punkter.push("Hela avgångskullens genomsnittliga betygspoäng var " +
      talSv(sista.betygspoang, 1) + " år " + esc(sista.ar) + ", mot " +
      talSv(forsta.betygspoang, 1) + " år " + esc(forsta.ar) + " (" +
      (diff >= 0 ? "+" : "−") + talSv(Math.abs(diff), 1) + " på skalan 0–20).");

    if (sista.andelExamen !== null && forsta.andelExamen !== null) {
      punkter.push("Andelen avgångselever med gymnasieexamen var <strong>" +
        talSv(sista.andelExamen, 1) + " %</strong> år " + esc(sista.ar) +
        ", mot " + talSv(forsta.andelExamen, 1) + " % år " + esc(forsta.ar) + ".");
    }

    var sistaAr = DATA.ar[DATA.ar.length - 1];
    var hf = DATA.perTyp.filter(function (r) { return r.typ === "hogskoleforberedande"; })[0];
    var yp = DATA.perTyp.filter(function (r) { return r.typ === "yrkesprogram"; })[0];
    if (hf && yp && hf.varden[String(sistaAr)] && yp.varden[String(sistaAr)]) {
      var a = hf.varden[String(sistaAr)].betygspoang;
      var b = yp.varden[String(sistaAr)].betygspoang;
      punkter.push(Math.abs(a - b) < 0.05
        ? "Högskoleförberedande program och yrkesprogram låg i princip lika " +
          "i betygspoäng " + esc(sistaAr) + " (" + talSv(a, 1) + " mot " +
          talSv(b, 1) + ", vägt per elev)."
        : "Skillnaden mellan högskoleförberedande program och yrkesprogram " +
          "var <strong>" + talSv(Math.abs(a - b), 1) + " betygspoäng</strong> " +
          esc(sistaAr) + " (" + talSv(a, 1) + " mot " + talSv(b, 1) +
          ", vägt per elev).");
    }

    /* Långsiktiga förändringar per utbildning – bara de med minst tre
       mätår, så att en enskild årskull inte kallas trend. */
    var langa = DATA.utbildningar.filter(function (u) {
      return u.forandring !== null && u.antalArMedPoang >= 3;
    });
    if (langa.length > 1) {
      var upp = langa.slice().sort(function (x, y) { return y.forandring - x.forandring; })[0];
      var ner = langa.slice().sort(function (x, y) { return x.forandring - y.forandring; })[0];
      var text = "";
      if (upp.forandring > 0) {
        text += "Mellan sitt första och sista mätår har <strong>" + esc(upp.namn) +
          "</strong> stigit mest i betygspoäng (+" + talSv(upp.forandring, 1) +
          ")";
      }
      if (ner.forandring < 0) {
        text += (text ? " och " : "Mellan sitt första och sista mätår har ") +
          "<strong>" + esc(ner.namn) + "</strong> sjunkit mest (−" +
          talSv(Math.abs(ner.forandring), 1) + ")";
      }
      if (text) {
        punkter.push(text + " – bland utbildningar med minst tre mätår.");
      }
    }

    K.visaKortSagt(punkter);
  }

  function initMeta() {
    K.visaMeta({
      kalla: "Skolverket, Utbildningsstatistik",
      period: DATA.ar[0] + "–" + DATA.ar[DATA.ar.length - 1],
      senaste: "avgångna " + DATA.ar[DATA.ar.length - 1],
      hamtad: DATA.kallor[DATA.kallor.length - 1].hamtad
    });
  }

  function init(data) {
    DATA = data;
    data.skolor.forEach(function (s) { KORT[s.namn] = s.kort; });

    var gruppVal = el("grupp-valjare");
    fyllValjare(gruppVal, [""], function () { return "Alla program"; });
    ["hogskoleforberedande", "yrkesprogram"].forEach(function (typ) {
      if (data.utbildningar.some(function (u) { return u.typ === typ; })) {
        fyllValjare(gruppVal, [typ], function (t) { return TYPNAMN[t]; });
      }
    });
    K.kopplaValjare(gruppVal, "grupp", ritaAllt);

    var mattVal = el("matt-valjare");
    MATT.forEach(function (m) {
      var o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.namn;
      mattVal.appendChild(o);
    });
    K.kopplaValjare(mattVal, "matt", ritaUtveckling);


    el("valjarrad").hidden = false;

    initKortSagt();
    initMeta();
    ritaAllt();
    /* Årväljarens alternativ finns först nu – koppla den till ?year=
       och rita om ifall adressraden pekade ut ett annat år. */
    var arVal = el("ar-valjare");
    var innan = arVal.value;
    K.kopplaValjare(arVal, "year", ritaRangordning);
    if (arVal.value !== innan) ritaRangordning();
    ritaExamen();
    ritaTyp();
    initSkollista();
    initKallor();
  }

  K.starta("data-slutbetyg.json", {
    tomt: function (data) { return !data.utbildningar || !data.utbildningar.length; },
    tomtText: "Betygsstatistiken håller på att läsas in.",
    init: init
  });
})();
