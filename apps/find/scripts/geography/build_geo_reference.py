"""Build the Z Find reference geography for France, Belgium and Luxembourg.

Inputs (ZFIND_GEO_SOURCES directory):
  package/            npm pack @etalab/decoupage-administratif@6.0.0 (INSEE COG, La Poste)
  vocab-belgif/       git clone github.com/belgif/vocab-belgif (REFNIS 2019/2025)
  belgium-zipcodes/   git clone github.com/rubenv/belgium-zipcodes (legacy 2013
                      bpost list, used only to resolve Flemish postal rows)
  be_postal_odwb.csv  ODWB "code-postaux-belge" export (2026)
  lu/zipcodes.lu.csv  Post Luxembourg postal codes via GeoNames
                      (github.com/zauberware/postal-codes-json-xml-csv, LU.zip)

Outputs (ZFIND_GEO_OUT directory): zfind_geo_fr_be_lu.json and CSV extracts.
The JSON feeds build_geography_migration.py.

REFNIS 2025 draft corrections and postal-source fixes are documented inline.
"""
import json, csv, re, unicodedata, collections, os

BASE = os.environ.get("ZFIND_GEO_SOURCES", "/home/claude/geo")
OUT = os.environ.get("ZFIND_GEO_OUT", "/home/claude/zfind_geo")
os.makedirs(OUT, exist_ok=True)


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")


def uniq_slugs(items, key_name, key_code, suffix):
    """Slug unique dans un même parent : ajoute un suffixe si doublon."""
    cnt = collections.Counter(slug(i[key_name]) for i in items)
    for i in items:
        s = slug(i[key_name])
        i["slug"] = s if cnt[s] == 1 else f"{s}-{suffix(i)}"


# =====================================================================
# FRANCE
# =====================================================================
REG_EN = {"53": "Brittany", "94": "Corsica", "28": "Normandy", "03": "French Guiana",
          "04": "Réunion"}
DEPT_EN = {"973": "French Guiana", "974": "Réunion"}

P = f"{BASE}/package/data"
fr_regions = [r for r in json.load(open(f"{P}/regions.json")) if r["zone"] in ("metro", "drom")]
fr_reg_codes = {r["code"] for r in fr_regions}
fr_depts = [d for d in json.load(open(f"{P}/departements.json")) if d["region"] in fr_reg_codes]
fr_arr = [a for a in json.load(open(f"{P}/arrondissements.json")) if a["region"] in fr_reg_codes]
fr_com_all = [c for c in json.load(open(f"{P}/communes.json")) if c.get("region") in fr_reg_codes]

fr_com = [c for c in fr_com_all if c["type"] == "commune-actuelle"]
fr_arrmun = [c for c in fr_com_all if c["type"] == "arrondissement-municipal"]
fr_old = [c for c in fr_com_all if c["type"] in ("commune-deleguee", "commune-associee")]

dept_by = {d["code"]: d for d in fr_depts}
reg_by = {r["code"]: r for r in fr_regions}
arr_by = {a["code"]: a for a in fr_arr}
com_by = {c["code"]: c for c in fr_com}

# slugs uniques par département
for dcode in dept_by:
    uniq_slugs([c for c in fr_com if c["departement"] == dcode], "nom", "code",
               lambda i: i["code"].lower())

rows_admin, rows_com, rows_loc, rows_cp = [], [], [], []

fr_tree = {"code": "FR", "name_fr": "France", "name_en": "France", "slug": "france",
           "levels": ["region", "departement", "arrondissement", "commune"], "regions": []}
