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

PAGINATION : l'API data-fair de l'ADEME renvoie `next` sous deux formes
selon le jeu de donnees — soit un simple curseur a repasser en parametre
`after`, soit une URL complete a appeler telle quelle. Une version
precedente de ce module s'arretait des qu'elle recevait une URL complete,
ce qui plafonnait SILENCIEUSEMENT chaque commune a une seule page
(DPE_PAGE_SIZE resultats) — invisible sauf sur les communes assez grandes
pour depasser cette taille. `fetch_commune` gere maintenant les deux formes.

CACHE : les lignes brutes recuperees par commune sont mises en cache sur
disque (data/_cache/dpe/). Un relancement reutilise le cache au lieu de
retelecharger ~40 communes page par page. Supprimez le dossier de cache,
ou lancez avec FORCE_REDOWNLOAD=1, pour forcer un nouveau telechargement.

Usage:
    python enrich_dpe.py
"""
import json
import os
import sys
import time

import pandas as pd
import requests

from config import (ALL_COMMUNES, DPE_API_BASE, DPE_DATASETS, DPE_PAGE_SIZE,
                    DPE_MAX_PAGES_PER_COMMUNE, DPE_SLEEP)
from normalize import normalize_voie, normalize_numero

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
CACHE_DIR = os.path.join(DATA_DIR, "_cache", "dpe")
FORCE_REDOWNLOAD = os.environ.get("FORCE_REDOWNLOAD") == "1"

# Nombre de lignes d'echantillon pour la decouverte de schema (voir
# discover_dataset) : assez pour qu'un champ optionnel/souvent nul (ex.
# complement_adresse_logement) ait une vraie chance d'apparaitre au moins
# une fois, sans alourdir sensiblement l'appel initial.
#
# BUG CORRIGE (audit 2026-09-12) : cet echantillon etait tire SANS AUCUN
# FILTRE sur le jeu de donnees national entier (des millions de lignes,
# 400+ champs possibles selon la doc ADEME) — un champ pourtant bien REEL
# et bien rempli pour notre zone (verifie en direct : `surface_habitable_logement`
# present et renseigne, 23 a 103,5 m², sur un echantillon reel filtre a
# Thonon-les-Bains) pouvait simplement ne pas figurer dans un tirage de 50
# lignes au hasard a l'echelle nationale, et etait alors marque a tort
# "absent du jeu de donnees" — silencieusement, sans aucune erreur visible.
# C'est ce qui avait fait conclure, a tort, que `dpe03existant` n'avait
# aucun champ de surface (voir audit 2026-09-11) alors que le champ existe
# et est exploitable pour notre secteur. Corrige avec deux filets : (1)
# discover_dataset() essaie d'abord un echantillon FILTRE sur une commune
# reelle et importante du secteur (voir SCHEMA_SAMPLE_INSEE) ; (2) a defaut
# (champ INSEE introuvable dans ce jeu, ou requete rejetee), la taille de
# l'echantillon national de repli est elle-meme agrandie (500 au lieu de 50)
# pour reduire encore le risque de rater un champ par malchance.
DPE_SCHEMA_SAMPLE_SIZE = 500

# Commune reelle et importante du secteur (Thonon-les-Bains, ~14 000 DPE —
# assez pour qu'un champ meme partiellement rempli ait une vraie chance
# d'apparaitre) utilisee pour biaiser l'echantillonnage du schema vers des
# donnees representatives de notre zone plutot qu'un tirage national au
# hasard. Le nom du champ INSEE variant selon le jeu de donnees (comme pour
# "code_insee" dans FIELD_CANDIDATES ci-dessous), plusieurs noms possibles
# sont essayes dans l'ordre.
SCHEMA_SAMPLE_INSEE = "74281"
SCHEMA_SAMPLE_INSEE_FIELDS = ["code_insee_ban", "code_insee_commune_actualise",
                              "code_insee", "commune_ban"]

# Pour chaque information voulue, les noms de champ possibles selon la
# version du jeu de donnees. Le premier trouve dans le schema est retenu.
#
# "geopoint" (audit 2026-09-07, suite) : verifie en direct sur l'API ADEME
# (jeu "dpe03existant") que le champ `_geopoint` ("lat,lon") EXISTE bel et
# bien et est rempli pour la quasi-totalite des DPE (100 % a Anthy-sur-Leman,
# 95 % a Meillerie sur un echantillon de 314 et 121 DPE respectivement) — ce
# n'est PAS une limitation de la source, contrairement a ce qui avait ete
# suppose au debut de cette investigation : c'est notre propre `select` qui
# ne demandait jamais ce champ. Meme la ligne qui echoue au rapprochement
# BAN par adresse (`statut_geocodage` = "non geocodee") porte le plus
# souvent un `_geopoint` valide (geocodage a la voie/commune) : cela permet
# un repli spatial pour le DPE, identique dans son principe a celui deja en
# place pour le DVF (segment.spatial_fallback_match) et le cadastre
# (enrich_cadastre.match_addresses), au lieu de dependre uniquement du nom
# de voie normalise (fragile en cas de renumerotation ou de renommage — ex.
# "Rue Nationale" a Meillerie, absente de la BAN actuelle qui utilise
# "Route de Meillerie").
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
    "geopoint": ["_geopoint"],
    "statut_geocodage": ["statut_geocodage"],
    # AJOUT (2026-09-10, demande explicite) : pour un appartement, il n'existe
    # aucun equivalent au "terrain" d'une maison (la parcelle est collective,
    # pas de m² individualise) — le repere qui permet de reconnaitre le meme
    # bien dans une annonce concurrente en manque donc. Verifie en direct sur
    # l'API ADEME que ces deux champs existent et sont parfois renseignes :
    # l'etage rapproche l'appartement d'un repere physique, et le complement
    # d'adresse porte souvent le nom du lot/de la residence (ex. "Villa n°10")
    # — meme role que le nom de residence dans une annonce. Purement informatif,
    # jamais utilise dans le score (comme info_erp/rnb_id).
    "andar_apartamento": ["numero_etage_appartement"],
    "complemento_morada": ["complement_adresse_logement"],
    # AJOUT (audit 2026-09-12) : le DPE porte lui-meme l'identifiant du
    # batiment RNB (`id_rnb`), verifie present et renseigne pour la
    # majorite des lignes d'un echantillon reel a Thonon-les-Bains. C'est
    # une seconde voie, independante de celle deja utilisee par
    # enrich_rnb.py (morada BAN -> ban_id -> rnb_id), vers le meme
    # identifiant de batiment — utile pour croiser/completer les deux
    # sources, et pour compter combien d'appartements DPE distincts
    # partagent un meme id_rnb (indice de la taille reelle d'une
    # copropriete). Purement informatif, jamais utilise dans le score.
    "id_rnb_dpe": ["id_rnb"],
}


def discover_dataset():
    """Trouve un jeu de donnees DPE qui repond ET couvre les champs essentiels,
    et lit son schema.

    BUG CORRIGE (2026-09-10) : le schema etait deduit d'UNE SEULE ligne
    d'echantillon (`size=1`). L'API data-fair de l'ADEME omet les champs
    a valeur nulle du JSON plutot que de les renvoyer vides — un champ
    optionnel et souvent absent (ex. `complement_adresse_logement`, rempli
    seulement pour certains lots/residences) a donc de fortes chances de
    manquer sur une seule ligne tiree au hasard, meme s'il existe bel et
    bien dans le jeu de donnees. Constate en reel : `andar_apartamento`
    (`numero_etage_appartement`, quasi toujours present, meme a 0) passait,
    mais `complemento_morada` (`complement_adresse_logement`) disparaissait
    systematiquement de la sortie. Corrige en prenant l'UNION des cles sur
    DPE_SCHEMA_SAMPLE_SIZE lignes au lieu d'une seule — un champ optionnel
    n'a plus besoin d'etre present sur CETTE ligne precise pour etre detecte.

    BUG CORRIGE #2 (audit 2026-09-11) : cette fonction s'arretait au PREMIER
    jeu de donnees qui repondait avec au moins une ligne, sans jamais
    verifier qu'il couvrait les champs dont le pipeline a besoin. Constate en
    reel : le premier de DPE_DATASETS ('dpe-v2-logements-existants', le jeu
    "principal") etait indisponible au moment du dernier run, et le
    pipeline retombait sur 'dpe03existant' — qui repond bien, mais dont le
    schema (verifie en direct : 13 champs seulement) NE CONTIENT AUCUN champ
    de surface (ni `surface_habitable_logement`, ni `surface_habitable`, ni
    `surface_thermique_lot`) ni `complement_adresse_logement`. Consequence
    directe, verifiee sur les donnees reelles : `surface_dpe` restait vide
    pour 100 % des adresses "jamais vendues" (aucune vente DVF connue) —
    55,5 % de toute la liste prioritaire (11 032 sur 19 895 moradas) — sans
    aucun message d'erreur visible, le pipeline continuant silencieusement
    avec un champ manquant plutot que de le signaler ou d'essayer un autre
    jeu de donnees. Corrige : on essaie maintenant TOUS les jeux de
    DPE_DATASETS qui repondent, et on retient le PREMIER a la fois valide et
    couvrant `surface_dpe` — le premier jeu simplement responsif sert
    seulement de dernier recours si aucun ne couvre ce champ, avec un
    avertissement explicite (au lieu d'un silence).

    BUG CORRIGE #3 (audit 2026-09-12) : meme apres la correction precedente,
    l'echantillon utilise pour juger si un jeu "couvre" `surface_dpe` etait
    tire SANS FILTRE sur le jeu national entier — voir le commentaire sur
    DPE_SCHEMA_SAMPLE_SIZE plus haut pour le detail. Verifie en direct sur
    l'API ADEME (requete filtree sur Thonon-les-Bains, code_insee_ban
    "74281") : `surface_habitable_logement` est bel et bien present dans
    'dpe03existant', rempli sur 100 % d'un echantillon reel (23 a 103,5 m²).
    Corrige en essayant d'abord un echantillon filtre sur une commune
    reelle du secteur (_sample_rows ci-dessous), avec repli sur un
    echantillon national elargi seulement si ce filtre echoue completement."""

    def _sample_rows(ds_url):
        """Renvoie (lignes, filtre_utilise_ou_None). Essaie d'abord un
        echantillon filtre sur SCHEMA_SAMPLE_INSEE (plusieurs noms de champ
        INSEE possibles), puis, a defaut, un echantillon national elargi."""
        for insee_field in SCHEMA_SAMPLE_INSEE_FIELDS:
            try:
                r = requests.get(ds_url, params={
                    "size": DPE_SCHEMA_SAMPLE_SIZE,
                    "qs": f'{insee_field}:"{SCHEMA_SAMPLE_INSEE}"',
                }, timeout=30)
                if r.status_code != 200:
                    continue
                rows = (r.json().get("results")) or []
                if rows:
                    return rows, insee_field
            except (requests.RequestException, ValueError):
                continue
        # Repli : aucun filtre par commune n'a fonctionne (nom de champ
        # INSEE different dans ce jeu, ou requete rejetee) — echantillon
        # national, mais elargi (voir DPE_SCHEMA_SAMPLE_SIZE).
        r = requests.get(ds_url, params={"size": DPE_SCHEMA_SAMPLE_SIZE}, timeout=30)
        r.raise_for_status()
        return (r.json().get("results")) or [], None

    fallback = None  # (dataset, schema) du premier jeu responsif, meme sans surface
    for ds in DPE_DATASETS:
        url = f"{DPE_API_BASE}/{ds}/lines"
        try:
            r_check = requests.get(url, params={"size": 1}, timeout=30)
            if r_check.status_code != 200:
                print(f"  {ds}: HTTP {r_check.status_code} — ignore")
                continue
            results, filtre = _sample_rows(url)
            if not results:
                print(f"  {ds}: repond mais aucune ligne — ignore")
                continue
            schema = set()
            for row in results:
                schema |= set(row.keys())
            has_surface = any(c in schema for c in FIELD_CANDIDATES["surface_dpe"])
            desc_filtre = f"filtre sur Thonon-les-Bains via {filtre}" if filtre else "national, sans filtre"
            print(f"  {ds}: repond, {len(schema)} champs (union sur {len(results)} lignes, {desc_filtre})"
                  f"{'' if has_surface else ' — AUCUN champ de surface (surface_dpe restera vide)'}")
            if fallback is None:
                fallback = (ds, schema)
            if has_surface:
                print(f"  OK -> jeu de donnees retenu : '{ds}' (couvre surface_dpe)")
                return ds, schema
        except (requests.RequestException, ValueError) as e:
            print(f"  {ds}: injoignable ({e}) — ignore")
    if fallback:
        print(f"  ATTENTION : aucun jeu de donnees DPE avec un champ de surface "
              f"trouve parmi {DPE_DATASETS} — utilisation de '{fallback[0]}' en "
              f"dernier recours (surface_dpe restera vide pour toutes les adresses "
              f"'jamais vendues' — voir audit 2026-09-11/12 dans le projet ZOS).")
        return fallback
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
    """Recupere tous les DPE d'une commune, page par page.

    Gere les deux formes de pagination `next` de l'API data-fair :
    un curseur nu (repasse en parametre `after`) ou une URL complete
    (appelee directement).
    """
    cache_path = os.path.join(CACHE_DIR, f"{dataset}_{code_insee}.json")
    if not FORCE_REDOWNLOAD and os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)

    base_url = f"{DPE_API_BASE}/{dataset}/lines"
    insee_field = field_map.get("code_insee")
    if not insee_field:
        return []

    select = sorted(set(field_map.values()))
    rows, pages = [], 0
    next_url = None
    next_after = None

    while pages < DPE_MAX_PAGES_PER_COMMUNE:
        try:
            if next_url:
                r = requests.get(next_url, timeout=60)
            else:
                params = {
                    "size": DPE_PAGE_SIZE,
                    "select": ",".join(select),
                    "qs": f'{insee_field}:"{code_insee}"',
                }
                if next_after:
                    params["after"] = next_after
                r = requests.get(base_url, params=params, timeout=60)
            r.raise_for_status()
            data = r.json()
        except (requests.RequestException, ValueError) as e:
            print(f"    {nom_commune}: interrompu ({e})")
            break

        results = data.get("results") or []
        rows.extend(results)
        pages += 1

        nxt = data.get("next")
        if not nxt:
            break
        if isinstance(nxt, str) and nxt.startswith("http"):
            next_url, next_after = nxt, None
        else:
            next_url, next_after = None, nxt
        if len(results) < DPE_PAGE_SIZE:
            break
        time.sleep(DPE_SLEEP)

    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(rows, f)
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

    if "type_batiment" in df.columns:
        df["type_batiment"] = df["type_batiment"].astype(str).str.strip().str.lower()
        df.loc[df["type_batiment"].isin(["", "nan", "none"]), "type_batiment"] = None

    if "andar_apartamento" in df.columns:
        df["andar_apartamento"] = pd.to_numeric(df["andar_apartamento"], errors="coerce")
    if "complemento_morada" in df.columns:
        df["complemento_morada"] = df["complemento_morada"].astype(str).str.strip()
        df.loc[df["complemento_morada"].isin(["", "nan", "None"]), "complemento_morada"] = None
    if "id_rnb_dpe" in df.columns:
        df["id_rnb_dpe"] = df["id_rnb_dpe"].astype(str).str.strip()
        df.loc[df["id_rnb_dpe"].isin(["", "nan", "None"]), "id_rnb_dpe"] = None

    if "dpe_classe" in df.columns:
        df["dpe_classe"] = df["dpe_classe"].astype(str).str.strip().str.upper().str[:1]
        df.loc[~df["dpe_classe"].isin(list("ABCDEFG")), "dpe_classe"] = None

    # `_geopoint` est une chaine "lat,lon" (voir note sur FIELD_CANDIDATES) ;
    # on l'eclate en deux colonnes numeriques exploitables par le repli
    # spatial de segment.py, sur le meme modele que lon/lat dans le DVF.
    #
    # BUG CORRIGE (audit 2026-09-07, 2e passe) : un `_geopoint` existe MEME
    # quand `statut_geocodage` indique un echec du geocodage precis a
    # l'adresse ("... aucune correspondance trouvee") — ADEME retombe alors
    # sur un geocodeur d'appoint, bien moins precis (mesure sur les DPE deja
    # apparies par cle exacte : parmi ceux-la, 55 % ont un `_geopoint`
    # pratiquement confondu avec l'adresse BAN, mais 45 % s'en ecartent de
    # dizaines a plusieurs centaines de metres). Utiliser ces points non
    # geocodes "a l'adresse" comme candidats du repli spatial ferait porter
    # la classe DPE d'un batiment a un voisin totalement different dans les
    # zones denses (jusqu'a 23 adresses distinctes rattachees au meme point
    # dans les tests). On ne garde donc comme candidats que les DPE dont le
    # geocodage est explicitement precis ; l'API n'expose que deux valeurs
    # pour ce champ (verifie en direct sur l'ensemble du jeu de donnees).
    if "geopoint" in df.columns:
        coords = df["geopoint"].astype(str).str.split(",", n=1, expand=True)
        if coords.shape[1] == 2:
            df["lat_dpe"] = pd.to_numeric(coords[0], errors="coerce")
            df["lon_dpe"] = pd.to_numeric(coords[1], errors="coerce")
        df = df.drop(columns=["geopoint"])

    if "statut_geocodage" in df.columns and {"lat_dpe", "lon_dpe"} <= set(df.columns):
        precis = df["statut_geocodage"].astype(str).str.contains(
            "à l'adresse", case=False, na=False)
        df.loc[~precis, ["lat_dpe", "lon_dpe"]] = pd.NA
        df = df.drop(columns=["statut_geocodage"])

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
