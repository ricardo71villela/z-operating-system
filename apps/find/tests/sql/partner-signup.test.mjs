/* ============================================================
   Z FIND — self sign-up migration, run on an in-memory Postgres
   (PGlite) with a Supabase-shaped stub schema (auth.users, auth.uid(),
   roles anon / authenticated, RLS).
   Run:  npm i --no-save @electric-sql/pglite@0.2 && node tests/sql/partner-signup.test.mjs
   ============================================================ */
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const MIGRATION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'infrastructure', 'supabase', 'migrations', '20261004110000_z_find_partner_self_signup_v1.sql');
const db = new PGlite();
let pass = 0;
const check = (label, ok) => { if (!ok) { console.error('FAIL:', label); process.exitCode = 1; } else { pass++; console.log('PASS:', label); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant usage on schema public to authenticated, anon;
create table public.partners (id uuid primary key default gen_random_uuid(), name text not null, role text not null check (role in ('agency','promoter')), status text not null default 'active' check (status in ('active','inactive')));
create table public.profiles (id uuid primary key references auth.users(id), partner_id uuid references public.partners(id), role text not null check (role in ('admin','partner_user')));
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;
create table public.zfind_agencias (id uuid primary key default gen_random_uuid(), country text, source text, source_id text, company_id text, name text, trade_name text, legal_form text,
  is_head_office boolean, is_natural_person boolean, address text, postcode text, city text, network text, type text, active boolean default true,
  email text, phone text, website text, email_outreach_allowed boolean default false, do_not_contact boolean default false, last_seen_at timestamptz);
create table public.zfind_partner_reviews (status text); create table public.zfind_alert_subscriptions (status text, kind text); create table public.leads (status text, created_at timestamptz);
insert into public.zfind_agencias (country, source, source_id, company_id, name, trade_name, is_head_office, address, postcode, city, email, phone) values
 ('FR','sirene','12345678900011','123456789','IMMO LAC SARL','CENTURY 21 LAC',true,'4 PLACE DU MARCHE 74200 THONON-LES-BAINS','74200','THONON-LES-BAINS','secret@c21.fr','+33450'),
 ('FR','sirene','12345678900029','123456789','IMMO LAC SARL',null,false,'1 RUE X 74500 EVIAN','74500','EVIAN-LES-BAINS',null,null),
 ('BE','kbo','0201.310.929','0201.310.929','AGENCE BRUXELLES SA',null,true,'Rue Y 1','1000','Bruxelles',null,null);
`);
await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
check('migration applies on a Supabase-shaped schema', true);

const asUser = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('test.uid', '${uid || ''}', false);`); try { return await fn(); } finally { await db.exec('reset role'); } };
const asAnon = async fn => { await db.exec(`set role anon; select set_config('test.uid', '', false);`); try { return await fn(); } finally { await db.exec('reset role'); } };

let r = await asAnon(() => q(`select * from zfind_registry_lookup('FR','123 456 789')`));
check('lookup by SIREN (anon): both establishments, head office first', r.length === 2 && r[0].is_head_office === true && r[0].establishment_id === '12345678900011');
check('lookup never returns contacts', !Object.keys(r[0]).some(k => ['email', 'phone', 'website'].includes(k)));
r = await asAnon(() => q(`select * from zfind_registry_lookup('FR','12345678900029')`));
check('lookup by SIRET: exactly that establishment', r.length === 1 && r[0].postcode === '74500');
r = await asAnon(() => q(`select * from zfind_registry_lookup('FR','1234')`));
check('lookup: malformed number returns nothing', r.length === 0);
r = await asAnon(() => q(`select * from zfind_registry_lookup('BE','0201310929')`));
check('lookup BE: dotted enterprise number matched by digits', r.length === 1 && r[0].name === 'AGENCE BRUXELLES SA');
r = await asAnon(() => q(`select * from zfind_registry_lookup('LU','B123')`));
check('lookup LU: no registry, empty', r.length === 0);
let denied = false; try { await asAnon(() => q(`select zfind_partner_complete_signup()`)); } catch (e) { denied = /permission denied/.test(e.message); }
check('anon cannot call complete_signup', denied);
denied = false; try { await asAnon(() => q(`select * from zfind_partner_signups`)); } catch (e) { denied = /permission denied/.test(e.message); }
check('anon cannot read sign-ups', denied);

