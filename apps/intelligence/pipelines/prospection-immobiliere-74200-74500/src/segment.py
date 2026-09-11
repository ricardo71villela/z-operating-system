"""
Coeur du pipeline : croise BAN (adresses) + DVF (ventes) + DPE (energie/bati),
calcule un score de priorite de prospection et exporte les listes de mailing.

LEGAL : aucune donnee d'identite de resident ou proprietaire n'est utilisee
ni produite. La sortie est une liste d'ADRESSES, adaptee a un courrier
"Le Proprietaire, [adresse]".
"""
import datetime
import os
import sys

import numpy as np
import pandas as pd

from config import (PASSOIRES, SPATIAL_MATCH_RADIUS_M,
                    PRIX_M2_PLAUSIBLE_MIN, PRIX_M2_PLAUSIBLE_MAX,
                    compute_segment_thresholds, valider_seuils)
from normalize import normalize_voie, normalize_numero, self_test
from scoring import add_scores, priority_label
import pricing
import links
import argumentaire
import fiche_pdf
import diagnostic

CURRENT_YEAR = datetime.date.today().year
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "output")

SHEET_NAMES = {
    "POTENTIEL_ELEVE":  "Potentiel élevé",
    "POTENTIEL_MOYEN":  "Potentiel moyen",
    "POTENTIEL_FAIBLE": "Potentiel faible",
}


# ------------------------------------------------------------- CHARGEMENT ---

def _load_optional_csv(path, label):
    """Charge un enrichissement optionnel (cadastre/geoRisques/RNB) : un
    fichier absent ou vide ne doit jamais faire echouer le pipeline."""
    if not os.path.exists(path):
        print(f"(Aucune donnée {label} — le pipeline continue sans.)")
        return pd.DataFrame()
    try:
        df = pd.read_csv(path, dtype=str)
    except pd.errors.EmptyDataError:
        df = pd.DataFrame()
    if df.empty:
        print(f"(Aucune donnée {label} — le pipeline continue sans.)")
    return df


def load_data():
    adr_path = os.path.join(DATA_DIR, "adresses_74200_74500.csv")
    dvf_path = os.path.join(DATA_DIR, "dvf_74200_74500.csv")
    dpe_path = os.path.join(DATA_DIR, "dpe_74200_74500.csv")
    cadastre_path = os.path.join(DATA_DIR, "cadastre_74200_74500.csv")
    georisques_path = os.path.join(DATA_DIR, "georisques_74200_74500.csv")
    rnb_path = os.path.join(DATA_DIR, "rnb_74200_74500.csv")

    for p in (adr_path, dvf_path):
        if not os.path.exists(p):
            print(f"ERREUR : fichier manquant -> {p}", file=sys.stderr)
            print("Lancez d'abord main.py (ou ingest_ban.py + ingest_dvf.py).",
                  file=sys.stderr)
            sys.exit(1)

    adresses = pd.read_csv(adr_path, dtype=str)
    dvf = pd.read_csv(dvf_path, dtype=str)
    dvf["date_mutation"] = pd.to_datetime(dvf["date_mutation"], errors="coerce")
    dvf["annee_mutation"] = dvf["date_mutation"].dt.year

    dpe = pd.DataFrame()
    if os.path.exists(dpe_path):
        try:
            dpe = pd.read_csv(dpe_path, dtype=str)
        except pd.errors.EmptyDataError:
            dpe = pd.DataFrame()
    if dpe.empty:
        print("(Aucune donnée DPE — le pipeline continue avec BAN + DVF.)")

    cadastre = _load_optional_csv(cadastre_path, "cadastre")
    georisques = _load_optional_csv(georisques_path, "Géorisques")
    rnb = _load_optional_csv(rnb_path, "RNB")

    return adresses, dvf, dpe, cadastre, georisques, rnb


def add_match_keys(adresses, dvf):
    adresses["k_voie"] = adresses["nom_voie"].apply(normalize_voie)
    adresses["k_num"] = adresses["numero"].apply(normalize_numero)
    dvf["k_voie"] = dvf["adresse_nom_voie"].apply(normalize_voie)
    dvf["k_num"] = dvf["adresse_numero"].apply(normalize_numero)
    return adresses, dvf


# --------------------------------------------------------------- MATCHING ---

# Types de local consideres comme "l'habitation elle-meme", par opposition a
# une dependance (garage, cave, box) ou un local professionnel — voir
# _type_priority ci-dessous.
_TYPES_HABITATION = {"maison", "appartement"}


def _type_priority(type_local):
    """1 si le lot DVF est l'habitation (Maison/Appartement), sinon 0.

    BUG CORRIGE (audit 2026-09-07) : sur une mutation notariale multi-lots
    (maison + garage + terrain, par exemple), le tri ne se faisait QUE par
    surface_reelle_bati, sans jamais regarder le type de local — et il
    arrive qu'une dependance (garage, atelier) ait une surface enregistree
    plus grande que la maison elle-meme sur la meme mutation. Constate sur
    les donnees reelles : 34,9 % de toutes les moradas avec une vente DVF
    associee (49,5 % de celles appariees par cle exacte) se retrouvaient
    ainsi classees "Dépendance" — 0 piece, valeur toujours nulle — alors
    que la vente d'une vraie maison ou d'un vrai appartement existait bien
    dans la meme mutation. Utilise comme critere de tri PRIORITAIRE sur la
    surface (mais apres l'annee, pour ne jamais preferer une dependance
    recente a une maison plus ancienne) : la maison/l'appartement l'emporte
    des qu'il y en a un dans la mutation ; on ne retombe sur la dependance
    que s'il n'y a vraiment aucune alternative."""
    if isinstance(type_local, str) and type_local.strip().lower() in _TYPES_HABITATION:
        return 1
    return 0


