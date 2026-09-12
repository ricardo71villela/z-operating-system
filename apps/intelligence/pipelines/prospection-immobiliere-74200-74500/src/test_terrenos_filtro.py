"""
Testes sintéticos (sem rede) para a correção de falsos positivos em
enrich_terrenos_livres.py — auditoria 2026-09-12 (parques de campismo,
parques, escolas, campos de futebol listados como "terrenos livres").

Segue a mesma metodologia já usada em test_dpe_fields.py neste projeto:
dados fabricados, funções puras testadas diretamente, sem chamadas HTTP
reais. As formas/campos usados aqui replicam exatamente os confirmados em
produção via WebFetch em 2026-09-12 (ver docstring do módulo alvo):
  - GPU zone-urba: campos "typezone", "libelle", "libelong"
  - BD TOPO ZAI: campos "categorie", "nature", "toponyme"
  - BD TOPO cimetiere: camada própria, sem "categorie"
  - geocodage/reverse (poi): "name"/"category" são LISTAS, "distance" em m
"""
from shapely.geometry import Polygon, Point

import enrich_terrenos_livres as t


def square(cx, cy, half=0.001):
    return Polygon([
        (cx - half, cy - half), (cx + half, cy - half),
        (cx + half, cy + half), (cx - half, cy + half),
    ])


# ---------------------------------------------------------------------------
# Teste 1 -- libelong_indica_exclusao: casos reais confirmados em produção
# ---------------------------------------------------------------------------
def test_libelong_casos_reais():
    casos_excluir = [
        "Equipement public et/ou d'intérêt collectif",   # Publier/Thonon "UE"
        "Zone des parcs urbains",                          # Thonon "Uj"
        "Zone de tourisme du coeur de ville",               # Thonon "UTa" (campismo)
        "Zone d'activités économiques à dominante industrielle",  # Féternes "UXt"
        "Zone réservée aux équipements scolaires",
        "Secteur de camping et d'hébergement de loisirs",
        "Zone à vocation cultuelle",
        "Emplacement réservé cimetière communal",
        "Zone urbaine liée à l'emprise ferroviaire",         # Publier "UF"
        "Zone d'activités correspondant à l'emprise du domaine ferroviaire",  # Thonon "UZ"
        "Zone d'equipements structurants",                    # Lugrin "UEs"
        "Zone urbaine à vocation d'activités industrielles et artisanales",  # Publier "UX"
    ]
    for libelong in casos_excluir:
        excluir, kw = t.libelong_indica_exclusao(libelong)
        assert excluir, f"deveria excluir: {libelong!r}"
        assert kw is not None

    casos_manter = [
        "Zone urbaine d'habitat pavillonnaire",
        "Zone urbaine dense mixte",
        # Caso real verificado (Thonon "UR"): nome proprio de zona residencial
        # a beira-lago, NAO deve ser excluido so por ter um nome pouco comum
        # -- confirmado via POI: "Port Ripaille" e um bairro/porto de lazer,
        # nao um equipamento publico (auditoria 2026-09-12).
        "Zone du village lacustre de Port Ripaille",
        None,
        "",
    ]
    for libelong in casos_manter:
        excluir, kw = t.libelong_indica_exclusao(libelong)
        assert not excluir, f"NAO deveria excluir: {libelong!r}"
    print("OK: test_libelong_casos_reais")


# ---------------------------------------------------------------------------
# Teste 2 -- acentuação: a normalização não deve depender de acentos exatos
# ---------------------------------------------------------------------------
def test_libelong_sem_acentuacao():
    excluir1, _ = t.libelong_indica_exclusao("Equipement d'intérêt général")
    excluir2, _ = t.libelong_indica_exclusao("EQUIPEMENT D'INTERET GENERAL")
    assert excluir1 and excluir2
    print("OK: test_libelong_sem_acentuacao")


