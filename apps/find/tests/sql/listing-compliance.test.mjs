/* ============================================================
   Z FIND — Mandatory listing information (France, Belgium, Luxembourg):
   the browser service against the real SQL, on an in-memory Postgres
   (PGlite) with a Supabase-shaped stub.
   - zfind-web services/listing-compliance.js sqlMissing() must give
     exactly what zfind_compliance_profile_missing /
     zfind_validate_listing_compliance_facts return (same keys, same
     order) over thousands of generated facts, for EVERY profile;
   - each profile accepts a complete fact set and reports every required
     fact that is removed;
   - every RPC the Partner / Admin apps make (exact argument names) runs
     against migrations 20260830112835 (compliance gate), 20261009120000
     (review queue) and 20261014120000 (new profiles, BE / LU gate,
     energy class G), as partner, other partner and admin;
   - the publish trigger blocks FR (logement, programme neuf, commercial,
     terrain), BE (Wallonie, Bruxelles, Flandre) and LU listings until the
     facts are approved; listings ALREADY published before the migration
     stay published; the migration runs twice (idempotent);
   - properties.energy_rating accepts G and keeps A+ / B-.
   Run:  npm i --no-save @electric-sql/pglite && node tests/sql/listing-compliance.test.mjs
   (verified with @electric-sql/pglite 0.5.8; ZOS_ROOT=<repo> lets it run from another folder)
   ============================================================ */
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const ROOT = process.env.ZOS_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const MIG = name => fs.readFileSync(path.join(ROOT, 'infrastructure', 'supabase', 'migrations', name), 'utf8');
const COVERAGE_MIG = '20261014120000_z_find_compliance_coverage_be_lu_class_g_v1.sql';
const require = createRequire(import.meta.url);
const C = require(path.join(ROOT, 'apps', 'find', 'apps', 'zfind-web', 'src', 'services', 'listing-compliance.js'));

