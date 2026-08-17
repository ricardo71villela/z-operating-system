#!/usr/bin/env python3
"""Generate Z Find market SVGs from pinned Natural Earth GeoJSON.

No geometry is hand-drawn. Sovereign market shapes come from Natural
Earth 1:50m Admin-0 Countries; the four UK constituent markets come from
1:50m Admin-0 Map Units; Dubai comes from 1:10m Admin-1 States/Provinces.

The shell phase downloads the raw upstream files and validates their Git
blob IDs before invoking this generator. This script itself is pure local
transformation: GeoJSON -> transparent decorative SVG.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
from pathlib import Path

SOURCE_BLOBS = {
    'ne_50m_admin_0_countries.geojson':
        '9d99f26dc470fcdbd08b062c813005acbdf73ccb',
    'ne_50m_admin_0_map_units.geojson':
        '85c8767de8d1564bb171892762347a4b9fae30b6',
    'ne_10m_admin_1_states_provinces.geojson':
        '4a8438f98ac7dfec7dc1739b1eaf91398ad33f22',
}

SOVEREIGN_MARKETS = [
    'PT','ES','FR','DE','IT','IE','NL','BE','US','CA','MX','BR','AR',
    'CL','DO','PL','GR','HR','CY'
]

UK_MARKETS = {
    'GB-ENG': 'England',
    'GB-SCT': 'Scotland',
    'GB-WLS': 'Wales',
    'GB-NIR': 'Northern Ireland',
}

EXPECTED_MARKETS = [
    'PT','ES','FR','DE','IT','IE',
    'GB-ENG','GB-SCT','GB-WLS','GB-NIR',
    'NL','BE','US','CA','MX','BR','AR',
    'CL','DO','PL','GR','HR','CY','AE-DU'
]


def normalize_text(value):
    if value is None:
        return ''
    value = unicodedata.normalize('NFKD', str(value))
    value = ''.join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', value).strip().lower()


def load_geojson(path: Path):
    with path.open('r', encoding='utf-8') as fh:
        data = json.load(fh)
    if data.get('type') != 'FeatureCollection':
        raise RuntimeError(f'Not a FeatureCollection: {path}')
    return data['features']


def sovereign_feature(features, market_key):
    candidates = []
    for feature in features:
        props = feature.get('properties') or {}
        iso = props.get('ISO_A2_EH') or props.get('ISO_A2')
        if iso == market_key:
            candidates.append(feature)
    if len(candidates) != 1:
        raise RuntimeError(
            f'{market_key}: expected exactly one Admin-0 country, got {len(candidates)}'
        )
    return candidates[0]


def uk_feature(features, market_key):
    target = UK_MARKETS[market_key]
    candidates = []
    for feature in features:
        props = feature.get('properties') or {}
        geounit = props.get('GEOUNIT') or props.get('NAME')
        if geounit == target and props.get('SOVEREIGNT') == 'United Kingdom':
            candidates.append(feature)
    if len(candidates) != 1:
        raise RuntimeError(
            f'{market_key}: expected one UK map unit {target}, got {len(candidates)}'
        )
    return candidates[0]


def dubai_feature(features, market_key):
    if market_key != 'AE-DU':
        raise RuntimeError('Dubai selector called for wrong market key')

    candidates = []
    for feature in features:
        props = feature.get('properties') or {}
        values = list(props.values())
        is_named_dubai = any(
            normalize_text(value) == 'dubai'
            for value in values
        )
        parent_markers = {
            str(props.get('adm0_a3') or '').upper(),
            str(props.get('ADM0_A3') or '').upper(),
            str(props.get('sr_adm0_a3') or '').upper(),
            str(props.get('iso_a2') or '').upper(),
            str(props.get('ISO_A2') or '').upper(),
        }
        iso_3166_2 = str(
            props.get('iso_3166_2') or props.get('ISO_3166_2') or ''
        ).upper()
        is_uae = (
            'ARE' in parent_markers or
            'AE' in parent_markers or
            iso_3166_2.startswith('AE-') or
            normalize_text(props.get('admin')) == 'united arab emirates' or
            normalize_text(props.get('geonunit')) == 'united arab emirates'
        )
        if is_named_dubai and is_uae:
            candidates.append(feature)

    if len(candidates) != 1:
        preview = [
            {
                k: v for k, v in (f.get('properties') or {}).items()
                if normalize_text(k) in {
                    'name','name_en','admin','adm0_a3','iso_3166_2','geonunit'
                }
            }
            for f in candidates[:10]
        ]
        raise RuntimeError(
            f'AE-DU: expected exactly one Dubai Admin-1 feature, '
            f'got {len(candidates)}; candidates={preview!r}'
        )
    return candidates[0]


def rings_from_geometry(geometry):
    gtype = geometry.get('type')
    coords = geometry.get('coordinates')
    if gtype == 'Polygon':
        return [ring for ring in coords]
    if gtype == 'MultiPolygon':
        rings = []
        for polygon in coords:
            rings.extend(polygon)
        return rings
    raise RuntimeError(f'Unsupported geometry type: {gtype}')


def unwrap_longitudes(rings):
    longs = [float(point[0]) % 360.0 for ring in rings for point in ring]
    if not longs:
        raise RuntimeError('Geometry contains no coordinates')
    unique = sorted(set(longs))
    if len(unique) <= 1:
        cut = unique[0]
    else:
        gaps = []
        for i, value in enumerate(unique):
            nxt = unique[(i + 1) % len(unique)]
            gap = (nxt - value) % 360.0
            gaps.append((gap, value, nxt))
        _, _, cut = max(gaps)

    def unwrap(lon):
        value = float(lon) % 360.0
        if value < cut:
            value += 360.0
        return value

    return [
        [[unwrap(point[0]), float(point[1])] for point in ring]
        for ring in rings
    ]


def project_to_viewbox(rings, width=1000.0, height=760.0, margin=54.0):
    unwrapped = unwrap_longitudes(rings)
    latitudes = [p[1] for ring in unwrapped for p in ring]
    mean_lat = sum(latitudes) / len(latitudes)
    cos_lat = max(0.22, math.cos(math.radians(mean_lat)))

    transformed = [
        [[p[0] * cos_lat, -p[1]] for p in ring]
        for ring in unwrapped
    ]

    xs = [p[0] for ring in transformed for p in ring]
    ys = [p[1] for ring in transformed for p in ring]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span_x = max(max_x - min_x, 1e-9)
    span_y = max(max_y - min_y, 1e-9)

    inner_w = width - 2 * margin
    inner_h = height - 2 * margin
    scale = min(inner_w / span_x, inner_h / span_y)
    used_w = span_x * scale
    used_h = span_y * scale
    offset_x = (width - used_w) / 2.0
    offset_y = (height - used_h) / 2.0

    projected = []
    for ring in transformed:
        projected.append([
            [
                offset_x + (p[0] - min_x) * scale,
                offset_y + (p[1] - min_y) * scale,
            ]
            for p in ring
        ])
    return projected


def path_data(projected_rings):
    parts = []
    for ring in projected_rings:
        if len(ring) < 3:
            continue
        coords = [f'{x:.2f},{y:.2f}' for x, y in ring]
        parts.append('M' + ' L'.join(coords) + ' Z')
    if not parts:
        raise RuntimeError('No drawable rings after projection')
    return ' '.join(parts)


def asset_name(market_key):
    return market_key.lower() + '.svg'


def svg_for_market(market_key, feature, source_name):
    rings = rings_from_geometry(feature['geometry'])
    projected = project_to_viewbox(rings)
    d = path_data(projected)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 760" role="img" aria-hidden="true" data-market-key="{market_key}" data-map-source="Natural Earth" data-map-dataset="{source_name}" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="marketGold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f5eee1"/>
      <stop offset="0.48" stop-color="#d8bd8a"/>
      <stop offset="1" stop-color="#b4945d"/>
    </linearGradient>
    <linearGradient id="marketLight" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffaf1" stop-opacity="0.90"/>
      <stop offset="1" stop-color="#c7a56a" stop-opacity="0.22"/>
    </linearGradient>
  </defs>
  <g opacity="0.28" transform="translate(8 10)">
    <path d="{d}" fill="#a98550" fill-rule="evenodd"/>
  </g>
  <path d="{d}" fill="url(#marketGold)" stroke="#b4935d" stroke-width="2.1" stroke-linejoin="round" fill-rule="evenodd"/>
  <path d="{d}" fill="url(#marketLight)" stroke="#f8f0df" stroke-width="0.9" stroke-linejoin="round" fill-rule="evenodd" opacity="0.72"/>
</svg>\n"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sources', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    source_dir = Path(args.sources)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    countries_path = source_dir / 'ne_50m_admin_0_countries.geojson'
    units_path = source_dir / 'ne_50m_admin_0_map_units.geojson'
    admin1_path = source_dir / 'ne_10m_admin_1_states_provinces.geojson'

    countries = load_geojson(countries_path)
    units = load_geojson(units_path)
    admin1 = load_geojson(admin1_path)

    generated = []

    for market_key in EXPECTED_MARKETS:
        if market_key in SOVEREIGN_MARKETS:
            feature = sovereign_feature(countries, market_key)
            source_name = countries_path.name
        elif market_key in UK_MARKETS:
            feature = uk_feature(units, market_key)
            source_name = units_path.name
        elif market_key == 'AE-DU':
            feature = dubai_feature(admin1, market_key)
            source_name = admin1_path.name
        else:
            raise RuntimeError(f'Unmapped market: {market_key}')

        output = output_dir / asset_name(market_key)
        output.write_text(
            svg_for_market(market_key, feature, source_name),
            encoding='utf-8'
        )
        generated.append(output)

    if len(generated) != 24:
        raise RuntimeError(f'Expected 24 SVGs, generated {len(generated)}')

    print(f'MARKET_MAP_ASSETS_GENERATED={len(generated)}')
    for output in generated:
        print(f'ASSET={output.name}|BYTES={output.stat().st_size}')


if __name__ == '__main__':
    main()
