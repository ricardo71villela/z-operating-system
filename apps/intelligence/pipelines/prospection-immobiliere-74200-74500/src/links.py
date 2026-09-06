"""
Liens Google Maps par adresse.

Trois liens sont generes pour chaque bien :
  - Carte        : localise le point exact
  - Street View  : ouvre la vue immersive -> permet de pre-qualifier un bien
                   (etat de la facade, standing, environnement) sans se
                   deplacer. C'est le plus utile des trois au quotidien.
  - Itineraire   : navigation depuis la position actuelle, pour organiser
                   une tournee de boitage.

On utilise les coordonnees GPS (issues de la BAN) plutot que le texte de
l'adresse : c'est plus fiable, Google n'a pas a re-geocoder et ne risque pas
de tomber sur une rue homonyme dans une autre commune.

Format d'URL : Google Maps URLs API (documente et stable).
"""
import pandas as pd

URL_CARTE = "https://www.google.com/maps/search/?api=1&query={lat},{lon}"
URL_STREET_VIEW = ("https://www.google.com/maps/@?api=1&map_action=pano"
                   "&viewpoint={lat},{lon}")
URL_ITINERAIRE = "https://www.google.com/maps/dir/?api=1&destination={lat},{lon}"


def _coords(row):
    """Retourne (lat, lon) en float, ou None si inutilisable."""
    try:
        lat, lon = float(row["lat"]), float(row["lon"])
    except (TypeError, ValueError, KeyError):
        return None
    if pd.isna(lat) or pd.isna(lon):
        return None
    return lat, lon


def add_links(df):
    """Ajoute les trois colonnes de liens Google Maps."""
    if not {"lat", "lon"} <= set(df.columns):
        return df

    carte, street, itin = [], [], []
    for _, row in df.iterrows():
        c = _coords(row)
        if c is None:
            carte.append(None); street.append(None); itin.append(None)
            continue
        lat, lon = c
        carte.append(URL_CARTE.format(lat=lat, lon=lon))
        street.append(URL_STREET_VIEW.format(lat=lat, lon=lon))
        itin.append(URL_ITINERAIRE.format(lat=lat, lon=lon))

    df["lien_google_maps"] = carte
    df["lien_street_view"] = street
    df["lien_itineraire"] = itin
    return df


# Colonnes de liens -> libelle du bouton affiche dans Excel
EXCEL_LINK_COLUMNS = {
    "lien_google_maps": "Carte",
    "lien_street_view": "Street View",
    "lien_itineraire": "Itinéraire",
}


def excel_hyperlink_frame(df):
    """Remplace les URL brutes par des formules HYPERLINK cliquables.

    On utilise la formule =HYPERLINK() plutot que l'objet hyperlink
    d'openpyxl : Excel limite une feuille a ~65 530 liens objets, ce qui
    peut etre depasse sur le fichier complet. La formule n'a pas cette
    limite. Excel traduit automatiquement le nom de la fonction selon la
    langue de l'interface (LIEN_HYPERTEXTE en francais).
    """
    out = df.copy()
    for col, label in EXCEL_LINK_COLUMNS.items():
        if col in out.columns:
            out[col] = out[col].apply(
                lambda u: f'=HYPERLINK("{u}","{label}")'
                if isinstance(u, str) and u else None)
    return out


if __name__ == "__main__":
    demo = pd.DataFrame([
        {"adresse_complete": "12 rue du Lac, Thonon", "lat": 46.37, "lon": 6.48},
        {"adresse_complete": "Sans coordonnees", "lat": None, "lon": None},
    ])
    d = add_links(demo)
    for _, r in d.iterrows():
        print(f"\n{r['adresse_complete']}")
        for c in EXCEL_LINK_COLUMNS:
            print(f"  {c:20s} {r[c]}")
