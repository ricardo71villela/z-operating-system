/* ============================================================
   Z FIND — Partner self-service import + feed settings, on an
   in-memory Postgres (PGlite): migration 20261010120000.
   The REAL shared code runs (zfind-web/src/services/listing-import:
   Poliris reader, planSync, applyPlan with the Partner writer), each
   call made with the session of the agency's user, as supabase-js does.
   Checks:
   - an agency imports into ITS OWN agency only (creates drafts, updates,
     archives its imported listings), never another agency's;
   - the new Partner commands refuse other agencies, never change a
     status except « → archivée », never archive a hand-made listing;
   - photo links queued for its own listings only;
   - feed: the password is never readable by authenticated / anon (table,
     functions), only the server functions see it; URL validation;
     Admin-only commands; zfind_feed_call acts as the agency, whitelisted;
   - the migration runs twice (the harness applies it twice) and once more
     here without changing anything.
   Run: node tests/sql/partner-self-import.test.mjs
   ============================================================ */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { createDb, FIND, MIG, FEED_MIG } from './_partner-import-db.mjs';

const require = createRequire(import.meta.url);
const imp = require(path.join(FIND, 'apps', 'zfind-web', 'src', 'services', 'listing-import', 'listing-import.js'));
const FIX = name => new Uint8Array(fs.readFileSync(path.join(FIND, 'tests', 'fixtures', 'poliris', name)));

let pass = 0;
function check(label, ok, extra) {
  if (ok) { pass += 1; console.log('PASS:', label); return; }
  console.error('FAIL:', label, extra === undefined ? '' : JSON.stringify(extra, null, 1).slice(0, 1500));
  process.exitCode = 1;
}

const t = await createDb();
const { q, as, tryq, rpcAs, callRpc, ids: { PA, PB, U_PA, U_PA2, U_PB, ADM } } = t;
const asService = f => as(null, f, 'service_role');

/* The Partner panel's import: same calls as zfind-partner/src/import.js (rpcWriter on its own session). */
async function partnerImport(uid, name, opts) {
  const writer = imp.rpcWriter(rpcAs(uid));
  const table = imp.readCsvBytes(FIX(name));
  const rows = table.records.map(r => imp.normalizeRow(r, imp.mapFor(table)));
  const pf = await writer.portfolio();
  if (pf.error) throw new Error(JSON.stringify(pf.error));
  await imp.loadComplianceFor(pf.data, writer.compliance, 4);
  const plan = imp.planSync(rows, pf.data, Object.assign({ country: 'FR', fullSync: true, lineOffset: 1 }, opts || {}));
  const out = await imp.applyPlan(plan, { writer, country: 'FR', source: { source: 'partner_import', format: table.format, fileName: name, version: table.version } });
  const photos = await imp.queuePhotoJobs(writer, out.photoJobs);
  return { plan, out, photos };
}
const listingOf = async (ref, partner) => (await q(`select l.*, r.partner_id from listings l join representations r on r.id = l.representation_id join properties p on p.id = r.property_id where p.agency_reference = $1 and r.partner_id = $2 order by l.created_at desc limit 1`, [ref, partner]))[0];
const B_LISTING = '50000000-0000-0000-0000-0000000000b1'; // other agency, reference PUB-77
const A_MANUAL = '50000000-0000-0000-0000-0000000000b2'; // agency A, made by hand (no reference)

