/* ============================================================
   Z FIND — ouvrir Z Desk et Z Studio depuis l'espace Partner,
   sans nouvelle connexion (servi par /api/billing/app-link).

   Le serveur vérifie la session de l'agence, puis demande à Supabase
   Auth un lien de connexion à usage unique pour le même compte
   (admin generate_link, type magiclink : aucun e-mail n'est envoyé).
   Seule l'empreinte du jeton (hashed_token) part vers l'app, dans le
   fragment de l'URL (#zos_link=…) : jamais dans les journaux serveur
   ni dans le Referer. Z Desk / Z Studio l'échangent contre leur propre
   session (verifyOtp token_hash) ; la session Partner n'est pas
   partagée et reste intacte.
   ============================================================ */
'use strict';

const S = require('./server');

const DEFAULT_SUPABASE_URL = 'https://dcdggqyazdddrfuzwavw.supabase.co';
const APPS = {
  desk: { env: 'ZFIND_DESK_URL', fallback: 'https://desk.zfind.online', path: '/fr/login?next=%2Ffr%2Frequests' },
  studio: { env: 'ZFIND_STUDIO_URL', fallback: 'https://z-studio-web.vercel.app', path: '/' }
};

function appBase(app) {
  const def = APPS[app];
  const raw = String(S.env(def.env, def.fallback) || def.fallback).trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9.-]+$/i.test(raw) ? raw : def.fallback;
}

/** URL opened by the Partner space: base + path + #zos_link=<hash>&zos_type=<type>. */
function appUrl(app, hashedToken, verificationType) {
  if (!APPS[app]) throw new Error('unknown_app');
  const frag = `zos_link=${encodeURIComponent(hashedToken)}&zos_type=${encodeURIComponent(verificationType || 'magiclink')}`;
  return `${appBase(app)}${APPS[app].path}#${frag}`;
}

/** One-time sign-in token for this e-mail (Supabase Auth admin API, no e-mail sent). */
async function generateLink(email) {
  const key = String(S.env('ZFIND_SUPABASE_SERVICE_KEY', '')).trim();
  const base = S.env('SUPABASE_URL', DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const auth = /^eyJ/.test(key) ? { Authorization: `Bearer ${key}` } : {};
  const r = await fetch(`${base}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: Object.assign({ apikey: key, 'Content-Type': 'application/json' }, auth),
    body: JSON.stringify({ type: 'magiclink', email })
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) {
    const e = new Error(`generate_link ${r.status}`);
    e.code = 'auth_link';
    throw e;
  }
  const props = j.properties || j;
  const hashed = props.hashed_token;
  if (!hashed || !/^[A-Za-z0-9_-]{20,200}$/.test(String(hashed))) {
    const e = new Error('generate_link: no hashed_token');
    e.code = 'auth_link';
    throw e;
  }
  return { hashedToken: String(hashed), verificationType: String(props.verification_type || 'magiclink') };
}

/** POST /api/billing/app-link { app: 'desk' | 'studio' } — auth: { userId, email, partnerId }. */
async function appLink(req, res, auth) {
  const body = await S.readBody(req).catch(() => null);
  const app = String((body && body.app) || '').toLowerCase();
  if (!APPS[app]) return S.sendJson(res, 400, { ok: false, error: 'unknown_app' });
  if (!auth.email) return S.sendJson(res, 400, { ok: false, error: 'no_email' });
  const partners = await S.db(`partners?id=eq.${auth.partnerId}&select=status`);
  const status = partners && partners[0] && partners[0].status;
  // Z Desk Lite et Z Studio sont inclus pour les agences actives (comme l'abonnement inclus Studio).
  if (status !== 'active') return S.sendJson(res, 403, { ok: false, error: 'partner_not_active' });
  const link = await generateLink(String(auth.email).toLowerCase());
  return S.sendJson(res, 200, { ok: true, url: appUrl(app, link.hashedToken, link.verificationType) });
}

module.exports = { appLink, appUrl, generateLink, APPS };
