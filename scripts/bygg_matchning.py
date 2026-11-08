"""Föreslår vem som stod på vilken plats på valsedlarna 2010, 2014 och 2018,
där Valmyndigheten gallrat namnen. Det är FÖRSLAG med säkerhetsgrad, inte
fakta: inget här skrivs in i personfilerna förrän någon avgjort.

Idén i tre steg:

1. **Länka kandidaturer mellan valen.** Samma person står ofta på samma
   partis lista i två val i rad. Platserna 2010/2014/2018 har ålder (och
   2014/2018 ort och yrke), 2022/2026 har namn, ålder, ort och yrke. Ett par
   (plats i val t, plats i val t+1) får poäng för: ålder +4 år (±1 med
   avdrag), samma ort/yrke-ord, samma kön där båda är kända. Länken godtas
   bara om den är parets bästa åt båda håll (ömsesidig) och tydligt bättre
   än näst bästa. Länkarna ger spår: en person över flera val.
2. **Lägg på namn.** Ett spår som når 2022 eller 2026 får det namnet och
   går därmed bakåt till 2018, 2014 och 2010.
3. **Bekräfta mot protokollen.** Ett föreslaget namn kontrolleras mot de
   namn som står för partiet i kommunens protokoll för perioden: fullmäktiges
   närvarologg första mötet (2014, 2022), valbesluten och närvarolistorna.
   Finns namnet inte där är förslaget märkt `ej_i_protokoll`. För de 61
   valda 2014 används loggens namnlista dessutom som begränsning: de som
   inte fått namn av stegen ovan fördelas bland de loggade namn som inte
   redan är placerade, och bara det som då är entydigt (per parti, med ålder
   där den är känd) föreslås.

Träffsäkerheten mäts på 2022→2026, där namn finns i båda valen: samma
metod körs utan att titta på namnen, och förslagen jämförs med att namnet är
detsamma. Resultatet sparas i filen (`kalibrering`) och bestämmer vad
"stark" och "möjlig" betyder.

Skriver data/matchning/forslag.json.
Körs: python3 scripts/bygg_matchning.py
"""

import json
import re
import sys
import unicodedata
from collections import Counter
from datetime import date
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent
DATA = ROT / "data"
UT = DATA / "matchning"
VAL = [2010, 2014, 2018, 2022, 2026]
PARTI_AB = {
    "Moderaterna": "M", "Moderata Samlingspartiet": "M",
    "Arbetarepartiet-Socialdemokraterna": "S", "Centerpartiet": "C",
    "Liberalerna (tidigare Folkpartiet)": "L", "Folkpartiet liberalerna": "L",
    "Kristdemokraterna": "KD", "Miljöpartiet de gröna": "MP",
    "Sverigedemokraterna": "SD", "Vänsterpartiet": "V", "Kungsbackaborna": "KB",
}
ALLMANNA = {"kungsbacka", "pensionar", "pensionär", "student", "egen foretagare", "egenforetagare"}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]+", " ", s.casefold()).strip()


def nyckel(namn: str) -> str:
    return re.sub(r"\s+", " ", norm(namn.replace("-", " ")))


def alder_ur(k: dict):
    if k.get("alder") is not None:
        return k["alder"]
    m = re.search(r"(\d{2})\s*år", k.get("uppgift") or "") or re.match(r"\s*(\d{2})\b", k.get("uppgift") or "")
    return int(m.group(1)) if m else None


def ord_ur(k: dict) -> set:
    """Ort- och yrkesord ur uppgiftsraden, utan åldern."""
    ut = set()
    for t in re.split(r"[,;/]| och ", k.get("uppgift") or ""):
        t = norm(t)
        if not t or re.fullmatch(r"\d+( ar)?", t):
            continue
        t = re.sub(r"^(f d|fd|tidigare)\s+", "", t)
        ut.add(t)
    return ut


