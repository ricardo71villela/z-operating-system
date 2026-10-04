-- ============================================================
-- Z FIND — Localiser un bien : commune (FR / BE / LU)
--
-- 1. zfind_communes : les 34 920 communes de France, 565 de Belgique et
--    100 du Luxembourg (index publics du site, chargés par GitHub Actions :
--    apps/find/ingest/agencias/src/load_communes.py). Lecture par RPC.
-- 2. zones_lite.commune_code : une zone par commune, créée à la demande
--    (nom = nom officiel de la commune, comme le résout la recherche du
--    site) ; les 24 zones françaises déjà liées à la géographie ZOS
--    reçoivent leur code INSEE.
-- 3. zfind_commune_search(country, query) : par code postal ou par nom
--    (sans accents), pour le panneau partenaires et l'Admin.
-- 4. zfind_set_asset_commune(kind, asset, country, code) : relie un bien
--    ou un programme à sa commune. Le partenaire ne peut le faire que sur
--    ses propres biens ; une commune inconnue est refusée.
-- 5. Les partenaires connectés lisent zones_lite (données publiques),
--    pour afficher la commune de leurs biens.
-- ============================================================

create table if not exists public.zfind_communes (
  country text not null check (country in ('FR', 'BE', 'LU')),
  code text not null,
  name text not null,
  name_folded text not null,
  postcodes text[] not null default '{}',
  aliases text[] not null default '{}',
  aliases_folded text not null default '',
  parent text,
  updated_at timestamptz not null default now(),
  primary key (country, code)
);
create index if not exists zfind_communes_name_idx on public.zfind_communes (country, name_folded text_pattern_ops);
create index if not exists zfind_communes_postcodes_idx on public.zfind_communes using gin (postcodes);

alter table public.zfind_communes enable row level security;
revoke all on table public.zfind_communes from anon, authenticated;
grant all on table public.zfind_communes to service_role;

alter table public.zones_lite add column if not exists commune_code text;
create unique index if not exists zones_lite_commune_uq
  on public.zones_lite (country_iso, commune_code) where commune_code is not null;

update public.zones_lite z
   set commune_code = substr(l.canonical_code, 8)
  from zos.geography_locations l
 where l.id = z.geography_entity_id
   and l.country_iso = 'FR' and l.location_type = 'commune'
   and l.canonical_code like 'FR-COM-%'
   and z.commune_code is null;

grant select on table public.zones_lite to authenticated;
drop policy if exists "authenticated read zones_lite" on public.zones_lite;
create policy "authenticated read zones_lite" on public.zones_lite
  for select to authenticated using (true);

-- ------------------------------------------------------------ search
create or replace function public.zfind_commune_search(p_country text, p_query text)
returns table (code text, name text, postcodes text[], parent text, zone_label text)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select upper(coalesce(p_country, '')) as c,
           lower(btrim(coalesce(p_query, ''))) as t
  ), m as (
    select c.code, c.name, c.postcodes, c.parent,
           case
             when q.t ~ '^[0-9]+$' then case when q.t = any (c.postcodes) then 6 else 3 end
             when c.name_folded = q.t then 5
             when c.aliases_folded like '%|' || q.t || '|%' then 4.5
             when c.name_folded like q.t || '%' then 4
             when c.aliases_folded like '%|' || q.t || '%' then 2.5
             when c.name_folded like '%' || q.t || '%' then 2
             else 1
           end as score
      from public.zfind_communes c, q
     where c.country = q.c
       and char_length(q.t) >= 2
       and case
             when q.t ~ '^[0-9]+$' then exists (select 1 from unnest(c.postcodes) p where p like q.t || '%')
             else c.name_folded like '%' || q.t || '%' or c.aliases_folded like '%' || q.t || '%'
           end
  )
  select m.code, m.name, m.postcodes, m.parent,
         m.name || case when cardinality(m.postcodes) > 0 then ' (' || array_to_string(m.postcodes[1:3], ', ') || ')' else '' end
    from m
   order by m.score desc, char_length(m.name), m.name
   limit 12;
$$;

revoke all on function public.zfind_commune_search(text, text) from public;
grant execute on function public.zfind_commune_search(text, text) to anon, authenticated;

-- ------------------------------------------------------------ set commune
create or replace function public.zfind_set_asset_commune(p_kind text, p_asset_id uuid, p_country text, p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_role text;
  v_commune public.zfind_communes%rowtype;
  v_zone uuid;
  v_geo uuid;
  v_name text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('admin', 'partner_user') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind not in ('property', 'development') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  select * into v_commune from public.zfind_communes
   where country = upper(coalesce(p_country, '')) and code = p_code;
  if not found then
    raise exception 'unknown_commune' using errcode = '22023';
  end if;

  if p_kind = 'property' then
    if not exists (select 1 from public.properties where id = p_asset_id) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if v_role = 'partner_user' and not public.zfind_partner_owns_property(p_asset_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    if not exists (select 1 from public.developments where id = p_asset_id) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if v_role = 'partner_user' and not public.zfind_partner_owns_development(p_asset_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  -- One zone per commune, created on first use.
  perform pg_advisory_xact_lock(hashtext('zfind_commune_zone_' || v_commune.country || '_' || v_commune.code));
  select id into v_zone from public.zones_lite
   where country_iso = v_commune.country and commune_code = v_commune.code;

  if v_zone is null then
    select id into v_geo from zos.geography_locations
     where country_iso = v_commune.country and location_type = 'commune'
       and canonical_code = v_commune.country || '-COM-' || v_commune.code and status = 'active'
     limit 1;
    v_name := v_commune.name;
    -- Homonyms (Saint-Denis 93 / 974…): the name carries the department or province.
    if exists (select 1 from public.zones_lite where name = v_name and city = v_commune.name and country_iso = v_commune.country) then
      v_name := v_commune.name || ' (' || coalesce(nullif(v_commune.parent, ''), v_commune.code) || ')';
    end if;
    insert into public.zones_lite (name, city, country_iso, geography_entity_id, geography_binding_status, commune_code)
    values (v_name, v_commune.name, v_commune.country, v_geo,
            case when v_geo is null then 'unbound' else 'linked' end, v_commune.code)
    returning id into v_zone;
  end if;

  if p_kind = 'property' then
    update public.properties
       set zone_lite_id = v_zone,
           postal_code = case
             when coalesce(btrim(postal_code), '') = '' and cardinality(v_commune.postcodes) = 1 then v_commune.postcodes[1]
             else postal_code end
     where id = p_asset_id;
  else
    update public.developments set zone_lite_id = v_zone where id = p_asset_id;
  end if;

  return jsonb_build_object('zone_lite_id', v_zone, 'name', v_commune.name, 'country', v_commune.country,
    'code', v_commune.code, 'postcodes', to_jsonb(v_commune.postcodes), 'parent', v_commune.parent);
end;
$$;

revoke all on function public.zfind_set_asset_commune(text, uuid, text, text) from public, anon;
grant execute on function public.zfind_set_asset_commune(text, uuid, text, text) to authenticated;
