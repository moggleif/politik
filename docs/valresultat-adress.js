/* Valresultatsidans läge i adressraden: vilka valdistrikt som är
   markerade (`?distrikt=`) och vilka partier partidiagrammet ritar
   (`?partier=`).

   Utbruten ur valresultat.js (#65) för att gå att enhetstesta. Här står
   bara översättningen mellan adressradens text och sidans urval, åt båda
   hållen; att läsa och skriva själva adressraden, och att spegla urvalet
   i kryssrutorna, gör valresultat.js med K.urlLas och K.urlSatt. Ett
   urval är ett objekt { nyckel: true }. Testerna ligger i
   tests/test_valresultat.js. */
(function () {
  "use strict";

  var K = window.KIS;

  /* "alla" markerar varje distrikt. Slugar som inte finns i filen
     hoppas över i stället för att ge ett tomt distrikt. */
  function lasDistrikt(fil, varde) {
    var valda = {};
    if (!varde) return valda;
    if (varde === "alla") {
      fil.distrikt.forEach(function (d) { valda[d.slug] = true; });
      return valda;
    }
    varde.split(",").forEach(function (s) {
      for (var i = 0; i < fil.distrikt.length; i++) {
        if (fil.distrikt[i].slug === s) valda[s] = true;
      }
    });
    return valda;
  }

  /* Distrikten skrivs i filens ordning, så att samma urval alltid ger
     samma adress. Inget markerat ger null, som tar bort parametern. */
  function distriktVarde(fil, valda) {
    var s = fil.distrikt.filter(function (d) { return valda[d.slug]; })
      .map(function (d) { return d.slug; });
    if (!s.length) return null;
    if (s.length === fil.distrikt.length) return "alla";
    return s.join(",");
  }

  /* Partierna står i adressen med K.slug av sin kod. Okända hoppas
     över. Blir ingenting kvar gäller förvalet: de `max` största
     partierna i det senaste valet, i den ordning datafilen redan har. */
  function lasPartier(fil, varde, max) {
    var valda = {};
    if (varde) {
      varde.split(",").forEach(function (kod) {
        for (var i = 0; i < fil.partier.length; i++) {
          if (K.slug(fil.partier[i].kod) === kod) valda[fil.partier[i].kod] = true;
        }
      });
    }
    if (!Object.keys(valda).length) {
      fil.partier.slice(0, max).forEach(function (p) { valda[p.kod] = true; });
    }
    return valda;
  }

  function partierVarde(fil, valda) {
    var koder = fil.partier.filter(function (p) { return valda[p.kod]; })
      .map(function (p) { return K.slug(p.kod); });
    return koder.length ? koder.join(",") : null;
  }

  window.VALADRESS = {
    lasDistrikt: lasDistrikt,
    distriktVarde: distriktVarde,
    lasPartier: lasPartier,
    partierVarde: partierVarde
  };
})();
