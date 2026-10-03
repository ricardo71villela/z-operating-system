/* ============================================================
   Z FIND — POST /api/estimation (Vercel serverless function)

   Receives an estimation request from the public page, recomputes the
   estimate server-side with the same engine and the same published data
   (never trusting figures sent by the browser), then sends through Resend:
     1. a lead notification to Z Find   (ZFIND_LEAD_NOTIFY_EMAIL)
     2. the detailed report to the visitor
   The notification goes first: if it cannot be sent, nothing is sent to
   the visitor and the page asks them to retry, so no lead is lost silently.

   Environment (Vercel project settings):
     RESEND_API_KEY           Resend API key
     ZFIND_EMAIL_FROM         e.g. "Z Find <hello@zfind.online>" (domain verified in Resend)
     ZFIND_LEAD_NOTIFY_EMAIL  address that receives the leads
     SITE_BASE_URL            public site URL, e.g. https://zfind.online
     ZFIND_SUPABASE_SERVICE_KEY  optional: value alerts (see api/alerts.js)
   The lead itself is not stored: it exists only in the notification e-mail.
   When the owner asks for value alerts, a pending subscription is saved
   (double opt-in: a confirmation e-mail is sent, nothing else until then).
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');
const engine = require('../src/services/estimation.js');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY = 12 * 1024;
const RATE = { windowMs: 10 * 60 * 1000, max: 6 };
const hits = new Map(); // best effort, per function instance

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[\d+\s().-]{7,20}$/;
const PROJECTS = new Set(['sell_3m', 'sell_12m', 'later', 'curious', 'buy_3m', 'buy_12m', 'looking']);

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function oneLine(v, max) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 200); }

function loadJson(rel) {
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  if (!/^(market-data|geo)[/\\]/.test(safe)) return Promise.reject(new Error('path'));
  return fs.promises.readFile(path.join(PUBLIC_DIR, safe), 'utf8').then(JSON.parse);
}

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < RATE.windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE.max;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/* Only known fields reach the engine. */
function cleanInput(raw) {
  const x = raw || {};
  const features = {};
  ['balcony', 'terrace', 'garden', 'parking', 'pool', 'view', 'coownership'].forEach(k => { if (x.features && x.features[k] === true) features[k] = true; });
  return {
    market: x.market, communeCode: typeof x.communeCode === 'string' ? x.communeCode.slice(0, 20) : '',
    type: x.type, surface: Number(x.surface),
    condition: ['to_renovate', 'standard', 'good', 'renovated'].includes(x.condition) ? x.condition : 'standard',
    energy: /^[A-G]$/.test(String(x.energy || '')) ? x.energy : null,
    features,
    floor: Number.isInteger(x.floor) && x.floor >= 0 && x.floor <= 60 ? x.floor : null,
    lift: typeof x.lift === 'boolean' ? x.lift : null,
    newBuild: x.newBuild === true,
    houseKind: engine.HOUSE_KINDS.includes(x.houseKind) ? x.houseKind : null,
    askingPrice: x.askingPrice == null ? null : Number(x.askingPrice),
    refine: engine.cleanRefine(x.refine, x.type)
  };
}

async function placeName(market, code) {
  try {
    const rows = await loadJson(`geo/search/${market.toLowerCase()}.json`);
    const row = rows.find(r => r[0] === code);
    return row ? row[1] : code;
  } catch (_) { return code; }
}