def merge_dvf(adresses, dvf):
    """Rattache a chaque adresse sa DERNIERE vente connue + caracteristiques."""
    d = dvf.dropna(subset=["annee_mutation"]).copy()

    detail = [c for c in ["type_local", "surface_reelle_bati",
                          "nombre_pieces_principales", "valeur_fonciere"]
              if c in d.columns]

    # Tri par annee, puis priorite maison/appartement > dependance, puis
    # surface : sur une mutation multi-lots (garage + logement), on retient
    # d'abord le lot habitable, et seulement a defaut le plus grand bati.
    sort_cols = ["annee_mutation"]
    if "type_local" in d.columns:
        d["_type_priority"] = d["type_local"].apply(_type_priority)
        sort_cols.append("_type_priority")
    if "surface_reelle_bati" in d.columns:
        d["surface_reelle_bati"] = pd.to_numeric(d["surface_reelle_bati"], errors="coerce")
        sort_cols.append("surface_reelle_bati")

    last = (d.sort_values(sort_cols)
            .groupby(["k_num", "k_voie", "code_commune"], dropna=False)
            .tail(1)
            [["k_num", "k_voie", "code_commune", "annee_mutation"] + detail]
            .rename(columns={
                "annee_mutation": "derniere_vente_connue",
                "type_local": "type_bien",
                "surface_reelle_bati": "surface_m2",
                "nombre_pieces_principales": "nb_pieces",
                "valeur_fonciere": "prix_derniere_vente",
            }))

    out = adresses.merge(last,
                         left_on=["k_num", "k_voie", "code_insee"],
                         right_on=["k_num", "k_voie", "code_commune"],
                         how="left")

    if {"prix_derniere_vente", "surface_m2"} <= set(out.columns):
        out["prix_derniere_vente"] = pd.to_numeric(out["prix_derniere_vente"], errors="coerce")
        out["surface_m2"] = pd.to_numeric(out["surface_m2"], errors="coerce")
        out["prix_m2_derniere_vente"] = (
            out["prix_derniere_vente"] / out["surface_m2"].replace(0, pd.NA)
        ).round(0)
    return out


# ---------------------------------------------------------------------------
# RAPPROCHEMENT SPATIAL (repli) — communes a voirie renumerotee
#
# CONSTAT (audit donnees reelles, 2026-09) : le rapprochement par cle
# (numero, voie, commune) echoue presque totalement sur certaines communes
# rurales — ex. Anthy-sur-Leman : 0,1 % d'adresses appariees contre 5-24 %
# ailleurs — alors que les ventes DVF existent bien (938 mutations connues
# a Anthy). Cause identifiee : la voirie a ete renumerotee (numerotation
# metrique / adressage rural) depuis les ventes DVF historiques. Le nom de
# voie normalise concorde toujours (37 % de recouvrement des voies a Anthy,
# dans la norme observee ailleurs) — seul le numero de rue a change entre
# l'adresse BAN actuelle et le numero enregistre au moment de la vente.
#
# Repli : pour toute adresse non appariee par cle mais geolocalisee (BAN
# fournit systematiquement lon/lat), on rattache la mutation DVF geolocalisee
# la plus proche DANS LA MEME COMMUNE, si elle est a moins de
# SPATIAL_MATCH_RADIUS_M metres. Au-dela, on considere qu'il s'agit
# probablement d'un autre batiment et on laisse le champ vide plutot que de
# risquer un faux rapprochement.
# ---------------------------------------------------------------------------

def _local_xy_m(lon, lat, lon0, lat0):
    """Projection plane equirectangulaire — suffisante sur une zone < 50 km,
    trop petite pour que la courbure terrestre fausse les distances utiles
    ici (rapprochement a quelques dizaines de metres)."""
    m_par_deg_lat = 110_540.0
    m_par_deg_lon = 111_320.0 * np.cos(np.radians(lat0))
    return (lon - lon0) * m_par_deg_lon, (lat - lat0) * m_par_deg_lat


def _dvf_points_by_mutation(dvf):
    """Un point geolocalise (le lot habitable, a defaut le plus grand bati)
    par mutation DVF, candidat au rapprochement spatial. Meme logique de
    choix du lot que merge_dvf : priorite maison/appartement sur dependance
    (voir _type_priority), et seulement ensuite la plus grande surface."""
    if not {"longitude", "latitude"} <= set(dvf.columns):
        return pd.DataFrame()

    d = dvf.dropna(subset=["annee_mutation"]).copy()
    d["longitude"] = pd.to_numeric(d["longitude"], errors="coerce")
    d["latitude"] = pd.to_numeric(d["latitude"], errors="coerce")
    d = d.dropna(subset=["longitude", "latitude"])
    if d.empty:
        return d

    # nombre_pieces_principales reste au format d'origine (chaine) : c'est le
    # format que porte deja la colonne 'nb_pieces' issue du rapprochement par
    # cle (merge_dvf), et un type incoherent entre les deux voies ferait
    # echouer l'affectation pandas plus bas.
    for c in ("surface_reelle_bati", "valeur_fonciere"):
        if c in d.columns:
            d[c] = pd.to_numeric(d[c], errors="coerce")

    sort_cols = ["annee_mutation"]
    if "type_local" in d.columns:
        d["_type_priority"] = d["type_local"].apply(_type_priority)
        sort_cols.append("_type_priority")
    if "surface_reelle_bati" in d.columns:
        sort_cols.append("surface_reelle_bati")
    d = d.sort_values(sort_cols)

    detail = [c for c in ["type_local", "surface_reelle_bati",
                          "nombre_pieces_principales", "valeur_fonciere"]
              if c in d.columns]
    keep = ["code_commune", "longitude", "latitude", "annee_mutation"] + detail
    group_key = "id_mutation" if "id_mutation" in d.columns else keep[:2]
    return d.groupby(group_key, dropna=False).tail(1)[keep]


_DETAIL_TO_TARGET = {
    "type_local": "type_bien",
    "surface_reelle_bati": "surface_m2",
    "nombre_pieces_principales": "nb_pieces",
    "valeur_fonciere": "prix_derniere_vente",
    "annee_mutation": "derniere_vente_connue",
}