const db = new PGlite();
let pass = 0;
const check = (label, ok, extra) => { if (!ok) { console.error('FAIL:', label, extra === undefined ? '' : JSON.stringify(extra).slice(0, 1500)); process.exitCode = 1; } else { pass++; console.log('PASS:', label); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
grant usage on schema auth, public to authenticated, anon;
create table public.partners (id uuid primary key, name text not null);
create table public.profiles (id uuid primary key, role text not null, partner_id uuid);
create table public.zones_lite (id uuid primary key, name text not null, city text not null, country_iso text not null, commune_code text);
create table public.developments (id uuid primary key, zone_lite_id uuid, removed_at timestamptz);
-- energy_rating: the column as created by migration 20260812120000 (inline CHECK, Portuguese scale).
create table public.properties (id uuid primary key, property_class text not null, zone_lite_id uuid, postal_code text, agency_reference text, removed_at timestamptz,
  development_id uuid references public.developments(id),
  energy_rating text check (energy_rating in ('A+','A','B','B-','C','D','E','F')));
create table public.representations (id uuid primary key, target_type text not null, property_id uuid, development_id uuid, partner_id uuid not null, status text not null);
create table public.listings (id uuid primary key, representation_id uuid not null references public.representations(id), status text not null default 'draft',
  transaction_type text not null default 'sale', price_current numeric not null default 0, currency_iso text not null default 'EUR', created_at timestamptz not null default now());
create table public.listing_content (listing_id uuid references public.listings(id), locale text, title text, description text);
-- Same contract as migration 20260813213456 (partner controls a non-archived listing of its own representation).
create function public.zfind_partner_controls_listing(p_listing_id uuid) returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (select 1 from public.profiles p join public.listings l on l.id = p_listing_id join public.representations r on r.id = l.representation_id
    where p.id = auth.uid() and p.role = 'partner_user' and r.partner_id = p.partner_id and r.status <> 'ended' and l.status <> 'archived') $$;
create function public.zfind_public_listing_visible(p_listing_id uuid) returns boolean language sql stable as $$ select true $$;
`);
await db.exec(MIG('20260830112835_z_find_global_listing_compliance_launch_v2.sql'));
await db.exec(MIG('20261009120000_z_find_listing_compliance_review_queue_v1.sql'));
check('compliance gate v2 + review queue migrations apply', true);

/* ---------------- fixtures (created BEFORE the coverage migration) ---------------- */
const PA = '10000000-0000-0000-0000-000000000001', PB = '10000000-0000-0000-0000-000000000002';
const U_PA = '00000000-0000-0000-0000-0000000000b1', U_PB = '00000000-0000-0000-0000-0000000000b2', ADM = '00000000-0000-0000-0000-0000000000a1';
const Z = {
  FR: '20000000-0000-0000-0000-000000000001', BX: '20000000-0000-0000-0000-000000000002', NAMUR: '20000000-0000-0000-0000-000000000003',
  GENT: '20000000-0000-0000-0000-000000000004', LUX: '20000000-0000-0000-0000-000000000005', BE_NOCODE: '20000000-0000-0000-0000-000000000006',
  WAVRE: '20000000-0000-0000-0000-000000000007', LEUVEN: '20000000-0000-0000-0000-000000000008'
};
await db.exec(`
insert into partners values ('${PA}','Agence du Lac'),('${PB}','Autre Agence');
insert into profiles values ('${U_PA}','partner_user','${PA}'),('${U_PB}','partner_user','${PB}'),('${ADM}','admin',null);
insert into zones_lite values ('${Z.FR}','Évian-les-Bains','Évian-les-Bains','FR','74119'),('${Z.BX}','Ixelles','Bruxelles','BE','21009'),
  ('${Z.NAMUR}','Namur','Namur','BE','92094'),('${Z.GENT}','Gent','Gent','BE','44021'),('${Z.LUX}','Luxembourg','Luxembourg','LU','0304'),
  ('${Z.BE_NOCODE}','Zone démo','Belgique','BE',null),('${Z.WAVRE}','Wavre','Wavre','BE','25112'),('${Z.LEUVEN}','Leuven','Leuven','BE','24062');
insert into developments values ('31000000-0000-0000-0000-000000000001','${Z.FR}',null);
`);
let n = 0;
const ids = {};
/** property (or development) + representation + listing */
async function makeListing(name, { cls = 'residential', zone = Z.FR, tx = 'sale', postcode = null, dev = null, target = 'property', partner = PA, status = 'draft', energy = null }) {
  n++;
  const hex = String(n).padStart(12, '0');
  const pid = `30000000-0000-0000-0000-${hex}`, rid = `40000000-0000-0000-0000-${hex}`, lid = `50000000-0000-0000-0000-${hex}`;
  if (target === 'property') {
    await db.query('insert into properties (id, property_class, zone_lite_id, postal_code, agency_reference, development_id, energy_rating) values ($1,$2,$3,$4,$5,$6,$7)', [pid, cls, zone, postcode, 'REF-' + n, dev, energy]);
    await db.query(`insert into representations values ($1,'property',$2,null,$3,'active')`, [rid, pid, partner]);
  } else {
    await db.query(`insert into representations values ($1,'development',null,$2,$3,'active')`, [rid, dev, partner]);
  }
  await db.query('insert into listings (id, representation_id, transaction_type, price_current, status) values ($1,$2,$3,$4,$5)', [lid, rid, tx, tx === 'rent' ? 1200 : 350000, status]);
  await db.query(`insert into listing_content values ($1,'fr',$2,'Description.')`, [lid, 'Annonce ' + name]);
  ids[name] = lid; ids[name + '_property'] = pid;
  return lid;
}
await makeListing('sale', {});
await makeListing('rent', { tx: 'rent' });
await makeListing('other', { partner: PB, postcode: '74200' });
await makeListing('dev', { target: 'development', dev: '31000000-0000-0000-0000-000000000001' });
await makeListing('devUnit', { dev: '31000000-0000-0000-0000-000000000001' });
await makeListing('devUnitApproved', { dev: '31000000-0000-0000-0000-000000000001' });
await makeListing('comSale', { cls: 'commercial' });
await makeListing('comRent', { cls: 'commercial', tx: 'rent' });
await makeListing('landSale', { cls: 'land' });
await makeListing('landRent', { cls: 'land', tx: 'rent' });
await makeListing('walSale', { zone: Z.NAMUR });
await makeListing('walRent', { zone: Z.WAVRE, tx: 'rent' });
await makeListing('bruSale', { zone: Z.BX });
await makeListing('bruRent', { zone: Z.BX, tx: 'rent' });
await makeListing('vlaSale', { zone: Z.GENT });
await makeListing('vlaRent', { zone: Z.LEUVEN, tx: 'rent' });
await makeListing('luSale', { zone: Z.LUX });
await makeListing('luRent', { zone: Z.LUX, tx: 'rent' });
await makeListing('bePostcode', { zone: Z.BE_NOCODE, postcode: '1348' });  // Louvain-la-Neuve: Brabant wallon → Wallonie
await makeListing('beUnknown', { zone: Z.BE_NOCODE });
await makeListing('frApprovedPublished', { energy: 'A+' });
// Published BEFORE the coverage migration: a Belgian and a Luxembourg listing (not gated by v2), a Belgian property rated B-.
await makeListing('bePublishedLegacy', { zone: Z.BX, status: 'published', energy: 'B-' });
await makeListing('luPublishedLegacy', { zone: Z.LUX, tx: 'rent', status: 'published' });
await makeListing('vlaPublishedLegacy', { zone: Z.GENT, status: 'published' });
await db.exec('grant select, update on public.listings to authenticated');

// An FR sale approved and published under v2, and a programme unit approved under fr_residential_sale_v1.
const v2SaleFacts = { georisques_disclosure: true, fees_payer: 'buyer', agency_fees_amount: 15000, dpe_status: 'available', dpe_energy_class: 'D', ghg_class: 'E',
  energy_cost_min: 1200, energy_cost_max: 1700, energy_cost_reference_year: '2023', price_includes_agency_fees: true, is_condominium: true,
  condominium_lots_count: 24, annual_condominium_charges: 1800, condominium_procedure_status: 'Aucune procédure en cours' };
await db.query(`insert into zfind_listing_compliance (listing_id, facts, review_status, reviewed_by, reviewed_at) values ($1,$2,'approved',$3,now()),($4,$2,'approved',$3,now())`,
  [ids.frApprovedPublished, JSON.stringify(v2SaleFacts), ADM, ids.devUnitApproved]);
await db.query(`update listings set status = 'published' where id = $1`, [ids.frApprovedPublished]);
const [{ v: devUnitBefore }] = await q('select zfind_assess_listing_compliance($1) as v', [ids.devUnitApproved]);
check('before: the programme unit is approved and compliant under fr_residential_sale_v1', devUnitBefore.profile === C.SALE && devUnitBefore.compliant === true, devUnitBefore);

/* ---------------- the coverage migration, twice ---------------- */
const coverage = MIG(COVERAGE_MIG);
await db.exec(coverage);
await db.exec(coverage);
check('coverage migration applies twice on existing data (idempotent)', true);
const migrationDml = coverage.replace(/--.*$/gm, '').replace(/\$\$[\s\S]*?\$\$/g, '');
check('coverage migration updates / deletes no row and drops no table', !/\b(update|delete from|truncate|drop table)\b/i.test(migrationDml.replace(/drop constraint %I/g, '')));

/* ---------- 1. existing listings ---------- */
const statusOf = async id => (await q('select status from listings where id = $1', [id]))[0].status;
check('BE / LU listings published before the migration are still published', await statusOf(ids.bePublishedLegacy) === 'published' && await statusOf(ids.luPublishedLegacy) === 'published' && await statusOf(ids.vlaPublishedLegacy) === 'published');
let err = null;
try { await db.query('update listings set price_current = 360000 where id = $1', [ids.bePublishedLegacy]); } catch (e) { err = e.message; }
check('a published BE listing can still be edited (price) — only the transition to published is gated', err === null, err);
const [{ v: legacyAssess }] = await q('select zfind_assess_listing_compliance($1) as v', [ids.bePublishedLegacy]);
check('… its assessment now lists what is missing (Bruxelles profile), without unpublishing it', legacyAssess.profile === C.BRU_SALE && legacyAssess.compliant === false && legacyAssess.missing.includes('compliance_record'), legacyAssess);
const [{ v: frApproved }] = await q('select zfind_assess_listing_compliance($1) as v', [ids.frApprovedPublished]);
check('an FR sale approved under v2 stays compliant (fr_residential_sale_v1 unchanged)', frApproved.profile === C.SALE && frApproved.compliant === true, frApproved);
const [{ v: devUnitAfter }] = await q('select zfind_assess_listing_compliance($1) as v', [ids.devUnitApproved]);
check('a programme unit approved under fr_residential_sale_v1 is now fr_new_development_sale_v1 and STILL compliant', devUnitAfter.profile === C.NEW_DEV && devUnitAfter.compliant === true, devUnitAfter);

/* ---------- 2. energy class G ---------- */
const ratings = await q(`select energy_rating from properties where energy_rating is not null order by 1`);
check('existing A+ / B- ratings are kept', JSON.stringify(ratings.map(r => r.energy_rating)) === JSON.stringify(['A+', 'B-']), ratings);
err = null; try { await db.query(`update properties set energy_rating = 'G' where id = $1`, [ids.sale_property]); } catch (e) { err = e.message; }
check('energy_rating accepts G (French / EU scale)', err === null, err);
for (const r of ['A', 'B', 'C', 'D', 'E', 'F', 'A+', 'B-']) { err = null; try { await db.query('update properties set energy_rating = $2 where id = $1', [ids.rent_property, r]); } catch (e) { err = e.message; } if (err) break; }
check('every former value is still accepted', err === null, err);
err = null; try { await db.query(`update properties set energy_rating = 'H' where id = $1`, [ids.rent_property]); } catch (e) { err = e.message; }
check('a value outside the scale is still refused', /properties_energy_rating_check/.test(err || ''), err);
const cons = await q(`select count(*)::int as c from pg_constraint where conrelid = 'public.properties'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%energy_rating%'`);
check('exactly one energy_rating constraint after two runs', cons[0].c === 1, cons);

/* ---------- 3. profile mapping ---------- */
const expectProfile = {
  sale: C.SALE, rent: C.RENT, dev: C.NEW_DEV, devUnit: C.NEW_DEV, comSale: C.COM_SALE, comRent: C.COM_RENT, landSale: C.LAND_SALE, landRent: C.LAND_RENT,
  walSale: C.WAL_SALE, walRent: C.WAL_RENT, bruSale: C.BRU_SALE, bruRent: C.BRU_RENT, vlaSale: C.VLA_SALE, vlaRent: C.VLA_RENT, luSale: C.LU_SALE, luRent: C.LU_RENT,
  bePostcode: C.WAL_SALE, beUnknown: null
};
const got = {};
for (const k of Object.keys(expectProfile)) got[k] = (await q('select zfind_listing_compliance_profile($1) as p', [ids[k]]))[0].p;
check('type / transaction / region → profile (incl. Wavre 25xxx → Wallonie, Leuven 24xxx → Flandre, postcode 1348 → Wallonie)', JSON.stringify(got) === JSON.stringify(expectProfile), got);
const [{ v: unknown }] = await q('select zfind_validate_listing_compliance_facts($1) as v', [ids.beUnknown]);
check('Belgian listing without commune code nor postcode → be_region_unresolved', unknown.profile === null && JSON.stringify(unknown.missing) === '["be_region_unresolved"]', unknown);
const regionCases = [['21004', null, 'BRU'], ['25072', null, 'WAL'], ['52011', null, 'WAL'], ['63003', null, 'WAL'], ['85009', null, 'WAL'], ['93014', null, 'WAL'], ['11002', null, 'VLA'], ['23088', null, 'VLA'],
  ['31005', null, 'VLA'], ['44021', null, 'VLA'], ['71022', null, 'VLA'], [null, '1000', 'BRU'], [null, '1299', 'BRU'], [null, '1300', 'WAL'], [null, '1499', 'WAL'], [null, '1500', 'VLA'],
  [null, '3999', 'VLA'], [null, '4000', 'WAL'], [null, '7999', 'WAL'], [null, '8000', 'VLA'], [null, '9999', 'VLA'], [null, '999', null], ['abc', 'x', null]];
let regionOk = true; const regionBad = [];
for (const [code, pc, want] of regionCases) {
  const [{ r }] = await q('select zfind_be_region($1, $2) as r', [code, pc]);
  if (r !== want || C.beRegion(code, pc) !== want) { regionOk = false; regionBad.push({ code, pc, want, sql: r, js: C.beRegion(code, pc) }); }
}
check('Belgian region: NIS code first, else postcode ranges — SQL and browser agree', regionOk, regionBad);
check('browser profileFor() = SQL mapping', C.profileFor({ country: 'FR', propertyClass: 'commercial', transaction: 'rent' }) === C.COM_RENT
  && C.profileFor({ country: 'FR', target: 'development', transaction: 'sale' }) === C.NEW_DEV && C.profileFor({ country: 'FR', propertyClass: 'residential', inDevelopment: true }) === C.NEW_DEV
  && C.profileFor({ country: 'BE', postalCode: '9000', transaction: 'sale' }) === C.VLA_SALE && C.profileFor({ country: 'LU', transaction: 'rent' }) === C.LU_RENT
  && C.profileFor({ country: 'BE', transaction: 'sale' }) === null && C.profileFor({ country: 'PT', transaction: 'sale' }) === null);

/* ---------- 4. differential: JS mirror vs SQL validator, every profile ---------- */
let seed = 20261014; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];
const NUM = [0, 1, 12.5, 1800, -1, '100', '', null, true];
const BOOL = [true, false, true, false, 'true', 1, null];
const CLS = ['A', 'g', 'D', 'H', 'I', '', 'A+', 'a++', 'B-', 'c+', 'X', 3, null];
const TXT = ['Monument historique', 'woongebied', '  ', '', 5, null];
const V = {
  georisques_disclosure: [true, true, false, 'true', 1, null], fees_payer: ['seller', 'buyer', 'landlord', 'tenant', 'shared', 'agency', '', 3, null],
  dpe_status: ['available', 'exempt', 'pending_completion', 'available', 'exempt', 'other', '', null, 1], dpe_energy_class: CLS, ghg_class: CLS,
  energy_cost_reference_year: ['2023', ' ', '', 2023, null], dpe_exemption_reason: TXT,
  condominium_procedure_status: ['Aucune procédure en cours', '', ' ', 1, null], charges_recovery_method: ['provision', 'forfait', 'none', 'other', '', null],
  rent_control_status: ['applicable', 'not_applicable', 'applicable', 'yes', '', null], price_includes_agency_fees: BOOL, is_condominium: BOOL, furnished: BOOL,
  peb_status: ['available', 'exempt', 'available', 'other', '', null], peb_class: CLS, peb_certificate_code: ['20231004012345', ' ', '', 7, null], peb_exemption_reason: TXT,
  epc_status: ['available', 'exempt', 'available', 'x', '', null], epc_unique_code: ['UC-123', '', ' ', 1, null], epc_address_in_ad: [true, false, 'true', null], epc_exemption_reason: TXT,
  renovation_obligation: BOOL, flood_p_score: ['A', 'b', 'C', 'D', 'E', '', 1, null], flood_g_score: ['A', 'd', 'E', '', null], plot_is_built: BOOL,
  urban_permit_issued: BOOL, urban_zoning_designation: TXT, urban_summons: BOOL, urban_preemption_right: BOOL, urban_subdivision_permit: BOOL,
  cpe_status: ['available', 'exempt', 'available', 'n', '', null], cpe_energy_class: CLS, cpe_insulation_class: CLS, cpe_exemption_reason: TXT
};
const KEYS = ['georisques_disclosure', 'fees_payer', 'agency_fees_amount', 'dpe_status', 'dpe_energy_class', 'ghg_class', 'energy_cost_min', 'energy_cost_max', 'energy_cost_reference_year',
  'dpe_exemption_reason', 'price_includes_agency_fees', 'is_condominium', 'condominium_lots_count', 'annual_condominium_charges', 'condominium_procedure_status', 'surface_habitable_sqm',
  'monthly_rent_excl_charges', 'monthly_charges', 'charges_recovery_method', 'deposit_amount', 'tenant_fees_amount', 'inventory_fees_amount', 'furnished', 'rent_control_status',
  'reference_rent', 'increased_reference_rent', 'rent_supplement_amount',
  'peb_status', 'peb_class', 'peb_specific_consumption_kwh_m2', 'peb_total_consumption_kwh', 'peb_certificate_code', 'peb_primary_energy_kwh_m2', 'peb_co2_kg_m2', 'peb_exemption_reason',
  'monthly_rent', 'monthly_common_charges', 'epc_status', 'epc_score_kwh_m2', 'epc_unique_code', 'epc_address_in_ad', 'epc_exemption_reason', 'renovation_obligation',
  'flood_p_score', 'plot_is_built', 'flood_g_score', 'urban_permit_issued', 'urban_zoning_designation', 'urban_summons', 'urban_preemption_right', 'urban_subdivision_permit',
  'cpe_status', 'cpe_energy_class', 'cpe_insulation_class', 'cpe_exemption_reason'];
const profileListing = { [C.SALE]: ids.sale, [C.RENT]: ids.rent, [C.NEW_DEV]: ids.dev, [C.COM_SALE]: ids.comSale, [C.COM_RENT]: ids.comRent, [C.LAND_SALE]: ids.landSale,
  [C.LAND_RENT]: ids.landRent, [C.WAL_SALE]: ids.walSale, [C.WAL_RENT]: ids.walRent, [C.BRU_SALE]: ids.bruSale, [C.BRU_RENT]: ids.bruRent, [C.VLA_SALE]: ids.vlaSale,
  [C.VLA_RENT]: ids.vlaRent, [C.LU_SALE]: ids.luSale, [C.LU_RENT]: ids.luRent };
check('every browser profile has a listing in this test', C.PROFILES.every(p => profileListing[p]) && C.PROFILES.length === 15);
await db.query(`insert into zfind_listing_compliance (listing_id, facts) select unnest($1::uuid[]), '{}'::jsonb`, [Object.values(profileListing)]);
let total = 0, mismatches = 0, unsafe = 0; const firstMismatch = []; const perProfile = {};
for (const profile of C.PROFILES) {
  perProfile[profile] = 0;
  for (let i = 0; i < 700; i++) {
    const facts = {}; const density = rnd() < 0.8 ? 0.9 : 0.45;
    KEYS.forEach(k => { if (rnd() < density) facts[k] = pick(V[k] || NUM); });
    if (rnd() < 0.2) { facts.energy_cost_min = 2000; facts.energy_cost_max = 1500; }
    let sql;
    if (i % 7 === 0) { // through the listing validator (profile resolution + record)
      await db.query('update zfind_listing_compliance set facts = $2::jsonb where listing_id = $1', [profileListing[profile], JSON.stringify(facts)]);
      const [{ v }] = await q('select zfind_validate_listing_compliance_facts($1) as v', [profileListing[profile]]);
      if (v.profile !== profile) { mismatches++; firstMismatch.push({ profile, wrongProfile: v.profile }); continue; }
      sql = v.missing;
    } else {
      sql = (await q('select zfind_compliance_profile_missing($1, $2::jsonb) as m', [profile, JSON.stringify(facts)]))[0].m;
    }
    const js = C.sqlMissing(profile, facts);
    total++; perProfile[profile]++;
    if (JSON.stringify(js) !== JSON.stringify(sql)) { mismatches++; if (firstMismatch.length < 3) firstMismatch.push({ profile, facts, sql, js }); }
    if (C.validateFacts(profile, facts).valid && sql.length) unsafe++;
  }
}
check(`sqlMissing() == SQL validator on ${total} generated fact sets (15 profiles × 700): 0 differences`, mismatches === 0, firstMismatch);
check('validateFacts() never accepts facts the SQL validator rejects', unsafe === 0, unsafe);
const [{ m: unknownProfile }] = await q(`select zfind_compliance_profile_missing('xx_v9', '{}') as m`);
check('unknown profile → unsupported_profile, in SQL and in the browser', JSON.stringify(unknownProfile) === '["unsupported_profile"]' && JSON.stringify(C.sqlMissing('xx_v9', {})) === '["unsupported_profile"]');
// Subset guarantee: a fact set valid for fr_residential_sale_v1 is valid for fr_new_development_sale_v1.
let subsetBroken = 0;
for (let i = 0; i < 1500; i++) {
  const facts = {}; KEYS.slice(0, 27).forEach(k => { if (rnd() < 0.95) facts[k] = pick(V[k] || NUM); });
  if (C.sqlMissing(C.SALE, facts).length === 0 && C.sqlMissing(C.NEW_DEV, facts).length) subsetBroken++;
}
const [{ m: subsetSql }] = await q('select zfind_compliance_profile_missing($1, $2::jsonb) as m', [C.NEW_DEV, JSON.stringify(v2SaleFacts)]);
check('programme neuf checks ⊂ logement sale checks (approved FR records stay valid)', subsetBroken === 0 && subsetSql.length === 0);
await db.exec('delete from zfind_listing_compliance where listing_id not in (select listing_id from zfind_listing_compliance where review_status = \'approved\')');

/* ---------- 5. a complete fact set per profile; every required fact is required ---------- */
const FORM = {
  [C.NEW_DEV]: { georisques_disclosure: true, fees_payer: 'seller', agency_fees_amount: '0', price_includes_agency_fees: 'true', dpe_status: 'pending_completion', energy_standard: 'RE2020' },
  [C.COM_SALE]: { georisques_disclosure: true, fees_payer: 'buyer', agency_fees_amount: '12 000', price_includes_agency_fees: 'true', dpe_status: 'available', dpe_energy_class: 'H', ghg_class: 'c',
    is_condominium: 'true', condominium_lots_count: '8', annual_condominium_charges: '2 400', condominium_procedure_choice: 'none' },
  [C.COM_RENT]: { georisques_disclosure: true, dpe_status: 'exempt', dpe_exemption_reason: 'Bâtiment de moins de 50 m² isolé' },
  [C.LAND_SALE]: { georisques_disclosure: true, fees_payer: 'seller', agency_fees_amount: '9 000', price_includes_agency_fees: 'false', land_serviced: 'serviced' },
  [C.LAND_RENT]: { georisques_disclosure: true, fees_payer: 'landlord', agency_fees_amount: '0' },
  [C.WAL_SALE]: { peb_status: 'available', peb_class: 'D', peb_specific_consumption_kwh_m2: '312', peb_total_consumption_kwh: '41 500', peb_certificate_code: '20240512012345' },
  [C.WAL_RENT]: { peb_status: 'exempt', peb_exemption_reason: 'Bâtiment destiné à la démolition', monthly_rent: '950', monthly_common_charges: '60' },
  [C.BRU_SALE]: { peb_status: 'available', peb_class: 'C+', peb_primary_energy_kwh_m2: '140', peb_co2_kg_m2: '28' },
  [C.BRU_RENT]: { peb_status: 'available', peb_class: 'E', peb_primary_energy_kwh_m2: '260', peb_co2_kg_m2: '51', monthly_rent: '1 250', monthly_common_charges: '120' },
  [C.VLA_SALE]: { epc_status: 'available', epc_score_kwh_m2: '245', epc_label: 'C', epc_unique_code: '20230101-0001234-00000001', renovation_obligation: 'false',
    flood_p_score: 'A', plot_is_built: 'true', flood_g_score: 'B', urban_permit_issued: 'true', urban_zoning_designation: 'woongebied', urban_summons: 'false',
    urban_preemption_right: 'false', urban_subdivision_permit: 'false' },
  [C.VLA_RENT]: { epc_status: 'available', epc_score_kwh_m2: '180', epc_address_in_ad: true, monthly_rent: '1 100', monthly_common_charges: '0' },
  [C.LU_SALE]: { cpe_status: 'available', cpe_energy_class: 'B', cpe_insulation_class: 'C', fees_payer: 'seller', agency_fees_amount: '35 100' },
  [C.LU_RENT]: { cpe_status: 'available', cpe_energy_class: 'G', cpe_insulation_class: 'H' }
};
const validFacts = {};
for (const [profile, form] of Object.entries(FORM)) {
  const facts = C.buildFacts(profile, form);
  validFacts[profile] = facts;
  const [{ m }] = await q('select zfind_compliance_profile_missing($1, $2::jsonb) as m', [profile, JSON.stringify(facts)]);
  const js = C.validateFacts(profile, facts);
  check(`${profile}: complete form → accepted by SQL and by the form`, m.length === 0 && js.valid, { facts, sql: m, js });
  // Remove each required fact: SQL must report it (or a key of the same branch).
  const required = C.fieldsFor(profile).filter(d => !d.form && C.isRequired(d, profile) && d.key in facts && d.key !== 'epc_unique_code').map(d => d.key);
  const notCaught = [];
  for (const key of required) {
    const partial = Object.assign({}, facts); delete partial[key];
    const [{ m: mm }] = await q('select zfind_compliance_profile_missing($1, $2::jsonb) as m', [profile, JSON.stringify(partial)]);
    // Like fr_residential_sale_v1, the programme neuf SQL check lets an ABSENT « prix honoraires inclus » through
    // (strict subset of the v2 checks); the form requires it.
    const lenient = profile === C.NEW_DEV && key === 'price_includes_agency_fees';
    if (lenient ? !C.validateFacts(profile, partial).errors[key] : (!mm.length || JSON.stringify(mm) !== JSON.stringify(C.sqlMissing(profile, partial)))) notCaught.push({ key, mm });
  }
  check(`${profile}: each of the ${required.length} required facts, when removed, is reported (SQL = browser; form for absent booleans the SQL tolerates)`, notCaught.length === 0 && required.length > 0, notCaught);
}
check('Flandre: without the unique code the full address in the ad is accepted, otherwise the code is required',
  C.sqlMissing(C.VLA_RENT, Object.assign({}, validFacts[C.VLA_RENT])).length === 0
  && JSON.stringify(C.sqlMissing(C.VLA_RENT, Object.assign({}, validFacts[C.VLA_RENT], { epc_address_in_ad: false }))) === '["epc_unique_code"]');
check('Flandre: unbuilt plot → no G-score required', C.sqlMissing(C.VLA_SALE, Object.assign({}, validFacts[C.VLA_SALE], { plot_is_built: false, flood_g_score: undefined })).length === 0);
check('tertiary DPE: classes up to I accepted, energy costs not required; logement DPE: H refused',
  C.sqlMissing(C.COM_SALE, Object.assign({}, validFacts[C.COM_SALE], { dpe_energy_class: 'I' })).length === 0 && C.sqlMissing(C.SALE, { dpe_status: 'available', dpe_energy_class: 'H' }).includes('dpe_energy_class'));

/* ---------- 6. the RPCs, with the exact argument names the apps send ---------- */
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('test.uid', '${uid || ''}', false);`); try { return await fn(); } finally { await db.exec('reset role'); } };
const lit = v => v === null ? 'null' : Array.isArray(v) ? `array[${v.map(x => `'${x}'`).join(',')}]::uuid[]` : typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : `'${String(v).replace(/'/g, "''")}'`;
const sent = [];
C._setClientModuleForTests({
  getSupabaseClient: () => ({ rpc: async (name, args) => {
    sent.push({ name, args });
    const call = `public.${name}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(', ')})`;
    try {
      const setReturning = ['zfind_list_listing_compliance_status', 'zfind_admin_list_listing_compliance'].includes(name);
      const rows = await q(setReturning ? `select * from ${call}` : `select ${call} as r`);
      return { data: setReturning ? rows : rows[0].r, error: null, status: 200 };
    } catch (e) { return { data: null, error: { message: e.message, code: e.code }, status: 400 }; }
  } }),
  safeQuery: async (fn, context) => { const r = await fn(); return r.error ? { data: null, error: { type: 'malformed_response', context, message: r.error.message } } : { data: r.data, error: null }; }
});

