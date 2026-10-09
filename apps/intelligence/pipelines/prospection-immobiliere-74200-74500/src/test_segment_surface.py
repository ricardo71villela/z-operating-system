"""Tests de l'audit surfaces (2026-10-08) : appariement DVF par parcelle,
repli spatial reciproque (une vente = une adresse) et surface habitable."""
import numpy as np
import pandas as pd

import segment as sg


def _adr(rows):
    df = pd.DataFrame(rows, columns=["k_num", "k_voie", "code_insee", "lon", "lat"])
    df["derniere_vente_connue"] = np.nan
    return df


def _dvf(rows):
    return pd.DataFrame(rows, columns=["id_mutation", "code_commune", "longitude", "latitude",
                                       "annee_mutation", "type_local", "surface_reelle_bati",
                                       "nombre_pieces_principales", "valeur_fonciere", "id_parcelle"])


def test_spatial_one_sale_one_address():
    # trois maisons a ~10-30 m d'une seule vente d'appartement : avant, les
    # trois heritaient des 60 m2 ; maintenant seule la plus proche la recoit.
    adr = _adr([("1", "a", "74281", 6.50000, 46.37000),
                ("3", "a", "74281", 6.50013, 46.37000),
                ("5", "a", "74281", 6.50026, 46.37000)])
    dvf = _dvf([("m1", "74281", 6.50001, 46.37000, 2022, "Appartement", 60, "3", 300000, "P1")])
    out = sg.spatial_fallback_match(adr, dvf, radius_m=40)
    assert out["surface_m2"].notna().sum() == 1
    assert out.loc[0, "surface_m2"] == 60
    assert out.loc[0, "methode_appariement"] == "spatial"


def test_spatial_skips_sale_already_matched_by_key():
    adr = _adr([("1", "a", "74281", 6.50000, 46.37000),
                ("2", "b", "74281", 6.50010, 46.37000)])
    adr.loc[0, ["derniere_vente_connue", "surface_m2", "_id_mutation"]] = [2022, 60, "m1"]
    dvf = _dvf([("m1", "74281", 6.50008, 46.37000, 2022, "Appartement", 60, "3", 300000, "P1")])
    out = sg.spatial_fallback_match(adr, dvf, radius_m=40)
    assert pd.isna(out.loc[1, "surface_m2"])


def test_parcel_match_single_address_parcel_only():
    adr = _adr([("10", "x", "74263", 6.4, 46.3), ("12", "y", "74263", 6.4, 46.3),
                ("14", "y", "74263", 6.4, 46.3)])
    cad = pd.DataFrame({"k_num": ["10", "12", "14"], "k_voie": ["x", "y", "y"],
                        "code_insee": ["74263"] * 3, "parcela_id": ["A1", "B1", "B1"]})
    dvf = _dvf([("m1", "74263", 6.41, 46.31, 2021, "Maison", 150, "6", 600000, "A1"),
                ("m1", "74263", 6.41, 46.31, 2021, "Dépendance", None, "0", 600000, "A1"),
                ("m2", "74263", 6.41, 46.31, 2023, "Maison", 90, "4", 400000, "B1")])
    out = sg.parcel_match(adr, dvf, cad)
    assert out.loc[0, "surface_m2"] == 150 and out.loc[0, "methode_appariement"] == "parcelle"
    assert out.loc[0, "type_bien"] == "Maison"
    assert pd.isna(out.loc[1, "surface_m2"]) and pd.isna(out.loc[2, "surface_m2"])


def test_choose_surface_prefers_measured_dpe():
    df = pd.DataFrame({
        "surface_m2": [95, 95, 95, np.nan, 80],
        "surface_dpe": [140, 140, np.nan, 120, np.nan],
        "methode_appariement": ["cle", "cle", "spatial", pd.NA, "spatial"],
        "methode_dpe": ["cle", "spatial", pd.NA, "spatial", pd.NA],
    })
    out = sg.choose_surface(df)
    assert list(out["surface_m2"]) == [140, 95, 95, 120, 80]
    assert list(out["source_surface"]) == ["DPE", "DVF", "DVF", "DPE", "DVF"]
    assert list(out["surface_dvf"].fillna(-1)) == [95, 95, 95, -1, 80]


