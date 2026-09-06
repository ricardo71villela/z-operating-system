"""
Export cartographique des cibles de prospection.

Produit deux fichiers dans output/ :
  - prospection.geojson : importable dans QGIS, Google My Maps, uMap...
  - carte_prospection.html : carte autonome (Leaflet via CDN), ouvrable
    d'un double-clic dans un navigateur, sans installation.

Les points sont colores par priorite, ce qui fait apparaitre visuellement
les rues et quartiers ou se concentrent les opportunites — utile pour
organiser une tournee de boitage.
"""
import json
import os

import pandas as pd

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "output")

COLORS = {
    "A — Priorité maximale": "#c1121f",
    "B — Priorité haute":    "#f77f00",
    "C — Priorité moyenne":  "#8fb4db",
    "D — Priorité faible":   "#c7ccd1",
}

# Au-dela, la carte HTML devient lourde a ouvrir. Les meilleurs scores
# sont conserves en priorite ; le GeoJSON complet reste disponible.
MAX_POINTS_HTML = 3000


def to_geojson(df):
    feats = []
    for _, r in df.iterrows():
        try:
            lon, lat = float(r["lon"]), float(r["lat"])
        except (TypeError, ValueError):
            continue
        if pd.isna(lon) or pd.isna(lat):
            continue
        props = {}
        for k in ("adresse_complete", "nom_commune_ref", "priorite",
                  "score_prospection", "motifs_score", "segment_prospection",
                  "dpe_classe", "annee_construction", "type_bien",
                  "surface_m2", "derniere_vente_connue", "prix_m2_estime",
                  "lien_google_maps", "lien_street_view", "lien_itineraire"):
            if k in df.columns:
                v = r[k]
                props[k] = None if pd.isna(v) else (
                    v.item() if hasattr(v, "item") else v)
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": props,
        })
    return {"type": "FeatureCollection", "features": feats}


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<title>Prospection 74200 / 74500</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"/>
<style>
 html,body{margin:0;height:100%%;font-family:-apple-system,Segoe UI,Arial,sans-serif}
 #map{height:100%%}
 .legend{background:#fff;padding:10px 12px;border-radius:6px;
   box-shadow:0 1px 6px rgba(0,0,0,.3);font-size:13px;line-height:1.7}
 .legend i{width:12px;height:12px;display:inline-block;margin-right:7px;
   border-radius:50%%;vertical-align:-1px}
 .legend b{display:block;margin-bottom:6px;font-size:12px;
   text-transform:uppercase;letter-spacing:.5px;color:#0B2545}
 .pop{font-size:13px;line-height:1.6}
 .pop b{color:#0B2545}
 .sc{display:inline-block;background:#0B2545;color:#fff;border-radius:10px;
   padding:1px 8px;font-weight:700;font-size:12px}
 .lk{margin-top:9px;padding-top:8px;border-top:1px solid #e5e7eb}
 .btn{display:inline-block;background:#1B4F91;color:#fff!important;
   text-decoration:none;border-radius:4px;padding:4px 9px;font-size:12px;
   font-weight:600;margin-right:4px}
 .btn:hover{background:#0B2545}
</style></head><body>
<div id="map"></div>
<script>
const DATA = %(data)s;
const COLORS = %(colors)s;
const map = L.map('map');
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(map);

const cluster = L.markerClusterGroup({maxClusterRadius:45});
const bounds = [];
DATA.features.forEach(f => {
  const [lon,lat] = f.geometry.coordinates, p = f.properties;
  const c = COLORS[p.priorite] || '#888';
  const m = L.circleMarker([lat,lon], {radius:6, color:'#fff', weight:1.5,
      fillColor:c, fillOpacity:.9});
  let h = '<div class="pop"><b>'+(p.adresse_complete||'')+'</b><br>'+
    '<span class="sc">'+(p.score_prospection ?? '-')+'/100</span> '+
    (p.priorite||'')+'<br>';
  if (p.motifs_score) h += '<br>'+p.motifs_score;
  if (p.dpe_classe) h += '<br>DPE : <b>'+p.dpe_classe+'</b>';
  if (p.annee_construction) h += '<br>Construit en '+p.annee_construction;
  if (p.prix_m2_estime) h += '<br>Prix estimé : <b>'+p.prix_m2_estime+' €/m²</b>';
  if (p.derniere_vente_connue) h += '<br>Dernière vente : '+p.derniere_vente_connue;
  const liens = [];
  if (p.lien_street_view) liens.push('<a class="btn" target="_blank" href="'+p.lien_street_view+'">Street View</a>');
  if (p.lien_google_maps)  liens.push('<a class="btn" target="_blank" href="'+p.lien_google_maps+'">Carte</a>');
  if (p.lien_itineraire)   liens.push('<a class="btn" target="_blank" href="'+p.lien_itineraire+'">Itinéraire</a>');
  if (liens.length) h += '<div class="lk">'+liens.join(' ')+'</div>';
  m.bindPopup(h+'</div>');
  cluster.addLayer(m); bounds.push([lat,lon]);
});
map.addLayer(cluster);
if (bounds.length) map.fitBounds(bounds, {padding:[30,30]});
else map.setView([46.37,6.48], 11);

const lg = L.control({position:'bottomright'});
lg.onAdd = function(){
  const d = L.DomUtil.create('div','legend');
  d.innerHTML = '<b>Priorité de prospection</b>' +
    Object.entries(COLORS).map(([k,v]) =>
      '<i style="background:'+v+'"></i>'+k).join('<br>');
  return d;
};
lg.addTo(map);
</script></body></html>"""


def export(df):
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    gj = to_geojson(df)
    gj_path = os.path.join(OUTPUT_DIR, "prospection.geojson")
    with open(gj_path, "w", encoding="utf-8") as f:
        json.dump(gj, f, ensure_ascii=False)
    print(f"GeoJSON ({len(gj['features']):,} points) -> {gj_path}")

    df_html = df
    if len(df) > MAX_POINTS_HTML and "score_prospection" in df.columns:
        df_html = df.nlargest(MAX_POINTS_HTML, "score_prospection")
        print(f"  (carte HTML limitée aux {MAX_POINTS_HTML:,} meilleurs scores)")

    html = HTML_TEMPLATE % {
        "data": json.dumps(to_geojson(df_html), ensure_ascii=False),
        "colors": json.dumps(COLORS, ensure_ascii=False),
    }
    html_path = os.path.join(OUTPUT_DIR, "carte_prospection.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Carte HTML -> {html_path}")


if __name__ == "__main__":
    path = os.path.join(OUTPUT_DIR, "mailing_complet.csv")
    if not os.path.exists(path):
        raise SystemExit("Lance d'abord segment.py (ou main.py).")
    export(pd.read_csv(path))
