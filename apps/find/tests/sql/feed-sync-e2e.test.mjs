/* ============================================================
   Z FIND — « Flux automatique » end to end: the REAL /api/feed-sync
   handler (zfind-web/api/feed-sync.js) against
   - a local HTTPS server serving an agency's Poliris export (throwaway
     self-signed certificate made with openssl for this run),
   - an in-memory Postgres (PGlite) with migration 20261010120000: every
     server call goes through the same SQL functions as with the service
     key (zfind_feed_claim, zfind_feed_call as the agency, zfind_feed_record).
   No network, no Supabase, no Resend (e-mails captured).
   Nights:
     1. v1 export → 3 drafts created (+1 line in error);
     2. v2 export (price changed, one listing gone, one new) → update,
        archive, create;
     3. empty file → NOTHING archived, feed « à vérifier » (flagged),
        e-mail to the agency;
     4–5. server error two nights in a row → one failure e-mail;
     6. back to normal after the agency confirms the volume.
   Plus « Tester le flux » (no write), the ZIP export, a feed redirecting
   to a private address (refused), and the cron secret.
   Run: node tests/sql/feed-sync-e2e.test.mjs
   ============================================================ */
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import { execFileSync } from 'child_process';
import { createDb, FIND } from './_partner-import-db.mjs';

const require = createRequire(import.meta.url);
const FIX = name => fs.readFileSync(path.join(FIND, 'tests', 'fixtures', 'poliris', name));

let pass = 0;
function check(label, ok, extra) {
  if (ok) { pass += 1; console.log('PASS:', label); return; }
  console.error('FAIL:', label, extra === undefined ? '' : JSON.stringify(extra, null, 1).slice(0, 2000));
  process.exitCode = 1;
}