def spatial_fallback_match(out, dvf, radius_m=SPATIAL_MATCH_RADIUS_M):
    """Comble par proximite geographique les adresses non appariees par cle
    (numero, voie). Ajoute une colonne 'methode_appariement' (cle / spatial /
    NA) pour que l'origine de chaque donnee reste tracable."""
    out["methode_appariement"] = np.where(
        out["derniere_vente_connue"].notna(), "cle", pd.NA)

    if not {"lon", "lat", "code_insee"} <= set(out.columns):
        return out

    points = _dvf_points_by_mutation(dvf)
    if points.empty:
        return out

    out["_lon"] = pd.to_numeric(out["lon"], errors="coerce")
    out["_lat"] = pd.to_numeric(out["lat"], errors="coerce")
    detail_cols = [c for c in _DETAIL_TO_TARGET if c in points.columns]

    n_recupere = 0
    for insee, idx in out.groupby("code_insee").groups.items():
        cand = points[points["code_commune"] == insee]
        if cand.empty:
            continue
        grp = out.loc[idx]
        todo = grp[grp["derniere_vente_connue"].isna()
                   & grp["_lon"].notna() & grp["_lat"].notna()]
        if todo.empty:
            continue

        lat0 = float(cand["latitude"].mean())
        cx, cy = _local_xy_m(cand["longitude"].to_numpy(), cand["latitude"].to_numpy(), 0.0, lat0)
        ax, ay = _local_xy_m(todo["_lon"].to_numpy(), todo["_lat"].to_numpy(), 0.0, lat0)

        dist = np.sqrt((ax[:, None] - cx[None, :]) ** 2 + (ay[:, None] - cy[None, :]) ** 2)
        nearest = dist.argmin(axis=1)
        nearest_dist = dist[np.arange(len(todo)), nearest]

        ok = nearest_dist <= radius_m
        if not ok.any():
            continue

        rows = todo.index[ok]
        cand_rows = cand.iloc[nearest[ok]]
        for col in detail_cols:
            out.loc[rows, _DETAIL_TO_TARGET[col]] = cand_rows[col].to_numpy()
        out.loc[rows, "methode_appariement"] = "spatial"
        n_recupere += int(ok.sum())

    out.drop(columns=["_lon", "_lat"], inplace=True, errors="ignore")

    if {"prix_derniere_vente", "surface_m2"} <= set(out.columns):
        out["prix_derniere_vente"] = pd.to_numeric(out["prix_derniere_vente"], errors="coerce")
        out["surface_m2"] = pd.to_numeric(out["surface_m2"], errors="coerce")
        out["prix_m2_derniere_vente"] = (
            out["prix_derniere_vente"] / out["surface_m2"].replace(0, pd.NA)
        ).round(0)

    print(f"  Rapprochement spatial (repli, <= {radius_m:.0f} m) : "
          f"{n_recupere:,} adresses recuperees en plus (voirie renumerotee "
          f"depuis les ventes DVF historiques).")
    return out


# ---------------------------------------------------------------------------
# FILTRE DE PLAUSIBILITE DU PRIX PAR MORADA — audit critique 2026-09-07
#
# BUG CORRIGE : le prix de derniere vente affiche par morada n'avait aucun
# filtre de plausibilite, contrairement a la grille de prix (pricing.py) et
# aux stats de marche (market_stats.py) qui excluent deja les valeurs hors
# de PRIX_M2_PLAUSIBLE_MIN/MAX. Constate sur les donnees reelles : 233
# moradas affichaient une mais-value implausible (jusqu'a +880 % ou -94 %
# en 3-5 ans) — ex. une maison de 64 m² "vendue" 4 700 000 € = 73 438 €/m².
# Cause probable : ventes en nue-propriete entre proches (usufruit conserve
# par le vendeur, prix tres inferieur au marche), mutations multi-lots mal
# ventilees, ou erreurs de saisie DVF.
#
# On ecarte le PRIX (et donc la mais-value, qui en depend), mais on GARDE le
# type de bien, la surface et l'annee de vente : ce sont des faits distincts
# du prix et rien n'indique qu'ils soient egalement faux. Mieux vaut
# l'absence d'un argument de plus-value qu'un argument absurde.
# ---------------------------------------------------------------------------

def filter_implausible_price(out, price_min=PRIX_M2_PLAUSIBLE_MIN,
                              price_max=PRIX_M2_PLAUSIBLE_MAX):
    """Ecarte prix_derniere_vente/prix_m2_derniere_vente quand le prix au m²
    est hors de la plage plausible. Ajoute 'prix_ecarte' (bool) pour tracer
    les cas ecartes sans changer la semantique de 'methode_appariement'."""
    out["prix_ecarte"] = False
    if "prix_m2_derniere_vente" not in out.columns:
        return out

    implausible = (out["prix_m2_derniere_vente"].notna() &
                   ((out["prix_m2_derniere_vente"] < price_min) |
                    (out["prix_m2_derniere_vente"] > price_max)))
    n = int(implausible.sum())
    if n:
        out.loc[implausible, "prix_derniere_vente"] = pd.NA
        out.loc[implausible, "prix_m2_derniere_vente"] = pd.NA
        out.loc[implausible, "prix_ecarte"] = True
        print(f"  Prix par morada écarté (hors plage {price_min:,.0f}-{price_max:,.0f} "
              f"€/m², ex. nue-propriété/donation/erreur de saisie) : {n:,} adresses "
              f"— type/surface/année de vente conservés, prix et mais-value non calculés.")
    return out


