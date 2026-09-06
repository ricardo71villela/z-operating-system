"""
Diagnostic du premier lancement sur données réelles.

POURQUOI CE MODULE EXISTE
Toute l'application a été développée et testée sur des données simulées :
l'environnement de développement n'avait pas accès aux portails data.gouv.
Trois inconnues majeures ne peuvent être levées que par un vrai lancement :

  1. Le taux de rapprochement BAN <-> DVF tient-il sur les libellés locaux ?
  2. Quelle est la couverture réelle du DPE sur ces 26 communes ?
  3. Quels volumes par segment, et la segmentation discrimine-t-elle ?

Ce module répond aux trois, avec une INTERPRÉTATION de chaque chiffre —
pas seulement le chiffre brut. Il écrit output/DIAGNOSTIC.txt, à lire en
premier après le premier run.
"""
import os

import pandas as pd

from config import (ALL_COMMUNES, SEGMENT_THRESHOLDS, FENETRE_DVF_ANS,
                    valider_seuils)

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "output")

VERDICTS = []


def _ligne(txt=""):
    VERDICTS.append(txt)


def _verdict(titre, valeur, seuils, interpretations, unite=""):
    """Affiche une mesure avec son interprétation selon des seuils.

    seuils : liste décroissante de bornes ; interpretations : même longueur + 1
    """
    niveau = len(seuils)
    for i, s in enumerate(seuils):
        if valeur >= s:
            niveau = i
            break
    etat = ["OK", "MOYEN", "PROBLEME"][min(niveau, 2)]
    _ligne(f"[{etat:8s}] {titre} : {valeur}{unite}")
    _ligne(f"           {interpretations[niveau]}")
    _ligne()
    return etat


