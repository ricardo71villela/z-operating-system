"""
Utilitaires HTTP partages pour les scripts d'ingestion.

Certains CDN gouvernementaux (data.gouv.fr, ADEME) ferment la connexion
sans reponse aux requetes portant le User-Agent par defaut de `requests`
("python-requests/x.y"), ou lors d'une coupure reseau transitoire en
cours de telechargement. Ce module centralise :

  - un User-Agent de navigateur courant ;
  - des tentatives automatiques (HTTP 429/500/502/503/504 via urllib3,
    et coupures de connexion en cours de flux via une boucle applicative,
    car urllib3.Retry ne couvre pas une deconnexion apres reponse 200) ;
  - un telechargement en flux (streaming reel, pas de double buffer) ;
  - un CACHE DISQUE (download_bytes_cached) : le fichier DIAGNOSTIC.txt
    affirmait deja "les donnees deja telechargees sont reutilisees" alors
    qu'aucun cache n'existait — chaque lancement retelechargeait BAN et DVF
    en entier. Desormais, si le fichier de cache existe deja, il est relu
    directement au lieu d'etre retelecharge. Supprimez le dossier de cache,
    ou lancez avec la variable d'environnement FORCE_REDOWNLOAD=1, pour
    forcer un nouveau telechargement.
"""
import os
import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept-Encoding": "gzip, deflate, br",
}


def build_session(total_retries: int = 4) -> requests.Session:
    """Session requests avec retries HTTP automatiques et User-Agent de navigateur."""
    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)
    retry = Retry(
        total=total_retries,
        connect=total_retries,
        read=total_retries,
        backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def download_bytes(url: str, timeout: int = 180, max_attempts: int = 4) -> bytes:
    """Telecharge une URL en flux et retourne le contenu complet en bytes.

    Reessaie jusqu'a `max_attempts` fois avec un delai exponentiel si la
    connexion est coupee en cours de lecture (cas non couvert par les
    retries HTTP d'urllib3, qui ne s'appliquent qu'avant reception d'une
    reponse).
    """
    session = build_session()
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            resp = session.get(url, timeout=timeout, stream=True)
            resp.raise_for_status()
            chunks = []
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    chunks.append(chunk)
            return b"".join(chunks)
        except requests.RequestException as e:
            last_error = e
            if attempt < max_attempts:
                wait = 2 ** attempt
                print(
                    f"  tentative {attempt}/{max_attempts} echouee ({e}) "
                    f"- nouvel essai dans {wait}s..."
                )
                time.sleep(wait)
    raise last_error


def download_bytes_cached(url: str, cache_path: str, timeout: int = 180,
                          max_attempts: int = 4) -> bytes:
    """Comme download_bytes, mais reutilise un fichier local si deja present.

    force=True (ou FORCE_REDOWNLOAD=1 dans l'environnement) ignore le cache.
    """
    force = os.environ.get("FORCE_REDOWNLOAD") == "1"
    if not force and os.path.exists(cache_path):
        print(f"  (cache) reutilise {cache_path} — "
              f"supprimez ce fichier ou lancez avec FORCE_REDOWNLOAD=1 pour "
              f"retelecharger.")
        with open(cache_path, "rb") as f:
            return f.read()

    data = download_bytes(url, timeout=timeout, max_attempts=max_attempts)
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, "wb") as f:
        f.write(data)
    return data
