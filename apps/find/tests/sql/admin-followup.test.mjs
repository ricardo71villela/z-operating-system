/* ============================================================
   Z FIND — Admin follow-up (estimations, enquiry follow-up, reviews,
   photo import queue), on PGlite with Supabase-shaped stubs.
   Run:  npm i --no-save @electric-sql/pglite@0.2 && node tests/sql/admin-followup.test.mjs
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
const as = async (role, uid, fn) => { await db.exec(`set role ${role}; select set_config('test.uid', '${uid || ''}', false);`); try { return await fn(); } finally { await db.exec('reset role'); } };
const fails = async (fn, re) => { try { await fn(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
grant usage on schema auth, public to authenticated, anon, service_role;
create table public.partners (id uuid primary key, name text, status text default 'active');
create table public.profiles (id uuid primary key, partner_id uuid, role text);
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;
create table public.zfind_partner_signups (id uuid primary key default gen_random_uuid(), partner_id uuid, email text, status text default 'pending', plan text default 'founder', created_at timestamptz default now());
create table public.representations (id uuid primary key default gen_random_uuid(), partner_id uuid);
create table public.listings (id uuid primary key default gen_random_uuid(), representation_id uuid, transaction_type text, price_current numeric, currency_iso text);
create table public.listing_content (listing_id uuid, locale text, title text);
create table public.leads (id uuid primary key default gen_random_uuid(), listing_id uuid, contact_type text, name text, email text, phone text, message text, status text default 'new', created_at timestamptz default now());
create table public.media_assets (id uuid primary key default gen_random_uuid());
create table public.zfind_partner_reviews (id uuid primary key default gen_random_uuid(), partner_id uuid, listing_id uuid, status text, rating smallint, comment text, author_label text, lang text default 'fr', submitted_at timestamptz, published_at timestamptz, partner_reply text, created_at timestamptz default now());
grant select on public.leads, public.zfind_partner_reviews to service_role, authenticated;
`);
await db.exec(MIG('20261004160000_z_find_lead_notifications_v1.sql'));
await db.exec(MIG('20261004200000_z_find_admin_followup_v1.sql'));
check('migration applies (after the lead notifications one)', true);
await db.exec(MIG('20261004200000_z_find_admin_followup_v1.sql'));
check('migration is re-runnable', true);

const PA = '11111111-1111-1111-1111-111111111111', PB = '22222222-2222-2222-2222-222222222222', PC = '33333333-3333-3333-3333-333333333333';
const UA = 'aaaaaaaa-1111-1111-1111-111111111111', UC = 'dddddddd-1111-1111-1111-111111111111', ADM = 'cccccccc-1111-1111-1111-111111111111';
await db.query(`insert into partners (id, name, status) values ($1,'LAC IMMO','active'),($2,'OLD AGENCY','inactive'),($3,'ALPES','active')`, [PA, PB, PC]);
await db.query(`insert into auth.users (id, email) values ($1,'Agent@Lac-Immo.fr'),($2,'c@alpes.fr'),($3,'admin@zfind.online')`, [UA, UC, ADM]);
await db.query(`insert into profiles (id, partner_id, role) values ($1,$2,'partner_user'),($3,$4,'partner_user'),($5,null,'admin')`, [UA, PA, UC, PC, ADM]);
await db.query(`insert into zfind_partner_signups (partner_id, email) values ($1,'contact@lac-immo.fr')`, [PA]);

/* ---------------- 1. estimation requests ---------------- */
const est = async (mode, consent) => (await q(`insert into zfind_estimation_requests (mode, email, name, agency_consent, place, estimate) values ($1,'owner@example.com','Jean',$2,'Évian-les-Bains','{"central":420000}') returning id`, [mode, consent]))[0].id;
const E1 = await est('owner', true), E2 = await est('owner', false), E3 = await est('buyer', false);
for (const role of ['anon', 'authenticated']) {
  check(`${role}: cannot insert estimation requests`, await fails(() => as(role, role === 'anon' ? null : UA, () => q(`insert into zfind_estimation_requests (mode, email) values ('owner','x@y.z')`))));
}
check('partner: sees no estimation request', (await as('authenticated', UA, () => q(`select id from zfind_estimation_requests`))).length === 0);
check('anon: cannot read them', await fails(() => as('anon', null, () => q(`select id from zfind_estimation_requests`))));
check('admin: reads them all', (await as('authenticated', ADM, () => q(`select id from zfind_estimation_requests`))).length === 3);
check('partner cannot assign', await fails(() => as('authenticated', UA, () => q(`select zfind_admin_assign_estimation($1,$2)`, [E1, PA])), /forbidden/));
check('assign refused without the owner\'s consent', await fails(() => as('authenticated', ADM, () => q(`select zfind_admin_assign_estimation($1,$2)`, [E2, PA])), /no_consent/));
check('assign refused for a buyer request', await fails(() => as('authenticated', ADM, () => q(`select zfind_admin_assign_estimation($1,$2)`, [E3, PA])), /no_consent/));
check('assign refused to an inactive agency', await fails(() => as('authenticated', ADM, () => q(`select zfind_admin_assign_estimation($1,$2)`, [E1, PB])), /partner_inactive/));
check('direct table update by the admin is not possible (only through the functions)', await fails(() => as('authenticated', ADM, () => q(`update zfind_estimation_requests set partner_id = $2 where id = $1`, [E1, PA]))));
const a1 = (await as('authenticated', ADM, () => q(`select zfind_admin_assign_estimation($1,$2) r`, [E1, PA])))[0].r;
check('assigned with consent: status assigned, date set', a1.status === 'assigned' && a1.partner_id === PA && !!a1.assigned_at);
let fw = await as('service_role', null, () => q(`select * from zfind_pending_estimation_forwards(10)`));
check('server: pending forward with agency e-mails (accounts + sign-up)', fw.length === 1 && fw[0].partner_name === 'LAC IMMO' && JSON.stringify(fw[0].recipients.sort()) === JSON.stringify(['agent@lac-immo.fr', 'contact@lac-immo.fr']) && fw[0].estimate.central === 420000);
check('pending forwards are server only', await fails(() => as('authenticated', ADM, () => q(`select * from zfind_pending_estimation_forwards(10)`)), /permission denied/));
await as('service_role', null, () => q(`select zfind_mark_estimations_forwarded($1::uuid[], true)`, [[E1]]));
check('forwarded once: no longer pending', (await as('service_role', null, () => q(`select * from zfind_pending_estimation_forwards(10)`))).length === 0);
await as('authenticated', ADM, () => q(`select zfind_admin_assign_estimation($1,$2)`, [E1, PA]));
check('re-assigning to the same agency does not send again', (await as('service_role', null, () => q(`select * from zfind_pending_estimation_forwards(10)`))).length === 0);
await as('authenticated', ADM, () => q(`select zfind_admin_assign_estimation($1,$2)`, [E1, PC]));
check('assigning to another agency sends to the new one', (await as('service_role', null, () => q(`select partner_name from zfind_pending_estimation_forwards(10)`)))[0].partner_name === 'ALPES');
const s1 = (await as('authenticated', ADM, () => q(`select zfind_admin_set_estimation_status($1,'contacted','Rappelé le 5/10') r`, [E1])))[0].r;
check('status and note recorded', s1.status === 'contacted' && s1.admin_note === 'Rappelé le 5/10');
check('status "assigned" can only be set by assigning', await fails(() => as('authenticated', ADM, () => q(`select zfind_admin_set_estimation_status($1,'assigned')`, [E2])), /invalid_status/));
const cleared = (await as('authenticated', ADM, () => q(`select zfind_admin_assign_estimation($1,null) r`, [E1])))[0].r;
check('un-assign returns to "new"', cleared.status === 'new' && cleared.partner_id === null);
check('table constraint: no agency without consent, even for the server', await fails(() => q(`update zfind_estimation_requests set partner_id = $2 where id = $1`, [E2, PA])));