def merge_dpe(df, dpe):
    """Ajoute classe DPE, annee de construction, surface ET type de batiment
    issus de l'ADEME. C'est ce qui remplit les Tier 1, invisibles dans le DVF.

    BUG CORRIGE (audit 2026-09-11) : `type_batiment` est bien recupere par
    enrich_dpe.py (voir FIELD_CANDIDATES) mais n'etait JAMAIS inclus dans ce
    `keep` — donc jamais fusionne dans le dataframe scoré, alors que
    scoring.py::_pts_type et compute_score utilisent deja
    `row.get("type_bien") or row.get("type_batiment")` comme filet de
    securite pour les adresses "jamais vendues" (aucun type_bien, puisque
    type_bien vient uniquement du DVF). Ce filet ne s'est donc JAMAIS
    declenche : verifie sur les donnees reelles, les 11 032 adresses
    "jamais vendues" de la liste prioritaire (55,5 % du total) ont TOUTES
    type_bien vide, y compris celles qui sont clairement des maisons —
    aucune ne pouvait donc recevoir le bonus "type_maison" NI le bonus/
    argument de terrain (tous deux reserves aux maisons, voir
    scoring.py::_pts_terrain), qui ne beneficiaient donc en pratique QUE des
    maisons deja vendues au moins une fois."""
    if dpe.empty or not {"k_num", "k_voie"} <= set(dpe.columns):
        for c in ("dpe_classe", "ges_classe", "annee_construction",
                  "surface_dpe", "date_dpe", "type_batiment"):
            df[c] = pd.NA
        return df

    d = dpe.copy()
    for c in ("annee_construction", "surface_dpe"):
        if c in d.columns:
            d[c] = pd.to_numeric(d[c], errors="coerce")

    keep = [c for c in ["k_num", "k_voie", "code_insee", "dpe_classe", "ges_classe",
                        "annee_construction", "surface_dpe", "date_dpe",
                        "andar_apartamento", "complemento_morada", "type_batiment"]
            if c in d.columns]
    d = d[keep]

    # Plusieurs DPE possibles a une meme adresse (immeuble) : on garde le plus
    # recent, et a defaut de date, la plus mauvaise classe (levier commercial).
    if "date_dpe" in d.columns:
        d = d.sort_values("date_dpe")
    elif "dpe_classe" in d.columns:
        d["_rk"] = d["dpe_classe"].map({c: i for i, c in enumerate("ABCDEFG")})
        d = d.sort_values("_rk").drop(columns=["_rk"])

    join_keys = ["k_num", "k_voie"]
    if "code_insee" in d.columns:
        join_keys.append("code_insee")
    d = d.groupby(join_keys, dropna=False).tail(1)

    return df.merge(d, on=join_keys, how="left", suffixes=("", "_dpe"))


# ---------------------------------------------------------------------------
# REPLI SPATIAL DPE — audit 2026-09-07 (suite : "moradas sem area de terreno")
#
# BUG CORRIGE : le rapprochement DPE dependait uniquement de la cle
# numero+voie normalisee, exactement comme le DVF avant sa propre correction
# spatiale — avec la meme fragilite face a une voie renumerotee (Anthy-sur-
# Leman) OU RENOMMEE (Meillerie : le DPE porte "Rue Nationale", disparue de
# la BAN actuelle qui utilise "Route de Meillerie" pour le meme troncon).
# Verification en direct sur l'API ADEME (jeu "dpe03existant") : le champ
# `_geopoint` existe et est rempli pour 100 % des 314 DPE d'Anthy et 95 %
# des 121 DPE de Meillerie testes — la source n'a jamais manque de
# coordonnees, seul notre `select` ne les demandait pas (voir enrich_dpe.py).
#
# RADIUS PLUS SERRE QUE LE DVF, ET POURQUOI : une premiere version de ce
# repli reutilisait SPATIAL_MATCH_RADIUS_M (40 m, calibre pour le DVF) et
# provoquait une sur-association severe en zone dense — jusqu'a 23 adresses
# DISTINCTES rattachees au meme point DPE (verifie sur le jeu complet).
# Mesure sur les DPE deja apparies par cle exacte (donc de correction
# connue) : la distance entre le `_geopoint` d'un DPE et l'adresse BAN a
# laquelle il est reellement rattache est soit quasi nulle (55 % des cas,
# geocodage precis "a l'adresse"), soit dispersee sur des dizaines a des
# centaines de metres (45 %, repli du geocodeur ADEME sur autre chose que
# l'adresse exacte — voir enrich_dpe.py, qui exclut desormais ces points
# imprecis des candidats). Une fois ce filtrage fait en amont, un rayon de
# DPE_SPATIAL_MATCH_RADIUS_M (20 m, identique au seuil deja justifie pour le
# cadastre) est coherent avec la precision reelle des points restants.
# ---------------------------------------------------------------------------
DPE_SPATIAL_MATCH_RADIUS_M = 20

def _dpe_points(dpe):
    """Un point geolocalise par DPE (voir note ci-dessus), candidat au repli
    spatial quand le rapprochement par cle numero+voie a echoue."""
    if not {"lon_dpe", "lat_dpe"} <= set(dpe.columns):
        return pd.DataFrame()

    d = dpe.copy()
    d["lon_dpe"] = pd.to_numeric(d["lon_dpe"], errors="coerce")
    d["lat_dpe"] = pd.to_numeric(d["lat_dpe"], errors="coerce")
    d = d.dropna(subset=["lon_dpe", "lat_dpe"])
    if d.empty:
        return d

    for c in ("annee_construction", "surface_dpe"):
        if c in d.columns:
            d[c] = pd.to_numeric(d[c], errors="coerce")

    # Plusieurs DPE possibles au meme point (immeuble) : meme regle que
    # merge_dpe — le plus recent, a defaut la pire classe (levier commercial).
    if "date_dpe" in d.columns:
        d = d.sort_values("date_dpe")
    elif "dpe_classe" in d.columns:
        d["_rk"] = d["dpe_classe"].map({c: i for i, c in enumerate("ABCDEFG")})
        d = d.sort_values("_rk").drop(columns=["_rk"])

    keep = [c for c in ["code_insee", "lon_dpe", "lat_dpe", "dpe_classe", "ges_classe",
                        "annee_construction", "surface_dpe", "date_dpe",
                        "andar_apartamento", "complemento_morada", "type_batiment"]
            if c in d.columns]
    return d[keep]


