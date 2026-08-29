/* Meritvärden på Kungsbackas gymnasieskolor – läser docs/data-meritvarden.json
   och ritar diagrammen. Enheten är programmet, inte skolan: kommunen flyttar
   program mellan sina två gymnasieskolor, och en serie per skola skulle brytas
   av en organisationsförändring i stället för av att utbildningen ändrats.
   Skolan skrivs bara ut när samma program gått på båda skolorna samma år. */
(function () {
  "use strict";

  /* Färger, kategorisk palett (validerad för färgblindhet), talformat
     och diagraminställningar delas med de andra sidorna via gemensam.js.
     Serierna skiljs inte bara med färg utan också med punktform, och
     efter åtta serier med streckning. */
  var K = window.KIS;
  var FARG = K.FARG;
  var serieStil = K.serieStil;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;
  var sakerUrl = K.sakerUrl;

  /* ---------- Gemensamt ---------- */

  var DATA = null;
  var rita = K.rita;

  /* Årsskalan och de år som saknar rapport delas med slutbetygssidan via
     gemensam.js; wrapparna skickar in sidans egen årslista. */
  function arsskala() { return K.arsskala(DATA.ar); }

  function saknadeAr() { return K.saknadeAr(DATA.ar); }

  function saknadeArText() { return K.saknadeArText(DATA.ar); }

  /* Alla utbildningar på de nationella programmen, båda skolorna. */
  function nationella() {
    return DATA.utbildningar.filter(function (u) { return u.typ !== "introduktion"; });
  }

  /* Program som gått på båda skolorna samma år har fler än en serie. Bara då
     behöver skolans namn skrivas ut – annars säger det inget läsaren behöver. */
  function delatProgram(namn) {
    var n = 0;
    DATA.program.forEach(function (p) { if (p.namn === namn) n++; });
    return n > 1;
  }

  function utbildningsetikett(u) {
    return u.namn + (delatProgram(u.program) ? " (" + u.skolaKort + ")" : "");
  }

  /* ---------- Avsnitt 1: utvecklingen program för program ---------- */

  function serierUtveckling(valdEtikett) {
    var ar = arsskala();

    if (valdEtikett) {
      var serie = DATA.program.filter(function (p) {
        return p.etikett === valdEtikett;
      })[0];
      if (!serie) return [];
      return serie.inriktningar.map(function (i) {
        return {
          etikett: i.namn,
          varden: ar.map(function (a) {
            var v = i.varden[String(a)];
            return v ? v.medel : null;
          }),
          antal: ar.map(function (a) {
            var v = i.varden[String(a)];
            return v ? v.antal : null;
          }),
          skola: ar.map(function (a) {
            var v = i.varden[String(a)];
            return v ? v.skola : null;
          }),
          /* Inriktningar har bytt namn – visa vad den hette just det året */
          aretsnamn: ar.map(function (a) {
            var v = i.varden[String(a)];
            return v && v.daNamn ? v.daNamn.join(" och ") : null;
          })
        };
      });
    }

    return DATA.program.map(function (p) {
      return {
        etikett: p.etikett,
        varden: ar.map(function (a) {
          var v = p.varden[String(a)];
          return v ? v.medel : null;
        }),
        antal: ar.map(function (a) {
          var v = p.varden[String(a)];
          return v ? v.antal : null;
        }),
        skola: ar.map(function (a) {
          var v = p.varden[String(a)];
          return v ? v.skola : null;
        }),
        aretsnamn: ar.map(function (a) {
          var v = p.varden[String(a)];
          return v && v.namn ? v.namn : null;
        })
      };
    });
  }

  function ritaUtveckling() {
    var valt = el("program-valjare").value;
    var ar = arsskala();
    var serier = serierUtveckling(valt).filter(function (s) {
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
            skola: s.skola,
            aretsnamn: s.aretsnamn,
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
              title: function (it) { return "År " + it[0].label; },
              label: function (it) {
                var i = it.dataIndex, d = it.dataset;
                var rader = [d.label + ": " + talSv(it.parsed.y, 1)];
                if (d.aretsnamn && d.aretsnamn[i]) {
                  rader.push("Hette då " + d.aretsnamn[i]);
                }
                if (d.skola && d.skola[i]) rader.push(d.skola[i]);
                if (d.antal && d.antal[i] > 1) {
                  rader.push("Snitt av " + d.antal[i] + " inriktningar");
                }
                return rader;
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
    }, Math.max(440, 320 + serier.length * 14));

    /* Många linjer: peka på en linje eller ett namn i teckenförklaringen
       så tonas de övriga ned. */
    if (serier.length >= 3) K.aktiveraToning(K.diagramFor("diagram-utveckling"));

    el("kalla-utveckling").textContent =
      "Medelmeritvärdet för de antagna eleverna, slutantagningen. Högsta möjliga " +
      "meritvärde är 340." + saknadeArText() +
      (serier.length > 3
        ? " Peka på ett namn i teckenförklaringen så tonas de andra linjerna " +
          "ned; klicka för att dölja linjen."
        : "");

    var saknas = saknadeAr();
    K.sattDataNot("not-utveckling", saknas.length
      ? "<p>" + (saknas.length === 1 ? "Året " : "Åren ") +
        "<strong>" + esc(saknas.join(", ")) + "</strong> saknar rapport och " +
        "linjerna bryts där. Varför rapporten inte går att få tag på " +
        "beskrivs under <a href=\"#sektion-om\">Om den här sidan</a>.</p>"
      : "");

    ritaSlutsatsUtveckling(serier, valt);
    ritaTabellUtveckling(valt);
  }

  function ritaSlutsatsUtveckling(serier, valt) {
    var ar = arsskala();
    var forsta = DATA.ar[0], sista = DATA.ar[DATA.ar.length - 1];

    /* Bara serier som finns både första och sista året går att jämföra över
       hela perioden. Övriga har startat eller lagts ned däremellan. */
    var helaPerioden = serier.map(function (s) {
      var a = s.varden[ar.indexOf(forsta)], b = s.varden[ar.indexOf(sista)];
      return (a !== null && b !== null)
        ? { etikett: s.etikett, forsta: a, sista: b, diff: b - a } : null;
    }).filter(Boolean);

    var senast = serier.map(function (s) {
      var v = s.varden[ar.indexOf(sista)];
      return v === null ? null : { etikett: s.etikett, v: v };
    }).filter(Boolean);

    var html = "";
    if (senast.length) {
      var hogst = senast[0], lagst = senast[senast.length - 1];
      html += "<p><strong>" + esc(sista) + "</strong> hade " + esc(hogst.etikett) +
        " högst medelmeritvärde (" + talSv(hogst.v, 1) + ")";
      html += senast.length > 1
        ? " och " + esc(lagst.etikett) + " lägst (" + talSv(lagst.v, 1) + ").</p>"
        : ".</p>";
    }

    if (helaPerioden.length) {
      helaPerioden.sort(function (a, b) { return b.diff - a.diff; });
      var upp = helaPerioden[0], ner = helaPerioden[helaPerioden.length - 1];
      var stigande = helaPerioden.filter(function (r) { return r.diff > 0; }).length;
      if (helaPerioden.length === 1) {
        html += "<p>" + (valt ? "Den enda inriktningen" : "Det enda programmet") +
          " som finns med både " + esc(forsta) + " och " + esc(sista) + " har " +
          (stigande ? "<strong>högre</strong>" : "<strong>lägre</strong>") +
          " medelmeritvärde i dag än då.";
      } else {
        html += "<p>Av de " + helaPerioden.length + " " +
          (valt ? "inriktningar" : "program") + " som finns med både " +
          esc(forsta) + " och " + esc(sista) + " har <strong>" + stigande +
          "</strong> högre medelmeritvärde i dag än då.";
      }
      if (helaPerioden.length > 1 && upp.diff > 0) {
        html += " Mest har " + esc(upp.etikett) + " stigit: " +
          talSv(upp.forsta, 1) + " till " + talSv(upp.sista, 1) + " (+" +
          talSv(upp.diff, 1) + ").";
      }
      if (helaPerioden.length > 1 && ner.diff < 0) {
        html += " Mest har " + esc(ner.etikett) + " sjunkit: " +
          talSv(ner.forsta, 1) + " till " + talSv(ner.sista, 1) + " (−" +
          talSv(Math.abs(ner.diff), 1) + ").";
      }
      html += "</p>";
    }

    html += "<p><strong>Läs med försiktighet:</strong> ett medelmeritvärde " +
      "bygger på de elever som antogs, och ett program med få platser kan " +
      "svänga kraftigt mellan åren av rena tillfälligheter. Rapporterna " +
      "redovisar inte hur många som antogs, så hur tungt varje punkt väger " +
      "går inte att se.</p>";

    el("slutsats-utveckling").innerHTML = html;
  }

  function ritaTabellUtveckling(valt) {
    var ar = DATA.ar;
    var rader = DATA.program;
    var t;

    if (valt) {
      var serie = DATA.program.filter(function (p) { return p.etikett === valt; })[0];
      var bytt = serie.inriktningar.filter(function (i) {
        return i.tidigareNamn.length;
      }).map(function (i) {
        return " " + esc(i.namn) + " hette tidigare " + esc(i.tidigareNamn.join(" och ")) + ".";
      }).join("");
      t = "<caption>Medelmeritvärde per inriktning och år, " + esc(valt) +
        ". Tomt fält betyder att inriktningen inte fanns eller att ingen " +
        "antogs det året." + bytt + "</caption>";
      t += "<thead><tr><th scope=\"col\">Inriktning</th>";
      ar.forEach(function (a) { t += "<th scope=\"col\">" + esc(a) + "</th>"; });
      t += "</tr></thead><tbody>";
      serie.inriktningar.forEach(function (i) {
        t += "<tr><td>" + esc(i.namn) + "</td>";
        ar.forEach(function (a) {
          var v = i.varden[String(a)];
          t += "<td>" + (v ? talSv(v.medel, 1) : "–") + "</td>";
        });
        t += "</tr>";
      });
      t += "</tbody>";
    } else {
      /* Skolan står redan i etiketten för de program som gått parallellt.
         Bokstaven behövs bara för ett program som bytt hus mitt i serien. */
      var flyttade = rader.filter(function (p) { return p.skolor.length > 1; });
      t = "<caption>Medelmeritvärde per program och år." +
        (flyttade.length
          ? " Bokstaven visar vilken skola som hade programmet det året: " +
            "A = Aranäsgymnasiet, E = Elof Lindälvs gymnasium."
          : "") +
        " Tomt fält betyder att programmet inte fanns eller att ingen antogs " +
        "det året." + namnbytesText() + "</caption>";
      t += "<thead><tr><th scope=\"col\">Program</th>";
      ar.forEach(function (a) { t += "<th scope=\"col\">" + esc(a) + "</th>"; });
      t += "</tr></thead><tbody>";
      rader.forEach(function (p) {
        t += "<tr><td>" + esc(p.etikett) + "</td>";
        var visaSkola = p.skolor.length > 1;
        ar.forEach(function (a) {
          var v = p.varden[String(a)];
          t += "<td>" + (v
            ? talSv(v.medel, 1) + (visaSkola ? " " + esc(v.skola.charAt(0)) : "")
            : "–") + "</td>";
        });
        t += "</tr>";
      });
      t += "</tbody>";
    }
    el("tabell-utveckling").innerHTML = t;
  }

  /* Program som bytt namn under perioden. Skrivs ut i klartext, med det år
     det gamla namnet användes sista gången. */
  function namnbytesText() {
    var texter = DATA.program.filter(function (p) {
      return p.tidigareNamn && p.tidigareNamn.length;
    }).map(function (p) {
      var sistaAret = Object.keys(p.varden).filter(function (a) {
        return p.varden[a].namn;
      }).sort().pop();
      return " " + esc(p.namn) + " hette " + esc(p.tidigareNamn.join(" och ")) +
        " till och med " + esc(sistaAret) + ".";
    });
    return texter.join("");
  }

  /* ---------- Avsnitt 2: rangordning ett enskilt år ---------- */

  function ritaRangordning() {
    var valtAr = Number(el("ar-valjare").value);
    var rader = nationella().map(function (u) {
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
        labels: rader.map(function (r) { return utbildningsetikett(r.u); }),
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
                if (r.v.namn) rad.push("Hette då " + r.v.namn);
                if (r.u.inriktningNu && r.u.inriktningNu !== r.u.inriktning) {
                  rad.push("Heter i dag " + r.u.inriktningNu);
                }
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
                rad.push(r.u.skola);
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
            max: DATA.meritMax || 340,
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
      esc(utbildningsetikett(hogst.u)) + "</strong> (" + talSv(hogst.v.medel, 1) +
      ") på " + esc(hogst.u.skola) + ", lägst <strong>" + esc(utbildningsetikett(lagst.u)) +
      "</strong> (" + talSv(lagst.v.medel, 1) + ") på " + esc(lagst.u.skola) +
      ". Skillnaden är " + talSv(hogst.v.medel - lagst.v.medel, 1) +
      " meritpoäng.</p>";
    var sammanfattning = DATA.sammanfattning.filter(function (s) {
      return s.ar === valtAr;
    })[0];
    if (sammanfattning) {
      html += "<p>Genomsnittet för kommunens " + esc(sammanfattning.antal) +
        " utbildningar var " + talSv(sammanfattning.medel, 1) +
        ". Det är ett ovägt genomsnitt: varje utbildning räknas lika mycket, " +
        "oavsett hur många elever som antogs.</p>";
    }
    el("slutsats-rangordning").innerHTML = html;

    var t = "<caption>Meritvärden vid slutantagningen " + valtAr +
      ", båda gymnasieskolorna.</caption>";
    t += "<thead><tr><th scope=\"col\">Utbildning</th><th scope=\"col\">Skola</th>" +
      "<th scope=\"col\">Medelmeritvärde</th>" +
      "<th scope=\"col\">Sist antagna elev</th></tr></thead><tbody>";
    rader.forEach(function (r) {
      var grans = r.v.poang !== null ? talSv(r.v.poang, 1)
        : (r.v.kod === "1" ? "alla antagna" : "–");
      t += "<tr><td>" + esc(r.u.namn) + "</td><td>" + esc(r.u.skolaKort) + "</td><td>" +
        talSv(r.v.medel, 1) + "</td><td>" + grans + "</td></tr>";
    });
    t += "</tbody>";
    el("tabell-rangordning").innerHTML = t;
  }

  /* ---------- Avsnitt 3: förändring över mätperioden ---------- */

  function ritaForandring() {
    var rader = DATA.program.filter(function (p) {
      return p.forandring !== null && p.antalArMedMedel >= 2;
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
        labels: rader.map(function (p) { return p.etikett; }),
        datasets: [{
          data: rader.map(function (p) { return p.forandring; }),
          backgroundColor: rader.map(function (p) {
            return p.forandring >= 0 ? FARG.bla : FARG.rod;
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
                var p = rader[it.dataIndex];
                return [
                  p.forstaAr + ": " + talSv(p.forsta, 1),
                  p.sistaAr + ": " + talSv(p.sista, 1),
                  (p.forandring >= 0 ? "Upp " : "Ner ") +
                    talSv(Math.abs(p.forandring), 1) + " meritpoäng"
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

    var upp = rader.filter(function (p) { return p.forandring > 0; }).length;
    var ner = rader.filter(function (p) { return p.forandring < 0; }).length;
    var html = "<p><strong>" + upp + " av " + rader.length +
      "</strong> program har högre medelmeritvärde vid sitt sista mätår än " +
      "vid sitt första, " + ner + " har lägre.</p>";
    var kortaste = rader.filter(function (p) { return p.antalArMedMedel === 2; }).length;
    if (kortaste) {
      html += "<p><strong>Läs med försiktighet:</strong> " + kortaste +
        " av programmen har bara två mätår. Då är &rdquo;förändringen&rdquo; " +
        "skillnaden mellan två enskilda årskullar, inte en trend.</p>";
    }
    el("slutsats-forandring").innerHTML = html;

    var t = "<caption>Förändring i medelmeritvärde per program.</caption>";
    t += "<thead><tr><th scope=\"col\">Program</th><th scope=\"col\">Första mätåret</th>" +
      "<th scope=\"col\">Sista mätåret</th><th scope=\"col\">Förändring</th>" +
      "<th scope=\"col\">Antal mätår</th></tr></thead><tbody>";
    rader.forEach(function (p) {
      t += "<tr><td>" + esc(p.etikett) + "</td><td>" + esc(p.forstaAr) + ": " +
        talSv(p.forsta, 1) + "</td><td>" + esc(p.sistaAr) + ": " + talSv(p.sista, 1) +
        "</td><td>" + (p.forandring >= 0 ? "+" : "−") +
        talSv(Math.abs(p.forandring), 1) + "</td><td>" + esc(p.antalArMedMedel) +
        "</td></tr>";
    });
    t += "</tbody>";
    el("tabell-forandring").innerHTML = t;
  }

  /* ---------- Avsnitt 4: översökta utbildningar ---------- */

  function ritaKonkurrens() {
    var rader = DATA.sammanfattning;
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
            label: "Översökta: fler behöriga sökande än platser",
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
      "Båda gymnasieskolornas utbildningar tillsammans. Staplarna räknar " +
      "utbildningar, inte sökande eller platser. Grå del: utbildningar " +
      "som antog på färdighetsprov, saknade behöriga sökande eller placerades " +
      "manuellt.";

    var forsta = rader[0], sista = rader[rader.length - 1];
    function andel(r) { return Math.round(100 * r.medGrans / r.antalUtbildningar); }
    var html = "<p>" + esc(sista.ar) + " var <strong>" + esc(sista.medGrans) + " av " +
      esc(sista.antalUtbildningar) + "</strong> utbildningar översökta, alltså " +
      "hade fler behöriga sökande än platser (" + andel(sista) + " procent). " +
      esc(forsta.ar) + " var det " + esc(forsta.medGrans) + " av " +
      esc(forsta.antalUtbildningar) + " (" + andel(forsta) + " procent). " +
      "Andelen säger hur många av utbildningarna som var översökta, inte hur " +
      "många sökande som blev utan plats &ndash; en utbildning med några få " +
      "sökande över platserna räknas lika mycket som en med många.</p>";

    /* Två rapportformer bakom samma stapel – det måste läsaren veta om. */
    var bytesAr = rader.filter(function (r) { return r.markor === "fetstil"; });
    if (bytesAr.length && bytesAr.length < rader.length) {
      html += "<p><strong>Jämför med urskillning:</strong> rapporterna säger " +
        "detta på två olika sätt. Till och med " +
        esc(rader[rader.length - bytesAr.length - 1].ar) + " skrevs fotnoten " +
        "&rdquo;alla behöriga sökande är antagna&rdquo; i stället för en " +
        "antagningspoäng. Från " + esc(bytesAr[0].ar) + " skrivs poängen alltid ut, " +
        "och de utbildningar som saknade lediga platser markeras i stället med " +
        "fet stil. Måtten är varandras spegelbild, men inte exakt samma sak: " +
        "en utbildning där de behöriga sökande precis fyllde platserna räknas " +
        "åt olika håll före och efter bytet.</p>";
    }
    el("slutsats-konkurrens").innerHTML = html;

    var t = "<caption>Antal utbildningar per antagningsläge och år, båda " +
      "gymnasieskolorna. Varje utbildning räknas som en, oavsett hur många " +
      "platser och sökande den hade.</caption>";
    t += "<thead><tr><th scope=\"col\">År</th>" +
      "<th scope=\"col\">Översökta (fler sökande än platser)</th>" +
      "<th scope=\"col\">Alla behöriga fick plats</th>" +
      "<th scope=\"col\">Ingen antagning på betyg</th>" +
      "<th scope=\"col\">Totalt</th></tr></thead><tbody>";
    rader.forEach(function (r) {
      t += "<tr><td>" + esc(r.ar) + "</td><td>" + esc(r.medGrans) + "</td><td>" +
        esc(r.allaAntagna) + "</td><td>" + esc(r.ovrigt) + "</td><td>" +
        esc(r.antalUtbildningar) + "</td></tr>";
    });
    t += "</tbody>";
    el("tabell-konkurrens").innerHTML = t;
  }

  /* ---------- Avsnitt 5: yrkesprogram mot högskoleförberedande ---------- */

  var TYPNAMN = K.TYPNAMN;

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
      "Ovägt genomsnitt av utbildningarnas medelmeritvärden i respektive " +
      "grupp, båda gymnasieskolorna. Varje utbildning räknas lika mycket, så " +
      "gruppens värde ändras också när utbudet av utbildningar ändras.";

    var sista = DATA.ar[DATA.ar.length - 1], forsta = DATA.ar[0];
    var hf = rader.filter(function (r) { return r.typ === "hogskoleforberedande"; })[0];
    var yp = rader.filter(function (r) { return r.typ === "yrkesprogram"; })[0];
    var html = "";
    if (hf && yp && hf.varden[String(sista)] && yp.varden[String(sista)]) {
      var a = hf.varden[String(sista)].medel, b = yp.varden[String(sista)].medel;
      html += "<p>" + esc(sista) + " skilde det <strong>" + talSv(Math.abs(a - b), 1) +
        " meritpoäng</strong> mellan grupperna: " + talSv(a, 1) +
        " för de högskoleförberedande programmen och " + talSv(b, 1) +
        " för yrkesprogrammen &ndash; båda ovägda snitt av utbildningarnas " +
        "medelmeritvärden.</p>";
      if (hf.varden[String(forsta)] && yp.varden[String(forsta)]) {
        var nu = Math.abs(a - b);
        var da = Math.abs(hf.varden[String(forsta)].medel -
          yp.varden[String(forsta)].medel);
        html += "<p>" + esc(forsta) + " var skillnaden " + talSv(da, 1) +
          " meritpoäng. Avståndet mellan de två ovägda gruppsnitten är alltså " +
          (Math.abs(nu - da) < 0.05
            ? "ungefär detsamma båda åren"
            : talSv(Math.abs(nu - da), 1) + " meritpoäng " +
              (nu > da ? "större" : "mindre") + " " + esc(sista) + " än " +
              esc(forsta)) +
          ". Det är en jämförelse av två årsvärden, inte ett mått på att " +
          "gapet mellan programmen ändrats: utbudet av program och " +
          "inriktningar skiljer sig mellan åren, och eftersom varje " +
          "utbildning väger lika mycket kan skillnaden lika gärna komma av " +
          "att sammansättningen ändrats som av att programmen förändrats. De " +
          "två går inte att skilja åt i det här datat.</p>";
      }
    }
    el("slutsats-typ").innerHTML = html;

    var t = "<caption>Ovägt medelmeritvärde per programgrupp och år, båda " +
      "gymnasieskolorna. Antal utbildningar bakom varje siffra inom " +
      "parentes &ndash; de skiljer sig mellan åren.</caption>";
    t += "<thead><tr><th scope=\"col\">År</th>";
    rader.forEach(function (r) {
      t += "<th scope=\"col\">" + esc(TYPNAMN[r.typ] || r.typ) + "</th>";
    });
    t += "</tr></thead><tbody>";
    DATA.ar.forEach(function (a) {
      t += "<tr><td>" + esc(a) + "</td>";
      rader.forEach(function (r) {
        var v = r.varden[String(a)];
        t += "<td>" + (v ? talSv(v.medel, 1) + " (" + esc(v.antal) + ")" : "–") + "</td>";
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
      var lokalPdf = sakerUrl(k.lokalPdf);
      var kallaUrl = sakerUrl(k.kallaUrl);
      var arkivUrl = sakerUrl(k.arkivUrl);
      html += "<li><span class=\"titel\">" + esc(k.rapportTitel) + "</span>";
      html += "<br><span class=\"undertext\">" + esc(k.kalla) + "</span>";
      html += "<div class=\"lankar\">";
      if (lokalPdf) html += "<a href=\"" + lokalPdf + "\">Läs rapporten (PDF)</a>";
      if (kallaUrl) html += "<a href=\"" + kallaUrl + "\">Original hos källan</a>";
      if (arkivUrl) html += "<a href=\"" + arkivUrl + "\">Arkiverad kopia</a>";
      html += "</div></li>";
    });
    el("lista-kallor").innerHTML = html;
    el("sektion-kallor").hidden = false;
    el("om-uppdaterad").textContent =
      "Rapporterna hämtades " + DATA.kallor[0].hamtad + ". Sidan omfattar " +
      DATA.kallor.length + " årgångar av slutantagningen.";
  }

  /* ---------- Reglage och start ---------- */

  var fyllValjare = K.fyllValjare;

  /* ---------- Kort sagt ---------- */

  function initKortSagt() {
    var forsta = DATA.ar[0], sista = DATA.ar[DATA.ar.length - 1];
    var punkter = [];
    var namn = {};
    DATA.program.forEach(function (p) { namn[p.namn] = true; });
    var saknas = saknadeAr();

    punkter.push("Sidan följer <strong>" + Object.keys(namn).length +
      " program</strong> på kommunens två gymnasieskolor genom " +
      DATA.ar.length + " antagningsomgångar, " + esc(forsta) + "–" + esc(sista) +
      (saknas.length ? " (" + esc(saknas.join(", ")) + " saknas)" : "") + ".");

    var senaste = nationella().map(function (u) {
      var v = u.varden[String(sista)];
      return (v && v.medel !== null) ? { u: u, medel: v.medel } : null;
    }).filter(Boolean).sort(function (a, b) { return b.medel - a.medel; });
    if (senaste.length > 1) {
      var hogst = senaste[0], lagst = senaste[senaste.length - 1];
      punkter.push("Vid slutantagningen " + esc(sista) + " hade <strong>" +
        esc(utbildningsetikett(hogst.u)) + "</strong> högst medelmeritvärde (" +
        talSv(hogst.medel, 1) + ") och <strong>" + esc(utbildningsetikett(lagst.u)) +
        "</strong> lägst (" + talSv(lagst.medel, 1) + ").");
    }

    var medForandring = DATA.program.filter(function (p) {
      return p.forandring !== null && p.antalArMedMedel >= 2;
    });
    if (medForandring.length) {
      var upp = medForandring.filter(function (p) { return p.forandring > 0; }).length;
      punkter.push("<strong>" + upp + " av " + medForandring.length +
        "</strong> programserier har högre medelmeritvärde vid sitt sista " +
        "mätår än vid sitt första – ett program som går på båda skolorna " +
        "räknas per skola, och jämförelsen gäller bara de år serien kan " +
        "mätas.");
    }

    var hf = DATA.perTyp.filter(function (r) { return r.typ === "hogskoleforberedande"; })[0];
    var yp = DATA.perTyp.filter(function (r) { return r.typ === "yrkesprogram"; })[0];
    if (hf && yp && hf.varden[String(sista)] && yp.varden[String(sista)]) {
      var a = hf.varden[String(sista)].medel, b = yp.varden[String(sista)].medel;
      punkter.push("Skillnaden mellan högskoleförberedande program och " +
        "yrkesprogram var <strong>" + talSv(Math.abs(a - b), 1) +
        " meritpoäng</strong> " + esc(sista) + " (" + talSv(a, 1) + " mot " +
        talSv(b, 1) + ", ovägt snitt per utbildning).");
    }

    K.visaKortSagt(punkter);
  }

  function initMeta() {
    K.visaMeta({
      kalla: "Göteborgsregionen (GR), Gymnasieantagningen",
      period: DATA.ar[0] + "–" + DATA.ar[DATA.ar.length - 1],
      senaste: "slutantagningen " + DATA.ar[DATA.ar.length - 1],
      hamtad: DATA.kallor[0].hamtad
    });
  }

  function init(data) {
    DATA = data;

    var programVal = el("program-valjare");
    fyllValjare(programVal, [""], function () { return "Alla program"; });
    fyllValjare(programVal, DATA.program.map(function (p) { return p.etikett; }));
    K.kopplaValjare(programVal, "program", ritaUtveckling);

    var arVal = el("ar-valjare");
    fyllValjare(arVal, data.ar.slice().reverse());
    K.kopplaValjare(arVal, "year", ritaRangordning);

    el("sektion-utveckling").hidden = false;

    initKortSagt();
    initMeta();
    ritaUtveckling();
    ritaRangordning();
    ritaForandring();
    ritaKonkurrens();
    ritaTyp();
    initKallor();
  }

  K.starta("data-meritvarden.json", {
    tomt: function (data) { return !data.program || !data.program.length; },
    tomtText: "Antagningsstatistiken håller på att läsas in.",
    init: init
  });
})();