/* ---------------- 2. enquiry follow-up ---------------- */
const rA = (await q(`insert into representations (partner_id) values ($1) returning id`, [PA]))[0].id;
const rC = (await q(`insert into representations (partner_id) values ($1) returning id`, [PC]))[0].id;
const lA = (await q(`insert into listings (representation_id) values ($1) returning id`, [rA]))[0].id;
const lC = (await q(`insert into listings (representation_id) values ($1) returning id`, [rC]))[0].id;
await db.query(`insert into listing_content values ($1,'en','Lake flat'),($1,'fr','T3 vue lac')`, [lA]);
const lead = async (listing, name, ago, notified) => (await q(`insert into leads (listing_id, contact_type, name, email, created_at, notified_at) values ($1,'direct',$2,'x@example.com', now() - $3::interval, $4) returning id`, [listing, name, ago, notified ? new Date().toISOString() : null]))[0].id;
const L1 = await lead(lA, 'Old unanswered', '30 hours', true);
const L2 = await lead(lA, 'Fresh', '2 hours', true);
const L3 = await lead(lC, 'Other agency', '30 hours', true);
const L4 = await lead(lA, 'Never sent', '30 hours', false);
await lead(lA, 'Too old', '9 days', true);
let rem = await as('service_role', null, () => q(`select * from zfind_pending_lead_reminders(50)`));
check('reminders: only sent, unanswered, 24 h – 7 days old', rem.map(r => r.name).sort().join(',') === 'Old unanswered,Other agency');
check('reminder row: French title and agency e-mails', rem.find(r => r.name === 'Old unanswered').listing_title === 'T3 vue lac' && rem.find(r => r.name === 'Old unanswered').recipients.includes('agent@lac-immo.fr'));
check('reminders are server only', await fails(() => as('authenticated', ADM, () => q(`select * from zfind_pending_lead_reminders(5)`)), /permission denied/));
check('partner cannot mark another agency\'s enquiry', await fails(() => as('authenticated', UA, () => q(`select zfind_partner_set_lead_status($1,'contacted')`, [L3])), /not_found/));
check('partner: invalid status refused', await fails(() => as('authenticated', UA, () => q(`select zfind_partner_set_lead_status($1,'new')`, [L1])), /invalid_status/));
const ans = (await as('authenticated', UA, () => q(`select zfind_partner_set_lead_status($1,'contacted') r`, [L1])))[0].r;
check('partner marks its enquiry answered: status + date', ans.status === 'contacted' && !!ans.responded_at);
check('admin function refused to partners', await fails(() => as('authenticated', UA, () => q(`select zfind_admin_set_lead_status($1,'closed')`, [L1])), /forbidden/));
rem = await as('service_role', null, () => q(`select lead_id from zfind_pending_lead_reminders(50)`));
check('answered enquiry: no reminder', rem.length === 1 && rem[0].lead_id === L3);
await as('service_role', null, () => q(`select zfind_mark_lead_reminders($1::uuid[])`, [[L3]]));
check('one reminder only', (await as('service_role', null, () => q(`select * from zfind_pending_lead_reminders(50)`))).length === 0);
const rows = await as('authenticated', ADM, () => q(`select * from zfind_admin_leads(null, 100)`));
check('admin list: listing title, agency, overdue flag', rows.length === 5 && rows.find(r => r.name === 'Other agency').overdue === true && rows.find(r => r.name === 'Fresh').overdue === false
  && rows.find(r => r.name === 'Old unanswered').overdue === false && rows.find(r => r.name === 'Fresh').listing_title === 'T3 vue lac' && rows.find(r => r.name === 'Other agency').partner_name === 'ALPES');
