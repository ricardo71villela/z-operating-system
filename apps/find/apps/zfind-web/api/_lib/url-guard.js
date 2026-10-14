/* ============================================================
   Z FIND — outgoing URL guard (not a function: Vercel ignores api/_lib)

   Shared by /api/media-import (agency photo links) and /api/feed-sync
   (agency feeds): the site's server only fetches addresses on the public
   internet — never its own network, cloud metadata or a local service.
   - http(s) only (feeds: https only), no user:password@ in the address;
   - host names resolved first: every address must be public (IPv4 / IPv6
     private, loopback, link-local incl. 169.254.169.254 metadata, CGNAT,
     benchmark, documentation, multicast, reserved; IPv4-mapped /
     -compatible / NAT64 IPv6 forms of those included);
   - guardedFetch: the connection itself goes through a DNS lookup that
     refuses private addresses (no DNS-rebinding window between the check
     and the connection), every redirect hop is checked again, the
     credentials only go to the first origin, size cap and timeout.
   ============================================================ */
'use strict';

const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');

function privateV4(ip) {
  const [a, b, c] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

/** IPv6 text → 8 numbers (null when not IPv6). */
function expandV6(ip) {
  let v = String(ip).toLowerCase().replace(/%.*$/, '');
  if (!net.isIPv6(v)) return null;
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (tail) {
    const [a, b, c, d] = tail[1].split('.').map(Number);
    v = v.slice(0, -tail[1].length) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const [head, rest] = v.split('::');
  const h = head ? head.split(':') : [];
  const r = rest === undefined ? [] : (rest ? rest.split(':') : []);
  const fill = v.includes('::') ? 8 - h.length - r.length : 0;
  const parts = h.concat(Array(fill).fill('0'), r).map(x => parseInt(x || '0', 16));
  return parts.length === 8 ? parts : null;
}

function privateIp(ip) {
  const s = String(ip || '');
  if (net.isIPv4(s)) return privateV4(s);
  const p = expandV6(s);
  if (!p) return true; // not an address we understand: refused
  const v4 = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  const zero = n => p.slice(0, n).every(x => x === 0);
  if (p.every(x => x === 0)) return true; // ::
  if (zero(7) && p[7] === 1) return true; // ::1
  if (zero(5) && p[5] === 0xffff) return privateV4(v4(p[6], p[7])); // ::ffff:a.b.c.d (mapped)
  if (zero(6)) return privateV4(v4(p[6], p[7])); // ::a.b.c.d (compatible, deprecated)
  if (p[0] === 0x64 && p[1] === 0xff9b && p.slice(2, 6).every(x => x === 0)) return privateV4(v4(p[6], p[7])); // NAT64
  if ((p[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((p[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((p[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((p[0] & 0xff00) === 0xff00) return true; // multicast
  if (p[0] === 0x2001 && p[1] === 0x0db8) return true; // documentation
  if (p[0] === 0x0100 && zero(4)) return true; // discard prefix
  return false;
}

const allowed = (o, address) => !!(o.allowAddresses && o.allowAddresses.has && o.allowAddresses.has(address));
const resolveAll = (o, host) => new Promise((resolve, reject) => {
  const lookup = o.lookup || dns.lookup;
  const done = (err, list) => (err ? reject(err) : resolve(Array.isArray(list) ? list : [{ address: list }]));
  const out = lookup(host, { all: true }, done);
  if (out && typeof out.then === 'function') out.then(list => done(null, list), done);
});

/** raw → URL, or throws a short French reason.
    opts: { lookup (dns.lookup-like or async, tests), httpsOnly,
    allowAddresses (tests only: a Set of addresses accepted although private, e.g. a local server) }. */
async function checkUrl(raw, opts) {
  const o = typeof opts === 'function' ? { lookup: opts } : (opts || {});
  let u;
  try { u = new URL(raw); } catch (_) { throw new Error('lien invalide'); }
  if (o.httpsOnly ? u.protocol !== 'https:' : !/^https?:$/.test(u.protocol)) throw new Error(o.httpsOnly ? 'adresse non https' : 'lien non http(s)');
  if (u.username || u.password) throw new Error('lien avec identifiants');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error('adresse interne');
  let addresses;
  try { addresses = net.isIP(host) ? [{ address: host }] : await resolveAll(o, host); } catch (_) { throw new Error('nom de domaine introuvable'); }
  if (!addresses.length || addresses.some(a => privateIp(a.address) && !allowed(o, a.address))) throw new Error('adresse interne');
  return u;
}

/** dns.lookup for http(s).request: the address actually connected to is checked. */
function safeLookup(o) {
  return (hostname, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'object' && options ? options : {};
    resolveAll(o, hostname).then(list => {
      const bad = list.find(a => privateIp(a.address) && !allowed(o, a.address));
      if (!list.length || bad) { const e = new Error('adresse interne'); e.code = 'EZFIND_PRIVATE'; return cb(e); }
      const withFamily = list.map(a => ({ address: a.address, family: a.family || (net.isIPv6(a.address) ? 6 : 4) }));
      if (opts.all) return cb(null, withFamily);
      return cb(null, withFamily[0].address, withFamily[0].family);
    }, err => cb(err));
  };
}

const MB = 1024 * 1024;

/** One GET, no redirect following. → { status, headers, body (Uint8Array, or null for a redirect) }. */
function requestOnce(u, o, headers) {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const literal = net.isIP(host);
    if (literal && privateIp(host) && !allowed(o, host)) { reject(new Error('adresse interne')); return; }
    const req = mod.request(u, Object.assign({ method: 'GET', headers, lookup: literal ? undefined : safeLookup(o), agent: false }, o.ca ? { ca: o.ca } : {}));
    const timer = setTimeout(() => { req.destroy(Object.assign(new Error('timeout'), { code: 'EZFIND_TIMEOUT' })); }, o.timeoutMs || 30000);
    const fail = e => { clearTimeout(timer); reject(e); };
    req.on('error', fail);
    req.on('response', res => {
      const status = res.statusCode;
      const hdrs = res.headers || {};
      if (status >= 300 && status < 400 && hdrs.location) { res.resume(); clearTimeout(timer); resolve({ status, headers: hdrs, body: null }); return; }
      const max = o.maxBytes || 50 * MB;
      const declared = Number(hdrs['content-length'] || 0);
      if (status >= 200 && status < 300 && declared > max) { res.destroy(); fail(Object.assign(new Error('too_large'), { code: 'EZFIND_TOO_LARGE', size: declared })); return; }
      const chunks = []; let size = 0;
      res.on('data', c => {
        size += c.length;
        if (size > max) { res.destroy(); req.destroy(); fail(Object.assign(new Error('too_large'), { code: 'EZFIND_TOO_LARGE', size })); return; }
        chunks.push(c);
      });
      res.on('end', () => { clearTimeout(timer); resolve({ status, headers: hdrs, body: new Uint8Array(Buffer.concat(chunks)) }); });
      res.on('error', fail);
    });
    req.end();
  });
}

/** GET with every hop guarded. opts: { headers, credentials: { user, password } (Basic, first origin only),
    timeoutMs, maxBytes, maxRedirects (3), httpsOnly, lookup, allowAddresses, ca (tests: a local HTTPS server's certificate) }.
    → { status, headers, bytes, url }; throws Error with a short French message (code EZFIND_*). */
async function guardedFetch(raw, opts) {
  const o = opts || {};
  const firstOrigin = new URL(raw).origin;
  let current = raw;
  for (let hop = 0; hop <= (o.maxRedirects == null ? 3 : o.maxRedirects); hop++) {
    const u = await checkUrl(current, o);
    if (hop > 0 && o.httpsOnly && u.protocol !== 'https:') throw new Error('redirection vers une adresse non https');
    const headers = Object.assign({}, o.headers || {});
    if (o.credentials && o.credentials.user && u.origin === firstOrigin) {
      headers.Authorization = 'Basic ' + Buffer.from(`${o.credentials.user}:${o.credentials.password || ''}`, 'utf8').toString('base64');
    }
    let r;
    try { r = await requestOnce(u, o, headers); }
    catch (e) {
      if (e.code === 'EZFIND_PRIVATE' || e.message === 'adresse interne') throw new Error('adresse interne');
      if (e.code === 'EZFIND_TIMEOUT') throw Object.assign(new Error(`délai dépassé (${Math.round((o.timeoutMs || 30000) / 1000)} s)`), { code: 'EZFIND_TIMEOUT' });
      if (e.code === 'EZFIND_TOO_LARGE') throw Object.assign(new Error(`fichier trop volumineux (plus de ${Math.round((o.maxBytes || 50 * MB) / MB)} Mo)`), { code: 'EZFIND_TOO_LARGE' });
      if (e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN') throw new Error('nom de domaine introuvable');
      throw new Error('serveur injoignable');
    }
    if (r.body === null) { current = new URL(r.headers.location, u).toString(); continue; }
    return { status: r.status, headers: r.headers, bytes: r.body, url: u.toString() };
  }
  throw new Error('trop de redirections');
}

module.exports = { privateIp, expandV6, checkUrl, safeLookup, guardedFetch };
