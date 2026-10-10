-- ============================================================
-- Z FIND — Partner self-service import + automatic feeds v1
--
-- Until now only the Admin could load an agency's portfolio
-- (« Nous chargeons pour vous », Admin commands). This migration lets
-- the agency do it itself, from the Partner panel (« Importer mes
-- annonces ») and every night from its software's export
-- (« Flux automatique », site function /api/feed-sync), with the SAME
-- shared code (zfind-web/src/services/listing-import).
--
-- What a Partner could already do through existing commands, each one
-- checking that its agency controls the asset, and that the import
-- reuses as is:
--   zfind_create_property (Property + 'proposed' Representation),
--   zfind_update_asset, zfind_set_asset_commune,
--   zfind_partner_ensure_draft_listing (DRAFT Listing),
--   zfind_partner_upsert_listing_content, zfind_save_listing_compliance,
--   zfind_get_listing_compliance, zfind_partner_submit_listing (#160).
--
-- Added here (all SECURITY DEFINER, search_path pinned, authorization by
-- the canonical predicate public.zfind_partner_controls_listing —
-- migration 20260813213456 — or the caller's partner_user profile):
--
--   1. zfind_partner_update_listing_commercial(uuid, jsonb)
--        price / rent, sale <-> rent, currency, « à partir de »; NEVER
--        the status (callable from a SECURITY DEFINER context, unlike the
--        RLS + column-grant path of the panel).
--   2. zfind_partner_archive_imported_listing(uuid)
--        any non-archived status -> 'archived' (never deleted, never
--        published), only for the agency's own Listing whose Property
--        carries an agency reference (an imported listing).
--   3. zfind_partner_queue_listing_photos(uuid, text[], integer)
--        photo links into zfind_media_import_queue (migration
--        20261004200000), fetched by /api/media-import; partner SELECT
--        policy on that queue for the progress.
--   4. zfind_partner_import_portfolio()
--        the agency's referenced portfolio, read only, in the shape the
--        sync planner reads (with the photo links already queued).
--   5. Feeds: public.zfind_listing_feeds (one per agency, no secret) and
--      public.zfind_listing_feed_secrets (HTTP basic-auth password:
--      service_role only — never readable by anon / authenticated, not
--      even through a function). Partner: zfind_partner_get_feed,
--      zfind_partner_save_feed (password set / replaced / cleared, never
--      returned), zfind_partner_request_feed_test,
--      zfind_partner_accept_feed_volume. Admin: zfind_admin_list_feeds,
--      zfind_admin_set_feed_active, zfind_admin_request_feed_run.
--   6. Server only (service_role, /api/feed-sync): zfind_feed_claim,
--      zfind_feed_record, zfind_feed_call. zfind_feed_call runs ONE
--      whitelisted Partner command AS the agency (its partner_user
--      profile, the feed's creator first): the nightly job never has
--      more rights than the agency in its own panel.
--
-- Additive and idempotent: create table / index if not exists, create or
-- replace function, drop policy if exists + create policy. No existing
-- function, table or policy is changed.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Partner: commercial terms of its own listing (never the status)
-- ------------------------------------------------------------

create or replace function public.zfind_partner_update_listing_commercial(p_listing_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_bad text[];
  v_listing public.listings%rowtype;
  v_tx text;
  v_period text;
  v_price numeric;
  v_currency text;
begin
  if p_listing_id is null then
    raise exception 'Annonce non précisée.' using errcode = '22023';
  end if;
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Modification invalide.' using errcode = '22023';
  end if;
  select pg_catalog.array_agg(k) into v_bad
  from pg_catalog.jsonb_object_keys(p_patch) as keys(k)
  where k <> all (array['transaction_type', 'rental_period', 'price_current', 'currency_iso', 'price_is_from']::text[]);
  if v_bad is not null then
    raise exception 'Champ(s) non modifiable(s) par l’agence : %', pg_catalog.array_to_string(v_bad, ', ') using errcode = '22023';
  end if;

  if not public.zfind_partner_controls_listing(p_listing_id) then
    raise exception 'Accès refusé : cette annonce n’est pas gérée par votre agence.' using errcode = '42501';
  end if;

  select l.* into v_listing from public.listings l where l.id = p_listing_id for update;
  if not found then
    raise exception 'Annonce introuvable.' using errcode = 'P0002';
  end if;

  v_tx := case when p_patch ? 'transaction_type' then p_patch ->> 'transaction_type' else v_listing.transaction_type end;
  if v_tx not in ('sale', 'rent') then
    raise exception 'Type de transaction invalide (vente ou location).' using errcode = '22023';
  end if;
  v_period := case when p_patch ? 'rental_period' then p_patch ->> 'rental_period' else v_listing.rental_period end;
  if v_tx = 'sale' then
    v_period := null;
  elsif v_period is null or v_period not in ('monthly', 'seasonal', 'yearly') then
    raise exception 'Une location doit préciser la période du loyer (mensuel, saisonnier ou annuel).' using errcode = '22023';
  end if;

  v_price := v_listing.price_current;
  if p_patch ? 'price_current' then
    begin
      v_price := (p_patch ->> 'price_current')::numeric;
    exception when others then
      raise exception 'Prix invalide.' using errcode = '22023';
    end;
    if v_price is null or v_price < 0 then
      raise exception 'Prix invalide.' using errcode = '22023';
    end if;
  end if;

  v_currency := case when p_patch ? 'currency_iso' then pg_catalog.upper(pg_catalog.btrim(p_patch ->> 'currency_iso')) else v_listing.currency_iso end;
  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Devise invalide.' using errcode = '22023';
  end if;
  if p_patch ? 'price_is_from' and pg_catalog.jsonb_typeof(p_patch -> 'price_is_from') <> 'boolean' then
    raise exception 'Valeur « à partir de » invalide.' using errcode = '22023';
  end if;

  update public.listings l
     set transaction_type = v_tx,
         rental_period = v_period,
         price_current = v_price,
         currency_iso = v_currency,
         price_is_from = case when p_patch ? 'price_is_from' then (p_patch ->> 'price_is_from')::boolean else l.price_is_from end
   where l.id = v_listing.id
  returning * into v_listing;

  return pg_catalog.to_jsonb(v_listing);
end;
$$;

comment on function public.zfind_partner_update_listing_commercial(uuid, jsonb) is
  'Partner: price / rent, transaction type, rental period, currency and « à partir de » of a Listing its agency controls (zfind_partner_controls_listing). Never the status.';


-- ------------------------------------------------------------
-- 2. Partner: archive its own imported listing (absent from a full import)
-- ------------------------------------------------------------

create or replace function public.zfind_partner_archive_imported_listing(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_listing public.listings%rowtype;
  v_reference text;
begin
  if p_listing_id is null then
    raise exception 'Annonce non précisée.' using errcode = '22023';
  end if;

  if not public.zfind_partner_controls_listing(p_listing_id) then
    -- Idempotent: the agency's own listing, already archived.
    select l.* into v_listing
    from public.listings l
    join public.representations r on r.id = l.representation_id
    join public.profiles p on p.id = auth.uid() and p.role = 'partner_user' and p.partner_id = r.partner_id
    where l.id = p_listing_id and l.status = 'archived';
    if found then
      return pg_catalog.to_jsonb(v_listing);
    end if;
    raise exception 'Accès refusé : cette annonce n’est pas gérée par votre agence.' using errcode = '42501';
  end if;

  select l.* into v_listing from public.listings l where l.id = p_listing_id for update;
  if not found then
    raise exception 'Annonce introuvable.' using errcode = 'P0002';
  end if;

  select nullif(pg_catalog.btrim(pr.agency_reference), '') into v_reference
  from public.representations r
  join public.properties pr on pr.id = r.property_id
  where r.id = v_listing.representation_id and r.target_type = 'property';
  if v_reference is null then
    raise exception 'Retrait impossible : seules les annonces importées avec une référence d’agence peuvent être retirées par un import.' using errcode = '55000';
  end if;

  -- trg_zfind_listing_state_history records from -> archived with auth.uid().
  update public.listings l set status = 'archived' where l.id = v_listing.id
  returning * into v_listing;
  return pg_catalog.to_jsonb(v_listing);
end;
$$;

comment on function public.zfind_partner_archive_imported_listing(uuid) is
  'Partner « Import complet du portefeuille »: its own Listing (zfind_partner_controls_listing) whose Property has an agency reference -> archived. Never deleted, never published.';


-- ------------------------------------------------------------
-- 3. Partner: photo links of its own listing -> /api/media-import queue
-- ------------------------------------------------------------

create or replace function public.zfind_partner_queue_listing_photos(p_listing_id uuid, p_urls text[], p_offset integer default 0)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_start integer := greatest(0, least(coalesce(p_offset, 0), 40));
  v_count integer;
begin
  if p_listing_id is null then
    raise exception 'Annonce non précisée.' using errcode = '22023';
  end if;
  if not public.zfind_partner_controls_listing(p_listing_id) then
    raise exception 'Accès refusé : cette annonce n’est pas gérée par votre agence.' using errcode = '42501';
  end if;
  if p_urls is null or cardinality(p_urls) = 0 then
    return 0;
  end if;

  insert into public.zfind_media_import_queue (listing_id, url, position)
  select p_listing_id, u.url, (v_start + u.ord - 1)::smallint
  from (
    select x.url, pg_catalog.row_number() over (order by x.first_ord) as ord
    from (
      select pg_catalog.btrim(t.url) as url, min(t.ord) as first_ord
      from unnest(p_urls) with ordinality as t(url, ord)
      where pg_catalog.btrim(t.url) ~* '^https?://[^[:space:]]+$' and char_length(pg_catalog.btrim(t.url)) <= 2000
      group by pg_catalog.btrim(t.url)
    ) x
  ) u
  where u.ord <= 40 - v_start
  on conflict (listing_id, url) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.zfind_partner_queue_listing_photos(uuid, text[], integer) is
  'Partner: queues up to 40 http(s) photo links of a Listing its agency controls, fetched by /api/media-import (never twice: unique listing + url).';

drop policy if exists "partner read own media import queue" on public.zfind_media_import_queue;
create policy "partner read own media import queue" on public.zfind_media_import_queue
  for select to authenticated using (public.zfind_partner_controls_listing(listing_id));


-- ------------------------------------------------------------
-- 4. Partner: its referenced portfolio, as the sync planner reads it
-- ------------------------------------------------------------

create or replace function public.zfind_partner_import_portfolio()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_partner uuid;
begin
  select p.partner_id into v_partner
  from public.profiles p
  where p.id = auth.uid() and p.role = 'partner_user';
  if v_partner is null then
    raise exception 'Accès réservé aux comptes agence.' using errcode = '42501';
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', r.id,
      'status', r.status,
      'properties', pg_catalog.jsonb_build_object(
        'id', pr.id, 'agency_reference', pr.agency_reference, 'subtype', pr.subtype, 'typology', pr.typology,
        'area_sqm', pr.area_sqm, 'gross_private_area_sqm', pr.gross_private_area_sqm, 'plot_area_sqm', pr.plot_area_sqm,
        'floor', pr.floor, 'bedrooms', pr.bedrooms, 'bathrooms', pr.bathrooms, 'year_built', pr.year_built,
        'energy_rating', pr.energy_rating, 'condo_fee_monthly', pr.condo_fee_monthly, 'imi_annual', pr.imi_annual,
        'postal_code', pr.postal_code, 'street_address', pr.street_address, 'latitude', pr.latitude, 'longitude', pr.longitude,
        'removed_at', pr.removed_at),
      'listings', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', l.id, 'status', l.status, 'transaction_type', l.transaction_type, 'rental_period', l.rental_period,
          'price_current', l.price_current, 'created_at', l.created_at,
          'listing_content', coalesce((
            select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('locale', c.locale, 'title', c.title, 'description', c.description))
            from public.listing_content c where c.listing_id = l.id), '[]'::jsonb),
          'queued_urls', coalesce((
            select pg_catalog.jsonb_agg(q.url order by q.position, q.url)
            from public.zfind_media_import_queue q where q.listing_id = l.id), '[]'::jsonb)
        ) order by l.created_at)
        from public.listings l where l.representation_id = r.id), '[]'::jsonb)
    ) order by pr.agency_reference, r.id)
    from public.representations r
    join public.properties pr on pr.id = r.property_id
    where r.partner_id = v_partner
      and r.target_type = 'property'
      and r.status <> 'ended'
      and pr.removed_at is null
      and nullif(pg_catalog.btrim(pr.agency_reference), '') is not null
  ), '[]'::jsonb);