/* ---------- 1. first import by agency A (Poliris, Windows-1252) ---------- */
let res = await partnerImport(U_PA, 'annonces-v1-latin1.csv');
check('A: plan 3 to create, 1 error; nothing to archive (the hand-made listing is not part of an import)', res.plan.counts.create === 3 && res.plan.counts.error === 1 && res.plan.counts.archive === 0, res.plan.counts);
check('A: 3 created OK', res.out.results.filter(r => r.kind === 'create' && r.status === 'ok').length === 3, res.out.results);
const aRows = await q(`select r.partner_id, r.status as rep, l.status, p.agency_reference, z.name as commune from listings l join representations r on r.id = l.representation_id join properties p on p.id = r.property_id left join zones_lite z on z.id = p.zone_lite_id where p.agency_reference is not null order by p.agency_reference, r.partner_id`);
check('A: every created listing belongs to agency A and is a DRAFT; commune resolved', aRows.filter(x => x.partner_id === PA).length === 3 && aRows.filter(x => x.partner_id === PA).every(x => x.status === 'draft') && aRows.find(x => x.agency_reference === 'EV-1024').commune === 'Évian-les-Bains', aRows);
check('B’s PUB-77 untouched by A’s import', (await q(`select status, price_current from listings where id = $1`, [B_LISTING]))[0].status === 'draft');
check('photo links queued through zfind_partner_queue_listing_photos (4)', res.photos === 4 && (await q(`select count(*)::int as n from zfind_media_import_queue`))[0].n === 4);
const facts = await q(`select count(*)::int as n from zfind_listing_compliance c join listings l on l.id = c.listing_id join representations r on r.id = l.representation_id where r.partner_id = $1`, [PA]);
check('mentions obligatoires saved by the agency for the 3 listings', facts[0].n === 3, facts);

/* ---------- 2. portfolio read ---------- */
let pf = await rpcAs(U_PA)('zfind_partner_import_portfolio', {});
check('A’s portfolio: its 3 referenced properties only (not B’s PUB-77, not its hand-made one), with queued photo links', !pf.error && pf.data.length === 3 && pf.data.every(e => e.properties.agency_reference) && pf.data.find(e => e.properties.agency_reference === 'EV-1024').listings[0].queued_urls.length === 3, pf);
pf = await rpcAs(U_PB)('zfind_partner_import_portfolio', {});
check('B’s portfolio: only its own PUB-77', !pf.error && pf.data.length === 1 && pf.data[0].properties.agency_reference === 'PUB-77', pf);
check('anon cannot read a portfolio', !!(await rpcAs(null)('zfind_partner_import_portfolio', {})).error);
check('an admin (no agency) gets « Accès réservé aux comptes agence »', /Accès réservé/.test(((await rpcAs(ADM)('zfind_partner_import_portfolio', {})).error || {}).message || ''));

/* ---------- 3. same file again: nothing to do; second user of the same agency sees the same ---------- */
res = await partnerImport(U_PA2, 'annonces-v1-latin1.csv');
check('same file by another user of agency A: 0 create / update / archive, 3 unchanged', res.plan.counts.create === 0 && res.plan.counts.update === 0 && res.plan.counts.archive === 0 && res.plan.counts.unchanged === 3, res.plan.counts);

/* ---------- 4. next export: update + archive by the agency ---------- */
res = await partnerImport(U_PA, 'annonces-v2-latin1.csv');
check('v2: 1 create, 1 update, 1 archive', res.plan.counts.create === 1 && res.plan.counts.update === 1 && res.plan.counts.archive === 1, res.plan.counts);
const ev = await listingOf('EV-1024', PA);
const pubA = await listingOf('PUB-77', PA);
check('EV-1024 price updated by zfind_partner_update_listing_commercial; still a draft', Number(ev.price_current) === 435000 && ev.status === 'draft', ev);
check('A’s PUB-77 archived (row kept); B’s PUB-77 untouched', pubA.status === 'archived' && (await q(`select status from listings where id = $1`, [B_LISTING]))[0].status === 'draft');
const hist = await q(`select from_status, to_status, actor_profile_id from find.listing_state_history where listing_id = $1 order by recorded_at desc limit 1`, [pubA.id]).catch(() => []);
check('archiving is recorded with the agency user as actor', hist.length === 1 && hist[0].to_status === 'archived' && hist[0].actor_profile_id === U_PA, hist);
check('no listing of A was published or deleted', (await q(`select count(*)::int as n from listings l join representations r on r.id = l.representation_id where r.partner_id = $1 and l.status = 'published'`, [PA]))[0].n === 0
  && (await q(`select count(*)::int as n from listings l join representations r on r.id = l.representation_id where r.partner_id = $1`, [PA]))[0].n === 5);

