# Källor och insamlingsstatus

Den här filen dokumenterar var varje siffra kommer ifrån, vad som är hittat
och vad som återstår.

## Status

| Del | Status |
|---|---|
| Statisk hemsida (`docs/`) | Klar |
| Skript (`scripts/`) | Klara och körda |
| Faktisk folkmängd 2000–2025 (SCB) | **Klar** |
| Befolkningsprognos 2026–2035 (+ framskrivning 2050) | **Klar** |
| Prognoser 2015–2025 | **Saknas** – se "Vad som är provat" |

Utan de äldre prognoserna finns inga år med facit att jämföra mot, så
träffsäkerhetsdelen av sajten är tom. Det är den enda återstående luckan.

## Faktisk folkmängd (SCB)

Hämtas med `python3 scripts/fetch_scb.py` ur två av SCB:s tabeller:

- 2000–2024: `BefolkningNy` via det äldre doris-API:t
- 2025: `TAB5557` via PxWeb API 2.0 (SCB lägger de senaste åren i egna tabeller)

Tabellen i Statistikdatabasen:
<https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__BE__BE0101__BE0101A/BefolkningNy/>

Siffrorna är dubbelkontrollerade mot kommunens egna årsredovisningar, som
anger exakt samma folkmängd (2021: 85 301, 2022: 85 801, 2023: 85 653,
2024: 85 792, 2025: 86 332).

## Hittade prognosrapporter

### Befolkningsprognos 2026–2035 (publicerad april 2026) — INLÄST

- Original: <https://kungsbacka.se/download/18.3ae5986a198e623c951df996/1782303262032/Befolkningsprognos%202025-2050%20total-%20och%20delomr%C3%A5desprognos.pdf>
- Lokal kopia: `docs/rapporter/befolkningsprognos-2026-2035.pdf`
- Siffror: Tabell 1 (sid 12) och Tabell 7, Förändringstabell (sid 37),
  som ger hela serien 2026–2050 → `data/prognoser/prognos_2026.json`

Observera att filnamnet på kommunens server säger "2025-2050" men att
dokumentet är 2026 års rapport. Kommunen återanvänder samma URL-nod och
skriver över filen när en ny årgång publiceras.

### Befolkningsprognos 2024–2050 — DELVIS, ej inläst

Rapporten själv går inte att nå, men den citeras i *Underlag till
bostadsförsörjningsplan för Kungsbacka kommun* (maj 2025), figur 13 på
sid 15, som anger fyra punkter:

| | Värde |
|---|---|
| Utfall 2000 | 65 113 |
| Utfall 2023 | 85 653 |
| **Prognos 2033** | **94 064** |
| **Framskrivning 2050** | **109 763** |

Källa: <https://kungsbacka.se/download/18.348b667a196c7f4d0a31989c/1747230128135/Underlag%20till%20bostadsf%C3%B6rs%C3%B6rjningsplan%20f%C3%B6r%20Kungsbacka%20kommun.pdf>

Jämförelsen med 2026 års rapport är slående: för år 2033 sa prognosen från
2024 **94 064**, medan 2026 års säger **89 102**. För 2050 sa den
**109 763** mot **94 267** – en nedjustering med drygt 15 000 personer på
två år. Punkterna är dock för få för att lägga in som en prognosserie;
hela tabellen behövs.

## Vad som är provat för att hitta äldre rapporter

| Väg | Utfall |
|---|---|
| Kommunens sida för befolkningsstatistik | Bara den allra senaste rapporten |
| Gamla tidsstämplar i download-URL:en | Omdirigerar till senaste filen |
| Kommunens sökfunktion | JavaScript-driven, inga träffar via HTTP |
| Årsredovisningar 2023–2025 | Innehåller bara utfall, inga prognoser |
| Kommunstyrelsens kallelser och protokoll 2024–2026 | Befolkningsprognosen är inget eget ärende; "prognos" avser ekonomisk uppföljning |
| Nämnden för Förskola & Grundskola, lokalbehov 2024 och 2025 | Refererar prognoserna, men siffrorna ligger i bilder |
| Underlag till bostadsförsörjningsplan | Fyra punkter ur prognos 2024, se ovan |
| Alternativa webbarkiv (archive.ph, timetravel, cachedview) | Ej nåbara |
| **Wayback Machine** | **Blockerad av miljöns nätverkspolicy** |

Kommunens webbplats sparar alltså bara den senaste årgången. Sammanträdes-
sidorna går bara tillbaka till januari 2024.

## Nästa steg

**Wayback Machine är den återstående vägen.** `archive.org` släpps igenom
av nätverkspolicyn, men själva arkivinnehållet ligger på `web.archive.org`
som fortfarande blockeras. Lägg till `web.archive.org` (eller
`*.archive.org`) i miljöns tillåtna domäner, sedan:

```bash
curl -g "https://web.archive.org/cdx/search/cdx?url=kungsbacka.se&matchType=domain\
&fl=timestamp,original&collapse=urlkey&filter=urlkey:.*rognos.*&limit=500"
```

och hämta träffarna via `https://web.archive.org/web/<timestamp>id_/<url>`.

Alternativt går det att begära rapporterna av kommunen direkt med stöd av
offentlighetsprincipen (info@kungsbacka.se, 0300-83 40 00).

## Lägga in en ny rapport

1. Spara PDF:en i `docs/rapporter/` (måste ligga under `docs/` för att
   GitHub Pages ska kunna servera den).
2. Kör `python3 scripts/extrahera_prognos.py <pdf>` för ett JSON-utkast.
3. Kontrollera siffrorna mot rapporten, fyll i metadatafälten och spara som
   `data/prognoser/prognos_<prognosår>.json`:

```json
{
  "prognosAr": 2015,
  "rapportTitel": "Befolkningsprognos 2015–2024",
  "publicerad": "2015-05",
  "kallaUrl": "https://kungsbacka.se/…/rapport.pdf",
  "arkivUrl": null,
  "lokalPdf": "rapporter/befolkningsprognos-2015.pdf",
  "sidhanvisning": "Tabell 1, sid 7",
  "prognos": { "2015": 79800, "2016": 80600 }
}
```

`prognosAr` är året prognosen gjordes. `lokalPdf` anges relativt `docs/`.
Ta bara med prognosår – rapporterna inleder ofta tabellen med föregående
års **utfall**, som inte hör hemma i prognosserien.

4. Kör `python3 scripts/build_data.py` och kontrollera sidan lokalt:
   `cd docs && python3 -m http.server 8000`
