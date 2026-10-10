/* ============================================================
   Z FIND — /api/feed-sync (Vercel serverless function + Vercel Cron)

   « Flux automatique » : an agency registers, in its Partner panel, the
   HTTPS address of its software's export (Poliris / SeLoger annonces.csv
   or its ZIP with the photos, or a CSV with a header row). Every night
   this function imports each active feed with the SAME code as the
   Partner panel's « Importer mes annonces »
   (src/services/listing-import: reader, mapping, sync plan, writer):
   new references → DRAFT listings, known ones → only what changed,
   « import complet » on → the agency's imported listings missing from
   the file are archived. Nothing is ever published or deleted.

   Who writes: every write is a Partner command run AS the agency through
   zfind_feed_call (migration 20261010120000) — the job never has more
   rights than the agency in its own panel. Photos: links are queued for
   /api/media-import; photo files inside a ZIP are stored like a photo
   added by hand (same code as /api/media-import).

   Safety
   - the address must be https, on the public internet (api/_lib/url-guard:
     no private / loopback / link-local address, each redirect re-checked,
     credentials never sent to another host), 30 s timeout, 50 Mo (ZIP) /
     20 Mo (CSV), 2 000 listings;
   - the basic-auth password is read here only (service key), never sent
     back to a browser;
   - a feed that comes back empty, or with less than half of the listings
     of the last good run, archives NOTHING that night: « à vérifier »,
     the agency and Z Find are e-mailed (Resend). The agency confirms the
     new volume in its panel (zfind_partner_accept_feed_volume);
   - two failed runs in a row (download, format…): one e-mail to the agency.
   - one feed at a time, within a time budget (ZFIND_FEED_BUDGET_MS,
     45 s by default for a 60 s function): a feed cut by the budget is
     « partial » and resumes on the next run (already created listings are
     then simply recognised), its archiving waits for a complete pass.

   Calls
   - Vercel Cron (Authorization: Bearer CRON_SECRET): the night run —
     the requested tests / runs first, then every active feed not run for
     20 hours (and partial ones);
   - without the secret (Partner « Tester le flux », Admin « Lancer
     maintenant »: no data in the call, like /api/media-import): only the
     tests and runs requested in the database (zfind_partner_request_feed_test,
     zfind_admin_request_feed_run). A test downloads, reads and compares,
     and writes nothing but its result.

   Environment: ZFIND_SUPABASE_SERVICE_KEY, SUPABASE_URL, CRON_SECRET,
   RESEND_API_KEY, ZFIND_EMAIL_FROM, ZFIND_LEAD_NOTIFY_EMAIL (copy to
   Z Find), PARTNER_BASE_URL, ZFIND_FEED_BUDGET_MS (optional).
   ============================================================ */
'use strict';

const S = require('./_lib/server');
const guard = require('./_lib/url-guard');
const imp = require('../src/services/listing-import/listing-import.js');

const FETCH_TIMEOUT_MS = 30 * 1000;
const MIN_TIME_FOR_A_FEED_MS = 8 * 1000;
const REPORT_MAX = 2000;

let jszipModule;
function jszip() {
  if (jszipModule === undefined) {
    try { jszipModule = require('jszip'); } catch (_) { jszipModule = null; }
  }
  return jszipModule;
}

let testDeps = {};
/* Tests only (no environment switch): fetch / DNS stand-ins, a local feed server, photo upload, clock. */
function setDepsForTests(deps) { testDeps = deps || {}; }

function partnerUrl() { return S.env('PARTNER_BASE_URL', 'https://partner.zfind.online').replace(/\/+$/, ''); }
function budgetMs() {
  const v = Number(S.env('ZFIND_FEED_BUDGET_MS', ''));
  return Number.isFinite(v) && v >= 5000 ? Math.min(v, 280 * 1000) : 45 * 1000;
}
const nowIso = () => new Date(testDeps.now ? testDeps.now() : Date.now()).toISOString();
const fmtInt = n => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);
const plural = (n, one, many) => `${fmtInt(n)} ${Number(n) > 1 ? many : one}`;

/* ---------------- download ---------------- */

/** The feed file: { bytes, contentType, url }. creds: { user, password }. Throws a short French reason.
    api/_lib/url-guard.guardedFetch: public addresses only (checked again at connection time and on
    every redirect), credentials to the feed's own origin only, 30 s, 50 Mo. */
