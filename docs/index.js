/* Startsidan – fyller ämneskorten med beräknade sammanfattningar, så att
   en besökare redan här ser vad materialet innehåller. Allting räknas
   fram ur samma datafiler som analyssidorna använder; inga siffror är
   hårdkodade. Utan JavaScript, eller om en fil inte kan läsas, står
   kortens beskrivande text kvar som den är. */
(function () {
  "use strict";

  var K = window.KIS;
  var el = K.el;
  var talSv = K.talSv;
  var esc = K.esc;

  function hamta(fil) {
    return fetch(fil).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function rad(etikett, varde) {
    return "<li>" + etikett + ": <span class=\"siffra\">" + varde + "</span></li>";
  }

  function fyll(id, rader) {
    var lista = el(id);
    if (!lista || !rader.length) return;
    lista.innerHTML = rader.join("");
    lista.hidden = false;
  }

  /* ---------- Befolkningsprognoserna ---------- */

  function prognosFakta(data) {
    var ar = data.prognoser.map(function (p) { return p.prognosAr; });
    var jamforda = {};
    data.prognoser.forEach(function (p) {
      Object.keys(p.avvikelser).forEach(function (a) { jamforda[a] = true; });
    });
    var jamfordaAr = Object.keys(jamforda).map(Number);
    return {
      argangar: data.prognoser.length,
      forsta: Math.min.apply(null, ar),
      sista: Math.max.apply(null, ar),
      jamforFrom: Math.min.apply(null, jamfordaAr),
      jamforTom: Math.max.apply(null, jamfordaAr),
      antalOver: data.skevhet ? data.skevhet.antalOver : null,
      antal: data.skevhet ? data.skevhet.antal : null
    };
  }

  /* Genomsnittligt absolut prognosfel vid en fast horisont, ur perAvstand.
     Ett enda snitt över alla horisonter (skevhet.medelAbsPct) blandar
     prognoser på allt från noll till femton års sikt och låter gamla
     årgångar väga tyngre, eftersom de hunnit få facit för fler år.
     Bara felet vid samma horisont går att tolka som ett kvalitetsmått. */
  function felVidHorisont(data, avstand) {
    var traff = (data.perAvstand || []).filter(function (r) {
      return r.avstand === avstand;
    })[0];
    return traff && traff.medelAbsPct !== null &&
      traff.medelAbsPct !== undefined ? traff.medelAbsPct : null;
  }

  function felPerHorisont(data) {
    var delar = [1, 3, 5].map(function (k) {
      var v = felVidHorisont(data, k);
      return v === null ? null : k + " år framåt " + talSv(v, 1) + " %";
    }).filter(function (d) { return d !== null; });
    return delar.length ? delar.join(" · ") : null;
  }

  function visaBefolkning(total, unga) {
    var t = prognosFakta(total);
    var rader = [
      rad("Prognosårgångar", t.argangar + " (" + t.forsta + "–" + t.sista + ")"),
      rad("Jämförs mot utfallet", t.jamforFrom + "–" + t.jamforTom)
    ];
    var tFel = felPerHorisont(total);
    if (tFel !== null) {
      rader.push(rad("Absolut prognosfel i snitt, hela befolkningen", tFel));
    }
    var uFel = unga ? felPerHorisont(unga) : null;
    if (uFel !== null) {
      rader.push(rad("Absolut prognosfel i snitt, 16–19 år", uFel));
    }
    /* Kohortframskrivningen: vad som redan är fött, utan någon modell. */
    var k = unga && unga.kohort;
    if (k && k.framskrivning[String(k.sistaAr)] !== undefined) {
      rader.push(rad("16–19-åringar " + esc(k.sistaAr) + " av dem som redan bor här",
        talSv(k.framskrivning[String(k.sistaAr)]) + " (mot " +
        talSv(k.framskrivning[String(k.basAr + 1)]) + " år " + esc(k.basAr + 1) + ")"));
    }
    fyll("fakta-befolkning", rader);

    if (t.antal && t.antalOver !== null) {
      var over = t.antalOver, under = t.antal - over;
      var hall = over >= under
        ? over + " av " + t.antal + " prognosvärden låg över utfallet"
        : under + " av " + t.antal + " prognosvärden låg under utfallet";
      el("undertext-befolkning").textContent =
        "I de år som kan jämföras: " + hall + ".";
    }
    if (k) {
      el("undertext-gymnasiealdern").textContent =
        "Kommunens prognoser mot utfallet – och en ren framskrivning av de " +
        "barn som redan bor i kommunen, fram till " + k.sistaAr + ".";
    } else if (unga) {
      el("undertext-gymnasiealdern").textContent =
        "Kommunens prognoser för åldersgruppen jämförda med utfallet.";
    }
  }

  /* ---------- Gymnasiet ---------- */

  /* Senaste post i en lista som faktiskt har ett värde i fältet – inte
     bara sista arrayelementet, som kan sakna data. */
  function sistaMed(lista, falt) {
    for (var i = lista.length - 1; i >= 0; i--) {
      if (lista[i][falt] !== null && lista[i][falt] !== undefined) {
        return lista[i];
      }
    }
    return null;
  }

  function visaGymnasium(merit, slut, kull) {
    var rader = [];

    if (merit && merit.program && merit.program.length) {
      var mForsta = merit.ar[0], mSista = merit.ar[merit.ar.length - 1];
      var namn = {};
      merit.program.forEach(function (p) { namn[p.namn] = true; });
      rader.push(rad("Program vid antagningen",
        Object.keys(namn).length + " (" + esc(mForsta) + "–" + esc(mSista) + ")"));
      var sm = sistaMed(merit.sammanfattning, "medel");
      if (sm) {
        rader.push(rad("Medelmeritvärde " + esc(sm.ar) + ", ovägt snitt över utbildningarna",
          talSv(sm.medel, 1) + " av 340"));
      }
    }

    if (slut && slut.sammanfattning && slut.sammanfattning.length) {
      var sForstaAr = slut.ar[0], sSistaAr = slut.ar[slut.ar.length - 1];
      rader.push(rad("Slutbetyg", slut.ar.length + " läsår (" +
        esc(sForstaAr) + "–" + esc(sSistaAr) + ")"));
      /* Sammanfattningen räknar på nationella program vid Aranäs och
         Elof Lindälv – inte kommunens alla gymnasieelever. */
      var sExamen = sistaMed(slut.sammanfattning, "andelExamen");
      if (sExamen) {
        rader.push(rad("Andel med examen " + esc(sExamen.ar) + ", de två skolorna",
          talSv(sExamen.andelExamen, 1) + " % av " + talSv(sExamen.antal) + " elever"));
      }
      var sPoang = sistaMed(slut.sammanfattning, "betygspoang");
      if (sPoang) {
        rader.push(rad("Betygspoäng " + esc(sPoang.ar) + ", nationella program på de två skolorna",
          talSv(sPoang.betygspoang, 1) + " av 20"));
      }
    }

    if (kull && kull.program) {
      var kan = kull.program.filter(function (p) { return p.antalKompletta > 0; });
      var totKullar = kan.reduce(function (n, p) { return n + p.antalKompletta; }, 0);
      if (totKullar) {
        rader.push(rad("Kullar med både antagning och examen",
          esc(totKullar) + " på " + kan.length + " program"));
        el("undertext-kull").textContent =
          "Antagningen år X mot examen år X + 3, " + totKullar +
          " jämförbara kullar (grupper, inte samma individer).";
      }
    }

    fyll("fakta-gymnasium", rader);

    if (merit && merit.ar) {
      el("undertext-meritvarden").textContent =
        "Aranäsgymnasiet och Elof Lindälvs gymnasium, slutantagningen " +
        merit.ar[0] + "–" + merit.ar[merit.ar.length - 1] + ".";
    }
    if (slut && slut.ar && slut.skolor) {
      el("undertext-slutbetyg").textContent =
        slut.skolor.map(function (s) { return s.namn; }).join(" och ") +
        ", avgångseleverna " +
        slut.ar[0] + "–" + slut.ar[slut.ar.length - 1] + ".";
    }
  }

  /* ---------- Grundskolan ---------- */

  function visaAmnesbetyg(data) {
    if (!data || !data.sammanfattning || !data.sammanfattning.length) return;
    var sista = data.sammanfattning[data.sammanfattning.length - 1];
    var forsta = data.sammanfattning[0];
    var redovisade = data.amnen.filter(function (a) { return a.redovisas; });
    /* Sammanfattningens snitt räknas över de ämnen som redovisas alla
       läsår (karnamnen), inte över samtliga ämnen. */
    var antalKarnamnen = data.karnamnen ? data.karnamnen.length : null;

    fyll("fakta-amnesbetyg", [
      rad("Ämnen som redovisas", redovisade.length + " (" +
        esc(forsta.lasar) + "–" + esc(sista.lasar) + ")"),
      rad("Betygspoäng " + esc(sista.lasar) + ", ovägt snitt över de " +
        esc(antalKarnamnen) + " ämnen som följs alla läsår",
        talSv(sista.betygspoang, 1) + " av " + esc(data.maxPoang)),
      rad("Andel med godkänt " + esc(sista.lasar) + ", snitt över samma ämnen",
        talSv(sista.andelAE, 1) + " %")
    ]);

    el("undertext-amnesbetyg").textContent =
      "Hela kommunen, " + data.ar.length + " läsår (" + forsta.lasar +
      "–" + sista.lasar + ").";
  }

  /* ---------- Från nian till gymnasiet ---------- */

  function visaNian(data) {
    if (!data || !data.nian || !data.nian.length) return;
    var n = data.nian[data.nian.length - 1];
    var s = null, e = null;
    data.start.forEach(function (p) { if (p.examen3 !== null) s = p; });
    if (data.examen.length) e = data.examen[data.examen.length - 1];
    var p = data.pendling.length
      ? data.pendling[data.pendling.length - 1].gymnasiet : null;

    var rader = [
      rad("Behöriga till yrkesprogram i nian " + esc(n.lasar),
        talSv(n.andelBehorigYrkes, 1) + " %")
    ];
    if (s) {
      rader.push(rad("Examen inom 3 år, började " + esc(s.ar),
        talSv(s.examen3, 1) + " %"));
    }
    if (e && e.betygspoang !== null) {
      rader.push(rad("Betygspoäng vid examen " + esc(e.ar),
        talSv(e.betygspoang, 1) + " av " + esc(data.poangMax)));
    }
    if (p) {
      rader.push(rad("Läser gymnasiet i en annan kommun",
        talSv(p.andelUt, 1) + " % av de folkbokförda gymnasieeleverna"));
    }
    fyll("fakta-nian", rader);

    var hela = data.kullar.filter(function (k) {
      return k.start.status === "ok" && k.examen.status === "ok";
    });
    el("undertext-nian").textContent = hela.length
      ? hela.length + " årskullar har alla tre mätpunkterna: de som gick ut " +
        "nian " + hela[0].ar + "–" + hela[hela.length - 1].ar + "."
      : "Slutbetyget i nian, genomströmningen och avgångsbetygen.";
  }

  /* ---------- Barn och unga 0–15 år ---------- */

  function visaBarn(data) {
    if (!data || !data.serier) return;
    var s = null;
    data.serier.forEach(function (x) { if (x.nyckel === "0-15") s = x; });
    if (!s) return;
    el("undertext-barn").textContent =
      "Faktiskt utfall " + s.forstaAr + "–" + s.sistaAr + ", störst " +
      s.hogstaAr + " (" + talSv(s.hogsta) + ").";
  }

  /* ---------- Valet 2026: förtidsröstningen ---------- */

  function visaVal(data) {
    if (!data || !data.val) return;
    var nu = data.val[String(data.aktuellt)];
    var da = data.forra ? data.val[String(data.forra)] : null;
    if (!nu || !nu.dagar || !nu.dagar.length) return;
    /* Dagen som pågår räknas inte – dess siffra är ofullständig */
    var idag = K.idagSv();
    var klara = nu.dagar.filter(function (d) { return d.datum < idag; });
    var sista = klara[klara.length - 1];
    if (!sista) return;
    var rb = nu.rostberattigade && nu.rostberattigade.riksdag;
    var rader = [rad("Förtidsröster t.o.m. " + esc(sista.datum),
      talSv(sista.ack) + (rb ? " av " + talSv(rb) + " röstberättigade" : ""))];
    var daVid = null;
    if (da) da.dagar.forEach(function (d) { if (d.kvar === sista.kvar) daVid = d; });
    if (daVid) {
      var diff = sista.ack - daVid.ack;
      rader.push(rad(esc(data.forra) + " vid samma punkt (" + sista.kvar + " dagar kvar)",
        talSv(daVid.ack) + " (" + (diff > 0 ? "+" : diff < 0 ? "−" : "") + talSv(Math.abs(diff)) + ")"));
    }
    if (rb) {
      rader.push(rad("Andel av de röstberättigade i riksdagsvalet",
        talSv(100 * sista.ack / rb, 1) + " %"));
    }
    fyll("fakta-val", rader);
    el("undertext-val").textContent = nu.klart
      ? "Hela perioden " + nu.forstaDag + "–" + nu.valdag + ", jämförd med " + data.forra + "."
      : "Uppdaterades senast " + String(data.senastUppdaterad).replace("T", " kl. ").slice(0, 20) +
        "; preliminära siffror från Valmyndigheten.";
  }

  /* ---------- Start ----------
     Varje kort fylls oberoende: går en fil inte att läsa står kortets
     beskrivande text kvar. */

  hamta("data-amnesbetyg.json").then(visaAmnesbetyg).catch(function () {});
  hamta("data-befolkning.json").then(visaBarn).catch(function () {});
  hamta("data-nian-gymnasiet.json").then(visaNian).catch(function () {});
  hamta("data-fortidsroster/" + (el("fakta-val").getAttribute("data-omrade") || "1384") + ".json")
    .then(visaVal).catch(function () {});

  Promise.all([
    hamta("data.json").catch(function () { return null; }),
    hamta("data-16-19.json").catch(function () { return null; })
  ]).then(function (svar) {
    if (svar[0]) visaBefolkning(svar[0], svar[1]);
  });

  Promise.all([
    hamta("data-meritvarden.json").catch(function () { return null; }),
    hamta("data-slutbetyg.json").catch(function () { return null; }),
    hamta("data-kull.json").catch(function () { return null; })
  ]).then(function (svar) {
    if (svar[0] || svar[1] || svar[2]) visaGymnasium(svar[0], svar[1], svar[2]);
    if (svar[1] && svar[1].kallor && svar[1].kallor.length) {
      el("om-uppdaterad").textContent = "Slutbetygen hämtades senast från " +
        "Skolverket " + svar[1].kallor[svar[1].kallor.length - 1].hamtad +
        "; övriga källors hämtningsdatum står på respektive sida.";
    }
  });
})();
