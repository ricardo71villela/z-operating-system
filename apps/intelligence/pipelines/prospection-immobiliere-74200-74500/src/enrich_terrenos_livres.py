"""
Identificação de terrenos livres (parcelas cadastrais sem construção) com
potencial de construção — pedido explícito do Ricardo (12/set/2026):
"terrenos livres com potencial de construção" como nova frente de
prospeção, distinta das moradas já construídas que o resto do pipeline
trata.

DIFERENÇA FUNDAMENTAL face ao resto do pipeline: uma parcela não construída
não tem morada BAN, e os dados abertos do cadastro EXCLUEM explicitamente o
ficheiro de proprietários ("les fichiers des propriétés et des propriétaires
ne sont pas concernés" — cadastre.data.gouv.fr). Este script produz por
isso uma LISTA DE PARCELAS candidatas (identificador cadastral, comuna,
área, tipo de zona urbanística, localização) — NÃO uma lista de contactos
pronta a enviar, como as fichas de moradas. A identificação do proprietário
fica a cargo do Ricardo, via extrato da matriz cadastral na câmara
municipal (grátis) ou, em casos de sucessão não registada, via Service de
la Publicité Foncière.

MÉTODO (duas fontes de dados abertas, sem chave):
  1. Cadastre (cadastre.data.gouv.fr, bundler cadastre-etalab): camada
     "parcelles" (já usada por enrich_cadastre.py, mesma cache) e nova
     camada "batiments" (polígonos de edifícios). Uma parcela é candidata a
     "terreno livre" se (a) a sua área (`contenance`) for >=
     TERRENO_LIVRE_SURFACE_MIN, e (b) NÃO intersectar nenhum polígono de
     edifício da mesma comuna.
  2. Géoportail de l'Urbanisme, via API Carto do IGN (apicarto.ign.fr,
     aberta, sem chave), módulo GPU, endpoint zone-urba. Devolve a zona do
     PLU (typezone: U/AU/A/N) no centroide da parcela candidata. Só as
     parcelas em zona "U" (urbana, construtível desde já) entram na lista
     final — decisão explícita do Ricardo (12/set), para evitar parcelas
     "a urbanizar" (AU) que podem nunca ser abertas à construção.

LIMITAÇÕES CONHECIDAS (documentadas, não bugs):
  - Um pequeno anexo/arrumo no terreno (barracão, piscina com caseta, etc.)
    faz a parcela ser tratada como "já construída" e excluída — viés
    conservador (perdem-se alguns bons candidatos) preferido a incluir
    parcelas que já têm uma casa a mais.
  - Comunas sem PLU aprovado (regidas pelo Règlement National d'Urbanisme)
    não têm zonagem na API GPU — essas parcelas ficam sem zona e são
    excluídas por omissão (não há como confirmar "U" sem PLU). Isto reduz
    a cobertura em comunas rurais mais pequenas, mas evita incluir
    parcelas sem confirmação de construtibilidade.
  - A zona é consultada no CENTROIDE da parcela, não no polígono completo —
    uma parcela muito grande a cavalo de duas zonas pode ser classificada
    só pela zona do seu centro.

Usage:
    python enrich_terrenos_livres.py
"""
import json
import os
import time

import pandas as pd
import requests

from config import ALL_COMMUNES
from http_utils import build_session

try:
    from shapely.geometry import shape
    from shapely.strtree import STRtree
    HAS_SHAPELY = True
except ImportError:
    HAS_SHAPELY = False

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "output")
CACHE_PARCELLES_DIR = os.path.join(DATA_DIR, "_cache", "cadastre")
CACHE_BATIMENTS_DIR = os.path.join(DATA_DIR, "_cache", "cadastre_batiments")

CADASTRE_URL_TEMPLATE = (
    "https://cadastre.data.gouv.fr/bundler/cadastre-etalab/communes/"
    "{code}/geojson/{camada}"
)
FORCE_REDOWNLOAD = os.environ.get("FORCE_REDOWNLOAD") == "1"

GPU_ZONE_URBA_URL = "https://apicarto.ign.fr/api/gpu/zone-urba"
GPU_SLEEP = 0.2   # nenhum limite publicado -- 5 pedidos/s por precaução
GPU_TIMEOUT = 20

# ---------------------------------------------------------------------------
# PARÂMETROS -- decisão explícita do Ricardo (12/set/2026)
TERRENO_LIVRE_SURFACE_MIN = 500       # m2 -- tamanho típico mínimo p/ moradia
GPU_ZONAS_INCLUIDAS = {"U"}           # só zonas já construtíveis hoje (não "AU")
# ---------------------------------------------------------------------------

OUT_COLUMNS = [
    "parcela_id", "code_insee", "commune", "area_m2",
    "zona_plu", "zona_libelle", "lon", "lat", "link_mapa",
]


