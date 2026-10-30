/* Contract: fotografias dos anúncios — tratamento no servidor (sharp), rota
   /api/media/photo, 20 fotos no máximo, envio no navegador, escolha das
   versões no site. Sem rede : Supabase simulado. */
'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { EventEmitter } = require('events');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const APPS = path.join(__dirname, '..', '..', 'apps');
const ROOT = path.join(__dirname, '..', '..', '..', '..');

let passed = 0;
function check(label, value) { assert(value, label); passed += 1; console.log('PASS:', label); }

const LISTING = '22222222-3333-4444-8555-666666666666';
const state = { access: { ok: true, count: 3, max: 20 }, source: null, writes: [], deletes: [], db: [], linkFails: false };
function reply(status, body, headers) { return { ok: status < 400, status, headers: { get: k => (headers || {})[k.toLowerCase()] || null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => body, arrayBuffer: async () => body }; }

global.fetch = async (url, opts) => {
  const o = opts || {};
  const u = String(url);
  const method = o.method || 'GET';
  if (u.endsWith('/rest/v1/rpc/zfind_media_upload_check')) {
    state.checkAuth = o.headers.Authorization; state.checkKey = o.headers.apikey;
    return reply(200, state.access);
  }
  if (u.includes('/storage/v1/object/listing-media/')) {
    const p = decodeURIComponent(u.split('/storage/v1/object/listing-media/')[1]);
    if (method === 'GET') return state.source ? reply(200, state.source, { 'content-length': String(state.source.length) }) : reply(404, {});
    state.writes.push({ path: p, type: o.headers['Content-Type'], bytes: o.body.length });
    return reply(200, {});
  }
  if (u.endsWith('/storage/v1/object/listing-media') && method === 'DELETE') { state.deletes.push(...JSON.parse(o.body).prefixes); return reply(200, []); }
  if (u.includes('/rest/v1/')) {
    const p = u.split('/rest/v1/')[1];
    const body = o.body ? JSON.parse(o.body) : null;
    state.db.push({ method, p, body });
    if (p === 'media_assets' && method === 'POST') return reply(201, [{ id: 'asset-1' }]);
    if (p === 'listing_media' && method === 'POST') return state.linkFails ? reply(400, { message: 'media_limit' }) : reply(201, null);
    if (p.startsWith('listing_media?') && method === 'GET') return reply(200, p.includes('is_cover=eq') ? [] : [{ position: 2 }]);
    return reply(200, method === 'GET' ? [] : null);
  }
  return reply(404, {});
};

function req(body, headers) {
  const r = new EventEmitter();
  r.method = 'POST';
  r.headers = Object.assign({ 'x-forwarded-for': `10.5.0.${Math.floor(Math.random() * 250)}`, origin: 'https://partner.zfind.online', authorization: 'Bearer user-token' }, headers || {});
  r.query = { route: 'photo' };
  r.url = '/api/media/photo';
  r.body = body;
  return r;
}
function res() { return { statusCode: 0, headers: {}, raw: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.raw = b || ''; }, get json() { return JSON.parse(this.raw || '{}'); } }; }

