"""
Indexation temporelle des ventes DVF.

LE PROBLEME (souleve en usage reel, pas en theorie) : le DVF est publie sur
une fenetre pluriannuelle (2021-2025 actuellement, voir config.DVF_YEARS).
Sans ajustement, une vente de 2021 et une vente de 2025 pesent EXACTEMENT
pareil dans un prix de reference "aujourd'hui" -- alors que
market_stats.py mesure, sur ces memes donnees, des mouvements de marche
reels et parfois importants sur cette fenetre (jusqu'a +23 % ou -14 %
selon la commune). Un proprietaire qui a vendu un bien comparable en 2021
ne l'aurait pas vendu au meme prix en 2025 : melanger les deux sans
ajustement introduit un biais systematique, pas juste une imprecision
cosmetique.

LA CORRECTION : chaque vente est ramenee a l'annee la plus recente
disponible dans le jeu de donnees, via un taux de croissance annuel
compose. Ce taux est ESTIME sur les ventes reelles (regression log-
lineaire sur les medianes annuelles), jamais invente -- et suit la MEME
philosophie de prudence que le reste du pipeline (voir pricing.py) : une
cascade de repli commune -> secteur -> ensemble du perimetre -> aucun
ajustement (0 %), des qu'un niveau n'a pas assez de ventes par annee pour
etre fiable. Un garde-fou plafonne le taux retenu a +/-15 %/an : au-dela,
c'est presque toujours un artefact d'echantillon, pas un vrai marche.
"""
import numpy as np
import pandas as pd

from config import CODE_POSTAL_BY_INSEE

# En dessous, une annee individuelle est trop bruitee pour entrer dans le
# calcul du taux (une poignee de ventes atypiques suffirait a le fausser).
MIN_VENTES_PAR_AN_POUR_TAUX = 8

# Garde-fou : au-dela de +/-15 %/an sur plusieurs annees, c'est un
# artefact (petit echantillon, mutation atypique), pas un vrai marche.
MAX_TAUX_ANNUEL_ABS = 0.15


def taux_annuel(sales_subset):
    """Taux de croissance annuel compose, estime par regression log-
    lineaire sur les medianes annuelles de prix_m2. None si l'historique
    est trop court ou trop mince pour etre fiable (pas d'invention)."""
    par_an = (sales_subset.dropna(subset=["annee_mutation", "prix_m2"])
                          .groupby("annee_mutation")["prix_m2"]
                          .agg(["median", "size"]))
    par_an = par_an[par_an["size"] >= MIN_VENTES_PAR_AN_POUR_TAUX]
    if len(par_an) < 2:
        return None

    annees = par_an.index.values.astype(float)
    log_prix = np.log(par_an["median"].values.astype(float))
    pente = np.polyfit(annees, log_prix, 1)[0]
    taux = float(np.exp(pente) - 1.0)
    return float(np.clip(taux, -MAX_TAUX_ANNUEL_ABS, MAX_TAUX_ANNUEL_ABS))


def build_price_index(sales):
    """Calcule l'annee de reference (la plus recente du jeu) et un taux de
    croissance annuel par commune, avec repli en cascade commune -> secteur
    -> ensemble du perimetre -> 0 % (aucun ajustement).

    Retourne (annee_ref: int, taux_commune: dict[code_insee, float],
              taux_secteur: dict[code_postal, float], taux_global: float,
              communes_avec_taux_propre: set[code_insee]) -- les quatre
    derniers sont exposes pour la transparence du rapport (savoir quelles
    communes ont un taux estime sur leurs propres ventes plutot qu'herite).
    """
    if sales.empty or sales["annee_mutation"].dropna().empty:
        return None, {}, {}, 0.0, set()

    annee_ref = int(sales["annee_mutation"].max())

    taux_secteur = {}
    if "secteur" in sales.columns:
        for secteur, g in sales.groupby("secteur"):
            t = taux_annuel(g)
            if t is not None:
                taux_secteur[secteur] = t

    taux_global = taux_annuel(sales)
    if taux_global is None:
        taux_global = 0.0

    taux_commune = {}
    communes_avec_taux_propre = set()
    for code, g in sales.groupby("code_commune"):
        t = taux_annuel(g)
        if t is not None:
            communes_avec_taux_propre.add(code)
        else:
            t = taux_secteur.get(CODE_POSTAL_BY_INSEE.get(code))
            if t is None:
                t = taux_global
        taux_commune[code] = t

    return annee_ref, taux_commune, taux_secteur, taux_global, communes_avec_taux_propre


def apply_indexation(sales, annee_ref, taux_commune, taux_global=0.0):
    """Retourne une copie de `sales` avec prix_m2 ramene a annee_ref.

    L'original est conserve dans prix_m2_brut pour tracabilite (jamais
    affiche comme "le" prix, mais utile pour deboguer ou auditer).
    """
    s = sales.copy()
    s["prix_m2_brut"] = s["prix_m2"]
    if annee_ref is None:
        return s
    taux = s["code_commune"].map(taux_commune)
    taux = taux.fillna(taux_global)
    ecart_ans = annee_ref - s["annee_mutation"]
    facteur = (1.0 + taux) ** ecart_ans.fillna(0)
    s["prix_m2"] = s["prix_m2_brut"] * facteur
    return s