end;
$$;

comment on function public.zfind_partner_import_portfolio() is
  'Partner: its own Properties with an agency reference, their Listings (all statuses), French content and queued photo links — what the import compares a file with. Read only.';


-- ------------------------------------------------------------
-- 5. Feeds (« Flux automatique »)
-- ------------------------------------------------------------

create table if not exists public.zfind_listing_feeds (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  url text not null,
  auth_user text,
  software_agency_id text,
  country text not null default 'FR',
  full_sync boolean not null default true,
  active boolean not null default true,
  disabled_by_admin boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  run_requested_at timestamptz,
  test_requested_at timestamptz,
  claimed_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  last_message text,
  last_counts jsonb not null default '{}'::jsonb,
  last_report jsonb not null default '[]'::jsonb,
  last_listing_count integer,
  flagged_listing_count integer,
  last_completed_at timestamptz,
  consecutive_failures integer not null default 0,
  failure_notified_at timestamptz,
  flag_notified_at timestamptz,
  last_test_at timestamptz,
  last_test jsonb,
  constraint zfind_listing_feeds_partner_key unique (partner_id),
  constraint zfind_listing_feeds_url_chk check (url ~* '^https://[^[:space:]@/]+(/[^[:space:]]*)?$' and char_length(url) <= 2000),
  constraint zfind_listing_feeds_user_chk check (auth_user is null or char_length(auth_user) between 1 and 200),
  constraint zfind_listing_feeds_agency_id_chk check (software_agency_id is null or char_length(software_agency_id) between 1 and 100),
  constraint zfind_listing_feeds_country_chk check (country in ('FR', 'BE', 'LU')),
  constraint zfind_listing_feeds_status_chk check (last_status is null or last_status in ('ok', 'partial', 'flagged', 'error')),
  constraint zfind_listing_feeds_message_chk check (last_message is null or char_length(last_message) <= 1000)
);

