"""
Score de priorite de prospection (0-100).

Le tier seul (ancien systeme) ne dit que "pas vendu depuis longtemps".
Le score combine plusieurs signaux commerciaux reels :
  - anciennete de la derniere vente connue (DVF)
  - passoire thermique (DPE E/F/G) : levier reglementaire fort
        G interdit a la location depuis le 01/01/2025
        F a partir du 01/01/2028, E a partir du 01/01/2034
  - anciennete du bati (DPE) : plus de mutations et de travaux
  - typologie maison : mandat generalement plus remunerateur
  - grande surface

Les poids sont dans config.SCORING — ajuste-les selon ta strategie.
"""
import datetime

import pandas as pd

from config import (SCORING, SURFACE_PTS_MAX,
                    SURFACE_PTS_REF, PIECES_SEUIL, PIECES_PTS_PAR_PIECE,
                    PIECES_PTS_MAX, TERRAIN_SEUIL_GRAND, TERRAIN_SEUIL_MOYEN,
                    TERRAIN_SURFACE_PLAUSIBLE_MAX)

CURRENT_YEAR = datetime.date.today().year

# Part des points accordee au second critere du groupe correle {DPE, bati}
POIDS_SECOND_CORRELE = 1 / 3

# MISE A JOUR (2026-09-10) : SEGMENT_THRESHOLDS n'est plus importe comme
# constante figee au chargement de ce module — voir config.py, piege v3.
# Il est desormais calcule par segment.py APRES chargement du DVF reel (les
# annees effectivement obtenues, pas seulement tentees), et passe en
# parametre explicite a chaque fonction qui en a besoin ci-dessous.


def _pts_anciennete_vente(annee, seuils):
    if pd.isna(annee):
        return SCORING["jamais_vendu"], "aucune vente sur la fenêtre DVF"
    ans = CURRENT_YEAR - int(annee)
    if ans >= seuils["POTENTIEL_ELEVE"]:
        return SCORING["vente_ancienne"], f"dernière vente il y a {ans} ans"
    if ans >= seuils["POTENTIEL_MOYEN"]:
        return SCORING["vente_intermediaire"], f"dernière vente il y a {ans} ans"
    return SCORING["vente_recente"], f"vendu récemment (il y a {ans} ans)"


def _pts_dpe(classe):
    if not isinstance(classe, str) or classe not in "DEFG" or classe == "":
        return 0, None
    key = f"dpe_{classe}"
    pts = SCORING.get(key, 0)
    if pts == 0:
        return 0, None
    label = f"DPE {classe}"
    if classe in ("E", "F", "G"):
        label += " (passoire thermique)"
    return pts, label


def _pts_annee_construction(annee):
    if pd.isna(annee):
        return 0, None
    a = int(annee)
    if a < 1948:
        return SCORING["construit_avant_1948"], f"bâti ancien ({a})"
    if a < 1975:
        return SCORING["construit_1948_1974"], f"bâti {a}"
    if a < 2000:
        return SCORING["construit_1975_1999"], f"bâti {a}"
    if a <= 2016:
        return SCORING["construit_2000_2016"], f"bâti {a}"
    return 0, None


def _pts_type(type_bien):
    if isinstance(type_bien, str) and type_bien.strip().lower().startswith("maison"):
        return SCORING["type_maison"], "maison individuelle"
    return 0, None


def _pts_surface(surface):
    """Bareme continu (remplace les anciens paliers plats 70/100 m²).

    Un pallier plat donnait les memes points a un bien de 100 m² et de
    300 m² : toute la fourchette haute du parc se retrouvait au meme score.
    Voir la note dans config.py.
    """
    if pd.isna(surface):
        return 0, None
    s = float(surface)
    if s <= 0:
        return 0, None
    pts = round(min(s, SURFACE_PTS_REF) / SURFACE_PTS_REF * SURFACE_PTS_MAX)
    if pts <= 0:
        return 0, None
    label = f"grande surface ({s:.0f} m²)" if s >= 100 else f"surface {s:.0f} m²"
    return pts, label


