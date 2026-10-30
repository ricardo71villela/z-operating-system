/* ============================================================
   Z FIND — POST /api/media/photo  (→ /api/media-import?route=photo)

   Uma fotografia carregada à mão (espaço Partner ou Admin) :
     1. o navegador envia o ficheiro para o armazenamento, no caminho
        de origem « {listings|developments}/{id}/src/… » (regras de
        acesso existentes : só quem gere o anúncio pode escrever lá) ;
     2. chama esta rota com a sua sessão : { kind, ownerId, sourcePath,
        isCover } ;
     3. o servidor confirma, com essa sessão, que a pessoa gere o anúncio
        e que há menos de 20 fotos (zfind_media_upload_check), lê o
        original, trata-o (_lib/photo-pipeline.js), guarda a versão
        principal e a miniatura, liga a foto ao anúncio e apaga o
        original.
   A foto final nunca depende do navegador ; o original nunca fica
   guardado.
   ============================================================ */
'use strict';

const S = require('./server');
const pipeline = require('./photo-pipeline');

const DEFAULT_SUPABASE_URL = 'https://dcdggqyazdddrfuzwavw.supabase.co';
const KINDS = { listing: { prefix: 'listings', table: 'listing_media', column: 'listing_id' }, development: { prefix: 'developments', table: 'development_media', column: 'development_id' } };
const MESSAGES = {
  media_limit: `${pipeline.MAX_PER_OWNER} photos au maximum par annonce.`,
  forbidden: 'Vous ne gérez pas cette annonce.',
  unauthorized: 'Votre session a expiré : reconnectez-vous.'
};

function base() { return S.env('SUPABASE_URL', DEFAULT_SUPABASE_URL).replace(/\/+$/, ''); }
function serviceHeaders(extra) {
  const key = String(S.env('ZFIND_SUPABASE_SERVICE_KEY', '')).trim();
  return Object.assign({ apikey: key }, /^eyJ/.test(key) ? { Authorization: `Bearer ${key}` } : {}, extra || {});
}
function objectUrl(path) { return `${base()}/storage/v1/object/listing-media/${String(path).split('/').map(encodeURIComponent).join('/')}`; }

/* Contrôle avec la session de l'expéditeur (jamais la clé serveur). */
async function checkAccess(token, kind, ownerId) {
  const anon = String(S.env('SUPABASE_ANON_KEY', '')).trim();
  const r = await fetch(`${base()}/rest/v1/rpc/zfind_media_upload_check`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_kind: kind, p_owner: ownerId })
  });
  if (r.status === 401 || r.status === 403) return { ok: false, error: 'unauthorized' };
  if (!r.ok) throw new Error(`check ${r.status}`);
  return r.json();
}

async function readObject(path) {
  const r = await fetch(objectUrl(path), { headers: serviceHeaders() });
  if (!r.ok) { const e = new Error(`read ${r.status}`); e.status = r.status; throw e; }
  const declared = Number(r.headers.get('content-length') || 0);
  if (declared > 31457280) throw new pipeline.PhotoError('too_heavy', 'Fichier trop lourd (30 Mo au maximum).');
  return Buffer.from(await r.arrayBuffer());
}

async function writeObject(path, image) {
  const r = await fetch(objectUrl(path), {
    method: 'POST',
    headers: serviceHeaders({ 'Content-Type': image.type, 'x-upsert': 'false', 'Cache-Control': 'max-age=31536000' }),
    body: image.buffer
  });
  if (!r.ok) throw new Error(`write ${r.status}: ${(await r.text()).slice(0, 120)}`);
}

async function removeObjects(paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  await fetch(`${base()}/storage/v1/object/listing-media`, {
    method: 'DELETE', headers: serviceHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: list })
  }).catch(() => null);
}

