"""
Enriquecimento gratuito de contactos (telefone, email, website) para as lojas
já presentes na tabela `lojas` do Supabase.

Estratégia em cascata, sem custos:
    1. OpenStreetMap Overpass API — pesquisa por nome + proximidade geográfica,
       extrai phone/website/email das tags OSM.
    2. Scraping do website (quando o passo 1 deu website mas não deu email) —
       visita a página e procura padrões de email.

Requer:
    SUPABASE_DB_URL  -> connection string do Postgres
"""

import os
import re
import sys
import time
import requests
import psycopg2
from psycopg2.extras import RealDictCursor

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")

HEADERS = {
    "User-Agent": "lojas-franca-ingest/1.0 (enriquecimento para marketplace; uso nao comercial de dados publicos)"
}


def obter_lojas_por_enriquecer(conn, limite=200):
    """
    Vai buscar lojas que ainda não têm telefone/email/website preenchidos,
    com coordenadas válidas (necessárias para a pesquisa Overpass por proximidade).
    """
    query = """
        select id, nome, morada, codigo_postal, cidade, latitude, longitude
        from lojas
        where (telefone is null or website is null or email is null)
          and latitude is not null
          and longitude is not null
          and fonte_enriquecimento is null
        limit %s;
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, (limite,))
        return cur.fetchall()


def pesquisar_osm(nome, latitude, longitude, raio_metros=150):
    """
    Pesquisa no Overpass API por um 'shop'/'amenity' com nome semelhante,
    dentro de um raio à volta das coordenadas da loja.
    """
    # Escapar aspas no nome para não partir a query Overpass
    nome_escapado = nome.replace('"', '\\"')

    overpass_query = f"""
    [out:json][timeout:25];
    (
      node["shop"]["name"~"{nome_escapado}",i](around:{raio_metros},{latitude},{longitude});
      way["shop"]["name"~"{nome_escapado}",i](around:{raio_metros},{latitude},{longitude});
    );
    out tags 3;
    """

    try:
        resp = requests.post(OVERPASS_URL, data={"data": overpass_query}, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError):
        return None

    elementos = data.get("elements", [])
    if not elementos:
        return None

    tags = elementos[0].get("tags", {})
    return {
        "telefone": tags.get("phone") or tags.get("contact:phone"),
        "website": tags.get("website") or tags.get("contact:website"),
        "email": tags.get("email") or tags.get("contact:email"),
    }


def extrair_email_do_website(url, timeout=10):
    """
    Visita a página inicial do website e tenta extrair um email de contacto.
    Tentativa simples — não segue links para páginas de "contacto" (podia ser
    uma iteração futura).
    """
    if not url:
        return None
    if not url.startswith("http"):
        url = "https://" + url

    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException:
        return None

    matches = EMAIL_REGEX.findall(resp.text)
    # Filtrar emails genéricos de imagens/scripts (ex. sentry.io, .png@2x, etc.)
    candidatos = [m for m in matches if not any(x in m.lower() for x in ["sentry", "wixpress", "example.com", ".png", ".jpg"])]
    return candidatos[0] if candidatos else None


def atualizar_loja(conn, loja_id, dados, fonte):
    campos = []
    valores = []
    for campo in ("telefone", "website", "email"):
        if dados.get(campo):
            campos.append(f"{campo} = %s")
            valores.append(dados[campo])

    if not campos:
        # Nada encontrado — marcar como tentado para não voltar a processar sempre
        query = "update lojas set fonte_enriquecimento = %s, data_ultima_atualizacao = now() where id = %s"
        with conn.cursor() as cur:
            cur.execute(query, ("sem_resultado", loja_id))
        return

    campos.append("fonte_enriquecimento = %s")
    valores.append(fonte)
    campos.append("data_ultima_atualizacao = now()")
    valores.append(loja_id)

    query = f"update lojas set {', '.join(campos)} where id = %s"
    with conn.cursor() as cur:
        cur.execute(query, valores)


def main():
    connection_string = os.environ.get("SUPABASE_DB_URL")
    if not connection_string:
        print("Erro: variável de ambiente SUPABASE_DB_URL não definida.")
        sys.exit(1)

    conn = psycopg2.connect(connection_string)
    conn.autocommit = False

    try:
        lojas = obter_lojas_por_enriquecer(conn, limite=200)
        print(f"{len(lojas)} lojas para enriquecer nesta execução.")

        for loja in lojas:
            dados_osm = pesquisar_osm(loja["nome"], loja["latitude"], loja["longitude"])
            fonte = None

            if dados_osm and any(dados_osm.values()):
                fonte = "openstreetmap"
                # Se OSM deu website mas não deu email, tentar extrair do próprio site
                if dados_osm.get("website") and not dados_osm.get("email"):
                    email_extraido = extrair_email_do_website(dados_osm["website"])
                    if email_extraido:
                        dados_osm["email"] = email_extraido
                        fonte = "openstreetmap+scraping"
                atualizar_loja(conn, loja["id"], dados_osm, fonte)
                print(f"  [OK] {loja['nome']} — fonte: {fonte}")
            else:
                atualizar_loja(conn, loja["id"], {}, None)
                print(f"  [--] {loja['nome']} — sem resultado")

            conn.commit()
            time.sleep(1.1)  # cortesia com o Overpass API (rate limit público)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
