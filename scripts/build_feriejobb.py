#!/usr/bin/env python3
"""Bygger docs/data-feriejobb.json: kommunens feriejobb år för år – hur
många som sökte, hur många som fick ett jobb och hur många platser
verksamheterna anmälde – och vad feriearbetarna svarade i enkäten.

Läser:
  data/feriejobb/uppgifter.json   (skrivs för hand, en uppgift per rad)
  data/kolada/invanare_15_16.json  (från hamta_kolada.py --del invanare)

Skriver:
  docs/data-feriejobb.json

**Varje tal är ett citat.** En uppgift är ett år, ett mått, ett tal och
den mening ur nämndens handlingar där talet står, ordagrant. Bygget
kontrollerar att talet finns i meningen. Ett tal som är en summa av två
tal i texten (2026: "200 samt 24 extra platser") har sina delar
utskrivna, och då ska varje del stå i meningen och summan stämma.

**Källorna kan säga olika.** Samma år och mått kan ha uppgifter ur flera
handlingar – delårsrapporten, årsredovisningen, kvalitetsberättelsen och
protokollet återger ofta samma tal. När de inte är samma tal väljer
bygget inget av dem: året får ett lägsta och ett högsta värde, båda talen
visas med sina källor, och sidan ritar spannet mellan dem i stället för
en punkt. Ett tal som ingen källa gett blir aldrig ritat.

**Tre mått, så som källorna skriver dem.** "Sökande" är i texterna
omväxlande ungdomar som "fullföljde sin ansökan", "ansökte" och "sökte";
de räknas som samma mått men kan vara räknade på olika sätt. "Tillsatta"
är jobb som tillsattes, ungdomar som anställdes, matchades eller
placerades. "Anmälda platser" är de platser verksamheterna erbjöd, som
kan vara fler än de jobb som tillsattes. Ett år utan uppgift är `null`.

Enkäten är nämndens egen: medelvärden på en skala 1–5, en källa per år.

**Övriga sommarjobb.** Feriejobben är inte alla jobb kommunen har för
unga på sommaren. Nämnden för Vård & Omsorg anställer också 17-åringar,
gymnasieelever i riktade lovjobb och sommarvikarier, och är den enda
förvaltning vars handlingar redovisar hur många. Grupperna och deras
ålder står i indatat, ålder med citat där handlingen anger den. Varje
tal är ett citat på samma sätt som feriejobben; för vikarierna kan en
uppgift också ha hur många verksamheterna beställde (`behov`) och hur
många som bara anmält sig tillgängliga (`tillganglighet`), och de talen
ska stå i samma citat. Grupperna räknas inte ihop med feriejobben eller
med varandra: de mäts på olika sätt och vid olika tidpunkter, vilket en
`anmarkning` på uppgiften säger där det behövs. En grupp har en uppgift
per år.

**Hur många som kunde söka.** Nämndens handlingar säger vem som får
söka – elever i årskurs 1 på gymnasiet, folkbokförda i Kungsbacka –
men inte hur många de är. Sidan visar i stället årskullen ur Kolada
(N01832, SCB:s folkmängd): de som är folkbokförda i kommunen den 31
december året före sommaren och då är 15 år. Det är de som går första året när
sommaren kommer, om de följt skolan i sin årskull. Talet är en
uppskattning åt båda håll: några i årskullen går inte i gymnasiet eller
går i en annan årskurs, och några ettor är födda ett annat år. Samma sätt
ger 17-åringarna som Vård & Omsorg anställer: 16 år den 31 december året
före (N01833), alltså 17 under sommaren. Ett år som Kolada ännu inte har
är `null`.

**Noter.** Det som står kring ett tal – att 75 tackade nej, att platserna
budgeterades till 200, att 24 av platserna gick till Kultur & Fritid –
följer med som en kort not på året och måttet, med sin källa och sitt
citat. Varje tal i noten ska stå i citatet. Noten är en återgivning av
handlingen, inget eget omdöme.

**Var feriearbetarna jobbade.** Några förvaltningar skriver i sina
egna delårsrapporter och årsredovisningar hur många feriearbetare de tog
emot. De talen visas förvaltning för förvaltning och år för år, men
räknas aldrig ihop: de flesta förvaltningar anger inget, och en
förvaltning som inte nämns har inte haft noll. Ett tal som handlingen
anger ungefärligt ("ett femtiotal") märks `ungefar`.

**Tal med bokstäver.** Handlingarna skriver små tal som ord ("fyra
feriearbetare"). Kontrollen att ett tal står i sitt citat godtar därför
också talordet för 1–12.

**2023 i initiativet.** Initiativet om feriejobb (GA 2024-04-17) anger
419 sökande och 321 erbjudna platser för 2023, medan kvalitetsberättelsen
anger 310 sökande. Båda står kvar som olika uppgifter för året.

Bygget stannar hellre än sparar något som inte går ihop: okänt mått eller
okänd källa, ett tal som inte står i sitt citat, delar som inte summerar
till talet, en källa som ger två tal för samma år och mått, en källa som
inte används, enkätvärden utanför skalan eller för okända frågor, och en
sommarjobbsgrupp som är okänd eller har två uppgifter för samma år, en
not med ett tal som inte står i citatet och en förvaltning med två tal
samma år.

Körs:  python3 scripts/build_feriejobb.py
"""

