/* Contract: mortgage simulator (FR / BE / LU) and its reference rates.
   The rates may only be shown while their official publication is recent;
   the simulator never states a rate without its source and month, and
   always warns that it replaces neither a bank nor a credit broker. */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const rates = require(path.join(WEB, 'src', 'services', 'credit-rates.js'));
const sim = require(path.join(WEB, 'src', 'services', 'credit-simulator.js'));
const acquisition = require(path.join(WEB, 'src', 'services', 'acquisition-costs.js'));

let passed = 0;
function check(label, value) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const D = s => new Date(s + 'T12:00:00Z');

// ---------------------------------------------------------------- reference data
const markets = rates.DATA.markets;
check('reference rates exist for exactly FR, BE and LU', Object.keys(markets).sort().join() === 'BE,FR,LU');
for (const [key, m] of Object.entries(markets)) {
  check(`${key}: every market names its source with an https link`, m.source && m.source.name && /^https:\/\//.test(m.source.url));
  if (!m.rates) { check(`${key}: no rates means no period and no expiry`, m.period === null && m.staleAfter === null); continue; }
  check(`${key}: observed month, publication and expiry dates are well formed`,
    /^\d{4}-\d{2}$/.test(m.period) && /^\d{4}-\d{2}(-\d{2})?$/.test(m.publishedAt) && /^\d{4}-\d{2}-\d{2}$/.test(m.staleAfter));
  const periodEnd = Date.UTC(+m.period.slice(0, 4), +m.period.slice(5, 7), 0);
  const limit = Date.parse(m.staleAfter + 'T00:00:00Z');
  check(`${key}: published after the observed month, expiry after publication`,
    Date.parse(m.publishedAt.length === 7 ? m.publishedAt + '-01' : m.publishedAt) >= periodEnd - 31 * 86400000 && limit > Date.parse((m.publishedAt.length === 7 ? m.publishedAt + '-28' : m.publishedAt)));
  check(`${key}: a figure is never kept more than 120 days after the end of its month`, (limit - periodEnd) / 86400000 <= 120);
  check(`${key}: every rate is a plausible annual % for a standard duration`,
    Object.entries(m.rates).every(([y, r]) => [10, 15, 20, 25, 30].includes(Number(y)) && r > 0.5 && r < 10));
}
check('France: Observatoire Crédit Logement / CSA, August 2026, 15/20/25 years',
  markets.FR.period === '2026-08' && markets.FR.rates[15] === 3.14 && markets.FR.rates[20] === 3.27 && markets.FR.rates[25] === 3.35 && /Crédit Logement/.test(markets.FR.source.name));
check('Luxembourg: BCL, July 2026, fixed rates by initial fixation', markets.LU.period === '2026-07' && markets.LU.rates[20] === 3.85 && /BCL/.test(markets.LU.source.name));
check('Belgium: no recent official figure, so no rate at all', markets.BE.rates === null);

// ---------------------------------------------------------------- freshness guard
const fresh = D('2026-10-03');
const expired = D('2026-11-16');
const fr20 = rates.reference('FR', 20, fresh);
check('a fresh reference carries rate, month, measure and source', fr20 && fr20.ratePct === 3.27 && fr20.period === '2026-08' && fr20.source.name && fr20.measure === 'average_by_duration');
check('still valid on the expiry day itself', !!rates.reference('FR', 20, D('2026-11-15')));
check('expired data gives NO rate (never an old figure)', rates.reference('FR', 20, expired) === null && rates.reference('LU', 20, expired) === null);
check('expired reason is reported for the page', rates.missingReason('FR', 20, expired) === 'expired');
check('a duration the source does not publish gives no rate', rates.reference('FR', 10, fresh) === null && rates.missingReason('FR', 10, fresh) === 'duration');
check('Belgium gives no rate and says why', rates.reference('BE', 20, fresh) === null && rates.missingReason('BE', 20, fresh) === 'no_source');
const st = rates.status(fresh);
check('status lists every market with days left until expiry', st.length === 3 && st.find(s => s.market === 'FR').fresh && st.find(s => s.market === 'FR').daysLeft === 43 && st.find(s => s.market === 'BE').hasRates === false);
check('status turns stale after the expiry date', rates.status(expired).filter(s => s.hasRates).every(s => !s.fresh && s.daysLeft < 0));
check('month labels in both languages', rates.periodLabel('2026-08', 'fr') === 'août 2026' && rates.periodLabel('2026-07', 'en') === 'July 2026');

// ---------------------------------------------------------------- arithmetic
const r = 0.0327 / 12, n = 240;
const expected = 200000 * r / (1 - Math.pow(1 + r, -n));
const p = sim.payment({ loan: 200000, ratePct: 3.27, years: 20 });
check('payment: 200 000 € at 3.27 % over 20 years', p.monthly === Math.round(expected) && near(p.monthly, 1136, 2));
check('payment: total interest = payments − capital', near(p.interest, expected * n - 200000, 1));
const pi = sim.payment({ loan: 200000, ratePct: 3.27, years: 20, insurancePct: 0.3 });
check('payment: insurance as % of capital per year is added separately', pi.monthlyInsurance === 50 && pi.monthly === p.monthly + 50 && pi.insurance === 12000);
check('payment: no rate, no result', sim.payment({ loan: 1, years: 20 }).error === 'rate_required' && sim.payment({ loan: 1, ratePct: 0, years: 20 }).error === 'rate_required');

const cap = sim.capacity({ market: 'FR', income: 5000, otherLoans: 250, ratioPct: 35, deposit: 40000, ratePct: 3.35, years: 25, costs: { firstBuyer: false } });
check('capacity: maximum payment = 35 % of income minus other loans', cap.maxMonthly === 1500);
const back = sim.payment({ loan: cap.maxLoan, ratePct: 3.35, years: 25 });
check('capacity: the loan found is repaid within the maximum payment', back.monthly <= 1500 && sim.payment({ loan: cap.maxLoan + 1000, ratePct: 3.35, years: 25 }).monthly > 1500 - 6);
const costsAtMax = acquisition.estimate({ country: 'FR', price: cap.maxPrice });
check('capacity: affordable price + purchase costs fit within loan + deposit', cap.maxPrice + costsAtMax.costs <= cap.budget && cap.maxPrice + 1000 + acquisition.estimate({ country: 'FR', price: cap.maxPrice + 1000 }).costs > cap.budget - 1000);
check('capacity: purchase costs reported with the price', cap.costs === costsAtMax.costs && cap.budget === cap.maxLoan + 40000);
const capIns = sim.capacity({ market: 'FR', income: 5000, otherLoans: 250, ratioPct: 35, deposit: 40000, ratePct: 3.35, years: 25, insurancePct: 0.3, costs: {} });
check('capacity: insurance included in the effort rate lowers the loan', capIns.maxLoan < cap.maxLoan);
const capBe = sim.capacity({ market: 'BE', income: 5000, ratioPct: 35, deposit: 60000, ratePct: 3.4, years: 25, costs: { ownHome: true } });
check('capacity BE: without a region the costs and price are not guessed', capBe.maxPrice === null && capBe.costsMissing === true && capBe.maxLoan > 0);
const capBeW = sim.capacity({ market: 'BE', income: 5000, ratioPct: 35, deposit: 60000, ratePct: 3.4, years: 25, costs: { region: 'WAL', ownHome: true } });
check('capacity BE: with the region the affordable price is computed', capBeW.maxPrice > 0 && capBeW.maxPrice < capBeW.budget);
const capLu = sim.capacity({ market: 'LU', income: 8000, ratioPct: 35, deposit: 80000, ratePct: 3.85, years: 30, costs: { ownHome: true, buyers: 2 } });
check('capacity LU: notary fees are flagged as not included', capLu.maxPrice > 0 && capLu.notaryIncluded === false);
check('capacity: no income or no rate, no result', sim.capacity({ market: 'FR', ratePct: 3, years: 20 }).error === 'income_required' && sim.capacity({ market: 'FR', income: 4000, years: 20 }).error === 'rate_required');

const proj = sim.project({ market: 'FR', price: 400000, deposit: 40000, income: 6000, ratioPct: 35, ratePct: 3.27, years: 20, costs: {} });
const projCosts = acquisition.estimate({ country: 'FR', price: 400000 }).costs;
check('project: loan = price + purchase costs − deposit', proj.loan === 400000 + projCosts - 40000 && proj.costs === projCosts);
check('project: effort rate from the household income', near(proj.effortPct, proj.monthly / 6000 * 100, 1e-9) && proj.overRatio === (proj.effortPct > 35));
const big = sim.project({ market: 'FR', price: 400000, deposit: 40000, income: 3000, ratioPct: 35, ratePct: 3.27, years: 20, costs: {} });
check('project: an effort rate above the limit is flagged', big.overRatio === true);
const cash = sim.project({ market: 'FR', price: 200000, deposit: 300000, ratePct: 3.27, years: 20, costs: {} });
check('project: a deposit covering everything needs no loan', cash.loan === 0 && cash.monthly === 0);

// ---------------------------------------------------------------- page text
for (const lang of ['fr', 'en']) {
  const c = sim.COPY[lang];
  const html = sim.pageHTML(lang, { market: 'FR', mode: 'capacity' }, fresh);
  check(`${lang}: page keeps the .wrap root the mobile checks expect`, /^\s*<div class="wrap est-page credit-page"/.test(html));
  check(`${lang}: France prefilled with the 25-year reference and its source and month`,
    /data-credit="ratePct" value="3.35"/.test(html) && html.includes('Crédit Logement') && html.includes(lang === 'fr' ? 'août 2026' : 'August 2026'));
  check(`${lang}: the warning says it is not an offer, not advice, and to consult a bank or broker`,
    c.warning.join(' ').match(lang === 'fr' ? /ni une offre de prêt ni un conseil[\s\S]*banque ou un courtier/ : /neither a loan offer nor credit advice[\s\S]*bank or a credit broker/) && html.includes(sim._internals ? c.warning[0].slice(0, 40) : ''));
  check(`${lang}: the repayment warning is present`, html.includes(lang === 'fr' ? 'Un crédit vous engage et doit être remboursé' : 'A loan is a commitment and must be repaid'));
  const stale = sim.pageHTML(lang, { market: 'FR', mode: 'capacity' }, expired);
  check(`${lang}: after expiry the rate field is EMPTY and asks for the bank's rate`,
    /data-credit="ratePct" value=""/.test(stale) && stale.includes(c.rateMissing.expired()) && !stale.includes('3.35'));
  const be = sim.pageHTML(lang, { market: 'BE', mode: 'payment', price: 350000 }, fresh);
  check(`${lang}: Belgium shows no rate and says there is no recent official figure`, /data-credit="ratePct" value=""/.test(be) && be.includes(c.rateMissing.no_source('BE')));
  check(`${lang}: payment mode takes the listing price from the address`, /data-credit="price" value="350000"/.test(be));
  const lu = sim.pageHTML(lang, { market: 'LU', mode: 'capacity' }, fresh);
  check(`${lang}: Luxembourg prefilled with the BCL fixed rate and its fixation band`, /data-credit="ratePct" value="3.5"/.test(lu) && lu.includes('BCL') && lu.includes(lang === 'fr' ? 'de plus de 20 à 25 ans' : 'over 20 up to 25 years'));
  const noRate = sim.resultHTML(lang, 'capacity', 'FR', { error: 'rate_required' });
  check(`${lang}: without a rate the result asks for one (no number shown)`, noRate.includes(c.enterRate) && !/data-credit-main/.test(noRate));
  check(`${lang}: market rules are stated (HCSF, NBB, CSSF)`, /35/.test(c.rules.FR) && /90/.test(c.rules.BE) && /CSSF/.test(c.rules.LU));
}
check('copy has the same keys in fr and en', Object.keys(sim.COPY.fr).join() === Object.keys(sim.COPY.en).join());
check('unknown market or mode falls back to France / capacity', sim.normalise({ market: 'PT', mode: 'x' }).market === 'FR' && sim.normalise({}).mode === 'capacity');

// ---------------------------------------------------------------- wiring
const build = fs.readFileSync(path.join(WEB, 'scripts', 'build.js'), 'utf8');
const app = fs.readFileSync(path.join(WEB, 'src', 'app.js'), 'utf8');
check('build ships the rates, the simulator and its CSS', /credit-rates\.js/.test(build) && /credit-simulator\.js/.test(build) && /credit\.css/.test(build));
check('the rates are loaded before the simulator', build.indexOf('+ creditRatesService') < build.indexOf('+ creditSimulatorService'));
check('the simulator page uses the new simulator', /creditSimulator/.test(app.slice(app.indexOf('function renderSimulator'), app.indexOf('function renderLegacySimulator'))));
check('the listing financing card no longer hard-codes a rate', !/value="3\.3"/.test(app) && /financingReference\(country, 20\)/.test(app));
const monitor = fs.readFileSync(path.join(__dirname, '..', 'production', 'zfind-production-monitor.js'), 'utf8');
check('the daily production monitor fails when a reference rate has expired', /creditRates/.test(monitor) && /status\(/.test(monitor));

console.log(`\nCREDIT SIMULATOR: ${passed}/${passed} PASSED`);
