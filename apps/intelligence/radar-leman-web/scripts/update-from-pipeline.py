#!/usr/bin/env python3
"""Met a jour le site Radar Leman a partir d'une execution du pipeline.

Le pipeline (apps/intelligence/pipelines/prospection-immobiliere-74200-74500)
produit des CSV dans output/, mais pas le dashboard du site. Ce script
recalcule les donnees du dashboard (private/dashboard.html) :

  - LEADS, STATS et KPIS a partir de output/mailing_complet.csv et
    output/stats_marche_communes.csv ;
  - TERRENOS a partir de output/terrenos_livres_potencial.csv, s'il existe :
    les communes presentes dans ce fichier remplacent les leurs, les autres
    communes gardent les terrains deja publies (on peut donc relancer la
    recherche de terrains sur quelques communes seulement).

Les fiches PDF ne sont plus stockees (8/10/2026) : api/ficha.js les genere a
la demande. Ensuite, dans cet ordre :
    node scripts/split-dashboard.js      (private/chunks/)
    node scripts/build-fichas-data.js    (private/fichas-data/)

Uso (depuis la racine du depot, Python 3 sans dependances) :
    python3 apps/intelligence/radar-leman-web/scripts/update-from-pipeline.py \\
        --output apps/intelligence/pipelines/prospection-immobiliere-74200-74500/output
"""
import argparse
import base64
import csv
import datetime
import json
import math
import os
import re

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# Comunas acrescentadas a 7/10/2026 (Sciez e 74550) : quando os terrenos
# delas forem calculados, o aviso "couvre encore les 26 communes" desaparece.
NOVAS_2026_10 = {"Sciez", "Cervens", "Draillant", "Orcier", "Perrignier"}


def num(v, kind=float):
    if v is None or v == "" or str(v).lower() == "nan":
        return None
    try:
        x = float(v)
    except ValueError:
        return None
    if math.isnan(x):
        return None
    return int(round(x)) if kind is int else x


def txt(v):
    return v if v not in (None, "", "nan") else None


def to_row(d):
    """Une ligne du dashboard — meme ordre que COLS dans dashboard.html."""
    return [d["adresse_complete"], d["nom_commune_ref"], num(d["code_postal_secteur"], int),
            (d["priorite"] or "?")[0], num(d["score_prospection"], int), txt(d["type_bien"]),
            num(d["surface_m2"]), num(d["nb_pieces"], int), txt(d["dpe_classe"]),
            d["passoire_thermique"] == "True",
            num(d["annee_construction"]), num(d["surface_terrain_m2"]), num(d["prix_m2_estime"], int),
            num(d["valeur_estimee_actuelle"]), num(d["plus_value_pct"]), num(d["duree_detention_ans"]),
            txt(d["argument_dpe"]), txt(d["argument_terrain"]), txt(d["argument_prudent"]),
            num(d["nb_comparables"], int), num(d["echeance_dpe"]), txt(d["lien_google_maps"]),
            txt(d["motifs_score"]), txt(d["comparables"]), num(d["surface_dpe"]),
            None,  # fichaIdx, rempli apres le tri
            txt(d.get("source_surface"))]


def b64(o):
    return base64.b64encode(json.dumps(o, ensure_ascii=False, separators=(",", ":"))
                            .encode("utf-8")).decode()


def unb64(s, key):
    m = re.search(key + r"\s*=\s*'([^']*)'", s)
    if not m:
        raise SystemExit(f"{key} nao encontrado em dashboard.html")
    return json.loads(base64.b64decode(m.group(1)).decode("utf-8"))