import json
import re
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent
IN = ROT / "data" / "feriejobb" / "uppgifter.json"
UT = ROT / "docs" / "data-feriejobb.json"
KOLADA = ROT / "data" / "kolada" / "invanare_15_16.json"

MATT = [
    ("sokande", "Sökande",
     "Ungdomar som sökte feriejobb – i källorna omväxlande de som "
     "fullföljde sin ansökan, ansökte eller sökte."),
    ("tillsatta", "Tillsatta feriejobb",
     "Ungdomar som fick ett feriejobb – i källorna tillsattes, anställdes, "
     "matchades eller placerades."),
    ("platser", "Anmälda platser",
     "Platser som kommunens verksamheter erbjöd inför sommaren."),
]
MATTKODER = [m[0] for m in MATT]
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def las_indata():
    return json.loads(IN.read_text(encoding="utf-8"))


# Handlingarna skriver små tal med bokstäver: "fyra feriearbetare".
TALORD = {1: "en", 2: "två", 3: "tre", 4: "fyra", 5: "fem", 6: "sex",
          7: "sju", 8: "åtta", 9: "nio", 10: "tio", 11: "elva", 12: "tolv"}


def star_i(tal, text):
    if re.search(r"(?<!\d)" + str(tal) + r"(?!\d)", text):
        return True
    return tal in TALORD and re.search(r"\b" + TALORD[tal] + r"\b", text, re.I) is not None


def kontrollera_kallor(kallor):
    ut = {}
    for k in kallor:
        if k["id"] in ut:
            raise SystemExit(f"Källan {k['id']} finns två gånger")
        if not str(k.get("url", "")).startswith("https://"):
            raise SystemExit(f"Källan {k['id']} saknar https-adress")
        if k["original"] is not None and not k["original"].startswith("https://"):
            raise SystemExit(f"Källan {k['id']}: originalet ska vara en https-adress eller null")
        if not k.get("namnd"):
            raise SystemExit(f"Källan {k['id']} saknar nämnd")
        if not ISO.match(k["mote"]):
            raise SystemExit(f"Källan {k['id']}: mötet ska vara ÅÅÅÅ-MM-DD")
        ut[k["id"]] = k
    return ut


def kontrollera_uppgift(u, kallor):
    namn = f"{u.get('ar')} {u.get('matt')} ({u.get('kalla')})"
    if u["matt"] not in MATTKODER:
        raise SystemExit(f"{namn}: okänt mått")
    if u["kalla"] not in kallor:
        raise SystemExit(f"{namn}: källan finns inte")
    if not isinstance(u["varde"], int) or u["varde"] < 0:
        raise SystemExit(f"{namn}: talet ska vara ett heltal")
    delar = u.get("delar") or [u["varde"]]
    if sum(delar) != u["varde"]:
        raise SystemExit(f"{namn}: delarna {delar} blir inte {u['varde']}")
    for d in delar:
        if not star_i(d, u["citat"]):
            raise SystemExit(f"{namn}: {d} står inte i citatet")


def kontrollera_enkat(enkat, kallor):
    fragor = [f["id"] for f in enkat["fragor"]]
    sedda = set()
    for a in enkat["ar"]:
        if a["ar"] in sedda:
            raise SystemExit(f"Enkäten {a['ar']} finns två gånger")
        sedda.add(a["ar"])
        if a["kalla"] not in kallor:
            raise SystemExit(f"Enkäten {a['ar']}: källan finns inte")
        if sorted(a["medel"]) != sorted(fragor):
            raise SystemExit(f"Enkäten {a['ar']}: frågorna stämmer inte")
        for v in a["medel"].values():
            if not 1 <= v <= 5:
                raise SystemExit(f"Enkäten {a['ar']}: {v} ligger utanför skalan 1–5")


def kontrollera_grupper(grupper, kallor):
    ut = set()
    for g in grupper:
        if g["id"] in ut:
            raise SystemExit(f"Gruppen {g['id']} finns två gånger")
        ut.add(g["id"])
        if (g["alder_kalla"] is None) != (g["alder_citat"] is None):
            raise SystemExit(f"Gruppen {g['id']}: åldern har källa utan citat eller tvärtom")
        if g["alder_kalla"] is not None and g["alder_kalla"] not in kallor:
            raise SystemExit(f"Gruppen {g['id']}: ålderskällan finns inte")
    return ut


