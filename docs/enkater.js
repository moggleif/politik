/* Elevenkäter i Kungsbackas skolor.
   Läser docs/data-enkater.json, byggd av scripts/build_enkater.py.

   Två enkäter i samma diagram men skilda åt: Skolenkäten (blå, cirkel) och
   Göteborgsregionens regiongemensamma enkät (orange, triangel). Kommun- och
   rikesreferenserna är tunna linjer med egen punktform och streckning –
   ingen information bärs av färgen ensam.

   Linjer dras bara inom ett *segment*: byggskriptet delar varje serie där
   skalan eller frågorna ändrats, där ett värde är dolt eller där mer än två
   år saknas. Varje segment är en egen dataserie med spanGaps, så att Chart.js
   binder ihop punkterna inom segmentet (Skolenkäten görs vartannat år, och
   året emellan har ingen punkt) men aldrig över ett brott. */
(function () {
  "use strict";

  var K = window.KIS;
  var FARG = K.FARG;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;

  var DATAFIL = "data-enkater.json";
  var DATA = null;
  var GRUPP = {};
  var SKOLA = {};
  var OMRADE = {};
  var AR = [];

  /* Områdena som får en egen kolumn i översiktstabellen. Bemötande utelämnas:
     det är två områden (elever och lärare) som inte går att slå ihop. */
  var OVERSIKT = ["trygghet", "studiero", "stöd", "stimulans", "inflytande",
    "elevhälsa", "kränkningar", "information_bedömning", "nöjdhet"];

  var BROTT_TEXT = {
    skala: "skalbyte",
    fragor: "nya frågor eller ny beräkning",
    glapp: "mer än två år utan mätning"
  };

  var jamforRuta = [];      // [{ id, namn }] i rutornas ordning
  var skolPaneler = [];     // canvas-id:n som skolsidan ritat, för att kunna ta bort dem

  /* ---------- Uppslag i datat ---------- */

  function serierFor(enhet, grupp, kalla) {
    var lista = (DATA.serier[enhet] && DATA.serier[enhet][grupp]) || [];
    return kalla ? lista.filter(function (s) { return s.kalla === kalla; }) : lista;
  }

  function senaste(serie) {
    for (var i = serie.punkter.length - 1; i >= 0; i--) {
      if (serie.punkter[i][1] !== null) return serie.punkter[i];
    }
    return null;
  }

  function punktI(serie, ar) {
    for (var i = 0; i < serie.punkter.length; i++) {
      if (serie.punkter[i][0] === ar) return serie.punkter[i];
    }
    return null;
  }

  function senasteAr(serier) {
    var ar = null;
    serier.forEach(function (s) {
      var p = senaste(s);
      if (p && (ar === null || p[0] > ar)) ar = p[0];
    });
    return ar;
  }

  /* Den serie i ett område som ska stå i en tabellcell: bland de som har ett
     värde det året föredras den som heter som området. */
  function valjSerie(serier, omrade, ar) {
    var namn = OMRADE[omrade] ? OMRADE[omrade].toLowerCase() : "";
    var kand = serier.filter(function (s) {
      if (s.omrade !== omrade) return false;
      var p = punktI(s, ar);
      return p && p[1] !== null;
    });
    if (!kand.length) return null;
    kand.sort(function (a, b) {
      var ma = a.serie.toLowerCase() === namn ? 0 : 1;
      var mb = b.serie.toLowerCase() === namn ? 0 : 1;
      return ma - mb || a.serie.localeCompare(b.serie, "sv");
    });
    return kand[0];
  }

  function vard(v) { return v === null ? ".." : talSv(v, 1); }

  function grupperMedData() {
    return DATA.grupper.filter(function (g) {
      return Object.keys(DATA.serier).some(function (e) {
        return DATA.serier[e][g.id] && DATA.serier[e][g.id].length;
      });
    });
  }

  function gruppNamn(g) {
    return g.namn + (g.svagare ? " – mindre tillförlitligt" : "");
  }

  function svagNot(grupp) {
    return GRUPP[grupp] && GRUPP[grupp].svagare
      ? "<strong>Vårdnadshavarnas svar är mindre tillförlitliga.</strong> Alla " +
        "vårdnadshavare på en skolenhet har samma inloggning, så svarsfrekvensen " +
        "är bara uppskattad och samma person kan ha svarat flera gånger. " +
        "Svarsfrekvensen är dessutom låg. Läs siffrorna med försiktighet."
      : "";
  }

  /* ---------- Översikten ---------- */

  function ritaOversikt() {
    var g = el("grupp-valjare").value;
    var hm = el("huvudman-valjare").value;
    var sf = el("skolform-valjare").value;
    var rubrik = "<thead><tr><th scope=\"col\">Skola</th><th scope=\"col\">Huvudman</th>" +
      "<th scope=\"col\">Mätår</th><th scope=\"col\">Antal svar</th>" +
      OVERSIKT.map(function (o) {
        return "<th scope=\"col\">" + esc(OMRADE[o]) + "</th>";
      }).join("") + "</tr></thead>";

    function rad(namnHtml, huvudman, serier) {
      var ar = senasteAr(serier);
      if (ar === null) return null;
      var n = 0;
      var celler = OVERSIKT.map(function (o) {
        var s = valjSerie(serier, o, ar);
        if (!s) return "<td>&ndash;</td>";
        var p = punktI(s, ar);
        if (p[2]) n = Math.max(n, p[2]);
        return "<td>" + esc(vard(p[1])) + "</td>";
      }).join("");
      return "<tr><th scope=\"row\">" + namnHtml + "</th><td>" + esc(huvudman) +
        "</td><td>" + esc(ar) + "</td><td>" + (n ? esc(n) : "&ndash;") + "</td>" +
        celler + "</tr>";
    }

    var rader = [];
    [["kungsbacka", "Kungsbacka kommun (Skolenkäten)"], ["riket", "Riket (Skolenkäten)"]]
      .forEach(function (par) {
        var r = rad(esc(par[1]), "Jämförelse", serierFor(par[0], g, "SI"));
        if (r) rader.push(r);
      });
    var antalSkolor = 0;
    DATA.skolor.forEach(function (s) {
      if (hm !== "alla" && s.huvudman.toLowerCase() !== hm) return;
      if (sf !== "alla" && s.skolform.indexOf(sf) === -1) return;
      var r = rad("<a href=\"enkater.html?skola=" + encodeURIComponent(s.id) +
        "&amp;sgrupp=" + encodeURIComponent(g) + "#sektion-skola\">" +
        esc(s.namn) + "</a>", s.huvudman, serierFor(s.id, g, "SI"));
      if (r) { rader.push(r); antalSkolor++; }
    });
    el("tabell-oversikt").innerHTML = rubrik + "<tbody>" + rader.join("") + "</tbody>";
    K.sattDataNot("not-oversikt", svagNot(g) || (antalSkolor === 0
      ? "Inga skolor har svar i Skolenkäten för den här gruppen med de valda filtren." : ""));
    el("kalla-oversikt").textContent = "Källa: Skolinspektionens Skolenkät. " +
      antalSkolor + " skolor. Index 0–10; \"..\" betyder att Skolinspektionen inte " +
      "redovisar värdet (färre än fem svar), \"–\" att området inte finns det året.";
  }

  /* ---------- Diagramhjälpare ---------- */

  function stilar() {
    return {
      skola: { farg: FARG.blaMork, punkt: "circle", streck: [], bredd: 3, radie: 5 },
      kommunSI: { farg: FARG.ink2, punkt: "rect", streck: [7, 4], bredd: 2, radie: 4 },
      riket: { farg: FARG.muted, punkt: "crossRot", streck: [2, 3], bredd: 1.5, radie: 5 },
      kommunGR: { farg: FARG.orange, punkt: "triangle", streck: [], bredd: 2, radie: 5 },
      gr: { farg: FARG.orangeMork, punkt: "star", streck: [2, 3], bredd: 1.5, radie: 5 }
    };
  }

  /* En dataserie per segment. Datamängden har ett värde per år i skalan,
     null utanför segmentet; spanGaps binder ihop punkterna inom det. */
  function segmentSerier(serie, etikett, stil) {
    var segment = {};
    serie.punkter.forEach(function (p) {
      (segment[p[3]] = segment[p[3]] || []).push(p);
    });
    var forsta = true;
    return Object.keys(segment).map(function (k) {
      var pt = segment[k];
      if (pt.every(function (p) { return p[1] === null; })) return null;
      var ds = {
        label: etikett,
        forstaISerie: forsta,
        data: AR.map(function (a) {
          for (var i = 0; i < pt.length; i++) if (pt[i][0] === a) return pt[i][1];
          return null;
        }),
        antal: AR.map(function (a) {
          for (var i = 0; i < pt.length; i++) if (pt[i][0] === a) return pt[i][2];
          return null;
        }),
        borderColor: stil.farg,
        backgroundColor: stil.farg,
        borderDash: stil.streck,
        borderWidth: stil.bredd,
        pointStyle: stil.punkt,
        pointRadius: stil.radie,
        pointHoverRadius: stil.radie + 3,
        pointBorderColor: stil.farg,
        pointBorderWidth: 1,
        spanGaps: true,
        tension: 0
      };
      forsta = false;
      return ds;
    }).filter(function (d) { return d !== null; });
  }

  function diagramOptions(ytitel) {
    var opt = K.arsOptions({
      ytitel: ytitel,
      etikett: function (it) {
        var n = it.dataset.antal[it.dataIndex];
        var rad = it.dataset.label + ": " + talSv(it.parsed.y, 1);
        return n ? rad + " (" + n + " svar)" : rad;
      }
    });
    opt.scales.y.min = 0;
    opt.scales.y.max = 10;
    opt.plugins.legend = {
      display: true,
      position: "bottom",
      labels: {
        usePointStyle: true,
        filter: function (item, data) {
          return data.datasets[item.datasetIndex].forstaISerie;
        }
      },
      onClick: function (e, item, legend) {
        var c = legend.chart;
        var etikett = c.data.datasets[item.datasetIndex].label;
        var synlig = c.isDatasetVisible(item.datasetIndex);
        c.data.datasets.forEach(function (ds, i) {
          if (ds.label === etikett) c.setDatasetVisibility(i, !synlig);
        });
        c.update();
      }
    };
    return opt;
  }

  function brottText(lista) {
    var delar = [];
    lista.forEach(function (s) {
      (s.brott || []).forEach(function (b) {
        delar.push(s.etikett + " " + b[0] + " (" + BROTT_TEXT[b[1]] + ")");
      });
    });
    return delar.length ? "Linjen bryts: " + delar.join("; ") + "." : "";
  }

  /* ---------- En skola över tid ---------- */

  function skolPaneler_(skolId, grupp) {
    var st = stilar();
    var linjekallor = [
      { enhet: skolId, kalla: "SI", stil: st.skola, namn: SKOLA[skolId].namn + " (Skolenkäten)" },
      { enhet: "kungsbacka", kalla: "SI", stil: st.kommunSI, namn: "Kungsbacka kommun (Skolenkäten)" },
      { enhet: "riket", kalla: "SI", stil: st.riket, namn: "Riket (Skolenkäten)" },
      { enhet: "kungsbacka", kalla: "GR", stil: st.kommunGR, namn: "Kungsbacka kommun (regiongemensam enkät)" },
      { enhet: "gr", kalla: "GR", stil: st.gr, namn: "Göteborgsregionen (regiongemensam enkät)" }
    ];
    var paneler = {};
    var ordning = [];
    var skolHarData = serierFor(skolId, grupp, "SI").length > 0;
    linjekallor.forEach(function (k) {
      serierFor(k.enhet, grupp, k.kalla).forEach(function (s) {
        // Bara skolans egna områden när skolan har data; annars kommunens.
        if (skolHarData && !serierFor(skolId, grupp, "SI").some(function (t) { return t.serie === s.serie; })) return;
        var nyckel = s.omrade + "|" + s.serie;
        if (!paneler[nyckel]) {
          paneler[nyckel] = { omrade: s.omrade, serie: s.serie, linjer: [] };
          ordning.push(nyckel);
        }
        paneler[nyckel].linjer.push({ serie: s, stil: k.stil, etikett: k.namn, kalla: k.kalla, enhet: k.enhet });
      });
    });
    var omradeOrdning = DATA.omraden.map(function (o) { return o.id; });
    ordning.sort(function (a, b) {
      var pa = paneler[a], pb = paneler[b];
      return omradeOrdning.indexOf(pa.omrade) - omradeOrdning.indexOf(pb.omrade) ||
        pa.serie.localeCompare(pb.serie, "sv");
    });
    return { paneler: ordning.map(function (n) { return paneler[n]; }), skolHarData: skolHarData };
  }

  function ritaSkola() {
    var skolId = el("skola-valjare").value;
    var grupp = el("skolgrupp-valjare").value;
    skolPaneler.forEach(K.taBortDiagram);
    skolPaneler = [];
    var res = skolPaneler_(skolId, grupp);
    var rutnat = el("diagram-rutnat");
    rutnat.innerHTML = res.paneler.map(function (p, i) {
      var undertitel = p.omrade === "ovrigt" ? "Område som inte harmoniserats"
        : OMRADE[p.omrade] !== p.serie ? "Område: " + OMRADE[p.omrade] : "";
      return "<div class=\"kort diagramkort\"><h3>" + esc(p.serie) + "</h3>" +
        (undertitel ? "<p class=\"kalla-rad\">" + esc(undertitel) + "</p>" : "") +
        "<div class=\"diagram-wrap\"><canvas id=\"diagram-omrade-" + i +
        "\" role=\"img\" aria-label=\"Diagram: " + esc(p.serie) + " över tid\"></canvas></div>" +
        "<p class=\"kalla-rad\" id=\"brott-omrade-" + i + "\"></p></div>";
    }).join("");

    var skolnoter = [];
    if (!res.skolHarData) {
      skolnoter.push("<strong>Skolan har inga värden i Skolenkäten för den här gruppen.</strong> " +
        "Bara jämförelserna för Kungsbacka kommun visas.");
    }
    var sv = svagNot(grupp);
    if (sv) skolnoter.push(sv);
    K.sattDataNot("not-skola", skolnoter.join(" "));

    res.paneler.forEach(function (p, i) {
      var id = "diagram-omrade-" + i;
      var dataset = [];
      p.linjer.forEach(function (l) {
        dataset = dataset.concat(segmentSerier(l.serie, l.etikett, l.stil));
      });
      var chart = K.rita(id, {
        type: "line",
        data: { labels: AR.map(String), datasets: dataset },
        options: diagramOptions("Index 0–10")
      }, 340);
      K.aktiveraToning(chart, true);
      skolPaneler.push(id);
      el("brott-omrade-" + i).textContent = brottText(p.linjer.map(function (l) {
        return { etikett: l.etikett, brott: l.serie.brott };
      }));
    });

    tabellSkola(res.paneler);
    el("kalla-skola").textContent = "Källa: Skolinspektionens Skolenkät och Göteborgsregionens " +
      "regiongemensamma elevenkät. \"..\" betyder att värdet inte redovisas, \"–\" att " +
      "området inte mättes det året.";
  }

  function tabellSkola(paneler) {
    var rubrik = "<thead><tr><th scope=\"col\">Frågeområde och källa</th>" +
      AR.map(function (a) { return "<th scope=\"col\">" + esc(a) + "</th>"; }).join("") +
      "</tr></thead>";
    var rader = [];
    paneler.forEach(function (p) {
      p.linjer.forEach(function (l) {
        rader.push("<tr><th scope=\"row\">" + esc(p.serie + " – " + l.etikett) + "</th>" +
          AR.map(function (a) {
            var pt = punktI(l.serie, a);
            return "<td>" + (pt ? esc(vard(pt[1])) : "&ndash;") + "</td>";
          }).join("") + "</tr>");
      });
    });
    el("tabell-skola").innerHTML = rubrik + "<tbody>" + rader.join("") + "</tbody>";
  }

  /* ---------- Jämförelse ---------- */

  function jamforSkolor(grupp, omrade) {
    return DATA.skolor.filter(function (s) {
      return serierFor(s.id, grupp, "SI").some(function (x) { return x.omrade === omrade; });
    });
  }

  function valdaJamfor() {
    var rutor = el("jamforval-rutor").querySelectorAll("input[type=checkbox]");
    var ids = [];
    Array.prototype.forEach.call(rutor, function (r) {
      if (r.checked) ids.push(r.value);
    });
    return ids;
  }

  function uppdateraJamforAntal() {
    var rutor = el("jamforval-rutor").querySelectorAll("input[type=checkbox]");
    el("jamforval-antal").textContent = valdaJamfor().length + " av " + rutor.length +
      " skolor visas";
  }

  var MARKE = {
    circle: "●", rect: "■", triangle: "▲", rectRot: "◆",
    cross: "✚", crossRot: "✖", star: "★"
  };

  function byggJamforRutor(skolor, valda) {
    var plats = el("jamforval-rutor");
    plats.innerHTML = "";
    skolor.forEach(function (s, i) {
      var stil = K.serieStilPunkt(i);
      var ruta = document.createElement("div");
      ruta.className = "distriktval-ruta";
      var kryss = document.createElement("input");
      kryss.type = "checkbox";
      kryss.id = "jamfor-" + s.id;
      kryss.value = s.id;
      kryss.checked = valda.indexOf(s.id) !== -1;
      kryss.addEventListener("change", function () {
        K.urlSatt({ jamfor: valdaJamfor().join(",") || "ingen" });
        ritaJamforDiagram();
      });
      var etikett = document.createElement("label");
      etikett.htmlFor = kryss.id;
      var marke = document.createElement("span");
      marke.setAttribute("aria-hidden", "true");
      marke.style.color = stil.farg;
      marke.textContent = (MARKE[stil.punkt] || MARKE.circle) + " ";
      etikett.appendChild(marke);
      etikett.appendChild(document.createTextNode(s.namn));
      ruta.appendChild(kryss);
      ruta.appendChild(etikett);
      plats.appendChild(ruta);
    });
    jamforRuta = skolor.map(function (s) { return { id: s.id, namn: s.namn }; });
  }

  function ritaJamfor() {
    var grupp = el("jamforgrupp-valjare").value;
    var omrade = el("omrade-valjare").value;
    var skolor = jamforSkolor(grupp, omrade);
    var url = K.urlLas("jamfor");
    var valda;
    if (url === "ingen") valda = [];
    else if (url) {
      valda = url.split(",").filter(function (id) {
        return skolor.some(function (s) { return s.id === id; });
      });
    } else {
      valda = skolor.slice(0, 4).map(function (s) { return s.id; });
    }
    byggJamforRutor(skolor, valda);
    ritaJamforDiagram();
  }

  function ritaJamforDiagram() {
    var grupp = el("jamforgrupp-valjare").value;
    var omrade = el("omrade-valjare").value;
    var valda = valdaJamfor();
    uppdateraJamforAntal();
    var dataset = [];
    var brott = [];
    var tabellrader = [];
    jamforRuta.forEach(function (rad, i) {
      if (valda.indexOf(rad.id) === -1) return;
      var stil = K.serieStilPunkt(i);
      var serier = serierFor(rad.id, grupp, "SI").filter(function (s) { return s.omrade === omrade; });
      serier.forEach(function (s, j) {
        var etikett = rad.namn + (serier.length > 1 ? " – " + s.serie : "");
        var st = { farg: stil.farg, punkt: stil.punkt, streck: j ? [7, 4] : [], bredd: 2, radie: 4 };
        dataset = dataset.concat(segmentSerier(s, etikett, st));
        brott.push({ etikett: etikett, brott: s.brott });
        tabellrader.push([etikett, s]);
      });
    });
    var kom = serierFor("kungsbacka", grupp, "SI").filter(function (s) { return s.omrade === omrade; });
    kom.forEach(function (s) {
      var etikett = "Kungsbacka kommun" + (kom.length > 1 ? " – " + s.serie : "");
      dataset = dataset.concat(segmentSerier(s, etikett, stilar().kommunSI));
      tabellrader.push([etikett, s]);
    });
    var chart = K.rita("diagram-jamfor", {
      type: "line",
      data: { labels: AR.map(String), datasets: dataset },
      options: diagramOptions("Index 0–10")
    }, 420);
    K.aktiveraToning(chart, true);
    el("kalla-jamfor").textContent = "Källa: Skolinspektionens Skolenkät, " +
      (GRUPP[grupp] ? GRUPP[grupp].namn.toLowerCase() : "") + ", " +
      (OMRADE[omrade] || omrade).toLowerCase() + ". " + brottText(brott);
    K.sattDataNot("not-jamfor", svagNot(grupp));
    el("tabell-jamfor").innerHTML = "<thead><tr><th scope=\"col\">Skola</th>" +
      AR.map(function (a) { return "<th scope=\"col\">" + esc(a) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + tabellrader.map(function (t) {
        return "<tr><th scope=\"row\">" + esc(t[0]) + "</th>" + AR.map(function (a) {
          var pt = punktI(t[1], a);
          return "<td>" + (pt ? esc(vard(pt[1])) : "&ndash;") + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody>";
  }

  function fyllOmradeValjare() {
    var grupp = el("jamforgrupp-valjare").value;
    var finns = {};
    DATA.skolor.forEach(function (s) {
      serierFor(s.id, grupp, "SI").forEach(function (x) { finns[x.omrade] = true; });
    });
    var val = el("omrade-valjare").value;
    var lista = DATA.omraden.filter(function (o) { return finns[o.id]; }).map(function (o) { return o.id; });
    K.fyllValjare(el("omrade-valjare"), lista, function (id) { return OMRADE[id]; });
    if (lista.indexOf(val) !== -1) el("omrade-valjare").value = val;
  }

  /* ---------- Kort sagt, noter, källor ---------- */

  function kortSagt() {
    var punkter = [];
    var kom = serierFor("kungsbacka", "elever-ak8", "SI");
    var arSI = {};
    Object.keys(DATA.serier.kungsbacka).forEach(function (g) {
      serierFor("kungsbacka", g, "SI").forEach(function (s) {
        s.punkter.forEach(function (p) { arSI[p[0]] = true; });
      });
    });
    var arLista = Object.keys(arSI).map(Number).sort(function (a, b) { return a - b; });
    punkter.push("<strong>" + DATA.skolor.length + " skolor</strong> har svar i Skolenkäten. " +
      "Kungsbacka kommun deltog åren " + esc(arLista.join(", ")) + ". Den regiongemensamma " +
      "enkäten finns bara för kommunen som helhet, åren " + esc(gruppAr("GR").join(", ")) + ".");
    var tr = valjSerie(kom, "trygghet", senasteAr(kom));
    var trRiket = valjSerie(serierFor("riket", "elever-ak8", "SI"), "trygghet", senasteAr(kom));
    if (tr && trRiket) {
      var ar = senasteAr(kom);
      punkter.push("Skolenkäten " + esc(ar) + ", elever i åk 8: kommunens tryggthetsindex var <strong>" +
        talSv(punktI(tr, ar)[1], 1) + "</strong> mot <strong>" + talSv(punktI(trRiket, ar)[1], 1) +
        "</strong> i riket (skala 0–10).");
    }
    var gk = serierFor("kungsbacka", "elever-ak8", "GR");
    var gg = serierFor("gr", "elever-ak8", "GR");
    var gar = senasteAr(gk);
    var gtr = valjSerie(gk, "trygghet", gar);
    var ggtr = valjSerie(gg, "trygghet", gar);
    if (gtr && ggtr) {
      punkter.push("Regiongemensam elevenkät " + esc(gar) + ", elever i åk 8: Kungsbackas trygghet var <strong>" +
        talSv(punktI(gtr, gar)[1], 1) + "</strong> mot <strong>" + talSv(punktI(ggtr, gar)[1], 1) +
        "</strong> för Göteborgsregionen. Siffrorna är omräknade från 0–100 och kan inte " +
        "jämföras med Skolenkätens.");
    }
    var antal = 0, medBrott = 0;
    Object.keys(DATA.serier).forEach(function (e) {
      Object.keys(DATA.serier[e]).forEach(function (g) {
        DATA.serier[e][g].forEach(function (s) { antal++; if (s.brott && s.brott.length) medBrott++; });
      });
    });
    punkter.push(medBrott + " av " + antal + " tidsserier har ett eller flera brott där enkäten " +
      "bytt skala eller frågor eller där mer än två år saknas. Linjerna bryts där, " +
      "och inget räknas ut för åren däremellan.");
    K.visaKortSagt(punkter);
  }

  function gruppAr(kalla) {
    var ar = {};
    Object.keys(DATA.serier).forEach(function (e) {
      Object.keys(DATA.serier[e]).forEach(function (g) {
        DATA.serier[e][g].forEach(function (s) {
          if (s.kalla !== kalla) return;
          s.punkter.forEach(function (p) { if (p[1] !== null) ar[p[0]] = true; });
        });
      });
    });
    return Object.keys(ar).map(Number).sort(function (a, b) { return a - b; });
  }

  function noter() {
    var u = DATA.uteslutna.map(function (x) {
      return esc(x.kalla) + " " + esc(x.ar) + ", " + esc(x.arskurs) + ": " + esc(x.orsak);
    });
    K.sattDataNot("not-brott", u.length
      ? "<strong>Rader som uteslutits:</strong> " + u.join("; ") + ". De finns kvar i den " +
        "nedladdningsbara filen men ritas inte."
      : "");
  }

  function kallor() {
    el("lista-kallor").innerHTML = DATA.kallor.slice().reverse().map(function (k) {
      return K.kallpost({
        titel: (k.kalla === "gr" ? "Regiongemensam elevenkät " : "Skolenkäten ") + k.omgang,
        detalj: k.fil + (k.hamtad ? ", hämtad " + k.hamtad : ""),
        lankar: [[k.url, "Original hos källan"]]
      });
    }).join("");
  }

  /* ---------- Start ---------- */

  function start(data) {
    DATA = data;
    AR = K.arsskala(DATA.ar);
    DATA.grupper.forEach(function (g) { GRUPP[g.id] = g; });
    DATA.skolor.forEach(function (s) { SKOLA[s.id] = s; });
    DATA.omraden.forEach(function (o) { OMRADE[o.id] = o.namn; });

    K.visaMeta({
      kalla: "Skolinspektionen (Skolenkäten), Göteborgsregionen (regiongemensam elevenkät)",
      period: DATA.ar[0] + "–" + DATA.ar[1],
      senaste: String(DATA.ar[1]),
      hamtad: DATA.hamtad
    });

    var grupper = grupperMedData();
    var gid = grupper.map(function (g) { return g.id; });
    var gnamn = function (id) { return gruppNamn(GRUPP[id]); };
    var skolGrupper = grupper.filter(function (g) {
      return DATA.skolor.some(function (s) { return serierFor(s.id, g.id, "SI").length; });
    }).map(function (g) { return g.id; });

    K.fyllValjare(el("grupp-valjare"), skolGrupper, gnamn);
    el("grupp-valjare").value = skolGrupper.indexOf("elever-ak8") !== -1 ? "elever-ak8" : skolGrupper[0];
    K.fyllValjare(el("huvudman-valjare"), ["alla", "kommunal", "fristående"],
      function (v) { return { alla: "Alla", kommunal: "Kommunala", "fristående": "Fristående" }[v]; });
    K.fyllValjare(el("skolform-valjare"), ["alla", "grundskola", "gymnasium"],
      function (v) { return { alla: "Alla", grundskola: "Grundskola", gymnasium: "Gymnasium" }[v]; });
    K.kopplaValjare(el("grupp-valjare"), "grupp", ritaOversikt);
    K.kopplaValjare(el("huvudman-valjare"), "huvudman", ritaOversikt);
    K.kopplaValjare(el("skolform-valjare"), "skolform", ritaOversikt);

    K.fyllValjare(el("skola-valjare"), DATA.skolor.map(function (s) { return s.id; }),
      function (id) { return SKOLA[id].namn; });
    el("skola-valjare").value = SKOLA.kollaskolan ? "kollaskolan" : DATA.skolor[0].id;
    K.fyllValjare(el("skolgrupp-valjare"), gid, gnamn);
    el("skolgrupp-valjare").value = gid.indexOf("elever-ak8") !== -1 ? "elever-ak8" : gid[0];
    K.kopplaValjare(el("skola-valjare"), "skola", ritaSkola);
    K.kopplaValjare(el("skolgrupp-valjare"), "sgrupp", ritaSkola);

    K.fyllValjare(el("jamforgrupp-valjare"), skolGrupper, gnamn);
    el("jamforgrupp-valjare").value = skolGrupper.indexOf("elever-ak8") !== -1 ? "elever-ak8" : skolGrupper[0];
    K.kopplaValjare(el("jamforgrupp-valjare"), "jgrupp", function () {
      fyllOmradeValjare();
      ritaJamfor();
    });
    fyllOmradeValjare();
    el("omrade-valjare").value = "trygghet";
    K.kopplaValjare(el("omrade-valjare"), "omrade", ritaJamfor);
    el("knapp-jamfor-rensa").addEventListener("click", function () {
      K.urlSatt({ jamfor: "ingen" });
      ritaJamfor();
    });
    el("knapp-jamfor-alla").addEventListener("click", function () {
      K.urlSatt({ jamfor: jamforRuta.map(function (r) { return r.id; }).join(",") });
      ritaJamfor();
    });
    K.urlLyssna(ritaJamfor);

    /* Sektionerna visas innan diagrammen ritas: ett diagram på en dold
       canvas får bredd noll. */
    ["oversikt", "skola", "jamfor", "ladda", "kallor", "om"].forEach(function (id) {
      el("sektion-" + id).hidden = false;
    });

    kortSagt();
    noter();
    kallor();
    ritaOversikt();
    ritaSkola();
    ritaJamfor();
    el("om-uppdaterad").textContent = "Datat på den här sidan hämtades " + (DATA.hamtad || "") + ".";

  }

  K.starta(DATAFIL, { init: start });
})();