for r in sorted(fr_regions, key=lambda r: r["nom"]):
    rs = slug(r["nom"])
    ren = REG_EN.get(r["code"], r["nom"])
    rows_admin.append(["FR", "region", r["code"], "", r["nom"], ren, "", rs,
                       "oui" if r["zone"] == "drom" else "non", "oui"])
    rnode = {"code": r["code"], "name_fr": r["nom"], "name_en": ren, "slug": rs,
             "overseas": r["zone"] == "drom", "active": True, "departements": []}
    for d in sorted([d for d in fr_depts if d["region"] == r["code"]], key=lambda d: d["code"]):
        ds = f"{slug(d['nom'])}-{d['code'].lower()}"
        den = DEPT_EN.get(d["code"], d["nom"])
        rows_admin.append(["FR", "departement", d["code"], r["code"], d["nom"], den, "", ds,
                           "oui" if r["zone"] == "drom" else "non", "oui"])
        dnode = {"code": d["code"], "name_fr": d["nom"], "name_en": den, "slug": ds,
                 "active": True, "arrondissements": []}
        arrs = sorted([a for a in fr_arr if a["departement"] == d["code"]], key=lambda a: a["code"])
        # DROM sans arrondissement renseigné sur certaines communes : groupe "sans"
        for a in arrs:
            rows_admin.append(["FR", "arrondissement", a["code"], d["code"], a["nom"], a["nom"],
                               "", slug(a["nom"]), "oui" if r["zone"] == "drom" else "non", "oui"])
            anode = {"code": a["code"], "name": a["nom"], "slug": slug(a["nom"]), "communes": []}
            dnode["arrondissements"].append(anode)
        a_idx = {a["code"]: a for a in dnode["arrondissements"]}
        for c in sorted([c for c in fr_com if c["departement"] == d["code"]], key=lambda c: c["code"]):
            cps = sorted(c.get("codesPostaux", []))
            cnode = {"code": c["code"], "name": c["nom"], "slug": c["slug"],
                     "postal_codes": cps, "population": c.get("population")}
            subs = [m for m in fr_arrmun if m["commune"] == c["code"]]
            if subs:
                cnode["arrondissements_municipaux"] = [
                    {"code": m["code"], "name": m["nom"], "slug": slug(m["nom"]),
                     "postal_codes": sorted(m.get("codesPostaux", [])),
                     "population": m.get("population")} for m in sorted(subs, key=lambda m: m["code"])]
            key = c.get("arrondissement")
            if key in a_idx:
                a_idx[key]["communes"].append(cnode)
            else:
                dnode.setdefault("communes_hors_arrondissement", []).append(cnode)
            a = arr_by.get(key)
            rows_com.append(["FR", r["code"], r["nom"], d["code"], d["nom"],
                             key or "", a["nom"] if a else "", c["code"], c["nom"], "", "", "",
                             c["slug"], "|".join(cps), c.get("population") or "",
                             "oui" if r["zone"] == "drom" else "non", "oui"])
            for cp in cps:
                rows_cp.append(["FR", cp, c["code"], c["nom"], d["code"]])
        rnode["departements"].append(dnode)
    fr_tree["regions"].append(rnode)

for m in fr_arrmun:
    parent = com_by[m["commune"]]
    rows_loc.append(["FR", "arrondissement-municipal", m["code"], m["nom"], "", "",
                     parent["code"], parent["nom"], m["departement"],
                     "|".join(sorted(m.get("codesPostaux", []))), m.get("population") or ""])
for o in fr_old:
    parent = com_by.get(o.get("chefLieu"))
    if not parent:
        continue
    rows_loc.append(["FR", o["type"], o["code"], o["nom"], "", "", parent["code"], parent["nom"],
                     o["departement"], "", ""])

# =====================================================================
# BELGIQUE
# =====================================================================
NT = f"{BASE}/vocab-belgif/prod/data/codelist"
trip = re.compile(r'^<([^>]+)> <([^>]+)> (.+) \.$')


def load_nt(path):
    data = collections.defaultdict(lambda: collections.defaultdict(list))
    for line in open(path, encoding="utf-8"):
        m = trip.match(line.strip())
        if m:
            data[m.group(1)][m.group(2).split("#")[-1].split("/")[-1]].append(m.group(3))
    return data


def lit(v):
    m = re.match(r'^"(.*)"(@(\w+))?', v)
    return (bytes(m.group(1), "utf-8").decode("unicode_escape").encode("latin1").decode("utf-8")
            if "\\u" in m.group(1) else m.group(1)), m.group(3)


def strip_prefix(n):
    return re.sub(r"^(Province|Arrondissement)( de la | de | du | des | d['’])", "", n)


