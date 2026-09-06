"""Tests d'argumentaire.py sur des cas ou l'attendu est connu."""
import numpy as np
import pandas as pd

import argumentaire as A

fails = 0


def check(label, cond, detail=""):
    global fails
    fails += not cond
    print(f"{'OK  ' if cond else 'FAIL'} {label}{('  -> ' + detail) if detail else ''}")


print("=" * 68)
print("TEST ARGUMENTAIRE")
print("=" * 68)

# ---------------------------------------------------------- PLUS-VALUE ------
print("\n--- Plus-value latente ---")
df = pd.DataFrame([
    # achete 280 000 en 2012, estime 5000/m2 x 70 m2 = 350 000 -> +25%
    {"prix_derniere_vente": 280000, "derniere_vente_connue": 2012,
     "prix_m2_estime": 5000, "surface_m2": 70, "surface_dpe": None},
    # achete tres recemment et sans progression -> pas d'argument
    {"prix_derniere_vente": 350000, "derniere_vente_connue": 2024,
     "prix_m2_estime": 5000, "surface_m2": 70, "surface_dpe": None},
    # jamais vendu -> pas de plus-value calculable
    {"prix_derniere_vente": None, "derniere_vente_connue": None,
     "prix_m2_estime": 5000, "surface_m2": None, "surface_dpe": 90},
])
df = A.add_plus_value(df)
print(df[["valeur_estimee_actuelle", "plus_value_eur", "plus_value_pct",
          "duree_detention_ans"]].to_string(index=False))

check("Plus-value calculee correctement (+25%)",
      abs(df.loc[0, "plus_value_pct"] - 25) < 1, f"{df.loc[0,'plus_value_pct']}%")
check("Valeur actuelle = estimation x surface",
      df.loc[0, "valeur_estimee_actuelle"] == 350000,
      str(df.loc[0, "valeur_estimee_actuelle"]))
check("Pas d'argument si progression nulle",
      pd.isna(df.loc[1, "argument_prudent"]))
check("Bien jamais vendu : pas de plus-value",
      pd.isna(df.loc[0 + 2, "plus_value_pct"]))
check("Surface DPE utilisee a defaut de surface DVF",
      df.loc[2, "valeur_estimee_actuelle"] == 450000,
      str(df.loc[2, "valeur_estimee_actuelle"]))

# LE POINT SENSIBLE : l'argument ne doit pas etre nominatif
arg = df.loc[0, "argument_prudent"]
print(f"\nArgument genere : {arg}")
check("Argument formule collectivement (pas 'vous avez achete')",
      "vous" not in arg.lower() and "280" not in arg, arg)

# --------------------------------------------------------- COMPARABLES ------
print("\n--- Comparables de proximite ---")
rng = np.random.default_rng(11)
ventes = []
for i in range(30):
    # grappe proche du point cible
    ventes.append({
        "latitude": 46.3712 + rng.normal(0, 0.0008),
        "longitude": 6.4785 + rng.normal(0, 0.0008),
        "surface_reelle_bati": rng.integers(60, 85),
        "valeur_fonciere": 0, "annee_mutation": rng.integers(2020, 2025),
        "prix_m2": 4000 * rng.normal(1, 0.05), "type_local": "Appartement",
    })
# ventes lointaines (5 km) qui ne doivent PAS remonter
for i in range(10):
    ventes.append({
        "latitude": 46.42, "longitude": 6.55,
        "surface_reelle_bati": 70, "valeur_fonciere": 0,
        "annee_mutation": 2024, "prix_m2": 9000, "type_local": "Appartement",
    })
sales = pd.DataFrame(ventes)
sales["valeur_fonciere"] = sales["prix_m2"] * sales["surface_reelle_bati"]

cible = pd.DataFrame([{
    "lat": 46.3712, "lon": 6.4785, "type_bien": "Appartement",
    "surface_m2": 70, "surface_dpe": None, "score_prospection": 90,
}])
cible, detail = A.add_comparables(cible, sales)
comps = detail[0]
print(f"{len(comps)} comparables trouves :")
for c in comps:
    print(f"   {c['annee']} | {c['surface']} m2 | {c['prix_m2']} EUR/m2 | {c['distance_m']} m")

check("Comparables trouves", len(comps) > 0, f"{len(comps)}")
check("Tous dans le rayon defini",
      all(c["distance_m"] <= A.RAYON_COMPARABLES_M for c in comps))
check("Les ventes lointaines a 9000 EUR/m2 sont exclues",
      all(c["prix_m2"] < 6000 for c in comps),
      f"max {max(c['prix_m2'] for c in comps)}")
check("Colonne texte remplie", isinstance(cible.loc[0, "comparables"], str))

# adresse sans GPS
sans = pd.DataFrame([{"lat": None, "lon": None, "type_bien": None,
                      "surface_m2": None, "surface_dpe": None,
                      "score_prospection": 10}])
sans, det2 = A.add_comparables(sans, sales)
check("Adresse sans GPS : aucun comparable, pas de crash",
      det2[0] == [] and sans.loc[0, "nb_comparables"] == 0)

# --------------------------------------------------------- PASSOIRE ---------
print("\n--- Cout de la passoire thermique ---")
coefs = {("classe_dpe", "C"): 1.05, ("classe_dpe", "F"): 0.84,
         ("classe_dpe", "G"): 0.78}
d2 = pd.DataFrame([{"dpe_classe": "G"}, {"dpe_classe": "F"},
                   {"dpe_classe": "C"}, {"dpe_classe": None}])
d2 = A.add_cout_passoire(d2, coefs)
for _, r in d2.iterrows():
    print(f"  {str(r['dpe_classe']):5s} echeance={r['echeance_dpe']} "
          f"decote={r['decote_dpe_pct']}")
    if r["argument_dpe"]:
        print(f"        {r['argument_dpe']}")

check("Echeance G = 2025", d2.loc[0, "echeance_dpe"] == 2025)
check("Echeance F = 2028", d2.loc[1, "echeance_dpe"] == 2028)
check("Decote G calculee vs meilleure classe",
      d2.loc[0, "decote_dpe_pct"] < -20, f"{d2.loc[0,'decote_dpe_pct']}%")
check("Classe C : pas d'argument passoire", pd.isna(d2.loc[2, "argument_dpe"]))
check("DPE absent : pas de crash", pd.isna(d2.loc[3, "argument_dpe"]))

print("\n" + "=" * 68)
print("TOUS LES TESTS PASSENT" if fails == 0 else f"{fails} ECHEC(S)")
print("=" * 68)
raise SystemExit(1 if fails else 0)