_DPE_DETAIL_TO_TARGET = {
    "dpe_classe": "dpe_classe",
    "ges_classe": "ges_classe",
    "annee_construction": "annee_construction",
    "surface_dpe": "surface_dpe",
    "date_dpe": "date_dpe",
    "andar_apartamento": "andar_apartamento",
    "complemento_morada": "complemento_morada",
    "type_batiment": "type_batiment",
}


def spatial_fallback_dpe(out, dpe, radius_m=DPE_SPATIAL_MATCH_RADIUS_M):
    """Comble par proximite geographique les DPE non apparies par cle
    (numero, voie). Ajoute 'methode_dpe' (cle / spatial / NA), meme principe
    que 'methode_appariement' pour le DVF."""
    if "dpe_classe" not in out.columns:
        return out
    out["methode_dpe"] = np.where(out["dpe_classe"].notna(), "cle", pd.NA)

    if not {"lon", "lat", "code_insee"} <= set(out.columns):
        return out

    points = _dpe_points(dpe)
    if points.empty:
        return out

    out["_lon"] = pd.to_numeric(out["lon"], errors="coerce")
    out["_lat"] = pd.to_numeric(out["lat"], errors="coerce")
    detail_cols = [c for c in _DPE_DETAIL_TO_TARGET if c in points.columns]

    n_recupere = 0
    for insee, idx in out.groupby("code_insee").groups.items():
        cand = points[points["code_insee"] == insee]
        if cand.empty:
            continue
        grp = out.loc[idx]
        todo = grp[grp["dpe_classe"].isna() & grp["_lon"].notna() & grp["_lat"].notna()]
        if todo.empty:
            continue

        lat0 = float(cand["lat_dpe"].mean())
        cx, cy = _local_xy_m(cand["lon_dpe"].to_numpy(), cand["lat_dpe"].to_numpy(), 0.0, lat0)
        ax, ay = _local_xy_m(todo["_lon"].to_numpy(), todo["_lat"].to_numpy(), 0.0, lat0)

        dist = np.sqrt((ax[:, None] - cx[None, :]) ** 2 + (ay[:, None] - cy[None, :]) ** 2)
        nearest = dist.argmin(axis=1)
        nearest_dist = dist[np.arange(len(todo)), nearest]

        ok = nearest_dist <= radius_m
        if not ok.any():
            continue

        rows = todo.index[ok]
        cand_rows = cand.iloc[nearest[ok]]
        for col in detail_cols:
            out.loc[rows, _DPE_DETAIL_TO_TARGET[col]] = cand_rows[col].to_numpy()
        out.loc[rows, "methode_dpe"] = "spatial"
        n_recupere += int(ok.sum())

    out.drop(columns=["_lon", "_lat"], inplace=True, errors="ignore")

    print(f"  Rapprochement DPE spatial (repli, <= {radius_m:.0f} m) : "
          f"{n_recupere:,} adresses recuperees en plus (voirie renumerotee/"
          f"renommee entre le releve DPE et la BAN actuelle).")
    return out


def merge_cadastre(df, cadastre):
    """Ajoute la surface de terrain (parcelle cadastrale) et le nombre
    d'adresses BAN distinctes rattachees a la MEME parcelle
    (n_enderecos_parcela) — signal de parcelle collective indivise
    (lotissement / copropriete horizontale), voir audit 2026-09-11 :
    scoring.py::_pts_terrain et argumentaire.py::add_terrain_argument
    suppriment le bonus/argument de terrain quand ce nombre est >= 2."""
    if cadastre.empty:
        df["surface_terrain_m2"] = pd.NA
        df["n_enderecos_parcela"] = pd.NA
        return df
    c = cadastre.copy()
    c["surface_terrain_m2"] = pd.to_numeric(c["surface_terrain_m2"], errors="coerce")
    if "n_enderecos_parcela" in c.columns:
        c["n_enderecos_parcela"] = pd.to_numeric(c["n_enderecos_parcela"], errors="coerce")
    else:
        # Compatibilite avec un cadastre_74200_74500.csv genere par une
        # ancienne version d'enrich_cadastre.py (avant l'audit 2026-09-11).
        c["n_enderecos_parcela"] = pd.NA
    # Plusieurs lignes cadastre peuvent partager la meme cle (immeuble a
    # plusieurs lots sur une seule parcelle) : on garde la plus grande
    # contenance et le plus grand n_enderecos_parcela, jamais une moyenne
    # qui n'aurait pas de sens physique.
    c = (c.groupby(["k_num", "k_voie", "code_insee"], dropna=False)
         [["surface_terrain_m2", "n_enderecos_parcela"]]
         .max().reset_index())
    return df.merge(c, on=["k_num", "k_voie", "code_insee"], how="left")


def merge_georisques(df, georisques):
    """Ajoute l'information reglementaire (ERP) — PUREMENT INFORMATIVE,
    jamais utilisee dans le score (voir enrich_georisques.py)."""
    if georisques.empty or "code_insee" not in df.columns:
        df["info_erp"] = pd.NA
        return df
    g = georisques[["code_insee", "info_erp"]].drop_duplicates(subset=["code_insee"])
    return df.merge(g, on="code_insee", how="left")


def merge_rnb(df, rnb):
    """Ajoute l'identifiant de batiment RNB (brique de robustesse, pas de
    critere de score — voir enrich_rnb.py)."""
    if rnb.empty or "id" not in df.columns:
        df["rnb_id"] = pd.NA
        return df
    r = rnb.rename(columns={"ban_id": "id"})[["id", "rnb_id"]].drop_duplicates(subset=["id"])
    return df.merge(r, on="id", how="left")


# ------------------------------------------------------------- SEGMENTATION -

