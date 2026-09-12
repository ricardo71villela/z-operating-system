"""
Identificação de terrenos livres (parcelas cadastrais sem construção) com
potencial de construção — pedido explícito do Ricardo (12/set/2026):
"terrenos livres com potencial de construção" como nova frente de
prospeção, distinta das moradas já construídas que o resto do pipeline
trata.

DIFERENÇA FUNDAMENTAL face ao resto do pipeline: uma parcela não construída
não tem morada BAN, e os dados abertos do cadastro EXCLUEM explicitamente o
ficheiro de proprietários ("les fichiers des propriétés et des propriétaires
ne sont pas concernés" — cadastre.data.gouv.fr). Este script produz por
isso uma LISTA DE PARCELAS candidatas (identificador cadastral, comuna,
área, tipo de zona urbanística, localização) — NÃO uma lista de contactos
pronta a enviar, como as fichas de moradas. A identificação do proprietário
fica a cargo do Ricardo, via extrato da matriz cadastral na câmara
municipal (grátis) ou, em casos de sucessão não registada, via Service de
la Publicité Foncière.

---------------------------------------------------------------------------
AUDITORIA CRÍTICA (2026-09-12) — FALSOS POSITIVOS GRAVES CORRIGIDOS
---------------------------------------------------------------------------
Reportado pelo Ricardo: a lista continha "erros absurdos" — parques de
campismo, parques públicos, escolas, espaços públicos, campos de futebol
listados como "terrenos livres" para prospeção residencial.

CAUSA RAIZ verificada em dados reais (7 dos maiores "terrenos" auditados
via API oficial do IGN — apicarto.ign.fr/gpu, data.geopf.fr — antes desta
correção): o filtro original só verificava (a) área >= 500 m² e (b)
ausência de um polígono de EDIFÍCIO sobreposto. Um campo de futebol, um
parque de campismo, um parque urbano ou o pátio de um quartel de bombeiros
não têm (ou têm apenas parcialmente) um "edifício" cadastral sobreposto —
o filtro original deixava-os passar. Confirmado caso a caso:
  - Publier, parcela AK0603 (47 909 m², zona "UE"): faixa florestal/verde.
  - Thonon, parcela BF0172 (33 324 m², zona "UE"): terreno do quartel de
    bombeiros (Centre d'incendie et de secours).
  - Thonon, parcela AE0002 (29 350 m², zona "UTa" = "Zone de tourisme du
    coeur de ville"): complexo do parque de campismo/praia de
    Saint-Disdille.
  - Allinges, parcela 0D0289 (22 423 m², zona "UE"): zona técnica/industrial
    (posto de transformação elétrica, junto à Zone Industrielle de la
    Praux).
  - Féternes, parcela 0B0297 (21 681 m², zona "UXt" = "Zone d'activités
    économiques à dominante industrielle"): reservatórios industriais +
    unidade de metanização.
  - Thonon, parcela BC0430 (18 190 m², zona "Uj" = "Zone des parcs
    urbains"): campos desportivos (futebol + multisport), parque urbano.
  - Thonon, parcela BF0174 (17 779 m², zona "UE"): anexo do mesmo quartel
    de bombeiros que BF0172.
6 em 7 dos maiores candidatos eram infraestrutura pública/industrial
existente, não terreno livre vendável. O padrão repetia-se: os zone_libelle
"UE", "UTa", "UXt", "Uj" concentravam a esmagadora maioria da área total
suspeita (ver tabela de somas por zona_libelle no histórico de execução —
"UE" sozinho somava mais área que qualquer outra zona).

CORREÇÃO — três camadas de exclusão adicionadas, cada uma independente
(nenhuma depende só de adivinhar a convenção de nomenclatura de um PLU
específico, que varia de comuna para comuna):

  1. CAMADA GEOMÉTRICA — BD TOPO "zone_d_activite_ou_d_interet" (ZAI, IGN,
     data.geopf.fr/wfs, aberta, sem chave): polígonos oficiais classificando
     terreno como Sport, Science et enseignement (escolas), Santé,
     Religieux, Industriel et commercial, Gestion des eaux, etc. QUALQUER
     parcela candidata que intersecte um polígono desta camada é excluída —
     nenhuma destas categorias é terreno residencial vendável, seja qual for
     a subcategoria exata (evita ter de adivinhar uma lista fechada de
     categorias "más").
  2. CAMADA GEOMÉTRICA — BD TOPO "cimetiere" (cemitérios), camada própria
     e separada da ZAI na nomenclatura do IGN.
  3. CAMADA TEXTUAL (heurística, complementar) — a API GPU zone-urba devolve
     não só o código curto da zona ("libelle", ex. "UE") mas também a
     DESCRIÇÃO LONGA ("libelong", ex. "Equipement public et/ou d'intérêt
     collectif", "Zone des parcs urbains", "Zone de tourisme du coeur de
     ville"). O script original só guardava o código curto, cuja convenção
     varia por comuna (confirmado: 62 códigos curtos distintos nas 26
     comunas, muitos sem significado óbvio a partir da sigla). A descrição
     longa usa vocabulário muito mais consistente entre comunas — filtra-se
     por palavras-chave nela (ver LIBELONG_EXCLUSAO_KEYWORDS) como rede de
     segurança adicional para casos que as camadas geométricas 1-2 não
     cubram (ex. uma zona reservada a um equipamento ainda por construir).

  4. SINAL INFORMATIVO (não exclui automaticamente) — para cada candidato
     que SOBREVIVE às 3 camadas acima, consulta-se a API de geocodificação
     inversa do IGN (data.geopf.fr/geocodage/reverse, índice "poi") para
     ver se existe um equipamento público NOMEADO muito perto do centroide
     (< POI_ALERTA_RAIO_M). Se sim, a coluna `poi_alerta` documenta o quê e
     a que distância, para revisão manual do Ricardo antes de contactar —
     não se exclui automaticamente por proximidade (risco de excluir
     terrenos genuinamente livres só por estarem perto, não dentro, de um
     equipamento).

Todas as exclusões (camadas 1-3) são registadas em
`terrenos_excluidos_auditoria.csv` com o motivo exato, para poder ser
auditado/revisto — nunca desaparecem silenciosamente.

SEGUNDA RONDA DE VERIFICAÇÃO (2026-09-12, mesma auditoria): testados mais 7
códigos de zona distintos (das 20 parcelas com maior área na lista antiga)
para confirmar que a heurística de libelong generaliza a comunas/PLUs além
dos 4 primeiros casos:
  - "UF" (Publier) -> "Zone urbaine liée à l'emprise ferroviaire" (via férrea)
  - "UXa" (Allinges) -> "Zone d'activités économiques"
  - "UZ" (Évian) -> "Zone d'activités correspondant à l'emprise du domaine
    ferroviaire" (via férrea)
  - "UEs" (Lugrin) -> "Zone d'equipements structurants"
  - "UX" (Publier) -> "Zone urbaine à vocation d'activités industrielles et
    artisanales"
  - "UXd" (Anthy-sur-Léman) -> "Zone d'activités économiques"
  Todos os 6 acima confirmam-se corretamente excluídos pelas palavras-chave
  já previstas ("ferroviaire" foi adicionado à lista nesta ronda).
  - "UR" (Thonon, "Zone du village lacustre de Port Ripaille") -> caso
    CONTRÁRIO, importante: o nome da zona não bate com nenhuma palavra-chave
    e a consulta ao sinal informativo (geocodificação inversa) mostrou que
    "Port Ripaille" é o nome de um bairro/porto de lazer à beira-lago
    (categorias "port"/"zone d'habitation"), não um equipamento público —
    ou seja, este candidato deve mesmo SOBREVIVER ao filtro. Prova de que a
    heurística de libelong não está a excluir em excesso por simples
    estranheza do nome da zona; ver test_libelong_casos_reais() em
    test_terrenos_filtro.py, caso "Port Ripaille".

LIMITAÇÃO DESTA CORREÇÃO, DOCUMENTADA: as camadas 1-3 foram validadas com
chamadas reais à API em pontos individuais (ver as duas rondas de
verificação acima, e ficheiros de teste `test_terrenos_filtro.py`, que usa
respostas fabricadas com a MESMA estrutura de campos confirmada em
produção) mas o RE-PROCESSAMENTO COMPLETO das 26 comunas com este novo
filtro ainda não foi corrido num ambiente com acesso de rede irrestrito —
correr `python enrich_terrenos_livres.py` (ou o pipeline completo) para
regenerar `terrenos_livres_potencial.csv` antes de publicar no dashboard.
---------------------------------------------------------------------------

MÉTODO (fontes de dados abertas, sem chave):
  1. Cadastre (cadastre.data.gouv.fr, bundler cadastre-etalab): camada
     "parcelles" (já usada por enrich_cadastre.py, mesma cache) e camada
     "batiments" (polígonos de edifícios). Uma parcela é candidata a
     "terreno livre" se (a) a sua área (`contenance`) for >=
     TERRENO_LIVRE_SURFACE_MIN, e (b) NÃO intersectar nenhum polígono de
     edifício da mesma comuna.
  2. Géoportail de l'Urbanisme, via API Carto do IGN (apicarto.ign.fr,
     aberta, sem chave), módulo GPU, endpoint zone-urba. Devolve a zona do
     PLU (typezone: U/AU/A/N) e a descrição longa da zona no centroide da
     parcela candidata. Só as parcelas em zona "U" (urbana, construtível
     desde já) entram na lista final — decisão explícita do Ricardo
     (12/set), para evitar parcelas "a urbanizar" (AU) que podem nunca ser
     abertas à construção.
  3. BD TOPO (IGN, data.geopf.fr/wfs, aberta, sem chave): camadas
     "zone_d_activite_ou_d_interet" e "cimetiere" — ver auditoria acima.
  4. Geocodificação inversa do IGN (data.geopf.fr/geocodage, índice "poi")
     — sinal informativo complementar, ver auditoria acima.

LIMITAÇÕES CONHECIDAS (documentadas, não bugs):
  - Um pequeno anexo/arrumo no terreno (barracão, piscina com caseta, etc.)
    faz a parcela ser tratada como "já construída" e excluída — viés
    conservador (perdem-se alguns bons candidatos) preferido a incluir
    parcelas que já têm uma casa a mais.
  - Comunas sem PLU aprovado (regidas pelo Règlement National d'Urbanisme)
    não têm zonagem na API GPU — essas parcelas ficam sem zona e são
    excluídas por omissão (não há como confirmar "U" sem PLU). Isto reduz
    a cobertura em comunas rurais mais pequenas, mas evita incluir
    parcelas sem confirmação de construtibilidade.
  - A zona é consultada no CENTROIDE da parcela, não no polígono completo —
    uma parcela muito grande a cavalo de duas zonas pode ser classificada
    só pela zona do seu centro.
  - As camadas ZAI/cimetiere (BD TOPO) e a heurística de libelong reduzem
    MUITO os falsos positivos observados, mas não há garantia de cobertura
    a 100 % — daí o sinal `poi_alerta` informativo e o ficheiro de
    auditoria de exclusões, para permitir revisão contínua.

Usage:
    python enrich_terrenos_livres.py
"""
import json
import os
import time

