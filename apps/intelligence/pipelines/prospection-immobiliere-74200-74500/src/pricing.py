"""
Grille de prix de reference (rue -> commune -> secteur) + coefficients
d'ajustement pour l'anciennete du bati et la performance energetique.

TROIS PRECAUTIONS METHODOLOGIQUES, qui font toute la difference :

0) INDEXATION TEMPORELLE (voir price_index.py)
   Le DVF couvre plusieurs annees (2021-2025) : sans ajustement, une vente
   de 2021 et une vente de 2025 pesent pareil dans le prix de reference,
   alors qu'on sait par les statistiques de marche elles-memes que les prix
   ont bouge sur cette fenetre (jusqu'a +23 % ou -14 % selon la commune).
   clean_sales() ramene donc chaque vente a l'annee la plus recente
   disponible avant tout calcul de grille ou de coefficient.

1) SHRINKAGE (retrecissement vers la moyenne)
   Une rue avec 2 ventes en 6 ans n'a pas de "prix de marche" fiable : une
   seule mutation atypique deplacerait la mediane de 30%. On ne prend donc
   JAMAIS la mediane brute de la rue. On la melange avec celle de la commune,
   ponderee par le nombre de ventes :

       prix_rue_retenu = (n * mediane_rue + k * mediane_commune) / (n + k)

   Avec k = PRIOR_STRENGTH (5 par defaut) : a 1 vente la rue ne pese qu'1/6
   et le prix reste quasiment celui de la commune ; a 20 ventes elle pese 80%
   et son identite propre ressort. C'est un estimateur bayesien standard, et
   c'est ce qui evite de produire des prix de rue absurdes.

2) COEFFICIENTS DERIVES DES DONNEES, PAS INVENTES
   Le "malus bati ancien" n'est pas un chiffre choisi arbitrairement : il est
   ESTIME sur les transactions reelles du secteur, en croisant les ventes DVF
   avec les annees de construction du DPE. Si l'echantillon est trop mince
   pour un ajustement fiable, le coefficient retombe a 1.00 (aucun ajustement)
   plutot que d'appliquer une valeur inventee.

Produit output/grille_prix_rues.csv et output/coefficients_ajustement.csv
"""
import os

import numpy as np
import pandas as pd

from config import ALL_COMMUNES, CODE_POSTAL_BY_INSEE
from normalize import normalize_voie, normalize_numero
from price_index import build_price_index, apply_indexation

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "output")

# Force du prior : nombre de ventes fictives "de la commune" ajoutees a
# chaque rue. Plus il est haut, plus on se mefie des petits echantillons.
PRIOR_STRENGTH = 5

# En dessous, on n'estime pas de coefficient (on laisse 1.00)
MIN_SALES_FOR_COEF = 15
# En dessous, une rue n'est pas publiee comme reference autonome
MIN_SALES_STREET_DISPLAY = 3

PRIX_M2_MIN, PRIX_M2_MAX, SURFACE_MIN = 500, 20000, 9

PERIODES = [
    ("avant_1948",  -np.inf, 1948),
    ("1948_1974",   1948,    1975),
    ("1975_1999",   1975,    2000),
    ("2000_plus",   2000,    np.inf),
]


# --------------------------------------------------------------- NETTOYAGE ---

