"""
Argumentaire d'angariacion : ce qu'on DIT au proprietaire, une fois qu'on
sait a qui parler.

Trois leviers, tous calcules sur des donnees notariales reelles :

  1. PLUS-VALUE LATENTE
     Le DVF contient le prix auquel le bien s'est vendu la derniere fois.
     Compare a l'estimation actuelle, cela donne la valorisation depuis
     l'achat. C'est l'argument qui ouvre le plus de portes.

     /!\\ FORMULATION : ne JAMAIS ecrire "vous avez achete 280 000 EUR" —
     c'est legal (le DVF est ouvert) mais percu comme intrusif et ca ferme
     la porte. La bonne formulation est collective :
     "les biens de cette rue ont pris environ 30% depuis 2012".
     Le module produit les deux : `argument_prudent` (a utiliser) et
     les chiffres bruts (pour ta preparation interne uniquement).

  2. COMPARABLES DE PROXIMITE
     Les 3 a 5 ventes reelles les plus proches geographiquement, recentes
     et de meme typologie. C'est ce qui transforme une estimation en
     estimation DEFENDABLE face a un proprietaire sceptique.

  3. COUT DE LA PASSOIRE THERMIQUE
     Pour les DPE E/F/G : calendrier d'interdiction de location et decote
     observee LOCALEMENT (le coefficient est estime sur tes ventes, pas
     sur une moyenne nationale).
"""
import datetime
import math

import numpy as np
import pandas as pd

CURRENT_YEAR = datetime.date.today().year

# Calendrier d'interdiction de mise en location (loi Climat et Resilience)
CALENDRIER_PASSOIRE = {
    "G": (2025, "interdit à la location depuis le 1er janvier 2025"),
    "F": (2028, "interdit à la location à partir du 1er janvier 2028"),
    "E": (2034, "interdit à la location à partir du 1er janvier 2034"),
}

# Rayon de recherche des comparables (metres)
RAYON_COMPARABLES_M = 400
NB_COMPARABLES = 5
# Tolerance de surface pour qu'une vente soit "comparable"
TOLERANCE_SURFACE = 0.40


# ------------------------------------------------------- PLUS-VALUE LATENTE --

def add_plus_value(df):
    """Valorisation depuis la derniere vente connue.

    Produit un argument formule prudemment (collectif, pas nominatif) et
    les chiffres bruts pour la preparation interne.
    """
    need = {"prix_derniere_vente", "derniere_vente_connue", "prix_m2_estime"}
    if not need <= set(df.columns):
        return df

    prix_achat = pd.to_numeric(df["prix_derniere_vente"], errors="coerce")
    annee = pd.to_numeric(df["derniere_vente_connue"], errors="coerce")
    est_m2 = pd.to_numeric(df["prix_m2_estime"], errors="coerce")

    surface = pd.to_numeric(df.get("surface_m2"), errors="coerce")
    if "surface_dpe" in df.columns:
        surface = surface.fillna(pd.to_numeric(df["surface_dpe"], errors="coerce"))

    valeur_now = est_m2 * surface
    df["valeur_estimee_actuelle"] = valeur_now.round(-2)

    ecart = valeur_now - prix_achat
    valide = prix_achat.notna() & valeur_now.notna() & (prix_achat > 0)
    df["plus_value_eur"] = ecart.where(valide).round(-2)
    df["plus_value_pct"] = ((ecart / prix_achat * 100).where(valide)).round(1)
    df["duree_detention_ans"] = (CURRENT_YEAR - annee).where(annee.notna())

    def argument(r):
        pv, ans = r["plus_value_pct"], r["duree_detention_ans"]
        if pd.isna(pv) or pd.isna(ans) or ans < 1:
            return None
        if pv < 5:
            return None  # rien de vendeur a dire
        # Formulation COLLECTIVE : on parle du marche, jamais du proprietaire
        return (f"Dans ce secteur, les biens comparables ont progressé "
                f"d'environ {pv:.0f} % depuis {int(CURRENT_YEAR - ans)}.")

    df["argument_prudent"] = df.apply(argument, axis=1)
    return df


# ----------------------------------------------------- TENDANCE DE MARCHE ---

# Sous ce nombre de ventes, une tendance communale n'est pas jugee fiable.
MIN_VENTES_TENDANCE_COMMUNE = 8


