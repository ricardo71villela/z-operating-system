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

DVF_YEARS = list(range(2019, 2025))
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
# SEUILS DE SEGMENTATION — DERIVES DE LA FENETRE DVF, PAS FIXES EN DUR
#
# PIEGE HISTORIQUE : le DVF publie ne couvre que les ~5-6 dernieres annees
# glissantes. Avec des seuils ecrits en dur a 8 et 15 ans, l'anciennete
# maximale calculable (7 ans) etait INFERIEURE au seuil le plus bas :
# le segment intermediaire ne recevait jamais aucune adresse, et deux poids
# de scoring sur quatre etaient inatteignables. Le decoupage affichait trois
# niveaux alors qu'il n'en produisait que deux.
#
# Les seuils sont donc calcules a partir de la fenetre reellement disponible.
# Si data.gouv elargit ou reduit sa fenetre, ils suivent automatiquement.
import datetime as _dt

FENETRE_DVF_ANS = _dt.date.today().year - min(DVF_YEARS)

SEGMENT_THRESHOLDS = {
    # Aucune vente connue, ou vente en tout debut de fenetre
    "POTENTIEL_ELEVE": max(2, round(FENETRE_DVF_ANS * 0.70)),
    "POTENTIEL_MOYEN": max(1, round(FENETRE_DVF_ANS * 0.40)),
}


def valider_seuils():
    """Verifie que chaque seuil reste atteignable dans la fenetre DVF.

    Ce garde-fou empeche le bug historique de revenir silencieusement.
    """
    pbs = []
    for nom, seuil in SEGMENT_THRESHOLDS.items():
        if seuil > FENETRE_DVF_ANS:
            pbs.append(f"{nom} ({seuil} ans) > fenetre DVF ({FENETRE_DVF_ANS} ans)")
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
    "dpe_G":                    25,
    "dpe_F":                    20,
    "dpe_E":                    12,
    "dpe_D":                     5,

    # Bâti ancien = plus de probabilité de mutation / travaux
    "construit_avant_1948":     15,
    "construit_1948_1974":      10,
    "construit_1975_1999":       5,

    # Maison individuelle : mandat généralement plus rémunérateur
    "type_maison":              10,

    # Grande surface
    "surface_100m2_plus":       10,
    "surface_70_100m2":          5,
}

# Classes DPE considérées comme "passoire thermique"
PASSOIRES = {"E", "F", "G"}
