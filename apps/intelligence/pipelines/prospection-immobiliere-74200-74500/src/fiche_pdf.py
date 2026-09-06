"""
Fiche d'estimation d'une page, par bien.

C'est le livrable qui fait la difference sur le terrain : la plupart des
agences deposent une carte de visite ou un flyer generique. Une fiche
nominative sur l'adresse, avec des ventes reelles du quartier a l'appui,
se lit et se garde.

PRECAUTIONS INTEGREES :
  - Aucune donnee personnelle : la fiche s'adresse au "Proprietaire".
  - On n'ecrit JAMAIS le prix d'achat du proprietaire (legal mais intrusif) :
    seul l'argument collectif de `argument_prudent` est repris.
  - Une fourchette est affichee plutot qu'un prix unique, et une mention
    rappelle qu'une estimation ferme suppose une visite. Annoncer un prix
    au centime sans avoir vu le bien est le meilleur moyen de perdre
    sa credibilite au premier rendez-vous.

Genere output/fiches/fiche_<n>_<adresse>.pdf
"""
import os
import re
import subprocess
import tempfile

import pandas as pd

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "output")
FICHES_DIR = os.path.join(OUTPUT_DIR, "fiches")

# Fourchette affichee autour de l'estimation centrale
FOURCHETTE = 0.07

CABINET = {
    "nom": "[Votre agence]",
    "baseline": "Estimation et transaction — Chablais / Léman",
    "contact": "[téléphone] · [email] · [adresse]",
}


MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
           "août", "septembre", "octobre", "novembre", "décembre"]


def _mois_fr(ts=None):
    ts = ts or pd.Timestamp.today()
    return f"{MOIS_FR[ts.month - 1]} {ts.year}"


def _arrondi_commercial(v):
    """Arrondit au millier le plus proche (5 000 € au-dessus de 200 000).

    Une fourchette du type "344 565 EUR" affiche une precision que la
    methode n'a pas : elle decredibilise le document. On arrondit donc a
    un pas coherent avec l'incertitude reelle.
    """
    v = float(v)
    pas = 5000 if v >= 200000 else 1000
    return round(v / pas) * pas


def _fmt_eur(v):
    if v is None or pd.isna(v):
        return "—"
    return f"{int(round(float(v))):,}".replace(",", " ") + " €"


def _slug(s, n=40):
    s = re.sub(r"[^A-Za-z0-9]+", "-", str(s)).strip("-")
    return s[:n]


CSS = """
@page { size: A4; margin: 15mm 16mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
       color: #1a1a1a; font-size: 10.5pt; line-height: 1.45; }
.hdr { border-bottom: 3px solid #0B2545; padding-bottom: 8px;
       margin-bottom: 16px; display: flex; justify-content: space-between;
       align-items: flex-end; }
.hdr .ag { font-size: 15pt; font-weight: 800; color: #0B2545; }
.hdr .bl { font-size: 8.5pt; color: #6B7280; }
.kicker { font-size: 8pt; letter-spacing: 1.6px; text-transform: uppercase;
          color: #00A0B0; font-weight: 700; }
h1 { font-size: 17pt; color: #0B2545; margin: 3px 0 14px; line-height: 1.25; }
.box { background: #F4F7FB; border-left: 4px solid #0B2545;
       padding: 13px 16px; margin-bottom: 15px; }
.box .lb { font-size: 8pt; text-transform: uppercase; letter-spacing: 1px;
           color: #6B7280; font-weight: 700; }
.box .val { font-size: 21pt; font-weight: 800; color: #0B2545; margin-top: 2px; }
.box .sub { font-size: 8.5pt; color: #6B7280; margin-top: 3px; }
h2 { font-size: 9pt; text-transform: uppercase; letter-spacing: 1.2px;
     color: #0B2545; border-bottom: 1px solid #D8DCE1; padding-bottom: 4px;
     margin: 15px 0 8px; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
th { text-align: left; background: #0B2545; color: #fff; padding: 5px 9px;
     font-size: 8pt; text-transform: uppercase; letter-spacing: .5px; }
td { padding: 5px 9px; border-bottom: 1px solid #E8EBEE; }
tr:nth-child(even) td { background: #F8F9FB; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.grid { display: flex; gap: 10px; margin-bottom: 4px; }
.cell { flex: 1; background: #F8F9FB; padding: 9px 11px; border-radius: 4px; }
.cell .k { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .6px;
           color: #6B7280; }
.cell .v { font-size: 12pt; font-weight: 700; color: #0B2545; margin-top: 1px; }
.alert { background: #FEF3E2; border-left: 4px solid #D97706;
         padding: 10px 14px; font-size: 9.5pt; margin: 10px 0; }
.alert b { color: #92400E; }
p.arg { font-size: 10pt; margin: 6px 0; }
.cta { background: #0B2545; color: #fff; padding: 13px 16px;
       margin-top: 16px; border-radius: 4px; }
.cta .t { font-size: 11pt; font-weight: 700; }
.cta .c { font-size: 9pt; color: #B9C6DA; margin-top: 4px; }
.foot { margin-top: 12px; font-size: 7.5pt; color: #9AA3AF;
        border-top: 1px solid #E8EBEE; padding-top: 7px; line-height: 1.5; }
"""


