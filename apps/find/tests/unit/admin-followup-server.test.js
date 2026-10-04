/* Contract (migration 20261004200000): server side of the Admin follow-up.
   - /api/estimation keeps each request for the Admin (never blocks the visitor);
   - assigned owner requests go to the agency (Reply-To the owner, Z Find in copy);
   - one reminder for enquiries unanswered after 24 h;
   - /api/media-import fetches queued photo links safely and attaches them.
   No network. */
'use strict';
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
let passed = 0;
function check(label, value) { assert(value, label); passed += 1; console.log('PASS:', label); }

const mails = []; const calls = []; const routes = {};
global.fetch = async (url, opts) => {
  const u = String(url);
  const body = opts && opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : (opts && opts.body);
  if (u.startsWith('https://api.resend.com/')) { mails.push(body); return { ok: true, status: 200, json: async () => ({ id: 'm' }), text: async () => '{}' }; }
  calls.push({ url: u, method: (opts && opts.method) || 'GET', body, headers: opts && opts.headers });
  const key = Object.keys(routes).find(k => u.includes(k));
  const data = key ? (typeof routes[key] === 'function' ? routes[key](u, body) : routes[key]) : [];
  return { ok: true, status: 200, text: async () => JSON.stringify(data), json: async () => data };
};

(async () => {
  console.log('\n=== Z FIND ADMIN FOLLOW-UP (SERVER) ===');
  Object.assign(process.env, { ZFIND_SUPABASE_SERVICE_KEY: 'sb_secret_test', RESEND_API_KEY: 'resend-test', ZFIND_EMAIL_FROM: 'Z Find <hello@zfind.online>', ZFIND_LEAD_NOTIFY_EMAIL: 'leads@zfind.online' });

  /* ---------------- estimation requests kept ---------------- */
  const est = require(path.join(WEB, 'api', 'estimation.js'));
  const engine = require(path.join(WEB, 'src', 'services', 'estimation.js'));
  const load = rel => Promise.resolve(JSON.parse(fs.readFileSync(path.join(WEB, 'public', rel), 'utf8')));
  const input = est._internals.cleanInput({ market: 'FR', communeCode: '74119', type: 'apartment', surface: 72, condition: 'good', energy: 'C', refine: { view: 'lake' } });
  const result = await engine.estimate(input, load);
  const contact = { name: 'Jean', email: 'jean@example.com', phone: '0600000000', project: 'sell_3m', alerts: false, agencyConsent: true };
  const row = est._internals.requestRow('fr', 'owner', input, result, 'Évian-les-Bains', contact);
  check('request row: owner, consent, contact, place', row.mode === 'owner' && row.agency_consent === true && row.email === 'jean@example.com' && row.place === 'Évian-les-Bains' && row.commune_code === '74119');
  check('request row: property line and estimate figures', row.property.line.includes('72 m²') && row.property.details.includes('lac panoramique') && row.estimate.central === result.central && row.estimate.low === result.low && row.estimate.confidence === result.confidence);
  calls.length = 0;
  check('stored with the server key', await est._internals.storeRequest('fr', 'owner', input, result, 'Évian', contact) === true
    && calls[0].url.endsWith('/rest/v1/zfind_estimation_requests') && calls[0].method === 'POST' && calls[0].headers.apikey === 'sb_secret_test');
  const save = global.fetch;
  global.fetch = async () => { throw new Error('down'); };
  check('storage failure never blocks the visitor', await est._internals.storeRequest('fr', 'owner', input, result, 'Évian', contact) === false);
  global.fetch = save;
  delete process.env.ZFIND_SUPABASE_SERVICE_KEY;
  calls.length = 0;
  check('no server key: nothing stored, no call', await est._internals.storeRequest('fr', 'owner', input, result, 'Évian', contact) === false && calls.length === 0);
  process.env.ZFIND_SUPABASE_SERVICE_KEY = 'sb_secret_test';
  check('handler stores after the e-mails', /await storeRequest\(lang, mode, input, result, place, contact\);/.test(fs.readFileSync(path.join(WEB, 'api', 'estimation.js'), 'utf8')));

  /* ---------------- assigned owner requests → agency ---------------- */
  const ln = require(path.join(WEB, 'api', 'lead-notify.js'));
  routes['rpc/zfind_pending_estimation_forwards'] = [
    { request_id: 'e1', lang: 'fr', place: 'Évian-les-Bains', name: 'Jean <b>', email: 'jean@example.com', phone: '0600', project: 'sell_3m',
      property: { line: 'Appartement, 72 m² · Évian-les-Bains', details: 'vue : lac panoramique' }, estimate: { low: 380000, high: 440000, central: 410000, confidence: 'high' },
      partner_name: 'LAC IMMO', recipients: ['agent@lac-immo.fr', 'not-an-email'] },
    { request_id: 'e2', place: 'Thonon', email: 'x@example.com', estimate: {}, property: {}, partner_name: 'NO ACCOUNT', recipients: [] }
  ];
  routes['rpc/zfind_mark_estimations_forwarded'] = 1;
  mails.length = 0; calls.length = 0;
  const er = await ln._internals.processEstimations(10);
  const m = mails[0];
  check('owner request sent to the agency only (valid addresses), Z Find in copy, Reply-To the owner', er.sent === 1 && mails.length === 1 && m.to.join() === 'agent@lac-immo.fr' && m.bcc[0] === 'leads@zfind.online' && m.reply_to === 'jean@example.com');
  check('French e-mail: subject, estimate, project, consent wording, escaped', m.subject === 'Nouveau vendeur via Z Find — Évian-les-Bains' && m.html.replace(/[  ]/g, ' ').includes('380 000 € – 440 000 €')
    && m.html.includes('Vendre d’ici 3 mois') && m.html.includes('accord du propriétaire') && m.html.includes('Jean &lt;b&gt;') && !m.html.includes('<b>'));
  const fmarks = calls.filter(c => /zfind_mark_estimations_forwarded/.test(c.url));
  check('marked forwarded; request without agency e-mail stays pending', er.skipped === 1 && fmarks.length === 1 && fmarks[0].body.p_ids[0] === 'e1' && fmarks[0].body.p_delivered === true);

  /* ---------------- 24 h reminders ---------------- */
  routes['rpc/zfind_pending_lead_reminders'] = [
    { lead_id: 'l1', created_at: '2026-10-03T08:00:00Z', name: 'Marie', email: 'marie@example.com', phone: null, listing_title: 'T3 vue lac', partner_name: 'LAC IMMO', recipients: ['agent@lac-immo.fr'] },
    { lead_id: 'l2', created_at: '2026-10-03T08:00:00Z', name: 'Paul', email: null, listing_title: null, recipients: [] }
  ];
  routes['rpc/zfind_mark_lead_reminders'] = 2;
  mails.length = 0; calls.length = 0;
  const rr = await ln._internals.processReminders(50);
  check('one reminder per unanswered enquiry, to the agency, Reply-To the person', rr.sent === 1 && mails.length === 1 && mails[0].to.join() === 'agent@lac-immo.fr' && mails[0].reply_to === 'marie@example.com');
  check('reminder text: title, « Répondue », partner panel link', mails[0].subject === 'Rappel : demande sans réponse — T3 vue lac' && mails[0].html.includes('Répondue') && mails[0].html.includes('https://partner.zfind.online'));
  const rm = calls.find(c => /zfind_mark_lead_reminders/.test(c.url));
  check('both marked (no address: nobody to remind, never retried)', rm && rm.body.p_ids.join() === 'l1,l2');
  const cronSrc = fs.readFileSync(path.join(WEB, 'api', 'cron-daily.js'), 'utf8');
  check('daily job: estimations and reminders steps', /step\('estimations'/.test(cronSrc) && /step\('reminders'/.test(cronSrc));
  check('lead-notify endpoint also forwards assigned estimations', /await processEstimations\(10\)/.test(fs.readFileSync(path.join(WEB, 'api', 'lead-notify.js'), 'utf8')));

  /* ---------------- media import ---------------- */
  const mi = require(path.join(WEB, 'api', 'media-import.js'));
  const P = mi._internals;
  check('private addresses recognised', ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', '::ffff:10.0.0.1', '100.64.0.1'].every(P.privateIp)
    && !['8.8.8.8', '151.101.1.1', '2a00:1450::1'].some(P.privateIp));
  const lookupPublic = async () => [{ address: '93.184.216.34' }];
  const lookupPrivate = async () => [{ address: '10.0.0.5' }];
  const rejects = async (p, re) => { try { await p; return false; } catch (e) { return re.test(e.message); } };
  check('links refused: not http(s), credentials, localhost, internal IP, name resolving to internal IP',
    await rejects(P.checkUrl('ftp://x.test/a.jpg', lookupPublic), /http/) && await rejects(P.checkUrl('https://u:p@x.test/a.jpg', lookupPublic), /identifiants/)
    && await rejects(P.checkUrl('http://localhost/a.jpg', lookupPublic), /interne/) && await rejects(P.checkUrl('http://169.254.169.254/latest', lookupPublic), /interne/)
    && await rejects(P.checkUrl('https://photos.agence.test/a.jpg', lookupPrivate), /interne/));
  const img = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const resp = (status, headers, buf) => ({ ok: status >= 200 && status < 300, status, headers: { get: k => headers[k.toLowerCase()] || null }, arrayBuffer: async () => buf || img });
  let seenOpts;
  const okFetch = async (u, o) => { seenOpts = o; return resp(200, { 'content-type': 'image/jpeg; charset=binary' }); };
  const got = await P.download('https://photos.agence.test/a.jpg', { fetch: okFetch, lookup: lookupPublic });
  check('download: image accepted, redirects handled by hand', got.buffer.length === img.length && got.type === 'image/jpeg' && seenOpts.redirect === 'manual');
  let hops = 0;
  const redirFetch = async u => { hops++; return /a\.jpg/.test(u) ? resp(302, { location: 'http://10.0.0.1/secret' }) : resp(200, { 'content-type': 'image/jpeg' }); };
  check('redirect to an internal address refused', await rejects(P.download('https://photos.agence.test/a.jpg', { fetch: redirFetch, lookup: lookupPublic }), /interne/) && hops === 1);
  check('not an image refused', await rejects(P.download('https://x.test/a', { fetch: async () => resp(200, { 'content-type': 'text/html' }), lookup: lookupPublic }), /pas une image/));
  check('too heavy refused', await rejects(P.download('https://x.test/a', { fetch: async () => resp(200, { 'content-type': 'image/png', 'content-length': String(20 * 1024 * 1024) }), lookup: lookupPublic }), /trop lourde/));
  check('HTTP error reported', await rejects(P.download('https://x.test/a', { fetch: async () => resp(404, { 'content-type': 'image/png' }), lookup: lookupPublic }), /HTTP 404/));
  let loops = 0;
  check('redirect loop stopped', await rejects(P.download('https://x.test/a', { fetch: async () => { loops++; return resp(301, { location: '/b' }); }, lookup: lookupPublic }), /redirections/) && loops === 4);

  routes['media_assets'] = [{ id: 'asset-1' }];
  routes['listing_media?listing_id='] = [];
  routes['/rest/v1/listing_media'] = (u) => (u.includes('?') ? [] : null);
  calls.length = 0;
  const stored = [];
  const deps = { fetch: okFetch, lookup: lookupPublic, optimize: async f => ({ buffer: f.buffer, type: 'image/jpeg', width: 2048, height: 1365, ext: 'jpg' }), storagePut: async (p, i) => stored.push([p, i.type]) };
  const assetId = await P.attach({ id: 'q1', listing_id: 'lst-1', url: 'https://photos.agence.test/a.jpg', position: 0, attempts: 1 }, deps);
  const assetCall = calls.find(c => c.url.endsWith('/rest/v1/media_assets'));
  const linkCall = calls.find(c => c.url.endsWith('/rest/v1/listing_media') && c.method === 'POST');
  check('attached like a manual upload: storage path, asset with size, link as cover', assetId === 'asset-1' && stored[0][0].startsWith('listings/lst-1/') && stored[0][0].endsWith('-import-0.jpg')
    && assetCall.body.original_storage_path === stored[0][0] && assetCall.body.width === 2048 && assetCall.body.visibility === 'public'
    && linkCall.body.listing_id === 'lst-1' && linkCall.body.media_asset_id === 'asset-1' && linkCall.body.is_cover === true && linkCall.body.position === 0);
  routes['listing_media?listing_id='] = [{ media_asset_id: 'existing' }];
  routes['/rest/v1/listing_media'] = (u) => (u.includes('?') ? [{ media_asset_id: 'existing' }] : null);
  calls.length = 0;
  await P.attach({ id: 'q2', listing_id: 'lst-1', url: 'https://photos.agence.test/a.jpg', position: 0, attempts: 1 }, deps);
  check('listing already has a cover: not replaced', calls.find(c => c.url.endsWith('/rest/v1/listing_media') && c.method === 'POST').body.is_cover === false);

  calls.length = 0;
  await P.finish({ id: 'q3', attempts: 1 }, { error: 'HTTP 404' });
  await P.finish({ id: 'q4', attempts: 3 }, { error: 'HTTP 404' });
  await P.finish({ id: 'q5', attempts: 1 }, { assetId: 'asset-9' });
  const pat = calls.filter(c => c.method === 'PATCH');
  check('queue: retry while attempts remain, then failed; done with the asset', pat[0].body.status === 'pending' && pat[1].body.status === 'failed' && pat[2].body.status === 'done' && pat[2].body.media_asset_id === 'asset-9' && pat[0].url.includes('id=eq.q3'));

  const sharp = (() => { try { return require('sharp'); } catch (_) { return null; } })();
  if (sharp) {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#8a6a36' } }).png().toBuffer();
    const o = await P.optimize({ buffer: big, type: 'image/png' });
    check('optimise: max 2048 px, JPEG', o.type === 'image/jpeg' && o.width === 2048 && o.height === 1536 && o.buffer.length < big.length);
  } else {
    console.log('(sharp not installed here: resize check skipped)');
  }
  const vercel = JSON.parse(fs.readFileSync(path.join(WEB, 'vercel.json'), 'utf8'));
  check('route before the SPA fallback, 60 s budget', vercel.rewrites.findIndex(x => x.source === '/api/media-import') < vercel.rewrites.findIndex(x => x.source === '/(.*)') && vercel.functions['api/media-import.js'].maxDuration === 60);
  console.log(`\nADMIN FOLLOW-UP SERVER: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
