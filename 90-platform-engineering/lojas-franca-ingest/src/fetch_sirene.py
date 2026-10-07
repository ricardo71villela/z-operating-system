"""
Lojas França (Z Fashion) — todas as lojas ativas dos setores roupa, calçado,
marroquinaria, desporto, cosmética e perfumes, a partir da API pública
recherche-entreprises.api.gouv.fr (dados oficiais SIRENE/INSEE, sem chave),
carregadas na tabela `lojas` do Supabase.

O que mudou em relação à primeira versão (que nunca carregou nenhuma loja):
- Uma linha por LOJA (estabelecimento, SIRET), e não só pela sede da empresa:
  uma empresa com três lojas dá três linhas.
- Percorre código NAF x departamento: a API não devolve mais de 10 000
  resultados por pesquisa, e a versão anterior ficava cortada a ~12 500 por
  setor. Se um departamento passar desse limite, separa pessoas singulares e
  coletivas.
- Pessoas em difusão parcial do SIRENE (estatuto «P», «[NON-DIFFUSIBLE]»)
  opuseram-se à difusão — e à prospeção — dos seus dados: nunca entram.
- Carrega departamento a departamento pela API REST do Supabase (sem CSV
  intermédio nem ligação Postgres direta).
- No fim de uma passagem COMPLETA, as lojas que deixaram de aparecer são
  marcadas ativo = false (nunca apagadas).

Uso: python src/fetch_sirene.py [--dept 74] [--naf 47.71Z] [--dry-run]
"""

import argparse
import sys
import time

from common import Supabase, REGISTRY_COLUMNS, http_get, now_iso

API = "https://recherche-entreprises.api.gouv.fr/search"
PER_PAGE = 25
MAX_RESULTS = 10000

# Referência: https://www.insee.fr/fr/information/2406147 (NAF rév. 2)
CODIGOS_NAF = {
    "47.71Z": "roupa",              # Commerce de détail d'habillement
    "47.72A": "calcado",            # Commerce de détail de la chaussure
    "47.72B": "marroquinaria",      # Commerce de détail de maroquinerie et d'articles de voyage
    "47.64Z": "desporto",           # Commerce de détail d'articles de sport
    "47.75Z": "cosmetica_perfumes", # Commerce de détail de parfumerie et de produits de beauté
}

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


def to_float(value):
    """Coordenada numérica, ou None (vazio, «[NON-DIFFUSIBLE]», texto)."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def diffusible(status):
    """Só dados de difusão pública (O)."""
    return status in (None, "", "O")


def rows_from_result(res, naf, setor, seen_at):
    """Converte uma unidade legal nas suas lojas (estabelecimentos) desse código NAF."""
    if not diffusible(res.get("statut_diffusion")):
        return []
    complements = res.get("complements") or {}
    natural = bool(complements.get("est_entrepreneur_individuel")) or res.get("nature_juridique") == "1000"
    legal_name = (res.get("nom_raison_sociale") or "").strip()
    full_name = (res.get("nom_complet") or "").strip()
    nome = (full_name if natural else legal_name) or full_name or legal_name
    rows = []
    for et in res.get("matching_etablissements") or []:
        if et.get("etat_administratif") != "A" or et.get("activite_principale") != naf:
            continue
        if not diffusible(et.get("statut_diffusion_etablissement")):
            continue
        siret = et.get("siret")
        if not siret:
            continue
        enseignes = et.get("liste_enseignes") or []
        trade = et.get("nom_commercial") or (enseignes[0] if enseignes else None) or res.get("sigle") or None
        rows.append({
            "siret": siret, "siren": res.get("siren"),
            "nome": nome or trade or siret,  # nome é obrigatório na tabela
            "nome_comercial": trade, "codigo_naf": naf, "setor": setor,
            "morada": et.get("adresse"), "codigo_postal": et.get("code_postal"), "cidade": et.get("libelle_commune"),
            "latitude": to_float(et.get("latitude")), "longitude": to_float(et.get("longitude")),
            "ativo": True, "data_criacao_empresa": res.get("date_creation") or None,
            "data_ultima_atualizacao": seen_at,
        })
    return rows


def fetch_query(params, naf, setor, seen_at, label):
    """Todas as páginas de uma pesquisa; None se passar de 10 000 resultados."""
    first = call(dict(params, page=1, per_page=PER_PAGE))
    total = first.get("total_results", 0)
    if total > MAX_RESULTS:
        return None, total
    rows, page, data = [], 1, first
    while True:
        for res in data.get("results", []):
            try:
                rows.extend(rows_from_result(res, naf, setor, seen_at))
            except Exception as e:  # um registo estranho não faz falhar o departamento
                print(f"  {label}: registo {res.get('siren')} ignorado ({e})")
        if page >= data.get("total_pages", 0) or not data.get("results"):
            break
        page += 1
        data = call(dict(params, page=page, per_page=PER_PAGE))
    print(f"  {label}: {total} empresas, {len(rows)} lojas")
    return rows, total


def fetch_department(naf, setor, dept, seen_at):
    base = {"activite_principale": naf, "etat_administratif": "A", "departement": dept}
    label = f"{setor} dep. {dept}"
    rows, total = fetch_query(base, naf, setor, seen_at, label)
    if rows is not None:
        return rows
    rows = []
    for ei in ("true", "false"):
        part, t = fetch_query(dict(base, est_entrepreneur_individuel=ei), naf, setor, seen_at, f"{label} (EI={ei})")
        if part is None:
            raise RuntimeError(f"{label}: mais de {MAX_RESULTS} resultados mesmo separado ({t})")
        rows.extend(part)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dept", action="append", help="só estes departamentos (pode repetir)")
    ap.add_argument("--naf", action="append", choices=sorted(CODIGOS_NAF), help="só estes códigos NAF (pode repetir)")
    ap.add_argument("--dry-run", action="store_true", help="não escreve no Supabase")
    args = ap.parse_args()
    depts = args.dept or DEPARTMENTS
    nafs = args.naf or list(CODIGOS_NAF)
    full = not args.dept and not args.naf
    seen_at = now_iso()
    db = None if args.dry_run else Supabase()

    total, failed = 0, []
    for naf in nafs:
        setor = CODIGOS_NAF[naf]
        print(f"NAF {naf} ({setor})")
        for dept in depts:
            try:
                rows = fetch_department(naf, setor, dept, seen_at)
            except Exception as e:  # um departamento falhado não pára os outros
                print(f"  {setor} dep. {dept}: ERRO {e}")
                failed.append(f"{naf}/{dept}")
                continue
            unique = list({r["siret"]: r for r in rows}.values())
            if db and unique:
                db.upsert(unique, REGISTRY_COLUMNS)
            total += len(unique)

    print(f"\nTotal: {total} lojas ativas carregadas.")
    if failed:
        print(f"Com erro: {', '.join(failed)} — a marcação de inativas não é feita.")
        sys.exit(1)
    if db and full:
        db.patch(f"ativo=eq.true&data_ultima_atualizacao=lt.{seen_at}", {"ativo": False})
        print("Lojas que deixaram de aparecer: marcadas inativas.")


if __name__ == "__main__":
    main()