/* ---------- 5. the new commands, one by one ---------- */
const rA = rpcAs(U_PA); const rB = rpcAs(U_PB);
let r = await rB('zfind_partner_update_listing_commercial', { p_listing_id: ev.id, p_patch: { price_current: 1 } });
check('B cannot change A’s price (42501)', r.error && r.error.code === '42501', r);
r = await rA('zfind_partner_update_listing_commercial', { p_listing_id: B_LISTING, p_patch: { price_current: 1 } });
check('A cannot change B’s price (42501)', r.error && r.error.code === '42501', r);
r = await rA('zfind_partner_update_listing_commercial', { p_listing_id: ev.id, p_patch: { status: 'published' } });
check('no status through the commercial command (« Champ(s) non modifiable(s) »)', r.error && /non modifiable/.test(r.error.message) && (await listingOf('EV-1024', PA)).status === 'draft', r);
r = await rA('zfind_partner_update_listing_commercial', { p_listing_id: ev.id, p_patch: { transaction_type: 'rent' } });
check('a rent needs its period (French message)', r.error && /période du loyer/.test(r.error.message), r);
r = await rA('zfind_partner_update_listing_commercial', { p_listing_id: ev.id, p_patch: { transaction_type: 'rent', rental_period: 'monthly', price_current: 1500 } });
check('A switches its own listing to a monthly rent', !r.error && r.data.transaction_type === 'rent' && r.data.rental_period === 'monthly' && Number(r.data.price_current) === 1500 && r.data.status === 'draft', r);
r = await rA('zfind_partner_update_listing_commercial', { p_listing_id: ev.id, p_patch: { transaction_type: 'sale', price_current: 435000 } });
check('… and back to a sale (period cleared)', !r.error && r.data.rental_period === null, r);
r = await rA('zfind_partner_update_listing_commercial', { p_listing_id: ev.id, p_patch: { price_current: -5 } });
check('negative price refused', r.error && /Prix invalide/.test(r.error.message), r);

r = await rB('zfind_partner_archive_imported_listing', { p_listing_id: ev.id });
check('B cannot archive A’s listing', r.error && r.error.code === '42501' && (await listingOf('EV-1024', PA)).status === 'draft', r);
r = await rA('zfind_partner_archive_imported_listing', { p_listing_id: B_LISTING });
check('A cannot archive B’s listing', r.error && r.error.code === '42501', r);
r = await rA('zfind_partner_archive_imported_listing', { p_listing_id: A_MANUAL });
check('A cannot archive its hand-made listing through the import command (no agency reference)', r.error && r.error.code === '55000' && (await q(`select status from listings where id = $1`, [A_MANUAL]))[0].status === 'draft', r);
r = await rA('zfind_partner_archive_imported_listing', { p_listing_id: pubA.id });
check('archiving again is idempotent (returns the archived listing)', !r.error && r.data.status === 'archived', r);
r = await rA('zfind_partner_update_listing_commercial', { p_listing_id: pubA.id, p_patch: { price_current: 2 } });
check('an archived listing can no longer be changed by the agency', r.error && r.error.code === '42501', r);
r = await rA('zfind_partner_submit_listing', { p_listing_id: pubA.id });
check('an archived listing cannot be re-submitted (no way back from « archivée »)', !!r.error, r);

r = await rB('zfind_partner_queue_listing_photos', { p_listing_id: ev.id, p_urls: ['https://x.test/a.jpg'], p_offset: 0 });
check('B cannot queue photos on A’s listing', r.error && r.error.code === '42501', r);
r = await rA('zfind_partner_queue_listing_photos', { p_listing_id: ev.id, p_urls: ['https://x.test/a.jpg', 'https://x.test/a.jpg', 'javascript:alert(1)', 'ftp://x.test/b.jpg', ' https://x.test/c.jpg '], p_offset: 3 });
check('photo links: duplicates and non-http(s) dropped, positions after the existing ones', !r.error && r.data === 2 && (await q(`select position from zfind_media_import_queue where listing_id = $1 and url like 'https://x.test/%' order by position`, [ev.id])).map(x => x.position).join() === '3,4', r);
r = await rA('zfind_partner_queue_listing_photos', { p_listing_id: ev.id, p_urls: ['https://x.test/a.jpg'], p_offset: 0 });
check('… queuing the same link again does nothing (idempotent)', !r.error && r.data === 0, r);
r = await rA('zfind_partner_queue_listing_photos', { p_listing_id: ev.id, p_urls: Array.from({ length: 60 }, (_, i) => `https://y.test/${i}.jpg`), p_offset: 38 });
check('at most 40 photos per listing', !r.error && r.data === 2, r);
const queueRead = await as(U_PB, () => tryq(`select count(*)::int as n from zfind_media_import_queue`));
check('B reads none of A’s queued photos (RLS)', !queueRead.error && queueRead.rows[0].n === 0, queueRead);
const queueReadA = await as(U_PA, () => tryq(`select count(*)::int as n from zfind_media_import_queue`));
check('A reads its own queued photos (progress)', !queueReadA.error && queueReadA.rows[0].n > 0, queueReadA);

