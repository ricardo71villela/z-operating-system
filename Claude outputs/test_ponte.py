"""Testes da ponte de cruzamento Radar Léman <-> scraper da concorrência.

Corre com: python3 test_ponte.py
"""
import sys

import pandas as pd

from ponte_radar_leman_concorrencia import (
    cidade_canonica,
    cruzar_moradas,
    cruzar_terrenos,
    diferenca_pct,
    divisoes_compativeis,
    tipo_radar_para_comum,
    tipo_scraper_para_comum,
)

FALHAS = []


def check(nome, condicao, detalhe=""):
    status = "OK" if condicao else "FALHOU"
    print(f"[{status}] {nome} {detalhe}")
    if not condicao:
        FALHAS.append(nome)


def test_cidade_canonica():
    check("Thonon variantes", cidade_canonica("Thonon") == cidade_canonica("Thonon-les-Bains") == "Thonon-les-Bains")
    check("Evian variantes", cidade_canonica("Evian") == cidade_canonica("Évian-les-Bains") == "Évian-les-Bains")
    check("comuna fora do âmbito devolve None", cidade_canonica("Publier") is None)
    check("vazio devolve None", cidade_canonica(None) is None)


def test_tipo_mapping():
    check("Maison -> Casa", tipo_radar_para_comum("Maison") == "Casa")
    check("Appartement -> Apartamento", tipo_radar_para_comum("Appartement") == "Apartamento")
    check("Dépendance não mapeia (fora do cruzamento)", tipo_radar_para_comum("Dépendance") is None)
    check("scraper Casa -> Casa", tipo_scraper_para_comum("Casa") == "Casa")
    check("scraper Terreno -> Terreno", tipo_scraper_para_comum("Terreno") == "Terreno")


def test_diferenca_pct():
    check("mesma área -> 0%", diferenca_pct(100, 100) == 0)
    check("1% exato", abs(diferenca_pct(100, 101) - 0.99) < 0.01)
    check("None devolve None", diferenca_pct(None, 100) is None)
    check("NaN devolve None", diferenca_pct(float("nan"), 100) is None)


def test_divisoes_compativeis():
    check("iguais -> True", divisoes_compativeis(4, 4) is True)
    check("diferentes -> False", divisoes_compativeis(4, 3) is False)
    check("falta de um lado -> None (não penaliza)", divisoes_compativeis(4, None) is None)


def test_cruzar_terrenos_dentro_da_tolerancia():
    df_terrenos = pd.DataFrame(
        [{"parcela_id": "T1", "commune": "Thonon-les-Bains", "area_m2": 1000, "link_mapa": "x"}]
    )
    df_conc = pd.DataFrame(
        [
            {
                "cidade": "Thonon",
                "tipo_imovel": "Terreno",
                "superficie_terreno_m2": 1005,  # 0.5% de diferença
                "agencia_nome": "X",
                "url_anuncio": "u1",
            },
            {
                "cidade": "Thonon",
                "tipo_imovel": "Terreno",
                "superficie_terreno_m2": 1200,  # 20% de diferença — fora
                "agencia_nome": "Y",
                "url_anuncio": "u2",
            },
            {
                "cidade": "Evian",  # cidade errada — fora
                "tipo_imovel": "Terreno",
                "superficie_terreno_m2": 1000,
                "agencia_nome": "Z",
                "url_anuncio": "u3",
            },
        ]
    )
    resultado = cruzar_terrenos(df_terrenos, df_conc)
    check("encontra exatamente 1 candidato dentro da tolerância", len(resultado) == 1)
    check("candidato é o da agência X", resultado.iloc[0]["concorrencia_agencia"] == "X" if len(resultado) else False)


def test_cruzar_terrenos_usa_superficie_m2_como_reserva():
    # Caso real encontrado nos dados: um anúncio de "Terreno" puro às vezes
    # tem a área capturada em superficie_m2 (extrator genérico) em vez de
    # superficie_terreno_m2 (que exige a palavra "terrain" perto do número).
    df_terrenos = pd.DataFrame(
        [{"parcela_id": "T2", "commune": "Evian", "area_m2": 619, "link_mapa": "x"}]
    )
    df_conc = pd.DataFrame(
        [
            {
                "cidade": "Evian",
                "tipo_imovel": "Terreno",
                "superficie_terreno_m2": None,
                "superficie_m2": 620,  # 0.16% de diferença
                "agencia_nome": "CapTerrains",
                "url_anuncio": "ut",
            }
        ]
    )
    resultado = cruzar_terrenos(df_terrenos, df_conc)
    check("usa superficie_m2 quando superficie_terreno_m2 falta", len(resultado) == 1)