import pandas as pd
import requests

from config import ALL_COMMUNES
from http_utils import build_session

try:
    from shapely.geometry import shape
    from shapely.strtree import STRtree
    HAS_SHAPELY = True
except ImportError:
    HAS_SHAPELY = False

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "output")
CACHE_PARCELLES_DIR = os.path.join(DATA_DIR, "_cache", "cadastre")
CACHE_BATIMENTS_DIR = os.path.join(DATA_DIR, "_cache", "cadastre_batiments")
CACHE_ZAI_DIR = os.path.join(DATA_DIR, "_cache", "bdtopo_zai")
CACHE_CIMETIERE_DIR = os.path.join(DATA_DIR, "_cache", "bdtopo_cimetiere")

CADASTRE_URL_TEMPLATE = (
    "https://cadastre.data.gouv.fr/bundler/cadastre-etalab/communes/"
    "{code}/geojson/{camada}"
)
FORCE_REDOWNLOAD = os.environ.get("FORCE_REDOWNLOAD") == "1"

GPU_ZONE_URBA_URL = "https://apicarto.ign.fr/api/gpu/zone-urba"
GPU_SLEEP = 0.2   # nenhum limite publicado -- 5 pedidos/s por precaução
GPU_TIMEOUT = 20

# BD TOPO via WFS do Géoplateforme IGN (data.geopf.fr) — aberto, sem chave.
# Confirmado em produção (2026-09-12): nomes de camada e de campos exatos
# ("categorie", "nature", "toponyme" para a ZAI; "nature" para cimetiere).
WFS_BASE_URL = "https://data.geopf.fr/wfs/ows"
WFS_TIMEOUT = 30
WFS_TYPENAME_ZAI = "BDTOPO_V3:zone_d_activite_ou_d_interet"
WFS_TYPENAME_CIMETIERE = "BDTOPO_V3:cimetiere"
BBOX_BUFFER_DEG = 0.003  # ~250-330 m consoante a latitude -- margem para
                          # apanhar equipamentos mesmo perto do limite da
                          # comuna, sem pedidos WFS excessivamente grandes.

