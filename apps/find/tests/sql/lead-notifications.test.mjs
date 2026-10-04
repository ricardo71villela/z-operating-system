/* ============================================================
   Z FIND — lead notifications + lead counts, on PGlite.
   Run:  npm i --no-save @electric-sql/pglite@0.2 && node tests/sql/lead-notifications.test.mjs
   ============================================================ */
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ZOS_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const MIGRATION = path.join(ROOT, 'infrastructure', 'supabase', 'migrations', '20261004160000_z_find_lead_notifications_v1.sql');
const db = new PGlite();
let pass = 0;
const check = (label, ok) => { if (!ok) { console.error('FAIL:', label); process.exitCode = 1; } else { pass++; console.log('PASS:', label); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
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
create table public.leads (id uuid primary key default gen_random_uuid(), listing_id uuid, contact_type text, name text, email text, phone text, message text, status text default 'new', created_at timestamptz default now(), workspace_id uuid);
grant select on public.leads to service_role, authenticated;
`);
await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
check('migration applies', true);
const PA = '11111111-1111-1111-1111-111111111111', PB = '22222222-2222-2222-2222-222222222222', UA = 'aaaaaaaa-1111-1111-1111-111111111111', UB = 'bbbbbbbb-1111-1111-1111-111111111111', ADM = 'cccccccc-1111-1111-1111-111111111111';
await db.query(`insert into partners (id, name, status) values ($1,'LAC IMMO','active'),($2,'OLD AGENCY','inactive')`, [PA, PB]);
await db.query(`insert into auth.users (id, email) values ($1,'Agent@Lac-Immo.fr'),($2,'b@old.fr'),($3,'admin@zfind.online')`, [UA, UB, ADM]);
await db.query(`insert into profiles (id, partner_id, role) values ($1,$2,'partner_user'),($3,$4,'partner_user'),($5,null,'admin')`, [UA, PA, UB, PB, ADM]);
await db.query(`insert into zfind_partner_signups (partner_id, email, created_at) values ($1,'contact@lac-immo.fr', now() - interval '100 days')`, [PA]);
const rA = (await q(`insert into representations (partner_id) values ($1) returning id`, [PA]))[0].id;
const rB = (await q(`insert into representations (partner_id) values ($1) returning id`, [PB]))[0].id;
const lA = (await q(`insert into listings (representation_id, transaction_type, price_current, currency_iso) values ($1,'sale',420000,'EUR') returning id`, [rA]))[0].id;
const lB = (await q(`insert into listings (representation_id, transaction_type, price_current, currency_iso) values ($1,'rent',1200,'EUR') returning id`, [rB]))[0].id;
await db.query(`insert into listing_content values ($1,'en','T3 lake view'),($1,'fr','T3 vue lac')`, [lA]);
await db.query(`insert into leads (listing_id, contact_type, name, email, created_at) values
  ($1,'direct','Marie','marie@example.com', now()), ($2,'qualified','Paul','paul@example.com', now()),
  ($1,'direct','Ancien','old@example.com', now() - interval '10 days'),
  ($1,'direct','Période gratuite','f@example.com', now() - interval '80 days')`, [lA, lB]);
await db.query(`insert into leads (listing_id, contact_type, name) values (null, 'desk', 'Z Desk lead')`);

const as = async (role, uid, fn) => { await db.exec(`set role ${role}; select set_config('test.uid', '${uid || ''}', false);`); try { return await fn(); } finally { await db.exec('reset role'); } };
let rows = await as('service_role', null, () => q(`select * from zfind_pending_lead_notifications(20)`));
check('pending: only recent Z Find enquiries (not older than 7 days, not Z Desk)', rows.length === 2);
const a = rows.find(r => r.name === 'Marie');
check('pending: French title, price, agency, active flag', a.listing_title === 'T3 vue lac' && Number(a.price) === 420000 && a.partner_name === 'LAC IMMO' && a.partner_active === true);
check('pending: recipients = agency accounts + sign-up e-mail, lower-cased, no duplicates', JSON.stringify(a.recipients.sort()) === JSON.stringify(['agent@lac-immo.fr', 'contact@lac-immo.fr']));
check('pending: inactive agency flagged', rows.find(r => r.name === 'Paul').partner_active === false);
for (const role of ['anon', 'authenticated']) {
  let denied = false; try { await as(role, UA, () => q(`select * from zfind_pending_lead_notifications(5)`)); } catch (e) { denied = /permission denied/.test(e.message); }
  check(`${role} cannot read pending notifications (agency e-mails)`, denied);
}
await as('service_role', null, () => q(`select zfind_mark_leads_notified($1::uuid[], false)`, [[a.lead_id]]));
check('failed send: attempt counted, still pending', (await q(`select notified_at, notify_attempts from leads where id=$1`, [a.lead_id]))[0].notify_attempts === 1);
const n = (await as('service_role', null, () => q(`select zfind_mark_leads_notified($1::uuid[], true) n`, [rows.map(r => r.lead_id)])))[0].n;
check('delivered: marked once', n === 2 && (await as('service_role', null, () => q(`select * from zfind_pending_lead_notifications(20)`))).length === 0);
check('marking again changes nothing', (await as('service_role', null, () => q(`select zfind_mark_leads_notified($1::uuid[], true) n`, [[a.lead_id]])))[0].n === 0);
await db.query(`update leads set notify_attempts = 5, notified_at = null where name = 'Ancien'`);
await db.query(`update leads set created_at = now() where name = 'Ancien'`);
check('after 5 failed attempts: no more retries', (await as('service_role', null, () => q(`select * from zfind_pending_lead_notifications(20)`))).length === 0);

let st = (await as('authenticated', UA, () => q(`select zfind_partner_lead_stats() s`)))[0].s;
check('partner stats: total, 30 days, since sign-up, free period (only the first 3 months count)', st.total === 3 && st.last_30_days === 2 && st.since_signup === 3 && st.free_period === 1 && !!st.free_period_ends);
check('partner stats: nothing for a non-partner', (await as('authenticated', ADM, () => q(`select zfind_partner_lead_stats() s`)))[0].s === null);
let err = ''; try { await as('authenticated', UA, () => q(`select * from zfind_admin_signup_lead_counts()`)); } catch (e) { err = e.message; }
check('admin counts: forbidden to partners', err.includes('forbidden'));
const c = (await as('authenticated', ADM, () => q(`select * from zfind_admin_signup_lead_counts()`)))[0];
check('admin counts per sign-up', Number(c.leads_total) === 3 && Number(c.leads_free_period) === 1);
console.log(`\nSQL leads: ${pass} checks`);