create index if not exists zfind_listing_feeds_due_idx on public.zfind_listing_feeds (last_run_at nulls first) where active and not disabled_by_admin;

alter table public.zfind_listing_feeds enable row level security;
revoke all on table public.zfind_listing_feeds from public, anon, authenticated;
grant select, insert, update, delete on table public.zfind_listing_feeds to service_role;

comment on table public.zfind_listing_feeds is
  'One automatic feed per agency: the HTTPS address of its software export (Poliris CSV / ZIP or CSV), imported every night by /api/feed-sync. No secret here. Read / written through the zfind_partner_* / zfind_admin_* feed commands only.';

create table if not exists public.zfind_listing_feed_secrets (
  feed_id uuid primary key references public.zfind_listing_feeds(id) on delete cascade,
  password text not null,
  updated_at timestamptz not null default now(),
  constraint zfind_listing_feed_secrets_len_chk check (char_length(password) between 1 and 500)
);

alter table public.zfind_listing_feed_secrets enable row level security;
revoke all on table public.zfind_listing_feed_secrets from public, anon, authenticated;
grant select, insert, update, delete on table public.zfind_listing_feed_secrets to service_role;

comment on table public.zfind_listing_feed_secrets is
  'HTTP basic-auth password of a feed. Written by zfind_partner_save_feed, read only by the server (service_role, /api/feed-sync). Never returned to a browser.';


