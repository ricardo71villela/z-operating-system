"""Ponte de cruzamento por área entre o Radar Léman e o scraper da
concorrência (chablais).

Decisão do Ricardo (13/set/2026): cruzar por ÁREA em vez de morada, porque a
área nunca é omitida num anúncio (ao contrário da rua exata), com margens de
tolerância diferentes consoante o tipo de área:
  - Terreno: até 1% de diferença (é um número oficial do cadastro dos dois
    lados — a agência normalmente publica o mesmo valor que está registado).
  - Superfície habitável: até 2-3% (a agência publica a área "Loi Carrez",
    o Radar Léman usa a área DVF/cadastre `surface_reelle_bati` — são duas
    definições legais diferentes que podem divergir um pouco mesmo para o
    MESMO imóvel, sem erro de nenhum dos dois lados).
Em ambos os casos, exige-se também concordância de cidade e de tipo de
imóvel, e de nº de divisões quando existir dos dois lados — isto é o que
mantém a taxa de erro global baixa mesmo com uma margem de área um pouco
mais larga na superfície habitável (o mesmo princípio já usado em
`normalize.py::dedup_fingerprint` para deduplicar entre agências).

Âmbito: só Thonon-les-Bains e Évian-les-Bains, porque é o único âmbito do
scraper da concorrência (o Radar Léman cobre 26 comunas, mas o cruzamento
só faz sentido onde há dados dos dois lados).

Três cruzamentos, porque são três "mundos" de dados diferentes no Radar
Léman:
  1. Terrenos livres (`terrenos_livres_potencial.csv`) <-> anúncios de
     "Terreno" do scraper — comparação de área do terreno (1%).
  2. Moradas "Maison" (`prospection_prioritaire.csv`) <-> anúncios de "Casa"
     do scraper — comparação de área do terreno (1%) e/ou área habitável
     (2-3%). Excluídas moradas em parcela partilhada
     (`n_enderecos_parcela >= 2`): o terreno aí é de um lotissement/
     copropriedade inteiro, não de uma casa isolada à venda.
  3. Moradas "Appartement" (`prospection_prioritaire.csv`) <-> anúncios de
     "Apartamento" do scraper — só área habitável (2-3%), terreno não se
     aplica a frações de copropriedade.

Uso:
    python3 ponte_radar_leman_concorrencia.py \
        --radar-leman output/prospection_prioritaire.csv \
        --terrenos output/terrenos_livres_potencial.csv \
        --concorrencia concorrencia_ativa.csv \
        --saida candidatos_cruzamento.csv
"""
from __future__ import annotations

import argparse
import re
import unicodedata

import pandas as pd

TOLERANCIA_TERRENO_PCT = 1.0
TOLERANCIA_HABITAVEL_PCT = 2.5  # ponto médio da faixa 2-3% acordada

# --- normalização -----------------------------------------------------------

_CIDADE_CANONICA = {
    "thonon": "Thonon-les-Bains",
    "evian": "Évian-les-Bains",
}

_TIPO_RADAR_PARA_COMUM = {
    "maison": "Casa",
    "appartement": "Apartamento",
    # dependência, imóvel misto e local comercial não entram no cruzamento:
    # não correspondem a nenhuma categoria clara do lado do scraper.
}

_TIPO_SCRAPER_PARA_COMUM = {
    "casa": "Casa",
    "apartamento": "Apartamento",
    "terreno": "Terreno",
}


def _normalizar_texto(s) -> str:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    s = str(s).strip().lower()
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    return s


def cidade_canonica(valor) -> str | None:
    """Normaliza qualquer variante ('Thonon', 'thonon-les-bains',
    'Évian-les-Bains', 'evian'...) para um nome canónico único, para que os
    dois lados (Radar Léman e scraper) fiquem sempre comparáveis."""
    n = _normalizar_texto(valor)
    if not n:
        return None
    if "thonon" in n:
        return _CIDADE_CANONICA["thonon"]
    if "evian" in n:
        return _CIDADE_CANONICA["evian"]
    return None