const saleFacts = C.buildFacts(C.SALE, { dpe_status: 'available', dpe_energy_class: 'G', ghg_class: 'E', energy_cost_min: '1 200', energy_cost_max: '1 700', energy_cost_reference_year: '2023',
  fees_payer: 'buyer', agency_fees_amount: '15 000', price_includes_agency_fees: 'true', is_condominium: 'true', condominium_lots_count: '24', annual_condominium_charges: '1 800',
  condominium_procedure_choice: 'none', georisques_disclosure: true, surface_carrez_sqm: '64,2' });
const rentFacts = C.buildFacts(C.RENT, { dpe_status: 'exempt', dpe_exemption_reason: 'Monument historique', fees_payer: 'shared', agency_fees_amount: '900', surface_habitable_sqm: '48',
  monthly_rent_excl_charges: '1 250', monthly_charges: '100', charges_recovery_method: 'provision', deposit_amount: '1 250', tenant_fees_amount: '480', inventory_fees_amount: '144',
  furnished: 'false', rent_control_status: 'not_applicable', georisques_disclosure: true });
check('form facts are valid for both residential profiles (DPE G included)', C.validateFacts(C.SALE, saleFacts).valid && C.validateFacts(C.RENT, rentFacts).valid);

let r = await as(U_PA, () => C.getListingCompliance(ids.sale));
check('partner reads its FR sale listing: unreviewed, profile sale, FR', !r.error && r.data.review_status === 'unreviewed' && r.data.profile === C.SALE && r.data.jurisdiction_iso === 'FR', r);
r = await as(U_PB, () => C.getListingCompliance(ids.sale));
check('another partner is refused, in French', r.error && C.describeError(r.error) === 'Vous n’avez pas accès aux mentions de cette annonce.', r);
r = await as(U_PA, () => C.saveListingCompliance(ids.sale, saleFacts, { channel: 'partner_panel' }));
check('partner save → pending, facts valid, returned payload has the get shape', !r.error && r.data.review_status === 'pending' && r.data.validation.facts_valid === true && r.data.facts.agency_fees_amount === 15000, r);
r = await as(U_PA, () => C.saveListingCompliance(ids.rent, { georisques_disclosure: true }, {}));
check('a partial save is stored as pending but not valid', !r.error && r.data.review_status === 'pending' && r.data.validation.facts_valid === false);
r = await as(U_PA, () => C.listStatuses([ids.sale, ids.rent, ids.bruSale, ids.dev, ids.other, ids.beUnknown, ids.luRent]));
const st = Object.fromEntries((r.data || []).map(x => [x.listing_id, x]));
check('partner statuses: own listings only (other agency skipped)', !r.error && r.data.length === 6 && !st[ids.other], r);
check('statusOf: sale pending+valid → « En attente de validation Z Find »', C.statusOf(st[ids.sale]).label === 'En attente de validation Z Find');
check('statusOf: rent pending+incomplete → « À compléter »', C.statusOf(st[ids.rent]).label === 'À compléter');
check('statusOf: BE and LU listings now get a badge (« À compléter »)', C.statusOf(st[ids.bruSale]).code === 'todo' && st[ids.bruSale].profile === C.BRU_SALE && C.statusOf(st[ids.luRent]).code === 'todo');
check('statusOf: FR programme → covered (fr_new_development_sale_v1)', st[ids.dev].profile === C.NEW_DEV && C.statusOf(st[ids.dev]).code === 'todo');
check('statusOf: Belgian listing without region → « Région à préciser »', C.statusOf(st[ids.beUnknown]).label === 'Région à préciser');
r = await as(U_PA, () => C.adminQueue('pending'));
check('partner cannot read the admin queue (French message)', r.error && C.describeError(r.error) === 'Action réservée à l’équipe Z Find.', r);
r = await as(ADM, () => C.adminQueue('pending'));
const row = (r.data || []).find(x => x.listing_id === ids.sale);
check('admin queue: pending rows with agency, title, commune, reference', !r.error && r.data.length === 2 && row && row.partner_name === 'Agence du Lac' && row.title === 'Annonce sale' && row.commune === 'Évian-les-Bains' && row.agency_reference === 'REF-1' && row.facts_valid === true, r);
r = await as(U_PA, () => C.reviewListingCompliance(ids.sale, 'approved', null));
check('partner cannot review', r.error && /Admin role required/.test(r.error.message));
r = await as(ADM, () => C.reviewListingCompliance(ids.rent, 'approved', null));
check('admin cannot approve incomplete facts; French message lists what is missing', r.error && /^Validation impossible : mentions incomplètes — charge des honoraires/.test(C.describeError(r.error)), r);
r = await as(ADM, () => C.reviewListingCompliance(ids.rent, 'rejected', 'DPE manquant'));
check('admin refuses with a reason → « Refusé — motif : DPE manquant »', !r.error && C.statusOf({ ...r.data, facts_valid: false }).long === 'Refusé — motif : DPE manquant', r);
r = await as(U_PA, () => C.saveListingCompliance(ids.rent, rentFacts, { channel: 'partner_panel' }));
check('partner corrects after refusal → pending again, note cleared', !r.error && r.data.review_status === 'pending' && r.data.review_note === null && r.data.validation.facts_valid === true, r);