def add_tiers(df, seuils):
    """seuils : dict POTENTIEL_ELEVE/POTENTIEL_MOYEN, calcule par main() sur
    les annees DVF REELLEMENT obtenues (voir config.compute_segment_thresholds,
    piege v3 — jamais sur la seule plage DVF_YEARS tentee au telechargement)."""
    def tier(row):
        v = row["derniere_vente_connue"]
        if pd.isna(v):
            return "POTENTIEL_ELEVE"
        ans = CURRENT_YEAR - int(v)
        if ans >= seuils["POTENTIEL_ELEVE"]:
            return "POTENTIEL_ELEVE"
        if ans >= seuils["POTENTIEL_MOYEN"]:
            return "POTENTIEL_MOYEN"
        return "POTENTIEL_FAIBLE"

    df["segment_prospection"] = df.apply(tier, axis=1)
    df = add_scores(df, seuils)
    df["priorite"] = df["score_prospection"].apply(priority_label)
    df["passoire_thermique"] = df.get("dpe_classe", pd.Series(dtype=str)).isin(PASSOIRES)
    return df


# ------------------------------------------------------------------ RAPPORT -

def quality_report(adresses, dvf, dpe, merged):
    voies_ban = set(adresses["k_voie"]) - {""}
    voies_dvf = set(dvf["k_voie"]) - {""}
    inter = voies_ban & voies_dvf
    taux_voies = 100 * len(inter) / max(len(voies_dvf), 1)
    n_dvf = merged["derniere_vente_connue"].notna().sum()

    print("=" * 64)
    print("RAPPORT DE QUALITÉ DU RAPPROCHEMENT")
    print("=" * 64)
    print(f"Voies distinctes BAN              : {len(voies_ban):,}")
    print(f"Voies distinctes DVF              : {len(voies_dvf):,}")
    print(f"Voies DVF retrouvées dans la BAN  : {len(inter):,}  ({taux_voies:.1f} %)")
    print(f"\nAdresses BAN totales              : {len(merged):,}")
    print(f"  enrichies par DVF (vente)       : {n_dvf:,}  "
          f"({100*n_dvf/max(len(merged),1):.1f} %)")

    if "dpe_classe" in merged.columns:
        n_dpe = merged["dpe_classe"].notna().sum()
        print(f"  enrichies par DPE (énergie)     : {n_dpe:,}  "
              f"({100*n_dpe/max(len(merged),1):.1f} %)")
        couv = merged["derniere_vente_connue"].notna() | merged["dpe_classe"].notna()
        print(f"  avec au moins une donnée        : {couv.sum():,}  "
              f"({100*couv.sum()/max(len(merged),1):.1f} %)")
    if "methode_appariement" in merged.columns:
        n_cle = (merged["methode_appariement"] == "cle").sum()
        n_spatial = (merged["methode_appariement"] == "spatial").sum()
        print(f"    dont par clé (numéro+voie)    : {n_cle:,}")
        print(f"    dont par repli spatial        : {n_spatial:,}")
    if "methode_dpe" in merged.columns:
        n_dpe_spatial = (merged["methode_dpe"] == "spatial").sum()
        print(f"    DPE récupérés par repli spatial : {n_dpe_spatial:,}")
    if "type_bien" in merged.columns and n_dvf:
        n_dep = (merged["type_bien"] == "Dépendance").sum()
        print(f"    dont classées \"Dépendance\"    : {n_dep:,}  "
              f"({100*n_dep/max(n_dvf,1):.1f} % des adresses avec vente)")
    if "prix_ecarte" in merged.columns:
        n_prix_ecarte = int(merged["prix_ecarte"].sum())
        print(f"    prix écarté (implausible)     : {n_prix_ecarte:,}")
    print("=" * 64)

    if taux_voies < 40:
        print("\n/!\\ ALERTE : recouvrement des voies faible (<40 %).")
        print("    La normalisation ne capte pas assez de variantes locales.")
    else:
        print("\nOK — Recouvrement des voies satisfaisant.")

    print("\nNote : un taux d'enrichissement DVF de 5 à 15 % est NORMAL (seule une")
    print("petite fraction du parc se vend sur 6 ans). Le DPE couvre en plus")
    print("des biens jamais vendus — c'est lui qui documente le potentiel élevé.")

    non_match = sorted(voies_dvf - voies_ban)[:15]
    if non_match:
        print("\nÉchantillon de voies DVF non retrouvées dans la BAN :")
        for v in non_match:
            print(f"   - {v}")
        print("\n(Si vous y voyez des abréviations non gérées, ajoutez-les au")
        print(" dictionnaire ABBREV de normalize.py)")


# ------------------------------------------------------------------- EXPORT -
#
# 'andar_apartamento' / 'complemento_morada' (2026-09-10) : pour uma casa, a
# area do terreno cadastral funciona como "impressao digital" que aparece ao
# mesmo tempo no cadastro e num anuncio da concorrencia (que a expoe sempre)
# — permite reconhecer o mesmo imovel nos dois sitios. Um apartamento nao tem
# equivalente (terreno e coletivo, sem m² por fracao). Estes dois campos, vindos
# do DPE da ADEME quando preenchidos, dao um substituto parcial: o andar e o
# nome/numero do lote ou residencia (ex. "Villa n°10"), que tambem costumam
# aparecer num anuncio. Puramente informativo — nunca entra no score.

EXPORT_COLS = [
    "adresse_complete", "nom_commune_ref", "code_postal_secteur",
    "priorite", "score_prospection", "motifs_score", "segment_prospection",
    "derniere_vente_connue", "methode_appariement", "type_bien", "surface_m2", "nb_pieces",
    "prix_derniere_vente", "prix_m2_derniere_vente", "prix_ecarte",
    "dpe_classe", "ges_classe", "methode_dpe", "passoire_thermique", "annee_construction",
    "surface_dpe",
    "andar_apartamento", "complemento_morada",
    "surface_terrain_m2", "n_enderecos_parcela", "rnb_id",
    "prix_m2_estime", "base_prix_source", "ajustements", "coef_total",
    "valeur_estimee_actuelle", "plus_value_eur", "plus_value_pct",
    "duree_detention_ans", "argument_prudent", "argument_terrain",
    "comparables", "nb_comparables",
    "echeance_dpe", "decote_dpe_pct", "argument_dpe",
    "info_erp",
    "lien_google_maps", "lien_street_view", "lien_itineraire",
    "lon", "lat",
]

