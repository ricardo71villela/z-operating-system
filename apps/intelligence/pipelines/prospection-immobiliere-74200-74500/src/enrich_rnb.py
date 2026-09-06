"""
Enrichissement via l'API du RNB (Répertoire National des Bâtiments,
beta.gouv.fr, open data, licence ouverte, sans clé).

VALEUR : donne un identifiant STABLE d'édifice (rnb_id) rattaché à chaque
adresse BAN (champ addresses[].ban_id du RNB). Cela permet, plus tard, de
regrouper plusieurs adresses (appartements) sous le même bâtiment — utile
pour éviter de compter plusieurs fois le même immeuble dans les
statistiques d'un secteur. N'AJOUTE PAS de nouveau critère de score à ce
stade (le RNB ne documente ni prix ni énergie) : c'est une brique de
robustesse pour de futurs croisements (le pipeline reste inchangé si le
fichier produit ici n'est pas exploité davantage).

PAGINATION : `next` est une URL complète (même schéma que enrich_dpe.py).

Usage:
    python enrich_rnb.py
"""
import json
import os
import time

import pandas as pd
import requests

from config import ALL_COMMUNES

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
CACHE_DIR = os.path.join(DATA_DIR, "_cache", "rnb")
RNB_BASE = "https://rnb-api.beta.gouv.fr/api/alpha/buildings/"
FORCE_REDOWNLOAD = os.environ.get("FORCE_REDOWNLOAD") == "1"
OUT_COLUMNS = ["ban_id", "code_insee", "rnb_id", "statut_batiment"]


def fetch_commune(code_insee):
    cache_path = os.path.join(CACHE_DIR, f"{code_insee}.json")
    if not FORCE_REDOWNLOAD and os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)

    rows = []
    url = RNB_BASE
    params = {"insee_code": code_insee, "page_size": 500}
    while url:
        try:
            r = requests.get(url, params=params, timeout=60)
            r.raise_for_status()
            data = r.json()
        except (requests.RequestException, ValueError) as e:
            print(f"    {code_insee}: interrompu ({e})")
            break
        rows.extend(data.get("results") or [])
        url = data.get("next")
        params = None  # l'URL 'next' contient déjà les paramètres
        if url:
            time.sleep(0.1)

    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(rows, f)
    return rows


def main():
    all_rows = []
    print(f"Téléchargement RNB pour {len(ALL_COMMUNES)} communes...")
    for code, nom in ALL_COMMUNES.items():
        buildings = fetch_commune(code)
        for b in buildings:
            for addr in (b.get("addresses") or []):
                ban_id = addr.get("ban_id") or addr.get("id")
                if not ban_id:
                    continue
                all_rows.append({
                    "ban_id": ban_id,
                    "code_insee": code,
                    "rnb_id": b.get("rnb_id"),
                    "statut_batiment": b.get("status"),
                })
        print(f"  {nom:26s} {len(buildings):>6,} bâtiments")
        time.sleep(0.1)

    df = pd.DataFrame(all_rows, columns=OUT_COLUMNS)
    if not df.empty:
        df = df.drop_duplicates(subset=["ban_id"])
    out = os.path.join(DATA_DIR, "rnb_74200_74500.csv")
    df.to_csv(out, index=False)
    print(f"\nOK — {len(df):,} adresses rattachées à un rnb_id -> {out}")


if __name__ == "__main__":
    main()
