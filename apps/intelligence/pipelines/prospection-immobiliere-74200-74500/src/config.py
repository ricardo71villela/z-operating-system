"""
Configuration du projet de prospection immobilière — secteurs 74200 & 74500

SOURCES (toutes publiques, licence Etalab, aucune donnée personnelle) :
  - BAN   : adresses géolocalisées
  - DVF   : transactions notariées anonymisées
  - DPE   : diagnostics énergétiques ADEME (année construction, classe DPE)

Aucune donnée d'identité de résident ou propriétaire n'est collectée.
"""

DEPARTEMENT = "74"

COMMUNES_74200 = {
    "74281": "Thonon-les-Bains", "74005": "Allinges", "74013": "Anthy-sur-Léman",
    "74020": "Armoy", "74163": "Margencel", "74166": "Marin", "74157": "Lyaud",
    "74222": "Reyvroz", "74295": "La Vernaz", "74129": "La Forclaz",
}

COMMUNES_74500 = {
    "74119": "Évian-les-Bains", "74218": "Publier", "74200": "Neuvecelle",
    "74154": "Lugrin", "74249": "Saint-Paul-en-Chablais", "74172": "Maxilly-sur-Léman",
    "74146": "Larringes", "74033": "Bernex", "74057": "Champanges",
    "74237": "Saint-Gingolph", "74308": "Vinzier", "74279": "Thollon-les-Mémises",
    "74073": "Chevenoz", "74175": "Meillerie", "74203": "Novel", "74127": "Féternes",
}

ALL_COMMUNES = {**COMMUNES_74200, **COMMUNES_74500}
CODE_POSTAL_BY_INSEE = {
    **{c: "74200" for c in COMMUNES_74200},
    **{c: "74500" for c in COMMUNES_74500},
}

# ---------------------------------------------------------------- SOURCES ---

BAN_DEPARTEMENT_URL = (
    f"https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/"
    f"adresses-{DEPARTEMENT}.csv.gz"
)

# NOTE (2026-09) : le portail data.gouv publie une fenetre glissante.
# 2019 et 2020 renvoyaient 404 lors de la premiere verification (execution
# reelle) ; 2021-2024 etaient alors disponibles. Le portail semble avoir
# avance depuis (2025, voire des mises a jour 2026 partielles) -- on tente
# 2025 ici : ingest_dvf.py ignore silencieusement toute annee indisponible
# (voir son except requests.RequestException), donc ceci est sans risque.
# Si un lancement futur echoue a nouveau sur l'annee la plus ancienne,
# retirez-la ici. NE PAS ajouter l'annee en cours si elle n'est que
# partiellement publiee : ca fausserait price_index.py (une demi-annee de
# ventes n'est pas comparable a une annee complete).
#
# MISE A JOUR (2026-09-10) : fenetre elargie de 2021-2025 a 2019-2025 sur
# demande explicite (davantage de biens recemment en vente a capter, avec
# terrain + surface desormais fiables pour les identifier). Sans risque :
# si 2019/2020 sont encore indisponibles, ingest_dvf.py les ignore
# silencieusement et on retombe sur la fenetre precedente.
DVF_YEARS = list(range(2019, 2026))
DVF_URL_TEMPLATE = (
    "https://files.data.gouv.fr/geo-dvf/latest/csv/{year}/departements/"
    + DEPARTEMENT + ".csv.gz"
)

# API DPE ADEME (open data, licence Etalab, 10 appels/s/IP).
# Plusieurs identifiants de jeu de données ont existé : on les essaie dans
# l'ordre et on garde le premier qui répond.
DPE_API_BASE = "https://data.ademe.fr/data-fair/api/v1/datasets"
DPE_DATASETS = [
    "dpe-v2-logements-existants",   # depuis juillet 2021 (principal)
    "dpe03existant",                # alias plus récent rencontré
    "dpe-france",                   # ancien jeu, fallback
]
DPE_PAGE_SIZE = 1000          # max autorisé par page
DPE_MAX_PAGES_PER_COMMUNE = 40  # garde-fou (40 000 DPE/commune max)
DPE_SLEEP = 0.15              # respecte la limite de 10 appels/s

# ------------------------------------------------------------ SEGMENTATION ---

