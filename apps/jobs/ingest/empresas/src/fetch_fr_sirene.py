"""
França — empresas ativas com 10 ou mais assalariados, a partir da API
pública recherche-entreprises.api.gouv.fr (dados oficiais SIRENE/INSEE + RNE,
sem chave). Uma linha por empresa (SIREN), com a morada da sede.

Fora do âmbito:
- administração pública (secção NAF O), organizações extraterritoriais (U)
  e famílias empregadoras (T);
- serviços públicos (complements.est_service_public) e pessoas coletivas de
  direito público (natureza jurídica 7xxx);
- empresários em nome individual (pessoas singulares);
- empresas em difusão parcial do SIRENE (estatuto «P»): opuseram-se à
  difusão dos seus dados — e à prospeção — e nunca entram na base.

A API não devolve mais de 10 000 resultados por pesquisa. A recolha percorre
secção NAF × escalão de efetivos; uma combinação que passe do limite é
dividida por região e, se ainda for preciso, por departamento. Uma empresa
encontrada em várias divisões (filtro geográfico nos estabelecimentos) é
guardada uma só vez.

No fim de uma passagem COMPLETA e sem erros, as empresas que deixaram de
aparecer são marcadas active = false (nunca apagadas).

Uso: python src/fetch_fr_sirene.py [--section F] [--band 12] [--dry-run]
"""

import argparse
import sys
import time

from common import Supabase, REGISTRY_COLUMNS, department_from_commune, http_get, now_iso

API = "https://recherche-entreprises.api.gouv.fr/search"
PER_PAGE = 25
MAX_RESULTS = 10000

# Secções NAF rév. 2 recolhidas (sem O, T, U).
SECTIONS = list("ABCDEFGHIJKLMNPQRS")
# Escalões INSEE de efetivo assalariado, a partir de 10 assalariados.
BANDS = ["11", "12", "21", "22", "31", "32", "41", "42", "51", "52", "53"]
BAND_LABELS = {
    "11": "10-19", "12": "20-49", "21": "50-99", "22": "100-199", "31": "200-249", "32": "250-499",
    "41": "500-999", "42": "1000-1999", "51": "2000-4999", "52": "5000-9999", "53": "10000+",
}
REGIONS = ["11", "24", "27", "28", "32", "44", "52", "53", "75", "76", "84", "93", "94", "01", "02", "03", "04", "06"]
REGION_DEPARTMENTS = {
    "11": ["75", "77", "78", "91", "92", "93", "94", "95"],
    "24": ["18", "28", "36", "37", "41", "45"],
    "27": ["21", "25", "39", "58", "70", "71", "89", "90"],
    "28": ["14", "27", "50", "61", "76"],
    "32": ["02", "59", "60", "62", "80"],
    "44": ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"],
    "52": ["44", "49", "53", "72", "85"],
    "53": ["22", "29", "35", "56"],
    "75": ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"],
    "76": ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"],
    "84": ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"],
    "93": ["04", "05", "06", "13", "83", "84"],
    "94": ["2A", "2B"],
    "01": ["971"], "02": ["972"], "03": ["973"], "04": ["974"], "06": ["976"],
}


def call(params):
    for attempt in range(8):
        r = http_get(API, params=params, timeout=40)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(min(60, 3 * (attempt + 1)))
            continue
        r.raise_for_status()
        time.sleep(0.16)  # ~6 pedidos/segundo, abaixo do limite de 7/s
        return r.json()
    raise RuntimeError(f"recherche-entreprises: demasiadas tentativas {params}")


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def diffusible(status):
    """Só dados de difusão pública (O)."""
    return status in (None, "", "O")


def keep(res):
    """A empresa entra na base?"""
    if not diffusible(res.get("statut_diffusion")):
        return False
    if res.get("etat_administratif") not in (None, "A"):
        return False
    complements = res.get("complements") or {}
    if complements.get("est_entrepreneur_individuel") or res.get("nature_juridique") == "1000":
        return False
    if complements.get("est_service_public") or str(res.get("nature_juridique") or "").startswith("7"):
        return False
    if res.get("section_activite_principale") in ("O", "T", "U"):
        return False
    if res.get("tranche_effectif_salarie") not in BANDS:
        return False
    siege = res.get("siege") or {}
    if not diffusible(siege.get("statut_diffusion_etablissement")):
        return False
    return True


