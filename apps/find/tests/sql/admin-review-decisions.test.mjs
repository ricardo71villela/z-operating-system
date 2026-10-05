/* ============================================================
   Z FIND — « À vérifier » : decisions in batch, reason, history, notices,
   on PGlite with Supabase-shaped stubs.
   Run:  npm i --no-save @electric-sql/pglite@0.2 && node tests/sql/admin-review-decisions.test.mjs
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
create table public.zfind_partner_signups (id uuid primary key default gen_random_uuid(), partner_id uuid, email text, status text default 'pending');
create table public.representations (id uuid primary key default gen_random_uuid(), partner_id uuid);
create table public.listings (id uuid primary key default gen_random_uuid(), representation_id uuid, status text default 'draft');
create table public.listing_content (listing_id uuid, locale text, title text);
-- stand-in for the real lifecycle transition: refuses 'ready' on a listing flagged as broken
create function public.zfind_admin_transition_listing(p_listing_id uuid, p_to_status text) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_to_status = 'ready' and exists (select 1 from listing_content where listing_id = p_listing_id and title = 'BROKEN') then raise exception 'not publishable'; end if;
  update listings set status = p_to_status where id = p_listing_id;
  return jsonb_build_object('ok', true);
end $$;
`);
await db.exec(MIG('20261005100000_z_find_admin_review_decisions_v1.sql'));
check('migration applies', true);
await db.exec(MIG('20261005100000_z_find_admin_review_decisions_v1.sql'));
check('migration is re-runnable', true);

const PA = '11111111-1111-1111-1111-111111111111';
const UA = 'aaaaaaaa-1111-1111-1111-111111111111', ADM = 'cccccccc-1111-1111-1111-111111111111';
const L = n => `0000000${n}-0000-0000-0000-000000000000`;
await db.query(`insert into partners (id, name) values ($1,'LAC IMMO')`, [PA]);
await db.query(`insert into auth.users (id, email) values ($1,'Agent@Lac-Immo.fr'),($2,'admin@zfind.online')`, [UA, ADM]);
await db.query(`insert into profiles (id, partner_id, role) values ($1,$2,'partner_user'),($3,null,'admin')`, [UA, PA, ADM]);
const REP = '99999999-9999-9999-9999-999999999999';
await db.query(`insert into representations (id, partner_id) values ($1,$2)`, [REP, PA]);
await db.query(`insert into listings (id, representation_id, status) values ($1,$5,'pending_review'),($2,$5,'pending_review'),($3,$5,'pending_review'),($4,$5,'draft')`, [L(1), L(2), L(3), L(4), REP]);
await db.query(`insert into listing_content (listing_id, locale, title) values ($1,'fr','T3 — Évian'),($2,'fr','Maison'),($3,'fr','BROKEN'),($4,'fr','Brouillon')`, [L(1), L(2), L(3), L(4)]);
const status = async id => (await q('select status from listings where id=$1', [id]))[0].status;

check('a partner cannot decide', await as('authenticated', UA, () => fails(() => q(`select zfind_admin_review_listings(array[$1::uuid], 'approve')`, [L(1)]), /Admin role required/)));
check('anon cannot call it at all', await as('anon', '', () => fails(() => q(`select zfind_admin_review_listings(array[$1::uuid], 'approve')`, [L(1)]), /permission denied/)));
check('refusing needs a reason', await as('authenticated', ADM, () => fails(() => q(`select zfind_admin_review_listings(array[$1::uuid], 'reject', '  ')`, [L(1)]), /reason is required/)));
check('unknown decision refused', await as('authenticated', ADM, () => fails(() => q(`select zfind_admin_review_listings(array[$1::uuid], 'publish')`, [L(1)]), /Invalid decision/)));

const res = (await as('authenticated', ADM, () => q(`select zfind_admin_review_listings(array[$1::uuid,$2::uuid,$3::uuid,$4::uuid,$1::uuid], 'approve', 'Photos OK') as r`, [L(1), L(3), L(4), '0000000f-0000-0000-0000-000000000000'])))[0].r;
check('batch approve: good one approved, repeated id handled once', res.length === 4 && res.find(x => x.listing_id === L(1)).ok === true && await status(L(1)) === 'ready');
check('a failing transition is reported and does not block the others', res.find(x => x.listing_id === L(3)).ok === false && res.find(x => x.listing_id === L(3)).error === 'not publishable' && await status(L(3)) === 'pending_review');
check('a listing not in review is reported, left alone; unknown id reported', res.find(x => x.listing_id === L(4)).error === 'not_pending_review' && await status(L(4)) === 'draft' && res.some(x => x.error === 'not_found'));
check('approving never publishes', (await q(`select count(*)::int n from listings where status = 'published'`))[0].n === 0);

const rej = (await as('authenticated', ADM, () => q(`select zfind_admin_review_listings(array[$1::uuid,$2::uuid], 'reject', '  Photos floues ; DPE manquant ') as r`, [L(2), L(1)])))[0].r;
check('reject → incomplete with the reason; listing already approved is refused', await status(L(2)) === 'incomplete' && rej.find(x => x.listing_id === L(1)).error === 'not_pending_review');

const log = await q('select listing_id, decision, reason, from_status, to_status, decided_by, notified_at from zfind_listing_review_log order by decided_at, decision');
check('log: only successful decisions, with reason and author', log.length === 2 && log.find(x => x.decision === 'reject').reason === 'Photos floues ; DPE manquant' && log.every(x => x.decided_by === ADM && x.notified_at === null));
check('nobody reads the log table directly', await as('authenticated', ADM, () => fails(() => q('select * from zfind_listing_review_log'), /permission denied/)));

const hist = await as('authenticated', ADM, () => q('select * from zfind_admin_review_history(50, null)'));
check('history for the Admin: title, agency, decision, newest first', hist.length === 2 && hist[0].decision === 'reject' && hist[0].listing_title === 'Maison' && hist[0].partner_name === 'LAC IMMO');
check('history filtered by agency', (await as('authenticated', ADM, () => q('select * from zfind_admin_review_history(50, $1)', ['22222222-2222-2222-2222-222222222222']))).length === 0 && (await as('authenticated', ADM, () => q('select * from zfind_admin_review_history(50, $1)', [PA]))).length === 2);
check('history is for the Admin only', await as('authenticated', UA, () => fails(() => q('select * from zfind_admin_review_history(50, null)'), /Admin role required/)));

check('notices are server only', await as('authenticated', ADM, () => fails(() => q('select * from zfind_pending_review_notices(10)'), /permission denied/)));
const notices = await as('service_role', '', () => q('select * from zfind_pending_review_notices(10)'));
check('pending notices: agency recipients (deduplicated, lower-case), reason and title', notices.length === 2 && notices[0].recipients.includes('agent@lac-immo.fr') && notices.find(n => n.decision === 'reject').reason.includes('DPE manquant') && notices.find(n => n.decision === 'reject').listing_title === 'Maison');
await as('service_role', '', () => q('select zfind_mark_review_notices($1::uuid[], true)', [[notices[0].notice_id]]));
await as('service_role', '', () => q('select zfind_mark_review_notices($1::uuid[], false)', [[notices[1].notice_id]]));
const after = await as('service_role', '', () => q('select * from zfind_pending_review_notices(10)'));
check('delivered notice leaves the queue; a failed one stays (5 attempts max)', after.length === 1 && after[0].notice_id === notices[1].notice_id);
console.log(`\nADMIN REVIEW DECISIONS (SQL): ${pass}/${pass} PASSED`);
