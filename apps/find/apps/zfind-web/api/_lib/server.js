/* ============================================================
   Z FIND — shared helpers for the alert and review functions
   (not a function itself: Vercel ignores files under api/_lib).

   Environment:
     ZFIND_SUPABASE_SERVICE_KEY  Supabase secret (service role) key — server only
     SUPABASE_URL                optional, defaults to the Z Find project
     RESEND_API_KEY, ZFIND_EMAIL_FROM, ZFIND_LEAD_NOTIFY_EMAIL, SITE_BASE_URL
     CRON_SECRET                 protects the weekly job (Vercel Cron sends it)
   ============================================================ */
'use strict';

const DEFAULT_SUPABASE_URL = 'https://dcdggqyazdddrfuzwavw.supabase.co';
const MAX_BODY = 16 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function env(name, fallback) { const v = process.env[name]; return v == null || v === '' ? fallback : v; }
function siteUrl() { return env('SITE_BASE_URL', 'https://zfind.online').replace(/\/+$/, ''); }
function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function oneLine(v, max) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 200); }
function lang(v) { return v === 'en' ? 'en' : 'fr'; }

function configured(parts) {
  const need = { db: ['ZFIND_SUPABASE_SERVICE_KEY'], mail: ['RESEND_API_KEY', 'ZFIND_EMAIL_FROM'] };
  return (parts || ['db', 'mail']).every(p => (need[p] || []).every(n => env(n)));
}

/* JSON (from the site) or a plain HTML form post (from the pages below). */
function parseBody(text, type) {
  if (/application\/x-www-form-urlencoded/i.test(type || '')) return Object.fromEntries(new URLSearchParams(text));
  return JSON.parse(text || '{}');
}
async function readBody(req) {
  const type = req.headers && req.headers['content-type'];
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return parseBody(req.body, type);
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(parseBody(Buffer.concat(chunks).toString('utf8'), type)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function queryOf(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  try { return Object.fromEntries(new URL(req.url || '/', 'http://local').searchParams); } catch (_) { return {}; }
}

const hits = new Map();
function limited(req, max, windowMs) {
  const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || 'local').split(',')[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < (windowMs || 600000));
  list.push(now);
  hits.set(ip, list);
  return list.length > (max || 8);
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

/* A small branded HTML page for links opened from an e-mail. */
function sendPage(res, status, l, title, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  const back = l === 'en' ? 'Back to Z Find' : 'Retour à Z Find';
  res.end(`<!doctype html><html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} — Z Find</title>
<style>body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#faf7f0;color:#1d1a16}main{max-width:560px;margin:12vh auto;padding:32px 24px;background:#fff;border:1px solid #e7e1d4;border-radius:10px}h1{font-family:Georgia,serif;font-weight:400;font-size:1.7rem;margin:0 0 12px}p{line-height:1.6;color:#4a453d}a.back,button{display:inline-block;margin-top:18px;padding:12px 18px;background:#8a6a36;color:#fff;border:0;border-radius:6px;text-decoration:none;font-weight:600;font-size:1rem;cursor:pointer}button.alt{background:#fff;color:#8a6a36;border:1px solid #8a6a36;margin-left:8px}label{display:block;margin:14px 0 6px;font-weight:600}input[type=text],textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d8d0c0;border-radius:6px;font:inherit}textarea{min-height:120px}.stars{display:flex;gap:14px;flex-wrap:wrap}.stars label{font-weight:400;margin:0}.check{font-weight:400;display:flex;gap:8px;align-items:flex-start}.muted{font-size:.85rem;color:#7a7266}</style></head>
<body><main><h1>${esc(title)}</h1><div>${body}</div><a class="back" href="${esc(siteUrl())}/#/${l}">${back}</a></main></body></html>`);
}

/* Supabase REST with the secret key (server only). */
async function db(pathAndQuery, options) {
  const key = env('ZFIND_SUPABASE_SERVICE_KEY');
  const base = env('SUPABASE_URL', DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const opts = options || {};
  const response = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
    method: opts.method || 'GET',
    headers: Object.assign({
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation'
    }, opts.headers || {}),
    body: opts.body == null ? undefined : JSON.stringify(opts.body)
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`db ${response.status}: ${text.slice(0, 200)}`);
    error.status = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

async function sendMail(message) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ from: env('ZFIND_EMAIL_FROM') }, message))
  });
  if (!response.ok) throw new Error(`resend ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json().catch(() => ({}));
}

/* E-mail layout shared by alerts and reviews. */
function mailHtml(l, heading, bodyHtml, footerHtml) {
  return `<!doctype html><html lang="${l}"><body style="margin:0;background:#faf7f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1a16">
<div style="max-width:600px;margin:0 auto;padding:28px 20px"><div style="font-family:Georgia,serif;font-size:22px;color:#8a6a36;margin-bottom:18px">Z Find</div>
<div style="background:#fff;border:1px solid #e7e1d4;border-radius:10px;padding:24px"><h1 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 14px">${esc(heading)}</h1>${bodyHtml}</div>
<p style="font-size:12px;color:#7a7266;line-height:1.5;margin-top:16px">${footerHtml || ''}</p></div></body></html>`;
}

function button(href, label) {
  return `<p style="margin:22px 0"><a href="${esc(href)}" style="display:inline-block;padding:12px 18px;background:#8a6a36;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;
}

module.exports = { EMAIL_RE, UUID_RE, env, siteUrl, esc, oneLine, lang, configured, readBody, queryOf, limited, sendJson, sendPage, db, sendMail, mailHtml, button };