def row_from_result(res, seen_at):
    """Converte uma unidade legal (com a sua sede) numa linha da tabela."""
    if not keep(res):
        return None
    complements = res.get("complements") or {}
    siege = res.get("siege") or {}
    commune = siege.get("commune")
    name = (res.get("nom_raison_sociale") or res.get("nom_complet") or "").strip()
    if not name:
        return None
    enseignes = siege.get("liste_enseignes") or []
    trade = siege.get("nom_commercial") or (enseignes[0] if enseignes else None) or res.get("sigle") or None
    return {
        "country": "FR", "source": "sirene", "source_id": res.get("siren"),
        "name": name, "trade_name": trade if trade and trade != name else None,
        "legal_form": res.get("nature_juridique"),
        "naf_code": res.get("activite_principale"), "naf_section": res.get("section_activite_principale"),
        "employee_band": res.get("tranche_effectif_salarie"),
        "employee_band_year": to_int(res.get("annee_tranche_effectif_salarie")),
        "company_category": res.get("categorie_entreprise") if res.get("categorie_entreprise") in ("PME", "ETI", "GE") else None,
        "establishments_open": to_int(res.get("nombre_etablissements_ouverts")),
        "is_association": bool(complements.get("est_association")),
        "is_ess": bool(complements.get("est_ess")),
        "head_office_siret": siege.get("siret"),
        "address": siege.get("adresse"), "postcode": siege.get("code_postal"),
        "city": siege.get("libelle_commune"), "commune_code": commune,
        "department": siege.get("departement") or department_from_commune(commune),
        "latitude": to_float(siege.get("latitude")), "longitude": to_float(siege.get("longitude")),
        "registry_created": res.get("date_creation"),
        "last_seen_at": seen_at, "active": True, "updated_at": seen_at,
    }


def fetch_all(params, label, seen_at, caller=call):
    """Todas as páginas de uma pesquisa. Devolve None se passar do limite."""
    first = caller(dict(params, page=1, per_page=PER_PAGE))
    total = first.get("total_results", 0)
    band = params.get("tranche_effectif_salarie")
    sample = [r.get("tranche_effectif_salarie") for r in first.get("results", [])]
    if band and sample and band not in sample:
        # A API ignorou o filtro de efetivos (formato mudou?): parar em vez de
        # percorrer o registo inteiro.
        raise RuntimeError(f"{label}: a API não aplicou o filtro de efetivos {band} (recebido {sorted(set(map(str, sample)))[:5]})")
    if total > MAX_RESULTS:
        return None, total
    rows, page, data = [], 1, first
    while True:
        for res in data.get("results", []):
            try:
                row = row_from_result(res, seen_at)
            except Exception as e:  # um registo estranho não faz falhar a recolha
                print(f"  {label}: empresa {res.get('siren')} ignorada ({e})")
                continue
            if row and row["source_id"]:
                rows.append(row)
        if page >= data.get("total_pages", 0) or not data.get("results"):
            break
        page += 1
        data = caller(dict(params, page=page, per_page=PER_PAGE))
    print(f"  {label}: {total} empresas, {len(rows)} guardadas")
    return rows, total


def fetch_combination(section, band, seen_at, caller=call):
    """Uma secção × um escalão, dividida por região / departamento se preciso."""
    base = {"section_activite_principale": section, "tranche_effectif_salarie": band, "etat_administratif": "A"}
    label = f"{section} {BAND_LABELS[band]}"
    rows, total = fetch_all(base, label, seen_at, caller)
    if rows is not None:
        return rows
    rows = []
    for region in REGIONS:
        part, t = fetch_all(dict(base, region=region), f"{label} reg. {region}", seen_at, caller)
        if part is None:
            for dept in REGION_DEPARTMENTS[region]:
                p2, t2 = fetch_all(dict(base, departement=dept), f"{label} dep. {dept}", seen_at, caller)
                if p2 is None:
                    raise RuntimeError(f"{label} dep. {dept}: mais de {MAX_RESULTS} resultados ({t2})")
                rows.extend(p2)
        else:
            rows.extend(part)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--section", action="append", help="só estas secções NAF (pode repetir)")
    ap.add_argument("--band", action="append", help="só estes escalões INSEE (pode repetir), ex. 12")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    sections = args.section or SECTIONS
    bands = args.band or BANDS
    bad = [b for b in bands if b not in BANDS] + [s for s in sections if s not in SECTIONS]
    if bad:
        raise SystemExit(f"valores desconhecidos: {', '.join(bad)}")
    full = not args.section and not args.band
    seen_at = now_iso()
    db = None if args.dry_run else Supabase()

    total, failed, seen = 0, [], set()
    for section in sections:
        for band in bands:
            try:
                rows = fetch_combination(section, band, seen_at)
            except Exception as e:  # uma combinação falhada não pára as outras
                print(f"  {section} {BAND_LABELS[band]}: ERRO {e}")
                failed.append(f"{section}/{band}")
                continue
            unique = {}
            for r in rows:
                if r["source_id"] not in seen:
                    unique[r["source_id"]] = r
            seen.update(unique)
            if db and unique:
                db.upsert(list(unique.values()), REGISTRY_COLUMNS)
            total += len(unique)

    print(f"França: {total} empresas ativas com 10+ assalariados.")
    if failed:
        print(f"Combinações com erro: {', '.join(failed)} — a marcação de inativas não é feita.")
        sys.exit(1)
    if db and full:
        db.patch(f"country=eq.FR&source=eq.sirene&active=eq.true&last_seen_at=lt.{seen_at}", {"active": False, "updated_at": now_iso()})
        print("Empresas que deixaram de aparecer: marcadas inativas.")


if __name__ == "__main__":
    main()
