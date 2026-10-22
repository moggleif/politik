/* Feriejobb för gymnasieettorna — sökande, tillsatta jobb och anmälda
   platser år för år, och feriearbetarnas svar i kommunens enkät.
   Läser docs/data-feriejobb.json, byggd av scripts/build_feriejobb.py
   ur data/feriejobb/uppgifter.json.

   Ett år där handlingarna anger olika tal har inget eget värde: linjen
   bryts där, och spannet mellan talen ritas som en smal stapel från det
   lägsta till det högsta. Sidan väljer aldrig ett av talen. */
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

  /* ---------- Diagrammet ---------- */

  function ritaUtveckling() {
    var dataset = [];
    data.matt.forEach(function (m, i) {
      var stil = K.serieStil(i);
      var linje = K.linjeSerie(m.namn, stil.farg, data.ar.map(function (a) {
        var v = varde(m.id, a);
        return v && !v.olika ? v.lag : null;
      }), stil.streck);
      /* Få år: varje punkt syns, och formen skiljer serierna åt utan färg. */
      linje.pointStyle = stil.punkt;
      linje.pointRadius = 5;
      dataset.push(linje);
      var spann = data.ar.map(function (a) {
        var v = varde(m.id, a);
        return v && v.olika ? [v.lag, v.hog] : null;
      });
      if (spann.some(function (s) { return s; })) {
        dataset.push({
          type: "bar",
          label: m.namn + ", källorna säger olika",
          data: spann,
          backgroundColor: stil.farg,
          borderColor: stil.farg,
          barThickness: 6,
          grouped: false,
          borderWidth: 3,
          pointStyle: "line"
        });
      }
    });

    var opt = K.arsOptions({
      ytitel: "Antal",
      etikett: function (it) {
        if (Array.isArray(it.raw)) {
          return it.dataset.label + ": " + talSv(it.raw[0]) + " eller " + talSv(it.raw[1]);
        }
        return it.dataset.label + ": " + talSv(it.parsed.y);
      }
    });
    opt.scales.y.beginAtZero = true;
    /* Teckenförklaringen visar punktformen, inte bara färgen. */
    opt.plugins.legend.labels = { usePointStyle: true };

    K.rita("diagram-utveckling", {
      type: "line",
      data: { labels: data.ar.map(String), datasets: dataset },
      options: opt
    }, 380);

    el("kalla-utveckling").textContent =
      "Källa: nämnden för Gymnasium & Arbetsmarknad, Kungsbacka kommun. " +
      "Varje tal har sin källa i tabellen nedan.";
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

  function visaKallor() {
    el("lista-kallor").innerHTML = data.kallor.map(function (k) {
      var html = K.kallpost({
        titel: "[" + k.nr + "] " + k.rubrik,
        detalj: "Nämnden för Gymnasium & Arbetsmarknad, mötet den " +
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
    visaKallor();
    ["utveckling", "tabell", "enkat", "kallor", "om"].forEach(function (id) {
      el("sektion-" + id).hidden = false;
    });
    el("om-uppdaterad").textContent = "Talen lästes in " + datumSv(data.hamtad) + ".";
  }

  K.starta(DATAFIL, { init: start });
})();
