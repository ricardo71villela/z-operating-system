"""
Z Find — comunas de França, Bélgica e Luxemburgo na tabela zfind_communes.

Fonte: os índices públicos do site (apps/zfind-web/public/geo/search/{fr,be,lu}.json,
gerados por scripts/geography/build_public_divisions.py a partir do COG INSEE,
Statbel e Post Luxembourg). Linha: [código, nome, "códigos postais", "alias|alias", pai].

A tabela serve o painel dos parceiros: pesquisar a comuna de um bem por código
postal ou nome (zfind_commune_search) e ligá-lo a ela (zfind_set_asset_commune),
sem que o browser possa inventar uma comuna. Idempotente (upsert por país+código).

Cada comuna leva também o seu centro (latitude, longitude) para o mapa da pesquisa
(migração 20261008120000_z_find_map_search_v1).

Uso: python src/load_communes.py [--dry-run]
"""

import argparse
import json
import os
import re
import sys
import unicodedata

from common import Supabase

GEO_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "apps", "zfind-web", "public", "geo", "search")
# Centre of each commune (scripts/geography/build_commune_centres.py, GeoNames CC BY 4.0):
# where a listing without an exact position is shown on the search map.
CENTRES = os.path.join(os.path.dirname(__file__), "..", "data", "commune_centres.json")
COUNTRIES = ("FR", "BE", "LU")


def fold(value):
    """Igual a placeSearch.fold do site: sem acentos, minúsculas, hífens e apóstrofos = espaço."""
    t = unicodedata.normalize("NFD", str(value or ""))
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"[’'`]", " ", t)
    t = re.sub(r"[-‐–]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def to_rows(country, records):
    rows = {}
    for rec in records:
        if not isinstance(rec, list) or len(rec) < 2 or not rec[0] or not rec[1]:
            continue
        code, name = str(rec[0]).strip(), str(rec[1]).strip()
        postcodes = sorted({p for p in str(rec[2] if len(rec) > 2 else "").split() if p})
        aliases = [a for a in str(rec[3] if len(rec) > 3 else "").split("|") if a]
        rows[code] = {
            "country": country,
            "code": code,
            "name": name,
            "name_folded": fold(name),
            "postcodes": postcodes,
            "aliases": aliases,
            "aliases_folded": "|" + "|".join(fold(a) for a in aliases) + "|" if aliases else "",
            "parent": (str(rec[4]).strip() if len(rec) > 4 and rec[4] else None),
        }
    return list(rows.values())


_centres = None


def centres(country):
    """{code: (lat, lng)} for the country; empty when the data file is absent."""
    global _centres
    if _centres is None:
        try:
            with open(CENTRES, encoding="utf-8") as fh:
                _centres = json.load(fh)
        except FileNotFoundError:
            _centres = {}
    return {r[0]: (r[1], r[2]) for r in _centres.get(country, []) if isinstance(r, list) and len(r) == 3}


def with_centres(country, rows):
    found = centres(country)
    for row in rows:
        lat_lng = found.get(row["code"])
        row["latitude"], row["longitude"] = (lat_lng if lat_lng else (None, None))
    return rows


def load(country):
    with open(os.path.join(GEO_DIR, f"{country.lower()}.json"), encoding="utf-8") as fh:
        return with_centres(country, to_rows(country, json.load(fh)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    all_rows = []
    for country in COUNTRIES:
        rows = load(country)
        print(f"{country}: {len(rows)} comunas, {sum(1 for r in rows if r['latitude'] is not None)} com centro (mapa)")
        all_rows.extend(rows)
    if args.dry_run:
        return 0
    sb = Supabase()
    for i in range(0, len(all_rows), 1000):
        sb._request("POST", "zfind_communes?on_conflict=country,code", json=all_rows[i:i + 1000],
                    headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
    print(f"Escritas: {len(all_rows)} comunas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
