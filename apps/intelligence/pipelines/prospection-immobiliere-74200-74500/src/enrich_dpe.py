"""
Enrichissement via l'API DPE de l'ADEME (open data, licence Etalab).

POURQUOI C'EST LA PIECE MAITRESSE :
Le DVF ne couvre que les biens VENDUS depuis 2019 — or les cibles les plus
intéressantes (Tier 1) sont justement celles qui ne se sont pas vendues.
Le DPE comble ce trou : il donne l'annee de construction, la surface et la
classe energetique de biens qui n'apparaissent nulle part dans le DVF.

En prime, la classe DPE est un levier de prospection direct :
  - logements G : interdits a la location depuis le 01/01/2025
  - logements F : interdits a partir du 01/01/2028
  - logements E : interdits a partir du 01/01/2034
Un proprietaire de passoire thermique est structurellement plus enclin a
vendre ou renover.

ROBUSTESSE : les noms de champs de l'API ADEME ont change entre versions.
Ce module DECOUVRE le schema a l'execution (une requete d'echantillon) puis
mappe les champs disponibles, au lieu de coder en dur des noms qui peuvent
casser. Si aucun champ n'est trouve, l'enrichissement est saute proprement
sans faire echouer le pipeline.

Usage:
    python enrich_dpe.py
"""
import os
import sys
import time

import pandas as pd
import requests

from config import (ALL_COMMUNES, DPE_API_BASE, DPE_DATASETS, DPE_PAGE_SIZE,
                    DPE_MAX_PAGES_PER_COMMUNE, DPE_SLEEP)
from normalize import normalize_voie, normalize_numero

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

# Pour chaque information voulue, les noms de champ possibles selon la
# version du jeu de donnees. Le premier trouve dans le schema est retenu.
FIELD_CANDIDATES = {
    "dpe_classe": ["etiquette_dpe", "classe_consommation_energie",
                   "classe_estimation_ges", "etiquette_DPE"],
    "ges_classe": ["etiquette_ges", "classe_estimation_ges", "etiquette_GES"],
    "annee_construction": ["annee_construction", "periode_construction",
                           "annee_construction_ban"],
    "surface_dpe": ["surface_habitable_logement", "surface_habitable",
                    "surface_thermique_lot"],
    "type_batiment": ["type_batiment", "typologie_logement", "tr002_type_batiment_description"],
    "adresse_brute": ["adresse_ban", "adresse_brut", "geo_adresse", "adresse_2"],
    "numero_voie": ["numero_voie_ban", "numero_voie", "n_voie_ban"],
    "nom_voie": ["nom_rue_ban", "nom_voie_ban", "nom_rue", "type_voie_ban"],
    "code_insee": ["code_insee_ban", "code_insee_commune_actualise",
                   "code_insee", "commune_ban"],
    "date_dpe": ["date_etablissement_dpe", "date_visite_diagnostiqueur",
                 "date_reception_dpe"],
}


def discover_dataset():
    """Trouve le premier jeu de donnees DPE qui repond, et lit son schema."""
    for ds in DPE_DATASETS:
        url = f"{DPE_API_BASE}/{ds}/lines"
        try:
            r = requests.get(url, params={"size": 1}, timeout=30)
            if r.status_code != 200:
                print(f"  {ds}: HTTP {r.status_code} — ignore")
                continue
            data = r.json()
            results = data.get("results") or []
            if not results:
                print(f"  {ds}: repond mais aucune ligne — ignore")
                continue
            schema = set(results[0].keys())
            print(f"  OK -> jeu de donnees '{ds}' ({len(schema)} champs)")
            return ds, schema
        except (requests.RequestException, ValueError) as e:
            print(f"  {ds}: injoignable ({e}) — ignore")
    return None, set()


def build_field_map(schema):
    """Associe chaque info voulue au premier nom de champ present au schema."""
    mapping = {}
    for target, candidates in FIELD_CANDIDATES.items():
        for cand in candidates:
            if cand in schema:
                mapping[target] = cand
                break
    return mapping


def fetch_commune(dataset, field_map, code_insee, nom_commune):
    """Recupere tous les DPE d'une commune, page par page (pagination 'after')."""
    url = f"{DPE_API_BASE}/{dataset}/lines"
    insee_field = field_map.get("code_insee")
    if not insee_field:
        return []

    select = sorted(set(field_map.values()))
    rows, after, pages = [], None, 0

    while pages < DPE_MAX_PAGES_PER_COMMUNE:
        params = {
            "size": DPE_PAGE_SIZE,
            "select": ",".join(select),
            "qs": f'{insee_field}:"{code_insee}"',
        }
        if after:
            params["after"] = after
        try:
            r = requests.get(url, params=params, timeout=60)
            r.raise_for_status()
            data = r.json()
        except (requests.RequestException, ValueError) as e:
            print(f"    {nom_commune}: interrompu ({e})")
            break

        results = data.get("results") or []
        rows.extend(results)
        pages += 1

        after = data.get("next")
        if isinstance(after, str) and after.startswith("http"):
            # certaines versions renvoient une URL complete : on s'arrete la
            break
        if not after or len(results) < DPE_PAGE_SIZE:
            break
        time.sleep(DPE_SLEEP)

    return rows