check('admin filter "overdue"', (await as('authenticated', ADM, () => q(`select name from zfind_admin_leads('overdue', 100)`))).map(r => r.name).sort().join(',') === 'Never sent,Other agency,Too old');
check('admin list refused to partners', await fails(() => as('authenticated', UA, () => q(`select * from zfind_admin_leads(null, 10)`)), /forbidden/));
const back = (await as('authenticated', ADM, () => q(`select zfind_admin_set_lead_status($1,'new') r`, [L1])))[0].r;
check('admin can reopen an enquiry (answer date cleared)', back.status === 'new' && back.responded_at === null);
void L2; void L4;

/* ---------------- 3. reviews ---------------- */
const R1 = (await q(`insert into zfind_partner_reviews (partner_id, status, rating, author_label, comment, submitted_at) values ($1,'pending',5,'Marie D.','Très bien', now()) returning id`, [PA]))[0].id;
await q(`insert into zfind_partner_reviews (partner_id, status) values ($1,'invited')`, [PA]);
check('admin reviews: pending ones with agency name', (await as('authenticated', ADM, () => q(`select * from zfind_admin_reviews('pending')`))).map(r => r.partner_name).join() === 'LAC IMMO');
check('invitations never listed', (await as('authenticated', ADM, () => q(`select * from zfind_admin_reviews(null)`))).length === 1);
check('partners cannot list or moderate', await fails(() => as('authenticated', UA, () => q(`select * from zfind_admin_reviews('pending')`)), /forbidden/) && await fails(() => as('authenticated', UA, () => q(`select zfind_admin_moderate_review($1,'publish')`, [R1])), /forbidden/));
const pub = (await as('authenticated', ADM, () => q(`select zfind_admin_moderate_review($1,'publish') r`, [R1])))[0].r;
check('publish', pub.status === 'published' && !!(await q(`select published_at from zfind_partner_reviews where id=$1`, [R1]))[0].published_at);
await as('authenticated', ADM, () => q(`select zfind_admin_moderate_review($1,'reject')`, [R1]));
check('reject clears the publication date', (await q(`select status, published_at from zfind_partner_reviews where id=$1`, [R1]))[0].published_at === null);