/** Traitement + enregistrement d'une photo déjà en mémoire (aussi pour l'importation). */
async function storeProcessed(kind, ownerId, processed, opts) {
  const k = KINDS[kind];
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const displayPath = `${k.prefix}/${ownerId}/${stamp}.${processed.display.ext}`;
  const cardPath = `${k.prefix}/${ownerId}/${stamp}-card.${processed.card.ext}`;
  await writeObject(displayPath, processed.display);
  try {
    await writeObject(cardPath, processed.card);
    const [asset] = await S.db('media_assets', { method: 'POST', body: {
      media_type: 'image', visibility: 'public', original_storage_path: displayPath, mime_type: processed.display.type,
      file_size_bytes: processed.display.bytes, width: processed.display.width, height: processed.display.height
    } });
    await S.db('media_variants', { method: 'POST', body: {
      media_asset_id: asset.id, variant_type: 'card', storage_path: cardPath, mime_type: processed.card.type,
      file_size_bytes: processed.card.bytes, width: processed.card.width, height: processed.card.height
    }, prefer: 'return=minimal' });
    const last = await S.db(`${k.table}?${k.column}=eq.${ownerId}&select=position,is_cover&order=position.desc&limit=1`);
    const covers = await S.db(`${k.table}?${k.column}=eq.${ownerId}&is_cover=eq.true&select=media_asset_id&limit=1`);
    const position = opts && Number.isInteger(opts.position) ? opts.position : (last && last[0] ? Number(last[0].position) + 1 : 0);
    const link = { media_asset_id: asset.id, position, is_cover: !(covers && covers.length) }; // la première photo devient la couverture
    link[k.column] = ownerId;
    try {
      await S.db(k.table, { method: 'POST', body: link, prefer: 'return=minimal' });
    } catch (e) {
      // Limite atteinte entre-temps (déclencheur) : rien ne reste.
      await S.db(`media_variants?media_asset_id=eq.${asset.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => null);
      await S.db(`media_assets?id=eq.${asset.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => null);
      if (/media_limit/.test(String(e.message))) throw new pipeline.PhotoError('media_limit', MESSAGES.media_limit);
      throw e;
    }
    return { assetId: asset.id, displayPath, cardPath, isCover: link.is_cover };
  } catch (e) {
    await removeObjects([displayPath, cardPath]);
    throw e;
  }
}

const ORIGINS = ['https://partner.zfind.online', 'https://admin.zfind.online'];
const PREVIEW_RE = /^https:\/\/zfind-(partner|admin)-[a-z0-9-]+-zoperatingsystem\.vercel\.app$/;
function cors(req, res) {
  const origin = String((req.headers && req.headers.origin) || '');
  const extra = String(S.env('ZFIND_PARTNER_ORIGINS', '')).split(',').map(x => x.trim()).filter(Boolean);
  if (ORIGINS.includes(origin) || extra.includes(origin) || PREVIEW_RE.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

async function handlePhoto(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return S.sendJson(res, 405, { ok: false, error: 'method' }); }
  if (S.limited(req, 120, 10 * 60 * 1000)) return S.sendJson(res, 429, { ok: false, error: 'rate_limited', message: 'Trop d’envois : réessayez dans quelques minutes.' });
  const m = String((req.headers && req.headers.authorization) || '').match(/^Bearer\s+([A-Za-z0-9._-]+)$/);
  if (!m) return S.sendJson(res, 401, { ok: false, error: 'unauthorized', message: MESSAGES.unauthorized });
  const body = (await S.readBody(req).catch(() => null)) || {};
  const kind = String(body.kind || '');
  const ownerId = String(body.ownerId || '');
  const sourcePath = String(body.sourcePath || '');
  const k = KINDS[kind];
  if (!k || !S.UUID_RE.test(ownerId)) return S.sendJson(res, 400, { ok: false, error: 'input' });
  // Le fichier source doit être dans le dossier « src » de CETTE annonce / ce programme.
  const prefix = `${k.prefix}/${ownerId}/src/`;
  if (!sourcePath.startsWith(prefix) || sourcePath.includes('..') || !/^[A-Za-z0-9._\/-]+$/.test(sourcePath) || sourcePath.length > 300) {
    return S.sendJson(res, 400, { ok: false, error: 'input' });
  }
  let access;
  try { access = await checkAccess(m[1], kind, ownerId); } catch (e) {
    console.error('photo: check', e.message);
    return S.sendJson(res, 502, { ok: false, error: 'server' });
  }
  if (!access || !access.ok) {
    const code = (access && access.error) || 'forbidden';
    await removeObjects([sourcePath]);
    return S.sendJson(res, code === 'unauthorized' ? 401 : code === 'media_limit' ? 409 : 403, { ok: false, error: code, message: MESSAGES[code] || MESSAGES.forbidden });
  }
  try {
    const original = await readObject(sourcePath);
    const processed = await pipeline.processPhoto(original);
    const stored = await storeProcessed(kind, ownerId, processed, {});
    await removeObjects([sourcePath]);
    return S.sendJson(res, 200, {
      ok: true, assetId: stored.assetId, isCover: stored.isCover,
      input: { bytes: processed.input.bytes, width: processed.input.width, height: processed.input.height },
      output: { bytes: processed.display.bytes + processed.card.bytes, width: processed.display.width, height: processed.display.height },
      count: (Number(access.count) || 0) + 1, max: pipeline.MAX_PER_OWNER
    });
  } catch (e) {
    await removeObjects([sourcePath]);
    if (e instanceof pipeline.PhotoError) {
      return S.sendJson(res, e.code === 'media_limit' ? 409 : 422, { ok: false, error: e.code, message: e.message });
    }
    if (e.status === 404) return S.sendJson(res, 404, { ok: false, error: 'source_missing', message: 'Le fichier envoyé est introuvable : réessayez.' });
    console.error('photo:', e.message);
    return S.sendJson(res, 502, { ok: false, error: 'server', message: 'La photo n’a pas pu être enregistrée. Réessayez dans un instant.' });
  }
}

module.exports = { handlePhoto, storeProcessed, checkAccess, KINDS, _internals: { readObject, writeObject, removeObjects } };
