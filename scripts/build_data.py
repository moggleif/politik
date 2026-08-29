#!/usr/bin/env python3
"""Bygger sidornas datafiler av innehållet i data/.

Läser:
  data/scb/folkmangd_kungsbacka.json   (faktiskt utfall, från fetch_scb.py)
  data/prognoser/prognos_*.json        (en fil per prognosrapport)

Skriver en fil per serie:
  docs/data.json          hela befolkningen
  docs/data-16-19.json    åldersgruppen 16–19 år (gymnasieåldern)

För varje prognos beräknas avvikelsen mot utfallet per målår, samt
träffsäkerheten som funktion av hur många år i förväg prognosen gjordes.

För åldersgruppen 16–19 år byggs dessutom en **kohortframskrivning**: de
barn som redan bor i kommunen blir ett år äldre varje år, så antalet
16–19-åringar om k år är summan av dagens åldersklasser 16−k … 19−k.
Den räknar inte med någon in- eller utflyttning alls och är därför inte
en prognos utan en undre gräns på vad som redan finns. Hur mycket den
historiskt missat, och hur den står sig mot kommunens egen modell vid
samma horisont, räknas fram här och redovisas på sidan.

Skillnaden mellan två framskrivningsårgångar är just den flyttning som
den enkla modellen utelämnar, och den går att mäta: kvoten

    r(a) = N(a+1, år T+1) / N(a, år T)

är hur mycket en åldersklass växer på ett år. Den är påfallande stabil
över åren men starkt åldersberoende – störst för de yngsta, negativ när
18-åringarna flyttar hemifrån. En **kompenserad framskrivning** multiplicerar
därför varje kohort med r(a) längs vägen i stället för att bära den rakt
fram. Den bygger, till skillnad från den enkla, på antagandet att
flyttmönstret består; kvoterna skattas därför alltid ur åren *före*
basåret, så att prövningen bakåt blir ärlig.

Körs:  python3 scripts/build_data.py
"""

import json
import math
from pathlib import Path

ROT = Path(__file__).resolve().parent.parent

# serienyckel -> (utfil, etikett, hur prognosserien hämtas ur en rapportfil,
#                 åldrarna serien omfattar för kohortframskrivningen)
SERIER = {
    "total": ("data.json", "Hela befolkningen", None, None),
    "16-19": ("data-16-19.json", "16–19 år", "16-19", (16, 19)),
}


def lasa_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def serie_ur_rapport(rapport: dict, grupp) -> dict:
    if grupp is None:
        return rapport["prognos"]
    return rapport.get("aldersgrupper", {}).get(grupp, {})


def per_alder(scb: dict) -> dict:
    """SCB:s folkmängd per år och enskild ålder, som heltalsnycklar."""
    return {int(ar): {int(a): v for a, v in rad.items()}
            for ar, rad in scb.get("perAlder", {}).items()}


def framskriv(bas: dict, k: int, aldrar: tuple):
    """Antalet i åldersspannet om k år, räknat ur ett års åldersklasser.

    Den som är a år i dag är a + k år om k år, så gruppen 16–19 år om k år
    består av dagens 16−k … 19−k-åringar. Saknas någon av de åldrarna i
    underlaget går året inte att skriva fram alls – ett halvt svar vore
    värre än inget, eftersom det skulle se ut som en tvär nedgång.

    Bara k ≥ 1 räknas: k = 0 är basåret självt, alltså inte en
    framskrivning utan utfallet."""
    if k < 1:
        return None
    lag, hog = aldrar
    behovs = [a - k for a in range(lag, hog + 1)]
    if any(a < 0 or a not in bas for a in behovs):
        return None
    return sum(bas[a] for a in behovs)


def kohortfel(pa: dict, utfall: dict, aldrar: tuple) -> list:
    """Hur mycket framskrivningen historiskt missat, per horisont.

    Varje år med kända åldersklasser skrivs fram mot varje senare år som
    har ett facit. Skillnaden är i praktiken nettoinflyttningen i de
    åldrarna, plus dödlighet – det är just det framskrivningen medvetet
    utelämnar."""
    per_avstand = {}
    for basar, rad in pa.items():
        for malar in sorted(utfall):
            k = malar - basar
            varde = framskriv(rad, k, aldrar)
            if varde is None:
                continue
            per_avstand.setdefault(k, []).append(
                100.0 * (varde - utfall[malar]) / utfall[malar])
    return [
        {
            "avstand": k,
            "antal": len(v),
            "medelAbsPct": round(sum(abs(x) for x in v) / len(v), 2),
            "medelPct": round(sum(v) / len(v), 2),
        }
        for k, v in sorted(per_avstand.items())
    ]