-- What the Partner and the Admin may see of a feed (never the password).
create or replace function public.zfind_listing_feed_public(p_feed public.zfind_listing_feeds)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'id', p_feed.id, 'partner_id', p_feed.partner_id, 'url', p_feed.url, 'auth_user', p_feed.auth_user,
    'has_password', exists (select 1 from public.zfind_listing_feed_secrets s where s.feed_id = p_feed.id),
    'software_agency_id', p_feed.software_agency_id, 'country', p_feed.country, 'full_sync', p_feed.full_sync,
    'active', p_feed.active, 'disabled_by_admin', p_feed.disabled_by_admin,
    'created_at', p_feed.created_at, 'updated_at', p_feed.updated_at,
    'run_requested_at', p_feed.run_requested_at, 'test_requested_at', p_feed.test_requested_at,
    'last_run_at', p_feed.last_run_at, 'last_status', p_feed.last_status, 'last_message', p_feed.last_message,
    'last_counts', p_feed.last_counts, 'last_report', p_feed.last_report, 'last_listing_count', p_feed.last_listing_count,
    'flagged_listing_count', p_feed.flagged_listing_count, 'last_completed_at', p_feed.last_completed_at,
    'consecutive_failures', p_feed.consecutive_failures, 'last_test_at', p_feed.last_test_at, 'last_test', p_feed.last_test);
$$;

create or replace function public.zfind_partner_feed_partner()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select p.partner_id from public.profiles p
  where p.id = auth.uid() and p.role = 'partner_user' and p.partner_id is not null;
$$;


-- ---------- Partner ----------

create or replace function public.zfind_partner_get_feed()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_partner uuid := public.zfind_partner_feed_partner();
  v_feed public.zfind_listing_feeds%rowtype;
begin
  if v_partner is null then
    raise exception 'Accès réservé aux comptes agence.' using errcode = '42501';
  end if;
  select f.* into v_feed from public.zfind_listing_feeds f where f.partner_id = v_partner;
  if not found then
    return null;
  end if;
  return public.zfind_listing_feed_public(v_feed);
end;
$$;

