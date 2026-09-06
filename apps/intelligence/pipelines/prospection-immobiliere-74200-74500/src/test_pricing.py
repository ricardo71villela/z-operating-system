"""
Test de pricing.py sur des donnees synthetiques ou la VERITE est connue.

On fabrique un marche artificiel avec :
  - commune A a 4000 EUR/m2, commune B a 5000
  - une rue prestige a +25%, une rue ordinaire a 0%
  - un malus reel de -20% pour le bati avant 1948
  - une rue avec UNE SEULE vente tres chere (piege : le shrinkage doit
    l'empecher de devenir une reference)
Puis on verifie que le module retrouve ces effets.
"""
import numpy as np
import pandas as pd

import pricing

rng = np.random.default_rng(42)

TRUE = {
    "74281": 4000,   # commune A
    "74119": 5000,   # commune B
}
RUE_PRESTIGE_EFFECT = 1.25
MALUS_ANCIEN = 0.80


def make_sale(code, voie, num, prix_m2, surface, annee_constr, type_local="Appartement"):
    return {
        "code_commune": code, "adresse_nom_voie": voie, "adresse_numero": str(num),
        "nature_mutation": "Vente", "type_local": type_local,
        "surface_reelle_bati": surface,
        "valeur_fonciere": round(prix_m2 * surface),
        "annee_mutation": 2022,
        "_annee_constr": annee_constr,
    }


rows = []
# --- Commune A : rue ordinaire (40 ventes, bati recent) ---
for i in range(40):
    p = TRUE["74281"] * rng.normal(1, 0.05)
    rows.append(make_sale("74281", "RUE ORDINAIRE", i, p, 70, 1990))

# --- Commune A : rue prestige (30 ventes, +25%) ---
for i in range(30):
    p = TRUE["74281"] * RUE_PRESTIGE_EFFECT * rng.normal(1, 0.05)
    rows.append(make_sale("74281", "RUE PRESTIGE", i, p, 80, 1990))

# --- Commune A : bati ancien, reparti sur les deux rues (-20%) ---
for i in range(30):
    voie = "RUE ORDINAIRE" if i % 2 else "RUE PRESTIGE"
    eff = 1.0 if voie == "RUE ORDINAIRE" else RUE_PRESTIGE_EFFECT
    p = TRUE["74281"] * eff * MALUS_ANCIEN * rng.normal(1, 0.05)
    rows.append(make_sale("74281", voie, 100 + i, p, 90, 1930))

# --- PIEGE : rue avec UNE seule vente delirante a 12000 ---
rows.append(make_sale("74281", "RUE PIEGE", 1, 12000, 60, 1990))

# --- Commune B : 40 ventes ---
for i in range(40):
    p = TRUE["74119"] * rng.normal(1, 0.05)
    rows.append(make_sale("74119", "AVENUE B", i, p, 75, 1990))

dvf = pd.DataFrame(rows)
dpe = pd.DataFrame([{
    "k_num": pricing.normalize_numero(r["adresse_numero"]),
    "k_voie": pricing.normalize_voie(r["adresse_nom_voie"]),
    "code_insee": r["code_commune"],
    "annee_construction": r["_annee_constr"],
    "dpe_classe": "D",
} for r in rows]).drop_duplicates(subset=["k_num", "k_voie", "code_insee"])

print("=" * 68)
print("TEST PRICING — verite terrain connue")
print("=" * 68)
print(f"Commune A (74281) : {TRUE['74281']} EUR/m2")
print(f"Commune B (74119) : {TRUE['74119']} EUR/m2")
print(f"Rue prestige      : +{(RUE_PRESTIGE_EFFECT-1)*100:.0f}%")
print(f"Bati avant 1948   : {(MALUS_ANCIEN-1)*100:.0f}%")
print(f"Rue piege         : 1 seule vente a 12 000 EUR/m2")

sales = pricing.clean_sales(dvf)
grid, com_med, sect_med = pricing.build_price_grid(sales)
coefs, lookup = pricing.build_coefficients(sales, dpe)

print("\n--- GRILLE DE PRIX PAR RUE ---")
print(grid[["commune", "rue", "nb_ventes_rue", "prix_m2_rue_brut",
            "prix_m2_retenu", "poids_rue_pct", "ecart_vs_commune_pct",
            "fiabilite"]].to_string(index=False))

print("\n--- COEFFICIENTS ---")
print(coefs[["critere", "modalite", "nb_ventes", "coefficient",
             "impact_pct", "retenu"]].to_string(index=False))

# ============================ VERIFICATIONS ============================
print("\n" + "=" * 68)
print("VERIFICATIONS")
print("=" * 68)
fails = 0


def check(label, cond, detail=""):
    global fails
    fails += not cond
    print(f"{'OK  ' if cond else 'FAIL'} {label}{('  -> ' + detail) if detail else ''}")


g = grid.set_index(["code_insee", "rue"])

# 1. La rue prestige doit ressortir nettement au-dessus
ecart_prestige = g.loc[("74281", "RUE PRESTIGE"), "ecart_vs_commune_pct"]
check("Rue prestige detectee au-dessus de la commune",
      ecart_prestige > 10, f"+{ecart_prestige}%")

