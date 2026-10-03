/* Contract: e-mail alerts (search / value), agency reviews, the daily job,
   the demonstration mode and the professionals page. No network: Supabase
   REST and Resend are replaced by an in-memory fake. */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { EventEmitter } = require('events');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const ROOT = path.join(__dirname, '..', '..', '..', '..');

let passed = 0;
function check(label, value) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}

/* ---------------- fake Supabase REST + Resend ---------------- */
const calls = [];
const mails = [];
let routes = [];
function route(method, pattern, reply) { routes.push({ method, pattern, reply }); }
global.fetch = async (url, opts) => {
  const o = opts || {};
  const method = o.method || 'GET';
  const body = o.body ? JSON.parse(o.body) : null;
  if (String(url).startsWith('https://api.resend.com/')) {
    mails.push(body);
    return { ok: true, status: 200, json: async () => ({ id: 'mail' }), text: async () => '{}' };
  }
  calls.push({ method, url: decodeURIComponent(String(url)), body, headers: o.headers || {} });
  const r = routes.find(x => x.method === method && x.pattern.test(decodeURIComponent(String(url))));
  const data = r ? (typeof r.reply === 'function' ? r.reply(body, String(url)) : r.reply) : [];
  return { ok: true, status: 200, text: async () => (data == null ? '' : JSON.stringify(data)), json: async () => data };
};
function reset() { calls.length = 0; mails.length = 0; routes = []; }

function req(method, { body, query, headers } = {}) {
  const r = new EventEmitter();
  r.method = method;
  r.headers = Object.assign({ 'x-forwarded-for': `10.1.0.${Math.floor(Math.random() * 250)}`, 'content-type': 'application/json' }, headers || {});
  r.body = body;
  r.query = query || {};
  r.url = '/api/x';
  return r;
}
function res() {
  return {
    statusCode: 0, headers: {}, raw: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.raw = b || ''; },
    get json() { return JSON.parse(this.raw || 'null'); }
  };
}

const UUID = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function propertyRow({ id, title, price, city = 'Évian-les-Bains', postal = '74500', country = 'FR', typology = 'T3', created = '2026-09-29T10:00:00Z', attrs = {}, subtype = 'apartment', energy = 'C' }) {
  return {
    id, subtype, typology, area_sqm: 70, bedrooms: 2, living_rooms: 1, energy_rating: energy, attributes: attrs, postal_code: postal,
    zones_lite: { name: city, city, country_iso: country },
    representations: [{ target_type: 'property', status: 'active', listings: [{ id: id + '-l', transaction_type: 'sale', rental_period: null, price_current: price, currency_iso: 'EUR', price_is_from: false, status: 'published', created_at: created, listing_content: [{ locale: 'fr', title }] }] }]
  };
}

