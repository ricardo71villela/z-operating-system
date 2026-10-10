/* ============================================================
   Z FIND — PGlite database for the Partner self-service import and the
   automatic feeds (tests/sql/partner-self-import.test.mjs and
   tests/sql/feed-sync-e2e.test.mjs). Not a test itself.

   Supabase-shaped: roles anon / authenticated / service_role, auth.uid()
   with Supabase's own definition (the request JWT claims PostgREST sets —
   which is what zfind_feed_call relies on to act as the agency).
   SQL applied as it is in the repository:
   - whole migrations: 20261004140000 + 20261004170000 (communes,
     zfind_set_asset_commune, zfind_commune_search), 20260830112835 +
     20261009120000 (mentions obligatoires), 20261009180000 (submission),
     20261010120000 (this feature);
   - extracted unchanged: the Partner ownership predicates,
     zfind_create_property and zfind_update_asset (20260813205903),
     zfind_partner_controls_listing and zfind_partner_upsert_listing_content
     (20260813213456), zfind_partner_ensure_draft_listing (20260813224000),
     zfind_admin_transition_listing (20260813193750), the photo queue
     table + policy (20261004200000), the Listing state history (20260812135037).
   Tables are reduced to the columns those commands use.
   ============================================================ */
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = process.env.ZOS_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const FIND = path.join(ROOT, 'apps', 'find');
export const MIG = name => fs.readFileSync(path.join(ROOT, 'infrastructure', 'supabase', 'migrations', name), 'utf8');
export const FEED_MIG = '20261010120000_z_find_partner_self_import_feeds_v1.sql';
const extract = (sql, startMarker, endMarker) => { const s = sql.indexOf(startMarker); if (s < 0) throw new Error('marker not found: ' + startMarker); return sql.slice(s, sql.indexOf(endMarker, s) + endMarker.length); };
// As live after the special-form repair migrations (20260813215649, 20260828120908): COALESCE / NULLIF unqualified.
const fn = (file, name) => extract(MIG(file), `create or replace function public.${name}(`, '\n$$;').split('pg_catalog.coalesce(').join('coalesce(').split('pg_catalog.nullif(').join('nullif(');

export const IDS = {
  PA: '10000000-0000-0000-0000-000000000001', PB: '10000000-0000-0000-0000-000000000002',
  U_PA: '00000000-0000-0000-0000-0000000000b1', U_PA2: '00000000-0000-0000-0000-0000000000b3', U_PB: '00000000-0000-0000-0000-0000000000b2', ADM: '00000000-0000-0000-0000-0000000000a1'
};

