/* Valresultat per valdistrikt i Kungsbacka — de tre valen 2010–2026.
   Läser docs/data-kommunval.json, docs/data-regionval.json eller
   docs/data-riksdagsval.json, byggda av scripts/build_valresultat.py ur
   Valmyndighetens öppna data.

   Samma valdistrikt röstar i tre val samma dag, och väljaren högst upp
   byter vilket av dem sidan visar. De tre datafilerna är byggda likadant
   och har samma valdistrikt med samma slugar, så en markerad grupp
   distrikt följer med över bytet – det är hela poängen med att lägga de
   tre valen på en sida i stället för tre. Partierna kan däremot skilja
   sig: ett lokalt parti finns i kommunvalet men inte på
   riksdagsvalsedeln, och det valda partiet faller då tillbaka på
   förvalet. Varje fil bär sitt eget namn på valet, och all text som
   nämner valet läses därifrån.

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

  /* De tre valen, i den ordning väljaren visar dem. Etiketterna står
     här och inte i datafilerna: sidan måste kunna rita väljaren innan
     någon fil är inläst. Allt annat om valet – dess namn i löpande text
     – kommer ur den inlästa filen. */
  var VALEN = [
    { nyckel: "kommun", etikett: "Kommunfullmäktige",
      fil: "data-kommunval.json", mapp: "kommunval" },
    { nyckel: "region", etikett: "Regionfullmäktige",
      fil: "data-regionval.json", mapp: "regionval" },
    { nyckel: "riksdag", etikett: "Riksdagen",
      fil: "data-riksdagsval.json", mapp: "riksdagsval" }
  ];

  /* Okänt eller saknat värde i adressraden ger kommunvalet. */
  function valetFor(nyckel) {
    for (var i = 0; i < VALEN.length; i++) {
      if (VALEN[i].nyckel === nyckel) return VALEN[i];
    }
    return VALEN[0];
  }

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

  /* ---------- Härkomst: området innan distriktet fanns ----------
     Ett valdistrikt som ritades upp 2022 har inga siffror för 2010, men
     marken hade det: den låg i ett annat valdistrikt. Datafilen bär det
     distriktets röster, skalade med hur stor del av det som blev det
     här distriktet, och de åren ritas med streckad linje.

     Talen är en indikator för området och aldrig distriktets resultat.
     De ligger därför i ett eget fält, och allt som påstår något om
     distriktet självt – tabellen, förändringen mellan två val, "Kort
     sagt" – håller sig till de riktiga siffrorna. */

  function harkomst(d, a) {
    return (d.harkomst && d.harkomst[a]) || null;
  }

  function egetAr(d, a) {
    return d.giltiga[a] !== null && d.giltiga[a] !== undefined;
  }

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
      indikator: function () { return false; },
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
          var d = lista[i];
          if (egetAr(d, a)) {
            var p = d.roster[parti];
            s += (p && p[a]) || 0;
          } else {
            var h = harkomst(d, a);
            s += (h && h.roster[parti]) || 0;
          }
        }
        return s;
      },
      giltiga: function (a) {
        var s = 0;
        for (var i = 0; i < lista.length; i++) {
          var d = lista[i];
          var h = egetAr(d, a) ? null : harkomst(d, a);
          s += (h ? h.giltiga : d.giltiga[a]) || 0;
        }
        return s;
      },
      /* Saknas något markerat distrikt ett år, och har det ingen
         härkomst att falla tillbaka på, är gruppens summa inte gruppen.
         Då ritas ingen punkt alls i stället för en punkt som ser ut som
         en nedgång. */
      komplett: function (a) {
        for (var i = 0; i < lista.length; i++) {
          if (!egetAr(lista[i], a) && !harkomst(lista[i], a)) return false;
        }
        return lista.length > 0;
      },
      /* Gruppens år är en indikator så fort ett enda av distrikten
         bidrar med en. */
      indikator: function (a) {
        for (var i = 0; i < lista.length; i++) {
          if (!egetAr(lista[i], a) && harkomst(lista[i], a)) return true;
        }
        return false;
      },
      indikatorText: function (a) {
        var namn = lista.filter(function (d) {
          return !egetAr(d, a) && harkomst(d, a);
        }).map(function (d) { return d.namn; });
        return namn.length
          ? "indikator för " + namn.join(", ") : null;
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

  /* Andra argumentet spelar roll: anropas den här funktionen via
     Array.prototype.map får den indexet som `baraEgna`. Gå därför alltid
     via en egen funktion i map, aldrig `map(distriktSerie)`.

     `baraEgna` stänger av indikatorn. Allt som påstår något om
     distriktet självt – tabellen, förändringen mellan två val, "Kort
     sagt" – ska läsa distriktets egna röster och ingenting annat, och
     ber om en sådan serie. Diagrammen ber om den vanliga. */
  function distriktSerie(d, baraEgna) {
    function hk(a) { return baraEgna ? null : harkomst(d, a); }
    return {
      namn: d.namn,
      antalDistrikt: 1,
      lista: [d],
      roster: function (parti, a) {
        if (!egetAr(d, a)) {
          var h = hk(a);
          return h ? (h.roster[parti] || 0) : 0;
        }
        var p = d.roster[parti];
        return (p && p[a] !== null && p[a] !== undefined) ? p[a] : 0;
      },
      giltiga: function (a) {
        if (!egetAr(d, a)) {
          var h = hk(a);
          return h ? h.giltiga : 0;
        }
        return d.giltiga[a];
      },
      komplett: function (a) {
        return egetAr(d, a) || !!hk(a);
      },
      indikator: function (a) { return !egetAr(d, a) && !!hk(a); },
      /* Vilka distrikt indikatorn vilar på, för tooltipen. */
      indikatorText: function (a) {
        var h = egetAr(d, a) ? null : hk(a);
        if (!h) return null;
        return "siffrorna för " + rakna_upp(h.fran.map(function (f) {
          return f.namn;
        }));
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

  /* Streckad linje betyder en enda sak på den här sidan: talen i var
     sin ände av sträckan är inte samma distrikt mätt två gånger.
     Antingen ritades gränserna om mellan valen, eller så fanns
     distriktet inte och talet är områdets härkomst. Chart.js frågar per
     segment; p0DataIndex är årsindexet till vänster om segmentet. */
  function brottSegment(serie, indikatorer) {
    return {
      borderDash: function (ctx) {
        var i = ctx.p0DataIndex;
        if (indikatorer[i] || indikatorer[i + 1]) return STRECK_BROTT;
        var overgang = data.overgangar[i];
        return overgang && !serie.jamforbart(overgang) ? STRECK_BROTT : undefined;
      }
    };
  }

  function indikatorAr(serie) {
    return arStr().map(function (a) {
      return !!(serie.indikator && serie.indikator(a) && serie.komplett(a));
    });
  }

  function linje(serie, parti, stil, tjock) {
    var indikatorer = indikatorAr(serie);
    var nagon = indikatorer.some(function (v) { return v; });
    return {
      label: serie.namn,
      data: serieData(serie, parti),
      borderColor: stil.farg,
      backgroundColor: stil.farg,
      /* Indikatorpunkten ritas ihålig: samma form och samma färg, men
         med sidans bakgrund i mitten, så att den syns som ett annat
         slags tal utan att bli en egen serie i teckenförklaringen. */
      pointBackgroundColor: nagon ? indikatorer.map(function (ind) {
        return ind ? FARG.surface : stil.farg;
      }) : stil.farg,
      pointBorderColor: stil.farg,
      pointBorderWidth: nagon ? indikatorer.map(function (ind) {
        return ind ? 2 : 1;
      }) : 1,
      pointStyle: stil.punkt || "circle",
      /* Teckenförklaringen ska visa seriens färg och inget annat: den
         ihåliga indikatorpunkten hör hemma i diagrammet, och den bleka
         linjen i partidiagrammen är en framhävning av det valda partiet,
         inte seriens identitet. */
      legendFarg: stil.farg,
      borderWidth: tjock || 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      borderDash: stil.streck && stil.streck.length ? stil.streck : undefined,
      segment: brottSegment(serie, indikatorer),
      spanGaps: false,
      tension: 0,
      /* Läses av tooltipen; Chart.js rör inte egna fält. */
      indikatorer: indikatorer,
      indikatorText: arStr().map(function (a, i) {
        return indikatorer[i] && serie.indikatorText
          ? serie.indikatorText(a) : null;
      })
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
          labels: {
            usePointStyle: true,
            pointStyleWidth: 14,
            generateLabels: function (chart) {
              var etiketter =
                Chart.defaults.plugins.legend.labels.generateLabels(chart);
              etiketter.forEach(function (e) {
                var ds = chart.data.datasets[e.datasetIndex];
                if (ds && ds.legendFarg) {
                  e.fillStyle = ds.legendFarg;
                  e.strokeStyle = ds.legendFarg;
                }
              });
              return etiketter;
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function (it) {
              if (it.parsed.y === null) return it.dataset.label + ": –";
              var rad = it.dataset.label + ": " + formatera(it.parsed.y);
              var text = it.dataset.indikatorText
                && it.dataset.indikatorText[it.dataIndex];
              return text ? rad + " (" + text + ")" : rad;
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
  /* "A", "A och B", "A, B och C" – inte "A och B och C". */
  function rakna_upp(namn) {
    if (namn.length < 2) return namn[0] || "";
    return namn.slice(0, -1).join(", ") + " och " + namn[namn.length - 1];
  }

  /* De distrikt en indikator vilar på, som "Kolla Norra före 2022:
     Kolla (2018), Västra Villastaden/Kolla (2010–2014)". Ett distrikt
     kan byta ursprung på vägen bakåt, och då ska båda stå där. */
  function harkomstText(d) {
    var perNamn = {}, ordning = [];
    arStr().forEach(function (a) {
      var h = egetAr(d, a) ? null : harkomst(d, a);
      if (!h) return;
      var namn = rakna_upp(h.fran.map(function (f) { return f.namn; }));
      if (!perNamn[namn]) { perNamn[namn] = []; ordning.push(namn); }
      perNamn[namn].push(a);
    });
    if (!ordning.length) return null;
    return d.namn + ": " + ordning.map(function (namn) {
      var a = perNamn[namn];
      return namn + " (" + (a.length > 1 ? a[0] + "–" + a[a.length - 1] : a[0]) + ")";
    }).join(", ");
  }

  /* Ett markerat distrikt kan vara ursprung för ett annat markerat
     distrikt. Då ligger den delen av rösterna i gruppens summa två
     gånger, och det ska stå i klartext i stället för att tigas ihjäl. */
  function dubbelraknade(lista) {
    var koder = {};
    lista.forEach(function (d) {
      arStr().forEach(function (a) {
        if (d.kod[a]) koder[a + ":" + d.kod[a]] = d.namn;
      });
    });
    var trassel = [];
    lista.forEach(function (d) {
      arStr().forEach(function (a) {
        var h = egetAr(d, a) ? null : harkomst(d, a);
        if (!h) return;
        h.fran.forEach(function (f) {
          var annat = koder[a + ":" + f.kod];
          if (annat && trassel.indexOf(annat) < 0) trassel.push(annat);
        });
      });
    });
    return trassel;
  }

  function brottsNoter(slugar, medGrupp) {
    var saknade = [], omritade = [], harkomster = [], noter = [];
    var lista = slugar.map(distriktFor).filter(Boolean);
    lista.forEach(function (d) {
      var h = harkomstText(d);
      if (h) harkomster.push(h);
      arStr().forEach(function (a) {
        if (!egetAr(d, a) && !harkomst(d, a)) {
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
    if (harkomster.length) {
      noter.push("Streckad linje med ihålig punkt: valdistriktet fanns inte " +
        "det året, och talet är i stället områdets &ndash; siffrorna för det " +
        "distrikt marken låg i då (" + esc(harkomster.join("; ")) + "). Det " +
        "är en indikator för området och inte distriktets resultat" +
        (valtMatt() === "antal"
          ? "; antalet röster är dessutom vägt efter yta och därför grovt"
          : "") + ".");
    }
    if (saknade.length) {
      noter.push("Avbrott i linjen: valdistriktet fanns inte det året, och " +
        "ingen källa anger vilket distrikt marken låg i (" +
        esc(saknade.join(", ")) + ")." +
        (medGrupp ? " Gruppens linje ritas bara de år alla markerade " +
          "distrikt har ett tal, eftersom summan annars inte är gruppen." : ""));
    }
    if (omritade.length) {
      noter.push("Streckad linje: Valmyndigheten anser inte att distriktet " +
        "går att jämföra mellan de två valen, eftersom gränserna ritades om (" +
        esc(omritade.join(", ")) + ").");
    }
    if (medGrupp) {
      var trassel = dubbelraknade(lista);
      if (trassel.length) {
        noter.push("Observera: " + esc(trassel.join(", ")) + " är också " +
          "ursprung för ett annat markerat distrikt, så gruppens " +
          "indikatorår innehåller de rösterna två gånger.");
      }
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
    var serie = distriktSerie(d, true);
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

    K.sattDataNot("not-partier", brottsNoter(valdaSlugar(), true).join(" "));
  }

  /* ---------- Diagram 4: partierna i vart och ett av distrikten ----------
     Diagram 3 svarar på hur partierna gått i det markerade området, och
     summerar då ihop distrikten till ett. Den här frågan är den motsatta:
     hur ser partifältet ut i varje distrikt för sig? Distrikten är därför
     inte ett eget reglage utan samma markering som resten av sidan – en
     kryssruta mer ger ett diagram mer, och den som vill jämföra två
     distrikt kryssar i två.

     Små diagram bredvid varandra jämförs med ögat, och då måste de dela
     y-axel: annars betyder samma linjehöjd sju procent i ett distrikt och
     tjugo i nästa. Skalan räknas över alla visade distrikt och alla
     ikryssade partier tillsammans.

     Teckenförklaringen står en gång över rutnätet i stället för en gång
     per diagram: färgerna är desamma i alla diagrammen, och tolv
     teckenförklaringar hade tagit mer plats än diagrammen de förklarar.

     Det valda partiet är sidans ämne också här: det ritas tjockt och i
     full färg, de andra blekt och tunt. Punkterna behåller sin fulla
     färg – en linje på trettio procents opacitet går att se men inte att
     peka ut, och det är punkterna teckenförklaringen visar. */
  var TJOCK_HUVUD = 4;
  var TUNN_OVRIG = 1.5;

  /* Samma tak som för linjerna i diagram 1, och av samma skäl som gäller
     där: över tolv distrikt är markeringen inte längre en grupp man läser
     distrikt för distrikt. Här är bilderna visserligen skilda åt, men ett
     rutnät med 46 diagram är en sida ingen läser – och 46 diagram ritas
     om vid varje kryss. */
  var MAX_SMADIAGRAM = MAX_LINJER;
  var SMA_HOJD = 250;

  /* Diagrammen skapas och rivs med markeringen, så deras id:n måste
     sparas: Chart.js-instansen lever kvar i registret även när canvasen
     tagits ur DOM:en. */
  var smadiagram = [];

  /* Teckenförklaringens markörer ritas som SVG i samma former som
     Chart.js punkter, så att förklaringen och diagrammen visar samma
     sak. Formen bär information här – det nionde partiet har palettens
     första färg – och får därför inte vara en färgruta. */
  var PUNKT_SVG = {
    circle: '<circle cx="7" cy="7" r="5.4"/>',
    rect: '<rect x="1.9" y="1.9" width="10.2" height="10.2"/>',
    triangle: '<polygon points="7,1.2 12.9,12 1.1,12"/>',
    rectRot: '<polygon points="7,0.8 13.2,7 7,13.2 0.8,7"/>',
    star: '<polygon points="7,0.5 8.6,5.3 13.6,5.3 9.5,8.3 11.1,13.1 7,10.1 2.9,13.1 4.5,8.3 0.4,5.3 5.4,5.3"/>'
  };

  function punktMarke(stil) {
    return '<svg class="teckenmarke" width="14" height="14" viewBox="0 0 14 14" ' +
      'aria-hidden="true" focusable="false" fill="' + esc(stil.farg) + '">' +
      (PUNKT_SVG[stil.punkt] || PUNKT_SVG.circle) + "</svg>";
  }

  function ritaTeckenforklaring(koder, visa) {
    var plats = el("teckenforklaring-enskilt");
    var huvud = valtParti();
    plats.innerHTML = !visa ? "" : koder.map(function (kod, i) {
      return '<span class="teckenpost' +
        (kod === huvud ? " teckenpost-huvud" : "") + '">' +
        punktMarke(partiStil(i)) + esc(partiNamn(kod)) + "</span>";
    }).join("");
    plats.hidden = !visa || !koder.length;
  }

  /* Gemensam y-axel för alla de små diagrammen. Ändarna rundas utåt till
     ett jämnt tal i stället för att läggas precis vid den högsta och den
     lägsta punkten: annars står "51,4" som översta gradering i alla tolv
     diagrammen, och avläsningen blir svårare än den behöver vara. I
     antalsläget börjar axeln som annars på noll. */
  function jamntSteg(spann) {
    if (!(spann > 0)) return 1;
    var tiopotens = Math.pow(10, Math.floor(Math.log(spann) / Math.LN10));
    var kvot = spann / tiopotens;
    return kvot > 5 ? tiopotens : (kvot > 2 ? tiopotens / 2 : tiopotens / 5);
  }

  function gemensamSkala(serier, koder) {
    var min = Infinity, max = -Infinity;
    serier.forEach(function (serie) {
      koder.forEach(function (kod) {
        arStr().forEach(function (a) {
          var v = varde(serie, kod, a);
          if (v === null) return;
          if (v < min) min = v;
          if (v > max) max = v;
        });
      });
    });
    if (min === Infinity) return null;
    var steg = jamntSteg(max - min || Math.abs(max) || 1);
    return {
      min: valtMatt() === "antal" ? 0
        : Math.max(0, Math.floor(min / steg) * steg),
      max: Math.ceil((max + steg / 4) / steg) * steg
    };
  }

  /* Basdiagrammets inställningar, nedskalade: ingen teckenförklaring (den
     står över rutnätet), inga axelrubriker (de står i brödtexten, och i
     ett litet diagram tar de plats från bilden) och mindre tickar. */
  function smaOptions(skala) {
    var opt = basOptions(yTitel(), formateraVarde);
    opt.plugins.legend.display = false;
    opt.scales.x.title.display = false;
    opt.scales.y.title.display = false;
    opt.scales.x.ticks = { font: { size: 11 } };
    opt.scales.y.ticks.font = { size: 11 };
    if (skala) {
      opt.scales.y.min = skala.min;
      opt.scales.y.max = skala.max;
    }
    return opt;
  }

  function smaDatasets(serie, koder) {
    var huvud = valtParti();
    return koder.map(function (kod, i) {
      var stil = partiStil(i);
      var arHuvud = kod === huvud;
      var rad = linje(serie, kod, stil, arHuvud ? TJOCK_HUVUD : TUNN_OVRIG);
      rad.label = partiNamn(kod);
      rad.pointRadius = arHuvud ? 4 : 2;
      if (!arHuvud) rad.borderColor = tonad(stil.farg);
      return rad;
    });
  }

  function smaEtikett(d) {
    return "Diagram: partiernas " +
      (valtMatt() === "antal" ? "antal röster" : "andel av rösterna") +
      " i " + d.namn + ", " + ar()[0] + " till " + ar()[ar().length - 1];
  }

  function ritaEnskilda() {
    var rutnat = el("smadiagram-rutnat");
    var slugar = valdaSlugar();
    var huvud = valtParti();
    var koder = data.partier.map(function (p) { return p.kod; })
      .filter(function (k) { return valdaPartier[k]; });
    var forManga = slugar.length > MAX_SMADIAGRAM;
    var lista = (slugar.length && !forManga)
      ? slugar.map(distriktFor).filter(Boolean) : [];

    /* Rita om från grunden: diagrammen är lika många som markeringarna. */
    smadiagram.forEach(K.taBortDiagram);
    smadiagram = [];

    el("rubrik-enskilt").textContent = lista.length === 1
      ? "Hur står " + partiNamn(huvud) + " mot de andra partierna i " +
        lista[0].namn + "?"
      : "Hur står " + partiNamn(huvud) +
        " mot de andra partierna, distrikt för distrikt?";

    ritaTeckenforklaring(koder, lista.length > 0);

    var noter = [];
    if (!slugar.length) {
      rutnat.innerHTML = '<p class="forklaring">Inget valdistrikt är ' +
        "markerat. Kryssa i ett eller flera distrikt ovanför, så får " +
        "vart och ett av dem ett eget diagram här.</p>";
    } else if (forManga) {
      rutnat.innerHTML = "";
      noter.push("Med " + slugar.length + " markerade distrikt ritas inga " +
        "diagram här. Markera högst " + MAX_SMADIAGRAM +
        " distrikt för att se partifältet i vart och ett av dem.");
    } else {
      /* Inte lista.map(distriktSerie): map skickar med indexet som
         andra argument, och det hade blivit distriktSerie(d, 1) för det
         andra distriktet – alltså "bara egna siffror", och inga
         indikatorer i något diagram utom det första. */
      var serier = lista.map(function (d) { return distriktSerie(d); });
      var skala = gemensamSkala(serier, koder);
      rutnat.innerHTML = lista.map(function (d) {
        return '<div class="kort smadiagram"><h3>' + esc(d.namn) + "</h3>" +
          '<div class="diagram-wrap"><canvas id="diagram-enskilt-' +
          esc(d.slug) + '" aria-label="' + esc(smaEtikett(d)) +
          '" role="img"></canvas></div></div>';
      }).join("");
      lista.forEach(function (d, i) {
        var id = "diagram-enskilt-" + d.slug;
        var chart = K.rita(id, {
          type: "line",
          data: { labels: arStr(), datasets: smaDatasets(serier[i], koder) },
          options: smaOptions(skala)
        }, SMA_HOJD);
        smadiagram.push(id);
        K.aktiveraToning(chart, false);
      });
      noter = brottsNoter(lista.map(function (d) { return d.slug; }), false);
      if (!valdaPartier[huvud]) {
        noter.unshift(esc(partiNamn(huvud)) + " är urkryssat i diagrammet " +
          "ovanför och ritas därför inte heller här.");
      }
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
      var serie = distriktSerie(d, true);
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
      "<caption>" + esc(partiNamn(parti)) + " i " + esc(data.valKort) +
      ", per valdistrikt. " +
      "– betyder att distriktet inte fanns eller inte går att jämföra. " +
      "Tabellen visar distriktens egna röster; indikatorerna för de år ett " +
      "distrikt inte fanns finns bara i diagrammen." +
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
        " i " + omr + " i " + esc(data.valKort) + " " + senaste;
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
      return { namn: d.namn, v: varde(distriktSerie(d, true), parti, senaste) };
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
      ritaEnskilda();
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
    ritaEnskilda();
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
      '<a href="https://github.com/moggleif/politik/tree/main/data/' +
      esc(valetFor(data.valNyckel).mapp) + '">datat i repot</a>.';

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
      "nedanför och ett eget diagram med alla partier längre ned, så länge " +
      "högst " + MAX_LINJER + " distrikt är markerade. Fler linjer än så " +
      "går inte att läsa i samma bild, och då ritas bara gruppen och " +
      "kommunen.";

    el("om-uppdaterad").textContent =
      "Senast uppdaterad: " + data.senastUppdaterad + ".";
  }

  /* ---------- Byte av val ----------
     Sidan är en och samma för de tre valen, och bytet ska kännas som ett
     reglage bland de andra: markerade distrikt, mått och jämförelseår
     står kvar, och bara rösterna byts. Datafilen hämtas därför i stället
     för att sidan laddas om.

     Valdistrikten är desamma i de tre filerna, så markeringen behöver
     inte räddas över – den läses ur adressraden precis som vanligt.
     Partierna är det inte: Kungsbackaborna finns i kommunvalet men inte
     på riksdagsvalsedeln, och ett valt parti som inte finns i det nya
     valet faller därför tillbaka på förvalet. */

  var FORVALT_PARTI = "M";

  function finnsPartiet(kod) {
    for (var i = 0; i < data.partier.length; i++) {
      if (data.partier[i].kod === kod) return true;
    }
    return false;
  }

  /* Partiväljaren fylls om vid varje val. Adressraden går först – den är
     det som bakåtknappen ställer tillbaka – sedan det parti som redan var
     valt, sist förvalet. */
  function fyllPartivaljare(tidigareParti) {
    K.fyllValjare(el("valj-parti"),
      data.partier.map(function (p) { return p.kod; }), partiNamn);
    var urUrl = K.urlLas("parti");
    var kandidater = [];
    data.partier.forEach(function (p) {
      if (urUrl && K.slug(p.kod) === urUrl) kandidater.push(p.kod);
    });
    kandidater.push(tidigareParti, FORVALT_PARTI);
    for (var i = 0; i < kandidater.length; i++) {
      if (kandidater[i] && finnsPartiet(kandidater[i])) {
        el("valj-parti").value = kandidater[i];
        return;
      }
    }
    el("valj-parti").value = data.partier[0].kod;
  }

  /* Allt som hänger på vilken datafil som lästs in. Körs vid start och
     vid varje byte av val. Ritar inte – den som anropar gör det, så att
     reglagen hinner ställas in efter adressraden först. */
  function visaValet(hamtat, tidigareParti) {
    data = hamtat;
    fyllPartivaljare(tidigareParti);

    var forraJamfor = el("valj-jamfor").value;
    K.fyllValjare(el("valj-jamfor"), data.overgangar, visaOvergang);
    el("valj-jamfor").value = data.overgangar.indexOf(forraJamfor) >= 0
      ? forraJamfor : data.overgangar[data.overgangar.length - 1];

    byggDistriktRutor();
    byggPartiRutor();
    laesUrlDistrikt();
    laesUrlPartier();

    el("valj-val").value = data.valNyckel;
    el("andel-inledning").textContent =
      "Andel av de giltiga rösterna i " + data.valKort + ", val för val.";
    el("diagram-andel").setAttribute("aria-label",
      "Diagram: partiets andel av rösterna i " + data.valKort +
      " per valdistrikt, 2010 till 2026");
    el("diagram-forandring").setAttribute("aria-label",
      "Diagram: förändring i procentenheter per valdistrikt mellan två " +
      data.valKort.replace(/et$/, ""));

    K.visaMeta({
      kalla: "Valmyndigheten",
      period: data.valenKort + " " + ar()[0] + "–" + ar()[ar().length - 1],
      senaste: String(ar()[ar().length - 1]),
      hamtad: data.senastUppdaterad
    });
    visaKallor();
    visaOm();
  }

  /* Hämtar ett annat vals datafil. `skrivUrl` är falskt när bytet kommer
     ur adressraden själv – bakåt och framåt i webbläsaren – för då står
     valet redan där, och en ny post i historiken hade ätit upp den post
     användaren är på väg tillbaka till.

     Går hämtningen inte igenom står det gamla valet kvar med sina
     siffror, och väljaren ställs tillbaka: en halv sida av det ena valet
     och en halv av det andra vore värre än ingenting. */
  function byteAvVal(nyckel, skrivUrl) {
    var val = valetFor(nyckel);
    var tidigareParti = el("valj-parti").value;
    fetch(val.fil).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (hamtat) {
      if (skrivUrl) {
        K.urlSatt({ val: val.nyckel === VALEN[0].nyckel ? null : val.nyckel });
      }
      visaValet(hamtat, tidigareParti);
      ritaAllt();
      /* Partiet kan ha bytts av bytet; adressraden ska visa det som
         verkligen ritas. */
      if (skrivUrl) K.urlSatt({ parti: K.slug(el("valj-parti").value) }, true);
    }).catch(function (fel) {
      el("valj-val").value = data.valNyckel;
      K.visaStatus("<strong>Kunde inte byta val.</strong> Tekniskt fel: " +
        esc(fel.message) + " (" + esc(val.fil) + "). " +
        esc(data.valEtikett) + " visas fortfarande.");
    });
  }

  /* ---------- Start ---------- */

  function init(hamtat) {
    K.fyllValjare(el("valj-val"),
      VALEN.map(function (v) { return v.nyckel; }),
      function (n) { return valetFor(n).etikett; });

    el("valj-val").addEventListener("change", function () {
      byteAvVal(el("valj-val").value, true);
    });

    /* En enda lyssnare för bakåt/framåt: byter adressraden val måste
       datafilen hämtas om innan något ritas, och då ska markeringarna
       inte hinna ritas med det gamla valets siffror först. */
    K.urlLyssna(function (p) {
      var nyckel = valetFor(p.get("val")).nyckel;
      if (nyckel !== data.valNyckel) {
        el("valj-val").value = nyckel;
        byteAvVal(nyckel, false);
        return;
      }
      laesUrlDistrikt();
      laesUrlPartier();
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

    visaValet(hamtat, null);

    /* Reglagen kopplas till adressraden när de väl har sina alternativ:
       kopplingen läser adressraden en gång vid start, och ett tomt
       reglage hade inte haft något att matcha mot. */
    K.kopplaValjare(el("valj-parti"), "parti", ritaAllt);
    K.kopplaValjare(el("valj-matt"), "matt", ritaAllt);
    K.kopplaValjare(el("valj-jamfor"), "jamfor", ritaAllt);
    ritaAllt();
  }

  /* Vilket val sidan börjar i står i adressraden, så att en delad länk
     ger samma vy. */
  K.starta(valetFor(K.urlLas("val")).fil, {
    init: init,
    tomt: function (d) { return !d || !d.distrikt || !d.distrikt.length; },
    tomtText: "Valresultatet per valdistrikt är inte inläst ännu."
  });
})();
