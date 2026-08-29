/* Från antagning till examen – läser docs/data-kull.json och ritar
   panelerna. En kull är antagningen år X ställd mot avgångseleverna år
   X+3 för samma program. Meritvärdet (max 340) och betygspoängen (0–20)
   är olika mått på olika skalor och ritas därför i skilda paneler med
   var sin axel – aldrig i samma diagram. Parningen görs i
   scripts/build_kull.py. */
(function () {
  "use strict";

  var K = window.KIS;
  var FARG = K.FARG;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;

  /* Olika mått får olika kulör ur den validerade paletten, så att
     panelerna inte ser ut att visa samma sak: lila = grundskolebetyg,
     blått = gymnasiebetyg. */
  var FARG_MERIT = "#7a5195";
  var FARG_BETYG = "#1c5cab";

  var ANTAGNING_STATUS = {
    rapport_saknas: "antagningsrapporten saknas",
    ingen_antagning: "ingen antagning det året"
  };
  var EXAMEN_STATUS = {
    framtid: "kullen har inte hunnit gå ut",
    rapport_saknas: "Skolverkets rapport saknas",
    ej_redovisad: "programmet redovisas inte det året",
    sekretess: "färre än tio avgångselever – Skolverket redovisar inte värdet"
  };

  var DATA = null;
  var rita = K.rita;

  function valtProgram() {
    var etikett = el("program-valjare").value;
    return DATA.program.filter(function (p) { return p.etikett === etikett; })[0]
      || DATA.program[0];
  }

  function kullEtikett(r) { return r.antagningsar + " → " + r.examensar; }

  /* ---------- Panelerna ---------- */

  function panelKonf(rader, hamta, farg, enhet, dec, minMax) {
    var skala = {
      grid: { color: FARG.grid },
      border: { color: FARG.baseline },
      ticks: { callback: function (v) { return talSv(v, dec) + (enhet === "%" ? " %" : ""); } }
    };
    if (minMax) { skala.min = minMax[0]; skala.max = minMax[1]; }
    else { skala.beginAtZero = false; skala.grace = "15%"; }

    return {
      type: "line",
      data: {
        labels: rader.map(kullEtikett),
        datasets: [{
          data: rader.map(hamta),
          borderColor: farg,
          backgroundColor: farg,
          borderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBorderColor: FARG.surface,
          pointBorderWidth: 1,
          spanGaps: false,
          tension: 0.1
        }]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function (it) {
                var r = rader[it[0].dataIndex];
                return "Antagen " + r.antagningsar + ", examen " + r.examensar;
              },
              label: function (it) { return tooltipRader(rader[it.dataIndex]); }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: FARG.baseline },
            ticks: { maxRotation: 45, autoSkipPadding: 6, font: { size: 13 } }
          },
          y: skala
        }
      }
    };
  }

  function tooltipRader(r) {
    var rader = [];
    if (r.antagning.status === "ok") {
      rader.push("Meritvärde vid antagningen: " + talSv(r.antagning.medel, 1) + " (max 340)");
    } else {
      rader.push("Antagningen: " + ANTAGNING_STATUS[r.antagning.status]);
    }
    if (r.examen.status === "ok") {
      rader.push("Betygspoäng vid examen: " + talSv(r.examen.betygspoang, 1) + " (max 20)");
      if (r.examen.andelExamen !== null && r.examen.andelExamen !== undefined) {
        rader.push("Andel med examen: " + talSv(r.examen.andelExamen, 1) + " %");
      }
      if (r.examen.antal) rader.push(r.examen.antal + " avgångselever");
    } else {
      rader.push("Examen: " + EXAMEN_STATUS[r.examen.status]);
    }
    return rader;
  }

  function ritaKullar() {
    var p = valtProgram();
    if (!p) return;
    var rader = p.kohorter;

    var harExamen = rader.some(function (r) { return r.examen.status === "ok"; });
    var harAndel = rader.some(function (r) {
      return r.examen.status === "ok" && r.examen.andelExamen !== null;
    });

    rita("diagram-antagning", panelKonf(rader, function (r) {
      return r.antagning.status === "ok" ? r.antagning.medel : null;
    }, FARG_MERIT, "", 0), 260);

    rita("diagram-examen", panelKonf(rader, function (r) {
      return r.examen.status === "ok" ? r.examen.betygspoang : null;
    }, FARG_BETYG, "", 1), 260);

    rita("diagram-andel", panelKonf(rader, function (r) {
      return r.examen.status === "ok" ? r.examen.andelExamen : null;
    }, FARG_BETYG, "%", 0, [0, 100]), 260);

    el("kalla-kullar").textContent =
      "Skalorna i de två första panelerna är inklippta kring kurvorna för " +
      "att utvecklingen ska synas – de börjar inte på noll. Panelen för " +
      "examensandel visar hela skalan 0–100 procent. Ett avbrott i linjen " +
      "är en kull som saknar uppgift; peka på punkterna för detaljer.";

    ritaNot(rader, harExamen);
    ritaSlutsats(p, rader);
    ritaTabell(p, rader);
  }

  /* ---------- Databegränsningar för det valda programmet ---------- */

  function ritaNot(rader, harExamen) {
    var punkter = [];
    rader.forEach(function (r) {
      if (r.antagning.status === "rapport_saknas") {
        punkter.push("Kullen " + esc(kullEtikett(r)) + ": " +
          esc(r.antagningsar) + " års antagningsrapport har inte gått att få tag på, " +
          "så meritvärdet saknas.");
      }
      if (r.examen.status === "sekretess") {
        punkter.push("Kullen " + esc(kullEtikett(r)) + ": färre än tio avgångselever " +
          esc(r.examensar) + " – Skolverket redovisar inte värdet.");
      }
    });
    if (!harExamen) {
      punkter.push("Inget examensår har tillräckligt många redovisade " +
        "avgångselever för det här programmet, så bara antagningssidan kan visas.");
    }
    K.sattDataNot("not-kullar", punkter.length
      ? "<p>" + punkter.join("</p><p>") + "</p>" : "");
  }

  /* ---------- Försiktig sammanfattning ---------- */

  function ritaSlutsats(p, rader) {
    var kompletta = rader.filter(function (r) {
      return r.antagning.status === "ok" && r.examen.status === "ok";
    });
    var html = "";
    if (kompletta.length) {
      var forsta = kompletta[0], sista = kompletta[kompletta.length - 1];
      html += "<p>För <strong>" + esc(p.etikett) + "</strong> kan " +
        kompletta.length + " kullar följas hela vägen, från antagningen " +
        esc(forsta.antagningsar) + " till examen " + esc(sista.examensar) + ".</p>";
      if (kompletta.length > 1) {
        var mDiff = sista.antagning.medel - forsta.antagning.medel;
        var bDiff = sista.examen.betygspoang - forsta.examen.betygspoang;
        html += "<p>I de kullar som kan jämföras gick medelmeritvärdet vid " +
          "antagningen från " + talSv(forsta.antagning.medel, 1) + " till " +
          talSv(sista.antagning.medel, 1) + " (" + (mDiff >= 0 ? "+" : "−") +
          talSv(Math.abs(mDiff), 1) + " meritpoäng), och betygspoängen vid " +
          "examen från " + talSv(forsta.examen.betygspoang, 1) + " till " +
          talSv(sista.examen.betygspoang, 1) + " (" + (bDiff >= 0 ? "+" : "−") +
          talSv(Math.abs(bDiff), 1) + " betygspoäng).</p>";
        var andelar = kompletta.filter(function (r) {
          return r.examen.andelExamen !== null && r.examen.andelExamen !== undefined;
        }).map(function (r) { return r.examen.andelExamen; });
        if (andelar.length > 1) {
          html += "<p>Andelen med examen har legat mellan " +
            talSv(Math.min.apply(null, andelar), 1) + " och " +
            talSv(Math.max.apply(null, andelar), 1) + " procent.</p>";
        }
      }
      html += "<p><strong>Läs med försiktighet:</strong> måtten har olika " +
        "skalor och rör delvis olika elever – siffrorna beskriver programmets " +
        "utveckling, inte vad som orsakade den. Små kullar kan svänga " +
        "kraftigt av rena tillfälligheter.</p>";
    } else {
      html += "<p>För <strong>" + esc(p.etikett) + "</strong> finns ingen kull " +
        "där både antagningen och examen är redovisad, så någon jämförelse " +
        "går inte att göra. Tabellen visar de uppgifter som finns.</p>";
    }
    el("slutsats-kullar").innerHTML = html;
  }

  /* ---------- Tabellen ---------- */

  function cellSaknas(orsak, symbol) {
    return '<abbr class="fanns-ej" title="' + orsak + '">' + symbol + "</abbr>";
  }

  function ritaTabell(p, rader) {
    var t = "<caption>Kullarna för " + esc(p.etikett) + ": antagningen ställd mot " +
      "examen tre år senare. Meritvärdet (max 340) och betygspoängen (0–20) " +
      "har olika skalor och kan inte jämföras med varandra.</caption>";
    t += "<thead><tr><th scope=\"col\">Kull</th>" +
      "<th scope=\"col\">Meritvärde vid antagningen</th>" +
      "<th scope=\"col\">Avgångselever</th>" +
      "<th scope=\"col\">Betygspoäng vid examen</th>" +
      "<th scope=\"col\">Andel med examen</th>" +
      "<th scope=\"col\">Andel med högskolebehörighet</th></tr></thead><tbody>";
    rader.forEach(function (r) {
      t += "<tr><td>" + esc(kullEtikett(r)) + "</td>";
      t += "<td>" + (r.antagning.status === "ok"
        ? talSv(r.antagning.medel, 1)
        : cellSaknas("Kullen " + esc(kullEtikett(r)) + ": " +
            ANTAGNING_STATUS[r.antagning.status], "–")) + "</td>";
      if (r.examen.status === "ok") {
        t += "<td>" + (r.examen.antal === null ? "–" : esc(r.examen.antal)) + "</td>" +
          "<td>" + talSv(r.examen.betygspoang, 1) + "</td>" +
          "<td>" + (r.examen.andelExamen === null ? "–"
            : talSv(r.examen.andelExamen, 1) + " %") + "</td>" +
          "<td>" + (r.examen.andelGrundlBehorighet === null ? "–"
            : talSv(r.examen.andelGrundlBehorighet, 1) + " %") + "</td>";
      } else if (r.examen.status === "sekretess") {
        var s = '<abbr class="sekretess" title="Färre än tio avgångselever – ' +
          'Skolverket redovisar inte värdet">..</abbr>';
        t += "<td>" + s + "</td><td>" + s + "</td><td>" + s + "</td><td>" + s + "</td>";
      } else {
        var o = cellSaknas("Kullen " + esc(kullEtikett(r)) + ": " +
          EXAMEN_STATUS[r.examen.status], "–");
        t += "<td>" + o + "</td><td>" + o + "</td><td>" + o + "</td><td>" + o + "</td>";
      }
      t += "</tr>";
    });
    t += "</tbody>";
    el("tabell-kullar").innerHTML = t;
    el("teckenforklaring-kullar").innerHTML =
      "<strong>..</strong> = färre än tio elever, Skolverket redovisar inte " +
      "värdet (sekretess). <strong>–</strong> = uppgift saknas: rapporten " +
      "saknas, programmet redovisas inte det året, eller kullen har inte " +
      "hunnit gå ut. Peka på symbolen för orsaken rad för rad.";
  }

  /* ---------- Vilka program kan följas? ---------- */

  function ritaParning() {
    var kan = DATA.program.filter(function (p) { return p.antalKompletta > 0; });
    var inte = DATA.program.filter(function (p) { return p.antalKompletta === 0; });
    var html = "<p class=\"forklaring\"><strong>" + kan.length +
      " program</strong> kan följas med minst en komplett kull.</p>";

    var skal = [];
    inte.forEach(function (p) {
      skal.push("<strong>" + esc(p.etikett) + "</strong> har en serie i båda " +
        "källorna, men ingen kull där båda sidorna är redovisade.");
    });
    DATA.oparade.antagningUtanSlutbetyg.forEach(function (namn) {
      skal.push("<strong>" + esc(namn) + "</strong> har antagningssiffror, men " +
        "ingen slutbetygsserie på samma skola – oftast för att programmet " +
        "aldrig nått tio avgångselever där.");
    });
    DATA.oparade.slutbetygUtanAntagning.forEach(function (namn) {
      skal.push("<strong>" + esc(namn) + "</strong> har slutbetyg, men ingen " +
        "antagningsserie – antagningsstatistiken omfattar bara kommunens " +
        "egna skolor och åren från " + esc(DATA.meritKallor.forsta) + ".");
    });
    if (skal.length) {
      html += "<ul class=\"forklaring\"><li>" + skal.join("</li><li>") + "</li></ul>";
    }
    el("lista-parning").innerHTML = html;
    el("sektion-parning").hidden = false;
  }

  /* ---------- Kort sagt ---------- */

  function kortSagt() {
    var kan = DATA.program.filter(function (p) { return p.antalKompletta > 0; });
    var totKullar = 0;
    var forstaAntagning = null, sistaExamen = null;
    kan.forEach(function (p) {
      p.kohorter.forEach(function (r) {
        if (r.antagning.status === "ok" && r.examen.status === "ok") {
          totKullar++;
          if (forstaAntagning === null || r.antagningsar < forstaAntagning) {
            forstaAntagning = r.antagningsar;
          }
          if (sistaExamen === null || r.examensar > sistaExamen) {
            sistaExamen = r.examensar;
          }
        }
      });
    });
    var punkter = [];
    punkter.push("<strong>" + totKullar + " kullar</strong> på " + kan.length +
      " program kan följas hela vägen från antagning till examen, från " +
      "antagningen " + esc(forstaAntagning) + " till examen " + esc(sistaExamen) + ".");
    punkter.push("Måtten har olika skalor: meritvärdet från grundskolan " +
      "(max 340) och betygspoängen från gymnasiet (0–20) går " +
      "<strong>inte</strong> att jämföra med varandra som tal – bara " +
      "utvecklingen inom varje mått går att följa.");
    var utan = DATA.program.length - kan.length +
      DATA.oparade.antagningUtanSlutbetyg.length;
    if (utan > 0) {
      punkter.push(utan + " program kan inte följas, oftast därför att " +
        "Skolverket inte redovisar program med färre än tio avgångselever. " +
        "Vilka det är står längre ned på sidan.");
    }
    K.visaKortSagt(punkter);
  }

  /* ---------- Start ---------- */

  function init(data) {
    DATA = data;

    var valjare = el("program-valjare");
    var etiketter = DATA.program.map(function (p) { return p.etikett; })
      .sort(function (a, b) { return a.localeCompare(b, "sv"); });
    etiketter.forEach(function (e) {
      var o = document.createElement("option");
      o.value = e;
      o.textContent = e;
      valjare.appendChild(o);
    });
    /* Landa på programmet med flest jämförbara kullar */
    valjare.value = DATA.program[0].etikett;

    K.kopplaValjare(valjare, "program", ritaKullar);

    el("sektion-kullar").hidden = false;

    K.visaMeta({
      kalla: "GR:s antagningsstatistik och Skolverkets utbildningsstatistik",
      period: "antagna " + DATA.meritKallor.forsta + "–" + DATA.meritKallor.sista +
        ", examen t.o.m. " + DATA.slutKallor.sista,
      senaste: String(DATA.slutKallor.sista),
      hamtad: DATA.slutKallor.hamtad
    });

    kortSagt();
    ritaKullar();
    ritaParning();
  }

  K.starta("data-kull.json", {
    tomt: function (data) { return !data.program || !data.program.length; },
    tomtText: "Kullarna håller på att paras ihop.",
    init: init
  });
})();
