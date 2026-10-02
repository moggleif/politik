/* Riksdagspartiernas röda linjer i regeringsfrågan — en matris över två
   frågor: I regering, och Samarbeta (rösta ja till och stödja en
   regering som innehåller det andra partiet).
   Läser docs/data-rodalinjer.json, byggd av scripts/build_rodalinjer.py
   ur data/rodalinjer/besked.json.

   Sidan har inga reglage och inga diagram: matrisen är tabellen. Ett
   svar bärs av tecken och ord, inte av färgen – rutans bakgrund är
   bara en förstärkning. */
(function () {
  "use strict";

  var K = window.KIS;
  var el = K.el;
  var esc = K.esc;
  var talSv = K.talSv;

  var DATAFIL = "data-rodalinjer.json";

  var MANAD = ["januari", "februari", "mars", "april", "maj", "juni", "juli",
               "augusti", "september", "oktober", "november", "december"];

  var TECKEN = { ja: "✓", nej: "✗", oklart: "?" };
  var ORD = { ja: "Ja", nej: "Nej", oklart: "Oklart" };

  var data = null;

  function datumSv(iso) {
    if (!iso) return "datum saknas";
    var d = String(iso).split("-");
    return parseInt(d[2], 10) + " " + MANAD[parseInt(d[1], 10) - 1] + " " + d[0];
  }

  function parti(kod) {
    return data.partier.filter(function (p) { return p.kod === kod; })[0];
  }

  function cell(fraga, p, om) {
    return data.celler.filter(function (c) {
      return c.fraga === fraga && c.parti === p && c.om === om;
    })[0];
  }

  /* Fotnoten till en källa: ett nummer som länkar till källistan. */
  function fotnoter(nr) {
    return nr.map(function (n) {
      return '<a class="fotnot" href="#kalla-' + esc(n) + '" aria-label="Källa ' +
        esc(n) + '">[' + esc(n) + "]</a>";
    }).join("");
  }

  function ruta(c) {
    var p = parti(c.parti), om = parti(c.om);
    var etikett = p.namn + " om " + om.namn + ": " + ORD[c.svar].toLowerCase();
    var html = '<td class="matris-' + esc(c.svar) + '" title="' + esc(etikett) + '">' +
      '<span class="matris-tecken" aria-hidden="true">' + TECKEN[c.svar] + "</span> " +
      '<span class="matris-ord">' + ORD[c.svar] + "</span>";
    if (c.kallor.length) html += " " + fotnoter(c.kallor);
    if (c["not"]) html += '<span class="matris-stjarna" aria-hidden="true">*</span>';
    return html + "</td>";
  }

  /* Anmärkningarna under matrisen: villkoren som hör till ett svar.
     Stjärnan i rutan syns bara för ögat; läsprogrammet får texten här. */
  function ritaNoter(fraga) {
    var noter = data.celler.filter(function (c) {
      return c.fraga === fraga && c["not"];
    });
    el("noter-" + fraga).innerHTML = noter.map(function (c) {
      return "<li>* " + esc(parti(c.parti).kort) + " om " + esc(parti(c.om).kort) +
        ": " + esc(c["not"]) + "</li>";
    }).join("");
    el("noter-" + fraga).hidden = !noter.length;
  }

  function ritaMatris(fraga) {
    var kolumner = data.partier.map(function (p) {
      return '<th scope="col"><abbr title="' + esc(p.namn) + '">' + esc(p.kort) + "</abbr></th>";
    }).join("");
    var rader = data.partier.map(function (p) {
      var rad = '<tr><th scope="row"><abbr title="' + esc(p.namn) + '">' + esc(p.kort) + "</abbr></th>";
      data.partier.forEach(function (om) {
        rad += p.kod === om.kod
          ? '<td class="matris-sjalv"><span aria-hidden="true">–</span>' +
            '<span class="dold">Samma parti</span></td>'
          : ruta(cell(fraga, p.kod, om.kod));
      });
      return rad + "</tr>";
    }).join("");
    el("matris-" + fraga).innerHTML =
      '<caption class="dold">Rad: partiet som svarar. Kolumn: partiet frågan gäller.</caption>' +
      '<thead><tr><th scope="col"><span class="dold">Parti</span>' +
      '<span aria-hidden="true">Rad ↓ om kolumn →</span></th>' +
      kolumner + "</tr></thead><tbody>" + rader + "</tbody>";
  }

  function kortSagt() {
    var punkter = [];
    data.fragor.forEach(function (f) {
      var a = data.antal[f.id];
      punkter.push("<strong>" + esc(f.rubrik) + ":</strong> " +
        talSv(a.ja) + " ja, " + talSv(a.nej) + " nej och " +
        talSv(a.oklart) + " oklara av " +
        talSv(a.ja + a.nej + a.oklart) + " möjliga svar.");
    });
    K.visaKortSagt(punkter);
  }

  function visaKallor() {
    el("lista-kallor").innerHTML = data.kallor.map(function (k) {
      var html = K.kallpost({
        titel: "[" + k.nr + "] " + k.rubrik,
        detalj: k.utgivare + ", " + datumSv(k.datum) + ". " + k.anmarkning,
        lankar: [[k.url, "Läs källan"]]
      });
      return html.replace("<li>", '<li id="kalla-' + esc(k.nr) + '">');
    }).join("");
  }

  function start(inlast) {
    data = inlast;

    K.visaMeta({
      kalla: "Partiernas uttalanden, med länk till varje källa",
      senaste: datumSv(data.hamtad),
      hamtad: datumSv(data.hamtad)
    });

    K.sattDataNot("not-lage", "<p>" + esc(data.lage) + "</p>");

    data.fragor.forEach(function (f) {
      el("fraga-" + f.id).textContent = f.fraga;
      ritaMatris(f.id);
      ritaNoter(f.id);
      el("sektion-" + f.id).hidden = false;
    });
    kortSagt();
    visaKallor();
    ["kallor", "om"].forEach(function (id) { el("sektion-" + id).hidden = false; });
    el("om-uppdaterad").textContent = "Beskeden samlades " + datumSv(data.hamtad) + ".";
  }

  K.starta(DATAFIL, { init: start });
})();
