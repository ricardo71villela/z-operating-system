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

import sys
sys.dont_write_bytecode = True

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

import argparse
import base64
import json
import math
import subprocess
import tempfile
from pathlib import Path

VIEW_W = 1000.0
VIEW_H = 760.0
MARGIN = 54.0

RELIEF_LONG_EDGE = 960
RELIEF_JPEG_QUALITY = 68
RELIEF_MAX_BYTES_PER_ASSET = 300000
PER_ASSET_MAX_BYTES = 900000
TOTAL_MAX_BYTES = 8000000

_MAP_V4_R2_EXPECTED_MARKETS = [
    "PT","ES","FR","DE","IT","IE",
    "GB-ENG","GB-SCT","GB-WLS","GB-NIR",
    "NL","BE","US","CA","MX","BR","AR","CL",
    "DO","PL","GR","HR","CY","AE-DU",
]

_MAP_V4_R2_SOVEREIGN_MARKETS = {
    "PT","ES","FR","DE","IT","IE",
    "NL","BE","US","CA","MX","BR","AR","CL",
    "DO","PL","GR","HR","CY",
}

_MAP_V4_R2_UK_MARKETS = {
    "GB-ENG","GB-SCT","GB-WLS","GB-NIR",
}

EXPLICIT_UNCHANGED = {"US","CA"}

INSULAR_PRESERVE = {
    "IE","GB-ENG","GB-SCT","GB-WLS","GB-NIR",
    "DO","CY","AE-DU",
}

NOTE_COPY = {
    "fr": "Les territoires non continentaux ne sont pas représentés sur cette carte.",
    "en": "Non-mainland territories are not represented on this map.",
    "pt": "Os territórios não continentais não estão representados neste mapa.",
    "es": "Los territorios no continentales no están representados en este mapa.",
    "de": "Nicht zum Festland gehörende Gebiete sind auf dieser Karte nicht dargestellt.",
    "it": "I territori non continentali non sono rappresentati in questa mappa.",
}




def load_geojson(path):
    obj = json.loads(
        Path(path).read_text(encoding="utf-8")
    )
    if obj.get("type") != "FeatureCollection":
        raise RuntimeError(
            f"{path}: expected FeatureCollection"
        )
    return obj.get("features") or []


def polygons_from_geometry(geometry):
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")

    if gtype == "Polygon":
        return [coords]

    if gtype == "MultiPolygon":
        return list(coords)

    raise RuntimeError(
        f"Unsupported geometry type: {gtype}"
    )


def flatten_rings(polygons):
    rings = []
    for polygon in polygons:
        rings.extend(polygon)
    return rings


