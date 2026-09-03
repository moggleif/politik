/* Besöksräknaren i sidfoten.
   Visningarna räknas av GoatCounter (count.js-taggen sist på varje sida,
   utan kakor och utan att IP-adresser sparas). Den här filen hämtar
   webbplatsens samlade antal visningar från samma tjänst och skriver in
   det i sidfoten. Svaret är formaterat med tjänstens egen tusenavgränsare,
   så siffrorna plockas ut och sätts ihop igen på svenskt vis.

   Raden i sidfoten är dold tills talet finns. Den förblir dold om
   tjänsten inte svarar – nätet, en annonsblockerare, eller att "Allow
   adding visitor counts on your website" inte är påslaget i GoatCounters
   inställningar (då svarar tjänsten 403). Sidan fungerar oberoende av
   räknaren. Svaret cachas hos GoatCounter i upp till fyra timmar. */
(function () {
  "use strict";

  var ADRESS = "https://moderat.goatcounter.com/counter/TOTAL.json";

  var rad = document.getElementById("besok");
  var antal = document.getElementById("besok-antal");
  if (!rad || !antal || typeof fetch !== "function") return;

  fetch(ADRESS, { mode: "cors", credentials: "omit" })
    .then(function (svar) { return svar.ok ? svar.json() : null; })
    .then(function (data) {
      var siffror = data ? String(data.count).replace(/\D/g, "") : "";
      if (!siffror) return;
      antal.textContent = new Intl.NumberFormat("sv-SE").format(Number(siffror));
      rad.hidden = false;
    })
    .catch(function () { /* raden förblir dold */ });
})();
