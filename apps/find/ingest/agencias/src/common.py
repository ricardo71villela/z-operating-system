"""
Z Find — ingestão das agências imobiliárias (FR / BE / LU): utilitários comuns.

- Cliente REST do Supabase (PostgREST) com a chave secreta do servidor.
- Classificação por tipo (agency / network_agency / network_hq / independent)
  e deteção da rede (Orpi, Century 21, IAD, Safti...).
- Normalização de telefones, e-mails e sites.
"""

import os
import re
import time
import unicodedata
from datetime import datetime, timezone

import requests

SUPABASE_URL = os.environ.get("ZFIND_SUPABASE_URL", "https://dcdggqyazdddrfuzwavw.supabase.co").rstrip("/")
TABLE = "zfind_agencias"
USER_AGENT = "ZFindAgencyDirectory/1.0 (+https://zfind.online; hello@zfind.online)"

# Colunas que cada fonte escreve. A ingestão nunca envia as colunas de
# enriquecimento (email/phone/website vindos do site), para não as apagar.
REGISTRY_COLUMNS = [
    "country", "source", "source_id", "company_id", "name", "trade_name", "type", "network",
    "is_natural_person", "legal_form", "activity_code", "is_head_office", "address", "postcode",
    "city", "commune_code", "latitude", "longitude", "registry_created", "last_seen_at", "active", "updated_at",
]
CONTACT_COLUMNS = ["phone", "phone_source", "email", "email_source", "website", "website_source"]


