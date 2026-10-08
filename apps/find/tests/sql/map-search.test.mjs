/* ============================================================
   Z FIND — commune / zone centres for the search map, on PGlite.
   Run:  npm i --no-save @electric-sql/pglite@0.2 && node tests/sql/map-search.test.mjs
   ============================================================ */
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ZOS_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const MIG = f => fs.readFileSync(path.join(ROOT, 'infrastructure', 'supabase', 'migrations', f), 'utf8');
const db = new PGlite();
let pass = 0;
const check = (label, ok) => { if (!ok) { console.error('FAIL:', label); process.exitCode = 1; } else { pass++; console.log('PASS:', label); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const fails = async (sql, params) => { try { await q(sql, params); return false; } catch (_) { return true; } };

await db.exec(`
create role anon; create role authenticated; create role service_role;
create table public.zfind_communes (country text not null, code text not null, name text not null, primary key (country, code));
create table public.zones_lite (id uuid primary key default gen_random_uuid(), name text not null, city text not null, country_iso text not null, commune_code text);
insert into zfind_communes values ('FR','74119','Évian-les-Bains'),('FR','74281','Thonon-les-Bains'),('BE','21004','Bruxelles');
insert into zones_lite (name, city, country_iso, commune_code) values ('Évian-les-Bains','Évian-les-Bains','FR','74119'),('Boavista','Porto','PT',null);
`);
await db.exec(MIG('20261008120000_z_find_map_search_v1.sql'));
check('migration applies', true);
await db.exec(MIG('20261008120000_z_find_map_search_v1.sql'));
check('migration is re-runnable', true);
check('before the centres are loaded, zones have no point (nothing invented)', (await q(`select count(*)::int n from zones_lite where latitude is not null`))[0].n === 0);

// The job loads the centres (upsert = insert … on conflict do update).
await q(`insert into zfind_communes (country, code, name, latitude, longitude) values ('FR','74119','Évian-les-Bains',46.4011,6.5879),('FR','74281','Thonon-les-Bains',46.3705,6.4799),('BE','21004','Bruxelles',50.8721,4.379)
         on conflict (country, code) do update set latitude = excluded.latitude, longitude = excluded.longitude`);
let ev = (await q(`select latitude, longitude from zones_lite where commune_code = '74119'`))[0];
check('loading the centres updates the zones already in use', ev.latitude === 46.4011 && ev.longitude === 6.5879);
check('zones without a commune stay without a point', (await q(`select latitude from zones_lite where name = 'Boavista'`))[0].latitude === null);

await q(`insert into zones_lite (name, city, country_iso, commune_code) values ('Thonon-les-Bains','Thonon-les-Bains','FR','74281')`);
const th = (await q(`select latitude, longitude from zones_lite where commune_code = '74281'`))[0];
check('a new zone takes its commune centre at creation', th.latitude === 46.3705 && th.longitude === 6.4799);
await q(`insert into zones_lite (name, city, country_iso, commune_code) values ('Homonyme','X','BE','74119')`);
check('the country must match (no BE zone gets a French centre)', (await q(`select latitude from zones_lite where name = 'Homonyme'`))[0].latitude === null);

await q(`update zones_lite set commune_code = '74281' where commune_code = '74119' and country_iso = 'FR'`);
ev = (await q(`select latitude from zones_lite where name = 'Évian-les-Bains'`))[0];
check('changing the commune of a zone moves its point', ev.latitude === 46.3705);

await q(`update zfind_communes set latitude = 46.37, longitude = 6.48 where code = '74281'`);
check('correcting a centre updates every zone of the commune', (await q(`select count(*)::int n from zones_lite where commune_code = '74281' and latitude = 46.37`))[0].n === 2);

check('out-of-range centres are refused', await fails(`update zfind_communes set latitude = 123 where code = '74281'`));
check('half a point is refused', await fails(`update zones_lite set latitude = 46.1, longitude = null where name = 'Boavista'`));
console.log(`\nSQL map search: ${pass} checks`);
