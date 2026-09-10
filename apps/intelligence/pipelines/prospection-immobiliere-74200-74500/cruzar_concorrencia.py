"""Cruza os imóveis ativos da concorrência (exportados pelo scraper) com a
base de moradas do Radar Léman (BAN + DVF + cadastro), para descobrir a
morada provável de cada anúncio — usando só a área (habitável e/ou de
terreno), nunca a morada em si (que os anúncios normalmente não publicam).

⚠️ Uso interno — o resultado deste script (morada provável + preço pedido +
agência) fica só no ambiente do Radar Léman. Nunca escrever de volta no
Supabase do scraper.

Uso:
    python cruzar_concorrencia.py --concorrencia concorrencia_ativa.csv \
        --candidatos output/mailing_complet.csv \
        --output output/concorrencia_identificada.csv
"""
import argparse

import pandas as pd

# Mapeamento tipo_imovel (scraper, PT) -> type_bien (Radar Léman, FR/DVF)
TIPO_MAP = {
    "Apartamento": "Appartement",
    "Casa": "Maison",
    "Comercial": "Local industriel. commercial ou assimilé",
    # "Terreno" e "Imóvel" não têm correspondência direta e fiável em
    # type_bien — ficam de fora do cruzamento por tipo (só por área/cidade).
}

# cidade do scraper (Thonon/Evian, nível largo) -> nom_commune_ref exato do
# Radar Léman. O scraper só cobre as duas cidades principais, por isso o
# mapeamento é direto.
CIDADE_MAP = {
    "thonon": "Thonon-les-Bains",
    "evian": "Évian-les-Bains",
}

MARGEM = 0.05  # ±5%


def dentro_da_margem(valor: float, alvo: float, margem: float = MARGEM) -> bool:
    if pd.isna(valor) or pd.isna(alvo) or alvo == 0:
        return False
    return abs(valor - alvo) / alvo <= margem


def cruzar(concorrencia: pd.DataFrame, candidatos: pd.DataFrame) -> pd.DataFrame:
    resultados = []

    for _, imovel in concorrencia.iterrows():
        cidade_norm = str(imovel.get("cidade", "")).strip().lower()
        commune_alvo = CIDADE_MAP.get(cidade_norm)
        if not commune_alvo:
            continue  # cidade fora do âmbito conhecido — ignora

        candidatos_cidade = candidatos[candidatos["nom_commune_ref"] == commune_alvo]

        tipo_bien_alvo = TIPO_MAP.get(imovel.get("tipo_imovel"))
        if tipo_bien_alvo:
            candidatos_cidade = candidatos_cidade[candidatos_cidade["type_bien"] == tipo_bien_alvo]

        superficie = imovel.get("superficie_m2")
        superficie_terreno = imovel.get("superficie_terreno_m2")

        matches = []
        for _, cand in candidatos_cidade.iterrows():
            tem_habitavel = pd.notna(superficie) and pd.notna(cand.get("surface_m2"))
            tem_terreno = pd.notna(superficie_terreno) and pd.notna(cand.get("surface_terrain_m2"))

            ok_habitavel = tem_habitavel and dentro_da_margem(superficie, cand["surface_m2"])
            ok_terreno = tem_terreno and dentro_da_margem(superficie_terreno, cand["surface_terrain_m2"])

            if tem_habitavel and tem_terreno:
                # As duas áreas conhecidas de ambos os lados: exige as DUAS
                # a bater — é isto que torna o cruzamento discriminante.
                # Só uma das duas dá dezenas de falsos candidatos numa
                # cidade com milhares de casas parecidas.
                bate = ok_habitavel and ok_terreno
            elif tem_habitavel:
                bate = ok_habitavel
            elif tem_terreno:
                bate = ok_terreno
            else:
                bate = False  # nenhuma área para comparar — não há como cruzar

            if bate:
                matches.append(cand)

        n_antes_desempate = len(matches)

        # Desempate: quando sobra mais do que 1 candidato depois do filtro
        # de área, usa nº de divisões e ano de construção (quando
        # conhecidos dos dois lados) para tentar reduzir ainda mais —
        # nunca elimina candidatos só por isto, só reordena por relevância.
        if len(matches) > 1:
            def pontuacao(cand):
                pontos = 0
                if pd.notna(imovel.get("num_divisoes")) and pd.notna(cand.get("nb_pieces")):
                    if int(imovel["num_divisoes"]) == int(cand["nb_pieces"]):
                        pontos += 1
                if pd.notna(imovel.get("ano_construcao")) and pd.notna(cand.get("annee_construction")):
                    if abs(int(imovel["ano_construcao"]) - int(cand["annee_construction"])) <= 2:
                        pontos += 1
                return pontos

            matches.sort(key=pontuacao, reverse=True)
            melhor_pontuacao = pontuacao(matches[0])
            if melhor_pontuacao > 0:
                empatados = [m for m in matches if pontuacao(m) == melhor_pontuacao]
                if len(empatados) == 1:
                    matches = empatados

        if not matches:
            confianca = "sem_correspondencia"
            morada = None
        elif len(matches) == 1:
            confianca = "unico" if n_antes_desempate == 1 else "unico_apos_desempate"
            morada = matches[0]["adresse_complete"]
        else:
            confianca = "multiplo"
            morada = " | ".join(m["adresse_complete"] for m in matches[:5])

        resultados.append({
            "agencia": imovel.get("agencia_nome"),
            "cidade": imovel.get("cidade"),
            "tipo_imovel": imovel.get("tipo_imovel"),
            "superficie_m2": superficie,
            "superficie_terreno_m2": superficie_terreno,
            "preco": imovel.get("preco"),
            "url_anuncio": imovel.get("url_anuncio"),
            "confianca_morada": confianca,
            "morada_provavel": morada,
            "num_candidatos": len(matches),
        })

    return pd.DataFrame(resultados)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--concorrencia", default="concorrencia_ativa.csv")
    parser.add_argument("--candidatos", default="output/mailing_complet.csv")
    parser.add_argument("--output", default="output/concorrencia_identificada.csv")
    args = parser.parse_args()

    concorrencia = pd.read_csv(args.concorrencia)
    candidatos = pd.read_csv(args.candidatos, low_memory=False)

    resultado = cruzar(concorrencia, candidatos)
    resultado.to_csv(args.output, index=False)

    print(f"Total de imóveis da concorrência processados: {len(resultado)}")
    print(resultado["confianca_morada"].value_counts().to_string())
    print(f"\nResultado gravado em: {args.output}")
