/* ============================================================
   Z FIND — French listing compliance: the browser service against the
   real SQL, on an in-memory Postgres (PGlite) with a Supabase-shaped stub.
   - zfind-web services/listing-compliance.js sqlMissing() must give
     exactly what zfind_validate_listing_compliance_facts returns
     (same keys, same order) over a few thousand generated facts;
   - every RPC the Partner / Admin apps make (exact argument names) runs
     against migrations 20260830112835 (compliance gate) and
     20261009120000 (review queue), as partner, other partner and admin;
   - the publish trigger blocks an FR Listing until the facts are
     approved, and describeError() turns each SQL error into French.
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
const require = createRequire(import.meta.url);
const C = require(path.join(ROOT, 'apps', 'find', 'apps', 'zfind-web', 'src', 'services', 'listing-compliance.js'));

const db = new PGlite();
let pass = 0;
const check = (label, ok, extra) => { if (!ok) { console.error('FAIL:', label, extra === undefined ? '' : JSON.stringify(extra)); process.exitCode = 1; } else { pass++; console.log('PASS:', label); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
grant usage on schema auth, public to authenticated, anon;
create table public.partners (id uuid primary key, name text not null);
create table public.profiles (id uuid primary key, role text not null, partner_id uuid);
create table public.zones_lite (id uuid primary key, name text not null, city text not null, country_iso text not null);
create table public.properties (id uuid primary key, property_class text not null, zone_lite_id uuid, postal_code text, agency_reference text, removed_at timestamptz);
create table public.developments (id uuid primary key, zone_lite_id uuid, removed_at timestamptz);
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
const queueSql = MIG('20261009120000_z_find_listing_compliance_review_queue_v1.sql');
await db.exec(queueSql);
await db.exec(queueSql);
check('compliance gate v2 + review queue migrations apply (queue migration twice: idempotent)', true);

const PA = '10000000-0000-0000-0000-000000000001', PB = '10000000-0000-0000-0000-000000000002';
const U_PA = '00000000-0000-0000-0000-0000000000b1', U_PB = '00000000-0000-0000-0000-0000000000b2', ADM = '00000000-0000-0000-0000-0000000000a1';
const Z_FR = '20000000-0000-0000-0000-000000000001', Z_BE = '20000000-0000-0000-0000-000000000002';
const L = { sale: '50000000-0000-0000-0000-000000000001', rent: '50000000-0000-0000-0000-000000000002', be: '50000000-0000-0000-0000-000000000003', dev: '50000000-0000-0000-0000-000000000004', other: '50000000-0000-0000-0000-000000000005' };
await db.exec(`
insert into partners values ('${PA}','Agence du Lac'),('${PB}','Autre Agence');
insert into profiles values ('${U_PA}','partner_user','${PA}'),('${U_PB}','partner_user','${PB}'),('${ADM}','admin',null);
insert into zones_lite values ('${Z_FR}','Évian-les-Bains','Évian-les-Bains','FR'),('${Z_BE}','Ixelles','Bruxelles','BE');
insert into properties values ('30000000-0000-0000-0000-000000000001','residential','${Z_FR}','74500','EV-001',null),
  ('30000000-0000-0000-0000-000000000002','residential','${Z_FR}','74500','EV-002',null),
  ('30000000-0000-0000-0000-000000000003','residential','${Z_BE}','1050','BX-1',null),
  ('30000000-0000-0000-0000-000000000005','residential','${Z_FR}','74200','TH-9',null);
insert into developments values ('31000000-0000-0000-0000-000000000001','${Z_FR}',null);
insert into representations values ('40000000-0000-0000-0000-000000000001','property','30000000-0000-0000-0000-000000000001',null,'${PA}','active'),
  ('40000000-0000-0000-0000-000000000002','property','30000000-0000-0000-0000-000000000002',null,'${PA}','active'),
  ('40000000-0000-0000-0000-000000000003','property','30000000-0000-0000-0000-000000000003',null,'${PA}','active'),
  ('40000000-0000-0000-0000-000000000004','development',null,'31000000-0000-0000-0000-000000000001','${PA}','active'),
  ('40000000-0000-0000-0000-000000000005','property','30000000-0000-0000-0000-000000000005',null,'${PB}','active');
insert into listings (id, representation_id, transaction_type, price_current) values
  ('${L.sale}','40000000-0000-0000-0000-000000000001','sale',472000), ('${L.rent}','40000000-0000-0000-0000-000000000002','rent',1350),
  ('${L.be}','40000000-0000-0000-0000-000000000003','sale',390000), ('${L.dev}','40000000-0000-0000-0000-000000000004','sale',300000),
  ('${L.other}','40000000-0000-0000-0000-000000000005','sale',250000);
insert into listing_content values ('${L.sale}','fr','T3 vue lac','Bel appartement.'),('${L.rent}','fr','T2 meublé','Location.');
grant select, update on public.listings to authenticated;
`);

/* ---------- 1. differential: JS mirror vs SQL validator ---------- */
let seed = 20261009; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];
const NUM = [0, 1, 12.5, 1800, -1, '100', '', null, true];
const V = {
  georisques_disclosure: [true, true, false, 'true', 1, null], fees_payer: ['seller', 'buyer', 'landlord', 'tenant', 'shared', 'agency', '', 3, null],
  dpe_status: ['available', 'exempt', 'available', 'exempt', 'other', '', null, 1], dpe_energy_class: ['A', 'g', 'D', 'H', '', 'A+', 3, null],
  ghg_class: ['B', 'f', 'Z', '', null, true], energy_cost_reference_year: ['2023', ' ', '', 2023, null], dpe_exemption_reason: ['Monument historique', '  ', '', 5, null],
  condominium_procedure_status: ['Aucune procédure en cours', '', ' ', 1, null], charges_recovery_method: ['provision', 'forfait', 'none', 'other', '', null],
  rent_control_status: ['applicable', 'not_applicable', 'applicable', 'yes', '', null], price_includes_agency_fees: [true, false, 'true', 0, null],
  is_condominium: [true, false, true, 'true', 1, null], furnished: [true, false, 'false', 1, null]
};
const KEYS = ['georisques_disclosure', 'fees_payer', 'agency_fees_amount', 'dpe_status', 'dpe_energy_class', 'ghg_class', 'energy_cost_min', 'energy_cost_max', 'energy_cost_reference_year', 'dpe_exemption_reason', 'price_includes_agency_fees', 'is_condominium', 'condominium_lots_count', 'annual_condominium_charges', 'condominium_procedure_status', 'surface_habitable_sqm', 'monthly_rent_excl_charges', 'monthly_charges', 'charges_recovery_method', 'deposit_amount', 'tenant_fees_amount', 'inventory_fees_amount', 'furnished', 'rent_control_status', 'reference_rent', 'increased_reference_rent', 'rent_supplement_amount'];
await db.exec(`insert into zfind_listing_compliance (listing_id, facts) values ('${L.sale}','{}'),('${L.rent}','{}')`);
let total = 0, mismatches = 0, unsafe = 0; const firstMismatch = [];
for (const [listingId, profile] of [[L.sale, C.SALE], [L.rent, C.RENT]]) {
  for (let i = 0; i < 1200; i++) {
    const facts = {}; const density = rnd() < 0.8 ? 0.9 : 0.45;
    KEYS.forEach(k => { if (rnd() < density) facts[k] = pick(V[k] || NUM); });
    if (rnd() < 0.2) { facts.energy_cost_min = 2000; facts.energy_cost_max = 1500; }
    await db.query('update zfind_listing_compliance set facts = $2::jsonb where listing_id = $1', [listingId, JSON.stringify(facts)]);
    const [{ v }] = await q('select zfind_validate_listing_compliance_facts($1) as v', [listingId]);
    const js = C.sqlMissing(profile, facts);
    total++;
    if (v.profile !== profile || JSON.stringify(js) !== JSON.stringify(v.missing)) { mismatches++; if (firstMismatch.length < 3) firstMismatch.push({ facts, sql: v.missing, js }); }
    if (C.validateFacts(profile, facts).valid && v.missing.length) unsafe++;
  }
}
check(`sqlMissing() == zfind_validate_listing_compliance_facts on ${total} generated facts`, mismatches === 0, firstMismatch);
check('validateFacts() never accepts facts the SQL validator rejects', unsafe === 0, unsafe);
await db.exec('delete from zfind_listing_compliance');