def tipo_radar_para_comum(valor) -> str | None:
    return _TIPO_RADAR_PARA_COMUM.get(_normalizar_texto(valor))


def tipo_scraper_para_comum(valor) -> str | None:
    return _TIPO_SCRAPER_PARA_COMUM.get(_normalizar_texto(valor))


def diferenca_pct(a: float, b: float) -> float | None:
    """Diferença relativa entre duas áreas, em percentagem, relativa à
    MAIOR das duas (mais conservador do que relativa à primeira — trata
    a=100/b=101 e a=101/b=100 da mesma forma)."""
    if a is None or b is None or pd.isna(a) or pd.isna(b):
        return None
    maior = max(a, b)
    if maior <= 0:
        return None
    return abs(a - b) / maior * 100.0


def divisoes_compativeis(nb_pieces, num_divisoes) -> bool | None:
    """Devolve True/False quando os dois lados têm nº de divisões; None
    quando falta de um dos lados (não penaliza nem confirma — apenas não
    é possível verificar)."""
    if nb_pieces is None or pd.isna(nb_pieces) or num_divisoes is None or pd.isna(num_divisoes):
        return None
    return int(nb_pieces) == int(num_divisoes)


# --- cruzamento 1: terrenos livres ------------------------------------------

def cruzar_terrenos(df_terrenos: pd.DataFrame, df_concorrencia: pd.DataFrame) -> pd.DataFrame:
    candidatos = []
    anuncios_terreno = df_concorrencia[
        df_concorrencia["tipo_imovel"].apply(tipo_scraper_para_comum) == "Terreno"
    ]
    for _, terreno in df_terrenos.iterrows():
        cidade_t = cidade_canonica(terreno.get("commune"))
        if cidade_t is None:
            continue
        for _, anuncio in anuncios_terreno.iterrows():
            if cidade_canonica(anuncio.get("cidade")) != cidade_t:
                continue
            # Num anúncio de terreno puro, a área do lote às vezes é apanhada
            # pelo extrator de superfície habitável em vez do de terreno (o
            # texto do cartão nem sempre tem a palavra "terrain" perto do
            # número) — usar o que estiver preenchido, o significado é o
            # mesmo quando o tipo já é "Terreno".
            area_anuncio = anuncio.get("superficie_terreno_m2")
            if pd.isna(area_anuncio):
                area_anuncio = anuncio.get("superficie_m2")
            diff = diferenca_pct(terreno.get("area_m2"), area_anuncio)
            if diff is None or diff > TOLERANCIA_TERRENO_PCT:
                continue
            candidatos.append(
                {
                    "tipo_cruzamento": "terreno_livre",
                    "cidade": cidade_t,
                    "radar_leman_id": terreno.get("parcela_id"),
                    "radar_leman_area_m2": terreno.get("area_m2"),
                    "radar_leman_link": terreno.get("link_mapa"),
                    "concorrencia_agencia": anuncio.get("agencia_nome"),
                    "concorrencia_url": anuncio.get("url_anuncio"),
                    "concorrencia_area_m2": area_anuncio,
                    "diferenca_area_pct": round(diff, 2),
                    "divisoes_compativeis": None,
                }
            )
    return pd.DataFrame(candidatos)


# --- cruzamento 2 e 3: casas e apartamentos ---------------------------------

