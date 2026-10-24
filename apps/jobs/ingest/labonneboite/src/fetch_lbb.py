"""
Z Jobs — estabelecimentos com forte potencial de contratação, a partir da
API La Bonne Boîte v2 (France Travail), para escolher primeiro as empresas
que vão recrutar nos próximos meses.

Formato confirmado por uma sonda (24/10/2026):
- token: OAuth2 client_credentials, scope «api_labonneboitev2 search office»;
- GET /partenaire/labonneboite/v2/recherche com um critério de profissão
  (granddomain A–N do ROME, ou rome, naf, job) e um lugar (latitude,
  longitude, distance ≤ 200 km); page_size ≤ 100; no máximo 10 000
  resultados por pesquisa; ordenado por hiring_potential decrescente;
- cada item: siret, company_name, office_name, naf, naf_label,
  headcount_min/max, city, citycode, postcode, department_number,
  hiring_potential (0-100), is_high_potential, rome, email («yes»/«no»:
  só diz se a empresa aceita candidaturas por e-mail — o endereço nunca é
  dado).

Percorre cada departamento (centro mediano das empresas da base, raio
50 km) × cada grande domínio de profissões (A a N), página a página,
enquanto houver estabelecimentos com forte potencial. Guarda só esses, um
por SIRET, em zjobs_recrutamento. No fim de uma passagem completa, os que
deixaram de aparecer ficam active = false.

Limite da API: 2 pedidos por segundo.

Uso: python src/fetch_lbb.py [--dept 74] [--domain F] [--dry-run]
"""

import argparse
import os
import sys
import time
from datetime import datetime, timezone

import requests

TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire"
SCOPE = "api_labonneboitev2 search office"
API = "https://api.francetravail.io/partenaire/labonneboite/v2/recherche"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://dcdggqyazdddrfuzwavw.supabase.co").rstrip("/")
TABLE = "zjobs_recrutamento"
PAGE_SIZE = 100
MAX_PAGES = 100  # 10 000 resultados por pesquisa
RADIUS_KM = 50
PAUSE = 0.55     # 2 pedidos/segundo

# Grandes domínios do ROME 4.0.
DOMAINS = list("ABCDEFGHIJKLMN")

# Centro (mediana das sedes da base zjobs_empresas) de cada departamento.
CENTERS = {
    "01": (46.177, 5.229), "02": (49.612, 3.348), "03": (46.338, 3.332), "04": (43.957, 5.907), "05": (44.565, 6.104),
    "06": (43.668, 7.163), "07": (44.756, 4.646), "08": (49.741, 4.725), "09": (43.022, 1.619), "10": (48.297, 4.072),
    "11": (43.196, 2.537), "12": (44.353, 2.573), "13": (43.391, 5.379), "14": (49.183, -0.345), "15": (44.924, 2.443),
    "16": (45.674, 0.132), "17": (45.992, -1.066), "18": (47.098, 2.406), "19": (45.195, 1.563), "21": (47.309, 5.035),
    "22": (48.506, -2.764), "23": (46.177, 1.881), "24": (45.134, 0.710), "25": (47.241, 6.137), "26": (44.921, 4.908),
    "27": (49.137, 1.170), "28": (48.446, 1.465), "29": (48.389, -4.227), "2A": (41.928, 8.798), "2B": (42.591, 9.440),
    "30": (43.839, 4.344), "31": (43.597, 1.431), "32": (43.659, 0.590), "33": (44.843, -0.577), "34": (43.599, 3.862),
    "35": (48.113, -1.682), "36": (46.808, 1.694), "37": (47.379, 0.693), "38": (45.250, 5.664), "39": (46.731, 5.577),
    "40": (43.731, -1.041), "41": (47.593, 1.342), "42": (45.492, 4.326), "43": (45.147, 3.941), "44": (47.235, -1.568),
    "45": (47.906, 1.934), "46": (44.598, 1.476), "47": (44.302, 0.596), "48": (44.526, 3.482), "49": (47.436, -0.562),
    "50": (49.111, -1.397), "51": (49.218, 4.030), "52": (48.109, 5.143), "53": (48.076, -0.759), "54": (48.690, 6.171),
    "55": (48.903, 5.370), "56": (47.733, -2.918), "57": (49.118, 6.209), "58": (47.019, 3.159), "59": (50.633, 3.111),
    "60": (49.373, 2.466), "61": (48.607, 0.085), "62": (50.483, 2.598), "63": (45.777, 3.132), "64": (43.377, -1.111),
    "65": (43.217, 0.075), "66": (42.687, 2.891), "67": (48.587, 7.718), "68": (47.795, 7.335), "69": (45.761, 4.842),
    "70": (47.637, 6.164), "71": (46.649, 4.797), "72": (47.997, 0.194), "73": (45.570, 6.116), "74": (45.946, 6.294),
    "75": (48.869, 2.331), "76": (49.490, 1.046), "77": (48.824, 2.681), "78": (48.828, 2.054), "79": (46.402, -0.418),
    "80": (49.897, 2.300), "81": (43.774, 2.164), "82": (44.022, 1.333), "83": (43.192, 6.065), "84": (43.949, 4.899),
    "85": (46.708, -1.426), "86": (46.591, 0.358), "87": (45.833, 1.263), "88": (48.190, 6.588), "89": (47.850, 3.559),
    "90": (47.634, 6.859), "91": (48.664, 2.327), "92": (48.887, 2.253), "93": (48.908, 2.437), "94": (48.799, 2.428),
    "95": (49.007, 2.246), "971": (16.242, -61.560), "972": (14.614, -61.020), "973": (4.925, -52.327),
    "974": (-20.962, 55.456), "976": (-12.782, 45.204),
}