# 2. LE TEST CLE : la rue piege (1 vente a 12000) ne doit PAS devenir reference
piege = g.loc[("74281", "RUE PIEGE")]
com_a = com_med["74281"]
check("Shrinkage : rue a 1 vente reste proche du prix communal",
      piege["prix_m2_retenu"] < com_a * 1.5,
      f"brut {piege['prix_m2_rue_brut']} -> retenu {piege['prix_m2_retenu']} "
      f"(commune {round(com_a)})")
check("Shrinkage : poids de la rue a 1 vente est faible",
      piege["poids_rue_pct"] <= 20, f"{piege['poids_rue_pct']}%")
check("Rue piege signalee comme peu fiable",
      "FAIBLE" in piege["fiabilite"], piege["fiabilite"])

# 3. Le malus bati ancien doit etre retrouve, sans confondre avec la commune
c_anc = coefs[(coefs.critere == "periode_construction") &
              (coefs.modalite == "avant_1948")]
if len(c_anc):
    val = c_anc.iloc[0]["coefficient"]
    check("Malus bati avant 1948 retrouve (~0.80)",
          0.72 <= val <= 0.88, f"coefficient estime {val}")
else:
    check("Malus bati avant 1948 retrouve", False, "absent")

# 4. Echantillon insuffisant -> pas d'ajustement invente
petits = coefs[coefs.nb_ventes < pricing.MIN_SALES_FOR_COEF]
check("Aucun coefficient invente sur petit echantillon",
      (petits["coefficient"] == 1.0).all() if len(petits) else True,
      f"{len(petits)} modalites sous le seuil, toutes a 1.00")

# 5. Estimation d'une adresse : ancien dans rue prestige
test_rows = pd.DataFrame([
    {"code_insee": "74281", "k_voie": "RUE PRESTIGE",
     "annee_construction": 1930, "dpe_classe": "D", "type_bien": "Appartement"},
    {"code_insee": "74281", "k_voie": "RUE ORDINAIRE",
     "annee_construction": 1990, "dpe_classe": "D", "type_bien": "Appartement"},
    {"code_insee": "74119", "k_voie": "RUE INCONNUE",
     "annee_construction": None, "dpe_classe": None, "type_bien": None},
])
est = pricing.add_estimates(test_rows.copy(), grid, com_med, sect_med, lookup)
print("\n--- ESTIMATIONS ---")
print(est[["code_insee", "k_voie", "annee_construction", "prix_m2_estime",
           "base_prix_source", "ajustements"]].to_string(index=False))

attendu = TRUE["74281"] * RUE_PRESTIGE_EFFECT * MALUS_ANCIEN
obtenu = est.iloc[0]["prix_m2_estime"]
check("Ancien en rue prestige : estimation coherente",
      abs(obtenu - attendu) / attendu < 0.15,
      f"estime {obtenu}, attendu ~{round(attendu)}")

check("Rue inconnue : repli sur le prix communal",
      est.iloc[2]["base_prix_source"] == "commune",
      str(est.iloc[2]["base_prix_source"]))

# 6. ANTI-DOUBLE-COMPTAGE : bati ancien + DPE F ne doivent pas se cumuler
fake_coefs = dict(lookup)
fake_coefs[("periode_construction", "avant_1948")] = 0.80
fake_coefs[("classe_dpe", "F")] = 0.80
r = pricing.estimate_row(
    pd.Series({"code_insee": "74281", "k_voie": "RUE ORDINAIRE",
               "annee_construction": 1930, "dpe_classe": "F",
               "type_bien": None}),
    {(g["code_insee"], g["rue"]): g for _, g in grid.iterrows()},
    com_med, sect_med, fake_coefs)
print("\n--- Test anti-double-comptage (bati 1930 + DPE F, coef 0.80 chacun) ---")
print(f"  coef_total = {r['coef_total']}   ajustements = {r['ajustements']}")
check("Bati ancien + DPE F : pas de cumul (0.80, pas 0.64)",
      abs(r["coef_total"] - 0.80) < 0.01, f"coef_total={r['coef_total']}")

# 7. Garde-fou sur les ajustements extremes
fake2 = dict(lookup)
fake2[("periode_construction", "avant_1948")] = 0.20
r2 = pricing.estimate_row(
    pd.Series({"code_insee": "74281", "k_voie": "RUE ORDINAIRE",
               "annee_construction": 1930, "dpe_classe": None, "type_bien": None}),
    {(g["code_insee"], g["rue"]): g for _, g in grid.iterrows()},
    com_med, sect_med, fake2)
check("Garde-fou : coefficient aberrant plafonne a 0.60",
      r2["coef_total"] >= 0.60, f"coef_total={r2['coef_total']}")

print("\n" + "=" * 68)
print(f"{'TOUS LES TESTS PASSENT' if fails == 0 else f'{fails} ECHEC(S)'}")
print("=" * 68)
raise SystemExit(1 if fails else 0)