/* ---------- 2. the RPCs, with the exact argument names the apps send ---------- */
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('test.uid', '${uid || ''}', false);`); try { return await fn(); } finally { await db.exec('reset role'); } };
// The browser calls supabase.rpc(name, args) through safeQuery: route that to PGlite with named arguments.
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

const saleFacts = C.buildFacts(C.SALE, { dpe_status: 'available', dpe_energy_class: 'D', ghg_class: 'E', energy_cost_min: '1 200', energy_cost_max: '1 700', energy_cost_reference_year: '2023',
  fees_payer: 'buyer', agency_fees_amount: '15 000', price_includes_agency_fees: 'true', is_condominium: 'true', condominium_lots_count: '24', annual_condominium_charges: '1 800',
  condominium_procedure_choice: 'none', georisques_disclosure: true, surface_carrez_sqm: '64,2' });
const rentFacts = C.buildFacts(C.RENT, { dpe_status: 'exempt', dpe_exemption_reason: 'Monument historique', fees_payer: 'shared', agency_fees_amount: '900', surface_habitable_sqm: '48',
  monthly_rent_excl_charges: '1 250', monthly_charges: '100', charges_recovery_method: 'provision', deposit_amount: '1 250', tenant_fees_amount: '480', inventory_fees_amount: '144',
  furnished: 'false', rent_control_status: 'not_applicable', georisques_disclosure: true });
check('form facts are valid for both profiles', C.validateFacts(C.SALE, saleFacts).valid && C.validateFacts(C.RENT, rentFacts).valid);

let r = await as(U_PA, () => C.getListingCompliance(L.sale));
check('partner reads its FR sale listing: unreviewed, profile sale, FR', !r.error && r.data.review_status === 'unreviewed' && r.data.profile === C.SALE && r.data.jurisdiction_iso === 'FR', r);
r = await as(U_PB, () => C.getListingCompliance(L.sale));
check('another partner is refused, in French', r.error && C.describeError(r.error) === 'Vous n’avez pas accès aux mentions de cette annonce.', r);
r = await as(U_PA, () => C.saveListingCompliance(L.sale, saleFacts, { channel: 'partner_panel' }));
check('partner save → pending, facts valid, returned payload has the get shape', !r.error && r.data.review_status === 'pending' && r.data.validation.facts_valid === true && r.data.facts.agency_fees_amount === 15000, r);
r = await as(U_PA, () => C.saveListingCompliance(L.rent, { georisques_disclosure: true }, {}));
check('a partial save is stored as pending but not valid', !r.error && r.data.review_status === 'pending' && r.data.validation.facts_valid === false);
r = await as(U_PA, () => C.listStatuses([L.sale, L.rent, L.be, L.dev, L.other]));
const st = Object.fromEntries((r.data || []).map(x => [x.listing_id, x]));
check('partner statuses: own listings only (other agency skipped)', !r.error && r.data.length === 4 && !st[L.other], r);
check('statusOf: sale pending+valid → « En attente de validation Z Find »', C.statusOf(st[L.sale]).label === 'En attente de validation Z Find');
check('statusOf: rent pending+incomplete → « À compléter »', C.statusOf(st[L.rent]).label === 'À compléter');
check('statusOf: BE listing → no badge', C.statusOf(st[L.be]) === null && st[L.be].jurisdiction_iso === 'BE');
check('statusOf: FR development → « Non couvert »', C.statusOf(st[L.dev]).code === 'unsupported' && st[L.dev].profile === null);
r = await as(U_PA, () => C.adminQueue('pending'));
check('partner cannot read the admin queue (French message)', r.error && C.describeError(r.error) === 'Action réservée à l’équipe Z Find.', r);
r = await as(ADM, () => C.adminQueue('pending'));
const row = (r.data || []).find(x => x.listing_id === L.sale);
check('admin queue: pending rows with agency, title, commune, postcode, reference', !r.error && r.data.length === 2 && row && row.partner_name === 'Agence du Lac' && row.title === 'T3 vue lac' && row.commune === 'Évian-les-Bains' && row.postal_code === '74500' && row.agency_reference === 'EV-001' && row.facts_valid === true, r);
r = await as(ADM, () => C.adminQueue(null, L.rent));
check('admin queue by listing id (detail view)', !r.error && r.data.length === 1 && r.data[0].listing_id === L.rent);
r = await as(U_PA, () => C.reviewListingCompliance(L.sale, 'approved', null));
check('partner cannot review', r.error && /Admin role required/.test(r.error.message));
r = await as(ADM, () => C.reviewListingCompliance(L.rent, 'approved', null));
check('admin cannot approve incomplete facts; French message lists what is missing', r.error && /^Validation impossible : mentions incomplètes — charge des honoraires/.test(C.describeError(r.error)), r);
r = await as(ADM, () => C.reviewListingCompliance(L.rent, 'rejected', 'DPE manquant'));
check('admin refuses with a reason → « Refusé — motif : DPE manquant »', !r.error && C.statusOf({ ...r.data, facts_valid: false }).long === 'Refusé — motif : DPE manquant', r);
r = await as(U_PA, () => C.saveListingCompliance(L.rent, rentFacts, { channel: 'partner_panel' }));
check('partner corrects after refusal → pending again, note cleared', !r.error && r.data.review_status === 'pending' && r.data.review_note === null && r.data.validation.facts_valid === true, r);

/* ---------- 3. the publish gate ---------- */
const publish = async id => { try { await db.query(`update listings set status = 'published' where id = $1`, [id]); return null; } catch (e) { return e.message; } };
let err = await publish(L.sale);
check('publishing before approval is blocked by the trigger', /France Listing compliance gate failed/.test(err || ''), err);
check('… and the Admin sees it in French', /^Publication bloquée : les mentions obligatoires \(France\) n’ont pas encore été validées/.test(C.describeError({ message: err })));
r = await as(ADM, () => C.reviewListingCompliance(L.sale, 'approved', ''));
check('admin approves the sale (empty note stored as null)', !r.error && r.data.review_status === 'approved' && r.data.review_note === null && r.data.assessment.compliant === true, r);
err = await publish(L.sale);
check('after approval the same publication passes', err === null, err);
r = await as(U_PA, () => C.saveListingCompliance(L.sale, { ...saleFacts, agency_fees_amount: 1 }, {}));
check('changing approved facts of a published listing is refused, in French', r.error && /^Cette annonce est en ligne/.test(C.describeError(r.error)), r);
err = await publish(L.be);
check('BE listing is not gated (France-only rule)', err === null, err);

/* ---------- 4. the argument names the apps send are the SQL parameter names ---------- */
const sig = {};
for (const row of await q(`select p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('zfind_get_listing_compliance','zfind_save_listing_compliance','zfind_admin_review_listing_compliance','zfind_list_listing_compliance_status','zfind_admin_list_listing_compliance')`)) {
  sig[row.proname] = row.args.split(',').map(a => a.trim().split(' ')[0]);
}
const used = {}; sent.forEach(s => { used[s.name] = Object.keys(s.args); });
check('every RPC used exists with exactly these parameter names', Object.keys(used).length === 5 && Object.entries(used).every(([n, a]) => JSON.stringify(sig[n]) === JSON.stringify(a)), { used, sig });
const grants = await q(`select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon
  from pg_proc p where p.proname in ('zfind_list_listing_compliance_status','zfind_admin_list_listing_compliance')`);
check('new read functions: authenticated only, never anon', grants.length === 2 && grants.every(g => g.auth && !g.anon), grants);

console.log(`\n${pass} checks passed${process.exitCode ? ' — WITH FAILURES' : ''}`);