def clean_sales(dvf):
    """Ne garde que les ventes exploitables pour un calcul de prix au m2."""
    d = dvf.copy()
    for c in ("valeur_fonciere", "surface_reelle_bati", "annee_mutation"):
        if c in d.columns:
            d[c] = pd.to_numeric(d[c], errors="coerce")

    if "nature_mutation" in d.columns:
        d = d[d["nature_mutation"].fillna("Vente").str.contains("Vente", na=False)]
    if "type_local" in d.columns:
        d = d[d["type_local"].isin(["Maison", "Appartement"])]

    d = d.dropna(subset=["valeur_fonciere", "surface_reelle_bati"])
    d = d[d["surface_reelle_bati"] >= SURFACE_MIN]
    d["prix_m2"] = d["valeur_fonciere"] / d["surface_reelle_bati"]
    d = d[(d["prix_m2"] >= PRIX_M2_MIN) & (d["prix_m2"] <= PRIX_M2_MAX)]

    if "k_voie" not in d.columns and "adresse_nom_voie" in d.columns:
        d["k_voie"] = d["adresse_nom_voie"].apply(normalize_voie)
    if "k_num" not in d.columns and "adresse_numero" in d.columns:
        d["k_num"] = d["adresse_numero"].apply(normalize_numero)

    d["secteur"] = d["code_commune"].map(CODE_POSTAL_BY_INSEE)

    # Indexation temporelle : prix_m2 est ramene a l'annee la plus recente
    # du jeu AVANT tout calcul de grille/coefficient en aval. L'original
    # reste accessible dans prix_m2_brut (trace, jamais affiche comme prix).
    if "annee_mutation" in d.columns:
        annee_ref, taux_commune, taux_secteur, taux_global, propre = build_price_index(d)
        d = apply_indexation(d, annee_ref, taux_commune, taux_global)
        d.attrs["annee_ref"] = annee_ref
        d.attrs["taux_commune"] = taux_commune
        d.attrs["taux_secteur"] = taux_secteur
        d.attrs["taux_global"] = taux_global
        d.attrs["communes_avec_taux_propre"] = propre
    return d


def periode_of(annee):
    if pd.isna(annee):
        return None
    for nom, lo, hi in PERIODES:
        if lo <= float(annee) < hi:
            return nom
    return None


# ------------------------------------------------------- GRILLE DE PRIX ------

def build_price_grid(sales):
    """Grille rue -> commune -> secteur, avec shrinkage sur les rues."""
    if sales.empty:
        return pd.DataFrame(), {}, {}

    sect_med = sales.groupby("secteur")["prix_m2"].median().to_dict()
    com = sales.groupby("code_commune")["prix_m2"].agg(["median", "size"])
    com_med = com["median"].to_dict()
    com_n = com["size"].to_dict()

    rows = []
    grp = sales.groupby(["code_commune", "k_voie"])["prix_m2"].agg(["median", "size", "mean"])
    for (code, voie), r in grp.iterrows():
        if not voie:
            continue
        n = int(r["size"])
        brut = r["median"]
        base = com_med.get(code, sect_med.get(CODE_POSTAL_BY_INSEE.get(code), np.nan))
        if pd.isna(base):
            continue

        # Shrinkage : la rue ne s'impose qu'a mesure que n grandit
        retenu = (n * brut + PRIOR_STRENGTH * base) / (n + PRIOR_STRENGTH)
        poids_rue = n / (n + PRIOR_STRENGTH)

        rows.append({
            "commune": ALL_COMMUNES.get(code, code),
            "code_insee": code,
            "code_postal": CODE_POSTAL_BY_INSEE.get(code, ""),
            "rue": voie,
            "nb_ventes_rue": n,
            "prix_m2_rue_brut": round(brut),
            "prix_m2_commune": round(base),
            "prix_m2_retenu": round(retenu),
            "poids_rue_pct": round(100 * poids_rue),
            "ecart_vs_commune_pct": round(100 * (retenu / base - 1), 1),
            "fiabilite": ("solide" if n >= 20 else
                          "moyenne" if n >= MIN_SALES_STREET_DISPLAY else
                          "FAIBLE — prix proche de la commune"),
        })

    grid = pd.DataFrame(rows)
    if not grid.empty:
        grid = grid.sort_values(["commune", "prix_m2_retenu"], ascending=[True, False])
    return grid, com_med, sect_med


# --------------------------------------------- COEFFICIENTS D'AJUSTEMENT -----

