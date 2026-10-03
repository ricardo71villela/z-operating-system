"""
OpenStreetMap — agências imobiliárias (office=estate_agent ou shop=estate_agent)
em França, Bélgica e Luxemburgo, via Overpass API (dados © contribuidores
OpenStreetMap, licença ODbL).

- Luxemburgo: o OSM é a fonte principal (não há registo gratuito com código
  de atividade): cria/atualiza linhas com source = 'osm'.
- França e Bélgica: o OSM só ENRIQUECE as linhas dos registos oficiais
  (telefone, e-mail, site) quando encontra a mesma agência:
    FR — a menos de 150 m (coordenadas SIRENE) e com nome parecido;
    BE — mesmo código postal e nome parecido.
  Nunca substitui um contacto já conhecido.

Uso: python src/fetch_osm.py [--country LU] [--dry-run]
"""

import argparse
import math
import time

import requests

from common import (Supabase, REGISTRY_COLUMNS, USER_AGENT, classify, clean_email, clean_phone,
                    clean_website, normalise, now_iso)

OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
STOP = {"immobilier", "immobiliere", "immo", "agence", "sarl", "sas", "sasu", "eurl", "sa", "srl", "bv", "sprl",
        "the", "de", "du", "des", "la", "le", "les", "l", "et", "real", "estate", "vastgoed", "immobilien", "sci"}


def overpass(country):
    query = f"""[out:json][timeout:900];
area["ISO3166-1"="{country}"][admin_level=2]->.a;
(nwr["office"="estate_agent"](area.a); nwr["shop"="estate_agent"](area.a););
out center tags;"""
    for attempt in range(6):
        url = OVERPASS[attempt % len(OVERPASS)]
        try:
            r = requests.post(url, data={"data": query}, headers={"User-Agent": USER_AGENT}, timeout=960)
            if r.status_code == 200:
                return r.json().get("elements", [])
            print(f"  Overpass {url}: HTTP {r.status_code}")
        except requests.RequestException as e:
            print(f"  Overpass {url}: {e}")
        time.sleep(30 * (attempt + 1))
    raise RuntimeError(f"Overpass indisponível para {country}")


def element_record(el, country):
    t = el.get("tags", {})
    lat = el.get("lat") or (el.get("center") or {}).get("lat")
    lon = el.get("lon") or (el.get("center") or {}).get("lon")
    street = " ".join(x for x in [t.get("addr:housenumber"), t.get("addr:street")] if x)
    return {
        "osm_id": f"{el['type']}/{el['id']}",
        "name": t.get("name") or t.get("brand") or t.get("operator"),
        "brand": t.get("brand"),
        "lat": lat, "lon": lon,
        "postcode": t.get("addr:postcode"), "city": t.get("addr:city"),
        "address": " ".join(x for x in [street, t.get("addr:postcode"), t.get("addr:city")] if x) or None,
        "phone": clean_phone(t.get("phone") or t.get("contact:phone"), country),
        "email": clean_email(t.get("email") or t.get("contact:email")),
        "website": clean_website(t.get("website") or t.get("contact:website") or t.get("url")),
    }


def tokens(name):
    return {w for w in normalise(name).split() if w not in STOP and len(w) > 1}


def similar(a, b):
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / min(len(ta), len(tb))


def distance_m(lat1, lon1, lat2, lon2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def match(rec, rows, country):
    """A linha do registo que corresponde a este elemento OSM, ou None."""
    best, best_score = None, 0.0
    for row in rows:
        names = [row.get("trade_name"), row.get("name")]
        score = max(similar(rec["name"], n) for n in names if n) if any(names) else 0
        if score < 0.6:
            continue
        if country == "FR":
            if None in (rec["lat"], row.get("latitude")) or distance_m(rec["lat"], rec["lon"], row["latitude"], row["longitude"]) > 150:
                continue
        elif rec["postcode"] != row.get("postcode"):
            continue
        if score > best_score:
            best, best_score = row, score
    return best


def lu_rows(records, seen_at):
    rows = []
    for rec in records:
        if not rec["name"]:
            continue
        kind, network = classify(rec["name"], rec["brand"], False, None, False)
        row = {
            "country": "LU", "source": "osm", "source_id": rec["osm_id"], "company_id": None,
            "name": rec["name"], "trade_name": rec["brand"] if rec["brand"] and rec["brand"] != rec["name"] else None,
            "type": kind, "network": network, "is_natural_person": False, "legal_form": None, "activity_code": None,
            "is_head_office": None, "address": rec["address"], "postcode": rec["postcode"], "city": rec["city"],
            "commune_code": None, "latitude": rec["lat"], "longitude": rec["lon"], "registry_created": None,
            "last_seen_at": seen_at, "active": True, "updated_at": seen_at,
        }
        for k in ("phone", "email", "website"):
            if rec[k]:
                row[k], row[f"{k}_source"] = rec[k], "osm"
        rows.append(row)
    return rows


def enrich_registry(db, country, records, dry):
    cols = "id,name,trade_name,postcode,latitude,longitude,phone,email,website"
    rows = db.select(f"select={cols}&country=eq.{country}&active=eq.true&source=neq.osm") if db else []
    index = {}
    for row in rows:
        key = row.get("postcode") if country == "BE" else (round(row["latitude"], 2), round(row["longitude"], 2)) if row.get("latitude") else None
        if key is not None:
            index.setdefault(key, []).append(row)
    updated = 0
    for rec in records:
        if not rec["name"] or not any(rec[k] for k in ("phone", "email", "website")):
            continue
        if country == "BE":
            cands = index.get(rec["postcode"], [])
        else:
            if rec["lat"] is None:
                continue
            la, lo = round(rec["lat"], 2), round(rec["lon"], 2)
            cands = [r for dla in (-0.01, 0, 0.01) for dlo in (-0.01, 0, 0.01) for r in index.get((round(la + dla, 2), round(lo + dlo, 2)), [])]
        row = match(rec, cands, country)
        if not row:
            continue
        values = {}
        for k in ("phone", "email", "website"):
            if rec[k] and not row.get(k):
                values[k], values[f"{k}_source"] = rec[k], "osm"
                row[k] = rec[k]
        if values and not dry:
            values["updated_at"] = now_iso()
            db.patch(f"id=eq.{row['id']}", values)
        updated += bool(values)
    print(f"  {country}: {updated} agências do registo enriquecidas pelo OSM")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", action="append", choices=["FR", "BE", "LU"])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    db = None if args.dry_run else Supabase()
    seen_at = now_iso()
    for country in args.country or ["LU", "BE", "FR"]:
        records = [element_record(el, country) for el in overpass(country)]
        print(f"OSM {country}: {len(records)} agências")
        if country == "LU":
            rows = lu_rows(records, seen_at)
            if db:
                db.upsert(rows, REGISTRY_COLUMNS)
                db.upsert_contacts(rows)
                db.patch(f"country=eq.LU&source=eq.osm&active=eq.true&last_seen_at=lt.{seen_at}", {"active": False, "updated_at": now_iso()})
        elif db:
            enrich_registry(db, country, records, args.dry_run)
        time.sleep(5)


if __name__ == "__main__":
    main()
