/* Grundskolorna i årskurs 9, skola för skola.
   Läser docs/data-grundskolor.json, byggd av scripts/build_grundskolor.py.

   Måtten har olika skalor – andelar 0–100 % och meritvärde 0–340 – och
   visas därför aldrig i samma diagram: ett mått i taget, med en väljare.

   Serierna skiljs åt med färg *och* punktform (K.serieStilPunkt). Den
   streckade linjen är reserverad för kopplingen mellan en skola som gått
   upp i en annan och efterträdaren, och används aldrig för att skilja
   två skolor åt. */
(function () {
  "use strict";

  var K = window.KIS;
  var FARG = K.FARG;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;

  var DATAFIL = "data-grundskolor.json";
  var DATA = null;
  var SKOLA = {};        // id -> skola
  var STILNR = {};       // id -> plats i den alfabetiska listan, ger fast färg och form
  var dolda = {};        // id -> true för linjer som besökaren klickat bort

  var NBSP = " ";
  var CIRKA = "≈";

  var MATT = [
    { id: "behorighet-yrkesprogram", falt: "behorigYrkes", andel: true,
      namn: "Behöriga till yrkesprogram",
      lang: "Andel (%) behöriga till yrkesprogram" },
    { id: "behorighet-estetiskt", falt: "behorigEstetiskt", andel: true,
      namn: "Behöriga till estetiskt program",
      lang: "Andel (%) behöriga till estetiskt program" },
    { id: "behorighet-ekonomi-humanistiska-samhall", falt: "behorigEkoHumSam", andel: true,
      namn: "Behöriga till ekonomi-, humanistiska och samhällsvetenskapsprogrammen",
      lang: "Andel (%) behöriga till ekonomi-, humanistiska och samhällsvetenskapsprogrammen" },
    { id: "behorighet-naturvetenskap-teknik", falt: "behorigNaturTeknik", andel: true,
      namn: "Behöriga till naturvetenskaps- och teknikprogrammen",
      lang: "Andel (%) behöriga till naturvetenskaps- och teknikprogrammen" },
    { id: "meritvarde", falt: "meritvarde", andel: false,
      namn: "Genomsnittligt meritvärde",
      lang: "Genomsnittligt meritvärde (högst 340)" }
  ];

  var VISA = [
    { id: "nuvarande", namn: "Skolor som finns i dag, med föregångare" },
    { id: "alla", namn: "Alla skolor, även nedlagda" },
    { id: "kommunala", namn: "Kommunala skolor" },
    { id: "fristaende", namn: "Fristående skolor" }
  ];

  function sistaAr() { return DATA.ar[DATA.ar.length - 1]; }
  function lasar(a) { return DATA.lasar[String(a)] || String(a); }

  /* Måttet för en skola och ett år: { v, mark } eller null när skolan
     inte har någon rad det året (något annat än ett dolt värde). */
  function punkt(skola, ar, falt) {
    var post = skola.varden[String(ar)];
    return post ? post[falt] : null;
  }

  function vardet(skola, ar, falt) {
    var p = punkt(skola, ar, falt);
    return p ? p.v : null;
  }

  /* Ett mått som text. Tomt är inte noll: dolt skrivs "..", ett år utan
     rad skrivs som tankstreck. ≈100 skrivs som Skolverket menar det, inte
     som det 99 diagrammet ritar. */
  function text(p, matt) {
    if (p === null) return "–";
    if (p.mark === "dolt") return "..";
    if (p.mark === "ca100") return CIRKA + "100" + NBSP + "%";
    var t = talSv(p.v, 1) + (matt.andel ? NBSP + "%" : "");
    return p.mark === "ungefar" ? CIRKA + t : t;
  }

  function huvudmannaNamn(s) {
    return s.huvudman === "Enskild" ? "Fristående" : "Kommunal";
  }

  function valdMatt() {
    var id = el("matt-valjare").value;
    for (var i = 0; i < MATT.length; i++) if (MATT[i].id === id) return MATT[i];
    return MATT[0];
  }

  /* Vilka skolor som visas. "Nuvarande" tar med föregångarna till de
     skolor som finns i dag, så att en streckad koppling aldrig pekar på
     en linje som inte ritas. */
  function synliga() {
    var val = el("visa-valjare").value;
    var ut = DATA.skolor.filter(function (s) {
      if (val === "kommunala") return s.huvudman === "Kommunal";
      if (val === "fristaende") return s.huvudman === "Enskild";
      return true;
    });
    if (val === "nuvarande") {
      var med = {};
      var lagg = function (s) {
        if (med[s.id]) return;
        med[s.id] = true;
        s.foregangare.forEach(function (f) { lagg(SKOLA[f.id]); });
      };
      DATA.skolor.forEach(function (s) { if (s.aktuell) lagg(s); });
      ut = DATA.skolor.filter(function (s) { return med[s.id]; });
    }
    return ut;
  }

  /* Senaste värdet en skola har, för att ordna teckenförklaringen i
     samma ordning som linjerna slutar i diagrammets högerkant. */
  function senasteVarde(s, falt) {
    for (var i = DATA.ar.length - 1; i >= 0; i--) {
      var v = vardet(s, DATA.ar[i], falt);
      if (v !== null) return v;
    }
    return -1;
  }

  /* ---------- Diagrammet ---------- */

  function uppdateraKopplingar(chart) {
    var index = {};
    chart.data.datasets.forEach(function (ds, i) {
      if (!ds.koppling) index[ds.skolId] = i;
    });
    chart.data.datasets.forEach(function (ds, i) {
      if (!ds.koppling) return;
      chart.setDatasetVisibility(i,
        chart.isDatasetVisible(index[ds.fran]) && chart.isDatasetVisible(index[ds.till]));
    });
  }

  function klickaLegend(e, post, legend) {
    var chart = legend.chart;
    var ds = chart.data.datasets[post.datasetIndex];
    var synlig = chart.isDatasetVisible(post.datasetIndex);
    chart.setDatasetVisibility(post.datasetIndex, !synlig);
    dolda[ds.skolId] = synlig;
    uppdateraKopplingar(chart);
    chart.update();
  }

  function ritaTrend() {
    var matt = valdMatt();
    var skolor = synliga();
    var ar = DATA.ar;

    var serier = skolor.map(function (s) {
      var stil = K.serieStilPunkt(STILNR[s.id]);
      return {
        label: s.namn,
        skolId: s.id,
        data: ar.map(function (a) { return vardet(s, a, matt.falt); }),
        punkter: ar.map(function (a) { return punkt(s, a, matt.falt); }),
        antal: ar.map(function (a) {
          var post = s.varden[String(a)];
          return post ? post.antal : null;
        }),
        borderColor: stil.farg,
        backgroundColor: stil.farg,
        pointStyle: stil.punkt,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBorderColor: FARG.surface,
        pointBorderWidth: 1,
        spanGaps: false,
        tension: 0,
        hidden: !!dolda[s.id],
        sist: senasteVarde(s, matt.falt)
      };
    });
    serier.sort(function (x, y) { return y.sist - x.sist; });

    /* Kopplingarna: en streckad linje i efterträdarens färg mellan
       föregångarens sista och efterträdarens första år. Utan värde i
       någon av ändarna ritas ingen – hellre ingen linje än en över ett
       dolt tal. */
    var kopplingar = [];
    var finns = {};
    skolor.forEach(function (x) { finns[x.id] = true; });
    skolor.forEach(function (s) {
      s.foregangare.forEach(function (f) {
        var fore = SKOLA[f.id];
        if (!finns[f.id]) return;
        var v1 = vardet(fore, fore.sistaAr, matt.falt);
        var v2 = vardet(s, s.forstaAr, matt.falt);
        if (v1 === null || v2 === null) return;
        var stil = K.serieStilPunkt(STILNR[s.id]);
        kopplingar.push({
          label: fore.namn + " → " + s.namn,
          koppling: true,
          fran: fore.id,
          till: s.id,
          skolId: s.id + "/" + fore.id,
          data: ar.map(function (a) {
            return a === fore.sistaAr ? v1 : (a === s.forstaAr ? v2 : null);
          }),
          borderColor: stil.farg,
          backgroundColor: stil.farg,
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 0,
          spanGaps: true,
          tension: 0,
          hidden: !!(dolda[fore.id] || dolda[s.id])
        });
      });
    });

    var opt = K.arsOptions({
      ytitel: matt.lang,
      etikett: function (it) {
        var ds = it.dataset;
        var rad = ds.label + ": " + text(ds.punkter[it.dataIndex], matt);
        var p = ds.punkter[it.dataIndex];
        if (p && p.mark === "ca100") rad += " (ritas som 99 %)";
        var n = ds.antal[it.dataIndex];
        return n === null || n === undefined
          ? rad : [rad, "Elever i årskurs 9: " + n];
      }
    });
    opt.interaction = { mode: "nearest", intersect: false };
    opt.plugins.tooltip.callbacks.title = function (it) {
      return "Läsåret " + lasar(Number(it[0].label));
    };
    opt.plugins.tooltip.filter = function (it) { return !it.dataset.koppling; };
    opt.plugins.legend = {
      display: true,
      position: "bottom",
      onClick: klickaLegend,
      labels: {
        usePointStyle: true,
        boxWidth: 10,
        padding: 12,
        filter: function (post, data) { return !data.datasets[post.datasetIndex].koppling; }
      }
    };
    opt.scales.x.title = {
      display: true,
      color: FARG.muted,
      text: "Utgångsår (läsåret 2025/26 är 2026)"
    };
    if (matt.andel) opt.scales.y.max = 100;

    var chart = K.rita("diagram-trend", {
      type: "line",
      data: { labels: ar.map(String), datasets: serier.concat(kopplingar) },
      options: opt
    }, 560);
    K.aktiveraToning(chart);

    el("kalla-trend").textContent =
      "Källa: Skolverket, läsåren " + lasar(ar[0]) + "–" + lasar(sistaAr()) +
      ". " + matt.lang + ", alla elever i årskurs 9.";

    tabellTrend(skolor, matt);
    noterTrend(skolor, matt);
    sammanfattaTrend(skolor, matt);
  }

  function tabellTrend(skolor, matt) {
    var ar = DATA.ar;
    el("tabell-trend").innerHTML =
      "<thead><tr><th scope=\"col\">Skola</th>" +
      ar.map(function (a) {
        return "<th scope=\"col\">" + esc(lasar(a)) + "</th>";
      }).join("") + "</tr></thead><tbody>" +
      skolor.map(function (s) {
        return "<tr><th scope=\"row\">" + esc(s.namn) + "</th>" +
          ar.map(function (a) {
            return "<td>" + esc(text(punkt(s, a, matt.falt), matt)) + "</td>";
          }).join("") + "</tr>";
      }).join("") + "</tbody>";
  }

  function noterTrend(skolor, matt) {
    var dolt = [];
    var cirka = 0;
    skolor.forEach(function (s) {
      DATA.ar.forEach(function (a) {
        var p = punkt(s, a, matt.falt);
        if (p && p.mark === "dolt") dolt.push(s.namn + " " + lasar(a));
        if (p && (p.mark === "ca100" || p.mark === "ungefar")) cirka++;
      });
    });
    var delar = [];
    if (dolt.length) {
      delar.push("Följande värden redovisas inte av Skolverket (färre än tio " +
        "elever) och ritas som luckor: " + esc(dolt.join(", ")) + ".");
    }
    if (cirka) {
      delar.push(cirka + " punkter är <strong>≈100 %</strong> eller " +
        "innehåller en sådan enhet. De ritas som 99 % och skrivs med " +
        "≈ i tabellen och pekrutan. Se &rdquo;Om den här sidan&rdquo;.");
    }
    K.sattDataNot("not-trend", delar.join(" "));
  }

  function sammanfattaTrend(skolor, matt) {
    var ar = sistaAr();
    var med = skolor.filter(function (s) { return vardet(s, ar, matt.falt) !== null; })
      .sort(function (x, y) { return vardet(y, ar, matt.falt) - vardet(x, ar, matt.falt); });
    if (!med.length) { el("slutsats-trend").innerHTML = ""; return; }
    var hogst = med[0], lagst = med[med.length - 1];
    el("slutsats-trend").innerHTML =
      "<p>Läsåret " + esc(lasar(ar)) + " hade <strong>" + esc(hogst.namn) +
      "</strong> det högsta värdet (" + esc(text(punkt(hogst, ar, matt.falt), matt)) +
      ") och <strong>" + esc(lagst.namn) + "</strong> det lägsta (" +
      esc(text(punkt(lagst, ar, matt.falt), matt)) + ") av de " + med.length +
      " visade skolor som hade elever i årskurs 9.</p>";
  }

  function sattAllaSynliga(visa) {
    if (visa) dolda = {};
    else synliga().forEach(function (s) { dolda[s.id] = true; });
    ritaTrend();
  }

  /* ---------- Senaste läsåret ---------- */

  function ritaSenaste() {
    var ar = sistaAr();
    var rader = DATA.skolor.filter(function (s) { return !!s.varden[String(ar)]; })
      .sort(function (x, y) {
        return vardet(y, ar, "meritvarde") - vardet(x, ar, "meritvarde");
      });
    var yrkes = MATT[0], merit = MATT[4];
    el("senaste-lasar").textContent = lasar(ar);
    el("tabell-senaste").innerHTML =
      "<thead><tr><th scope=\"col\">Skola</th><th scope=\"col\">Huvudman</th>" +
      "<th scope=\"col\">Elever</th><th scope=\"col\">Behöriga till yrkesprogram</th>" +
      "<th scope=\"col\">Meritvärde</th></tr></thead><tbody>" +
      rader.map(function (s) {
        var post = s.varden[String(ar)];
        return "<tr><th scope=\"row\">" + esc(s.namn) + "</th><td>" +
          esc(huvudmannaNamn(s)) + "</td><td>" +
          (post.antal === null ? ".." : esc(post.antal)) + "</td><td>" +
          esc(text(post.behorigYrkes, yrkes)) + "</td><td>" +
          esc(text(post.meritvarde, merit)) + "</td></tr>";
      }).join("") + "</tbody>";
    el("kalla-senaste").textContent =
      "Källa: Skolverket, läsåret " + lasar(ar) + ". Skolor med flera enheter: " +
      "elevviktat medelvärde av enheterna.";
  }

  /* ---------- Vilka enheter ingår i vilken skola ---------- */

  function ritaSkolor() {
    el("lista-skolor").innerHTML = DATA.skolor.map(function (s) {
      var enheter = s.enheter.map(function (e) {
        return e.namn + " (" + e.kod + ", " + e.forstaAr +
          (e.forstaAr === e.sistaAr ? "" : "–" + e.sistaAr) + ")";
      }).join("; ");
      var fore = s.foregangare.map(function (f) {
        return SKOLA[f.id].namn + " – " +
          (f.bekraftad ? "bekräftad: " : "gissning: ") + f.anm;
      }).join(" ");
      return K.kallpost({
        titel: s.namn,
        detalj: huvudmannaNamn(s) + ", utgångsåren " + s.forstaAr + "–" +
          s.sistaAr + ". Skolenheter: " + enheter + "." +
          (fore ? " Föregångare: " + fore : "")
      });
    }).join("");
  }

  /* ---------- Kort sagt, noter och källor ---------- */

  function kortSagt() {
    var ar = sistaAr();
    var nu = DATA.skolor.filter(function (s) { return !!s.varden[String(ar)]; });
    var upphorda = DATA.skolor.filter(function (s) { return !s.aktuell; });
    var merit = nu.filter(function (s) { return vardet(s, ar, "meritvarde") !== null; })
      .sort(function (x, y) { return vardet(y, ar, "meritvarde") - vardet(x, ar, "meritvarde"); });
    var exakta = nu.filter(function (s) {
      var p = punkt(s, ar, "behorigYrkes");
      return p && p.v !== null && p.mark === null;
    }).sort(function (x, y) {
      return vardet(y, ar, "behorigYrkes") - vardet(x, ar, "behorigYrkes");
    });
    var cirka = nu.filter(function (s) {
      var p = punkt(s, ar, "behorigYrkes");
      return p && p.mark === "ca100";
    });
    var kopplade = upphorda.filter(function (s) {
      return DATA.skolor.some(function (t) {
        return t.foregangare.some(function (f) { return f.id === s.id; });
      });
    });

    var punkter = [];
    if (merit.length) {
      punkter.push("Läsåret " + esc(lasar(ar)) + " hade <strong>" + nu.length +
        " skolor</strong> elever i årskurs 9. Meritvärdet låg mellan <strong>" +
        talSv(vardet(merit[merit.length - 1], ar, "meritvarde"), 1) + "</strong> (" +
        esc(merit[merit.length - 1].namn) + ") och <strong>" +
        talSv(vardet(merit[0], ar, "meritvarde"), 1) + "</strong> (" +
        esc(merit[0].namn) + ") av högst " + esc(DATA.maxMerit) + ".");
    }
    if (exakta.length) {
      punkter.push("Andelen behöriga till yrkesprogram var bland skolorna med exakt " +
        "redovisat tal som lägst <strong>" +
        talSv(vardet(exakta[exakta.length - 1], ar, "behorigYrkes"), 1) + "&nbsp;%</strong> (" +
        esc(exakta[exakta.length - 1].namn) + ") och som högst <strong>" +
        talSv(vardet(exakta[0], ar, "behorigYrkes"), 1) + "&nbsp;%</strong> (" +
        esc(exakta[0].namn) + "). " + cirka.length + " skolor redovisas som " +
        "&asymp;100&nbsp;%: 1&ndash;4 elever klarade inte behörigheten.");
    }
    punkter.push("Datat omfattar <strong>" + DATA.skolor.length + " skolor</strong>: " +
      nu.length + " med årskurs 9 senaste läsåret och " + upphorda.length +
      " som upphört. " + kopplade.length + " av de upphörda har en efterträdare och " +
      "kopplas till den med en streckad linje.");
    K.visaKortSagt(punkter);
  }

  function noter() {
    K.sattDataNot("not-ca100",
      "<strong>Om &rdquo;&asymp;100&nbsp;%&rdquo;:</strong> när 1&ndash;4 elever " +
      "inte klarade behörigheten skriver Skolverket inte ut något tal. Sidan " +
      "skriver &asymp;100&nbsp;% men <strong>ritar punkten som 99&nbsp;%</strong>. " +
      "Det verkliga värdet ligger under 100 och kan för en liten skola vara " +
      "klart lägre än 99.");
    var gissade = [];
    DATA.skolor.forEach(function (s) {
      s.foregangare.forEach(function (f) {
        if (!f.bekraftad) gissade.push(SKOLA[f.id].namn + " → " + s.namn);
      });
    });
    K.sattDataNot("not-gissning", gissade.length
      ? "<strong>Kopplingar som inte är kontrollerade:</strong> " + esc(gissade.join("; ")) +
        ". De är en gissning ur årtalen (den äldre skolan upphör året innan den " +
        "nya dyker upp) och inte ett belagt beslut."
      : "");
  }

  function start(data) {
    DATA = data;
    DATA.skolor.forEach(function (s, i) { SKOLA[s.id] = s; STILNR[s.id] = i; });

    var kallor = DATA.kallor || [];
    var senaste = kallor[kallor.length - 1] || {};
    K.visaMeta({
      kalla: "Skolverket, utbildningsstatistik",
      period: lasar(DATA.ar[0]) + "–" + lasar(sistaAr()),
      senaste: lasar(sistaAr()),
      hamtad: senaste.hamtad
    });

    K.fyllValjare(el("matt-valjare"), MATT.map(function (m) { return m.id; }),
      function (id) { return MATT.filter(function (m) { return m.id === id; })[0].namn; });
    K.fyllValjare(el("visa-valjare"), VISA.map(function (v) { return v.id; }),
      function (id) { return VISA.filter(function (v) { return v.id === id; })[0].namn; });
    K.kopplaValjare(el("matt-valjare"), "matt", ritaTrend);
    K.kopplaValjare(el("visa-valjare"), "visa", ritaTrend);
    el("knapp-dolj-alla").addEventListener("click", function () { sattAllaSynliga(false); });
    el("knapp-visa-alla").addEventListener("click", function () { sattAllaSynliga(true); });

    kortSagt();
    noter();
    ritaTrend();
    ritaSenaste();
    ritaSkolor();

    var lista = el("lista-kallor");
    lista.innerHTML = kallor.slice().reverse().map(function (k) {
      return K.kallpost({
        titel: "Läsåret " + k.lasar,
        detalj: k.kalla + ", hämtad " + k.hamtad,
        lankar: (k.rapporter || []).map(function (r) {
          return [r.kallaUrl, r.rapportTitel];
        })
      });
    }).join("");
    el("om-uppdaterad").textContent = "Datat på den här sidan hämtades " +
      (senaste.hamtad || "") + ".";

    ["trend", "senaste", "skolor", "kallor", "om"].forEach(function (id) {
      el("sektion-" + id).hidden = false;
    });
  }

  K.starta(DATAFIL, { init: start });
})();
