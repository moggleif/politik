#!/usr/bin/env python3
"""Bygger docs/data-kull.json: antagningen ställd mot examen tre år senare.

Läser de två färdigbyggda datafilerna docs/data-meritvarden.json (från
build_meritvarden.py) och docs/data-slutbetyg.json (från
build_slutbetyg.py), så att sammanslagning av namnbyten, skolbyten och
skolenheter bara görs på ett ställe. Kör därför de två skripten först.

En kull är antagningen år X ställd mot avgångseleverna år X+3 — de som
följde programmets normala studiegång. Måtten har olika skalor och får
aldrig jämföras med varandra som tal:

  meritvärdet     summan av grundskolebetygen hos de antagna, max 340
  betygspoängen   genomsnittet av gymnasiebetygen hos avgångarna, max 20

Sidan visar dem därför i skilda paneler med var sin skala. Vad som går
att säga är hur samma program och ungefär samma årskull utvecklats genom
systemet — inte varför.

Parningen görs per program och skola. Båda datafilerna omfattar
Aranäsgymnasiet och Elof Lindälvs gymnasium, och ett meritvärdesprogram
paras med den slutbetygsserie som redovisats på samma skola. Program som
bara finns på den ena sidan listas i utdatan under "oparade", med orsak,
så att sidan kan visa det i klartext.

Körs:  python3 scripts/build_kull.py
"""

import json
from pathlib import Path

from program import FORSKJUTNING, MERIT_MAX, POANG_MAX

ROT = Path(__file__).resolve().parent.parent


def lasa_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def gemensamma_skolor(slut: dict, merit: dict) -> dict:
    """Kortnamn -> fullt namn för de skolor som finns i antagningsdatat.

    Skärningen mellan de två filernas skollistor, så att en skola som bara
    finns i den ena källan inte tas med. Fulla namn hämtas ur
    slutbetygsdatats skollista.
    """
    kort_till_namn = {s["kort"]: s["namn"] for s in slut["skolor"]}
    return {s["kort"]: kort_till_namn[s["kort"]]
            for s in merit["skolor"]
            if s["kort"] in kort_till_namn}


def para_program(merit: dict, slut: dict):
    """Para varje meritvärdesserie med sin slutbetygsserie.

    Regeln: samma program, och meritvärdesseriens hemskola finns bland de
    skolor där slutbetygsserien faktiskt har redovisade värden
    (skolhistoriken). Att gå på "skolar" räcker inte: ett program kan ha
    funnits på en skola utan att någonsin nå tio avgångselever där, och
    då kommer seriens siffror från en annan skola. Returnerar
    (par, meritUtanSlut, slutUtanMerit) där de oparade listas med namn
    för redovisning.
    """
    skolnamn = gemensamma_skolor(slut, merit)
    gemensamma = set(skolnamn.values())

    par = []
    parade_slut = set()
    merit_utan = []
    for mp in merit["program"]:
        hem_fullt = skolnamn.get(mp["hem"])
        kandidater = [
            u for u in slut["utbildningar"]
            if u["program"] == mp["namn"]
            and hem_fullt in {h["skola"] for h in u["skolhistorik"]}
        ]
        if len(kandidater) == 1:
            par.append((mp, kandidater[0]))
            parade_slut.add(id(kandidater[0]))
        else:
            merit_utan.append(mp)

    slut_utan = [
        u for u in slut["utbildningar"]
        if id(u) not in parade_slut
        and set(u["skolar"]) & gemensamma
        and any(v.get("betygspoang") is not None for v in u["varden"].values())
    ]
    return par, merit_utan, slut_utan


