"""
Ingestion des transactions immobilières via DVF (Demandes de Valeurs Foncières).
Source 100% publique et légale : https://files.data.gouv.fr/geo-dvf/
Ce sont des données de TRANSACTIONS (adresse, date, prix, surface) —
anonymisées : aucun nom de vendeur ou d'acheteur.

Usage:
    python ingest_dvf.py

Nécessite une connexion internet (télécharge un fichier par année, 2019-2024).
"""
import gzip
import io
import os
import sys
import pandas as pd
import requests

from config import ALL_COMMUNES, DVF_YEARS, DVF_URL_TEMPLATE, DEPARTEMENT
from http_utils import download_bytes_cached

DVF_COLUMNS_KEEP = [
    "id_mutation", "date_mutation", "nature_mutation", "valeur_fonciere",
    "adresse_numero", "adresse_nom_voie", "code_postal", "code_commune",
    "nom_commune", "type_local", "surface_reelle_bati",
    "nombre_pieces_principales", "longitude", "latitude",
]

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "_cache")


def download_dvf_year(year: int) -> pd.DataFrame:
    url = DVF_URL_TEMPLATE.format(year=year)
    print(f"Téléchargement DVF {year} depuis {url} ...")
    cache_path = os.path.join(CACHE_DIR, f"dvf-{year}-{DEPARTEMENT}.csv.gz")
    raw_gz = download_bytes_cached(url, cache_path)
    raw = gzip.decompress(raw_gz)
    df = pd.read_csv(io.BytesIO(raw), dtype=str, low_memory=False)
    print(f"  -> {len(df):,} lignes pour {year} (département 74)")
    return df


def main():
    insee_codes = set(ALL_COMMUNES.keys())
    frames = []
    for year in DVF_YEARS:
        try:
            df_year = download_dvf_year(year)
        except requests.RequestException as e:
            print(f"  AVERTISSEMENT : {year} indisponible ({e}) — ignoré", file=sys.stderr)
            continue
        df_year = df_year[df_year["code_commune"].isin(insee_codes)].copy()
        available_cols = [c for c in DVF_COLUMNS_KEEP if c in df_year.columns]
        frames.append(df_year[available_cols])

    if not frames:
        print("ERREUR : aucune donnée DVF récupérée. Vérifiez la connexion.", file=sys.stderr)
        sys.exit(1)

    df_all = pd.concat(frames, ignore_index=True)
    df_all["date_mutation"] = pd.to_datetime(df_all["date_mutation"], errors="coerce")
    df_all["valeur_fonciere"] = pd.to_numeric(df_all["valeur_fonciere"], errors="coerce")
    df_all["surface_reelle_bati"] = pd.to_numeric(df_all["surface_reelle_bati"], errors="coerce")

    out_path = "../data/dvf_74200_74500.csv"
    df_all.to_csv(out_path, index=False)
    print(f"OK — {len(df_all):,} transactions exportées vers {out_path}")


if __name__ == "__main__":
    main()
