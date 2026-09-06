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
# 2019 et 2020 renvoient desormais 404 (verifie en execution reelle) ;
# seuls 2021-2024 sont disponibles. Si un lancement futur echoue a
# nouveau sur l'annee la plus ancienne, retirez-la ici.
DVF_YEARS = list(range(2021, 2025))
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
# Les seuils sont donc calcules sur la plage d'anciennete REELLEMENT
# atteignable par une vente du jeu DVF, aujourd'hui :
#   ANS_MIN_ATTEIGNABLE = annee_courante - max(DVF_YEARS)  (vente la + recente possible)
#   ANS_MAX_ATTEIGNABLE = annee_courante - min(DVF_YEARS)  (vente la + ancienne du jeu)
# et positionnes STRICTEMENT au-dessus d'ANS_MIN_ATTEIGNABLE, pour que les
# trois segments restent atteignables meme avec le decalage de publication.
import datetime as _dt

_ANNEE_COURANTE = _dt.date.today().year
ANS_MIN_ATTEIGNABLE = _ANNEE_COURANTE - max(DVF_YEARS)
ANS_MAX_ATTEIGNABLE = _ANNEE_COURANTE - min(DVF_YEARS)
FENETRE_DVF_ANS = ANS_MAX_ATTEIGNABLE - ANS_MIN_ATTEIGNABLE

SEGMENT_THRESHOLDS = {
    # Aucune vente connue, ou vente en tout debut de fenetre
    "POTENTIEL_ELEVE": ANS_MIN_ATTEIGNABLE + max(2, round(FENETRE_DVF_ANS * 0.70)),
    "POTENTIEL_MOYEN": ANS_MIN_ATTEIGNABLE + max(1, round(FENETRE_DVF_ANS * 0.40)),
}


def valider_seuils():
    """Verifie que chaque seuil reste dans la plage reellement atteignable.

    Deux garde-fous : POTENTIEL_ELEVE ne doit pas depasser l'anciennete
    maximale du jeu (piege v1), et POTENTIEL_MOYEN doit rester strictement
    au-dessus de l'anciennete minimale atteignable aujourd'hui (piege v2 -
    sinon POTENTIEL_FAIBLE ne recoit jamais aucune adresse a cause du
    decalage de publication du DVF).
    """
    pbs = []
    if SEGMENT_THRESHOLDS["POTENTIEL_ELEVE"] > ANS_MAX_ATTEIGNABLE:
        pbs.append(
            f"POTENTIEL_ELEVE ({SEGMENT_THRESHOLDS['POTENTIEL_ELEVE']} ans) "
            f"> anciennete maximale du jeu DVF ({ANS_MAX_ATTEIGNABLE} ans)"
        )
    if SEGMENT_THRESHOLDS["POTENTIEL_MOYEN"] <= ANS_MIN_ATTEIGNABLE:
        pbs.append(
            f"POTENTIEL_MOYEN ({SEGMENT_THRESHOLDS['POTENTIEL_MOYEN']} ans) "
            f"<= anciennete minimale atteignable aujourd'hui "
            f"({ANS_MIN_ATTEIGNABLE} ans, decalage de publication du DVF) "
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
