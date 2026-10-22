/* Feriejobb för gymnasieettorna — sökande, tillsatta jobb och anmälda
   platser år för år, feriearbetarnas svar i kommunens enkät och de
   sommarjobb för unga som Vård & Omsorg har utöver feriejobben.
   Läser docs/data-feriejobb.json, byggd av scripts/build_feriejobb.py
   ur data/feriejobb/uppgifter.json.

   Ett år där handlingarna anger olika tal har inget eget värde: linjen
   bryts där, och ett lodstreck går från det lägsta till det högsta
   talet. Sidan väljer aldrig ett av talen. */
(function () {
  "use strict";

  var K = window.KIS;
  var el = K.el;
  var esc = K.esc;
  var talSv = K.talSv;

  var DATAFIL = "data-feriejobb.json";

  var MANAD = ["januari", "februari", "mars", "april", "maj", "juni", "juli",
               "augusti", "september", "oktober", "november", "december"];

  var data = null;

  function datumSv(iso) {
    var d = String(iso).split("-");
    return parseInt(d[2], 10) + " " + MANAD[parseInt(d[1], 10) - 1] + " " + d[0];
  }

  function varde(matt, ar) { return data.varden[matt][String(ar)]; }

  /* "403 eller 422" där källorna säger olika, annars talet. */
  function talet(v) {
    return v.uppgifter.map(function (u) { return talSv(u.varde); }).join(" eller ");
  }

  /* Ett medelvärde med så många decimaler som källan gav: 4 är inte 4,00. */
  function medel(v) {
    var dec = String(v).split(".")[1];
    return talSv(v, dec ? dec.length : 0);
  }

  function fotnoter(nr) {
    return nr.map(function (n) {
      return '<a class="fotnot" href="#kalla-' + esc(n) + '" aria-label="Källa ' +
        esc(n) + '">[' + esc(n) + "]</a>";
    }).join("");
  }

  function upprakning(delar) {
    if (delar.length < 2) return delar.join("");
    return delar.slice(0, -1).join(", ") + " och " + delar[delar.length - 1];
  }

  /* ---------- Diagrammet ----------
     Sökande är den blå linjen, tillsatta jobb en mörkgrå streckad och de
     anmälda platserna ihåliga romber utan linje – färg, streckning och
     punktform skiljer måtten åt var för sig. Varje punkt bär sitt tal,
     så att diagrammet går att läsa utan att peka. */

  var STIL = {
    sokande: { farg: K.FARG.bla, text: K.FARG.blaMork, streck: [], punkt: "circle", lage: "over" },
    tillsatta: { farg: K.FARG.ink2, text: K.FARG.ink2, streck: [7, 4], punkt: "rect", lage: "under" },
    platser: { farg: K.FARG.muted, text: K.FARG.muted, streck: [], punkt: "rectRot", lage: "hoger", ihalig: true }
  };

  /* Talet bredvid punkten: ovanför, under eller till höger. */
  function skrivTal(rit, text, x, y, lage) {
    if (lage === "hoger") {
      rit.textAlign = "left";
      rit.textBaseline = "middle";
      rit.fillText(text, x + 9, y);
    } else {
      rit.textAlign = "center";
      rit.textBaseline = lage === "over" ? "bottom" : "top";
      rit.fillText(text, x, lage === "over" ? y - 8 : y + 8);
    }
  }

  /* Ett lodstreck med tvärslåar från det lägsta till det högsta talet. */
  function ritaSpann(rit, x, y1, y2) {
    rit.beginPath();
    rit.moveTo(x, y1);
    rit.lineTo(x, y2);
    rit.moveTo(x - 5, y1);
    rit.lineTo(x + 5, y1);
    rit.moveTo(x - 5, y2);
    rit.lineTo(x + 5, y2);
    rit.stroke();
  }

  /* Chart.js-plugin utan externt beroende: talen och spannen ritas ovanpå
     linjerna. Det som ritats sparas i chart.$etiketter, så att det går att
     kontrollera i test – en canvas går annars inte att läsa utifrån. */
  var talEtiketter = {
    id: "talEtiketter",
    afterDatasetsDraw: function (chart) {
      var rit = chart.ctx;
      var x = chart.scales.x, y = chart.scales.y;
      chart.$etiketter = [];
      rit.save();
      rit.font = "600 " + (chart.width < 500 ? 10 : 12) + "px system-ui, sans-serif";
      rit.lineWidth = 2;
      chart.data.datasets.forEach(function (ds, i) {
        if (!chart.isDatasetVisible(i)) return;
        var stil = STIL[ds.matt];
        rit.fillStyle = stil.text;
        rit.strokeStyle = stil.farg;
        data.ar.forEach(function (a, j) {
          var v = varde(ds.matt, a);
          if (!v) return;
          var px = x.getPixelForValue(j);
          var text = v.olika ? talSv(v.lag) + "–" + talSv(v.hog) : talSv(v.lag);
          var lag = y.getPixelForValue(v.lag), hog = y.getPixelForValue(v.hog);
          if (v.olika) ritaSpann(rit, px, lag, hog);
          skrivTal(rit, text, px, stil.lage === "under" ? lag : hog, stil.lage);
          chart.$etiketter.push({ matt: ds.matt, ar: a, text: text });
        });
      });
      rit.restore();
    }
  };

  function ritaUtveckling() {
    var dataset = data.matt.map(function (m) {
      var stil = STIL[m.id];
      var linje = K.linjeSerie(m.namn, stil.farg, data.ar.map(function (a) {
        var v = varde(m.id, a);
        return v && !v.olika ? v.lag : null;
      }), stil.streck);
      linje.matt = m.id;
      linje.pointStyle = stil.punkt;
      linje.pointRadius = 5;
      linje.pointHoverRadius = 7;
      if (stil.ihalig) {
        linje.showLine = false;
        linje.pointRadius = 6;
        linje.pointBackgroundColor = K.FARG.surface;
        linje.pointBorderColor = stil.farg;
        linje.backgroundColor = K.FARG.surface;
      }
      return linje;
    });

    var opt = K.arsOptions({
      ytitel: "Antal",
      etikett: function (it) { return it.dataset.label + ": " + talSv(it.parsed.y); }
    });
    opt.scales.y.beginAtZero = true;
    /* Första och sista året en bit in från kanten, så att talen inte
       hamnar över axeln. */
    opt.scales.x.offset = true;
    /* Luft ovanför den högsta punkten, så att dess tal får plats. */
    var hogst = 0;
    data.matt.forEach(function (m) {
      data.ar.forEach(function (a) {
        var v = varde(m.id, a);
        if (v) hogst = Math.max(hogst, v.hog);
      });
    });
    opt.scales.y.suggestedMax = hogst * 1.12;
    /* Teckenförklaringen visar punktformen, inte bara färgen. */
    opt.plugins.legend.labels = { usePointStyle: true };

    K.rita("diagram-utveckling", {
      type: "line",
      data: { labels: data.ar.map(String), datasets: dataset },
      options: opt,
      plugins: [talEtiketter]
    }, 400);

    el("kalla-utveckling").textContent =
      "Källa: nämnden för Gymnasium & Arbetsmarknad, Kungsbacka kommun. " +
      "Varje tal har sin källa i tabellen under diagrammet.";
  }

  /* Åren utan uppgift, mått för mått, i klartext under diagrammet. */
  function visaLuckor() {
    var delar = [];
    data.matt.forEach(function (m) {
      var saknas = data.ar.filter(function (a) { return !varde(m.id, a); });
      if (saknas.length) delar.push(m.namn.toLowerCase() + " " + upprakning(saknas.map(String)));
    });
    K.sattDataNot("not-luckor", delar.length
      ? "<p>Uppgift saknas i handlingarna för " + esc(upprakning(delar)) + ".</p>"
      : "");
  }

  /* ---------- Tabellerna ---------- */

  function ritaTabell() {
    el("forklaring-matt").innerHTML = data.matt.map(function (m) {
      return "<strong>" + esc(m.namn) + ":</strong> " + esc(m.forklaring);
    }).join("<br>");

    var huvud = data.matt.map(function (m) {
      return '<th scope="col">' + esc(m.namn) + "</th>";
    }).join("");
    var rader = data.ar.map(function (a) {
      return '<tr><th scope="row">' + esc(a) + "</th>" + data.matt.map(function (m) {
        var v = varde(m.id, a);
        if (!v) return "<td>&ndash;</td>";
        return "<td>" + v.uppgifter.map(function (u) {
          return talSv(u.varde) + " " + fotnoter(u.kallor);
        }).join(" eller ") + "</td>";
      }).join("") + "</tr>";
    }).join("");
    el("tabell-ar").innerHTML =
      '<thead><tr><th scope="col">År</th>' + huvud + "</tr></thead><tbody>" +
      rader + "</tbody>";
  }

  function ritaEnkat() {
    var e = data.enkat;
    var huvud = e.ar.map(function (a) {
      return '<th scope="col">' + esc(a.ar) + " " + fotnoter([a.kalla]) + "</th>";
    }).join("");
    var rader = e.fragor.map(function (f) {
      return '<tr><th scope="row">' + esc(f.fraga) + "</th>" + e.ar.map(function (a) {
        return "<td>" + medel(a.medel[f.id]) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    el("tabell-enkat").innerHTML =
      '<thead><tr><th scope="col">Fråga</th>' + huvud + "</tr></thead><tbody>" +
      rader + "</tbody>";
    el("kalla-enkat").textContent =
      "Medelvärden på skalan 1–5. Siffrorna inom hakparentes är källor.";
  }

  /* ---------- Övriga sommarjobb ----------
     Grupperna räknas inte ihop med feriejobben eller med varandra: de
     mäts på olika sätt och vid olika tidpunkter. Feriejobben står överst
     för jämförelsens skull, med samma tal som tabellen ovan. */

  function sommarCell(v) {
    if (!v) return "<td>&ndash;</td>";
    var html = talSv(v.varde);
    if (v.behov !== null) html += " av " + talSv(v.behov) + " beställda";
    html += " " + fotnoter([v.kalla]);
    if (v.tillganglighet !== null) {
      html += "<br><small>och omkring " + talSv(v.tillganglighet) +
        " som bara anmält sig tillgängliga</small>";
    }
    if (v.anmarkning) html += "<br><small>" + esc(v.anmarkning) + "</small>";
    return "<td>" + html + "</td>";
  }

  function ritaSommarjobb() {
    var sj = data.sommarjobb;
    var huvud = sj.ar.map(function (a) { return '<th scope="col">' + esc(a) + "</th>"; }).join("");
    var ferie = '<tr><th scope="row">Feriejobb, tillsatta i hela kommunen' +
      "<br><small>Gymnasieettor</small></th>" + sj.ar.map(function (a) {
        var v = data.varden.tillsatta[String(a)];
        if (!v) return "<td>&ndash;</td>";
        return "<td>" + v.uppgifter.map(function (u) {
          return talSv(u.varde) + " " + fotnoter(u.kallor);
        }).join(" eller ") + "</td>";
      }).join("") + "</tr>";
    var rader = sj.grupper.map(function (g) {
      var alder = esc(g.alder) + (g.alder_kalla ? " " + fotnoter([g.alder_kalla]) : "");
      return '<tr><th scope="row">' + esc(g.namn) + "<br><small>Ålder: " + alder + "</small></th>" +
        sj.ar.map(function (a) { return sommarCell(sj.varden[g.id][String(a)]); }).join("") +
        "</tr>";
    }).join("");
    el("tabell-sommarjobb").innerHTML =
      '<thead><tr><th scope="col">Grupp och ålder</th>' + huvud +
      "</tr></thead><tbody>" + ferie + rader + "</tbody>";
    el("forklaring-grupper").innerHTML = sj.grupper.map(function (g) {
      return "<dt>" + esc(g.namn) + "</dt><dd>" + esc(g.forklaring) + "</dd>";
    }).join("");
  }

  function visaKallor() {
    el("lista-kallor").innerHTML = data.kallor.map(function (k) {
      var html = K.kallpost({
        titel: "[" + k.nr + "] " + k.rubrik,
        detalj: "Nämnden för " + k.namnd + ", mötet den " +
          datumSv(k.mote) + ", sidan " + k.sida + " i handlingen.",
        lankar: [[k.url, "Läs i datapoolen"], [k.original || "", "Kommunens PDF"]]
      });
      return html.replace("<li>", '<li id="kalla-' + esc(k.nr) + '">');
    }).join("");
  }

  /* ---------- Kort sagt ---------- */

  function senasteAr(matt) {
    var med = data.ar.filter(function (a) { return varde(matt, a); });
    return med[med.length - 1];
  }

  function kortSagt() {
    var punkter = [];
    var a = senasteAr("sokande");
    var t = varde("tillsatta", a);
    punkter.push(esc(a) + " sökte <strong>" + talet(varde("sokande", a)) +
      "</strong> ungdomar ett feriejobb" +
      (t ? ", och <strong>" + talet(t) + "</strong> fick ett." : "."));

    var at = senasteAr("tillsatta");
    if (at > a) {
      punkter.push(esc(at) + " tillsattes <strong>" + talet(varde("tillsatta", at)) +
        "</strong> feriejobb. Hur många som sökte har nämnden inte redovisat än.");
    }

    var flest = data.ar.filter(function (x) { return varde("tillsatta", x); })
      .reduce(function (b, x) {
        return varde("tillsatta", x).hog > varde("tillsatta", b).hog ? x : b;
      });
    punkter.push("Flest feriejobb: <strong>" + talet(varde("tillsatta", flest)) +
      "</strong> år " + esc(flest) + ".");

    var olika = [];
    data.matt.forEach(function (m) {
      var ar = data.ar.filter(function (x) {
        var v = varde(m.id, x);
        return v && v.olika;
      });
      if (ar.length) olika.push(m.namn.toLowerCase() + " " + upprakning(ar.map(String)));
    });
    if (olika.length) {
      punkter.push("Handlingarna anger olika tal för " + esc(upprakning(olika)) +
        ". Båda talen visas.");
    }

    var unga = data.sommarjobb.varden["17-aringar"];
    var au = data.sommarjobb.ar.filter(function (x) { return unga[String(x)]; }).pop();
    if (au) {
      punkter.push("Utöver feriejobben anställde Vård &amp; Omsorg <strong>" +
        talSv(unga[String(au)].varde) + "</strong> 17-åringar för sommaren " + esc(au) + ".");
    }
    K.visaKortSagt(punkter);
  }

  function start(inlast) {
    data = inlast;

    K.visaMeta({
      kalla: "Nämnden för Gymnasium & Arbetsmarknad, Kungsbacka kommun",
      period: data.ar[0] + "–" + data.ar[data.ar.length - 1],
      hamtad: datumSv(data.hamtad)
    });

    kortSagt();
    ritaUtveckling();
    visaLuckor();
    ritaTabell();
    ritaEnkat();
    ritaSommarjobb();
    visaKallor();
    ["utveckling", "enkat", "sommarjobb", "kallor", "om"].forEach(function (id) {
      el("sektion-" + id).hidden = false;
    });
    el("om-uppdaterad").textContent = "Talen lästes in " + datumSv(data.hamtad) + ".";
  }

  K.starta(DATAFIL, { init: start });
})();
