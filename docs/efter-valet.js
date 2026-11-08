/* Efter valet — partiernas listor i nummerordning och vad platserna blev.
   Läser docs/data-efter-valet.json, byggd av scripts/build_efter_valet.py
   ur data/ (Valmyndighetens listor och valda, fullmäktiges och nämndernas
   protokoll).

   Sidans reglage är valet (ett val eller "alla") och partiet. Valen ligger i adressen
   (?val=2018&parti=m), så att en länk ger samma vy. Tabellen har en rad per
   plats på listan: plats, namn, KF, KSAU, KS, ordförande, vice ordförande.
   Ett grönt bock betyder att platsen blev ledamot i fullmäktige, KSAU eller
   KS; ett rött kryss att platsen inte blev något av det. */
(function () {
  "use strict";

  var K = window.KIS;
  var el = K.el;
  var esc = K.esc;

  var DATAFIL = "data-efter-valet.json";
  var data = null;

  var KON = { K: "kvinna", M: "man" };

  /* ---------- Cellerna ---------- */

  function ja() {
    return '<span class="ja" aria-hidden="true">✓</span><span class="dold">Ja</span>';
  }

  function nej() {
    return '<span class="nej" aria-hidden="true">✗</span><span class="dold">Nej</span>';
  }

  function vantar() {
    return '<span class="vantar" aria-hidden="true">·</span><span class="dold">Inte beslutat än</span>';
  }

  /* Namn och, när Valmyndigheten gallrat namnet, vad som är känt om platsen. */
  function namnCell(r) {
    if (r.namn) {
      var mark = r.namnSakerhet === "möjlig"
        ? ' <span class="osaker" title="Namnet är framtaget ur protokollen och är en möjlig, inte en säker, träff">(osäker)</span>'
        : "";
      return esc(r.namn) + mark;
    }
    var delar = [];
    if (r.uppgift) delar.push(r.uppgift);
    else if (r.alder !== null && r.alder !== undefined) delar.push(r.alder + " år");
    if (r.kon && KON[r.kon]) delar.push(KON[r.kon]);
    return '<span class="saknas">Namn saknas</span>' +
      (delar.length ? '<br><span class="liten">' + esc(delar.join(", ")) + "</span>" : "");
  }

  /* KS och KSAU: grön bock för ledamot (även ordförande och vice),
     "ersättare" som text. */
  function nivaCell(niva, vald, harUppdrag, status) {
    if (status === "ejBeslutat") return vantar();
    if (niva === "ledamot") return ja();
    if (niva === "ersättare") return '<span class="liten">ersättare</span>';
    return !vald && !harUppdrag ? nej() : "";
  }

  function organLista(lista, medOrdning) {
    return lista.map(function (u) {
      var t = esc(u.organ);
      if (medOrdning && u.ordning) t += ' <span class="liten">(' + esc(u.ordning) + ")</span>";
      if (u.senare) t += '<span class="senare" title="Syns först vid ett senare möte: ett byte under perioden"> *</span>';
      return t;
    }).join("<br>");
  }

  function postCell(lista, medOrdning, vald, harUppdrag, status) {
    if (status === "ejBeslutat") return vantar();
    if (lista.length) return organLista(lista, medOrdning);
    return !vald && !harUppdrag ? nej() : "";
  }

  function rad(r, status) {
    var harUppdrag = !!(r.ks || r.ksau || r.ordforande.length || r.vice.length);
    var inteAktuell = !r.vald && !harUppdrag && status !== "ejBeslutat";
    var kf = r.vald ? ja() : nej();
    return "<tr" + (inteAktuell ? ' class="inte-aktuell"' : "") + ">" +
      '<th scope="row" class="plats">' + r.plats + "</th>" +
      "<td>" + namnCell(r) + "</td>" +
      '<td class="mitt">' + kf + "</td>" +
      '<td class="mitt">' + nivaCell(r.ksau, r.vald, harUppdrag, status) + "</td>" +
      '<td class="mitt">' + nivaCell(r.ks, r.vald, harUppdrag, status) + "</td>" +
      "<td>" + postCell(r.ordforande, false, r.vald, harUppdrag, status) + "</td>" +
      "<td>" + postCell(r.vice, true, r.vald, harUppdrag, status) + "</td></tr>";
  }

  /* ---------- Ett parti ---------- */

  function utanPlatsLista(p) {
    if (!p.utanPlats || !p.utanPlats.length) return "";
    var poster = p.utanPlats.map(function (q) {
      var delar = [];
      if (q.ks) delar.push("KS" + (q.ks === "ersättare" ? " (ersättare)" : ""));
      if (q.ksau) delar.push("KSAU" + (q.ksau === "ersättare" ? " (ersättare)" : ""));
      if (q.ordforande.length) delar.push("ordförande: " + organLista(q.ordforande, false));
      if (q.vice.length) delar.push("vice ordförande: " + organLista(q.vice, true));
      return "<li>" + esc(q.namn) + " – " + (delar.join("; ") || "uppdrag saknas") + "</li>";
    }).join("");
    return '<p class="liten utan-plats-rubrik">Uppdrag för personer vars plats på listan inte är känd ' +
      "(de blev inte valda till fullmäktige, och platser utanför de valda saknar namn):</p>" +
      '<ul class="liten utan-plats">' + poster + "</ul>";
  }

  function ritaParti(p, v, medAr) {
    var status = v.uppdragStatus;
    var taggar = "<span class=\"tagg\">" + p.mandat + " mandat</span>";
    if (p.styrande) taggar += ' <span class="tagg tagg-styr">Styrande</span>';
    var rader = p.rader.map(function (r) { return rad(r, status); }).join("");
    var id = "rubrik-" + p.kod + "-" + v.ar;
    var rubrik = esc(p.namn) + (medAr ? " " + v.ar + " <small>(mandatperioden " + esc(v.mandatperiod) + ")</small>" : "");
    return '<section class="parti-sektion" aria-labelledby="' + esc(id) + '">' +
      '<h2 id="' + esc(id) + '">' + rubrik + " " + taggar + "</h2>" +
      (medAr ? '<p class="forklaring liten">' + forklaringVal(v) + "</p>" : "") +
      '<div class="kort"><div class="tabell-rull"><table class="efter-valet">' +
      '<caption class="dold">' + esc(p.namn) + " " + v.ar + ": listan i nummerordning, med vad varje plats blev</caption>" +
      "<thead><tr>" +
      '<th scope="col" class="plats">Plats</th><th scope="col">Namn</th>' +
      '<th scope="col" class="mitt">KF</th><th scope="col" class="mitt">KSAU</th>' +
      '<th scope="col" class="mitt">KS</th><th scope="col">Ordförande</th>' +
      '<th scope="col">Vice ordförande</th></tr></thead><tbody>' + rader + "</tbody></table></div>" +
      utanPlatsLista(p) + "</div></section>";
  }

  /* ---------- Sidan ---------- */

  /* Valda val: ett, eller alla (nyast först) när reglaget står på "alla". */
  function valda() {
    var ar = el("val-valjare").value;
    if (ar === "alla") return data.val;
    return [data.val.filter(function (v) { return String(v.ar) === ar; })[0] || data.val[0]];
  }

  function textStyre(v) {
    if (!v.styre) {
      return "Styret för " + esc(v.mandatperiod) + " är inte bildat än, så partierna står i storleksordning efter antal mandat.";
    }
    var namn = v.styre.partier.map(function (k) {
      var p = v.partier.filter(function (q) { return q.kod === k; })[0];
      return p ? p.namn : k;
    });
    return "Styrande partier (" + esc(namn.join(", ")) + ") står först, därefter övriga; inom varje grupp efter antal mandat. " +
      (v.styre.styrkt ? "Uppgiften om styret är styrkt av en fristående källa." :
        "Uppgiften om styret är inte styrkt i en fristående källa (se längst ned).");
  }

  function forklaringVal(v) {
    var t = "<strong>Valet " + v.ar + "</strong> gäller mandatperioden " + esc(v.mandatperiod) + ". ";
    if (v.uppdragStatus === "komplett") {
      t += "Uppdragen kommer ur fullmäktiges beslut om vilka som valdes. ";
    } else if (v.uppdragStatus === "partiell") {
      t += "Fullmäktiges beslut saknas för den här perioden, så uppdragen är bara delvis kartlagda ur nämndernas " +
        "närvarolistor: <strong>en tom ruta betyder &quot;inte funnet&quot;, inte &quot;nej&quot;</strong>, och ersättare saknas. ";
    } else {
      t += "KS, KSAU och nämnder för perioden väljs av fullmäktige i december 2026, så uppdragen är inte beslutade än. ";
    }
    return t + textStyre(v);
  }

  function teckenforklaring(v, flera) {
    var t = '<span class="ja" aria-hidden="true">✓</span> = ledamot (i fullmäktige, KSAU eller KS). ' +
      '<span class="nej" aria-hidden="true">✗</span> = inte aktuell: platsen blev inget av det. ' +
      "Ordförande och vice ordförande anger organet; (1:e) och (2:e) är första och andra vice ordförande. ";
    if (flera) {
      t += '<span class="vantar" aria-hidden="true">·</span> = inte beslutat än (2026). ' +
        '<span class="senare">*</span> = syns först vid ett senare möte (2018 och 2010). ';
    }
    if (!flera && v.uppdragStatus === "ejBeslutat") t += '<span class="vantar" aria-hidden="true">·</span> = inte beslutat än. ';
    if (!flera && v.uppdragStatus === "partiell") t += '<span class="senare">*</span> = syns först vid ett senare möte (ett byte under perioden). ';
    t += "<em>(osäker)</em> efter ett namn betyder att Valmyndigheten gallrat namnet och att det är framtaget ur protokollen med en möjlig, inte säker, träff.";
    return t;
  }

  function ritaOm() {
    var vv = valda();
    var flera = vv.length > 1;
    var parti = el("parti-valjare").value;
    el("val-forklaring").innerHTML = flera
      ? "Alla fem val, det senaste först. Varje val har sin egen förklaring över tabellen; " +
        "<strong>2018 och 2010 är bara delvis kartlagda, och där betyder en tom ruta &quot;inte funnet&quot;, inte &quot;nej&quot;</strong>. " +
        "Uppdragen för valet 2026 är inte beslutade än."
      : forklaringVal(vv[0]);
    el("teckenforklaring").innerHTML = teckenforklaring(vv[0], flera);
    var ut = "";
    vv.forEach(function (v) {
      v.partier.filter(function (p) { return parti === "alla" || p.kod === parti; })
        .forEach(function (p) { ut += ritaParti(p, v, flera); });
    });
    el("sektion-partier").innerHTML = ut || "<p>Partiet ställde inte upp i det här valet.</p>";
  }

  function fyllReglage() {
    var vv = el("val-valjare");
    data.val.forEach(function (v) {
      var o = document.createElement("option");
      o.value = String(v.ar);
      o.textContent = v.ar + " (mandatperioden " + v.mandatperiod + ")";
      vv.appendChild(o);
    });
    var allaVal = document.createElement("option");
    allaVal.value = "alla";
    allaVal.textContent = "Alla val (ett parti i taget)";
    vv.appendChild(allaVal);
    vv.value = "2022";
    var pv = el("parti-valjare");
    var alla = document.createElement("option");
    alla.value = "alla";
    alla.textContent = "Alla partier";
    pv.appendChild(alla);
    var sett = {};
    var unika = [];
    data.val.forEach(function (v) {
      v.partier.forEach(function (p) {
        if (!sett[p.kod]) { sett[p.kod] = true; unika.push(p); }
      });
    });
    unika.sort(function (a, b) { return a.namn < b.namn ? -1 : 1; }).forEach(function (p) {
      var o = document.createElement("option");
      o.value = p.kod;
      o.textContent = p.namn;
      pv.appendChild(o);
    });
  }

  function omSidan() {
    var styre = data.val.map(function (v) {
      if (!v.styre) return "<li><strong>" + esc(v.mandatperiod) + ":</strong> styret inte bildat än.</li>";
      return "<li><strong>" + esc(v.mandatperiod) + ":</strong> " + esc(v.styre.partier.join(", ")) + ". " +
        esc(v.styre.kalla) + (v.styre.url ? ' <a href="' + K.sakerUrl(v.styre.url) + '">Källa</a>' : "") + "</li>";
    }).join("");
    el("om-sidan-innehall").innerHTML =
      "<h2>Så är sidan gjord</h2>" +
      "<p><strong>Listorna</strong> (plats och, för 2022 och 2026, namn) kommer från Valmyndighetens valpresentation. " +
      "För 2010, 2014 och 2018 har Valmyndigheten gallrat namnen; kvar finns plats, ålder, kön och yrke/ort.</p>" +
      "<p><strong>Vilka som blev ledamöter</strong> kommer ur Valmyndighetens fil över de ursprungligen valda.</p>" +
      "<p><strong>Namnen för 2010&ndash;2018</strong> är framtagna genom att länka samma person mellan valen (ålder, ort, yrke) och mot " +
      "fullmäktiges närvarologg. De flesta bygger på att loggen listar ledamöterna i en bestämd ordning " +
      "(2014: stämmer för alla 38 kända namn; 2018 och 2010: för nästan alla). Ersättare som tagit över en plats syns inte som valda. " +
      "Där ett namn är en möjlig men inte säker träff står <em>(osäker)</em>. Namn som inte gått att få fram står som &quot;Namn saknas&quot;.</p>" +
      "<p><strong>Uppdragen</strong> (KS, KSAU, ordförande och vice ordförande) kommer 2014 och 2022 ur fullmäktiges och kommunstyrelsens beslut. " +
      "För 2010 och 2018 saknas besluten i arkivet, och uppdragen är hämtade ur närvarolistorna i de första protokollen med text per organ. " +
      "Övriga poster (revisorer, bolag, nämndledamöter) ingår inte.</p>" +
      "<p><strong>Styrande partier:</strong></p><ul>" + styre + "</ul>" +
      "<p><strong>Luckor.</strong> 2018 saknar fullmäktiges decembermöte och 2010 flera nämnder, så uppdragsraderna är där ofullständiga. " +
      "Fyra platser (2018) och fyra (2010) hade en ersättare som tagit över, och namnet på den som valdes är okänt.</p>" +
      "<p>Allt är öppet: <a href=\"https://github.com/moggleif/politik/blob/main/data/KALLOR.md\">data/KALLOR.md</a> på GitHub beskriver varje källa och " +
      "varje beslut, och <a href=\"https://github.com/moggleif/politik\">koden och alla data</a> finns där.</p>" +
      "<p class=\"liten\">Sidan drar inga slutsatser och är fristående från Kungsbacka kommun.</p>";
  }

  function start(d) {
    data = d;
    fyllReglage();
    K.kopplaValjare(el("val-valjare"), "val", ritaOm);
    K.kopplaValjare(el("parti-valjare"), "parti", ritaOm);
    ritaOm();
    omSidan();
    el("sektion-reglage").hidden = false;
    el("sektion-partier").hidden = false;
    el("om-sidan").hidden = false;
  }

  K.starta(DATAFIL, { init: start });
})();