def build_html(row, comps):
    est_m2 = row.get("prix_m2_estime")
    surface = row.get("surface_m2")
    if pd.isna(surface):
        surface = row.get("surface_dpe")

    valeur = row.get("valeur_estimee_actuelle")
    if (valeur is None or pd.isna(valeur)) and pd.notna(est_m2) and pd.notna(surface):
        valeur = float(est_m2) * float(surface)

    if valeur is not None and not pd.isna(valeur):
        lo = _arrondi_commercial(float(valeur) * (1 - FOURCHETTE))
        hi = _arrondi_commercial(float(valeur) * (1 + FOURCHETTE))
        bloc_val = (f'<div class="val">{_fmt_eur(lo)} – {_fmt_eur(hi)}</div>'
                    f'<div class="sub">Fourchette indicative, sous réserve de visite'
                    + (f" · {_fmt_eur(est_m2)}/m² · {int(float(surface))} m²"
                       if pd.notna(est_m2) and pd.notna(surface) else "") + "</div>")
    elif pd.notna(est_m2):
        bloc_val = (f'<div class="val">{_fmt_eur(est_m2)} / m²</div>'
                    '<div class="sub">Prix de référence du secteur — '
                    'surface du bien non connue</div>')
    else:
        bloc_val = ('<div class="val">Sur demande</div>'
                    '<div class="sub">Données publiques insuffisantes '
                    'pour cette adresse</div>')

    # Caracteristiques connues (on n'affiche que ce qu'on sait vraiment)
    cells = []
    if pd.notna(row.get("type_bien")):
        cells.append(("Type", str(row["type_bien"])))
    if pd.notna(surface):
        cells.append(("Surface", f"{int(float(surface))} m²"))
    if pd.notna(row.get("annee_construction")):
        cells.append(("Construction", str(int(float(row["annee_construction"])))))
    if pd.notna(row.get("dpe_classe")):
        cells.append(("DPE", str(row["dpe_classe"])))
    bloc_cells = ""
    if cells:
        bloc_cells = ('<h2>Ce que nous savons de ce bien</h2><div class="grid">'
                      + "".join(f'<div class="cell"><div class="k">{k}</div>'
                                f'<div class="v">{v}</div></div>' for k, v in cells)
                      + "</div>")

    # Comparables
    bloc_comp = ""
    if comps:
        lignes = "".join(
            f"<tr><td>{c['annee'] or '—'}</td><td>{c['type'] or '—'}</td>"
            f"<td class='num'>{c['surface'] or '—'} m²</td>"
            f"<td class='num'>{_fmt_eur(c['prix'])}</td>"
            f"<td class='num'>{_fmt_eur(c['prix_m2'])}/m²</td></tr>"
            for c in comps[:5])
        bloc_comp = (f"<h2>Ventes réelles à proximité immédiate</h2><table>"
                     f"<tr><th>Année</th><th>Type</th><th>Surface</th>"
                     f"<th>Prix</th><th>Prix/m²</th></tr>{lignes}</table>"
                     f'<div class="foot" style="border:0;margin-top:5px;'
                     f'padding-top:3px">Source : Demandes de Valeurs Foncières '
                     f'(DGFiP) — transactions notariées, rayon de '
                     f'{comps[0]["distance_m"] and 400} m.</div>')

    # Arguments
    args = []
    if isinstance(row.get("argument_prudent"), str):
        args.append(f'<p class="arg">{row["argument_prudent"]}</p>')
    bloc_dpe = ""
    if isinstance(row.get("argument_dpe"), str):
        bloc_dpe = f'<div class="alert"><b>Performance énergétique</b><br>{row["argument_dpe"]}</div>'

    bloc_marche = ""
    if args or bloc_dpe:
        bloc_marche = "<h2>Le marché de votre secteur</h2>" + "".join(args) + bloc_dpe

    return f"""<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<style>{CSS}</style></head><body>
<div class="hdr">
  <div><div class="ag">{CABINET['nom']}</div>
       <div class="bl">{CABINET['baseline']}</div></div>
  <div class="bl">{_mois_fr()}</div>
</div>

<div class="kicker">Estimation indicative — à l'attention du propriétaire</div>
<h1>{row.get('adresse_complete', '')}</h1>

<div class="box"><div class="lb">Valeur indicative de votre bien</div>{bloc_val}</div>

{bloc_cells}
{bloc_comp}
{bloc_marche}

<div class="cta">
  <div class="t">Une estimation précise suppose une visite.</div>
  <div class="c">Cette fourchette repose sur les transactions publiques du
  secteur. L'état intérieur, l'exposition, l'étage et la vue peuvent la faire
  varier sensiblement — dans les deux sens. L'estimation sur place est
  gratuite et sans engagement.<br><br>{CABINET['contact']}</div>
</div>

<div class="foot">
Document établi à partir de données publiques : Base Adresse Nationale (IGN),
Demandes de Valeurs Foncières (DGFiP) et diagnostics de performance
énergétique (ADEME). Aucune donnée personnelle n'a été utilisée.
Ce document ne constitue pas une expertise ni une offre d'achat. Pour ne plus
recevoir de courrier de notre part, il vous suffit de nous le signaler.
</div>
</body></html>"""