COLUMNS = [
    "siret", "siren", "company_name", "office_name", "naf", "naf_label", "headcount_min", "headcount_max",
    "city", "citycode", "postcode", "department", "hiring_potential", "is_high_potential", "roms", "domains",
    "accepts_email_applications", "last_seen_at", "active", "updated_at",
]


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def merge_item(rows, item, domain, seen_at):
    """Acrescenta um item da API a `rows` (dict por SIRET); um SIRET encontrado
    em vários domínios guarda o maior potencial e junta profissões e domínios."""
    siret = "".join(ch for ch in str(item.get("siret") or "") if ch.isdigit())
    if len(siret) != 14 or not item.get("is_high_potential"):
        return False
    rome = item.get("rome")
    row = rows.get(siret)
    if row is None:
        row = rows[siret] = {
            "siret": siret, "siren": siret[:9],
            "company_name": (item.get("company_name") or "").strip() or None,
            "office_name": (item.get("office_name") or "").strip() or None,
            "naf": item.get("naf"), "naf_label": item.get("naf_label"),
            "headcount_min": to_int(item.get("headcount_min")), "headcount_max": to_int(item.get("headcount_max")),
            "city": item.get("city"), "citycode": item.get("citycode"), "postcode": item.get("postcode"),
            "department": item.get("department_number"),
            "hiring_potential": round(float(item.get("hiring_potential") or 0), 2), "is_high_potential": True,
            "roms": [], "domains": [], "accepts_email_applications": item.get("email") == "yes",
            "last_seen_at": seen_at, "active": True, "updated_at": seen_at,
        }
    else:
        row["hiring_potential"] = max(row["hiring_potential"], round(float(item.get("hiring_potential") or 0), 2))
    if rome and rome not in row["roms"]:
        row["roms"].append(rome)
    if domain not in row["domains"]:
        row["domains"].append(domain)
    return True


def keep_paging(items, page, hits):
    """Continuar? Só enquanto a página trouxe estabelecimentos com forte potencial
    (os resultados vêm por potencial decrescente) e houver mais resultados."""
    if not items or page >= MAX_PAGES or page * PAGE_SIZE >= (hits or 0):
        return False
    return any(i.get("is_high_potential") for i in items)


class FranceTravail:
    def __init__(self, cid, secret):
        self.cid, self.secret, self.token, self.calls = cid, secret, None, 0
        self.session = requests.Session()

    def _token(self):
        r = self.session.post(TOKEN_URL, data={"grant_type": "client_credentials", "client_id": self.cid,
                                               "client_secret": self.secret, "scope": SCOPE}, timeout=30)
        if r.status_code != 200:
            raise RuntimeError(f"token France Travail: HTTP {r.status_code} {r.text[:200]}")
        self.token = r.json()["access_token"]

    def search(self, params):
        for attempt in range(8):
            if not self.token:
                self._token()
            time.sleep(PAUSE)
            self.calls += 1
            r = self.session.get(API, params=params, headers={"Authorization": f"Bearer {self.token}", "Accept": "application/json"}, timeout=40)
            if r.status_code == 401:
                self.token = None
                continue
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(min(60, 2 * (attempt + 1)))
                continue
            if r.status_code >= 400:
                raise RuntimeError(f"La Bonne Boîte {params}: HTTP {r.status_code} {r.text[:200]}")
            return r.json()
        raise RuntimeError(f"La Bonne Boîte {params}: demasiadas tentativas")


