/* ============================================================
   Z FIND — agency portfolio import / re-import, end to end on an
   in-memory Postgres (PGlite) with a Supabase-shaped stub.
   The REAL browser code runs: services/listing-import (Poliris reader,
   planSync, applyPlan), zfind-web services/admin.js (the Admin
   commands), listing-compliance.js and zfind-admin followup.js (photo
   queue). The stub only translates supabase-js calls into SQL, as the
   admin user (role authenticated + auth.uid()).
   SQL under test:
   - migrations 20260830112835 (compliance facts, review, publish gate)
     and 20261009120000 (review queue), applied as they are;
   - zfind_admin_transition_listing extracted from migration
     20260813193750 (legal Listing transitions, archiving);
   - stand-ins with the same names / argument names for the asset
     commands (zfind_create_property, zfind_update_asset,
     zfind_set_asset_commune, zfind_admin_create_initial_listing,
     zfind_commune_search) and the photo queue table.
   Scenario: import annonces v1 (Poliris, Windows-1252) for an agency →
   listings created as drafts, facts pending in « Mentions obligatoires
   à valider »; one listing approved and published; re-import of the
   next export v2 (price change, one listing gone, one new) → update,
   archive (only that agency), creation; a published listing's facts
   are never changed; re-importing the same file changes nothing.
   Run:  npm i --no-save @electric-sql/pglite && node tests/sql/listing-import-sync.test.mjs
   (verified with @electric-sql/pglite 0.5.8; ZOS_ROOT=<repo> lets it run from another folder)
   ============================================================ */
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const ROOT = process.env.ZOS_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const FIND = path.join(ROOT, 'apps', 'find');
const MIG = name => fs.readFileSync(path.join(ROOT, 'infrastructure', 'supabase', 'migrations', name), 'utf8');
const require = createRequire(import.meta.url);
const C = require(path.join(FIND, 'apps', 'zfind-web', 'src', 'services', 'listing-compliance.js'));
const P = require(path.join(FIND, 'apps', 'zfind-web', 'src', 'services', 'listing-import', 'poliris.js'));
const { safeQuery } = require(path.join(FIND, 'apps', 'zfind-web', 'src', 'services', 'supabaseClient.js'));
const FIX = name => new Uint8Array(fs.readFileSync(path.join(FIND, 'tests', 'fixtures', 'poliris', name)));

