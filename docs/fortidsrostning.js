/* Förtidsröstningen — dag för dag inför valet 2026, jämförd med
   riksdagsvalet 2022 vid samma antal dagar kvar till valdagen, för
   valfri kommun, valfritt län eller hela riket.
   Läser docs/data-fortidsroster/index.json (områdeslistan) och därefter
   docs/data-fortidsroster/<kod>.json för det valda området, båda byggda
   av scripts/build_fortidsroster.py ur Valmyndighetens öppna data.

   Datafilerna innehåller bara fakta. Vilken dag som pågår (och därför
   har en ofullständig siffra) avgörs här, mot dagens datum i svensk tid
   när sidan laddas – inte mot hämtningstiden, som kan vara från i går.
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

  var MAPP = "data-fortidsroster/";
  var INDEXFIL = MAPP + "index.json";

  /* Det aktuella valet i webbplatsens mörkblå, det förra i neutral grå
     som referens. Pågående dag: ljusblå med mörkblå kant. Äldre val
     ritas bara i huvudgrafen: tunna, ljusare grå linjer som skiljs åt
     med streckning, inte med färg. */
  var FARG_NU = FARG.blaMork;
  var FARG_DA = "#8f8d85";
  var FARG_PAGAR = FARG.blaLjus;
  var FARG_ALDRE = "#adaba2";
  var STRECK_ALDRE = [[2, 3], [9, 3, 2, 3], [1, 3]];

  /* Framskrivningen i orange, aldrig i sidans blå: på hela webbplatsen
     betyder blått uppmätt utfall och orange något som är räknat fram.
     Prickad linje, inte heldragen, av samma skäl. */
  var FARG_PROGNOS = FARG.orangeMork;
  var FARG_PROGNOS_BAND = "rgba(230, 159, 0, 0.18)";
  var STRECK_PROGNOS = [2, 4];

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

  /* "i Kungsbacka", "i Hallands län", "i hela riket" */
  function iOmradet(data) {
    if (data.typ === "riket") return "i hela riket";
    return "i " + data.omrade;
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
        legend: {
          display: true,
          labels: {
            usePointStyle: true, boxWidth: 10,
            /* Bandets båda kanter är en och samma sak – omfånget – och
               står i tooltipen, inte som två poster i förklaringen. */
            filter: function (post, d) { return !d.datasets[post.datasetIndex].$utanLegend; }
          }
        },
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

  /* ---------- Den ställda prognosen ----------
     Prognosen räknas inte här. Den ställdes en gång, av
     scripts/gor_prognos.py, vid den dag som står i datafilen, och ligger
     frusen i data/fortidsroster/prognos.json – tal för tal, dag för dag.
     Sidan ritar ut den som den är.

     Det är själva poängen: en prognos som räknas om vid varje sidvisning
     följer med datat och kan aldrig ha fel. Den här står kvar och går att
     jämföra med utfallet, både medan perioden pågår och efteråt. Därför
     försvinner den inte heller när valdagen är passerad.

     Modellen och dess svagheter står i filen och på metodsidan; här
     finns bara utritningen. */

  /* Två värdesiffror. Ett framskrivet tal ska inte se uppmätt ut. */
  function grovt(n) {
    if (!isFinite(n) || n <= 0) return 0;
    var storlek = Math.pow(10, Math.floor(Math.log(n) / Math.LN10) - 1);
    return Math.round(n / storlek) * storlek;
  }

  /* Prognosen gäller bara det val och det område den ställdes för. */
  function prognosFor(data, nu) {
    var P = data.prognos;
    if (!P || !P.bana || !P.bana.length) return null;
    if (P.val !== nu.ar || P.kod && P.kod !== data.kod) return null;
    return P;
  }

  function banVarde(P, kvar, falt) {
    for (var i = 0; i < P.bana.length; i++) {
      if (P.bana[i].kvar === kvar) return P.bana[i][falt];
    }
    return null;
  }

  /* Hur det har gått sedan prognosen ställdes: utfallet vid senaste
     avslutade dag mot den kurva som ritades då. */
  function utfallMot(P, L, nu) {
    if (nu.klart && nu.total) {
      return { klart: true, faktiskt: nu.total, vantat: P.modell,
               avvikelse: 100 * (nu.total - P.modell) / P.modell,
               inomOmfang: nu.total >= P.lag && nu.total <= P.hog };
    }
    if (!L.sista || L.sista.kvar >= P.brytpunkt.kvar) return null;
    var vantat = banVarde(P, L.sista.kvar, "modell");
    if (!vantat) return null;
    return { klart: false, kvar: L.sista.kvar, faktiskt: L.sista.ack, vantat: vantat,
             avvikelse: 100 * (L.sista.ack - vantat) / vantat,
             inomOmfang: L.sista.ack >= banVarde(P, L.sista.kvar, "lag") &&
                         L.sista.ack <= banVarde(P, L.sista.kvar, "hog") };
  }

  /* Bandet mellan ytterlägena plus den prickade mittlinjen, båda hämtade
     rakt ur den frusna banan. Bandets kanter ritas utan egen linje:
     omfånget är en yta, inte tre kurvor. `fill: "-1"` fyller mot närmast
     föregående dataset, alltså mot den låga kanten – de två måste därför
     ligga intill varandra. */
  function prognosDatasets(P, kvar, varde, nu) {
    var till = varde(nu);
    function serie(falt) {
      return kvar.map(function (k) {
        var v = banVarde(P, k, falt);
        return v === null ? null : till({ ack: v });
      });
    }
    function kant(falt, etikett) {
      return {
        label: etikett, data: serie(falt),
        borderColor: FARG_PROGNOS_BAND, backgroundColor: FARG_PROGNOS_BAND,
        borderWidth: 0, pointRadius: 0, pointHoverRadius: 0,
        spanGaps: false, tension: 0.1, order: 3, $utanLegend: true
      };
    }
    var lag = kant("lag", "Prognos, lägre utfall");
    var hog = kant("hog", "Prognos, högre utfall");
    hog.fill = "-1";
    return [lag, hog, {
      label: "Prognos " + nu.ar,
      data: serie("modell"),
      borderColor: FARG_PROGNOS, backgroundColor: FARG_PROGNOS,
      borderWidth: 2.5, borderDash: STRECK_PROGNOS,
      pointRadius: kvar.map(function (k) { return k === 0 ? 4 : 0; }),
      pointHoverRadius: 6,
      pointBackgroundColor: FARG.surface,
      pointBorderColor: FARG_PROGNOS, pointBorderWidth: 2,
      pointStyle: "circle", spanGaps: false, tension: 0.1, order: 3
    }];
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

  function ritaKurva(id, L, nu, da, varde, ytitel, etikett, ytick, aldre, P) {
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
    if (P) datasets = datasets.concat(prognosDatasets(P, kvar, varde, nu));
    var chart = K.rita(id, {
      type: "line",
      data: { labels: etiketter(kvar, L, da), datasets: datasets },
      options: basOptions(ytitel, L, nu, da, etikett, ytick)
    }, 360);
    chart.$kvar = kvar;
    K.aktiveraToning(chart);
  }

  function ritaAck(L, nu, da, aldre, P) {
    ritaKurva("diagram-ack", L, nu, da,
      function () { return function (d) { return d.ack; }; },
      "Förtidsröster sammanlagt",
      function (it) { return it.dataset.label + ": " + talSv(it.parsed.y); },
      null, aldre, P);
    el("kalla-ack").textContent = "Källa: Valmyndigheten. Valdagen är 0." +
      (aldre.length ? " Tunna grå linjer: " + aldre.map(function (v) { return v.ar; }).join(", ") + "." : "") +
      (L.pagaende ? " Ofylld punkt = pågående dag, ofullständig siffra." : "") +
      (P ? " Den prickade orange linjen och det orange fältet är den prognos som" +
           " ställdes " + datumSv(P.brytpunkt.datum) + ", vid " +
           kvarText(P.brytpunkt.kvar) + "; de är räknade, inte uppmätta." : "");
  }

  function ritaAndel(L, nu, da, P) {
    var sektion = el("sektion-andel");
    if (!L.rbNu) {
      K.taBortDiagram("diagram-andel");
      sektion.hidden = true;
      return;
    }
    sektion.hidden = false;
    ritaKurva("diagram-andel", L, nu, da,
      function (val) {
        var rb = val.rostberattigade ? val.rostberattigade.riksdag : null;
        return function (d) { return rb ? 100 * d.ack / rb : null; };
      },
      "Andel av de röstberättigade (%)",
      function (it) { return it.dataset.label + ": " + talSv(it.parsed.y, 1) + " %"; },
      function (v) { return talSv(v) + " %"; }, null, P);
    el("kalla-andel").textContent = "Källa: Valmyndigheten. Röstberättigade i riksdagsvalet: " +
      talSv(L.rbNu) + " (" + nu.ar + ")" + (L.rbDa ? ", " + talSv(L.rbDa) + " (" + da.ar + ")" : "") + "." +
      (P ? " Orange: den ställda prognosen, se rutan ovanför." : "");
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

  function lokalRad(medKommun) {
    return function (l, i) {
      return "<tr><td>" + (i + 1) + "</td><th scope=\"row\">" + esc(l.namn) + "</th>" +
        (medKommun ? "<td>" + esc(l.kommun) + "</td>" : "") + "<td>" +
        talSv(l.total) + "</td><td>" + (l.andel === null ? "&ndash;" : talSv(l.andel, 1) + "&nbsp;%") +
        "</td><td>" + esc(l.dagarMedRoster) + "</td><td>" + talSv(l.storstaDag) + "</td></tr>";
    };
  }

  function lokalHuvud(medKommun) {
    return "<thead><tr><th scope=\"col\">#</th><th scope=\"col\">Röstningslokal</th>" +
      (medKommun ? "<th scope=\"col\">Kommun</th>" : "") +
      "<th scope=\"col\">Röster</th><th scope=\"col\">Andel</th>" +
      "<th scope=\"col\">Dagar med röster</th><th scope=\"col\">Största dag</th></tr></thead>";
  }

  function topplista(L, nu) {
    var medKommun = nu.typ !== "kommun";
    var med = nu.lokaler.filter(function (l) { return l.total > 0; });
    el("tabell-lokaler").innerHTML = lokalHuvud(medKommun) + "<tbody>" +
      med.map(lokalRad(medKommun)).join("") + "</tbody>";
    var alla = el("detalj-lokaler-alla");
    alla.hidden = nu.lokalerKapad;
    el("tabell-lokaler-alla").innerHTML = nu.lokalerKapad ? "" :
      lokalHuvud(medKommun) + "<tbody>" + nu.lokaler.map(lokalRad(medKommun)).join("") + "</tbody>";
    var sistaDag = L.dagar.length ? L.dagar[L.dagar.length - 1] : null;
    el("kalla-lokaler").textContent = "Källa: Valmyndigheten. " +
      (nu.lokalerKapad
        ? "De " + med.length + " största av " + talSv(nu.antalLokaler) + " lokaler"
        : med.length + " av " + nu.antalLokaler + " lokaler har tagit emot röster") +
      (sistaDag ? " t.o.m. " + datumSv(sistaDag.datum) : "") + ".";
  }

  /* ---------- Kort sagt ---------- */

  function kortSagt(data, L, nu, da) {
    var p = [];
    if (L.sista) {
      p.push("<strong>" + talSv(L.sista.ack) + "</strong> förtidsröster " + esc(iOmradet(data)) +
        " t.o.m. " + esc(datumSv(L.sista.datum)) + ", " + kvarText(L.sista.kvar) +
        (L.andelNu !== null ? " &ndash; " + talSv(L.andelNu, 1) + "&nbsp;% av de röstberättigade" : "") + ".");
    }
    if (L.daVid) {
      p.push("Vid samma punkt " + esc(da.ar) + ": " + talSv(L.daVid.ack) +
        (L.andelDa !== null ? " (" + talSv(L.andelDa, 1) + "&nbsp;%)" : "") +
        ", skillnad <strong>" + tecken(L.diff) + "</strong>" +
        (L.diffPct === null ? "" : " (" + teckenPct(L.diffPct) + ")") + ".");
    }
    if (nu.lokaler.length && nu.lokaler[0].total > 0) {
      p.push("Flest på <strong>" + esc(nu.lokaler[0].namn) + "</strong>" +
        (nu.typ !== "kommun" ? " i " + esc(nu.lokaler[0].kommun) : "") + ": " +
        talSv(nu.lokaler[0].andel, 1) + "&nbsp;% av rösterna.");
    }
    K.visaKortSagt(p);
  }

  /* ---------- Rutan med prognosen ----------
     Tre tal – ytterlägena och prognosen – och sedan vad de vilar på och
     hur det har gått sedan den ställdes. Rutan är orange, inte blå som
     "Kort sagt", för att det ska synas på en meters håll att talen är
     räknade och inte mätta. */

  function prognosTal(etikett, tal, klass) {
    return "<div" + (klass ? ' class="' + klass + '"' : "") +
      '><span class="prognos-etikett">' + etikett +
      '</span><span class="prognos-tal">' + talSv(tal) + "</span></div>";
  }

  function prognosGrund(data, P) {
    var ar = P.punkter.map(function (p) { return p.ar; });
    var mot = P.forraValetVid
      ? ", " + teckenPct(100 * (P.ack - P.forraValetVid) / P.forraValetVid) +
        " mot " + esc(P.forraValet) + " vid samma punkt"
      : "";
    return "<p>Vid <strong>" + esc(kvarText(P.brytpunkt.kvar)) + "</strong> hade " +
      talSv(P.ack) + " förtidsröster tagits emot " + esc(iOmradet(data)) + mot +
      ". I " + (ar.length === 1 ? "valet " + esc(ar[0]) : "valen " + esc(ar.join(", "))) +
      " var i snitt " + talSv(P.snittAndel * 100, 0) + "&nbsp;% av slutsumman inne " +
      "så här långt in. Håller det mönstret slutar " + esc(P.val) + " på omkring <strong>" +
      talSv(grovt(P.modell)) + "</strong> förtidsröster.</p>" +
      "<p>Osäkerheten sitter i tolkningen, inte i räkningen: siffrorna kan " +
      "inte skilja fler förtidsröstare från samma väljare tidigare. Ger resten av " +
      "perioden lika många röster som " + esc(P.forraValet) + " gav efter samma punkt " +
      "stannar det vid <strong>" + talSv(grovt(P.somForra)) + "</strong>. Håller " +
      "försprånget hela vägen blir det <strong>" + talSv(grovt(P.hog)) + "</strong>.</p>";
  }

  /* Facit så långt. Prognosen står kvar och kan därför ha fel öppet. */
  function prognosUtfall(U) {
    if (!U) return "";
    var av = Math.abs(U.avvikelse);
    var hall = U.avvikelse > 0 ? "över" : "under";
    if (U.klart) {
      return '<p class="prognos-facit"><strong>Facit:</strong> ' + talSv(U.faktiskt) +
        " förtidsröster. Prognosen låg " + talSv(av, 1) + "&nbsp;% " +
        (U.avvikelse > 0 ? "för lågt" : "för högt") +
        (U.inomOmfang ? ", inom omfånget." : ", utanför omfånget.") + "</p>";
    }
    return '<p class="prognos-facit"><strong>Så här har det gått:</strong> vid ' +
      esc(kvarText(U.kvar)) + " hade " + talSv(U.faktiskt) + " röster tagits emot, " +
      talSv(av, 1) + "&nbsp;% " + hall + " prognosens kurva" +
      (U.inomOmfang ? " och inom omfånget." : " och utanför omfånget.") + "</p>";
  }

  function prognosRuta(data, L, nu, P) {
    var plats = el("prognos");
    if (!plats) return;
    if (!P) { plats.innerHTML = ""; plats.hidden = true; return; }

    var html = '<div class="prognos-ruta" role="note">' +
      "<h3>Var landar det? En prognos</h3>" +
      '<p class="prognos-stalld">Ställd ' + esc(datumSv(P.brytpunkt.datum)) +
      " " + esc(P.val) + ", vid " + esc(kvarText(P.brytpunkt.kvar)) +
      ". Den räknas inte om &ndash; talen nedan är desamma varje gång sidan " +
      "laddas, ända till valdagen och efter den.</p>" +
      '<div class="prognos-spann">' +
      prognosTal("Lägre utfall", grovt(P.lag)) +
      prognosTal("Prognos", grovt(P.modell), "prognos-mitt") +
      prognosTal("Högre utfall", grovt(P.hog)) +
      "</div>" +
      prognosGrund(data, P) +
      prognosUtfall(utfallMot(P, L, nu));

    html += '<p class="prognos-not">Prognos, inte mätning &ndash; och den säger ' +
      "ingenting om vilka partier rösterna går till." +
      (P.prov ? " Samma modell prövad på de val som redan är avgjorda här, vid " +
        "samma punkt, har legat i snitt " + talSv(P.prov.medel, 1) + "&nbsp;% fel och " +
        "som mest " + talSv(P.prov.storsta, 1) + "&nbsp;% (" + P.prov.antal +
        " jämförelser). Inget av de valen bytte mönster på vägen, så det felet är " +
        "ett golv för osäkerheten, inte ett tak." : "") +
      ' <a href="metod.html#sektion-regler">Så räknades den.</a></p></div>';

    plats.innerHTML = html;
    plats.hidden = false;
  }

  /* ---------- Källor, ångerröster, varning ---------- */

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
          talSv(rb.valdistrikt) + " valdistrikt. Hämtad " + datumTidSv(rb.hamtad) + ".</span>" +
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
    if (andel !== null && da && da.ar === ar[0] && da.total && data.typ !== "riket") {
      text += " Siffran finns inte per kommun. Samma andel på de " + talSv(da.total) +
        " förtidsrösterna " + esc(iOmradet(data)) + " " + esc(da.ar) + " motsvarar ungefär " +
        talSv(Math.round(andel * da.total / 100 / 10) * 10) + ".";
    } else if (data.typ !== "riket") {
      text += " Siffran finns inte per kommun.";
    }
    var url = sakerUrl(a.kallaUrl);
    text += " Källa: " + (url ? '<a href="' + url + '">' + esc(a.kalla) + "</a>" : esc(a.kalla)) + ".</p>";
    K.sattDataNot("not-anger", text);
  }

  function varning(data, nu) {
    var v = el("varning");
    if (!v) return;
    v.hidden = true;
    if (nu.klart) return;
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

  /* ---------- Ett område ---------- */

  function visa(data) {
    var nu = data.val[String(data.aktuellt)];
    var da = data.forra ? data.val[String(data.forra)] : null;
    /* Äldre val än det förra: bara i huvudgrafen, nyast först */
    var aldre = Object.keys(data.val).map(Number).filter(function (a) {
      return a !== data.aktuellt && a !== data.forra;
    }).sort(function (a, b) { return b - a; }).map(function (a) { return data.val[String(a)]; });
    var L = lage(nu, da, K.idagSv());

    el("omrade-namn").textContent = iOmradet(data);
    document.title = "Hur många har förtidsröstat " + iOmradet(data) + "?";

    K.visaMeta({
      kalla: "Valmyndigheten",
      period: datumSv(nu.forstaDag) + "–" + datumSv(nu.valdag) + " " + nu.ar + (da ? ", mot " + da.ar : ""),
      senaste: L.dagar.length ? datumSv(L.dagar[L.dagar.length - 1].datum) + " " + nu.ar : "",
      hamtad: datumTidSv(data.senastUppdaterad)
    });

    var P = prognosFor(data, nu);

    varning(data, nu);
    nyckeltal(data, L, nu, da);
    angerNot(data, da);
    kortSagt(data, L, nu, da);
    ritaAck(L, nu, da, aldre, P);
    prognosRuta(data, L, nu, P);
    ritaAndel(L, nu, da, P);
    ritaDag(L, nu, da);
    topplista(L, nu);
    kallor(nu, da, aldre);

    ["nyckeltal", "ack", "dag", "lokaler", "kallor", "om"].forEach(function (id) {
      var s = el("sektion-" + id);
      if (s) s.hidden = false;
    });
    el("om-uppdaterad").textContent = "Uppdaterad " + datumTidSv(data.senastUppdaterad) +
      (nu.klart ? ". Perioden är avslutad." : ".");
  }

  function tomt(data) {
    var nu = data.val && data.val[String(data.aktuellt)];
    return !nu || !nu.dagar || nu.dagar.length === 0;
  }

  function laddaOmrade(kod) {
    var status = el("status");
    fetch(MAPP + encodeURIComponent(kod) + ".json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (data) {
      if (tomt(data)) {
        K.visaStatus("<strong>Datat är inte på plats ännu.</strong> Valmyndigheten har ännu " +
          "inte publicerat några mottagna förtidsröster. Förtidsröstningen börjar den 26 augusti 2026.");
        return;
      }
      status.hidden = true;
      visa(data);
    }).catch(function (fel) {
      K.visaStatus("<strong>Kunde inte läsa in datat.</strong> Tekniskt fel: " +
        esc(fel.message) + " (" + esc(kod) + ")");
    });
  }

  /* ---------- Väljaren ----------
     Områdeslistan fyller ett <select> i tre grupper. Valet speglas i
     adressraden som ?omrade=<slug> via K.kopplaValjare, som också
     hanterar bakåt/framåt. */

  function startIndex(index) {
    var valjare = el("valj-omrade");
    var perSlug = {};
    var grupper = [["riket", "Riket"], ["lan", "Län"], ["kommun", "Kommuner"]];
    grupper.forEach(function (g) {
      var og = document.createElement("optgroup");
      og.label = g[1];
      index.omraden.filter(function (o) { return o.typ === g[0]; }).forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o.slug;
        opt.textContent = o.namn;
        og.appendChild(opt);
        perSlug[o.slug] = o.kod;
      });
      if (og.children.length) valjare.appendChild(og);
    });

    var standard = document.body.getAttribute("data-omrade") || index.standard;
    index.omraden.forEach(function (o) { if (o.kod === standard) valjare.value = o.slug; });

    function ritaOm() {
      var kod = perSlug[valjare.value];
      if (kod) laddaOmrade(kod);
    }
    K.kopplaValjare(valjare, "omrade", ritaOm);
    el("valjarrad").hidden = false;
    ritaOm();
  }

  K.starta(INDEXFIL, { init: startIndex });
})();
