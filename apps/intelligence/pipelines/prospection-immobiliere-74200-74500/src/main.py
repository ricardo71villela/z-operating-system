"""
Orchestrateur du pipeline complet.

    python main.py              # tout
    python main.py --skip-dpe   # sans l'enrichissement DPE (plus rapide)

Etapes :
  1. BAN  — adresses des 26 communes
  2. DVF  — transactions notariees 2019-2024
  3. DPE  — diagnostics energetiques ADEME (comble les Tier 1)
  4. Segmentation + scoring + grille de prix par rue
  5. Statistiques de marche par commune
  6. Export cartographique (GeoJSON + carte HTML)
"""
import os
import sys
import time

import pandas as pd

import ingest_ban
import ingest_dvf
import enrich_dpe
import segment
import market_stats
import export_map

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "output")


def banner(n, total, titre):
    print("\n" + "=" * 64)
    print(f"ÉTAPE {n}/{total} — {titre}")
    print("=" * 64)


def run(skip_dpe=False):
    t0 = time.time()
    total = 6

    banner(1, total, "Ingestion des adresses (BAN)")
    ingest_ban.main()

    banner(2, total, "Ingestion des transactions (DVF)")
    ingest_dvf.main()

    banner(3, total, "Enrichissement énergétique (DPE ADEME)")
    if skip_dpe:
        print("Étape sautée (--skip-dpe).")
        pd.DataFrame().to_csv(os.path.join(DATA_DIR, "dpe_74200_74500.csv"), index=False)
    else:
        try:
            enrich_dpe.main()
        except Exception as e:
            # Le DPE est un bonus : son echec ne doit jamais casser le pipeline
            print(f"\nEnrichissement DPE échoué ({e}) — on continue sans.")
            pd.DataFrame().to_csv(os.path.join(DATA_DIR, "dpe_74200_74500.csv"), index=False)

    banner(4, total, "Segmentation, scoring et grille de prix par rue")
    segment.main()

    banner(5, total, "Statistiques de marché par commune")
    try:
        dvf = pd.read_csv(os.path.join(DATA_DIR, "dvf_74200_74500.csv"), dtype=str)
        dvf["annee_mutation"] = pd.to_datetime(dvf["date_mutation"], errors="coerce").dt.year
        market_stats.export(market_stats.compute(dvf))
    except Exception as e:
        print(f"Statistiques non calculées ({e}).")

    banner(6, total, "Export cartographique")
    try:
        export_map.export(pd.read_csv(os.path.join(OUTPUT_DIR, "mailing_complet.csv")))
    except Exception as e:
        print(f"Carte non générée ({e}).")

    print("\n" + "=" * 64)
    print(f"TERMINÉ en {time.time()-t0:.0f} s")
    print(f"Fichiers dans : {os.path.abspath(OUTPUT_DIR)}")
    print("=" * 64)
    print("""
A ouvrir en premier :
  - prospection_prioritaire.csv  : vos meilleures cibles, triées par score
  - carte_prospection.html       : la même chose sur une carte (double-clic)
  - mailing_74200_74500.xlsx     : tout, en onglets
  - stats_marche_communes.csv    : prix réels par commune
  - grille_prix_rues.csv         : prix au m² rue par rue
  - coefficients_ajustement.csv  : malus/bonus ancienneté et DPE
""")


if __name__ == "__main__":
    run(skip_dpe="--skip-dpe" in sys.argv)