def test_cruzar_casas_exige_cidade_tipo_e_divisoes():
    df_radar = pd.DataFrame(
        [
            {
                "adresse_complete": "1 Rue Test, Thonon",
                "nom_commune_ref": "Thonon-les-Bains",
                "type_bien": "Maison",
                "surface_m2": 120,
                "surface_terrain_m2": 500,
                "nb_pieces": 5,
                "n_enderecos_parcela": 1,
                "lien_google_maps": "map1",
            },
            {
                # parcela partilhada — deve ser excluída do cruzamento
                "adresse_complete": "2 Rue Test, Thonon",
                "nom_commune_ref": "Thonon-les-Bains",
                "type_bien": "Maison",
                "surface_m2": 120,
                "surface_terrain_m2": 500,
                "nb_pieces": 5,
                "n_enderecos_parcela": 4,
                "lien_google_maps": "map2",
            },
        ]
    )
    df_conc = pd.DataFrame(
        [
            {
                "cidade": "Thonon",
                "tipo_imovel": "Casa",
                "superficie_m2": 122,  # ~1.6% diff, dentro dos 2.5%
                "superficie_terreno_m2": 503,  # 0.6% diff, dentro de 1%
                "num_divisoes": 5,
                "num_quartos": None,
                "agencia_nome": "AgenciaA",
                "url_anuncio": "ua",
            },
            {
                "cidade": "Thonon",
                "tipo_imovel": "Casa",
                "superficie_m2": 121,
                "superficie_terreno_m2": 503,
                "num_divisoes": 3,  # divisões diferentes -> descarta mesmo com área a bater
                "num_quartos": None,
                "agencia_nome": "AgenciaB",
                "url_anuncio": "ub",
            },
        ]
    )
    resultado = cruzar_moradas(df_radar, df_conc, "Casa")
    check(
        "só a morada não-partilhada com divisões iguais entra",
        len(resultado) == 1 and resultado.iloc[0]["concorrencia_agencia"] == "AgenciaA",
        f"(n={len(resultado)})",
    )


def test_cruzar_apartamentos_so_area_habitavel():
    df_radar = pd.DataFrame(
        [
            {
                "adresse_complete": "3 Rue Test, Évian",
                "nom_commune_ref": "Évian-les-Bains",
                "type_bien": "Appartement",
                "surface_m2": 70,
                "surface_terrain_m2": None,
                "nb_pieces": 3,
                "n_enderecos_parcela": 12,  # irrelevante para apartamento
                "lien_google_maps": "map3",
            }
        ]
    )
    df_conc = pd.DataFrame(
        [
            {
                "cidade": "Evian",
                "tipo_imovel": "Apartamento",
                "superficie_m2": 71.5,  # ~2.1% diff, dentro de 2.5%
                "superficie_terreno_m2": None,
                "num_divisoes": None,
                "num_quartos": None,
                "agencia_nome": "AgenciaC",
                "url_anuncio": "uc",
            }
        ]
    )
    resultado = cruzar_moradas(df_radar, df_conc, "Apartamento")
    check("apartamento cruza só por área habitável", len(resultado) == 1)


if __name__ == "__main__":
    test_cidade_canonica()
    test_tipo_mapping()
    test_diferenca_pct()
    test_divisoes_compativeis()
    test_cruzar_terrenos_dentro_da_tolerancia()
    test_cruzar_terrenos_usa_superficie_m2_como_reserva()
    test_cruzar_casas_exige_cidade_tipo_e_divisoes()
    test_cruzar_apartamentos_so_area_habitavel()

    print()
    if FALHAS:
        print(f"FALHARAM {len(FALHAS)} TESTE(S): {FALHAS}")
        sys.exit(1)
    print("TODOS OS TESTES PASSARAM")