def run(df_adr, df_dvf, df_dpe, merged, out, grid, coefs):
    VERDICTS.clear()
    _ligne("=" * 70)
    _ligne("DIAGNOSTIC DU PREMIER LANCEMENT — À LIRE EN PREMIER")
    _ligne("=" * 70)
    _ligne()

    # ---------------------------------------------------------- COHERENCE ---
    _ligne("--- 0. Cohérence de la configuration ---")
    _ligne()
    pbs = valider_seuils()
    if pbs:
        _ligne("[PROBLEME] Des seuils dépassent la fenêtre DVF disponible :")
        for p in pbs:
            _ligne(f"           {p}")
        _ligne("           Des segments ne recevront jamais aucune adresse.")
    else:
        _ligne(f"[OK      ] Fenêtre DVF : {FENETRE_DVF_ANS} ans ; "
               f"seuils {SEGMENT_THRESHOLDS} — tous atteignables.")
    _ligne()

    # ------------------------------------------------- 1. RAPPROCHEMENT ----
    _ligne("--- 1. Rapprochement des adresses BAN <-> DVF ---")
    _ligne()
    vb = set(df_adr["k_voie"]) - {""}
    vd = set(df_dvf["k_voie"]) - {""}
    taux = 100 * len(vb & vd) / max(len(vd), 1)
    _verdict(
        "Voies DVF retrouvées dans la BAN", round(taux, 1), [70, 40],
        ["La normalisation des libellés fonctionne. La grille de prix par "
         "rue et les segments reposent sur des bases solides.",
         "Rapprochement partiel. La grille de prix reste utilisable mais "
         "une partie des ventes n'est pas rattachée : certaines adresses "
         "seront classées 'jamais vendu' à tort.",
         "ÉCHEC du rapprochement. La segmentation n'est PAS fiable : la "
         "plupart des adresses tomberont en potentiel élevé par défaut. "
         "Regardez l'échantillon de voies non retrouvées ci-dessous et "
         "complétez le dictionnaire ABBREV de normalize.py."],
        unite=" %")

    non_match = sorted(vd - vb)[:20]
    if non_match:
        _ligne("           Voies DVF non retrouvées (à examiner) :")
        for v in non_match:
            _ligne(f"             - {v}")
        _ligne()

    # ------------------------------------------------ 2. COUVERTURE DPE ----
    _ligne("--- 2. Couverture du DPE (ADEME) ---")
    _ligne()
    if df_dpe is None or df_dpe.empty:
        _ligne("[PROBLEME] Aucune donnée DPE récupérée.")
        _ligne("           L'API ADEME n'a pas répondu, ou son schéma a changé.")
        _ligne("           Conséquence : les adresses jamais vendues restent")
        _ligne("           sans aucune information (ni année de construction,")
        _ligne("           ni classe énergétique). Les fiches PDF de ces biens")
        _ligne("           seront quasi vides et l'argument 'passoire' disparaît.")
        _ligne("           C'est la perte la plus lourde pour la prospection.")
        _ligne()
    else:
        n_dpe = merged["dpe_classe"].notna().sum() if "dpe_classe" in merged else 0
        pct = 100 * n_dpe / max(len(merged), 1)
        _verdict(
            "Adresses documentées par un DPE", round(pct, 1), [25, 10],
            ["Bonne couverture. Les biens jamais vendus sont documentés "
             "(année de construction, classe énergétique) : c'est ce qui "
             "rend les fiches PDF exploitables.",
             "Couverture partielle. Une part des cibles prioritaires restera "
             "sans information ; leurs fiches seront peu argumentées.",
             "Couverture très faible. Vérifiez le rapprochement d'adresses "
             "du DPE (mêmes clés que BAN). Les cibles prioritaires seront "
             "des adresses nues."],
            unite=" %")

        if "dpe_classe" in merged.columns:
            rep = merged["dpe_classe"].value_counts().sort_index()
            if len(rep):
                _ligne("           Répartition des classes :")
                _ligne("             " + "  ".join(f"{k}:{v:,}" for k, v in rep.items()))
                _ligne()

    # ------------------------------------------------------ 3. VOLUMES ----
    _ligne("--- 3. Volumes et pouvoir discriminant ---")
    _ligne()
    _ligne(f"           Adresses totales      : {len(merged):,}")
    if "segment_prospection" in out.columns:
        seg = out["segment_prospection"].value_counts()
        for k, v in seg.items():
            _ligne(f"           {k:22s}: {v:,}  ({100*v/max(len(out),1):.1f} %)")
        _ligne()
        vivants = (seg > 0).sum()
        _verdict(
            "Segments réellement peuplés", int(vivants), [3, 2],
            ["Les trois segments sont peuplés : la segmentation discrimine.",
             "Un segment est vide. La segmentation est de fait binaire — "
             "utilisable, mais moins fine qu'annoncé.",
             "Segmentation dégradée : presque tout tombe dans un seul "
             "segment. Vérifiez d'abord le rapprochement (point 1)."],
            unite=" / 3")

    if "score_prospection" in out.columns:
        sc = out["score_prospection"]
        _ligne(f"           Score — médiane {sc.median():.0f}, "
               f"moyenne {sc.mean():.0f}, max {sc.max():.0f}")
        etendue = sc.quantile(0.9) - sc.quantile(0.1)
        _verdict(
            "Étendue des scores (D9 - D1)", int(etendue), [30, 15],
            ["Les scores s'étalent : le classement hiérarchise vraiment.",
             "Étalement modéré. Le haut de liste reste exploitable mais la "
             "distinction entre cibles moyennes est faible.",
             "Scores trop uniformes : le classement n'apporte presque rien. "
             "Souvent le symptôme d'un enrichissement DVF/DPE insuffisant."],
            unite=" points")

        top = (sc >= 50).sum()
        _ligne(f"           Cibles prioritaires (score >= 50) : {top:,}")
        if top == 0:
            _ligne("           [PROBLEME] Aucune cible prioritaire — "
                   "abaissez le seuil ou vérifiez l'enrichissement.")
        elif top > len(out) * 0.5:
            _ligne("           [MOYEN   ] Plus de la moitié des adresses sont "
                   "'prioritaires' : le seuil ne filtre plus rien.")
            _ligne("           Relevez-le dans segment.py pour retrouver une "
                   "shortlist exploitable.")
        else:
            _ligne("           [OK      ] Volume de shortlist exploitable.")
        _ligne()

    # -------------------------------------------------- 4. PRIX PAR RUE ---
    _ligne("--- 4. Grille de prix ---")
    _ligne()
    if grid is None or grid.empty:
        _ligne("[PROBLEME] Aucune grille de prix : pas assez de ventes "
               "exploitables. Les fiches n'afficheront pas d'estimation.")
    else:
        fiables = (grid["nb_ventes_rue"] >= 3).sum()
        _ligne(f"           Rues couvertes : {len(grid):,}")
        _verdict(
            "Rues avec au moins 3 ventes", int(fiables),
            [max(1, len(grid) // 4), 1],
            ["Assez de rues ont un prix propre : la granularité par rue "
             "apporte une vraie valeur au-dessus du prix communal.",
             "Peu de rues ont un historique suffisant : la plupart des "
             "estimations retomberont sur le prix communal (c'est le "
             "comportement voulu, pas un bug).",
             "Presque aucune rue n'a d'historique : la grille équivaut au "
             "prix communal. Utilisable, mais sans finesse géographique."],
            unite=" rues")

    if coefs is not None and not coefs.empty:
        retenus = coefs["retenu"].sum() if "retenu" in coefs.columns else 0
        _ligne(f"           Coefficients d'ajustement retenus : "
               f"{retenus} / {len(coefs)}")
        if retenus == 0:
            _ligne("           [MOYEN   ] Aucun ajustement validé "
                   "(échantillons trop minces). Les estimations n'intègrent")
            _ligne("           donc ni l'ancienneté du bâti ni le DPE.")
        _ligne()

    # ----------------------------------------------------- CONCLUSION -----
    _ligne("=" * 70)
    _ligne("À FAIRE APRÈS LECTURE")
    _ligne("=" * 70)
    _ligne()
    _ligne("1. Si le point 1 est en PROBLEME : c'est la priorité absolue.")
    _ligne("   Tout le reste en dépend. Ajoutez les abréviations manquantes")
    _ligne("   au dictionnaire ABBREV de normalize.py, puis relancez")
    _ligne("   (les données déjà téléchargées sont réutilisées).")
    _ligne()
    _ligne("2. Si le point 2 est en PROBLEME : les fiches PDF perdent leur")
    _ligne("   intérêt principal. Vérifiez la sortie de l'étape DPE.")
    _ligne()
    _ligne("3. Ajustez ensuite les seuils et les poids dans config.py")
    _ligne("   selon les volumes réels constatés au point 3.")
    _ligne()

    texte = "\n".join(VERDICTS)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, "DIAGNOSTIC.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(texte)
    print(texte)
    print(f"\nDiagnostic écrit dans : {path}")
    return texte