def test_pipeline_chain_with_csv_text_columns():
    """Meme enchainement que segment.main(), avec les colonnes lues en texte
    comme dans le pipeline reel (dtype=str) — c'est ce qui a fait echouer
    les executions du 8/10 sous pandas 3."""
    import io
    adr = pd.read_csv(io.StringIO(
        "numero,nom_voie,code_insee,lon,lat\n"
        "1,Rue A,74281,6.50000,46.37000\n"
        "3,Rue A,74281,6.50013,46.37000\n"
        "10,Chemin X,74263,6.40000,46.30000\n"), dtype=str)
    dvf = pd.read_csv(io.StringIO(
        "id_mutation,date_mutation,valeur_fonciere,adresse_numero,adresse_nom_voie,code_postal,"
        "code_commune,nom_commune,type_local,surface_reelle_bati,nombre_pieces_principales,"
        "longitude,latitude,id_parcelle\n"
        "m1,2022-05-01,300000,7,Rue B,74200,74281,Thonon,Appartement,60,3,6.50001,46.37000,P-A1\n"
        "m2,2021-03-01,600000,99,Vieux chemin,74140,74263,Sciez,Maison,150,6,6.41,46.31,P-S1\n"
        "m3,2023-03-01,250000,1,Rue A,74200,74281,Thonon,Maison,80,4,6.5,46.37,P-A2\n"), dtype=str)
    dvf["date_mutation"] = pd.to_datetime(dvf["date_mutation"])
    dvf["annee_mutation"] = dvf["date_mutation"].dt.year
    adr, dvf = sg.add_match_keys(adr, dvf)
    cad = pd.DataFrame({"k_num": [adr.loc[2, "k_num"]], "k_voie": [adr.loc[2, "k_voie"]],
                        "code_insee": ["74263"], "parcela_id": ["P-S1"]}).astype(str)
    m = sg.merge_dvf(adr, dvf)
    m = sg.parcel_match(m, dvf, cad)
    m = sg.spatial_fallback_match(m, dvf)
    m = sg.filter_implausible_price(m)
    m["surface_dpe"] = np.nan
    m["methode_dpe"] = pd.NA
    m = sg.choose_surface(m)
    # n.3 ne recoit pas la vente m1 : l'adresse la plus proche de m1 est le n.1
    # (deja apparie par cle) — mieux vaut pas de donnee qu'une donnee du voisin.
    assert m.loc[0, "methode_appariement"] == "cle" and m.loc[0, "surface_m2"] == 80
    assert pd.isna(m.loc[1, "surface_m2"])
    assert m.loc[2, "methode_appariement"] == "parcelle" and m.loc[2, "surface_m2"] == 150
    assert m.loc[2, "prix_derniere_vente"] == 600000


def test_bdnb_house_estimate_and_fallback():
    import enrich_bdnb
    rows = enrich_bdnb.rows_for_addresses([
        {"batiment_groupe_id": "bg1", "l_cle_interop_adr": ["74263_0320_01004"], "nb_log": 1, "nb_niveau": 2,
         "surface_emprise_sol": 98, "fiabilite_emprise_sol": "MOYENNE", "annee_construction": 1972,
         "usage_principal_bdnb_open": "Résidentiel individuel"},
        {"batiment_groupe_id": "bg2", "l_cle_interop_adr": ["74263_0320_01006", "74263_0320_01008"], "nb_log": 12,
         "nb_niveau": 4, "surface_emprise_sol": 400, "usage_principal_bdnb_open": "Résidentiel collectif"},
    ], "74263")
    assert [r["ban_id"] for r in rows] == ["74263_0320_01004", "74263_0320_01006", "74263_0320_01008"]
    bdnb = pd.DataFrame(rows).astype(str)
    df = pd.DataFrame({"id": ["74263_0320_01004", "74263_0320_01006", "x"],
                       "surface_m2": [np.nan, np.nan, np.nan], "surface_dpe": [np.nan, np.nan, np.nan],
                       "methode_appariement": [pd.NA] * 3, "methode_dpe": [pd.NA] * 3,
                       "annee_construction": [np.nan, 1990.0, np.nan]})
    df = sg.merge_bdnb(df, bdnb)
    assert df.loc[0, "surface_bdnb_estimee"] == 157          # 98 x 2 x 0,8
    assert pd.isna(df.loc[1, "surface_bdnb_estimee"])        # immeuble : pas d'estimation par logement
    assert df.loc[0, "annee_construction"] == 1972 and df.loc[1, "annee_construction"] == 1990
    df = sg.choose_surface(df)
    assert df.loc[0, "surface_m2"] == 157 and df.loc[0, "source_surface"] == "BDNB"
    assert pd.isna(df.loc[2, "surface_m2"])


def test_bdnb_never_overrides_measured_surface():
    df = pd.DataFrame({"surface_m2": [95.0], "surface_dpe": [np.nan], "methode_appariement": ["cle"],
                       "methode_dpe": [pd.NA], "surface_bdnb_estimee": [180.0]})
    df = sg.choose_surface(df)
    assert df.loc[0, "surface_m2"] == 95 and df.loc[0, "source_surface"] == "DVF"


if __name__ == "__main__":
    n = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); n += 1
    print(f"test_segment_surface : {n}/{n} OK")
