/* Contract: property estimation (engine, page search, /api/estimation) for FR / BE / LU. */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { EventEmitter } = require('events');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const PUB = path.join(WEB, 'public');
const engine = require(path.join(WEB, 'src', 'services', 'estimation.js'));
const page = require(path.join(WEB, 'src', 'services', 'estimation-page.js'));
const handler = require(path.join(WEB, 'api', 'estimation.js'));

let passed = 0;
function check(label, value) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}
const load = async rel => JSON.parse(fs.readFileSync(path.join(PUB, rel), 'utf8'));

function mockReq(body, headers) {
  const req = new EventEmitter();
  req.method = 'POST';
  req.headers = Object.assign({ 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 200)}` }, headers || {});
  req.body = body;
  return req;
}
function mockRes() {
  return {
    statusCode: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b ? JSON.parse(b) : null; }
  };
}

(async () => {
  console.log('\n=== Z FIND ESTIMATION ===');

  // ---------------- Engine ----------------
  const evian = await engine.estimate({ market: 'FR', communeCode: '74119', type: 'apartment', surface: 70, condition: 'standard' }, load);
  const evianDep = (await load('market-data/fr/dep/74.json')).communes.find(c => c.c === '74119');
  check('FR: Évian apartment uses the commune DVF median of the latest year',
    evian.ok && evian.basis.level === 'commune' && evian.basis.period === '2025' && evian.model.baseValue === Math.round(evianDep.A['2025'][2] * 70));
  check('FR: range surrounds the central value and is rounded', evian.low < evian.central && evian.central < evian.high && evian.central % 5000 === 0);
  check('FR: confidence high with ≥ 30 sales', evian.confidence === 'high');

  const strasbourg = await engine.estimate({ market: 'FR', communeCode: '67482', type: 'apartment', surface: 60 }, load);
  check('FR: Alsace-Moselle explained as outside DVF', !strasbourg.ok && strasbourg.errors[0] === 'not_under_dvf');

  const small = (await load('market-data/fr/dep/74.json')).communes.find(c => !c.A['2025'] && !c.A['2024-2025']);
  const fallback = await engine.estimate({ market: 'FR', communeCode: small.c, type: 'apartment', surface: 50 }, load);
  check('FR: commune without enough sales falls back to the department (low confidence)',
    fallback.ok && fallback.basis.level === 'department' && fallback.confidence === 'low');

  const adjusted = await engine.estimate({ market: 'FR', communeCode: '74119', type: 'apartment', surface: 70, condition: 'renovated',
    energy: 'A', features: { balcony: true, terrace: true, garden: true, parking: true, view: true } }, load);
  check('adjustments are listed, outdoor capped at +6 % and the total capped at +20 %',
    adjusted.adjustments.find(a => a.key === 'outdoor').pct === 0.06 && adjusted.adjustmentTotal === 0.20 && adjusted.adjustmentCapped === true);
  const worst = engine._internals.adjustments({ market: 'FR', type: 'apartment', condition: 'to_renovate', energy: 'G', floor: 5, lift: false, features: {} });
  check('negative adjustments floor at −25 %', Math.abs(worst.total - (-0.25)) < 1e-9 && worst.capped);

  const buyer = await engine.estimate({ market: 'FR', communeCode: '74119', type: 'apartment', surface: 70, askingPrice: 900000 }, load);
  check('buyer mode positions an asking price above the range', buyer.buyer.position === 'above' && buyer.buyer.deltaPct > 0.5);

  const ixelles = await engine.estimate({ market: 'BE', communeCode: '21009', type: 'apartment', surface: 85 }, load);
  check('BE: apartment of the reference surface equals the Statbel commune median',
    ixelles.ok && ixelles.unit === 'eur_total' && ixelles.model.sizeFactor === 1 && ixelles.basis.level === 'commune');
  const eupenOpen = await engine.estimate({ market: 'BE', communeCode: '63023', type: 'house_open', surface: 185 }, load);
  const eupenClosed = await engine.estimate({ market: 'BE', communeCode: '63023', type: 'house_closed', surface: 185 }, load);
  check('BE: 4-façade houses priced above 2-3-façade houses of the same size', eupenOpen.ok && eupenClosed.ok && eupenOpen.central > eupenClosed.central);
  check('BE: confidence never above medium (no €/m² published)', [ixelles, eupenOpen, eupenClosed].every(r => r.confidence !== 'high'));

  const luExisting = await engine.estimate({ market: 'LU', communeCode: 'LU-LUXEMBOURG', type: 'apartment', surface: 75 }, load);
  const luNew = await engine.estimate({ market: 'LU', communeCode: 'LU-LUXEMBOURG', type: 'apartment', surface: 75, newBuild: true, condition: 'renovated' }, load);
  check('LU: new-build apartments use the VEFA statistic without a condition bonus',
    luNew.basis.segment === 'new_build' && !luNew.adjustments.some(a => a.key === 'condition') && luNew.central > luExisting.central);
  const luHouse = await engine.estimate({ market: 'LU', communeCode: 'LU-BEAUFORT', type: 'house', surface: 150 }, load);
  check('LU: houses from advertised prices corrected by the measured advertised→sold ratio',
    luHouse.ok && luHouse.basis.segment === 'advertised_houses' && luHouse.model.askToSold > 0.6 && luHouse.model.askToSold < 1);

  const diekirch = await engine.estimate({ market: 'LU', communeCode: 'LU-DIEKIRCH', type: 'apartment', surface: 80 }, load);
  check('LU: only recent figures (rolling 12 months or last two years) — otherwise the canton',
    diekirch.ok && diekirch.basis.period !== '2022' && diekirch.basis.period !== '2023');

  check('periods read naturally in both languages',
    engine.formatPeriod('12 mois au 2026T2', 'en') === '12 months to Q2 2026' && engine.formatPeriod('12 mois au 2026T2', 'fr') === '12 mois jusqu’au T2 2026' &&
    engine.formatPeriod('2025', 'en') === '2025');

  check('validation rejects unknown type and absurd surface',
    JSON.stringify(engine.validate({ market: 'FR', communeCode: '74119', type: 'castle', surface: 5 })) === JSON.stringify(['type', 'surface']));

  // ---------------- Page search ----------------
  const { searchPlaces } = page._internals;
  const fr = await load('geo/search/fr.json');
  const be = await load('geo/search/be.json');
  const lu = await load('geo/search/lu.json');
  check('search: "evian" finds Évian-les-Bains first', searchPlaces(fr, 'evian')[0].row[0] === '74119');
  check('search: postcode 74200 finds Thonon-les-Bains', searchPlaces(fr, '74200', 20).some(i => i.row[0] === '74281'));
  check('search: Dutch name "Elsene" finds Ixelles', searchPlaces(be, 'Elsene')[0].row[0] === '21009');
  check('search: district "Kirchberg" leads to Luxembourg, also from "kirch"',
    searchPlaces(lu, 'Kirchberg')[0].row[0] === 'LU-LUXEMBOURG' && searchPlaces(lu, 'kirch')[0].row[0] === 'LU-LUXEMBOURG');
  const cc = page.COPY.fr;
  check('basis sentence: count, plural type, elision',
    cc.basis({ level: 'commune', name: 'Évian-les-Bains', n: 208, period: '2025' }, cc.typesSales.apartment) === 'Calculé à partir de 208 ventes d’appartements à Évian-les-Bains, période 2025.' &&
    cc.basis({ level: 'canton', name: 'Echternach', n: null, period: '12 mois' }, cc.typesSales.apartment) === 'Calculé à partir des ventes d’appartements dans le canton d’Echternach, période 12 derniers mois.');
  check('page copy exists in fr and en with the same keys', Object.keys(page.COPY.fr).join() === Object.keys(page.COPY.en).join());

  // ---------------- API ----------------
  const sent = [];
  global.fetch = async (url, opts) => {
    sent.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ id: 'test' }), text: async () => '' };
  };
  const good = {
    lang: 'fr', mode: 'owner',
    input: { market: 'FR', communeCode: '74119', type: 'apartment', surface: 70, condition: 'standard', features: { balcony: true } },
    contact: { name: '<b>Marie</b>', email: 'marie@example.com', phone: '+33 6 12 34 56 78', project: 'sell_3m', alerts: true, consent: true },
    // Figures sent by a browser are ignored: the server recomputes.
    result: { central: 1 }
  };

  delete process.env.RESEND_API_KEY;
  let res = mockRes(); await handler(mockReq(good), res);
  check('API: refuses with 503 while e-mail is not configured', res.statusCode === 503 && sent.length === 0);

  Object.assign(process.env, { RESEND_API_KEY: 'test', ZFIND_EMAIL_FROM: 'Z Find <hello@zfind.online>', ZFIND_LEAD_NOTIFY_EMAIL: 'leads@example.com' });
  res = mockRes(); await handler(mockReq(Object.assign({}, good, { contact: Object.assign({}, good.contact, { consent: false }) })), res);
  check('API: consent is required', res.statusCode === 400 && res.body.error === 'consent' && sent.length === 0);

  res = mockRes(); await handler(mockReq(Object.assign({}, good, { website: 'http://spam' })), res);
  check('API: honeypot answers OK without sending anything', res.statusCode === 200 && sent.length === 0);

  res = mockRes(); await handler(mockReq(good), res);
  check('API: success sends the lead notification first, then the report', res.statusCode === 200 && sent.length === 2 &&
    sent[0].body.to[0] === 'leads@example.com' && sent[0].body.reply_to === 'marie@example.com' && sent[1].body.to[0] === 'marie@example.com');
  const expected = await engine.estimate(Object.assign({}, good.input, { floor: null, lift: null }), load);
  check('API: figures recomputed server-side (browser figures ignored) and user text escaped in HTML',
    sent[1].body.html.includes(`${new Intl.NumberFormat('fr-FR').format(expected.central)} €`) && !sent[1].body.html.includes('>1 €<') &&
    sent[0].body.html.includes('&lt;b&gt;Marie&lt;/b&gt;') && !sent[0].body.html.includes('<b>Marie</b>'));
  check('engine: a blank floor is not treated as ground floor',
    !expected.adjustments.some(a => a.key === 'ground_floor') &&
    (await engine.estimate(Object.assign({}, good.input, { floor: 0 }), load)).adjustments.some(a => a.key === 'ground_floor'));
  check('API: report subject names the commune; notification in Portuguese',
    sent[1].body.subject === 'Votre estimation Z Find — Évian-les-Bains' && sent[0].body.subject.startsWith('Novo lead proprietário — Évian-les-Bains (FR)'));

  sent.length = 0;
  global.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: false, status: 422, text: async () => 'bad', json: async () => ({}) }; };
  res = mockRes(); await handler(mockReq(good), res);
  check('API: if the notification fails, nothing is sent to the visitor (502, retry)', res.statusCode === 502 && sent.length === 1);

  handler._internals.hits.clear();
  const ipHeaders = { 'x-forwarded-for': '203.0.113.9' };
  global.fetch = async () => ({ ok: true, json: async () => ({}), text: async () => '' });
  let last;
  for (let i = 0; i <= handler._internals.RATE.max; i += 1) { last = mockRes(); await handler(mockReq(good, ipHeaders), last); }
  check('API: rate limit per address', last.statusCode === 429);

  const vercel = JSON.parse(fs.readFileSync(path.join(WEB, 'vercel.json'), 'utf8'));
  check('vercel.json routes /api/estimation before the SPA fallback and bundles the data',
    vercel.rewrites[0].source === '/api/estimation' && vercel.functions['api/estimation.js'].includeFiles.includes('public/market-data/**'));
  const app = fs.readFileSync(path.join(WEB, 'src', 'app.js'), 'utf8');
  const body = fs.readFileSync(path.join(WEB, 'src', 'body.html'), 'utf8');
  const build = fs.readFileSync(path.join(WEB, 'scripts', 'build.js'), 'utf8');
  check('page wired: view, route, nav entry, market call-to-action and build injection',
    body.includes('id="view-estimation"') && body.includes('data-view="estimation"') && app.includes("case 'estimation': renderEstimation(); break;") &&
    app.includes('marketEstimationCtaHTML(market)') && build.includes("read('services/estimation.js')") && build.includes("read('services/estimation-page.js')") && build.includes("read('estimation.css')"));

  console.log(`\nESTIMATION: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