/* ---------------- E-mails ---------------- */
const T = {
  fr: {
    subject: (place) => `Votre estimation Z Find — ${place}`,
    hello: n => n ? `Bonjour ${n},` : 'Bonjour,',
    intro: 'Voici le détail de l’estimation que vous avez demandée sur Z Find.',
    range: 'Fourchette estimée', central: 'Valeur centrale', perM2: 'Prix au m²', reliability: 'Fiabilité',
    conf: { high: 'élevée', medium: 'moyenne', low: 'limitée' },
    property: 'Le bien', basis: 'Base de calcul', adjustments: 'Ajustements', none: 'aucun',
    asking: 'Prix demandé', position: { below: 'sous la fourchette', within: 'dans la fourchette', above: 'au-dessus de la fourchette' },
    types: { apartment: 'Appartement', house: 'Maison', house_closed: 'Maison 2-3 façades', house_open: 'Maison 4 façades' },
    cond: { to_renovate: 'à rénover', standard: 'correct', good: 'bon état', renovated: 'refait à neuf' },
    adj: { condition: 'État', energy: 'Performance énergétique', outdoor: 'Extérieur', parking: 'Stationnement', pool: 'Piscine', view: 'Vue', ground_floor: 'Rez-de-chaussée', high_floor_no_lift: 'Étage élevé sans ascenseur', position: 'Emplacement et standing', house_kind: 'Type de maison', coownership: 'Copropriété', era: 'Époque de construction', light: 'Luminosité', land: 'Terrain', top_floor: 'Dernier étage', cellar: 'Cave', nuisance: 'Nuisances' },
    sales: 'ventes', adverts: 'annonces', period: 'période',
    market: 'Voir les prix et les communes de ce marché',
    disclaimer: 'Estimation statistique indicative, fondée sur des données publiques agrégées ; elle ne remplace pas l’avis de valeur d’un professionnel qui visite le bien.',
    privacy: 'Vous recevez ce message parce que vous l’avez demandé sur zfind.online. Pour accéder à vos données, les rectifier ou les supprimer : hello@zfind.online.',
    agencyShared: 'Vous avez accepté d’être mis en relation avec une agence partenaire de votre commune : vos coordonnées lui seront transmises, à elle seule. Pour retirer votre accord : hello@zfind.online.'
  },
  en: {
    subject: (place) => `Your Z Find estimate — ${place}`,
    hello: n => n ? `Hello ${n},` : 'Hello,',
    intro: 'Here are the details of the estimate you requested on Z Find.',
    range: 'Estimated range', central: 'Central value', perM2: 'Price per m²', reliability: 'Reliability',
    conf: { high: 'high', medium: 'medium', low: 'limited' },
    property: 'The property', basis: 'Basis', adjustments: 'Adjustments', none: 'none',
    asking: 'Asking price', position: { below: 'below the range', within: 'within the range', above: 'above the range' },
    types: { apartment: 'Apartment', house: 'House', house_closed: 'House, 2-3 façades', house_open: 'House, 4 façades' },
    cond: { to_renovate: 'needs renovation', standard: 'fair', good: 'good', renovated: 'fully renovated' },
    adj: { condition: 'Condition', energy: 'Energy performance', outdoor: 'Outdoor space', parking: 'Parking', pool: 'Pool', view: 'View', ground_floor: 'Ground floor', high_floor_no_lift: 'High floor without lift', position: 'Location and standard', house_kind: 'House layout', coownership: 'Co-ownership', era: 'Construction period', light: 'Natural light', land: 'Plot', top_floor: 'Top floor', cellar: 'Cellar', nuisance: 'Nuisances' },
    sales: 'sales', adverts: 'adverts', period: 'period',
    market: 'See prices and municipalities for this market',
    disclaimer: 'Indicative statistical estimate based on aggregated public data; it does not replace a valuation by a professional who visits the property.',
    privacy: 'You receive this message because you requested it on zfind.online. To access, correct or delete your data: hello@zfind.online.',
    agencyShared: 'You agreed to be put in touch with a partner agency in your municipality: your contact details will be passed on to that agency only. To withdraw your agreement: hello@zfind.online.'
  }
};

function money(v, lang) {
  const n = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-IE', { maximumFractionDigits: 0 }).format(v);
  return lang === 'fr' ? `${n} €` : `€${n}`;
}
function pct(v, lang) {
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-IE', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'always' }).format(v);
}