def kvoter_tom(pa: dict, tom: int, hogsta_alder: int) -> dict:
    """Åldersklassernas årliga tillväxt, skattad ur åren t.o.m. `tom`.

    r(a) = N(a+1, T+1) / N(a, T), sammanvägt som **geometriskt** medel:
    kvoterna multipliceras ihop längs kohortens väg, och då är det den
    multiplikativa mittpunkten som ska användas, inte den aritmetiska.

    `tom` finns för att prövningen bakåt ska bli ärlig: en framskrivning
    gjord år B får bara använda kvoter som gick att räkna ut då."""
    ar = sorted(pa)
    ut = {}
    for a in range(0, hogsta_alder):
        v = [pa[T + 1][a + 1] / pa[T][a]
             for T in ar
             if T + 1 in pa and T + 1 <= tom
             and pa[T].get(a) and pa[T + 1].get(a + 1)]
        if v:
            ut[a] = math.exp(sum(math.log(x) for x in v) / len(v))
    return ut


def kvotprofil(pa: dict, hogsta_alder: int) -> list:
    """Kvoterna per ålder för redovisning, med spridning över åren."""
    ar = sorted(pa)
    ut = []
    for a in range(0, hogsta_alder):
        v = [pa[T + 1][a + 1] / pa[T][a]
             for T in ar
             if T + 1 in pa and pa[T].get(a) and pa[T + 1].get(a + 1)]
        if not v:
            continue
        r = math.exp(sum(math.log(x) for x in v) / len(v))
        ut.append({
            "alder": a,
            "kvot": round(r, 5),
            "nettoPct": round(100 * (r - 1), 2),
            "antal": len(v),
            "minPct": round(100 * (min(v) - 1), 2),
            "maxPct": round(100 * (max(v) - 1), 2),
        })
    return ut


def kompenserad_for(bas: dict, basar: int, aldrar: tuple, kvoter: dict) -> dict:
    """Framskrivningen med varje åldersklass uppräknad med sin kvot.

    En kohort som i dag är a0 år och ska bli m år multipliceras med
    r(a0)·r(a0+1)·…·r(m−1). Saknas någon kvot på vägen skrivs året inte
    fram alls, av samma skäl som den enkla framskrivningen inte gör det."""
    lag, hog = aldrar
    ut = {}
    k = 1
    while True:
        summa = 0.0
        for m in range(lag, hog + 1):
            a0 = m - k
            if a0 < 0 or a0 not in bas:
                return ut
            varde = float(bas[a0])
            for j in range(a0, m):
                if j not in kvoter:
                    return ut
                varde *= kvoter[j]
            summa += varde
        ut[basar + k] = round(summa)
        k += 1


def kohortjamforelse(pa: dict, prognoser: list, utfall: dict, aldrar: tuple) -> list:
    """Kommunens modell mot framskrivningen, vid samma horisont.

    En prognos gjord år P har kommunens folkmängd t.o.m. årsskiftet P−1 att
    utgå från, så framskrivningen får samma utgångspunkt: basåret P−1, och
    den kompenserade dessutom bara kvoter skattade t.o.m. samma år. Bara
    målår där alla tre har ett värde och det finns ett facit räknas, annars
    jämförs de på olika underlag."""
    per_avstand = {}
    for p in prognoser:
        basar = p["prognosAr"] - 1
        bas = pa.get(basar)
        if bas is None:
            continue
        komp = kompenserad_for(bas, basar, aldrar,
                               kvoter_tom(pa, basar, aldrar[1]))
        for ar, varde in p["prognos"].items():
            malar = int(ar)
            if malar not in utfall:
                continue
            kohort = framskriv(bas, malar - basar, aldrar)
            if kohort is None:
                continue
            rad = per_avstand.setdefault(malar - p["prognosAr"],
                                         {"k": [], "p": [], "c": []})
            rad["p"].append(abs(100.0 * (varde - utfall[malar]) / utfall[malar]))
            rad["k"].append(abs(100.0 * (kohort - utfall[malar]) / utfall[malar]))
            # Den kompenserade kräver kvoter hela vägen fram. Saknas de
            # ska raden ändå finnas: jämförelsen mellan kommunen och den
            # enkla framskrivningen står på egna ben.
            if malar in komp:
                rad["c"].append(
                    abs(100.0 * (komp[malar] - utfall[malar]) / utfall[malar]))
    return [
        {
            "avstand": avst,
            "antal": len(v["p"]),
            "kommunAbsPct": round(sum(v["p"]) / len(v["p"]), 2),
            "kohortAbsPct": round(sum(v["k"]) / len(v["k"]), 2),
            "kompenseradAntal": len(v["c"]),
            "kompenseradAbsPct": (round(sum(v["c"]) / len(v["c"]), 2)
                                  if v["c"] else None),
        }
        for avst, v in sorted(per_avstand.items())
    ]


