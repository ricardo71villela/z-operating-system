"""
Statistiques de marche par commune, calculees sur les transactions DVF reelles.

Utile pour :
  - argumenter un prix en rendez-vous d'estimation (donnees notariales, pas
    des estimations de portails)
  - reperer les communes ou le marche accelere ou ralentit
  - comparer les deux secteurs 74200 / 74500

Genere output/stats_marche_communes.csv
"""
import os

import numpy as np
import pandas as pd

from config import ALL_COMMUNES, CODE_POSTAL_BY_INSEE
from price_index import build_price_index, apply_indexation

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "output")

# Bornes de plausibilite : ecarte les mutations aberrantes (viager, lots
# multiples mal ventiles, cessions a l'euro symbolique) qui faussent les
# moyennes sur les petites communes.
PRIX_M2_MIN = 500
PRIX_M2_MAX = 20000
SURFACE_MIN = 9


def compute(dvf):
    df = dvf.copy()
    for c in ("valeur_fonciere", "surface_reelle_bati", "annee_mutation"):
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")

    if "nature_mutation" in df.columns:
        df = df[df["nature_mutation"].fillna("Vente").str.contains("Vente", na=False)]

    if "type_local" in df.columns:
        df = df[df["type_local"].isin(["Maison", "Appartement"])]

    df = df.dropna(subset=["valeur_fonciere", "surface_reelle_bati"])
    df = df[df["surface_reelle_bati"] >= SURFACE_MIN]
    df["prix_m2"] = df["valeur_fonciere"] / df["surface_reelle_bati"]
    df = df[(df["prix_m2"] >= PRIX_M2_MIN) & (df["prix_m2"] <= PRIX_M2_MAX)]

    if df.empty:
        return pd.DataFrame()

    # Indexation temporelle : le DVF couvre plusieurs annees (2021-2025).
    # prix_m2_median ci-dessous reste le prix BRUT reellement observe (utile
    # tel quel : "voila ce qui s'est vraiment vendu"), mais on ajoute aussi
    # prix_m2_actualise, ramene a l'annee la plus recente du jeu, pour ne pas
    # laisser croire qu'un prix mele 2021-2025 represente le marche d'aujourd'hui.
    # Meme moteur que pricing.py (voir price_index.py), avec le meme repli en
    # cascade commune -> secteur -> ensemble du perimetre.
    df["secteur"] = df["code_commune"].map(CODE_POSTAL_BY_INSEE)
    annee_ref, taux_commune, taux_secteur, taux_global, _propre = build_price_index(df)
    df_idx = apply_indexation(df, annee_ref, taux_commune, taux_global)

    rows = []
    for code, grp in df.groupby("code_commune"):
        nom = ALL_COMMUNES.get(code, code)
        annees = grp["annee_mutation"].dropna()
        rec = grp[annees >= annees.max() - 1] if len(annees) else grp
        anc = grp[annees <= annees.min() + 1] if len(annees) else grp

        med_rec = rec["prix_m2"].median() if len(rec) else np.nan
        med_anc = anc["prix_m2"].median() if len(anc) else np.nan
        evol = ((med_rec / med_anc - 1) * 100) if (med_anc and med_anc == med_anc) else np.nan

        prix_m2_actualise = round(df_idx.loc[grp.index, "prix_m2"].median())

        row = {
            "commune": nom,
            "code_insee": code,
            "code_postal": CODE_POSTAL_BY_INSEE.get(code, ""),
            "nb_ventes": len(grp),
            "prix_m2_median": round(grp["prix_m2"].median()),
            "prix_m2_actualise": prix_m2_actualise,
            "annee_reference": annee_ref,
            "taux_annuel_pct": round(taux_commune.get(code, taux_global) * 100, 1),
            "prix_m2_moyen": round(grp["prix_m2"].mean()),
            "prix_m2_p25": round(grp["prix_m2"].quantile(0.25)),
            "prix_m2_p75": round(grp["prix_m2"].quantile(0.75)),
            "prix_median": round(grp["valeur_fonciere"].median()),
            "surface_mediane": round(grp["surface_reelle_bati"].median()),
            "evolution_pct": round(evol, 1) if evol == evol else None,
        }
        if "type_local" in grp.columns:
            for t in ("Maison", "Appartement"):
                sub = grp[grp["type_local"] == t]
                row[f"prix_m2_{t.lower()}"] = round(sub["prix_m2"].median()) if len(sub) else None
                row[f"nb_{t.lower()}"] = len(sub)

        # Fiabilite : sous 10 ventes, une mutation atypique deplace la mediane
        row["fiabilite"] = ("solide" if len(grp) >= 30
                            else "moyenne" if len(grp) >= 10
                            else "FAIBLE — peu de ventes")
        rows.append(row)

    stats = pd.DataFrame(rows).sort_values("prix_m2_median", ascending=False)
    return stats


def export(stats):
    if stats.empty:
        print("Aucune statistique calculable (pas assez de transactions valides).")
        return
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, "stats_marche_communes.csv")
    stats.to_csv(path, index=False)
    print(f"\nStatistiques de marché -> {path}")

    cols = ["commune", "code_postal", "nb_ventes", "prix_m2_median",
            "prix_m2_actualise", "taux_annuel_pct", "evolution_pct", "fiabilite"]
    cols = [c for c in cols if c in stats.columns]
    annee_ref = stats["annee_reference"].iloc[0] if "annee_reference" in stats.columns and len(stats) else None
    print(f"\n--- Prix médian au m² par commune (transactions DVF réelles) ---")
    if annee_ref is not None:
        print(f"prix_m2_median = brut, mélange 2021-{annee_ref} sans ajustement | "
              f"prix_m2_actualise = ramené à {annee_ref} (voir price_index.py)")
    print(stats[cols].to_string(index=False))

    for cp in ("74200", "74500"):
        sub = stats[stats["code_postal"] == cp]
        if len(sub):
            tot = sub["nb_ventes"].sum()
            pond = (sub["prix_m2_median"] * sub["nb_ventes"]).sum() / tot
            pond_act = (sub["prix_m2_actualise"] * sub["nb_ventes"]).sum() / tot if "prix_m2_actualise" in sub.columns else None
            msg = f"\nSecteur {cp} : {tot:,} ventes, prix médian pondéré {pond:,.0f} €/m² (brut)".replace(",", " ")
            if pond_act is not None:
                msg += f", {pond_act:,.0f} €/m² (actualisé)".replace(",", " ")
            print(msg)


if __name__ == "__main__":
    dvf_path = os.path.join(os.path.dirname(__file__), "..", "data", "dvf_74200_74500.csv")
    dvf = pd.read_csv(dvf_path, dtype=str)
    dvf["annee_mutation"] = pd.to_datetime(dvf["date_mutation"], errors="coerce").dt.year
    export(compute(dvf))
