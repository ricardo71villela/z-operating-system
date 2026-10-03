"""
França — todos os estabelecimentos ativos com o código NAF 68.31Z
(agences immobilières : intermédiation en achat, vente et location de biens
immobiliers), a partir da API pública recherche-entreprises.api.gouv.fr
(dados oficiais SIRENE/INSEE + RNE, sem chave).

- Percorre departamento a departamento (a API não devolve mais de 10 000
  resultados por pesquisa); se um departamento passar desse limite, separa
  pessoas singulares e coletivas.
- Uma linha por estabelecimento (SIRET), com morada e coordenadas GPS.
- Pessoas singulares (empresário em nome individual, natureza jurídica 1000):
  type = 'independent' (mandatários e agentes independentes).
- No fim de uma passagem COMPLETA, os estabelecimentos que deixaram de
  aparecer são marcados active = false (nunca apagados).

Uso: python src/fetch_fr_sirene.py [--dept 74] [--dry-run]
"""

import argparse
import sys
import time

from common import Supabase, REGISTRY_COLUMNS, classify, http_get, now_iso

API = "https://recherche-entreprises.api.gouv.fr/search"
NAF = "68.31Z"
PER_PAGE = 25
MAX_RESULTS = 10000
DEPARTMENTS = [f"{i:02d}" for i in range(1, 96) if i != 20] + ["2A", "2B", "971", "972", "973", "974", "976"]


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


def rows_from_result(res, dept, seen_at):
    """Converte uma unidade legal e os seus estabelecimentos correspondentes."""
    complements = res.get("complements") or {}
    natural = bool(complements.get("est_entrepreneur_individuel")) or res.get("nature_juridique") == "1000"
    large = res.get("categorie_entreprise") in ("GE", "ETI") or (res.get("nombre_etablissements_ouverts") or 0) >= 10
    name = (res.get("nom_raison_sociale") or res.get("nom_complet") or "").strip()
    rows = []
    for et in res.get("matching_etablissements") or []:
        if et.get("etat_administratif") != "A" or et.get("activite_principale") != NAF:
            continue
        enseignes = et.get("liste_enseignes") or []
        trade = (et.get("nom_commercial") or (enseignes[0] if enseignes else None) or res.get("sigle") or None)
        kind, network = classify(name, trade, natural, et.get("est_siege"), large)
        lat, lon = et.get("latitude"), et.get("longitude")
        rows.append({
            "country": "FR", "source": "sirene", "source_id": et["siret"], "company_id": res.get("siren"),
            "name": res.get("nom_complet") or name, "trade_name": trade, "type": kind, "network": network,
            "is_natural_person": natural, "legal_form": res.get("nature_juridique"), "activity_code": NAF,
            "is_head_office": bool(et.get("est_siege")), "address": et.get("adresse"), "postcode": et.get("code_postal"),
            "city": et.get("libelle_commune"), "commune_code": et.get("commune"),
            "latitude": float(lat) if lat not in (None, "") else None, "longitude": float(lon) if lon not in (None, "") else None,
            "registry_created": et.get("date_creation"), "last_seen_at": seen_at, "active": True, "updated_at": seen_at,
        })
    return rows


def fetch_query(params, dept, seen_at, label):
    rows, page, capped = [], 1, 0
    first = call(dict(params, page=1, per_page=PER_PAGE))
    total = first.get("total_results", 0)
    if total > MAX_RESULTS:
        return None, total, 0
    data = first
    while True:
        for res in data.get("results", []):
            if len(res.get("matching_etablissements") or []) >= 10:
                capped += 1
            rows.extend(rows_from_result(res, dept, seen_at))
        if page >= data.get("total_pages", 0) or not data.get("results"):
            break
        page += 1
        data = call(dict(params, page=page, per_page=PER_PAGE))
    print(f"  {label}: {total} empresas, {len(rows)} estabelecimentos")
    return rows, total, capped


def fetch_department(dept, seen_at):
    base = {"activite_principale": NAF, "etat_administratif": "A", "departement": dept}
    rows, total, capped = fetch_query(base, dept, seen_at, f"dep. {dept}")
    if rows is None:
        rows, capped = [], 0
        for ei in ("true", "false"):
            part, t, c = fetch_query(dict(base, est_entrepreneur_individuel=ei), dept, seen_at, f"dep. {dept} (EI={ei})")
            if part is None:
                raise RuntimeError(f"dep. {dept}: mais de {MAX_RESULTS} resultados mesmo separado ({t})")
            rows.extend(part)
            capped += c
    return rows, capped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dept", action="append", help="só estes departamentos (pode repetir)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    depts = args.dept or DEPARTMENTS
    full = not args.dept
    seen_at = now_iso()
    db = None if args.dry_run else Supabase()

    total_rows, failed, capped_total = 0, [], 0
    for dept in depts:
        try:
            rows, capped = fetch_department(dept, seen_at)
        except Exception as e:  # um departamento falhado não pára os outros
            print(f"  dep. {dept}: ERRO {e}")
            failed.append(dept)
            continue
        unique = {r["source_id"]: r for r in rows}
        capped_total += capped
        if db and unique:
            db.upsert(list(unique.values()), REGISTRY_COLUMNS)
        total_rows += len(unique)

    print(f"França: {total_rows} estabelecimentos ativos 68.31Z; {capped_total} empresas com 10+ estabelecimentos no mesmo departamento (lista possivelmente incompleta).")
    if failed:
        print(f"Departamentos com erro: {', '.join(failed)} — a marcação de inativos não é feita.")
        sys.exit(1)
    if db and full:
        db.patch(f"country=eq.FR&source=eq.sirene&active=eq.true&last_seen_at=lt.{seen_at}", {"active": False, "updated_at": now_iso()})
        print("Estabelecimentos que deixaram de aparecer: marcados inativos.")


if __name__ == "__main__":
    main()
