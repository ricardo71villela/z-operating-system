"""
Ingestão de lojas em França a partir da API pública recherche-entreprises.api.gouv.fr
(dados oficiais SIRENE/INSEE, sem necessidade de API key).

Cobre os setores: roupa, calçado, marroquinaria, desporto, cosmética e perfumes.
"""

import os
import time
import requests
from datetime import date

# --- Mapeamento de códigos NAF/APE para os setores pretendidos ---
# Referência: https://www.insee.fr/fr/information/2406147 (nomenclature NAF rév. 2)
CODIGOS_NAF = {
    "47.71Z": "roupa",              # Commerce de détail d'habillement
    "47.72A": "calcado",            # Commerce de détail de la chaussure
    "47.72B": "marroquinaria",      # Commerce de détail de maroquinerie et d'articles de voyage
    "47.64Z": "desporto",           # Commerce de détail d'articles de sport
    "47.75Z": "cosmetica_perfumes", # Commerce de détail de parfumerie et de produits de beauté
}

BASE_URL = "https://recherche-entreprises.api.gouv.fr/search"
PER_PAGE = 25  # limite da API por página


def fetch_por_codigo_naf(codigo_naf: str, setor: str, max_paginas: int = 500):
    """
    Percorre todas as páginas de resultados para um dado código NAF.
    A API pagina os resultados; paramos quando não há mais 'results'.
    Lida com erros 429 (rate limit) com espera e nova tentativa.
    """
    resultados = []
    pagina = 1

    while pagina <= max_paginas:
        params = {
            "activite_principale": codigo_naf,
            "etat_administratif": "A",  # apenas empresas ativas
            "page": pagina,
            "per_page": PER_PAGE,
        }

        # Nova tentativa com espera crescente em caso de 429
        max_tentativas = 5
        for tentativa in range(1, max_tentativas + 1):
            resp = requests.get(BASE_URL, params=params, timeout=30)
            if resp.status_code == 429:
                espera = min(60, 5 * tentativa)  # 5s, 10s, 15s... até 60s
                print(f"  [{setor}] página {pagina}: 429 recebido, a esperar {espera}s (tentativa {tentativa}/{max_tentativas})")
                time.sleep(espera)
                continue
            resp.raise_for_status()
            break
        else:
            # Esgotámos as tentativas — desistir deste código NAF e continuar para o seguinte
            print(f"  [{setor}] Demasiados 429 consecutivos — a saltar para o próximo setor.")
            break

        data = resp.json()

        empresas = data.get("results", [])
        if not empresas:
            break

        for empresa in empresas:
            # A API devolve a empresa (SIREN) com uma lista de estabelecimentos (SIRET)
            siege = empresa.get("siege", {})
            resultados.append({
                "siret": siege.get("siret"),
                "siren": empresa.get("siren"),
                "nome": empresa.get("nom_complet") or empresa.get("nom_raison_sociale"),
                "nome_comercial": siege.get("enseigne_1") or None,
                "codigo_naf": codigo_naf,
                "setor": setor,
                "morada": siege.get("adresse"),
                "codigo_postal": siege.get("code_postal"),
                "cidade": siege.get("libelle_commune"),
                "latitude": siege.get("latitude"),
                "longitude": siege.get("longitude"),
                "ativo": True,
                "data_criacao_empresa": empresa.get("date_creation"),
            })

        total_pages = data.get("total_pages", 1)
        print(f"  [{setor}] página {pagina}/{total_pages} — {len(empresas)} resultados")

        if pagina >= total_pages:
            break

        pagina += 1
        time.sleep(1.0)  # pausa de cortesia aumentada, para evitar 429 em volumes grandes

    return resultados


def main():
    import csv
    output_path = f"sirene_lojas_{date.today().isoformat()}.csv"
    fieldnames = ["siret", "siren", "nome", "nome_comercial", "codigo_naf", "setor",
                  "morada", "codigo_postal", "cidade", "latitude", "longitude",
                  "ativo", "data_criacao_empresa"]

    total_geral = 0
    ficheiro_iniciado = False

    for codigo_naf, setor in CODIGOS_NAF.items():
        print(f"A obter dados para NAF {codigo_naf} ({setor})...")
        resultados = fetch_por_codigo_naf(codigo_naf, setor)
        print(f"  -> {len(resultados)} lojas encontradas")

        if resultados:
            # Escreve logo a seguir a cada setor, para não perder progresso se outro setor falhar depois
            modo = "a" if ficheiro_iniciado else "w"
            with open(output_path, modo, newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                if not ficheiro_iniciado:
                    writer.writeheader()
                    ficheiro_iniciado = True
                writer.writerows(resultados)

        total_geral += len(resultados)

    print(f"\nTotal geral: {total_geral} lojas")
    if ficheiro_iniciado:
        print(f"Guardado em {output_path}")
    else:
        print("Nenhum resultado obtido — CSV não foi criado.")


if __name__ == "__main__":
    main()