def ring_bbox(ring):
    xs = [float(p[0]) for p in ring]
    ys = [float(p[1]) for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def point_on_segment(point, a, b, epsilon=1e-9):
    px, py = point
    ax, ay = a
    bx, by = b

    cross = (
        (px - ax) * (by - ay)
        - (py - ay) * (bx - ax)
    )

    if abs(cross) > epsilon:
        return False

    dot = (
        (px - ax) * (px - bx)
        + (py - ay) * (py - by)
    )

    return dot <= epsilon


def point_in_ring(point, ring):
    x, y = point
    inside = False

    if len(ring) < 3:
        return False

    for i in range(len(ring)):
        a = ring[i]
        b = ring[(i + 1) % len(ring)]

        if point_on_segment(
            point,
            (float(a[0]), float(a[1])),
            (float(b[0]), float(b[1])),
        ):
            return True

        x1, y1 = float(a[0]), float(a[1])
        x2, y2 = float(b[0]), float(b[1])

        intersects = (
            (y1 > y) != (y2 > y)
            and
            x < (
                (x2 - x1) * (y - y1)
                / ((y2 - y1) or 1e-30)
                + x1
            )
        )

        if intersects:
            inside = not inside

    return inside


def point_in_polygon(point, polygon):
    if not polygon:
        return False

    if not point_in_ring(point, polygon[0]):
        return False

    for hole in polygon[1:]:
        if point_in_ring(point, hole):
            return False

    return True


def polygon_area(polygon):
    if not polygon or len(polygon[0]) < 3:
        return 0.0

    ring = polygon[0]

    mean_lat = (
        sum(float(p[1]) for p in ring)
        / len(ring)
    )

    cos_lat = max(
        0.22,
        math.cos(math.radians(mean_lat)),
    )

    area = 0.0

    for i in range(len(ring)):
        x1 = float(ring[i][0]) * cos_lat
        y1 = float(ring[i][1])
        x2 = float(ring[(i + 1) % len(ring)][0]) * cos_lat
        y2 = float(ring[(i + 1) % len(ring)][1])

        area += x1 * y2 - x2 * y1

    return abs(area) / 2.0


def polygon_representative_candidates(polygon):
    outer = polygon[0]

    min_x, min_y, max_x, max_y = ring_bbox(outer)

    candidates = [
        (
            sum(float(p[0]) for p in outer) / len(outer),
            sum(float(p[1]) for p in outer) / len(outer),
        ),
        (
            (min_x + max_x) / 2.0,
            (min_y + max_y) / 2.0,
        ),
    ]

    grid_steps = 17

    for yi in range(1, grid_steps):
        y = (
            min_y
            + (max_y - min_y)
            * yi / grid_steps
        )

        for xi in range(1, grid_steps):
            x = (
                min_x
                + (max_x - min_x)
                * xi / grid_steps
            )
            candidates.append((x, y))

    stride = max(
        1,
        len(outer) // 80,
    )

    for i in range(0, len(outer), stride):
        a = outer[i]
        b = outer[(i + 1) % len(outer)]

        candidates.append(
            (
                (float(a[0]) + float(b[0])) / 2.0,
                (float(a[1]) + float(b[1])) / 2.0,
            )
        )

    return candidates


def representative_point(polygon):
    for point in polygon_representative_candidates(
        polygon
    ):
        if point_in_polygon(point, polygon):
            return point

    raise RuntimeError(
        "Unable to find representative point inside polygon"
    )


def flatten_land_polygons(features):
    result = []

    for feature_index, feature in enumerate(features):
        geometry = feature.get("geometry") or {}

        for polygon_index, polygon in enumerate(
            polygons_from_geometry(geometry)
        ):
            result.append(
                {
                    "id": (
                        f"{feature_index}:{polygon_index}"
                    ),
                    "polygon": polygon,
                    "bbox": ring_bbox(polygon[0]),
                }
            )

    if not result:
        raise RuntimeError(
            "Physical land source exposes no polygons"
        )

    return result


def bbox_contains(bbox, point):
    min_x, min_y, max_x, max_y = bbox
    x, y = point

    return (
        min_x <= x <= max_x
        and
        min_y <= y <= max_y
    )


def land_id_for_point(point, land_polygons):
    matches = []

    for item in land_polygons:
        if not bbox_contains(
            item["bbox"],
            point,
        ):
            continue

        if point_in_polygon(
            point,
            item["polygon"],
        ):
            matches.append(item["id"])

    if not matches:
        return None

    return matches[0]


def land_id_for_market_polygon(
    polygon,
    land_polygons,
):
    candidates = polygon_representative_candidates(
        polygon
    )

    for point in candidates:
        if not point_in_polygon(point, polygon):
            continue

        land_id = land_id_for_point(
            point,
            land_polygons,
        )

        if land_id is not None:
            return land_id

    return None


def select_physical_mainland(
    market_key,
    polygons,
    land_polygons,
):
    if market_key in EXPLICIT_UNCHANGED:
        return (
            polygons,
            0,
            "UNCHANGED_EXPLICIT_USER_EXCEPTION",
            None,
        )

    if market_key in INSULAR_PRESERVE:
        return (
            polygons,
            0,
            "PRESERVE_FULL_PRIMARY_INSULAR_GEOGRAPHY",
            None,
        )

    if len(polygons) <= 1:
        return (
            polygons,
            0,
            "SINGLE_COMPONENT_NO_REMOVAL",
            None,
        )

    largest_index = max(
        range(len(polygons)),
        key=lambda index: polygon_area(
            polygons[index]
        ),
    )

    home_land_id = land_id_for_market_polygon(
        polygons[largest_index],
        land_polygons,
    )

    if home_land_id is None:
        raise RuntimeError(
            f"{market_key}: could not resolve "
            "home physical landmass"
        )

    kept = []

    for polygon in polygons:
        land_id = land_id_for_market_polygon(
            polygon,
            land_polygons,
        )

        if land_id == home_land_id:
            kept.append(polygon)

    if not kept:
        raise RuntimeError(
            f"{market_key}: physical-landmass "
            "selection removed every polygon"
        )

    removed = len(polygons) - len(kept)

    return (
        kept,
        removed,
        "HOME_PHYSICAL_LANDMASS_INTERSECTION_V1",
        home_land_id,
    )


def projection_context(live, rings):
    unwrapped = live.unwrap_longitudes(rings)

    latitudes = [
        p[1]
        for ring in unwrapped
        for p in ring
    ]

    mean_lat = (
        sum(latitudes)
        / len(latitudes)
    )

    cos_lat = max(
        0.22,
        math.cos(math.radians(mean_lat)),
    )

    transformed = [
        [
            [p[0] * cos_lat, -p[1]]
            for p in ring
        ]
        for ring in unwrapped
    ]

    xs = [
        p[0]
        for ring in transformed
        for p in ring
    ]
    ys = [
        p[1]
        for ring in transformed
        for p in ring
    ]

    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    span_x = max(
        max_x - min_x,
        1e-9,
    )
    span_y = max(
        max_y - min_y,
        1e-9,
    )

    inner_w = VIEW_W - 2 * MARGIN
    inner_h = VIEW_H - 2 * MARGIN

    scale = min(
        inner_w / span_x,
        inner_h / span_y,
    )

    used_w = span_x * scale
    used_h = span_y * scale

    offset_x = (
        VIEW_W - used_w
    ) / 2.0
    offset_y = (
        VIEW_H - used_h
    ) / 2.0

    u_values = [
        p[0]
        for ring in unwrapped
        for p in ring
    ]

    return {
        "cos_lat": cos_lat,
        "scale": scale,
        "min_x": min_x,
        "min_y": min_y,
        "offset_x": offset_x,
        "offset_y": offset_y,
        "u_min": min(u_values),
        "u_max": max(u_values),
        "lat_min": min(latitudes),
        "lat_max": max(latitudes),
    }


def project_u_lon_lat(context, u_lon, lat):
    tx = u_lon * context["cos_lat"]
    ty = -lat

    x = (
        context["offset_x"]
        + (tx - context["min_x"])
        * context["scale"]
    )
    y = (
        context["offset_y"]
        + (ty - context["min_y"])
        * context["scale"]
    )

    return x, y


def standard_lon_from_u(u):
    value = u % 360.0

    if value > 180.0:
        value -= 360.0

    return value


def raster_x_for_standard_lon(
    lon,
    raster_width,
):
    return (
        (lon + 180.0)
        / 360.0
        * raster_width
    )


def raster_y_for_lat(
    lat,
    raster_height,
):
    return (
        (90.0 - lat)
        / 180.0
        * raster_height
    )


def relief_segments_for_market(
    context,
):
    u_min = context["u_min"]
    u_max = context["u_max"]
    lat_min = context["lat_min"]
    lat_max = context["lat_max"]

    u_pad = max(
        1.0,
        (u_max - u_min) * 0.07,
    )
    lat_pad = max(
        1.0,
        (lat_max - lat_min) * 0.07,
    )

    start = u_min - u_pad
    end = u_max + u_pad
    bottom = max(
        -90.0,
        lat_min - lat_pad,
    )
    top = min(
        90.0,
        lat_max + lat_pad,
    )

    boundaries = [start, end]

    k_min = math.floor(
        (start - 180.0) / 360.0
    ) - 1
    k_max = math.ceil(
        (end - 180.0) / 360.0
    ) + 1

    for k in range(k_min, k_max + 1):
        seam = 180.0 + 360.0 * k

        if start < seam < end:
            boundaries.append(seam)

    boundaries = sorted(
        set(boundaries)
    )

    segments = []

    for index in range(
        len(boundaries) - 1
    ):
        u0 = boundaries[index]
        u1 = boundaries[index + 1]

        if u1 - u0 <= 1e-9:
            continue

        mid = (u0 + u1) / 2.0
        mid_standard = standard_lon_from_u(
            mid
        )

        cycle_shift = mid - mid_standard

        lon0 = u0 - cycle_shift
        lon1 = u1 - cycle_shift

        lon0 = max(
            -180.0,
            min(180.0, lon0),
        )
        lon1 = max(
            -180.0,
            min(180.0, lon1),
        )

        if lon1 <= lon0:
            continue

        segments.append(
            {
                "u0": u0,
                "u1": u1,
                "lon0": lon0,
                "lon1": lon1,
                "lat_bottom": bottom,
                "lat_top": top,
            }
        )

    if not segments:
        raise RuntimeError(
            "Relief segmentation produced no segments"
        )

    return segments


def crop_relief_segment(
    raster_path,
    sips_path,
    raster_width,
    raster_height,
    segment,
):
    left = int(
        math.floor(
            raster_x_for_standard_lon(
                segment["lon0"],
                raster_width,
            )
        )
    )
    right = int(
        math.ceil(
            raster_x_for_standard_lon(
                segment["lon1"],
                raster_width,
            )
        )
    )
    top_px = int(
        math.floor(
            raster_y_for_lat(
                segment["lat_top"],
                raster_height,
            )
        )
    )
    bottom_px = int(
        math.ceil(
            raster_y_for_lat(
                segment["lat_bottom"],
                raster_height,
            )
        )
    )

    left = max(
        0,
        min(raster_width - 1, left),
    )
    right = max(
        left + 1,
        min(raster_width, right),
    )
    top_px = max(
        0,
        min(raster_height - 1, top_px),
    )
    bottom_px = max(
        top_px + 1,
        min(raster_height, bottom_px),
    )

    crop_w = right - left
    crop_h = bottom_px - top_px

    with tempfile.TemporaryDirectory(
        prefix="zfind-map-relief-"
    ) as temp_dir:
        temp_dir = Path(temp_dir)

        crop_tif = (
            temp_dir / "crop.tif"
        )
        crop_jpg = (
            temp_dir / "crop.jpg"
        )

        subprocess.run(
            [
                sips_path,
                "-c",
                str(crop_h),
                str(crop_w),
                "--cropOffset",
                str(top_px),
                str(left),
                str(raster_path),
                "--out",
                str(crop_tif),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        subprocess.run(
            [
                sips_path,
                "-Z",
                str(RELIEF_LONG_EDGE),
                "-s",
                "format",
                "jpeg",
                "-s",
                "formatOptions",
                str(RELIEF_JPEG_QUALITY),
                str(crop_tif),
                "--out",
                str(crop_jpg),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        return crop_jpg.read_bytes()


def build_relief_layers(
    live,
    selected_rings,
    raster_path,
    sips_path,
    raster_width,
    raster_height,
):
    context = projection_context(
        live,
        selected_rings,
    )

    segments = relief_segments_for_market(
        context
    )

    layers = []
    binary_total = 0

    for segment in segments:
        jpeg = crop_relief_segment(
            raster_path,
            sips_path,
            raster_width,
            raster_height,
            segment,
        )

        binary_total += len(jpeg)

        if (
            binary_total
            > RELIEF_MAX_BYTES_PER_ASSET
        ):
            raise RuntimeError(
                "Combined relief JPEG bytes exceed "
                f"{RELIEF_MAX_BYTES_PER_ASSET}"
            )

        x0, y_top = project_u_lon_lat(
            context,
            segment["u0"],
            segment["lat_top"],
        )
        x1, y_bottom = project_u_lon_lat(
            context,
            segment["u1"],
            segment["lat_bottom"],
        )

        x = min(x0, x1)
        y = min(y_top, y_bottom)
        width = abs(x1 - x0)
        height = abs(y_bottom - y_top)

        layers.append(
            {
                "jpeg": jpeg,
                "x": x,
                "y": y,
                "width": width,
                "height": height,
            }
        )

    return layers, binary_total


def svg_for_market(
    live,
    market_key,
    selected_rings,
    relief_layers,
    note_required,
    source_name,
):
    projected = live.project_to_viewbox(
        selected_rings
    )
    path = live.path_data(projected)

    clip_id = (
        "clip-"
        + market_key.lower()
    )

    image_markup = []

    for layer in relief_layers:
        encoded = base64.b64encode(
            layer["jpeg"]
        ).decode("ascii")

        image_markup.append(
            (
                '<image '
                f'href="data:image/jpeg;base64,{encoded}" '
                f'x="{layer["x"]:.2f}" '
                f'y="{layer["y"]:.2f}" '
                f'width="{layer["width"]:.2f}" '
                f'height="{layer["height"]:.2f}" '
                'preserveAspectRatio="none" '
                'opacity="0.82"/>'
            )
        )

    note_en = (
        NOTE_COPY["en"]
        if note_required
        else ""
    )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        'viewBox="0 0 1000 760" '
        'role="img" aria-hidden="true" '
        f'data-market-key="{market_key}" '
        'data-map-source="Natural Earth" '
        f'data-map-dataset="{source_name}" '
        'data-map-mode="mainland-relief-v2-r2" '
        f'data-omitted-non-mainland="'
        f'{"true" if note_required else "false"}" '
        'preserveAspectRatio="xMidYMid meet">\n'
        '  <defs>\n'
        f'    <clipPath id="{clip_id}">'
        f'<path d="{path}" fill-rule="evenodd"/>'
        '</clipPath>\n'
        '    <linearGradient id="marketTone" '
        'x1="0" y1="0" x2="1" y2="1">\n'
        '      <stop offset="0" '
        'stop-color="#fff8ec" stop-opacity="0.48"/>\n'
        '      <stop offset="0.52" '
        'stop-color="#d6b67b" stop-opacity="0.22"/>\n'
        '      <stop offset="1" '
        'stop-color="#9f7a42" stop-opacity="0.12"/>\n'
        '    </linearGradient>\n'
        '  </defs>\n'
        f'  <desc>{note_en}</desc>\n'
        '  <g opacity="0.22" '
        'transform="translate(8 10)">\n'
        f'    <path d="{path}" fill="#8f6c3a" '
        'fill-rule="evenodd"/>\n'
        '  </g>\n'
        f'  <g clip-path="url(#{clip_id})">\n'
        + "\n".join(
            "    " + item
            for item in image_markup
        )
        + '\n'
        '    <rect x="0" y="0" '
        'width="1000" height="760" '
        'fill="url(#marketTone)"/>\n'
        '  </g>\n'
        f'  <path d="{path}" fill="none" '
        'stroke="#b4935d" stroke-width="2.15" '
        'stroke-linejoin="round" '
        'stroke-linecap="round" '
        'fill-rule="evenodd"/>\n'
        f'  <path d="{path}" fill="none" '
        'stroke="#fff5e4" stroke-opacity="0.72" '
        'stroke-width="0.85" '
        'stroke-linejoin="round" '
        'stroke-linecap="round" '
        'fill-rule="evenodd"/>\n'
        '</svg>\n'
    )


def build_preview(
    output_root,
    manifest,
):
    note_json = json.dumps(
        NOTE_COPY,
        ensure_ascii=False,
    )

    cards = []

    for item in manifest["assets"]:
        note_style = (
            ""
            if item["note_required"]
            else ' style="display:none"'
        )

        cards.append(
            (
                '<article class="card" '
                f'data-market="{item["market_key"]}" '
                f'data-note-required="'
                f'{"true" if item["note_required"] else "false"}">'
                f'<h2>{item["market_key"]}</h2>'
                f'<img src="assets/{item["file_name"]}" '
                f'alt="{item["market_key"]} map">'
                f'<p class="note"{note_style}></p>'
                '<dl>'
                '<dt>Mode</dt>'
                f'<dd>{item["selection_mode"]}</dd>'
                '<dt>Removed components</dt>'
                f'<dd>{item["removed_components"]}</dd>'
                '<dt>SVG bytes</dt>'
                f'<dd>{item["svg_bytes"]}</dd>'
                '<dt>Relief bytes</dt>'
                f'<dd>{item["relief_binary_bytes"]}</dd>'
                '</dl>'
                '</article>'
            )
        )

    html = (
        '<!doctype html>\n'
        '<html lang="en">\n'
        '<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" '
        'content="width=device-width,initial-scale=1">\n'
        '<title>Z Find MAP.V2-R2 Preview</title>\n'
        '<style>\n'
        ':root{color-scheme:light}'
        '*{box-sizing:border-box}'
        'body{margin:0;padding:28px;'
        'font-family:Arial,sans-serif;'
        'background:#f7f1e7;color:#2d2418}'
        '.top{max-width:1400px;margin:0 auto 26px}'
        'h1{font-size:28px;margin:0 0 8px}'
        '.lead{color:#705e47;max-width:900px;'
        'line-height:1.5}'
        '.controls{margin-top:18px}'
        'select{font:inherit;padding:8px 12px;'
        'border-radius:10px;border:1px solid #d6c2a2;'
        'background:#fff}'
        '.grid{max-width:1400px;margin:0 auto;'
        'display:grid;grid-template-columns:'
        'repeat(auto-fit,minmax(300px,1fr));gap:18px}'
        '.card{background:#fff;border:1px solid #e4d6be;'
        'border-radius:18px;padding:16px;'
        'box-shadow:0 8px 24px rgba(76,55,28,.07)}'
        '.card h2{font-size:18px;margin:0 0 10px}'
        '.card img{width:100%;height:270px;object-fit:contain;'
        'display:block;border-radius:14px;'
        'background:linear-gradient(135deg,#fbf7ef,#fff)}'
        '.note{font-size:12px;line-height:1.45;'
        'color:#87735b;text-align:center;'
        'margin:9px 8px 2px}'
        'dl{display:grid;grid-template-columns:1fr 1fr;'
        'gap:5px 10px;font-size:12px;margin:14px 0 0}'
        'dt{color:#8c795f}dd{margin:0;text-align:right;'
        'overflow-wrap:anywhere}'
        '</style>\n'
        '</head>\n'
        '<body>\n'
        '<div class="top">'
        '<h1>Z Find — Mainland + Geographic Relief</h1>'
        '<p class="lead">'
        'Temporary read-only visual simulation. '
        'US and Canada retain their complete footprints. '
        'Inherently insular markets retain their complete primary geography. '
        'Where detached non-mainland components were actually removed, '
        'the localized explanatory note appears below the map.'
        '</p>'
        '<div class="controls">'
        '<label>Note language '
        '<select id="lang">'
        '<option value="fr">FR</option>'
        '<option value="en" selected>EN</option>'
        '<option value="pt">PT</option>'
        '<option value="es">ES</option>'
        '<option value="de">DE</option>'
        '<option value="it">IT</option>'
        '</select></label>'
        '</div></div>'
        '<main class="grid">'
        + "".join(cards)
        + '</main>\n'
        '<script>\n'
        f'const COPY={note_json};\n'
        'const lang=document.getElementById("lang");\n'
        'function renderNotes(){'
        'document.querySelectorAll(".card").forEach(card=>{'
        'const note=card.querySelector(".note");'
        'if(card.dataset.noteRequired==="true"){'
        'note.style.display="block";'
        'note.textContent=COPY[lang.value];'
        '}else{note.style.display="none";note.textContent="";}'
        '});'
        '}\n'
        'lang.addEventListener("change",renderNotes);'
        'renderNotes();\n'
        '</script>\n'
        '</body></html>\n'
    )

    (
        Path(output_root) / "index.html"
    ).write_text(
        html,
        encoding="utf-8",
    )

# MAP.V4 approved mainland + real geographic relief contract.
MAP_V4_RELIEF_SOURCE_SHA256 = "e3aa47b13aff26e1b4b3792a94100d8667d3147046aeac7840be00a15f839d18"
MAP_V4_LAND_GIT_BLOB = "2d76878175b8054acd9c5a52917ee9ea59a36fc5"
MAP_V4_LAND_SHA256 = "1ac90796408bc6ad6911d69448485d3c4dbf2190370080368a09976e1c9f7416"
MAP_V4_MAINLAND_ALGORITHM = "HOME_PHYSICAL_LANDMASS_INTERSECTION_V1"
MAP_V4_APPROVED_NOTE_MARKETS = [
    "PT","ES","FR","DE","IT","NL",
    "MX","BR","AR","CL","GR","HR",
]


class _MapV4LiveAuthority:
    sovereign_feature = staticmethod(sovereign_feature)
    uk_feature = staticmethod(uk_feature)
    dubai_feature = staticmethod(dubai_feature)
    unwrap_longitudes = staticmethod(unwrap_longitudes)
    project_to_viewbox = staticmethod(project_to_viewbox)
    path_data = staticmethod(path_data)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--relief-raster", required=True)
    parser.add_argument("--sips-path", required=True)
    parser.add_argument("--relief-width", type=int, required=True)
    parser.add_argument("--relief-height", type=int, required=True)
    args = parser.parse_args()

    source_dir = Path(args.sources)
    output_root = Path(args.output_root)
    assets_dir = output_root / "assets"

    output_root.mkdir(parents=True, exist_ok=True)
    assets_dir.mkdir(parents=True, exist_ok=True)

    countries = load_geojson(source_dir / "ne_50m_admin_0_countries.geojson")
    units = load_geojson(source_dir / "ne_50m_admin_0_map_units.geojson")
    admin1 = load_geojson(source_dir / "ne_10m_admin_1_states_provinces.geojson")
    land = load_geojson(source_dir / "ne_10m_land.geojson")

    land_polygons = flatten_land_polygons(land)
    live_authority = _MapV4LiveAuthority()

    manifest = {
        "simulation_mode":"LIVE_GENERATOR_REPRODUCIBILITY",
        "mainland_algorithm":"HOME_PHYSICAL_LANDMASS_INTERSECTION_V1",
        "selector_authority":"LIVE_GENERATOR_FUNCTIONS",
        "relief_applies_to_all_24":True,
        "assets":[],
    }

    total_bytes = 0
    note_markets = []

    for market_key in EXPECTED_MARKETS:
        if market_key in SOVEREIGN_MARKETS:
            feature = sovereign_feature(countries, market_key)
            source_name = "ne_50m_admin_0_countries.geojson"
        elif market_key in UK_MARKETS:
            feature = uk_feature(units, market_key)
            source_name = "ne_50m_admin_0_map_units.geojson"
        elif market_key == "AE-DU":
            feature = dubai_feature(admin1, market_key)
            source_name = "ne_10m_admin_1_states_provinces.geojson"
        else:
            raise RuntimeError(f"Unmapped market: {market_key}")

        polygons = polygons_from_geometry(feature["geometry"])

        selected, removed, mode, home_land = select_physical_mainland(
            market_key,
            polygons,
            land_polygons,
        )

        selected_rings = flatten_rings(selected)

        relief_layers, relief_binary = build_relief_layers(
            live_authority,
            selected_rings,
            Path(args.relief_raster),
            args.sips_path,
            args.relief_width,
            args.relief_height,
        )

        note_required = removed > 0

        if note_required:
            note_markets.append(market_key)

        svg = svg_for_market(
            live_authority,
            market_key,
            selected_rings,
            relief_layers,
            note_required,
            source_name,
        )

        output = assets_dir / (market_key.lower() + ".svg")
        output.write_text(svg, encoding="utf-8")

        size = output.stat().st_size
        total_bytes += size

        if size > PER_ASSET_MAX_BYTES:
            raise RuntimeError(f"{market_key}: SVG budget exceeded")

        if relief_binary > RELIEF_MAX_BYTES_PER_ASSET:
            raise RuntimeError(f"{market_key}: relief budget exceeded")

        manifest["assets"].append({
            "market_key":market_key,
            "file_name":output.name,
            "removed_components":removed,
            "selection_mode":mode,
            "home_land_id":home_land,
            "note_required":note_required,
            "relief_binary_bytes":relief_binary,
            "svg_bytes":size,
        })

    if note_markets != MAP_V4_APPROVED_NOTE_MARKETS:
        raise RuntimeError(
            "Approved omission-note market set changed: "
            + json.dumps(note_markets)
        )

    if total_bytes > TOTAL_MAX_BYTES:
        raise RuntimeError("Total 24-map SVG budget exceeded")

    manifest["total_svg_bytes"] = total_bytes
    manifest["note_markets"] = note_markets
    manifest["note_market_count"] = len(note_markets)

    (output_root / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print("MARKET_MAP_ASSETS_GENERATED=24")
    print(f"MARKET_MAP_TOTAL_BYTES={total_bytes}")
    print("MAP_MAINLAND_ALGORITHM=HOME_PHYSICAL_LANDMASS_INTERSECTION_V1")
    print("MAP_RELIEF_APPLIES_TO_ALL_24=true")


if __name__ == "__main__":
    main()
