"""
Sonda da API La Bonne Boîte v2 (France Travail): obtém um token e testa os
endereços prováveis, mostrando só o estado HTTP e a estrutura da resposta
(chaves e o primeiro registo). Serve para confirmar o formato antes de
ligar a API às empresas do Z Jobs. Não escreve nada na base.
"""

import json
import os
import sys

import requests

CID = os.environ.get("FRANCE_TRAVAIL_CLIENT_ID", "").strip()
SECRET = os.environ.get("FRANCE_TRAVAIL_CLIENT_SECRET", "").strip()
TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire"
BASE = "https://api.francetravail.io/partenaire/labonneboite/v2"


def token(scope):
    r = requests.post(TOKEN_URL, data={"grant_type": "client_credentials", "client_id": CID, "client_secret": SECRET, "scope": scope}, timeout=30)
    print(f"token scope={scope!r}: HTTP {r.status_code} {r.text[:160] if r.status_code != 200 else ''}")
    return r.json().get("access_token") if r.status_code == 200 else None


def shape(value, depth=0):
    if isinstance(value, dict):
        return {k: shape(v, depth + 1) for k, v in list(value.items())[:40]}
    if isinstance(value, list):
        return [shape(value[0], depth + 1), f"... {len(value)} itens"] if value else []
    return type(value).__name__ + (f" = {str(value)[:60]}" if depth <= 3 else "")


def main():
    if not CID or not SECRET:
        sys.exit("FRANCE_TRAVAIL_CLIENT_ID / FRANCE_TRAVAIL_CLIENT_SECRET em falta.")
    tok = None
    for scope in ("api_labonneboitev2 search office", "api_labonneboitev2", f"application_{CID} api_labonneboitev2"):
        tok = token(scope)
        if tok:
            break
    if not tok:
        sys.exit("Nenhum scope aceite.")
    h = {"Authorization": f"Bearer {tok}", "Accept": "application/json"}
    tries = [
        ("recherche", {"rome": "M1805", "citycode": "74281"}),
        ("recherche", {"rome": "M1805", "department": "74"}),
        ("recherche", {"rome": "F1703", "departments": "69"}),
        ("recherche", {"naf": "4120A", "department": "74"}),
        ("recherche", {"rome": "M1805", "citycode": "74281", "page": 1, "page_size": 2}),
    ]
    for path, params in tries:
        r = requests.get(f"{BASE}/{path}", params=params, headers=h, timeout=30)
        print(f"\nGET /{path} {params}: HTTP {r.status_code}")
        try:
            data = r.json()
            print(json.dumps(shape(data), ensure_ascii=False, indent=1)[:3000])
        except ValueError:
            print(r.text[:400])


if __name__ == "__main__":
    main()
