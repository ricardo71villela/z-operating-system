/* ============================================================
   Z FIND — « Soumettre à validation » (Partner) and « Renvoyer en
   brouillon » / bulk review (Admin), on an in-memory Postgres (PGlite)
   with a Supabase-shaped stub.
   SQL under test, applied as it is:
   - migration 20261009180000_z_find_partner_listing_submission_v1 (twice:
     idempotent, and once more after data exists);
   - migrations 20260830112835 (compliance gate) and 20261009120000;
   - extracted unchanged from earlier migrations: zfind_admin_transition_listing
     (20260813193750), zfind_partner_controls_listing (20260813213456,
     the Partner authorization every partner command uses) and the
     Listing lifecycle history table + trigger (20260812135037).
   The REAL browser module zfind-web services/listing-submission.js runs
   against it: precheck() == SQL readiness on generated states, its RPC
   argument names, French errors, and the Admin bulk runner + summary.
   Run:  npm i --no-save @electric-sql/pglite && node tests/sql/partner-submit.test.mjs
   (verified with @electric-sql/pglite 0.5.8; ZOS_ROOT=<repo> lets it run from another folder)
   ============================================================ */
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const ROOT = process.env.ZOS_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const MIG = name => fs.readFileSync(path.join(ROOT, 'infrastructure', 'supabase', 'migrations', name), 'utf8');
const SUBMIT_MIG = '20261009180000_z_find_partner_listing_submission_v1.sql';
const require = createRequire(import.meta.url);
const S = require(path.join(ROOT, 'apps', 'find', 'apps', 'zfind-web', 'src', 'services', 'listing-submission.js'));
const C = require(path.join(ROOT, 'apps', 'find', 'apps', 'zfind-web', 'src', 'services', 'listing-compliance.js'));

