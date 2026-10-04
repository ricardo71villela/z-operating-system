"""
Z Find — comunas de França, Bélgica e Luxemburgo na tabela zfind_communes.

Fonte: os índices públicos do site (apps/zfind-web/public/geo/search/{fr,be,lu}.json,
gerados por scripts/geography/build_public_divisions.py a partir do COG INSEE,
Statbel e Post Luxembourg). Linha: [código, nome, "códigos postais", "alias|alias", pai].

A tabela serve o painel dos parceiros: pesquisar a comuna de um bem por código
postal ou nome (zfind_commune_search) e ligá-lo a ela (zfind_set_asset_commune),
sem que o browser possa inventar uma comuna. Idempotente (upsert por país+código).

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


def load(country):
    with open(os.path.join(GEO_DIR, f"{country.lower()}.json"), encoding="utf-8") as fh:
        return to_rows(country, json.load(fh))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    all_rows = []
    for country in COUNTRIES:
        rows = load(country)
        print(f"{country}: {len(rows)} comunas")
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
