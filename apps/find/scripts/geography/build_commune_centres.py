"""Centre (latitude, longitude) of every Z Find commune in France, Belgium and Luxembourg.

Used to place a listing on the search map when the agency gives no exact
position: the pin goes to the centre of its commune, shown as « position
approximative ». Nothing here is precise to the street, by design.

Input (one directory, argument 1): the GeoNames postal-code exports republished
by github.com/zauberware/postal-codes-json-xml-csv (data/FR.zip, BE.zip, LU.zip,
unzipped): FR/zipcodes.fr.csv, BE/zipcodes.be.csv, LU/zipcodes.lu.csv.
GeoNames data: CC BY 4.0 (https://www.geonames.org).

Communes: the site's own index apps/zfind-web/public/geo/search/{fr,be,lu}.json
([code, name, "postcodes", "alias|alias", parent]).

Matching, per country:
  FR  postal places of the commune's postcodes whose name is the commune (or one
      of its former communes); else every place of a postcode used by this
      commune alone; else the department's average (marked approximate anyway).
  BE  every postal place of the commune's postcodes (sub-municipalities included).
  LU  GeoNames gives the commune in the "province" column.
Output (argument 2): JSON {"FR": [[code, lat, lng], ...], "BE": [...], "LU": [...]},
4 decimals (~10 m), sorted by code. Deterministic.

Usage: python build_commune_centres.py <geonames_dir> <out.json>
"""
import csv
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SEARCH = os.path.join(HERE, "..", "..", "apps", "zfind-web", "public", "geo", "search")


def fold(value):
    t = unicodedata.normalize("NFD", str(value or ""))
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"\b(st)\b", "saint", t)
    t = re.sub(r"\b(ste)\b", "sainte", t)
    t = re.sub(r"[’'`\-‐–()]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def mean(points):
    if not points:
        return None
    return (round(sum(p[0] for p in points) / len(points), 4), round(sum(p[1] for p in points) / len(points), 4))


def read_geonames(path):
    rows = []
    with open(path, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            try:
                lat, lng = float(r["latitude"]), float(r["longitude"])
            except (TypeError, ValueError):
                continue
            rows.append({"zip": r["zipcode"].replace("L-", "").strip(), "place": fold(r["place"]),
                         "province": fold(r.get("province")), "lat": lat, "lng": lng})
    return rows


def communes(country):
    with open(os.path.join(SEARCH, f"{country.lower()}.json"), encoding="utf-8") as fh:
        return [r for r in json.load(fh) if isinstance(r, list) and len(r) >= 2]


def build_fr(geo):
    by_zip = defaultdict(list)
    for g in geo:
        by_zip[g["zip"]].append(g)
    comm = communes("FR")
    zip_users = defaultdict(set)
    for c in comm:
        for z in str(c[2] if len(c) > 2 else "").split():
            zip_users[z].add(c[0])
    out, dept_points, missing = {}, defaultdict(list), []
    for c in comm:
        code, name = c[0], fold(c[1])
        names = {name} | {fold(a) for a in str(c[3] if len(c) > 3 else "").split("|") if a}
        zips = str(c[2] if len(c) > 2 else "").split()
        exact = [(g["lat"], g["lng"]) for z in zips for g in by_zip.get(z, []) if g["place"] in names]
        if not exact:
            exact = [(g["lat"], g["lng"]) for z in zips for g in by_zip.get(z, [])
                     if g["place"].startswith(name + " ") or name.startswith(g["place"] + " ")]
        if not exact:
            exact = [(g["lat"], g["lng"]) for z in zips if len(zip_users[z]) == 1 for g in by_zip.get(z, [])]
        point = mean(exact)
        dept = code[:3] if code.startswith("97") else code[:2]
        if point:
            out[code] = point
            dept_points[dept].append(point)
        else:
            missing.append((code, dept))
    for code, dept in missing:
        point = mean(dept_points.get(dept, []))
        if point:
            out[code] = point
    return out, len(missing)


def build_be(geo):
    by_zip = defaultdict(list)
    for g in geo:
        by_zip[g["zip"]].append((g["lat"], g["lng"]))
    out, missing = {}, 0
    for c in communes("BE"):
        point = mean([p for z in str(c[2] if len(c) > 2 else "").split() for p in by_zip.get(z, [])])
        if point:
            out[c[0]] = point
        else:
            missing += 1
    return out, missing


def build_lu(geo):
    by_commune, by_place = defaultdict(list), defaultdict(list)
    for g in geo:
        by_commune[g["province"]].append((g["lat"], g["lng"]))
        by_place[g["place"]].append((g["lat"], g["lng"]))
    out, missing = {}, 0
    for c in communes("LU"):
        name = fold(c[1])
        point = mean(by_commune.get(name, []))
        if not point:
            # Merged communes (Bous-Waldbredimus, Rosport-Mompach, Habscht…): their former
            # communes, then their localities (aliases), as GeoNames still lists them.
            parts = [p for p in [name] + name.split(" ") if len(p) > 2]
            aliases = [fold(a) for a in str(c[3] if len(c) > 3 else "").split("|") if a]
            pts = [p for k in parts for p in by_commune.get(k, [])]
            pts = pts or [p for k in aliases + parts for p in by_place.get(k, [])]
            point = mean(pts)
        if point:
            out[c[0]] = point
        else:
            missing += 1
    return out, missing


def main(src, dest):
    result, report = {"_source": "GeoNames postal codes (https://www.geonames.org/), CC BY 4.0"}, {}
    for country, fn, path in (("FR", build_fr, "FR/zipcodes.fr.csv"), ("BE", build_be, "BE/zipcodes.be.csv"), ("LU", build_lu, "LU/zipcodes.lu.csv")):
        centres, missing = fn(read_geonames(os.path.join(src, path)))
        result[country] = [[code, lat, lng] for code, (lat, lng) in sorted(centres.items())]
        report[country] = {"communes": len(communes(country)), "with_centre": len(centres), "fallback_or_missing": missing}
    with open(dest, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    print(json.dumps(report, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