def cruzar_moradas(
    df_radar: pd.DataFrame, df_concorrencia: pd.DataFrame, tipo_comum: str
) -> pd.DataFrame:
    """tipo_comum: 'Casa' ou 'Apartamento'."""
    candidatos = []

    radar_filtrado = df_radar[df_radar["type_bien"].apply(tipo_radar_para_comum) == tipo_comum].copy()
    if tipo_comum == "Casa":
        # excluir parcela partilhada (lotissement/copropriedade horizontal)
        # — o terreno aí não pertence a uma casa isolada à venda.
        partilhada = pd.to_numeric(radar_filtrado.get("n_enderecos_parcela"), errors="coerce").fillna(1) >= 2
        radar_filtrado = radar_filtrado[~partilhada]

    anuncios = df_concorrencia[df_concorrencia["tipo_imovel"].apply(tipo_scraper_para_comum) == tipo_comum]

    for _, morada in radar_filtrado.iterrows():
        cidade_r = cidade_canonica(morada.get("nom_commune_ref"))
        if cidade_r is None:
            continue
        for _, anuncio in anuncios.iterrows():
            if cidade_canonica(anuncio.get("cidade")) != cidade_r:
                continue

            diff_habitavel = diferenca_pct(morada.get("surface_m2"), anuncio.get("superficie_m2"))
            diff_terreno = (
                diferenca_pct(morada.get("surface_terrain_m2"), anuncio.get("superficie_terreno_m2"))
                if tipo_comum == "Casa"
                else None
            )

            bate_habitavel = diff_habitavel is not None and diff_habitavel <= TOLERANCIA_HABITAVEL_PCT
            bate_terreno = diff_terreno is not None and diff_terreno <= TOLERANCIA_TERRENO_PCT

            if not bate_habitavel and not bate_terreno:
                continue  # nenhuma das duas áreas bate dentro da tolerância

            divisoes_ok = divisoes_compativeis(morada.get("nb_pieces"), anuncio.get("num_divisoes"))
            if divisoes_ok is False:
                continue  # nº de divisões conhecido dos dois lados e DIFERENTE — descarta

            candidatos.append(
                {
                    "tipo_cruzamento": tipo_comum.lower(),
                    "cidade": cidade_r,
                    "radar_leman_endereco": morada.get("adresse_complete"),
                    "radar_leman_surface_m2": morada.get("surface_m2"),
                    "radar_leman_surface_terrain_m2": morada.get("surface_terrain_m2"),
                    "radar_leman_nb_pieces": morada.get("nb_pieces"),
                    "radar_leman_link": morada.get("lien_google_maps"),
                    "concorrencia_agencia": anuncio.get("agencia_nome"),
                    "concorrencia_url": anuncio.get("url_anuncio"),
                    "concorrencia_superficie_m2": anuncio.get("superficie_m2"),
                    "concorrencia_superficie_terreno_m2": anuncio.get("superficie_terreno_m2"),
                    "concorrencia_num_divisoes": anuncio.get("num_divisoes"),
                    "diferenca_habitavel_pct": round(diff_habitavel, 2) if diff_habitavel is not None else None,
                    "diferenca_terreno_pct": round(diff_terreno, 2) if diff_terreno is not None else None,
                    "bate_por": "terreno" if bate_terreno else "habitavel",
                    "divisoes_compativeis": divisoes_ok,
                }
            )
    return pd.DataFrame(candidatos)


def executar(radar_leman_path: str, terrenos_path: str, concorrencia_path: str) -> pd.DataFrame:
    df_radar = pd.read_csv(radar_leman_path)
    df_terrenos = pd.read_csv(terrenos_path)
    df_concorrencia = pd.read_csv(concorrencia_path)

    partes = [
        cruzar_terrenos(df_terrenos, df_concorrencia),
        cruzar_moradas(df_radar, df_concorrencia, "Casa"),
        cruzar_moradas(df_radar, df_concorrencia, "Apartamento"),
    ]
    partes = [p for p in partes if not p.empty]
    if not partes:
        return pd.DataFrame()
    return pd.concat(partes, ignore_index=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--radar-leman", required=True)
    ap.add_argument("--terrenos", required=True)
    ap.add_argument("--concorrencia", required=True)
    ap.add_argument("--saida", default="candidatos_cruzamento.csv")
    args = ap.parse_args()

    resultado = executar(args.radar_leman, args.terrenos, args.concorrencia)
    resultado.to_csv(args.saida, index=False)
    print(f"{len(resultado)} candidato(s) de cruzamento gravado(s) em {args.saida}")
    if not resultado.empty:
        print(resultado["tipo_cruzamento"].value_counts())


if __name__ == "__main__":
    main()