REG_SLUG = {"2000": "flandre", "3000": "wallonie", "4000": "bruxelles-capitale"}


def code_of(uri):
    return uri.rstrip(">").split("/")[-1]


r25 = load_nt(f"{NT}/refnis2025.nt")
r19 = load_nt(f"{NT}/refnis2019.nt")

# Corrections du brouillon REFNIS 2025 (vocab.belgif.be) :
# Tielt (37022) et Tessenderlo-Ham (71071), communes fusionnées au 01/01/2025,
# y sont marquées à tort comme supprimées ; Wingene (37021) n'a pas de parent.
FORCE_ACTIVE = {"37022", "71071"}
FORCE_PARENT = {"37021": "37000"}
# Sint-Amands (12034) est fusionnée dans Puurs-Sint-Amands (12041) depuis 2019
FORCE_INACTIVE = {"12034"}
# Codes INS anciens de la liste bpost à rattacher manuellement
OLD_REMAP = {"12034": "12041", "44014": "44021"}
be = {}
for uri, p in r25.items():
    if "notation" not in p or "/refnis2025/" not in uri:
        continue
    end = p["endDate"][0] if p.get("endDate") else '"9999'
    if not end.startswith('"9999') and code_of(uri) not in FORCE_ACTIVE:
        continue
    if code_of(uri) in FORCE_INACTIVE:
        continue
    labels = {}
    for v in p["prefLabel"]:
        t, lang = lit(v)
        labels[lang] = t
    be[code_of(uri)] = {"code": code_of(uri), "labels": labels,
                        "parent": code_of(p["broader"][0].strip("<>")) if p.get("broader") else None,
                        "old": [code_of(x.strip("<>")) for k in ("exactMatch", "narrowMatch")
                                for x in p.get(k, []) if "refnis2019" in x]}

# old (1995) -> 2019 -> 2025
map19 = {}
for uri, p in r19.items():
    if "/refnis2019/" in uri:
        for k in ("exactMatch", "narrowMatch"):
            for x in p.get(k, []):
                if "refnis1995" in x:
                    map19[code_of(x.strip("<>"))] = code_of(uri)
map25 = {o: c for c, v in be.items() for o in v["old"]}


def to2025(old):
    old = str(int(old))
    if old in OLD_REMAP:
        return OLD_REMAP[old]
    c19 = map19.get(old, old)
    return map25.get(c19, c19 if c19 in be else None)


def depth(c):
    n = 0
    while be[c]["parent"]:
        c = be[c]["parent"]; n += 1
    return n


for c, par in FORCE_PARENT.items():
    be[c]["parent"] = par
for c in be:
    be[c]["depth"] = depth(c)

BE_EN = {"2000": "Flanders", "3000": "Wallonia", "4000": "Brussels-Capital Region",
         "10000": "Antwerp", "20001": "Flemish Brabant", "20002": "Walloon Brabant",
         "30000": "West Flanders", "40000": "East Flanders", "50000": "Hainaut",
         "60000": "Liège", "70000": "Limburg", "80000": "Luxembourg (Belgium)",
         "90000": "Namur"}
GERMAN = {"63001", "63012", "63013", "63023", "63040", "63048", "63061", "63067", "63087"}
REGION_OF = {}


def region_of(c):
    while be[c]["depth"] > 1:
        c = be[c]["parent"]
    return c


def local_lang(c):
    reg = region_of(c)
    if reg == "2000":
        return "nl"
    if reg == "4000":
        return "fr/nl"
    return "de" if c in GERMAN else "fr"


def local_name(c):
    L = be[c]["labels"]; ll = local_lang(c)
    if ll == "fr/nl":
        return L["fr"] if L["fr"] == L["nl"] else f"{L['fr']} / {L['nl']}"
    return L.get(ll, L["fr"])