class Supabase:
    def __init__(self, key):
        self.session = requests.Session()
        headers = {"apikey": key, "Content-Type": "application/json"}
        if key.startswith("eyJ"):
            headers["Authorization"] = f"Bearer {key}"
        self.session.headers.update(headers)

    def _req(self, method, path, **kw):
        for attempt in range(5):
            r = self.session.request(method, f"{SUPABASE_URL}/rest/v1/{path}", timeout=60, **kw)
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(2 * (attempt + 1))
                continue
            if r.status_code >= 400:
                raise RuntimeError(f"Supabase {method} {path[:80]} -> {r.status_code}: {r.text[:300]}")
            return r
        raise RuntimeError("Supabase: demasiadas tentativas")

    def upsert(self, rows, batch=500):
        for i in range(0, len(rows), batch):
            chunk = [{c: row.get(c) for c in COLUMNS} for row in rows[i:i + batch]]
            self._req("POST", f"{TABLE}?on_conflict=siret&columns={','.join(COLUMNS)}", json=chunk,
                      headers={"Prefer": "resolution=merge-duplicates,return=minimal"})

    def patch(self, query, values):
        self._req("PATCH", f"{TABLE}?{query}", json=values, headers={"Prefer": "return=minimal"})


def fetch_department(ft, dept, domains, seen_at):
    lat, lon = CENTERS[dept]
    rows = {}
    for domain in domains:
        page = 1
        while True:
            data = ft.search({"granddomain": domain, "latitude": lat, "longitude": lon, "distance": RADIUS_KM,
                              "page": page, "page_size": PAGE_SIZE})
            items = data.get("items") or []
            for item in items:
                merge_item(rows, item, domain, seen_at)
            if not keep_paging(items, page, data.get("hits")):
                break
            page += 1
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dept", action="append", help="só estes departamentos (pode repetir)")
    ap.add_argument("--domain", action="append", help="só estes grandes domínios ROME (A–N)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    depts = args.dept or list(CENTERS)
    domains = args.domain or DOMAINS
    unknown = [d for d in depts if d not in CENTERS] + [d for d in domains if d not in DOMAINS]
    if unknown:
        raise SystemExit(f"valores desconhecidos: {', '.join(unknown)}")
    cid = os.environ.get("FRANCE_TRAVAIL_CLIENT_ID", "").strip()
    secret = os.environ.get("FRANCE_TRAVAIL_CLIENT_SECRET", "").strip()
    if not cid or not secret:
        raise SystemExit("FRANCE_TRAVAIL_CLIENT_ID / FRANCE_TRAVAIL_CLIENT_SECRET em falta (segredos do GitHub).")
    key = os.environ.get("ZJOBS_SUPABASE_SERVICE_KEY", "").strip()
    db = None if args.dry_run else Supabase(key) if key else None
    if not args.dry_run and not db:
        raise SystemExit("ZJOBS_SUPABASE_SERVICE_KEY em falta.")

    ft = FranceTravail(cid, secret)
    seen_at = now_iso()
    full = not args.dept and not args.domain
    total, failed, written = set(), [], 0
    for dept in depts:
        try:
            rows = fetch_department(ft, dept, domains, seen_at)
        except Exception as e:  # um departamento falhado não pára os outros
            print(f"  dep. {dept}: ERRO {e}")
            failed.append(dept)
            continue
        new = [r for s, r in rows.items() if s not in total]
        total.update(rows)
        if db and new:
            db.upsert(new)
            written += len(new)
        print(f"  dep. {dept}: {len(rows)} estabelecimentos com forte potencial ({ft.calls} pedidos até agora)")

    print(f"Total: {len(total)} estabelecimentos com forte potencial de contratação; {ft.calls} pedidos à API.")
    if failed:
        print(f"Departamentos com erro: {', '.join(failed)} — a marcação de inativos não é feita.")
        sys.exit(1)
    if db and full:
        db.patch(f"active=eq.true&last_seen_at=lt.{seen_at}", {"active": False, "updated_at": now_iso()})
        print("Estabelecimentos que deixaram de aparecer: marcados inativos.")


if __name__ == "__main__":
    main()
