/* Förtidsröstningen i Kungsbacka — dag för dag inför valet 2026, jämförd
   med riksdagsvalet 2022 vid samma antal dagar kvar till valdagen.
   Läser docs/data-fortidsroster.json, byggd av scripts/build_fortidsroster.py
   ur Valmyndighetens öppna data.

   Sidan redovisar valdeltagande, inte opinion: ingenting här tolkar
   antalet röster som stöd för något parti eller block. */
(function () {
  "use strict";

  var K = window.KIS;
  var FARG = K.FARG;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;
  var sakerUrl = K.sakerUrl;

  var DATAFIL = "data-fortidsroster.json";

  /* Två serier, två fasta färger: det aktuella valet i webbplatsens
     mörkblå, det förra i en neutral grå som ligger bakom. Grå är
     avsiktligt: 2022 är referens, inte en likvärdig andra serie. Den
     pågående dagen ritas ljusblå med mörkblå kant – samma hue, svagare –
     för att visa att talet inte är färdigt. */
  var FARG_NU = FARG.blaMork;
  var FARG_DA = "#8f8d85";
  var FARG_PAGAR = FARG.blaLjus;

  /* Hur gammalt datat får vara under pågående förtidsröstning innan
     sidan säger till. Filen uppdateras kl. 06 och 14; 30 timmar täcker
     en missad körning utan att larma i onödan. */
  var GAMMALT_EFTER_TIMMAR = 30;

  var MANAD = ["jan", "feb", "mars", "april", "maj", "juni",
               "juli", "aug", "sep", "okt", "nov", "dec"];

  /* "2026-09-01" -> "1 sep" ; med veckodag: "tis 1 sep" */
  function datumSv(iso, veckodag) {
    var d = iso.split("-");
    var text = parseInt(d[2], 10) + " " + MANAD[parseInt(d[1], 10) - 1];
    return veckodag ? veckodag + " " + text : text;
  }

  function datumTidSv(iso) {
    /* "2026-09-02T14:31+02:00" -> "2 sep 2026 kl. 14.31" */
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso || "");
    if (!m) return esc(iso);
    var text = parseInt(m[3], 10) + " " + MANAD[parseInt(m[2], 10) - 1] + " " + m[1];
    if (m[4]) text += " kl. " + m[4] + "." + m[5];
    return text;
  }

  function tecken(n) { return (n > 0 ? "+" : n < 0 ? "−" : "") + talSv(Math.abs(n)); }
  function teckenPct(p, dec) { return (p > 0 ? "+" : p < 0 ? "−" : "") + talSv(Math.abs(p), dec) + " %"; }

  function kvarText(k) {
    if (k === 0) return "valdagen";
    if (k === 1) return "1 dag kvar";
    return k + " dagar kvar";
  }

  function dagVid(val, kvar) {
    for (var i = 0; i < val.dagar.length; i++) {
      if (val.dagar[i].kvar === kvar) return val.dagar[i];
    }
    return null;
  }

  /* Alla dagar i perioden, från första dagen till valdagen, som
     "dagar kvar" – x-axelns kategorier. Etiketten är två rader: dagar
     kvar och veckodag, som är densamma båda åren. */
  function skala(nu, da) {
    var n = Math.max(nu.antalDagar, da ? da.antalDagar : 0);
    var ut = [];
    for (var k = n - 1; k >= 0; k--) ut.push(k);
    return ut;
  }

  function veckodagFor(kvar, nu, da) {
    var d = dagVid(nu, kvar) || (da && dagVid(da, kvar));
    return d ? d.veckodag : "";
  }

  function tooltipTitel(kvar, nu, da) {
    var delar = [kvarText(kvar).replace(/^./, function (c) { return c.toUpperCase(); })];
    var dn = dagVid(nu, kvar), dd = da && dagVid(da, kvar);
    if (dn) delar.push(datumSv(dn.datum, dn.veckodag) + " " + nu.ar + (dn.pagar ? " (pågår)" : ""));
    if (dd) delar.push(datumSv(dd.datum, dd.veckodag) + " " + da.ar);
    return delar;
  }

  function basOptions(ytitel, nu, da, etikett) {
    return {
      maintainAspectRatio: false,
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, labels: { usePointStyle: true, boxWidth: 10 } },
        tooltip: {
          callbacks: {
            title: function (it) { return tooltipTitel(it[0].chart.$kvar[it[0].dataIndex], nu, da); },
            label: etikett
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: "Dagar kvar till valdagen", color: FARG.muted },
          grid: { display: false },
          border: { color: FARG.baseline },
          ticks: { maxRotation: 0, autoSkipPadding: 8 }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: ytitel, color: FARG.muted },
          grid: { color: FARG.grid },
          border: { display: false },
          ticks: { callback: function (v) { return talSv(v); } }
        }
      }
    };
  }

  /* ---------- Nyckeltal ---------- */

  function ruta(etikett, tal, not) {
    return '<div class="nyckeltal-ruta"><span class="nyckeltal-etikett">' + etikett +
      '</span><span class="nyckeltal-tal">' + tal + "</span>" +
      (not ? '<span class="nyckeltal-not">' + not + "</span>" : "") + "</div>";
  }

  function nyckeltal(data, nu, da) {
    var j = data.jamforelse;
    var rutor = [];
    var tomDag = nu.sistaAvslutadDag ? "t.o.m. " + datumSv(nu.sistaAvslutadDag) : "";
    var pagarNot = nu.pagaende
      ? "Därtill " + talSv(nu.pagaende.antal) + " röster hittills " +
        datumSv(nu.pagaende.datum) + " (dagen pågår)."
      : "";

    rutor.push(ruta("Förtidsröster " + esc(nu.ar) + (tomDag ? ", " + tomDag : ""),
      talSv(nu.totalAvslutad), pagarNot));

    if (j) {
      rutor.push(ruta(esc(da.ar) + " vid samma punkt",
        talSv(j.antalDa),
        kvarText(j.kvar) + ", " + datumSv(j.datumDa, j.veckodag) + " " + esc(da.ar) +
        ". Slutligt " + esc(da.ar) + ": " + talSv(j.slutDa) + "."));
      rutor.push(ruta("Skillnad mot " + esc(da.ar),
        tecken(j.diff),
        j.diffPct === null ? "" : teckenPct(j.diffPct, 1) + " jämfört med samma punkt " + esc(da.ar) + "."));
    }

    if (nu.andelAvRostberattigade !== null && nu.rostberattigade) {
      rutor.push(ruta("Andel av de röstberättigade",
        talSv(nu.andelAvRostberattigade, 1) + " %",
        talSv(nu.rostberattigade.riksdag) + " röstberättigade i riksdagsvalet " +
        esc(nu.ar) + "." +
        (j && j.andelDa !== null ? " " + esc(da.ar) + " vid samma punkt: " + talSv(j.andelDa, 1) + " %." : "")));
    }

    el("nyckeltal").innerHTML = rutor.join("");
    el("kalla-nyckeltal").textContent =
      "Källa: Valmyndigheten. Preliminära siffror, kan justeras fram till " +
      (data.preliminarTom ? datumSv(data.preliminarTom) + " " + data.preliminarTom.slice(0, 4) : "efter valet") +
      ". Jämförelsen görs vid senaste avslutade dag, så att en pågående dag inte ställs mot en hel.";
  }

  /* ---------- 1. Ackumulerad kurva ---------- */

  function ritaAck(nu, da) {
    var kvar = skala(nu, da);
    var ctx = el("diagram-ack");
    ctx.parentElement.style.height = "380px";

    function serie(val, farg, streck) {
      return {
        label: String(val.ar),
        data: kvar.map(function (k) { var d = dagVid(val, k); return d ? d.ack : null; }),
        borderColor: farg,
        backgroundColor: farg,
        borderWidth: val === nu ? 3 : 2,
        borderDash: streck || [],
        pointRadius: kvar.map(function (k) { var d = dagVid(val, k); return d && d.pagar ? 5 : 3; }),
        pointHoverRadius: 6,
        pointBackgroundColor: kvar.map(function (k) {
          var d = dagVid(val, k); return d && d.pagar ? FARG.surface : farg;
        }),
        pointBorderColor: farg,
        pointBorderWidth: 2,
        pointStyle: val === nu ? "circle" : "rect",
        spanGaps: false,
        tension: 0.1
      };
    }

    var datasets = [serie(nu, FARG_NU)];
    if (da) datasets.push(serie(da, FARG_DA, [6, 4]));

    var opt = basOptions("Förtidsröster sammanlagt", nu, da, function (it) {
      return it.dataset.label + ": " + talSv(it.parsed.y) + " röster sammanlagt";
    });
    var chart = K.rita("diagram-ack", {
      type: "line",
      data: {
        labels: kvar.map(function (k) { return [String(k), veckodagFor(k, nu, da)]; }),
        datasets: datasets
      },
      options: opt
    });
    chart.$kvar = kvar;
    K.aktiveraToning(chart);

    el("kalla-ack").textContent =
      "Källa: Valmyndigheten. Valdagen är 0. " + nu.ar + " heldragen, " +
      (da ? da.ar + " streckad. " : "") +
      (nu.pagaende ? "Den ofyllda punkten är en pågående dag med ofullständig siffra." : "");

    var j = da && dagVid(da, nu.sistaAvslutadKvar);
    var text = "";
    if (nu.sistaAvslutadDag) {
      text = "<p>Till och med " + datumSv(nu.sistaAvslutadDag, dagVid(nu, nu.sistaAvslutadKvar).veckodag) +
        " " + esc(nu.ar) + " (" + kvarText(nu.sistaAvslutadKvar) + ") hade <strong>" +
        talSv(nu.totalAvslutad) + "</strong> förtidsröster tagits emot i kommunens lokaler.";
      if (j) {
        text += " Vid samma punkt " + esc(da.ar) + " var det " + talSv(j.ack) + ", och när " +
          "förtidsröstningen var över " + esc(da.ar) + " hade " + talSv(da.total) + " röster tagits emot.";
      }
      text += "</p>";
    }
    el("slutsats-ack").innerHTML = text;
  }

  /* ---------- 2. Staplar per dag ---------- */

  function ritaDag(nu, da) {
    var kvar = skala(nu, da);
    var ctx = el("diagram-dag");
    ctx.parentElement.style.height = "360px";

    var datasets = [];
    if (da) {
      datasets.push({
        label: String(da.ar),
        data: kvar.map(function (k) { var d = dagVid(da, k); return d ? d.antal : null; }),
        backgroundColor: FARG_DA,
        borderWidth: 0,
        borderRadius: 3,
        borderSkipped: false,
        grouped: false,
        barPercentage: 0.9,
        categoryPercentage: 0.9,
        order: 2
      });
    }
    datasets.push({
      label: String(nu.ar),
      data: kvar.map(function (k) { var d = dagVid(nu, k); return d ? d.antal : null; }),
      backgroundColor: kvar.map(function (k) {
        var d = dagVid(nu, k); return d && d.pagar ? FARG_PAGAR : FARG_NU;
      }),
      borderColor: FARG_NU,
      borderWidth: kvar.map(function (k) { var d = dagVid(nu, k); return d && d.pagar ? 2 : 0; }),
      borderRadius: 3,
      borderSkipped: false,
      grouped: false,
      barPercentage: 0.9,
      categoryPercentage: 0.5,
      order: 1
    });

    var opt = basOptions("Förtidsröster per dag", nu, da, function (it) {
      return it.dataset.label + ": " + talSv(it.parsed.y) + " röster";
    });
    opt.plugins.legend.labels.usePointStyle = false;
    var chart = K.rita("diagram-dag", {
      type: "bar",
      data: {
        labels: kvar.map(function (k) { return [String(k), veckodagFor(k, nu, da)]; }),
        datasets: datasets
      },
      options: opt
    });
    chart.$kvar = kvar;

    el("kalla-dag").textContent =
      "Källa: Valmyndigheten. Den smala mörkblå stapeln är " + nu.ar +
      (da ? ", den bredare grå bakom är " + da.ar + " vid samma antal dagar kvar." : ".") +
      (nu.pagaende ? " Ljusblå stapel = pågående dag, ofullständig siffra." : "");

    tabellDagar(nu, da);
  }

  function tabellDagar(nu, da) {
    var rader = nu.dagar.map(function (d) {
      var dd = da && dagVid(da, d.kvar);
      return "<tr><th scope=\"row\">" + esc(datumSv(d.datum, d.veckodag)) +
        (d.pagar ? " (pågår)" : "") + "</th><td>" + esc(d.kvar) + "</td><td>" +
        talSv(d.antal) + "</td><td>" + talSv(d.ack) + "</td><td>" +
        (dd ? talSv(dd.antal) : "&ndash;") + "</td><td>" +
        (dd ? talSv(dd.ack) : "&ndash;") + "</td></tr>";
    }).join("");
    el("tabell-dagar").innerHTML =
      "<thead><tr><th scope=\"col\">Dag " + esc(nu.ar) + "</th><th scope=\"col\">Dagar kvar</th>" +
      "<th scope=\"col\">Antal " + esc(nu.ar) + "</th><th scope=\"col\">Ackumulerat " + esc(nu.ar) + "</th>" +
      "<th scope=\"col\">Antal " + (da ? esc(da.ar) : "&ndash;") + "</th>" +
      "<th scope=\"col\">Ackumulerat " + (da ? esc(da.ar) : "&ndash;") + "</th></tr></thead>" +
      "<tbody>" + rader + "</tbody>";
  }

  /* ---------- 3. Topplista över lokaler ---------- */

  function lokalRad(l, i) {
    return "<tr><td>" + (i + 1) + "</td><th scope=\"row\">" + esc(l.namn) + "</th><td>" +
      talSv(l.total) + "</td><td>" + (l.andel === null ? "&ndash;" : talSv(l.andel, 1) + "&nbsp;%") +
      "</td><td>" + esc(l.dagarMedRoster) + "</td><td>" + talSv(l.storstaDag) + "</td></tr>";
  }

  function lokalHuvud() {
    return "<thead><tr><th scope=\"col\">#</th><th scope=\"col\">Röstningslokal</th>" +
      "<th scope=\"col\">Röster</th><th scope=\"col\">Andel</th>" +
      "<th scope=\"col\">Dagar med röster</th><th scope=\"col\">Största dag</th></tr></thead>";
  }

  function topplista(nu) {
    var med = nu.lokaler.filter(function (l) { return l.total > 0; });
    el("tabell-lokaler").innerHTML = lokalHuvud() + "<tbody>" +
      med.map(lokalRad).join("") + "</tbody>";
    el("tabell-lokaler-alla").innerHTML = lokalHuvud() + "<tbody>" +
      nu.lokaler.map(lokalRad).join("") + "</tbody>";
    var utan = nu.lokaler.length - med.length;
    el("kalla-lokaler").textContent =
      "Källa: Valmyndigheten. " + med.length + " av " + nu.lokaler.length +
      " lokaler har tagit emot röster" +
      (nu.sistaAvslutadDag || nu.pagaende ? " t.o.m. " + datumSv((nu.pagaende || dagVid(nu, nu.sistaAvslutadKvar)).datum) : "") +
      (utan ? "; " + utan + " har inte öppnat ännu." : ".");
  }

  /* ---------- Kort sagt ---------- */

  function kortSagt(data, nu, da) {
    var j = data.jamforelse;
    var punkter = [];
    if (nu.sistaAvslutadDag) {
      punkter.push("Till och med " + esc(datumSv(nu.sistaAvslutadDag)) + " hade <strong>" +
        talSv(nu.totalAvslutad) + "</strong> förtidsröster tagits emot i Kungsbackas lokaler, " +
        kvarText(nu.sistaAvslutadKvar) + " till valdagen.");
    }
    if (j) {
      punkter.push("Vid samma punkt " + esc(da.ar) + " var det " + talSv(j.antalDa) +
        " &ndash; skillnaden är <strong>" + tecken(j.diff) + "</strong>" +
        (j.diffPct === null ? "" : " (" + teckenPct(j.diffPct, 1) + ")") + ".");
    }
    if (nu.andelAvRostberattigade !== null) {
      punkter.push("Det motsvarar <strong>" + talSv(nu.andelAvRostberattigade, 1) +
        "&nbsp;%</strong> av de röstberättigade i riksdagsvalet" +
        (j && j.andelDa !== null ? ", mot " + talSv(j.andelDa, 1) + "&nbsp;% vid samma punkt " + esc(da.ar) : "") +
        (j && j.andelSlutDa !== null ? ". När förtidsröstningen var över " + esc(da.ar) + " var andelen " + talSv(j.andelSlutDa, 1) + "&nbsp;%" : "") + ".");
    }
    if (nu.storstaDag) {
      punkter.push("Hittills största dagen " + esc(nu.ar) + " var " +
        esc(datumSv(nu.storstaDag.datum, nu.storstaDag.veckodag)) + " med " +
        talSv(nu.storstaDag.antal) + " röster." +
        (da && da.storstaDag ? " Största dagen " + esc(da.ar) + " kom " + kvarText(da.storstaDag.kvar) +
          " till valdagen, med " + talSv(da.storstaDag.antal) + " röster." : ""));
    }
    if (nu.lokaler.length && nu.lokaler[0].total > 0) {
      punkter.push("Flest röster har tagits emot på <strong>" + esc(nu.lokaler[0].namn) +
        "</strong>: " + talSv(nu.lokaler[0].total) + ", " + talSv(nu.lokaler[0].andel, 1) +
        "&nbsp;% av alla.");
    }
    punkter.push("Siffrorna visar hur många som röstat &ndash; inte vad de röstat på.");
    K.visaKortSagt(punkter);
  }

  /* ---------- Källor, metadata och varningar ---------- */

  function kallor(data, nu, da) {
    var rader = [];
    [nu, da].forEach(function (v) {
      if (!v) return;
      var url = sakerUrl(v.kallaUrl), sida = sakerUrl(v.sidaUrl);
      rader.push("<li><span class=\"titel\">" + esc(v.kalla) + "</span><br>" +
        "<span class=\"detalj\">Mottagna förtidsröster per röstningslokal och dag. Hämtad " +
        datumTidSv(v.hamtad) + ".</span>" +
        "<span class=\"lankar\">" +
        (url ? '<a href="' + url + '">CSV-filen</a>' : "") +
        (sida ? '<a href="' + sida + '">Valmyndighetens sida</a>' : "") + "</span></li>");
      if (v.rostberattigade) {
        var rb = v.rostberattigade;
        var rurl = sakerUrl(rb.kallaUrl);
        rader.push("<li><span class=\"titel\">" + esc(rb.kalla) + "</span><br>" +
          "<span class=\"detalj\">" + talSv(rb.riksdag) + " röstberättigade i riksdagsvalet i " +
          esc(v.omrade) +
          (rb.minstEtt ? ", " + talSv(rb.minstEtt) + " i minst ett av valen" : "") +
          ", fördelade på " + esc(rb.valdistrikt) + " valdistrikt. Hämtad " + datumTidSv(rb.hamtad) + ".</span>" +
          "<span class=\"lankar\">" + (rurl ? '<a href="' + rurl + '">Excel-filen</a>' : "") + "</span></li>");
      }
    });
    el("lista-kallor").innerHTML = rader.join("");
  }

  function varning(data, nu) {
    var v = el("varning");
    if (!v || nu.klart) return;
    var senast = Date.parse(data.senastUppdaterad);
    var slut = data.preliminarTom ? Date.parse(data.preliminarTom + "T23:59:59+02:00") : NaN;
    var nuTid = Date.now();
    if (isNaN(senast) || (!isNaN(slut) && nuTid > slut)) return;
    var timmar = (nuTid - senast) / 36e5;
    if (timmar > GAMMALT_EFTER_TIMMAR) {
      v.innerHTML = "<strong>Datat kan vara inaktuellt.</strong> Siffrorna på sidan " +
        "uppdaterades senast " + datumTidSv(data.senastUppdaterad) + ", för " +
        Math.round(timmar) + " timmar sedan. Valmyndigheten uppdaterar sin fil kl. 06 " +
        "och 14 varje dag; den automatiska hämtningen kan ha stannat. Aktuella tal " +
        "finns hos <a href=\"" + sakerUrl(data.kallaUrl) + "\">Valmyndigheten</a>.";
      v.hidden = false;
    }
  }

  /* ---------- Start ---------- */

  function start(data) {
    var nu = data.val[String(data.aktuellt)];
    var da = data.forra ? data.val[String(data.forra)] : null;

    K.visaMeta({
      kalla: "Valmyndigheten",
      period: datumSv(nu.forstaDag) + "–" + datumSv(nu.valdag) + " " + nu.ar +
        (da ? " (jämfört med " + da.ar + ")" : ""),
      senaste: nu.dagar.length ? datumSv(nu.dagar[nu.dagar.length - 1].datum) + " " + nu.ar : "",
      hamtad: datumTidSv(data.senastUppdaterad)
    });

    varning(data, nu);
    nyckeltal(data, nu, da);
    kortSagt(data, nu, da);
    ritaAck(nu, da);
    ritaDag(nu, da);
    topplista(nu);
    kallor(data, nu, da);

    ["nyckeltal", "ack", "dag", "lokaler", "kallor", "om"].forEach(function (id) {
      var s = el("sektion-" + id);
      if (s) s.hidden = false;
    });
    var upp = el("om-uppdaterad");
    if (upp) {
      upp.textContent = "Datat på den här sidan uppdaterades senast " +
        datumTidSv(data.senastUppdaterad) + (nu.klart ? " och är komplett för hela perioden." : ".");
    }
  }

  K.starta(DATAFIL, {
    init: start,
    tomt: function (data) {
      var nu = data.val && data.val[String(data.aktuellt)];
      return !nu || !nu.dagar || nu.dagar.length === 0;
    },
    tomtText: "Valmyndigheten har ännu inte publicerat några mottagna förtidsröster, " +
      "eller så har hämtningen inte körts. Förtidsröstningen börjar den 26 augusti 2026."
  });
})();