# Geocodificação inversa do IGN — sinal informativo complementar (não
# exclui automaticamente, ver auditoria acima).
POI_REVERSE_URL = "https://data.geopf.fr/geocodage/reverse"
POI_ALERTA_RAIO_M = 60
POI_TIMEOUT = 15
ENABLE_POI_CHECK = True

# ---------------------------------------------------------------------------
# PARÂMETROS -- decisão explícita do Ricardo (12/set/2026)
TERRENO_LIVRE_SURFACE_MIN = 500       # m2 -- tamanho típico mínimo p/ moradia
GPU_ZONAS_INCLUIDAS = {"U"}           # só zonas já construtíveis hoje (não "AU")
# ---------------------------------------------------------------------------

# Palavras-chave (minúsculas, sem acentuação estrita -- ver _normalizar) que,
# encontradas na descrição longa da zona PLU (libelong), indicam uma zona
# reservada a equipamento público/coletivo, turismo, indústria, culto ou
# similar -- nunca terreno residencial vendável. Rede de segurança
# complementar às camadas geométricas ZAI/cimetiere (auditoria 2026-09-12).
LIBELONG_EXCLUSAO_KEYWORDS = [
    "equipement", "equipament",
    "sport", "stade", "piscine", "gymnase",
    "scolaire", "ecole", "college", "lycee", "enseignement", "universit",
    "camping", "touris", "loisir", "hebergement",
    "cimetiere", "funeraire",
    "culte", "eglise", "chapelle", "temple", "cultuel", "religieu",
    "hopital", "clinique", "sante", "maison de retraite", "ehpad",
    "caserne", "pompier", "incendie", "gendarmerie", "securite civile",
    "militaire", "defense",
    "parc urbain", "parcs urbains", "espace vert", "jardin public",
    "activite economique", "activites economiques", "industri", "artisanal",
    "gestion des eaux", "epuration", "assainissement", "dechet",
    "administrati", "mairie", "service public",
    "ferroviaire", "chemin de fer", "emprise sncf",
]