# Nombre de fiches PDF generees (les meilleurs scores)
NB_FICHES_PDF = 50

# Seuil de score utilise pour la liste prioritaire exportee (doit rester
# coherent avec le meme seuil utilise dans export()).
#
# MISE A JOUR (2026-09-10) : abaisse de 50 a 40, puis de 40 a 30, sur
# demande explicite, pour elargir la liste prioritaire aux bandes A+B+C
# (seule la bande D, score < 30, reste exclue desormais) — garde coherent
# avec le seuil C de scoring.py::priority_label (>= 30, deja inchange).
SEUIL_PRIORITAIRE = 30

# ---------------------------------------------------------------------------
# COMPARABLES : PLANCHER / PLAFOND, PAS UN NOMBRE FIXE
#
# PIEGE CORRIGE : un plafond fixe (500) etait applique sur l'univers COMPLET,
# AVANT le filtrage par score >= SEUIL_PRIORITAIRE, et independamment de la
# taille reelle de la liste prioritaire exportee. Sur ce jeu de donnees,
# 2 766 adresses passaient le seuil de score mais seules les 500 premieres
# (au sens du score global, pas de la liste finale) recevaient des
# comparables : 87 % des adresses de prospection_prioritaire.csv sortaient
# donc sans le moindre comparable ni argument chiffre — le principal outil
# de conviction de la fiche etait absent la plupart du temps.
#
# On calcule desormais les comparables pour TOUTES les adresses qui
# finiront dans la liste prioritaire, avec un plancher (comportement
# historique minimal) et un plafond de securite (cout de calcul).
#
# MISE A JOUR (2026-09-10) : SEUIL_PRIORITAIRE est passe de 50 a 30 (bandes
# A+B+C au lieu de A+B seules), ce qui elargit fortement la liste
# prioritaire exportee — avec la mediane de score a 40 sur tout l'univers,
# une bonne partie de l'univers (23k+ adresses) passe desormais ce seuil.
# Sans relever ce plafond, on retombait exactement dans le meme piege que
# l'audit critique avait deja corrige une fois (plafond fixe atteint avant
# la fin de la liste prioritaire -> une partie des adresses exportees se
# retrouve sans argumentaire ni comparables). Releve a 20 000, au-dela du
# volume attendu meme avec le seuil elargi, pour que le plafond ne devienne
# plus le facteur limitant.
NB_COMPARABLES_PLANCHER = 500
NB_COMPARABLES_PLAFOND = 20000


def export(df):
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    df["adresse_complete"] = (
        df["numero"].fillna("") + " " + df["nom_voie"].fillna("") + ", "
        + df["code_postal_secteur"].fillna("") + " " + df["nom_commune_ref"].fillna("")
    ).str.strip()

    df = links.add_links(df)

    cols = [c for c in EXPORT_COLS if c in df.columns]
    out = (df[cols]
           .drop_duplicates(subset=["adresse_complete"])
           .sort_values("score_prospection", ascending=False))

    print("\n--- Fichiers générés ---")
    for tier_name in SHEET_NAMES:
        sub = out[out["segment_prospection"] == tier_name]
        sub.to_csv(os.path.join(OUTPUT_DIR, f"mailing_{tier_name.lower()}.csv"), index=False)
        print(f"{tier_name:26s} {len(sub):>8,} adresses")

    out.to_csv(os.path.join(OUTPUT_DIR, "mailing_complet.csv"), index=False)
    print(f"{'TOTAL':26s} {len(out):>8,} adresses")

    # Liste ciblee : les meilleures opportunites, triees
    top = out[out["score_prospection"] >= SEUIL_PRIORITAIRE]
    top.to_csv(os.path.join(OUTPUT_DIR, "prospection_prioritaire.csv"), index=False)
    print(f"{'PRIORITAIRE (score >= ' + str(SEUIL_PRIORITAIRE) + ')':26s} {len(top):>8,} adresses")

    if "passoire_thermique" in out.columns:
        pas = out[out["passoire_thermique"] == True]  # noqa: E712
        pas.to_csv(os.path.join(OUTPUT_DIR, "passoires_thermiques.csv"), index=False)
        print(f"{'PASSOIRES (DPE E/F/G)':26s} {len(pas):>8,} adresses")

    try:
        with pd.ExcelWriter(os.path.join(OUTPUT_DIR, "mailing_74200_74500.xlsx"),
                            engine="openpyxl") as xl:
            xl_ = links.excel_hyperlink_frame   # liens cliquables dans Excel
            xl_(top).to_excel(xl, sheet_name="PRIORITAIRE", index=False)
            for tier_name, sheet in SHEET_NAMES.items():
                xl_(out[out["segment_prospection"] == tier_name]).to_excel(
                    xl, sheet_name=sheet, index=False)
            if "passoire_thermique" in out.columns:
                xl_(out[out["passoire_thermique"] == True]).to_excel(  # noqa: E712
                    xl, sheet_name="Passoires thermiques", index=False)
            xl_(out).to_excel(xl, sheet_name="COMPLET", index=False)
        print("\nFichier Excel créé : mailing_74200_74500.xlsx")
    except Exception as e:
        print(f"\n(Excel non généré : {e})")

    return out