# ---------------------------------------------------------------------------
# SEUILS DE SEGMENTATION — DERIVES DE LA FENETRE DVF REELLEMENT ATTEIGNABLE
#
# PIEGE HISTORIQUE (v1) : seuils ecrits en dur, superieurs a l'anciennete
# maximale calculable -> le segment intermediaire ne recevait jamais aucune
# adresse.
#
# PIEGE HISTORIQUE (v2, reintroduit lors de la correction de la fenetre) :
# calculer la fenetre comme (annee_courante - annee_DVF_min) ignore le
# DECALAGE DE PUBLICATION entre aujourd'hui et la derniere annee DVF
# reellement disponible (~2 ans : en 2026, le DVF le plus recent est 2024).
# Un bien vendu en 2024 a donc au minimum 2 ans d'anciennete AUJOURD'HUI,
# jamais moins -> un seuil "POTENTIEL_MOYEN" a 2 ans rend le segment
# POTENTIEL_FAIBLE structurellement vide (observe en execution reelle).
#
# PIEGE HISTORIQUE (v3, decouvert 2026-09-10) : calculer ANS_MIN/MAX_ATTEIGNABLE
# a partir de DVF_YEARS (la plage QU'ON TENTE de telecharger) plutot que des
# annees REELLEMENT obtenues echoue silencieusement des que ingest_dvf.py
# ignore une annee indisponible (ce qu'il fait deliberement, sans jamais
# arreter le pipeline — voir son except requests.RequestException). Exemple
# concret : DVF_YEARS = 2019-2025, mais 2019/2020 renvoient 404 en pratique
# -> les seuils seraient calcules sur une fenetre de 7 ans qui n'existe pas
# reellement dans dvf_74200_74500.csv (5 ans obtenus), biaisant TOUS les
# seuils vers le haut sans qu'aucune alerte ne se declenche (valider_seuils
# comparait la meme hypothese fausse des deux cotes).
#
# CORRECTION : les seuils ne sont plus des constantes calculees a l'import
# de ce module (donc AVANT tout telechargement reel), mais une FONCTION que
# segment.py appelle APRES avoir charge dvf_74200_74500.csv, avec les
# annees min/max REELLEMENT presentes dans le fichier (dvf["annee_mutation"]).
# DVF_YEARS reste la plage tentee (utile a ingest_dvf.py et a la documentation)
# mais n'entre plus dans le calcul des seuils.
import datetime as _dt

_ANNEE_COURANTE = _dt.date.today().year


def compute_segment_thresholds(annee_dvf_min_reelle, annee_dvf_max_reelle):
    """Calcule les seuils de segmentation a partir des annees REELLEMENT
    presentes dans le DVF charge (pas de la plage seulement tentee au
    telechargement — voir piege v3 ci-dessus).

    Retourne (seuils: dict, ans_min_atteignable: int, ans_max_atteignable: int).
    """
    ans_min = _ANNEE_COURANTE - annee_dvf_max_reelle
    ans_max = _ANNEE_COURANTE - annee_dvf_min_reelle
    fenetre = ans_max - ans_min
    seuils = {
        "POTENTIEL_ELEVE": ans_min + max(2, round(fenetre * 0.70)),
        "POTENTIEL_MOYEN": ans_min + max(1, round(fenetre * 0.40)),
    }
    return seuils, ans_min, ans_max


def valider_seuils(seuils, ans_min_atteignable, ans_max_atteignable):
    """Verifie que chaque seuil reste dans la plage reellement atteignable.

    Deux garde-fous : POTENTIEL_ELEVE ne doit pas depasser l'anciennete
    maximale du jeu (piege v1), et POTENTIEL_MOYEN doit rester strictement
    au-dessus de l'anciennete minimale atteignable aujourd'hui (piege v2 -
    sinon POTENTIEL_FAIBLE ne recoit jamais aucune adresse a cause du
    decalage de publication du DVF).
    """
    pbs = []
    if seuils["POTENTIEL_ELEVE"] > ans_max_atteignable:
        pbs.append(
            f"POTENTIEL_ELEVE ({seuils['POTENTIEL_ELEVE']} ans) "
            f"> anciennete maximale du jeu DVF ({ans_max_atteignable} ans)"
        )
    if seuils["POTENTIEL_MOYEN"] <= ans_min_atteignable:
        pbs.append(
            f"POTENTIEL_MOYEN ({seuils['POTENTIEL_MOYEN']} ans) "
            f"<= anciennete minimale atteignable aujourd'hui "
            f"({ans_min_atteignable} ans, decalage de publication du DVF) "
            f"- POTENTIEL_FAIBLE resterait vide"
        )
    return pbs