def _tendances_par_commune(sales):
    """Evolution du prix median par commune entre le debut et la fin de la
    fenetre DVF disponible. Jamais un prix individuel : uniquement des
    medianes de marche, memes garde-fous legaux que add_plus_value.

    IMPORTANT : on mesure ici la tendance sur le prix BRUT (prix_m2_brut),
    pas sur prix_m2. Depuis l'indexation temporelle (voir price_index.py),
    prix_m2 est deliberement RAMENE a une annee de reference — c'est-a-dire
    que la tendance annee/annee y a ete lissee par construction. Mesurer la
    tendance sur cette colonne reviendrait a chercher un signal que l'etape
    precedente vient d'effacer. prix_m2_brut, lui, garde le prix reellement
    observe chaque annee, seul capable de reveler une vraie hausse/baisse.
    """
    col = "prix_m2_brut" if "prix_m2_brut" in sales.columns else "prix_m2"
    s = sales.dropna(subset=["code_commune", col, "annee_mutation"])
    tendances = {}
    for code, g in s.groupby("code_commune"):
        if len(g) < MIN_VENTES_TENDANCE_COMMUNE:
            continue
        annees = g["annee_mutation"]
        an_min, an_max = annees.min(), annees.max()
        if an_max <= an_min:
            continue
        anc = g[annees <= an_min + 1]
        rec = g[annees >= an_max - 1]
        if len(anc) < 3 or len(rec) < 3:
            continue
        med_anc, med_rec = anc[col].median(), rec[col].median()
        if not med_anc or med_anc <= 0:
            continue
        pct = (med_rec / med_anc - 1) * 100
        if pct < 5:
            continue
        tendances[code] = (pct, int(an_min))
    return tendances


def add_market_trend_argument(df, sales):
    """Argument de repli pour les adresses SANS derniere vente connue.

    `add_plus_value` ne peut rien produire pour une adresse "jamais vendue" :
    il n'y a pas de prix d'achat personnel a comparer. Ce sont pourtant
    souvent les cibles les PLUS interessantes (score le plus eleve). Ce
    module calcule a la place une tendance de MARCHE — jamais un prix
    individuel — a partir des ventes reelles de la commune, et ne l'utilise
    que quand aucun argument personnel n'a ete produit.
    """
    if "argument_prudent" not in df.columns:
        df["argument_prudent"] = None
    if "code_insee" not in df.columns or sales.empty:
        return df

    tendances = _tendances_par_commune(sales)
    if not tendances:
        return df

    def repli(row):
        actuel = row.get("argument_prudent")
        if pd.notna(actuel):
            return actuel
        t = tendances.get(row.get("code_insee"))
        if not t:
            return actuel
        pct, an_min = t
        return (f"Dans ce secteur, les prix ont progressé d'environ "
                f"{pct:.0f} % depuis {an_min}.")

    df["argument_prudent"] = df.apply(repli, axis=1)
    return df


# ------------------------------------------------------------------ TERRAIN --

# Ratio terrain/bati a partir duquel un grand terrain est juge sous-exploite
RATIO_TERRAIN_SOUS_EXPLOITE = 4
SURFACE_TERRAIN_MIN_ARGUMENT = 500


def add_terrain_argument(df):
    """Argument independant : grand terrain (cadastre) sous un bati modeste.

    Reste dans sa propre colonne (argument_terrain), separee de
    argument_prudent, pour ne jamais melanger un signal de plus-value avec
    un signal de potentiel foncier — ce sont deux arguments differents.
    """
    if "surface_terrain_m2" not in df.columns:
        df["argument_terrain"] = None
        return df

    def arg(row):
        s = row.get("surface_terrain_m2")
        if pd.isna(s):
            return None
        s = float(s)
        if s < SURFACE_TERRAIN_MIN_ARGUMENT:
            return None
        surf_bati = row.get("surface_m2")
        if pd.isna(surf_bati):
            surf_bati = row.get("surface_dpe")
        ratio_ok = (pd.isna(surf_bati) or float(surf_bati) <= 0
                    or s / float(surf_bati) >= RATIO_TERRAIN_SOUS_EXPLOITE)
        if not ratio_ok:
            return None
        return (f"Terrain de {s:.0f} m² : potentiel de valorisation "
                f"(extension, division parcellaire) à examiner.")

    df["argument_terrain"] = df.apply(arg, axis=1)
    return df


# -------------------------------------------------------------- COMPARABLES --