def main():
    ok, total = self_test()
    print(f"Auto-test normalisation : {ok}/{total} OK\n")

    adresses, dvf, dpe, cadastre, georisques, rnb = load_data()
    adresses, dvf = add_match_keys(adresses, dvf)

    # ------------------------------------------------------------------
    # Seuils de segmentation : calcules sur les annees DVF REELLEMENT
    # obtenues dans dvf_74200_74500.csv, jamais sur DVF_YEARS (la plage
    # seulement TENTEE au telechargement — voir config.py, piege v3). Sans
    # cela, une annee configuree mais indisponible (ex. 2019/2020, deja
    # constates en 404 lors d'une execution reelle) biaiserait tous les
    # seuils vers le haut en silence.
    annees_dvf_reelles = dvf["annee_mutation"].dropna()
    if len(annees_dvf_reelles):
        annee_dvf_min = int(annees_dvf_reelles.min())
        annee_dvf_max = int(annees_dvf_reelles.max())
    else:
        # Aucune vente exploitable : repli sur l'annee courante seule
        # (fenetre nulle) plutot que de planter — add_tiers degradera
        # proprement (tout en POTENTIEL_ELEVE, jamais vendu).
        annee_dvf_min = annee_dvf_max = CURRENT_YEAR
    seuils, ans_min_atteignable, ans_max_atteignable = compute_segment_thresholds(
        annee_dvf_min, annee_dvf_max)
    print(f"Fenêtre DVF réellement obtenue : {annee_dvf_min}-{annee_dvf_max} "
          f"({ans_max_atteignable - ans_min_atteignable} ans) — seuils {seuils}")
    pbs_seuils = valider_seuils(seuils, ans_min_atteignable, ans_max_atteignable)
    if pbs_seuils:
        print("/!\\ ALERTE seuils de segmentation :")
        for p in pbs_seuils:
            print(f"    {p}")

    merged = merge_dvf(adresses, dvf)
    merged = spatial_fallback_match(merged, dvf)
    merged = filter_implausible_price(merged)
    merged = merge_dpe(merged, dpe)
    merged = spatial_fallback_dpe(merged, dpe)

    # BUG CORRIGE (audit 2026-09-11) : type_bien ne venait QUE du DVF — vide
    # pour toute adresse "jamais vendue" (55,5 % de la liste prioritaire),
    # meme quand le DPE de l'ADEME identifie clairement une "maison" ou un
    # "appartement" (type_batiment, desormais fusionne par merge_dpe/
    # spatial_fallback_dpe ci-dessus). scoring.py sait deja retomber sur
    # type_batiment en interne (row.get("type_bien") or row.get("type_batiment"))
    # mais la colonne EXPORTEE/affichee (type_bien) restait vide malgre tout,
    # incoherente avec un bonus/argument de terrain qui, lui, s'appliquait
    # correctement en coulisses. On reporte donc le meme filet de securite
    # sur la colonne affichee, avec la premiere lettre en majuscule pour
    # rester coherent avec le format "Maison"/"Appartement" du DVF.
    if "type_batiment" in merged.columns:
        repli_type = merged["type_batiment"].astype(str).str.strip().str.capitalize()
        repli_type = repli_type.where(merged["type_batiment"].notna())
        merged["type_bien"] = merged["type_bien"].fillna(repli_type)
    merged = merge_cadastre(merged, cadastre)
    merged = merge_georisques(merged, georisques)
    merged = merge_rnb(merged, rnb)
    merged = add_tiers(merged, seuils)

    # Grille de prix par rue + coefficients d'ajustement (anciennete, DPE)
    print("\n--- Grille de prix par rue ---")
    sales = pricing.clean_sales(dvf)
    grid, com_med, sect_med = pricing.build_price_grid(sales)
    coefs, coef_lookup = pricing.build_coefficients(sales, dpe)
    pricing.export(grid, coefs, sales)
    merged = pricing.add_estimates(merged, grid, com_med, sect_med, coef_lookup)

    # Argumentaire d'angariacion : plus-value, comparables, cout du DPE
    print("\n--- Argumentaire d'angariacion ---")
    n_prioritaires = int((merged["score_prospection"] >= SEUIL_PRIORITAIRE).sum())
    nb_comparables_a_calculer = min(
        max(n_prioritaires, NB_COMPARABLES_PLANCHER), NB_COMPARABLES_PLAFOND)
    if n_prioritaires > NB_COMPARABLES_PLAFOND:
        print(f"  ATTENTION : {n_prioritaires:,} adresses prioritaires > plafond "
              f"{NB_COMPARABLES_PLAFOND:,} — seules les {NB_COMPARABLES_PLAFOND:,} "
              f"meilleures auront des comparables calcules.")
    merged, comps_detail = argumentaire.add_all(
        merged, sales, coef_lookup, only_top=nb_comparables_a_calculer)
    n_arg = merged["argument_prudent"].notna().sum() if "argument_prudent" in merged else 0
    n_cmp = (merged["nb_comparables"] > 0).sum() if "nb_comparables" in merged else 0
    print(f"  arguments de valorisation : {n_arg:,}")
    print(f"  adresses avec comparables : {n_cmp:,} "
          f"(calcules pour {nb_comparables_a_calculer:,} adresses)")

    quality_report(adresses, dvf, dpe, merged)
    out = export(merged)

    # Diagnostic du lancement (les 3 inconnues levees par un vrai run)
    print()
    try:
        diagnostic.run(adresses, dvf, dpe, merged, out, grid, coefs,
                       seuils, ans_min_atteignable, ans_max_atteignable)
    except Exception as e:
        print(f"Diagnostic non généré ({e}).")

    # Fiches PDF d'estimation (le livrable terrain)
    print("\n--- Fiches PDF d'estimation ---")
    try:
        fiche_pdf.generate(merged, comps_detail, top_n=NB_FICHES_PDF)
    except Exception as e:
        print(f"Fiches non générées ({e}).")

    print("\n--- Répartition par priorité ---")
    print(out["priorite"].value_counts().sort_index().to_string())

    print("\n--- Répartition par commune et segment ---")
    print(out.groupby(["nom_commune_ref", "segment_prospection"])
          .size().unstack(fill_value=0).to_string())

    print(f"\nTerminé. Fichiers dans : {os.path.abspath(OUTPUT_DIR)}")


if __name__ == "__main__":
    main()
