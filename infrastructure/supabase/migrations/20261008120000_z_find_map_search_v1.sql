-- ============================================================
-- Z FIND — Recherche sur la carte : centre des communes et des zones
--
-- 1. zfind_communes.latitude / longitude : centre de chaque commune
--    (FR, BE, LU), chargé par le job « Comunas » (load_communes.py,
--    données GeoNames CC BY 4.0).
-- 2. zones_lite.latitude / longitude : copie du centre de la commune de la
--    zone, tenue à jour par deux déclencheurs :
--    - à la création d'une zone (ou au changement de sa commune) ;
--    - au (re)chargement des centres des communes.
--    Une annonce sans position exacte est affichée sur la carte au centre
--    de sa commune, présentée comme « position approximative ». Rien n'est
--    inventé : sans commune connue, pas de point.
-- Lecture publique inchangée (zones_lite déjà lisible) ; aucune adresse
-- n'est exposée.
-- ============================================================

alter table public.zfind_communes add column if not exists latitude double precision;
alter table public.zfind_communes add column if not exists longitude double precision;
alter table public.zones_lite add column if not exists latitude double precision;
alter table public.zones_lite add column if not exists longitude double precision;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'zfind_communes_centre_range') then
    alter table public.zfind_communes add constraint zfind_communes_centre_range
      check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zones_lite_centre_range') then
    alter table public.zones_lite add constraint zones_lite_centre_range
      check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180));
  end if;
end $$;

-- A zone takes the centre of its commune when it is created or re-linked.
create or replace function public.zfind_zone_take_commune_centre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.commune_code is not null then
    select c.latitude, c.longitude into new.latitude, new.longitude
      from public.zfind_communes c
     where c.country = new.country_iso and c.code = new.commune_code and c.latitude is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists zfind_zone_take_commune_centre on public.zones_lite;
create trigger zfind_zone_take_commune_centre
  before insert or update of commune_code on public.zones_lite
  for each row execute function public.zfind_zone_take_commune_centre();

-- Loading (or correcting) the communes' centres updates the zones already in use.
create or replace function public.zfind_commune_centre_to_zones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.zones_lite z
     set latitude = new.latitude, longitude = new.longitude
   where z.country_iso = new.country and z.commune_code = new.code
     and (z.latitude is distinct from new.latitude or z.longitude is distinct from new.longitude);
  return null;
end;
$$;

drop trigger if exists zfind_commune_centre_to_zones on public.zfind_communes;
create trigger zfind_commune_centre_to_zones
  after insert or update of latitude, longitude on public.zfind_communes
  for each row when (new.latitude is not null)
  execute function public.zfind_commune_centre_to_zones();

revoke all on function public.zfind_zone_take_commune_centre() from public, anon, authenticated;
revoke all on function public.zfind_commune_centre_to_zones() from public, anon, authenticated;

-- Zones already linked to a commune whose centre is known (none until the job loads them).
update public.zones_lite z
   set latitude = c.latitude, longitude = c.longitude
  from public.zfind_communes c
 where c.country = z.country_iso and c.code = z.commune_code and c.latitude is not null
   and (z.latitude is distinct from c.latitude or z.longitude is distinct from c.longitude);