def _coef_table(sales, col, base_label):
    """Coefficient median par modalite, relatif a la mediane du secteur.

    Chaque vente est d'abord rapportee a la mediane de SA commune, pour ne pas
    confondre 'bati ancien' avec 'commune chere'. Sans cette normalisation,
    une commune historique et chere ferait croire que l'ancien se vend cher.
    """
    d = sales.dropna(subset=[col])
    if d.empty:
        return pd.DataFrame()

    com_med = d.groupby("code_commune")["prix_m2"].median()
    d = d.copy()
    d["ratio"] = d["prix_m2"] / d["code_commune"].map(com_med)

    out = []
    for mod, g in d.groupby(col):
        n = len(g)
        coef = g["ratio"].median() if n >= MIN_SALES_FOR_COEF else 1.0
        out.append({
            "critere": base_label,
            "modalite": mod,
            "nb_ventes": n,
            "coefficient": round(float(coef), 3),
            "impact_pct": round(100 * (float(coef) - 1), 1),
            "retenu": n >= MIN_SALES_FOR_COEF,
            "note": ("estimé sur les ventes locales" if n >= MIN_SALES_FOR_COEF
                     else f"échantillon insuffisant (<{MIN_SALES_FOR_COEF}) — aucun ajustement"),
        })
    return pd.DataFrame(out)


def build_coefficients(sales, dpe):
    """Estime les coefficients anciennete / DPE / type sur les ventes reelles."""
    d = sales.copy()

    # Rattache l'annee de construction (DPE) aux ventes (DVF)
    if not dpe.empty and {"k_num", "k_voie"} <= set(dpe.columns):
        p = dpe.copy()
        if "annee_construction" in p.columns:
            p["annee_construction"] = pd.to_numeric(p["annee_construction"], errors="coerce")
        keep = [c for c in ["k_num", "k_voie", "code_insee", "annee_construction",
                            "dpe_classe"] if c in p.columns]
        p = p[keep].dropna(subset=["k_num", "k_voie"])
        jk = ["k_num", "k_voie"]
        if "code_insee" in p.columns:
            p = p.rename(columns={"code_insee": "code_commune"})
            jk.append("code_commune")
        p = p.groupby(jk, dropna=False).tail(1)
        d = d.merge(p, on=jk, how="left")

    tables = []
    if "annee_construction" in d.columns:
        d["periode_construction"] = d["annee_construction"].apply(periode_of)
        tables.append(_coef_table(d, "periode_construction", "periode_construction"))
    if "dpe_classe" in d.columns:
        tables.append(_coef_table(d, "dpe_classe", "classe_dpe"))
    if "type_local" in d.columns:
        tables.append(_coef_table(d, "type_local", "type_bien"))

    tables = [t for t in tables if not t.empty]
    coefs = pd.concat(tables, ignore_index=True) if tables else pd.DataFrame()

    lookup = {}
    if not coefs.empty:
        for _, r in coefs.iterrows():
            lookup[(r["critere"], r["modalite"])] = float(r["coefficient"])
    return coefs, lookup


# ------------------------------------------------------------- ESTIMATION ----

