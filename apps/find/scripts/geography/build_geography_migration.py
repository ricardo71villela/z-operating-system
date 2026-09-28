#!/usr/bin/env python3
"""Generate the ZOS Geography migration for the Z Find launch markets.

Input : zfind_geo_fr_be_lu.json produced by build_geo_reference.py
        (INSEE COG via @etalab/decoupage-administratif, REFNIS 2025 Statbel,
        ODWB Belgian postal list, Post Luxembourg postal list via GeoNames).
Output: one replay-safe SQL migration that completes zos.geography_* for
        France (all communes + Paris/Lyon/Marseille arrondissements),
        Belgium (regions, provinces, arrondissements, 565 communes) and
        Luxembourg (12 cantons, 100 communes), plus postal codes.

Conventions follow 20260828120754_zos_geography_france_launch_v1.sql:
canonical codes FR-REG-xx / FR-DEP-xx / FR-COM-xxxxx, not-exists guards,
provenance + 'confirmed' history per location, postconditions.
"""

import argparse
import json
from pathlib import Path

VALID_FROM = "2026-01-01"
BATCH = "zfind-geography-fr-be-lu-full-v1"


def q(value):
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def values(rows):
    return ",\n".join("  (" + ",".join(q(v) for v in row) + ")" for row in rows)


def collect(data):
    fr, be, lu = data["countries"]
    loc = []      # (country, type, canonical_code, parent_type, parent_code)
    names = []    # (country, type, canonical_code, language, name)
    codes = []    # (country, type, canonical_code, code_system, code)
    prov = []     # (country, type, canonical_code, source_code, source_record_id, source_version)
    postal = []   # (country, type, canonical_code, postal_code, locality_name)

    # ---------------- France (regions/departments exist; communes completed) -------
    for region in fr["regions"]:
        for dep in region["departements"]:
            dcode = "FR-DEP-" + dep["code"]
            communes = [c for a in dep["arrondissements"] for c in a["communes"]]
            communes += dep.get("communes_hors_arrondissement", [])
            for c in communes:
                cc = "FR-COM-" + c["code"]
                loc.append(("FR", "commune", cc, "department", dcode))
                names.append(("FR", "commune", cc, "fr", c["name"]))
                codes.append(("FR", "commune", cc, "INSEE_COG_COMMUNE", c["code"]))
                prov.append(("FR", "commune", cc, "INSEE_COG", "commune:" + c["code"], VALID_FROM))
                for z in c["postal_codes"]:
                    postal.append(("FR", "commune", cc, z, None))
                for m in c.get("arrondissements_municipaux", []):
                    mc = "FR-ARM-" + m["code"]
                    loc.append(("FR", "municipal_district", mc, "commune", cc))
                    names.append(("FR", "municipal_district", mc, "fr", m["name"]))
                    codes.append(("FR", "municipal_district", mc, "INSEE_COG_ARM", m["code"]))
                    prov.append(("FR", "municipal_district", mc, "INSEE_COG", "arm:" + m["code"], VALID_FROM))
                    for z in m["postal_codes"]:
                        postal.append(("FR", "municipal_district", mc, z, None))

    # ---------------- Belgium ----------------
    loc.append(("BE", "country", "BE", None, None))
    names += [("BE", "country", "BE", l, n) for l, n in
              (("fr", "Belgique"), ("nl", "België"), ("de", "Belgien"), ("en", "Belgium"))]
    codes.append(("BE", "country", "BE", "ISO_3166-1", "BE"))
    prov.append(("BE", "country", "BE", "STATBEL_REFNIS", "refnis:1000", "2025"))
    ISO_REGION = {"2000": "BE-VLG", "3000": "BE-WAL", "4000": "BE-BRU"}
    ISO_PROV = {"10000": "BE-VAN", "20001": "BE-VBR", "20002": "BE-WBR", "30000": "BE-VWV",
                "40000": "BE-VOV", "50000": "BE-WHT", "60000": "BE-WLG", "70000": "BE-VLI",
                "80000": "BE-WLX", "90000": "BE-WNA"}

    def be_names(t, cc, node):
        for lang, key in (("fr", "name_fr"), ("nl", "name_nl"), ("de", "name_de"), ("en", "name_en")):
            if node.get(key):
                names.append(("BE", t, cc, lang, node[key]))

    for region in be["regions"]:
        rc = "BE-REG-" + region["code"]
        loc.append(("BE", "region", rc, "country", "BE"))
        be_names("region", rc, region)
        codes.append(("BE", "region", rc, "STATBEL_REFNIS", region["code"]))
        codes.append(("BE", "region", rc, "ISO_3166-2", ISO_REGION[region["code"]]))
        prov.append(("BE", "region", rc, "STATBEL_REFNIS", "refnis:" + region["code"], "2025"))
        for p in region["provinces"]:
            if p["code"]:
                pc = "BE-PRV-" + p["code"]
                loc.append(("BE", "province", pc, "region", rc))
                be_names("province", pc, p)
                codes.append(("BE", "province", pc, "STATBEL_REFNIS", p["code"]))
                codes.append(("BE", "province", pc, "ISO_3166-2", ISO_PROV[p["code"]]))
                prov.append(("BE", "province", pc, "STATBEL_REFNIS", "refnis:" + p["code"], "2025"))
                parent_type, parent_code = "province", pc
            else:
                parent_type, parent_code = "region", rc   # Bruxelles-Capitale: no province
            for a in p["arrondissements"]:
                ac = "BE-ARR-" + a["code"]
                loc.append(("BE", "arrondissement", ac, parent_type, parent_code))
                be_names("arrondissement", ac, a)
                codes.append(("BE", "arrondissement", ac, "STATBEL_REFNIS", a["code"]))
                prov.append(("BE", "arrondissement", ac, "STATBEL_REFNIS", "refnis:" + a["code"], "2025"))
                for c in a["communes"]:
                    cc = "BE-COM-" + c["code"]
                    loc.append(("BE", "commune", cc, "arrondissement", ac))
                    be_names("commune", cc, c)
                    codes.append(("BE", "commune", cc, "STATBEL_REFNIS", c["code"]))
                    prov.append(("BE", "commune", cc, "STATBEL_REFNIS", "refnis:" + c["code"], "2025"))
                    for l in c["localities"]:
                        postal.append(("BE", "commune", cc, l["postal_code"], l["name"]))

    # ---------------- Luxembourg ----------------
    loc.append(("LU", "country", "LU", None, None))
    names += [("LU", "country", "LU", l, n) for l, n in
              (("fr", "Luxembourg"), ("de", "Luxemburg"), ("lb", "Lëtzebuerg"), ("en", "Luxembourg"))]
    codes.append(("LU", "country", "LU", "ISO_3166-1", "LU"))
    prov.append(("LU", "country", "LU", "ZFIND_LU_REFERENCE", "country:LU", "2023"))
    for canton in lu["cantons"]:
        iso = canton["code"]                    # LU-CA …
        kc = "LU-CAN-" + iso.split("-")[1]
        loc.append(("LU", "canton", kc, "country", "LU"))
        names.append(("LU", "canton", kc, "fr", canton["name_fr"]))
        codes.append(("LU", "canton", kc, "ISO_3166-2", iso))
        prov.append(("LU", "canton", kc, "ZFIND_LU_REFERENCE", "canton:" + iso, "2023"))
        for c in canton["communes"]:
            cc = "LU-COM-" + c["code"][3:]      # LU-COM-<SLUG>
            loc.append(("LU", "commune", cc, "canton", kc))
            names.append(("LU", "commune", cc, "fr", c["name"]))
            prov.append(("LU", "commune", cc, "ZFIND_LU_REFERENCE", "commune:" + c["code"], "2023"))
            for l in c["localities"]:
                for z in l["postal_codes"]:
                    postal.append(("LU", "commune", cc, z, l["name"]))

    return loc, names, codes, prov, postal