/* ---------- 6. agency B imports the same file: its own listings only ---------- */
res = await partnerImport(U_PB, 'annonces-v1-latin1.csv', { fullSync: false });
check('B: EV-1024 and TH-2031 created for B, its PUB-77 updated; A’s listings untouched', res.plan.counts.create === 2 && res.plan.counts.update + res.plan.counts.unchanged === 1
  && (await listingOf('EV-1024', PB)).partner_id === PB && Number((await listingOf('EV-1024', PA)).price_current) === 435000, res.plan.counts);

/* ---------- 7. feed settings and the secret ---------- */
r = await rA('zfind_partner_save_feed', { p_url: 'http://export.lacimmo.test/annonces.zip' });
check('feed: http:// refused (https only, French message)', r.error && /https:\/\//.test(r.error.message), r);
for (const bad of ['https://localhost/a.csv', 'https://10.0.0.4/a.csv', 'https://169.254.169.254/latest', 'https://user:pw@export.test/a.csv', 'ftp://export.test/a.csv', 'https://intranet.local/a.csv']) {
  r = await rA('zfind_partner_save_feed', { p_url: bad });
  check(`feed: ${bad} refused`, !!r.error, r);
}
r = await rA('zfind_partner_save_feed', { p_url: 'https://export.lacimmo.test/zfind/annonces.zip', p_auth_user: 'lacimmo', p_password: 'S3cret-feed!', p_full_sync: true });
check('feed saved: password never returned, has_password = true', !r.error && r.data.has_password === true && !JSON.stringify(r.data).includes('S3cret') && r.data.full_sync === true && r.data.active === true, r);
const feedId = r.data.id;
r = await rA('zfind_partner_save_feed', { p_url: 'https://export.lacimmo.test/zfind/annonces.zip', p_auth_user: 'lacimmo', p_password: '', p_full_sync: false });
check('saving without a password keeps the stored one', !r.error && r.data.has_password === true && r.data.full_sync === false && (await q(`select password from zfind_listing_feed_secrets where feed_id = $1`, [feedId]))[0].password === 'S3cret-feed!', r);
r = await rA('zfind_partner_get_feed', {});
check('get_feed: own feed, no password', !r.error && r.data.id === feedId && !('password' in r.data) && !JSON.stringify(r.data).includes('S3cret'), r);
check('B does not see A’s feed', (await rB('zfind_partner_get_feed', {})).data === null);
for (const [who, uid, role] of [['authenticated (A)', U_PA, null], ['anon', null, 'anon']]) {
  const s1 = await as(uid, () => tryq(`select * from public.zfind_listing_feed_secrets`), role);
  const s2 = await as(uid, () => tryq(`select * from public.zfind_listing_feeds`), role);
  check(`${who}: secrets table not readable`, !!s1.error && /permission denied/.test(s1.error.message), s1);
  check(`${who}: feeds table not readable directly`, !!s2.error && /permission denied/.test(s2.error.message), s2);
  const c1 = await as(uid, () => tryq(`select * from public.zfind_feed_claim('test', 5)`), role);
  check(`${who}: zfind_feed_claim (returns the password) not executable`, !!c1.error && /permission denied/.test(c1.error.message), c1);
  const c2 = await as(uid, () => tryq(`select public.zfind_feed_call($1, 'zfind_partner_import_portfolio', '{}')`, [feedId]), role);
  check(`${who}: zfind_feed_call not executable`, !!c2.error && /permission denied/.test(c2.error.message), c2);
}
const grants = await q(`select grantee, privilege_type from information_schema.role_table_grants where table_name = 'zfind_listing_feed_secrets' and grantee in ('anon', 'authenticated', 'public')`);
check('no grant at all on the secrets table to anon / authenticated / public', grants.length === 0, grants);
const fnGrants = await q(`select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'zfind_feed_%' or p.proname like 'zfind_partner_%feed%' or p.proname like 'zfind_admin_%feed%' or p.proname in ('zfind_listing_feed_public', 'zfind_partner_update_listing_commercial', 'zfind_partner_archive_imported_listing', 'zfind_partner_queue_listing_photos', 'zfind_partner_import_portfolio')) order by 1`);
const g = Object.fromEntries(fnGrants.map(x => [x.proname, x]));
check('grants: server functions to service_role only; Partner / Admin commands to authenticated; nothing to anon',
  ['zfind_feed_claim', 'zfind_feed_record', 'zfind_feed_call', 'zfind_listing_feed_public', 'zfind_partner_feed_partner'].every(n => g[n] && !g[n].auth && !g[n].anon)
  && ['zfind_partner_save_feed', 'zfind_partner_get_feed', 'zfind_partner_request_feed_test', 'zfind_admin_list_feeds', 'zfind_partner_update_listing_commercial', 'zfind_partner_archive_imported_listing', 'zfind_partner_queue_listing_photos', 'zfind_partner_import_portfolio'].every(n => g[n] && g[n].auth && !g[n].anon), fnGrants);
const definer = await q(`select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('zfind_partner_update_listing_commercial', 'zfind_partner_archive_imported_listing', 'zfind_partner_queue_listing_photos', 'zfind_partner_import_portfolio', 'zfind_partner_save_feed', 'zfind_partner_get_feed', 'zfind_feed_call', 'zfind_feed_claim', 'zfind_feed_record', 'zfind_admin_list_feeds')`);
check('every new command is SECURITY DEFINER with a pinned search_path', definer.length === 10 && definer.every(d => d.prosecdef && (d.proconfig || []).some(c => /^search_path=/.test(c))), definer);
const claimed = await asService(() => tryq(`select * from public.zfind_feed_claim('test', 5)`));
check('the server (service_role) does see the password — and only through zfind_feed_claim', !claimed.error && claimed.rows.length === 0 /* no test requested yet */, claimed);
r = await rA('zfind_partner_request_feed_test', {});
check('« Tester le flux » requested', !r.error && !!r.data.test_requested_at, r);
r = await rA('zfind_partner_request_feed_test', {});
check('… not twice within a few seconds', r.error && /déjà en cours/.test(r.error.message), r);
const claimedTest = await asService(() => tryq(`select * from public.zfind_feed_claim('test', 5)`));
check('service claims the test with the password', !claimedTest.error && claimedTest.rows.length === 1 && claimedTest.rows[0].password === 'S3cret-feed!', claimedTest);
r = await rA('zfind_partner_save_feed', { p_url: 'https://export.lacimmo.test/zfind/annonces.zip', p_auth_user: '', p_full_sync: false });
check('removing the user removes the password', !r.error && r.data.has_password === false && (await q(`select count(*)::int as n from zfind_listing_feed_secrets`))[0].n === 0, r);
await rA('zfind_partner_save_feed', { p_url: 'https://export.lacimmo.test/zfind/annonces.zip', p_auth_user: 'lacimmo', p_password: 'S3cret-feed!', p_full_sync: true });
r = await rA('zfind_partner_accept_feed_volume', {});
check('nothing to confirm when no volume was flagged', r.error && /Aucune baisse/.test(r.error.message), r);

/* ---------- 8. Admin feed commands ---------- */
check('a partner cannot list all feeds', /Admin role required/.test(((await rA('zfind_admin_list_feeds', {})).error || {}).message || ''));
check('a partner cannot disable / run a feed through the Admin commands', !!(await rA('zfind_admin_set_feed_active', { p_feed_id: feedId, p_active: false })).error && !!(await rA('zfind_admin_request_feed_run', { p_feed_id: feedId })).error);
r = await rpcAs(ADM)('zfind_admin_list_feeds', {});
check('admin lists the feeds with the agency name, never the password', !r.error && r.data.length === 1 && r.data[0].partner_name === 'LAC IMMO' && !JSON.stringify(r.data).includes('S3cret'), r);
r = await rpcAs(ADM)('zfind_admin_request_feed_run', { p_feed_id: feedId });
check('admin « Lancer maintenant »', !r.error && !!r.data.run_requested_at, r);
r = await rpcAs(ADM)('zfind_admin_set_feed_active', { p_feed_id: feedId, p_active: false });
check('admin disables the feed (pending run cancelled)', !r.error && r.data.disabled_by_admin === true && r.data.active === false && r.data.run_requested_at === null, r);
r = await rA('zfind_partner_save_feed', { p_url: 'https://export.lacimmo.test/zfind/annonces.zip', p_auth_user: 'lacimmo', p_active: true });
check('… the agency cannot reactivate a feed disabled by Z Find', r.error && /désactivé par l’équipe Z Find/.test(r.error.message), r);
r = await rpcAs(ADM)('zfind_admin_request_feed_run', { p_feed_id: feedId });
check('… nor can it be run while disabled', r.error && /désactivé/.test(r.error.message), r);
const call = await asService(() => tryq(`select public.zfind_feed_call($1, 'zfind_partner_import_portfolio', '{}') as r`, [feedId]));
check('a disabled feed cannot act for the agency', !!call.error && /désactivé/.test(call.error.message), call);
r = await rpcAs(ADM)('zfind_admin_set_feed_active', { p_feed_id: feedId, p_active: true });
check('admin reactivates it', !r.error && r.data.disabled_by_admin === false && r.data.active === true, r);

/* ---------- 9. zfind_feed_call: as the agency, whitelisted ---------- */
let c = await asService(() => tryq(`select public.zfind_feed_call($1, 'zfind_partner_import_portfolio', '{}') as r`, [feedId]));
check('feed_call reads the portfolio of the feed’s agency (A): its 4 imported properties, not B’s', !c.error && c.rows[0].r.length === 4 && !c.rows[0].r.some(e => e.listings.some(l => l.id === B_LISTING)), c && c.rows && c.rows[0].r.map(e => e.properties.agency_reference));
c = await asService(() => tryq(`select public.zfind_feed_call($1, 'zfind_partner_update_listing_commercial', $2) as r`, [feedId, JSON.stringify({ p_listing_id: B_LISTING, p_patch: { price_current: 1 } })]));
check('feed_call cannot touch another agency’s listing (the Partner check applies)', !!c.error && /Accès refusé/.test(c.error.message), c);
c = await asService(() => tryq(`select public.zfind_feed_call($1, 'zfind_admin_transition_listing', $2) as r`, [feedId, JSON.stringify({ p_listing_id: ev.id, p_to_status: 'published' })]));
check('feed_call refuses any command outside the import whitelist (no publication)', !!c.error && /non autorisée/.test(c.error.message), c);
c = await asService(() => tryq(`select public.zfind_feed_call($1, 'zfind_partner_archive_imported_listing', $2) as r`, [feedId, JSON.stringify({ p_listing_id: A_MANUAL })]));
check('feed_call cannot archive a hand-made listing either', !!c.error && (await q(`select status from listings where id = $1`, [A_MANUAL]))[0].status === 'draft', c);
const settings = await asService(() => tryq(`select current_setting('request.jwt.claim.sub', true) as s`));
check('the agency identity does not leak after the call', !settings.error && !settings.rows[0].s, settings);

/* ---------- 10. idempotent migration ---------- */
const before = await q(`select (select count(*) from pg_policies where tablename in ('zfind_media_import_queue')) as pol, (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like '%feed%') as fns, (select count(*) from zfind_listing_feeds) as feeds, (select count(*) from zfind_listing_feed_secrets) as secrets`);
const again = await t.db.exec(MIG(FEED_MIG)).then(() => ({}), e => ({ error: e }));
const after = await q(`select (select count(*) from pg_policies where tablename in ('zfind_media_import_queue')) as pol, (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like '%feed%') as fns, (select count(*) from zfind_listing_feeds) as feeds, (select count(*) from zfind_listing_feed_secrets) as secrets`);
check('migration applied a third time: no error, same functions / policies, data kept', !again.error && JSON.stringify(before) === JSON.stringify(after), { before, after, error: again.error && again.error.message });

void callRpc; void U_PA2;
console.log(`\n${pass} checks passed${process.exitCode ? ' — WITH FAILURES' : ''}`);