def las_kandidater() -> dict:
    """{val: {parti: [kandidat…]}} med ålder, kön, ord och (2022/2026) namn."""
    ut = {}
    for ar in VAL:
        fil = DATA / "kandidater" / f"{ar}.json"
        if not fil.exists():
            continue
        d = json.loads(fil.read_text(encoding="utf-8"))
        per = {}
        for p in d["partier"]:
            ab = PARTI_AB.get(p["namn"])
            if not ab:
                continue
            per[ab] = [{"val": ar, "parti": ab, "plats": k["plats"], "namn": k.get("namn"),
                        "alder": alder_ur(k), "kon": k.get("kon"), "ord": ord_ur(k),
                        "uppgift": k.get("uppgift")} for k in p["listor"][0]["kandidater"]]
        ut[ar] = per
    return ut


def lasa_bestamda(kand: dict) -> list:
    """Lägger `bestamt` (namn) på de platser som uppdragsgivaren avgjort i
    data/kopplingar_platser.json. Returnerar listan med besluten."""
    fil = DATA / "kopplingar_platser.json"
    if not fil.exists():
        return []
    beslut = json.loads(fil.read_text(encoding="utf-8"))["platser"]
    for b in beslut:
        k = next(k for k in kand[b["val"]][b["parti"]] if k["plats"] == b["plats"])
        k["bestamt"] = b["namn"]
    return beslut


def poang(a: dict, b: dict):
    """Poäng för att b (nästa val) är samma person som a, eller None om det
    är uteslutet. Se modulens docstring."""
    if a["kon"] and b["kon"] and a["kon"] != b["kon"]:
        return None
    p = 0.0
    if a["alder"] is not None and b["alder"] is not None:
        d = b["alder"] - a["alder"]
        if d == 4:
            p += 3
        elif d in (3, 5):
            p += 1
        else:
            return None
    gemensamma = a["ord"] & b["ord"]
    p += sum(0.5 if o in ALLMANNA else 2 for o in gemensamma)
    if a["kon"] and b["kon"]:
        p += 1
    if a["alder"] is None or b["alder"] is None:
        if not gemensamma:
            return None   # utan ålder krävs minst ett gemensamt ord
    return p


def lanka(lista_a: list, lista_b: list, stark: float, mojlig: float) -> list:
    """Ömsesidigt bästa par med tydlig marginal. Returnerar [(a, b, poäng, grad)]."""
    bast_a, bast_b = {}, {}
    for i, a in enumerate(lista_a):
        for j, b in enumerate(lista_b):
            p = poang(a, b)
            if p is None:
                continue
            bast_a.setdefault(i, []).append((p, j))
            bast_b.setdefault(j, []).append((p, i))
    ut = []
    for i, kand in bast_a.items():
        kand.sort(reverse=True)
        p, j = kand[0]
        andra = kand[1][0] if len(kand) > 1 else -1
        rev = sorted(bast_b[j], reverse=True)
        if rev[0][1] != i or (len(rev) > 1 and rev[0][0] - rev[1][0] < 1) or p - andra < 1:
            continue
        grad = "stark" if p >= stark else "möjlig" if p >= mojlig else None
        if grad:
            ut.append((lista_a[i], lista_b[j], p, grad))
    return ut


def kalibrera(kand: dict) -> dict:
    """Kör länkningen 2022→2026 utan namn och jämför med att namnet är detsamma."""
    ut = {}
    for stark, mojlig in ((5, 3),):
        rader = {"stark": [0, 0], "möjlig": [0, 0]}   # [rätt, totalt]
        mojliga = 0
        for parti in kand[2022]:
            if parti not in kand[2026]:
                continue
            a = [dict(k, namn=None) for k in kand[2022][parti]]
            facit = {k["plats"]: k["namn"] for k in kand[2022][parti]}
            b = [dict(k, namn=None) for k in kand[2026][parti]]
            facit_b = {k["plats"]: k["namn"] for k in kand[2026][parti]}
            gemensamt = {nyckel(n) for n in facit.values()} & {nyckel(n) for n in facit_b.values()}
            mojliga += len(gemensamt)
            for x, y, p, grad in lanka(a, b, stark, mojlig):
                rader[grad][1] += 1
                rader[grad][0] += nyckel(facit[x["plats"]]) == nyckel(facit_b[y["plats"]])
        ut = {"par_med_samma_namn_i_bada_valen": mojliga,
              "stark": {"rätt": rader["stark"][0], "totalt": rader["stark"][1]},
              "möjlig": {"rätt": rader["möjlig"][0], "totalt": rader["möjlig"][1]},
              "tröskel_stark": stark, "tröskel_möjlig": mojlig}
    return ut


