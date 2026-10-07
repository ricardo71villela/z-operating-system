"""
Enriquecimento gratuito de contactos (telefone, e-mail, site) das lojas já
presentes na tabela `lojas` do Supabase.

Estratégia em cascata, sem custos:
    1. OpenStreetMap (Overpass API): loja com nome semelhante a menos de 150 m
       das coordenadas SIRENE; lê phone / website / email das tags.
    2. Site da loja (quando o passo 1 deu um site sem e-mail): procura um
       e-mail na página inicial.

Cada loja é tentada uma vez (fonte_enriquecimento fica preenchida, mesmo sem
resultado). Escreve pela API REST do Supabase (segredo ZFIND_SUPABASE_SERVICE_KEY).

Uso: python src/enrich_osm.py [--limit 300]
"""

import argparse
import re
import time

import requests

from common import Supabase, http_get, http_post, now_iso

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
BAD_EMAIL = ("sentry", "wixpress", "example.com", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", "noreply", "no-reply")
OVERPASS_SPECIAL = re.compile(r'([\\.^$|?*+()\[\]{}"])')


def overpass_name_pattern(nome):
    """Nome como expressão regular Overpass literal (escapa os caracteres especiais)."""
    return OVERPASS_SPECIAL.sub(r"\\\1", nome.strip())


def pesquisar_osm(nome, latitude, longitude, raio_metros=150):
    padrao = overpass_name_pattern(nome)
    if not padrao:
        return None
    query = f"""
    [out:json][timeout:25];
    (
      node["shop"]["name"~"{padrao}",i](around:{raio_metros},{latitude},{longitude});
      way["shop"]["name"~"{padrao}",i](around:{raio_metros},{latitude},{longitude});
    );
    out tags 3;
    """
    try:
        resp = http_post(OVERPASS_URL, data={"data": query}, timeout=30)
        resp.raise_for_status()
        elementos = resp.json().get("elements", [])
    except (requests.RequestException, ValueError):
        return None
    if not elementos:
        return None
    tags = elementos[0].get("tags", {})
    return {
        "telefone": tags.get("phone") or tags.get("contact:phone"),
        "website": tags.get("website") or tags.get("contact:website"),
        "email": tags.get("email") or tags.get("contact:email"),
    }


def extrair_email(html):
    for m in EMAIL_REGEX.findall(html or ""):
        if not any(x in m.lower() for x in BAD_EMAIL):
            return m.lower()
    return None


def extrair_email_do_website(url, timeout=10):
    if not url:
        return None
    if not url.startswith("http"):
        url = "https://" + url
    try:
        resp = http_get(url, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException:
        return None
    return extrair_email(resp.text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=300)
    args = ap.parse_args()
    db = Supabase()

    lojas = db.select(
        "select=id,nome,nome_comercial,latitude,longitude"
        "&ativo=is.true&fonte_enriquecimento=is.null&latitude=not.is.null&longitude=not.is.null"
        "&order=data_ingestao.asc",
        limit=args.limit,
    )
    print(f"{len(lojas)} lojas para enriquecer nesta execução.")

    encontrados = 0
    for loja in lojas:
        nome = loja.get("nome_comercial") or loja.get("nome") or ""
        dados = pesquisar_osm(nome, loja["latitude"], loja["longitude"]) or {}
        fonte = "sem_resultado"
        if any(dados.values()):
            fonte = "openstreetmap"
            if dados.get("website") and not dados.get("email"):
                email = extrair_email_do_website(dados["website"])
                if email:
                    dados["email"] = email
                    fonte = "openstreetmap+site"
            encontrados += 1
        valores = {k: v for k, v in dados.items() if v}
        valores.update({"fonte_enriquecimento": fonte, "data_ultima_atualizacao": now_iso()})
        db.patch(f"id=eq.{loja['id']}", valores)
        print(f"  [{'OK' if fonte != 'sem_resultado' else '--'}] {nome}")
        time.sleep(1.1)  # cortesia com o Overpass (limite público)

    print(f"Contactos encontrados: {encontrados}/{len(lojas)}.")


if __name__ == "__main__":
    main()
