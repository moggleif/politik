/* Förtidsröstningen i Kungsbacka — dag för dag inför valet 2026, jämförd
   med riksdagsvalet 2022 vid samma antal dagar kvar till valdagen.
   Läser docs/data-fortidsroster.json, byggd av scripts/build_fortidsroster.py
   ur Valmyndighetens öppna data.

   Datafilen innehåller bara fakta. Vilken dag som pågår (och därför har
   en ofullständig siffra) avgörs här, mot dagens datum i svensk tid när
   sidan laddas – inte mot hämtningstiden, som kan vara från i går.
   Jämförelsen med 2022 görs vid senaste avslutade dag.

   Sidan redovisar valdeltagande, inte opinion. */
(function () {
  "use strict";

  var K = window.KIS;
  var FARG = K.FARG;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;
  var sakerUrl = K.sakerUrl;

  var DATAFIL = "data-fortidsroster.json";

  /* Det aktuella valet i webbplatsens mörkblå, det förra i neutral grå
     som referens. Pågående dag: ljusblå med mörkblå kant. */
  var FARG_NU = FARG.blaMork;
  var FARG_DA = "#8f8d85";
  var FARG_PAGAR = FARG.blaLjus;
  /* Äldre val ritas bara i huvudgrafen: tunna, ljusare grå linjer som
     skiljs åt med streckning, inte med färg. */
  var FARG_ALDRE = "#adaba2";
  var STRECK_ALDRE = [[2, 3], [9, 3, 2, 3], [1, 3]];

  /* Så gammalt får datat vara under pågående förtidsröstning innan
     sidan säger till (filen uppdateras kl. 06 och 14). */
  var GAMMALT_EFTER_TIMMAR = 30;

  var MANAD = ["jan", "feb", "mars", "april", "maj", "juni",
               "juli", "aug", "sep", "okt", "nov", "dec"];

  function datumSv(iso, veckodag) {
    var d = iso.split("-");
    var text = parseInt(d[2], 10) + " " + MANAD[parseInt(d[1], 10) - 1];
    return veckodag ? veckodag + " " + text : text;
  }

  function datumTidSv(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso || "");
    if (!m) return esc(iso);
    var text = parseInt(m[3], 10) + " " + MANAD[parseInt(m[2], 10) - 1] + " " + m[1];
    if (m[4]) text += " kl. " + m[4] + "." + m[5];
    return text;
  }

  function tecken(n) { return (n > 0 ? "+" : n < 0 ? "−" : "") + talSv(Math.abs(n)); }
  function teckenPct(p) { return (p > 0 ? "+" : p < 0 ? "−" : "") + talSv(Math.abs(p), 1) + " %"; }
  function pct(antal, av) { return av ? 100 * antal / av : null; }

  function kvarText(k) {
    if (k === 0) return "valdagen";
    if (k === 1) return "1 dag kvar";
    return k + " dagar kvar";
  }

  function dagVid(dagar, kvar) {
    for (var i = 0; i < dagar.length; i++) if (dagar[i].kvar === kvar) return dagar[i];
    return null;
  }

  /* ---------- Läget ----------
     Allt sidan visar räknas härifrån: dagens datum avgör vilken dag som
     pågår, senaste avslutade dag är jämförelsepunkten. */
  function lage(nu, da, idag) {
    var dagar = nu.dagar.map(function (d) {
      return { datum: d.datum, veckodag: d.veckodag, kvar: d.kvar,
               antal: d.antal, ack: d.ack, pagar: d.datum === idag };
    });
    var avslutade = dagar.filter(function (d) { return !d.pagar; });
    var sista = avslutade.length ? avslutade[avslutade.length - 1] : null;
    var pagaende = dagar.length && dagar[dagar.length - 1].pagar ? dagar[dagar.length - 1] : null;
    var rbNu = nu.rostberattigade ? nu.rostberattigade.riksdag : null;
    var rbDa = da && da.rostberattigade ? da.rostberattigade.riksdag : null;
    var daVid = sista && da ? dagVid(da.dagar, sista.kvar) : null;
    var storsta = null;
    avslutade.forEach(function (d) { if (!storsta || d.antal > storsta.antal) storsta = d; });
    return {
      dagar: dagar, sista: sista, pagaende: pagaende, storsta: storsta,
      rbNu: rbNu, rbDa: rbDa, daVid: daVid,
      diff: daVid ? sista.ack - daVid.ack : null,
      diffPct: daVid && daVid.ack ? 100 * (sista.ack - daVid.ack) / daVid.ack : null,
      andelNu: sista ? pct(sista.ack, rbNu) : null,
      andelDa: daVid ? pct(daVid.ack, rbDa) : null,
      andelSlutDa: da ? pct(da.total, rbDa) : null
    };
  }

  /* X-axelns kategorier: dagar kvar, från första dagen till valdagen.
     Etiketten är två rader – dagar kvar och veckodag. */
  function skala(nu, da) {
    var n = Math.max(nu.antalDagar, da ? da.antalDagar : 0);
    var ut = [];
    for (var k = n - 1; k >= 0; k--) ut.push(k);
    return ut;
  }

  function etiketter(kvar, L, da) {
    return kvar.map(function (k) {
      var d = dagVid(L.dagar, k) || (da && dagVid(da.dagar, k));
      return [String(k), d ? d.veckodag : ""];
    });
  }

  function tooltipTitel(kvar, L, nu, da) {
    var delar = [kvarText(kvar).replace(/^./, function (c) { return c.toUpperCase(); })];
    var dn = dagVid(L.dagar, kvar), dd = da && dagVid(da.dagar, kvar);
    if (dn) delar.push(datumSv(dn.datum, dn.veckodag) + " " + nu.ar + (dn.pagar ? " (pågår)" : ""));
    if (dd) delar.push(datumSv(dd.datum, dd.veckodag) + " " + da.ar);
    return delar;
  }

  function basOptions(ytitel, L, nu, da, etikett, ytick) {
    return {
      maintainAspectRatio: false,
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, labels: { usePointStyle: true, boxWidth: 10 } },
        tooltip: {
          callbacks: {
            title: function (it) { return tooltipTitel(it[0].chart.$kvar[it[0].dataIndex], L, nu, da); },
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
          ticks: { callback: ytick || function (v) { return talSv(v); } }
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

  function nyckeltal(data, L, nu, da) {
    var rutor = [];
    if (L.sista) {
      /* Hämtades filen samma dag som sista avslutade dag är den dagens
         siffra från kl. 14-uppdateringen och fylls på nästa morgon. */
      var samma = String(data.senastUppdaterad).slice(0, 10) === L.sista.datum;
      rutor.push(ruta("Förtidsröster t.o.m. " + esc(datumSv(L.sista.datum)),
        talSv(L.sista.ack),
        (L.rbNu ? "av " + talSv(L.rbNu) + " röstberättigade. " : "") +
        (L.pagaende ? "Därtill " + talSv(L.pagaende.antal) + " hittills i dag." : "") +
        (samma ? "Sista dagen kompletteras vid nästa uppdatering." : "")));
    }
    if (L.daVid) {
      rutor.push(ruta(esc(da.ar) + " vid samma punkt", talSv(L.daVid.ack),
        kvarText(L.sista.kvar) + ". Slutligt " + esc(da.ar) + ": " + talSv(da.total) +
        (L.rbDa ? " av " + talSv(L.rbDa) : "") + "."));
      rutor.push(ruta("Skillnad mot " + esc(da.ar), tecken(L.diff),
        L.diffPct === null ? "" : teckenPct(L.diffPct)));
    }
    if (L.andelNu !== null) {
      rutor.push(ruta("Andel av de röstberättigade", talSv(L.andelNu, 1) + " %",
        (L.andelDa !== null ? esc(da.ar) + " vid samma punkt: " + talSv(L.andelDa, 1) + " %. " : "") +
        (L.andelSlutDa !== null ? "Slutligt " + esc(da.ar) + ": " + talSv(L.andelSlutDa, 1) + " %." : "")));
    }
    el("nyckeltal").innerHTML = rutor.join("");
    el("kalla-nyckeltal").textContent =
      "Källa: Valmyndigheten. Preliminärt t.o.m. " +
      (data.preliminarTom ? datumSv(data.preliminarTom) : "efter valet") +
      ". Röstberättigade avser riksdagsvalet.";
  }

  /* ---------- Kurvor: antal och andel ---------- */

  function linjeSerie(val, dagar, farg, streck, varde, tjock) {
    return {
      label: String(val.ar),
      data: dagar.map(function (d) { return d ? varde(d) : null; }),
      borderColor: farg,
      backgroundColor: farg,
      borderWidth: tjock ? 3 : 2,
      borderDash: streck || [],
      pointRadius: dagar.map(function (d) { return d && d.pagar ? 5 : 3; }),
      pointHoverRadius: 6,
      pointBackgroundColor: dagar.map(function (d) { return d && d.pagar ? FARG.surface : farg; }),
      pointBorderColor: farg,
      pointBorderWidth: 2,
      pointStyle: tjock ? "circle" : "rect",
      spanGaps: false,
      tension: 0.1
    };
  }

  function ritaKurva(id, L, nu, da, varde, ytitel, etikett, ytick, aldre) {
    var kvar = skala(nu, da);
    var nuDagar = kvar.map(function (k) { return dagVid(L.dagar, k); });
    var datasets = [linjeSerie(nu, nuDagar, FARG_NU, [], varde(nu), true)];
    if (da) {
      var daDagar = kvar.map(function (k) { return dagVid(da.dagar, k); });
      datasets.push(linjeSerie(da, daDagar, FARG_DA, [6, 4], varde(da), false));
    }
    (aldre || []).forEach(function (val, i) {
      var dagar = kvar.map(function (k) { return dagVid(val.dagar, k); });
      var s = linjeSerie(val, dagar, FARG_ALDRE, STRECK_ALDRE[i % STRECK_ALDRE.length], varde(val), false);
      s.borderWidth = 1.5;
      s.pointRadius = 0;
      s.pointStyle = "line";
      datasets.push(s);
    });
    var chart = K.rita(id, {
      type: "line",
      data: { labels: etiketter(kvar, L, da), datasets: datasets },
      options: basOptions(ytitel, L, nu, da, etikett, ytick)
    }, 360);
    chart.$kvar = kvar;
    K.aktiveraToning(chart);
  }

  function ritaAck(L, nu, da, aldre) {
    ritaKurva("diagram-ack", L, nu, da,
      function () { return function (d) { return d.ack; }; },
      "Förtidsröster sammanlagt",
      function (it) { return it.dataset.label + ": " + talSv(it.parsed.y); },
      null, aldre);
    el("kalla-ack").textContent = "Källa: Valmyndigheten. Valdagen är 0." +
      (aldre.length ? " Tunna grå linjer: " + aldre.map(function (v) { return v.ar; }).join(", ") + "." : "") +
      (L.pagaende ? " Ofylld punkt = pågående dag, ofullständig siffra." : "");
  }

  function ritaAndel(L, nu, da) {
    if (!L.rbNu) { el("sektion-andel").remove(); return; }
    ritaKurva("diagram-andel", L, nu, da,
      function (val) {
        var rb = val.rostberattigade ? val.rostberattigade.riksdag : null;
        return function (d) { return rb ? 100 * d.ack / rb : null; };
      },
      "Andel av de röstberättigade (%)",
      function (it) { return it.dataset.label + ": " + talSv(it.parsed.y, 1) + " %"; },
      function (v) { return talSv(v) + " %"; });
    el("kalla-andel").textContent = "Källa: Valmyndigheten. Röstberättigade i riksdagsvalet: " +
      talSv(L.rbNu) + " (" + nu.ar + ")" + (L.rbDa ? ", " + talSv(L.rbDa) + " (" + da.ar + ")" : "") + ".";
  }

  /* ---------- Staplar per dag ---------- */

  function ritaDag(L, nu, da) {
    var kvar = skala(nu, da);
    var nuDagar = kvar.map(function (k) { return dagVid(L.dagar, k); });
    var datasets = [];
    if (da) {
      datasets.push({
        label: String(da.ar),
        data: kvar.map(function (k) { var d = dagVid(da.dagar, k); return d ? d.antal : null; }),
        backgroundColor: FARG_DA, borderWidth: 0, borderRadius: 3, borderSkipped: false,
        grouped: false, barPercentage: 0.9, categoryPercentage: 0.9, order: 2
      });
    }
    datasets.push({
      label: String(nu.ar),
      data: nuDagar.map(function (d) { return d ? d.antal : null; }),
      backgroundColor: nuDagar.map(function (d) { return d && d.pagar ? FARG_PAGAR : FARG_NU; }),
      borderColor: FARG_NU,
      borderWidth: nuDagar.map(function (d) { return d && d.pagar ? 2 : 0; }),
      borderRadius: 3, borderSkipped: false,
      grouped: false, barPercentage: 0.9, categoryPercentage: 0.5, order: 1
    });
    var opt = basOptions("Förtidsröster per dag", L, nu, da, function (it) {
      return it.dataset.label + ": " + talSv(it.parsed.y);
    });
    opt.plugins.legend.labels.usePointStyle = false;
    var chart = K.rita("diagram-dag", {
      type: "bar",
      data: { labels: etiketter(kvar, L, da), datasets: datasets },
      options: opt
    }, 340);
    chart.$kvar = kvar;
    el("kalla-dag").textContent = "Källa: Valmyndigheten." +
      (L.pagaende ? " Ljusblå stapel = pågående dag, ofullständig siffra." : "");
    tabellDagar(L, nu, da);
  }

  function tabellDagar(L, nu, da) {
    var rader = L.dagar.map(function (d) {
      var dd = da && dagVid(da.dagar, d.kvar);
      return "<tr><th scope=\"row\">" + esc(datumSv(d.datum, d.veckodag)) +
        (d.pagar ? " (pågår)" : "") + "</th><td>" + esc(d.kvar) + "</td><td>" +
        talSv(d.antal) + "</td><td>" + talSv(d.ack) + "</td><td>" +
        (L.rbNu ? talSv(100 * d.ack / L.rbNu, 1) + "&nbsp;%" : "&ndash;") + "</td><td>" +
        (dd ? talSv(dd.antal) : "&ndash;") + "</td><td>" +
        (dd ? talSv(dd.ack) : "&ndash;") + "</td></tr>";
    }).join("");
    el("tabell-dagar").innerHTML =
      "<thead><tr><th scope=\"col\">Dag " + esc(nu.ar) + "</th><th scope=\"col\">Dagar kvar</th>" +
      "<th scope=\"col\">Antal</th><th scope=\"col\">Ackumulerat</th><th scope=\"col\">Andel</th>" +
      "<th scope=\"col\">Antal " + (da ? esc(da.ar) : "") + "</th>" +
      "<th scope=\"col\">Ackumulerat " + (da ? esc(da.ar) : "") + "</th></tr></thead>" +
      "<tbody>" + rader + "</tbody>";
  }

  /* ---------- Topplista över lokaler ---------- */

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

  function topplista(L, nu) {
    var med = nu.lokaler.filter(function (l) { return l.total > 0; });
    el("tabell-lokaler").innerHTML = lokalHuvud() + "<tbody>" + med.map(lokalRad).join("") + "</tbody>";
    el("tabell-lokaler-alla").innerHTML = lokalHuvud() + "<tbody>" + nu.lokaler.map(lokalRad).join("") + "</tbody>";
    var sistaDag = L.dagar.length ? L.dagar[L.dagar.length - 1] : null;
    el("kalla-lokaler").textContent = "Källa: Valmyndigheten. " + med.length + " av " +
      nu.lokaler.length + " lokaler har tagit emot röster" +
      (sistaDag ? " t.o.m. " + datumSv(sistaDag.datum) : "") + ".";
  }

  /* ---------- Kort sagt ---------- */

  function kortSagt(L, nu, da) {
    var p = [];
    if (L.sista) {
      p.push("<strong>" + talSv(L.sista.ack) + "</strong> förtidsröster t.o.m. " +
        esc(datumSv(L.sista.datum)) + ", " + kvarText(L.sista.kvar) +
        (L.andelNu !== null ? " &ndash; " + talSv(L.andelNu, 1) + "&nbsp;% av de röstberättigade" : "") + ".");
    }
    if (L.daVid) {
      p.push("Vid samma punkt " + esc(da.ar) + ": " + talSv(L.daVid.ack) +
        (L.andelDa !== null ? " (" + talSv(L.andelDa, 1) + "&nbsp;%)" : "") +
        ", skillnad <strong>" + tecken(L.diff) + "</strong>" +
        (L.diffPct === null ? "" : " (" + teckenPct(L.diffPct) + ")") + ".");
    }
    if (nu.lokaler.length && nu.lokaler[0].total > 0) {
      p.push("Flest på <strong>" + esc(nu.lokaler[0].namn) + "</strong>: " +
        talSv(nu.lokaler[0].andel, 1) + "&nbsp;% av rösterna.");
    }
    K.visaKortSagt(p);
  }

  /* ---------- Källor, varning, start ---------- */

  function kallor(nu, da, aldre) {
    var rader = [];
    [nu, da].concat(aldre).forEach(function (v) {
      if (!v) return;
      var url = sakerUrl(v.kallaUrl), sida = sakerUrl(v.sidaUrl);
      rader.push("<li><span class=\"titel\">" + esc(v.kalla) + "</span><br>" +
        "<span class=\"detalj\">Hämtad " + datumTidSv(v.hamtad) + ".</span>" +
        "<span class=\"lankar\">" + (url ? '<a href="' + url + '">CSV-filen</a>' : "") +
        (sida ? '<a href="' + sida + '">Valmyndighetens sida</a>' : "") + "</span></li>");
      if (v.rostberattigade) {
        var rb = v.rostberattigade, rurl = sakerUrl(rb.kallaUrl);
        rader.push("<li><span class=\"titel\">" + esc(rb.kalla) + "</span><br>" +
          "<span class=\"detalj\">" + talSv(rb.riksdag) + " röstberättigade i riksdagsvalet, " +
          esc(rb.valdistrikt) + " valdistrikt. Hämtad " + datumTidSv(rb.hamtad) + ".</span>" +
          "<span class=\"lankar\">" + (rurl ? '<a href="' + rurl + '">Excel-filen</a>' : "") + "</span></li>");
      }
    });
    el("lista-kallor").innerHTML = rader.join("");
  }

  /* Ångerröster: den som förtidsröstat kan rösta igen på valdagen.
     Valmyndigheten publicerar antalet bara för hela landet, så noten
     säger rikssiffran och vad samma andel skulle motsvara på det förra
     valets förtidsröster här – ren räkning, ingen prognos. */
  function angerNot(data, da) {
    var a = data.angerroster;
    if (!a || !a.val) { K.sattDataNot("not-anger", ""); return; }
    var ar = Object.keys(a.val).map(Number).sort(function (x, y) { return y - x; });
    if (!ar.length) { K.sattDataNot("not-anger", ""); return; }
    var senast = a.val[String(ar[0])];
    var andel = senast.fortidsrosterRiket ? 100 * senast.angerroster / senast.fortidsrosterRiket : null;
    var text = "<p><strong>Kan de ångra sig?</strong> Ja &ndash; den som förtidsröstat kan " +
      "rösta igen i sin vallokal på valdagen, och då räknas bara valdagsrösten. I hela " +
      "landet gjorde <strong>" + talSv(senast.angerroster) + "</strong> personer det " + esc(ar[0]) +
      (andel !== null ? ", " + talSv(andel, 2) + "&nbsp;% av förtidsrösterna" : "") +
      (senast.andelAvRostande ? " (" + talSv(senast.andelAvRostande, 2) + "&nbsp;% av alla röstande)" : "") +
      (ar.length > 1 ? "; " + esc(ar[1]) + ": " + talSv(a.val[String(ar[1])].angerroster) : "") + ".";
    if (andel !== null && da && da.ar === ar[0] && da.total) {
      text += " Siffran finns inte per kommun. Samma andel på " + esc(da.omrade) + "s " +
        talSv(da.total) + " förtidsröster " + esc(da.ar) + " motsvarar ungefär " +
        talSv(Math.round(andel * da.total / 100 / 10) * 10) + ".";
    } else {
      text += " Siffran finns inte per kommun.";
    }
    var url = sakerUrl(a.kallaUrl);
    text += " Källa: " + (url ? '<a href="' + url + '">' + esc(a.kalla) + "</a>" : esc(a.kalla)) + ".</p>";
    K.sattDataNot("not-anger", text);
  }

  function varning(data, nu) {
    var v = el("varning");
    if (!v || nu.klart) return;
    var senast = Date.parse(data.senastUppdaterad);
    var slut = data.preliminarTom ? Date.parse(data.preliminarTom + "T23:59:59+02:00") : NaN;
    if (isNaN(senast) || (!isNaN(slut) && Date.now() > slut)) return;
    var timmar = (Date.now() - senast) / 36e5;
    if (timmar > GAMMALT_EFTER_TIMMAR) {
      v.innerHTML = "<strong>Datat kan vara inaktuellt.</strong> Senast uppdaterat " +
        datumTidSv(data.senastUppdaterad) + ", för " + Math.round(timmar) +
        " timmar sedan. Aktuella tal finns hos <a href=\"" + sakerUrl(data.kallaUrl) +
        "\">Valmyndigheten</a>.";
      v.hidden = false;
    }
  }

  function start(data) {
    var nu = data.val[String(data.aktuellt)];
    var da = data.forra ? data.val[String(data.forra)] : null;
    /* Äldre val än det förra: bara i huvudgrafen, nyast först */
    var aldre = Object.keys(data.val).map(Number).filter(function (a) {
      return a !== data.aktuellt && a !== data.forra;
    }).sort(function (a, b) { return b - a; }).map(function (a) { return data.val[String(a)]; });
    var L = lage(nu, da, K.idagSv());

    K.visaMeta({
      kalla: "Valmyndigheten",
      period: datumSv(nu.forstaDag) + "–" + datumSv(nu.valdag) + " " + nu.ar + (da ? ", mot " + da.ar : ""),
      senaste: L.dagar.length ? datumSv(L.dagar[L.dagar.length - 1].datum) + " " + nu.ar : "",
      hamtad: datumTidSv(data.senastUppdaterad)
    });

    varning(data, nu);
    nyckeltal(data, L, nu, da);
    angerNot(data, da);
    kortSagt(L, nu, da);
    ritaAck(L, nu, da, aldre);
    ritaAndel(L, nu, da);
    ritaDag(L, nu, da);
    topplista(L, nu);
    kallor(nu, da, aldre);

    ["nyckeltal", "ack", "andel", "dag", "lokaler", "kallor", "om"].forEach(function (id) {
      var s = el("sektion-" + id);
      if (s) s.hidden = false;
    });
    el("om-uppdaterad").textContent = "Uppdaterad " + datumTidSv(data.senastUppdaterad) +
      (nu.klart ? ". Perioden är avslutad." : ".");
  }

  K.starta(DATAFIL, {
    init: start,
    tomt: function (data) {
      var nu = data.val && data.val[String(data.aktuellt)];
      return !nu || !nu.dagar || nu.dagar.length === 0;
    },
    tomtText: "Valmyndigheten har ännu inte publicerat några mottagna förtidsröster. " +
      "Förtidsröstningen börjar den 26 augusti 2026."
  });
})();
