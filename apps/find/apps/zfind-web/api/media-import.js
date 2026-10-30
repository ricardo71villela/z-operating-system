/* ============================================================
   Z FIND — /api/media-import (Vercel serverless function)

   Photos of an agency's imported listings (« Nous chargeons pour vous »):
   the Admin queues the photo links of each draft listing in
   zfind_media_import_queue (admin only); this function fetches them,
   resizes them (max 2048 px, JPEG) and attaches them to the listing
   exactly like a photo added by hand (storage « listing-media » +
   media_assets + listing_media). The first photo becomes the cover when
   the listing has none.

   No data in the call: it only processes what the Admin queued, a few
   links at a time, so a stray call can do no harm. Called by the Admin
   while it shows the progress, and by nothing else.
   Safety: http(s) only, public addresses only (no internal network),
   images only, 15 MB max, 3 redirects max, 3 attempts per link.
   Migration 20261004200000_z_find_admin_followup_v1.

   Since 2026-10-30 the same function also serves /api/media/photo
   (→ ?route=photo, _lib/photo-upload.js): the photos added by hand in the
   Partner space and the Admin. Every photo — by hand or imported — goes
   through _lib/photo-pipeline.js (WebP ≤ 2560 px + 800 px card, metadata
   removed) and counts towards the 20 photos per listing
   (migration 20261030090000).
   ============================================================ */
'use strict';

const S = require('./_lib/server');
const guard = require('./_lib/url-guard');
const pipeline = require('./_lib/photo-pipeline');
const photoUpload = require('./_lib/photo-upload');

const MAX_BYTES = 15 * 1024 * 1024;
const TIME_BUDGET_MS = 40 * 1000;
const FETCH_TIMEOUT_MS = 12 * 1000;
const IMAGE_TYPES = /^image\/(jpeg|jpg|pjpeg|png|webp|gif|avif|heic|heif)$/i;
const DEFAULT_SUPABASE_URL = 'https://dcdggqyazdddrfuzwavw.supabase.co';

/* ---------------- address checks (no internal network): api/_lib/url-guard.js ---------------- */
const { privateIp } = guard;
const checkUrl = (raw, lookup) => guard.checkUrl(raw, { lookup });

/* Fetch with manual redirects (each hop re-checked), size and type limits. */
async function download(raw, deps) {
  const d = deps || {};
  const doFetch = d.fetch || fetch;
  let url = raw;
  for (let hop = 0; hop <= 3; hop++) {
    const u = await checkUrl(url, d.lookup);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await doFetch(u.toString(), { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': 'ZFind-MediaImport/1.0 (+https://zfind.online)', Accept: 'image/*' } });
    } catch (e) {
      clearTimeout(timer);
      throw new Error(e.name === 'AbortError' ? 'délai dépassé' : 'site injoignable');
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      clearTimeout(timer);
      url = new URL(response.headers.get('location'), u).toString();
      continue;
    }
    try {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = String(response.headers.get('content-type') || '').split(';')[0].trim();
      if (!IMAGE_TYPES.test(type)) throw new Error(`pas une image (${type || 'type inconnu'})`);
      const declared = Number(response.headers.get('content-length') || 0);
      if (declared > MAX_BYTES) throw new Error('image trop lourde (> 15 Mo)');
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_BYTES) throw new Error('image trop lourde (> 15 Mo)');
      if (!buffer.length) throw new Error('image vide');
      return { buffer, type: type.toLowerCase() };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('trop de redirections');
}

/* Same treatment as a photo added by hand: _lib/photo-pipeline.js. */
async function optimize(file) {
  return pipeline.processPhoto(file.buffer);
}


/* An image already in hand (a photo inside an agency feed's ZIP) → same storage and links as a photo added by hand. */
async function attachFile(item, file, deps) {
  const d = deps || {};
  const processed = await (d.optimize || optimize)(file);
  const stored = await (d.storeProcessed || photoUpload.storeProcessed)('listing', item.listing_id, processed, { position: item.position });
  return stored.assetId;
}

async function attach(item, deps) {
  return attachFile(item, await download(item.url, deps || {}), deps);
}

async function finish(item, result) {
  // 20 photos already, or a file that is not a readable image: retrying cannot help.
  const final = /photos au maximum|Format|image lisible|abîmée|trop petite|trop grande|HEIC/.test(String(result.error || ''));
  const body = result.assetId
    ? { status: 'done', media_asset_id: result.assetId, error: null, done_at: new Date().toISOString() }
    : { status: item.attempts >= 3 || final ? 'failed' : 'pending', error: S.oneLine(result.error, 300) };
  await S.db(`zfind_media_import_queue?id=eq.${item.id}`, { method: 'PATCH', body, prefer: 'return=minimal' });
}

/* Processes queued links until the time budget is used. Returns { done, failed, retry }. */
async function processQueue(deps) {
  const started = Date.now();
  const report = { done: 0, failed: 0, retry: 0 };
  while (Date.now() - started < TIME_BUDGET_MS) {
    const claimed = await S.db('rpc/zfind_claim_media_imports', { method: 'POST', body: { p_limit: 3 } });
    const batch = Array.isArray(claimed) ? claimed : [];
    if (!batch.length) break;
    for (const item of batch) {
      try {
        const assetId = await attach(item, deps);
        await finish(item, { assetId });
        report.done += 1;
      } catch (e) {
        await finish(item, { error: e.message }).catch(() => {});
        if (item.attempts >= 3) report.failed += 1; else report.retry += 1;
      }
    }
  }
  return report;
}

async function handler(req, res) {
  if (String(S.queryOf(req).route || '') === 'photo') return photoUpload.handlePhoto(req, res);
  if (req.method !== 'POST' && req.method !== 'GET') return S.sendJson(res, 405, { ok: false });
  if (!S.configured(['db'])) return S.sendJson(res, 503, { ok: false, error: 'not_configured' });
  if (S.limited(req, 60, 10 * 60 * 1000)) return S.sendJson(res, 429, { ok: false });
  try {
    const report = await processQueue();
    return S.sendJson(res, 200, Object.assign({ ok: true }, report));
  } catch (e) {
    console.error('media-import', e.message);
    return S.sendJson(res, 500, { ok: false });
  }
}

module.exports = handler;
module.exports._internals = { privateIp, checkUrl, download, optimize, attach, attachFile, processQueue, finish };