/* ---------- 7. the publish gate: FR, BE, LU ---------- */
const publish = async id => { try { await db.query(`update listings set status = 'published' where id = $1`, [id]); return null; } catch (e) { return e.message; } };
err = await publish(ids.sale);
check('FR logement: publishing before approval is blocked by the trigger', /France Listing compliance gate failed/.test(err || ''), err);
check('… and the Admin sees it in French', /^Publication bloquée : les mentions obligatoires \(France\) n’ont pas encore été validées/.test(C.describeError({ message: err })));
r = await as(ADM, () => C.reviewListingCompliance(ids.sale, 'approved', ''));
check('admin approves the sale (empty note stored as null)', !r.error && r.data.review_status === 'approved' && r.data.review_note === null && r.data.assessment.compliant === true, r);
err = await publish(ids.sale);
check('after approval the same publication passes', err === null, err);
r = await as(U_PA, () => C.saveListingCompliance(ids.sale, { ...saleFacts, agency_fees_amount: 1 }, {}));
check('changing approved facts of a published listing is refused, in French', r.error && /^Cette annonce est en ligne/.test(C.describeError(r.error)), r);

const gateCases = [['dev', C.NEW_DEV, 'France'], ['comSale', C.COM_SALE, 'France'], ['comRent', C.COM_RENT, 'France'], ['landSale', C.LAND_SALE, 'France'], ['landRent', C.LAND_RENT, 'France'],
  ['walSale', C.WAL_SALE, 'Belgium'], ['walRent', C.WAL_RENT, 'Belgium'], ['bruSale', C.BRU_SALE, 'Belgium'], ['bruRent', C.BRU_RENT, 'Belgium'], ['vlaSale', C.VLA_SALE, 'Belgium'],
  ['vlaRent', C.VLA_RENT, 'Belgium'], ['luSale', C.LU_SALE, 'Luxembourg'], ['luRent', C.LU_RENT, 'Luxembourg']];
