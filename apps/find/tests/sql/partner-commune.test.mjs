/* ============================================================
   Z FIND — commune search + linking a property to its commune,
   on an in-memory Postgres (PGlite) with a Supabase-shaped stub.
   Run:  npm i --no-save @electric-sql/pglite@0.2 && node tests/sql/partner-commune.test.mjs
   ============================================================ */
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ZOS_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const MIGRATION = path.join(ROOT, 'infrastructure', 'supabase', 'migrations', '20261004140000_z_find_partner_commune_v1.sql');

const db = new PGlite();
let pass = 0;
const check = (label, ok) => { if (!ok) { console.error('FAIL:', label); process.exitCode = 1; } else { pass++; console.log('PASS:', label); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema zos;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
grant usage on schema auth, public to authenticated, anon;
create table zos.geography_locations (id uuid primary key default gen_random_uuid(), location_type text, canonical_code text, country_iso text, status text default 'active');
create table public.zones_lite (id uuid primary key default gen_random_uuid(), name text not null, city text not null, country_iso text not null,
  geography_entity_id uuid references zos.geography_locations(id), geography_binding_status text not null default 'unbound' check (geography_binding_status in ('unbound','linked','superseded')),
  unique (name, city, country_iso));
alter table public.zones_lite enable row level security;
create policy "public read zones_lite" on public.zones_lite for select to anon using (true);
grant select on public.zones_lite to anon;
create table public.partners (id uuid primary key default gen_random_uuid());
create table public.profiles (id uuid primary key, partner_id uuid, role text);
create table public.properties (id uuid primary key default gen_random_uuid(), owner uuid, zone_lite_id uuid references public.zones_lite(id), postal_code text);
create table public.developments (id uuid primary key default gen_random_uuid(), owner uuid, zone_lite_id uuid references public.zones_lite(id));
create function public.zfind_partner_owns_property(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from properties pr join profiles pf on pf.partner_id = pr.owner where pr.id = p and pf.id = auth.uid()) $$;
create function public.zfind_partner_owns_development(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from developments d join profiles pf on pf.partner_id = d.owner where d.id = p and pf.id = auth.uid()) $$;
insert into zos.geography_locations (id, location_type, canonical_code, country_iso) values
  ('aaaaaaaa-0000-0000-0000-000000000001','commune','FR-COM-97411','FR'),
  ('aaaaaaaa-0000-0000-0000-000000000002','commune','FR-COM-74119','FR');
insert into public.zones_lite (name, city, country_iso, geography_entity_id, geography_binding_status) values
  ('Saint-Denis','Saint-Denis','FR','aaaaaaaa-0000-0000-0000-000000000001','linked'),
  ('Boavista','Porto','PT',null,'unbound');
`);
await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
check('migration applies; existing linked zone gets its INSEE code', (await q(`select commune_code from zones_lite where name='Saint-Denis'`))[0].commune_code === '97411');
await db.exec(`
insert into public.zfind_communes (country, code, name, name_folded, postcodes, aliases, aliases_folded, parent) values
 ('FR','74119','Évian-les-Bains','evian les bains','{74500}','{}','','74'),
 ('FR','74057','Champanges','champanges','{74500}','{}','','74'),
 ('FR','93066','Saint-Denis','saint denis','{93200,93210}','{}','','93'),
 ('FR','74010','Annecy','annecy','{74000,74370,74600,74940,74960}','{Annecy-le-Vieux,Seynod}','|annecy le vieux|seynod|','74'),
 ('BE','21004','Bruxelles','bruxelles','{1000,1020,1120,1130}','{Brussel,Laeken}','|brussel|laeken|','Région de Bruxelles-Capitale'),
 ('LU','LU-LUXEMBOURG','Luxembourg','luxembourg','{}','{Kirchberg,Belair}','|kirchberg|belair|','Canton Luxembourg');
`);
const P1 = '11111111-1111-1111-1111-111111111111', P2 = '22222222-2222-2222-2222-222222222222', U1 = '33333333-3333-3333-3333-333333333333', U2 = '44444444-4444-4444-4444-444444444444', ADM = '55555555-5555-5555-5555-555555555555';
await db.query(`insert into partners (id) values ($1),($2)`, [P1, P2]);
await db.query(`insert into profiles (id, partner_id, role) values ($1,$2,'partner_user'),($3,$4,'partner_user'),($5,null,'admin')`, [U1, P1, U2, P2, ADM]);
const prop = (await q(`insert into properties (owner) values ($1) returning id`, [P1]))[0].id;
const dev = (await q(`insert into developments (owner) values ($1) returning id`, [P1]))[0].id;
const as = async (role, uid, fn) => { await db.exec(`set role ${role}; select set_config('test.uid', '${uid || ''}', false);`); try { return await fn(); } finally { await db.exec('reset role'); } };

let r = await as('anon', null, () => q(`select * from zfind_commune_search('FR','74500')`));
check('search by postcode: both communes of 74500', r.length === 2 && r.map(x => x.name).includes('Évian-les-Bains') && r[0].zone_label.includes('(74500)'));
r = await as('anon', null, () => q(`select * from zfind_commune_search('FR','evian')`));
check('search by name prefix (accents folded by the client)', r.length === 1 && r[0].code === '74119');
r = await as('anon', null, () => q(`select * from zfind_commune_search('FR','seynod')`));
check('search by former commune / alias', r.length === 1 && r[0].name === 'Annecy');
r = await as('anon', null, () => q(`select * from zfind_commune_search('BE','brussel')`));
check('Belgium: Dutch name finds Bruxelles', r.length === 1 && r[0].code === '21004');
r = await as('anon', null, () => q(`select * from zfind_commune_search('LU','kirchberg')`));
check('Luxembourg: district finds the commune', r.length === 1 && r[0].code === 'LU-LUXEMBOURG' && r[0].zone_label === 'Luxembourg');
r = await as('anon', null, () => q(`select * from zfind_commune_search('FR','e')`));
check('one character: nothing', r.length === 0);
let denied = false; try { await as('anon', null, () => q(`select * from zfind_communes`)); } catch (e) { denied = /permission denied/.test(e.message); }
check('communes table not readable directly', denied);

r = await as('authenticated', U1, () => q(`select zfind_set_asset_commune('property', $1, 'FR', '74119') r`, [prop]));
const z1 = r[0].r.zone_lite_id;
let row = (await q(`select z.name, z.city, z.commune_code, z.geography_binding_status, z.geography_entity_id, p.postal_code from properties p join zones_lite z on z.id = p.zone_lite_id where p.id = $1`, [prop]))[0];
check('partner links own property: zone created with the official name, linked to ZOS geography, postcode filled', row.name === 'Évian-les-Bains' && row.city === 'Évian-les-Bains' && row.commune_code === '74119' && row.geography_binding_status === 'linked' && row.postal_code === '74500');
r = await as('authenticated', U1, () => q(`select zfind_set_asset_commune('development', $1, 'FR', '74119') r`, [dev]));
check('same commune reuses the same zone (development)', r[0].r.zone_lite_id === z1 && (await q(`select count(*)::int n from zones_lite where commune_code='74119'`))[0].n === 1);
r = await as('authenticated', U1, () => q(`select zfind_set_asset_commune('property', $1, 'FR', '93066') r`, [prop]));
row = (await q(`select z.name, z.city, z.geography_binding_status from properties p join zones_lite z on z.id = p.zone_lite_id where p.id = $1`, [prop]))[0];
check('homonym (Saint-Denis 93 vs 974): name carries the department, city stays official, unbound', row.name === 'Saint-Denis (93)' && row.city === 'Saint-Denis' && row.geography_binding_status === 'unbound');
check('postcode kept when already set', (await q(`select postal_code from properties where id=$1`, [prop]))[0].postal_code === '74500');
let err = ''; try { await as('authenticated', U2, () => q(`select zfind_set_asset_commune('property', $1, 'FR', '74119')`, [prop])); } catch (e) { err = e.message; }
check("another partner cannot move someone else's property", err.includes('forbidden'));
err = ''; try { await as('authenticated', U1, () => q(`select zfind_set_asset_commune('property', $1, 'FR', '99999')`, [prop])); } catch (e) { err = e.message; }
check('unknown commune refused', err.includes('unknown_commune'));
denied = false; try { await as('anon', null, () => q(`select zfind_set_asset_commune('property', $1, 'FR', '74119')`, [prop])); } catch (e) { denied = /permission denied/.test(e.message); }
check('anonymous visitors cannot link', denied);
r = await as('authenticated', ADM, () => q(`select zfind_set_asset_commune('property', $1, 'LU', 'LU-LUXEMBOURG') r`, [prop]));
check('admin can link any property (Luxembourg, no postcode)', r[0].r.country === 'LU');
r = await as('authenticated', U1, () => q(`select count(*)::int n from zones_lite`));
check('partners now read zones_lite (to show their commune)', r[0].n >= 5);
console.log(`\nSQL commune: ${pass} checks`);
