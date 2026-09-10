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
import math
import os
import time

import pandas as pd
import requests

from config import ALL_COMMUNES
from normalize import normalize_voie, normalize_numero

try:
    from shapely.geometry import shape, Point
    from shapely.strtree import STRtree
    from shapely.ops import transform as shapely_transform
    HAS_SHAPELY = True
except ImportError:
    HAS_SHAPELY = False

# ---------------------------------------------------------------------------
# Repli de proximite (audit 2026-09-07) : le rattachement point-dans-polygone
# strict ci-dessous echoue pour une adresse des qu'un arrondi de geocodage la
# place a quelques metres a l'exterieur de sa vraie parcelle cadastrale — un
# probleme de PRECISION, pas d'absence de donnee. Verification sur geometrie
# reelle (Evian-les-Bains, pire cas a 40,9 % de couverture) : 96,6 % des
# adresses non appariees se trouvent a MOINS DE 15 m d'une parcelle reelle
# (distance mediane 0,7 m). On applique donc, comme pour le rapprochement
# spatial DVF (segment.spatial_fallback_match), un repli "parcelle la plus
# proche" borne a FALLBACK_MAX_M, au-dela duquel on prefere laisser le champ
# vide plutot que de risquer un faux rattachement a un autre terrain.
# ---------------------------------------------------------------------------
FALLBACK_MAX_M = 20
FALLBACK_BUFFER_DEG = 0.0006  # ~50-65 m selon la latitude : marge large pour
                               # le pre-filtrage STRtree avant mesure exacte
                               # en metres (projection plane locale).

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


def _m_per_deg(lat0):
    """Facteurs de conversion degre -> metre pour une projection plane
    equirectangulaire locale (meme principe que segment._local_xy_m),
    suffisante a l'echelle d'une parcelle."""
    return 111_320.0 * math.cos(math.radians(lat0)), 110_540.0


def match_addresses(adresses_sub, geojson):
    """Point-dans-polygone : associe chaque adresse (lon/lat) à sa parcelle,
    avec repli sur la parcelle la plus proche a moins de FALLBACK_MAX_M
    quand aucune parcelle ne contient le point exactement (voir note
    "Repli de proximite" en tete de fichier).

    Renvoie (dict {index_ligne: contenance_m2}, nb_recuperes_par_repli).
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
        return {}, 0

    tree = STRtree(geoms)
    out = {}
    unmatched = []
    for i, row in adresses_sub.iterrows():
        lon, lat = row.get("lon"), row.get("lat")
        if pd.isna(lon) or pd.isna(lat):
            continue
        pt = Point(float(lon), float(lat))
        found = False
        # shapely >= 2.0 : query() renvoie des INDICES dans `geoms`, pas des
        # geometries (piege courant lors d'une migration depuis shapely 1.x).
        for j in tree.query(pt):
            if geoms[j].contains(pt):
                if contenances[j]:
                    out[i] = contenances[j]
                found = True
                break
        if not found:
            unmatched.append((i, pt))

    n_repli = 0
    for i, pt in unmatched:
        cand_idx = tree.query(pt.buffer(FALLBACK_BUFFER_DEG))
        if len(cand_idx) == 0:
            continue
        m_lon, m_lat = _m_per_deg(pt.y)
        lon0, lat0 = pt.x, pt.y

        def _to_xy(x, y, z=None, m_lon=m_lon, m_lat=m_lat, lon0=lon0, lat0=lat0):
            return ((x - lon0) * m_lon, (y - lat0) * m_lat)

        best_j, best_d = None, None
        for j in cand_idx:
            g_xy = shapely_transform(_to_xy, geoms[j])
            d = g_xy.distance(Point(0.0, 0.0))
            if best_d is None or d < best_d:
                best_d, best_j = d, j
        if best_j is not None and best_d <= FALLBACK_MAX_M and contenances[best_j]:
            out[i] = contenances[best_j]
            n_repli += 1

    return out, n_repli


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
    total_repli = 0
    print(f"Rattachement des parcelles cadastrales pour {len(ALL_COMMUNES)} communes...")
    for code, nom in ALL_COMMUNES.items():
        geojson = fetch_commune_geojson(code)
        if not geojson:
            continue
        sub = adresses[adresses["code_insee"] == code]
        matches, n_repli = match_addresses(sub, geojson)
        total_repli += n_repli
        for i, contenance in matches.items():
            all_rows.append({
                "k_num": normalize_numero(adresses.loc[i, "numero"]),
                "k_voie": normalize_voie(adresses.loc[i, "nom_voie"]),
                "code_insee": code,
                "surface_terrain_m2": contenance,
            })
        repli_txt = f" (dont {n_repli:,} par repli <= {FALLBACK_MAX_M} m)" if n_repli else ""
        print(f"  {nom:26s} {len(matches):>6,} / {len(sub):,} adresses rattachées{repli_txt}")
        time.sleep(0.05)

    df = pd.DataFrame(all_rows, columns=OUT_COLUMNS)
    # Meme immeuble = meme parcelle : plusieurs adresses peuvent partager la
    # meme contenance, c'est attendu (ex. appartements du meme batiment).
    out = os.path.join(DATA_DIR, "cadastre_74200_74500.csv")
    df.to_csv(out, index=False)
    print(f"\nOK — {len(df):,} adresses rattachées à une parcelle -> {out}")
    if total_repli:
        print(f"  dont {total_repli:,} récupérées par repli de proximité "
              f"(<= {FALLBACK_MAX_M} m, imprécision de géocodage — voir audit 2026-09-07)")


if __name__ == "__main__":
    main()