for (const [name, profile, country] of gateCases) {
  const id = ids[name];
  const before = await publish(id);
  const s1 = await as(U_PA, () => C.saveListingCompliance(id, validFacts[profile], { channel: 'partner_panel' }));
  const pending = await publish(id);
  const a = await as(ADM, () => C.reviewListingCompliance(id, 'approved', null));
  const after = await publish(id);
  check(`${name} (${profile}): blocked before approval (${country}), blocked while pending, published after approval`,
    new RegExp(`^${country} Listing compliance gate failed`).test(before || '') && !s1.error && s1.data.profile === profile && s1.data.validation.facts_valid
    && new RegExp(`${country} Listing compliance gate failed: \\["review_approval"\\]`).test(pending || '') && !a.error && after === null,
    { before, s1: s1.error || s1.data.validation, pending, a: a.error, after });
}
check('Belgian gate errors are French for the Admin', /^Publication bloquée : mentions obligatoires \(Belgique\) incomplètes — mentions non enregistrées, certificat PEB ou motif/.test(C.describeError({ message: 'Belgium Listing compliance gate failed: ["compliance_record", "peb_status", "review_approval"]' }))
  && /^Publication bloquée : les mentions obligatoires \(Luxembourg\)/.test(C.describeError({ message: 'Luxembourg Listing compliance gate failed: ["review_approval"]' })));
