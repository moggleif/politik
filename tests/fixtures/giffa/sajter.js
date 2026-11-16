// Krav: K35 i KRAV.md, beslut 0013. Test: tests/test_sajter.js.
// Projektets sajter laddar det här skriptet och sajter.css från Giffå. Skriptet lägger
// sajtraden före sajtens egen meny (.sajtmeny), fäller ihop menyn bakom en knapp på smal
// skärm och låter bara en undermeny vara öppen åt gången. Utan skriptet står menyn som en lista.
(function () {
  var VARD = "https://moggleif.github.io";
  var SAJTER = [
    ["/giffa/", "Giffå"],
    ["/kungsbackakommun/", "Kungsbacka kommun"],
    ["/politik/", "Kungsbacka i siffror"]
  ];

  function alla(valjare, rot) {
    return Array.prototype.slice.call(rot.querySelectorAll(valjare));
  }

  function element(tagg, attribut, text) {
    var e = document.createElement(tagg);
    Object.keys(attribut).forEach(function (namn) { e.setAttribute(namn, attribut[namn]); });
    if (text) e.textContent = text;
    return e;
  }

  function sajtrad(sokvag) {
    var lista = element("ul", {});
    SAJTER.forEach(function (sajt) {
      var lank = element("a", { href: VARD + sajt[0] }, sajt[1]);
      if (sokvag.indexOf(sajt[0]) === 0) lank.setAttribute("aria-current", "true");
      lista.appendChild(element("li", {})).appendChild(lank);
    });
    var rad = element("nav", { "class": "sajtrad", "aria-label": "Sajterna" });
    rad.appendChild(lista);
    return rad;
  }

  function menyknapp(meny) {
    var knapp = element("button", { type: "button", "class": "menyknapp", "aria-expanded": "false" }, "Meny");
    knapp.addEventListener("click", function () {
      var oppen = knapp.getAttribute("aria-expanded") !== "true";
      knapp.setAttribute("aria-expanded", String(oppen));
      meny.classList.toggle("oppen", oppen);
    });
    meny.classList.add("har-knapp");
    meny.insertBefore(knapp, meny.querySelector("ul"));
    return knapp;
  }

  function stang(undermenyer, utom) {
    undermenyer.forEach(function (d) { if (d !== utom) d.open = false; });
  }

  // Escape stänger den öppna undermenyn, annars den utfällda menyn, och lämnar fokus
  // på knappen som öppnade den.
  function escape(lista, knapp) {
    var oppen = lista.filter(function (d) { return d.open; })[0];
    if (oppen) {
      oppen.open = false;
      oppen.querySelector("summary").focus();
    } else if (knapp.getAttribute("aria-expanded") === "true") {
      knapp.click();
      knapp.focus();
    }
  }

  function undermenyer(meny, knapp) {
    var lista = alla("details", meny);
    lista.forEach(function (d) {
      if (d.querySelector("[aria-current]")) d.classList.add("aktuell");
      d.addEventListener("toggle", function () { if (d.open) stang(lista, d); });
    });
    document.addEventListener("keydown", function (h) { if (h.key === "Escape") escape(lista, knapp); });
    document.addEventListener("click", function (h) { if (!meny.contains(h.target)) stang(lista, null); });
    meny.addEventListener("focusout", function (h) {
      if (!h.relatedTarget || !meny.contains(h.relatedTarget)) stang(lista, null);
    });
  }

  // Varje sida som laddar skriptet har en .sajtmeny (K35).
  var meny = document.querySelector(".sajtmeny");
  meny.parentNode.insertBefore(sajtrad(location.pathname), meny);
  undermenyer(meny, menyknapp(meny));
})();
