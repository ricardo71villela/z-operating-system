"""Assemble les statistiques de prix FR / BE / LU pour Z Find, liées au référentiel géo."""
import csv, json, re, unicodedata, os, collections

OUT = os.environ.get("ZFIND_MARKET_SOURCES", "/home/claude/zfind_marche")
os.makedirs(OUT, exist_ok=True)


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")


def w(name, header, rows):
    with open(f"{OUT}/{name}", "w", encoding="utf-8-sig", newline="") as f:
        x = csv.writer(f, delimiter=";"); x.writerow(header); x.writerows(rows)
    print(name, len(rows))


# ---------------- FRANCE (DVF) ----------------
P = os.environ.get("ZFIND_GEO_SOURCES", "/home/claude/geo") + "/package/data"
names = {c["code"]: c["nom"] for c in json.load(open(f"{P}/communes.json"))
         if c["type"] in ("commune-actuelle", "arrondissement-municipal")}
dnames = {d["code"]: d["nom"] for d in json.load(open(f"{P}/departements.json"))}
cur = {c["code"] for c in json.load(open(f"{P}/communes.json"))
       if c["type"] in ("commune-actuelle", "arrondissement-municipal")}
# anciennes communes -> commune actuelle (fusions postérieures aux ventes)
old2new = {}
for c in json.load(open(f"{P}/communes.json")):
    if c["type"] == "commune-actuelle":
        for o in c.get("anciensCodes", []):
            old2new[o] = c["code"]
    elif c["type"] in ("commune-deleguee", "commune-associee") and c.get("chefLieu"):
        old2new.setdefault(c["code"], c["chefLieu"])

rows, unknown = [], collections.Counter()
for r in csv.DictReader(open(os.environ.get("ZFIND_RAW_DIR", "/home/claude") + "/dvf_stats.csv"), delimiter=";"):
    lvl, code = r["niveau"], r["code"]
    if lvl == "C":
        if code not in cur:
            if code in old2new:
                unknown["remappé"] += 1
                continue  # stats calculées sur l'ancien code : on garde la commune actuelle si elle existe
            unknown["inconnu"] += 1
            continue
        nom = names.get(code, "")
        lvl_name = "arrondissement-municipal" if re.match(r"^(751\d\d|6938\d|132\d\d)$", code) else "commune"
    elif lvl == "D":
        nom, lvl_name = dnames.get(code, ""), "departement"
    else:
        nom, lvl_name = "France", "pays"
    rows.append([lvl_name, code, nom, "maison" if r["type"] == "M" else "appartement",
                 "2024-2025" if r["periode"] == "24M" else r["periode"],
                 r["n"], r["p25"], r["p50"], r["p75"]])
rows.sort(key=lambda x: (x[0], x[1], x[3], x[4]))
w("fr_prix_m2_dvf.csv", ["niveau", "code_insee", "nom", "type_bien", "periode", "nb_ventes",
                         "prix_m2_p25", "prix_m2_median", "prix_m2_p75"], rows)
print("FR lignes ignorées :", dict(unknown))

# ---------------- BELGIQUE (Statbel) ----------------
LV = {"N": "pays", "R": "region", "P": "province", "A": "arrondissement", "C": "commune"}
TY = {"MAISON_TOUTES": "maison (toutes)", "MAISON_2_3F": "maison 2-3 façades",
      "MAISON_4F": "maison 4 façades+", "APPARTEMENT": "appartement"}
rows = []
for r in csv.DictReader(open(os.environ.get("ZFIND_RAW_DIR", "/home/claude") + "/be_stats_communes.csv"), delimiter=";"):
    code = str(int(r["refnis"])) if r["niveau"] in ("N", "R") else r["refnis"]
    rows.append([LV[r["niveau"]], code, r["nom"].title(), TY[r["type"]], r["periode"], r["n"],
                 r["p25"], r["p50"], r["p75"]])
w("be_prix_communes_statbel.csv", ["niveau", "refnis", "nom", "type_bien", "periode",
                                   "nb_transactions", "prix_p25", "prix_median", "prix_p75"], rows)

STY = {"B001": "maison 2-3 façades", "B002": "maison 4 façades+", "B00A": "maison (toutes)",
       "B015": "appartement"}
rows = []
for r in csv.DictReader(open(os.environ.get("ZFIND_RAW_DIR", "/home/claude") + "/be_stats_secteurs.csv"), delimiter=";"):
    rows.append([r["secteur"].rstrip("-"), r["secteur"][:5], STY[r["type"]], r["annee"], r["n"],
                 r["p10"], r["p25"], r["p50"], r["p75"], r["p90"]])