# Score de priorité (0-100). Chaque critère ajoute des points.
# Ajuste ces poids selon ta stratégie commerciale.
SCORING = {
    # Ancienneté de la dernière vente connue (bornes = SEGMENT_THRESHOLDS)
    "jamais_vendu":          40,   # aucune trace DVF sur la fenêtre -> fort
    "vente_ancienne":        40,   # >= seuil POTENTIEL_ELEVE
    "vente_intermediaire":   20,   # entre les deux seuils
    "vente_recente":          0,   # < seuil POTENTIEL_MOYEN

    # Passoire thermique : levier de prospection majeur
    # (interdiction de location : G depuis 2025, F en 2028, E en 2034)
    # Poids leverement releves (25->28, 20->22) : le DPE est le signal le
    # mieux documente du jeu (88 % de couverture constatee) et le plus
    # actionnable (echeance legale connue) — il merite de peser un peu plus
    # que la seule anciennete du bati, qui mesure en partie le meme phenomene.
    "dpe_G":                    28,
    "dpe_F":                    22,
    "dpe_E":                    12,
    "dpe_D":                     5,

    # Bâti ancien = plus de probabilité de mutation / travaux
    "construit_avant_1948":     15,
    "construit_1948_1974":      10,
    "construit_1975_1999":       5,
    # MISE A JOUR (2026-09-10) : nouvel echelon 2000-2016 sur demande
    # explicite ("tous les biens construits jusqu'a 2016 inclus"). Avant
    # cette mise a jour, tout bati >= 2000 recevait 0 point d'anciennete —
    # ce nouvel echelon comble l'ecart avec un bonus modeste (moins que
    # 1975-1999, coherent avec la decroissance des paliers precedents).
    "construit_2000_2016":       2,

    # Maison individuelle : mandat généralement plus rémunérateur
    "type_maison":              10,

    # Terrain (cadastre) : grand terrain sous un bati modeste = potentiel de
    # valorisation (extension, division parcellaire), signal absent de DVF/DPE.
    "terrain_grand":            10,   # >= TERRAIN_SEUIL_GRAND m²
    "terrain_moyen":             5,   # >= TERRAIN_SEUIL_MOYEN m²
}

TERRAIN_SEUIL_GRAND = 1000
TERRAIN_SEUIL_MOYEN = 500

# ---------------------------------------------------------------------------
# PLAFOND DE PLAUSIBILITE DU TERRAIN — audit critique 2026-09-07
#
# BUG CORRIGE : le bonus de terrain et l'argument de vente associe
# ("potentiel de valorisation, extension, division parcellaire") etaient
# jusqu'ici attribues des qu'une parcelle cadastrale faisait >= 500 m²,
# SANS VERIFIER LE TYPE DE BIEN NI PLAFONNER LA TAILLE. Consequence
# constatee sur les donnees reelles : 142 appartements recevaient l'argument
# "votre terrain a un potentiel d'extension" — non-sens juridique pour une
# partie commune de copropriete — et des parcelles de plusieurs DIZAINES
# D'HECTARES (jusqu'a 227 ha sur une seule adresse a Novel) etaient
# attribuees a une seule morada, resultat quasi certain d'un point BAN
# tombant dans une parcelle agricole/forestiere/d'alpage indivise en zone de
# montagne, pas dans le jardin prive de quelqu'un. Le bonus contaminait
# 85 % de la liste prioritaire (voir _pts_terrain dans scoring.py et
# add_terrain_argument dans argumentaire.py).
#
# Double garde-fou desormais applique aux DEUX endroits (score ET argument) :
#   1. Reserve aux MAISONS (type_bien) — jamais aux appartements ni aux
#      biens de type inconnu, qui n'ont individuellement aucun droit sur le
#      terrain meme s'il est grand.
#   2. Plafonne a TERRAIN_SURFACE_PLAUSIBLE_MAX : au-dela, la parcelle est
#      presque toujours collective/agricole/d'alpage, pas un jardin prive —
#      l'attribuer a une seule adresse est un artefact du rapprochement
#      point-dans-polygone (cadastre.data.gouv.fr), pas un vrai signal.
TERRAIN_SURFACE_PLAUSIBLE_MAX = 5000

# ---------------------------------------------------------------------------
# PLAGE DE PLAUSIBILITE DU PRIX AU M² — audit critique 2026-09-07
#
# BUG CORRIGE : le prix de derniere vente affiche par morada (segment.py)
# n'avait aucun filtre de plausibilite, contrairement a la grille de prix
# (pricing.py) et aux statistiques de marche (market_stats.py) qui, elles,
# excluaient deja les valeurs hors de cette plage. Consequence constatee :
# 233 moradas affichaient une mais-value implausible (jusqu'a +880 % ou
# -94 % en 3-5 ans) — cause probable : ventes en nue-propriete entre
# proches (prix tres inferieur au marche, le vendeur gardant l'usufruit),
# mutations multi-lots mal ventilees, ou erreurs de saisie DVF (ex. une
# maison de 64 m² "vendue" 4 700 000 € = 73 438 €/m²).
#
# Ces bornes sont maintenant PARTAGEES entre market_stats.py, pricing.py et
# segment.py (au lieu d'etre dupliquees localement dans chacun), pour que
# le prix par morada individuelle suive exactement la meme regle que les
# agregats.
PRIX_M2_PLAUSIBLE_MIN = 500
PRIX_M2_PLAUSIBLE_MAX = 20000

