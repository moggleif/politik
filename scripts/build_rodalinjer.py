#!/usr/bin/env python3
"""Bygger docs/data-rodalinjer.json: riksdagspartiernas röda linjer i
regeringsfrågan, som en matris över två frågor.

Läser:
  data/rodalinjer/besked.json   (skrivs för hand, ett besked per rad)

Skriver:
  docs/data-rodalinjer.json

**Två frågor, åtta partier.** Varje parti får för varje annat parti ett
svar på vardera frågan:

  regera      Kan partiet sitta i samma regering som det andra?
  samarbeta   Kan partiet rösta ja till och stödja en regering som
              innehåller det andra? Det är bara vad partiet *gör* vid
              regeringsomröstningen som räknas, inte om det förhandlar
              eller pratar med det andra partiet. SD:s stöd 2022–2026 till
              en regering av M, KD och L är exemplet på ett ja.

**Tre svar:** `ja`, `nej` och `oklart`. Ett `ja` eller `nej` finns bara
där en källa säger det för just den frågan och just det partiet. Allt som
inte har ett besked i filen blir `oklart` – partiet har inte sagt något vi
funnit, eller har hållit frågan öppen. Det är inte samma sak som ett nej,
och sidan ritar det därför som ett eget läge. Ett `oklart` kan ändå ha ett
besked i filen, med en källa som visar *varför* det är oklart.

**Inget härleds.** Att ett parti vill sitta i regering med ett annat
räknas inte om till ett svar på samarbetsfrågan, och att S utesluter
samarbete med SD räknas inte om till något om V. Varje ja och nej bär sina
egna källor. Partierna lägger inte samma betydelse i "samarbeta", och
sidan använder bara den som står ovan.

Bygget stannar hellre än sparar något som inte går ihop: okänt parti eller
fråga, ett parti som svarar om sig självt, två besked för samma ruta, ett
ja eller nej utan källa, en källa som inte finns eller inte används, en
källa utan adress, och ett parti som svarat ja på att regera med ett annat
men nej på att samarbeta med det (de två svaren motsäger då varandra).

Körs:  python3 scripts/build_rodalinjer.py
"""

import json
import re
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent
IN = ROT / "data" / "rodalinjer" / "besked.json"
UT = ROT / "docs" / "data-rodalinjer.json"

# Ordningen är riksdagens vanliga, från vänster till höger.
PARTIER = [
    ("v", "V", "Vänsterpartiet"),
    ("s", "S", "Socialdemokraterna"),
    ("mp", "MP", "Miljöpartiet"),
    ("c", "C", "Centerpartiet"),
    ("l", "L", "Liberalerna"),
    ("kd", "KD", "Kristdemokraterna"),
    ("m", "M", "Moderaterna"),
    ("sd", "SD", "Sverigedemokraterna"),
]
KODER = [p[0] for p in PARTIER]

FRAGOR = [
    ("regera", "I regering",
     "Kan partiet i raden sitta i samma regering som partiet i kolumnen?"),
    ("samarbeta", "Samarbeta",
     "Kan partiet i raden rösta ja till och stödja en regering som innehåller "
     "partiet i kolumnen?"),
]
FRAGEKODER = [f[0] for f in FRAGOR]
SVAR = ("ja", "nej", "oklart")
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def las_indata():
    return json.loads(IN.read_text(encoding="utf-8"))


def kontrollera(indata):
    kallor = {}
    for k in indata["kallor"]:
        if k["id"] in kallor:
            raise SystemExit(f"Källan {k['id']} finns två gånger")
        if not str(k.get("url", "")).startswith("https://"):
            raise SystemExit(f"Källan {k['id']} saknar https-adress")
        if k.get("datum") is not None and not ISO.match(k["datum"]):
            raise SystemExit(f"Källan {k['id']}: datum ska vara ÅÅÅÅ-MM-DD eller null")
        kallor[k["id"]] = k

    sedda = {}
    for b in indata["besked"]:
        namn = f"{b.get('parti')}→{b.get('om')} ({b.get('fraga')})"
        if b["parti"] not in KODER or b["om"] not in KODER:
            raise SystemExit(f"{namn}: okänt parti")
        if b["parti"] == b["om"]:
            raise SystemExit(f"{namn}: ett parti kan inte svara om sig självt")
        if b["fraga"] not in FRAGEKODER:
            raise SystemExit(f"{namn}: okänd fråga")
        if b["svar"] not in SVAR:
            raise SystemExit(f"{namn}: svaret ska vara ja, nej eller oklart")
        nyckel = (b["parti"], b["om"], b["fraga"])
        if nyckel in sedda:
            raise SystemExit(f"{namn}: två besked för samma ruta")
        sedda[nyckel] = b
        if b["svar"] != "oklart" and not b["kallor"]:
            raise SystemExit(f"{namn}: ett {b['svar']} utan källa")
        for k in b["kallor"]:
            if k not in kallor:
                raise SystemExit(f"{namn}: källan {k} finns inte")

    anvanda = {k for b in indata["besked"] for k in b["kallor"]}
    for k in kallor:
        if k not in anvanda:
            raise SystemExit(f"Källan {k} används inte av något besked")

    for (p, om, f), b in sedda.items():
        if f == "regera" and b["svar"] == "ja":
            s = sedda.get((p, om, "samarbeta"))
            if s and s["svar"] == "nej":
                raise SystemExit(
                    f"{p}→{om}: ja till att regera men nej till att samarbeta")
    return kallor, sedda


def bygg(indata):
    kallor, sedda = kontrollera(indata)
    # Källorna numreras i den ordning de först används i matrisen, så att
    # sidans fotnoter går 1, 2, 3 …
    nummer = {}
    celler = []
    for f in FRAGEKODER:
        for p in KODER:
            for om in KODER:
                if p == om:
                    continue
                b = sedda.get((p, om, f))
                ks = list(b["kallor"]) if b else []
                for k in ks:
                    nummer.setdefault(k, len(nummer) + 1)
                celler.append({
                    "parti": p, "om": om, "fraga": f,
                    "svar": b["svar"] if b else "oklart",
                    "kallor": [nummer[k] for k in ks],
                    "not": b["not"] if b and b.get("not") else None,
                })
    raknare = {f: {s: 0 for s in SVAR} for f in FRAGEKODER}
    for c in celler:
        raknare[c["fraga"]][c["svar"]] += 1
    return {
        "hamtad": indata["hamtad"],
        "lage": indata["lage"],
        "partier": [{"kod": k, "kort": a, "namn": n} for k, a, n in PARTIER],
        "fragor": [{"id": i, "rubrik": r, "fraga": t} for i, r, t in FRAGOR],
        "celler": celler,
        "antal": raknare,
        "kallor": [
            {"nr": nummer[k], "rubrik": kallor[k]["rubrik"],
             "utgivare": kallor[k]["utgivare"], "url": kallor[k]["url"],
             "datum": kallor[k]["datum"], "anmarkning": kallor[k]["anmarkning"]}
            for k in sorted(nummer, key=nummer.get)
        ],
    }


def main():
    ut = bygg(las_indata())
    UT.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    a = ut["antal"]
    print(f"Skrev {UT.relative_to(ROT)}: " + "; ".join(
        f"{f}: {a[f]['ja']} ja, {a[f]['nej']} nej, {a[f]['oklart']} oklart" for f in a))


if __name__ == "__main__":
    main()