HEADER = """-- ============================================================
-- ZOS GEOGRAPHY — France, Belgium, Luxembourg complete reference v1
-- ============================================================
-- Generated by apps/find/scripts/geography/build_geography_migration.py
-- from apps/find/scripts/geography/build_geo_reference.py output.
--
-- Source authority:
--   France     : INSEE Code officiel géographique 2026 (via
--                @etalab/decoupage-administratif 6.0.0), La Poste postal codes.
--   Belgium    : Statbel REFNIS 2025 (vocab.belgif.be, fusions of
--                2024-12-02 / 2025-01-01 applied); postal codes from the
--                ODWB "code-postaux-belge" list (2026), validated by bpost ranges.
--   Luxembourg : 12 cantons (ISO 3166-2:LU), 100 communes after the 2018
--                and 2023 fusions; Post Luxembourg postal codes via GeoNames.
--
-- Boundary:
--   * canonical ZOS Geography only (+ zos.geography_postal_codes, new);
--   * France: all 34,875 current communes (DROM included, COM excluded)
--     and the 45 Paris/Lyon/Marseille municipal arrondissements; regions
--     and departments already exist (France launch bootstrap v1);
--   * Belgium: country, 3 regions, 10 provinces, 43 arrondissements, 565 communes;
--   * Luxembourg: country, 12 cantons, 100 communes;
--   * no Z Find marketplace, zones_lite, listing or publication writes;
--   * no destructive SQL; replay-safe (not-exists guards).
-- ============================================================
"""


