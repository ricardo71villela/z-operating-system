#!/usr/bin/env python3
"""Met a jour le site Radar Leman a partir d'une execution du pipeline.

Le pipeline (apps/intelligence/pipelines/prospection-immobiliere-74200-74500)
produit des CSV dans output/, mais pas le dashboard du site ni toutes les
fiches PDF. Ce script :

  1. recalcule les donnees du dashboard (LEADS, STATS, KPIS et, si le
     fichier existe, TERRENOS) dans private/dashboard.html, a partir de
     output/mailing_complet.csv, output/stats_marche_communes.csv et
     output/terrenos_livres_potencial.csv ;
  2. genere une fiche PDF par adresse (meme gabarit que fiche_pdf.py) et
     reconstruit private/fichas/ (index n = position de l'adresse dans le
     dashboard, priorite A puis B puis le reste, par score decroissant).

Ensuite : node scripts/split-dashboard.js (regenere private/chunks/).

Uso (depuis la racine du depot, avec pandas + weasyprint installes) :
    python3 apps/intelligence/radar-leman-web/scripts/update-from-pipeline.py \\
        --output apps/intelligence/pipelines/prospection-immobiliere-74200-74500/output \\
        --pipeline-src apps/intelligence/pipelines/prospection-immobiliere-74200-74500/src
"""
import argparse
import base64
import csv
import json
import math
import os
import re
import shutil
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SHARD_SIZE = 50


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


# ------------------------------------------------------------ fiches PDF ---

_W = {}


def _init_worker(pipeline_src, csv_path):
    sys.path.insert(0, pipeline_src)
    import pandas as pd
    import fiche_pdf
    fiche_pdf.CABINET.update({"nom": "[Votre agence]",
                              "contact": "[téléphone] · [email] · [adresse]"})
    _W["fp"] = fiche_pdf
    _W["df"] = pd.read_csv(csv_path, low_memory=False).set_index("adresse_complete", drop=False)


def _parse_comps(s):
    out = []
    if not isinstance(s, str):
        return out
    for part in s.split(" ; "):
        m = re.match(r"(\d{4}) — ([\d\s  ]+) m² — ([\d\s  ]+) €/m²", part.strip())
        if not m:
            continue
        surf = int(re.sub(r"\D", "", m.group(2)))
        pm2 = int(re.sub(r"\D", "", m.group(3)))
        out.append({"annee": m.group(1), "type": None, "surface": surf,
                    "prix": round(surf * pm2 / 100) * 100, "prix_m2": pm2, "distance_m": 400})
    return out


def _make_fiche(item):
    n, addr, out_dir = item
    path = os.path.join(out_dir, f"{n:06d}.pdf")
    row = _W["df"].loc[addr]
    if getattr(row, "ndim", 1) > 1:
        row = row.iloc[0]
    fp = _W["fp"]
    return fp._html_to_pdf(fp.build_html(row, _parse_comps(row.get("comparables"))), path)


def build_fichas(rows, args):
    tmp = tempfile.mkdtemp(prefix="fiches-")
    items = [(i, r[0], tmp) for i, r in enumerate(rows)]
    with ProcessPoolExecutor(args.jobs, initializer=_init_worker,
                             initargs=(args.pipeline_src, os.path.join(args.output, "mailing_complet.csv"))) as ex:
        ok = sum(ex.map(_make_fiche, items, chunksize=25))
    if ok != len(items):
        raise SystemExit(f"fiches : {ok}/{len(items)} generees — arret")
    out_dir = os.path.join(SITE, "private", "fichas")
    shutil.rmtree(out_dir, ignore_errors=True)
    os.makedirs(out_dir)
    n_shards = 0
    for s0 in range(0, len(items), SHARD_SIZE):
        arr = []
        for i in range(s0, min(s0 + SHARD_SIZE, len(items))):
            with open(os.path.join(tmp, f"{i:06d}.pdf"), "rb") as f:
                arr.append(base64.b64encode(f.read()).decode())
        with open(os.path.join(out_dir, f"shard-{n_shards}.js"), "w") as f:
            f.write("module.exports = " + json.dumps(arr) + ";\n")
        n_shards += 1
    with open(os.path.join(out_dir, "index.js"), "w", encoding="utf-8") as f:
        f.write("// Gerado por scripts/update-from-pipeline.py — nao editar a mao.\n"
                "// n = posicao da morada no dashboard (Prioridade A, depois B, depois o resto,\n"
                "// cada grupo por score decrescente).\nmodule.exports = [\n")
        for k in range(n_shards):
            f.write(f"  ...require('./shard-{k}.js'),\n")
        f.write("];\n")
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"fiches : {ok} PDF em {n_shards} pedaços")


# ------------------------------------------------------------- dashboard ---

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

    terr = os.path.join(args.output, "terrenos_livres_potencial.csv")
    if os.path.exists(terr):
        tl = []
        with open(terr, encoding="utf-8") as f:
            for d in csv.DictReader(f):
                tl.append([d.get("parcela_id"), d.get("commune"), num(d.get("area_m2")),
                           txt(d.get("zona_plu")), txt(d.get("zona_libelle")),
                           txt(d.get("poi_alerta")), txt(d.get("link_mapa"))])
        put("_TERRENOS_B64", b64(tl))
        print(f"terrenos : {len(tl)}")

    fr = lambda n: f"{n:,}".replace(",", " ")
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
    ap.add_argument("--pipeline-src", required=True, help="pasta src/ do pipeline (fiche_pdf.py)")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    ap.add_argument("--skip-fiches", action="store_true")
    args = ap.parse_args()
    args.output = os.path.abspath(args.output)
    args.pipeline_src = os.path.abspath(args.pipeline_src)

    with open(os.path.join(args.output, "mailing_complet.csv"), encoding="utf-8") as f:
        rows = [to_row(d) for d in csv.DictReader(f)]
    rank = {"A": 0, "B": 1}
    rows.sort(key=lambda r: (rank.get(r[3], 2), -(r[4] or 0)))
    for i, r in enumerate(rows):
        r[25] = i

    if not args.skip_fiches:
        build_fichas(rows, args)
    update_dashboard(rows, args)


if __name__ == "__main__":
    main()
