/* Valresultat per valdistrikt i Kungsbacka — kommunvalen 2010–2026.
   Läser docs/data-kommunval.json, byggd av scripts/build_kommunval.py ur
   Valmyndighetens öppna data.

   Datafilen innehåller antal röster, aldrig andelar. Andelarna räknas
   här, och skälet är sidans viktigaste reglage: användaren kryssar i en
   fritt vald grupp distrikt, och då måste rösterna summeras först och
   andelen räknas på summan. Ett medelvärde av distriktens procenttal
   hade vägt ett litet distrikt lika tungt som ett stort.

   Valdistrikten ritas om mellan valen. Valmyndighetens egen bedömning av
   vilka distrikt som går att jämföra följer med i datafilen, och en
   övergång som de underkänner ritas med streckad linje i stället för att
   döljas: talen är riktiga, men rörelsen mellan dem behöver inte vara en
   opinionsrörelse.

   Sidan visar valresultat. Den drar inga slutsatser och säger ingenting
   om nästa val. */
(function () {
  "use strict";

  var K = window.KIS;
  var FARG = K.FARG;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;
  var sakerUrl = K.sakerUrl;

  var DATAFIL = "data-kommunval.json";

  /* Så många distriktslinjer går att läsa i samma bild. Över det ritas
     bara gruppen och kommunen — 46 linjer är ingen bild, det är ett
     garnnystan. Gränsen går vid tolv och inte vid palettens åtta färger:
     den som följer en hel ort kryssar i tio eller elva distrikt, och ska
     då se tio eller elva linjer. Se distriktStil för hur det nionde till
     tolfte distriktet skiljs från de åtta första. */
  var MAX_LINJER = 12;

  /* Nio partier har någon gång nått över tre procent i Kungsbacka, och
     alla nio ska kunna ritas samtidigt: att som förval utelämna det
     nionde vore ett godtyckligt val om vilket parti som är värt att se.
     Paletten har åtta färger, så den nionde serien får svart – samma
     lösning som den kontrast- och färgblindhetsvaliderade paletten
     själv använder för sin nionde kategori.

     Streckning används inte för att skilja serierna åt här. En streckad
     linje har på den här sidan en enda innebörd, "går inte att jämföra",
     och får inte också betyda "nionde serien". */
  var MAX_PARTIER = 9;

  /* Tre nivåer, tre uttryck: grå tunn linje är hela kommunen som
     referens, svart tjock linje är den markerade gruppen, och de enskilda
     distrikten får den kategoriska paletten. Gruppen kan inte ta sajtens
     blå – det är också palettens första färg, och gruppen hade då fått
     samma färg som det första markerade distriktet. */
  var FARG_KOMMUN = "#8f8d85";
  var FARG_GRUPP = FARG.ink;
  var STRECK_BROTT = [6, 4];

  var data = null;
  var valda = {};        /* slug -> true, de markerade distrikten */
  var valdaPartier = {}; /* partikod -> true, i partidiagrammet */

  /* ---------- Små hjälpare ---------- */

  function ar() { return data.ar; }
  function arStr() { return data.ar.map(String); }

  function tecken(n, decimaler) {
    var t = (n > 0 ? "+" : n < 0 ? "−" : "");
    return t + talSv(Math.abs(n), decimaler);
  }

  function procentenheter(n) { return tecken(n, 1) + " pe"; }

  /* Omarkerade staplar tonas ned men ska fortfarande gå att se och läsa
     av; gemensam.js egen blek() är gjord för bakgrundslinjer och för
     svag här. */
  function tonad(farg) {
    if (typeof farg !== "string" || farg.charAt(0) !== "#") return farg;
    return "rgba(" + parseInt(farg.slice(1, 3), 16) + "," +
      parseInt(farg.slice(3, 5), 16) + "," +
      parseInt(farg.slice(5, 7), 16) + ",0.3)";
  }

  function distriktFor(slug) {
    for (var i = 0; i < data.distrikt.length; i++) {
      if (data.distrikt[i].slug === slug) return data.distrikt[i];
    }
    return null;
  }

  function valdaSlugar() {
    return data.distrikt.filter(function (d) { return valda[d.slug]; })
      .map(function (d) { return d.slug; });
  }

  function partiNamn(kod) {
    for (var i = 0; i < data.partier.length; i++) {
      if (data.partier[i].kod === kod) return data.partier[i].namn;
    }
    return kod;
  }

  function valtParti() { return el("valj-parti").value; }
  function valtEnskilt() { return el("valj-distrikt").value; }
  function valtMatt() { return el("valj-matt").value; }
  function valdOvergang() { return el("valj-jamfor").value; }

  /* "2022-2026" är nyckeln i datafilen; tankstreck är bara för ögat. */
  function visaOvergang(o) { return o.replace("-", "–"); }

  /* Distriktets stil i andelsdiagrammet: palettens åtta färger, och
     därefter samma åtta färger en gång till med en annan punktform. Det
     är punktformen och inte linjen som skiljer varven åt, för streckning
     är upptagen på den här sidan: en streckad linje betyder "går inte
     att jämföra" och får inte också betyda "andra varvet i paletten".
     Punktformen står i legenden, så ett nionde distrikt går att peka ut
     där även om färgen är samma som det första distriktets. */
  var VARVPUNKT = ["circle", "triangle", "rectRot", "star"];

  function distriktStil(i) {
    return {
      farg: K.PALETT[i % K.PALETT.length],
      punkt: VARVPUNKT[Math.floor(i / K.PALETT.length) % VARVPUNKT.length]
    };
  }

  /* Partiets stil i partidiagrammet: palettens åtta färger, och svart
     med stjärnmarkör som nionde. Aldrig streckning – se MAX_PARTIER. */
  function partiStil(i) {
    if (i < K.PALETT.length) {
      var stil = K.serieStil(i);
      return { farg: stil.farg, punkt: stil.punkt };
    }
    return { farg: FARG.ink, punkt: "star" };
  }

  /* ---------- Området: kommunen, ett distrikt eller en grupp ----------
     Ett "område" är en lista distrikt. Utan markering är området hela
     kommunen, och då används kommunens egna totalsiffror (som också
     innehåller uppsamlingsdistriktet). */

  function kommunSerie() {
    return {
      namn: "Hela Kungsbacka",
      antalDistrikt: null,
      roster: function (parti, a) {
        var p = data.kommunTotalt.roster[parti];
        return p ? (p[a] || 0) : 0;
      },
      giltiga: function (a) { return data.kommunTotalt.giltiga[a] || 0; },
      komplett: function () { return true; },
      jamforbart: function () { return true; }
    };
  }

  function gruppSerie(slugar) {
    var lista = slugar.map(distriktFor).filter(Boolean);
    return {
      namn: lista.length === 1 ? lista[0].namn
        : lista.length + " markerade distrikt",
      antalDistrikt: lista.length,
      lista: lista,
      roster: function (parti, a) {
        var s = 0;
        for (var i = 0; i < lista.length; i++) {
          var p = lista[i].roster[parti];
          s += (p && p[a]) || 0;
        }
        return s;
      },
      giltiga: function (a) {
        var s = 0;
        for (var i = 0; i < lista.length; i++) s += lista[i].giltiga[a] || 0;
        return s;
      },
      /* Saknas något markerat distrikt ett år är gruppens summa inte
         gruppen. Då ritas ingen punkt alls i stället för en punkt som
         ser ut som en nedgång. */
      komplett: function (a) {
        for (var i = 0; i < lista.length; i++) {
          if (lista[i].giltiga[a] === null || lista[i].giltiga[a] === undefined) {
            return false;
          }
        }
        return lista.length > 0;
      },
      /* En övergång är jämförbar för gruppen bara om den är det för
         varje distrikt i den. */
      jamforbart: function (overgang) {
        for (var i = 0; i < lista.length; i++) {
          if (!lista[i].jamforbart[overgang]) return false;
        }
        return lista.length > 0;
      }
    };
  }

  function distriktSerie(d) {
    return {
      namn: d.namn,
      antalDistrikt: 1,
      lista: [d],
      roster: function (parti, a) {
        var p = d.roster[parti];
        return (p && p[a] !== null && p[a] !== undefined) ? p[a] : 0;
      },
      giltiga: function (a) {
        return d.giltiga[a] === null || d.giltiga[a] === undefined
          ? 0 : d.giltiga[a];
      },
      komplett: function (a) {
        return d.giltiga[a] !== null && d.giltiga[a] !== undefined;
      },
      jamforbart: function (overgang) { return !!d.jamforbart[overgang]; }
    };
  }

  /* Området som allt på sidan handlar om just nu. */
  function omradet() {
    var s = valdaSlugar();
    return s.length ? gruppSerie(s) : kommunSerie();
  }

  function varde(serie, parti, a) {
    if (!serie.komplett(a)) return null;
    var roster = serie.roster(parti, a);
    if (valtMatt() === "antal") return roster;
    var giltiga = serie.giltiga(a);
    return giltiga ? 100 * roster / giltiga : null;
  }

  function serieData(serie, parti) {
    return arStr().map(function (a) { return varde(serie, parti, a); });
  }

  /* Streckad linje över de övergångar Valmyndigheten inte anser
     jämförbara. Chart.js frågar per segment; p0DataIndex är årsindexet
     till vänster om segmentet. */
  function brottSegment(serie) {
    return {
      borderDash: function (ctx) {
        var overgang = data.overgangar[ctx.p0DataIndex];
        return overgang && !serie.jamforbart(overgang) ? STRECK_BROTT : undefined;
      }
    };
  }

  function linje(serie, parti, stil, tjock) {
    return {
      label: serie.namn,
      data: serieData(serie, parti),
      borderColor: stil.farg,
      backgroundColor: stil.farg,
      pointBackgroundColor: stil.farg,
      pointStyle: stil.punkt || "circle",
      borderWidth: tjock || 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      borderDash: stil.streck && stil.streck.length ? stil.streck : undefined,
      segment: brottSegment(serie),
      spanGaps: false,
      tension: 0
    };
  }

  /* ---------- Diagram 1: andelen per valår ---------- */

  function enhet() { return valtMatt() === "antal" ? "röster" : "%"; }

  function yTitel() {
    return valtMatt() === "antal"
      ? "Antal röster" : "Andel av de giltiga rösterna (%)";
  }

  /* Legenden ligger under diagrammet och tar sin plats ur ritytan. Med
     tolv markerade distrikt blir den flera rader hög – på en smal skärm
     ännu fler – och ritytan hade då tryckts ihop tills linjerna låg på
     varandra. Diagrammet växer i stället med legenden, så att bilden är
     lika hög oavsett hur många distrikt som är markerade.

     Legendens höjd går inte att räkna ut i förväg: den beror på
     skärmbredden och på hur långa distriktsnamnen är. Den läses därför
     av efter första ritningen. En höjdändring flyttar inga rader i
     legenden – den är lika bred som förut – så en omläsning räcker. */
  var HOJD = 420;
  var LEGEND_EN_RAD = 34;

  function vaxMedLegend(chart, bashojd) {
    if (!chart.legend) return;
    var wrap = chart.canvas.parentElement;
    var onskad = bashojd +
      Math.max(0, Math.round(chart.legend.height) - LEGEND_EN_RAD);
    if (parseInt(wrap.style.height, 10) === onskad) return;
    wrap.style.height = onskad + "px";
    chart.resize();
  }

  function basOptions(ytitel, formatera) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        /* Legenden ritar punktformen och inte bara en färgruta. Med fler
           serier än paletten har färger är formen det som skiljer det
           nionde distriktet från det första, och då måste den synas
           också i legenden. */
        legend: {
          display: true,
          position: "bottom",
          labels: { usePointStyle: true, pointStyleWidth: 14 }
        },
        tooltip: {
          callbacks: {
            label: function (it) {
              if (it.parsed.y === null) return it.dataset.label + ": –";
              return it.dataset.label + ": " + formatera(it.parsed.y);
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: "Valår" } },
        y: {
          title: { display: true, text: ytitel },
          beginAtZero: valtMatt() === "antal",
          ticks: {
            callback: function (v) {
              return valtMatt() === "antal" ? talSv(v) : talSv(v, 1);
            }
          }
        }
      }
    };
  }

  function formateraVarde(v) {
    return valtMatt() === "antal"
      ? talSv(v) + " röster" : talSv(v, 1) + " %";
  }

  /* Två skilda skäl till att en linje bryts, och de får inte blandas
     ihop: antingen fanns valdistriktet inte det året, eller så fanns det
     men Valmyndigheten anser inte att det går att jämföra. Gruppregeln
     hör bara hemma där flera distrikt summeras. */
  function brottsNoter(slugar, medGrupp) {
    var saknade = [], omritade = [], noter = [];
    slugar.map(distriktFor).filter(Boolean).forEach(function (d) {
      arStr().forEach(function (a) {
        if (d.giltiga[a] === null || d.giltiga[a] === undefined) {
          saknade.push(d.namn + " " + a);
        }
      });
      data.overgangar.forEach(function (o) {
        var delar = o.split("-");
        if (d.jamforbart[o]) return;
        if (d.giltiga[delar[0]] === null || d.giltiga[delar[0]] === undefined ||
            d.giltiga[delar[1]] === null || d.giltiga[delar[1]] === undefined) {
          return;
        }
        omritade.push(d.namn + " " + visaOvergang(o));
      });
    });
    if (saknade.length) {
      noter.push("Avbrott i linjen: valdistriktet fanns inte det året (" +
        esc(saknade.join(", ")) + ")." +
        (medGrupp ? " Gruppens linje ritas bara de år alla markerade " +
          "distrikt finns, eftersom summan annars inte är gruppen." : ""));
    }
    if (omritade.length) {
      noter.push("Streckad linje: Valmyndigheten anser inte att distriktet " +
        "går att jämföra mellan de två valen, eftersom gränserna ritades om (" +
        esc(omritade.join(", ")) + ").");
    }
    return noter;
  }

  function ritaAndel() {
    var parti = valtParti();
    var slugar = valdaSlugar();
    var kommun = kommunSerie();
    var datasets = [];

    if (slugar.length) {
      /* Kommunen som grå referens bakom de markerade distrikten. */
      datasets.push(linje(kommun, parti,
        { farg: FARG_KOMMUN, punkt: "rectRot" }, 2));
      if (slugar.length <= MAX_LINJER) {
        slugar.forEach(function (s, i) {
          datasets.push(linje(distriktSerie(distriktFor(s)), parti,
            distriktStil(i), 2));
        });
      }
      if (slugar.length > 1) {
        datasets.push(linje(gruppSerie(slugar), parti,
          { farg: FARG_GRUPP, punkt: "circle" }, 3.5));
      }
    } else {
      /* Utan markering är kommunen inte längre en referens i bakgrunden
         utan sidans ämne, och ritas då i sajtens blå. */
      datasets.push(linje(kommun, parti, { farg: FARG.blaMork, punkt: "circle" }, 3));
    }

    var chart = K.rita("diagram-andel", {
      type: "line",
      data: { labels: arStr(), datasets: datasets },
      options: basOptions(yTitel(), formateraVarde)
    }, HOJD);
    vaxMedLegend(chart, HOJD);
    K.aktiveraToning(chart, true);

    el("rubrik-andel").textContent =
      "Hur har " + partiNamn(parti) + " gått i distrikten?";

    var noter = [];
    if (slugar.length > MAX_LINJER) {
      noter.push("Med " + slugar.length + " markerade distrikt ritas bara " +
        "gruppen och kommunen. Markera högst " + MAX_LINJER +
        " distrikt för att se dem var för sig.");
    }
    K.sattDataNot("not-andel",
      noter.concat(brottsNoter(slugar, true)).join(" "));
  }

  /* ---------- Diagram 2: förändringen mellan två val ---------- */

  function forandring(d, overgang, parti) {
    var delar = overgang.split("-");
    var fore = delar[0], efter = delar[1];
    if (!d.jamforbart[overgang]) return null;
    var serie = distriktSerie(d);
    var a = varde(serie, parti, fore), b = varde(serie, parti, efter);
    if (a === null || b === null) return null;
    return b - a;
  }

  function ritaForandring() {
    var parti = valtParti();
    var overgang = valdOvergang();
    var poster = [];
    var utelamnade = [];
    data.distrikt.forEach(function (d) {
      var f = forandring(d, overgang, parti);
      if (f === null) utelamnade.push(d.namn);
      else poster.push({ namn: d.namn, slug: d.slug, v: f });
    });
    poster.sort(function (a, b) { return b.v - a.v; });

    var nagraValda = valdaSlugar().length > 0;
    var farger = poster.map(function (p) {
      var stark = p.v >= 0 ? FARG.bla : FARG.rod;
      return (!nagraValda || valda[p.slug]) ? stark : tonad(stark);
    });

    var chart = K.rita("diagram-forandring", {
      type: "bar",
      data: {
        labels: poster.map(function (p) { return p.namn; }),
        datasets: [{
          label: partiNamn(parti) + ", " + visaOvergang(overgang),
          data: poster.map(function (p) { return p.v; }),
          backgroundColor: farger,
          borderColor: farger,
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (it) {
                return valtMatt() === "antal"
                  ? tecken(it.parsed.x) + " röster"
                  : procentenheter(it.parsed.x);
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: valtMatt() === "antal"
                ? "Förändring i antal röster" : "Förändring i procentenheter"
            },
            grid: { color: function (c) { return c.tick.value === 0 ? FARG.ink2 : FARG.grid; } }
          },
          y: { ticks: { autoSkip: false, font: { size: 11 } } }
        }
      }
    }, Math.max(320, 22 * poster.length + 90));

    el("rubrik-forandring").textContent =
      "Var gick " + partiNamn(parti) + " fram, och var backade det?";

    K.sattDataNot("not-forandring", utelamnade.length
      ? "Utelämnade, eftersom valdistriktet ritades om eller inte fanns " +
        "båda åren: " + esc(utelamnade.join(", ")) + "."
      : "");
    return chart;
  }

  /* ---------- Diagram 3: partierna i samma område ---------- */

  function ritaPartier() {
    var serie = omradet();
    var koder = data.partier.map(function (p) { return p.kod; })
      .filter(function (k) { return valdaPartier[k]; });
    var datasets = koder.map(function (kod, i) {
      var d = linje(serie, kod, partiStil(i), 2);
      d.label = partiNamn(kod);
      return d;
    });

    vaxMedLegend(K.rita("diagram-partier", {
      type: "line",
      data: { labels: arStr(), datasets: datasets },
      options: basOptions(yTitel(), formateraVarde)
    }, HOJD), HOJD);

    el("rubrik-partier").textContent =
      "Hur har partierna gått i " +
      (serie.antalDistrikt ? "det markerade området" : "hela kommunen") + "?";
  }

  /* ---------- Diagram 4: partierna i ett enskilt distrikt ----------
     Diagram 3 svarar på hur partierna gått i det markerade området, och
     summerar då ihop distrikten. Den här frågan är den motsatta: hur ser
     partifältet ut i ett distrikt, ett i taget. Distriktet väljs för sig
     och behöver inte vara markerat ovanför – den som vill jämföra två
     distrikt byter i reglaget i stället för att kryssa om hela sidan.

     Det valda partiet är sidans ämne också här: det ritas tjockt och i
     full färg, de andra blekt och tunt. Punkterna behåller sin fulla
     färg – en linje på trettio procents opacitet går att se men inte att
     peka ut, och det är punkterna legenden visar. */
  var TJOCK_HUVUD = 4;
  var TUNN_OVRIG = 1.5;

  function ritaEnskilt() {
    var d = distriktFor(valtEnskilt());
    if (!d) return;
    var serie = distriktSerie(d);
    var huvud = valtParti();
    var koder = data.partier.map(function (p) { return p.kod; })
      .filter(function (k) { return valdaPartier[k]; });

    var datasets = koder.map(function (kod, i) {
      var stil = partiStil(i);
      var arHuvud = kod === huvud;
      var rad = linje(serie, kod, stil,
        arHuvud ? TJOCK_HUVUD : TUNN_OVRIG);
      rad.label = partiNamn(kod);
      rad.pointRadius = arHuvud ? 4 : 2;
      if (!arHuvud) rad.borderColor = tonad(stil.farg);
      return rad;
    });

    var chart = K.rita("diagram-enskilt", {
      type: "line",
      data: { labels: arStr(), datasets: datasets },
      options: basOptions(yTitel(), formateraVarde)
    }, HOJD);
    vaxMedLegend(chart, HOJD);
    K.aktiveraToning(chart, true);

    el("rubrik-enskilt").textContent =
      "Hur står " + partiNamn(huvud) + " mot de andra partierna i " +
      d.namn + "?";

    var noter = brottsNoter([d.slug], false);
    if (!valdaPartier[huvud]) {
      noter.unshift(esc(partiNamn(huvud)) + " är urkryssat i diagrammet ovanför " +
        "och ritas därför inte heller här.");
    }
    K.sattDataNot("not-enskilt", noter.join(" "));
  }

  /* ---------- Tabellen ---------- */

  function ritaTabell() {
    var parti = valtParti();
    var overgang = valdOvergang();
    var rubriker = ["Valdistrikt"].concat(arStr().map(function (a) {
      return a + (valtMatt() === "antal" ? "" : " %");
    })).concat(["Förändring " + visaOvergang(overgang)]);

    var kropp = data.distrikt.map(function (d) {
      var serie = distriktSerie(d);
      var celler = arStr().map(function (a) {
        var v = varde(serie, parti, a);
        return v === null ? "–"
          : (valtMatt() === "antal" ? talSv(v) : talSv(v, 1));
      });
      var f = forandring(d, overgang, parti);
      celler.push(f === null ? "–"
        : (valtMatt() === "antal" ? tecken(f) : tecken(f, 1)));
      var markerad = valda[d.slug] ? ' class="rad-markerad"' : "";
      return "<tr" + markerad + "><th scope=\"row\">" + esc(d.namn) + "</th>" +
        celler.map(function (c) { return "<td>" + c + "</td>"; }).join("") +
        "</tr>";
    }).join("");

    el("tabell-distrikt").innerHTML =
      "<caption>" + esc(partiNamn(parti)) + " i kommunvalet, per valdistrikt. " +
      "– betyder att distriktet inte fanns eller inte går att jämföra." +
      "</caption><thead><tr>" +
      rubriker.map(function (r) {
        return '<th scope="col">' + esc(r) + "</th>";
      }).join("") + "</tr></thead><tbody>" + kropp + "</tbody>";
  }

  /* ---------- "Kort sagt" ---------- */

  function kortSagt() {
    var parti = valtParti();
    var serie = omradet();
    var a = arStr();
    var senaste = a[a.length - 1], forra = a[a.length - 2];
    var punkter = [];
    var namn = esc(partiNamn(parti));
    var omr = serie.antalDistrikt
      ? (serie.antalDistrikt === 1 ? esc(serie.namn) : "de markerade distrikten")
      : "hela Kungsbacka";

    var nu = varde(serie, parti, senaste), da = varde(serie, parti, forra);
    if (nu !== null) {
      var text = "<strong>" + namn + "</strong> fick " +
        (valtMatt() === "antal" ? talSv(nu) + " röster" : talSv(nu, 1) + " %") +
        " i " + omr + " i kommunvalet " + senaste;
      if (da !== null) {
        text += ", " + (valtMatt() === "antal"
          ? tecken(nu - da) + " röster" : procentenheter(nu - da)) +
          " mot " + forra;
        if (!serie.jamforbart(data.overgangar[data.overgangar.length - 1])) {
          text += " (men valdistrikten ritades om mellan valen)";
        }
      }
      punkter.push(text + ".");
    }

    /* Starkaste och svagaste distriktet i det senaste valet. */
    var med = data.distrikt.map(function (d) {
      return { namn: d.namn, v: varde(distriktSerie(d), parti, senaste) };
    }).filter(function (p) { return p.v !== null; });
    if (med.length > 1) {
      med.sort(function (x, y) { return y.v - x.v; });
      punkter.push("Starkast " + senaste + ": <strong>" + esc(med[0].namn) +
        "</strong> med " + talSv(med[0].v, valtMatt() === "antal" ? 0 : 1) +
        " " + enhet() + ". Svagast: <strong>" +
        esc(med[med.length - 1].namn) + "</strong> med " +
        talSv(med[med.length - 1].v, valtMatt() === "antal" ? 0 : 1) +
        " " + enhet() + ".");
    }

    /* Största rörelsen i den valda övergången. */
    var overgang = valdOvergang();
    var rorelser = data.distrikt.map(function (d) {
      return { namn: d.namn, v: forandring(d, overgang, parti) };
    }).filter(function (p) { return p.v !== null; });
    if (rorelser.length > 1) {
      rorelser.sort(function (x, y) { return y.v - x.v; });
      var upp = rorelser[0], ner = rorelser[rorelser.length - 1];
      /* Övergången kommer ur reglaget, som i sin tur kan sättas ur
         adressraden. Reglaget släpper bara igenom värden som redan finns
         som alternativ, men "Kort sagt" skrivs som HTML och ska inte vila
         på det antagandet – escapa. */
      punkter.push("Mellan " + esc(overgang.replace("-", " och ")) +
        " gick partiet mest fram i <strong>" + esc(upp.namn) + "</strong> (" +
        (valtMatt() === "antal" ? tecken(upp.v) + " röster" : procentenheter(upp.v)) +
        ") och mest bakåt i <strong>" + esc(ner.namn) + "</strong> (" +
        (valtMatt() === "antal" ? tecken(ner.v) + " röster" : procentenheter(ner.v)) +
        "). " + rorelser.length + " av " + data.distrikt.length +
        " distrikt gick att jämföra.");
    }

    K.visaKortSagt(punkter);
  }

  /* ---------- Reglagen ---------- */

  function laesUrlDistrikt() {
    var v = K.urlLas("distrikt");
    valda = {};
    if (!v) return;
    if (v === "alla") {
      data.distrikt.forEach(function (d) { valda[d.slug] = true; });
      return;
    }
    v.split(",").forEach(function (s) {
      if (distriktFor(s)) valda[s] = true;
    });
  }

  function urlDistriktVarde() {
    var s = valdaSlugar();
    if (!s.length) return null;
    if (s.length === data.distrikt.length) return "alla";
    return s.join(",");
  }

  function laesUrlPartier() {
    var v = K.urlLas("partier");
    valdaPartier = {};
    if (v) {
      v.split(",").forEach(function (kod) {
        for (var i = 0; i < data.partier.length; i++) {
          if (K.slug(data.partier[i].kod) === kod) valdaPartier[data.partier[i].kod] = true;
        }
      });
    }
    if (!Object.keys(valdaPartier).length) {
      /* Förval: de största partierna i det senaste valet. Datafilen är
         redan ordnad så. */
      data.partier.slice(0, MAX_PARTIER).forEach(function (p) {
        valdaPartier[p.kod] = true;
      });
    }
  }

  function urlPartierVarde() {
    var koder = data.partier.filter(function (p) { return valdaPartier[p.kod]; })
      .map(function (p) { return K.slug(p.kod); });
    return koder.length ? koder.join(",") : null;
  }

  /* Det enskilda diagrammets distrikt väljs för sig, men börjar där
     blicken redan är: på det första markerade distriktet, och på det
     första i listan när inget är markerat. Bär adressraden ett eget val
     är det det som gäller, och då rör vi inte reglaget – kopplaValjare
     har redan ställt det. Samma regel vid start som vid bakåt i
     historiken, så att bakåtknappen ger samma vy som en ny laddning av
     samma adress. */
  function stallEnskiltForval() {
    if (K.urlLas("enskilt")) return;
    el("valj-distrikt").value = valdaSlugar()[0] || data.distrikt[0].slug;
  }

  function byggDistriktRutor() {
    var plats = el("distriktval-rutor");
    plats.innerHTML = data.distrikt.map(function (d) {
      var id = "d-" + d.slug;
      return '<div class="distriktval-ruta">' +
        '<input type="checkbox" id="' + esc(id) + '" value="' + esc(d.slug) + '">' +
        '<label for="' + esc(id) + '">' + esc(d.namn) + "</label></div>";
    }).join("");
    plats.addEventListener("change", function (e) {
      if (!e.target.matches("input[type=checkbox]")) return;
      if (e.target.checked) valda[e.target.value] = true;
      else delete valda[e.target.value];
      K.urlSatt({ distrikt: urlDistriktVarde() });
      ritaAllt();
    });
  }

  function byggPartiRutor() {
    var plats = el("partival-rutor");
    plats.innerHTML = data.partier.map(function (p) {
      var id = "p-" + K.slug(p.kod);
      return '<div class="distriktval-ruta">' +
        '<input type="checkbox" id="' + esc(id) + '" value="' + esc(p.kod) + '">' +
        '<label for="' + esc(id) + '">' + esc(p.namn) + "</label></div>";
    }).join("");
    plats.addEventListener("change", function (e) {
      if (!e.target.matches("input[type=checkbox]")) return;
      if (e.target.checked) {
        if (Object.keys(valdaPartier).length >= MAX_PARTIER) {
          e.target.checked = false;
          return;
        }
        valdaPartier[e.target.value] = true;
      } else {
        delete valdaPartier[e.target.value];
      }
      K.urlSatt({ partier: urlPartierVarde() });
      speglaPartiRutor();
      ritaPartier();
      ritaEnskilt();
    });
  }

  function speglaDistriktRutor() {
    var rutor = el("distriktval-rutor").querySelectorAll("input[type=checkbox]");
    Array.prototype.forEach.call(rutor, function (r) {
      r.checked = !!valda[r.value];
    });
    var n = valdaSlugar().length;
    el("distriktval-antal").textContent = n
      ? n + " av " + data.distrikt.length + " distrikt markerade"
      : "Inget distrikt markerat – visar hela kommunen";
  }

  function speglaPartiRutor() {
    var fullt = Object.keys(valdaPartier).length >= MAX_PARTIER;
    var rutor = el("partival-rutor").querySelectorAll("input[type=checkbox]");
    Array.prototype.forEach.call(rutor, function (r) {
      r.checked = !!valdaPartier[r.value];
      r.disabled = fullt && !r.checked;
    });
  }

  function ritaAllt() {
    speglaDistriktRutor();
    speglaPartiRutor();
    ritaAndel();
    ritaForandring();
    ritaPartier();
    ritaEnskilt();
    ritaTabell();
    kortSagt();
  }

  /* ---------- Källor och metadata ---------- */

  function visaKallor() {
    var rader = ar().map(function (a) {
      var k = data.kalla[String(a)];
      if (!k) return "";
      var url = sakerUrl(k.kallaUrl);
      return "<li>" + a + ": " +
        (url ? '<a href="' + esc(url) + '">' + esc(k.kalla) + "</a>"
          : esc(k.kalla)) +
        (k.hamtad ? " (hämtad " + esc(k.hamtad) + ")" : "") + "</li>";
    });
    Object.keys(data.kallaJamforbarhet || {}).sort().forEach(function (nyckel) {
      var k = data.kallaJamforbarhet[nyckel];
      var url = sakerUrl(k.kallaUrl);
      rader.push("<li>Jämförbarhet " + esc(nyckel.replace("-", "–")) + ": " +
        (url ? '<a href="' + esc(url) + '">' + esc(k.kalla) + "</a>"
          : esc(k.kalla)) + "</li>");
    });
    el("lista-kallor").innerHTML = rader.join("");
  }

  function visaOm() {
    var troskel = data.troskelProcent;
    var egna = data.partier.filter(function (p) { return p.kod !== "ÖVR"; });
    el("forklaring-partier").innerHTML =
      "Redovisade partier är de " + egna.length + " som någon gång nått över " +
      talSv(troskel, 0) + "&nbsp;% av rösterna i kommunen. Resten ligger " +
      "samlade i <strong>övriga partier</strong>. Högst " + MAX_PARTIER +
      " serier ritas samtidigt, så att varje parti kan skiljas från de " +
      "andra på både färg och punktform &ndash; kryssa ur ett parti för " +
      "att få plats med ett annat.";
    el("om-troskel").innerHTML =
      "<strong>Partier under " + talSv(troskel, 0) + "&nbsp;%.</strong> " +
      "Ett parti redovisas för sig om det någon gång i de fem valen nått " +
      "över " + talSv(troskel, 0) + "&nbsp;% av de giltiga rösterna i hela " +
      "kommunen. I Kungsbacka är det " + egna.length + " partier. Övriga " +
      "ligger samlade under <em>övriga partier</em> &ndash; samma restpost " +
      "som Valmyndighetens egna filer använder &ndash; så att partiernas " +
      "röster fortfarande summerar till antalet giltiga. Deras siffror " +
      "finns kvar oavkortat i " +
      '<a href="https://github.com/moggleif/politik/tree/main/data/kommunval">' +
      "datat i repot</a>.";

    var prel = data.rakningstillfalle || {};
    var preliminara = Object.keys(prel).filter(function (a) {
      return prel[a] !== "slutlig";
    });
    var rad = el("om-rakning");
    if (preliminara.length) {
      rad.innerHTML = "<strong>" + esc(preliminara.join(", ")) +
        " är en preliminär räkning.</strong> Den innehåller bara de partier " +
        "Valmyndigheten räknar på valkvällen, inte de minsta, och de sent " +
        "inkomna förtidsrösterna och brevrösterna är ännu inte med. Antalet " +
        "röster är därför för lågt, och andelarna kan ändras när den " +
        "slutliga räkningen är klar.";
      rad.hidden = false;
    } else {
      rad.hidden = true;
    }

    var nedlagda = data.nedlagda || [];
    K.sattDataNot("not-distrikt", nedlagda.length
      ? "Listan visar de " + data.distrikt.length + " valdistrikt som fanns i " +
        "det senaste valet. " +
        nedlagda.map(function (d) {
          return esc(d.namn) + " fanns till och med " + d.sistaVal;
        }).join(", ") +
        " och finns inte som egen rad, men ingår i kommunens siffror."
      : "");

    el("forklaring-distriktval").textContent =
      "Varje markerat distrikt får dessutom en egen linje i diagrammet " +
      "nedanför, så länge högst " + MAX_LINJER + " distrikt är markerade. " +
      "Fler linjer än så går inte att läsa i samma bild, och då ritas bara " +
      "gruppen och kommunen.";

    el("om-uppdaterad").textContent =
      "Senast uppdaterad: " + data.senastUppdaterad + ".";
  }

  /* ---------- Start ---------- */

  function init(hamtat) {
    data = hamtat;

    /* Väljarnas värden är partikoden respektive övergångsnyckeln, som
       koden räknar med och adressraden bär; texten är det som läses. */
    K.fyllValjare(el("valj-parti"),
      data.partier.map(function (p) { return p.kod; }), partiNamn);
    /* Moderaterna är förvalt parti; sidan är i övrigt partineutral. */
    el("valj-parti").value = "M";

    K.fyllValjare(el("valj-jamfor"), data.overgangar, visaOvergang);
    el("valj-jamfor").value = data.overgangar[data.overgangar.length - 1];

    byggDistriktRutor();
    byggPartiRutor();
    laesUrlDistrikt();
    laesUrlPartier();

    K.fyllValjare(el("valj-distrikt"),
      data.distrikt.map(function (d) { return d.slug; }),
      function (slug) { return distriktFor(slug).namn; });
    stallEnskiltForval();

    K.kopplaValjare(el("valj-parti"), "parti", ritaAllt);
    K.kopplaValjare(el("valj-matt"), "matt", ritaAllt);
    K.kopplaValjare(el("valj-jamfor"), "jamfor", ritaAllt);
    K.kopplaValjare(el("valj-distrikt"), "enskilt", ritaEnskilt);

    K.urlLyssna(function () {
      laesUrlDistrikt();
      laesUrlPartier();
      stallEnskiltForval();
      ritaAllt();
    });

    el("valj-alla").addEventListener("click", function () {
      data.distrikt.forEach(function (d) { valda[d.slug] = true; });
      K.urlSatt({ distrikt: urlDistriktVarde() });
      ritaAllt();
    });
    el("valj-inga").addEventListener("click", function () {
      valda = {};
      K.urlSatt({ distrikt: null });
      ritaAllt();
    });

    ["valjarrad", "sektion-distrikt", "sektion-andel", "sektion-forandring",
      "sektion-partier", "sektion-enskilt", "sektion-tabell", "sektion-kallor",
      "sektion-om"]
      .forEach(function (id) { el(id).hidden = false; });

    K.visaMeta({
      kalla: "Valmyndigheten",
      period: "kommunvalen " + ar()[0] + "–" + ar()[ar().length - 1],
      senaste: String(ar()[ar().length - 1]),
      hamtad: data.senastUppdaterad
    });
    visaKallor();
    visaOm();
    ritaAllt();
  }

  K.starta(DATAFIL, {
    init: init,
    tomt: function (d) { return !d || !d.distrikt || !d.distrikt.length; },
    tomtText: "Valresultatet per valdistrikt är inte inläst ännu."
  });
})();