async function fetchFeed(url, creds, deps) {
  const d = Object.assign({}, testDeps, deps || {});
  const max = imp.LIMITS.zipBytes; // once read, the file's signature decides (CSV: 20 Mo)
  const r = await guard.guardedFetch(url, {
    httpsOnly: !d.allowHttp, lookup: d.lookup, allowAddresses: d.allowAddresses, ca: d.ca,
    timeoutMs: d.timeoutMs || FETCH_TIMEOUT_MS, maxBytes: max, maxRedirects: 3,
    credentials: creds && creds.user ? { user: creds.user, password: creds.password || '' } : null,
    headers: { 'User-Agent': 'ZFind-FeedSync/1.0 (+https://zfind.online)', Accept: 'text/csv, application/zip, application/octet-stream, */*' }
  });
  if (r.status === 401 || r.status === 403) throw new Error(`accès refusé (HTTP ${r.status}) : vérifiez l’identifiant et le mot de passe`);
  if (r.status === 404) throw new Error('fichier introuvable (HTTP 404) : vérifiez l’adresse');
  if (r.status < 200 || r.status >= 300) throw new Error(`le serveur du flux répond HTTP ${r.status}`);
  // An empty file is not an error here: it reads as « 0 annonce » and the safety rule flags it.
  const tooBig = r.bytes.length ? imp.fileSizeError(new URL(r.url).pathname, r.bytes.length, imp.looksLikeZip(r.bytes)) : null;
  if (tooBig) throw new Error(tooBig.replace(/\.$/, ''));
  const contentType = String(r.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  return { bytes: r.bytes, contentType, url: r.url };
}

/* ---------------- database (service key) ---------------- */

const rpc = (name, body) => (testDeps.rpc ? testDeps.rpc(name, body || {}) : S.db(`rpc/${name}`, { method: 'POST', body: body || {} }));

/** A Partner command, as the agency owning the feed. Never throws: { data, error } like supabase-js. */
function feedRpc(feedId) {
  return async (name, args) => {
    try {
      return { data: await rpc('zfind_feed_call', { p_feed_id: feedId, p_fn: name, p_args: args || {} }), error: null };
    } catch (e) {
      // PostgREST error body: {"code":"…","message":"…"} after « db 400: ».
      let message = e.message; let code = null;
      const m = /^db \d+: (.*)$/s.exec(String(e.message || ''));
      if (m) { try { const j = JSON.parse(m[1]); message = j.message || message; code = j.code || null; } catch (_) { /* keep */ } }
      return { data: null, error: { message, code } };
    }
  };
}

/** ZIP photo files: stored like a photo added by hand (same code as /api/media-import). */
function zipUploader() {
  if (testDeps.uploadMedia) return testDeps.uploadMedia;
  const media = require('./media-import.js')._internals;
  const next = new Map(); // listing → next photo position
  return async (listingId, file) => {
    try {
      const buffer = Buffer.isBuffer(file) ? file : Buffer.from(await file.arrayBuffer());
      const name = String((file && file.name) || 'photo.jpg');
      const ext = (/\.(\w+)$/.exec(name) || [])[1] || 'jpg';
      const type = /png/i.test(ext) ? 'image/png' : /gif/i.test(ext) ? 'image/gif' : /webp/i.test(ext) ? 'image/webp' : 'image/jpeg';
      if (buffer.length > 15 * 1024 * 1024) return { data: null, error: { message: 'image trop lourde' } };
      const position = next.get(listingId) || 0;
      next.set(listingId, position + 1);
      const id = await media.attachFile({ listing_id: listingId, position }, { buffer, type });
      return { data: { id }, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  };
}

/* ---------------- one feed ---------------- */

function summaryText(k) {
  const parts = [plural(k.created, 'créée', 'créées'), plural(k.updated, 'mise à jour', 'mises à jour'), plural(k.archived, 'retirée', 'retirées'), plural(k.errors, 'erreur', 'erreurs')];
  if (k.pending) parts.push(`${fmtInt(k.pending)} reportée${k.pending > 1 ? 's' : ''} à la prochaine synchronisation`);
  return parts.join(', ');
}

/** Download + read + compare (+ write unless preview). feed: a zfind_feed_claim row.
    Returns { status: ok | partial | flagged | error, message, counts, listingCount, report, safety, preview }. */
async function processFeed(feed, opts) {
  const o = opts || {};
  const preview = !!o.preview;
  let listingCount = null;
  try {
    const file = await fetchFeed(feed.url, { user: feed.auth_user, password: feed.password }, o.deps);
    let table;
    try { table = await imp.readBytes(file.bytes, jszip()); }
    catch (e) { throw new Error(/trop volumineux/.test(e.message) ? e.message.replace(/\.$/, '') : /^Aucun fichier annonces/.test(e.message) ? 'le ZIP ne contient pas de fichier annonces.csv' : 'fichier illisible (formats acceptés : Poliris / SeLoger, ZIP, CSV avec une ligne de titres)'); }
    const ids = table.agencyIds || [];
    const agencyId = feed.software_agency_id || '';
    if (!agencyId && ids.length > 1) throw new Error(`fichier groupé de plusieurs agences (${ids.slice(0, 5).join(', ')}) : indiquez votre identifiant agence dans le logiciel`);
    if (agencyId && ids.length && !ids.includes(agencyId)) throw new Error(`identifiant agence « ${agencyId} » absent du fichier (présents : ${ids.slice(0, 5).join(', ')})`);
    const records = imp.recordsInScope(table, agencyId);
    listingCount = records.length;
    const tooMany = imp.rowCountError(records.length);
    if (tooMany) throw new Error(tooMany.replace(/\.$/, ''));
    const map = imp.mapFor(table);
    if (records.length && table.format !== 'poliris' && !map.reference) throw new Error('colonne « Référence » introuvable : sans référence, les annonces ne peuvent pas être reconnues d’une nuit à l’autre');
    const rows = table.records.map(r => imp.normalizeRow(r, map));
    const safety = imp.feedSafety(feed.last_listing_count, records.length);
    const writer = imp.rpcWriter(o.rpc || feedRpc(feed.id), { uploadMedia: preview ? null : zipUploader() });
    const portfolio = await writer.portfolio();
    if (portfolio.error) throw new Error('lecture des annonces actuelles impossible : ' + (portfolio.error.message || 'erreur'));
    const country = feed.country || 'FR';
    const refs = new Set(rows.filter(r => r.reference && imp.complianceFor(r, country).applicable).map(r => String(r.reference).trim().toLowerCase()));
    await imp.loadComplianceFor(portfolio.data.filter(e => refs.has(e.refKey) && e.listing), writer.compliance, 4);
    const plan = imp.planSync(rows, portfolio.data, {
      country, fullSync: !!feed.full_sync, agencyId, lineOffset: table.format === 'poliris' ? 1 : 2,
      archiveBlockedReason: safety.allowArchive ? null : safety.message
    });
    const base = { listingCount, safety, format: table.format, version: table.version || null, zipPhotos: table.zipPhotoCount || 0 };
    if (preview) {
      return Object.assign(base, { status: safety.flag ? 'flagged' : 'ok', flag: safety.flag || null, preview: true, counts: plan.counts, message: safety.flag ? safety.message : `${plural(listingCount, 'annonce lue', 'annonces lues')} : ${plural(plan.counts.create, 'à créer', 'à créer')}, ${plural(plan.counts.update, 'à mettre à jour', 'à mettre à jour')}, ${plural(plan.counts.archive, 'à retirer', 'à retirer')}, ${plural(plan.counts.error, 'en erreur', 'en erreur')}, ${plural(plan.counts.unchanged, 'inchangée', 'inchangées')}.`, report: [] });
    }
    const out = await imp.applyPlan(plan, {
      writer, country, zipPhoto: table.zipPhoto || null, deadline: o.deadline || null,
      source: { source: 'partner_feed', format: table.format, fileName: decodeURIComponent(new URL(file.url).pathname.split('/').pop() || '') || null, version: table.version || null }
    });
    const photos = await imp.queuePhotoJobs(writer, out.photoJobs);
    const k = imp.countResults(out.results);
    const counts = Object.assign({ file: listingCount, photos }, k, { plan: plan.counts });
    // « partial » (time budget) wins over « flagged » for the status: the
    // feed is picked up again first. The flag is kept apart (outcome.flag) so a
    // cut run never makes a suspicious volume the new reference.
    const status = out.interrupted ? 'partial' : safety.flag ? 'flagged' : 'ok';
    const message = [summaryText(k), safety.flag ? safety.message : '', out.interrupted ? 'Synchronisation interrompue (temps écoulé) : elle reprend à la prochaine exécution, sans retrait d’annonce d’ici là.' : ''].filter(Boolean).join(' · ');
    const report = out.results.slice(0, REPORT_MAX).map(r => ({ line: r.line == null ? null : r.line, reference: r.reference || null, kind: r.kind, status: r.status, message: S.oneLine(r.message, 300), compliance: S.oneLine(r.compliance, 200), listingId: r.listingId || null }));
    return Object.assign(base, { status, flag: safety.flag || null, message, counts, report, photoJobs: out.photoJobs.length });
  } catch (e) {
    return { status: 'error', message: S.oneLine(`Échec : ${e.message}`, 600), counts: {}, listingCount, report: [] };
  }
}

/* ---------------- what is stored, who is told ---------------- */

/** Pure: the feed row after a run (zfind_feed_record patch) + which e-mail to send.
    mode: 'nightly' | 'requested'. Only nightly failures count towards « two nights in a row ». */
function outcomePatch(feed, outcome, at, mode) {
  const patch = { last_run_at: at, last_status: outcome.status, last_message: outcome.message, last_counts: outcome.counts || {}, last_report: outcome.report || [], clear_run_request: true };
  const notify = { failure: false, flag: false };
  if (outcome.status === 'error') {
    if (mode !== 'requested') {
      patch.consecutive_failures = (Number(feed.consecutive_failures) || 0) + 1;
      if (patch.consecutive_failures >= 2 && !feed.failure_notified_at) { notify.failure = true; patch.failure_notified_at = at; }
    }
    return { patch, notify };
  }
  patch.consecutive_failures = 0;
  patch.failure_notified_at = null;
  if (outcome.flag) {
    // Empty feed or more than half of the listings gone: nothing was archived. The previous
    // good count stays the reference; the agency confirms the new volume in its panel.
    patch.flagged_listing_count = outcome.listingCount;
    if (outcome.status !== 'partial') patch.last_completed_at = at;
    // One e-mail per new suspicious volume (not every night while it lasts).
    if (feed.flagged_listing_count == null || Number(feed.flagged_listing_count) !== Number(outcome.listingCount) || !feed.flag_notified_at) { notify.flag = true; patch.flag_notified_at = at; }
    return { patch, notify };
  }
  // A good run is the new reference for the « drop by more than half » rule.
  patch.last_listing_count = outcome.listingCount;
  patch.flagged_listing_count = null;
  patch.flag_notified_at = null;
  if (outcome.status === 'ok') patch.last_completed_at = at;
  return { patch, notify };
}

function feedEmail(kind, feed, outcome, recipients) {
  const panel = partnerUrl();
  const heading = kind === 'failure' ? 'Votre flux d’annonces ne fonctionne plus' : 'Votre flux d’annonces est à vérifier';
  const intro = kind === 'failure'
    ? `Pour la deuxième nuit de suite, Z Find n’a pas pu importer le flux de ${feed.partner_name || 'votre agence'}. Vos annonces sur Z Find ne sont plus mises à jour : vérifiez l’adresse et les identifiants dans « Flux automatique », ou demandez à votre logiciel de réactiver l’export.`
    : `Le flux de ${feed.partner_name || 'votre agence'} a été importé cette nuit, mais par précaution aucune annonce n’a été retirée.`;
  const detail = outcome.message || '';
  const after = kind === 'failure'
    ? 'Dès que le flux répond de nouveau, la synchronisation reprend toute seule la nuit suivante.'
    : 'Si ce nombre d’annonces est normal (ventes, mandats retirés), confirmez-le dans « Flux automatique » : les annonces absentes seront retirées à la prochaine synchronisation. Sinon, vérifiez l’export de votre logiciel.';
  const html = S.mailHtml('fr', heading,
    `<p style="line-height:1.6">${S.esc(intro)}</p><p style="line-height:1.6;background:#faf7f0;border:1px solid #e7e1d4;border-radius:6px;padding:12px">${S.esc(detail)}</p>`
    + `<p style="line-height:1.6;color:#4a453d">Adresse du flux : ${S.esc(feed.url)}</p><p style="line-height:1.6">${S.esc(after)}</p>` + S.button(panel, 'Ouvrir « Flux automatique »'),
    'Vous recevez cet e-mail parce que votre agence a activé un flux automatique sur Z Find. Z Find · hello@zfind.online');
  const text = [heading, '', intro, '', detail, '', `Adresse du flux : ${feed.url}`, '', after, '', `Espace agence : ${panel}`].join('\n');
  const zfind = S.env('ZFIND_LEAD_NOTIFY_EMAIL');
  const to = (recipients || []).filter(e => S.EMAIL_RE.test(e)).slice(0, 5);
  const msg = { to: to.length ? to : (zfind ? [zfind] : []), subject: S.oneLine(`${kind === 'failure' ? 'Flux en échec' : 'Flux à vérifier'} : ${feed.partner_name || 'votre agence'}`, 150), html, text };
  if (to.length && zfind) msg.bcc = [zfind];
  return msg;
}

async function notify(kind, feed, outcome) {
  if (!testDeps.sendMail && !S.configured(['mail'])) return 'not_configured';
  let recipients = [];
  try { recipients = await rpc('zfind_partner_recipients', { p_partner_id: feed.partner_id }) || []; } catch (e) { console.error('feed-sync: recipients', feed.id, e.message); }
  const msg = feedEmail(kind, feed, outcome, recipients);
  if (!msg.to.length) return 'no_recipient';
  await (testDeps.sendMail || S.sendMail)(msg);
  return 'sent';
}

/* ---------------- runs ---------------- */

async function runOne(mode, feed, deadline, report) {
  if (mode === 'test') {
    const outcome = await processFeed(feed, { preview: true });
    const at = nowIso();
    await rpc('zfind_feed_record', { p_feed_id: feed.id, p_patch: { last_test_at: at, clear_test_request: true,
      last_test: { at, status: outcome.status, message: outcome.message, counts: outcome.counts || {}, listingCount: outcome.listingCount, format: outcome.format || null, version: outcome.version || null } } });
    report.tests.push({ id: feed.id, status: outcome.status });
    return;
  }
  const outcome = await processFeed(feed, { deadline });
  const at = nowIso();
  const { patch, notify: n } = outcomePatch(feed, outcome, at, mode);
  await rpc('zfind_feed_record', { p_feed_id: feed.id, p_patch: patch });
  const row = { id: feed.id, status: outcome.status, counts: outcome.counts };
  try {
    if (n.failure) row.mail = await notify('failure', feed, outcome);
    if (n.flag) row.mail = await notify('flag', feed, outcome);
  } catch (e) { row.mail = 'error'; console.error('feed-sync: mail', feed.id, e.message); }
  report.runs.push(row);
}

/** modes: in order, e.g. ['test', 'requested', 'nightly']. One feed claimed at a time, within the budget. */
async function run(modes, options) {
  const o = options || {};
  const clock = () => (testDeps.now ? testDeps.now() : Date.now());
  const started = clock();
  const deadline = started + (o.budgetMs || budgetMs());
  const report = { tests: [], runs: [], left: false };
  for (const mode of modes) {
    for (;;) {
      if (clock() > deadline - MIN_TIME_FOR_A_FEED_MS) { report.left = true; return report; }
      const claimed = await rpc('zfind_feed_claim', { p_mode: mode, p_limit: 1 });
      const feed = Array.isArray(claimed) ? claimed[0] : null;
      if (!feed) break;
      try { await runOne(mode, feed, deadline, report); }
      catch (e) {
        console.error('feed-sync:', mode, feed.id, e.message);
        await rpc('zfind_feed_record', { p_feed_id: feed.id, p_patch: mode === 'test' ? { clear_test_request: true } : { clear_run_request: true } }).catch(() => {});
      }
    }
  }
  return report;
}

async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return S.sendJson(res, 405, { ok: false });
  if (!S.configured(['db'])) return S.sendJson(res, 503, { ok: false, error: 'not_configured' });
  const secret = S.env('CRON_SECRET');
  const cron = !!secret && String((req.headers && req.headers.authorization) || '') === `Bearer ${secret}`;
  if (!cron && S.limited(req, 30, 10 * 60 * 1000)) return S.sendJson(res, 429, { ok: false });
  try {
    const report = await run(cron ? ['test', 'requested', 'nightly'] : ['test', 'requested']);
    if (cron) console.log('feed-sync', JSON.stringify(report));
    return S.sendJson(res, 200, Object.assign({ ok: true }, report));
  } catch (e) {
    console.error('feed-sync', e.message);
    return S.sendJson(res, 500, { ok: false });
  }
}

module.exports = handler;
module.exports._internals = { fetchFeed, processFeed, outcomePatch, feedEmail, run, feedRpc, setDepsForTests };
