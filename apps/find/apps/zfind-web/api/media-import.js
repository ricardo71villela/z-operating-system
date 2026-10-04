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
   ============================================================ */
'use strict';

const dns = require('dns').promises;
const net = require('net');
const S = require('./_lib/server');

const MAX_BYTES = 15 * 1024 * 1024;
const TIME_BUDGET_MS = 40 * 1000;
const FETCH_TIMEOUT_MS = 12 * 1000;
const IMAGE_TYPES = /^image\/(jpeg|jpg|pjpeg|png|webp|gif|avif|heic|heif)$/i;
const DEFAULT_SUPABASE_URL = 'https://dcdggqyazdddrfuzwavw.supabase.co';

let sharpModule;
function sharp() {
  if (sharpModule === undefined) {
    try { sharpModule = require('sharp'); } catch (_) { sharpModule = null; }
  }
  return sharpModule;
}

/* ---------------- address checks (no internal network) ---------------- */
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}

async function checkUrl(raw, lookup) {
  let u;
  try { u = new URL(raw); } catch (_) { throw new Error('lien invalide'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('lien non http(s)');
  if (u.username || u.password) throw new Error('lien avec identifiants');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || /^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error('adresse interne');
  const addresses = net.isIP(host) ? [{ address: host }] : await (lookup || dns.lookup)(host, { all: true });
  if (!addresses.length || addresses.some(a => privateIp(a.address))) throw new Error('adresse interne');
  return u;
}

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

/* Same target as the manual upload (image-optimize.js): max 2048 px, JPEG. */
async function optimize(file) {
  const lib = sharp();
  if (!lib) return { buffer: file.buffer, type: file.type === 'image/jpg' ? 'image/jpeg' : file.type, width: null, height: null, ext: (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg') };
  const { data, info } = await lib(file.buffer, { failOn: 'error' }).rotate()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { buffer: data, type: 'image/jpeg', width: info.width, height: info.height, ext: 'jpg' };
}

async function storagePut(path, image) {
  const key = String(S.env('ZFIND_SUPABASE_SERVICE_KEY', '')).trim();
  const base = S.env('SUPABASE_URL', DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const auth = /^eyJ/.test(key) ? { Authorization: `Bearer ${key}` } : {};
  const response = await fetch(`${base}/storage/v1/object/listing-media/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: Object.assign({ apikey: key, 'Content-Type': image.type, 'x-upsert': 'false', 'Cache-Control': 'max-age=31536000' }, auth),
    body: image.buffer
  });
  if (!response.ok) throw new Error(`stockage ${response.status}: ${(await response.text()).slice(0, 120)}`);
}

async function attach(item, deps) {
  const d = deps || {};
  const file = await download(item.url, d);
  const image = await (d.optimize || optimize)(file);
  const path = `listings/${item.listing_id}/${Date.now()}-import-${item.position}.${image.ext}`;
  await (d.storagePut || storagePut)(path, image);
  const [asset] = await S.db('media_assets', { method: 'POST', body: { media_type: 'image', visibility: 'public', original_storage_path: path, mime_type: image.type, file_size_bytes: image.buffer.length, width: image.width, height: image.height } });
  const covers = await S.db(`listing_media?listing_id=eq.${item.listing_id}&is_cover=eq.true&select=media_asset_id&limit=1`);
  await S.db('listing_media', { method: 'POST', body: { media_asset_id: asset.id, listing_id: item.listing_id, position: item.position, is_cover: !(covers && covers.length) && item.position === 0 }, prefer: 'return=minimal' });
  return asset.id;
}

async function finish(item, result) {
  const body = result.assetId
    ? { status: 'done', media_asset_id: result.assetId, error: null, done_at: new Date().toISOString() }
    : { status: item.attempts >= 3 ? 'failed' : 'pending', error: S.oneLine(result.error, 300) };
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
module.exports._internals = { privateIp, checkUrl, download, optimize, attach, processQueue, finish };