def kontrollera_sommarjobb(sj, kallor):
    grupper = kontrollera_grupper(sj["grupper"], kallor)
    sedda = set()
    for u in sj["uppgifter"]:
        namn = f"{u.get('ar')} {u.get('grupp')} ({u.get('kalla')})"
        if u["grupp"] not in grupper:
            raise SystemExit(f"{namn}: okänd grupp")
        if u["kalla"] not in kallor:
            raise SystemExit(f"{namn}: källan finns inte")
        if (u["ar"], u["grupp"]) in sedda:
            raise SystemExit(f"{namn}: gruppen har redan en uppgift det året")
        sedda.add((u["ar"], u["grupp"]))
        for falt in ("varde", "behov", "tillganglighet"):
            if falt not in u:
                continue
            if not isinstance(u[falt], int) or u[falt] < 0:
                raise SystemExit(f"{namn}: {falt} ska vara ett heltal")
            if not star_i(u[falt], u["citat"]):
                raise SystemExit(f"{namn}: {u[falt]} står inte i citatet")


def kontrollera_noter(noter, kallor):
    for n in noter:
        namn = f"Noten {n.get('ar')} {n.get('matt')} ({n.get('kalla')})"
        if n["matt"] not in MATTKODER + ["enkat"]:
            raise SystemExit(f"{namn}: okänt mått")
        if n["kalla"] not in kallor:
            raise SystemExit(f"{namn}: källan finns inte")
        for tal in re.findall(r"\d+", n["text"]):
            if not star_i(int(tal), n["citat"]):
                raise SystemExit(f"{namn}: {tal} står inte i citatet")


def kontrollera_forvaltningar(rader, kallor):
    sedda = set()
    for u in rader:
        namn = f"{u.get('forvaltning')} {u.get('ar')} ({u.get('kalla')})"
        if u["kalla"] not in kallor:
            raise SystemExit(f"{namn}: källan finns inte")
        if (u["forvaltning"], u["ar"]) in sedda:
            raise SystemExit(f"{namn}: förvaltningen har redan ett tal det året")
        sedda.add((u["forvaltning"], u["ar"]))
        if not isinstance(u["varde"], int) or not star_i(u["varde"], u["citat"]):
            raise SystemExit(f"{namn}: {u['varde']} står inte i citatet")


def kontrollera(indata):
    kallor = kontrollera_kallor(indata["kallor"])
    sedda = {}
    for u in indata["uppgifter"]:
        kontrollera_uppgift(u, kallor)
        nyckel = (u["ar"], u["matt"], u["kalla"])
        if nyckel in sedda:
            raise SystemExit(f"{u['ar']} {u['matt']}: källan {u['kalla']} ger två tal")
        sedda[nyckel] = u
    kontrollera_enkat(indata["enkat"], kallor)
    kontrollera_sommarjobb(indata["sommarjobb"], kallor)
    kontrollera_noter(indata["noter"], kallor)
    kontrollera_forvaltningar(indata["forvaltningar"], kallor)
    sj = indata["sommarjobb"]
    anvanda = ({u["kalla"] for u in indata["uppgifter"]} | {a["kalla"] for a in indata["enkat"]["ar"]}
               | {u["kalla"] for u in sj["uppgifter"]}
               | {n["kalla"] for n in indata["noter"]}
               | {u["kalla"] for u in indata["forvaltningar"]}
               | {g["alder_kalla"] for g in sj["grupper"] if g["alder_kalla"]})
    for k in kallor:
        if k not in anvanda:
            raise SystemExit(f"Källan {k} används inte")
    return kallor


