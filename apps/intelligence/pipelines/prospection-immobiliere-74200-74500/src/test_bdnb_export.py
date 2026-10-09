"""Teste la lecture de l'export départemental BDNB (enrich_bdnb.extraire)
sur une petite archive fabriquée, avec les noms de tables du millésime 2026."""
import os
import tempfile
import zipfile

import enrich_bdnb


def fabriquer(path):
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("csv/rel_batiment_groupe_adresse.csv",
                   "batiment_groupe_id,cle_interop_adr,classe_fiabilite\n"
                   "bg-1,74263_0320_01004,HF\n"
                   "bg-2,74263_0075_00457,HF\n"
                   "bg-3,74263_0075_00457,HF\n"      # meme adresse, petite annexe
                   "bg-9,73001_0001_00001,HF\n")     # hors secteur
        z.writestr("csv/batiment_groupe.csv",
                   "batiment_groupe_id,code_commune_insee,s_geom_groupe\n"
                   "bg-1,74263,98\nbg-2,74263,153\nbg-3,74263,12\nbg-9,73001,500\n")
        z.writestr("csv/batiment_groupe_ffo_bat.csv",
                   "batiment_groupe_id;nb_log;nb_niveau;annee_construction;usage_niveau_1_txt\n"
                   "bg-1;1;2;1972;Résidentiel\nbg-2;7;2;2024;Résidentiel\n")
        z.writestr("csv/batiment_groupe_synthese_propriete_usage.csv",
                   "batiment_groupe_id,usage_principal_bdnb_open\n"
                   "bg-1,Résidentiel individuel\nbg-2,Résidentiel collectif\n")
        z.writestr("csv/dpe_logement.csv", "identifiant_dpe,nb_niveau\nx,9\n")


def main():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "a.zip")
        fabriquer(p)
        df = enrich_bdnb.extraire(p, ["74263"])
    assert list(df.columns) == enrich_bdnb.OUT_COLUMNS, df.columns
    assert len(df) == 2, df
    r = df.set_index("ban_id")
    a = r.loc["74263_0320_01004"]
    assert a["bdnb_id"] == "bg-1" and a["bdnb_nb_logements"] == "1" and a["bdnb_nb_niveaux"] == "2"
    assert a["bdnb_emprise_sol_m2"] == "98" and a["bdnb_annee_construction"] == "1972"
    assert a["bdnb_usage"] == "Résidentiel individuel" and a["code_insee"] == "74263"
    b = r.loc["74263_0075_00457"]
    assert b["bdnb_id"] == "bg-2", "l'adresse doit aller au plus grand batiment"
    print("test_bdnb_export : OK")


if __name__ == "__main__":
    main()
