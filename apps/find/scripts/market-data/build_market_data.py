#!/usr/bin/env python3
"""Build the public market-price data served by Z Find (FR/BE/LU).

Inputs (ZFIND_MARKET_SOURCES directory, produced by the quarterly extraction):
  fr_prix_m2_dvf.csv            DVF (DGFiP) €/m² quantiles by commune/department/France
  be_prix_communes_statbel.csv  Statbel price quantiles by commune and higher levels
  lu_prix_observatoire.csv      Observatoire de l'Habitat (registered + advertised prices)
  and the reference geography JSON (ZFIND_GEO_JSON) for names and hierarchy.

Output (apps/zfind-web/public/market-data/):
  fr/index.json, fr/dep/<code>.json   France, one file per department
  be/index.json                        Belgium, communes + provinces/regions
  lu/index.json                        Luxembourg, communes + Luxembourg-City districts

Values are arrays [n, p25, median, p75] (FR: €/m²; BE: total price €;
LU: €/m² with the count of sales or adverts). Missing figures are null.
"""

import csv
import json
import os
from collections import defaultdict
from pathlib import Path

SRC = Path(os.environ.get("ZFIND_MARKET_SOURCES", "/home/claude/zfind_marche"))
GEO = Path(os.environ.get("ZFIND_GEO_JSON", "/home/claude/zfind_geo/zfind_geo_fr_be_lu.json"))
OUT = Path(__file__).resolve().parents[2] / "apps" / "zfind-web" / "public" / "market-data"


def num(v):
    v = (v or "").strip()
    if not v:
        return None
    try:
        f = float(v)
    except ValueError:
        return None
    return int(round(f))


def rows(name):
    with open(SRC / name, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f, delimiter=";"))


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return path.stat().st_size


geo = json.loads(GEO.read_text(encoding="utf-8"))
fr_geo, be_geo, lu_geo = geo["countries"]

# ------------------------------------------------------------------ France
dep_of, dep_names, region_of_dep, region_names = {}, {}, {}, {}
for region in fr_geo["regions"]:
    region_names[region["code"]] = region["name_fr"]
    for dep in region["departements"]:
        dep_names[dep["code"]] = dep["name_fr"]
        region_of_dep[dep["code"]] = region["code"]
        communes = [c for a in dep["arrondissements"] for c in a["communes"]]
        communes += dep.get("communes_hors_arrondissement", [])
        for c in communes:
            dep_of[c["code"]] = dep["code"]
            for m in c.get("arrondissements_municipaux", []):
                dep_of[m["code"]] = dep["code"]

TYPE = {"appartement": "A", "maison": "M"}
fr_nat = defaultdict(dict)
fr_dep = defaultdict(lambda: defaultdict(dict))
fr_com = defaultdict(lambda: {"n": None, "A": {}, "M": {}})
periods = set()
for r in rows("fr_prix_m2_dvf.csv"):
    t = TYPE[r["type_bien"]]
    p = r["periode"]
    periods.add(p)
    val = [num(r["nb_ventes"]), num(r["prix_m2_p25"]), num(r["prix_m2_median"]), num(r["prix_m2_p75"])]
    if r["niveau"] == "pays":
        fr_nat[t][p] = val
    elif r["niveau"] == "departement":
        fr_dep[r["code_insee"]][t][p] = val
    else:
        c = fr_com[r["code_insee"]]
        c["n"] = r["nom"]
        c["k"] = "arm" if r["niveau"] == "arrondissement-municipal" else "com"
        c[t][p] = val

fr_periods = sorted(p for p in periods if p.isdigit()) + sorted(p for p in periods if not p.isdigit())
index = {
    "country": "FR",
    "unit": "eur_m2",
    "source": "DVF — DGFiP (data.gouv.fr, Licence Ouverte)",
    "periods": fr_periods,
    "latest": max(p for p in fr_periods if p.isdigit()),
    "national": fr_nat,
    "departments": {
        d: {"name": dep_names[d], "region": region_of_dep[d], "regionName": region_names[region_of_dep[d]],
            "A": fr_dep[d].get("A", {}), "M": fr_dep[d].get("M", {})}
        for d in sorted(dep_names)
    },
    "notUnderDvf": ["57", "67", "68", "976"],
}
sizes = {"fr/index.json": dump(OUT / "fr" / "index.json", index)}
by_dep = defaultdict(list)
for code, c in fr_com.items():
    d = dep_of.get(code)
    if d:
        by_dep[d].append({"c": code, "n": c["n"], "k": c["k"], "A": c["A"], "M": c["M"]})