def framskrivning_for(bas: dict, basar: int, aldrar: tuple) -> dict:
    """Hela framskrivningen från ett basår, så långt åldrarna räcker."""
    ut = {}
    k = 1
    while True:
        varde = framskriv(bas, k, aldrar)
        if varde is None:
            return ut
        ut[basar + k] = varde
        k += 1


def kohortargangar(pa: dict, utfall: dict, aldrar: tuple, forsta_basar: int) -> list:
    """En framskrivning per basår – kohortmodellens motsvarighet till
    kommunens prognosårgångar.

    Poängen är att kunna jämföra modellerna på lika villkor: kommunen gör
    en ny prognos varje år, och kohortmodellen kan göra detsamma ur samma
    års åldersklasser. Varje årgång får sina avvikelser mot facit, precis
    som prognosårgångarna."""
    argangar = []
    for basar in sorted(pa):
        if basar < forsta_basar:
            continue
        framskrivning = framskrivning_for(pa[basar], basar, aldrar)
        if not framskrivning:
            continue
        # Kvoterna skattas ur åren FÖRE basåret. Annars vet årgången något
        # om framtiden, och prövningen bakåt mäter ingenting.
        kompenserad = kompenserad_for(pa[basar], basar, aldrar,
                                      kvoter_tom(pa, basar, aldrar[1]))

        avvikelser = {}
        for ar, varde in framskrivning.items():
            if ar in utfall:
                diff = varde - utfall[ar]
                avvikelser[ar] = {
                    "framskrivning": varde,
                    "utfall": utfall[ar],
                    "diff": diff,
                    "pct": round(100.0 * diff / utfall[ar], 2),
                    "avstand": ar - basar,
                }
                if ar in kompenserad:
                    avvikelser[ar]["kompenserad"] = kompenserad[ar]
                    avvikelser[ar]["kompenseradPct"] = round(
                        100.0 * (kompenserad[ar] - utfall[ar]) / utfall[ar], 2)

        v = [a["pct"] for a in avvikelser.values()]
        c = [a["kompenseradPct"] for a in avvikelser.values()
             if "kompenseradPct" in a]
        ettar = [a["pct"] for a in avvikelser.values() if a["avstand"] == 1]
        argangar.append({
            "basAr": basar,
            "sistaAr": max(framskrivning),
            "framskrivning": {str(a): x for a, x in sorted(framskrivning.items())},
            "kompenserad": {str(a): x for a, x in sorted(kompenserad.items())},
            "avvikelser": {str(a): x for a, x in sorted(avvikelser.items())},
            "antal": len(v),
            "medelAbsPct": round(sum(abs(x) for x in v) / len(v), 2) if v else None,
            "medelPct": round(sum(v) / len(v), 2) if v else None,
            "kompenseradAbsPct": round(sum(abs(x) for x in c) / len(c), 2) if c else None,
            "kompenseradPct": round(sum(c) / len(c), 2) if c else None,
            "maxAvstand": max((a["avstand"] for a in avvikelser.values()),
                              default=None),
            "ettArPct": round(ettar[0], 2) if ettar else None,
        })
    return argangar


