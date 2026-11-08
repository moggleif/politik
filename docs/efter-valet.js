/* Efter valet — partiernas listor i nummerordning och vad platserna blev.
   Läser docs/data-efter-valet.json, byggd av scripts/build_efter_valet.py
   ur data/ (Valmyndighetens listor och valda, fullmäktiges och nämndernas
   protokoll).

   Sidans reglage är valet (ett val eller "alla") och partiet. Valen ligger i adressen
   (?val=2018&parti=m), så att en länk ger samma vy. Tabellen har en rad per
   plats på listan: plats, namn, KF, KSAU, KS, ordförande, vice ordförande.
   Ett grönt bock betyder att platsen blev ledamot i fullmäktige, KSAU eller
   KS; ett rött kryss att platsen inte blev något av det.

   När ett parti är valt ritas dessutom en platskarta (SVG byggd här, utan
   Chart.js): ett val per rad, en glyf per plats, så att man ser var på
   listan uppdragen hamnade, och under den en lista i text med samma sak. */
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

  /* Namn, orten där Valmyndigheten angav den, och, när namnet gallrats, vad som är känt om platsen. */
  function namnCell(r) {
    if (r.namn) {
      var mark = r.namnSakerhet === "möjlig"
        ? ' <span class="osaker" title="Namnet är framtaget ur protokollen och är en möjlig, inte en säker, träff">(osäker)</span>'
        : "";
      return esc(r.namn) + mark + (r.ort ? '<br><span class="liten">' + esc(r.ort) + "</span>" : "");
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

  /* KF: bock för ledamot, "ersättare N" (ersättarordningen) där Valmyndigheten
     har ersättarna (2022 och 2026), annars kryss. */
  function kfCell(r) {
    if (r.vald) return ja();
    if (r.kfErsattare) return '<span class="liten">ersättare ' + r.kfErsattare + "</span>";
    return nej();
  }

  function rad(r, status) {
    var harUppdrag = !!(r.ks || r.ksau || r.ordforande.length || r.vice.length);
    var inteAktuell = !r.vald && !r.kfErsattare && !harUppdrag && status !== "ejBeslutat";
    var kf = kfCell(r);
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

  /* ---------- Platskartan: ett parti, alla val ---------- */

  var PK = { steg: 16, vanster: 58, radh: 44, topp: 14 };

  function platsText(r) {
    var delar = [];
    if (r.vald) delar.push("ledamot i fullmäktige");
    else if (r.kfErsattare) delar.push("ersättare " + r.kfErsattare + " i fullmäktige");
    if (r.ksau) delar.push(r.ksau === "ledamot" ? "KSAU" : "ersättare i KSAU");
    if (r.ks) delar.push(r.ks === "ledamot" ? "KS" : "ersättare i KS");
    r.ordforande.forEach(function (u) { delar.push("ordförande " + u.organ); });
    r.vice.forEach(function (u) { delar.push((u.ordning ? u.ordning + " " : "") + "vice ordförande " + u.organ); });
    return "Plats " + r.plats + (r.namn ? ", " + r.namn : "") + ": " + (delar.join(", ") || "inget av uppdragen");
  }

  /* En plats i kartan: ring = plats på listan, fylld = ledamot i fullmäktige,
     streckad = ersättare i fullmäktige; fyrkant = KS (streckad = ersättare),
     romb = KSAU, triangel uppåt = ordförande, triangel nedåt = vice ordförande.
     Varje form har sin egen färgklass, men formen bär informationen. */
  function platsGlyf(r, x, y) {
    var g = '<g class="pk-plats"><title>' + esc(platsText(r)) + "</title>";
    if (r.ks) g += '<rect class="pk-ks' + (r.ks === "ersättare" ? " pk-ers" : "") + '" x="' + (x - 6.5) + '" y="' + (y - 6.5) + '" width="13" height="13"/>';
    if (r.ksau) g += '<path class="pk-ksau' + (r.ksau === "ersättare" ? " pk-ers" : "") + '" d="M' + x + " " + (y - 9) + "L" + (x + 9) + " " + y + "L" + x + " " + (y + 9) + "L" + (x - 9) + " " + y + 'Z"/>';
    if (r.ordforande.length) g += '<path class="pk-ordf" d="M' + x + " " + (y - 16) + "l4.5 7h-9z" + '"/>';
    if (r.vice.length) g += '<path class="pk-vice" d="M' + x + " " + (y + 16) + "l4.5 -7h-9z" + '"/>';
    var kf = r.vald ? "pk-kf" : (r.kfErsattare ? "pk-kf-ers" : "pk-tom");
    g += '<circle class="' + kf + '" cx="' + x + '" cy="' + y + '" r="3.5"/>';
    return g + "</g>";
  }

  function kartRad(v, p, i) {
    var y = PK.topp + i * PK.radh + PK.radh / 2;
    var etikett = String(v.ar);
    var klass = "pk-rad";
    if (v.uppdragStatus === "partiell") { etikett += "*"; klass += " pk-delvis"; }
    if (v.uppdragStatus === "ejBeslutat") { etikett += "†"; klass += " pk-delvis"; }
    var ut = '<g class="' + klass + '"><text class="pk-ar" x="' + (PK.vanster - 10) + '" y="' + (y + 4) + '" text-anchor="end">' + etikett + "</text>";
    ut += '<line class="pk-linje" x1="' + PK.vanster + '" y1="' + y + '" x2="' + (PK.vanster + (p.rader.length - 1) * PK.steg) + '" y2="' + y + '"/>';
    p.rader.forEach(function (r, k) { ut += platsGlyf(r, PK.vanster + k * PK.steg, y); });
    return ut + "</g>";
  }

  function platskarta(kod) {
    var rader = data.val.map(function (v) {
      var p = v.partier.filter(function (q) { return q.kod === kod; })[0];
      return p ? { v: v, p: p } : null;
    }).filter(function (x) { return x; });
    if (!rader.length) return "";
    var maxN = Math.max.apply(null, rader.map(function (x) { return x.p.rader.length; }));
    var bredd = PK.vanster + (maxN - 1) * PK.steg + 16;
    var hojd = PK.topp + rader.length * PK.radh + 24;
    var svg = '<svg class="platskarta" width="' + bredd + '" height="' + hojd + '" viewBox="0 0 ' + bredd + " " + hojd + '" role="img" aria-labelledby="pk-titel">' +
      '<title id="pk-titel">' + esc(rader[0].p.namn) + ": platserna på listan och vad de blev, ett val per rad</title>";
    rader.forEach(function (x, i) { svg += kartRad(x.v, x.p, i); });
    var yAxel = PK.topp + rader.length * PK.radh + 14;
    for (var n = 1; n <= maxN; n += (n === 1 ? 4 : 5)) {
      svg += '<text class="pk-axel" x="' + (PK.vanster + (n - 1) * PK.steg) + '" y="' + yAxel + '" text-anchor="middle">' + n + "</text>";
    }
    svg += '<text class="pk-axel" x="' + (PK.vanster - 10) + '" y="' + yAxel + '" text-anchor="end">plats</text></svg>';
    return svg;
  }

  function kartforklaring() {
    function mini(inre) {
      return '<svg class="pk-mini" width="22" height="22" viewBox="-11 -11 22 22" aria-hidden="true">' + inre + "</svg>";
    }
    return '<p class="forklaring liten pk-forklaring">' +
      mini('<circle class="pk-tom" r="3.5"/>') + " plats på listan · " +
      mini('<circle class="pk-kf" r="3.5"/>') + " ledamot i fullmäktige · " +
      mini('<circle class="pk-kf-ers" r="3.5"/>') + " ersättare i fullmäktige (bara 2022 och 2026) · " +
      mini('<rect class="pk-ks" x="-6.5" y="-6.5" width="13" height="13"/><circle class="pk-kf" r="3.5"/>') + " KS · " +
      mini('<rect class="pk-ks pk-ers" x="-6.5" y="-6.5" width="13" height="13"/><circle class="pk-kf" r="3.5"/>') + " ersättare i KS · " +
      mini('<path class="pk-ksau" d="M0 -9L9 0L0 9L-9 0Z"/><circle class="pk-kf" r="3.5"/>') + " KSAU · " +
      mini('<path class="pk-ordf" d="M0 -9l4.5 7h-9z"/><circle class="pk-kf" r="3.5"/>') + " ordförande · " +
      mini('<path class="pk-vice" d="M0 9l4.5 -7h-9z"/><circle class="pk-kf" r="3.5"/>') + " vice ordförande. " +
      "* = delvis kartlagd ur närvarolistor (tomt är &quot;inte funnet&quot;); † = uppdragen inte beslutade än. " +
      "Peka på en plats för namn och uppdrag.</p>";
  }

  /* ---------- Listan under kartan: var på listan uppdragen hamnade ---------- */

  function platsord(r) {
    return r.plats + (r.namn ? " (" + esc(r.namn) + ")" : "");
  }

  function intervall(tal) {
    // [6,7,8,10] -> "6–8, 10"
    var ut = [], i = 0;
    while (i < tal.length) {
      var j = i;
      while (j + 1 < tal.length && tal[j + 1] === tal[j] + 1) j++;
      ut.push(j > i + 1 ? tal[i] + "–" + tal[j] : (j === i ? String(tal[i]) : tal[i] + ", " + tal[j]));
      i = j + 1;
    }
    return ut.join(", ");
  }

  function organRad(p, falt, namn) {
    var med = p.rader.filter(function (r) { return r[falt] === "ledamot"; });
    if (!med.length) return "<li><strong>" + namn + ":</strong> ingen på listan.</li>";
    var lagst = med[med.length - 1];
    var ovanfor = p.rader.filter(function (r) { return r.plats < lagst.plats && r[falt] !== "ledamot"; });
    var ers = ovanfor.filter(function (r) { return r[falt] === "ersättare"; }).map(function (r) { return r.plats; });
    var t = "<li><strong>" + namn + ":</strong> platserna " + intervall(med.map(function (r) { return r.plats; })) +
      ". Lägsta plats: " + platsord(lagst) + ". ";
    t += ovanfor.length
      ? "Platser ovanför den utan " + namn + ": " + intervall(ovanfor.map(function (r) { return r.plats; })) +
        (ers.length ? " (" + intervall(ers) + (ers.length > 1 ? " är ersättare" : " är ersättare") + " i " + namn + ")" : "") + "."
      : "Alla platser ovanför har också " + namn + ".";
    return t + "</li>";
  }

  function posterRad(p, falt, namn) {
    var med = p.rader.filter(function (r) { return r[falt].length; });
    if (!med.length) return "";
    return "<li><strong>" + namn + ":</strong> " + med.map(function (r) {
      return platsord(r) + " – " + r[falt].map(function (u) { return esc(u.organ) + (u.ordning ? " (" + esc(u.ordning) + ")" : ""); }).join(", ");
    }).join("; ") + ".</li>";
  }

  function utfallLista(kod) {
    return data.val.map(function (v) {
      var p = v.partier.filter(function (q) { return q.kod === kod; })[0];
      if (!p) return "";
      var kf = p.rader.filter(function (r) { return r.vald; }).map(function (r) { return r.plats; });
      var t = "<h3>" + v.ar + ' <small class="liten">(mandatperioden ' + esc(v.mandatperiod) + ")</small></h3><ul class=\"utfall\">";
      t += "<li><strong>Fullmäktige:</strong> platserna " + intervall(kf) + " (" + p.mandat + " mandat).</li>";
      if (v.uppdragStatus === "ejBeslutat") {
        t += "<li>KS, KSAU och nämnder väljs av fullmäktige i december 2026 och är inte beslutade än.</li>";
      } else {
        if (v.uppdragStatus === "partiell") {
          var d = v.protokollDatum || {};
          t += '<li class="liten">Delvis kartlagd ur närvarolistor: KS enligt protokollet ' + esc(d.KS || "saknas") +
            ", KSAU " + esc(d.KSAU || "saknas") + ". Platser som inte syns där är &quot;inte funna&quot;, inte &quot;nej&quot;.</li>";
        }
        t += organRad(p, "ks", "KS") + organRad(p, "ksau", "KSAU") +
          posterRad(p, "ordforande", "Ordförande") + posterRad(p, "vice", "Vice ordförande");
      }
      return t + "</ul>";
    }).join("");
  }

  function ritaPlatskarta(kod) {
    var sekt = el("sektion-platskarta");
    if (!kod || kod === "alla") { sekt.hidden = true; return; }
    var namn = "";
    data.val.forEach(function (v) {
      v.partier.forEach(function (p) { if (p.kod === kod) namn = p.namn; });
    });
    el("platskarta-rubrik").textContent = namn + ": platsen på listan och uppdraget, val för val";
    el("platskarta-innehall").innerHTML =
      '<div class="tabell-rull">' + platskarta(kod) + "</div>" + kartforklaring() +
      '<div class="utfall-lista">' + utfallLista(kod) + "</div>";
    sekt.hidden = false;
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
      t += v.ersattareKalla
        ? "Ersättarna i fullmäktige är Valmyndighetens nuvarande (per " + esc(v.ersattareKalla.uppgiftPer) + "), inte de ursprungligen utsedda. "
        : "Ersättarna i fullmäktige är okända: Valmyndigheten har ingen ersättarfil för valet. ";
    } else if (v.uppdragStatus === "partiell") {
      var d = v.protokollDatum || {};
      t += "Fullmäktiges beslut saknas för den här perioden, så uppdragen är bara delvis kartlagda ur närvarolistor: " +
        "<strong>en tom ruta betyder &quot;inte funnet&quot;, inte &quot;nej&quot;</strong>. KS-kolumnen visar de närvarande vid " +
        "protokollet " + esc(d.KS || "(saknas)") + (d.KSAU ? " och KSAU vid " + esc(d.KSAU) : "; KSAU saknas i arkivet") +
        " – en ögonblicksbild, inte den sammansättning som valdes efter valet. Ersättare i KS och KSAU syns bara om de tjänstgjorde vid något möte; " +
        "ersättarna i fullmäktige är okända. ";
    } else {
      t += "KS, KSAU och nämnder för perioden väljs av fullmäktige i december 2026, så uppdragen är inte beslutade än. ";
      if (v.ersattareKalla) t += "Ersättarna i fullmäktige är Valmyndighetens per " + esc(v.ersattareKalla.uppgiftPer) + ". ";
    }
    return t + textStyre(v);
  }

  function teckenforklaring(v, flera) {
    var t = '<span class="ja" aria-hidden="true">✓</span> = ledamot (i fullmäktige, KSAU eller KS); ' +
      "&quot;ersättare&quot; = ersättare där (i fullmäktige med ersättarordningen). " +
      '<span class="nej" aria-hidden="true">✗</span> = inte aktuell: platsen blev inget av det. ' +
      "Ordförande och vice ordförande anger organet; (1:e) och (2:e) är första och andra vice ordförande. Under namnet står orten där Valmyndigheten angav den (2014, 2018, 2026). ";
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
    ritaPlatskarta(parti);
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
      "<p><strong>Vilka som blev ledamöter</strong> kommer ur Valmyndighetens fil över de ursprungligen valda. " +
      "<strong>Ersättarna i fullmäktige</strong> kommer ur Valmyndighetens fil &quot;ledamöter och ersättare&quot;, som bara finns för 2022 och 2026 " +
      "och visar de nuvarande ersättarna (datumet står över tabellen), inte de ursprungligen utsedda. För 2010, 2014 och 2018 finns ingen ersättarfil.</p>" +
      "<p><strong>Orten</strong> under namnet är den Valmyndigheten angav på valsedeln. 2010 angavs ingen ort och 2022 bara yrke, så där saknas den.</p>" +
      "<p><strong>Namnen för 2010&ndash;2018</strong> är framtagna genom att länka samma person mellan valen (ålder, ort, yrke) och mot " +
      "fullmäktiges närvarologg. De flesta bygger på att loggen listar ledamöterna i en bestämd ordning " +
      "(2014: stämmer för alla 38 kända namn; 2018 och 2010: för nästan alla). Ersättare som tagit över en plats syns inte som valda. " +
      "Där ett namn är en möjlig men inte säker träff står <em>(osäker)</em>. Namn som inte gått att få fram står som &quot;Namn saknas&quot;.</p>" +
      "<p><strong>Uppdragen</strong> (KS, KSAU, ordförande och vice ordförande) kommer 2014 och 2022 ur fullmäktiges och kommunstyrelsens beslut. " +
      "För 2010 och 2018 saknas besluten i arkivet, och uppdragen är hämtade ur närvarolistorna i de första protokollen med text per organ " +
      "(datumet står över tabellen; för KS 2019–2022 är det först 2021-01-19, två år in i perioden). Ersättare i KS och KSAU syns där bara om de " +
      "tjänstgjorde vid något av de lästa mötena. Övriga poster (revisorer, bolag, nämndledamöter) ingår inte.</p>" +
      "<p><strong>Platskartan</strong> ritar samma uppgifter per plats, ett val per rad, och listan under den säger var på listan uppdragen hamnade. " +
      "Den räknar inget och väger inget; den visar bara positionerna.</p>" +
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