def now_iso():
    """Data/hora UTC sem '+' (segura numa query PostgREST)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --------------------------------------------------------------------- networks

# (rede, expressão regular sobre o nome/enseigne normalizado, é rede de mandatários)
NETWORKS = [
    ("iad", r"\biad\b|\bi d france\b", True),
    ("safti", r"\bsafti\b", True),
    ("capifrance", r"\bcapi ?france\b", True),
    ("optimhome", r"\boptimhome\b", True),
    ("megagence", r"\bmegagence\b", True),
    ("proprietes-privees", r"\bproprietes[ -]privees\b", True),
    ("bsk", r"\bbsk immobilier\b", True),
    ("efficity", r"\befficity\b", True),
    ("expertimo", r"\bexpertimo\b", True),
    ("sextant", r"\bsextant\b", True),
    ("dr-house", r"\bdr\.? ?house\b", True),
    ("orpi", r"\borpi\b", False),
    ("century-21", r"\bcentury ?21\b", False),
    ("laforet", r"\blaforet\b", False),
    ("guy-hoquet", r"\bguy hoquet\b", False),
    ("era", r"\bera (immobilier|france|belgium|belgique|luxembourg)\b|^era\b", False),
    ("stephane-plaza", r"\bstephane plaza\b", False),
    ("nestenn", r"\bnestenn\b", False),
    ("square-habitat", r"\bsquare habitat\b", False),
    ("citya", r"\bcitya\b", False),
    ("foncia", r"\bfoncia\b", False),
    ("nexity", r"\bnexity\b", False),
    ("arthurimmo", r"\barthurimmo\b", False),
    ("l-adresse", r"\bl ?adresse\b", False),
    ("cimm", r"\bcimm immobilier\b", False),
    ("barnes", r"\bbarnes\b", False),
    ("sothebys", r"\bsotheby", False),
    ("engel-volkers", r"\bengel ?(&|et|und)? ?volkers\b", False),
    ("coldwell-banker", r"\bcoldwell banker\b", False),
    ("john-taylor", r"\bjohn taylor\b", False),
    ("remax", r"\bre ?/? ?max\b", False),
    ("keller-williams", r"\bkeller williams\b", False),
    ("trevi", r"\btrevi\b", False),
    ("dewaele", r"\bdewaele\b", False),
    ("immoweb", r"$^", False),  # nunca: é um portal, não uma agência
]
_NETWORK_RE = [(key, re.compile(rx), mandataire) for key, rx, mandataire in NETWORKS]


def normalise(text):
    """Minúsculas, sem acentos nem pontuação (para comparar nomes)."""
    if not text:
        return ""
    t = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode("ascii").lower()
    t = re.sub(r"[^a-z0-9&]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def detect_network(*names):
    for name in names:
        n = normalise(name)
        if not n:
            continue
        for key, rx, mandataire in _NETWORK_RE:
            if rx.search(n):
                return key, mandataire
    return None, False


def classify(name, trade_name=None, is_natural_person=False, is_head_office=None, is_large=False):
    """
    Devolve (type, network).
      independent    — pessoa singular (mandatário ou agente independente)
      network_hq     — sede de uma rede: a rede está no nome legal, é a sede e a
                       empresa é grande (ETI/GE ou 10+ estabelecimentos)
      network_agency — agência sob insígnia de uma rede (franquia, filial)
      agency         — agência independente (pessoa coletiva)
    """
    network, _ = detect_network(trade_name, name)
    if is_natural_person:
        return "independent", network
    if network:
        in_legal_name = detect_network(name)[0] == network
        if in_legal_name and is_head_office and is_large:
            return "network_hq", network
        return "network_agency", network
    return "agency", None


# --------------------------------------------------------------------- contacts

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}")
_BAD_EMAIL = re.compile(
    r"(\.(png|jpe?g|gif|svg|webp|css|js)$)|(@(example|sentry|wixpress|domain|email)\.)|(^(noreply|no-reply|nepasrepondre|ne-pas-repondre)@)",
    re.I,
)


def clean_email(value):
    if not value:
        return None
    m = EMAIL_RE.search(str(value).strip())
    if not m:
        return None
    email = m.group(0).strip(".").lower()
    if _BAD_EMAIL.search(email):
        return None
    return email


def clean_phone(value, country):
    if not value:
        return None
    digits = re.sub(r"[^\d+]", "", str(value))
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    prefix = {"FR": "+33", "BE": "+32", "LU": "+352"}.get(country)
    if not digits.startswith("+") and prefix:
        digits = prefix + (digits[1:] if digits.startswith("0") and country in ("FR", "BE") else digits)
    return digits if 8 <= len(digits.lstrip("+")) <= 15 else None


def clean_website(value):
    if not value:
        return None
    url = str(value).strip()
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url.lstrip("/")
    return url if re.match(r"^https?://[A-Za-z0-9.-]+\.[A-Za-z]{2,}", url) else None


def pick_email(emails, website=None):
    """Prefere um e-mail do domínio do site; depois contact@/info@/agence@."""
    emails = [e for e in (clean_email(x) for x in emails) if e]
    if not emails:
        return None
    domain = None
    if website:
        m = re.match(r"^https?://(?:www\.)?([^/:]+)", website, re.I)
        domain = m.group(1).lower() if m else None
    def score(e):
        s = 0
        if domain and e.endswith("@" + domain):
            s += 10
        if re.match(r"^(contact|info|agence|accueil|bonjour|hello|immo|transaction|vente)", e):
            s += 3
        return -s
    return sorted(dict.fromkeys(emails), key=score)[0]


# --------------------------------------------------------------------- Supabase

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

    def upsert(self, rows, columns, batch=500):
        """Insere ou atualiza por (source, source_id), escrevendo só `columns`."""
        written = 0
        for i in range(0, len(rows), batch):
            chunk = [{c: row.get(c) for c in columns} for row in rows[i:i + batch]]
            self._request("POST", f"{TABLE}?on_conflict=source,source_id&columns={','.join(columns)}",
                          json=chunk, headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
            written += len(chunk)
        return written

    def upsert_contacts(self, rows):
        """
        Escreve os contactos vindos do registo/OSM sem nunca apagar um contacto
        já conhecido: cada lote só leva as colunas de contacto que tem preenchidas.
        """
        groups = {}
        for row in rows:
            present = tuple(c for c in CONTACT_COLUMNS if row.get(c))
            if present:
                groups.setdefault(present, []).append(row)
        written = 0
        for present, group in groups.items():
            written += self.upsert(group, ["source", "source_id", "country", "name", "type"] + list(present))
        return written

    def select(self, query, page=1000, max_rows=None):
        out, offset = [], 0
        while True:
            size = page if max_rows is None else min(page, max_rows - len(out))
            if size <= 0:
                return out
            r = self._request("GET", f"{TABLE}?{query}&limit={size}&offset={offset}")
            data = r.json()
            out.extend(data)
            if len(data) < size:
                return out
            offset += size

    def patch(self, query, values):
        self._request("PATCH", f"{TABLE}?{query}", json=values, headers={"Prefer": "return=minimal"})


def http_get(url, **kw):
    headers = kw.pop("headers", {})
    headers.setdefault("User-Agent", USER_AGENT)
    return requests.get(url, headers=headers, timeout=kw.pop("timeout", 30), **kw)