const db = new PGlite();
let pass = 0;
const check = (label, ok, extra) => { if (!ok) { console.error('FAIL:', label, extra === undefined ? '' : JSON.stringify(extra, null, 1)); process.exitCode = 1; } else { pass++; console.log('PASS:', label); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;

const ADM = '00000000-0000-0000-0000-0000000000a1';
const PA = '10000000-0000-0000-0000-000000000001', PB = '10000000-0000-0000-0000-000000000002';

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
grant usage on schema auth, public to authenticated, anon;
create table public.partners (id uuid primary key, name text not null);
create table public.profiles (id uuid primary key, role text not null, partner_id uuid);
create table public.zones_lite (id uuid primary key default gen_random_uuid(), name text not null, city text not null, country_iso text not null, code text);
create table public.properties (id uuid primary key default gen_random_uuid(), property_class text not null, subtype text not null, typology text, area_sqm numeric, gross_private_area_sqm numeric,
  plot_area_sqm numeric, floor int, bedrooms int, bathrooms int, year_built int, energy_rating text, energy_certificate_number text, condo_fee_monthly numeric, imi_annual numeric,
  postal_code text, street_address text, latitude numeric, longitude numeric, zone_lite_id uuid references public.zones_lite(id), agency_reference text, removed_at timestamptz, created_at timestamptz not null default now());
create table public.developments (id uuid primary key, zone_lite_id uuid, removed_at timestamptz);
create table public.representations (id uuid primary key default gen_random_uuid(), target_type text not null, property_id uuid references public.properties(id), development_id uuid, partner_id uuid not null, status text not null);
create table public.listings (id uuid primary key default gen_random_uuid(), representation_id uuid not null references public.representations(id), status text not null default 'draft',
  transaction_type text not null default 'sale', rental_period text, price_current numeric not null default 0, currency_iso text not null default 'EUR', price_is_from boolean not null default false,
  tier text, channel text, created_at timestamptz not null default clock_timestamp());
create table public.listing_content (listing_id uuid references public.listings(id), locale text, title text, description text, primary key (listing_id, locale));
-- Same shape and uniqueness as migration 20261004200000 (photo links queue).
create table public.zfind_media_import_queue (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), listing_id uuid not null references public.listings(id) on delete cascade,
  url text not null check (url ~* '^https?://'), position smallint not null default 0 check (position between 0 and 99), status text not null default 'pending', unique (listing_id, url));
create table public.communes (country text, code text, name text, postcode text);

create function public.zfind_partner_controls_listing(p_listing_id uuid) returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (select 1 from public.profiles p join public.listings l on l.id = p_listing_id join public.representations r on r.id = l.representation_id
    where p.id = auth.uid() and p.role = 'partner_user' and r.partner_id = p.partner_id and r.status <> 'ended' and l.status <> 'archived') $$;
create function public.zfind_public_listing_visible(p_listing_id uuid) returns boolean language sql stable as $$ select true $$;
create function public.zfind_is_admin() returns boolean language sql stable security definer set search_path = pg_catalog as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') $$;

-- Stand-ins for the asset commands (same names and argument names as the real ones; Admin only).
create function public.zfind_create_property(p_subtype text, p_typology text, p_area_sqm numeric, p_floor int, p_zone_lite_id uuid, p_development_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$ declare v public.properties; begin
  if not public.zfind_is_admin() then raise exception 'Admin role required' using errcode = '42501'; end if;
  insert into public.properties (property_class, subtype, typology, area_sqm, floor, zone_lite_id) values (case when p_subtype in ('apartment','villa') then 'residential' else 'other' end, p_subtype, p_typology, p_area_sqm, p_floor, p_zone_lite_id) returning * into v;
  return to_jsonb(v); end $$;
create function public.zfind_update_asset(p_kind text, p_asset_id uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$ declare k text; t text; begin
  if not public.zfind_is_admin() then raise exception 'Admin role required' using errcode = '42501'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    select data_type into t from information_schema.columns where table_schema = 'public' and table_name = 'properties' and column_name = k;
    if t is null or k in ('id','property_class','removed_at') then raise exception 'Unsupported Property field(s): %', k using errcode = '22023'; end if;
    execute format('update public.properties set %I = ($1 ->> %L)::%s where id = $2', k, k, t) using p_patch, p_asset_id;
  end loop;
  return (select to_jsonb(p) from public.properties p where p.id = p_asset_id); end $$;
create function public.zfind_commune_search(p_country text, p_query text) returns table (code text, name text, postcodes text[])
language sql stable security definer set search_path = pg_catalog as $$
  select c.code, c.name, array[c.postcode] from public.communes c where c.country = p_country and (c.postcode = p_query or lower(c.name) like lower(p_query) || '%') $$;
create function public.zfind_set_asset_commune(p_kind text, p_asset_id uuid, p_country text, p_code text) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$ declare z uuid; begin
  if not public.zfind_is_admin() then raise exception 'Admin role required' using errcode = '42501'; end if;
  select id into z from public.zones_lite where code = p_code and country_iso = p_country;
  if z is null then insert into public.zones_lite (name, city, country_iso, code) select c.name, c.name, p_country, c.code from public.communes c where c.code = p_code returning id into z; end if;
  update public.properties set zone_lite_id = z where id = p_asset_id;
  return jsonb_build_object('zone_lite_id', z); end $$;
create function public.zfind_admin_create_initial_listing(p_kind text, p_owner_id uuid, p_partner_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$ declare r uuid; v public.listings; begin
  if not public.zfind_is_admin() then raise exception 'Admin role required' using errcode = '42501'; end if;
  insert into public.representations (target_type, property_id, partner_id, status) values ('property', p_owner_id, p_partner_id, 'active') returning id into r;
  insert into public.listings (representation_id) values (r) returning * into v;
  return to_jsonb(v); end $$;

-- What the Admin reads / writes directly (RLS + column grants of the real schema, simplified to the admin user).
grant select on public.partners, public.properties, public.representations, public.listings, public.listing_content, public.zones_lite to authenticated;
grant update (price_current, currency_iso, price_is_from, tier, rental_period, transaction_type, channel) on public.listings to authenticated;
grant insert, update on public.listing_content to authenticated;
grant select, insert, delete on public.zfind_media_import_queue to authenticated;
`);
await db.exec(MIG('20260830112835_z_find_global_listing_compliance_launch_v2.sql'));
await db.exec(MIG('20261009120000_z_find_listing_compliance_review_queue_v1.sql'));
const lifecycle = MIG('20260813193750_z_find_marketplace_lifecycle_hardening_v1.sql');
const start = lifecycle.indexOf('create or replace function public.zfind_admin_transition_listing(');
await db.exec(lifecycle.slice(start, lifecycle.indexOf('$$;', start) + 3));
await db.exec('grant execute on function public.zfind_admin_transition_listing(uuid, text) to authenticated');
check('compliance + review queue migrations and the real Listing transition command apply', true);

await db.exec(`
insert into partners values ('${PA}','LAC IMMO'),('${PB}','AUTRE AGENCE');
insert into profiles values ('${ADM}','admin',null);
insert into communes values ('FR','74119','Évian-les-Bains','74500'),('FR','74218','Neuvecelle','74500'),('FR','74281','Thonon-les-Bains','74200'),('FR','74218x','Publier','74500');
`);
// Another agency already has a listing with the same reference: it must never be touched.
await db.exec(`
insert into zones_lite (id, name, city, country_iso, code) values ('20000000-0000-0000-0000-000000000009','Publier','Publier','FR','x');
insert into properties (id, property_class, subtype, agency_reference, zone_lite_id) values ('30000000-0000-0000-0000-0000000000b1','residential','villa','PUB-77','20000000-0000-0000-0000-000000000009');
insert into representations (id, target_type, property_id, partner_id, status) values ('40000000-0000-0000-0000-0000000000b1','property','30000000-0000-0000-0000-0000000000b1','${PB}','active');
insert into listings (id, representation_id, price_current) values ('50000000-0000-0000-0000-0000000000b1','40000000-0000-0000-0000-0000000000b1', 500000);
`);

/* ---------- the supabase-js stub: PostgREST calls → SQL as the admin ---------- */
const sent = [];
const lit = v => v === null || v === undefined ? 'null' : Array.isArray(v) ? `array[${v.map(x => `'${x}'`).join(',')}]::uuid[]` : typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
  : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
async function asAdmin(fn) { await db.exec(`set role authenticated; select set_config('test.uid', '${ADM}', false);`); try { return await fn(); } finally { await db.exec('reset role'); } }
const fail = e => ({ data: null, error: { message: e.message, code: e.code }, status: 400 });
const SRF = ['zfind_commune_search', 'zfind_list_listing_compliance_status', 'zfind_admin_list_listing_compliance'];
function builder(table) {
  const st = { table, filters: [], op: 'select' };
  const b = {
    select(cols) { if (st.op === 'select') st.cols = cols; return b; },
    eq(c, v) { st.filters.push(['eq', c, v]); return b; },
    in(c, v) { st.filters.push(['in', c, v]); return b; },
    update(patch) { st.op = 'update'; st.patch = patch; return b; },
    upsert(rows, opts) { st.op = 'upsert'; st.rows = Array.isArray(rows) ? rows : [rows]; st.opts = opts || {}; return b; },
    single() { st.single = true; return b; },
    then(ok, ko) { return run(st).then(ok, ko); }
  };
  return b;
}
async function run(st) {
  sent.push({ from: st.table, op: st.op, filters: st.filters, cols: st.cols });
  try {
    return await asAdmin(async () => {
      const where = st.filters.map(([op, c, v]) => (op === 'eq' ? `${c} = ${lit(v)}` : `${c} = any(${lit(v)})`)).join(' and ') || 'true';
      if (st.table === 'representations' && st.op === 'select') {
        const rows = await q(`select coalesce(json_agg(json_build_object('id', r.id, 'status', r.status, 'properties', to_jsonb(p),
          'listings', (select coalesce(json_agg(json_build_object('id', l.id, 'status', l.status, 'transaction_type', l.transaction_type, 'rental_period', l.rental_period, 'price_current', l.price_current, 'created_at', l.created_at,
             'listing_content', (select coalesce(json_agg(json_build_object('locale', c.locale, 'title', c.title, 'description', c.description)), '[]'::json) from listing_content c where c.listing_id = l.id))), '[]'::json)
             from listings l where l.representation_id = r.id))), '[]'::json) as data
          from representations r join properties p on p.id = r.property_id where ${where.replace(/partner_id/, 'r.partner_id').replace(/target_type/, 'r.target_type')}`);
        return { data: rows[0].data, error: null, status: 200 };
      }
      if (st.table === 'zfind_media_import_queue' && st.op === 'select') return { data: await q(`select listing_id, url, status, null as error from zfind_media_import_queue where ${where}`), error: null, status: 200 };
      if (st.table === 'zfind_media_import_queue' && st.op === 'upsert') {
        for (const r of st.rows) await q(`insert into zfind_media_import_queue (listing_id, url, position) values ($1, $2, $3) on conflict (listing_id, url) do nothing`, [r.listing_id, r.url, r.position]);
        return { data: null, error: null, status: 201 };
      }
      if (st.table === 'listings' && st.op === 'update') {
        const keys = Object.keys(st.patch);
        const rows = await q(`update listings set ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} where ${where} returning id, transaction_type, rental_period, price_current, currency_iso, price_is_from, tier, status`, keys.map(k => st.patch[k]));
        return { data: st.single ? rows[0] : rows, error: null, status: 200 };
      }
      if (st.table === 'listing_content' && st.op === 'upsert') {
        const r = st.rows[0];
        const rows = await q(`insert into listing_content (listing_id, locale, title, description) values ($1, $2, $3, $4) on conflict (listing_id, locale) do update set title = excluded.title, description = excluded.description returning *`, [r.listing_id, r.locale, r.title, r.description]);
        return { data: st.single ? rows[0] : rows, error: null, status: 201 };
      }
      throw new Error(`stub: ${st.op} ${st.table} not expected`);
    });
  } catch (e) { return fail(e); }
}
const client = {
  from: builder,
  async rpc(name, args) {
    sent.push({ rpc: name, args });
    const call = `public.${name}(${Object.entries(args || {}).map(([k, v]) => `${k} => ${lit(v)}`).join(', ')})`;
    try {
      return await asAdmin(async () => {
        const rows = await q(SRF.includes(name) ? `select * from ${call}` : `select ${call} as r`);
        return { data: SRF.includes(name) ? rows : rows[0].r, error: null, status: 200 };
      });
    } catch (e) { return fail(e); }
  }
};
const sbModule = { getSupabaseClient: () => client, safeQuery, resolveMediaUrl: async () => null };
C._setClientModuleForTests(sbModule);
// The Admin page's scripts, as the build concatenates them (browser branch of each UMD wrapper).
const win = { ZFindServices: { supabaseClient: sbModule, imageOptimize: {}, poliris: P, listingCompliance: C } };
const sandbox = { window: win, TextDecoder, console, Intl, fetch: async () => ({}) };
vm.createContext(sandbox);
for (const f of ['apps/zfind-web/src/services/admin.js', 'apps/zfind-web/src/services/listing-import/listing-import.js', 'apps/zfind-admin/src/followup.js']) vm.runInContext(fs.readFileSync(path.join(FIND, f), 'utf8'), sandbox, { filename: f });
const { admin, listingImport: imp, followup } = win.ZFindServices;
check('Admin scripts load: admin, listingImport, followup', !!(admin && imp && followup && imp.planSync));

async function importFile(name, partnerId, opts) {
  const table = imp.readCsvBytes(FIX(name));
  const rows = table.records.map(r => imp.normalizeRow(r, imp.mapFor(table)));
  const pf = await imp.loadPortfolio(partnerId);
  if (pf.error) throw new Error(JSON.stringify(pf.error));
  await imp.loadComplianceFor(pf.data, C);
  const plan = imp.planSync(rows, pf.data, Object.assign({ country: 'FR', fullSync: true, lineOffset: 1 }, opts || {}));
  const out = await imp.applyPlan(plan, { partnerId, country: 'FR', admin, compliance: C, source: { format: table.format, fileName: name, version: table.version } });
  for (const j of out.photoJobs) await followup.queuePhotos(j.listingId, j.urls, j.offset);
  return { table, plan, out };
}
const listingOf = async ref => (await q(`select l.*, r.partner_id from listings l join representations r on r.id = l.representation_id join properties p on p.id = r.property_id where p.agency_reference = $1 and r.partner_id = $2 order by l.created_at desc limit 1`, [ref, PA]))[0];

/* ---------- 1. first import (Poliris, Windows-1252) ---------- */
let res = await importFile('annonces-v1-latin1.csv', PA);
check('v1 plan: 3 to create, the parking in error, nothing to update or archive', res.plan.counts.create === 3 && res.plan.counts.error === 1 && res.plan.counts.update === 0 && res.plan.counts.archive === 0, res.plan.counts);
check('v1 results: 3 created OK', res.out.results.filter(r => r.kind === 'create' && r.status === 'ok').length === 3, res.out.results);
const props = await q(`select p.*, z.name as commune from properties p left join zones_lite z on z.id = p.zone_lite_id join representations r on r.property_id = p.id where r.partner_id = $1 order by agency_reference`, [PA]);
check('properties: agency reference, surfaces, rooms, DPE, GPS, commune resolved (Évian among the 74500 communes)', props.length === 3 && props.map(p => p.agency_reference).join() === 'EV-1024,PUB-77,TH-2031'
  && Number(props[0].area_sqm) === 78.5 && props[0].typology === 'T3' && props[0].energy_rating === 'D' && Number(props[0].latitude) === 46.4012 && props[0].commune === 'Évian-les-Bains' && props[2].commune === 'Thonon-les-Bains' && Number(props[1].plot_area_sqm) === 830, props);
let ev = await listingOf('EV-1024');
const th = await listingOf('TH-2031');
const content = (await q(`select * from listing_content where listing_id = $1`, [ev.id]))[0];
check('listings: drafts with price / rent, French text with line breaks', ev.status === 'draft' && Number(ev.price_current) === 450000 && th.transaction_type === 'rent' && th.rental_period === 'monthly' && Number(th.price_current) === 1150
  && content.locale === 'fr' && content.title === 'T3 vue lac – résidence « Les Sources »' && content.description.split('\n').length === 3);
const queue = await asAdmin(() => C.adminQueue('pending'));
const qRows = (queue.data || []).filter(x => x.partner_id === PA);
check('« Mentions obligatoires à valider »: the 3 imported listings are pending, with agency, reference and commune', !queue.error && qRows.length === 3 && qRows.every(x => x.partner_name === 'LAC IMMO') && qRows.some(x => x.agency_reference === 'EV-1024' && x.commune === 'Évian-les-Bains'), queue);
const v = Object.fromEntries(qRows.map(x => [x.agency_reference, x]));
check('SQL validator agrees with the import: EV-1024 complete, TH-2031 / PUB-77 incomplete with the same missing keys', v['EV-1024'].facts_valid === true && v['TH-2031'].facts_valid === false
  && JSON.stringify(v['TH-2031'].missing) === JSON.stringify(imp.complianceFor(res.plan.creates.find(c => c.row.reference === 'TH-2031').row, 'FR').missing.filter(k => k !== 'furnished')), v['TH-2031']);
check('results tell the Admin what to ask the agency', res.out.results.find(r => r.reference === 'TH-2031').compliance === 'mentions incomplètes : mention Géorisques, montant des honoraires, encadrement des loyers');
const photos = await q(`select listing_id, url, position from zfind_media_import_queue order by listing_id, position`);
check('photo links queued: 3 for EV-1024 (positions 0–2), 1 for TH-2031', photos.filter(p => p.listing_id === ev.id).map(p => p.position).join() === '0,1,2' && photos.filter(p => p.listing_id === th.id).length === 1 && photos.length === 4);

/* ---------- 2. Z Find validates and publishes EV-1024 ---------- */
let r = await asAdmin(() => C.reviewListingCompliance(ev.id, 'approved', null));
check('admin approves the imported facts of EV-1024', !r.error && r.data.review_status === 'approved' && r.data.assessment.compliant === true, r);
for (const s of ['pending_review', 'ready', 'published']) { r = await asAdmin(() => admin.setListingStatus(ev.id, s)); if (r.error) break; }
ev = await listingOf('EV-1024');
check('EV-1024 published through the real lifecycle command and the compliance gate', !r.error && ev.status === 'published', r);

/* ---------- 3. same file again: nothing to do ---------- */
res = await importFile('annonces-v1-latin1.csv', PA);
check('same export again: 0 to create / update / archive, 3 unchanged', res.plan.counts.create === 0 && res.plan.counts.update === 0 && res.plan.counts.archive === 0 && res.plan.counts.unchanged === 3, res.plan.counts);

/* ---------- 4. next export: price change, PUB-77 gone, EV-1100 new ---------- */
res = await importFile('annonces-v2-latin1.csv', PA);
check('v2 plan: 1 create, 1 update, 1 archive, 1 error, 1 unchanged', res.plan.counts.create === 1 && res.plan.counts.update === 1 && res.plan.counts.archive === 1 && res.plan.counts.error === 1 && res.plan.counts.unchanged === 1, res.plan.counts);
check('v2 preview shows « Prix : 450 000 € → 435 000 € »', res.plan.updates[0].changes.map(c => imp.changeText(c).replace(/[  ]/g, ' ')).join() === 'Prix : 450 000 € → 435 000 €');
ev = await listingOf('EV-1024');
const comp = await asAdmin(() => C.getListingCompliance(ev.id));
check('EV-1024: new price written, still published, facts still approved', Number(ev.price_current) === 435000 && ev.status === 'published' && comp.data.review_status === 'approved');
const pub = await listingOf('PUB-77');
const other = (await q(`select status from listings where id = '50000000-0000-0000-0000-0000000000b1'`))[0];
check('PUB-77 of LAC IMMO archived (not deleted); the other agency’s PUB-77 untouched', pub.status === 'archived' && other.status === 'draft' && (await q(`select count(*)::int as n from properties where agency_reference = 'PUB-77'`))[0].n === 2);
const ev1100 = await listingOf('EV-1100');
const c1100 = await asAdmin(() => C.getListingCompliance(ev1100.id));
check('EV-1100 created as a draft; its facts pending (DPE « NS » → exempt, reason to ask)', ev1100.status === 'draft' && c1100.data.review_status === 'pending' && c1100.data.facts.dpe_status === 'exempt' && c1100.data.validation.missing.includes('dpe_exemption_reason'), c1100.data);
check('report: one line per item, archive line says why', imp.resultsCsv(res.out.results).includes(';PUB-77;Retrait;OK;Retirée (archivée) — absente du fichier'));
check('no duplicated photo link after the re-imports', (await q(`select count(*)::int as n from zfind_media_import_queue`))[0].n === 4);

/* ---------- 5. facts changed in the file for the PUBLISHED listing ---------- */
const t2 = imp.readCsvBytes(FIX('annonces-v2-latin1.csv'));
const rows2 = t2.records.map(x => imp.normalizeRow(x, t2.map));
rows2[0].energyCostMax = 1800; rows2[0].photos.push('https://photos.lacimmo.test/ev1024/11.jpg');
const pf = (await imp.loadPortfolio(PA)).data; await imp.loadComplianceFor(pf, C);
const plan5 = imp.planSync(rows2, pf, { country: 'FR', fullSync: true, lineOffset: 1 });
const u5 = plan5.updates.find(u => u.row.reference === 'EV-1024');
check('published listing: the facts change is reported, not planned; the new photo is', u5 && u5.facts === null && u5.notes.some(n => n.startsWith('Annonce en ligne')) && u5.photos.length === 1 && u5.photoOffset === 3, u5 && { notes: u5.notes, photos: u5.photos });
const out5 = await imp.applyPlan(plan5, { partnerId: PA, country: 'FR', admin, compliance: C, source: { format: 'poliris' } });
for (const j of out5.photoJobs) await followup.queuePhotos(j.listingId, j.urls, j.offset);
const comp5 = await asAdmin(() => C.getListingCompliance(ev.id));
check('… the stored facts are unchanged and still approved; the photo is queued after the others', comp5.data.review_status === 'approved' && comp5.data.facts.energy_cost_max === 1720
  && (await q(`select position from zfind_media_import_queue where url like '%/11.jpg'`))[0].position === 3);
r = await asAdmin(() => C.saveListingCompliance(ev.id, Object.assign({}, comp5.data.facts, { energy_cost_max: 1800 }), {}));
check('(the SQL indeed refuses it: « Cette annonce est en ligne… »)', r.error && /^Cette annonce est en ligne/.test(C.describeError(r.error)), r);

/* ---------- 6. RPC / table calls made by the browser code ---------- */
const rpcNames = [...new Set(sent.filter(s => s.rpc).map(s => s.rpc))].sort();
check('only existing commands are used (no direct write to properties / representations, no delete)', JSON.stringify(rpcNames) === JSON.stringify(['zfind_admin_create_initial_listing', 'zfind_admin_review_listing_compliance', 'zfind_admin_transition_listing', 'zfind_commune_search', 'zfind_create_property', 'zfind_get_listing_compliance', 'zfind_save_listing_compliance', 'zfind_set_asset_commune', 'zfind_update_asset', 'zfind_admin_list_listing_compliance'].sort())
  && !sent.some(s => s.from && ['properties', 'representations'].includes(s.from) && s.op !== 'select') && !sent.some(s => s.op === 'delete'), rpcNames);

console.log(`\n${pass} checks passed${process.exitCode ? ' — WITH FAILURES' : ''}`);