/* ---------------- 4. photo queue ---------------- */
check('partner cannot queue photos', await fails(() => as('authenticated', UA, () => q(`insert into zfind_media_import_queue (listing_id, url) values ($1,'https://x.test/1.jpg')`, [lA]))));
await as('authenticated', ADM, () => q(`insert into zfind_media_import_queue (listing_id, url, position) values ($1,'https://x.test/1.jpg',0),($1,'https://x.test/2.jpg',1),($1,'https://x.test/3.jpg',2)`, [lA]));
check('admin queues photo links; same link twice refused', await fails(() => as('authenticated', ADM, () => q(`insert into zfind_media_import_queue (listing_id, url) values ($1,'https://x.test/1.jpg')`, [lA]))));
check('only http(s) links', await fails(() => as('authenticated', ADM, () => q(`insert into zfind_media_import_queue (listing_id, url) values ($1,'file:///etc/passwd')`, [lA]))));
check('admin cannot change queue rows (server only)', await fails(() => as('authenticated', ADM, () => q(`update zfind_media_import_queue set status='done'`))));
let claimed = (await as('service_role', null, () => q(`select * from zfind_claim_media_imports(2)`))).sort((a, b) => a.position - b.position);
check('server claims in order, counts attempts', claimed.length === 2 && claimed[0].position === 0 && claimed.every(r => r.status === 'processing' && r.attempts === 1));
claimed = await as('service_role', null, () => q(`select * from zfind_claim_media_imports(5)`));
check('claimed rows are not handed out twice', claimed.length === 1 && claimed[0].position === 2);
await q(`update zfind_media_import_queue set claimed_at = now() - interval '10 minutes' where position = 0`);
claimed = await as('service_role', null, () => q(`select * from zfind_claim_media_imports(5)`));
check('stale claim retried', claimed.length === 1 && claimed[0].attempts === 2);
check('claiming is server only', await fails(() => as('authenticated', ADM, () => q(`select * from zfind_claim_media_imports(1)`)), /permission denied/));
console.log(`\nSQL admin follow-up: ${pass} checks`);
