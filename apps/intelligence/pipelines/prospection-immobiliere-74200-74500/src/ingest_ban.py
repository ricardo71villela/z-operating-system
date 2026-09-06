"""
Ingestion des adresses via la Base Adresse Nationale (BAN).
Source 100% publique et légale : https://adresse.data.gouv.fr
Ne contient QUE des adresses (rue, numéro, commune, coordonnées GPS) —
aucune donnée de résident/propriétaire.

Usage:
    python ingest_ban.py

Nécessite une connexion internet (ce script télécharge le fichier BAN
du département 74, ~plusieurs dizaines de Mo compressé).
"""
import gzip
import io
import sys
import pandas as pd
import requests

from config import ALL_COMMUNES, CODE_POSTAL_BY_INSEE, BAN_DEPARTEMENT_URL

# Colonnes utiles dans l'export BAN (format standard data.gouv.fr)
BAN_COLUMNS_KEEP = [
    "id", "numero", "suffixe", "nom_voie", "code_postal",
    "code_insee", "nom_commune", "lon", "lat",
]


def download_ban(url: str = BAN_DEPARTEMENT_URL) -> pd.DataFrame:
    """Télécharge et charge l'export BAN du département 74."""
    print(f"Téléchargement BAN depuis {url} ...")
    resp = requests.get(url, timeout=120, stream=True)
    resp.raise_for_status()
    raw = gzip.decompress(resp.content)
    df = pd.read_csv(io.BytesIO(raw), sep=";", dtype=str, low_memory=False)
    print(f"  -> {len(df):,} adresses chargées pour le département 74")
    return df


def filter_communes(df: pd.DataFrame, insee_codes: set) -> pd.DataFrame:
    """Filtre le dataframe BAN pour ne garder que les communes ciblées."""
    df = df[df["code_insee"].isin(insee_codes)].copy()
    available_cols = [c for c in BAN_COLUMNS_KEEP if c in df.columns]
    df = df[available_cols]
    df["code_postal_secteur"] = df["code_insee"].map(CODE_POSTAL_BY_INSEE)
    df["nom_commune_ref"] = df["code_insee"].map(ALL_COMMUNES)
    return df


def main():
    insee_codes = set(ALL_COMMUNES.keys())
    try:
        df_raw = download_ban()
    except requests.RequestException as e:
        print(f"ERREUR réseau : {e}", file=sys.stderr)
        print("-> Vérifiez votre connexion internet et réessayez.", file=sys.stderr)
        sys.exit(1)

    df_filtered = filter_communes(df_raw, insee_codes)
    out_path = "../data/adresses_74200_74500.csv"
    df_filtered.to_csv(out_path, index=False)
    print(f"OK — {len(df_filtered):,} adresses exportées vers {out_path}")
    print(df_filtered["nom_commune_ref"].value_counts())


if __name__ == "__main__":
    main()