const HOUSE_KIND_TEXT = {
  fr: { detached: 'isolée', semi: 'jumelée', terraced: 'mitoyenne (en bande)' },
  en: { detached: 'detached', semi: 'semi-detached', terraced: 'terraced' }
};
function propertyLine(t, input, place) {
  const en = t === T.en;
  const kind = input.houseKind && HOUSE_KIND_TEXT[en ? 'en' : 'fr'][input.houseKind] ? ` ${HOUSE_KIND_TEXT[en ? 'en' : 'fr'][input.houseKind]}` : '';
  const copro = input.features && input.features.coownership ? (en ? ' in a co-ownership' : ' en copropriété') : '';
  const parts = [`${t.types[input.type]}${kind}${copro}, ${input.surface} m²`, place, t.cond[input.condition]];
  if (input.energy) parts.push(`${input.market === 'BE' ? 'PEB' : input.market === 'FR' ? 'DPE' : 'CPE'} ${input.energy}`);
  if (input.newBuild) parts.push('VEFA');
  return parts.join(' · ');
}

function reportEmail(lang, input, result, place, contact, site) {
  const t = T[lang] || T.en;
  const rows = [
    [t.range, `${money(result.low, lang)} – ${money(result.high, lang)}`],
    [t.central, money(result.central, lang)],
    [t.perM2, money(result.perM2, lang)],
    [t.reliability, t.conf[result.confidence]]
  ];
  if (result.buyer) rows.push([t.asking, `${money(result.buyer.askingPrice, lang)} — ${t.position[result.buyer.position]} (${pct(result.buyer.deltaPct, lang)})`]);
  const adj = result.adjustments.length ? result.adjustments.map(a => `${t.adj[a.key] || a.key} ${pct(a.pct, lang)}`).join(' · ') : t.none;
  const b = result.basis;
  const basis = `${b.name} · ${b.n ? `${b.n} ${b.segment === 'advertised_houses' ? t.adverts : t.sales} · ` : ''}${t.period} ${engine.formatPeriod(b.period, lang)} · ${b.source}`;
  const marketUrl = `${site}/#/${lang}/market/${input.market}`;
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1d1d1b;max-width:600px;margin:0 auto;padding:24px;">
  <p style="color:#8B6B3A;letter-spacing:.08em;text-transform:uppercase;font-size:12px;margin:0 0 8px;">Z Find</p>
  <p>${esc(t.hello(contact.name))}</p><p>${esc(t.intro)}</p>
  <p style="margin:18px 0 6px;font-weight:bold;">${esc(t.property)}</p><p style="margin:0;">${esc(propertyLine(t, input, place))}</p>
  <table style="border-collapse:collapse;width:100%;margin:18px 0;">${rows.map(([k, v]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#666;">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:bold;">${esc(v)}</td></tr>`).join('')}</table>
  <p style="margin:0 0 4px;font-weight:bold;">${esc(t.basis)}</p><p style="margin:0 0 12px;color:#444;">${esc(basis)}</p>
  <p style="margin:0 0 4px;font-weight:bold;">${esc(t.adjustments)}</p><p style="margin:0 0 18px;color:#444;">${esc(adj)}</p>
  <p><a href="${esc(marketUrl)}" style="color:#8B6B3A;">${esc(t.market)}</a></p>
  <p style="color:#888;font-size:12px;line-height:1.5;margin-top:24px;">${esc(t.disclaimer)}</p>
  ${contact.agencyConsent ? `<p style="color:#888;font-size:12px;line-height:1.5;">${esc(t.agencyShared)}</p>` : ''}
  <p style="color:#888;font-size:12px;line-height:1.5;">${esc(t.privacy)}</p></body></html>`;
  const text = [t.hello(contact.name), '', t.intro, '', `${t.property}: ${propertyLine(t, input, place)}`, ...rows.map(([k, v]) => `${k}: ${v}`),
    `${t.basis}: ${basis}`, `${t.adjustments}: ${adj}`, '', `${t.market}: ${marketUrl}`, '', t.disclaimer, ...(contact.agencyConsent ? [t.agencyShared] : []), t.privacy].join('\n');
  return { subject: oneLine(t.subject(place), 150), html, text };
}

const PROJECT_PT = { sell_3m: 'Vender em 3 meses', sell_12m: 'Vender no próximo ano', later: 'Vender mais tarde', curious: 'Curiosidade', buy_3m: 'Comprar em 3 meses', buy_12m: 'Comprar no próximo ano', looking: 'A informar-se' };

const REFINE_PT = {
  location: { label: 'localização', v: { less_sought: 'excêntrica/pouco procurada', standard: 'corrente', sought: 'residencial procurada', prime: 'muito procurada' } },
  view: { label: 'vista', v: { none: 'sem vista', open: 'desafogada', mountain: 'montanha', lake_partial: 'lago parcial', lake: 'lago panorâmica' } },
  standing: { label: 'standing', v: { modest: 'modesto', standard: 'corrente', high: 'alto', prestige: 'prestígio' } },
  era: { label: 'construção', v: { pre1950: 'antes de 1950', '1950_1980': '1950-1980', '1980_2010': '1980-2010', post2010: 'depois de 2010' } },
  light: { label: 'luz', v: { dark: 'sombrio', standard: 'normal', bright: 'muito luminoso' } },
  parking: { label: 'estacionamento', v: { none: 'nenhum', outdoor: 'lugar exterior', garage: 'garagem/box', double_garage: 'garagem dupla' } }
};
function refineSummaryPt(r) {
  const x = r || {};
  const parts = [];
  Object.keys(REFINE_PT).forEach(k => { if (x[k]) parts.push(`${REFINE_PT[k].label}: ${REFINE_PT[k].v[x[k]] || x[k]}`); });
  if (x.outdoorArea != null) parts.push(`exterior ${x.outdoorArea} m²`);
  if (x.landArea != null) parts.push(`terreno ${x.landArea} m²`);
  if (x.topFloor) parts.push('último andar');
  if (x.cellar) parts.push('cave');
  if (x.nuisance) parts.push('incómodos');
  return parts.length ? parts.join(' · ') : '—';
}

function leadEmail(lang, mode, input, result, place, contact) {
  const t = T.fr;
  const who = contact.name || contact.email;
  const lines = [
    ['Tipo de lead', mode === 'buyer' ? 'Comprador (verificar um preço)' : 'Proprietário (estimar o bem)'],
    ['Projeto', PROJECT_PT[contact.project] || '—'],
    ['Nome', contact.name || '—'], ['E-mail', contact.email], ['Telefone', contact.phone || '—'],
    ['Alertas de preços', contact.alerts ? 'Sim' : 'Não'], ['Língua', lang],
    ['Mercado', input.market], ['Bem', propertyLine(t, input, place)],
    ['Estimativa', `${money(result.low, 'fr')} – ${money(result.high, 'fr')} (central ${money(result.central, 'fr')}, ${money(result.perM2, 'fr')}/m², fiabilidade ${({ high: 'alta', medium: 'média', low: 'limitada' })[result.confidence]})`],
    ['Preço pedido', result.buyer ? `${money(result.buyer.askingPrice, 'fr')} (${pct(result.buyer.deltaPct, 'fr')} vs central)` : '—'],
    ['Base', `${result.basis.level} ${result.basis.name}, n=${result.basis.n || '—'}, ${result.basis.period}`],
    ['Detalhes (afinar)', refineSummaryPt(input.refine)],
    ['Consentimento (relatório)', `sim, ${new Date().toISOString()}`],
    ['Partilha com agência parceira', contact.agencyConsent ? `AUTORIZADA pelo proprietário (${new Date().toISOString()}) — a uma só agência da comuna` : 'NÃO autorizada — não transmitir a nenhuma agência']
  ];
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1d1d1b;">
  <h2 style="margin:0 0 12px;">Novo lead — estimativa Z Find</h2>
  <table style="border-collapse:collapse;">${lines.map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#666;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;"><strong>${esc(v)}</strong></td></tr>`).join('')}</table>
  <p style="color:#888;font-size:12px;">Responder a este e-mail responde diretamente a ${esc(contact.email)}.</p></body></html>`;
  return {
    subject: oneLine(`Novo lead ${mode === 'buyer' ? 'comprador' : 'proprietário'} — ${place} (${input.market}) — ${who}`, 180),
    html,
    text: lines.map(([k, v]) => `${k}: ${v}`).join('\n')
  };
}

async function resend(message) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });
  if (!r.ok) throw new Error(`resend ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { ok: false, error: 'method' }); }
  const { RESEND_API_KEY, ZFIND_EMAIL_FROM, ZFIND_LEAD_NOTIFY_EMAIL } = process.env;
  if (!RESEND_API_KEY || !ZFIND_EMAIL_FROM || !ZFIND_LEAD_NOTIFY_EMAIL) {
    console.error('estimation: e-mail is not configured (RESEND_API_KEY, ZFIND_EMAIL_FROM, ZFIND_LEAD_NOTIFY_EMAIL)');
    return send(res, 503, { ok: false, error: 'not_configured' });
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (limited(ip)) return send(res, 429, { ok: false, error: 'rate_limited' });

  let body;
  try { body = await readBody(req); } catch (_) { return send(res, 400, { ok: false, error: 'body' }); }
  if (body.website) return send(res, 200, { ok: true }); // honeypot: pretend success

  const lang = body.lang === 'en' ? 'en' : 'fr';
  const mode = body.mode === 'buyer' ? 'buyer' : 'owner';
  const c = body.contact || {};
  const contact = {
    name: oneLine(c.name, 120), email: oneLine(c.email, 200), phone: oneLine(c.phone, 40),
    project: PROJECTS.has(c.project) ? c.project : null, alerts: c.alerts === true,
    // Separate, optional consent: only owners who ticked it may be passed on to ONE partner agency.
    agencyConsent: mode === 'owner' && c.agencyConsent === true
  };
  if (c.consent !== true) return send(res, 400, { ok: false, error: 'consent' });
  if (!EMAIL_RE.test(contact.email)) return send(res, 400, { ok: false, error: 'email' });
  if (contact.phone && !PHONE_RE.test(contact.phone)) return send(res, 400, { ok: false, error: 'phone' });

  const input = cleanInput(body.input);
  let result;
  try { result = await engine.estimate(input, loadJson); } catch (e) { console.error('estimation: engine', e); return send(res, 500, { ok: false, error: 'engine' }); }
  if (!result.ok) return send(res, 400, { ok: false, error: result.errors[0] });

  const place = await placeName(input.market, input.communeCode);
  const site = (process.env.SITE_BASE_URL || 'https://zfind.online').replace(/\/$/, '');
  try {
    const lead = leadEmail(lang, mode, input, result, place, contact);
    await resend({ from: ZFIND_EMAIL_FROM, to: [ZFIND_LEAD_NOTIFY_EMAIL], reply_to: contact.email, subject: lead.subject, html: lead.html, text: lead.text });
    const report = reportEmail(lang, input, result, place, contact, site);
    await resend({ from: ZFIND_EMAIL_FROM, to: [contact.email], subject: report.subject, html: report.html, text: report.text });
  } catch (e) {
    console.error('estimation: send', e.message);
    return send(res, 502, { ok: false, error: 'send' });
  }

  // Value alert (owner ticked the box): double opt-in, never blocks the report.
  let alert;
  if (contact.alerts && mode === 'owner') {
    if (!process.env.ZFIND_SUPABASE_SERVICE_KEY) {
      alert = 'unavailable';
    } else {
      try {
        const created = await alerts().createSubscription({
          kind: 'value', email: contact.email, lang,
          criteria: { input, place },
          lastReference: `${result.basis.period}|${result.central}`
        });
        alert = created.ok ? created.status : 'unavailable';
      } catch (e) {
        console.error('estimation: value alert', e.message);
        alert = 'unavailable';
      }
    }
  }
  return send(res, 200, alert ? { ok: true, alert } : { ok: true });
}

// Loaded on demand: the report works even where the alert tables do not exist yet.
function alerts() { return require('./_lib/alerts-core'); }

module.exports = handler;
module.exports._internals = { cleanInput, reportEmail, leadEmail, loadJson, esc, oneLine, hits, RATE, refineSummaryPt };
