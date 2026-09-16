/* Platser på gymnasieprogrammen – läser docs/data-platser.json och ritar
   diagrammen. Talen är nämndens egna beslut om hur många platser varje
   program erbjuder, inte hur många som sökte eller antogs.

   Enheten är programmet, inte skolan: kommunen flyttar program mellan sina
   två gymnasieskolor. Till skillnad från meritvärdessidan summeras
   platserna när ett program funnits på båda skolorna samma år – platser är
   additiva, meritvärden är det inte. */
(function () {
  "use strict";

  var K = window.KIS;
  var FARG = K.FARG;
  var serieStil = K.serieStil;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;

  var DATA = null;
  var rita = K.rita;

  function arsskala() { return K.arsskala(DATA.ar); }

  function lasaret(ar) { return ar + "/" + (Number(ar) + 1); }

  /* De nationella programmen och IB. Anpassade gymnasieskolan,
     lärlingsprogrammet och individuellt alternativ är inte program och
     redovisas för sig. */
  function programmen() {
    return DATA.program.filter(function (p) { return p.typ !== "okant"; });
  }

  function ovriga() {
    return DATA.program.filter(function (p) { return p.typ === "okant"; });
  }

  /* Första året som inte är beslutat. Där går diagrammet från fattade
     beslut till planering, och markeringen säger det. */
  function forstaPlanerade() {
    var funnet = null;
    DATA.kallor.forEach(function (k) {
      if (funnet === null && k.status === "planerad") funnet = k.ar;
    });
    return funnet;
  }

  function markeringar() {
    var ar = forstaPlanerade();
    return ar === null ? [] : [{ vid: ar, text: "planerat" }];
  }

  /* ---------- Avsnitt 1: utvecklingen program för program ---------- */

  function serier(valt) {
    var ar = arsskala();
    if (valt) {
      var valtProgram = programmen().filter(function (x) {
        return x.namn === valt;
      })[0];
      if (!valtProgram || !valtProgram.inriktningar.length) return [];
      return valtProgram.inriktningar.map(function (i) {
        return {
          etikett: i.namn,
          varden: ar.map(function (a) {
            var v = i.varden[String(a)];
            return v === undefined ? null : v;
          }),
          skola: ar.map(function () { return null; })
        };
      });
    }
    return programmen().map(function (p) {
      return {
        etikett: p.namn,
        varden: ar.map(function (a) {
          var v = p.varden[String(a)];
          return v ? v.platser : null;
        }),
        skola: ar.map(function (a) {
          var v = p.varden[String(a)];
          return v && v.antalSkolor > 1 ? v.skola : null;
        }),
        varavIMV: ar.map(function (a) {
          var v = p.varden[String(a)];
          return v ? v.varavIMV : null;
        })
      };
    });
  }

  function ritaUtveckling() {
    var valt = el("program-valjare").value;
    var ar = arsskala();
    var rader = serier(valt).filter(function (s) {
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
    rader.sort(function (a, b) { return sist(b) - sist(a); });

    rita("diagram-utveckling", {
      type: "line",
      plugins: [K.regimmarkering(markeringar())],
      data: {
        labels: ar.map(String),
        datasets: rader.map(function (s, i) {
          var stil = serieStil(i);
          return {
            label: s.etikett,
            data: s.varden,
            skola: s.skola,
            varavIMV: s.varavIMV,
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
              title: function (it) { return "Läsår " + lasaret(it[0].label); },
              label: function (it) {
                var i = it.dataIndex, d = it.dataset;
                var t = [d.label + ": " + talSv(it.parsed.y) + " platser"];
                if (d.skola && d.skola[i]) t.push(d.skola[i]);
                if (d.varavIMV && d.varavIMV[i]) {
                  t.push("Varav " + talSv(d.varavIMV[i]) +
                    " sökbara via programinriktat val");
                }
                return t;
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
            title: { display: true, text: "Antal platser", color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            beginAtZero: true,
            grace: "8%",
            ticks: { callback: function (v) { return talSv(v); } }
          }
        }
      }
    }, Math.max(440, 320 + rader.length * 14));

    if (rader.length >= 3) K.aktiveraToning(K.diagramFor("diagram-utveckling"));

    var planerat = forstaPlanerade();
    el("kalla-utveckling").textContent =
      (valt
        ? "Platser per inriktning, " + valt + ". Bara de år handlingen " +
          "redovisar inriktningarna var för sig har värden."
        : "Antal platser som nämnden beslutat att programmet ska erbjuda, " +
          "summerat över kommunens båda gymnasieskolor.") +
      (planerat === null ? ""
        : " Det streckade strecket markerar övergången till läsåret " +
          lasaret(planerat) + ", som ännu bara är planerat.") +
      (rader.length > 3
        ? " Peka på ett namn i teckenförklaringen så tonas de andra linjerna " +
          "ned; klicka för att dölja linjen."
        : "");

    ritaSlutsats(rader, valt);
    ritaTabell(valt);
  }

  function ritaSlutsats(rader, valt) {
    if (valt) { el("slutsats-utveckling").innerHTML = ""; return; }
    var forsta = DATA.ar[0], sista = DATA.ar[DATA.ar.length - 1];
    var andrade = programmen().filter(function (p) {
      return p.varden[String(forsta)] && p.varden[String(sista)];
    }).map(function (p) {
      return {
        namn: p.namn,
        diff: p.varden[String(sista)].platser - p.varden[String(forsta)].platser
      };
    }).sort(function (a, b) { return b.diff - a.diff; });

    if (!andrade.length) { el("slutsats-utveckling").innerHTML = ""; return; }
    var upp = andrade[0], ner = andrade[andrade.length - 1];
    var html = "<p>Mellan läsåren " + esc(lasaret(forsta)) + " och " +
      esc(lasaret(sista)) + " ökade <strong>" + esc(upp.namn) + "</strong> mest (" +
      (upp.diff >= 0 ? "+" : "") + talSv(upp.diff) + " platser) och <strong>" +
      esc(ner.namn) + "</strong> minskade mest (" + talSv(ner.diff) +
      " platser).</p>";
    var oforandrade = andrade.filter(function (p) { return p.diff === 0; }).length;
    if (oforandrade) {
      html += "<p>" + talSv(oforandrade) + " av " + talSv(andrade.length) +
        " program har lika många platser vid periodens slut som vid dess början.</p>";
    }
    el("slutsats-utveckling").innerHTML = html;
  }

  function ritaTabell(valt) {
    var ar = DATA.ar, t;
    if (valt) {
      var valtProgram = programmen().filter(function (x) {
        return x.namn === valt;
      })[0];
      t = "<caption>Platser per inriktning och läsår, " + esc(valt) +
        ". Tomt fält betyder att handlingen inte redovisar inriktningarna " +
        "var för sig det året.</caption>";
      t += "<thead><tr><th scope=\"col\">Inriktning</th>";
      ar.forEach(function (a) {
        t += "<th scope=\"col\">" + esc(lasaret(a)) + "</th>";
      });
      t += "</tr></thead><tbody>";
      valtProgram.inriktningar.forEach(function (i) {
        t += "<tr><td>" + esc(i.namn) + "</td>";
        ar.forEach(function (a) {
          var v = i.varden[String(a)];
          t += "<td>" + (v === undefined ? "–" : talSv(v)) + "</td>";
        });
        t += "</tr>";
      });
      t += "</tbody>";
    } else {
      t = "<caption>Antal platser per program och läsår, summerat över " +
        "kommunens båda gymnasieskolor. Tomt fält betyder att programmet " +
        "inte fanns i utbudet det året.</caption>";
      t += "<thead><tr><th scope=\"col\">Program</th><th scope=\"col\">Skola</th>";
      ar.forEach(function (a) {
        t += "<th scope=\"col\">" + esc(lasaret(a)) + "</th>";
      });
      t += "</tr></thead><tbody>";
      programmen().forEach(function (p) {
        t += "<tr><td>" + esc(p.namn) + "</td><td>" + esc(p.hem) + "</td>";
        ar.forEach(function (a) {
          var v = p.varden[String(a)];
          t += "<td>" + (v ? talSv(v.platser) : "–") + "</td>";
        });
        t += "</tr>";
      });
      t += "</tbody>";
    }
    el("tabell-utveckling").innerHTML = t;
  }

  /* ---------- Avsnitt 2: totalen ---------- */

  function ritaTotal() {
    var ar = arsskala();
    rita("diagram-total", {
      type: "bar",
      plugins: [K.regimmarkering(markeringar())],
      data: {
        labels: ar.map(String),
        datasets: [{
          label: "Platser på de nationella programmen och IB",
          data: ar.map(function (a) {
            var r = DATA.sammanfattning.filter(function (s) { return s.ar === a; })[0];
            return r ? r.platser : null;
          }),
          backgroundColor: serieStil(0).farg,
          borderColor: serieStil(0).farg,
          borderWidth: 1
        }]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function (it) { return "Läsår " + lasaret(it[0].label); },
              label: function (it) {
                var r = DATA.sammanfattning[it.dataIndex];
                var t = [talSv(it.parsed.y) + " platser på " +
                  talSv(r.antalProgram) + " program"];
                if (r.platserOvrigt !== null) {
                  t.push("Därutöver " + talSv(r.platserOvrigt) +
                    " platser utanför programmen");
                }
                return t;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { color: FARG.baseline } },
          y: {
            title: { display: true, text: "Antal platser", color: FARG.muted },
            grid: { color: FARG.grid },
            border: { color: FARG.baseline },
            beginAtZero: true,
            ticks: { callback: function (v) { return talSv(v); } }
          }
        }
      }
    }, 380);

    el("kalla-total").textContent =
      "Summan av platserna på de nationella programmen och International " +
      "Baccalaureate, båda skolorna. Anpassade gymnasieskolan, " +
      "lärlingsprogrammet och individuellt alternativ ingår inte – de " +
      "redovisas bara i en del av handlingarna.";
  }

  /* ---------- Kort sagt, källor, start ---------- */

  function initKortSagt() {
    var punkter = [];
    var forsta = DATA.sammanfattning[0];
    var sista = DATA.sammanfattning[DATA.sammanfattning.length - 1];
    punkter.push("Läsåret " + esc(lasaret(sista.ar)) + " erbjuder kommunens " +
      "gymnasieskolor <strong>" + talSv(sista.platser) + " platser</strong> " +
      "på " + talSv(sista.antalProgram) + " program.");
    var diff = sista.platser - forsta.platser;
    punkter.push("Det är <strong>" + (diff >= 0 ? "+" : "") + talSv(diff) +
      " platser</strong> jämfört med läsåret " + esc(lasaret(forsta.ar)) + ".");

    var rorligast = programmen().map(function (p) {
      var v = Object.keys(p.varden).map(function (a) { return p.varden[a].platser; });
      return { namn: p.namn, spann: Math.max.apply(null, v) - Math.min.apply(null, v) };
    }).sort(function (a, b) { return b.spann - a.spann; })[0];
    if (rorligast && rorligast.spann > 0) {
      punkter.push("Störst rörelse har <strong>" + esc(rorligast.namn) +
        "</strong>: " + talSv(rorligast.spann) + " platsers skillnad mellan " +
        "periodens största och minsta utbud.");
    }
    K.visaKortSagt(punkter);
  }

  function initKallor() {
    el("lista-kallor").innerHTML = DATA.kallor.slice().reverse()
      .map(function (k) {
        var detalj = k.namnd + ", " + k.mote +
          (k.paragraf ? " § " + k.paragraf : "") +
          (k.diarienummer ? " (" + k.diarienummer + ")" : "");
        return K.kallpost({
          titel: "Läsår " + k.lasar + ": " + k.arendenamn,
          detalj: detalj,
          lankar: [[k.lokalPdf, "Läs tjänsteskrivelsen (PDF)"],
                   [k.handlingUrl, "Hela handlingarna hos kommunen"],
                   [k.protokollUrl, "Protokollet"]]
        });
      }).join("");
    el("sektion-kallor").hidden = false;
    el("om-uppdaterad").textContent =
      "Handlingarna hämtades " + DATA.kallor[0].hamtad + ". Sidan omfattar " +
      DATA.kallor.length + " läsår.";
  }

  function initOvriga() {
    var rader = ovriga();
    if (!rader.length) return;
    var ar = DATA.ar;
    var t = "<caption>Utbildningar utanför de nationella programmen. De " +
      "redovisas bara i de handlingar som har bilagans tabellform, och " +
      "tomma fält betyder att handlingen inte tar upp dem – inte att de " +
      "lagts ned.</caption>";
    t += "<thead><tr><th scope=\"col\">Utbildning</th>";
    ar.forEach(function (a) {
      t += "<th scope=\"col\">" + esc(lasaret(a)) + "</th>";
    });
    t += "</tr></thead><tbody>";
    rader.forEach(function (p) {
      t += "<tr><td>" + esc(p.namn) + "</td>";
      ar.forEach(function (a) {
        var v = p.varden[String(a)];
        t += "<td>" + (v ? talSv(v.platser) : "–") + "</td>";
      });
      t += "</tr>";
    });
    t += "</tbody>";
    el("tabell-ovriga").innerHTML = t;
    el("sektion-ovriga").hidden = false;
  }

  function initMeta() {
    K.visaMeta({
      kalla: "Nämnden för Gymnasium & Arbetsmarknad, Kungsbacka kommun",
      period: "läsåren " + lasaret(DATA.ar[0]) + "–" +
        lasaret(DATA.ar[DATA.ar.length - 1]),
      senaste: "läsår " + lasaret(DATA.ar[DATA.ar.length - 1]),
      hamtad: DATA.kallor[0].hamtad
    });
  }

  function init(data) {
    DATA = data;

    var programVal = el("program-valjare");
    K.fyllValjare(programVal, [""], function () { return "Alla program"; });
    K.laggTillAlternativ(programVal, programmen()
      .filter(function (p) { return p.inriktningar.length; })
      .map(function (p) { return p.namn; }));
    K.kopplaValjare(programVal, "program", ritaUtveckling);

    el("sektion-utveckling").hidden = false;
    el("sektion-total").hidden = false;

    initKortSagt();
    initMeta();
    ritaUtveckling();
    ritaTotal();
    initOvriga();
    initKallor();
  }

  K.starta("data-platser.json", {
    tomt: function (data) { return !data.program || !data.program.length; },
    tomtText: "Nämndens utbudsbeslut håller på att läsas in.",
    init: init
  });
})();