def build_sql(loc, names, codes, prov, postal):
    parts = [HEADER]
    parts.append("""
do $$
begin
  if to_regclass('zos.geography_locations') is null
     or to_regclass('zos.geography_names') is null
     or to_regclass('zos.geography_external_codes') is null
     or to_regclass('zos.geography_provenance') is null
     or to_regclass('zos.geography_location_history') is null then
    raise exception 'FR/BE/LU Geography requires canonical ZOS Geography tables';
  end if;
  if (select count(*) from zos.geography_locations where country_iso='FR' and location_type='department' and status='active') <> 101 then
    raise exception 'FR/BE/LU Geography requires the France launch bootstrap (101 departments)';
  end if;
end
$$;

-- Postal codes: many-to-many (one code serves several communes, one commune
-- has several codes), so they live beside zos.geography_external_codes.
create table if not exists zos.geography_postal_codes (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  country_iso text not null check (country_iso ~ '^[A-Z]{2}$'),
  postal_code text not null check (char_length(trim(postal_code)) > 0),
  locality_name text,
  source_code text not null check (char_length(trim(source_code)) > 0),
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  constraint fk_zos_geography_postal_codes_location_country foreign key (location_id, country_iso) references zos.geography_locations(id, country_iso) on delete restrict,
  constraint zos_geography_postal_codes_validity check (valid_to is null or valid_from is null or valid_to > valid_from)
);

comment on table zos.geography_postal_codes is 'Postal codes (and postal locality names) served by canonical geographic locations.';

alter table zos.geography_postal_codes enable row level security;

create unique index if not exists uq_zos_geography_postal_codes_current
  on zos.geography_postal_codes(location_id, postal_code, coalesce(locality_name, ''))
  where valid_to is null;

create index if not exists idx_zos_geography_postal_codes_lookup
  on zos.geography_postal_codes(country_iso, postal_code);

create temporary table _geo_loc (country_iso text, location_type text, canonical_code text, parent_type text, parent_code text, ord integer);
create temporary table _geo_name (country_iso text, location_type text, canonical_code text, language_code text, name text);
create temporary table _geo_code (country_iso text, location_type text, canonical_code text, code_system text, code text);
create temporary table _geo_prov (country_iso text, location_type text, canonical_code text, source_code text, source_record_id text, source_version text);
create temporary table _geo_postal (country_iso text, location_type text, canonical_code text, postal_code text, locality_name text);
""")
    # ordered so parents are inserted before children
    rank = {"country": 0, "region": 1, "province": 2, "canton": 2, "department": 2,
            "arrondissement": 3, "commune": 4, "municipal_district": 5}
    loc_rows = [row + (rank[row[1]],) for row in loc]

    def chunked(table, cols, rows, size=2000):
        for i in range(0, len(rows), size):
            parts.append(f"insert into {table} ({cols}) values\n{values(rows[i:i + size])};\n")

    chunked("_geo_loc", "country_iso, location_type, canonical_code, parent_type, parent_code, ord", loc_rows)
    chunked("_geo_name", "country_iso, location_type, canonical_code, language_code, name", names)
    chunked("_geo_code", "country_iso, location_type, canonical_code, code_system, code", codes)
    chunked("_geo_prov", "country_iso, location_type, canonical_code, source_code, source_record_id, source_version", prov)
    chunked("_geo_postal", "country_iso, location_type, canonical_code, postal_code, locality_name", postal)

    parts.append(f"""
-- 1. Country roots (BE, LU)
insert into zos.geography_locations (location_type, canonical_code, country_iso, parent_id, status, valid_from)
select 'country', d.canonical_code, d.country_iso, null, 'active', '{VALID_FROM}'::timestamptz
from _geo_loc d
where d.location_type = 'country'
  and not exists (select 1 from zos.geography_locations gl where gl.country_iso = d.country_iso and gl.location_type = 'country' and gl.status = 'active');

-- 2. Children, level by level (parents first)
do $$
declare lvl integer;
begin
  for lvl in 1..5 loop
    insert into zos.geography_locations (location_type, canonical_code, country_iso, parent_id, status, valid_from)
    select d.location_type, d.canonical_code, d.country_iso, p.id, 'active', '{VALID_FROM}'::timestamptz
    from _geo_loc d
    join zos.geography_locations p
      on p.country_iso = d.country_iso and p.location_type = d.parent_type
     and p.canonical_code = d.parent_code and p.status = 'active'
    where d.ord = lvl
      and not exists (
        select 1 from zos.geography_locations gl
        where gl.country_iso = d.country_iso and gl.location_type = d.location_type
          and gl.canonical_code = d.canonical_code and gl.status = 'active');
  end loop;
end
$$;

-- 3. Names
insert into zos.geography_names (location_id, language_code, name, name_type, valid_from)
select gl.id, d.language_code, d.name, 'canonical', '{VALID_FROM}'::timestamptz
from _geo_name d
join zos.geography_locations gl on gl.country_iso = d.country_iso and gl.location_type = d.location_type and gl.canonical_code = d.canonical_code and gl.status = 'active'
where not exists (select 1 from zos.geography_names gn where gn.location_id = gl.id and gn.language_code = d.language_code and gn.name_type = 'canonical' and gn.valid_to is null);

-- 4. Official codes
insert into zos.geography_external_codes (location_id, code_system, country_iso, code, valid_from)
select gl.id, d.code_system, d.country_iso, d.code, '{VALID_FROM}'::timestamptz
from _geo_code d
join zos.geography_locations gl on gl.country_iso = d.country_iso and gl.location_type = d.location_type and gl.canonical_code = d.canonical_code and gl.status = 'active'
where not exists (select 1 from zos.geography_external_codes gec where gec.code_system = d.code_system and gec.country_iso = d.country_iso and gec.code = d.code and gec.valid_to is null);

-- 5. Provenance + confirmed history
insert into zos.geography_provenance (location_id, source_code, source_record_id, source_version, batch_id, observed_at, raw_payload)
select gl.id, d.source_code, d.source_record_id, d.source_version, '{BATCH}', now(),
       jsonb_build_object('location_type', d.location_type, 'canonical_code', d.canonical_code)
from _geo_prov d
join zos.geography_locations gl on gl.country_iso = d.country_iso and gl.location_type = d.location_type and gl.canonical_code = d.canonical_code and gl.status = 'active'
where not exists (select 1 from zos.geography_provenance gp where gp.location_id = gl.id and gp.source_code = d.source_code and gp.source_record_id = d.source_record_id and gp.source_version is not distinct from d.source_version);

insert into zos.geography_location_history (location_id, change_type, before_state, after_state, provenance_id, batch_id, changed_by)
select gp.location_id, 'confirmed', null,
       jsonb_build_object('source', gp.source_code, 'source_version', gp.source_version),
       gp.id, '{BATCH}', 'migration'
from zos.geography_provenance gp
where gp.batch_id = '{BATCH}'
  and not exists (select 1 from zos.geography_location_history gh where gh.location_id = gp.location_id and gh.change_type = 'confirmed' and gh.batch_id = '{BATCH}');

-- 6. Postal codes
insert into zos.geography_postal_codes (location_id, country_iso, postal_code, locality_name, source_code, valid_from)
select distinct gl.id, d.country_iso, d.postal_code, d.locality_name,
       case d.country_iso when 'FR' then 'LA_POSTE_VIA_INSEE_COG' when 'BE' then 'ODWB_CODE_POSTAUX_BELGE' else 'POST_LU_VIA_GEONAMES' end,
       '{VALID_FROM}'::timestamptz
from _geo_postal d
join zos.geography_locations gl on gl.country_iso = d.country_iso and gl.location_type = d.location_type and gl.canonical_code = d.canonical_code and gl.status = 'active'
where not exists (
  select 1 from zos.geography_postal_codes pc
  where pc.location_id = gl.id and pc.postal_code = d.postal_code
    and coalesce(pc.locality_name, '') = coalesce(d.locality_name, '') and pc.valid_to is null);
""")
    counts = {}
    for c, t, *_ in loc:
        counts[(c, t)] = counts.get((c, t), 0) + 1
    checks = "\n".join(
        f"  select count(*) into n from zos.geography_locations where country_iso='{c}' and location_type='{t}' and status='active';\n"
        f"  if n <> {k} then raise exception 'FR/BE/LU Geography postcondition failed: expected {k} {c} {t}, got %', n; end if;"
        for (c, t), k in sorted(counts.items()) if t != "country")
    parts.append(f"""
-- 7. Postconditions
do $$
declare n integer;
begin
{checks}
  if exists (
    select 1 from zos.geography_locations child
    join zos.geography_locations parent on parent.id = child.parent_id
    where child.country_iso in ('FR','BE','LU') and child.status = 'active' and parent.country_iso <> child.country_iso
  ) then raise exception 'FR/BE/LU Geography postcondition failed: cross-country parent leakage'; end if;
  select count(*) into n from zos.geography_postal_codes where country_iso in ('FR','BE','LU') and valid_to is null;
  if n < {len(set(postal)) * 9 // 10} then raise exception 'FR/BE/LU Geography postcondition failed: postal codes %', n; end if;
end
$$;

drop table _geo_loc;
drop table _geo_name;
drop table _geo_code;
drop table _geo_prov;
drop table _geo_postal;
""")
    return "".join(parts), counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    data = json.loads(Path(args.input).read_text(encoding="utf-8"))
    sql, counts = build_sql(*collect(data))
    Path(args.output).write_text(sql, encoding="utf-8")
    print("written", args.output, len(sql.encode()), "bytes")
    for k, v in sorted(counts.items()):
        print(" ", k, v)


if __name__ == "__main__":
    main()