def _html_to_pdf(html, pdf_path):
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False,
                                     encoding="utf-8") as f:
        f.write(html)
        tmp = f.name
    try:
        try:
            import weasyprint
            weasyprint.HTML(tmp).write_pdf(pdf_path)
            return True
        except ImportError:
            pass
        r = subprocess.run(
            ["wkhtmltopdf", "--enable-local-file-access", "-q", tmp, pdf_path],
            capture_output=True)
        return r.returncode == 0
    finally:
        os.unlink(tmp)


def generate(df, comps_detail, top_n=50, out_dir=None):
    """Genere une fiche PDF pour les top_n meilleurs scores."""
    out_dir = out_dir or FICHES_DIR
    os.makedirs(out_dir, exist_ok=True)

    cible = df
    if "score_prospection" in df.columns and len(df) > top_n:
        cible = df.nlargest(top_n, "score_prospection")

    faits = []
    for rang, (idx, row) in enumerate(cible.iterrows(), start=1):
        comps = comps_detail.get(idx, [])
        html = build_html(row, comps)
        name = f"fiche_{rang:03d}_{_slug(row.get('adresse_complete', idx))}.pdf"
        path = os.path.join(out_dir, name)
        if _html_to_pdf(html, path):
            faits.append(path)

    print(f"{len(faits)} fiches PDF generees -> {out_dir}")
    if faits:
        print(f"  exemple : {os.path.basename(faits[0])}")
    return faits


if __name__ == "__main__":
    p = os.path.join(OUTPUT_DIR, "mailing_complet.csv")
    if not os.path.exists(p):
        raise SystemExit("Lance d'abord segment.py (ou main.py).")
    generate(pd.read_csv(p), {}, top_n=5)