communes_be = [c for c in be if be[c]["depth"] == 4 or (be[c]["depth"] == 3 and False)]
# Bruxelles : région -> arrondissement (21000) -> communes (pas de province)
# Niveaux : 0 pays, 1 région, 2 province (ou arrondissement pour Bruxelles), 3 arrondissement, 4 commune
brux_arr = [c for c in be if be[c]["parent"] == "4000"]
communes_be = [c for c in be if be[c]["depth"] == 4] + \
              [c for c in be if be[c]["depth"] == 3 and be[c]["parent"] in brux_arr]

# postal localities
loc_be = collections.defaultdict(list)
unmapped = []
with open(f"{BASE}/belgium-zipcodes/out/cities.csv", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        new = to2025(row["nisCode"])
        if row["name"] == "Kapellen" and row["zipCode"] == "2950":
            new = "11023"  # erreur de code INS dans la liste source
        if new is None:
            unmapped.append(row); continue
        loc_be[new].append((row["zipCode"], row["name"], row["main"] == "1"))

# ---- Current postal list (ODWB "code-postaux-belge", updated 2026) replaces the
# 2013 bpost snapshot, which has homonym mis-assignments. Rows name the French
# municipality for Wallonia/Brussels; for Flanders the municipality is resolved
# from the postal code within the stated arrondissement.
def _norm(s):
    s = (s or "").replace("œ", "oe").replace("Œ", "Oe")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z]", "", s)

arr_by_name = {}
for c, v in be.items():
    if v["depth"] == 3 or (v["depth"] == 2 and v["parent"] == "4000"):
        if c in brux_arr or v["depth"] == 3:
            arr_by_name[_norm(v["labels"]["fr"])] = c
commune_arr = {c: be[c]["parent"] for c in communes_be}
names_in_arr = collections.defaultdict(dict)
for c in communes_be:
    for nm in be[c]["labels"].values():
        names_in_arr[commune_arr[c]][_norm(nm)] = c
old_zip_communes = collections.defaultdict(set)
for c, locs in loc_be.items():
    for z, _, _ in locs:
        old_zip_communes[z].add(c)
MERGED_NAMES = {"bertogne": "82039"}  # fusionnée dans Bastogne (2024-12-02)

# bpost ranges by province (1xxx Bruxelles/Brabant, 2xxx Anvers, …) — a postal
# code outside its commune's province range is a source error, except the
# 2070 codes of Zwijndrecht/Burcht, moved to East Flanders with the 2025 fusion.
_ZIP_RANGES = [(1000, 1299, "4000"), (1300, 1499, "20002"), (1500, 1999, "20001"),
               (2000, 2999, "10000"), (3000, 3499, "20001"), (3500, 3999, "70000"),
               (4000, 4999, "60000"), (5000, 5999, "90000"), (6000, 6599, "50000"),
               (6600, 6999, "80000"), (7000, 7999, "50000"), (8000, 8999, "30000"),
               (9000, 9999, "40000")]
_ZIP_EXCEPTIONS = {("46030", "2070")}


def _province_or_region(c):
    a = be[c]["parent"]
    return be[a]["parent"]


def _zip_fits(z, c):
    if (c, z) in _ZIP_EXCEPTIONS:
        return True
    for lo, hi, owner in _ZIP_RANGES:
        if lo <= int(z) <= hi:
            return owner == _province_or_region(c)
    return False

odwb = list(csv.DictReader(open(f"{BASE}/be_postal_odwb.csv", encoding="utf-8"), delimiter=";"))
new_loc = collections.defaultdict(list)
odwb_unresolved = []
for r in odwb:
    z, place = r["column_1"].strip(), r["column_2"].strip()
    arr = arr_by_name.get(_norm(r["arrondissement"]))
    code = None
    mun = r["municipality_name_french"].strip()
    if mun:
        code = MERGED_NAMES.get(_norm(mun)) or (names_in_arr.get(arr, {}).get(_norm(mun)) if arr else None)
    if z == "7850":
        # source error: 7850 (Enghien, Marcq, Petit-Enghien) is Enghien, not Silly
        code = next(c for c in communes_be if be[c]["labels"]["fr"] == "Enghien")
    if not code and arr:
        cands = [c for c in old_zip_communes.get(z, set()) if commune_arr.get(c) == arr]
        if len(cands) == 1:
            code = cands[0]
        elif _norm(place) in names_in_arr.get(arr, {}):
            code = names_in_arr[arr][_norm(place)]
    if not code and mun:
        # arrondissement mislabelled in the source: unique name match across Belgium
        hits = {c for a2, m in names_in_arr.items() for k, c in m.items() if k == _norm(mun)}
        code = MERGED_NAMES.get(_norm(mun)) or (hits.pop() if len(hits) == 1 else None)
    if code and not _zip_fits(z, code):
        code = None
    if not code:
        odwb_unresolved.append(r); continue
    main = _norm(place) in {_norm(x) for x in be[code]["labels"].values()}
    new_loc[code].append((z, place, main))
