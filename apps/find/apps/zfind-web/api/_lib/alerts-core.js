/* ============================================================
   Z FIND — e-mail alerts: rules shared by /api/alerts, /api/estimation
   and the daily job (not a function itself).

   Two kinds of alert, both double opt-in (nothing is sent before the
   visitor clicks the confirmation link) and both with a one-click
   unsubscribe in every e-mail:
     search  new listings matching a saved search, at most once a week
     value   the new estimate of an owner's property after each official
             price update (same engine and data as the estimation page)

   The consent wording is owned here and stored with the subscription,
   so what the visitor accepted can always be shown. The browser only
   sends criteria; they are re-validated, and the commune is re-resolved
   from its code, on the server.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const S = require('./server');
const searchFilters = require('../../src/services/search-filters.js');
const listingQuality = require('../../src/services/listing-quality.js');
const places = require('../../src/services/place-search.js');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
places.setLoader(rel => fs.promises.readFile(path.join(PUBLIC_DIR, rel), 'utf8').then(JSON.parse));

const LAUNCH = ['FR', 'BE', 'LU'];
const MAX_PER_EMAIL = 10;

const CONSENT = Object.freeze({
  fr: Object.freeze({
    search: 'J’accepte de recevoir par e-mail, au plus une fois par semaine, les nouvelles annonces correspondant à cette recherche. Désinscription en un clic dans chaque e-mail.',
    value: 'J’accepte de recevoir par e-mail la nouvelle estimation de mon bien à chaque mise à jour officielle des prix. Désinscription en un clic dans chaque e-mail.'
  }),
  en: Object.freeze({
    search: 'I agree to receive by e-mail, at most once a week, the new listings matching this search. One-click unsubscribe in every e-mail.',
    value: 'I agree to receive by e-mail the new estimate of my property after each official price update. One-click unsubscribe in every e-mail.'
  })
});

/* ---------------- Criteria ---------------- */
const QUERY_KEYS = ['market', 'q', 'subtype', 'transactionType', 'rentalPeriod', 'budget',
  'commune', 'priceMin', 'priceMax', 'areaMin', 'rooms', 'beds', 'dpe', 'outdoor', 'parking', 'lift'];

