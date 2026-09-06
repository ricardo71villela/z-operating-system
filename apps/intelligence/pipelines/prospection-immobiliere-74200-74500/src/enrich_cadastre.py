"""
Enrichissement via le cadastre ouvert (Etalab, cadastre.data.gouv.fr,
licence ouverte, sans clé).

NOUVEL ARGUMENT : la surface de TERRAIN (parcelle), absente à la fois du
DVF et du DPE (qui ne documentent que le bâti). Un grand terrain sous un
bâti ancien ou petit est un signal de potentiel de valorisation (extension,
division parcellaire) indépendant des autres critères.

METHODE : télécharge le GeoJSON des parcelles par commune, puis rattache
chaque adresse à sa parcelle par un test point-dans-polygone (coordonnées
BAN). Nécessite shapely >= 2.0 (voir requirements.txt) ; si absent,
l'enrichissement est sauté proprement, comme pour un DPE injoignable.

Usage:
    python enrich_cadastre.py
"""
import json
import os
import time

import pandas as pd
import requests

from config import ALL_COMMUNES
from normalize import normalize_voie, normalize_numero

try:
    from shapely.geometry import shape, Point
    from shapely.strtree import STRtree
    HAS_SHAPELY = True
except ImportError:
    HAS_SHAPELY = False

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
CACHE_DIR = os.path.join(DATA_DIR, "_cache", "cadastre")
CADASTRE_URL_TEMPLATE = (
    "https://cadastre.data.gouv.fr/bundler/cadastre-etalab/communes/{code}/geojson/parcelles"
)
FORCE_REDOWNLOAD = os.environ.get("FORCE_REDOWNLOAD") == "1"
OUT_COLUMNS = ["k_num", "k_voie", "code_insee", "surface_terrain_m2"]


def fetch_commune_geojson(code_insee):
    cache_path = os.path.join(CACHE_DIR, f"{code_insee}.geojson")
    if not FORCE_REDOWNLOAD and os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)
    url = CADASTRE_URL_TEMPLATE.format(code=code_insee)
    try:
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        data = r.json()
    except (requests.RequestException, ValueError) as e:
        print(f"    {code_insee}: injoignable ({e})")
        return None
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return data


def match_addresses(adresses_sub, geojson):
    """Point-dans-polygone : associe chaque adresse (lon/lat) à sa parcelle.

    Renvoie {index_ligne: contenance_m2}.
    """
    feats = geojson.get("features", [])
    geoms, contenances = [], []
    for feat in feats:
        try:
            geoms.append(shape(feat["geometry"]))
        except Exception:
            continue
        contenances.append((feat.get("properties") or {}).get("contenance"))

    if not geoms:
        return {}

    tree = STRtree(geoms)
    out = {}
    for i, row in adresses_sub.iterrows():
        lon, lat = row.get("lon"), row.get("lat")
        if pd.isna(lon) or pd.isna(lat):
            continue
        pt = Point(float(lon), float(lat))
        # shapely >= 2.0 : query() renvoie des INDICES dans `geoms`, pas des
        # geometries (piege courant lors d'une migration depuis shapely 1.x).
        for j in tree.query(pt):
            if geoms[j].contains(pt):
                if contenances[j]:
                    out[i] = contenances[j]
                break
    return out


def main():
    if not HAS_SHAPELY:
        print("shapely non installé — enrichissement cadastre sauté "
              "(pip install shapely). Le pipeline continue sans.")
        pd.DataFrame(columns=OUT_COLUMNS).to_csv(
            os.path.join(DATA_DIR, "cadastre_74200_74500.csv"), index=False)
        return

    adr_path = os.path.join(DATA_DIR, "adresses_74200_74500.csv")
    if not os.path.exists(adr_path):
        print("adresses_74200_74500.csv introuvable — lancez ingest_ban.py d'abord.")
        pd.DataFrame(columns=OUT_COLUMNS).to_csv(
            os.path.join(DATA_DIR, "cadastre_74200_74500.csv"), index=False)
        return

    adresses = pd.read_csv(adr_path, dtype=str)
    adresses["lon"] = pd.to_numeric(adresses["lon"], errors="coerce")
    adresses["lat"] = pd.to_numeric(adresses["lat"], errors="coerce")

    all_rows = []
    print(f"Rattachement des parcelles cadastrales pour {len(ALL_COMMUNES)} communes...")
    for code, nom in ALL_COMMUNES.items():
        geojson = fetch_commune_geojson(code)
        if not geojson:
            continue
        sub = adresses[adresses["code_insee"] == code]
        matches = match_addresses(sub, geojson)
        for i, contenance in matches.items():
            all_rows.append({
                "k_num": normalize_numero(adresses.loc[i, "numero"]),
                "k_voie": normalize_voie(adresses.loc[i, "nom_voie"]),
                "code_insee": code,
                "surface_terrain_m2": contenance,
            })
        print(f"  {nom:26s} {len(matches):>6,} / {len(sub):,} adresses rattachées")
        time.sleep(0.05)

    df = pd.DataFrame(all_rows, columns=OUT_COLUMNS)
    # Meme immeuble = meme parcelle : plusieurs adresses peuvent partager la
    # meme contenance, c'est attendu (ex. appartements du meme batiment).
    out = os.path.join(DATA_DIR, "cadastre_74200_74500.csv")
    df.to_csv(out, index=False)
    print(f"\nOK — {len(df):,} adresses rattachées à une parcelle -> {out}")


if __name__ == "__main__":
    main()
