"""
Enrichissement via la BDNB (Base de Données Nationale des Bâtiments, CSTB),
API « Open » : https://api.bdnb.io/v1/bdnb — sans clé, 10 000 requêtes par
mois et 120 par minute et par IP. Données publiques (Licence Ouverte).

VALEUR (8/10/2026) : pour CHAQUE bâtiment, même jamais vendu et sans DPE,
la BDNB donne l'emprise au sol, le nombre de niveaux, le nombre de logements
et l'année de construction. On en tire une SURFACE ESTIMÉE pour les maisons
(emprise × niveaux × 0,8), qui comble une partie des ~16 700 adresses sans
aucune surface (ni DVF, ni DPE). C'est une estimation : elle n'est utilisée
qu'en dernier recours (segment.py::choose_surface) et toujours affichée
comme telle (« BDNB — estimation »).

RATTACHEMENT : par la clé d'interopérabilité BAN de l'adresse
(l_cle_interop_adr), la même que la colonne `id` des adresses BAN du
pipeline. Exact, sans géocodage.

QUOTA : une requête par page de PAGE_SIZE bâtiments, ~1 par seconde ; les
31 communes tiennent en quelques dizaines de requêtes. Cache par commune
dans data/_cache/bdnb (FORCE_REDOWNLOAD=1 pour le vider).

Usage:
    python enrich_bdnb.py
"""
import json
import os
import time

import pandas as pd
import requests

from config import ALL_COMMUNES

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
CACHE_DIR = os.path.join(DATA_DIR, "_cache", "bdnb")
OUT_PATH = os.path.join(DATA_DIR, "bdnb_74200_74500.csv")
BDNB_URL = "https://api.bdnb.io/v1/bdnb/donnees/batiment_groupe_complet"
FORCE_REDOWNLOAD = os.environ.get("FORCE_REDOWNLOAD") == "1"
PAGE_SIZE = 1000
PAUSE_S = 1.0
TIMEOUT = 90

SELECT = ",".join([
    "batiment_groupe_id", "l_cle_interop_adr", "nb_log", "nb_niveau",
    "surface_emprise_sol", "fiabilite_emprise_sol", "hauteur_mean",
    "fiabilite_hauteur", "annee_construction", "usage_principal_bdnb_open",
])

OUT_COLUMNS = [
    "ban_id", "code_insee", "bdnb_id", "bdnb_nb_logements", "bdnb_nb_niveaux",
    "bdnb_emprise_sol_m2", "bdnb_fiabilite_emprise", "bdnb_hauteur_m",
    "bdnb_fiabilite_hauteur", "bdnb_annee_construction", "bdnb_usage",
]


def fetch_commune(code_insee, session=None):
    cache_path = os.path.join(CACHE_DIR, f"{code_insee}.json")
    if not FORCE_REDOWNLOAD and os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)

    http = session or requests
    rows, offset = [], 0
    while True:
        params = {"code_commune_insee": f"eq.{code_insee}", "select": SELECT,
                  "limit": PAGE_SIZE, "offset": offset, "order": "batiment_groupe_id"}
        r = http.get(BDNB_URL, params=params, timeout=TIMEOUT,
                     headers={"Accept": "application/json"})
        if r.status_code == 429:
            raise RuntimeError("quota BDNB épuisé (HTTP 429)")
        r.raise_for_status()
        page = r.json()
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
        time.sleep(PAUSE_S)

    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(rows, f)
    return rows


def rows_for_addresses(buildings, code_insee):
    """Une ligne par adresse BAN rattachée au bâtiment."""
    out = []
    for b in buildings:
        keys = b.get("l_cle_interop_adr") or []
        if isinstance(keys, str):
            keys = [keys]
        for k in keys:
            if not k:
                continue
            out.append({
                "ban_id": k, "code_insee": code_insee, "bdnb_id": b.get("batiment_groupe_id"),
                "bdnb_nb_logements": b.get("nb_log"), "bdnb_nb_niveaux": b.get("nb_niveau"),
                "bdnb_emprise_sol_m2": b.get("surface_emprise_sol"),
                "bdnb_fiabilite_emprise": b.get("fiabilite_emprise_sol"),
                "bdnb_hauteur_m": b.get("hauteur_mean"),
                "bdnb_fiabilite_hauteur": b.get("fiabilite_hauteur"),
                "bdnb_annee_construction": b.get("annee_construction"),
                "bdnb_usage": b.get("usage_principal_bdnb_open"),
            })
    return out


def main():
    all_rows = []
    print(f"Téléchargement BDNB pour {len(ALL_COMMUNES)} communes...")
    session = requests.Session()
    for code, nom in ALL_COMMUNES.items():
        try:
            buildings = fetch_commune(code, session)
        except (requests.RequestException, ValueError, RuntimeError) as e:
            print(f"  {nom:26s} interrompu ({e}) — commune sautée")
            continue
        rows = rows_for_addresses(buildings, code)
        all_rows.extend(rows)
        print(f"  {nom:26s} {len(buildings):>6,} bâtiments, {len(rows):>6,} adresses")
        time.sleep(PAUSE_S)

    df = pd.DataFrame(all_rows, columns=OUT_COLUMNS)
    # Une adresse peut apparaître dans deux bâtiments voisins : on garde le
    # plus grand (le bâtiment principal plutôt qu'une annexe).
    if not df.empty:
        df["_s"] = pd.to_numeric(df["bdnb_emprise_sol_m2"], errors="coerce").fillna(0)
        df = df.sort_values("_s").drop_duplicates(subset=["ban_id"], keep="last").drop(columns="_s")
    os.makedirs(DATA_DIR, exist_ok=True)
    df.to_csv(OUT_PATH, index=False)
    print(f"OK — {len(df):,} adresses avec données BDNB -> {OUT_PATH}")


if __name__ == "__main__":
    main()