def estimate_row(row, grid_lookup, com_med, sect_med, coefs):
    """Prix au m2 estime pour une adresse, avec la source et le detail.

    ATTENTION AU DOUBLE COMPTAGE : l'anciennete du bati et la classe DPE
    mesurent largement le MEME phenomene (un immeuble de 1930 est presque
    toujours mal classe). Les multiplier reviendrait a appliquer deux fois
    la meme decote : -17% et -17% donneraient -31%, ce qui est faux.
    On ne retient donc que le PLUS IMPACTANT des deux, pas leur produit.
    Le type de bien, lui, est independant : il se cumule normalement.
    """
    code = row.get("code_insee")
    voie = row.get("k_voie")

    base, source = None, None
    key = (code, voie)
    if key in grid_lookup:
        g = grid_lookup[key]
        base = g["prix_m2_retenu"]
        source = (f"rue ({g['nb_ventes_rue']} ventes, "
                  f"poids {g['poids_rue_pct']} %)")
    elif code in com_med:
        base, source = com_med[code], "commune"
    else:
        sect = CODE_POSTAL_BY_INSEE.get(code)
        if sect in sect_med:
            base, source = sect_med[sect], "secteur"

    if base is None:
        return pd.Series({"prix_m2_estime": None, "base_prix_source": None,
                          "ajustements": None, "coef_total": None})

    # --- Groupe correle : on garde uniquement le coefficient le plus fort ---
    candidats = []
    per = periode_of(row.get("annee_construction"))
    if per:
        c = coefs.get(("periode_construction", per), 1.0)
        if c != 1.0:
            candidats.append((abs(c - 1), c, f"bâti {per} ×{c:.2f}"))

    dpe_c = row.get("dpe_classe")
    if isinstance(dpe_c, str) and dpe_c in "ABCDEFG" and dpe_c:
        c = coefs.get(("classe_dpe", dpe_c), 1.0)
        if c != 1.0:
            candidats.append((abs(c - 1), c, f"DPE {dpe_c} ×{c:.2f}"))

    coef_total, details = 1.0, []
    if candidats:
        _, c, label = max(candidats, key=lambda t: t[0])
        coef_total *= c
        details.append(label)
        if len(candidats) > 1:
            details.append("(bâti/DPE corrélés : le plus fort seul)")

    # --- Critere independant : se cumule ---
    tb = row.get("type_bien")
    if isinstance(tb, str) and tb:
        c = coefs.get(("type_bien", tb), 1.0)
        if c != 1.0:
            coef_total *= c
            details.append(f"{tb} ×{c:.2f}")

    # Garde-fou : un ajustement au-dela de +/-40% signale un artefact
    coef_total = float(np.clip(coef_total, 0.60, 1.40))

    return pd.Series({
        "prix_m2_estime": round(base * coef_total),
        "base_prix_source": source,
        "ajustements": " | ".join(details) if details else "aucun",
        "coef_total": round(coef_total, 3),
    })


def add_estimates(df, grid, com_med, sect_med, coefs):
    lookup = {}
    if not grid.empty:
        for _, g in grid.iterrows():
            lookup[(g["code_insee"], g["rue"])] = g
    est = df.apply(estimate_row, axis=1,
                   args=(lookup, com_med, sect_med, coefs))
    for c in est.columns:
        df[c] = est[c]
    return df


def export(grid, coefs, sales=None):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    if sales is not None and "annee_ref" in sales.attrs:
        annee_ref = sales.attrs.get("annee_ref")
        taux_commune = sales.attrs.get("taux_commune", {})
        taux_global = sales.attrs.get("taux_global", 0.0)
        propre = sales.attrs.get("communes_avec_taux_propre", set())
        print(f"\n--- Indexation temporelle (annee de référence : {annee_ref}) ---")
        print(f"Taux annuel global de repli : {taux_global*100:+.1f} %/an")
        if taux_commune:
            print(f"Taux propre estimé pour {len(propre)}/{len(ALL_COMMUNES)} communes "
                  f"(les autres héritent du secteur ou du taux global)")
    if not grid.empty:
        p = os.path.join(OUTPUT_DIR, "grille_prix_rues.csv")
        grid.to_csv(p, index=False)
        print(f"Grille de prix par rue ({len(grid):,} rues) -> {p}")
        pub = grid[grid["nb_ventes_rue"] >= MIN_SALES_STREET_DISPLAY]
        print(f"  dont {len(pub):,} rues avec >= {MIN_SALES_STREET_DISPLAY} ventes "
              f"(les autres restent proches du prix communal)")
    if not coefs.empty:
        p = os.path.join(OUTPUT_DIR, "coefficients_ajustement.csv")
        coefs.to_csv(p, index=False)
        print(f"Coefficients d'ajustement -> {p}")
        print("\n--- Coefficients estimés sur les ventes locales ---")
        cols = ["critere", "modalite", "nb_ventes", "coefficient", "impact_pct", "retenu"]
        print(coefs[cols].to_string(index=False))