w("be_prix_secteurs_statbel.csv", ["secteur_statistique", "refnis_commune_origine", "type_bien",
                                   "annee", "nb_transactions", "prix_p10", "prix_p25",
                                   "prix_median", "prix_p75", "prix_p90"], rows)

# ---------------- LUXEMBOURG (Observatoire de l'Habitat) ----------------
lu_codes = {}
for r in csv.reader(open(os.environ.get("ZFIND_GEO_OUT", "/home/claude/zfind_geo") + "/communes.csv", encoding="utf-8-sig"), delimiter=";"):
    if r[0] == "LU":
        lu_codes[slug(r[8])] = (r[7], r[8])
lu_codes["erpeldange"] = lu_codes["erpeldange-sur-sure"]
lu_codes["luxembourg-ville"] = lu_codes["luxembourg"]
lu_codes["redange"] = lu_codes["redange-sur-attert"]
lu_codes["grosbous-wal"] = lu_codes["grosbus-wal"] = lu_codes["groussbus-wal"]


def num(s):
    s = s.replace("€", "").replace(" ", "").strip()
    if s in ("", "*"):
        return ""
    return s.replace(",", "")


raw = open(os.environ.get("ZFIND_RAW_DIR", "/home/claude") + "/lu_raw.txt", encoding="utf-8").read()
blocks = re.split(r"^### ", raw, flags=re.M)[1:]
rows, miss = [], set()
for b in blocks:
    head, body = b.split("\n", 1)
    key, sheet = [x.strip() for x in head.split(" / ", 1)]
    lines = list(csv.reader(body.splitlines(), delimiter=";"))
    if key.startswith("enreg_app_affine"):
        per = "12 mois au " + sheet[:6] if key.endswith("12m") else sheet[:4]
        national = None
        for l in lines:
            if len(l) >= 7 and l[0].strip().startswith("Moyenne nationale"):
                national = l  # prices of the national row; counts come on the "Total" row
                continue
            if len(l) >= 7 and l[1].replace(",", "").isdigit() and l[0].strip():
                nom = l[0].strip()
                if nom.lower().startswith("total"):
                    for seg, i in (("appartement existant", 1), ("appartement VEFA (neuf)", 4)):
                        price = num(national[i + 1]) if national else ""
                        lo = hi = ""
                        if national and "-" in national[i + 2]:
                            lo, hi = national[i + 2].replace("€", "").replace(" ", "").replace(",", "").split("-")[:2]
                        rows.append(["pays", "LU", "Luxembourg", "enregistré (actes)", seg, per,
                                     num(l[i]), price, "", lo, hi])
                    continue
                if slug(nom) not in lu_codes:
                    miss.add(nom); continue
                code, cn = lu_codes[slug(nom)]
                for seg, i in (("appartement existant", 1), ("appartement VEFA (neuf)", 4)):
                    fourch = l[i + 2].replace("€", "").replace(" ", "").replace(",", "")
                    lo, hi = (fourch.split("-") + [""])[:2] if "-" in fourch else ("", "")
                    rows.append(["commune", code, cn, "enregistré (actes)", seg, per, num(l[i]),
                                 num(l[i + 1]), "", lo, hi])
    else:
        typ = "appartement" if "_app_" in key else "maison"
        vdl = "vdl" in key
        per = "12 mois (07/2025-06/2026)" if key.endswith("12m") else sheet
        for l in lines:
            if len(l) >= 4 and l[1].replace(",", "").isdigit() and l[0].strip():
                nom = l[0].strip()
                if vdl:
                    if nom.startswith("Moyenne") or nom == "Luxembourg-Ville":
                        continue
                    rows.append(["quartier Luxembourg-Ville", "LU-LUXEMBOURG", nom, "annoncé", typ,
                                 per, num(l[1]), num(l[3]), num(l[2]), "", ""])
                    continue
                if nom.lower().startswith(("moyenne", "total", "pays")):
                    rows.append(["pays", "LU", "Luxembourg", "annoncé", typ, per, num(l[1]),
                                 num(l[3]), num(l[2]), "", ""]); continue
                if slug(nom) not in lu_codes:
                    miss.add(nom); continue
                code, cn = lu_codes[slug(nom)]
                rows.append(["commune", code, cn, "annoncé", typ, per, num(l[1]), num(l[3]),
                             num(l[2]), "", ""])
w("lu_prix_observatoire.csv", ["niveau", "code_commune", "nom", "source_prix", "type_bien",
                               "periode", "nb", "prix_m2", "prix_moyen", "fourchette_m2_bas",
                               "fourchette_m2_haut"], rows)
print("LU noms non rattachés :", sorted(miss))