# ---------------------------------------------------------------------------
# PLAFOND DE PLAUSIBILITE DE LA MAIS-VALUE — audit critique 2026-09-07
#
# BUG RESIDUEL apres le filtre de prix ci-dessus : un prix de vente peut
# etre individuellement plausible (ex. 1 307 €/m², une decote normale pour
# un bien a renover ou une vente familiale) et pourtant produire une
# mais-value calculee absurde une fois compare a l'estimation actuelle —
# ex. +280 % en 4 ans, ce qu'aucun marche immobilier local ne fait. Le
# filtre de PRIX (borne le prix lui-meme) et celui-ci (borne la
# PROGRESSION calculee) attrapent donc deux manifestations differentes du
# meme risque : un ecart de prix qui, individuellement, passe sous le
# radar d'un simple plancher/plafond en €/m².
#
# Sur une fenetre DVF de quelques annees, meme un marche tres dynamique
# n'ajoute normalement pas plus de 100-150 % de valeur, et un bien ne perd
# pas plus de 50-60 % hors sinistre/travaux majeurs (non documentes ici).
# Au-dela, on n'affiche plus l'argument de plus-value PERSONNELLE (il
# retombe alors automatiquement sur l'argument de TENDANCE DE MARCHE
# collective, deja prevu par argumentaire.py::add_market_trend_argument) —
# mais on garde valeur_estimee_actuelle, qui ne depend pas du prix d'achat
# et reste un fait independant.
PLUS_VALUE_PCT_PLAUSIBLE_MAX = 150
PLUS_VALUE_PCT_PLAUSIBLE_MIN = -60

# ---------------------------------------------------------------------------
# POINTS DE SURFACE ET DE NOMBRE DE PIECES — BAREME CONTINU
#
# PIEGE CORRIGE : les anciens paliers plats (10 pts >=100m2, 5 pts 70-100m2,
# 0 sinon) donnaient EXACTEMENT le meme score a un 100m2 et a un 300m2, et
# a un 40m2 et un 69m2. Sur les donnees reelles, la grande majorite des
# adresses "prioritaires" (score >= 50) se retrouvaient ainsi ecrasees sur
# une bande de ~13 points (52-63/100), sans ordre interne utile pour savoir
# par laquelle commencer. Le bareme continu ci-dessous etale ces cas au lieu
# de les aplatir, sans toucher aux poids categoriels ci-dessus (deja calibres
# metier).
SURFACE_PTS_MAX = 12   # points au maximum, atteint a SURFACE_PTS_REF m² et au-dela
SURFACE_PTS_REF = 160  # m² a partir desquels le maximum est atteint

# Nombre de pieces : signal deja present dans les donnees DVF mais jusqu'ici
# jamais utilise par le score. Bonus mineur, plafonne.
PIECES_SEUIL = 3            # a partir de combien de pieces le bonus commence
PIECES_PTS_PAR_PIECE = 1
PIECES_PTS_MAX = 4

# Classes DPE considérées comme "passoire thermique"
PASSOIRES = {"E", "F", "G"}

# ---------------------------------------------------------------------------
# RAPPROCHEMENT SPATIAL (REPLI) — voir segment.py::spatial_fallback_match
#
# Certaines communes rurales ont renumerote leur voirie (numerotation
# metrique / adressage rural) depuis les ventes DVF historiques : le nom de
# voie normalise concorde toujours, mais le numero de rue a change pour la
# meme maison, et le rapprochement par cle (numero, voie) echoue alors meme
# que la vente existe (constate a 0,1% d'appariement sur Anthy-sur-Leman,
# contre 5-24% ailleurs, alors que 938 ventes DVF y sont bien enregistrees).
#
# SPATIAL_MATCH_RADIUS_M borne le repli par proximite geographique : au-dela
# de cette distance entre l'adresse BAN et la mutation DVF la plus proche
# (meme commune), on considere qu'il s'agit probablement d'un autre
# batiment et on laisse le champ vide plutot que de risquer un faux
# rapprochement. 40 m couvre une renumerotation de voirie sans confondre
# deux parcelles voisines distinctes.
SPATIAL_MATCH_RADIUS_M = 40
