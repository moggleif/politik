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
      medelAbsPct: data.skevhet ? data.skevhet.medelAbsPct : null,
      antalOver: data.skevhet ? data.skevhet.antalOver : null,
      antal: data.skevhet ? data.skevhet.antal : null
    };
  }

  function visaBefolkning(total, unga) {
    var t = prognosFakta(total);
    var rader = [
      rad("Prognosårgångar", t.argangar + " (" + t.forsta + "–" + t.sista + ")"),
      rad("Jämförs mot utfallet", t.jamforFrom + "–" + t.jamforTom)
    ];
    if (t.medelAbsPct !== null) {
      rader.push(rad("Genomsnittligt prognosfel, hela befolkningen",
        talSv(t.medelAbsPct, 1) + " %"));
    }
    var u = unga ? prognosFakta(unga) : null;
    if (u && u.medelAbsPct !== null) {
      rader.push(rad("Genomsnittligt prognosfel, 16–19 år",
        talSv(u.medelAbsPct, 1) + " %"));
    }
    /* Kohortframskrivningen: vad som redan är fött, utan någon modell. */
    var k = unga && unga.kohort;
    if (k && k.framskrivning[String(k.sistaAr)] !== undefined) {
      rader.push(rad("16–19-åringar " + k.sistaAr + " av dem som redan bor här",
        talSv(k.framskrivning[String(k.sistaAr)]) + " (mot " +
        talSv(k.framskrivning[String(k.basAr + 1)]) + " år " + (k.basAr + 1) + ")"));
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
    } else if (u && u.medelAbsPct !== null && t.medelAbsPct !== null) {
      el("undertext-gymnasiealdern").textContent =
        "Prognosfelet för åldersgruppen har i snitt varit " +
        (u.medelAbsPct > t.medelAbsPct ? "större" : "mindre") +
        " än för hela befolkningen (" + talSv(u.medelAbsPct, 1) + " % mot " +
        talSv(t.medelAbsPct, 1) + " %).";
    }
  }

  /* ---------- Gymnasiet ---------- */

  function visaGymnasium(merit, slut, kull) {
    var rader = [];

    if (merit && merit.program && merit.program.length) {
      var mForsta = merit.ar[0], mSista = merit.ar[merit.ar.length - 1];
      var namn = {};
      merit.program.forEach(function (p) { namn[p.namn] = true; });
      rader.push(rad("Program vid antagningen",
        Object.keys(namn).length + " (" + mForsta + "–" + mSista + ")"));
      var sm = merit.sammanfattning.filter(function (s) { return s.ar === mSista; })[0];
      if (sm) {
        rader.push(rad("Medelmeritvärde " + mSista + ", snitt över utbildningarna",
          talSv(sm.medel, 1) + " av 340"));
      }
    }

    if (slut && slut.sammanfattning && slut.sammanfattning.length) {
      var sSista = slut.sammanfattning[slut.sammanfattning.length - 1];
      var sForstaAr = slut.ar[0], sSistaAr = slut.ar[slut.ar.length - 1];
      rader.push(rad("Slutbetyg", slut.ar.length + " läsår (" +
        sForstaAr + "–" + sSistaAr + ")"));
      if (sSista.andelExamen !== null) {
        rader.push(rad("Andel med examen " + sSista.ar,
          talSv(sSista.andelExamen, 1) + " % av " + talSv(sSista.antal) + " elever"));
      }
      if (sSista.betygspoang !== null) {
        rader.push(rad("Betygspoäng " + sSista.ar + ", hela kullen",
          talSv(sSista.betygspoang, 1) + " av 20"));
      }
    }

    if (kull && kull.program) {
      var kan = kull.program.filter(function (p) { return p.antalKompletta > 0; });
      var totKullar = kan.reduce(function (n, p) { return n + p.antalKompletta; }, 0);
      if (totKullar) {
        rader.push(rad("Kullar som kan följas från antagning till examen",
          totKullar + " på " + kan.length + " program"));
        el("undertext-kull").textContent =
          "Antagningen år X mot examen år X + 3, " + totKullar +
          " jämförbara kullar.";
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

    fyll("fakta-amnesbetyg", [
      rad("Ämnen som redovisas", redovisade.length + " (" +
        forsta.lasar + "–" + sista.lasar + ")"),
      rad("Betygspoäng " + sista.lasar + ", snitt över ämnena",
        talSv(sista.betygspoang, 1) + " av " + data.maxPoang),
      rad("Andel med godkänt " + sista.lasar,
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
      rad("Behöriga till yrkesprogram i nian " + n.lasar,
        talSv(n.andelBehorigYrkes, 1) + " %")
    ];
    if (s) {
      rader.push(rad("Examen inom 3 år, började " + s.ar,
        talSv(s.examen3, 1) + " %"));
    }
    if (e && e.betygspoang !== null) {
      rader.push(rad("Betygspoäng vid examen " + e.ar,
        talSv(e.betygspoang, 1) + " av " + data.poangMax));
    }
    if (p) {
      rader.push(rad("Läser gymnasiet i en annan kommun",
        talSv(p.andelUt, 1) + " % av kommunens elever"));
    }
    fyll("fakta-nian", rader);

    var hela = data.kullar.filter(function (k) {
      return k.start.status === "ok" && k.examen.status === "ok";
    });
    el("undertext-nian").textContent = hela.length
      ? hela.length + " årskullar kan följas hela vägen: de som gick ut " +
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

  /* ---------- Start ----------
     Varje kort fylls oberoende: går en fil inte att läsa står kortets
     beskrivande text kvar. */

  hamta("data-amnesbetyg.json").then(visaAmnesbetyg).catch(function () {});
  hamta("data-befolkning.json").then(visaBarn).catch(function () {});
  hamta("data-nian-gymnasiet.json").then(visaNian).catch(function () {});

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
      el("om-uppdaterad").textContent = "Senaste datahämtning: " +
        svar[1].kallor[svar[1].kallor.length - 1].hamtad + ".";
    }
  });
})();
