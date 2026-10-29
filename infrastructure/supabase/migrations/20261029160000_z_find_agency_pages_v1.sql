-- Z Find — page publique de l'agence (zfind.online/fr/agence/{slug}) et
-- fiche éditable dans l'espace Partner (« Ma page agence »).
--
-- - zfind_partner_profiles : présentation, coordonnées, horaires, adresse
--   d'une agence partenaire (une ligne par agence).
-- - L'agence lit et modifie sa fiche par deux fonctions (aucune écriture
--   directe) ; l'administration lit toutes les fiches.
-- - Le logo reste dans le bucket privé « listing-media », sous
--   partners/{partner_id}/ : l'agence peut y déposer son logo ; la page
--   publique le sert par une URL signée (fonction serveur).
-- - La page publique est lue par le serveur (service_role).
-- Idempotent, sans suppression.

create table if not exists public.zfind_partner_profiles (
  partner_id uuid primary key references public.partners(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  description text check (description is null or char_length(description) <= 3000),
  phone text check (phone is null or char_length(phone) <= 40),
  email text check (email is null or email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  website text check (website is null or website ~* '^https://[^\s]+$'),
  address text check (address is null or char_length(address) <= 200),
  postcode text check (postcode is null or char_length(postcode) <= 12),
  city text check (city is null or char_length(city) <= 100),
  country text check (country is null or country in ('FR', 'BE', 'LU')),
  opening_hours text check (opening_hours is null or char_length(opening_hours) <= 500),
  public_page boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.zfind_partner_profiles enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'zfind_partner_profiles' and policyname = 'zfind_partner_profiles_own_or_admin_read') then
    create policy zfind_partner_profiles_own_or_admin_read on public.zfind_partner_profiles for select to authenticated
      using (public.is_own_partner(partner_id) or public.is_admin());
  end if;
end $$;
revoke all on public.zfind_partner_profiles from public, anon, authenticated;
grant select on public.zfind_partner_profiles to authenticated;
grant select on public.zfind_partner_profiles to service_role;

-- « Agence du Lac Thonon » → « agence-du-lac-thonon » (unique : -2, -3…).
create or replace function public.zfind_partner_profile_slug(p_partner_id uuid, p_name text, p_city text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base text := trim(both '-' from regexp_replace(lower(public.unaccent(coalesce(p_name, '') || ' ' || coalesce(p_city, ''))), '[^a-z0-9]+', '-', 'g'));
  v_slug text;
  v_n int := 1;
begin
  if v_base = '' then v_base := 'agence'; end if;
  v_base := left(v_base, 70);
  v_base := trim(both '-' from v_base);
  v_slug := v_base;
  while exists (select 1 from public.zfind_partner_profiles where slug = v_slug and partner_id <> p_partner_id) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;
revoke all on function public.zfind_partner_profile_slug(uuid, text, text) from public, anon, authenticated;

-- Fiche de l'agence connectée ; à défaut, les informations de l'inscription.
create or replace function public.zfind_partner_get_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_partner uuid := public.zfind_partner_feed_partner();
  v_p public.partners%rowtype;
  v_pr public.zfind_partner_profiles%rowtype;
  v_s record;
begin
  if v_partner is null then
    raise exception 'Accès réservé aux comptes agence.' using errcode = '42501';
  end if;
  select * into v_p from public.partners where id = v_partner;
  select * into v_pr from public.zfind_partner_profiles where partner_id = v_partner;
  select coalesce(nullif(btrim(trade_name), ''), legal_name) as name, address, postcode, city, phone, email, website, country
    into v_s from public.zfind_partner_signups where partner_id = v_partner order by created_at asc limit 1;
  return jsonb_build_object(
    'partner_id', v_partner,
    'name', v_p.name,
    'status', v_p.status,
    'logo_storage_path', v_p.logo_storage_path,
    'saved', v_pr.partner_id is not null,
    'slug', coalesce(v_pr.slug, public.zfind_partner_profile_slug(v_partner, v_p.name, coalesce(v_pr.city, v_s.city))),
    'description', v_pr.description,
    'phone', coalesce(v_pr.phone, v_s.phone),
    'email', coalesce(v_pr.email, v_s.email),
    'website', coalesce(v_pr.website, v_s.website),
    'address', coalesce(v_pr.address, v_s.address),
    'postcode', coalesce(v_pr.postcode, v_s.postcode),
    'city', coalesce(v_pr.city, v_s.city),
    'country', coalesce(v_pr.country, v_s.country, 'FR'),
    'opening_hours', v_pr.opening_hours,
    'public_page', coalesce(v_pr.public_page, true),
    'updated_at', v_pr.updated_at
  );
end;
$$;
revoke all on function public.zfind_partner_get_profile() from public, anon;
grant execute on function public.zfind_partner_get_profile() to authenticated;

-- Enregistre la fiche (champs vides = null). Le slug est fixé au premier
-- enregistrement et ne change plus : l'adresse de la page reste stable.
create or replace function public.zfind_partner_save_profile(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner uuid := public.zfind_partner_feed_partner();
  v_name text;
  v_existing text;
  v_web text := nullif(btrim(p->>'website'), '');
begin
  if v_partner is null then
    raise exception 'Accès réservé aux comptes agence.' using errcode = '42501';
  end if;
  if v_web is not null and v_web !~* '^https?://' then v_web := 'https://' || v_web; end if;
  if v_web is not null and v_web ~* '^http://' then v_web := 'https://' || substr(v_web, 8); end if;
  select name into v_name from public.partners where id = v_partner;
  select slug into v_existing from public.zfind_partner_profiles where partner_id = v_partner;
  insert into public.zfind_partner_profiles as t (partner_id, slug, description, phone, email, website, address, postcode, city, country, opening_hours, public_page, updated_at)
  values (
    v_partner,
    coalesce(v_existing, public.zfind_partner_profile_slug(v_partner, v_name, nullif(btrim(p->>'city'), ''))),
    nullif(btrim(p->>'description'), ''),
    nullif(btrim(p->>'phone'), ''),
    nullif(lower(btrim(p->>'email')), ''),
    v_web,
    nullif(btrim(p->>'address'), ''),
    nullif(btrim(p->>'postcode'), ''),
    nullif(btrim(p->>'city'), ''),
    coalesce(nullif(upper(btrim(p->>'country')), ''), 'FR'),
    nullif(btrim(p->>'opening_hours'), ''),
    coalesce((p->>'public_page')::boolean, true),
    now()
  )
  on conflict (partner_id) do update set
    description = excluded.description, phone = excluded.phone, email = excluded.email, website = excluded.website,
    address = excluded.address, postcode = excluded.postcode, city = excluded.city, country = excluded.country,
    opening_hours = excluded.opening_hours, public_page = excluded.public_page, updated_at = now();
  return public.zfind_partner_get_profile();
end;
$$;
revoke all on function public.zfind_partner_save_profile(jsonb) from public, anon;
grant execute on function public.zfind_partner_save_profile(jsonb) to authenticated;

-- Le logo : un fichier déjà déposé sous partners/{partner_id}/ (ou null pour l'enlever).
create or replace function public.zfind_partner_set_logo(p_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner uuid := public.zfind_partner_feed_partner();
begin
  if v_partner is null then
    raise exception 'Accès réservé aux comptes agence.' using errcode = '42501';
  end if;
  if p_path is not null and p_path not like ('partners/' || v_partner::text || '/%') then
    raise exception 'Logo invalide.' using errcode = '22023';
  end if;
  update public.partners set logo_storage_path = p_path where id = v_partner;
  return jsonb_build_object('logo_storage_path', p_path);
end;
$$;
revoke all on function public.zfind_partner_set_logo(text) from public, anon;
grant execute on function public.zfind_partner_set_logo(text) to authenticated;

-- Dépôt du logo par l'agence dans son propre dossier.
create or replace function public.zfind_partner_can_manage_logo_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.zfind_partner_feed_partner() is not null
     and p_name like ('partners/' || public.zfind_partner_feed_partner()::text || '/%');
$$;
revoke all on function public.zfind_partner_can_manage_logo_path(text) from public, anon;
grant execute on function public.zfind_partner_can_manage_logo_path(text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'partner: upload own logo') then
    create policy "partner: upload own logo" on storage.objects for insert to authenticated
      with check (bucket_id = 'listing-media' and public.zfind_partner_can_manage_logo_path(name));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'partner: read own logo') then
    create policy "partner: read own logo" on storage.objects for select to authenticated
      using (bucket_id = 'listing-media' and public.zfind_partner_can_manage_logo_path(name));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'partner: update own logo') then
    create policy "partner: update own logo" on storage.objects for update to authenticated
      using (bucket_id = 'listing-media' and public.zfind_partner_can_manage_logo_path(name))
      with check (bucket_id = 'listing-media' and public.zfind_partner_can_manage_logo_path(name));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'partner: delete own logo') then
    create policy "partner: delete own logo" on storage.objects for delete to authenticated
      using (bucket_id = 'listing-media' and public.zfind_partner_can_manage_logo_path(name));
  end if;
end $$;
