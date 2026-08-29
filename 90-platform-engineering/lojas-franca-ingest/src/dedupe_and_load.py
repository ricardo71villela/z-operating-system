"""
Lê o CSV gerado por fetch_sirene.py, remove duplicados e insere/atualiza (upsert)
os dados na tabela `lojas` do Supabase (Postgres), usando o SIRET como chave única.

Requer a variável de ambiente:
    SUPABASE_DB_URL  -> connection string do Postgres (Project Settings > Database > Connection string > URI)
                         formato: postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
"""

import os
import sys
import csv
import glob
import psycopg2
from psycopg2.extras import execute_values


def encontrar_csv_mais_recente():
    """Procura o CSV mais recente gerado pelo fetch_sirene.py no diretório atual."""
    candidatos = sorted(glob.glob("sirene_lojas_*.csv"), reverse=True)
    if not candidatos:
        print("Nenhum ficheiro sirene_lojas_*.csv encontrado. Corre fetch_sirene.py primeiro.")
        sys.exit(1)
    return candidatos[0]


def ler_e_deduplicar(caminho_csv):
    """
    Lê o CSV e remove duplicados por SIRET (mantém a última ocorrência).
    Linhas sem SIRET são ignoradas (não temos chave única para upsert).
    """
    linhas_por_siret = {}
    total_lido = 0

    with open(caminho_csv, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for linha in reader:
            total_lido += 1
            siret = linha.get("siret")
            if not siret:
                continue
            linhas_por_siret[siret] = linha

    print(f"Linhas lidas: {total_lido}")
    print(f"Linhas únicas por SIRET: {len(linhas_por_siret)}")
    return list(linhas_por_siret.values())


def upsert_lojas(linhas, connection_string):
    """
    Insere as linhas na tabela `lojas`, atualizando os campos relevantes
    se o SIRET já existir (ON CONFLICT).
    """
    if not linhas:
        print("Nada para carregar.")
        return

    colunas = [
        "siret", "siren", "nome", "nome_comercial", "codigo_naf", "setor",
        "morada", "codigo_postal", "cidade", "latitude", "longitude",
        "ativo", "data_criacao_empresa",
    ]

    valores = []
    for linha in linhas:
        valores.append(tuple(
            (linha.get(col) or None) for col in colunas
        ))

    query = f"""
        INSERT INTO lojas ({", ".join(colunas)})
        VALUES %s
        ON CONFLICT (siret) DO UPDATE SET
            nome = EXCLUDED.nome,
            nome_comercial = EXCLUDED.nome_comercial,
            codigo_naf = EXCLUDED.codigo_naf,
            setor = EXCLUDED.setor,
            morada = EXCLUDED.morada,
            codigo_postal = EXCLUDED.codigo_postal,
            cidade = EXCLUDED.cidade,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            ativo = EXCLUDED.ativo,
            data_ultima_atualizacao = now();
    """

    conn = psycopg2.connect(connection_string)
    try:
        with conn.cursor() as cur:
            execute_values(cur, query, valores, page_size=500)
        conn.commit()
        print(f"Upsert concluído: {len(valores)} linhas processadas.")
    finally:
        conn.close()


def main():
    connection_string = os.environ.get("SUPABASE_DB_URL")
    if not connection_string:
        print("Erro: variável de ambiente SUPABASE_DB_URL não definida.")
        sys.exit(1)

    caminho_csv = encontrar_csv_mais_recente()
    print(f"A processar: {caminho_csv}")

    linhas = ler_e_deduplicar(caminho_csv)
    upsert_lojas(linhas, connection_string)


if __name__ == "__main__":
    main()