PERIOD_AV_VAL = {2010: "2011–2014", 2014: "2015–2018", 2018: "2019–2022", 2022: "2023–2026", 2026: "2027–2030"}
PERIOD_AV_PROTOKOLL_AR = {2014: "2015–2018", 2015: "2015–2018", 2022: "2023–2026", 2023: "2023–2026"}


def protokollnamn() -> dict:
    """{(parti, mandatperiod): {nyckel(namn): {källor}}} ur valbeslut,
    närvarolistor och fullmäktiges närvarologg."""
    ut = {}

    def lagg(parti, period, namn, kalla):
        if parti and namn and period:
            ut.setdefault((parti, period), {}).setdefault(nyckel(namn), set()).add(kalla)
    for f in sorted((DATA / "uppdrag").glob("*_val_*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        period = PERIOD_AV_PROTOKOLL_AR.get(int(d["protokoll"]["datum"][:4]))
        for b in d["beslut"]:
            for r in b["poster"]:
                lagg("L" if r["parti"] == "FP" else r["parti"], period, r["namn"],
                     f"valbeslut {d['protokoll']['organ']} {d['protokoll']['datum']}")
    for f in sorted((DATA / "uppdrag").glob("kf_logg_*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        for r in d["ledamoter"]:
            lagg(r["parti"], d["mandatperiod"], r["namn"], f"fullmäktiges närvarologg {d['datum']}")
    narv = DATA / "uppdrag" / "narvaro.json"
    if narv.exists():
        for post in json.loads(narv.read_text(encoding="utf-8"))["poster"]:
            for u in post.get("utlasning", []):
                lagg("L" if u["parti"] == "FP" else u["parti"], post["period"], u["namn"],
                     f"närvaro {post['organ']} {post['datum']}")
    return ut


def bygg_spar(kand: dict) -> dict:
    """Länkar kandidaturer mellan valen. Returnerar {parti: [spår]} där ett spår
    är {val: (kandidat, grad_in)} i tidsordning. 2022→2026 länkas på namn
    (säkert); övriga par med poängen i `lanka`."""
    ut = {}
    for parti in sorted({p for per in kand.values() for p in per}):
        nasta = {}   # (val, plats) -> (val2, plats2, grad, poäng)
        for a_ar, b_ar in ((2010, 2014), (2014, 2018), (2018, 2022)):
            if a_ar in kand and b_ar in kand and parti in kand[a_ar] and parti in kand[b_ar]:
                for a, b, p, grad in lanka(kand[a_ar][parti], kand[b_ar][parti], 5, 3):
                    nasta[(a_ar, a["plats"])] = (b_ar, b["plats"], grad, p)
        if 2022 in kand and 2026 in kand and parti in kand[2022] and parti in kand[2026]:
            per26 = {nyckel(k["namn"]): k for k in kand[2026][parti]}
            for k in kand[2022][parti]:
                m = per26.get(nyckel(k["namn"]))
                if m:
                    nasta[(2022, k["plats"])] = (2026, m["plats"], "namn", None)
        hit = {(v, pl) for (v, pl) in nasta}
        efter = {(v2, pl2) for (v2, pl2, _, _) in nasta.values()}
        index = {(ar, k["plats"]): k for ar, per in kand.items() for k in per.get(parti, [])}
        spar = []
        for nod in sorted(index):
            if nod in efter:
                continue   # inte spårets början
            kedja, grader = [index[nod]], []
            while (kedja[-1]["val"], kedja[-1]["plats"]) in hit:
                v2, pl2, grad, p = nasta[(kedja[-1]["val"], kedja[-1]["plats"])]
                kedja.append(index[(v2, pl2)])
                grader.append({"från": kedja[-2]["val"], "till": v2, "grad": grad, "poäng": p})
            spar.append({"kedja": kedja, "lankar": grader})
        ut[parti] = spar
    return ut


RANG = {"namn": 3, "stark": 2, "möjlig": 1}


def namnge(spar: dict, pn: dict) -> list:
    """Sätter namn på spåren (ur 2022/2026) och kontrollerar mot protokollen."""
    ut = []
    for parti, lista in spar.items():
        for sp in lista:
            namn = [k["namn"] for k in sp["kedja"] if k.get("namn")] + \
                [k["bestamt"] for k in sp["kedja"] if k.get("bestamt")]
            unika = {nyckel(n): n for n in namn}
            if not unika:
                continue
            svagast = min((RANG[l["grad"]] for l in sp["lankar"]), default=3)
            grad = {3: "säker", 2: "stark", 1: "möjlig"}[svagast]
            platser = []
            for k in sp["kedja"]:
                period = PERIOD_AV_VAL[k["val"]]
                kallor = sorted(pn.get((parti, period), {}).get(nyckel(namn[0]), []))
                platser.append({"val": k["val"], "plats": k["plats"], "alder": k["alder"], "kon": k["kon"],
                                "sakerhet": "bestämd" if k.get("bestamt") else grad,
                                "uppgift": k["uppgift"], "namn_i_kallan": k["namn"],
                                "i_protokoll": bool(kallor), "protokollkallor": kallor[:3]})
            ut.append({"parti": parti, "namn": namn[-1] if any(k.get("bestamt") for k in sp["kedja"]) else namn[0],
                       "namnkonflikt": sorted(unika.values()) if len(unika) > 1 else None,
                       "sakerhet_bakat": grad, "lankar": sp["lankar"], "platser": platser})
    return ut


def valda_val(ar: int, spar_namn: list, kand: dict) -> list:
    """De 61 valda ett år: namn ur spåren där de finns, kontrollerade mot
    fullmäktiges närvarologg för perioden (första loggen i arkivet).

    Är loggen från *första mötet efter valet* (2014) är den en uttömmande
    lista över de valda: ett spårnamn som inte finns där avvisas, och övriga
    namn fördelas på platserna med ålder som villkor. Är den senare (2010,
    2018) kan ledamöter ha ersatts, så ett spårnamn som saknas i loggen
    avvisas inte (märks bara `ej_i_loggen`), och fördelningen sker inte
    annat än när både namn och plats är unika för varandra (`möjlig`).
    """
    valda = json.loads((DATA / "valda" / f"{ar}.json").read_text(encoding="utf-8"))["ledamoter"]
    period = PERIOD_AV_VAL[ar]
    logg_fil = next((f for f in sorted((DATA / "uppdrag").glob("kf_logg_*.json"))
                     if json.loads(f.read_text(encoding="utf-8"))["mandatperiod"] == period), None)
    if logg_fil is None:
        return []
    lg = json.loads(logg_fil.read_text(encoding="utf-8"))
    exhaustiv = lg["forsta_motet_efter_valet"]
    logg = lg["ledamoter"]
    obestamda = [r["namn"] for r in logg if r["parti"] == "-"]
    # Åldrar för namngivna personer ur andra val än det som löses: namnlistorna 2022/2026 och
    # de platser som uppdragsgivaren bekräftat för övriga val. alder_senare[namn] = [(år, ålder)].
    alder_senare = {}
    for sen in (2022, 2026):
        for lista in kand.get(sen, {}).values():
            for k in lista:
                if k["alder"] is not None and k["namn"]:
                    alder_senare.setdefault(nyckel(k["namn"]), []).append((sen, k["alder"]))
    bek_fil = DATA / "matchning" / "bekraftade.json"
    if bek_fil.exists():
        for b in json.loads(bek_fil.read_text(encoding="utf-8"))["platser"]:
            if b["val"] == ar or b["val"] not in kand:
                continue
            k = next((k for k in kand[b["val"]].get(b["parti"], []) if k["plats"] == b["plats"]), None)
            if k and k["alder"] is not None:
                alder_senare.setdefault(nyckel(b["namn"]), []).append((b["val"], k["alder"]))
    namn_i_spar = {}
    for sp in spar_namn:
        if sp["avvisad_av_protokoll"]:
            continue
        for pl in sp["platser"]:
            if pl["val"] == ar:
                namn_i_spar[(sp["parti"], pl["plats"])] = (sp["namn"], pl["sakerhet"])

    def villkor(namn, r):
        # förväntad ålder det här valåret = ålder det andra året + (detta år − andra året)
        return all(abs((a + (ar - sen)) - r["alder"]) <= 1 for sen, a in alder_senare.get(nyckel(namn), []))
    ut = []
    for parti in sorted({r["parti"] for r in valda}):
        pos = [r for r in valda if r["parti"] == parti]
        namnlista = [r["namn"] for r in logg if r["parti"] == parti]
        if len(namnlista) < len(pos):
            namnlista += obestamda   # ledamöter utan parti i loggen kan höra hit
        nycklar = {nyckel(n): n for n in namnlista}
        fasta, rest_pos, avvisade = {}, [], {}
        for r in pos:
            fn = namn_i_spar.get((parti, r["listplats"]))
            if fn and nyckel(fn[0]) in nycklar:
                fasta[r["listplats"]] = (nycklar[nyckel(fn[0])], fn[1], "spår + närvarologg")
            elif fn and not exhaustiv:
                fasta[r["listplats"]] = (fn[0], fn[1], "spår, ej i loggen (kan ha lämnat)")
            else:
                if fn:
                    avvisade[r["listplats"]] = fn[0]   # finns inte bland de 61 valda: länken är fel
                rest_pos.append(r)
        kvar = [n for n in namnlista if nyckel(n) not in {nyckel(v[0]) for v in fasta.values()}]
        kandidater = {n: [r["listplats"] for r in rest_pos if villkor(n, r)] for n in kvar}
        tilldelat = {}
        if exhaustiv:
            ändrat = True
            while ändrat:
                ändrat = False
                for n, ps in list(kandidater.items()):
                    ps = [q for q in ps if q not in tilldelat]
                    kandidater[n] = ps
                    if len(ps) == 1 and n not in tilldelat.values():
                        tilldelat[ps[0]] = n
                        ändrat = True
                for r in rest_pos:
                    if r["listplats"] in tilldelat:
                        continue
                    möjliga = [n for n in kvar if n not in tilldelat.values() and r["listplats"] in kandidater[n]]
                    if len(möjliga) == 1:
                        tilldelat[r["listplats"]] = möjliga[0]
                        ändrat = True
        for r in pos:
            pl = r["listplats"]
            post = {"parti": parti, "listplats": pl, "alder": r["alder"], "kon": r["kon"], "mandat": r["mandat"],
                    "personvald": r["personvald"]}
            möj = sorted(n for n in kvar if n not in tilldelat.values() and pl in kandidater[n])
            if pl in fasta:
                post.update({"namn_forslag": fasta[pl][0], "sakerhet": fasta[pl][1], "grund": fasta[pl][2]})
            elif pl in tilldelat:
                post.update({"namn_forslag": tilldelat[pl], "sakerhet": "stark", "grund":
                             "närvarologgens namn + ålder utesluter övriga platser"})
            elif not exhaustiv and len(möj) == 1 and sum(1 for q in rest_pos if möj[0] in
                                                          [n for n in kvar if q["listplats"] in kandidater[n]]) == 1:
                post.update({"namn_forslag": möj[0], "sakerhet": "möjlig", "grund": "unikt par namn–plats (ålder)"})
            else:
                post.update({"namn_forslag": None, "sakerhet": None, "grund": "flera möjliga namn", "mojliga_namn": möj})
            if pl in avvisade:
                post["avvisat_forslag"] = avvisade[pl]
            ut.append(post)
    return ut


def skriv_bekraftade(namngivna: list, valda: dict) -> None:
    """Fryser nuvarande förslag som bekräftade (görs bara med --bekrafta, efter
    att uppdragsgivaren godkänt dem). Avvisade förslag tas inte med."""
    poster = {}
    for sp in namngivna:
        if sp["avvisad_av_protokoll"]:
            continue
        for pl in sp["platser"]:
            if pl["namn_i_kallan"] is None:
                poster[(sp["parti"], pl["val"], pl["plats"])] = {
                    "parti": sp["parti"], "val": pl["val"], "plats": pl["plats"], "namn": sp["namn"],
                    "sakerhet": pl["sakerhet"], "grund": "spår"}
    for ar, rs in valda.items():
        for r in rs:
            if r["namn_forslag"] and (r["parti"], ar, r["listplats"]) not in poster:
                poster[(r["parti"], ar, r["listplats"])] = {
                    "parti": r["parti"], "val": ar, "plats": r["listplats"], "namn": r["namn_forslag"],
                    "sakerhet": r["sakerhet"], "grund": r["grund"]}
    (UT / "bekraftade.json").write_text(json.dumps({
        "forklaring": "Namnförslag som uppdragsgivaren bekräftat (\"alla namn du har stämmer\", 2026-11-08). "
                      "Frysta: byggs inte om av bygg_matchning.py utan --bekrafta. Avvisade förslag ingår inte.",
        "bekraftat_av": "uppdragsgivaren", "bekraftat": "2026-11-08",
        "platser": [poster[k] for k in sorted(poster, key=lambda k: (k[0], k[1], k[2]))]},
        ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Bekräftade: {len(poster)} platser (data/matchning/bekraftade.json)")


def main() -> None:
    kand = las_kandidater()
    kal = kalibrera(kand)
    bestamda = lasa_bestamda(kand)
    pn = protokollnamn()
    spar = bygg_spar(kand)
    namngivna = namnge(spar, pn)
    for sp in namngivna:
        sp["avvisad_av_protokoll"] = False
    valda = {2014: valda_val(2014, namngivna, kand)}
    avvisade = {(r["parti"], r["listplats"], r["avvisat_forslag"]) for r in valda[2014] if "avvisat_forslag" in r}
    for sp in namngivna:
        # En länk som protokollet visat vara fel för 2014 smittar resten av spåret.
        sp["avvisad_av_protokoll"] = any((sp["parti"], pl["plats"], sp["namn"]) in avvisade
                                         for pl in sp["platser"] if pl["val"] == 2014)
    valda[2010] = valda_val(2010, namngivna, kand)
    valda[2018] = valda_val(2018, namngivna, kand)
    valda = {ar: valda[ar] for ar in (2010, 2014, 2018)}
    # statistik
    stat = {}
    for sp in namngivna:
        if sp["avvisad_av_protokoll"]:
            continue
        for pl in sp["platser"]:
            if pl["namn_i_kallan"] is None:
                g = pl["sakerhet"] if pl["sakerhet"] == "bestämd" else sp["sakerhet_bakat"]
                stat.setdefault(pl["val"], {}).setdefault(g, 0)
                stat[pl["val"]][g] += 1
    totalt = {ar: sum(len(v) for v in per.values()) for ar, per in kand.items()}
    print("Kalibrering 2022→2026:", json.dumps(kal, ensure_ascii=False))
    for ar in (2010, 2014, 2018):
        print(f"{ar}: {totalt[ar]} platser; med namnförslag {sum(stat.get(ar, {}).values())} {stat.get(ar, {})}")
    for ar, rs in valda.items():
        print(f"Valda {ar}: {sum(1 for r in rs if r['namn_forslag'])}/{len(rs)} med namnförslag", dict(Counter(r["grund"] for r in rs)))
    UT.mkdir(parents=True, exist_ok=True)
    if "--bekrafta" in sys.argv:
        skriv_bekraftade(namngivna, valda)
    (UT / "forslag.json").write_text(json.dumps({
        "byggd": date.today().isoformat(),
        "forklaring": "Förslag, inte fakta. Se scripts/bygg_matchning.py. Säkerhet: säker (namn i båda valen), stark, möjlig.",
        "kalibrering": kal, "bestamda_platser": bestamda, "platser_totalt": totalt, "statistik_namnforslag": stat,
        "spar": [{k: v for k, v in sp.items()} for sp in namngivna], "valda": {str(a): r for a, r in valda.items()}},
        ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
