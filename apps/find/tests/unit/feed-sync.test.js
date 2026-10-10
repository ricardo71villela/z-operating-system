/* Contract: agency self-service import + « Flux automatique ».
   - shared module limits (50 Mo ZIP / 20 Mo CSV / 2 000 listings, ZIP that
     expands too much), feed safety rule (empty, drop > 50 %);
   - /api/feed-sync pure parts: what a run stores, who is e-mailed;
   - api/_lib/url-guard: private / reserved addresses (IPv4, IPv6, mapped,
     NAT64), DNS answers, redirect to a private address, credentials only
     to the first origin, size cap without Content-Length, timeout;
   - services/listing-submission « Soumettre toutes les annonces prêtes ».
   Local HTTP server only; no network. */
'use strict';
const path = require('path');
const http = require('http');
const assert = require('assert');
const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const imp = require(path.join(WEB, 'src', 'services', 'listing-import', 'listing-import.js'));
const guard = require(path.join(WEB, 'api', '_lib', 'url-guard.js'));
const feed = require(path.join(WEB, 'api', 'feed-sync.js'))._internals;
const LS = require(path.join(WEB, 'src', 'services', 'listing-submission.js'));
let passed = 0;
function check(label, value, extra) { if (!value && extra !== undefined) console.error(JSON.stringify(extra, null, 1)); assert(value, label); passed += 1; console.log('PASS:', label); }

