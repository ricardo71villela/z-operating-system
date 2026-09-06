# App de prospection immobilière — Secteurs 74200 & 74500

> **Intégration ZOS** — Ce pipeline est la première fonctionnalité (ingestion
> de données) du produit **Z Intelligence** (`apps/intelligence/`). C'est un
> pipeline Python autonome, indépendant du scaffold Next.js du produit —
> le contrat du monorepo (`150-standards/MONOREPO-CONTRACT.md`) autorise
> explicitement chaque produit à choisir la topologie adaptée à son runtime.
> Aucune donnée personnelle n'est collectée (voir "Cadre légal" ci-dessous) et
> aucun secret n'est nécessaire : BAN, DVF et DPE sont des sources ouvertes
> sans clé d'API. Frontière ZOS : ce module appartient à Z Intelligence et ne
> partage pas encore d'autorité de données avec Z Find — un futur
> rapprochement (ex. alimenter Z Find en intelligence de marché immobilier)
> reste une décision de Gouvernance séparée.

Pipeline d'ingestion de données **publiques et légales** qui produit des
listes d'adresses à prospecter, **classées par score de priorité**, pour les
26 communes des secteurs de Thonon-les-Bains (74200) et Évian-les-Bains (74500).

---

## ⚖️ Cadre légal

✅ **Sources utilisées** (toutes en licence Etalab, ouvertes) :

| Source | Producteur | Apporte |
|---|---|---|
| **BAN** | IGN / Etalab | Toutes les adresses + coordonnées GPS |
| **DVF** | DGFiP | Transactions notariées 2019-2024 (anonymisées) |
| **DPE** | ADEME | Classe énergétique, année de construction, surface |

❌ **Jamais collecté** : nom, téléphone, email, ou toute donnée permettant
d'identifier un résident ou un propriétaire.

La sortie est une liste d'**adresses**, adaptée à un publipostage
*"Le Propriétaire, 12 rue du Lac, 74200 Thonon-les-Bains"* — pratique standard
et conforme RGPD en prospection immobilière.

---

## 🚀 Démarrage

```bash
pip install -r requirements.txt
cd src
python main.py
```