if len(odwb_unresolved) > 30:
    raise SystemExit(f"ODWB postal list: too many unresolved rows ({len(odwb_unresolved)})")
loc_be = new_loc
unmapped = odwb_unresolved


def prov_of(c):
    p = be[c]["parent"]  # arrondissement
    return be[p]["parent"]


be_tree = {"code": "BE", "name_fr": "Belgique", "name_en": "Belgium", "slug": "belgique",
           "levels": ["region", "province", "arrondissement", "commune"], "regions": []}
REG_ORDER = ["4000", "3000", "2000"]
for rc in REG_ORDER:
    R = be[rc]; active = rc != "2000"
    rs = REG_SLUG[rc]
    rows_admin.append(["BE", "region", rc, "", R["labels"]["fr"], BE_EN[rc],
                       R["labels"]["nl"], rs, "non", "oui" if active else "non"])
    rnode = {"code": rc, "name_fr": R["labels"]["fr"], "name_en": BE_EN[rc],
             "name_nl": R["labels"]["nl"], "name_de": R["labels"].get("de"), "slug": rs,
             "active": active, "provinces": []}
    if rc == "4000":
        provs = [None]  # pas de province
    else:
        provs = sorted([c for c in be if be[c]["parent"] == rc], key=int)
    for pc in provs:
        if pc:
            PV = be[pc]; ps = slug(strip_prefix(PV["labels"]["fr"]))
            if pc == "80000":
                ps = "province-de-luxembourg"
            rows_admin.append(["BE", "province", pc, rc, PV["labels"]["fr"], BE_EN[pc],
                               PV["labels"]["nl"], ps, "non", "oui" if active else "non"])
            pnode = {"code": pc, "name_fr": PV["labels"]["fr"], "name_en": BE_EN[pc],
                     "name_nl": PV["labels"]["nl"], "name_de": PV["labels"].get("de"),
                     "slug": ps, "active": active, "arrondissements": []}
            arrs = sorted([c for c in be if be[c]["parent"] == pc], key=int)
        else:
            pnode = {"code": None, "name_fr": "Bruxelles-Capitale (sans province)",
                     "name_en": "Brussels-Capital (no province)", "slug": "bruxelles",
                     "active": True, "arrondissements": []}
            arrs = brux_arr
        for ac in arrs:
            A = be[ac]
            an = strip_prefix(A["labels"]["fr"])
            rows_admin.append(["BE", "arrondissement", ac, pc or rc, A["labels"]["fr"],
                               A["labels"]["fr"], A["labels"]["nl"], slug(an), "non",
                               "oui" if active else "non"])
            anode = {"code": ac, "name_fr": A["labels"]["fr"], "name_nl": A["labels"]["nl"],
                     "slug": slug(an), "communes": []}
            coms = sorted([c for c in communes_be if be[c]["parent"] == ac], key=int)
            items = [{"code": c, "nom": be[c]["labels"]["fr"]} for c in coms]
            anode["_items"] = items
            pnode["arrondissements"].append(anode)
        # slugs uniques par province
        allitems = [i for a in pnode["arrondissements"] for i in a["_items"]]
        uniq_slugs(allitems, "nom", "code", lambda i: i["code"])
        for anode in pnode["arrondissements"]:
            for i in anode.pop("_items"):
                c = i["code"]; L = be[c]["labels"]
                locs = sorted(loc_be.get(c, []))
                cps = sorted({z for z, _, _ in locs})
                anode["communes"].append({
                    "code": c, "name_fr": L["fr"], "name_nl": L["nl"], "name_de": L.get("de"),
                    "name_local": local_name(c), "language": local_lang(c), "slug": i["slug"],
                    "postal_codes": cps,
                    "localities": [{"postal_code": z, "name": n, "main": m} for z, n, m in locs]})
                rows_com.append(["BE", rc, R["labels"]["fr"], pc or "", pnode["name_fr"],
                                 anode["code"], anode["name_fr"], c, L["fr"], L["nl"],
                                 L.get("de", ""), local_name(c), i["slug"], "|".join(cps), "",
                                 "non", "oui" if active else "non"])
                for z in cps:
                    rows_cp.append(["BE", z, c, L["fr"], pc or rc])
                for z, n, m in locs:
                    rows_loc.append(["BE", "localite-postale" + (" (principale)" if m else ""),
                                     "", n, "", "", c, L["fr"], pc or rc, z, ""])
        rnode["provinces"].append(pnode)
    be_tree["regions"].append(rnode)