export async function createDb() {
  const db = new PGlite();
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema zos;
-- Supabase's definition: the subject of the request JWT PostgREST puts in the settings.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create table auth.users (id uuid primary key, email text);
grant usage on schema auth, public, zos to authenticated, anon, service_role;
create table zos.geography_locations (id uuid primary key default gen_random_uuid(), location_type text, canonical_code text, country_iso text, status text default 'active');
create table public.zones_lite (id uuid primary key default gen_random_uuid(), name text not null, city text not null, country_iso text not null,
  geography_entity_id uuid references zos.geography_locations(id), geography_binding_status text not null default 'unbound', unique (name, city, country_iso));
create table public.partners (id uuid primary key, name text not null, status text not null default 'active');
create table public.profiles (id uuid primary key, role text not null, partner_id uuid);
create table public.zfind_partner_signups (id uuid primary key default gen_random_uuid(), partner_id uuid, email text, status text not null default 'verified');
create table public.properties (id uuid primary key default gen_random_uuid(), property_class text not null default 'residential', subtype text, typology text, area_sqm numeric, floor int,
  zone_lite_id uuid references public.zones_lite(id), development_id uuid, energy_rating text, energy_certificate_number text, license_number text, street_address text, postal_code text,
  latitude numeric, longitude numeric, bedrooms int, living_rooms int, bathrooms int, gross_private_area_sqm numeric, dependent_area_sqm numeric, plot_area_sqm numeric, year_built int,
  condition text, unit_floors int, condo_fee_monthly numeric, imi_annual numeric, taxable_value numeric, payment_terms text, accepts_trade boolean, agency_reference text, tour_360_url text,
  removed_at timestamptz, created_at timestamptz not null default clock_timestamp());
create table public.developments (id uuid primary key default gen_random_uuid(), name text, zone_lite_id uuid references public.zones_lite(id), promoter_partner_id uuid, removed_at timestamptz);
create table public.representations (id uuid primary key default gen_random_uuid(), target_type text not null, property_id uuid references public.properties(id), development_id uuid,
  partner_id uuid not null, status text not null, created_at timestamptz not null default clock_timestamp());
create table public.listings (id uuid primary key default gen_random_uuid(), representation_id uuid not null references public.representations(id),
  status text not null default 'draft' check (status in ('draft','incomplete','pending_review','ready','published','suspended','archived')),
  channel text, transaction_type text not null default 'sale', rental_period text, price_current numeric not null default 0, currency_iso text not null default 'EUR',
  price_is_from boolean not null default false, tier text, created_at timestamptz not null default clock_timestamp(),
  constraint listings_rental_period_chk check ((transaction_type = 'sale' and rental_period is null) or (transaction_type = 'rent' and rental_period in ('monthly','seasonal','yearly'))),
  constraint listings_published_positive_price check (status <> 'published' or price_current > 0));
create table public.listing_content (listing_id uuid references public.listings(id), locale text, title text not null, description text, primary key (listing_id, locale));
create table public.system_languages (code text primary key, enabled boolean not null default true);
insert into public.system_languages values ('fr', true), ('en', true);
create table public.media_assets (id uuid primary key default gen_random_uuid());
create table public.listing_media (media_asset_id uuid not null, listing_id uuid not null references public.listings(id), position int not null default 0, is_cover boolean not null default false, primary key (media_asset_id, listing_id));
create table public.development_media (media_asset_id uuid not null, development_id uuid not null references public.developments(id), position int not null default 0, is_cover boolean not null default false, primary key (media_asset_id, development_id));
create function public.zfind_public_listing_visible(p_listing_id uuid) returns boolean language sql stable as $$ select true $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;
-- What the Partner panel reads directly (RLS of the real schema, reduced): its own rows only.
alter table public.listings enable row level security;
create policy "partner: view own listings" on public.listings for select to authenticated using (exists (select 1 from public.representations r join public.profiles p on p.partner_id = r.partner_id where r.id = representation_id and p.id = auth.uid()));
grant select on public.listings to authenticated;
`);
  // Listing lifecycle history (who / when of every status change), unchanged.
  await db.exec(extract(MIG('20260812135037_z_find_database_convergence_v1.sql'), 'create schema if not exists find;', "  'Z Find domain-owned database schema. Canonical ZOS Identity, Registry, Geography, Observations and transport remain in their authoritative Core schemas.';"));
  await db.exec(extract(MIG('20260812135037_z_find_database_convergence_v1.sql'), 'create table find.listing_state_history (', "  'Append-style Z Find Listing lifecycle history. Listing lifecycle remains distinct from Representation and Verification lifecycle.';"));
  // The photo links queue (table, Admin policy, claim) as created by migration 20261004200000.
  await db.exec(extract(MIG('20261004200000_z_find_admin_followup_v1.sql'), 'create table if not exists public.zfind_media_import_queue (', 'grant execute on function public.zfind_claim_media_imports(integer) to service_role;'));
  // Partner ownership predicates and asset commands, unchanged.
  const OWN = '20260813205903_z_find_partner_asset_ownership_hardening_v1.sql';
  for (const name of ['zfind_partner_controls_representation', 'zfind_partner_owns_development', 'zfind_partner_owns_property', 'zfind_create_property', 'zfind_update_asset']) await db.exec(fn(OWN, name));
  await db.exec(fn('20260813213456_z_find_partner_content_media_boundary_v1.sql', 'zfind_partner_controls_listing'));
  await db.exec(fn('20260813213456_z_find_partner_content_media_boundary_v1.sql', 'zfind_partner_upsert_listing_content'));
  await db.exec(fn('20260813224000_z_find_rental_duplication_bootstrap_convergence_v1.sql', 'zfind_partner_ensure_draft_listing'));
  await db.exec(fn('20260813193750_z_find_marketplace_lifecycle_hardening_v1.sql', 'zfind_admin_transition_listing'));
  await db.exec(`
revoke all on function public.zfind_partner_controls_representation(uuid), public.zfind_partner_owns_development(uuid), public.zfind_partner_owns_property(uuid),
  public.zfind_create_property(text, text, numeric, integer, uuid, uuid), public.zfind_update_asset(text, uuid, jsonb), public.zfind_partner_controls_listing(uuid),
  public.zfind_partner_upsert_listing_content(uuid, text, text, text), public.zfind_partner_ensure_draft_listing(text, uuid), public.zfind_admin_transition_listing(uuid, text) from public;
grant execute on function public.zfind_partner_controls_representation(uuid), public.zfind_partner_owns_development(uuid), public.zfind_partner_owns_property(uuid),
  public.zfind_create_property(text, text, numeric, integer, uuid, uuid), public.zfind_update_asset(text, uuid, jsonb), public.zfind_partner_controls_listing(uuid),
  public.zfind_partner_upsert_listing_content(uuid, text, text, text), public.zfind_partner_ensure_draft_listing(text, uuid), public.zfind_admin_transition_listing(uuid, text) to authenticated;
`);
  await db.exec(MIG('20261004140000_z_find_partner_commune_v1.sql'));
  await db.exec(MIG('20261004170000_z_find_commune_search_postcode_v1.sql'));
  await db.exec(MIG('20260830112835_z_find_global_listing_compliance_launch_v2.sql'));
  await db.exec(MIG('20261009120000_z_find_listing_compliance_review_queue_v1.sql'));
  await db.exec(MIG('20261009180000_z_find_partner_listing_submission_v1.sql'));
  // Agency e-mail addresses (server only), as in migration 20261004200000.
  await db.exec(fn('20261004200000_z_find_admin_followup_v1.sql', 'zfind_partner_recipients'));
  await db.exec('revoke all on function public.zfind_partner_recipients(uuid) from public, anon, authenticated; grant execute on function public.zfind_partner_recipients(uuid) to service_role;');
  const feedSql = MIG(FEED_MIG);
  await db.exec(feedSql);
  await db.exec(feedSql);

  const { PA, PB, U_PA, U_PA2, U_PB, ADM } = IDS;
  await db.exec(`
insert into public.zfind_communes (country, code, name, name_folded, postcodes, aliases, aliases_folded, parent) values
 ('FR','74119','Évian-les-Bains','evian les bains','{74500}','{}','','74'),
 ('FR','74218','Publier','publier','{74500}','{}','','74'),
 ('FR','74191','Neuvecelle','neuvecelle','{74500}','{}','','74'),
 ('FR','74281','Thonon-les-Bains','thonon les bains','{74200}','{}','','74');
insert into partners (id, name) values ('${PA}','LAC IMMO'),('${PB}','AUTRE AGENCE');
insert into profiles values ('${U_PA}','partner_user','${PA}'),('${U_PA2}','partner_user','${PA}'),('${U_PB}','partner_user','${PB}'),('${ADM}','admin',null);
insert into auth.users values ('${U_PA}','agent@lac-immo.test'),('${U_PA2}','assistant@lac-immo.test'),('${U_PB}','b@autre.test'),('${ADM}','admin@zfind.test');
`);
  // Another agency already has a listing with the same reference: it must never be touched.
  await db.exec(`
insert into properties (id, subtype, agency_reference) values ('30000000-0000-0000-0000-0000000000b1','villa','PUB-77'), ('30000000-0000-0000-0000-0000000000b2','apartment', null);
insert into representations (id, target_type, property_id, partner_id, status) values ('40000000-0000-0000-0000-0000000000b1','property','30000000-0000-0000-0000-0000000000b1','${PB}','active'),
  ('40000000-0000-0000-0000-0000000000b2','property','30000000-0000-0000-0000-0000000000b2','${PA}','active');
insert into listings (id, representation_id, price_current) values ('50000000-0000-0000-0000-0000000000b1','40000000-0000-0000-0000-0000000000b1', 500000),
  ('50000000-0000-0000-0000-0000000000b2','40000000-0000-0000-0000-0000000000b2', 300000);
`);

  /** Runs fn with the role and JWT subject PostgREST would set for that caller. */
  const as = async (uid, f, role) => {
    const r = role || (uid ? 'authenticated' : 'anon');
    const claims = JSON.stringify(uid ? { sub: uid, role: r } : { role: r });
    await db.query(`select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false)`, [claims, uid || '']);
    await db.exec(`set role ${r}`);
    try { return await f(); } finally { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)`); }
  };
  const tryq = async (sql, params) => { try { return { rows: await q(sql, params) }; } catch (e) { return { error: e }; } };

  /* supabase-js rpc → SQL (named arguments), set-returning functions as rows. */
  const lit = v => v === null || v === undefined ? 'null'
    : Array.isArray(v) ? (v.length && /^[0-9a-f-]{36}$/.test(v[0]) ? `array[${v.map(x => `'${x}'`).join(',')}]::uuid[]` : `array[${v.map(x => `'${String(x).replace(/'/g, "''")}'`).join(',')}]::text[]`)
    : typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
    : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
  const setReturning = async name => (await q(`select bool_or(proretset) as s from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [name]))[0].s;
  async function callRpc(name, args) {
    const call = `public.${name}(${Object.entries(args || {}).map(([k, v]) => `${k} => ${lit(v)}`).join(', ')})`;
    try {
      if (await setReturning(name)) {
        const rows = await q(`select to_jsonb(t) as r from ${call} t`);
        return { data: rows.map(x => (x.r && typeof x.r === 'object' && !Array.isArray(x.r) && Object.keys(x.r).length === 1 && Object.keys(x.r)[0] === name ? x.r[name] : x.r)), error: null };
      }
      const rows = await q(`select ${call} as r`);
      return { data: rows[0].r, error: null };
    } catch (e) { return { data: null, error: { message: e.message, code: e.code } }; }
  }
  /** rpc as a given user (what the Partner panel's supabase-js client does with its session). */
  const rpcAs = uid => (name, args) => as(uid, () => callRpc(name, args));
  return { db, q, as, tryq, callRpc, rpcAs, lit, ids: IDS };
}