err = await publish(ids.beUnknown);
check('a Belgian listing whose region is unknown cannot be published', /Belgium Listing compliance gate failed: \["be_region_unresolved", "review_approval"\]/.test(err || ''), err);
await db.query(`insert into representations values ('40000000-0000-0000-0000-0000000009aa','property',$1,null,$2,'active')`, [ids.bruSale_property, PA]);
err = null; try { await db.query(`insert into listings (id, representation_id, status, transaction_type, price_current) values ('50000000-0000-0000-0000-0000000009aa','40000000-0000-0000-0000-0000000009aa','published','sale',1)`); } catch (e) { err = e.message; }
check('a Belgian listing cannot be created directly as published (same rule as France), French message', /Belgium Listings must be created before publication/.test(err || '') && C.describeError({ message: err }) === 'Une annonce en Belgique doit d’abord être créée, complétée et validée avant d’être publiée.', err);
// Legacy published BE listing: facts never approved may be recorded without suspension; it stays online.
r = await as(U_PA, () => C.saveListingCompliance(ids.bePublishedLegacy, validFacts[C.BRU_SALE], { channel: 'partner_panel' }));
check('legacy published BE listing: the agency can record its mentions (pending) without suspending it', !r.error && r.data.review_status === 'pending' && await statusOf(ids.bePublishedLegacy) === 'published', r);
r = await as(ADM, () => C.reviewListingCompliance(ids.bePublishedLegacy, 'approved', null));
r = await as(U_PA, () => C.saveListingCompliance(ids.bePublishedLegacy, Object.assign({}, validFacts[C.BRU_SALE], { peb_co2_kg_m2: 1 }), {}));
check('… once approved, its facts are locked like in France', r.error && /^Cette annonce est en ligne/.test(C.describeError(r.error)), r);
// Suspended → re-published goes through the gate again.
await db.query(`update listings set status = 'suspended' where id = $1`, [ids.vlaPublishedLegacy]);
err = await publish(ids.vlaPublishedLegacy);
check('a legacy BE listing suspended then re-published is gated (transition to published)', /Belgium Listing compliance gate failed/.test(err || ''), err);
// Outside FR / BE / LU: not gated.
await db.exec(`insert into zones_lite values ('20000000-0000-0000-0000-0000000000ee','Porto','Porto','PT',null)`);
const pt = await makeListing('pt', { zone: '20000000-0000-0000-0000-0000000000ee' });
check('a listing outside FR / BE / LU is not gated', await publish(pt) === null);

