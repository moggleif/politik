/* Uppslagning i valresultatsidans datafiler – docs/data-kommunval.json,
   docs/data-regionval.json och docs/data-riksdagsval.json.

   Utbruten ur valresultat.js (#65) för att gå att enhetstesta: allt här
   svarar på en inläst datafil och några argument, och rör varken sidan,
   reglagen eller adressraden. Den fil som slås upp i skickas alltid in
   (`fil`); vilken av de tre sidan visar för tillfället vet bara
   valresultat.js. Testerna ligger i tests/test_valresultat.js.

   Ett "område" är en lista distrikt. Utan markering är området hela
   kommunen, och då används kommunens egna totalsiffror (som också
   innehåller uppsamlingsdistriktet). Alla tre slagen av område svarar
   på samma frågor – roster, giltiga, komplett, indikator, jamforbart –
   så att diagrammen kan rita dem med samma kod. */
(function () {
  "use strict";

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

  /* "A", "A och B", "A, B och C" – inte "A och B och C". */
  function raknaUpp(namn) {
    if (namn.length < 2) return namn[0] || "";
    return namn.slice(0, -1).join(", ") + " och " + namn[namn.length - 1];
  }

  /* Valdistrikten har samma slugar i alla tre filerna, så en markerad
     grupp betyder samma sak var den än slås upp. */
  function distriktFor(fil, slug) {
    var lista = fil.distrikt;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].slug === slug) return lista[i];
    }
    return null;
  }

  function partiNamn(fil, kod) {
    for (var i = 0; i < fil.partier.length; i++) {
      if (fil.partier[i].kod === kod) return fil.partier[i].namn;
    }
    return kod;
  }

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

  function kommunSerie(fil) {
    var totalt = fil.kommunTotalt;
    return {
      namn: "Hela Kungsbacka",
      antalDistrikt: null,
      roster: function (parti, a) {
        var p = totalt.roster[parti];
        return p ? (p[a] || 0) : 0;
      },
      giltiga: function (a) { return totalt.giltiga[a] || 0; },
      komplett: function () { return true; },
      indikator: function () { return false; },
      jamforbart: function () { return true; }
    };
  }

  function gruppSerie(fil, slugar) {
    var lista = slugar.map(function (s) { return distriktFor(fil, s); })
      .filter(Boolean);
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
        return "siffrorna för " + raknaUpp(h.fran.map(function (f) {
          return f.namn;
        }));
      },
      jamforbart: function (overgang) { return !!d.jamforbart[overgang]; }
    };
  }

  /* Ett parti som inte fick en enda röst i hela kommunen ett valår stod
     inte på den valsedeln, och datafilen skriver null för det året.
     Ingenting på sidan ska då påstå en nolla: kurvan bryts, tabellen
     skriver "–" och förändringstalet uteblir. */
  function partietFanns(fil, parti, a) {
    var totalt = fil.kommunTotalt.roster[parti];
    return !!totalt && totalt[a] !== null && totalt[a] !== undefined;
  }

  /* Områdets värde för partiet ett år: antal röster när `matt` är
     "antal", annars andelen av de giltiga rösterna i procent. Andelen
     räknas på områdets summor – ett medelvärde av distriktens procenttal
     hade vägt ett litet distrikt lika tungt som ett stort. null när
     partiet inte stod på valsedeln, när området inte är komplett och när
     det saknas giltiga röster att dela med. */
  function varde(fil, serie, parti, a, matt) {
    if (!partietFanns(fil, parti, a)) return null;
    if (!serie.komplett(a)) return null;
    var roster = serie.roster(parti, a);
    if (matt === "antal") return roster;
    var giltiga = serie.giltiga(a);
    return giltiga ? 100 * roster / giltiga : null;
  }

  window.VALUPPSLAG = {
    VALEN: VALEN,
    valetFor: valetFor,
    raknaUpp: raknaUpp,
    distriktFor: distriktFor,
    partiNamn: partiNamn,
    harkomst: harkomst,
    egetAr: egetAr,
    kommunSerie: kommunSerie,
    gruppSerie: gruppSerie,
    distriktSerie: distriktSerie,
    partietFanns: partietFanns,
    varde: varde
  };
})();