def bygg(indata):
    kallor = kontrollera(indata)
    ar = sorted({u["ar"] for u in indata["uppgifter"]})
    ar = list(range(ar[0], ar[-1] + 1))
    # Källorna numreras i den ordning de först används i tabellen, år för
    # år och mått för mått, så att sidans fotnoter går 1, 2, 3 …
    nummer = {}

    def nr(k):
        return nummer.setdefault(k, len(nummer) + 1)

    varden = {m: {} for m in MATTKODER}
    for a in ar:
        for m in MATTKODER:
            us = [u for u in indata["uppgifter"] if u["ar"] == a and u["matt"] == m]
            if not us:
                varden[m][str(a)] = None
                continue
            tal = sorted({u["varde"] for u in us})
            varden[m][str(a)] = {
                "lag": tal[0], "hog": tal[-1], "olika": len(tal) > 1,
                "uppgifter": [
                    {"varde": t, "kallor": sorted(nr(u["kalla"]) for u in us if u["varde"] == t)}
                    for t in tal
                ],
            }
    noter = {m: {} for m in MATTKODER + ["enkat"]}

    def lagg_till_noter(m, a):
        ns = [{"text": n["text"], "kalla": nr(n["kalla"])}
              for n in indata["noter"] if n["ar"] == a and n["matt"] == m]
        if ns:
            noter[m][str(a)] = ns

    for a in ar:
        for m in MATTKODER:
            lagg_till_noter(m, a)
    enkat = {
        "fragor": indata["enkat"]["fragor"],
        "ar": [{"ar": a["ar"], "kalla": nr(a["kalla"]), "medel": a["medel"]}
               for a in sorted(indata["enkat"]["ar"], key=lambda a: a["ar"])],
    }
    for a in enkat["ar"]:
        lagg_till_noter("enkat", a["ar"])
    sj = indata["sommarjobb"]
    sj_ar = sorted({u["ar"] for u in sj["uppgifter"]})
    sj_ar = list(range(sj_ar[0], sj_ar[-1] + 1))
    # Tabellen läses grupp för grupp, så numreras källorna också så.
    sj_varden = {}
    for g in sj["grupper"]:
        sj_varden[g["id"]] = {}
        for a in sj_ar:
            u = next((u for u in sj["uppgifter"] if u["grupp"] == g["id"] and u["ar"] == a), None)
            sj_varden[g["id"]][str(a)] = u and {
                "varde": u["varde"], "behov": u.get("behov"),
                "tillganglighet": u.get("tillganglighet"),
                "anmarkning": u.get("anmarkning"), "kalla": nr(u["kalla"]),
            }
    grupper = [
        {"id": g["id"], "namn": g["namn"], "forklaring": g["forklaring"], "alder": g["alder"],
         "alder_kalla": nr(g["alder_kalla"]) if g["alder_kalla"] else None}
        for g in sj["grupper"]
    ]
    forvaltningar = bygg_forvaltningar(indata["forvaltningar"], nr)
    return {
        "hamtad": indata["hamtad"],
        "ar": ar,
        "matt": [{"id": i, "namn": n, "forklaring": f} for i, n, f in MATT],
        "varden": varden,
        "noter": noter,
        "enkat": enkat,
        "sommarjobb": {"ar": sj_ar, "grupper": grupper, "varden": sj_varden},
        "forvaltningar": forvaltningar,
        "kallor": [
            {"nr": nummer[k], "namnd": kallor[k]["namnd"], "rubrik": kallor[k]["rubrik"],
             "mote": kallor[k]["mote"],
             "sida": kallor[k]["sida"], "url": kallor[k]["url"],
             "original": kallor[k]["original"]}
            for k in sorted(nummer, key=nummer.get)
        ],
    }


def bygg_forvaltningar(rader, nr):
    ar = sorted({u["ar"] for u in rader})
    ar = list(range(ar[0], ar[-1] + 1))
    # Förvaltningen med flest feriearbetare först
    namn = sorted({u["forvaltning"] for u in rader},
                  key=lambda f: (-sum(u["varde"] for u in rader if u["forvaltning"] == f), f))
    ut = []
    for f in namn:
        varden = {}
        for a in ar:
            u = next((u for u in rader if u["forvaltning"] == f and u["ar"] == a), None)
            varden[str(a)] = u and {"varde": u["varde"], "ungefar": u.get("ungefar", False),
                                    "kalla": nr(u["kalla"])}
        ut.append({"namn": f, "varden": varden})
    return {"ar": ar, "rader": ut}


# Kolada-nyckeltalet för åldern den 31 december året före sommaren
ARSKULLAR = [("feriejobb", "N01832"), ("sjuttonaringar", "N01833")]
KOMMUNKOD = "1384"


def arskullar(kolada, ar):
    serier = {n["kolada"]: n["omraden"][KOMMUNKOD] for n in kolada["nyckeltal"]}

    def antal(nyckeltal, a):
        v = serier[nyckeltal].get(str(a - 1))
        return None if v is None else int(v)

    return {
        "matt": kolada["matt"], "kalla": kolada["kalla"], "kallaUrl": kolada["kallaUrl"],
        "hamtad": kolada["hamtad"],
        "varden": {namn: {str(a): antal(n, a) for a in ar} for namn, n in ARSKULLAR},
    }


def las_kolada():
    return json.loads(KOLADA.read_text(encoding="utf-8"))


def bygg_fil(indata, kolada):
    ut = bygg(indata)
    ut["arskullar"] = arskullar(kolada, ut["ar"])
    return ut


def main():
    ut = bygg_fil(las_indata(), las_kolada())
    UT.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    olika = sum(1 for m in ut["varden"].values() for v in m.values() if v and v["olika"])
    print(f"Skrev {UT.relative_to(ROT)}: {ut['ar'][0]}–{ut['ar'][-1]}, "
          f"{len(ut['kallor'])} källor, {olika} år där källorna anger olika tal")


if __name__ == "__main__":
    main()