# ---------------------------------------------------------------------------
# Teste 3 -- geoms_com_atributo + STRtree: parcela sobreposta a um "Stade"
# (categorie="Sport") da camada ZAI é apanhada; uma sem sobreposição não é.
# ---------------------------------------------------------------------------
def test_exclusao_por_zai_sobreposicao():
    zai_gj = {
        "features": [
            {
                "geometry": square(6.4700, 46.3620).__geo_interface__,
                "properties": {"categorie": "Sport", "nature": "Stade",
                                "toponyme": "Stade Municipal Joseph Moynat"},
            },
            {
                "geometry": square(6.4600, 46.3300).__geo_interface__,
                "properties": {"categorie": "Science et enseignement",
                                "nature": "Enseignement primaire",
                                "toponyme": "École Maternelle la Source"},
            },
        ]
    }
    instalacoes = t.geoms_com_atributo(zai_gj, "categorie")
    tree, geoms, motivos = t.build_instalacoes_tree(instalacoes)

    # Parcela candidata que cai EM CIMA do stade -> deve ser excluída
    parcela_stade = square(6.4700, 46.3620, half=0.0005)
    motivo = t.encontra_instalacao_sobreposta(parcela_stade, tree, geoms, motivos)
    assert motivo is not None and "Stade Municipal Joseph Moynat" in motivo

    # Parcela candidata longe de qualquer instalação -> sobrevive
    parcela_livre = square(6.5500, 46.4000, half=0.0005)
    motivo2 = t.encontra_instalacao_sobreposta(parcela_livre, tree, geoms, motivos)
    assert motivo2 is None
    print("OK: test_exclusao_por_zai_sobreposicao")


# ---------------------------------------------------------------------------
# Teste 4 -- cemitério (camada separada, sem campo "categorie"): valor_fixo
# ---------------------------------------------------------------------------
def test_exclusao_por_cimetiere():
    cimetiere_gj = {
        "features": [
            {
                "geometry": square(6.4750, 46.3450).__geo_interface__,
                "properties": {"cleabs": "CIMETIER0000000067375568", "nature": "Civil"},
            }
        ]
    }
    instalacoes = t.geoms_com_atributo(cimetiere_gj, None, valor_fixo="cemitério")
    tree, geoms, motivos = t.build_instalacoes_tree(instalacoes)
    parcela = square(6.4750, 46.3450, half=0.0003)
    motivo = t.encontra_instalacao_sobreposta(parcela, tree, geoms, motivos)
    assert motivo == "cemitério"
    print("OK: test_exclusao_por_cimetiere")


# ---------------------------------------------------------------------------
# Teste 5 -- find_parcelas_livres end-to-end com sessão HTTP simulada
# (monkeypatch de _fetch_layer e _fetch_wfs_layer), reproduzindo o caso
# real "Uj / Zone des parcs urbains" (Thonon, parcela BC0430): tem edifício?
# não. Cai num campo de futebol da ZAI? sim -> deve ser EXCLUÍDA, não listada
# como terreno livre.
# ---------------------------------------------------------------------------
def test_find_parcelas_livres_end_to_end(monkeypatch):
    parcelles_gj = {
        "features": [
            {
                # grande, sem edifício, cai em cima do "campo de futebol" simulado
                "geometry": square(6.4703, 46.3616, half=0.0015).__geo_interface__,
                "properties": {"id": "74281000BC0430", "contenance": 18190},
            },
            {
                # pequena (abaixo do limiar) -- deve ser ignorada por área
                "geometry": square(6.6000, 46.4200, half=0.0005).__geo_interface__,
                "properties": {"id": "74281000ZZ0001", "contenance": 100},
            },
            {
                # grande, sem edifício, LONGE de qualquer instalação -> deve sobreviver
                "geometry": square(6.6200, 46.4300, half=0.0015).__geo_interface__,
                "properties": {"id": "74281000ZZ0002", "contenance": 5000},
            },
        ]
    }
    batiments_gj = {"features": []}  # nenhum edifício em nenhuma comuna deste teste
    zai_gj = {
        "features": [
            {
                "geometry": square(6.4703, 46.3616, half=0.0008).__geo_interface__,
                "properties": {"categorie": "Sport", "nature": "Terrain de football",
                                "toponyme": "Terrain de football municipal"},
            }
        ]
    }
    cimetiere_gj = {"features": []}

    def fake_fetch_layer(code_insee, camada, cache_dir):
        if camada == "parcelles":
            return parcelles_gj
        if camada == "batiments":
            return batiments_gj
        raise AssertionError(f"camada inesperada: {camada}")

    def fake_fetch_wfs_layer(code_insee, typename, bbox, cache_dir, session):
        if typename == t.WFS_TYPENAME_ZAI:
            return zai_gj
        if typename == t.WFS_TYPENAME_CIMETIERE:
            return cimetiere_gj
        raise AssertionError(f"typename inesperado: {typename}")

    monkeypatch.setattr(t, "_fetch_layer", fake_fetch_layer)
    monkeypatch.setattr(t, "_fetch_wfs_layer", fake_fetch_wfs_layer)

    candidatas, excluidas = t.find_parcelas_livres("74281", session=None)

    ids_candidatas = {c["parcela_id"] for c in candidatas}
    ids_excluidas = {e["parcela_id"] for e in excluidas}

    assert "74281000BC0430" not in ids_candidatas, "campo de futebol NAO deveria sobreviver"
    assert "74281000BC0430" in ids_excluidas
    assert "terrain de football" in excluidas[[e["parcela_id"] for e in excluidas].index("74281000BC0430")]["motivo_exclusao"].lower() \
        or "football" in excluidas[[e["parcela_id"] for e in excluidas].index("74281000BC0430")]["motivo_exclusao"].lower()
    assert "74281000ZZ0001" not in ids_candidatas, "parcela pequena nunca deveria aparecer"
    assert "74281000ZZ0001" not in ids_excluidas
    assert "74281000ZZ0002" in ids_candidatas, "parcela livre genuina deveria sobreviver"
    print("OK: test_find_parcelas_livres_end_to_end")


