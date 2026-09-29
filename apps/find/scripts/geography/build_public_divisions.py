"""Build the public division files of the Z Find market pages (FR / BE / LU).

Input : zfind_geo_fr_be_lu.json from build_geo_reference.py (ZFIND_GEO_REFERENCE)
        + the published market-data files (prices are joined in by official code).
Output: apps/zfind-web/public/geo/
          fr/index.json         regions -> departments (+ department price)
          fr/dep/<code>.json    every commune of the department (+ commune price)
          be.json               regions -> provinces -> arrondissements -> communes
          lu.json               cantons -> communes (+ Luxembourg-City districts)

Compact keys: c code, n name, s slug, cp postal codes, p population,
pa / pm apartment / house figure of the latest published period.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, "..", "..", "apps", "zfind-web"))
REF = os.environ.get("ZFIND_GEO_REFERENCE", "/home/claude/zfind_geo/zfind_geo_fr_be_lu.json")
MD = os.path.join(WEB, "public", "market-data")
OUT = os.path.join(WEB, "public", "geo")


def dump(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def load(path):
    with open(os.path.join(MD, path), encoding="utf-8") as f:
        return json.load(f)


def median(values, *periods):
    """Median figure of the first available period (entries are [n, p25, p50, p75])."""
    for per in periods:
        e = (values or {}).get(per)
        if e and e[2] is not None:
            return e[2]
    return None


ref = json.load(open(REF, encoding="utf-8"))
fr, be, lu = ref["countries"]
stats = {"fr_communes": 0, "fr_priced": 0, "be_communes": 0, "lu_communes": 0}

# ---------------- France ----------------
fr_md = load("fr/index.json")
latest = fr_md["latest"]
regions = []
for r in fr["regions"]:
    deps = []
    for d in r["departements"]:
        code = d["code"]
        try:
            dep_md = {x["c"]: x for x in load(f"fr/dep/{code}.json")["communes"]}
        except FileNotFoundError:
            dep_md = {}
        communes = []
        pool = [c for a in d["arrondissements"] for c in a["communes"]] + d.get("communes_hors_arrondissement", [])
        for c in sorted(pool, key=lambda c: c["name"]):
            m = dep_md.get(c["code"], {})
            row = {"c": c["code"], "n": c["name"], "s": c["slug"], "cp": c["postal_codes"],
                   "p": c.get("population"),
                   "pa": median(m.get("A"), latest, "2024-2025"),
                   "pm": median(m.get("M"), latest, "2024-2025")}
            subs = c.get("arrondissements_municipaux")
            if subs:
                row["arr"] = [{"c": x["code"], "n": x["name"], "s": x["slug"], "cp": x["postal_codes"],
                               "pa": median(dep_md.get(x["code"], {}).get("A"), latest, "2024-2025"),
                               "pm": median(dep_md.get(x["code"], {}).get("M"), latest, "2024-2025")}
                              for x in subs]
            communes.append(row)
            stats["fr_communes"] += 1
            stats["fr_priced"] += row["pa"] is not None or row["pm"] is not None
        dm = fr_md["departments"].get(code, {})
        deps.append({"c": code, "n": d["name_fr"], "en": d["name_en"], "s": d["slug"],
                     "count": len(communes),
                     "pa": median(dm.get("A"), latest, "2024-2025"),
                     "pm": median(dm.get("M"), latest, "2024-2025")})
        dump(os.path.join(OUT, "fr", "dep", f"{code}.json"),
             {"department": code, "name": d["name_fr"], "region": r["code"], "latest": latest,
              "communes": communes})
    regions.append({"c": r["code"], "n": r["name_fr"], "en": r["name_en"], "s": r["slug"],
                    "overseas": r["overseas"], "deps": deps})
dump(os.path.join(OUT, "fr", "index.json"),
     {"country": "FR", "latest": latest, "priceUnit": "eur_m2", "regions": regions})

# ---------------- Belgium ----------------
be_md = load("be/index.json")
year = be_md["latestYear"]
be_price = {}
for level in be_md["levels"].values():
    for x in level:
        be_price[x["c"]] = (median(x.get("A"), year), median(x.get("M"), year))


def be_prices(code):
    pa, pm = be_price.get(code, (None, None))
    return {"pa": pa, "pm": pm}


be_regions = []
for r in be["regions"]:
    provinces = []
    for p in r["provinces"]:
        arrs = []
        for a in p["arrondissements"]:
            communes = []
            for c in sorted(a["communes"], key=lambda c: c["name_fr"]):
                communes.append(dict({"c": c["code"], "n": c["name_fr"], "nl": c["name_nl"],
                                      "local": c["name_local"], "s": c["slug"], "cp": c["postal_codes"],
                                      "loc": sorted({l["name"] for l in c["localities"] if not l["main"]})},
                                     **be_prices(c["code"])))
                stats["be_communes"] += 1
            arrs.append(dict({"c": a["code"], "n": a["name_fr"], "s": a["slug"], "communes": communes},
                             **be_prices(a["code"])))
        provinces.append(dict({"c": p["code"], "n": p["name_fr"], "en": p["name_en"], "s": p["slug"],
                               "arrondissements": arrs}, **be_prices(p["code"] or r["code"])))
    be_regions.append(dict({"c": r["code"], "n": r["name_fr"], "en": r["name_en"], "nl": r["name_nl"],
                            "s": r["slug"], "provinces": provinces}, **be_prices(r["code"])))
dump(os.path.join(OUT, "be.json"),
     {"country": "BE", "latestYear": year, "priceUnit": "eur_total", "regions": be_regions})

# ---------------- Luxembourg ----------------
lu_md = load("lu/index.json")


def last12(values):
    for k, v in (values or {}).items():
        if not k.isdigit():
            return v[1] if v else None
    return None


cantons = []
for cant in lu["cantons"]:
    communes = []
    for c in sorted(cant["communes"], key=lambda c: c["name"]):
        m = (lu_md.get("communes") or {}).get(c["code"], {})
        communes.append({"c": c["code"], "n": c["name"], "s": c["slug"], "cp": c["postal_codes"],
                         "loc": [l["name"] for l in c["localities"] if l["name"] != c["name"]],
                         "pa": last12((m.get("reg") or {}).get("A")) or last12((m.get("ask") or {}).get("A")),
                         "pm": last12((m.get("ask") or {}).get("M"))})
        stats["lu_communes"] += 1
    cantons.append({"c": cant["code"], "n": cant["name_fr"], "en": cant["name_en"], "s": cant["slug"],
                    "communes": communes})
districts = sorted((lu_md.get("districts") or {}).keys())
dump(os.path.join(OUT, "lu.json"),
     {"country": "LU", "priceUnit": "eur_m2", "cantons": cantons, "districts": districts})

print(json.dumps(stats))
if stats["fr_communes"] < 34000 or stats["be_communes"] != 565 or stats["lu_communes"] != 100:
    sys.exit("DIVISIONS: unexpected counts")