const db = new PGlite();
let pass = 0;
const check = (label, ok, extra) => { if (!ok) { console.error('FAIL:', label, extra === undefined ? '' : JSON.stringify(extra, null, 1)); process.exitCode = 1; } else { pass++; console.log('PASS:', label); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const extract = (sql, startMarker, endMarker) => { const s = sql.indexOf(startMarker); if (s < 0) throw new Error('marker not found: ' + startMarker); return sql.slice(s, sql.indexOf(endMarker, s) + endMarker.length); };

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create table auth.users (id uuid primary key, email text);
grant usage on schema auth, public to authenticated, anon, service_role;
create table public.partners (id uuid primary key, name text not null, status text not null default 'active');
create table public.profiles (id uuid primary key, role text not null, partner_id uuid);
create table public.zfind_partner_signups (id uuid primary key default gen_random_uuid(), partner_id uuid, email text, status text not null default 'verified');
create table public.zones_lite (id uuid primary key, name text not null, city text not null, country_iso text not null);
create table public.properties (id uuid primary key, property_class text not null, zone_lite_id uuid, postal_code text, agency_reference text, removed_at timestamptz);
create table public.developments (id uuid primary key, zone_lite_id uuid, removed_at timestamptz);
create table public.representations (id uuid primary key, target_type text not null, property_id uuid, development_id uuid, partner_id uuid not null, status text not null);
create table public.listings (id uuid primary key, representation_id uuid not null references public.representations(id),
  status text not null default 'draft' check (status in ('draft','incomplete','pending_review','ready','published','suspended','archived')),
  transaction_type text not null default 'sale', price_current numeric not null default 0, currency_iso text not null default 'EUR', created_at timestamptz not null default now());
create table public.listing_content (listing_id uuid references public.listings(id), locale text, title text not null, description text, primary key (listing_id, locale));
create table public.listing_media (media_asset_id uuid not null, listing_id uuid not null references public.listings(id), position int not null default 0, is_cover boolean not null default false, primary key (media_asset_id, listing_id));
create table public.development_media (media_asset_id uuid not null, development_id uuid not null references public.developments(id), position int not null default 0, is_cover boolean not null default false, primary key (media_asset_id, development_id));
create function public.zfind_public_listing_visible(p_listing_id uuid) returns boolean language sql stable as $$ select true $$;
-- Real schema: authenticated reads its rows through RLS and may UPDATE only commercial columns (never status).
grant select on public.listings to authenticated;
grant update (price_current, currency_iso) on public.listings to authenticated;
`);
// Listing lifecycle history (who / when of every status change), unchanged.
await db.exec(extract(MIG('20260812135037_z_find_database_convergence_v1.sql'), 'create schema if not exists find;', "  'Z Find domain-owned database schema. Canonical ZOS Identity, Registry, Geography, Observations and transport remain in their authoritative Core schemas.';"));
await db.exec(extract(MIG('20260812135037_z_find_database_convergence_v1.sql'), 'create table find.listing_state_history (', "  'Append-style Z Find Listing lifecycle history. Listing lifecycle remains distinct from Representation and Verification lifecycle.';"));
// The canonical Partner ownership check, unchanged.
await db.exec(extract(MIG('20260813213456_z_find_partner_content_media_boundary_v1.sql'), 'create or replace function public.zfind_partner_controls_listing(', '$$;'));
await db.exec('grant execute on function public.zfind_partner_controls_listing(uuid) to authenticated');
// The Admin Listing state machine, unchanged.
await db.exec(extract(MIG('20260813193750_z_find_marketplace_lifecycle_hardening_v1.sql'), 'create or replace function public.zfind_admin_transition_listing(', '$$;'));
await db.exec('revoke all on function public.zfind_admin_transition_listing(uuid, text) from public; grant execute on function public.zfind_admin_transition_listing(uuid, text) to authenticated');
await db.exec(MIG('20260830112835_z_find_global_listing_compliance_launch_v2.sql'));
await db.exec(MIG('20261009120000_z_find_listing_compliance_review_queue_v1.sql'));
const submitSql = MIG(SUBMIT_MIG);
await db.exec(submitSql);
await db.exec(submitSql);
check('submission migration applies on top of the real lifecycle / ownership / compliance SQL, twice (idempotent)', true);

/* ---------------- fixtures ---------------- */
const PA = '10000000-0000-0000-0000-000000000001', PB = '10000000-0000-0000-0000-000000000002';
const U_PA = '00000000-0000-0000-0000-0000000000b1', U_PB = '00000000-0000-0000-0000-0000000000b2', ADM = '00000000-0000-0000-0000-0000000000a1';
const Z_FR = '20000000-0000-0000-0000-000000000001', Z_BE = '20000000-0000-0000-0000-000000000002';
const id = n => `50000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const L = { sale: id(1), be: id(2), dev: id(3), other: id(4), nocommune: id(5), rent: id(6), pub: id(7) };
await db.exec(`
insert into partners (id, name) values ('${PA}','Agence du Lac'),('${PB}','Autre Agence');
insert into profiles values ('${U_PA}','partner_user','${PA}'),('${U_PB}','partner_user','${PB}'),('${ADM}','admin',null);
insert into auth.users values ('${U_PA}','Agent@Lac-Immo.fr'),('${U_PB}','b@autre.fr'),('${ADM}','admin@zfind.online');
insert into zfind_partner_signups (partner_id, email) values ('${PA}','contact@lac-immo.fr');
insert into zones_lite values ('${Z_FR}','Évian-les-Bains','Évian-les-Bains','FR'),('${Z_BE}','Ixelles','Bruxelles','BE');
insert into properties values ('30000000-0000-0000-0000-000000000001','residential','${Z_FR}','74500','EV-001',null),
  ('30000000-0000-0000-0000-000000000002','residential','${Z_BE}','1050','BX-1',null),
  ('30000000-0000-0000-0000-000000000004','residential','${Z_FR}','74200','TH-9',null),
  ('30000000-0000-0000-0000-000000000005','residential',null,null,'X-5',null),
  ('30000000-0000-0000-0000-000000000006','residential','${Z_FR}','74500','EV-006',null),
  ('30000000-0000-0000-0000-000000000007','residential','${Z_FR}','74500','EV-007',null);
insert into developments values ('31000000-0000-0000-0000-000000000001','${Z_FR}',null);
insert into representations values ('40000000-0000-0000-0000-000000000001','property','30000000-0000-0000-0000-000000000001',null,'${PA}','active'),
  ('40000000-0000-0000-0000-000000000002','property','30000000-0000-0000-0000-000000000002',null,'${PA}','proposed'),
  ('40000000-0000-0000-0000-000000000003','development',null,'31000000-0000-0000-0000-000000000001','${PA}','proposed'),
  ('40000000-0000-0000-0000-000000000004','property','30000000-0000-0000-0000-000000000004',null,'${PB}','active'),
  ('40000000-0000-0000-0000-000000000005','property','30000000-0000-0000-0000-000000000005',null,'${PA}','proposed'),
  ('40000000-0000-0000-0000-000000000006','property','30000000-0000-0000-0000-000000000006',null,'${PA}','active'),
  ('40000000-0000-0000-0000-000000000007','property','30000000-0000-0000-0000-000000000007',null,'${PA}','active');
insert into listings (id, representation_id, transaction_type, price_current) values
  ('${L.sale}','40000000-0000-0000-0000-000000000001','sale',0), ('${L.be}','40000000-0000-0000-0000-000000000002','sale',390000),
  ('${L.dev}','40000000-0000-0000-0000-000000000003','sale',300000), ('${L.other}','40000000-0000-0000-0000-000000000004','sale',250000),
  ('${L.nocommune}','40000000-0000-0000-0000-000000000005','sale',100000), ('${L.rent}','40000000-0000-0000-0000-000000000006','rent',1350),
  ('${L.pub}','40000000-0000-0000-0000-000000000007','sale',520000);
`);

const as = async (uid, fn, role) => { await db.exec(`set role ${role || 'authenticated'}; select set_config('test.uid', '${uid || ''}', false);`); try { return await fn(); } finally { await db.exec('reset role'); } };
const tryq = async (sql, params) => { try { return { rows: await q(sql, params) }; } catch (e) { return { error: e }; } };
const status = async lid => (await q('select status from listings where id = $1', [lid]))[0].status;
const sqlMissing = async lid => (await q('select public.zfind_listing_submission_missing($1) as m', [lid]))[0].m;
const history = async lid => q('select from_status, to_status, actor_profile_id from find.listing_state_history where listing_id = $1 and from_status is not null order by recorded_at, id', [lid]);

/* ---------------- 1. the browser service against PGlite ---------------- */
const lit = v => v === null || v === undefined ? 'null' : Array.isArray(v) ? `array[${v.map(x => `'${x}'`).join(',')}]::uuid[]` : typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : `'${String(v).replace(/'/g, "''")}'`;
const sent = [];
const client = { rpc: async (name, args) => {
  sent.push({ name, args });
  const call = `public.${name}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(', ')})`;
  try {
    const setReturning = ['zfind_list_listing_submission_status', 'zfind_list_listing_compliance_status', 'zfind_admin_list_listing_compliance'].includes(name);
    const rows = await q(setReturning ? `select * from ${call}` : `select ${call} as r`);
    return { data: setReturning ? rows : rows[0].r, error: null, status: 200 };
  } catch (e) { return { data: null, error: { message: e.message, code: e.code }, status: 400 }; }
} };
const stub = { getSupabaseClient: () => client, safeQuery: async (fn, context) => { const r = await fn(); return r.error ? { data: null, error: { type: 'malformed_response', context, message: r.error.message, code: r.error.code } } : { data: r.data, error: null }; } };
S._setClientModuleForTests(stub);
C._setClientModuleForTests(stub);

/* ---------------- 2. readiness: nothing yet ---------------- */
let r = await as(U_PA, () => S.submitListing(L.sale));
check('empty FR draft: refused, French message listing everything missing', r.error && r.error.code === '55000'
  && S.describeError(r.error) === 'Soumission impossible. Il manque : un titre en français, une description en français, un prix supérieur à 0, au moins une photo, les mentions obligatoires (France) complètes et enregistrées.', r);
check('… message parsed back to the same codes as the SQL check', JSON.stringify(S.missingFromMessage(r.error.message)) === JSON.stringify(await sqlMissing(L.sale)));
check('… and still a draft', await status(L.sale) === 'draft');
r = await as(U_PA, () => S.submitListing(L.nocommune));
check('no commune → « la commune du bien » first', r.error && /^Soumission impossible\. Il manque : la commune du bien, un titre/.test(r.error.message), r);
r = await as(U_PA, () => S.submitListing(L.dev));
check('FR development (not covered by the French profiles) → refused: type de bien non couvert', r.error && r.error.message.includes('un type de bien couvert en France') && r.error.message.includes('au moins une photo'), r);

/* ---------------- 3. differential: JS precheck == SQL readiness ---------------- */
// State space for the FR sale listing: commune, fr title, fr description, price, photo, compliance (none / invalid / valid pending / valid rejected / valid approved).
const VALID_SALE = C.buildFacts(C.SALE, { dpe_status: 'available', dpe_energy_class: 'D', ghg_class: 'E', energy_cost_min: '1200', energy_cost_max: '1700', energy_cost_reference_year: '2023',
  fees_payer: 'buyer', agency_fees_amount: '15000', price_includes_agency_fees: 'true', is_condominium: 'false', georisques_disclosure: true });
let total = 0; const mismatches = [];
for (let mask = 0; mask < 32 * 5; mask++) {
  const bits = mask % 32, comp = Math.floor(mask / 32);
  await db.exec(`
    update properties set zone_lite_id = ${bits & 1 ? `'${Z_FR}'` : 'null'} where id = '30000000-0000-0000-0000-000000000001';
    delete from listing_content where listing_id = '${L.sale}';
    ${bits & 2 || bits & 4 ? `insert into listing_content values ('${L.sale}','fr','${bits & 2 ? 'T3 vue lac' : ' '}', ${bits & 4 ? "'Bel appartement.'" : "'  '"});` : ''}
    insert into listing_content values ('${L.sale}','en','Lake view flat','Nice flat.');
    update listings set price_current = ${bits & 8 ? 472000 : 0} where id = '${L.sale}';
    delete from listing_media where listing_id = '${L.sale}';
    ${bits & 16 ? `insert into listing_media values (gen_random_uuid(), '${L.sale}', 0, true);` : ''}
    delete from zfind_listing_compliance where listing_id = '${L.sale}';
    ${comp === 1 ? `insert into zfind_listing_compliance (listing_id, facts, review_status) values ('${L.sale}', '{"georisques_disclosure": true}', 'pending');` : ''}
    ${comp >= 2 ? `insert into zfind_listing_compliance (listing_id, facts, review_status) values ('${L.sale}', '${JSON.stringify(VALID_SALE)}', '${['pending', 'rejected', 'approved'][comp - 2]}');` : ''}
  `);
  const sql = await sqlMissing(L.sale);
  const [{ v }] = await q('select public.zfind_validate_listing_compliance_facts($1) as v', [L.sale]);
  const [{ rs }] = await q('select coalesce((select review_status from zfind_listing_compliance where listing_id = $1), \'unreviewed\') as rs', [L.sale]);
  const js = S.precheck({ jurisdiction: bits & 1 ? 'FR' : null, frTitle: bits & 2 ? 'T3 vue lac' : ' ', frDescription: bits & 4 ? 'Bel appartement.' : '  ',
    priceCurrent: bits & 8 ? 472000 : 0, photoCount: bits & 16 ? 1 : 0, complianceProfile: bits & 1 ? C.SALE : null, factsValid: !!v.facts_valid, reviewStatus: rs });
  total++;
  if (JSON.stringify(js) !== JSON.stringify(sql) && mismatches.length < 3) mismatches.push({ mask, sql, js });
  if (JSON.stringify(js) !== JSON.stringify(sql)) mismatches.total = (mismatches.total || 0) + 1;
}
check(`precheck() == zfind_listing_submission_missing on ${total} generated states (commune, FR texts, price, photo, compliance)`, mismatches.length === 0, mismatches);
const [{ t }] = await q(`select public.zfind_listing_submission_missing_text(array['commune','title_fr','description_fr','price','photo','compliance_unsupported','compliance_facts','compliance_rejected']) as t`);
check('missingText() == SQL French phrases (same text, same order)', t === S.missingText(['commune', 'title_fr', 'description_fr', 'price', 'photo', 'compliance_unsupported', 'compliance_facts', 'compliance_rejected']), t);
check('checklist(): six items for France, compliance item reflects the refusal', (() => { const c = S.checklist({ jurisdiction: 'FR', frTitle: 'a', frDescription: 'b', priceCurrent: 1, photoCount: 1, complianceProfile: C.SALE, factsValid: true, reviewStatus: 'rejected' }); return c.length === 6 && c[5].code === 'compliance_rejected' && !c[5].ok && c.slice(0, 5).every(x => x.ok); })());

/* ---------------- 4. owner partner submits ---------------- */
// Ready state: everything present, facts saved by the partner (pending, NOT approved).
await db.exec(`
  update properties set zone_lite_id = '${Z_FR}' where id = '30000000-0000-0000-0000-000000000001';
  delete from listing_content where listing_id = '${L.sale}'; insert into listing_content values ('${L.sale}','fr','T3 vue lac','Bel appartement.');
  update listings set price_current = 472000 where id = '${L.sale}';
  delete from listing_media where listing_id = '${L.sale}'; insert into listing_media values (gen_random_uuid(), '${L.sale}', 0, true);
  delete from zfind_listing_compliance where listing_id = '${L.sale}';`);
r = await as(U_PA, () => C.saveListingCompliance(L.sale, VALID_SALE, { channel: 'partner_panel' }));
check('partner saves the mentions → pending (not approved)', !r.error && r.data.review_status === 'pending');
r = await as(U_PB, () => S.submitListing(L.sale));
check('another agency’s partner cannot submit (French 42501), listing unchanged', r.error && r.error.code === '42501' && S.describeError(r.error) === 'Accès refusé : cette annonce n’est pas gérée par votre agence.' && await status(L.sale) === 'draft', r);
r = await as(ADM, () => S.submitListing(L.sale));
check('an Admin account is not a partner: refused too', r.error && r.error.code === '42501');
r = await as(null, () => S.submitListing(L.sale));
check('no session: refused', r.error && r.error.code === '42501');
r = await as(U_PA, () => S.submitListing(L.sale));
check('owner partner: draft → pending_review (mentions saved, not yet approved)', !r.error && r.data.status === 'pending_review' && await status(L.sale) === 'pending_review', r);
let h = await history(L.sale);
check('history: draft → pending_review by the partner (same trigger as Admin transitions)', h.length === 1 && h[0].from_status === 'draft' && h[0].to_status === 'pending_review' && h[0].actor_profile_id === U_PA, h);
r = await as(U_PA, () => S.submitListing(L.sale));
check('re-submit is idempotent: no error, no second history row', !r.error && r.data.status === 'pending_review' && (await history(L.sale)).length === 1);

/* ---------------- 5. never beyond pending_review ---------------- */
r = await as(U_PA, () => tryq(`select public.zfind_admin_transition_listing('${L.sale}', 'ready')`));
check('partner cannot call the Admin transition (Admin role required)', r.error && /Admin role required/.test(r.error.message));
r = await as(U_PA, () => tryq(`update listings set status = 'published' where id = '${L.sale}'`));
check('partner cannot write listings.status directly', r.error && /permission denied/.test(r.error.message), r.error && r.error.message);
await as(ADM, () => q(`select public.zfind_admin_transition_listing('${L.sale}', 'ready')`));
r = await as(U_PA, () => S.submitListing(L.sale));
check('submitting a « Prête à publier » listing is refused (no move back, no jump)', r.error && r.error.message === 'Soumission impossible : l’annonce est « Prête à publier ». Seul un brouillon peut être soumis à validation.' && await status(L.sale) === 'ready', r);
r = await as(U_PA, () => S.withdrawSubmission(L.sale));
check('withdraw refused once Z Find approved it', r.error && r.error.message.startsWith('Retrait impossible : l’annonce est « Prête à publier »') && await status(L.sale) === 'ready', r);
const fnArgs = (await q(`select pg_get_function_identity_arguments(p.oid) as a from pg_proc p where p.proname = 'zfind_partner_submit_listing'`)).map(x => x.a);
check('the submit command takes only the listing id (no target status to forge)', JSON.stringify(fnArgs) === JSON.stringify(['p_listing_id uuid']), fnArgs);

/* ---------------- 6. Admin « Renvoyer en brouillon » + notices ---------------- */
r = await as(ADM, () => S.returnToDraft(L.sale, '   '));
check('return to draft needs a reason (French)', r.error && S.describeError(r.error) === 'Motif obligatoire : indiquez à l’agence ce qu’elle doit corriger.');
r = await as(U_PA, () => S.returnToDraft(L.sale, 'Photos floues'));
check('partner cannot return a listing to draft', r.error && S.describeError(r.error) === 'Action réservée à l’équipe Z Find.');
r = await as(ADM, () => S.returnToDraft(L.sale, 'Photos floues : merci d’en ajouter de nettes.'));
check('admin returns a « prête » listing to draft with a reason', !r.error && r.data.status === 'draft' && await status(L.sale) === 'draft', r);
h = await history(L.sale);
// Same transaction → same recorded_at: compare as a set.
check('… through legal transitions only, each recorded with the Admin as actor', JSON.stringify(h.slice(1).map(x => `${x.from_status}>${x.to_status}`).sort()) === JSON.stringify(['pending_review>ready', 'ready>pending_review', 'pending_review>incomplete', 'incomplete>draft'].sort()) && h.slice(1).every(x => x.actor_profile_id === ADM), h);
r = await as(ADM, () => S.returnToDraft(L.sale, 'encore'));
check('returning a draft again is refused (French)', r.error && r.error.message === 'Renvoi impossible : l’annonce est déjà en brouillon.');
r = await as(U_PA, () => S.listStatuses([L.sale, L.other, L.be]));
const mine = (r.data || []).find(x => x.listing_id === L.sale);
check('partner status list: own listings only, ready flag, last return reason', !r.error && r.data.length === 2 && !r.data.some(x => x.listing_id === L.other)
  && mine.status === 'draft' && mine.ready === true && mine.last_notice_kind === 'returned_to_draft' && mine.last_notice_reason === 'Photos floues : merci d’en ajouter de nettes.', r);
r = await as(U_PA, () => S.submitListing(L.sale));
check('the partner can submit again after a return', !r.error && r.data.status === 'pending_review');
r = await as(U_PA, () => S.withdrawSubmission(L.sale));
check('owner withdraws its submission: pending_review → draft', !r.error && r.data.status === 'draft' && await status(L.sale) === 'draft');
await as(U_PA, () => S.submitListing(L.sale));
r = await as(U_PB, () => S.withdrawSubmission(L.sale));
check('another agency cannot withdraw it', r.error && r.error.code === '42501' && await status(L.sale) === 'pending_review');

// Compliance refusal → notice; the partner must correct before submitting again.
r = await as(ADM, () => C.reviewListingCompliance(L.sale, 'rejected', 'Montant des honoraires à corriger'));
check('admin refuses the mentions (existing RPC)', !r.error && r.data.review_status === 'rejected');
await as(ADM, () => S.returnToDraft(L.sale, 'Mentions refusées, voir le motif.'));
r = await as(U_PA, () => S.submitListing(L.sale));
check('refused mentions block a new submission (French)', r.error && r.error.message === 'Soumission impossible. Il manque : les mentions obligatoires corrigées (refusées par Z Find).', r);
const notices = await q(`select kind, reason, from_status, actor_profile_id from zfind_listing_review_notices where listing_id = $1 order by created_at, kind`, [L.sale]);
check('notices queued: returns (with previous status) and the compliance refusal, with the Admin', notices.length === 3 && notices.filter(n => n.kind === 'returned_to_draft').length === 2
  && notices.some(n => n.kind === 'compliance_rejected' && n.reason === 'Montant des honoraires à corriger' && n.actor_profile_id === ADM) && notices.some(n => n.from_status === 'ready'), notices);

// Server-only e-mail queue.
r = await as(U_PA, () => tryq('select * from public.zfind_pending_listing_review_notices(10)'));
check('the e-mail queue is not readable by a signed-in user', r.error && /permission denied/.test(r.error.message));
const pending = await as(null, () => q('select * from public.zfind_pending_listing_review_notices(10)'), 'service_role');
check('server queue: agency name, title, reference, recipients (accounts + sign-up, lower-cased, no other agency)', pending.length === 3 && pending.every(p => p.partner_name === 'Agence du Lac' && p.listing_title === 'T3 vue lac' && p.agency_reference === 'EV-001'
  && JSON.stringify(p.recipients.sort()) === JSON.stringify(['agent@lac-immo.fr', 'contact@lac-immo.fr'])), pending);
const [{ n }] = await as(null, () => q(`select public.zfind_mark_listing_review_notices(array['${pending[0].notice_id}']::uuid[], true) as n`), 'service_role');
check('mark delivered: once', n === 1 && (await as(null, () => q('select * from public.zfind_pending_listing_review_notices(10)'), 'service_role')).length === 2);

/* ---------------- 7. other jurisdictions ---------------- */
await db.exec(`insert into listing_content values ('${L.be}','fr','T2 Ixelles','Bel appartement.'); insert into listing_media values (gen_random_uuid(), '${L.be}', 0, true);`);
r = await as(U_PA, () => S.submitListing(L.be));
check('Belgian listing: no French mentions required, submitted', !r.error && r.data.status === 'pending_review', r);
await db.exec(`insert into listing_content values ('${L.dev}','fr','Résidence du Lac','Programme neuf.'); insert into development_media values (gen_random_uuid(), '31000000-0000-0000-0000-000000000001', 0, true);`);
check('development photos count (development_media)', JSON.stringify(await sqlMissing(L.dev)) === JSON.stringify(['compliance_unsupported']));

/* ---------------- 8. Admin bulk actions with the real runner ---------------- */
// Fixture: rent listing FR complete + approved; pub listing FR complete but mentions only pending.
const VALID_RENT = C.buildFacts(C.RENT, { dpe_status: 'exempt', dpe_exemption_reason: 'Monument historique', fees_payer: 'shared', agency_fees_amount: '900', surface_habitable_sqm: '48',
  monthly_rent_excl_charges: '1250', monthly_charges: '100', charges_recovery_method: 'provision', deposit_amount: '1250', tenant_fees_amount: '480', inventory_fees_amount: '144',
  furnished: 'false', rent_control_status: 'not_applicable', georisques_disclosure: true });
await db.exec(`insert into listing_content values ('${L.rent}','fr','T2 meublé','Location.'),('${L.pub}','fr','Villa','Maison.');
  insert into listing_media values (gen_random_uuid(), '${L.rent}', 0, true),(gen_random_uuid(), '${L.pub}', 0, true);`);
await as(U_PA, () => C.saveListingCompliance(L.rent, VALID_RENT, {}));
await as(U_PA, () => C.saveListingCompliance(L.pub, VALID_SALE, {}));
await as(ADM, () => C.reviewListingCompliance(L.rent, 'approved', null));
for (const lid of [L.rent, L.pub]) { r = await as(U_PA, () => S.submitListing(lid)); check(`partner submits ${lid === L.rent ? 'the rental' : 'the sale'}`, !r.error, r); }
const deps = {
  transition: (lid, to) => stub.safeQuery(() => client.rpc('zfind_admin_transition_listing', { p_listing_id: lid, p_to_status: to })),
  returnToDraft: (lid, reason) => S.returnToDraft(lid, reason),
  approveCompliance: lid => C.reviewListingCompliance(lid, 'approved', null)
};
const items = async ids => Promise.all(ids.map(async lid => ({ listingId: lid, status: await status(lid) })));
const progress = [];
let results = await as(ADM, async () => S.runBulk('publish', await items([L.rent, L.pub, L.sale, L.be]), deps, { onProgress: (d, tot) => progress.push(`${d}/${tot}`) }));
let summary = S.summarize('publish', results);
check('bulk « Publier »: sequential, progress 1/4 … 4/4', progress.join(' ') === '1/4 2/4 3/4 4/4');
check('bulk « Publier »: approved FR rental published; FR sale blocked by the mentions gate and BE listing by its mandate (both left « prête »); draft ignored',
  await status(L.rent) === 'published' && await status(L.pub) === 'ready' && await status(L.be) === 'ready' && await status(L.sale) === 'draft' && results[1].outcome === 'failed', results.map(x => [x.outcome, x.reason]));
check(`summary in French: « ${summary} »`, summary === '1 publiée, 2 bloquées (1 : mentions obligatoires non validées ; 1 : mandat non actif), 1 ignorée : pas encore soumise par l’agence', summary);
// BE listing has a « proposé » mandate → activate it, then « Valider les mentions et publier » on the FR sale.
await db.exec(`update representations set status = 'active' where id = '40000000-0000-0000-0000-000000000002'`);
results = await as(ADM, async () => S.runBulk('validate_publish', await items([L.pub]), deps));
check('« Valider les mentions et publier »: compliance approved then published', results[0].outcome === 'done' && await status(L.pub) === 'published'
  && (await q('select review_status from zfind_listing_compliance where listing_id = $1', [L.pub]))[0].review_status === 'approved', results);
results = await as(ADM, async () => S.runBulk('publish', await items([L.be, L.rent]), deps));
check(`second bulk: « ${S.summarize('publish', results)} »`, S.summarize('publish', results) === '1 publiée, 1 ignorée : déjà publiée' && await status(L.be) === 'published');
results = await as(ADM, async () => S.runBulk('return', await items([L.rent, L.sale]), deps, { reason: 'x' }));
check(`bulk return: published listing ignored, draft ignored: « ${S.summarize('return', results)} »`, S.summarize('return', results) === '0 renvoyée en brouillon, 2 ignorées (1 : statut « Publiée » ; 1 : déjà en brouillon)', S.summarize('return', results));

/* ---------------- 9. argument names, grants, re-run with data ---------------- */
const sig = {};
for (const row of await q(`select p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)) sig[row.proname] = row.args.split(',').map(a => a.trim().split(' ')[0]).filter(Boolean);
const used = {}; sent.forEach(s => { used[s.name] = Object.keys(s.args); });
const mineFns = ['zfind_partner_submit_listing', 'zfind_partner_withdraw_listing_submission', 'zfind_list_listing_submission_status', 'zfind_admin_return_listing_to_draft'];
check('every RPC the apps call exists with exactly these argument names', mineFns.every(f => used[f]) && Object.entries(used).every(([nm, a]) => JSON.stringify(sig[nm]) === JSON.stringify(a)), { used });
const grants = await q(`select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('service_role', p.oid, 'execute') as srv
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('zfind_partner_submit_listing','zfind_partner_withdraw_listing_submission','zfind_list_listing_submission_status','zfind_admin_return_listing_to_draft',
  'zfind_listing_submission_missing','zfind_listing_submission_missing_text','zfind_listing_status_fr','zfind_listing_compliance_rejection_notice','zfind_pending_listing_review_notices','zfind_mark_listing_review_notices')`);
const g = Object.fromEntries(grants.map(x => [x.proname, x]));
check('commands: authenticated only, never anon', mineFns.every(f => g[f].auth && !g[f].anon), grants);
check('helpers: no execute for authenticated / anon', ['zfind_listing_submission_missing', 'zfind_listing_submission_missing_text', 'zfind_listing_status_fr', 'zfind_listing_compliance_rejection_notice'].every(f => !g[f].auth && !g[f].anon));
check('e-mail queue: service_role only', ['zfind_pending_listing_review_notices', 'zfind_mark_listing_review_notices'].every(f => g[f].srv && !g[f].auth && !g[f].anon));
r = await as(U_PA, () => tryq('select * from public.zfind_listing_review_notices'));
check('notices table: no direct read for signed-in users', r.error && /permission denied/.test(r.error.message));
const before = (await q('select count(*)::int as c from zfind_listing_review_notices'))[0].c;
await db.exec(submitSql);
check('migration re-run with data: nothing lost, still works', (await q('select count(*)::int as c from zfind_listing_review_notices'))[0].c === before
  && (await q(`select count(*)::int as c from pg_trigger where tgname = 'zfind_listing_compliance_rejection_notice'`))[0].c === 1);

console.log(`\n${pass} checks passed${process.exitCode ? ' — WITH FAILURES' : ''}`);
