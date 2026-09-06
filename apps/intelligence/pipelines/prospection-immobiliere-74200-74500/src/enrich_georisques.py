"""
Enrichissement via l'API Géorisques (BRGM, open data, licence ouverte,
sans clé, https://georisques.gouv.fr/api/v1/).

UTILITE : les risques naturels/technologiques par commune (inondation,
argiles, radon, sismicite, cavites...) sont deja une information LEGALEMENT
OBLIGATOIRE a communiquer a l'acheteur/locataire en France (Etat des
Risques et Pollutions, "ERP"). Ce module ne sert PAS a faire pression sur
un proprietaire avec un risque naturel : il pre-remplit une information
que l'agence devra de toute facon produire au moment de la vente.
C'est pourquoi cette information reste PUREMENT INFORMATIVE (colonne
info_erp) et n'entre PAS dans le score de prospection.

PORTEE : donnees au niveau COMMUNE (l'API ne descend pas a l'adresse),
donc un seul appel par commune plutot que par adresse.

Usage:
    python enrich_georisques.py
"""
import json
import os
import time
import unicodedata

import pandas as pd
import requests

from config import ALL_COMMUNES

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
CACHE_DIR = os.path.join(DATA_DIR, "_cache", "georisques")
GEORISQUES_URL = "https://georisques.gouv.fr/api/v1/gaspar/risques"
SLEEP = 0.1
FORCE_REDOWNLOAD = os.environ.get("FORCE_REDOWNLOAD") == "1"

# Categorise les libelles de risque bruts en quelques familles lisibles.
# Le detail brut reste dans le cache si besoin d'aller plus loin.
FAMILLES = {
    "inondation": ["inondation", "crue", "submersion", "ruissellement",
                  "remontee", "torrent"],
    "argiles": ["argile", "retrait", "gonflement"],
    "sismique": ["sism", "seisme"],
    "radon": ["radon"],
    "mouvement_terrain": ["mouvement", "glissement", "chute", "cavite", "affaissement"],
    # "marchandises dangereuses" et "surpression" ajoutes : constates dans
    # le catalogue reel GASPAR ("Transport de marchandises dangereuses",
    # "Effet de surpression") et absents des mots-cles initiaux -> tombaient
    # silencieusement dans "autre" malgre leur caractere technologique.
    "technologique": ["industriel", "canalisation", "barrage", "minier",
                      "marchandises dangereuses", "surpression"],
}


def _sans_accents(s):
    """Retire les accents (NFKD + suppression des marques combinantes).

    INDISPENSABLE ici : le catalogue officiel GASPAR utilise "Séisme" et
    "remontées" (avec accents), alors que les mots-cles ci-dessus sont
    ecrits sans accent pour rester lisibles. Sans cette normalisation,
    "sism" ne matche jamais "séisme" (le é casse la sous-chaine) — constate
    en execution reelle : le risque sismique, present partout en
    Haute-Savoie (zone 4), n'etait jamais classe malgre la correction du
    bug de parsing precedent."""
    return "".join(c for c in unicodedata.normalize("NFKD", s)
                   if not unicodedata.combining(c))


def _classer(libelle):
    l = _sans_accents(libelle or "").lower()
    for famille, mots in FAMILLES.items():
        if any(_sans_accents(m).lower() in l for m in mots):
            return famille
    return "autre"


def _tous_les_risques(data):
    """La reponse API renvoie une liste 'data' d'un ou plusieurs "dossiers"
    par commune ; le detail par risque (libelle_risque_long) est NICHE dans
    le champ 'risques_detail' de chaque dossier, pas au premier niveau.

    BUG CORRIGE : la premiere version lisait libelle_risque_long directement
    sur les elements de 'data' (les dossiers), qui ne l'ont pas -> aucun
    risque n'etait jamais classe, quelle que soit la commune (constate en
    execution reelle : "1 risques (aucun classé)" identique pour les 26
    communes). Le detail reel est un niveau plus bas."""
    risques = []
    for dossier in data:
        risques.extend(dossier.get("risques_detail") or [])
    return risques


def fetch_commune(code_insee):
    cache_path = os.path.join(CACHE_DIR, f"{code_insee}.json")
    if not FORCE_REDOWNLOAD and os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)

    try:
        r = requests.get(GEORISQUES_URL,
                         params={"code_insee": code_insee, "page_size": 50},
                         timeout=30)
        r.raise_for_status()
        data = r.json().get("data") or []
    except (requests.RequestException, ValueError) as e:
        print(f"    {code_insee}: injoignable ({e})")
        return []

    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return data


def main():
    rows = []
    print(f"Telechargement des risques Géorisques pour {len(ALL_COMMUNES)} communes...")
    for code, nom in ALL_COMMUNES.items():
        data = fetch_commune(code)
        risques = _tous_les_risques(data)
        familles = sorted({_classer(r.get("libelle_risque_long")) for r in risques} - {"autre"})
        texte = (f"Zones de risque recensées (ERP) : {', '.join(familles)}."
                 if familles else None)
        rows.append({
            "code_insee": code,
            "nb_risques_recenses": len(risques),
            "familles_risques": ";".join(familles),
            "info_erp": texte,
        })
        print(f"  {nom:26s} {len(risques):>3} risques  ({', '.join(familles) or 'aucun classé'})")
        time.sleep(SLEEP)

    df = pd.DataFrame(rows)
    out = os.path.join(DATA_DIR, "georisques_74200_74500.csv")
    df.to_csv(out, index=False)
    print(f"\nOK — risques exportés vers {out}")


if __name__ == "__main__":
    main()