def bygg_kohort(scb: dict, prognoser: list, utfall: dict, aldrar) -> dict | None:
    """Kohortframskrivningen: vad som redan är fött och redan bor här."""
    if aldrar is None:
        return None
    pa = per_alder(scb)
    if not pa:
        return None

    basar = max(pa)
    bas = pa[basar]
    framskrivning = framskrivning_for(bas, basar, aldrar)
    if not framskrivning:
        return None
    ursprung = {
        ar: [{"alder": a - (ar - basar), "antal": bas[a - (ar - basar)]}
             for a in range(aldrar[0], aldrar[1] + 1)]
        for ar in framskrivning
    }

    # Årgångarna börjar där kommunens prognoser börjar, så att de två
    # modellerna går att ställa mot varandra år för år. En prognos gjord
    # år P hade folkmängden t.o.m. årsskiftet P−1 att utgå från, så den
    # första jämförbara årgången är basåret P−1.
    forsta_basar = (min(p["prognosAr"] for p in prognoser) - 1
                    if prognoser else min(pa))
    argangar = kohortargangar(pa, utfall, aldrar, forsta_basar)

    kvoter = kvoter_tom(pa, basar, aldrar[1])
    kompenserad = kompenserad_for(bas, basar, aldrar, kvoter)

    # Kommunens senaste prognos vid sidan av framskrivningen, år för år.
    senaste = prognoser[-1] if prognoser else None
    mot_senaste = []
    if senaste:
        for ar, varde in sorted(senaste["prognos"].items(), key=lambda x: int(x[0])):
            malar = int(ar)
            if malar in framskrivning:
                mot_senaste.append({
                    "ar": malar,
                    "kommun": varde,
                    "kohort": framskrivning[malar],
                    "diff": varde - framskrivning[malar],
                    "kompenserad": kompenserad.get(malar),
                })

    return {
        "basAr": basar,
        "aldrar": list(aldrar),
        "sistaAr": max(framskrivning),
        "framskrivning": {str(a): v for a, v in sorted(framskrivning.items())},
        "kompenserad": {str(a): v for a, v in sorted(kompenserad.items())},
        "kvoter": kvotprofil(pa, aldrar[1]),
        "kvotAr": [min(pa) + 1, basar],
        "ursprung": {str(a): v for a, v in sorted(ursprung.items())},
        "traffsakerhet": kohortfel(pa, utfall, aldrar),
        "jamforelse": kohortjamforelse(pa, prognoser, utfall, aldrar),
        "forstaBasAr": forsta_basar,
        "argangar": argangar,
        "senastePrognosAr": senaste["prognosAr"] if senaste else None,
        "motSenaste": mot_senaste,
    }