def update_dashboard(rows, args):
    path = os.path.join(SITE, "private", "dashboard.html")
    s = open(path, encoding="utf-8").read()

    stats = []
    with open(os.path.join(args.output, "stats_marche_communes.csv"), encoding="utf-8") as f:
        for d in csv.DictReader(f):
            stats.append([d["commune"], num(d["code_postal"], int), num(d["nb_ventes"], int),
                          num(d["prix_m2_median"], int), num(d["prix_m2_actualise"], int),
                          num(d["evolution_pct"]), num(d["taux_annuel_pct"]), d["fiabilite"] or None])
    kpis = {"total": len(rows), "prioridade_a": sum(r[3] == "A" for r in rows),
            "score_medio": sum(r[4] or 0 for r in rows) / max(len(rows), 1),
            "passoires": sum(bool(r[9]) for r in rows),
            "com_terreno_grande": sum((r[11] or 0) >= 1000 for r in rows),
            "valor_total_estimado": float(sum(r[13] or 0 for r in rows))}

    def put(key, val):
        nonlocal s
        s, n = re.subn(key + r"\s*=\s*'[^']*'", lambda m: f"{key} = '{val}'", s, count=1)
        if n != 1:
            raise SystemExit(f"{key} nao encontrado em dashboard.html")

    put("_LEADS_B64", b64(rows))
    put("_STATS_B64", b64(stats))
    put("_KPIS_B64", b64(kpis))

    # Terrains : on remplace commune par commune (celles traitees par cette
    # execution de enrich_terrenos_livres.py), les autres restent telles quelles.
    terr = os.path.join(args.output, "terrenos_livres_potencial.csv")
    traitees_path = os.path.join(args.output, "terrenos_communes_traitees.csv")
    if os.path.exists(terr):
        new = []
        with open(terr, encoding="utf-8") as f:
            for d in csv.DictReader(f):
                new.append([d.get("parcela_id"), d.get("commune"), num(d.get("area_m2"), int),
                            txt(d.get("zona_plu")), txt(d.get("zona_libelle")),
                            txt(d.get("poi_alerta")), txt(d.get("link_mapa"))])
        traitees = {r[1] for r in new}
        if os.path.exists(traitees_path):
            with open(traitees_path, encoding="utf-8") as f:
                traitees |= {d["commune"] for d in csv.DictReader(f)}
        if traitees:
            terrenos = [r for r in unb64(s, "_TERRENOS_B64") if r[1] not in traitees] + new
            terrenos.sort(key=lambda r: -(r[2] or 0))
            put("_TERRENOS_B64", b64(terrenos))
            print(f"terrenos : {len(new)} em {len(traitees)} comunas tratadas ({sorted(traitees)}), "
                  f"{len(terrenos)} no total")
            if NOVAS_2026_10 <= traitees:
                s = s.replace(" L'onglet Terrains libres couvre encore les 26 communes d'origine.", "")
                s = s.replace("sub:'sur les 26 communes d\\'origine'", "sub:'sur ' + STATS.length + ' communes du secteur'")

    fr = lambda n: f"{n:,}".replace(",", " ")
    # En-tete : nombre d'adresses et de terrains, date d'execution, sources.
    n_terr = len(unb64(s, "_TERRENOS_B64"))
    s = re.sub(r"[\d\u00a0\u202f ]+ adresses du littoral", f"{fr(len(rows))} adresses du littoral", s, count=1)
    s = re.sub(r"les [\d\u00a0\u202f ]+ terrains libres", f"les {fr(n_terr)} terrains libres", s, count=1)
    s = re.sub(r"exécution du \d{2}/\d{2}/\d{4}",
               "exécution du " + datetime.date.today().strftime("%d/%m/%Y"), s, count=1)
    if "BDNB (CSTB)" not in s:
        s = s.replace("RNB · Géoportail", "RNB · BDNB (CSTB) · Géoportail", 1)
    n_b = sum(r[3] == "B" for r in rows)
    s, n = re.subn(r"<b>Priorité A</b> — score ≥ 70 \([^)]*\)\. <b>Priorité B</b> — score 40-69 \([^)]*\)\.",
                   f"<b>Priorité A</b> — score ≥ 70 ({fr(kpis['prioridade_a'])} adresses). "
                   f"<b>Priorité B</b> — score 40-69 ({fr(n_b)} adresses).", s)
    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    print(f"dashboard : {kpis}, {len(stats)} communes")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", required=True, help="pasta output/ do pipeline")
    ap.add_argument("--pipeline-src", help="(ignorado — as fichas ja nao sao geradas aqui)")
    args = ap.parse_args()
    args.output = os.path.abspath(args.output)

    with open(os.path.join(args.output, "mailing_complet.csv"), encoding="utf-8") as f:
        rows = [to_row(d) for d in csv.DictReader(f)]
    rank = {"A": 0, "B": 1}
    rows.sort(key=lambda r: (rank.get(r[3], 2), -(r[4] or 0)))
    for i, r in enumerate(rows):
        r[25] = i
    update_dashboard(rows, args)


if __name__ == "__main__":
    main()