def _pts_terrain(surface_terrain, type_bien):
    """Grand terrain (cadastre) sous un bati modeste : potentiel de
    valorisation independant des autres criteres (extension, division).

    BUG CORRIGE (audit 2026-09-07) : ce bonus etait attribue a toute
    adresse avec une grande parcelle cadastrale, MEME un appartement (qui
    n'a individuellement aucun droit sur le terrain — c'est une partie
    commune de copropriete) ou une adresse de type inconnu. Sur les
    donnees reelles, cela contaminait 85 % de la liste prioritaire, avec
    des parcelles allant jusqu'a 227 hectares attribuees a une seule
    morada (quasi certainement une parcelle agricole/d'alpage indivise en
    zone de montagne, pas un jardin prive — voir config.py). Double
    garde-fou desormais : reserve aux maisons, et plafonne a une taille de
    parcelle individuelle plausible."""
    if pd.isna(surface_terrain):
        return 0, None
    if not (isinstance(type_bien, str) and type_bien.strip().lower().startswith("maison")):
        return 0, None
    s = float(surface_terrain)
    if s > TERRAIN_SURFACE_PLAUSIBLE_MAX:
        return 0, None
    if s >= TERRAIN_SEUIL_GRAND:
        return SCORING["terrain_grand"], f"grand terrain ({s:.0f} m²)"
    if s >= TERRAIN_SEUIL_MOYEN:
        return SCORING["terrain_moyen"], f"terrain {s:.0f} m²"
    return 0, None


def _pts_pieces(nb_pieces):
    """Bonus mineur sur le nombre de pieces (signal DVF jusqu'ici inutilise)."""
    if pd.isna(nb_pieces):
        return 0, None
    n = float(nb_pieces)
    if n <= PIECES_SEUIL:
        return 0, None
    pts = min(round((n - PIECES_SEUIL) * PIECES_PTS_PAR_PIECE), PIECES_PTS_MAX)
    if pts <= 0:
        return 0, None
    return pts, f"{int(n)} pièces"


def compute_score(row, seuils):
    """Retourne (score 0-100, motifs concatenes).

    seuils : dict POTENTIEL_ELEVE/POTENTIEL_MOYEN, calcule par segment.py
    sur les annees DVF REELLEMENT obtenues (voir config.compute_segment_thresholds).

    DOUBLE COMPTAGE EVITE : la classe DPE et l'annee de construction
    mesurent largement le meme phenomene (un immeuble de 1930 est presque
    toujours mal classe). Les additionner gonflerait mecaniquement le score
    de tout le bati ancien et ecraserait les autres signaux. On ne retient
    donc que le PLUS FORT des deux, plus une fraction du second pour ne pas
    perdre completement l'information d'un cumul reel.
    Meme regle que dans pricing.py, pour que les deux modules restent
    coherents entre eux.
    """
    total, motifs = 0, []

    # --- Signaux independants : ils se cumulent normalement ---
    for pts, label in (
        _pts_anciennete_vente(row.get("derniere_vente_connue"), seuils),
        _pts_type(row.get("type_bien") or row.get("type_batiment")),
        _pts_surface(row.get("surface_m2") if not pd.isna(row.get("surface_m2"))
                     else row.get("surface_dpe")),
        _pts_pieces(row.get("nb_pieces")),
        _pts_terrain(row.get("surface_terrain_m2"), row.get("type_bien") or row.get("type_batiment")),
    ):
        total += pts
        if label and pts > 0:
            motifs.append(label)

    # --- Groupe correle {DPE, anciennete du bati} ---
    correles = [(p, l) for p, l in (_pts_dpe(row.get("dpe_classe")),
                                    _pts_annee_construction(row.get("annee_construction")))
                if p > 0 and l]
    if correles:
        correles.sort(key=lambda t: t[0], reverse=True)
        total += correles[0][0]
        motifs.append(correles[0][1])
        if len(correles) > 1:
            # le second n'apporte qu'un tiers de ses points (information
            # largement redondante avec le premier)
            appoint = round(correles[1][0] * POIDS_SECOND_CORRELE)
            total += appoint
            motifs.append(f"{correles[1][1]} (+{appoint}, corrélé)")

    return min(total, 100), " | ".join(motifs)


def add_scores(df, seuils):
    """Ajoute les colonnes score_prospection et motifs_score.

    seuils : dict POTENTIEL_ELEVE/POTENTIEL_MOYEN calcule sur les annees DVF
    reellement obtenues (voir config.compute_segment_thresholds), a fournir
    par l'appelant (segment.py) apres chargement des donnees reelles.
    """
    scored = df.apply(compute_score, axis=1, result_type="expand", args=(seuils,))
    df["score_prospection"] = scored[0]
    df["motifs_score"] = scored[1]
    return df