/* ---------- 8. the argument names the apps send are the SQL parameter names ---------- */
const sig = {};
for (const row of await q(`select p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('zfind_get_listing_compliance','zfind_save_listing_compliance','zfind_admin_review_listing_compliance','zfind_list_listing_compliance_status','zfind_admin_list_listing_compliance')`)) {
  sig[row.proname] = row.args.split(',').map(a => a.trim().split(' ')[0]);
}
const used = {}; sent.forEach(s => { used[s.name] = Object.keys(s.args); });
check('every RPC used exists with exactly these parameter names', Object.keys(used).length === 5 && Object.entries(used).every(([nm, a]) => JSON.stringify(sig[nm]) === JSON.stringify(a)), { used, sig });
const grants = await q(`select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon
  from pg_proc p where p.proname in ('zfind_list_listing_compliance_status','zfind_admin_list_listing_compliance','zfind_save_listing_compliance')`);
check('read / save functions: authenticated only, never anon', grants.length === 3 && grants.every(g => g.auth && !g.anon), grants);
const internal = await q(`select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon, p.prosecdef, p.proconfig
  from pg_proc p where p.proname in ('zfind_be_region','zfind_compliance_profile_missing','zfind_listing_compliance_profile','zfind_validate_listing_compliance_facts','zfind_enforce_listing_compliance_before_publish')`);
check('internal helpers: not executable by anon / authenticated, search_path pinned', internal.length === 5 && internal.every(g => !g.auth && !g.anon && (g.proconfig || []).some(c => /^search_path=/.test(c))), internal);

console.log(`\n${pass} checks passed${process.exitCode ? ' — WITH FAILURES' : ''}`);