/* ---------- local HTTPS feed server ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zfind-feed-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(tmp, 'key.pem'), '-out', path.join(tmp, 'cert.pem'), '-days', '1',
  '-subj', '/CN=export.lacimmo.test', '-addext', 'subjectAltName=DNS:export.lacimmo.test,DNS:other.lacimmo.test'], { stdio: 'ignore' });
const cert = fs.readFileSync(path.join(tmp, 'cert.pem'));
let serve = { status: 200, body: Buffer.alloc(0), type: 'text/csv' };
const seen = [];
const server = https.createServer({ key: fs.readFileSync(path.join(tmp, 'key.pem')), cert }, (req, res) => {
  seen.push({ url: req.url, host: req.headers.host, auth: req.headers.authorization || null });
  if (req.url.startsWith('/redirect-private')) { res.writeHead(302, { Location: 'https://metadata.lacimmo.test/latest/meta-data' }); return res.end(); }
  if (req.url.startsWith('/redirect-other')) { res.writeHead(302, { Location: `https://other.lacimmo.test:${port}/zfind/annonces.csv` }); return res.end(); }
  if (req.headers.authorization !== 'Basic ' + Buffer.from('lacimmo:S3cret-feed!').toString('base64')) { res.writeHead(401); return res.end(); }
  res.writeHead(serve.status, { 'Content-Type': serve.type });
  res.end(serve.body);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const HOSTS = { 'export.lacimmo.test': '127.0.0.1', 'other.lacimmo.test': '127.0.0.1', 'metadata.lacimmo.test': '169.254.169.254' };
const lookup = (host, opts, cb) => { const a = HOSTS[host]; if (!a) return cb(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })); return cb(null, [{ address: a, family: 4 }]); };

/* ---------- database + handler wired to it ---------- */
const t = await createDb();
const { q, as, callRpc, rpcAs, ids: { PA, U_PA, ADM } } = t;
process.env.ZFIND_SUPABASE_SERVICE_KEY = 'test-only-not-a-key';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.PARTNER_BASE_URL = 'https://partner.zfind.online';
process.env.ZFIND_LEAD_NOTIFY_EMAIL = 'equipe@zfind.test';
const mails = [];
const dbCalls = [];
const handler = require(path.join(FIND, 'apps', 'zfind-web', 'api', 'feed-sync.js'));
handler._internals.setDepsForTests({
  lookup, allowAddresses: new Set(['127.0.0.1']), ca: cert,
  rpc: async (name, body) => {
    dbCalls.push(name);
    const r = await as(null, () => callRpc(name, body), 'service_role');
    if (r.error) throw new Error(`db 400: ${JSON.stringify({ message: r.error.message, code: r.error.code })}`);
    return r.data;
  },
  uploadMedia: async (listingId, file) => ({ data: { id: 'asset-' + listingId.slice(0, 4) + '-' + file.length }, error: null }),
  sendMail: async m => { mails.push(m); return { id: 'captured' }; }
});
async function call(withSecret) {
  const res = { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await handler({ method: 'GET', headers: withSecret ? { authorization: 'Bearer test-cron-secret', 'x-forwarded-for': '10.9.9.9' } : { 'x-forwarded-for': '10.9.9.' + Math.floor(Math.random() * 200) } }, res);
  return { status: res.statusCode, json: JSON.parse(res.body || '{}') };
}
const nextNight = () => q(`update zfind_listing_feeds set last_run_at = now() - interval '21 hours' where last_run_at is not null`);
const feed = async () => (await rpcAs(U_PA)('zfind_partner_get_feed', {})).data;
const listings = async () => q(`select p.agency_reference as ref, l.status, l.price_current::float as price from listings l join representations r on r.id = l.representation_id join properties p on p.id = r.property_id where r.partner_id = $1 and p.agency_reference is not null order by 1`, [PA]);

/* ---------- the agency registers its feed ---------- */
const FEED_URL = `https://export.lacimmo.test:${port}/zfind/annonces.csv`;
let r = await rpcAs(U_PA)('zfind_partner_save_feed', { p_url: FEED_URL, p_auth_user: 'lacimmo', p_password: 'S3cret-feed!', p_full_sync: true });
check('agency saves its feed (https, basic auth, import complet)', !r.error && r.data.has_password, r);

let out = await call(false);
check('without the cron secret and nothing requested: nothing runs', out.status === 200 && out.json.runs.length === 0 && out.json.tests.length === 0, out);
const unauth = await call(false);
check('… in particular, no nightly run without the secret', unauth.json.runs.length === 0 && !(await feed()).last_run_at);

/* ---------- « Tester le flux »: read + compare, no write ---------- */
serve = { status: 200, body: FIX('annonces-v1-latin1.csv'), type: 'text/csv' };
await rpcAs(U_PA)('zfind_partner_request_feed_test', {});
out = await call(false);
let f = await feed();
check('« Tester le flux » runs from the panel’s nudge (no secret): counts, nothing written', out.json.tests.length === 1 && f.last_test && f.last_test.counts.create === 3 && f.last_test.counts.error === 1 && f.last_test.listingCount === 4 && f.test_requested_at === null
  && (await listings()).length === 0 && /3 à créer/.test(f.last_test.message), f && f.last_test);
check('credentials sent to the feed’s host', seen.length > 0 && seen.every(s => s.auth));

/* ---------- night 1: v1 → drafts ---------- */
out = await call(true);
f = await feed();
let L = await listings();
check('night 1: 3 drafts created, line in error reported, status ok', out.status === 200 && f.last_status === 'ok' && f.last_counts.created === 3 && f.last_counts.errors === 1 && L.length === 3 && L.every(x => x.status === 'draft'), { f, L });
check('night 1: « Dernière synchronisation » data for the panel (time, message, report lines)', !!f.last_run_at && /3 créées/.test(f.last_message) && f.last_report.length === 4 && f.last_listing_count === 4, f);
check('night 1: photo links queued for /api/media-import', (await q(`select count(*)::int as n from zfind_media_import_queue`))[0].n === 4);
check('every write went through zfind_feed_call (as the agency), never an Admin command', dbCalls.every(n => ['zfind_feed_claim', 'zfind_feed_call', 'zfind_feed_record', 'zfind_partner_recipients'].includes(n)));
const actors = await q(`select distinct h.actor_profile_id from find.listing_state_history h join listings l on l.id = h.listing_id join representations r on r.id = l.representation_id join properties p on p.id = r.property_id where p.agency_reference is not null and r.partner_id = $1`, [PA]);
check('the listings were created by the agency’s own user', actors.length === 1 && actors[0].actor_profile_id === U_PA, actors);
out = await call(true);
check('same night again: nothing to do (claimed only once per night)', out.json.runs.length === 0, out.json);

/* ---------- night 2: v2 → update + archive + create ---------- */
await nextNight();
serve = { status: 200, body: FIX('annonces-v2-latin1.csv'), type: 'text/csv' };
out = await call(true);
f = await feed();
L = await listings();
const by = Object.fromEntries(L.map(x => [x.ref, x]));
check('night 2: EV-1024 price 435 000, PUB-77 archived, EV-1100 created', f.last_status === 'ok' && by['EV-1024'].price === 435000 && by['PUB-77'].status === 'archived' && by['EV-1100'].status === 'draft' && f.last_counts.updated === 1 && f.last_counts.archived === 1 && f.last_counts.created === 1, { f: f.last_counts, L });
check('night 2: nothing published, nothing deleted', L.length === 4 && !L.some(x => x.status === 'published'));

/* ---------- night 3: empty file → nothing archived, flagged, e-mail ---------- */
await nextNight();
serve = { status: 200, body: Buffer.alloc(0), type: 'text/csv' };
out = await call(true);
f = await feed();
L = await listings();
check('night 3 (empty file): NOTHING archived', L.filter(x => x.status === 'archived').length === 1 && f.last_counts.archived === 0, { L, c: f.last_counts });
check('night 3: feed « à vérifier » (flagged), previous volume kept as the reference', f.last_status === 'flagged' && f.flagged_listing_count === 0 && f.last_listing_count === 4 && /aucune annonce n’a été retirée/.test(f.last_message), f);
check('night 3: the agency is e-mailed (Z Find in copy), in French', mails.length === 1 && mails[0].to.includes('agent@lac-immo.test') && /Flux à vérifier/.test(mails[0].subject) && (mails[0].bcc || []).includes('equipe@zfind.test') && /aucune annonce n’a été retirée/.test(mails[0].text), mails);

/* ---------- night 3b: a drop by more than half → same rule ---------- */
await nextNight();
const v2 = FIX('annonces-v2-latin1.csv').toString('latin1').split(/\r?\n/).filter(Boolean);
serve = { status: 200, body: Buffer.from(v2.slice(0, 1).join('\r\n') + '\r\n', 'latin1'), type: 'text/csv' };
out = await call(true);
f = await feed();
L = await listings();
check('night 3b (1 listing instead of 3): nothing archived, flagged again with the new count, one more e-mail', f.last_status === 'flagged' && f.flagged_listing_count === 1 && L.filter(x => x.status === 'archived').length === 1 && mails.length === 2, { f, L });

/* ---------- nights 4–5: server error twice → one failure e-mail ---------- */
await nextNight();
serve = { status: 500, body: Buffer.from('boom'), type: 'text/plain' };
out = await call(true);
f = await feed();
check('night 4: error recorded (« Échec : … HTTP 500 »), no e-mail yet', f.last_status === 'error' && f.consecutive_failures === 1 && /HTTP 500/.test(f.last_message) && mails.length === 2, f);
await nextNight();
out = await call(true);
f = await feed();
check('night 5: second failure in a row → one e-mail to the agency', f.consecutive_failures === 2 && mails.length === 3 && /Flux en échec/.test(mails[2].subject) && /deuxième nuit/.test(mails[2].text), { f, m: mails.map(m => m.subject) });
await nextNight();
out = await call(true);
check('night 6 still failing: no further e-mail', mails.length === 3 && (await feed()).consecutive_failures === 3);

/* ---------- the agency confirms the smaller volume; back to normal ---------- */
r = await rpcAs(U_PA)('zfind_partner_accept_feed_volume', {});
check('agency confirms the flagged volume', !r.error && r.data.last_listing_count === 1 && r.data.flagged_listing_count === null, r);
await nextNight();
serve = { status: 200, body: FIX('annonces-v2-latin1.csv'), type: 'text/csv' };
out = await call(true);
f = await feed();
check('next good night: status ok, failures reset, the volume is the new reference', f.last_status === 'ok' && f.consecutive_failures === 0 && f.last_listing_count === 4 && f.flagged_listing_count === null, f);

/* ---------- Admin « Lancer maintenant » with the ZIP export ---------- */
serve = { status: 200, body: FIX('lacimmo74.zip'), type: 'application/zip' };
r = await rpcAs(ADM)('zfind_admin_request_feed_run', { p_feed_id: f.id });
out = await call(false);
f = await feed();
check('Admin « Lancer maintenant » runs without the secret; ZIP read (format Poliris)', out.json.runs.length === 1 && f.run_requested_at === null && ['ok', 'flagged'].includes(f.last_status) && f.last_counts.file === 4, { o: out.json, s: f.last_status, m: f.last_message });

/* ---------- SSRF: redirects to a private address / another host ---------- */
const { fetchFeed } = handler._internals;
let err = null;
try { await fetchFeed(`https://export.lacimmo.test:${port}/redirect-private`, { user: 'lacimmo', password: 'S3cret-feed!' }); } catch (e) { err = e; }
check('a redirect to 169.254.169.254 (metadata) is refused', err && /adresse interne/.test(err.message), err && err.message);
seen.length = 0; err = null;
try { await fetchFeed(`https://export.lacimmo.test:${port}/redirect-other`, { user: 'lacimmo', password: 'S3cret-feed!' }); } catch (e) { err = e; }
check('a redirect to another host does not receive the credentials', seen.length === 2 && seen[0].auth && seen[1].auth === null && err && /accès refusé/.test(err.message), { seen, e: err && err.message });
err = null;
try { await fetchFeed(`http://export.lacimmo.test:${port}/zfind/annonces.csv`, null); } catch (e) { err = e; }
check('an http:// feed address is refused', err && /non https/.test(err.message), err && err.message);
err = null;
try { await fetchFeed('https://127.0.0.2/annonces.csv', null, { allowAddresses: new Set() }); } catch (e) { err = e; }
check('a literal private IP is refused', err && /adresse interne/.test(err.message), err && err.message);

await new Promise(r2 => server.close(r2));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} checks passed${process.exitCode ? ' — WITH FAILURES' : ''}`);
process.exit(process.exitCode || 0);
