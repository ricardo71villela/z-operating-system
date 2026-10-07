"""
Lojas França (Z Fashion) — utilitários comuns.

- Cliente REST do Supabase (PostgREST) com a chave secreta do servidor
  (segredo ZFIND_SUPABASE_SERVICE_KEY, o mesmo da ingestão das agências do
  Z Find). Substitui a ligação Postgres direta (SUPABASE_DB_URL), que nunca
  chegou a funcionar no GitHub Actions.
- Pedidos HTTP com um User-Agent identificável.
"""

import os
import time
from datetime import datetime, timezone

import requests

SUPABASE_URL = os.environ.get("ZFIND_SUPABASE_URL", "https://dcdggqyazdddrfuzwavw.supabase.co").rstrip("/")
TABLE = "lojas"
USER_AGENT = "ZFashionShopDirectory/1.0 (+https://zfashion.online; hello@zfind.online)"

# Colunas que a ingestão SIRENE escreve. Nunca envia as colunas de contacto
# (telefone/email/website) nem as de outreach, para não as apagar.
REGISTRY_COLUMNS = [
    "siret", "siren", "nome", "nome_comercial", "codigo_naf", "setor", "morada",
    "codigo_postal", "cidade", "latitude", "longitude", "ativo", "data_criacao_empresa",
    "data_ultima_atualizacao",
]


def now_iso():
    """Data/hora UTC sem '+' (segura numa query PostgREST)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def http_get(url, **kw):
    headers = kw.pop("headers", {})
    headers.setdefault("User-Agent", USER_AGENT)
    return requests.get(url, headers=headers, timeout=kw.pop("timeout", 30), **kw)


def http_post(url, **kw):
    headers = kw.pop("headers", {})
    headers.setdefault("User-Agent", USER_AGENT)
    return requests.post(url, headers=headers, timeout=kw.pop("timeout", 30), **kw)


class Supabase:
    def __init__(self, key=None, url=SUPABASE_URL):
        self.key = (key or os.environ.get("ZFIND_SUPABASE_SERVICE_KEY", "")).strip()
        if not self.key:
            raise SystemExit("ZFIND_SUPABASE_SERVICE_KEY em falta (segredo do GitHub).")
        self.url = url
        self.session = requests.Session()
        headers = {"apikey": self.key, "Content-Type": "application/json"}
        if self.key.startswith("eyJ"):  # chave JWT antiga
            headers["Authorization"] = f"Bearer {self.key}"
        self.session.headers.update(headers)

    def _request(self, method, path, **kw):
        for attempt in range(5):
            r = self.session.request(method, f"{self.url}/rest/v1/{path}", timeout=60, **kw)
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(2 * (attempt + 1))
                continue
            if r.status_code >= 400:
                raise RuntimeError(f"Supabase {method} {path[:80]} -> {r.status_code}: {r.text[:300]}")
            return r
        raise RuntimeError(f"Supabase {method} {path[:80]}: demasiadas tentativas")

    def upsert(self, rows, columns=REGISTRY_COLUMNS, batch=500):
        """Insere ou atualiza por SIRET, escrevendo só `columns`."""
        written = 0
        for i in range(0, len(rows), batch):
            chunk = [{c: row.get(c) for c in columns} for row in rows[i:i + batch]]
            self._request("POST", f"{TABLE}?on_conflict=siret&columns={','.join(columns)}",
                          json=chunk, headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
            written += len(chunk)
        return written

    def select(self, query, limit=1000):
        return self._request("GET", f"{TABLE}?{query}&limit={limit}").json()

    def patch(self, query, values):
        self._request("PATCH", f"{TABLE}?{query}", json=values, headers={"Prefer": "return=minimal"})
