"""
Testes do pipeline dos empregadores (sem rede): filtros, conversão SIRENE,
departamento, divisão das pesquisas acima do limite da API.

Uso: python tests/test_empresas.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import common  # noqa: E402
import fetch_fr_sirene as f  # noqa: E402

passed = 0


def check(label, cond):
    global passed
    assert cond, label
    passed += 1
    print("PASS:", label)


def company(**kw):
    base = {
        "siren": "552100554", "nom_complet": "ACME INDUSTRIE (ACME)", "nom_raison_sociale": "ACME INDUSTRIE",
        "sigle": "ACME", "nature_juridique": "5710", "activite_principale": "25.62B", "section_activite_principale": "C",
        "tranche_effectif_salarie": "21", "annee_tranche_effectif_salarie": "2023", "categorie_entreprise": "PME",
        "nombre_etablissements_ouverts": 3, "date_creation": "1998-04-01", "etat_administratif": "A",
        "statut_diffusion": "O",
        "complements": {"est_association": False, "est_ess": False, "est_service_public": False, "est_entrepreneur_individuel": False},
        "siege": {"siret": "55210055400013", "adresse": "12 RUE DU LAC 74200 THONON-LES-BAINS", "code_postal": "74200",
                  "commune": "74281", "libelle_commune": "THONON-LES-BAINS", "latitude": "46.37", "longitude": "6.48",
                  "statut_diffusion_etablissement": "O", "liste_enseignes": None, "nom_commercial": None},
    }
    for k, v in kw.items():
        if k in ("complements", "siege"):
            base[k] = dict(base[k], **v)
        else:
            base[k] = v
    return base


SEEN = "2026-10-23T20:00:00Z"

# ------------------------------------------------------------ department
check("departamento: metrópole, Córsega, ultramar",
      common.department_from_commune("74281") == "74" and common.department_from_commune("2A004") == "2A"
      and common.department_from_commune("97411") == "974" and common.department_from_commune("") is None)

# ------------------------------------------------------------ conversion
row = f.row_from_result(company(), SEEN)
check("empresa de 50-99 assalariados convertida com a morada da sede",
      row["source_id"] == "552100554" and row["name"] == "ACME INDUSTRIE" and row["employee_band"] == "21"
      and row["department"] == "74" and row["head_office_siret"] == "55210055400013" and row["city"] == "THONON-LES-BAINS")
check("sigla como nome comercial; ano do escalão e coordenadas numéricas",
      row["trade_name"] == "ACME" and row["employee_band_year"] == 2023 and row["latitude"] == 46.37)
check("só colunas do registo (nunca apaga contactos)",
      set(f.REGISTRY_COLUMNS) <= set(row) and not ({"email", "phone", "website"} & set(f.REGISTRY_COLUMNS)))
check("coordenada não difundida fica vazia",
      f.row_from_result(company(siege={"latitude": "[NON-DIFFUSIBLE]"}), SEEN)["latitude"] is None)

# ------------------------------------------------------------ filters
check("empresa em difusão parcial nunca entra",
      f.row_from_result(company(statut_diffusion="P"), SEEN) is None
      and f.row_from_result(company(siege={"statut_diffusion_etablissement": "P"}), SEEN) is None)
check("empresário em nome individual fica de fora",
      f.row_from_result(company(nature_juridique="1000"), SEEN) is None
      and f.row_from_result(company(complements={"est_entrepreneur_individuel": True}), SEEN) is None)
check("serviço público e direito público ficam de fora",
      f.row_from_result(company(complements={"est_service_public": True}), SEEN) is None
      and f.row_from_result(company(nature_juridique="7389"), SEEN) is None)
check("administração pública (O) fica de fora", f.row_from_result(company(section_activite_principale="O"), SEEN) is None)
check("menos de 10 assalariados ou escalão desconhecido fica de fora",
      f.row_from_result(company(tranche_effectif_salarie="03"), SEEN) is None
      and f.row_from_result(company(tranche_effectif_salarie="NN"), SEEN) is None
      and f.row_from_result(company(tranche_effectif_salarie=None), SEEN) is None)
check("empresa cessada fica de fora", f.row_from_result(company(etat_administratif="C"), SEEN) is None)
check("associação entra, assinalada", f.row_from_result(company(nature_juridique="9220", complements={"est_association": True}), SEEN)["is_association"] is True)
check("categoria desconhecida fica vazia", f.row_from_result(company(categorie_entreprise="XX"), SEEN)["company_category"] is None)

# ------------------------------------------------------------ partitioning
calls = []


def fake(params):
    """Simula a API: a secção F 20-49 tem 25 000 empresas no total,
    a região 11 tem 12 000 (acima do limite) e cada departamento ou região normal 30."""
    calls.append(params)
    if "departement" in params:
        n = 30
    elif "region" in params:
        n = 12000 if params["region"] == "11" else 30
    else:
        n = 25000
    pages = (n + f.PER_PAGE - 1) // f.PER_PAGE
    if n > f.MAX_RESULTS:
        return {"total_results": n, "total_pages": pages, "results": []}
    key = params.get("departement") or params.get("region")
    results = [company(siren=f"{key}{i:07d}", tranche_effectif_salarie=params["tranche_effectif_salarie"]) for i in range(min(f.PER_PAGE, n - (params["page"] - 1) * f.PER_PAGE))]
    return {"total_results": n, "total_pages": pages, "results": results}


rows = f.fetch_combination("F", "12", SEEN, caller=fake)
regions = [c for c in calls if "region" in c and c["page"] == 1]
depts = [c for c in calls if "departement" in c and c["page"] == 1]
check("acima de 10 000: divide por região", len(regions) == len(f.REGIONS))
check("região ainda acima do limite: divide pelos seus departamentos",
      sorted(c["departement"] for c in depts) == sorted(f.REGION_DEPARTMENTS["11"]))
check("todas as páginas lidas e convertidas",
      len(rows) == 30 * (len(f.REGIONS) - 1) + 30 * len(f.REGION_DEPARTMENTS["11"]))
check("cada pesquisa leva secção, escalão e empresas ativas",
      all(c["section_activite_principale"] == "F" and c["tranche_effectif_salarie"] == "12" and c["etat_administratif"] == "A" for c in calls))
check("todas as regiões têm departamentos e nenhum se repete",
      set(f.REGIONS) == set(f.REGION_DEPARTMENTS)
      and len({d for ds in f.REGION_DEPARTMENTS.values() for d in ds}) == sum(len(ds) for ds in f.REGION_DEPARTMENTS.values()) == 101)
check("secções: sem O, T, U; escalões: só 10+ assalariados",
      not ({"O", "T", "U"} & set(f.SECTIONS)) and f.BANDS[0] == "11" and "03" not in f.BANDS)

def ignores_filter(params):
    return {"total_results": 5_000_000, "total_pages": 200000,
            "results": [company(tranche_effectif_salarie="NN"), company(tranche_effectif_salarie="01")]}


try:
    f.fetch_combination("F", "12", SEEN, caller=ignores_filter)
    stopped = False
except RuntimeError as e:
    stopped = "filtro de efetivos" in str(e)
check("se a API ignorar o filtro de efetivos, a recolha pára", stopped)

print(f"\n{passed} testes passaram.")
