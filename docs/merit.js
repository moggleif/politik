/* Meritvärden på Kungsbackas gymnasieskolor – läser docs/data-meritvarden.json
   och ritar diagrammen. Skolan väljs en gång längst upp och styr samtliga
   avsnitt; varje avsnitt har därutöver sina egna reglage. */
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
    blaLjus: "#9ec5f4",
    rod: "#e34948"
  };

  /* Kategorisk palett för linjerna. Programmen har ingen inbördes ordning,
     så färgerna får inte heller antyda någon – och de måste gå att skilja åt
     vid färgblindhet. Serier utöver palettens längd upprepar färgerna med
     streckad linje i stället, så att inga två serier ser exakt likadana ut. */
  var PALETT = [
    "#1c5cab", "#e69f00", "#009e73", "#cc79a7",
    "#56b4e9", "#d55e00", "#7a5195", "#6b8f00"
  ];
  var STRECK = [[], [7, 4], [2, 3], [9, 3, 2, 3]];

  function serieStil(i) {
    return {
      farg: PALETT[i % PALETT.length],
      streck: STRECK[Math.floor(i / PALETT.length) % STRECK.length]
    };
  }

  function el(id) { return document.getElementById(id); }

  function talSv(n, dec) {
    return n.toLocaleString("sv-SE", {
      minimumFractionDigits: dec || 0,
      maximumFractionDigits: dec === undefined ? 0 : dec
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

  /* ---------- Gemensamt tillstånd ---------- */

  var DATA = null;
  var valdSkola = null;
  var diagram = {};        // id -> Chart, så att de kan ritas om vid skolbyte

  function rita(id, konf, hojd) {
    var ctx = el(id);
    if (diagram[id]) diagram[id].destroy();
    ctx.parentElement.style.height = hojd + "px";
    diagram[id] = new Chart(ctx, konf);
  }

  /* Alla år mellan första och sista mätår, även de utan mätning. Luckan
     2018–2020 ska synas som en lucka och inte tryckas ihop – linjerna ritas
     med spanGaps: false och bryts därför där. */
  function arsskala() {
    var ar = [];
    for (var a = DATA.ar[0]; a <= DATA.ar[DATA.ar.length - 1]; a++) ar.push(a);
    return ar;
  }

  function utbildningarFor(skola) {
    return DATA.utbildningar.filter(function (u) {
      return u.skola === skola && u.typ !== "introduktion";
    });
  }

  function medelvarde(u, ar) {
    var v = u.varden[String(ar)];
    return v && v.medel !== null ? v.medel : null;
  }

  function inriktningsnamn(u) {
    return u.inriktning || "Utan särskild inriktning";
  }

  /* ---------- Avsnitt 1: utvecklingen program för program ---------- */

  function programlista(skola) {
    var sedda = {};
    utbildningarFor(skola).forEach(function (u) {
      if (u.antalArMedMedel) sedda[u.program] = true;
    });
    return Object.keys(sedda).sort();
  }

  /* Serierna ritas på den nivå läsaren valt: hela program när "alla" är valt,
     annars programmets inriktningar var för sig. Ett program med flera
     inriktningar sammanfattas med ett ovägt medelvärde – rapporterna säger
     inte hur många som antogs på varje inriktning, så något annat vore att
     hitta på en vikt. Antalet inriktningar bakom punkten står i etiketten. */
  function serierUtveckling(skola, program) {
    var ar = arsskala();
    var lista = utbildningarFor(skola);

    if (program) {
      return lista.filter(function (u) {
        return u.program === program && u.antalArMedMedel > 0;
      }).map(function (u) {
        return {
          etikett: inriktningsnamn(u),
          antal: ar.map(function () { return 1; }),
          varden: ar.map(function (a) { return medelvarde(u, a); })
        };
      });
    }

    return programlista(skola).map(function (namn) {
      var ingar = lista.filter(function (u) { return u.program === namn; });
      var antal = [], varden = [];
      ar.forEach(function (a) {
        var v = ingar.map(function (u) { return medelvarde(u, a); })
          .filter(function (x) { return x !== null; });
        antal.push(v.length);
        varden.push(v.length
          ? Math.round(v.reduce(function (s, x) { return s + x; }, 0) / v.length * 100) / 100
          : null);
      });
      return { etikett: namn, antal: antal, varden: varden };
    });
  }

  function ritaUtveckling() {
    var program = el("program-valjare").value;
    var ar = arsskala();
    var serier = serierUtveckling(valdSkola, program).filter(function (s) {
      return s.varden.some(function (v) { return v !== null; });
    });

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
            borderColor: stil.farg,
            backgroundColor: stil.farg,
            borderDash: stil.streck,
            borderWidth: 2.5,
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
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { display: true, position: "bottom", labels: { boxWidth: 40 } },
          tooltip: {
            callbacks: {
              title: function (it) { return "År " + it[0].label; },
              label: function (it) {
                var n = it.dataset.antal ? it.dataset.antal[it.dataIndex] : 1;
                return it.dataset.label + ": " + talSv(it.parsed.y, 1) +
                  (n > 1 ? " (snitt av " + n + " inriktningar)" : "");
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
            title: { display: true, text: "Medelmeritvärde", color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            beginAtZero: false,
            grace: "8%",
            ticks: { callback: function (v) { return talSv(v); } }
          }
        }
      }
    }, Math.max(420, 300 + serier.length * 12));

    el("kalla-utveckling").textContent =
      "Medelmeritvärdet för de antagna eleverna, slutantagningen. Högsta möjliga " +
      "meritvärde är 340. Åren 2018–2020 saknas rapporter, därav luckan.";

    ritaSlutsatsUtveckling(serier, program);
    ritaTabellUtveckling();
  }

  function ritaSlutsatsUtveckling(serier, program) {
    var ar = arsskala();
    var forsta = DATA.ar[0], sista = DATA.ar[DATA.ar.length - 1];

    /* Bara serier som finns både första och sista året går att jämföra över
       hela perioden. Övriga har startat eller lagts ned däremellan. */
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
      html += "<p><strong>" + sista + "</strong> hade " + hogst.etikett +
        " högst medelmeritvärde på " + valdSkola + " (" + talSv(hogst.v, 1) + ")";
      if (senast.length > 1) {
        html += " och " + lagst.etikett + " lägst (" + talSv(lagst.v, 1) + ").";
      } else {
        html += ".";
      }
      html += "</p>";
    }

    if (helaPerioden.length) {
      helaPerioden.sort(function (a, b) { return b.diff - a.diff; });
      var upp = helaPerioden[0], ner = helaPerioden[helaPerioden.length - 1];
      var stigande = helaPerioden.filter(function (r) { return r.diff > 0; }).length;
      html += "<p>Av de " + helaPerioden.length + " " +
        (program ? "inriktningar" : "program") + " som finns med både " +
        forsta + " och " + sista + " har <strong>" + stigande +
        "</strong> högre medelmeritvärde i dag än då.";
      if (upp.diff > 0) {
        html += " Mest har " + upp.etikett + " stigit: " +
          talSv(upp.forsta, 1) + " till " + talSv(upp.sista, 1) + " (+" +
          talSv(upp.diff, 1) + ").";
      }
      if (ner.diff < 0) {
        html += " Mest har " + ner.etikett + " sjunkit: " +
          talSv(ner.forsta, 1) + " till " + talSv(ner.sista, 1) + " (−" +
          talSv(Math.abs(ner.diff), 1) + ").";
      }
      html += "</p>";
    }

    html += "<p><strong>Läs med försiktighet:</strong> ett medelmeritvärde " +
      "bygger på de elever som antogs, och en utbildning med få platser kan " +
      "svänga kraftigt mellan åren av rena tillfälligheter. Rapporterna " +
      "redovisar inte hur många som antogs, så hur tungt varje punkt väger " +
      "går inte att se.</p>";

    el("slutsats-utveckling").innerHTML = html;
  }

  function ritaTabellUtveckling() {
    var ar = DATA.ar;
    var lista = utbildningarFor(valdSkola).filter(function (u) {
      return u.antalArMedMedel > 0;
    });
    var t = "<caption>Medelmeritvärde per utbildning och år, " + valdSkola +
      ". Tomt fält betyder att utbildningen inte fanns eller att ingen " +
      "antogs det året.</caption>";
    t += "<thead><tr><th scope=\"col\">Utbildning</th>";
    ar.forEach(function (a) { t += "<th scope=\"col\">" + a + "</th>"; });
    t += "</tr></thead><tbody>";
    lista.forEach(function (u) {
      t += "<tr><td>" + u.namn + "</td>";
      ar.forEach(function (a) {
        var v = medelvarde(u, a);
        t += "<td>" + (v === null ? "–" : talSv(v, 1)) + "</td>";
      });
      t += "</tr>";
    });
    t += "</tbody>";
    el("tabell-utveckling").innerHTML = t;
  }

  /* ---------- Avsnitt 2: rangordning ett enskilt år ---------- */

  function ritaRangordning() {
    var valtAr = Number(el("ar-valjare").value);
    var rader = utbildningarFor(valdSkola).map(function (u) {
      var v = u.varden[String(valtAr)];
      return (v && v.medel !== null) ? { u: u, v: v } : null;
    }).filter(Boolean);
    rader.sort(function (a, b) { return b.v.medel - a.v.medel; });

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
          data: rader.map(function (r) { return r.v.medel; }),
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
                var rad = ["Medelmeritvärde: " + talSv(r.v.medel, 1)];
                if (r.v.poang !== null) {
                  rad.push("Sist antagna elev: " + talSv(r.v.poang, 1));
                }
                if (r.v.kod === "1") {
                  rad.push("Alla behöriga sökande antogs");
                } else if (r.v.utanPlatser === true) {
                  rad.push("Inga lediga platser kvar");
                } else if (r.v.utanPlatser === false) {
                  rad.push("Lediga platser fanns kvar");
                }
                rad.push(r.u.typ === "hogskoleforberedande"
                  ? "Högskoleförberedande program" : "Yrkesprogram");
                return rad;
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: "Medelmeritvärde", color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            beginAtZero: true,
            max: 340,
            ticks: { callback: function (v) { return talSv(v); } }
          },
          y: { grid: { display: false }, border: { color: FARG.baseline } }
        }
      }
    }, Math.max(260, rader.length * 30 + 90));

    el("kalla-rangordning").textContent =
      "Mörk stapel = högskoleförberedande program, ljus = yrkesprogram. " +
      "Skalan går till 340, som är högsta möjliga meritvärde.";

    var hogst = rader[0], lagst = rader[rader.length - 1];
    var html = "<p>Högst medelmeritvärde " + valtAr + " hade <strong>" +
      hogst.u.namn + "</strong> (" + talSv(hogst.v.medel, 1) + "), lägst <strong>" +
      lagst.u.namn + "</strong> (" + talSv(lagst.v.medel, 1) + "). Skillnaden är " +
      talSv(hogst.v.medel - lagst.v.medel, 1) + " meritpoäng.</p>";
    var sammanfattning = DATA.sammanfattning.filter(function (s) {
      return s.skola === valdSkola && s.ar === valtAr;
    })[0];
    if (sammanfattning) {
      html += "<p>Genomsnittet för skolans " + sammanfattning.antal +
        " utbildningar var " + talSv(sammanfattning.medel, 1) +
        ". Det är ett ovägt genomsnitt: varje utbildning räknas lika mycket, " +
        "oavsett hur många elever som antogs.</p>";
    }
    el("slutsats-rangordning").innerHTML = html;

    var t = "<caption>Meritvärden vid slutantagningen " + valtAr + ", " +
      valdSkola + ".</caption>";
    t += "<thead><tr><th scope=\"col\">Utbildning</th>" +
      "<th scope=\"col\">Medelmeritvärde</th>" +
      "<th scope=\"col\">Sist antagna elev</th></tr></thead><tbody>";
    rader.forEach(function (r) {
      var grans = r.v.poang !== null ? talSv(r.v.poang, 1)
        : (r.v.kod === "1" ? "alla antagna" : "–");
      t += "<tr><td>" + r.u.namn + "</td><td>" + talSv(r.v.medel, 1) +
        "</td><td>" + grans + "</td></tr>";
    });
    t += "</tbody>";
    el("tabell-rangordning").innerHTML = t;
  }

  /* ---------- Avsnitt 3: förändring över mätperioden ---------- */

  function ritaForandring() {
    var rader = utbildningarFor(valdSkola).filter(function (u) {
      return u.forandring !== null && u.antalArMedMedel >= 2;
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
                return [
                  u.forstaAr + ": " + talSv(u.forsta, 1),
                  u.sistaAr + ": " + talSv(u.sista, 1),
                  (u.forandring >= 0 ? "Upp " : "Ner ") +
                    talSv(Math.abs(u.forandring), 1) + " meritpoäng"
                ];
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Förändring i medelmeritvärde, första till sista mätår",
              color: FARG.muted
            },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            ticks: { callback: function (v) { return (v > 0 ? "+" : "") + talSv(v); } }
          },
          y: { grid: { display: false }, border: { color: FARG.baseline } }
        }
      }
    }, Math.max(260, rader.length * 30 + 100));

    el("kalla-forandring").textContent =
      "Blå stapel = högre meritvärde än vid första mätåret, röd = lägre. " +
      "Färgen visar bara riktningen, inte om utvecklingen är bra eller dålig.";

    var upp = rader.filter(function (u) { return u.forandring > 0; }).length;
    var ner = rader.filter(function (u) { return u.forandring < 0; }).length;
    var html = "<p><strong>" + upp + " av " + rader.length +
      "</strong> utbildningar på " + valdSkola +
      " har högre medelmeritvärde vid sitt sista mätår än vid sitt första, " +
      ner + " har lägre.</p>";
    var kortaste = rader.filter(function (u) { return u.antalArMedMedel === 2; }).length;
    if (kortaste) {
      html += "<p><strong>Läs med försiktighet:</strong> " + kortaste +
        " av utbildningarna har bara två mätår. Då är &rdquo;förändringen&rdquo; " +
        "skillnaden mellan två enskilda årskullar, inte en trend.</p>";
    }
    el("slutsats-forandring").innerHTML = html;

    var t = "<caption>Förändring i medelmeritvärde per utbildning, " +
      valdSkola + ".</caption>";
    t += "<thead><tr><th scope=\"col\">Utbildning</th><th scope=\"col\">Första mätåret</th>" +
      "<th scope=\"col\">Sista mätåret</th><th scope=\"col\">Förändring</th>" +
      "<th scope=\"col\">Antal mätår</th></tr></thead><tbody>";
    rader.forEach(function (u) {
      t += "<tr><td>" + u.namn + "</td><td>" + u.forstaAr + ": " + talSv(u.forsta, 1) +
        "</td><td>" + u.sistaAr + ": " + talSv(u.sista, 1) + "</td><td>" +
        (u.forandring >= 0 ? "+" : "−") + talSv(Math.abs(u.forandring), 1) +
        "</td><td>" + u.antalArMedMedel + "</td></tr>";
    });
    t += "</tbody>";
    el("tabell-forandring").innerHTML = t;
  }

  /* ---------- Avsnitt 4: konkurrensen om platserna ---------- */

  function ritaKonkurrens() {
    var rader = DATA.sammanfattning.filter(function (s) { return s.skola === valdSkola; });
    if (!rader.length) {
      el("sektion-konkurrens").hidden = true;
      return;
    }
    el("sektion-konkurrens").hidden = false;

    rita("diagram-konkurrens", {
      type: "bar",
      data: {
        labels: rader.map(function (r) { return String(r.ar); }),
        datasets: [
          {
            label: "Fler behöriga sökande än platser",
            data: rader.map(function (r) { return r.medGrans; }),
            backgroundColor: FARG.blaMork,
            maxBarThickness: 44
          },
          {
            label: "Alla behöriga sökande fick plats",
            data: rader.map(function (r) { return r.allaAntagna; }),
            backgroundColor: FARG.blaLjus,
            maxBarThickness: 44
          },
          {
            label: "Ingen antagning på betyg",
            data: rader.map(function (r) { return r.ovrigt; }),
            backgroundColor: FARG.baseline,
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
              title: function (it) { return "Slutantagningen " + it[0].label; },
              label: function (it) {
                return it.dataset.label + ": " + it.parsed.y + " av " +
                  rader[it.dataIndex].antalUtbildningar + " utbildningar";
              }
            }
          }
        },
        scales: {
          x: { stacked: true, grid: { display: false }, border: { color: FARG.baseline } },
          y: {
            stacked: true,
            title: { display: true, text: "Antal utbildningar", color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            beginAtZero: true,
            ticks: { precision: 0 }
          }
        }
      }
    }, 380);

    el("kalla-konkurrens").textContent =
      "Grå del: utbildningar som antog på färdighetsprov, saknade behöriga " +
      "sökande eller placerades manuellt.";

    var forsta = rader[0], sista = rader[rader.length - 1];
    function andel(r) { return Math.round(100 * r.medGrans / r.antalUtbildningar); }
    var html = "<p>" + sista.ar + " hade <strong>" + sista.medGrans + " av " +
      sista.antalUtbildningar + "</strong> utbildningar på " + valdSkola +
      " fler behöriga sökande än platser (" + andel(sista) + " procent). " +
      forsta.ar + " var det " + forsta.medGrans + " av " +
      forsta.antalUtbildningar + " (" + andel(forsta) + " procent).</p>";

    /* Två rapportformer bakom samma stapel – det måste läsaren veta om. */
    var bytesAr = rader.filter(function (r) { return r.markor === "fetstil"; });
    if (bytesAr.length && bytesAr.length < rader.length) {
      html += "<p><strong>Jämför med urskillning:</strong> rapporterna säger " +
        "detta på två olika sätt. Till och med " +
        rader[rader.length - bytesAr.length - 1].ar + " skrevs fotnoten " +
        "&rdquo;alla behöriga sökande är antagna&rdquo; i stället för en " +
        "antagningspoäng. Från " + bytesAr[0].ar + " skrivs poängen alltid ut, " +
        "och de utbildningar som saknade lediga platser markeras i stället med " +
        "fet stil. Måtten är varandras spegelbild, men inte exakt samma sak: " +
        "en utbildning där de behöriga sökande precis fyllde platserna räknas " +
        "åt olika håll före och efter bytet.</p>";
    }
    el("slutsats-konkurrens").innerHTML = html;

    var t = "<caption>Utbildningarnas antagningsläge per år, " + valdSkola +
      ".</caption>";
    t += "<thead><tr><th scope=\"col\">År</th>" +
      "<th scope=\"col\">Fler sökande än platser</th>" +
      "<th scope=\"col\">Alla behöriga fick plats</th>" +
      "<th scope=\"col\">Ingen antagning på betyg</th>" +
      "<th scope=\"col\">Totalt</th></tr></thead><tbody>";
    rader.forEach(function (r) {
      t += "<tr><td>" + r.ar + "</td><td>" + r.medGrans + "</td><td>" +
        r.allaAntagna + "</td><td>" + r.ovrigt + "</td><td>" +
        r.antalUtbildningar + "</td></tr>";
    });
    t += "</tbody>";
    el("tabell-konkurrens").innerHTML = t;
  }

  /* ---------- Avsnitt 5: yrkesprogram mot högskoleförberedande ---------- */

  var TYPNAMN = {
    hogskoleforberedande: "Högskoleförberedande program",
    yrkesprogram: "Yrkesprogram"
  };

  function ritaTyp() {
    var ar = arsskala();
    var rader = DATA.perTyp.filter(function (r) { return r.skola === valdSkola; });
    if (rader.length < 1) {
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
              return v ? v.medel : null;
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
              title: function (it) { return "År " + it[0].label; },
              label: function (it) {
                var n = it.dataset.antal ? it.dataset.antal[it.dataIndex] : null;
                return it.dataset.label + ": " + talSv(it.parsed.y, 1) +
                  (n ? " (" + n + " utbildningar)" : "");
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
            title: { display: true, text: "Medelmeritvärde", color: FARG.muted },
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
      "Genomsnitt av utbildningarnas medelmeritvärden i respektive grupp, " +
      "slutantagningen. Varje utbildning räknas lika mycket.";

    var sista = DATA.ar[DATA.ar.length - 1];
    var html = "";
    var hf = rader.filter(function (r) { return r.typ === "hogskoleforberedande"; })[0];
    var yp = rader.filter(function (r) { return r.typ === "yrkesprogram"; })[0];
    if (hf && yp && hf.varden[String(sista)] && yp.varden[String(sista)]) {
      var a = hf.varden[String(sista)].medel, b = yp.varden[String(sista)].medel;
      html += "<p>" + sista + " skilde det <strong>" + talSv(Math.abs(a - b), 1) +
        " meritpoäng</strong> mellan grupperna på " + valdSkola + ": " +
        talSv(a, 1) + " för de högskoleförberedande programmen och " +
        talSv(b, 1) + " för yrkesprogrammen.</p>";
      var forsta = DATA.ar[0];
      if (hf.varden[String(forsta)] && yp.varden[String(forsta)]) {
        var gammal = hf.varden[String(forsta)].medel - yp.varden[String(forsta)].medel;
        html += "<p>" + forsta + " var skillnaden " + talSv(Math.abs(gammal), 1) +
          ". Gapet har alltså " +
          (Math.abs(a - b) > Math.abs(gammal) ? "vidgats" : "krympt") + ".</p>";
      }
    } else {
      html += "<p>Skolan har bara utbildningar i den ena gruppen de här åren.</p>";
    }
    el("slutsats-typ").innerHTML = html;

    var t = "<caption>Medelmeritvärde per programgrupp och år, " + valdSkola +
      ". Antal utbildningar bakom varje siffra inom parentes.</caption>";
    t += "<thead><tr><th scope=\"col\">År</th>";
    rader.forEach(function (r) {
      t += "<th scope=\"col\">" + (TYPNAMN[r.typ] || r.typ) + "</th>";
    });
    t += "</tr></thead><tbody>";
    DATA.ar.forEach(function (a) {
      t += "<tr><td>" + a + "</td>";
      rader.forEach(function (r) {
        var v = r.varden[String(a)];
        t += "<td>" + (v ? talSv(v.medel, 1) + " (" + v.antal + ")" : "–") + "</td>";
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
      html += "<li><span class=\"titel\">" + k.rapportTitel + "</span>";
      html += "<br><span class=\"undertext\">" + k.kalla + "</span>";
      html += "<div class=\"lankar\">";
      if (k.lokalPdf) html += "<a href=\"" + k.lokalPdf + "\">Läs rapporten (PDF)</a>";
      if (k.kallaUrl) html += "<a href=\"" + k.kallaUrl + "\">Original hos källan</a>";
      if (k.arkivUrl) html += "<a href=\"" + k.arkivUrl + "\">Arkiverad kopia</a>";
      html += "</div></li>";
    });
    el("lista-kallor").innerHTML = html;
    el("sektion-kallor").hidden = false;
    el("om-uppdaterad").textContent =
      "Rapporterna hämtades " + DATA.kallor[0].hamtad + ". Sidan omfattar " +
      DATA.kallor.length + " årgångar av slutantagningen.";
  }

  /* ---------- Reglage och start ---------- */

  function fyllValjare(valjare, varden, etikett) {
    varden.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v;
      o.textContent = etikett ? etikett(v) : v;
      valjare.appendChild(o);
    });
  }

  function ritaAllt() {
    var programVal = el("program-valjare");
    var tidigare = programVal.value;
    programVal.innerHTML = "";
    fyllValjare(programVal, [""], function () { return "Alla program"; });
    fyllValjare(programVal, programlista(valdSkola));
    // Behåll programvalet vid skolbyte om skolan har samma program
    programVal.value = tidigare;
    if (!programVal.value) programVal.value = "";

    ritaUtveckling();
    ritaRangordning();
    ritaForandring();
    ritaKonkurrens();
    ritaTyp();
  }

  function init(data) {
    DATA = data;
    valdSkola = data.skolor[0].namn;

    var skolVal = el("skol-valjare");
    fyllValjare(skolVal, data.skolor.map(function (s) { return s.namn; }));
    skolVal.addEventListener("change", function () {
      valdSkola = skolVal.value;
      ritaAllt();
    });

    var arVal = el("ar-valjare");
    fyllValjare(arVal, data.ar.slice().reverse());
    arVal.addEventListener("change", ritaRangordning);

    el("program-valjare").addEventListener("change", ritaUtveckling);

    el("valjarrad").hidden = false;
    el("sektion-utveckling").hidden = false;

    ritaAllt();
    initKallor();
  }

  fetch("data-meritvarden.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      installChartDefaults();
      if (!data.utbildningar || !data.utbildningar.length) {
        visaStatus("<strong>Datat är inte på plats ännu.</strong> " +
          "Antagningsstatistiken håller på att läsas in. Titta gärna tillbaka snart.");
        return;
      }
      init(data);
    })
    .catch(function (fel) {
      visaStatus("<strong>Kunde inte läsa in datat.</strong> Tekniskt fel: " + fel.message);
    });
})();