(async () => {
  /* ---------- limits ---------- */
  const MB = 1024 * 1024;
  check('limits: 50 Mo ZIP, 20 Mo CSV, 2 000 listings', imp.LIMITS.zipBytes === 50 * MB && imp.LIMITS.textBytes === 20 * MB && imp.LIMITS.rows === 2000);
  check('a 21 Mo CSV is refused (French message)', /trop volumineux.*CSV.*20 Mo/.test(imp.fileSizeError('annonces.csv', 21 * MB)));
  check('a 20 Mo CSV is accepted', imp.fileSizeError('annonces.csv', 20 * MB) === null);
  check('a 49 Mo ZIP is accepted, 51 Mo refused', imp.fileSizeError('export.zip', 49 * MB) === null && /ZIP.*50 Mo/.test(imp.fileSizeError('export.zip', 51 * MB)));
  check('a ZIP is recognised by its content, whatever its name', imp.fileSizeError('annonces.csv', 30 * MB, true) === null && imp.looksLikeZip(new Uint8Array([0x50, 0x4b, 3, 4, 0])) && !imp.looksLikeZip(new Uint8Array([0x21, 0x23])));
  check('an empty file is refused in the panel', imp.fileSizeError('a.csv', 0) === 'Le fichier est vide.');
  check('2 000 listings accepted, 2 001 refused with the advice to split', imp.rowCountError(2000) === null && /2\s001 annonces.*2\s000 au maximum/.test(imp.rowCountError(2001)));

  const JSZip = require('jszip');
  const big = new JSZip();
  big.file('annonces.csv', 'a;b\r\n' + 'x'.repeat(21 * MB));
  const bigBytes = await big.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  let err = null;
  try { await imp.readBytes(bigBytes, JSZip); } catch (e) { err = e; }
  check(`a ${Math.round(bigBytes.length / 1024)} Ko ZIP whose annonces.csv expands to 21 Mo is refused`, err && /trop volumineux une fois décompressé/.test(err.message), err && err.message);

  /* ---------- feed safety ---------- */
  const s0 = imp.feedSafety(10, 0);
  check('safety: 0 listing → nothing archived, « à vérifier »', !s0.allowArchive && s0.flag === 'empty' && /aucune annonce n’a été retirée/.test(s0.message));
  check('safety: first run with 0 listing → flagged too', imp.feedSafety(null, 0).flag === 'empty');
  const s1 = imp.feedSafety(10, 4);
  check('safety: 10 → 4 (drop > 50 %) → nothing archived, French message with both counts', !s1.allowArchive && s1.flag === 'drop' && /4 annonces contre 10/.test(s1.message), s1);
  check('safety: 10 → 5 (exactly half) → allowed', imp.feedSafety(10, 5).allowArchive);
  check('safety: first run (no previous count) → allowed', imp.feedSafety(null, 3).allowArchive);

  const rows = [{ reference: 'A', errors: [], warnings: [], transaction: 'sale', subtype: 'apartment', price: 1, title: 'x', photos: [], photoFiles: [] }];
  const portfolio = imp.portfolioFromRows([{ id: 'r1', status: 'active', properties: { id: 'p1', agency_reference: 'B', subtype: 'apartment' }, listings: [{ id: 'l1', status: 'draft', transaction_type: 'sale', price_current: 1, listing_content: [{ locale: 'fr', title: 'B' }] }] }]);
  const blocked = imp.planSync(rows, portfolio, { country: 'BE', fullSync: true, archiveBlockedReason: s1.message });
  check('planSync: with the safety reason, the absent listing is NOT planned for archiving and the reason is shown', blocked.counts.archive === 0 && blocked.archiveBlocked === s1.message, blocked.counts);
  const allowed = imp.planSync(rows, portfolio, { country: 'BE', fullSync: true });
  check('… without it (full import), it is', allowed.counts.archive === 1);

  /* ---------- what a run stores ---------- */
  const at = '2026-10-10T02:15:00.000Z';
  let o = feed.outcomePatch({ consecutive_failures: 0, last_listing_count: 10 }, { status: 'ok', listingCount: 9, message: 'ok', counts: {} }, at, 'nightly');
  check('ok run: new reference count, failures reset, no e-mail', o.patch.last_listing_count === 9 && o.patch.consecutive_failures === 0 && !o.notify.failure && !o.notify.flag && o.patch.last_completed_at === at);
  o = feed.outcomePatch({ last_listing_count: 10 }, { status: 'flagged', flag: 'drop', listingCount: 3, message: 'x' }, at, 'nightly');
  check('flagged run: reference count kept, flagged count stored, e-mail', !('last_listing_count' in o.patch) && o.patch.flagged_listing_count === 3 && o.notify.flag);
  o = feed.outcomePatch({ last_listing_count: 10, flagged_listing_count: 3, flag_notified_at: at }, { status: 'flagged', flag: 'drop', listingCount: 3, message: 'x' }, at, 'nightly');
  check('same suspicious volume the next night: no second e-mail', !o.notify.flag);
  o = feed.outcomePatch({ last_listing_count: 10 }, { status: 'partial', flag: 'drop', listingCount: 3, message: 'x' }, at, 'nightly');
  check('a run cut by the time budget while flagged never makes the low volume the reference', !('last_listing_count' in o.patch) && o.patch.flagged_listing_count === 3 && !('last_completed_at' in o.patch));
  o = feed.outcomePatch({ last_listing_count: 10 }, { status: 'partial', listingCount: 10, message: 'x' }, at, 'nightly');
  check('partial run: not « complete »', o.patch.last_status === 'partial' && !('last_completed_at' in o.patch));
  o = feed.outcomePatch({ consecutive_failures: 0 }, { status: 'error', message: 'Échec' }, at, 'nightly');
  check('first failure: counted, no e-mail', o.patch.consecutive_failures === 1 && !o.notify.failure);
  o = feed.outcomePatch({ consecutive_failures: 1 }, { status: 'error', message: 'Échec' }, at, 'nightly');
  check('second failure in a row: one e-mail', o.patch.consecutive_failures === 2 && o.notify.failure && o.patch.failure_notified_at === at);
  o = feed.outcomePatch({ consecutive_failures: 2, failure_notified_at: at }, { status: 'error', message: 'Échec' }, at, 'nightly');
  check('third failure: no new e-mail', o.patch.consecutive_failures === 3 && !o.notify.failure);
  o = feed.outcomePatch({ consecutive_failures: 1 }, { status: 'error', message: 'Échec' }, at, 'requested');
  check('an Admin « Lancer maintenant » failure does not count as a night', !('consecutive_failures' in o.patch) && !o.notify.failure);
  const mail = feed.feedEmail('failure', { partner_name: 'LAC IMMO', url: 'https://x.test/a.csv' }, { message: 'Échec : délai dépassé' }, ['agent@lac.test']);
  check('failure e-mail in French, to the agency', mail.to[0] === 'agent@lac.test' && /Flux en échec : LAC IMMO/.test(mail.subject) && /deuxième nuit/.test(mail.text) && /Flux automatique/.test(mail.html));

  /* ---------- private addresses ---------- */
  const priv = ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '198.18.0.1', '192.0.0.170', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'fd00::1', 'fc12::5', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '64:ff9b::a9fe:a9fe', '::127.0.0.1', '2001:db8::1', 'fec0::1', 'not-an-ip'];
  const pub = ['93.184.216.34', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:93.184.216.34', '64:ff9b::808:808'];
  check('private / reserved addresses refused (IPv4, IPv6, mapped and NAT64 forms)', priv.every(ip => guard.privateIp(ip)), priv.filter(ip => !guard.privateIp(ip)));
  check('public addresses allowed', pub.every(ip => !guard.privateIp(ip)), pub.filter(ip => guard.privateIp(ip)));
  const lookupOf = map => (host, opts, cb) => (map[host] ? cb(null, map[host].map(a => ({ address: a, family: a.includes(':') ? 6 : 4 }))) : cb(Object.assign(new Error('nf'), { code: 'ENOTFOUND' })));
  const dnsMap = { 'public.test': ['93.184.216.34'], 'rebind.test': ['10.0.0.8'], 'mixed.test': ['93.184.216.34', '192.168.0.4'], 'v6.test': ['::ffff:7f00:1'] };
  for (const [url, ok] of [['https://public.test/a.csv', true], ['https://rebind.test/a.csv', false], ['https://mixed.test/a.csv', false], ['https://v6.test/a.csv', false], ['https://[::ffff:127.0.0.1]/a.csv', false], ['https://localhost/a.csv', false], ['https://x.internal/a', false], ['file:///etc/passwd', false], ['https://u:p@public.test/a', false]]) {
    let e2 = null;
    try { await guard.checkUrl(url, { lookup: lookupOf(dnsMap), httpsOnly: true }); } catch (e) { e2 = e; }
    check(`checkUrl ${url} → ${ok ? 'allowed' : 'refused'}`, ok ? !e2 : !!e2, e2 && e2.message);
  }

  /* ---------- guarded fetch against a local server ---------- */
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push({ url: req.url, host: req.headers.host, auth: req.headers.authorization || null });
    if (req.url === '/to-private') { res.writeHead(302, { Location: 'http://rebind.test/secret' }); return res.end(); }
    if (req.url === '/to-metadata') { res.writeHead(301, { Location: 'http://169.254.169.254/latest/meta-data/' }); return res.end(); }
    if (req.url === '/to-other') { res.writeHead(302, { Location: `http://other.test:${port}/ok` }); return res.end(); }
    if (req.url === '/loop') { res.writeHead(302, { Location: '/loop' }); return res.end(); }
    if (req.url === '/big') { res.writeHead(200, { 'Content-Type': 'text/csv' }); let n = 0; const chunk = Buffer.alloc(64 * 1024, 120); const pump = () => { while (n < 40) { n += 1; if (!res.write(chunk)) return res.once('drain', pump); } res.end(); }; return pump(); }
    if (req.url === '/slow') { setTimeout(() => { res.writeHead(200); res.end('late'); }, 1500); return; }
    res.writeHead(200, { 'Content-Type': 'text/csv' }); res.end('ref;prix\r\nA;1\r\n');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const local = { lookup: lookupOf({ 'feed.test': ['127.0.0.1'], 'other.test': ['127.0.0.1'], 'rebind.test': ['10.0.0.8'] }), allowAddresses: new Set(['127.0.0.1']) };
  const get = async (p, extra) => { try { return { r: await guard.guardedFetch(`http://feed.test:${port}${p}`, Object.assign({}, local, extra || {})) }; } catch (e) { return { e }; } };
  let g = await get('/ok', { credentials: { user: 'u', password: 'p' } });
  check('guardedFetch: body read, credentials sent to the feed', g.r && g.r.status === 200 && Buffer.from(g.r.bytes).toString() === 'ref;prix\r\nA;1\r\n' && hits[hits.length - 1].auth === 'Basic ' + Buffer.from('u:p').toString('base64'));
  hits.length = 0;
  g = await get('/to-private');
  check('redirect to a host resolving to a private IP: refused, never connected', g.e && /adresse interne/.test(g.e.message) && hits.length === 1, g.e && g.e.message);
  g = await get('/to-metadata');
  check('redirect to 169.254.169.254 (cloud metadata): refused', g.e && /adresse interne/.test(g.e.message));
  hits.length = 0;
  g = await get('/to-other', { credentials: { user: 'u', password: 'p' } });
  check('redirect to another origin: followed WITHOUT the credentials', g.r && g.r.status === 200 && hits.length === 2 && hits[0].auth && hits[1].auth === null, hits);
  g = await get('/loop');
  check('redirect loop stopped (« trop de redirections »)', g.e && /trop de redirections/.test(g.e.message));
  g = await get('/big', { maxBytes: 1 * MB });
  check('size cap enforced while streaming (no Content-Length): 2.5 Mo refused at 1 Mo', g.e && /trop volumineux/.test(g.e.message), g.e && g.e.message);
  g = await get('/slow', { timeoutMs: 300 });
  check('timeout', g.e && /délai dépassé/.test(g.e.message), g.e && g.e.message);
  g = await get('/ok', { allowAddresses: new Set() });
  check('without the test allowance, the local server itself is refused (127.0.0.1)', g.e && /adresse interne/.test(g.e.message));
  g = await get('/ok', { httpsOnly: true });
  check('feeds: http:// refused', g.e && /non https/.test(g.e.message));
  server.close();

  /* ---------- « Soumettre toutes les annonces prêtes » ---------- */
  const status = [
    { listing_id: 'l1', status: 'draft', missing: [] },
    { listing_id: 'l2', status: 'draft', missing: ['photo'] },
    { listing_id: 'l3', status: 'incomplete', missing: ['photo', 'compliance_facts'] },
    { listing_id: 'l4', status: 'published', missing: [] },
    { listing_id: 'l5', status: 'draft', missing: [] }
  ];
  const submitted = [];
  const results = await LS.submitAllReady(['l1', 'l2', 'l3', 'l4', 'l5', 'l1', 'l6'], {
    listStatuses: async ids => ({ data: status.filter(s => ids.includes(s.listing_id)), error: null }),
    submit: async id => { submitted.push(id); return id === 'l5' ? { data: null, error: { message: 'Soumission impossible. Il manque : la commune du bien.' } } : { data: { status: 'pending_review' }, error: null }; }
  });
  check('submit-all: only ready drafts are submitted, one after the other', JSON.stringify(submitted) === '["l1","l5"]', submitted);
  const by = Object.fromEntries(results.map(r => [r.listingId, r]));
  check('submit-all: each blocked listing says what is missing (French)', by.l2.outcome === 'blocked' && by.l2.reason === 'il manque au moins une photo' && by.l3.reason === 'il manque au moins une photo, les mentions obligatoires (France) complètes et enregistrées' && by.l5.outcome === 'blocked' && /la commune du bien/.test(by.l5.reason), results);
  check('submit-all: published / unknown listings are skipped, never touched', by.l4.outcome === 'skipped' && by.l6.outcome === 'skipped' && results.length === 6);
  check('submit-all summary', LS.summarizeSubmitAll(results) === '1 soumise à validation, 3 bloquées (photo : 2 ; mentions obligatoires : 1 ; commune : 1), 2 ignorées (pas en brouillon)', LS.summarizeSubmitAll(results));

  console.log(`\nFEED SYNC / SELF-SERVICE IMPORT: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