def _normalizar(texto):
    """Minúsculas e sem a maioria dos acentos franceses comuns, para que a
    correspondência de palavras-chave não dependa de acentuação exata."""
    if not texto:
        return ""
    t = texto.lower()
    substituicoes = {
        "é": "e", "è": "e", "ê": "e", "ë": "e",
        "à": "a", "â": "a",
        "î": "i", "ï": "i",
        "ô": "o",
        "û": "u", "ù": "u", "ü": "u",
        "ç": "c",
    }
    for a, b in substituicoes.items():
        t = t.replace(a, b)
    return t


def libelong_indica_exclusao(libelong):
    """True se a descrição longa da zona PLU contiver uma palavra-chave de
    exclusão (ver LIBELONG_EXCLUSAO_KEYWORDS). Função pura, testável sem
    rede -- ver test_terrenos_filtro.py."""
    if not libelong:
        return False, None
    t = _normalizar(libelong)
    for kw in LIBELONG_EXCLUSAO_KEYWORDS:
        if kw in t:
            return True, kw
    return False, None


def _fetch_layer(code_insee, camada, cache_dir):
    cache_path = os.path.join(cache_dir, f"{code_insee}.geojson")
    if not FORCE_REDOWNLOAD and os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)
    url = CADASTRE_URL_TEMPLATE.format(code=code_insee, camada=camada)
    try:
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        data = r.json()
    except (requests.RequestException, ValueError) as e:
        print(f"    {code_insee} ({camada}): injoignable ({e})")
        return None
    os.makedirs(cache_dir, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return data


def _geojson_bbox(gj, buffer_deg=BBOX_BUFFER_DEG):
    """Bounding box (minx, miny, maxx, maxy) de todas as features de um
    GeoJSON, com uma margem em graus. Usado para delimitar o pedido WFS às
    camadas BD TOPO em torno da comuna, sem depender de uma lista de bboxes
    codificada à mão."""
    minx = miny = None
    maxx = maxy = None
    for feat in gj.get("features", []):
        try:
            geom = shape(feat["geometry"])
        except Exception:
            continue
        b = geom.bounds  # (minx, miny, maxx, maxy)
        minx = b[0] if minx is None else min(minx, b[0])
        miny = b[1] if miny is None else min(miny, b[1])
        maxx = b[2] if maxx is None else max(maxx, b[2])
        maxy = b[3] if maxy is None else max(maxy, b[3])
    if minx is None:
        return None
    return (minx - buffer_deg, miny - buffer_deg, maxx + buffer_deg, maxy + buffer_deg)


def _fetch_wfs_layer(code_insee, typename, bbox, cache_dir, session):
    """Descarrega (com cache em disco) uma camada BD TOPO via WFS do IGN
    (Géoplateforme, data.geopf.fr) delimitada ao bounding box da comuna.
    Devolve o GeoJSON bruto, ou None se inacessível/vazio."""
    cache_path = os.path.join(cache_dir, f"{code_insee}.geojson")
    if not FORCE_REDOWNLOAD and os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)
    minx, miny, maxx, maxy = bbox
    params = {
        "SERVICE": "WFS",
        "VERSION": "2.0.0",
        "REQUEST": "GetFeature",
        "TYPENAMES": typename,
        "OUTPUTFORMAT": "application/json",
        "SRSNAME": "EPSG:4326",
        "BBOX": f"{minx},{miny},{maxx},{maxy},EPSG:4326",
    }
    try:
        r = session.get(WFS_BASE_URL, params=params, timeout=WFS_TIMEOUT)
        r.raise_for_status()
        data = r.json()
    except (requests.RequestException, ValueError) as e:
        print(f"    {code_insee} (WFS {typename}): injoignable ({e})")
        return None
    os.makedirs(cache_dir, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return data


def geoms_com_atributo(gj, campo_motivo, valor_fixo=None):
    """A partir de um GeoJSON, devolve lista de (geom, motivo) -- motivo é
    o valor de `campo_motivo` nas properties (ex. 'categorie'/'nature'
    combinados), ou `valor_fixo` se dado (para camadas sem categorização,
    ex. cimetiere). Função pura, testável sem rede."""
    out = []
    if not gj:
        return out
    for feat in gj.get("features", []):
        props = feat.get("properties") or {}
        try:
            geom = shape(feat["geometry"])
        except Exception:
            continue
        if valor_fixo is not None:
            motivo = valor_fixo
        else:
            motivo = props.get(campo_motivo) or "instalação pública/de interesse coletivo"
            nome = props.get("toponyme")
            if nome:
                motivo = f"{motivo} ({nome})"
        out.append((geom, motivo))
    return out


def build_instalacoes_tree(geoms_com_motivo):
    """STRtree + lista paralela de motivos, a partir de uma lista de
    (geom, motivo). Devolve (tree, geoms, motivos) ou (None, [], []) se
    vazio."""
    if not geoms_com_motivo:
        return None, [], []
    geoms = [g for g, _ in geoms_com_motivo]
    motivos = [m for _, m in geoms_com_motivo]
    return STRtree(geoms), geoms, motivos


def encontra_instalacao_sobreposta(geom, tree, geoms, motivos):
    """Devolve o motivo (string) da primeira instalação pública que
    intersecte `geom`, ou None. Função pura, testável sem rede."""
    if tree is None:
        return None
    for j in tree.query(geom):
        if geom.intersects(geoms[j]):
            return motivos[j]
    return None


def find_parcelas_livres(code_insee, session):
    """Devolve (candidatas, excluidas) para uma comuna.

    candidatas: parcelas >= TERRENO_LIVRE_SURFACE_MIN m2, sem edifício
    sobreposto E sem sobreposição com instalação pública/de interesse
    coletivo conhecida (ZAI, cimetiere) -- ver auditoria 2026-09-12 no
    topo do ficheiro. Cada item inclui o centroide.

    excluidas: candidatas que passaram no teste de área+edifício mas foram
    excluídas pela camada de instalações públicas, com o motivo -- para o
    ficheiro de auditoria."""
    if not HAS_SHAPELY:
        return [], []

    parcelles_gj = _fetch_layer(code_insee, "parcelles", CACHE_PARCELLES_DIR)
    if not parcelles_gj:
        return [], []
    batiments_gj = _fetch_layer(code_insee, "batiments", CACHE_BATIMENTS_DIR)
    batiment_geoms = []
    if batiments_gj:
        for feat in batiments_gj.get("features", []):
            try:
                batiment_geoms.append(shape(feat["geometry"]))
            except Exception:
                continue
    bat_tree = STRtree(batiment_geoms) if batiment_geoms else None

    bbox = _geojson_bbox(parcelles_gj)
    zai_gj = _fetch_wfs_layer(code_insee, WFS_TYPENAME_ZAI, bbox, CACHE_ZAI_DIR, session) if bbox else None
    cimetiere_gj = _fetch_wfs_layer(code_insee, WFS_TYPENAME_CIMETIERE, bbox, CACHE_CIMETIERE_DIR, session) if bbox else None
    instalacoes = []
    instalacoes += geoms_com_atributo(zai_gj, "categorie")
    instalacoes += geoms_com_atributo(cimetiere_gj, None, valor_fixo="cemitério")
    inst_tree, inst_geoms, inst_motivos = build_instalacoes_tree(instalacoes)

    candidatas = []
    excluidas = []
    for feat in parcelles_gj.get("features", []):
        props = feat.get("properties") or {}
        contenance = props.get("contenance")
        if not contenance or contenance < TERRENO_LIVRE_SURFACE_MIN:
            continue
        try:
            geom = shape(feat["geometry"])
        except Exception:
            continue

        tem_edificio = False
        if bat_tree is not None:
            for j in bat_tree.query(geom):
                if geom.intersects(batiment_geoms[j]):
                    tem_edificio = True
                    break
        if tem_edificio:
            continue

        c = geom.centroid
        base = {
            "parcela_id": props.get("id"),
            "code_insee": code_insee,
            "area_m2": contenance,
            "lon": c.x,
            "lat": c.y,
        }

        motivo_instalacao = encontra_instalacao_sobreposta(geom, inst_tree, inst_geoms, inst_motivos)
        if motivo_instalacao:
            excluidas.append({**base, "motivo_exclusao": f"BD TOPO: {motivo_instalacao}"})
            continue

        candidatas.append(base)
    return candidatas, excluidas


def consultar_zona_plu(lon, lat, session):
    """Consulta a zona do PLU no centroide via API Carto (GPU). Devolve
    (typezone, libelle, libelong) ou (None, None, None) se não houver
    zonagem disponível (comuna sem PLU, ou API inacessível). `libelong` é a
    descrição longa da zona (ex. "Zone des parcs urbains") -- ver
    LIBELONG_EXCLUSAO_KEYWORDS e a auditoria 2026-09-12 no topo do
    ficheiro."""
    geom = json.dumps({"type": "Point", "coordinates": [lon, lat]})
    try:
        r = session.get(GPU_ZONE_URBA_URL, params={"geom": geom}, timeout=GPU_TIMEOUT)
        r.raise_for_status()
        feats = r.json().get("features", [])
    except (requests.RequestException, ValueError):
        return None, None, None
    if not feats:
        return None, None, None
    props = feats[0].get("properties") or {}
    return props.get("typezone"), props.get("libelle"), props.get("libelong")


def consultar_poi_alerta(lon, lat, session, raio_m=POI_ALERTA_RAIO_M):
    """Sinal INFORMATIVO complementar (não exclui automaticamente, ver
    auditoria 2026-09-12): devolve uma string "<nome> (<categoria>, a
    <dist>m)" se existir um ponto de interesse do IGN a menos de `raio_m`
    metros do centroide, senão None."""
    try:
        r = session.get(
            POI_REVERSE_URL,
            params={"lon": lon, "lat": lat, "index": "poi", "limit": 1},
            timeout=POI_TIMEOUT,
        )
        r.raise_for_status()
        feats = r.json().get("features", [])
    except (requests.RequestException, ValueError):
        return None
    if not feats:
        return None
    props = feats[0].get("properties") or {}
    dist = props.get("distance")
    if dist is None or dist > raio_m:
        return None
    nomes = props.get("name") or []
    categorias = props.get("category") or []
    nome = nomes[0] if nomes else (props.get("toponym") or "?")
    categoria = categorias[0] if categorias else "?"
    return f"{nome} ({categoria}, a {int(dist)}m)"


OUT_COLUMNS = [
    "parcela_id", "code_insee", "commune", "area_m2",
    "zona_plu", "zona_libelle", "poi_alerta", "lon", "lat", "link_mapa",
]
EXCLUIDOS_COLUMNS = [
    "parcela_id", "code_insee", "commune", "area_m2", "motivo_exclusao", "lon", "lat",
]


def main():
    if not HAS_SHAPELY:
        print("shapely non installé — recherche de terrains libres sautée "
              "(pip install shapely).")
        pd.DataFrame(columns=OUT_COLUMNS).to_csv(
            os.path.join(OUTPUT_DIR, "terrenos_livres_potencial.csv"), index=False)
        return

    session = build_session()
    all_rows = []
    excluidos_rows = []
    n_sem_plu = 0
    n_excl_bdtopo = 0
    n_excl_libelong = 0
    print(f"Procura de terrenos livres (>= {TERRENO_LIVRE_SURFACE_MIN} m², "
          f"zona {'/'.join(sorted(GPU_ZONAS_INCLUIDAS))}) em "
          f"{len(ALL_COMMUNES)} comunas...")
    for code, nome in ALL_COMMUNES.items():
        candidatas, excluidas_bdtopo = find_parcelas_livres(code, session)
        for e in excluidas_bdtopo:
            excluidos_rows.append({
                "parcela_id": e["parcela_id"], "code_insee": code, "commune": nome,
                "area_m2": e["area_m2"], "motivo_exclusao": e["motivo_exclusao"],
                "lon": round(e["lon"], 6), "lat": round(e["lat"], 6),
            })
        n_excl_bdtopo += len(excluidas_bdtopo)

        n_zona_ok = 0
        for c in candidatas:
            typezone, libelle, libelong = consultar_zona_plu(c["lon"], c["lat"], session)
            time.sleep(GPU_SLEEP)
            if typezone is None:
                n_sem_plu += 1
                continue
            if typezone not in GPU_ZONAS_INCLUIDAS:
                continue
            excluir_libelong, kw = libelong_indica_exclusao(libelong)
            if excluir_libelong:
                n_excl_libelong += 1
                excluidos_rows.append({
                    "parcela_id": c["parcela_id"], "code_insee": code, "commune": nome,
                    "area_m2": c["area_m2"],
                    "motivo_exclusao": f"zona PLU '{libelong}' (palavra-chave: {kw})",
                    "lon": round(c["lon"], 6), "lat": round(c["lat"], 6),
                })
                continue

            poi_alerta = None
            if ENABLE_POI_CHECK:
                poi_alerta = consultar_poi_alerta(c["lon"], c["lat"], session)
                time.sleep(GPU_SLEEP)

            n_zona_ok += 1
            all_rows.append({
                "parcela_id": c["parcela_id"],
                "code_insee": code,
                "commune": nome,
                "area_m2": c["area_m2"],
                "zona_plu": typezone,
                "zona_libelle": libelle,
                "poi_alerta": poi_alerta,
                "lon": round(c["lon"], 6),
                "lat": round(c["lat"], 6),
                "link_mapa": f"https://www.google.com/maps?q={c['lat']:.6f},{c['lon']:.6f}",
            })
        print(f"  {nome:26s} {n_zona_ok:>4} terreno(s) livre(s) em zona "
              f"construtível (de {len(candidatas)} candidatas sem edifício, "
              f"{len(excluidas_bdtopo)} excluída(s) por BD TOPO)")

    df = pd.DataFrame(all_rows, columns=OUT_COLUMNS)
    if not df.empty:
        df = df.sort_values("area_m2", ascending=False)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out = os.path.join(OUTPUT_DIR, "terrenos_livres_potencial.csv")
    df.to_csv(out, index=False)

    df_excl = pd.DataFrame(excluidos_rows, columns=EXCLUIDOS_COLUMNS)
    if not df_excl.empty:
        df_excl = df_excl.sort_values("area_m2", ascending=False)
    out_excl = os.path.join(OUTPUT_DIR, "terrenos_excluidos_auditoria.csv")
    df_excl.to_csv(out_excl, index=False)

    print(f"\nOK — {len(df):,} terrenos livres com potencial -> {out}")
    print(f"  ({n_excl_bdtopo:,} excluídos por sobreposição com BD TOPO "
          f"[escolas/desporto/saúde/culto/indústria/cemitérios/etc.], "
          f"{n_excl_libelong:,} excluídos pela descrição da zona PLU "
          f"-> auditoria completa em {out_excl})")
    if n_sem_plu:
        print(f"  ({n_sem_plu:,} parcelas sem edifício ficaram sem zona PLU "
              f"conhecida na API GPU e foram excluídas -- comuna sem PLU "
              f"aprovado, ou zona não mapeada)")
    print("\nESTA LISTA NÃO TEM DADOS DE PROPRIETÁRIO (não existem em dados "
          "abertos para parcelas não construídas). Para cada parcela de "
          "interesse, pede um extrato da matriz cadastral na câmara "
          "municipal (grátis) para identificar o proprietário.")
    print("\nA coluna 'poi_alerta' é um sinal informativo (não excluiu "
          "automaticamente) -- confirma sempre visualmente (link_mapa) "
          "antes de contactar quando ela estiver preenchida.")


if __name__ == "__main__":
    main()