function cleanQuery(raw) {
  const q = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  QUERY_KEYS.forEach(k => {
    const v = q[k];
    if (v == null || v === '') return;
    const s = S.oneLine(v, 80);
    if (/^[\p{L}\p{N} ,.:'’_-]+$/u.test(s)) out[k] = s;
  });
  return out;
}

function numberOrNull(v, min, max) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/* The filters the search page used, re-validated; the commune comes from the query. */
async function normalizeSearchCriteria(rawFilters, rawQuery) {
  const f = rawFilters && typeof rawFilters === 'object' ? rawFilters : {};
  const query = cleanQuery(rawQuery);
  const subtypes = (Array.isArray(f.subtype) ? f.subtype : String(f.subtype || '').split(','))
    .map(s => String(s).trim()).filter(s => /^[a-z_]{2,30}$/.test(s)).slice(0, 8);
  const filters = {
    marketKey: LAUNCH.includes(f.marketKey) ? f.marketKey : null,
    transactionType: f.transactionType === 'rent' ? 'rent' : 'sale',
    rentalPeriod: ['monthly', 'seasonal', 'yearly'].includes(f.rentalPeriod) ? f.rentalPeriod : null,
    subtype: subtypes,
    budgetMin: numberOrNull(f.budgetMin, 0, 1e9),
    budgetMax: numberOrNull(f.budgetMax, 0, 1e9),
    areaMin: numberOrNull(f.areaMin, 1, 100000),
    roomsMin: numberOrNull(f.roomsMin, 1, 50),
    bedsMin: numberOrNull(f.bedsMin, 1, 50),
    energyMax: /^[A-G]$/.test(String(f.energyMax || '')) ? String(f.energyMax) : null,
    outdoor: f.outdoor === true,
    parking: f.parking === true,
    lift: f.lift === true,
    q: S.oneLine(f.q, 80)
  };
  let place = null;
  if (query.commune) {
    const found = await places.byCode(query.commune).catch(() => null);
    if (found) place = { country: found.country, code: found.code, name: found.name, aliases: found.aliases || [], postcodes: found.postcodes || [] };
    else delete query.commune;
  }
  if (place && !filters.marketKey) filters.marketKey = place.country;
  const developmentsOnly = subtypes.length > 0 && subtypes.every(s => s === 'development');
  return { ok: !developmentsOnly, error: developmentsOnly ? 'unsupported' : null, criteria: { filters, place, query } };
}

/* ---------------- Listings → cards (server side) ---------------- */
const PROPERTY_SELECT = [
  'id,subtype,typology,area_sqm,bedrooms,living_rooms,energy_rating,attributes,postal_code',
  'zones_lite(name,city,country_iso)',
  'representations!inner(target_type,status,listings!inner(id,transaction_type,rental_period,price_current,currency_iso,price_is_from,status,created_at,listing_content(locale,title)))'
].join(',');

function propertiesSinceQuery(sinceIso) {
  return `properties?select=${encodeURIComponent(PROPERTY_SELECT)}`
    + '&representations.target_type=eq.property&representations.listings.status=eq.published'
    + `&representations.listings.created_at=gt.${encodeURIComponent(sinceIso)}&limit=2000`;
}

function publicRows(rows) {
  return listingQuality.filterPublicRows(Array.isArray(rows) ? rows : [], c => LAUNCH.includes(c));
}

function toCard(row) {
  const listing = row.representations[0].listings[0];
  const zone = row.zones_lite || {};
  const contents = listing.listing_content || [];
  return Object.assign({
    assetId: row.id,
    listingId: listing.id,
    kind: row.subtype === 'land' ? 'Land' : 'Property',
    subtype: row.subtype || null,
    typology: row.typology || null,
    transactionType: listing.transaction_type || 'sale',
    rentalPeriod: listing.rental_period || null,
    titles: contents,
    cityLabel: zone.city || null,
    zoneLabel: zone.name || null,
    countryIso: zone.country_iso || null,
    priceValue: Number(listing.price_current),
    priceIsFrom: listing.price_is_from === true,
    currencyIso: listing.currency_iso || 'EUR'
  }, searchFilters.propertyFacts(row));
}

function titleFor(card, lang) {
  const list = card.titles || [];
  const pick = list.find(c => c && c.locale === lang) || list.find(c => c && c.locale === 'fr') || list.find(c => c && c.locale === 'en') || list[0];
  return pick && pick.title ? pick.title : '';
}

function matchSearch(criteria, cards, sinceMs) {
  const f = criteria.filters || {};
  const scoped = cards.filter(c =>
    (!sinceMs || (Date.parse(c.createdAt) || 0) > sinceMs) &&
    (!f.marketKey || c.countryIso === f.marketKey) &&
    (!f.transactionType || c.transactionType === f.transactionType) &&
    (!f.rentalPeriod || c.rentalPeriod === f.rentalPeriod) &&
    (!f.subtype || !f.subtype.length || f.subtype.includes(c.subtype)));
  return searchFilters.applyAdvancedSearchFilters(scoped, Object.assign({}, f, { place: criteria.place || null, sort: 'recent' }));
}

/* ---------------- Wording ---------------- */
const WORDS = {
  fr: {
    sale: 'Achat', rent: 'Location', types: { apartment: 'Appartement', villa: 'Maison', land: 'Terrain', office: 'Bureaux', retail: 'Commerce', industrial_logistics: 'Locaux d’activité', hospitality: 'Hôtellerie' },
    rooms: n => `${n} pièces min.`, beds: n => `${n} chambres min.`, area: n => `${n} m² min.`, from: v => `à partir de ${v}`, upTo: v => `jusqu’à ${v}`,
    energy: e => `DPE/PEB ${e} ou mieux`, outdoor: 'extérieur', parking: 'parking', lift: 'ascenseur', markets: { FR: 'France', BE: 'Belgique', LU: 'Luxembourg' }, anywhere: 'France, Belgique, Luxembourg'
  },
  en: {
    sale: 'Buy', rent: 'Rent', types: { apartment: 'Apartment', villa: 'House', land: 'Land', office: 'Offices', retail: 'Retail', industrial_logistics: 'Business premises', hospitality: 'Hospitality' },
    rooms: n => `${n}+ rooms`, beds: n => `${n}+ bedrooms`, area: n => `${n}+ m²`, from: v => `from ${v}`, upTo: v => `up to ${v}`,
    energy: e => `energy class ${e} or better`, outdoor: 'outdoor space', parking: 'parking', lift: 'lift', markets: { FR: 'France', BE: 'Belgium', LU: 'Luxembourg' }, anywhere: 'France, Belgium, Luxembourg'
  }
};

function money(v, lang) {
  const n = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-IE', { maximumFractionDigits: 0 }).format(v);
  return lang === 'fr' ? `${n} €` : `€${n}`;
}

function describeSearch(criteria, lang) {
  const w = WORDS[lang] || WORDS.fr;
  const f = criteria.filters || {};
  const parts = [f.transactionType === 'rent' ? w.rent : w.sale];
  if (f.subtype && f.subtype.length) parts.push(f.subtype.map(s => w.types[s] || s).join(', '));
  parts.push(criteria.place ? criteria.place.name : (f.marketKey ? w.markets[f.marketKey] : (f.q || w.anywhere)));
  if (f.roomsMin) parts.push(w.rooms(f.roomsMin));
  if (f.bedsMin) parts.push(w.beds(f.bedsMin));
  if (f.areaMin) parts.push(w.area(f.areaMin));
  if (f.budgetMin != null) parts.push(w.from(money(f.budgetMin, lang)));
  if (f.budgetMax != null) parts.push(w.upTo(money(f.budgetMax, lang)));
  if (f.energyMax) parts.push(w.energy(f.energyMax));
  if (f.outdoor) parts.push(w.outdoor);
  if (f.parking) parts.push(w.parking);
  if (f.lift) parts.push(w.lift);
  return parts.filter(Boolean).join(' · ');
}

function describeValue(criteria, lang) {
  const i = criteria.input || {};
  const types = lang === 'en'
    ? { apartment: 'Apartment', house: 'House', house_closed: 'House, 2-3 façades', house_open: 'House, 4 façades' }
    : { apartment: 'Appartement', house: 'Maison', house_closed: 'Maison 2-3 façades', house_open: 'Maison 4 façades' };
  return [types[i.type] || i.type, i.surface ? `${i.surface} m²` : '', criteria.place || i.communeCode].filter(Boolean).join(' · ');
}

function searchUrl(criteria, lang) {
  const q = new URLSearchParams(criteria.query || {}).toString();
  return `${S.siteUrl()}/#/${lang}/search${q ? '?' + q : ''}`;
}
function listingUrl(card, lang) {
  return `${S.siteUrl()}/#/${lang}/${card.kind === 'Land' ? 'land' : 'property'}/${card.assetId}`;
}
function alertLink(action, token) {
  return `${S.siteUrl()}/api/alerts?action=${action}&token=${token}`;
}

const MAIL = {
  fr: {
    confirmSubject: 'Confirmez votre alerte Z Find',
    confirmHeading: 'Encore un clic pour activer votre alerte',
    confirmBody: { search: 'Vous avez demandé à recevoir les nouvelles annonces correspondant à cette recherche :', value: 'Vous avez demandé à recevoir la nouvelle estimation de ce bien à chaque mise à jour officielle des prix :' },
    confirmButton: 'Confirmer mon alerte',
    confirmIgnore: 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : sans confirmation, rien ne vous sera envoyé et votre adresse sera effacée sous 30 jours.',
    digestSubject: (n, d) => `${n} nouvelle${n > 1 ? 's' : ''} annonce${n > 1 ? 's' : ''} — ${d}`,
    digestHeading: n => `${n} nouvelle${n > 1 ? 's' : ''} annonce${n > 1 ? 's' : ''} pour votre recherche`,
    seeAll: 'Voir la recherche sur Z Find', more: n => `et ${n} autre${n > 1 ? 's' : ''} sur le site`,
    valueSubject: p => `Votre bien à ${p} : nouvelle estimation`,
    valueHeading: 'Les prix officiels ont été mis à jour',
    valueLines: { range: 'Nouvelle fourchette', central: 'Valeur centrale', before: 'Estimation précédente', change: 'Évolution', period: 'Données' },
    valueButton: 'Refaire l’estimation en détail',
    valueNote: 'Estimation statistique indicative, fondée sur des données publiques agrégées ; elle ne remplace pas l’avis de valeur d’un professionnel qui visite le bien.',
    footer: 'Vous recevez cet e-mail car vous avez confirmé une alerte sur zfind.online.', unsubscribe: 'Se désinscrire en un clic', contact: 'Vos données : hello@zfind.online'
  },
  en: {
    confirmSubject: 'Confirm your Z Find alert',
    confirmHeading: 'One more click to activate your alert',
    confirmBody: { search: 'You asked to receive the new listings matching this search:', value: 'You asked to receive the new estimate of this property after each official price update:' },
    confirmButton: 'Confirm my alert',
    confirmIgnore: 'If you did not make this request, ignore this message: without confirmation nothing will be sent and your address will be erased within 30 days.',
    digestSubject: (n, d) => `${n} new listing${n > 1 ? 's' : ''} — ${d}`,
    digestHeading: n => `${n} new listing${n > 1 ? 's' : ''} for your search`,
    seeAll: 'See the search on Z Find', more: n => `and ${n} more on the site`,
    valueSubject: p => `Your property in ${p}: new estimate`,
    valueHeading: 'Official prices have been updated',
    valueLines: { range: 'New range', central: 'Central value', before: 'Previous estimate', change: 'Change', period: 'Data' },
    valueButton: 'Run the detailed estimate again',
    valueNote: 'Indicative statistical estimate based on aggregated public data; it does not replace a valuation by a professional who visits the property.',
    footer: 'You receive this e-mail because you confirmed an alert on zfind.online.', unsubscribe: 'Unsubscribe in one click', contact: 'Your data: hello@zfind.online'
  }
};

function footer(l, token) {
  const m = MAIL[l];
  return `${S.esc(m.footer)} <a href="${S.esc(alertLink('unsubscribe', token))}" style="color:#8a6a36">${S.esc(m.unsubscribe)}</a> · ${S.esc(m.contact)}`;
}
function unsubscribeHeaders(token) {
  return { 'List-Unsubscribe': `<${alertLink('unsubscribe', token)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

function confirmationEmail(row) {
  const l = S.lang(row.lang);
  const m = MAIL[l];
  const what = row.kind === 'value' ? describeValue(row.criteria, l) : describeSearch(row.criteria, l);
  const html = S.mailHtml(l, m.confirmHeading,
    `<p style="line-height:1.6">${S.esc(m.confirmBody[row.kind])}</p><p style="font-weight:600">${S.esc(what)}</p>`
    + S.button(alertLink('confirm', row.token), m.confirmButton)
    + `<p style="font-size:13px;color:#7a7266;line-height:1.5">${S.esc(m.confirmIgnore)}</p>`,
    S.esc(m.contact));
  return { to: [row.email], subject: m.confirmSubject, html, text: `${m.confirmHeading}\n\n${m.confirmBody[row.kind]}\n${what}\n\n${m.confirmButton}: ${alertLink('confirm', row.token)}\n\n${m.confirmIgnore}` };
}

function digestEmail(row, matches) {
  const l = S.lang(row.lang);
  const m = MAIL[l];
  const shown = matches.slice(0, 10);
  const d = describeSearch(row.criteria, l);
  const items = shown.map(c => {
    const title = titleFor(c, l) || [c.typology, c.areaSqm ? `${c.areaSqm} m²` : ''].filter(Boolean).join(' · ');
    const place = [c.zoneLabel, c.cityLabel].filter((v, i, a) => v && a.indexOf(v) === i).join(', ');
    return `<tr><td style="padding:12px 0;border-bottom:1px solid #eee"><a href="${S.esc(listingUrl(c, l))}" style="color:#1d1a16;text-decoration:none"><strong style="color:#8a6a36">${S.esc(money(c.priceValue, l))}</strong><br>${S.esc(title)}<br><span style="color:#7a7266;font-size:13px">${S.esc(place)}</span></a></td></tr>`;
  }).join('');
  const more = matches.length > shown.length ? `<p style="color:#7a7266">${S.esc(m.more(matches.length - shown.length))}</p>` : '';
  const html = S.mailHtml(l, m.digestHeading(matches.length),
    `<p style="color:#4a453d">${S.esc(d)}</p><table style="width:100%;border-collapse:collapse">${items}</table>${more}` + S.button(searchUrl(row.criteria, l), m.seeAll),
    footer(l, row.token));
  const text = [m.digestHeading(matches.length), d, ''].concat(shown.map(c => `${money(c.priceValue, l)} — ${titleFor(c, l)} — ${listingUrl(c, l)}`))
    .concat(['', `${m.seeAll}: ${searchUrl(row.criteria, l)}`, '', `${m.unsubscribe}: ${alertLink('unsubscribe', row.token)}`]).join('\n');
  return { to: [row.email], subject: S.oneLine(m.digestSubject(matches.length, d), 150), html, text, headers: unsubscribeHeaders(row.token) };
}

function valueEmail(row, result, previousCentral, periodLabel) {
  const l = S.lang(row.lang);
  const m = MAIL[l];
  const place = row.criteria.place || row.criteria.input.communeCode;
  const change = previousCentral ? (result.central - previousCentral) / previousCentral : null;
  const pct = v => new Intl.NumberFormat(l === 'fr' ? 'fr-FR' : 'en-IE', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'always' }).format(v);
  const rows = [[m.valueLines.range, `${money(result.low, l)} – ${money(result.high, l)}`], [m.valueLines.central, money(result.central, l)]];
  if (previousCentral) rows.push([m.valueLines.before, money(previousCentral, l)], [m.valueLines.change, pct(change)]);
  rows.push([m.valueLines.period, periodLabel]);
  const i = row.criteria.input;
  const again = `${S.siteUrl()}/#/${l}/estimation?market=${encodeURIComponent(i.market)}`;
  const html = S.mailHtml(l, m.valueHeading,
    `<p style="font-weight:600">${S.esc(describeValue(row.criteria, l))}</p><table style="width:100%;border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#7a7266">${S.esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600">${S.esc(v)}</td></tr>`).join('')}</table>`
    + S.button(again, m.valueButton) + `<p style="font-size:12px;color:#7a7266;line-height:1.5">${S.esc(m.valueNote)}</p>`,
    footer(l, row.token));
  const text = [m.valueHeading, describeValue(row.criteria, l), ''].concat(rows.map(([k, v]) => `${k}: ${v}`))
    .concat(['', `${m.valueButton}: ${again}`, '', m.valueNote, `${m.unsubscribe}: ${alertLink('unsubscribe', row.token)}`]).join('\n');
  return { to: [row.email], subject: S.oneLine(m.valueSubject(place), 150), html, text, headers: unsubscribeHeaders(row.token) };
}

/* ---------------- Store ---------------- */
async function createSubscription({ kind, email, lang, criteria, lastReference }) {
  const l = S.lang(lang);
  const address = String(email || '').trim().toLowerCase();
  if (!S.EMAIL_RE.test(address) || address.length > 254) return { ok: false, error: 'email' };
  const existing = await S.db(`zfind_alert_subscriptions?email=eq.${encodeURIComponent(address)}&status=in.(pending,active)&select=id,kind,status,token,criteria,lang,email`);
  const same = (existing || []).find(r => r.kind === kind && JSON.stringify(r.criteria) === JSON.stringify(criteria));
  if (same) {
    if (same.status === 'pending') await S.sendMail(confirmationEmail(same));
    return { ok: true, status: same.status };
  }
  if ((existing || []).length >= MAX_PER_EMAIL) return { ok: false, error: 'too_many' };
  const rows = await S.db('zfind_alert_subscriptions', {
    method: 'POST',
    body: { kind, email: address, lang: l, criteria, consent_text: CONSENT[l][kind], last_reference: lastReference || null }
  });
  const row = rows && rows[0];
  if (!row) throw new Error('insert');
  await S.sendMail(confirmationEmail(row));
  return { ok: true, status: 'pending' };
}

module.exports = {
  CONSENT, LAUNCH, QUERY_KEYS, cleanQuery, normalizeSearchCriteria, propertiesSinceQuery, publicRows, toCard, titleFor,
  matchSearch, describeSearch, describeValue, confirmationEmail, digestEmail, valueEmail, createSubscription,
  alertLink, searchUrl, money, places
};
