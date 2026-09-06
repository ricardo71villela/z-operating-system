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

import pandas as pd

from config import SEGMENT_THRESHOLDS, PASSOIRES
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

def load_data():
    adr_path = os.path.join(DATA_DIR, "adresses_74200_74500.csv")
    dvf_path = os.path.join(DATA_DIR, "dvf_74200_74500.csv")
    dpe_path = os.path.join(DATA_DIR, "dpe_74200_74500.csv")

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

    return adresses, dvf, dpe


def add_match_keys(adresses, dvf):
    adresses["k_voie"] = adresses["nom_voie"].apply(normalize_voie)
    adresses["k_num"] = adresses["numero"].apply(normalize_numero)
    dvf["k_voie"] = dvf["adresse_nom_voie"].apply(normalize_voie)
    dvf["k_num"] = dvf["adresse_numero"].apply(normalize_numero)
    return adresses, dvf


# --------------------------------------------------------------- MATCHING ---

def merge_dvf(adresses, dvf):
    """Rattache a chaque adresse sa DERNIERE vente connue + caracteristiques."""
    d = dvf.dropna(subset=["annee_mutation"]).copy()

    detail = [c for c in ["type_local", "surface_reelle_bati",
                          "nombre_pieces_principales", "valeur_fonciere"]
              if c in d.columns]

    # Tri par annee puis surface : sur une mutation multi-lots (garage +
    # logement), on retient le lot bati le plus grand.
    sort_cols = ["annee_mutation"]
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


def merge_dpe(df, dpe):
    """Ajoute classe DPE, annee de construction et surface issues de l'ADEME.

    C'est ce qui remplit les Tier 1, invisibles dans le DVF."""
    if dpe.empty or not {"k_num", "k_voie"} <= set(dpe.columns):
        for c in ("dpe_classe", "ges_classe", "annee_construction",
                  "surface_dpe", "date_dpe"):
            df[c] = pd.NA
        return df

    d = dpe.copy()
    for c in ("annee_construction", "surface_dpe"):
        if c in d.columns:
            d[c] = pd.to_numeric(d[c], errors="coerce")

    keep = [c for c in ["k_num", "k_voie", "code_insee", "dpe_classe", "ges_classe",
                        "annee_construction", "surface_dpe", "date_dpe"]
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


# ------------------------------------------------------------- SEGMENTATION -

def add_tiers(df):
    def tier(row):
        v = row["derniere_vente_connue"]
        if pd.isna(v):
            return "POTENTIEL_ELEVE"
        ans = CURRENT_YEAR - int(v)
        if ans >= SEGMENT_THRESHOLDS["POTENTIEL_ELEVE"]:
            return "POTENTIEL_ELEVE"
        if ans >= SEGMENT_THRESHOLDS["POTENTIEL_MOYEN"]:
            return "POTENTIEL_MOYEN"
        return "POTENTIEL_FAIBLE"

    df["segment_prospection"] = df.apply(tier, axis=1)
    df = add_scores(df)
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

EXPORT_COLS = [
    "adresse_complete", "nom_commune_ref", "code_postal_secteur",
    "priorite", "score_prospection", "motifs_score", "segment_prospection",
    "derniere_vente_connue", "type_bien", "surface_m2", "nb_pieces",
    "prix_derniere_vente", "prix_m2_derniere_vente",
    "dpe_classe", "ges_classe", "passoire_thermique", "annee_construction",
    "surface_dpe",
    "prix_m2_estime", "base_prix_source", "ajustements", "coef_total",
    "valeur_estimee_actuelle", "plus_value_eur", "plus_value_pct",
    "duree_detention_ans", "argument_prudent",
    "comparables", "nb_comparables",
    "echeance_dpe", "decote_dpe_pct", "argument_dpe",
    "lien_google_maps", "lien_street_view", "lien_itineraire",
    "lon", "lat",
]

# Nombre de fiches PDF generees (les meilleurs scores)
NB_FICHES_PDF = 50

# Seuil de score utilise pour la liste prioritaire exportee (doit rester
# coherent avec le meme seuil utilise dans export()).
SEUIL_PRIORITAIRE = 50

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
NB_COMPARABLES_PLANCHER = 500
NB_COMPARABLES_PLAFOND = 8000


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

    adresses, dvf, dpe = load_data()
    adresses, dvf = add_match_keys(adresses, dvf)

    merged = merge_dvf(adresses, dvf)
    merged = merge_dpe(merged, dpe)
    merged = add_tiers(merged)

    # Grille de prix par rue + coefficients d'ajustement (anciennete, DPE)
    print("\n--- Grille de prix par rue ---")
    sales = pricing.clean_sales(dvf)
    grid, com_med, sect_med = pricing.build_price_grid(sales)
    coefs, coef_lookup = pricing.build_coefficients(sales, dpe)
    pricing.export(grid, coefs)
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
        diagnostic.run(adresses, dvf, dpe, merged, out, grid, coefs)
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