for d, communes in by_dep.items():
    communes.sort(key=lambda x: x["n"])
    sizes[f"fr/dep/{d}.json"] = dump(OUT / "fr" / "dep" / f"{d}.json", {"department": d, "communes": communes})

# ------------------------------------------------------------------ Belgium
parents = {}
names = {}
for region in be_geo["regions"]:
    names[region["code"]] = region["name_fr"]
    for p in region["provinces"]:
        if p["code"]:
            names[p["code"]] = p["name_fr"]
            parents[p["code"]] = region["code"]
        for a in p["arrondissements"]:
            names[a["code"]] = a["name_fr"]
            parents[a["code"]] = p["code"] or region["code"]
            for c in a["communes"]:
                names[c["code"]] = c["name_fr"] if region["code"] != "2000" else c["name_nl"]
                parents[c["code"]] = a["code"]

# M: all houses, M23: 2-3 façades (closed/semi-closed), M4: 4+ façades (open), A: apartments
BE_TYPES = {"maison (toutes)": "M", "maison 2-3 façades": "M23", "maison 4 façades+": "M4", "appartement": "A"}
be_entries = defaultdict(lambda: {"M": {}, "M23": {}, "M4": {}, "A": {}})
be_periods = set()
for r in rows("be_prix_communes_statbel.csv"):
    t = BE_TYPES.get(r["type_bien"])
    if not t:
        continue
    p = r["periode"]
    year = int(p[:4])
    if year < 2021 or ("-S" in p and year < 2025):
        continue  # five years + the recent semesters
    be_periods.add(p)
    be_entries[(r["niveau"], r["refnis"])][t][p] = [num(r["nb_transactions"]), num(r["prix_p25"]),
                                                    num(r["prix_median"]), num(r["prix_p75"])]
be_periods = sorted(be_periods)
be = {
    "country": "BE",
    "unit": "eur_total",
    "source": "Statbel — actes de vente enregistrés (SPF Finances)",
    "periods": be_periods,
    "latestYear": max(p for p in be_periods if len(p) == 4),
    "latestSemester": max((p for p in be_periods if "-S" in p), default=None),
    "levels": {}
}
for (lvl, code), val in be_entries.items():
    be["levels"].setdefault(lvl, []).append({
        "c": code, "n": names.get(code) or ("Belgique" if lvl == "pays" else code),
        "p": parents.get(code), "M": val["M"], "M23": val["M23"], "M4": val["M4"], "A": val["A"]})
for lvl in be["levels"]:
    be["levels"][lvl].sort(key=lambda x: x["n"])
sizes["be/index.json"] = dump(OUT / "be" / "index.json", be)

# ------------------------------------------------------------------ Luxembourg
lu = {"country": "LU", "unit": "eur_m2",
      "source": "Observatoire de l'Habitat — Ministère du Logement (data.public.lu)",
      "communes": {}, "national": {}, "districts": {}}
canton_of = {c["code"]: canton["name_fr"] for canton in lu_geo["cantons"] for c in canton["communes"]}
for r in rows("lu_prix_observatoire.csv"):
    period = r["periode"]
    if period.isdigit() and int(period) < 2021:
        continue
    key = {"enregistré (actes)": "reg", "annoncé": "ask"}[r["source_prix"]]
    seg = {"appartement existant": "A", "appartement VEFA (neuf)": "N", "appartement": "A", "maison": "M"}[r["type_bien"]]
    val = [num(r["nb"]), num(r["prix_m2"]), num(r["prix_moyen"]), num(r["fourchette_m2_bas"]), num(r["fourchette_m2_haut"])]
    if r["niveau"] == "commune":
        entry = lu["communes"].setdefault(r["code_commune"], {"n": r["nom"], "canton": canton_of.get(r["code_commune"]), "reg": {}, "ask": {}})
    elif r["niveau"] == "pays":
        entry = lu["national"].setdefault("LU", {"reg": {}, "ask": {}})
    else:
        entry = lu["districts"].setdefault(r["nom"], {"reg": {}, "ask": {}})
    entry[key].setdefault(seg, {})[period] = val
sizes["lu/index.json"] = dump(OUT / "lu" / "index.json", lu)

total = sum(sizes.values())
print(f"market-data written to {OUT}: {len(sizes)} files, {total/1024:.0f} KB")
for k in ("fr/index.json", "be/index.json", "lu/index.json", "fr/dep/74.json", "fr/dep/75.json"):
    print(" ", k, sizes.get(k))
