"""
Enrichissement via la BDNB (Base de Données Nationale des Bâtiments, CSTB).

SOURCE (9/10/2026) : l'export départemental en CSV (Licence Ouverte), un
seul téléchargement pour toute la Haute-Savoie :
    https://bdnb.io/download/  ->  millésime  ->  dep74  ->  csv
L'API « Open » (api.bdnb.io) ne renvoie que 10 bâtiments par requête : pour
nos ~31 communes il faudrait des dizaines de milliers de requêtes, au-delà du
quota mensuel. La première version (8/10) s'arrêtait donc après 10 bâtiments
par commune (103 maisons estimées sur 16 600 adresses sans surface).

VALEUR : pour CHAQUE bâtiment, même jamais vendu et sans DPE, la BDNB donne
l'emprise au sol, le nombre de niveaux, le nombre de logements, l'usage et
l'année de construction. On en tire une SURFACE ESTIMÉE pour les maisons
(emprise × niveaux × 0,8, voir segment.py::merge_bdnb), utilisée seulement en
dernier recours et toujours affichée comme estimation.

LECTURE : l'archive contient une table CSV par sujet. On ne lit que les
tables « une ligne par bâtiment » (batiment_groupe*.csv) qui ont une des
colonnes voulues, plus rel_batiment_groupe_adresse.csv (bâtiment -> clé BAN),
par morceaux et en ne gardant que les bâtiments de nos communes. Les noms de
tables/colonnes varient un peu d'un millésime à l'autre : chaque champ a
plusieurs noms candidats et on prend le premier trouvé.

RATTACHEMENT : par la clé d'interopérabilité BAN de l'adresse
(cle_interop_adr), la même que la colonne `id` des adresses BAN du pipeline.

Cache : data/_cache/bdnb/<archive>.zip (FORCE_REDOWNLOAD=1 pour le vider).
Millésime : BDNB_MILLESIME (défaut ci-dessous, puis les précédents).

Usage:
    python enrich_bdnb.py
"""
import csv
import io
import os
import zipfile

import pandas as pd
import requests

from config import ALL_COMMUNES

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
CACHE_DIR = os.path.join(DATA_DIR, "_cache", "bdnb")
OUT_PATH = os.path.join(DATA_DIR, "bdnb_74200_74500.csv")
FORCE_REDOWNLOAD = os.environ.get("FORCE_REDOWNLOAD") == "1"
DEPARTEMENT = "74"
MILLESIMES = [m for m in [os.environ.get("BDNB_MILLESIME"), "2026-02-a", "2025-07-a", "2024-10-a"] if m]
URL = ("https://open-data.s3.fr-par.scw.cloud/bdnb_millesime_{m}/millesime_{m}_dep{d}/"
       "open_data_millesime_{m}_dep{d}_csv.zip")
CHUNK = 200_000

# Champ de sortie -> noms de colonnes candidats, par ordre de préférence.
CHAMPS = {
    "bdnb_nb_logements": ["nb_log", "nb_log_rnc"],
    "bdnb_nb_niveaux": ["nb_niveau"],
    "bdnb_emprise_sol_m2": ["surface_emprise_sol", "s_geom_groupe"],
    "bdnb_fiabilite_emprise": ["fiabilite_emprise_sol"],
    "bdnb_hauteur_m": ["hauteur_mean"],
    "bdnb_fiabilite_hauteur": ["fiabilite_hauteur"],
    "bdnb_annee_construction": ["annee_construction"],
    "bdnb_usage": ["usage_principal_bdnb_open"],
}

# Tables lues en premier (sources de référence : fichiers fonciers, usage
# consolidé, BD TOPO) ; les autres seulement pour un champ encore manquant.
PRIORITE = ["batiment_groupe", "batiment_groupe_ffo_bat", "batiment_groupe_synthese_propriete_usage",
            "batiment_groupe_bdtopo_bat"]

OUT_COLUMNS = [
    "ban_id", "code_insee", "bdnb_id", "bdnb_nb_logements", "bdnb_nb_niveaux",
    "bdnb_emprise_sol_m2", "bdnb_fiabilite_emprise", "bdnb_hauteur_m",
    "bdnb_fiabilite_hauteur", "bdnb_annee_construction", "bdnb_usage",
]


def notice(msg):
    """Visible dans le log et comme annotation du run GitHub Actions."""
    print(msg)
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print(f"::notice title=BDNB::{msg}")