(async () => {
  console.log('\n=== Z FIND ALERTS, REVIEWS, DEMO ===');
  Object.assign(process.env, {
    ZFIND_SUPABASE_SERVICE_KEY: 'service-test', RESEND_API_KEY: 'resend-test', ZFIND_EMAIL_FROM: 'Z Find <hello@zfind.online>',
    ZFIND_LEAD_NOTIFY_EMAIL: 'leads@example.com', SITE_BASE_URL: 'https://zfind.online', CRON_SECRET: 'cron-test'
  });

  const core = require(path.join(WEB, 'api', '_lib', 'alerts-core.js'));
  const alerts = require(path.join(WEB, 'api', 'alerts.js'));
  const reviews = require(path.join(WEB, 'api', 'reviews.js'));
  const cron = require(path.join(WEB, 'api', 'cron-daily.js'));
  const estimationApi = require(path.join(WEB, 'api', 'estimation.js'));

  /* ---------------- criteria ---------------- */
  const norm = await core.normalizeSearchCriteria(
    { subtype: ['apartment'], transactionType: 'sale', budgetMax: 500000, roomsMin: '3', outdoor: true, energyMax: 'Z', marketKey: 'XX' },
    { commune: 'FR:74119', rooms: '3', outdoor: '1', evil: '<script>' });
  check('criteria: commune re-resolved on the server, market derived, unknown values dropped',
    norm.ok && norm.criteria.place.name === 'Évian-les-Bains' && norm.criteria.filters.marketKey === 'FR' &&
    norm.criteria.filters.energyMax === null && norm.criteria.filters.roomsMin === 3 && !('evil' in norm.criteria.query));
  check('criteria: an alert on new developments alone is refused (not covered yet)',
    !(await core.normalizeSearchCriteria({ subtype: ['development'] }, {})).ok);
  check('criteria: a forged commune code is ignored', (await core.normalizeSearchCriteria({}, { commune: 'FR:99999' })).criteria.place === null);

  /* ---------------- matching ---------------- */
  const rows = core.publicRows([
    propertyRow({ id: 'a', title: 'T3 balcon', price: 420000, attrs: { balcony_sqm: 8 } }),
    propertyRow({ id: 'b', title: 'T3 sans extérieur', price: 380000 }),
    propertyRow({ id: 'c', title: '[TEST] T3 balcon', price: 300000, attrs: { balcony_sqm: 8 } }),
    propertyRow({ id: 'd', title: 'T3 Thonon', price: 400000, city: 'Thonon-les-Bains', postal: '74200', attrs: { garden: true } }),
    propertyRow({ id: 'e', title: 'T3 balcon ancien', price: 410000, attrs: { balcony_sqm: 5 }, created: '2026-09-01T10:00:00Z' }),
    propertyRow({ id: 'f', title: 'T3 Porto', price: 300000, country: 'PT', attrs: { balcony_sqm: 5 } })
  ]);
  const cards = rows.map(core.toCard);
  const matched = core.matchSearch(norm.criteria, cards, Date.parse('2026-09-20T00:00:00Z'));
  check('matching: same rules as the site (commune, rooms, outdoor, price), test and non-launch listings out, only new ones',
    matched.map(c => c.assetId).join() === 'a');
  const described = core.describeSearch(norm.criteria, 'fr');
  check('describe: readable summary of the search', described.startsWith('Achat · Appartement · Évian-les-Bains · 3 pièces min. · jusqu’à 500') && described.endsWith('· extérieur'));

  /* ---------------- subscribe / confirm / unsubscribe ---------------- */
  reset();
  route('GET', /zfind_alert_subscriptions\?email=eq\./, []);
  route('POST', /zfind_alert_subscriptions$/, body => [Object.assign({ id: UUID(1), token: UUID(2), status: 'pending' }, body)]);
  let r = res();
  await alerts(req('POST', { query: { action: 'subscribe' }, body: { kind: 'search', email: 'Marie@Example.com', lang: 'fr', consent: true, filters: { subtype: ['apartment'], roomsMin: 3 }, query: { commune: 'FR:74119', rooms: '3' } } }), r);
  const inserted = calls.find(c => c.method === 'POST');
  check('subscribe: pending row with the server consent text and a lower-cased address',
    r.statusCode === 200 && r.json.status === 'pending' && inserted.body.email === 'marie@example.com' && inserted.body.consent_text === core.CONSENT.fr.search && inserted.body.kind === 'search');
  check('Supabase: a new secret key (sb_secret_…) travels only in the apikey header, never as a Bearer token',
    inserted.headers.apikey === 'service-test' && !('Authorization' in inserted.headers));
  check('subscribe: a confirmation e-mail with the confirm link, nothing else',
    mails.length === 1 && mails[0].to[0] === 'marie@example.com' && mails[0].html.includes(`/api/alerts?action=confirm&amp;token=${UUID(2)}`) && mails[0].subject === 'Confirmez votre alerte Z Find');

  reset();
  r = res(); await alerts(req('POST', { query: { action: 'subscribe' }, body: { kind: 'search', email: 'a@b.fr', consent: false } }), r);
  check('subscribe: consent required, nothing stored', r.statusCode === 400 && r.json.error === 'consent' && calls.length === 0 && mails.length === 0);

  reset();
  const pendingRow = { id: UUID(1), kind: 'search', email: 'marie@example.com', lang: 'fr', criteria: norm.criteria, status: 'pending', token: UUID(2) };
  route('GET', /zfind_alert_subscriptions\?token=eq\./, [pendingRow]);
  r = res(); await alerts(req('GET', { query: { action: 'confirm', token: UUID(2) } }), r);
  check('confirm link: shows a button and changes nothing by itself (mail scanners)',
    r.statusCode === 200 && r.raw.includes('method="post"') && r.raw.includes('Confirmer mon alerte') && !calls.some(c => c.method === 'PATCH'));
  r = res(); await alerts(req('POST', { query: { action: 'confirm' }, body: { token: UUID(2) }, headers: { 'content-type': 'application/x-www-form-urlencoded' } }), r);
  const patch = calls.find(c => c.method === 'PATCH');
  check('confirm button: the alert becomes active', r.statusCode === 200 && patch && patch.body.status === 'active' && patch.url.includes('status=eq.pending'));

  reset();
  route('GET', /zfind_alert_subscriptions\?token=eq\./, [Object.assign({}, pendingRow, { status: 'active' })]);
  r = res(); await alerts(req('POST', { query: { action: 'unsubscribe', token: UUID(2) }, body: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'application/x-www-form-urlencoded' } }), r);
  check('one-click unsubscribe (RFC 8058) works from the e-mail client',
    r.statusCode === 200 && calls.some(c => c.method === 'PATCH' && c.body.status === 'unsubscribed'));

  const saved = process.env.ZFIND_SUPABASE_SERVICE_KEY;
  delete process.env.ZFIND_SUPABASE_SERVICE_KEY;
  r = res(); await alerts(req('POST', { body: { kind: 'search' } }), r);
  check('alerts answer 503 until the service key is configured', r.statusCode === 503);
  process.env.ZFIND_SUPABASE_SERVICE_KEY = saved;

  /* ---------------- value alert from the estimation ---------------- */
  reset();
  route('GET', /zfind_alert_subscriptions\?email=eq\./, []);
  route('POST', /zfind_alert_subscriptions$/, body => [Object.assign({ id: UUID(3), token: UUID(4), status: 'pending' }, body)]);
  r = res();
  await estimationApi(req('POST', { body: { lang: 'fr', mode: 'owner', input: { market: 'FR', communeCode: '74119', type: 'apartment', surface: 70 }, contact: { email: 'owner@example.com', alerts: true, consent: true } } }), r);
  const valueInsert = calls.find(c => c.method === 'POST' && /zfind_alert_subscriptions/.test(c.url));
  check('estimation: the value alert is saved pending, with the estimate reference, after the report',
    r.statusCode === 200 && r.json.alert === 'pending' && valueInsert.body.kind === 'value' && /\|\d+$/.test(valueInsert.body.last_reference) &&
    valueInsert.body.criteria.place === 'Évian-les-Bains' && mails.length === 3 && mails[2].subject === 'Confirmez votre alerte Z Find');

  /* ---------------- reviews ---------------- */
  reset();
  route('GET', /^.*\/leads\?/, [{ email: 'Someone@Else.com' }]);
  r = res(); await reviews(req('POST', { body: { action: 'optin', listingId: UUID(10), email: 'buyer@example.com', lang: 'fr', consent: true } }), r);
  check('review opt-in refused without a matching enquiry (verified contacts only)', r.statusCode === 400 && r.json.error === 'not_verified' && !calls.some(c => c.method === 'POST'));

  reset();
  route('GET', /\/leads\?/, [{ email: 'Buyer@Example.com' }]);
  route('GET', /\/listings\?id=eq\./, [{ id: UUID(10), representations: { partner_id: UUID(20) } }]);
  route('GET', /zfind_partner_reviews\?partner_id=eq\./, []);
  r = res(); await reviews(req('POST', { body: { action: 'optin', listingId: UUID(10), email: 'buyer@example.com', lang: 'fr', consent: true } }), r);
  const invite = calls.find(c => c.method === 'POST');
  check('review opt-in accepted after a real enquiry: invitation row for the listing’s agency, no e-mail yet',
    r.statusCode === 200 && invite.body.partner_id === UUID(20) && invite.body.invite_email === 'buyer@example.com' && mails.length === 0);

  reset();
  const invitedRow = { id: UUID(30), partner_id: UUID(20), status: 'invited', lang: 'fr', invite_token: UUID(31), moderation_token: UUID(32), partners: { name: 'Agence <Lac>' } };
  route('GET', /zfind_partner_reviews\?invite_token=eq\./, [invitedRow]);
  r = res(); await reviews(req('GET', { query: { token: UUID(31) } }), r);
  check('review form: agency name escaped, rating, comment, name and publication consent',
    r.statusCode === 200 && r.raw.includes('Agence &lt;Lac&gt;') && r.raw.includes('name="rating"') && r.raw.includes('name="consent"'));
  r = res(); await reviews(req('POST', { body: 'action=submit&token=' + UUID(31) + '&rating=9&author=M', headers: { 'content-type': 'application/x-www-form-urlencoded' } }), r);
  check('review submit: invalid rating refused, nothing saved', r.statusCode === 400 && !calls.some(c => c.method === 'PATCH'));
  route('PATCH', /zfind_partner_reviews\?id=eq\./, body => [Object.assign({}, invitedRow, body)]);
  r = res(); await reviews(req('POST', { body: 'action=submit&token=' + UUID(31) + '&rating=4&author=Marie+D.&comment=Tr%C3%A8s+bien&consent=yes', headers: { 'content-type': 'application/x-www-form-urlencoded' } }), r);
  const submitted = calls.find(c => c.method === 'PATCH');
  check('review submit: pending, visitor e-mail erased, Z Find gets a moderation link',
    r.statusCode === 200 && submitted.body.status === 'pending' && submitted.body.invite_email === null && submitted.body.rating === 4 &&
    mails.length === 1 && mails[0].to[0] === 'leads@example.com' && mails[0].html.includes(`/api/reviews?moderate=${UUID(32)}`));

  reset();
  route('GET', /zfind_partner_reviews\?moderation_token=eq\./, [Object.assign({}, invitedRow, { status: 'pending', rating: 4, author_label: 'Marie D.', comment: 'Très bien' })]);
  r = res(); await reviews(req('GET', { query: { moderate: UUID(32) } }), r);
  check('moderation link: shows Publish / Reject and changes nothing by itself', r.raw.includes('value="publish"') && r.raw.includes('value="reject"') && !calls.some(c => c.method === 'PATCH'));
  route('PATCH', /zfind_partner_reviews\?moderation_token=eq\./, body => [Object.assign({}, invitedRow, body)]);
  r = res(); await reviews(req('POST', { body: `action=moderate&token=${UUID(32)}&decision=publish`, headers: { 'content-type': 'application/x-www-form-urlencoded' } }), r);
  check('moderation: publish sets the date', calls.some(c => c.method === 'PATCH' && c.body.status === 'published' && c.body.published_at));

  /* ---------------- daily job ---------------- */
  reset();
  r = res(); await cron(req('GET', { headers: { authorization: 'Bearer nope' } }), r);
  check('daily job: refuses a call without the cron secret', r.statusCode === 401 && calls.length === 0);

  reset();
  const activeSearch = { id: UUID(40), email: 'marie@example.com', lang: 'fr', criteria: norm.criteria, token: UUID(41), confirmed_at: '2026-09-20T00:00:00Z', last_sent_at: null, sent_count: 0 };
  const activeValue = { id: UUID(42), email: 'owner@example.com', lang: 'fr', token: UUID(43), sent_count: 0, last_reference: 'OLD-PERIOD|400000',
    criteria: { input: { market: 'FR', communeCode: '74119', type: 'apartment', surface: 70 }, place: 'Évian-les-Bains' } };
  route('DELETE', /./, null);
  route('GET', /zfind_partner_reviews\?status=eq\.invited&invite_sent_at=is\.null&invite_email/, [{ id: UUID(50), lang: 'en', invite_email: 'buyer@example.com', invite_token: UUID(51), partners: { name: 'Lake Agency' } }]);
  route('GET', /kind=eq\.value&select=id,email/, [activeValue]);
  route('GET', /kind=eq\.search&select=id,email/, [activeSearch]);
  route('GET', /^.*\/properties\?/, [propertyRow({ id: 'a', title: 'T3 balcon', price: 420000, attrs: { balcony_sqm: 8 } }), propertyRow({ id: 'x', title: 'Maison', price: 900000, subtype: 'villa', typology: 'T6' })]);
  route('GET', /select=id&limit=10000/, [{ id: 1 }]);
  const report = await cron._internals.run({ now: Date.parse('2026-10-05T06:00:00Z') }); // a Monday
  const deletes = calls.filter(c => c.method === 'DELETE').map(c => c.url);
  check('daily job: retention — unconfirmed and unsubscribed 30 days, alerts 3 years, invitations 60 days, rejected reviews 30 days',
    report.purge === 'ok' && deletes.length === 5 && deletes.some(u => u.includes('status=eq.pending')) && deletes.some(u => u.includes('status=eq.unsubscribed')) &&
    deletes.some(u => u.includes('status=eq.active&confirmed_at=lt.2023')) && deletes.some(u => u.includes('status=eq.invited&created_at=lt.')));
  const inviteMail = mails.find(m => m.to[0] === 'buyer@example.com');
  check('daily job: review invitation sent once, then marked', report.invitations === 1 && inviteMail.subject === 'Your review of Lake Agency' &&
    inviteMail.html.includes(`/api/reviews?token=${UUID(51)}`) && calls.some(c => c.method === 'PATCH' && c.url.includes(UUID(50)) && c.body.invite_sent_at));
  const valueMail = mails.find(m => m.to[0] === 'owner@example.com');
  check('daily job: value alert sent when the official data period changed, with one-click unsubscribe',
    report.value === 1 && valueMail.subject === 'Votre bien à Évian-les-Bains : nouvelle estimation' && valueMail.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click' &&
    valueMail.html.includes(`action=unsubscribe&amp;token=${UUID(43)}`));
  const digest = mails.find(m => m.to[0] === 'marie@example.com');
  check('daily job (Monday): search digest lists only the matching new listing',
    report.search.sent === 1 && digest.html.includes(`/#/fr/property/a`) && !digest.html.includes('/property/x') && digest.subject.startsWith('1 nouvelle annonce — '));
  check('daily job (Monday): activity summary to Z Find', report.summary === 'sent' && mails.some(m => m.to[0] === 'leads@example.com' && m.subject.includes('resumo semanal')));

  reset();
  route('DELETE', /./, null);
  route('GET', /kind=eq\.value&select=id,email/, [Object.assign({}, activeValue, { last_reference: null })]);
  const tuesday = await cron._internals.run({ now: Date.parse('2026-10-06T06:00:00Z') });
  check('daily job: first run only records the reference (no e-mail); no search digest outside Monday',
    tuesday.value === 0 && !mails.length && calls.some(c => c.method === 'PATCH' && /\|\d+$/.test(c.body.last_reference)) && !('search' in tuesday));

  /* ---------------- client side ---------------- */
  const app = fs.readFileSync(path.join(WEB, 'src', 'app.js'), 'utf8');
  const page = require(path.join(WEB, 'src', 'services', 'estimation-page.js'));
  check('consent shown = consent stored (search alert and value alert, fr and en)',
    app.includes(core.CONSENT.fr.search) && app.includes(core.CONSENT.en.search) && page.COPY.fr.alerts === core.CONSENT.fr.value && page.COPY.en.alerts === core.CONSENT.en.value);

  const reviewsUi = require(path.join(WEB, 'src', 'services', 'partner-reviews.js'));
  const html = reviewsUi.sectionHTML('fr', [{ rating: 5, author_label: '<img src=x>', comment: 'ok', verified_contact: true, published_at: '2026-09-01' }, { rating: 4, author_label: 'B', verified_contact: true }]);
  check('reviews: average, count, verified mark, escaped text; nothing without reviews',
    reviewsUi.summarize([{ rating: 5 }, { rating: 4 }]).average === 4.5 && html.includes('4,5') && html.includes('2 avis') && html.includes('Contact vérifié via Z Find') &&
    html.includes('&lt;img src=x&gt;') && !html.includes('<img') && reviewsUi.sectionHTML('fr', []) === '');

  const demo = require(path.join(WEB, 'src', 'services', 'demo-mode.js'));
  check('demo mode: only with ?demo=1 (address or route), off with ?demo=0',
    demo._internals.sync({ search: '', hash: '#/fr/market/FR?demo=1' }) === true && demo._internals.sync({ search: '?demo=0', hash: '' }) === false);
  check('demo mode: quitting removes ?demo=1 from the address (a reload does not turn it back on)',
    demo.quit({ pathname: '/', search: '?demo=1', hash: '#/fr/market/FR?x=2&demo=1' }) === '/#/fr/market/FR?x=2' &&
    demo.quit({ pathname: '/', search: '', hash: '#/fr/market/FR?demo=1&x=2' }) === '/#/fr/market/FR?x=2' && !demo.isOn());
  const slot = demo.featuredSlotHTML('BE', 2, 'fr', 'search-featured-slot');
  check('demo mode: every sponsored example says so and never links to a real listing',
    slot.includes('À la une · exemple') && slot.includes('exemple fictif') && slot.includes("navigate('pro')") && !/navigate\('property'/.test(slot) &&
    demo.exampleReviews('fr').every(x => /\(exemple\)$/.test(x.author_label)) && demo.bannerHTML('en').includes('fictitious'));
  check('demo mode: organic results untouched (demo only in the featured renderers and reviews)',
    (app.match(/demoMode\.featuredSlotHTML/g) || []).length === 2 && !/function renderSearchResultsGrid[\s\S]{0,400}demo/.test(app));

  const pro = require(path.join(WEB, 'src', 'services', 'pro-offer.js'));
  const proHtml = pro.pageHTML('fr');
  const P = pro.PRICES;
  check('professionals page: revenue lines, neutral-results rule, no private sellers, demo link',
    proHtml.includes('Mise en avant « À la une »') && proHtml.includes('Résultats neutres') && proHtml.includes('Aucun particulier') && proHtml.includes('?demo=1'));
  check('professionals page: approved launch price list (HT, monthly, no minimum term, subject to change)',
    P.essentiel === 99 && P.pro === 199 && P.featuredMarketWeek === 49 && P.featuredSearchWeek === 29 && P.developmentMonth === 149 && P.sellerLead === 29 && P.founderMonth === 129 &&
    proHtml.includes('99 € HT / mois') && proHtml.includes('199 € HT / mois') && proHtml.includes('susceptibles d’évoluer') && proHtml.includes('sans engagement') &&
    pro.pageHTML('en').includes('€199 excl. VAT / month'));
  check('professionals page: Founder offer (3 months free, renewed once for 3 months under 5 contacts, then the Pro plan at 129 € for 12 months)',
    P.founderFreeMonths === 3 && P.founderExtensionMonths === 3 && P.founderMinLeads === 5 && P.founderPriceMonths === 12 &&
    proHtml.includes('3 mois gratuits dès votre inscription') && proHtml.includes('moins de 5 contacts') && proHtml.includes('renouvelée pour 3 mois de plus, une fois') &&
    proHtml.includes('l’offre Pro à 129 € HT par mois au lieu de 199 €, garantis 12 mois') && !proHtml.includes('2027'));
  check('professionals page: seller leads only with the owner’s express agreement, one agency',
    proHtml.includes('acceptent expressément') && proHtml.includes('une seule agence') && !/\[object|undefined/.test(proHtml + pro.pageHTML('en')));
  const body = fs.readFileSync(path.join(WEB, 'src', 'body.html'), 'utf8');
  const build = fs.readFileSync(path.join(WEB, 'scripts', 'build.js'), 'utf8');
  check('wiring: pro view and route, alert box on search, reviews on agency and listing, enquiry opt-in, build injection',
    body.includes('id="view-pro"') && app.includes("case 'pro': renderPro(); break;") && body.includes('id="search-alert-root"') &&
    app.includes('renderPartnerReviews(partnerId);') && app.includes('renderListingReviews(vm);') && app.includes('requestReviewInvitation(currentListingIdForEnquiry') &&
    ['partner-reviews.js', 'demo-mode.js', 'pro-offer.js'].every(f => build.includes(`read('services/${f}')`)) && build.includes("read('pro-reviews.css')"));

  const vercel = JSON.parse(fs.readFileSync(path.join(WEB, 'vercel.json'), 'utf8'));
  const fallback = vercel.rewrites.findIndex(x => x.source === '/(.*)');
  check('vercel.json: the three functions are routed before the SPA fallback, daily cron declared',
    ['/api/alerts', '/api/reviews', '/api/cron-daily'].every(p => vercel.rewrites.findIndex(x => x.source === p) > -1 && vercel.rewrites.findIndex(x => x.source === p) < fallback) &&
    vercel.crons.some(c => c.path === '/api/cron-daily' && c.schedule === '0 6 * * *') && vercel.functions['api/cron-daily.js'].includeFiles.includes('public/market-data/**'));

  check('vercel.json: the ignore step stays within Vercel’s 256-character limit and lets a same-commit Redeploy build',
    vercel.ignoreCommand.length <= 256 && vercel.ignoreCommand.includes('[ "$B" = "$VERCEL_GIT_COMMIT_SHA" ]&&exit 1'));

  const sql = fs.readFileSync(path.join(ROOT, 'infrastructure', 'supabase', 'migrations', '20260930120000_z_find_alerts_reviews_v1.sql'), 'utf8');
  check('migration: alerts closed to the public; reviews readable only when published and without personal columns',
    /revoke all on public\.zfind_alert_subscriptions from anon, authenticated/.test(sql) && /using \(status = 'published'\)/.test(sql) &&
    !/grant select \([^)]*invite_email/.test(sql) && !/grant select \([^)]*token/.test(sql));

  console.log(`\nALERTS & REVIEWS: ${passed}/${passed} PASSED`);
})().catch(error => { console.error(error); process.exit(1); });
