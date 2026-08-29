/* Kungsbacka i siffror — delade byggstenar för alla sidor.
   Här ligger det som tidigare var kopierat mellan app.js, merit.js och
   slutbetyg.js: färger, talformat och diagraminställningar — samt de
   gemensamma komponenterna: läge i adressraden (delbara länkar),
   sorterbara tabeller med CSV-nedladdning, "Kort sagt"-rutan,
   metadataraden och tonade linjer vid pekning.
   Läses in före sidans egen skriptfil och exponerar sig som window.KIS. */
(function () {
  "use strict";

  /* ---------- Färger ----------
     Palettvärdena följer en kontrast- och färgblindhetsvaliderad
     standardpalett (se README). Kategoriska serier får dessutom olika
     punktform och, efter åtta serier, streckning — så att ingen
     information bärs av färgen ensam. */

  var FARG = {
    ink: "#0b0b0b",
    ink2: "#52514e",
    muted: "#6e6c66",
    grid: "#e1e0d9",
    baseline: "#c3c2b7",
    surface: "#fcfcfb",
    bla: "#2a78d6",
    blaMork: "#1c5cab",
    blaLjus: "#9ec5f4",
    rod: "#e34948",
    /* Orange bryter mot den blå prognosrampen utan att krocka med den
       röda avvikelsefärgen; värdet är hämtat ur den kategoriska paletten
       och är kontrast- och färgblindhetsvaliderat. */
    orange: "#e69f00",
    orangeMork: "#b57c00",
    gra: "#c3c2b7"
  };

  var PALETT = [
    "#1c5cab", "#e69f00", "#009e73", "#cc79a7",
    "#56b4e9", "#d55e00", "#7a5195", "#6b8f00"
  ];
  var STRECK = [[], [7, 4], [2, 3], [9, 3, 2, 3]];
  var PUNKT = ["circle", "rect", "triangle", "rectRot"];

  function serieStil(i) {
    return {
      farg: PALETT[i % PALETT.length],
      streck: STRECK[Math.floor(i / PALETT.length) % STRECK.length],
      punkt: PUNKT[i % PUNKT.length]
    };
  }

  /* Ramper för ordnade serier (årgångar): ljus = äldst. Den blå används
     för kommunens prognosårgångar, den orange för kohortframskrivningens
     – samma färgspråk som de enskilda linjerna på sidan, så att en
     orange linje alltid betyder framskrivning och en blå prognos. */
  var RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];
  var RAMP_ORANGE = ["#f2d08a", "#eab54a", "#e69f00", "#b57c00", "#845a00"];

  function urRamp(ramp, i, n) {
    if (n <= 1) return ramp[ramp.length - 1];
    return ramp[Math.round(i * (ramp.length - 1) / (n - 1))];
  }
  function rampFarg(i, n) { return urRamp(RAMP, i, n); }
  function rampFargOrange(i, n) { return urRamp(RAMP_ORANGE, i, n); }

  /* ---------- Tal och små hjälpare ---------- */

  function el(id) { return document.getElementById(id); }

  function talSv(n, dec) {
    return n.toLocaleString("sv-SE", {
      minimumFractionDigits: dec || 0,
      maximumFractionDigits: dec === undefined ? 0 : dec
    });
  }

  /* All HTML på sidorna byggs som strängar. Värden som kommer ur
     datafilerna (namn, källtexter, årtal …) ska alltid gå genom esc()
     innan de hamnar i markupen — datat härstammar från externa källor
     (SCB, Skolverket, GR), och en förgiftad datafil får inte kunna bli
     körbar kod hos besökaren. Fasta strängar i koden behöver inte escapas. */
  function esc(v) {
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* Adresser ur datafilerna släpps bara igenom som https eller relativ
     sökväg — aldrig javascript:, data: eller protokollrelativt — och
     attributescapas. Tom sträng betyder att länken inte ska ritas. */
  function sakerUrl(url) {
    url = String(url == null ? "" : url).trim();
    if (!url) return "";
    if (/^https:\/\//i.test(url)) return esc(url);
    if (url.indexOf(":") === -1 && url.slice(0, 2) !== "//") return esc(url);
    return "";
  }

  function installChartDefaults() {
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    Chart.defaults.font.size = 15;
    Chart.defaults.color = FARG.ink2;
    Chart.defaults.borderColor = FARG.grid;
    Chart.defaults.plugins.tooltip.backgroundColor = FARG.ink;
    Chart.defaults.plugins.tooltip.titleFont = { size: 15, weight: "600" };
    Chart.defaults.plugins.tooltip.bodyFont = { size: 15 };
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.displayColors = false;
  }

  function visaStatus(html) {
    var s = el("status");
    if (!s) return;
    s.innerHTML = html;
    s.hidden = false;
  }

  /* ---------- Uppstart ----------
     Gemensam start för sidorna: vänta in DOM:en, sätt diagramstandarderna,
     aktivera tabellverktygen (observern fångar tabeller som byggs senare),
     hämta sidans datafil och kör igång.

       K.starta("data-x.json", {
         init: function (data, jamfor) { ... },   // körs med inläst data
         tomt: function (data) { ... },   // valfri: räknas datat som ofärdigt?
         tomtText: "…",                   // mening i så fall, före "Titta gärna…"
         vidTomt: function (data) { ... },// valfri: rita det som ändå går
         jamforfil: "data-y.json"         // valfri: andrafil, null om den saknas
       }); */
  function starta(datafil, alternativ) {
    function hamtaJson(fil) {
      return fetch(fil).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    }
    function kor() {
      installChartDefaults();
      aktiveraTabellverktyg();
      Promise.all([
        hamtaJson(datafil),
        alternativ.jamforfil
          ? hamtaJson(alternativ.jamforfil).catch(function () { return null; })
          : Promise.resolve(null)
      ])
        .then(function (svar) {
          var data = svar[0];
          if (alternativ.tomt && alternativ.tomt(data)) {
            visaStatus("<strong>Datat är inte på plats ännu.</strong> " +
              alternativ.tomtText + " Titta gärna tillbaka snart.");
            if (alternativ.vidTomt) alternativ.vidTomt(data);
            return;
          }
          alternativ.init(data, svar[1]);
        })
        .catch(function (fel) {
          visaStatus("<strong>Kunde inte läsa in datat.</strong> Tekniskt fel: " +
            esc(fel.message) + " (" + esc(datafil) + ")");
        });
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", kor);
    } else { kor(); }
  }

  /* Webbadressvänlig form av en etikett: "Vård- och omsorgsprogrammet
     (Aranäs)" -> "vard-och-omsorgsprogrammet-aranas". Används åt båda
     hållen — värdet i adressraden matchas mot samma slug. */
  function slug(text) {
    return String(text).toLowerCase()
      .replace(/[åä]/g, "a").replace(/ö/g, "o")
      .replace(/é/g, "e").replace(/ü/g, "u")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /* ---------- Läge i adressraden ----------
     Valen i reglagen speglas i adressradens frågesträng, så att en länk
     till sidan ger samma vy. Bakåt/framåt i webbläsaren fungerar genom
     popstate-lyssnaren. */

  function urlLas(nyckel) {
    return new URLSearchParams(window.location.search).get(nyckel);
  }

  function urlSatt(val, ersatt) {
    var p = new URLSearchParams(window.location.search);
    Object.keys(val).forEach(function (k) {
      if (val[k] === null || val[k] === undefined || val[k] === "") p.delete(k);
      else p.set(k, val[k]);
    });
    var q = p.toString();
    var url = window.location.pathname + (q ? "?" + q : "") + window.location.hash;
    try {
      if (ersatt) history.replaceState(null, "", url);
      else history.pushState(null, "", url);
    } catch (e) { /* file://-läge m.m. — valen fungerar ändå, utan delbar länk */ }
  }

  function urlLyssna(fn) {
    window.addEventListener("popstate", function () {
      fn(new URLSearchParams(window.location.search));
    });
  }

  /* Koppla ett <select> till en nyckel i adressraden. Vid start väljs
     värdet ur adressraden om det finns bland alternativen (matchat som
     slug); vid ändring uppdateras adressraden och omritningen körs;
     vid bakåt/framåt ställs reglaget om och omritningen körs. */
  function kopplaValjare(valjare, nyckel, ritaOm) {
    function valdOption(sokt) {
      if (sokt === null) return null;
      for (var i = 0; i < valjare.options.length; i++) {
        var v = valjare.options[i].value;
        if (v === sokt || slug(v) === sokt) return v;
      }
      return null;
    }
    var start = valdOption(urlLas(nyckel));
    if (start !== null) valjare.value = start;

    valjare.addEventListener("change", function () {
      var o = {};
      o[nyckel] = valjare.value ? slug(valjare.value) : null;
      urlSatt(o);
      ritaOm();
    });
    urlLyssna(function (p) {
      var v = valdOption(p.get(nyckel));
      var nytt = v !== null ? v : (valjare.options.length ? valjare.options[0].value : "");
      if (valjare.value !== nytt) {
        valjare.value = nytt;
        ritaOm();
      }
    });
  }

  /* ---------- "Kort sagt" ----------
     Punkterna räknas fram av varje sida ur dess datafil och skrivs hit.
     Rutan är dold tills den fylls, så att sidan fungerar även om datat
     inte kunde läsas. */

  function visaKortSagt(punkter) {
    var s = el("kort-sagt"), lista = el("kort-sagt-lista");
    if (!s || !lista || !punkter.length) return;
    lista.innerHTML = punkter.map(function (p) { return "<li>" + p + "</li>"; }).join("");
    s.hidden = false;
  }

  /* ---------- Metadataraden ----------
     En diskret rad under ingressen: källa, period, senaste data och när
     datat hämtades — samt länken till data och källkod. */

  function visaMeta(f) {
    var m = el("meta-rad");
    if (!m) return;
    var delar = [];
    if (f.kalla) delar.push("<span>Källa: " + esc(f.kalla) + "</span>");
    if (f.period) delar.push("<span>Period: " + esc(f.period) + "</span>");
    if (f.senaste) delar.push("<span>Senaste data: " + esc(f.senaste) + "</span>");
    if (f.hamtad) delar.push("<span>Data hämtad: " + esc(f.hamtad) + "</span>");
    delar.push('<span>Data och källkod: <a href="https://github.com/moggleif/politik">GitHub</a></span>');
    m.innerHTML = delar.join('<span class="meta-skilje" aria-hidden="true">·</span>');
    m.hidden = false;
  }

  /* ---------- Databegränsningar ----------
     En liten återanvändbar ruta som sätts nära det diagram där
     begränsningen märks, i stället för långt ned i brödtexten. */

  function dataNot(html) {
    return '<div class="data-not" role="note"><span class="data-not-marke" aria-hidden="true">!</span><div>' + html + "</div></div>";
  }

  function sattDataNot(id, html) {
    var plats = el(id);
    if (!plats) return;
    plats.innerHTML = html ? dataNot(html) : "";
    plats.hidden = !html;
  }

  /* ---------- Tonade linjer ----------
     När många linjer visas samtidigt tonas de övriga ned så fort
     användaren pekar på en linje eller på ett namn i teckenförklaringen.
     Den valda linjen ritas något bredare. Fungerar även med tangentbord
     och pekskärm via tooltipens "nearest"-läge. */

  function blek(farg) {
    if (typeof farg !== "string" || farg.charAt(0) !== "#") return farg;
    var r = parseInt(farg.slice(1, 3), 16),
        g = parseInt(farg.slice(3, 5), 16),
        b = parseInt(farg.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + ",0.14)";
  }

  function aktiveraToning(chart, medLegend) {
    var orig = null;
    var fokus = null;

    function sparaOriginal() {
      orig = chart.data.datasets.map(function (ds) {
        return { border: ds.borderColor, bg: ds.backgroundColor,
                 bredd: ds.borderWidth };
      });
    }

    function tona(nyFokus) {
      if (nyFokus === fokus) return;
      if (orig === null) sparaOriginal();
      fokus = nyFokus;
      chart.data.datasets.forEach(function (ds, i) {
        if (fokus === null || i === fokus) {
          ds.borderColor = orig[i].border;
          ds.backgroundColor = orig[i].bg;
          ds.borderWidth = (fokus === i) ? orig[i].bredd + 1 : orig[i].bredd;
        } else {
          ds.borderColor = blek(orig[i].border);
          ds.backgroundColor = blek(orig[i].bg);
          ds.borderWidth = orig[i].bredd;
        }
      });
      chart.update("none");
    }

    chart.options.onHover = function (e) {
      var traffar = chart.getElementsAtEventForMode(e, "nearest", { intersect: false }, true);
      if (!traffar.length) { tona(null); return; }
      var t = traffar[0];
      /* "nearest" träffar alltid något — kräv att pekaren faktiskt är
         nära punkten, annars tonas inget. */
      var dx = (e.x || 0) - t.element.x, dy = (e.y || 0) - t.element.y;
      tona(Math.sqrt(dx * dx + dy * dy) < 40 ? t.datasetIndex : null);
    };
    chart.canvas.addEventListener("mouseleave", function () { tona(null); });

    if (medLegend !== false) {
      chart.options.plugins.legend.onHover = function (e, post) {
        if (post.datasetIndex !== undefined) tona(post.datasetIndex);
      };
      chart.options.plugins.legend.onLeave = function () { tona(null); };
    }
    /* Chart.js läser om plugin-inställningarna först vid en uppdatering */
    chart.update("none");
  }

  /* ---------- Tabellverktyg ----------
     Alla tabeller under "Visa siffrorna som tabell" blir sorterbara och
     får knappar för att ladda ner som CSV och kopiera. Tabellerna ritas
     om när användaren byter val, så dekorationen görs via delegerade
     händelser plus en observer som sätter attributen på nya tabeller. */

  function cellvarde(cell) {
    var text = cell.textContent.replace(/ /g, " ").trim();
    if (text === "" || text === "–" || text === "–" || text === ".." || text === "×") {
      return { saknas: true, text: text };
    }
    var m = text.replace(/−/g, "-").replace(/(\d)\s+(\d)/g, "$1$2")
      .match(/-?\d+(?:,\d+)?/);
    if (m) return { tal: parseFloat(m[0].replace(",", ".")), text: text };
    return { text: text };
  }

  function sorteraTabell(th) {
    var thead = th.closest("thead");
    var tbody = thead && thead.nextElementSibling;
    if (!tbody || tbody.tagName !== "TBODY") return;
    var kol = th.cellIndex;
    var riktning = th.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
    var stigande = riktning === "ascending";

    Array.prototype.forEach.call(thead.querySelectorAll("th"), function (o) {
      o.setAttribute("aria-sort", o === th ? riktning : "none");
    });

    var rader = Array.prototype.slice.call(tbody.rows);
    rader.map(function (rad, i) { return { rad: rad, i: i, v: cellvarde(rad.cells[kol] || rad.cells[0]) }; })
      .sort(function (a, b) {
        /* Saknade värden sist, oavsett riktning */
        if (a.v.saknas !== b.v.saknas) return a.v.saknas ? 1 : -1;
        var r;
        if (a.v.tal !== undefined && b.v.tal !== undefined) r = a.v.tal - b.v.tal;
        else r = a.v.text.localeCompare(b.v.text, "sv");
        if (r === 0) return a.i - b.i;
        return stigande ? r : -r;
      })
      .forEach(function (p) { tbody.appendChild(p.rad); });
  }

  function tabellTillText(tabell, skilje) {
    var rader = [];
    Array.prototype.forEach.call(tabell.rows, function (rad) {
      var celler = Array.prototype.map.call(rad.cells, function (c) {
        var t = c.textContent.replace(/ /g, " ").replace(/\s+/g, " ").trim();
        /* En cell som inleds med =, + eller @ skulle kunna tolkas som
           formel när filen öppnas i ett kalkylprogram. Talen på sidorna
           börjar aldrig så; neutralisera med en inledande apostrof. */
        if (/^[=+@]/.test(t)) t = "'" + t;
        if (skilje === ";" && /[";\n]/.test(t)) t = '"' + t.replace(/"/g, '""') + '"';
        return t;
      });
      rader.push(celler.join(skilje));
    });
    return rader.join("\r\n");
  }

  function filnamnFor(tabell) {
    var bas = slug(document.title.split("–")[0].split("|")[0]) || "tabell";
    var id = tabell.id || (tabell.closest("section") ? tabell.closest("section").id : "");
    return bas + (id ? "-" + slug(id.replace(/^tabell-|^sektion-/, "")) : "") + ".csv";
  }

  function laddaNerCsv(tabell) {
    var csv = "﻿" + tabellTillText(tabell, ";");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filnamnFor(tabell);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  function kopieraTabell(tabell, knapp) {
    var text = tabellTillText(tabell, "\t");
    function klart(ok) {
      var gammal = knapp.textContent;
      knapp.textContent = ok ? "Kopierad ✓" : "Kunde inte kopiera";
      setTimeout(function () { knapp.textContent = gammal; }, 2000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { klart(true); },
        function () { klart(false); });
    } else { klart(false); }
  }

  function dekoreraTabeller() {
    Array.prototype.forEach.call(
      document.querySelectorAll("details .tabell-rull table"),
      function (tabell) {
        var thead = tabell.querySelector("thead");
        if (!thead || tabell.tBodies.length === 0) return;
        Array.prototype.forEach.call(tabell.querySelectorAll("thead th"), function (th) {
          if (th.hasAttribute("aria-sort")) return;
          th.setAttribute("aria-sort", "none");
          th.setAttribute("tabindex", "0");
          th.setAttribute("role", "button");
          th.title = "Sortera på " + th.textContent.trim();
        });
        var rull = tabell.closest(".tabell-rull");
        if (rull && !rull.parentElement.querySelector(".tabell-knappar")) {
          var rad = document.createElement("div");
          rad.className = "tabell-knappar";
          rad.innerHTML =
            '<button type="button" data-verktyg="csv">Ladda ner som CSV</button>' +
            '<button type="button" data-verktyg="kopiera">Kopiera tabellen</button>' +
            '<span class="tabell-tips">Klicka på en kolumnrubrik för att sortera.</span>';
          rull.parentElement.insertBefore(rad, rull.nextSibling);
        }
      });
  }

  function aktiveraTabellverktyg() {
    dekoreraTabeller();
    new MutationObserver(dekoreraTabeller)
      .observe(document.body, { childList: true, subtree: true });

    document.addEventListener("click", function (e) {
      var knapp = e.target.closest && e.target.closest(".tabell-knappar button");
      if (knapp) {
        var tabell = knapp.parentElement.parentElement.querySelector(".tabell-rull table");
        if (!tabell) return;
        if (knapp.dataset.verktyg === "csv") laddaNerCsv(tabell);
        else kopieraTabell(tabell, knapp);
        return;
      }
      var th = e.target.closest && e.target.closest("details .tabell-rull thead th");
      if (th) sorteraTabell(th);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var th = e.target.closest && e.target.closest("details .tabell-rull thead th");
      if (th) { e.preventDefault(); sorteraTabell(th); }
    });
  }

  /* ---------- Export ---------- */

  window.KIS = {
    FARG: FARG,
    PALETT: PALETT,
    STRECK: STRECK,
    serieStil: serieStil,
    rampFarg: rampFarg,
    rampFargOrange: rampFargOrange,
    el: el,
    talSv: talSv,
    esc: esc,
    sakerUrl: sakerUrl,
    slug: slug,
    installChartDefaults: installChartDefaults,
    starta: starta,
    visaStatus: visaStatus,
    urlLas: urlLas,
    urlSatt: urlSatt,
    urlLyssna: urlLyssna,
    kopplaValjare: kopplaValjare,
    visaKortSagt: visaKortSagt,
    visaMeta: visaMeta,
    dataNot: dataNot,
    sattDataNot: sattDataNot,
    aktiveraToning: aktiveraToning,
    aktiveraTabellverktyg: aktiveraTabellverktyg
  };
})();