# =====================================================================
# LUXEMBOURG : 12 cantons -> 100 communes -> localités (+ quartiers de la Ville)
# Source : codes postaux Post Luxembourg via GeoNames (zauberware), communes
# remises à jour avec les fusions 2018 et 2023.
# =====================================================================
LU_MERGE = {"Hobscheid": "Habscht", "Septfontaines": "Habscht",
            "Boevange-sur-Attert": "Helperknapp", "Tuntange": "Helperknapp",
            "Mompach": "Rosport-Mompach", "Rosport": "Rosport-Mompach",
            "Bous": "Bous-Waldbredimus", "Waldbredimus": "Bous-Waldbredimus",
            "Grosbous": "Groussbus-Wal", "Wahl": "Groussbus-Wal",
            "Ville de Luxembourg": "Luxembourg", "Erpeldange": "Erpeldange-sur-Sûre",
            "Berg": "Colmar-Berg"}
LU_QUARTIERS = ["Beggen", "Belair", "Bonnevoie-Nord/Verlorenkost", "Bonnevoie-Sud", "Cents",
                "Cessange", "Clausen", "Dommeldange", "Eich", "Gare", "Gasperich", "Grund",
                "Hamm", "Hollerich", "Kirchberg", "Limpertsberg", "Merl", "Mühlenbach",
                "Neudorf/Weimershof", "Pfaffenthal", "Pulvermühl",
                "Rollingergrund/Belair-Nord", "Ville Haute", "Weimerskirch"]

lu_rows = list(csv.DictReader(open(f"{BASE}/lu/zipcodes.lu.csv", encoding="utf-8")))
lu = collections.defaultdict(lambda: collections.defaultdict(lambda: collections.defaultdict(set)))
lu_canton_code = {}
for x in lu_rows:
    com = LU_MERGE.get(x["province"], x["province"])
    lu_canton_code[x["state"]] = x["state_code"]
    lu[x["state"]][com][x["place"]].add(x["zipcode"].replace("L-", ""))

lu_tree = {"code": "LU", "name_fr": "Luxembourg", "name_en": "Luxembourg", "slug": "luxembourg",
           "levels": ["canton", "commune"], "cantons": []}