def kohorter_for(mp: dict, su: dict, merit: dict, slut: dict) -> list:
    """Kullarna för ett programpar: antagningen år X mot avgången år X+3.

    Varje rad får en status per sida, så att sidan kan skilja på riktiga
    värden, sekretess (dubbelprickning), år utan rapport och år som ännu
    inte hunnit inträffa.
    """
    rader = []
    forsta_ar = min(merit["ar"])
    sista_ar = max(merit["ar"])
    sista_slutar = max(slut["ar"])
    for antagning in range(forsta_ar, sista_ar + 1):
        examen = antagning + FORSKJUTNING

        if antagning not in merit["ar"]:
            m = {"status": "rapport_saknas"}
        else:
            mv = mp["varden"].get(str(antagning))
            if mv is None:
                m = {"status": "ingen_antagning"}
            else:
                m = {"status": "ok", "medel": mv["medel"],
                     "inriktningar": mv["antal"], "skola": mv["skola"]}

        if examen > sista_slutar:
            s = {"status": "framtid"}
        elif examen not in slut["ar"]:
            s = {"status": "rapport_saknas"}
        else:
            sv = su["varden"].get(str(examen))
            if sv is None:
                s = {"status": "ej_redovisad"}
            elif sv.get("betygspoang") is None:
                # Raden finns men är dubbelprickad: färre än tio elever
                s = {"status": "sekretess", "antal": sv.get("antal")}
            else:
                s = {
                    "status": "ok",
                    "betygspoang": sv["betygspoang"],
                    "betygspoangExamen": sv.get("betygspoangExamen"),
                    "andelExamen": sv.get("andelExamen"),
                    "andelGrundlBehorighet": sv.get("andelGrundlBehorighet"),
                    "antal": sv.get("antal"),
                    "skola": sv.get("skola"),
                }

        # Rader där båda sidorna är tomma därför att utbildningen inte
        # fanns säger ingenting — hoppa över dem. Men en saknad rapport
        # mitt i en i övrigt obruten serie ska synas som en lucka, inte
        # försvinna: den raden behålls.
        merit_ar = sorted(int(a) for a in mp["varden"])
        mitt_i_serien = (m["status"] == "rapport_saknas" and merit_ar
                         and merit_ar[0] < antagning < merit_ar[-1])
        if (m["status"] == "ok" or s["status"] in ("ok", "sekretess")
                or mitt_i_serien):
            rader.append({"antagningsar": antagning, "examensar": examen,
                          "antagning": m, "examen": s})
    return rader


def bygg(merit: dict, slut: dict) -> dict:
    par, merit_utan, slut_utan = para_program(merit, slut)

    program = []
    for mp, su in par:
        rader = kohorter_for(mp, su, merit, slut)
        kompletta = [r for r in rader
                     if r["antagning"]["status"] == "ok"
                     and r["examen"]["status"] == "ok"]
        # Ett par utan en enda komplett kull (t.ex. genomgående sekretess
        # de år som skulle kunna jämföras) behålls ändå: sidan visar då
        # tabellen och förklarar varför inget diagram går att rita.
        program.append({
            "namn": mp["namn"],
            "etikett": mp["etikett"],
            "typ": mp["typ"],
            "skolaKort": mp["hem"],
            "slutserie": su["namn"],
            "kohorter": rader,
            "antalKompletta": len(kompletta),
        })

    program.sort(key=lambda p: (-p["antalKompletta"], p["etikett"]))

    return {
        "kommun": merit["kommun"],
        "forskjutning": FORSKJUTNING,
        "meritMax": MERIT_MAX,
        "poangMax": slut.get("maxPoang", POANG_MAX),
        "program": program,
        "oparade": {
            "antagningUtanSlutbetyg": sorted(
                {mp["etikett"] for mp in merit_utan}),
            "slutbetygUtanAntagning": sorted(
                {u["namn"] for u in slut_utan}),
        },
        "meritKallor": {
            "antal": len(merit["kallor"]),
            "forsta": min(k["ar"] for k in merit["kallor"]),
            "sista": max(k["ar"] for k in merit["kallor"]),
            "hamtad": max(k["hamtad"] for k in merit["kallor"]),
        },
        "slutKallor": {
            "antal": len(slut["kallor"]),
            "forsta": min(k["ar"] for k in slut["kallor"]),
            "sista": max(k["ar"] for k in slut["kallor"]),
            "hamtad": max(k["hamtad"] for k in slut["kallor"]),
        },
    }


def main() -> None:
    merit = lasa_json(ROT / "docs" / "data-meritvarden.json")
    slut = lasa_json(ROT / "docs" / "data-slutbetyg.json")

    ut = bygg(merit, slut)

    utfil = ROT / "docs" / "data-kull.json"
    utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n",
                     encoding="utf-8")
    n_kohorter = sum(p["antalKompletta"] for p in ut["program"])
    print(f"Skrev {utfil.name}: {len(ut['program'])} program, "
          f"{n_kohorter} kompletta kullar")
    for etikett in ut["oparade"]["antagningUtanSlutbetyg"]:
        print(f"  utan slutbetygsserie: {etikett}")
    for namn in ut["oparade"]["slutbetygUtanAntagning"]:
        print(f"  utan antagningsserie: {namn}")


if __name__ == "__main__":
    main()