(async () => {
  console.log('\n=== Z FIND — PHOTOS ===');
  process.env.ZFIND_SUPABASE_SERVICE_KEY = 'sb_secret_test';
  process.env.SUPABASE_ANON_KEY = 'sb_publishable_test';
  const sharp = require('sharp');
  const pipeline = require(path.join(WEB, 'api', '_lib', 'photo-pipeline.js'));

  // ---------- tratamento
  const w = 4032, h = 3024;
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i += 3) { const n = (i * 7919) % 41 - 20; raw[i] = 200 + (n >> 1); raw[i + 1] = 180 + (n >> 1); raw[i + 2] = 150 + (n >> 1); }
  const phone = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).blur(0.6)
    .withExif({ IFD0: { Make: 'Apple', Model: 'iPhone 15 Pro' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '46/1 22/1 5/1', GPSLongitudeRef: 'E', GPSLongitude: '6/1 28/1 46/1' } })
    .withMetadata({ orientation: 6 }).jpeg({ quality: 95 }).toBuffer();
  const out = await pipeline.processPhoto(phone);
  check('photo de téléphone (12 Mpx, portrait EXIF) : orientation appliquée, 2560 px max', out.display.width === 1920 && out.display.height === 2560);
  check('vignette 800 px', out.card.width === 600 && out.card.height === 800);
  check('WebP, bien plus léger que l’original', out.display.type === 'image/webp' && out.display.bytes < phone.length / 3 && out.card.bytes < out.display.bytes);
  const meta = await sharp(out.display.buffer).metadata();
  check('métadonnées retirées : ni EXIF ni GPS', !meta.exif && !meta.orientation);
  const small = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#8a6a36' } }).jpeg().toBuffer();
  const so = await pipeline.processPhoto(small);
  check('jamais agrandie', so.display.width === 1200 && so.display.height === 900);
  const rejects = async (buf, code) => { try { await pipeline.processPhoto(buf); return false; } catch (e) { return e.code === code; } };
  check('fichier qui n’est pas une image : refusé', await rejects(Buffer.from('%PDF-1.4 not an image'), 'unreadable'));
  check('image minuscule : refusée', await rejects(await sharp({ create: { width: 120, height: 90, channels: 3, background: '#fff' } }).png().toBuffer(), 'too_small'));
  check('PNG accepté (converti en WebP)', (await pipeline.processPhoto(await sharp({ create: { width: 900, height: 600, channels: 4, background: '#ffffff80' } }).png().toBuffer())).display.type === 'image/webp');

  // ---------- rota /api/media/photo
  const handler = require(path.join(WEB, 'api', 'media-import.js'));
  state.source = phone;
  const src = `listings/${LISTING}/src/1730000000000-abc123.jpg`;
  let r = res();
  await handler(req({ kind: 'listing', ownerId: LISTING, sourcePath: src }), r);
  check('envoi accepté : 200, compte 4 / 20', r.statusCode === 200 && r.json.ok && r.json.count === 4 && r.json.max === 20);
  check('contrôle fait avec la session de l’expéditeur (jamais la clé serveur)', state.checkAuth === 'Bearer user-token' && state.checkKey === 'sb_publishable_test');
  check('deux fichiers WebP enregistrés : principal + vignette, dans le dossier de l’annonce', state.writes.length === 2 && state.writes.every(x => x.type === 'image/webp' && x.path.startsWith(`listings/${LISTING}/`) && !x.path.includes('/src/')) && /-card\.webp$/.test(state.writes[1].path));
  const asset = state.db.find(x => x.p === 'media_assets' && x.method === 'POST').body;
  const variant = state.db.find(x => x.p === 'media_variants' && x.method === 'POST').body;
  const link = state.db.find(x => x.p === 'listing_media' && x.method === 'POST').body;
  check('fiche de la photo : WebP, taille réelle, dimensions', asset.mime_type === 'image/webp' && asset.width === 1920 && asset.file_size_bytes === state.writes[0].bytes);
  check('vignette enregistrée comme variante « card »', variant.variant_type === 'card' && variant.media_asset_id === 'asset-1' && variant.width === 600);
  check('liée à l’annonce, après la dernière photo ; couverture si l’annonce n’en a pas', link.listing_id === LISTING && link.position === 3 && link.is_cover === true);
  check('original supprimé après traitement', state.deletes.includes(src));
  check('poids envoyé / conservé renvoyé à l’écran', r.json.input.bytes === phone.length && r.json.output.bytes === state.writes[0].bytes + state.writes[1].bytes);
  check('CORS : espace Partner autorisé', r.headers['access-control-allow-origin'] === 'https://partner.zfind.online');

  state.writes = []; state.deletes = []; state.db = [];
  state.access = { ok: false, error: 'media_limit', count: 20, max: 20 };
  r = res();
  await handler(req({ kind: 'listing', ownerId: LISTING, sourcePath: src }), r);
  check('20 photos déjà : 409, message clair, original supprimé, rien enregistré', r.statusCode === 409 && /20 photos/.test(r.json.message) && state.deletes.includes(src) && !state.writes.length);
  state.access = { ok: false, error: 'forbidden' };
  r = res();
  await handler(req({ kind: 'listing', ownerId: LISTING, sourcePath: src }), r);
  check('annonce d’une autre agence : 403', r.statusCode === 403);
  state.access = { ok: true, count: 0, max: 20 };
  for (const bad of [`listings/${LISTING}/photo.jpg`, `listings/33333333-3333-4444-8555-666666666666/src/a.jpg`, `listings/${LISTING}/src/../../x.jpg`, `developments/${LISTING}/src/a.jpg`]) {
    r = res();
    await handler(req({ kind: 'listing', ownerId: LISTING, sourcePath: bad }), r);
    assert(r.statusCode === 400, 'bad path ' + bad);
  }
  check('chemin source hors du dossier « src » de cette annonce : refusé', true);
  r = res();
  await handler(req({ kind: 'listing', ownerId: LISTING, sourcePath: src }, { authorization: '' }), r);
  check('sans session : 401', r.statusCode === 401);
  state.source = Buffer.from('not an image at all');
  state.deletes = [];
  r = res();
  await handler(req({ kind: 'listing', ownerId: LISTING, sourcePath: src }), r);
  check('fichier illisible : 422 en français, original supprimé', r.statusCode === 422 && /image/.test(r.json.message) && state.deletes.includes(src));
  state.source = phone; state.linkFails = true; state.writes = []; state.deletes = []; state.db = [];
  r = res();
  await handler(req({ kind: 'listing', ownerId: LISTING, sourcePath: src }), r);
  check('limite atteinte au moment de lier (envoi simultané) : rien ne reste', r.statusCode === 409 && state.db.some(x => x.method === 'DELETE' && x.p.startsWith('media_assets?id=eq.asset-1')) && state.writes.every(wr => state.deletes.includes(wr.path)));
  state.linkFails = false;

  // ---------- navigateur
  const opt = require(path.join(WEB, 'src', 'services', 'image-optimize.js'));
  check('navigateur : ne prépare que les très grandes photos (> 3200 px ou > 6 Mo)', opt.needsPreparation(4032, 3024, 2e6) && opt.needsPreparation(3000, 2000, 9e6) && !opt.needsPreparation(3000, 2000, 3e6));
  check('navigateur : 30 Mo au maximum, poids lisible en français', opt.MAX_UPLOAD_BYTES === 30 * 1024 * 1024 && opt.formatBytes(5.2 * 1024 * 1024) === '5,2 Mo' && opt.formatBytes(420 * 1024) === '420 Ko');
  const admin = fs.readFileSync(path.join(WEB, 'src', 'services', 'admin.js'), 'utf8');
  check('envoi : dossier « src », puis traitement par /api/media/photo avec la session', /\/src\/\$\{stamp\}/.test(admin) && /api\/media\/photo/.test(admin) && /Bearer ' \+ session\.access_token/.test(admin));
  check('suppression : la vignette part avec la photo', /-card\.webp/.test(admin));
  const partner = fs.readFileSync(path.join(APPS, 'zfind-partner', 'src', 'app.js'), 'utf8');
  check('Partner : plusieurs photos à la fois, compteur 20, poids avant / après', /multiple/.test(partner) && /const PMEDIA_MAX = 20/.test(partner) && /formatBytes\(queue\[i\]\.size\)/.test(partner));
  const adminApp = fs.readFileSync(path.join(APPS, 'zfind-admin', 'src', 'app.js'), 'utf8');
  check('Admin : plusieurs photos à la fois', /id="media-upload-input"[^>]*multiple/.test(adminApp));

  // ---------- site
  const vm = fs.readFileSync(path.join(WEB, 'src', 'viewmodels.js'), 'utf8');
  check('grilles : vignette 800 px ; page du bien : image principale (jamais la vignette)', /pickMediaStoragePath\(asset, 'card'\)/.test(vm) && /purpose === 'card'/.test(vm));
  const vercel = JSON.parse(fs.readFileSync(path.join(WEB, 'vercel.json'), 'utf8'));
  check('route /api/media/photo, toujours 12 fonctions', vercel.rewrites.some(x => x.source === '/api/media/photo' && x.destination === '/api/media-import?route=photo') && fs.readdirSync(path.join(WEB, 'api')).filter(f => f.endsWith('.js')).length <= 12);

  // ---------- base
  const mig = fs.readFileSync(path.join(ROOT, 'infrastructure', 'supabase', 'migrations', '20261030090000_z_find_photo_limits_v1.sql'), 'utf8');
  check('migration : 20 photos (déclencheur sur annonces et programmes), bucket 30 Mo images seulement', /select 20/.test(mig) && /before insert on public\.listing_media/.test(mig) && /before insert on public\.development_media/.test(mig) && /31457280/.test(mig));

  console.log(`\n${passed} checks passed.`);
})().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