n_lu_com = n_lu_loc = 0
for cant in sorted(lu):
    cc = f"LU-{lu_canton_code[cant]}"
    cs = "canton-de-luxembourg" if cant == "Luxembourg" else slug(cant)
    rows_admin.append(["LU", "canton", cc, "", cant, cant, "", cs, "non", "oui"])
    cnode = {"code": cc, "name_fr": cant, "name_en": cant, "slug": cs, "active": True,
             "communes": []}
    for com in sorted(lu[cant]):
        n_lu_com += 1
        ccode = f"LU-{slug(com).upper()}"
        places = lu[cant][com]
        cps = sorted(set().union(*places.values()))
        locs = [{"name": p, "postal_codes": sorted(z)} for p, z in sorted(places.items())]
        node = {"code": ccode, "name": com, "slug": slug(com), "postal_codes": cps,
                "localities": locs}
        if com == "Luxembourg":
            node["quartiers"] = [{"name": q, "slug": slug(q)} for q in LU_QUARTIERS]
            for q in LU_QUARTIERS:
                rows_loc.append(["LU", "quartier", "", q, "", "", ccode, com, cc, "", ""])
        cnode["communes"].append(node)
        rows_com.append(["LU", "", "", cc, cant, "", "", ccode, com, "", "", com, slug(com),
                         "|".join(cps), "", "non", "oui"])
        for z in cps:
            rows_cp.append(["LU", z, ccode, com, cc])
        for l in locs:
            n_lu_loc += 1
            rows_loc.append(["LU", "localite", "", l["name"], "", "", ccode, com, cc,
                             "|".join(l["postal_codes"]), ""])
    lu_tree["cantons"].append(cnode)

# =====================================================================
# SORTIES
# =====================================================================
meta = {"generated": "2026-09-27",
        "sources": {
            "FR": "COG INSEE via @etalab/decoupage-administratif 6.0.0 (codes postaux La Poste)",
            "BE": "REFNIS 2025 Statbel (vocab.belgif.be) ; codes postaux et localités : ODWB code-postaux-belge (mise à jour 2026), rattachés aux communes 2025",
            "LU": "Codes postaux Post Luxembourg via GeoNames (zauberware/postal-codes-json-xml-csv), fusions communales 2018 et 2023 appliquées ; quartiers officiels de la Ville de Luxembourg"},
        "notes": ["France : DROM inclus, COM (Polynésie, Nouvelle-Calédonie, etc.) exclues.",
                  "Belgique : Flandre marquée active=false (lancement FR/EN).",
                  "Luxembourg : pas de niveau régional (districts supprimés en 2015)."]}
json.dump({"meta": meta, "countries": [fr_tree, be_tree, lu_tree]},
          open(f"{OUT}/zfind_geo_fr_be_lu.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def wcsv(name, header, rows):
    with open(f"{OUT}/{name}", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";"); w.writerow(header); w.writerows(rows)


wcsv("niveaux_administratifs.csv",
     ["pays", "niveau", "code", "code_parent", "nom_fr", "nom_en", "nom_nl", "slug",
      "outre_mer", "actif_lancement"], rows_admin)
wcsv("communes.csv",
     ["pays", "region_code", "region", "departement_province_code", "departement_province",
      "arrondissement_code", "arrondissement", "commune_code", "commune_fr", "commune_nl",
      "commune_de", "commune_nom_local", "slug", "codes_postaux", "population",
      "outre_mer", "actif_lancement"], rows_com)
wcsv("localites.csv",
     ["pays", "type", "code", "nom", "commune_code", "commune", "dept_province",
      "codes_postaux", "population"],
     [r[:4] + r[6:] for r in rows_loc])
wcsv("codes_postaux.csv", ["pays", "code_postal", "commune_code", "commune", "dept_province"],
     sorted(set(map(tuple, rows_cp))))

# stats
print("FR régions", len(fr_regions), "départements", len(fr_depts), "arrondissements", len(fr_arr),
      "communes", len(fr_com), "arr. municipaux", len(fr_arrmun), "anciennes communes", len(fr_old))
print("BE régions 3, provinces", sum(1 for c in be if be[c]["depth"] == 2 and be[c]["parent"] != "4000"),
      "arrondissements", sum(1 for c in be if be[c]["depth"] == 3 and c not in communes_be) + len(brux_arr),
      "communes", len(communes_be), "localités", sum(len(v) for v in loc_be.values()),
      "non rattachées", len(unmapped))
print("BE communes sans CP:", [be[c]["labels"]["fr"] for c in communes_be if c not in loc_be])
print("unmapped sample", unmapped[:5])
print("German check:", [be[c]["labels"]["de"] for c in sorted(GERMAN) if c in be])
print("LU cantons", len(lu), "communes", n_lu_com, "localités", n_lu_loc, "quartiers", len(LU_QUARTIERS))