def _haversine_m(lat1, lon1, lat2, lon2):
    """Distance en metres entre un point et des tableaux de points."""
    R = 6371000.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp = p2 - p1
    dl = np.radians(lon2 - lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * R * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def prepare_comparables(sales):
    """Prepare le referentiel de ventes utilisable comme comparables."""
    s = sales.copy()
    for c in ("latitude", "longitude", "surface_reelle_bati",
              "valeur_fonciere", "annee_mutation", "prix_m2", "prix_m2_brut"):
        if c in s.columns:
            s[c] = pd.to_numeric(s[c], errors="coerce")
    if not {"latitude", "longitude"} <= set(s.columns):
        return pd.DataFrame()
    return s.dropna(subset=["latitude", "longitude", "prix_m2"])


def find_comparables(row, refs, n=NB_COMPARABLES):
    """Les n ventes reelles les plus pertinentes pour une adresse donnee.

    Priorite : proximite geographique, puis meme typologie, puis surface
    voisine, puis recence.
    """
    if refs.empty:
        return []
    try:
        lat, lon = float(row["lat"]), float(row["lon"])
    except (TypeError, ValueError, KeyError):
        return []
    if pd.isna(lat) or pd.isna(lon):
        return []

    d = refs.copy()
    d["distance_m"] = _haversine_m(lat, lon, d["latitude"].values, d["longitude"].values)
    d = d[d["distance_m"] <= RAYON_COMPARABLES_M]
    if d.empty:
        return []

    # Meme typologie si on la connait
    tb = row.get("type_bien")
    if isinstance(tb, str) and tb and "type_local" in d.columns:
        same = d[d["type_local"] == tb]
        if len(same) >= 3:
            d = same

    # Surface voisine si on la connait
    surf = row.get("surface_m2")
    if pd.isna(surf):
        surf = row.get("surface_dpe")
    if pd.notna(surf) and float(surf) > 0 and "surface_reelle_bati" in d.columns:
        lo, hi = float(surf) * (1 - TOLERANCE_SURFACE), float(surf) * (1 + TOLERANCE_SURFACE)
        close = d[d["surface_reelle_bati"].between(lo, hi)]
        if len(close) >= 3:
            d = close

    d = d.sort_values(["annee_mutation", "distance_m"], ascending=[False, True])
    out = []
    for _, r in d.head(n).iterrows():
        # Un "comparable" doit citer le prix REELLEMENT paye lors de cette
        # vente (fait notarial verifiable), pas sa version actualisee : on
        # affiche donc prix_m2_brut quand il existe, jamais prix_m2 indexe.
        prix_m2_reel = r.get("prix_m2_brut")
        if pd.isna(prix_m2_reel):
            prix_m2_reel = r["prix_m2"]
        out.append({
            "annee": int(r["annee_mutation"]) if pd.notna(r.get("annee_mutation")) else None,
            "type": r.get("type_local"),
            "surface": round(float(r["surface_reelle_bati"])) if pd.notna(r.get("surface_reelle_bati")) else None,
            "prix": round(float(r["valeur_fonciere"]), -2) if pd.notna(r.get("valeur_fonciere")) else None,
            "prix_m2": round(float(prix_m2_reel)),
            "distance_m": round(float(r["distance_m"])),
        })
    return out


def add_comparables(df, sales, only_top=None):
    """Ajoute une synthese texte des comparables.

    only_top : si fourni, ne calcule que pour les N meilleurs scores
    (le calcul est couteux sur des dizaines de milliers d'adresses).
    """
    refs = prepare_comparables(sales)
    if refs.empty:
        df["comparables"] = None
        df["nb_comparables"] = 0
        return df, {}

    cible = df
    if only_top and "score_prospection" in df.columns and len(df) > only_top:
        cible = df.nlargest(only_top, "score_prospection")

    detail, textes, nombres = {}, {}, {}
    for idx, row in cible.iterrows():
        comps = find_comparables(row, refs)
        detail[idx] = comps
        nombres[idx] = len(comps)
        if comps:
            bouts = [f"{c['annee']} — {c['surface']} m² — {c['prix_m2']:,} €/m²".replace(",", " ")
                     for c in comps[:3]]
            textes[idx] = " ; ".join(bouts)

    df["comparables"] = pd.Series(textes)
    df["nb_comparables"] = pd.Series(nombres).reindex(df.index).fillna(0).astype(int)
    return df, detail


# ------------------------------------------------------- COUT DE LA PASSOIRE --

def add_cout_passoire(df, coefs):
    """Chiffre l'impact d'un mauvais DPE, avec la decote observee localement."""
    if "dpe_classe" not in df.columns:
        return df

    # Reference : la meilleure classe reellement observee dans les coefficients
    ref = 1.0
    for cl in ("A", "B", "C"):
        c = coefs.get(("classe_dpe", cl))
        if c:
            ref = max(ref, c)

    def calc(cl):
        if not isinstance(cl, str) or cl not in CALENDRIER_PASSOIRE:
            return pd.Series({"echeance_dpe": None, "decote_dpe_pct": None,
                              "argument_dpe": None})
        annee_int, phrase = CALENDRIER_PASSOIRE[cl]
        coef = coefs.get(("classe_dpe", cl), 1.0)
        decote = round((coef / ref - 1) * 100, 1) if coef != 1.0 else None

        arg = f"Classe {cl} : {phrase}."
        if decote is not None and decote < -2:
            arg += (f" Sur les ventes récentes du secteur, l'écart de prix "
                    f"observé avec un bien mieux classé est d'environ "
                    f"{abs(decote):.0f} %.")
        return pd.Series({"echeance_dpe": annee_int, "decote_dpe_pct": decote,
                          "argument_dpe": arg})

    res = df["dpe_classe"].apply(calc)
    for c in res.columns:
        df[c] = res[c]
    return df


# ------------------------------------------------------------------ SYNTHESE --

def add_all(df, sales, coefs, only_top=None):
    df = add_plus_value(df)
    df = add_market_trend_argument(df, sales)
    df = add_terrain_argument(df)
    df, comps_detail = add_comparables(df, sales, only_top=only_top)
    df = add_cout_passoire(df, coefs)
    return df, comps_detail


ARG_COLS = ["valeur_estimee_actuelle", "plus_value_eur", "plus_value_pct",
            "duree_detention_ans", "argument_prudent", "argument_terrain",
            "comparables", "nb_comparables", "echeance_dpe", "decote_dpe_pct",
            "argument_dpe"]
