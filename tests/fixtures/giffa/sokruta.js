// Krav: K28 i KRAV.md, beslut 0018. Test: tests/test_sokruta.js.
// Knappen Sök i sajtraden fäller ut sökfältet under raden. sajter.js laddar skriptet när
// sajtraden finns. Första gången hämtas varje sajts sok.json, där sajtradens länk pekar, och
// träffarna ritas medan man skriver: sajt för sajt, den här först, och grupp för grupp.
// Urvalet i adressen gäller Giffås ärenden. Escape eller knappen fäller ihop fältet. På en
// sida med data-sok-oppen, som Giffås sida Sök, är fältet utfällt från början.
(function () {
  var MINST = 2;
  var VISAS = 20;

  function element(tagg, attribut, text) {
    var e = document.createElement(tagg);
    Object.keys(attribut).forEach(function (namn) { e.setAttribute(namn, attribut[namn]); });
    if (text) e.textContent = text;
    return e;
  }

  function sajterna() {
    var lankar = document.querySelector(".sajtrad").querySelectorAll("a");
    lankar = Array.prototype.slice.call(lankar);
    return lankar.map(function (a) {
      return { namn: a.textContent, adress: a.getAttribute("href"), denna: a.getAttribute("aria-current") !== null };
    }).sort(function (a, b) { return Number(b.denna) - Number(a.denna); });
  }

  function markerad(lank, text, ord) {
    Sokning.delar(text, ord).forEach(function (del) {
      lank.appendChild(del[1] ? element("mark", {}, del[0]) : document.createTextNode(del[0]));
    });
    return lank;
  }

  // Ett ärende på Giffå behåller urvalet i adressen när man står på Giffå.
  function rad(traff, sajt, ord) {
    var post = traff.post;
    var adress = new URL(post.adress, sajt.adress + "sok.json").href;
    var namn = Sokning.namnen(post, ord).map(function (n) { return "uppmärksammat som " + n; });
    var om = post.om.concat(namn, traff.iTexten ? ["nämns i texten"] : []);
    var li = element("li", {});
    if (post.orter && sajt.denna) adress += location.search;
    li.appendChild(markerad(element("a", { href: adress }), post.rubrik, ord));
    li.appendChild(element("small", {}, om.join(" · ")));
    return li;
  }

  function lista(ul, traffar, ritaRad) {
    traffar.forEach(function (t) { ul.appendChild(ritaRad(t)); });
  }

  // De första träffarna står direkt och resten bakom en knapp, så att ett vanligt ord inte
  // ritar tusentals.
  function grupp(ruta, rubrik, traffar, ritaRad) {
    ruta.appendChild(element("h3", {}, rubrik + " (" + traffar.length + ")"));
    var ul = ruta.appendChild(element("ul", {}));
    lista(ul, traffar.slice(0, VISAS), ritaRad);
    if (traffar.length <= VISAS) return;
    var knapp = element("button", { type: "button", "class": "visa-alla" }, "Visa alla " + traffar.length);
    ruta.appendChild(knapp);
    knapp.addEventListener("click", function () {
      lista(ul, traffar.slice(VISAS), ritaRad);
      knapp.parentNode.removeChild(knapp);
    });
  }

  function urvalet(index) {
    var fraga = new URLSearchParams(location.search);
    if (!index.foreningar) return null;
    return Sokning.urvalet(index.foreningar, fraga.get("forening"), fraga.get("ort"));
  }

  function grupperna(sajt, ord) {
    var urval = urvalet(sajt.index);
    return sajt.index.grupper.map(function (g) {
      var traffar = Sokning.traffar(Sokning.iUrvalet(g.poster, urval), ord);
      var iUrval = urval && g.poster.some(function (p) { return p.orter; });
      return { rubrik: iUrval ? g.rubrik + " i " + urval.namn : g.rubrik, traffar: traffar };
    }).filter(function (g) { return g.traffar.length; });
  }

  // En sajt vars index inte gick att hämta, eller inte hämtats än, sägs med en rad.
  function ritaSajt(resultat, sajt, ord) {
    if (!sajt.index) {
      var text = sajt.fel ? "Gick inte att söka i " + sajt.namn + "." : "Söker i " + sajt.namn + " …";
      resultat.appendChild(element("p", { "class": "sokrad" }, text));
      return 0;
    }
    var grupper = grupperna(sajt, ord);
    if (!grupper.length) return 0;
    var ritaRad = function (t) { return rad(t, sajt, ord); };
    resultat.appendChild(element("h2", {}, sajt.namn));
    grupper.forEach(function (g) { grupp(resultat, g.rubrik, g.traffar, ritaRad); });
    return grupper.reduce(function (summa, g) { return summa + g.traffar.length; }, 0);
  }

  function rita(panel, sajter) {
    var resultat = panel.querySelector(".sokresultat");
    var status = panel.querySelector("[role=status]");
    var ord = Sokning.orden(panel.querySelector("input").value);
    resultat.textContent = "";
    status.textContent = "";
    if (ord.join("").length < MINST) return;
    var antal = sajter.reduce(function (summa, sajt) { return summa + ritaSajt(resultat, sajt, ord); }, 0);
    var klara = sajter.every(function (sajt) { return sajt.index || sajt.fel; });
    if (antal) status.textContent = antal + (antal === 1 ? " träff" : " träffar");
    else if (klara) status.textContent = "Inga träffar.";
    status.className = antal ? "dold" : "";
  }

  function ladda(panel, sajter) {
    sajter.forEach(function (sajt) {
      if (sajt.index || sajt.laddas) return;
      sajt.laddas = true;
      sajt.fel = false;
      fetch(sajt.adress + "sok.json").then(function (svar) {
        if (!svar.ok) throw new Error(sajt.adress + "sok.json: " + svar.status);
        return svar.json();
      }).then(function (index) { sajt.index = index; }, function () { sajt.fel = true; })
        .then(function () {
          sajt.laddas = false;
          rita(panel, sajter);
        });
    });
  }

  function panelen(sajter) {
    var panel = element("div", { id: "sokpanel", "class": "sokpanel", role: "search" });
    panel.hidden = true;
    panel.appendChild(element("label", { "for": "sokfalt", "class": "dold" }, "Sök på sajterna"));
    var falt = panel.appendChild(element("input", {
      id: "sokfalt", type: "search", autocomplete: "off", placeholder: "Sök på alla sajterna"
    }));
    panel.appendChild(element("p", { role: "status" }));
    panel.appendChild(element("div", { "class": "sokresultat" }));
    falt.addEventListener("input", function () { rita(panel, sajter); });
    return panel;
  }

  function vaxla(knapp, panel, sajter, oppen) {
    knapp.setAttribute("aria-expanded", String(oppen));
    panel.hidden = !oppen;
    if (!oppen) return;
    ladda(panel, sajter);
    rita(panel, sajter);
  }

  var sajter = sajterna();
  var sajtrad = document.querySelector(".sajtrad").querySelector("div");
  var meny = document.querySelector(".sajtmeny");
  var knapp = element("button", {
    type: "button", "class": "sokknapp", "aria-expanded": "false", "aria-controls": "sokpanel"
  }, "Sök");
  var panel = panelen(sajter);
  sajtrad.insertBefore(knapp, sajtrad.querySelector(".temaknapp") || sajtrad.querySelector(".menyknapp"));
  meny.parentNode.insertBefore(panel, meny);
  knapp.addEventListener("click", function () {
    vaxla(knapp, panel, sajter, panel.hidden);
    if (!panel.hidden) panel.querySelector("input").focus();
  });
  // Escape stänger bara fältet; sajter.js ska inte också stänga menyn och flytta fokus dit.
  panel.addEventListener("keydown", function (h) {
    if (h.key !== "Escape") return;
    h.stopPropagation();
    vaxla(knapp, panel, sajter, false);
    knapp.focus();
  });
  if (document.querySelector("[data-sok-oppen]")) vaxla(knapp, panel, sajter, true);
})();