def priority_label(score):
    # MISE A JOUR (2026-09-10) : seuil B abaisse de 50 a 40 (coherent avec
    # SEUIL_PRIORITAIRE dans segment.py, abaisse en meme temps) pour
    # elargir la liste prioritaire sur demande explicite.
    if score >= 70:
        return "A — Priorité maximale"
    if score >= 40:
        return "B — Priorité haute"
    if score >= 30:
        return "C — Priorité moyenne"
    return "D — Priorité faible"


if __name__ == "__main__":
    # Auto-test : verifie que le classement se comporte comme attendu.
    # SEGMENT_THRESHOLDS n'existe plus comme constante (voir config.py,
    # piege v3) : pour ce self-test isole (pas de vrai DVF charge), on
    # calcule des seuils de demonstration sur la plage DVF_YEARS configuree
    # — suffisant pour verifier la LOGIQUE des paliers, pas pour refleter
    # une execution reelle (segment.py le fait avec les vraies annees).
    from config import DVF_YEARS, compute_segment_thresholds
    seuils_test, _, _ = compute_segment_thresholds(min(DVF_YEARS), max(DVF_YEARS))

    cas = [
        # (description, ligne, score attendu min, max)
        ("Maison 1930 DPE G jamais vendue 120m2",
         {"derniere_vente_connue": None, "dpe_classe": "G",
          "annee_construction": 1930, "type_bien": "Maison",
          "surface_m2": 120, "surface_dpe": None}, 85, 95),
        ("Maison 1930 DPE inconnu (bati seul)",
         {"derniere_vente_connue": None, "dpe_classe": None,
          "annee_construction": 1930, "type_bien": "Maison",
          "surface_m2": 120, "surface_dpe": None}, 70, 80),
        ("Appartement neuf vendu l'an dernier, DPE B",
         # borne haute relevee (5->7) : depuis l'echelon 2000-2016 ajoute a
         # SCORING (2026-09-10), un bati de 2015 recoit desormais +2 points
         # d'anciennete (avant : 0, aucun echelon ne couvrait 2000+)
         {"derniere_vente_connue": CURRENT_YEAR - 1, "dpe_classe": "B",
          "annee_construction": 2015, "type_bien": "Appartement",
          "surface_m2": 55, "surface_dpe": None}, 0, 7),
        ("Vente intermediaire (entre les deux seuils)",
         # borne haute relevee deux fois : (1) le bareme de surface continu
         # (config.py) ajoute quelques points meme hors des paliers metier ;
         # (2) l'echelon 2000-2016 (2026-09-10) ajoute +2 pour un bati de
         # 2005, auparavant 0 (aucun echelon ne couvrait 2000+)
         {"derniere_vente_connue": CURRENT_YEAR - seuils_test["POTENTIEL_MOYEN"],
          "dpe_classe": "C", "annee_construction": 2005,
          "type_bien": "Appartement", "surface_m2": 55, "surface_dpe": None},
         20, 27),
        ("Adresse sans aucune donnee",
         {"derniere_vente_connue": None, "dpe_classe": None,
          "annee_construction": None, "type_bien": None,
          "surface_m2": None, "surface_dpe": None}, 40, 40),
    ]
    print("=== Auto-test scoring ===")
    for desc, row, lo, hi in cas:
        s, m = compute_score(pd.Series(row), seuils_test)
        ok = lo <= s <= hi
        print(f"{'OK  ' if ok else 'FAIL'} {s:>3}/100  {priority_label(s):24s} {desc}")
        print(f"       motifs: {m or '(aucun)'}")
        assert ok, (desc, s, lo, hi)
    # Verifie que les trois paliers d'anciennete sont reellement atteignables
    print("\n=== Paliers d'anciennete atteignables ? ===")
    paliers = {
        "jamais vendu": None,
        f">= {seuils_test['POTENTIEL_ELEVE']} ans":
            CURRENT_YEAR - seuils_test["POTENTIEL_ELEVE"],
        f"{seuils_test['POTENTIEL_MOYEN']}-{seuils_test['POTENTIEL_ELEVE']} ans":
            CURRENT_YEAR - seuils_test["POTENTIEL_MOYEN"],
        "recent": CURRENT_YEAR - 1,
    }
    vus = set()
    for nom, an in paliers.items():
        pts, lab = _pts_anciennete_vente(an, seuils_test)
        vus.add(pts)
        print(f"  {nom:22s} -> {pts:>2} pts  ({lab})")
    assert len(vus) >= 3, "Moins de 3 paliers distincts : segmentation degradee"
    print("  -> paliers distincts :", len(vus))

    print("\nTous les cas passent")