Durée : 5-15 min selon la connexion. Option `python main.py --skip-dpe` pour
aller plus vite (mais on perd l'enrichissement le plus utile — voir ci-dessous).

---

## 🎯 Pourquoi le DPE change tout

Le DVF ne connaît que les biens **vendus depuis 2019**. Or les meilleures
cibles sont justement celles qui **ne se sont pas vendues**. Sans le DPE, un
bien Tier 1 est une adresse nue, sans aucune information.

Le DPE de l'ADEME comble ce trou : il documente des logements qui n'ont
jamais changé de main, avec leur année de construction, leur surface et leur
classe énergétique.

En prime, la classe DPE est un **levier de prospection réglementaire** :

| Classe | Interdiction de location |
|---|---|
| G | depuis le 01/01/2025 |
| F | à partir du 01/01/2028 |
| E | à partir du 01/01/2034 |

Un propriétaire de passoire thermique est structurellement plus enclin à
vendre ou rénover. Le fichier `passoires_thermiques.csv` isole ces cibles.

---

## 🩺 DIAGNOSTIC.txt — à lire en premier

L'application a été développée et testée sur des **données simulées** :
l'environnement de développement n'avait pas accès aux portails data.gouv.
Trois inconnues ne peuvent être levées que par votre premier vrai lancement.

`output/DIAGNOSTIC.txt` y répond, avec l'interprétation de chaque chiffre :

| Contrôle | Ce qu'il vous dit |
|---|---|
| Rapprochement BAN ↔ DVF | Si la normalisation tient sur les libellés locaux |
| Couverture DPE | Si vos cibles prioritaires seront documentées ou nues |
| Volumes et étendue des scores | Si la segmentation discrimine vraiment |
| Grille de prix | Si la granularité par rue apporte quelque chose |

Chaque mesure est étiquetée `OK`, `MOYEN` ou `PROBLEME`, avec la conséquence
concrète et la correction à appliquer. **Lisez ce fichier avant d'exploiter
les listes.**

---

## ⚙️ Seuils dérivés automatiquement (bug corrigé)

Le DVF publié ne couvre que les **5-6 dernières années glissantes**. Une
version antérieure utilisait des seuils écrits en dur à 8 et 15 ans : comme
l'ancienneté maximale calculable n'était que de 7 ans, le segment
intermédiaire ne recevait **jamais aucune adresse** et deux poids de scoring
sur quatre étaient inatteignables. Le découpage affichait trois niveaux mais
n'en produisait que deux.

Les seuils sont désormais calculés à partir de la fenêtre réellement
disponible (70 % et 40 % de celle-ci), et `valider_seuils()` vérifie à chaque
lancement qu'ils restent atteignables. Si data.gouv modifie sa fenêtre de
publication, ils suivent automatiquement.

---

## 📊 Score de priorité (0-100)

Chaque adresse reçoit un score cumulant plusieurs signaux, et une colonne
`motifs_score` qui **explique en clair** pourquoi (utile pour préparer un
argumentaire avant un contact).

| Critère | Points |
|---|---|
| Aucune vente sur la fenêtre / vente ancienne | 40 |
| Vente intermédiaire | 20 |
| DPE G / F / E / D | 25 / 20 / 12 / 5 |
| *(DPE et ancienneté du bâti étant corrélés, seul le plus fort compte plein ; le second n'apporte qu'un tiers de ses points)* | |
| Construit avant 1948 / 1948-74 / 1975-99 | 15 / 10 / 5 |
| Maison individuelle | 10 |
| Surface ≥ 100 m² / 70-100 m² | 10 / 5 |

Exemple réel de sortie :
```
90/100  A - Priorité maximale   99 Chemin des Prés, Anthy-sur-Léman
        jamais vendu depuis 2019 | DPE G (passoire thermique)
        | bâti ancien (1935) | grande surface (140 m²)
```

Les poids sont modifiables dans `src/config.py` (dictionnaire `SCORING`)
selon ta stratégie commerciale.

---

## 📁 Fichiers produits (`output/`)

| Fichier | Usage |
|---|---|
| **`prospection_prioritaire.csv`** | Tes meilleures cibles (score ≥ 50), triées |
| **`DIAGNOSTIC.txt`** | **À lire en premier** — santé du pipeline, interprétée |
| **`fiches/`** | Fiches PDF d'estimation, une page par bien |
| **`carte_prospection.html`** | Carte interactive, double-clic pour ouvrir |
| **`passoires_thermiques.csv`** | Cibles DPE E/F/G (levier réglementaire) |
| `mailing_74200_74500.xlsx` | Tout, en onglets (Prioritaire, Tier 1/2/3, Passoires) |
| `mailing_complet.csv` | L'ensemble des adresses |
| `mailing_tier_*.csv` | Une liste par tier |
| `stats_marche_communes.csv` | Prix réels par commune (argumentaire estimation) |
| **`grille_prix_rues.csv`** | Prix au m² rue par rue, avec indice de fiabilité |
| `coefficients_ajustement.csv` | Malus/bonus ancienneté et DPE, estimés localement |
| `prospection.geojson` | Pour QGIS, Google My Maps, uMap |

### Colonnes principales

`adresse_complete`, `priorite`, `score_prospection`, `motifs_score`,
`segment_prospection`, `derniere_vente_connue`, `type_bien`, `surface_m2`,
`nb_pieces`, `prix_derniere_vente`, `prix_m2_derniere_vente`, `prix_m2_estime`, `base_prix_source`,
`ajustements`, `lien_google_maps`, `lien_street_view`,
`lien_itineraire`, `dpe_classe`,
`ges_classe`, `passoire_thermique`, `annee_construction`, `surface_dpe`,
`lon`, `lat`

---

## 💰 Grille de prix par rue + ajustement du bâti ancien

Deux fichiers répondent à ce besoin :

- **`grille_prix_rues.csv`** — prix au m² rue par rue
- **`coefficients_ajustement.csv`** — malus/bonus par période de construction et classe DPE

Chaque adresse reçoit aussi un `prix_m2_estime` avec le détail du calcul.

### Précaution n°1 — le shrinkage

Une rue avec 2 ventes en 6 ans n'a pas de "prix de marché" fiable. On ne prend
donc **jamais** la médiane brute de la rue : on la mélange avec celle de la
commune, pondérée par le nombre de ventes.

```
prix_retenu = (n × médiane_rue + 5 × médiane_commune) / (n + 5)
```

À 1 vente, la rue ne pèse que 17% et le prix reste quasiment celui de la
commune. À 30 ventes, elle pèse 86% et son identité propre ressort. La colonne
`poids_rue_pct` affiche ce poids, et `fiabilite` signale les rues fragiles.

**Exemple réel du test** : une rue avec une seule vente à 12 000 €/m² (commune
à 4 080). Sans shrinkage, elle deviendrait une référence absurde. Avec, elle
est ramenée à 5 400 et marquée `FAIBLE`.

### Précaution n°2 — coefficients estimés, pas inventés

Le malus "bâti ancien" n'est pas un pourcentage choisi au doigt mouillé : il
est **estimé sur les transactions réelles du secteur**, en croisant les ventes
DVF avec les années de construction du DPE. Chaque vente est d'abord rapportée
à la médiane de sa commune, pour ne pas confondre "bâti ancien" et "commune
chère".

Sous 15 ventes pour une modalité, le coefficient reste à **1.00** (aucun
ajustement) plutôt que d'appliquer une valeur non fondée. La colonne `retenu`
indique lesquels ont été validés.

### Précaution n°3 — pas de double comptage

Un immeuble de 1930 est presque toujours mal classé au DPE. Appliquer le malus
ancienneté **et** le malus DPE reviendrait à compter deux fois la même décote
(−17% et −17% donneraient −31%, ce qui est faux). Le module ne retient donc que
**le plus impactant des deux**. Le type de bien, lui, est indépendant et se
cumule normalement.

Un garde-fou plafonne par ailleurs tout ajustement à ±40%.

### Exemple de sortie

```
0 rue du Lac, Thonon-les-Bains | 1930 | DPE F
  prix_m2_estime      : 3 182 €
  base_prix_source    : rue (45 ventes, poids 90%)
  ajustements         : bâti avant_1948 x0.83
                        (bâti/DPE corrélés : le plus fort seul)
```

⚠️ **Ces estimations ne remplacent pas une visite.** Elles donnent un ordre de
grandeur documenté pour préparer un rendez-vous, pas une valeur vénale.

---

## 📄 La fiche d'estimation — le vrai différenciateur

C'est le livrable qui change le rapport de force à la porte. La plupart des
agences déposent une carte de visite ou un flyer générique. Une fiche
nominative **sur l'adresse**, avec les ventes réelles du quartier à l'appui,
se lit et se garde.

Une page A4 par bien, dans `output/fiches/`, générée pour les 50 meilleurs
scores (`NB_FICHES_PDF` dans `segment.py`). Elle contient :

- Une **fourchette de valeur** (jamais un prix unique)
- Ce qu'on sait du bien : type, surface, année, DPE
- **Les ventes réelles à proximité** — c'est ce qui rend l'estimation
  défendable face à un propriétaire sceptique
- L'argument de marché et, le cas échéant, l'échéance réglementaire DPE
- Un appel à l'action assumant qu'une estimation ferme suppose une visite

### Trois garde-fous intégrés

**On n'écrit jamais le prix d'achat du propriétaire.** Le DVF le contient et
c'est légal de l'utiliser, mais *"vous avez acheté 280 000 €"* ferme la porte.
La fiche reprend uniquement la formulation collective : *"les biens comparables
de ce secteur ont progressé d'environ 28 % depuis 2012"*. Le chiffre brut reste
dans le CSV, pour votre préparation interne.

**Une fourchette arrondie, pas un prix au centime.** Afficher
*"344 565 € – 396 435 €"* annonce une précision que la méthode n'a pas, et
vous décrédibilise au premier rendez-vous. Les montants sont arrondis à un pas
cohérent avec l'incertitude réelle.

**Une mention de sortie de fichier**, conforme aux attentes RGPD sur la
prospection postale.

Personnalisez l'en-tête dans le dictionnaire `CABINET` de `fiche_pdf.py`
(nom d'agence, baseline, coordonnées).

---

## 💬 Argumentaire d'angariação

Trois colonnes alimentent la fiche et vos rendez-vous :

| Colonne | Contenu |
|---|---|
| `argument_prudent` | Valorisation du secteur, formulée collectivement |
| `comparables` | Les ventes réelles les plus proches (rayon 400 m) |
| `argument_dpe` | Échéance d'interdiction de location + décote locale observée |
| `plus_value_pct`, `valeur_estimee_actuelle` | Chiffres bruts, préparation interne |

Les comparables sont sélectionnés par proximité géographique réelle (distance
haversine), puis typologie, puis surface voisine, puis récence. Le calcul étant
coûteux, il est limité aux 500 meilleurs scores (`NB_COMPARABLES_CALCULES`).

---

## 🔗 Liens Google Maps

Chaque adresse porte trois liens, générés depuis ses coordonnées GPS (plus
fiable que le texte de l'adresse : Google n'a pas à re-géocoder et ne risque
pas de tomber sur une rue homonyme) :

| Colonne | Ouvre |
|---|---|
| `lien_street_view` | La vue immersive — **le plus utile au quotidien** |
| `lien_google_maps` | La carte centrée sur le bien |
| `lien_itineraire` | La navigation depuis ta position |

**Street View sert à pré-qualifier sans se déplacer** : état de la façade,
standing de l'immeuble, environnement immédiat. Sur une liste de plusieurs
centaines de cibles, c'est ce qui permet d'écarter en quelques minutes ce qui
ne correspond pas à ta cible.

Où les trouver :
- **CSV** : URL en clair, prêtes pour un import CRM
- **Excel** : boutons cliquables (`Carte`, `Street View`, `Itineraire`)
- **Carte HTML** : boutons dans la bulle de chaque point

Note technique : l'Excel utilise la formule `HYPERLINK()` plutôt que des objets
lien, car Excel plafonne une feuille à ~65 530 liens objets — limite qu'un
fichier complet pourrait dépasser. Excel traduit automatiquement le nom de la
fonction selon la langue de l'interface.

---

## 🔍 Le rapport de qualité (à lire au premier lancement)

Le pipeline affiche un rapport de matching. Les libellés de voie diffèrent
entre sources (`rue du Lac` vs `R DU LAC`) ; `normalize.py` gère ces variantes
et **s'auto-teste** à chaque lancement.

Ce qu'il faut regarder :
- **`Voies DVF retrouvées dans BAN`** — sous 40%, une alerte s'affiche.
- **L'échantillon de voies non retrouvées** en fin de rapport : si tu y vois
  des abréviations locales non gérées, ajoute-les au dictionnaire `ABBREV`
  dans `src/normalize.py`.
- Un taux d'enrichissement **DVF de 5-15% est normal** (peu de biens se
  vendent sur 6 ans). C'est le taux de *voies* qui valide la normalisation.

---

## 🗂️ Structure

```
prospection-app/
├── src/
│   ├── config.py        Communes, sources, poids du scoring
│   ├── normalize.py     Normalisation d'adresses (auto-testée)
│   ├── ingest_ban.py    Étape 1 — adresses
│   ├── ingest_dvf.py    Étape 2 — transactions
│   ├── enrich_dpe.py    Étape 3 — DPE (découverte de schéma à l'exécution)
│   ├── segment.py       Étape 4 — matching, scoring, export
│   ├── pricing.py       Grille de prix par rue + ajustements
│   ├── links.py         Liens Google Maps / Street View / itinéraire
│   ├── argumentaire.py  Plus-value, comparables, coût du DPE
│   ├── fiche_pdf.py     Fiches d'estimation A4 (1 page par bien)
│   ├── diagnostic.py    Rapport interprété du premier lancement
│   ├── test_pricing.py  Tests de pricing (vérité terrain connue)
│   ├── market_stats.py  Étape 5 — statistiques par commune
│   ├── export_map.py    Étape 6 — GeoJSON + carte HTML
│   └── main.py          Orchestrateur
├── data/                Données brutes téléchargées
└── output/              Livrables
```

Chaque module se lance aussi indépendamment (`python scoring.py` exécute ses
propres tests, `python export_map.py` régénère juste la carte, etc.).

---

## ⚠️ Limites à connaître

- **DVF ne couvre que 2019-2024** : un bien à potentiel élevé peut simplement avoir été
  vendu en 2018. C'est un signal de priorisation, pas une certitude.
- **Le DPE ne couvre pas tout le parc** : seuls les logements ayant fait
  l'objet d'un diagnostic (vente, location, rénovation) y figurent.
- **Le matching reste imparfait** : le rapport de qualité te dit où tu en es.
- **Statistiques peu fiables sur les petites communes** : la colonne
  `fiabilite` signale les communes sous 10 ventes, où une mutation atypique
  déplace la médiane.
- **L'API DPE peut évoluer** : `enrich_dpe.py` découvre le schéma à
  l'exécution et teste plusieurs identifiants de jeu de données. Si elle
  devient injoignable, le pipeline continue sans, sans planter.

---

## 🔜 Pistes d'extension

- **Cadastre** (`cadastre.data.gouv.fr`) : surface du terrain, utile pour
  repérer les parcelles divisibles.
- **Géorisques** : état des risques, argument de préparation de dossier.
- **RNB** (Référentiel National des Bâtiments) : identifiant unique de
  bâtiment, pour fiabiliser encore le matching entre sources.