const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222', ADM = '99999999-9999-9999-9999-999999999999';
const meta = (o) => JSON.stringify({ zfind_signup: Object.assign({ role: 'agency', country: 'FR', legal_name: 'IMMO LAC SARL', trade_name: 'CENTURY 21 LAC', establishment_id: '123 456 789 00011', card_number: 'CPI 7401 2020 000 000 001', card_authority: 'CCI Haute-Savoie', terms_accepted: true, address: '4 place du Marché', postcode: '74200', city: 'Thonon' }, o) });
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,'a@lac.fr',$2),($3,'b@lac.fr',$4),($5,'admin@zfind.online','{}')`, [U1, meta({}), U2, meta({}), ADM]);
await db.query(`insert into profiles (id, role) values ($1,'admin')`, [ADM]);

r = await asUser(ADM, () => q(`select zfind_partner_complete_signup() r`));
check('admin account: not_applicable', r[0].r.status === 'not_applicable');
r = await asUser(U1, () => q(`select zfind_partner_complete_signup() r`));
check('complete: partner created, founder wave 1', r[0].r.status === 'created' && r[0].r.plan === 'founder' && r[0].r.founder_wave === 1);
const prof = await q(`select p.role, pa.name, pa.role prole, pa.status from profiles p join partners pa on pa.id = p.partner_id where p.id = $1`, [U1]);
check('profile partner_user linked to partner named after the trade name', prof.length === 1 && prof[0].role === 'partner_user' && prof[0].name === 'CENTURY 21 LAC' && prof[0].prole === 'agency');
const sg = await q(`select * from zfind_partner_signups where user_id = $1`, [U1]);
check('sign-up stored: SIRET digits, SIREN, base link, account e-mail, pending', sg[0].establishment_id === '12345678900011' && sg[0].company_id === '123456789' && sg[0].agencia_id && sg[0].email === 'a@lac.fr' && sg[0].status === 'pending');
r = await asUser(U1, () => q(`select zfind_partner_complete_signup() r`));
check('complete is idempotent', r[0].r.status === 'existing' && (await q('select count(*)::int n from partners'))[0].n === 1);
let err = ''; try { await asUser(U2, () => q(`select zfind_partner_complete_signup()`)); } catch (e) { err = e.message; }
check('same SIRET twice: already_registered', err.includes('already_registered'));
r = await asAnon(() => q(`select * from zfind_registry_lookup('FR','12345678900011')`));
check('lookup flags the registered establishment', r[0].already_registered === true);
r = await asUser(U2, () => q(`select count(*)::int n from zfind_partner_signups`));
check('RLS: another user sees no sign-up', r[0].n === 0);
r = await asUser(U1, () => q(`select count(*)::int n from zfind_partner_signups`));
check('RLS: user sees own sign-up', r[0].n === 1);

// invalid payloads
await db.query(`update auth.users set raw_user_meta_data = $2 where id = $1`, [U2, meta({ establishment_id: '123' })]);
err = ''; try { await asUser(U2, () => q(`select zfind_partner_complete_signup()`)); } catch (e) { err = e.message; }
check('FR without a 14-digit SIRET: invalid_siret', err.includes('invalid_siret'));
await db.query(`update auth.users set raw_user_meta_data = $2 where id = $1`, [U2, meta({ establishment_id: '12345678900029', card_number: ' ' })]);
err = ''; try { await asUser(U2, () => q(`select zfind_partner_complete_signup()`)); } catch (e) { err = e.message; }
check('missing card number: invalid_signup', err.includes('invalid_signup'));
await db.query(`update auth.users set raw_user_meta_data = $2 where id = $1`, [U2, meta({ establishment_id: '12345678900029', terms_accepted: false })]);
err = ''; try { await asUser(U2, () => q(`select zfind_partner_complete_signup()`)); } catch (e) { err = e.message; }
check('terms not accepted: invalid_signup', err.includes('invalid_signup'));
check('failed attempts leave no partner behind', (await q('select count(*)::int n from partners'))[0].n === 1);

// Founder seats: 49 more wave-1 FR agencies → the 51st gets wave 2; LU counted separately.
for (let i = 0; i < 49; i++) {
  const id = `00000000-0000-0000-0000-${String(1000 + i).padStart(12, '0')}`;
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `x${i}@t.fr`, meta({ establishment_id: String(90000000000000 + i), legal_name: 'A' + i, trade_name: '' })]);
  await asUser(id, () => q(`select zfind_partner_complete_signup()`));
}
const U51 = '33333333-3333-3333-3333-333333333333', ULU = '44444444-4444-4444-4444-444444444444', UP = '55555555-5555-5555-5555-555555555555';
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,'51@t.fr',$2),($3,'lu@t.lu',$4),($5,'p@t.fr',$6)`, [U51, meta({ establishment_id: '98765432100015' }), ULU, meta({ country: 'LU', establishment_id: '', company_id: 'B123456', card_number: 'AE 10012345' }), UP, meta({ role: 'promoter', establishment_id: '55555555500018', card_number: 'RCS Annecy 555 555 555' })]);
r = await asUser(U51, () => q(`select zfind_partner_complete_signup() r`));
check('51st French agency: second wave', r[0].r.founder_wave === 2);
r = await asUser(ULU, () => q(`select zfind_partner_complete_signup() r`));
check('Luxembourg counted separately: first wave, no SIRET needed', r[0].r.founder_wave === 1);
r = await asUser(UP, () => q(`select zfind_partner_complete_signup() r`));
check('promoter: founding developer, no wave', r[0].r.plan === 'founder_developer' && r[0].r.founder_wave === null);

