// Krav: K35 i KRAV.md, beslut 0013 och 0014. Test: tests/test_sajter.js.
// Projektets sajter laddar det här skriptet och sajter.css från Giffå. Skriptet lägger
// sajtraden före sajtens egen meny (.sajtmeny) och knappen Meny i sajtraden, så att sajtens
// namn bara står där. Det låter bara en undermeny vara öppen åt gången. Utan skriptet står
// menyn som en lista med sajtens namn först.
(function () {
  var VARD = "https://moggleif.github.io";
  var SAJTER = [
    ["/giffa/", "Giffå"],
    ["/kungsbackakommun/", "Kungsbacka kommun"],
    ["/politik/", "Kungsbacka i siffror"],
    ["/regionhalland/", "Region Halland"]
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

  function lista(sajter, sokvag) {
    var ul = element("ul", {});
    sajter.forEach(function (sajt) {
      var li = ul.appendChild(element("li", {}));
      var lank = li.appendChild(element("a", { href: VARD + sajt[0] }, sajt[1]));
      if (sokvag.indexOf(sajt[0]) === 0) {
        lank.setAttribute("aria-current", "true");
        li.classList.add("denna");
      }
    });
    return ul;
  }

  function sajtrad(sokvag) {
    var rad = element("nav", { "class": "sajtrad", "aria-label": "Sajterna" });
    rad.appendChild(element("div", {})).appendChild(lista(SAJTER, sokvag));
    return rad;
  }

  // På smal skärm visar sajtraden bara den här sajten, med knappen bredvid. De andra
  // sajterna står då sist i den utfällda menyn.
  function andraSajter(meny, sokvag) {
    var andra = SAJTER.filter(function (sajt) { return sokvag.indexOf(sajt[0]) !== 0; });
    var li = element("li", { "class": "andra-sajter" });
    li.appendChild(element("p", { "class": "grupp" }, "Projektets andra sajter"));
    li.appendChild(lista(andra, sokvag));
    meny.querySelector("ul").appendChild(li);
  }

  function menyknapp(meny, rad) {
    var knapp = element("button", { type: "button", "class": "menyknapp", "aria-expanded": "false" }, "Meny");
    knapp.addEventListener("click", function () {
      var oppen = knapp.getAttribute("aria-expanded") !== "true";
      knapp.setAttribute("aria-expanded", String(oppen));
      meny.classList.toggle("oppen", oppen);
    });
    meny.classList.add("har-knapp");
    rad.querySelector("div").appendChild(knapp);
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
  var rad = sajtrad(location.pathname);
  meny.parentNode.insertBefore(rad, meny);
  andraSajter(meny, location.pathname);
  undermenyer(meny, menyknapp(meny, rad));
})();