def normalize_dpe_frame(rows, field_map):
    """Renomme les colonnes vers nos noms internes et cree les cles de matching."""
    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    rename = {src: dst for dst, src in field_map.items() if src in df.columns}
    df = df.rename(columns=rename)

    # Cles de matching : meme normalisation que BAN et DVF
    if "nom_voie" in df.columns:
        df["k_voie"] = df["nom_voie"].apply(normalize_voie)
    elif "adresse_brute" in df.columns:
        # Extrait le libelle de voie depuis l'adresse complete.
        # Deux pieges evites ici :
        #  - une lettre isolee n'est un suffixe que si elle est COLLEE au
        #    numero ("14B Avenue"). Separee par un espace, c'est le type de
        #    voie ("7 R DU PORT" -> R = RUE), qu'il ne faut pas supprimer.
        #  - "BIS"/"TER" suivis de \b, sinon on ronge le debut du libelle.
        df["k_voie"] = (df["adresse_brute"].astype(str)
                        .str.replace(r"^\s*\d+[A-Za-z]?\s*(?:BIS|TER|QUATER)?\b\s*",
                                     "", regex=True, case=False)
                        .apply(normalize_voie))
    else:
        df["k_voie"] = ""

    if "numero_voie" in df.columns:
        df["k_num"] = df["numero_voie"].apply(normalize_numero)
    elif "adresse_brute" in df.columns:
        df["k_num"] = (df["adresse_brute"].astype(str)
                       .str.extract(r"^\s*(\d+)")[0]
                       .apply(normalize_numero))
    else:
        df["k_num"] = ""

    # Normalisation de l'annee de construction (parfois une periode : "1948-1974")
    if "annee_construction" in df.columns:
        df["annee_construction"] = (
            df["annee_construction"].astype(str)
            .str.extract(r"(\d{4})")[0]
        )
        df["annee_construction"] = pd.to_numeric(df["annee_construction"], errors="coerce")

    if "surface_dpe" in df.columns:
        df["surface_dpe"] = pd.to_numeric(df["surface_dpe"], errors="coerce")

    if "dpe_classe" in df.columns:
        df["dpe_classe"] = df["dpe_classe"].astype(str).str.strip().str.upper().str[:1]
        df.loc[~df["dpe_classe"].isin(list("ABCDEFG")), "dpe_classe"] = None

    return df


def main():
    print("Recherche du jeu de donnees DPE disponible...")
    dataset, schema = discover_dataset()
    if not dataset:
        print("\nAucune API DPE joignable — enrichissement DPE saute.")
        print("Le pipeline continuera avec BAN + DVF uniquement.")
        pd.DataFrame().to_csv(os.path.join(DATA_DIR, "dpe_74200_74500.csv"), index=False)
        return

    field_map = build_field_map(schema)
    print(f"\nChamps detectes : {', '.join(sorted(field_map))}")
    missing = set(FIELD_CANDIDATES) - set(field_map)
    if missing:
        print(f"Champs absents de ce jeu (ignores) : {', '.join(sorted(missing))}")

    if "code_insee" not in field_map:
        print("\nATTENTION : aucun champ code INSEE trouve — impossible de filtrer.")
        pd.DataFrame().to_csv(os.path.join(DATA_DIR, "dpe_74200_74500.csv"), index=False)
        return

    all_rows = []
    print(f"\nTelechargement des DPE pour {len(ALL_COMMUNES)} communes...")
    for code, nom in ALL_COMMUNES.items():
        rows = fetch_commune(dataset, field_map, code, nom)
        all_rows.extend(rows)
        print(f"  {nom:26s} {len(rows):>6,} DPE")
        time.sleep(DPE_SLEEP)

    df = normalize_dpe_frame(all_rows, field_map)
    out = os.path.join(DATA_DIR, "dpe_74200_74500.csv")
    df.to_csv(out, index=False)
    print(f"\nOK — {len(df):,} DPE exportes vers {out}")

    if "dpe_classe" in df.columns and len(df):
        print("\nRepartition des classes DPE :")
        print(df["dpe_classe"].value_counts().sort_index().to_string())


if __name__ == "__main__":
    main()