// Admin review + overview
const sid = (await q(`select id from zfind_partner_signups where user_id = $1`, [U1]))[0].id;
err = ''; try { await asUser(U2, () => q(`select zfind_admin_review_signup($1,'verified',null)`, [sid])); } catch (e) { err = e.message; }
check('non-admin cannot review', err.includes('forbidden'));
await asUser(ADM, () => q(`select zfind_admin_review_signup($1,'rejected','Carte introuvable')`, [sid]));
let st = await q(`select s.status, s.review_note, s.reviewed_by, p.status pstatus from zfind_partner_signups s join partners p on p.id = s.partner_id where s.id = $1`, [sid]);
check('reject: note kept, reviewer recorded, partner deactivated', st[0].status === 'rejected' && st[0].review_note === 'Carte introuvable' && st[0].reviewed_by === ADM && st[0].pstatus === 'inactive');
await asUser(ADM, () => q(`select zfind_admin_review_signup($1,'verified',null)`, [sid]));
st = await q(`select s.status, p.status pstatus from zfind_partner_signups s join partners p on p.id = s.partner_id where s.id = $1`, [sid]);
check('verify again: partner reactivated', st[0].status === 'verified' && st[0].pstatus === 'active');
r = await asUser(ADM, () => q(`select zfind_admin_operations_overview() o`));
const o = r[0].o;
check('overview: sign-ups pending/verified and founder seats per country', o.signups.verified === 1 && o.signups.pending === 52 && o.signups.founder_seats.FR === 50 && o.signups.founder_seats.LU === 1 && o.signups.founder_seats.developers === 1 && o.agencias.total === 3);
err = ''; try { await asUser(U2, () => q(`select zfind_admin_operations_overview()`)); } catch (e) { err = e.message; }
check('overview still admin-only', err.includes('forbidden'));
r = await asUser(ADM, () => q(`select count(*)::int n from zfind_partner_signups`));
check('admin reads every sign-up', r[0].n === 53);
console.log(`\nSQL self-signup: ${pass} checks`);