def bygg(scb: dict, rapporter: list, utfall: dict, grupp, etikett: str,
         aldrar=None) -> dict:
    prognoser = []
    for rapport in rapporter:
        rad = serie_ur_rapport(rapport, grupp)
        if not rad:
            continue  # rapporten saknar den här serien, t.ex. annan åldersindelning
        prognos = {int(a): v for a, v in rad.items()}

        avvikelser = {}
        for ar, varde in prognos.items():
            if ar in utfall:
                diff = varde - utfall[ar]
                avvikelser[ar] = {
                    "prognos": varde,
                    "utfall": utfall[ar],
                    "diff": diff,
                    "pct": round(100.0 * diff / utfall[ar], 2),
                    "avstand": ar - rapport["prognosAr"],
                }

        p = {k: v for k, v in rapport.items() if k not in ("prognos", "aldersgrupper")}
        if grupp is not None:
            # åldersgruppssiffrorna står i en annan tabell än totalprognosen
            p["sidhanvisning"] = (
                f'Tabellen "Antal per åldersgrupp" i rapportens bilaga, raden {grupp} år'
            )
        p["prognos"] = {str(k): v for k, v in sorted(prognos.items())}
        p["avvikelser"] = {str(k): v for k, v in sorted(avvikelser.items())}
        prognoser.append(p)

    prognoser.sort(key=lambda p: p["prognosAr"])

    # Träffsäkerhet per avstånd (0 år = prognosens eget startår, 1 år i förväg, ...)
    #
    # Två olika mått, och skillnaden är själva poängen:
    #   medelAbsPct  hur STORT felet är (riktningen borträknad)
    #   medelPct     åt vilket HÅLL felet lutar, med tecken
    # Slumpmässiga fel tar ut varandra och ger medelPct nära noll. Ligger
    # medelPct tydligt skilt från noll är felet systematiskt, alltså något
    # en modell kan korrigera för.
    per_avstand = {}
    for p in prognoser:
        for a in p["avvikelser"].values():
            per_avstand.setdefault(a["avstand"], []).append(a["pct"])
    avstand_lista = [
        {
            "avstand": avst,
            "medelAbsPct": round(sum(abs(x) for x in v) / len(v), 2),
            "maxAbsPct": round(max(abs(x) for x in v), 2),
            "medelPct": round(sum(v) / len(v), 2),
            "antalOver": sum(1 for x in v if x > 0),
            "antal": len(v),
        }
        for avst, v in sorted(per_avstand.items())
        if avst >= 0
    ]

    alla = [a["pct"] for p in prognoser for a in p["avvikelser"].values()]
    skevhet = None
    if alla:
        skevhet = {
            "antal": len(alla),
            "antalOver": sum(1 for x in alla if x > 0),
            "medelPct": round(sum(alla) / len(alla), 2),
            "medelAbsPct": round(sum(abs(x) for x in alla) / len(alla), 2),
        }

    # Skevhet per årgång. En modell kan ha bytt riktning över tid – t.ex.
    # underskattat under en tillväxtperiod och överskattat efter en
    # vändning. Det är en annan sorts fel än en konstant skevhet, och
    # kräver en annan åtgärd, så det redovisas separat.
    # Medelvärdet per årgång blandar horisonter: en gammal årgång har hunnit
    # utvärderas många år framåt, en ny bara på kort sikt. Årgångarna går
    # därför inte att jämföra på det måttet. Felet vid en och samma horisont
    # (ett år framåt) redovisas separat och är det som faktiskt går att följa
    # över tid.
    per_argang = []
    for p in prognoser:
        v = [a["pct"] for a in p["avvikelser"].values()]
        if v:
            ettar = [a["pct"] for a in p["avvikelser"].values() if a["avstand"] == 1]
            per_argang.append({
                "prognosAr": p["prognosAr"],
                "medelPct": round(sum(v) / len(v), 2),
                "antalOver": sum(1 for x in v if x > 0),
                "antal": len(v),
                "maxAvstand": max(a["avstand"] for a in p["avvikelser"].values()),
                "ettArPct": round(ettar[0], 2) if ettar else None,
            })
    if skevhet is not None:
        riktningar = {x["medelPct"] > 0 for x in per_argang}
        skevhet["bytterRiktning"] = len(riktningar) > 1

    return {
        "kommun": scb["kommun"],
        "serie": etikett,
        "utfall": {str(k): v for k, v in sorted(utfall.items())},
        "utfallMeta": {
            "matt": scb["matt"],
            "kalla": scb["kalla"],
            "kallaUrl": scb["kallaUrl"],
            "hamtad": scb["hamtad"],
        },
        "prognoser": prognoser,
        "perAvstand": avstand_lista,
        "perArgang": per_argang,
        "skevhet": skevhet,
        "kohort": bygg_kohort(scb, prognoser, utfall, aldrar),
    }


def main() -> None:
    scb = lasa_json(ROT / "data" / "scb" / "folkmangd_kungsbacka.json")
    rapporter = [lasa_json(f) for f in sorted((ROT / "data" / "prognoser").glob("prognos_*.json"))]

    for nyckel, (utnamn, etikett, grupp, aldrar) in SERIER.items():
        if grupp is None:
            utfall = {int(a): v for a, v in scb["folkmangd"].items()}
        else:
            rad = scb.get("aldersgrupper", {}).get(grupp)
            if not rad:
                print(f"Hoppar över {nyckel}: SCB-utfall saknas")
                continue
            utfall = {int(a): v for a, v in rad.items()}

        ut = bygg(scb, rapporter, utfall, grupp, etikett, aldrar)
        utfil = ROT / "docs" / utnamn
        utfil.write_text(json.dumps(ut, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        n_avv = sum(len(p["avvikelser"]) for p in ut["prognoser"])
        print(
            f"Skrev {utfil.name}: {len(ut['prognoser'])} prognoser, "
            f"{len(utfall)} utfallsår, {n_avv} jämförelsepunkter"
        )
        if ut["kohort"]:
            k = ut["kohort"]
            print(f"  kohortframskrivning: basår {k['basAr']}, "
                  f"{len(k['framskrivning'])} år fram till {k['sistaAr']}; "
                  f"{len(k['argangar'])} årgångar från {k['forstaBasAr']}")


if __name__ == "__main__":
    main()