def telecharger():
    """Télécharge (ou reprend du cache) l'archive CSV du département."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    erreurs = []
    for m in MILLESIMES:
        path = os.path.join(CACHE_DIR, f"bdnb_{m}_dep{DEPARTEMENT}_csv.zip")
        if os.path.exists(path) and not FORCE_REDOWNLOAD and zipfile.is_zipfile(path):
            return path, m
        url = URL.format(m=m, d=DEPARTEMENT)
        try:
            with requests.get(url, stream=True, timeout=120) as r:
                if r.status_code == 404:
                    erreurs.append(f"{m}: 404")
                    continue
                r.raise_for_status()
                tmp = path + ".part"
                with open(tmp, "wb") as f:
                    for bloc in r.iter_content(chunk_size=1 << 20):
                        f.write(bloc)
            os.replace(tmp, path)
        except requests.RequestException as e:
            erreurs.append(f"{m}: {e}")
            continue
        if zipfile.is_zipfile(path):
            notice(f"archive {m} dep{DEPARTEMENT} : {os.path.getsize(path) / 1e6:.0f} Mo")
            return path, m
        erreurs.append(f"{m}: pas un zip")
    raise RuntimeError("archive BDNB introuvable (" + "; ".join(erreurs) + ")")


def _table(nom):
    return os.path.splitext(os.path.basename(nom))[0].lower()


def _entete(z, nom):
    with z.open(nom) as f:
        ligne = io.TextIOWrapper(f, encoding="utf-8-sig", newline="").readline()
    sep = max([",", ";", "|", "\t"], key=ligne.count)
    cols = next(csv.reader([ligne], delimiter=sep))
    return sep, [c.strip().strip('"') for c in cols]


def _lire(z, nom, sep, usecols, filtre):
    """Lit les colonnes `usecols` d'une table, par morceaux, filtrées."""
    parts = []
    with z.open(nom) as f:
        for ch in pd.read_csv(f, sep=sep, usecols=usecols, dtype=str, chunksize=CHUNK,
                              encoding="utf-8-sig", low_memory=False):
            ch = filtre(ch)
            if not ch.empty:
                parts.append(ch)
    return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=usecols)


def extraire(zip_path, communes):
    """Renvoie une ligne par adresse BAN rattachée à un bâtiment de nos communes."""
    communes = {str(c) for c in communes}
    with zipfile.ZipFile(zip_path) as z:
        csvs = [n for n in z.namelist() if n.lower().endswith(".csv")]
        entetes = {n: _entete(z, n) for n in csvs}

        # 1. Adresses : bâtiment -> clé BAN (dont le préfixe est le code INSEE).
        rel = [n for n in csvs if _table(n) == "rel_batiment_groupe_adresse"]
        if not rel:
            raise RuntimeError("rel_batiment_groupe_adresse.csv absent de l'archive")
        sep, cols = entetes[rel[0]]
        cle = "cle_interop_adr" if "cle_interop_adr" in cols else next(
            c for c in cols if c.startswith("cle_interop_adr"))
        adr = _lire(z, rel[0], sep, ["batiment_groupe_id", cle],
                    lambda ch: ch[ch[cle].str[:5].isin(communes)])
        adr = adr.rename(columns={cle: "ban_id", "batiment_groupe_id": "bdnb_id"})
        ids = set(adr["bdnb_id"])
        notice(f"{len(adr):,} liens adresse-bâtiment dans {len(communes)} communes, "
               f"{len(ids):,} bâtiments")

        # 2. Attributs : tables « une ligne par bâtiment » qui ont un champ voulu.
        attrs = pd.DataFrame({"bdnb_id": sorted(ids)})
        trouves = {}
        tables = sorted((n for n in csvs if _table(n).startswith("batiment_groupe")),
                        key=lambda n: (PRIORITE.index(_table(n)) if _table(n) in PRIORITE
                                       else len(PRIORITE), _table(n)))
        for n in tables:
            sep, cols = entetes[n]
            if "batiment_groupe_id" not in cols:
                continue
            voulus = {}
            for champ, cands in CHAMPS.items():
                if champ in trouves:
                    continue
                c = next((c for c in cands if c in cols), None)
                if c:
                    voulus[c] = champ
            if not voulus:
                continue
            t = _lire(z, n, sep, ["batiment_groupe_id"] + list(voulus),
                      lambda ch: ch[ch["batiment_groupe_id"].isin(ids)])
            t = t.drop_duplicates(subset=["batiment_groupe_id"])
            t = t.rename(columns={"batiment_groupe_id": "bdnb_id", **voulus})
            attrs = attrs.merge(t, on="bdnb_id", how="left")
            for c, champ in voulus.items():
                trouves[champ] = f"{_table(n)}.{c}"
        notice("colonnes : " + ", ".join(f"{k}<-{v}" for k, v in trouves.items()))
        manquants = [c for c in CHAMPS if c not in trouves]
        if manquants:
            notice("colonnes absentes : " + ", ".join(manquants))

    df = adr.merge(attrs, on="bdnb_id", how="left")
    df["code_insee"] = df["ban_id"].str[:5]
    for c in OUT_COLUMNS:
        if c not in df.columns:
            df[c] = pd.NA
    df = df[OUT_COLUMNS]
    # Une adresse peut être rattachée à deux bâtiments voisins : on garde le
    # plus grand (le bâtiment principal plutôt qu'une annexe).
    df["_s"] = pd.to_numeric(df["bdnb_emprise_sol_m2"], errors="coerce").fillna(0)
    df = df.sort_values("_s").drop_duplicates(subset=["ban_id"], keep="last").drop(columns="_s")
    return df.sort_values("ban_id").reset_index(drop=True)


def main():
    zip_path, m = telecharger()
    df = extraire(zip_path, ALL_COMMUNES.keys())
    os.makedirs(DATA_DIR, exist_ok=True)
    df.to_csv(OUT_PATH, index=False)
    ind = (pd.to_numeric(df["bdnb_nb_logements"], errors="coerce") == 1) & \
        df["bdnb_usage"].fillna("").str.contains("individuel", case=False)
    notice(f"millésime {m} : {len(df):,} adresses avec données BDNB, "
           f"{int(ind.sum()):,} maisons individuelles -> {os.path.basename(OUT_PATH)}")


if __name__ == "__main__":
    main()
