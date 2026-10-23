"""
Z Jobs — base dos empregadores a prospetar: utilitários comuns.

- Cliente REST do Supabase (PostgREST) com a chave secreta do servidor.
- Departamento a partir do código de comuna INSEE.
- Data/hora UTC para as marcas de passagem.
"""

import os
import time
from datetime import datetime, timezone

import requests

SUPABASE_URL = os.environ.get("ZJOBS_SUPABASE_URL", "https://dcdggqyazdddrfuzwavw.supabase.co").rstrip("/")
TABLE = "zjobs_empresas"
USER_AGENT = "ZJobsEmployerDirectory/1.0 (+https://z-jobs-two.vercel.app)"

# Colunas que a ingestão do registo escreve. Nunca envia as colunas de
# contacto (e-mail, telefone, site), para não apagar um enriquecimento.
REGISTRY_COLUMNS = [
    "country", "source", "source_id", "name", "trade_name", "legal_form", "naf_code", "naf_section",
    "employee_band", "employee_band_year", "company_category", "establishments_open", "is_association",
    "is_ess", "head_office_siret", "address", "postcode", "city", "commune_code", "department",
    "latitude", "longitude", "registry_created", "last_seen_at", "active", "updated_at",
]


def now_iso():
    """Data/hora UTC sem '+' (segura numa query PostgREST)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def department_from_commune(code):
    """Departamento francês a partir do código de comuna INSEE (5 caracteres).
    Ultramar: 3 algarismos (971…976). Córsega: 2A / 2B."""
    code = (code or "").strip().upper()
    if len(code) < 2:
        return None
    if code.startswith("97") or code.startswith("98"):
        return code[:3] if len(code) >= 3 else None
    return code[:2]


class Supabase:
    def __init__(self, key=None, url=SUPABASE_URL, table=TABLE):
        self.key = (key or os.environ.get("ZJOBS_SUPABASE_SERVICE_KEY", "")).strip()
        if not self.key:
            raise SystemExit("ZJOBS_SUPABASE_SERVICE_KEY em falta (segredo do GitHub).")
        self.url = url
        self.table = table
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

    def upsert(self, rows, columns, batch=500):
        """Insere ou atualiza por (source, source_id), escrevendo só `columns`."""
        written = 0
        for i in range(0, len(rows), batch):
            chunk = [{c: row.get(c) for c in columns} for row in rows[i:i + batch]]
            self._request("POST", f"{self.table}?on_conflict=source,source_id&columns={','.join(columns)}",
                          json=chunk, headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
            written += len(chunk)
        return written

    def patch(self, query, values):
        self._request("PATCH", f"{self.table}?{query}", json=values, headers={"Prefer": "return=minimal"})


def http_get(url, **kw):
    headers = kw.pop("headers", {})
    headers.setdefault("User-Agent", USER_AGENT)
    return requests.get(url, headers=headers, timeout=kw.pop("timeout", 30), **kw)
