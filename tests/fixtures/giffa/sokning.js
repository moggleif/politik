// Krav: K28 i KRAV.md, beslut 0018. Test: tests/test_sokning.js.
// Sökningen utan sidan: orden i det man skrivit och de poster i ett sökindex (sok.json) där
// varje ord finns. Poster där alla ord finns i det som söks först (traff) står först; de där
// något ord bara finns i texten märks iTexten. Urvalet i adressen (K22) gäller poster med
// orter, alltså Giffås ärenden. Sidan ritas av sokruta.js.
var Sokning = (function () {
  function orden(fraga) {
    return fraga.toLowerCase().split(/\s+/).filter(function (ord) { return ord; });
  }

  function har(text, ord) {
    return ord.every(function (o) { return text.indexOf(o) >= 0; });
  }

  function traffar(poster, ord) {
    var forst = [];
    var sedan = [];
    poster.forEach(function (post) {
      if (har(post.traff, ord)) forst.push({ post: post, iTexten: false });
      else if (har(post.traff + " " + (post.text || ""), ord)) sedan.push({ post: post, iTexten: true });
    });
    return forst.concat(sedan);
  }

  // Som i urval.js: en ort gäller bara om den finns, och i föreningen om en är vald.
  function urvalet(foreningar, forening, ort) {
    var vald = foreningar.hasOwnProperty(forening) ? forening : null;
    var orter = vald ? foreningar[vald] : [].concat.apply([], Object.keys(foreningar).map(function (f) {
      return foreningar[f];
    }));
    if (orter.indexOf(ort) >= 0) return { namn: ort, orter: [ort] };
    return vald ? { namn: vald, orter: orter } : null;
  }

  function iUrvalet(poster, urval) {
    if (!urval) return poster;
    return poster.filter(function (a) {
      return !a.orter || a.orter.some(function (o) { return urval.orter.indexOf(o) >= 0; });
    });
  }

  // Ordet som börjar först från och med plats, och det längsta om två börjar på samma plats.
  function forsta(sma, ord, plats) {
    var basta = null;
    ord.forEach(function (o) {
      var t = { start: sma.indexOf(o, plats), langd: o.length };
      if (t.start >= 0 && (!basta || fore(t, basta))) basta = t;
    });
    return basta;
  }

  function fore(t, annan) {
    return t.start < annan.start || (t.start === annan.start && t.langd > annan.langd);
  }

  // Texten i delar, [text, markerad], där orden är markerade.
  function delar(text, ord) {
    var sma = text.toLowerCase();
    var ut = [];
    var plats = 0;
    for (var t = forsta(sma, ord, 0); t; t = forsta(sma, ord, plats)) {
      if (t.start > plats) ut.push([text.slice(plats, t.start), false]);
      ut.push([text.slice(t.start, t.start + t.langd), true]);
      plats = t.start + t.langd;
    }
    if (plats < text.length) ut.push([text.slice(plats), false]);
    return ut;
  }

  function namnen(post, ord) {
    return (post.kallas || []).filter(function (namn) {
      return ord.some(function (o) { return namn.toLowerCase().indexOf(o) >= 0; });
    });
  }

  return {
    orden: orden, traffar: traffar, urvalet: urvalet, iUrvalet: iUrvalet, delar: delar, namnen: namnen
  };
})();
