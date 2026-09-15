/* Gemensam testserver för de kontroller som ska köras mot fryst data.

   Två kontroller behöver samma sak: facit över det renderade utfallet
   (facit_webbplats.js) och interaktionstesterna (interaktion_webbplats.js).
   Båda måste se exakt samma siffror varje gång, annars är de brus.

   Rök-testet använder medvetet *inte* den här. Det ska ladda sidorna med
   de riktiga datafilerna, eftersom en av dess uppgifter är att upptäcka
   ett trasigt databygge. Fryst data där hade dolt just det.

   Kräver ingenting utöver Node. */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROT = path.join(__dirname, "..");
const DOCS = path.join(ROT, "docs");
const FIXTURER = path.join(ROT, "tests", "fixtures", "data");

/* Klockan fryses i webbläsaren. fortidsrostning.js och index.js räknar ut
   vilken dag som pågår vid laddning via K.idagSv(), så deras utfall skulle
   annars driva varje dygn. Tidpunkten hör ihop med fixturdatat: den ligger
   efter valdagen 2026-09-13, som är sista dagen i de frysta
   förtidsröstsiffrorna. Byts fixturerna ut ska den här flyttas med. */
const FRUSEN_TID = "2026-09-15T09:00:00+02:00";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".csv": "text/csv; charset=utf-8",
};

/* Vilka filer som får serveras räknas upp en gång vid start, och adressen
   ur begäran används sedan bara som nyckel i den uppräkningen – aldrig som
   sökväg. Det är inte bara en vakt mot ".." utan tar bort frågan: sökvägen
   som når fs kommer ur katalogvandringen, inte utifrån. */
function vandra(rot, prefix, karta) {
  fs.readdirSync(rot, { withFileTypes: true }).forEach(function (post) {
    const full = path.join(rot, post.name);
    if (post.isDirectory()) vandra(full, prefix + post.name + "/", karta);
    else if (post.isFile()) karta.set(prefix + post.name, full);
  });
}

/* Datafilerna kommer ur tests/fixtures/data/, aldrig ur docs/.
   Förtidsröstjobbet skriver om docs/data-fortidsroster/ två gånger om
   dygnet och pushar till main; kördes kontrollerna mot de riktiga filerna
   vore de röda inom ett dygn och avstängda inom en vecka. Sidorna märker
   ingenting – de begär samma adresser som vanligt.

   Bara tre av de 313 områdesfilerna är frysta. Därför tas docs-varianterna
   bort ur uppräkningen innan fixturerna läggs in: ett område utan fixtur
   ska svara 404, inte tyst falla tillbaka på levande data. */
function servbaraFiler() {
  const karta = new Map();
  vandra(DOCS, "/", karta);
  Array.from(karta.keys()).forEach(function (nyckel) {
    if (/^\/data[^/]*\.json$/.test(nyckel) || nyckel.startsWith("/data-fortidsroster/")) {
      karta.delete(nyckel);
    }
  });
  vandra(FIXTURER, "/", karta);
  karta.set("/", karta.get("/index.html"));
  return karta;
}

function startaServer() {
  const filer = servbaraFiler();
  return new Promise(function (klar) {
    const server = http.createServer(function (req, res) {
      const fil = filer.get(decodeURIComponent(req.url.split("?")[0]));
      if (!fil) { res.writeHead(404); res.end("saknas"); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(fil)] || "application/octet-stream" });
      fs.createReadStream(fil).pipe(res);
    });
    server.listen(0, "127.0.0.1", function () { klar(server); });
  });
}

/* En sida med frusen klocka och utan nät: GoatCounters count.js besvaras
   lokalt med en tom fil, så att kontrollerna går utan uppkoppling. */
async function nySida(browser, alternativ) {
  const page = await browser.newPage(alternativ);
  await page.clock.setFixedTime(new Date(FRUSEN_TID));
  await page.route("https://gc.zgo.at/**", function (r) {
    r.fulfill({ status: 200, contentType: "text/javascript", body: "" });
  });
  return page;
}

module.exports = { startaServer, nySida, FRUSEN_TID, DOCS, FIXTURER };
