/* Platser på gymnasieprogrammen – läser docs/data-platser.json och ritar
   diagrammen. Sidan visar tre saker: vad nämnden beslutar att programmen
   ska erbjuda, hur många som sedan faktiskt går första året där, och – för
   de läsår som har båda talen – hur långt ifrån varandra de ligger.

   Enheten är programmet, inte skolan: kommunen flyttar program mellan sina
   två gymnasieskolor. Till skillnad från meritvärdessidan summeras
   platserna när ett program funnits på båda skolorna samma år – platser är
   additiva, meritvärden är det inte.

   De två måtten ritas i var sin bild, av samma funktioner. Strukturen är
   densamma – en linje per program, en stapel per läsår – och det som
   skiljer är vad en punkt heter i rutan och vad axeln mäter. Därför bor
   strukturen i programDiagram och stapelDiagram, och skillnaderna skickas
   in. Tidsaxlarna är olika långa och det är avsiktligt: platserna finns
   från läsåret 2024/2025, eftersom äldre nämndhandlingar inte går att få
   tag på, medan Skolverkets elevstatistik finns från 2011/2012. Att
   tvinga in den korta serien i den långas skala skulle ge mest luft.

   Skillnaden mellan måtten får ett eget avsnitt längst ned, ett läsår i
   taget. Den subtraktionen görs inte här utan i build_platser.py – sidan
   ritar den, bygget räknar den. */
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

  /* Elevstatistikens egen årsaxel. Null när statistiken inte är hämtad –
     då hoppas de två elevavsnitten över i stället för att ritas tomma. */
  function elevar() {
    return DATA.borjade ? K.arsskala(DATA.borjade.ar) : null;
  }

  function lasaret(ar) { return ar + "/" + (Number(ar) + 1); }

  function lasarsspann(ar) {
    return lasaret(ar[0]) + "–" + lasaret(ar[ar.length - 1]);
  }

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

  /* ---------- Delade byggstenar ----------

     Sidan ritar samma två bilder två gånger, en gång per mått. Det som
     skiljer platserna från eleverna är rubriken på axeln och ordet i
     pekrutan – inte strukturen. Den ligger här, så att en ändring av
     bilden slår igenom på båda måtten. */

  /* Seriens sista kända värde, till sorteringen. Teckenförklaringen ska
     stå i samma ordning som linjerna ligger i diagrammets högerkant. */
  function sistaVardet(s) {
    for (var i = s.varden.length - 1; i >= 0; i--) {
      if (s.varden[i] !== null) return s.varden[i];
    }
    return -1;
  }

  /* Serier ur programlistan: `tal` plockar årets värde ur ett program,
     `extra` hänger på det som bara ena måttet har. Serier utan ett enda
     värde tas bort – ett program som aldrig funnits hör inte i bilden. */
  function programSerier(ar, tal, extra) {
    return programmen().map(function (p) {
      var serie = {
        etikett: p.namn,
        varden: ar.map(function (a) { return tal(p, String(a)); })
      };
      if (extra) extra(serie, p, ar);
      return serie;
    }).filter(function (s) {
      return s.varden.some(function (v) { return v !== null; });
    });
  }

  /* En linje per program. Axelns baslinje och luften ovanför toppen är
     sidans två avsteg från den gemensamma måttaxeln, och står därför
     utskrivna här i stället för att gömmas i en flagga. */
  function programDiagram(id, inst) {
    var rader = inst.rader.slice().sort(function (a, b) {
      return sistaVardet(b) - sistaVardet(a);
    });

    var options = K.diagramStomme({
      pekar: "nearest",
      legend: { display: true, position: "bottom", labels: { boxWidth: 40 } },
      tooltip: {
        title: function (it) { return "Läsår " + lasaret(it[0].label); },
        label: inst.etikett
      }
    });
    options.scales = {
      x: K.kategoriAxel({ ticks: { maxRotation: 0, autoSkipPadding: 8 } }),
      y: K.mattAxel({
        titel: inst.ytitel,
        franNoll: true,
        ticks: { callback: function (v) { return talSv(v); } }
      })
    };
    options.scales.y.border = { color: FARG.baseline };
    options.scales.y.grace = "8%";

    var konf = {
      type: "line",
      data: {
        labels: inst.ar.map(String),
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
      options: options
    };
    if (inst.markeringar) konf.plugins = [K.regimmarkering(inst.markeringar)];

    rita(id, konf, Math.max(440, 320 + rader.length * 14));
    if (rader.length >= 3) K.aktiveraToning(K.diagramFor(id));
    return rader;
  }

  /* En stapel per läsår: summan av det måttet. */
  function stapelDiagram(id, inst) {
    var options = K.diagramStomme({
      legend: { display: false },
      tooltip: {
        title: function (it) { return "Läsår " + lasaret(it[0].label); },
        label: inst.etikett
      }
    });
    options.scales = {
      x: K.kategoriAxel({ ticks: { maxRotation: 0, autoSkipPadding: 8 } }),
      y: K.mattAxel({
        titel: inst.ytitel,
        franNoll: true,
        ticks: { callback: function (v) { return talSv(v); } }
      })
    };
    options.scales.y.border = { color: FARG.baseline };

    rita(id, {
      type: "bar",
      plugins: inst.markeringar ? [K.regimmarkering(inst.markeringar)] : [],
      data: {
        labels: inst.ar.map(String),
        datasets: [{
          label: inst.etikettSerie,
          data: inst.varden,
          backgroundColor: serieStil(0).farg,
          borderColor: serieStil(0).farg,
          borderWidth: 1
        }]
      },
      options: options
    }, 380);
  }

  /* Tabell med ett läsår per kolumn. `cell` ger textinnehållet, redan
     escapat eller redan ett tal; tomma år blir tankstreck. */
  function arsTabell(id, inst) {
    var t = "<caption>" + inst.rubrik + "</caption><thead><tr>";
    inst.kolumner.forEach(function (k) {
      t += "<th scope=\"col\">" + esc(k) + "</th>";
    });
    inst.ar.forEach(function (a) {
      t += "<th scope=\"col\">" + esc(lasaret(a)) + "</th>";
    });
    t += "</tr></thead><tbody>";
    inst.rader.forEach(function (rad) {
      t += "<tr>";
      rad.celler.forEach(function (c) { t += "<td>" + esc(c) + "</td>"; });
      inst.ar.forEach(function (a) {
        var v = rad.tal(String(a));
        t += "<td>" + (v === null || v === undefined ? "–" : talSv(v)) + "</td>";
      });
      t += "</tr>";
    });
    t += "</tbody>";
    if (inst.summa) {
      t += "<tfoot><tr><th scope=\"row\">Summa</th>";
      for (var i = 1; i < inst.kolumner.length; i++) t += "<td></td>";
      inst.ar.forEach(function (a) {
        var v = inst.summa(String(a));
        t += "<td>" + (v === null ? "–" : talSv(v)) + "</td>";
      });
      t += "</tr></tfoot>";
    }
    el(id).innerHTML = t;
  }

  /* ---------- Avsnitt 1: platserna program för program ---------- */

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
    return programSerier(ar, function (p, a) {
      return p.varden[a] ? p.varden[a].platser : null;
    }, function (serie, p, arLista) {
      serie.skola = arLista.map(function (a) {
        var v = p.varden[String(a)];
        return v && v.antalSkolor > 1 ? v.skola : null;
      });
      serie.varavIMV = arLista.map(function (a) {
        var v = p.varden[String(a)];
        return v ? v.varavIMV : null;
      });
    });
  }

  function ritaUtveckling() {
    var valt = el("program-valjare").value;
    var ar = arsskala();
    var rader = programDiagram("diagram-utveckling", {
      ar: ar,
      rader: serier(valt).filter(function (s) {
        return s.varden.some(function (v) { return v !== null; });
      }),
      ytitel: "Antal platser",
      markeringar: markeringar(),
      etikett: function (it) {
        var i = it.dataIndex, d = it.dataset;
        var t = [d.label + ": " + talSv(it.parsed.y) + " platser"];
        if (d.skola && d.skola[i]) t.push(d.skola[i]);
        if (d.varavIMV && d.varavIMV[i]) {
          t.push("Varav " + talSv(d.varavIMV[i]) +
            " sökbara via programinriktat val");
        }
        return t;
      }
    });

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
      toningsrad(rader);

    ritaSlutsats(rader, valt);
    ritaTabell(valt);
  }

  function toningsrad(rader) {
    return rader.length > 3
      ? " Peka på ett namn i teckenförklaringen så tonas de andra linjerna " +
        "ned; klicka för att dölja linjen."
      : "";
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
    if (valt) {
      var valtProgram = programmen().filter(function (x) {
        return x.namn === valt;
      })[0];
      arsTabell("tabell-utveckling", {
        rubrik: "Platser per inriktning och läsår, " + esc(valt) +
          ". Tomt fält betyder att handlingen inte redovisar inriktningarna " +
          "var för sig det året.",
        kolumner: ["Inriktning"],
        ar: DATA.ar,
        rader: valtProgram.inriktningar.map(function (i) {
          return {
            celler: [i.namn],
            tal: function (a) { return i.varden[a]; }
          };
        })
      });
      return;
    }
    arsTabell("tabell-utveckling", {
      rubrik: "Antal platser per program och läsår, summerat över " +
        "kommunens båda gymnasieskolor. Tomt fält betyder att programmet " +
        "inte fanns i utbudet det året.",
      kolumner: ["Program", "Skola"],
      ar: DATA.ar,
      rader: programmen().map(function (p) {
        return {
          celler: [p.namn, p.hem],
          tal: function (a) { return p.varden[a] ? p.varden[a].platser : null; }
        };
      })
    });
  }

  /* ---------- Avsnitt 2: hur många som började ----------

     Samma programlista som platsdiagrammet, av ett skäl: frågan är hur det
     gick för de utbildningar kommunen faktiskt har. Skolverket redovisar
     också ett par program på de kommunala skolorna som aldrig står i
     nämndens utbud – de hör inte hit, och tabellens fot säger att de
     finns. */

  function borjadeSumma(a) {
    var summa = 0, fanns = false;
    programmen().forEach(function (p) {
      var v = p.borjade[a];
      if (v !== undefined) { summa += v; fanns = true; }
    });
    return fanns ? summa : null;
  }

  function ritaBorjade() {
    var ar = elevar();
    if (!ar) return;
    var rader = programDiagram("diagram-borjade", {
      ar: ar,
      rader: programSerier(ar, function (p, a) {
        var v = p.borjade[a];
        return v === undefined ? null : v;
      }),
      ytitel: "Antal elever i årskurs 1",
      etikett: function (it) {
        return it.dataset.label + ": " + talSv(it.parsed.y) +
          (it.parsed.y === 1 ? " elev" : " elever") + " i årskurs 1";
      }
    });
    if (!rader.length) return;

    el("sektion-borjade").hidden = false;
    el("kalla-borjade").textContent =
      "Antal elever i årskurs 1 den 15 oktober på Aranäsgymnasiet och Elof " +
      "Lindälvs gymnasium, läsåren " + lasarsspann(ar) +
      ". Källa: Skolverkets utbildningsstatistik." + toningsrad(rader);

    ritaBorjadeSlutsats(ar);

    arsTabell("tabell-borjade", {
      rubrik: "Antal elever i årskurs 1 per program och läsår, kommunens " +
        "båda gymnasieskolor. Tomt fält betyder att programmet inte fanns " +
        "på någon av skolorna det läsåret.",
      kolumner: ["Program"],
      ar: ar,
      rader: programmen().map(function (p) {
        return {
          celler: [p.namn],
          tal: function (a) { return p.borjade[a]; }
        };
      }),
      summa: borjadeSumma
    });
    K.sattDataNot("not-borjade",
      "Summan är programmen i tabellen. Skolverket redovisar en del år " +
      "därutöver enstaka elever på program som inte står i nämndens " +
      "utbudsbeslut – de ingår inte här.");
  }

  function ritaBorjadeSlutsats(ar) {
    var forsta = String(ar[0]), sista = String(ar[ar.length - 1]);
    var andrade = programmen().filter(function (p) {
      return p.borjade[forsta] !== undefined && p.borjade[sista] !== undefined;
    }).map(function (p) {
      return { namn: p.namn, diff: p.borjade[sista] - p.borjade[forsta] };
    }).sort(function (a, b) { return b.diff - a.diff; });

    if (!andrade.length) { el("slutsats-borjade").innerHTML = ""; return; }
    var upp = andrade[0], ner = andrade[andrade.length - 1];
    el("slutsats-borjade").innerHTML =
      "<p>Mellan läsåren " + esc(lasaret(ar[0])) + " och " +
      esc(lasaret(ar[ar.length - 1])) + " växte <strong>" + esc(upp.namn) +
      "</strong> mest (" + (upp.diff >= 0 ? "+" : "") + talSv(upp.diff) +
      " elever i årskurs 1) och <strong>" + esc(ner.namn) +
      "</strong> krympte mest (" + talSv(ner.diff) + " elever).</p>";
  }

  function ritaBorjadeTotal() {
    var ar = elevar();
    if (!ar) return;
    var varden = ar.map(function (a) { return borjadeSumma(String(a)); });
    if (!varden.some(function (v) { return v !== null; })) return;

    el("sektion-borjade-total").hidden = false;
    stapelDiagram("diagram-borjade-total", {
      ar: ar,
      varden: varden,
      etikettSerie: "Elever i årskurs 1 på kommunens gymnasieprogram",
      ytitel: "Antal elever i årskurs 1",
      etikett: function (it) {
        return talSv(it.parsed.y) + " elever i årskurs 1";
      }
    });
    el("kalla-borjade-total").textContent =
      "Summan av eleverna i årskurs 1 på de program som finns i nämndens " +
      "utbud, båda skolorna, läsåren " + lasarsspann(ar) +
      ". Introduktionsprogrammen och den anpassade gymnasieskolan ingår " +
      "inte. Källa: Skolverkets utbildningsstatistik.";
  }

  /* ---------- Avsnitt 3: platserna sammanlagt ---------- */

  function ritaTotal() {
    var ar = arsskala();
    stapelDiagram("diagram-total", {
      ar: ar,
      varden: ar.map(function (a) {
        var r = DATA.sammanfattning.filter(function (s) { return s.ar === a; })[0];
        return r ? r.platser : null;
      }),
      etikettSerie: "Platser på de nationella programmen och IB",
      ytitel: "Antal platser",
      markeringar: markeringar(),
      etikett: function (it) {
        var r = DATA.sammanfattning[it.dataIndex];
        var t = [talSv(it.parsed.y) + " platser på " +
          talSv(r.antalProgram) + " program"];
        if (r.platserOvrigt !== null) {
          t.push("Därutöver " + talSv(r.platserOvrigt) +
            " platser utanför programmen");
        }
        return t;
      }
    });

    el("kalla-total").textContent =
      "Summan av platserna på de nationella programmen och International " +
      "Baccalaureate, båda skolorna. Anpassade gymnasieskolan, " +
      "lärlingsprogrammet och individuellt alternativ ingår inte – de " +
      "redovisas bara i en del av handlingarna.";
  }

  /* ---------- Avsnitt 4: skillnaden mellan beslut och utfall ----------

     De två måtten dragna från varandra, program för program: elever i
     årskurs 1 minus platser, samma läsår. Subtraktionen görs i bygget
     (fältet `skillnad`), inte här – den är ett mått och hör hemma där
     måtten räknas och testas.

     Bilden är liggande staplar, ett läsår i taget. Två skäl: med ett
     dussin programnamn är etiketterna läsbara bara vågrätt, och ett
     tvåpoligt mått vill ha en nollinje att vända kring, inte en
     baslinje längst ned. Bara de läsår som har båda talen går att välja,
     och de är färre än platsåren: elevtalen publiceras våren efter. */

  function jamforelsen(a) {
    var r = DATA.sammanfattning.filter(function (s) {
      return s.ar === Number(a);
    })[0];
    return r && r.jamforelse ? r.jamforelse : null;
  }

  function skillnadsar() {
    return DATA.ar.filter(function (a) { return jamforelsen(a) !== null; });
  }

  /* Programmen som har båda talen det läsåret, störst plus först. Samma
     urval som jämförelsens summor: ett program utan elevtal står utanför
     på båda sidorna. */
  function skillnadsrader(a) {
    return programmen().filter(function (p) {
      return p.varden[a] && p.varden[a].skillnad !== null;
    }).map(function (p) {
      return {
        namn: p.namn,
        platser: p.varden[a].platser,
        borjade: p.varden[a].borjade,
        skillnad: p.varden[a].skillnad
      };
    }).sort(function (x, y) { return y.skillnad - x.skillnad; });
  }

  function tecknat(v) { return (v > 0 ? "+" : "") + talSv(v); }

  function ritaSkillnad() {
    var a = el("ar-valjare").value;
    var rader = skillnadsrader(a);
    if (!rader.length) return;

    var options = K.diagramStomme({
      pekar: "nearest",
      legend: { display: false },
      tooltip: {
        label: function (it) {
          var r = rader[it.dataIndex];
          return [
            talSv(r.platser) + " platser beslutade",
            talSv(r.borjade) + (r.borjade === 1 ? " elev" : " elever") +
              " i årskurs 1",
            r.skillnad === 0
              ? "Lika många elever som platser"
              : (r.skillnad > 0 ? "Fler elever än platser: "
                : "Färre elever än platser: ") + tecknat(r.skillnad)
          ];
        }
      }
    });
    options.indexAxis = "y";
    options.scales = {
      x: K.mattAxel({
        titel: "Elever i årskurs 1 minus platser, läsåret " + lasaret(a),
        ticks: { callback: function (v) { return tecknat(v); } }
      }),
      y: K.kategoriAxel({ ticks: {} })
    };
    /* Nollinjen är den här bildens baslinje och ritas starkare än
       rutnätet: det är den staplarna vänder kring. */
    options.scales.x.grid = {
      color: function (c) {
        return c.tick.value === 0 ? FARG.baseline : FARG.grid;
      }
    };

    rita("diagram-skillnad", {
      type: "bar",
      data: {
        labels: rader.map(function (r) { return r.namn; }),
        datasets: [{
          label: "Elever i årskurs 1 minus platser",
          data: rader.map(function (r) { return r.skillnad; }),
          backgroundColor: rader.map(function (r) {
            return r.skillnad >= 0 ? FARG.bla : FARG.rod;
          }),
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 22
        }]
      },
      options: options
    }, Math.max(260, rader.length * 30 + 120));

    el("kalla-skillnad").textContent =
      "Antal elever i årskurs 1 den 15 oktober minus antalet platser " +
      "nämnden beslutat om, läsåret " + lasaret(a) + ". Stapel åt höger " +
      "(blå) = fler elever än platser, åt vänster (röd) = färre. Källor: " +
      "nämndens handlingar och Skolverkets utbildningsstatistik.";

    ritaSkillnadSlutsats(a, rader);
    ritaSkillnadTabell(a, rader);
  }

  function ritaSkillnadSlutsats(a, rader) {
    var j = jamforelsen(a);
    var over = rader.filter(function (r) { return r.skillnad > 0; }).length;
    var under = rader.filter(function (r) { return r.skillnad < 0; }).length;
    var lika = rader.length - over - under;
    var storst = rader.slice().sort(function (x, y) {
      return Math.abs(y.skillnad) - Math.abs(x.skillnad);
    })[0];

    var html = "<p>Läsåret " + esc(lasaret(a)) + " beslutade nämnden om " +
      "<strong>" + talSv(j.platser) + " platser</strong> på de " +
      talSv(j.antalProgram) + " program som också har elevtal, och " +
      "<strong>" + talSv(j.borjade) + " elever</strong> gick första året " +
      "på dem. Skillnaden är <strong>" + tecknat(j.skillnad) +
      "</strong>.</p>";
    html += "<p>" + talSv(over) + " av " + talSv(rader.length) +
      " program hade fler elever i årskurs 1 än platser, " + talSv(under) +
      " hade färre" + (lika ? " och " + talSv(lika) + " lika många" : "") +
      ". Störst avstånd hade <strong>" + esc(storst.namn) + "</strong> (" +
      tecknat(storst.skillnad) + ").</p>";
    el("slutsats-skillnad").innerHTML = html;
  }

  function ritaSkillnadTabell(a, rader) {
    var j = jamforelsen(a);
    var t = "<caption>Platser, elever i årskurs 1 och skillnaden mellan " +
      "dem, läsåret " + esc(lasaret(a)) + ". Bara de program som har båda " +
      "talen.</caption>";
    t += "<thead><tr><th scope=\"col\">Program</th>" +
      "<th scope=\"col\">Platser</th>" +
      "<th scope=\"col\">Elever i årskurs 1</th>" +
      "<th scope=\"col\">Skillnad</th></tr></thead><tbody>";
    rader.forEach(function (r) {
      t += "<tr><th scope=\"row\">" + esc(r.namn) + "</th><td>" +
        talSv(r.platser) + "</td><td>" + talSv(r.borjade) + "</td><td>" +
        tecknat(r.skillnad) + "</td></tr>";
    });
    t += "</tbody><tfoot><tr><th scope=\"row\">Summa</th><td>" +
      talSv(j.platser) + "</td><td>" + talSv(j.borjade) + "</td><td>" +
      tecknat(j.skillnad) + "</td></tr></tfoot>";
    el("tabell-skillnad").innerHTML = t;

    K.sattDataNot("not-skillnad",
      "Summan täcker programmen i tabellen, på båda sidorna. Skolverkets " +
      "egen summering för nationella program är högre: den räknar också " +
      "program vid skolorna som inte står i nämndens utbudsbeslut.");
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

    var ar = elevar();
    if (ar) {
      var senaste = String(ar[ar.length - 1]);
      var summa = borjadeSumma(senaste);
      if (summa !== null) {
        punkter.push("Läsåret " + esc(lasaret(ar[ar.length - 1])) +
          ", det senast räknade, gick <strong>" + talSv(summa) + " elever" +
          "</strong> i årskurs 1 på de programmen.");
      }
    }

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

    if (DATA.borjade && DATA.borjade.kallor.length) {
      var elevkallor = DATA.borjade.kallor;
      var senast = elevkallor[elevkallor.length - 1];
      el("lista-kallor-elever").innerHTML = K.kallpost({
        titel: senast.rapportTitel,
        detalj: senast.kalla + ", läsåren " + elevkallor[0].lasar + "–" +
          senast.lasar + ", hämtade " + senast.hamtad,
        lankar: [[senast.statistikUrl, "Sök statistiken hos Skolverket"],
                 [senast.kallaUrl, "Uttaget för läsåret " + senast.lasar +
                  " (CSV)"]]
      });
    } else {
      el("lista-kallor-elever").hidden = true;
    }

    el("sektion-kallor").hidden = false;
    el("om-uppdaterad").textContent =
      "Handlingarna hämtades " + DATA.kallor[0].hamtad + ". Sidan omfattar " +
      DATA.kallor.length + " läsårs utbudsbeslut" +
      (DATA.borjade ? " och " + DATA.borjade.ar.length +
        " läsårs elevstatistik" : "") + ".";
  }

  function initOvriga() {
    var rader = ovriga();
    if (!rader.length) return;
    arsTabell("tabell-ovriga", {
      rubrik: "Utbildningar utanför de nationella programmen. De " +
        "redovisas bara i de handlingar som har bilagans tabellform, och " +
        "tomma fält betyder att handlingen inte tar upp dem – inte att de " +
        "lagts ned. De har inga elevtal: Skolverkets rapport redovisar dem " +
        "inte som program med årskurser.",
      kolumner: ["Utbildning"],
      ar: DATA.ar,
      rader: rader.map(function (p) {
        return {
          celler: [p.namn],
          tal: function (a) { return p.varden[a] ? p.varden[a].platser : null; }
        };
      })
    });
    el("sektion-ovriga").hidden = false;
  }

  function initMeta() {
    K.visaMeta({
      kalla: "Nämnden för Gymnasium & Arbetsmarknad, Kungsbacka kommun" +
        (DATA.borjade ? " och Skolverket" : ""),
      period: "läsåren " + lasarsspann(DATA.ar),
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

    /* Läsårsväljaren har bara de år som har båda måtten. Saknas de –
       elevstatistiken är ett eget hämtsteg – står avsnittet kvar dolt. */
    var jamforbaraAr = skillnadsar();
    if (jamforbaraAr.length) {
      K.fyllValjare(el("ar-valjare"), jamforbaraAr.slice().reverse(), lasaret);
      K.kopplaValjare(el("ar-valjare"), "year", ritaSkillnad);
      el("sektion-skillnad").hidden = false;
    }

    el("sektion-utveckling").hidden = false;
    el("sektion-total").hidden = false;

    initKortSagt();
    initMeta();
    ritaUtveckling();
    ritaBorjade();
    ritaBorjadeTotal();
    ritaTotal();
    if (jamforbaraAr.length) ritaSkillnad();
    initOvriga();
    initKallor();
  }

  K.starta("data-platser.json", {
    tomt: function (data) { return !data.program || !data.program.length; },
    tomtText: "Nämndens utbudsbeslut håller på att läsas in.",
    init: init
  });
})();