create or replace function public.zfind_partner_save_feed(
  p_url text,
  p_auth_user text default null,
  p_password text default null,
  p_full_sync boolean default true,
  p_active boolean default true,
  p_country text default 'FR',
  p_software_agency_id text default null,
  p_clear_password boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_partner uuid := public.zfind_partner_feed_partner();
  v_url text := pg_catalog.btrim(coalesce(p_url, ''));
  v_host text;
  v_user text := nullif(pg_catalog.btrim(coalesce(p_auth_user, '')), '');
  v_agency_id text := nullif(pg_catalog.btrim(coalesce(p_software_agency_id, '')), '');
  v_country text := pg_catalog.upper(coalesce(nullif(pg_catalog.btrim(p_country), ''), 'FR'));
  v_feed public.zfind_listing_feeds%rowtype;
  v_existing public.zfind_listing_feeds%rowtype;
begin
  if v_partner is null then
    raise exception 'Accès réservé aux comptes agence.' using errcode = '42501';
  end if;
  if v_url !~* '^https://' then
    raise exception 'Adresse du flux invalide : elle doit commencer par https:// (les flux FTP et http non chiffrés ne sont pas acceptés).' using errcode = '22023';
  end if;
  if char_length(v_url) > 2000 or v_url ~ '[[:space:]]' then
    raise exception 'Adresse du flux invalide.' using errcode = '22023';
  end if;
  v_host := pg_catalog.lower(substring(v_url from '^https://([^/?#]*)'));
  if v_host is null or v_host = '' or v_host like '%@%' then
    raise exception 'Adresse du flux invalide : indiquez l’identifiant et le mot de passe dans les champs prévus, pas dans l’adresse.' using errcode = '22023';
  end if;
  v_host := pg_catalog.regexp_replace(v_host, ':[0-9]+$', '');
  if v_host in ('localhost', '0.0.0.0') or v_host like '%.local' or v_host like '%.internal' or v_host like '%.localhost' or v_host like '[%'
     or v_host ~ '^(127\.|10\.|192\.168\.|169\.254\.|0\.)' or v_host ~ '^172\.(1[6-9]|2[0-9]|3[01])\.' or v_host ~ '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.' then
    raise exception 'Adresse du flux invalide : adresse interne non autorisée.' using errcode = '22023';
  end if;
  if v_user is not null and char_length(v_user) > 200 then
    raise exception 'Identifiant trop long (200 caractères au plus).' using errcode = '22023';
  end if;
  if p_password is not null and char_length(p_password) > 500 then
    raise exception 'Mot de passe trop long (500 caractères au plus).' using errcode = '22023';
  end if;
  if v_agency_id is not null and char_length(v_agency_id) > 100 then
    raise exception 'Identifiant agence trop long.' using errcode = '22023';
  end if;
  if v_country not in ('FR', 'BE', 'LU') then
    raise exception 'Pays non pris en charge (France, Belgique, Luxembourg).' using errcode = '22023';
  end if;

  select f.* into v_existing from public.zfind_listing_feeds f where f.partner_id = v_partner for update;
  if found and v_existing.disabled_by_admin and coalesce(p_active, true) then
    raise exception 'Flux désactivé par l’équipe Z Find : écrivez à hello@zfind.online pour le réactiver.' using errcode = '55000';
  end if;

  insert into public.zfind_listing_feeds (partner_id, url, auth_user, software_agency_id, country, full_sync, active, created_by)
  values (v_partner, v_url, v_user, v_agency_id, v_country, coalesce(p_full_sync, true), coalesce(p_active, true), auth.uid())
  on conflict (partner_id) do update
    set url = excluded.url,
        auth_user = excluded.auth_user,
        software_agency_id = excluded.software_agency_id,
        country = excluded.country,
        full_sync = excluded.full_sync,
        active = excluded.active,
        updated_at = now(),
        -- Another source: the « drop by more than half » rule starts again from it.
        last_listing_count = case when public.zfind_listing_feeds.url is distinct from excluded.url then null else public.zfind_listing_feeds.last_listing_count end,
        flagged_listing_count = case when public.zfind_listing_feeds.url is distinct from excluded.url then null else public.zfind_listing_feeds.flagged_listing_count end,
        consecutive_failures = case when public.zfind_listing_feeds.url is distinct from excluded.url then 0 else public.zfind_listing_feeds.consecutive_failures end,
        failure_notified_at = case when public.zfind_listing_feeds.url is distinct from excluded.url then null else public.zfind_listing_feeds.failure_notified_at end
  returning * into v_feed;

  if v_user is null or coalesce(p_clear_password, false) then
    delete from public.zfind_listing_feed_secrets s where s.feed_id = v_feed.id;
  end if;
  if v_user is not null and p_password is not null and p_password <> '' and not coalesce(p_clear_password, false) then
    insert into public.zfind_listing_feed_secrets (feed_id, password) values (v_feed.id, p_password)
    on conflict (feed_id) do update set password = excluded.password, updated_at = now();
  end if;

  return public.zfind_listing_feed_public(v_feed);
end;
$$;

comment on function public.zfind_partner_save_feed(text, text, text, boolean, boolean, text, text, boolean) is
  'Partner « Flux automatique »: creates or updates its agency''s feed (HTTPS only). A null / empty password keeps the stored one; p_clear_password (or no user) removes it. The password is never returned.';

create or replace function public.zfind_partner_request_feed_test()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_partner uuid := public.zfind_partner_feed_partner();
  v_feed public.zfind_listing_feeds%rowtype;
begin
  if v_partner is null then
    raise exception 'Accès réservé aux comptes agence.' using errcode = '42501';
  end if;
  select f.* into v_feed from public.zfind_listing_feeds f where f.partner_id = v_partner for update;
  if not found then
    raise exception 'Enregistrez d’abord l’adresse du flux.' using errcode = 'P0002';
  end if;
  if v_feed.test_requested_at is not null and v_feed.test_requested_at > now() - interval '20 seconds' then
    raise exception 'Un test est déjà en cours : patientez quelques secondes.' using errcode = '55000';
  end if;
  update public.zfind_listing_feeds f set test_requested_at = now() where f.id = v_feed.id returning * into v_feed;
  return public.zfind_listing_feed_public(v_feed);
end;
$$;

create or replace function public.zfind_partner_accept_feed_volume()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_partner uuid := public.zfind_partner_feed_partner();
  v_feed public.zfind_listing_feeds%rowtype;
begin
  if v_partner is null then
    raise exception 'Accès réservé aux comptes agence.' using errcode = '42501';
  end if;
  select f.* into v_feed from public.zfind_listing_feeds f where f.partner_id = v_partner for update;
  if not found or v_feed.flagged_listing_count is null then
    raise exception 'Aucune baisse du nombre d’annonces à confirmer.' using errcode = '55000';
  end if;
  update public.zfind_listing_feeds f
     set last_listing_count = v_feed.flagged_listing_count, flagged_listing_count = null, updated_at = now()
   where f.id = v_feed.id
  returning * into v_feed;
  return public.zfind_listing_feed_public(v_feed);
end;
$$;

comment on function public.zfind_partner_accept_feed_volume() is
  'Partner: confirms that the smaller number of listings of its last flagged feed run is real; the next run may then archive the missing listings.';


-- ---------- Admin ----------

create or replace function public.zfind_admin_list_feeds()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  return query
  select (public.zfind_listing_feed_public(f) || pg_catalog.jsonb_build_object('partner_name', pa.name)) - 'last_report'
  from public.zfind_listing_feeds f
  join public.partners pa on pa.id = f.partner_id
  order by (f.last_status in ('error', 'flagged')) desc nulls last, pa.name;
end;
$$;

create or replace function public.zfind_admin_set_feed_active(p_feed_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_feed public.zfind_listing_feeds%rowtype;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  update public.zfind_listing_feeds f
     set active = coalesce(p_active, false), disabled_by_admin = not coalesce(p_active, false), updated_at = now(),
         run_requested_at = case when coalesce(p_active, false) then f.run_requested_at else null end
   where f.id = p_feed_id
  returning * into v_feed;
  if not found then
    raise exception 'Flux introuvable.' using errcode = 'P0002';
  end if;
  return public.zfind_listing_feed_public(v_feed);
end;
$$;

create or replace function public.zfind_admin_request_feed_run(p_feed_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_feed public.zfind_listing_feeds%rowtype;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  select f.* into v_feed from public.zfind_listing_feeds f where f.id = p_feed_id for update;
  if not found then
    raise exception 'Flux introuvable.' using errcode = 'P0002';
  end if;
  if v_feed.disabled_by_admin then
    raise exception 'Flux désactivé : réactivez-le avant de le lancer.' using errcode = '55000';
  end if;
  if not v_feed.active then
    raise exception 'Flux mis en pause par l’agence : il ne peut pas être lancé.' using errcode = '55000';
  end if;
  update public.zfind_listing_feeds f set run_requested_at = now() where f.id = v_feed.id returning * into v_feed;
  return public.zfind_listing_feed_public(v_feed);
end;
$$;


-- ------------------------------------------------------------
-- 6. Server only (service_role): claim, record, act as the agency
-- ------------------------------------------------------------

-- p_mode: 'nightly' (active feeds not run for 20 h, or left partial),
-- 'requested' (Admin « Lancer maintenant »), 'test' (Partner « Tester le flux »).
create or replace function public.zfind_feed_claim(p_mode text, p_limit integer default 5)
returns table (
  id uuid, partner_id uuid, partner_name text, url text, auth_user text, password text,
  software_agency_id text, country text, full_sync boolean, active boolean,
  last_status text, last_listing_count integer, flagged_listing_count integer,
  consecutive_failures integer, failure_notified_at timestamptz, flag_notified_at timestamptz,
  run_requested_at timestamptz, test_requested_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
#variable_conflict use_column
declare
  v_ids uuid[];
begin
  if p_mode not in ('nightly', 'requested', 'test') then
    raise exception 'invalid mode' using errcode = '22023';
  end if;
  select pg_catalog.array_agg(x.id) into v_ids from (
    select f.id
    from public.zfind_listing_feeds f
    where (f.claimed_at is null or f.claimed_at < now() - interval '10 minutes')
      and case p_mode
        when 'test' then f.test_requested_at is not null
        when 'requested' then f.run_requested_at is not null and f.active and not f.disabled_by_admin
        else f.active and not f.disabled_by_admin
             and (f.last_status = 'partial' or f.last_run_at is null or f.last_run_at < now() - interval '20 hours')
      end
    order by (f.last_status = 'partial') desc nulls last, f.last_run_at nulls first, f.created_at
    limit greatest(1, least(coalesce(p_limit, 5), 50))
    for update skip locked
  ) x;
  if v_ids is null then
    return;
  end if;
  update public.zfind_listing_feeds f set claimed_at = now() where f.id = any (v_ids);
  return query
  select f.id, f.partner_id, pa.name, f.url, f.auth_user, s.password, f.software_agency_id, f.country, f.full_sync, f.active,
         f.last_status, f.last_listing_count, f.flagged_listing_count, f.consecutive_failures, f.failure_notified_at, f.flag_notified_at,
         f.run_requested_at, f.test_requested_at
  from public.zfind_listing_feeds f
  join public.partners pa on pa.id = f.partner_id
  left join public.zfind_listing_feed_secrets s on s.feed_id = f.id
  where f.id = any (v_ids)
  order by (f.last_status = 'partial') desc nulls last, f.last_run_at nulls first, f.created_at;
end;
$$;

-- What a run / a test leaves on the feed (whitelisted keys); the claim is released.
create or replace function public.zfind_feed_record(p_feed_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_bad text[];
  v_feed public.zfind_listing_feeds%rowtype;
  p jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  select pg_catalog.array_agg(k) into v_bad
  from pg_catalog.jsonb_object_keys(p) as keys(k)
  where k <> all (array['last_run_at', 'last_status', 'last_message', 'last_counts', 'last_report', 'last_listing_count',
    'flagged_listing_count', 'last_completed_at', 'consecutive_failures', 'failure_notified_at', 'flag_notified_at',
    'last_test_at', 'last_test', 'clear_run_request', 'clear_test_request']::text[]);
  if v_bad is not null then
    raise exception 'Unsupported feed field(s): %', pg_catalog.array_to_string(v_bad, ', ') using errcode = '22023';
  end if;

  update public.zfind_listing_feeds f set
    claimed_at = null,
    last_run_at = case when p ? 'last_run_at' then (p ->> 'last_run_at')::timestamptz else f.last_run_at end,
    last_status = case when p ? 'last_status' then p ->> 'last_status' else f.last_status end,
    last_message = case when p ? 'last_message' then pg_catalog.left(p ->> 'last_message', 1000) else f.last_message end,
    last_counts = case when p ? 'last_counts' then coalesce(p -> 'last_counts', '{}'::jsonb) else f.last_counts end,
    last_report = case when p ? 'last_report' then coalesce(p -> 'last_report', '[]'::jsonb) else f.last_report end,
    last_listing_count = case when p ? 'last_listing_count' then (p ->> 'last_listing_count')::integer else f.last_listing_count end,
    flagged_listing_count = case when p ? 'flagged_listing_count' then (p ->> 'flagged_listing_count')::integer else f.flagged_listing_count end,
    last_completed_at = case when p ? 'last_completed_at' then (p ->> 'last_completed_at')::timestamptz else f.last_completed_at end,
    consecutive_failures = case when p ? 'consecutive_failures' then (p ->> 'consecutive_failures')::integer else f.consecutive_failures end,
    failure_notified_at = case when p ? 'failure_notified_at' then (p ->> 'failure_notified_at')::timestamptz else f.failure_notified_at end,
    flag_notified_at = case when p ? 'flag_notified_at' then (p ->> 'flag_notified_at')::timestamptz else f.flag_notified_at end,
    last_test_at = case when p ? 'last_test_at' then (p ->> 'last_test_at')::timestamptz else f.last_test_at end,
    last_test = case when p ? 'last_test' then p -> 'last_test' else f.last_test end,
    run_requested_at = case when coalesce((p ->> 'clear_run_request')::boolean, false) then null else f.run_requested_at end,
    test_requested_at = case when coalesce((p ->> 'clear_test_request')::boolean, false) then null else f.test_requested_at end
  where f.id = p_feed_id
  returning * into v_feed;
  if not found then
    raise exception 'Flux introuvable.' using errcode = 'P0002';
  end if;
  return public.zfind_listing_feed_public(v_feed);
end;
$$;

-- Runs ONE Partner command as the agency that owns the feed (its
-- partner_user profile; the feed's creator first). Only the commands the
-- import needs; every one of them performs its own Partner check.
create or replace function public.zfind_feed_call(p_feed_id uuid, p_fn text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_feed public.zfind_listing_feeds%rowtype;
  v_actor uuid;
  v_old_claims text := current_setting('request.jwt.claims', true);
  v_old_sub text := current_setting('request.jwt.claim.sub', true);
  v_old_role text := current_setting('request.jwt.claim.role', true);
  a jsonb := coalesce(p_args, '{}'::jsonb);
  v_result jsonb;
begin
  select f.* into v_feed from public.zfind_listing_feeds f where f.id = p_feed_id;
  if not found then
    raise exception 'Flux introuvable.' using errcode = 'P0002';
  end if;
  if v_feed.disabled_by_admin then
    raise exception 'Flux désactivé par l’équipe Z Find.' using errcode = '55000';
  end if;
  select p.id into v_actor
  from public.profiles p
  where p.role = 'partner_user' and p.partner_id = v_feed.partner_id
  order by (p.id = v_feed.created_by) desc nulls last, p.id
  limit 1;
  if v_actor is null then
    raise exception 'Aucun compte agence actif pour ce flux.' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', v_actor::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);

  case p_fn
    when 'zfind_partner_import_portfolio' then
      v_result := public.zfind_partner_import_portfolio();
    when 'zfind_commune_search' then
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c)), '[]'::jsonb) into v_result
      from public.zfind_commune_search(a ->> 'p_country', a ->> 'p_query') c;
    when 'zfind_create_property' then
      v_result := public.zfind_create_property(a ->> 'p_subtype', a ->> 'p_typology', (a ->> 'p_area_sqm')::numeric, (a ->> 'p_floor')::integer, null, null);
    when 'zfind_update_asset' then
      v_result := public.zfind_update_asset('property', (a ->> 'p_asset_id')::uuid, coalesce(a -> 'p_patch', '{}'::jsonb));
    when 'zfind_set_asset_commune' then
      v_result := public.zfind_set_asset_commune('property', (a ->> 'p_asset_id')::uuid, a ->> 'p_country', a ->> 'p_code');
    when 'zfind_partner_ensure_draft_listing' then
      v_result := public.zfind_partner_ensure_draft_listing('property', (a ->> 'p_asset_id')::uuid);
    when 'zfind_partner_update_listing_commercial' then
      v_result := public.zfind_partner_update_listing_commercial((a ->> 'p_listing_id')::uuid, a -> 'p_patch');
    when 'zfind_partner_upsert_listing_content' then
      v_result := public.zfind_partner_upsert_listing_content((a ->> 'p_listing_id')::uuid, a ->> 'p_locale', a ->> 'p_title', a ->> 'p_description');
    when 'zfind_get_listing_compliance' then
      v_result := public.zfind_get_listing_compliance((a ->> 'p_listing_id')::uuid);
    when 'zfind_save_listing_compliance' then
      v_result := public.zfind_save_listing_compliance((a ->> 'p_listing_id')::uuid, coalesce(a -> 'p_facts', '{}'::jsonb), coalesce(a -> 'p_source_evidence', '{}'::jsonb));
    when 'zfind_partner_archive_imported_listing' then
      v_result := public.zfind_partner_archive_imported_listing((a ->> 'p_listing_id')::uuid);
    when 'zfind_partner_queue_listing_photos' then
      v_result := pg_catalog.to_jsonb(public.zfind_partner_queue_listing_photos(
        (a ->> 'p_listing_id')::uuid,
        array(select pg_catalog.jsonb_array_elements_text(coalesce(a -> 'p_urls', '[]'::jsonb))),
        coalesce((a ->> 'p_offset')::integer, 0)));
    else
      raise exception 'Commande non autorisée pour un flux : %', p_fn using errcode = '42501';
  end case;

  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_old_claims, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_old_sub, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.role', coalesce(v_old_role, ''), true);
  return v_result;
end;
$$;

comment on function public.zfind_feed_call(uuid, text, jsonb) is
  'Server only (/api/feed-sync): runs one whitelisted Partner command as the agency owning the feed. Each command performs its own Partner authorization.';


-- ------------------------------------------------------------
-- 7. Grants
-- ------------------------------------------------------------

revoke all on function public.zfind_partner_update_listing_commercial(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.zfind_partner_archive_imported_listing(uuid) from public, anon, authenticated;
revoke all on function public.zfind_partner_queue_listing_photos(uuid, text[], integer) from public, anon, authenticated;
revoke all on function public.zfind_partner_import_portfolio() from public, anon, authenticated;
revoke all on function public.zfind_listing_feed_public(public.zfind_listing_feeds) from public, anon, authenticated;
revoke all on function public.zfind_partner_feed_partner() from public, anon, authenticated;
revoke all on function public.zfind_partner_get_feed() from public, anon, authenticated;
revoke all on function public.zfind_partner_save_feed(text, text, text, boolean, boolean, text, text, boolean) from public, anon, authenticated;
revoke all on function public.zfind_partner_request_feed_test() from public, anon, authenticated;
revoke all on function public.zfind_partner_accept_feed_volume() from public, anon, authenticated;
revoke all on function public.zfind_admin_list_feeds() from public, anon, authenticated;
revoke all on function public.zfind_admin_set_feed_active(uuid, boolean) from public, anon, authenticated;
revoke all on function public.zfind_admin_request_feed_run(uuid) from public, anon, authenticated;
revoke all on function public.zfind_feed_claim(text, integer) from public, anon, authenticated;
revoke all on function public.zfind_feed_record(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.zfind_feed_call(uuid, text, jsonb) from public, anon, authenticated;

grant execute on function public.zfind_partner_update_listing_commercial(uuid, jsonb) to authenticated;
grant execute on function public.zfind_partner_archive_imported_listing(uuid) to authenticated;
grant execute on function public.zfind_partner_queue_listing_photos(uuid, text[], integer) to authenticated;
grant execute on function public.zfind_partner_import_portfolio() to authenticated;
grant execute on function public.zfind_partner_get_feed() to authenticated;
grant execute on function public.zfind_partner_save_feed(text, text, text, boolean, boolean, text, text, boolean) to authenticated;
grant execute on function public.zfind_partner_request_feed_test() to authenticated;
grant execute on function public.zfind_partner_accept_feed_volume() to authenticated;
grant execute on function public.zfind_admin_list_feeds() to authenticated;
grant execute on function public.zfind_admin_set_feed_active(uuid, boolean) to authenticated;
grant execute on function public.zfind_admin_request_feed_run(uuid) to authenticated;
grant execute on function public.zfind_feed_claim(text, integer) to service_role;
grant execute on function public.zfind_feed_record(uuid, jsonb) to service_role;
grant execute on function public.zfind_feed_call(uuid, text, jsonb) to service_role;
