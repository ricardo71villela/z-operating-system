"""
Testes do pipeline das lojas (sem rede): conversão SIRENE e extração de contactos.

Uso: python tests/test_lojas.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import common  # noqa: E402
import enrich_osm  # noqa: E402
import fetch_sirene  # noqa: E402

passed = 0


def check(label, cond):
    global passed
    assert cond, label
    passed += 1
    print("PASS:", label)


SEEN = "2026-10-07T20:00:00Z"


def etab(siret, naf="47.71Z", etat="A", diff="O", siege=False, **kw):
    base = {"siret": siret, "activite_principale": naf, "etat_administratif": etat,
            "statut_diffusion_etablissement": diff, "est_siege": siege,
            "adresse": "1 RUE DU LAC 74500 EVIAN-LES-BAINS", "code_postal": "74500",
            "libelle_commune": "EVIAN-LES-BAINS", "latitude": "46.40", "longitude": "6.59"}
    base.update(kw)
    return base


company = {
    "siren": "123456789", "nom_raison_sociale": "BOUTIQUE DU LAC", "nom_complet": "BOUTIQUE DU LAC (LAC MODE)",
    "nature_juridique": "5499", "statut_diffusion": "O", "date_creation": "2015-03-01", "complements": {},
    "matching_etablissements": [
        etab("12345678900011", siege=True, liste_enseignes=["LAC MODE"]),
        etab("12345678900029", nom_commercial="LAC MODE THONON", code_postal="74200"),
        etab("12345678900037", etat="F"),                 # fechada
        etab("12345678900045", naf="47.72A"),             # outro setor
        etab("12345678900052", diff="P"),                 # oposição à difusão
    ],
}
rows = fetch_sirene.rows_from_result(company, "47.71Z", "roupa", SEEN)
check("uma linha por loja ativa do setor (fechadas, outros setores e não difundíveis ficam de fora)",
      [r["siret"] for r in rows] == ["12345678900011", "12345678900029"])
check("insígnia da loja em nome_comercial, nome legal em nome",
      rows[0]["nome_comercial"] == "LAC MODE" and rows[1]["nome_comercial"] == "LAC MODE THONON" and rows[0]["nome"] == "BOUTIQUE DU LAC")
check("coordenadas convertidas em número", rows[0]["latitude"] == 46.40 and rows[0]["longitude"] == 6.59)
check("linhas trazem só as colunas do registo", all(set(r) == set(common.REGISTRY_COLUMNS) for r in rows))
check("data de passagem gravada", rows[0]["data_ultima_atualizacao"] == SEEN)

ei = dict(company, nature_juridique="1000", nom_raison_sociale="", nom_complet="MARIE DURAND",
          matching_etablissements=[etab("98765432100015", latitude="[NON-DIFFUSIBLE]")])
r = fetch_sirene.rows_from_result(ei, "47.71Z", "roupa", SEEN)
check("empresária em nome individual: nome completo; coordenada não numérica = None",
      r[0]["nome"] == "MARIE DURAND" and r[0]["latitude"] is None)
check("unidade legal em difusão parcial: nada entra",
      fetch_sirene.rows_from_result(dict(company, statut_diffusion="P"), "47.71Z", "roupa", SEEN) == [])
check("nome obrigatório nunca vazio",
      fetch_sirene.rows_from_result(dict(company, nom_raison_sociale="", nom_complet="",
                                         matching_etablissements=[etab("11111111100011")]), "47.71Z", "roupa", SEEN)[0]["nome"] == "11111111100011")

check("todos os departamentos (101, com a Corsega e o ultramar)", len(fetch_sirene.DEPARTMENTS) == 101 and "2A" in fetch_sirene.DEPARTMENTS)
check("cinco setores", sorted(fetch_sirene.CODIGOS_NAF.values()) == ["calcado", "cosmetica_perfumes", "desporto", "marroquinaria", "roupa"])

check("nome escapado para a pesquisa Overpass",
      enrich_osm.overpass_name_pattern('L\'Atelier "N°1" (Évian)') == 'L\'Atelier \\"N°1\\" \\(Évian\\)')
check("e-mail do site: ignora imagens e noreply",
      enrich_osm.extrair_email('<img src="logo@2x.png"> noreply@shop.fr <a>Contact@Boutique-Lac.fr</a>') == "contact@boutique-lac.fr")

print(f"\n{passed} testes passaram.")