def _fetch_layer(code_insee, camada, cache_dir):
    cache_path = os.path.join(cache_dir, f"{code_insee}.geojson")
    if not FORCE_REDOWNLOAD and os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)
    url = CADASTRE_URL_TEMPLATE.format(code=code_insee, camada=camada)
    try:
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        data = r.json()
    except (requests.RequestException, ValueError) as e:
        print(f"    {code_insee} ({camada}): injoignable ({e})")
        return None
    os.makedirs(cache_dir, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return data


def find_parcelas_livres(code_insee):
    """Devolve a lista de parcelas (>= TERRENO_LIVRE_SURFACE_MIN m2, sem
    nenhum edifício) para uma comuna, com o centroide de cada uma."""
    if not HAS_SHAPELY:
        return []

    parcelles_gj = _fetch_layer(code_insee, "parcelles", CACHE_PARCELLES_DIR)
    if not parcelles_gj:
        return []
    batiments_gj = _fetch_layer(code_insee, "batiments", CACHE_BATIMENTS_DIR)
    batiment_geoms = []
    if batiments_gj:
        for feat in batiments_gj.get("features", []):
            try:
                batiment_geoms.append(shape(feat["geometry"]))
            except Exception:
                continue
    bat_tree = STRtree(batiment_geoms) if batiment_geoms else None

    candidatas = []
    for feat in parcelles_gj.get("features", []):
        props = feat.get("properties") or {}
        contenance = props.get("contenance")
        if not contenance or contenance < TERRENO_LIVRE_SURFACE_MIN:
            continue
        try:
            geom = shape(feat["geometry"])
        except Exception:
            continue

        tem_edificio = False
        if bat_tree is not None:
            for j in bat_tree.query(geom):
                if geom.intersects(batiment_geoms[j]):
                    tem_edificio = True
                    break
        if tem_edificio:
            continue

        c = geom.centroid
        candidatas.append({
            "parcela_id": props.get("id"),
            "code_insee": code_insee,
            "area_m2": contenance,
            "lon": c.x,
            "lat": c.y,
        })
    return candidatas


def consultar_zona_plu(lon, lat, session):
    """Consulta a zona do PLU no centroide via API Carto (GPU). Devolve
    (typezone, libelle) ou (None, None) se não houver zonagem disponível
    (comuna sem PLU, ou API inacessível)."""
    geom = json.dumps({"type": "Point", "coordinates": [lon, lat]})
    try:
        r = session.get(GPU_ZONE_URBA_URL, params={"geom": geom}, timeout=GPU_TIMEOUT)
        r.raise_for_status()
        feats = r.json().get("features", [])
    except (requests.RequestException, ValueError):
        return None, None
    if not feats:
        return None, None
    props = feats[0].get("properties") or {}
    return props.get("typezone"), props.get("libelle")


def main():
    if not HAS_SHAPELY:
        print("shapely non installé — recherche de terrains libres sautée "
              "(pip install shapely).")
        pd.DataFrame(columns=OUT_COLUMNS).to_csv(
            os.path.join(OUTPUT_DIR, "terrenos_livres_potencial.csv"), index=False)
        return

    session = build_session()
    all_rows = []
    n_sem_plu = 0
    print(f"Procura de terrenos livres (>= {TERRENO_LIVRE_SURFACE_MIN} m², "
          f"zona {'/'.join(sorted(GPU_ZONAS_INCLUIDAS))}) em "
          f"{len(ALL_COMMUNES)} comunas...")
    for code, nome in ALL_COMMUNES.items():
        candidatas = find_parcelas_livres(code)
        n_zona_ok = 0
        for c in candidatas:
            typezone, libelle = consultar_zona_plu(c["lon"], c["lat"], session)
            time.sleep(GPU_SLEEP)
            if typezone is None:
                n_sem_plu += 1
                continue
            if typezone not in GPU_ZONAS_INCLUIDAS:
                continue
            n_zona_ok += 1
            all_rows.append({
                "parcela_id": c["parcela_id"],
                "code_insee": code,
                "commune": nome,
                "area_m2": c["area_m2"],
                "zona_plu": typezone,
                "zona_libelle": libelle,
                "lon": round(c["lon"], 6),
                "lat": round(c["lat"], 6),
                "link_mapa": f"https://www.google.com/maps?q={c['lat']:.6f},{c['lon']:.6f}",
            })
        print(f"  {nome:26s} {n_zona_ok:>4} terreno(s) livre(s) em zona "
              f"construtível (de {len(candidatas)} candidatas sem edifício)")

    df = pd.DataFrame(all_rows, columns=OUT_COLUMNS)
    if not df.empty:
        df = df.sort_values("area_m2", ascending=False)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out = os.path.join(OUTPUT_DIR, "terrenos_livres_potencial.csv")
    df.to_csv(out, index=False)
    print(f"\nOK — {len(df):,} terrenos livres com potencial -> {out}")
    if n_sem_plu:
        print(f"  ({n_sem_plu:,} parcelas sem edifício ficaram sem zona PLU "
              f"conhecida na API GPU e foram excluídas -- comuna sem PLU "
              f"aprovado, ou zona não mapeada)")
    print("\nESTA LISTA NÃO TEM DADOS DE PROPRIETÁRIO (não existem em dados "
          "abertos para parcelas não construídas). Para cada parcela de "
          "interesse, pede um extrato da matriz cadastral na câmara "
          "municipal (grátis) para identificar o proprietário.")


if __name__ == "__main__":
    main()
