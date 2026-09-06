"""
Normalisation des libellés d'adresse pour permettre le matching BAN <-> DVF.

CRITIQUE : les libellés de voie diffèrent entre les deux sources
("rue du Lac" dans la BAN, "R DU LAC" dans le DVF). Sans normalisation,
le matching échoue et toutes les adresses retombent en Tier 1.

Testé sur 8 variantes réelles (100% de réussite) et vérifié pour ne PAS
créer de faux positifs ("rue du Lac" != "rue du Port").
"""
import re
import unicodedata

ABBREV = {
    r'\bR\b': 'RUE', r'\bAV\b': 'AVENUE', r'\bAVE\b': 'AVENUE',
    r'\bBD\b': 'BOULEVARD', r'\bBLD\b': 'BOULEVARD',
    r'\bCHE\b': 'CHEMIN', r'\bCH\b': 'CHEMIN',
    r'\bRTE\b': 'ROUTE', r'\bPL\b': 'PLACE',
    r'\bIMP\b': 'IMPASSE', r'\bALL\b': 'ALLEE',
    r'\bSQ\b': 'SQUARE', r'\bQU\b': 'QUAI',
    r'\bST\b': 'SAINT', r'\bSTE\b': 'SAINTE',
    r'\bGDE\b': 'GRANDE', r'\bPTE\b': 'PETITE',
    r'\bLOT\b': 'LOTISSEMENT', r'\bRES\b': 'RESIDENCE',
}

STOPWORDS = {'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'D', 'L', 'AU', 'AUX'}


def normalize_voie(s):
    """Normalise un libellé de voie pour le matching BAN <-> DVF."""
    if not isinstance(s, str) or not s.strip():
        return ''
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))   # retire accents
    s = s.upper()
    s = re.sub(r"[\u2019']", ' ', s)                             # apostrophes
    s = re.sub(r'[^A-Z0-9 ]', ' ', s)                            # ponctuation
    s = re.sub(r'\s+', ' ', s).strip()
    for pat, rep in ABBREV.items():
        s = re.sub(pat, rep, s)
    return ' '.join(t for t in s.split() if t not in STOPWORDS)


def normalize_numero(n):
    """Normalise un numéro de voie ('12.0' -> '12', '5 BIS' -> '5').

    Gere les valeurs manquantes : None, NaN (float), pd.NA et chaines vides
    renvoient ''. Sans ce garde-fou, str(nan) produirait la chaine 'NAN',
    qui polluerait les cles de matching.
    """
    if n is None:
        return ''
    if isinstance(n, float) and n != n:      # NaN
        return ''
    s = str(n).strip().upper()
    if s in ('', 'NAN', 'NONE', '<NA>', 'NAT'):
        return ''
    s = re.sub(r'\.0$', '', s)
    m = re.match(r'^(\d+)', s)
    return m.group(1) if m else s


def self_test():
    """Auto-test de la normalisation. Lève AssertionError en cas d'échec."""
    tests = [
        ("rue du Lac", "R DU LAC"),
        ("Chemin des Vignes", "CHE DES VIGNES"),
        ("Avenue de Genève", "AV DE GENEVE"),
        ("Rue Saint-Jean", "R ST JEAN"),
        ("Place de l'Église", "PL DE L EGLISE"),
        ("Route d'Évian", "RTE D EVIAN"),
        ("Boulevard Georges Andrier", "BD GEORGES ANDRIER"),
        ("Impasse des Pres", "IMP DES PRES"),
    ]
    ok = sum(normalize_voie(a) == normalize_voie(b) for a, b in tests)
    neg = normalize_voie("rue du Lac") != normalize_voie("rue du Port")
    assert ok == len(tests), f"Normalisation : seulement {ok}/{len(tests)} variantes matchées"
    assert neg, "Normalisation : faux positif détecté"
    return ok, len(tests)


if __name__ == "__main__":
    ok, total = self_test()
    print(f"Auto-test normalisation : {ok}/{total} OK, faux positifs évités")
