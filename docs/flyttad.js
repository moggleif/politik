/* kommunval.html har bytt namn till valresultat.html, eftersom sidan
   numera visar tre val och inte ett. GitHub Pages kan inte svara med en
   omdirigering, så den gamla adressen ligger kvar som en sida som skickar
   besökaren vidare.

   Frågesträngen och ankaret följer med: en delad länk som
   kommunval.html?parti=m&distrikt=innerstaden,hede ska landa i samma vy
   på den nya adressen, och valet blir då kommunvalet – förvalet – precis
   som länken menade. location.replace och inte location.href, så att den
   gamla adressen inte lägger sig i historiken och gör bakåtknappen till
   en studsmatta.

   Utan JavaScript händer ingenting av det här, och då står länken på
   sidan kvar att klicka på. */
(function () {
  "use strict";

  var MAL = "valresultat.html";
  var vidare = MAL + window.location.search + window.location.hash;

  var lank = document.getElementById("vidare");
  if (lank) lank.setAttribute("href", vidare);

  try {
    window.location.replace(vidare);
  } catch (e) {
    /* file://-läge och liknande: länken ovan fungerar ändå. */
  }
})();