# ---------------------------------------------------------------------------
# Teste 6 -- consultar_poi_alerta: sessão HTTP simulada, replica a resposta
# real confirmada (name/category como listas, distance em metros)
# ---------------------------------------------------------------------------
class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


class FakeSessionPoiPerto:
    def get(self, url, params=None, timeout=None):
        return FakeResponse({
            "features": [{
                "properties": {
                    "name": ["Terrain de football"],
                    "category": ["grand terrain de sport", "terrain de football"],
                    "toponym": "Terrain de football",
                    "distance": 22,
                }
            }]
        })


class FakeSessionPoiLonge:
    def get(self, url, params=None, timeout=None):
        return FakeResponse({
            "features": [{
                "properties": {
                    "name": ["Quelque chose de lointain"],
                    "category": ["autre"],
                    "distance": 900,
                }
            }]
        })


def test_consultar_poi_alerta():
    alerta_perto = t.consultar_poi_alerta(6.47, 46.36, FakeSessionPoiPerto())
    assert alerta_perto is not None
    assert "Terrain de football" in alerta_perto
    assert "22m" in alerta_perto

    alerta_longe = t.consultar_poi_alerta(6.47, 46.36, FakeSessionPoiLonge())
    assert alerta_longe is None, "POI a 900m nao deveria gerar alerta (raio default 60m)"
    print("OK: test_consultar_poi_alerta")


# ---------------------------------------------------------------------------
# Teste 7 -- consultar_zona_plu: extrai também o novo campo libelong
# ---------------------------------------------------------------------------
class FakeSessionZonaUrba:
    def get(self, url, params=None, timeout=None):
        return FakeResponse({
            "features": [{
                "properties": {
                    "typezone": "U",
                    "libelle": "Uj",
                    "libelong": "Zone des parcs urbains",
                }
            }]
        })


def test_consultar_zona_plu_devolve_libelong():
    typezone, libelle, libelong = t.consultar_zona_plu(6.47, 46.36, FakeSessionZonaUrba())
    assert typezone == "U"
    assert libelle == "Uj"
    assert libelong == "Zone des parcs urbains"
    print("OK: test_consultar_zona_plu_devolve_libelong")


if __name__ == "__main__":
    class _MonkeyPatch:
        def __init__(self):
            self._orig = []

        def setattr(self, obj, name, value):
            self._orig.append((obj, name, getattr(obj, name)))
            setattr(obj, name, value)

        def undo(self):
            for obj, name, value in self._orig:
                setattr(obj, name, value)

    test_libelong_casos_reais()
    test_libelong_sem_acentuacao()
    test_exclusao_por_zai_sobreposicao()
    test_exclusao_por_cimetiere()

    mp = _MonkeyPatch()
    try:
        test_find_parcelas_livres_end_to_end(mp)
    finally:
        mp.undo()

    test_consultar_poi_alerta()
    test_consultar_zona_plu_devolve_libelong()
    print("\nTODOS OS TESTES PASSARAM")
