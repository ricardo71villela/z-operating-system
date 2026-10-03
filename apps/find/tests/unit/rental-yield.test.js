/* Contract: rental yield simulator (FR / BE / LU, long-term and short-term).
   Z Find never estimates a rent: every operating figure is the visitor's.
   Computed parts (purchase costs, loan) use the public scales and the
   dated reference rates; every result shows its formula; each market's
   rules are stated. */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const ry = require(path.join(WEB, 'src', 'services', 'rental-yield.js'));
const acquisition = require(path.join(WEB, 'src', 'services', 'acquisition-costs.js'));
const credit = require(path.join(WEB, 'src', 'services', 'credit-simulator.js'));

let passed = 0;
function check(label, value) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-9 : tol);
const D = s => new Date(s + 'T12:00:00Z');

// ---------------------------------------------------------------- nothing invented
check('no price: no figure', ry.compute({ market: 'FR', mode: 'long', rent: 800 }).error === 'price_required');
check('no rent: no figure (Z Find never estimates a rent)', ry.compute({ market: 'FR', mode: 'long', price: 200000 }).error === 'rent_required');
check('short-term needs the price per night and the occupancy',
  ry.compute({ market: 'FR', mode: 'short', price: 200000, occupancyPct: 50 }).error === 'nightly_required' &&
  ry.compute({ market: 'FR', mode: 'short', price: 200000, nightly: 100 }).error === 'occupancy_required');
check('financed without a rate: asks for the rate', ry.compute({ market: 'FR', mode: 'long', price: 200000, rent: 800, financed: true, years: 20 }).error === 'rate_required');

// ---------------------------------------------------------------- France, long-term
const base = { market: 'FR', mode: 'long', price: 200000, rent: 800, vacancyMonths: 1, propertyTax: 1000, coownership: 600, insurance: 150, managementPct: 0, maintenance: 400 };
const fr = ry.compute(base);
const frCosts = acquisition.estimate({ country: 'FR', price: 200000 }).costs;
check('FR: purchase costs = public scale for an investment (no first-buyer relief)', fr.costs === frCosts && frCosts === acquisition.estimate({ country: 'FR', price: 200000, firstBuyer: false }).costs);
check('FR: first-buyer relief never applied to an investment', ry.compute(Object.assign({}, base, { firstBuyer: true })).costs === frCosts);
check('FR: total cost = price + costs + works', fr.totalCost === 200000 + frCosts && ry.compute(Object.assign({}, base, { works: 15000 })).totalCost === 215000 + frCosts);
check('gross yield = 12 × rent ÷ price (before vacancy)', near(fr.grossYield, 9600 / 200000) && fr.grossAnnual === 9600);
check('rent collected after 1 month of vacancy', fr.collected === 8800);
check('owner charges summed', fr.chargesTotal === 2150);
check('net yield = (collected − charges) ÷ total cost', near(fr.netYield, (8800 - 2150) / (200000 + frCosts)) && fr.netOperating === 6650);
check('cash flow without loan = net result ÷ 12, before tax', fr.cashflowMonthly === Math.round(6650 / 12) && fr.incomeTax === null && fr.loan === null);
const mgmt = ry.compute(Object.assign({}, base, { managementPct: 7 }));
check('management fee is a % of the rent collected', mgmt.charges.management === 8800 * 0.07);
const taxed = ry.compute(Object.assign({}, base, { incomeTax: 1200 }));
check('the tax entered by the visitor is taken off the cash flow', taxed.cashflowAnnual === 6650 - 1200 && taxed.incomeTax === 1200);
check('furniture only counts for a furnished or short-term let', ry.compute(Object.assign({}, base, { furniture: 5000 })).furniture === 0 && ry.compute(Object.assign({}, base, { furniture: 5000, furnished: true })).furniture === 5000);
check('new-build: reduced registration tax', ry.compute(Object.assign({}, base, { costs: { newBuild: true } })).costs === acquisition.estimate({ country: 'FR', price: 200000, newBuild: true }).costs);

// Financed.
const fin = ry.compute(Object.assign({}, base, { financed: true, deposit: frCosts, ratePct: 3.27, years: 20 }));
const pay = credit.payment({ loan: 200000, ratePct: 3.27, years: 20 });
check('loan = total cost − deposit; payment from the credit engine', fin.loan.amount === 200000 && fin.loan.monthly === pay.monthly);
let bal = 200000, int1 = 0; const r = 0.0327 / 12, p = 200000 * credit.annuityFactor(3.27, 20);
for (let m = 0; m < 12; m++) { const i = bal * r; int1 += i; bal -= p - i; }
check('first-year interest from the amortisation schedule', fin.loan.interestYear1 === Math.round(int1) && fin.loan.interestYear1 > 6000 && fin.loan.interestYear1 < 6540);
check('cash flow = net result − 12 payments', fin.cashflowAnnual === 6650 - pay.monthly * 12 && fin.cashflowMonthly < 0);
check('return on deposit = annual cash flow ÷ deposit', near(fin.returnOnDeposit, fin.cashflowAnnual / Math.round(frCosts)));
const finIns = ry.compute(Object.assign({}, base, { financed: true, deposit: frCosts, ratePct: 3.27, years: 20, insurancePct: 0.3 }));
check('borrower insurance included in the monthly payment', finIns.loan.monthly === pay.monthly + 50);

// DPE.
check('DPE G: letting blocked (since 1 Jan 2025)', ry.dpeStatus('G', 'long').level === 'block');
check('DPE F and E: dated warnings', ry.dpeStatus('F', 'long').key === 'F' && ry.dpeStatus('E', 'long').key === 'E' && ry.dpeStatus('D', 'long') === null);
check('tourist let: F/G and E warnings', ry.dpeStatus('G', 'short').key === 'touristFG' && ry.dpeStatus('E', 'short').key === 'touristE' && ry.dpeStatus('C', 'short') === null);

// ---------------------------------------------------------------- short-term
const st = ry.compute({ market: 'FR', mode: 'short', price: 200000, furniture: 8000, nightly: 100, occupancyPct: 50, platformPct: 15, managementPct: 20, cleaning: 2000, utilities: 1500, propertyTax: 1000 });
check('short: bookings = price per night × 365 × occupancy', near(st.grossAnnual, 18250, 0.5) && near(st.grossYield, 18250 / 200000));
check('short: income collected after platform commission', near(st.collected, 15513, 0.5));
check('short: concierge %, cleaning and utilities in the charges', near(st.chargesTotal, 15512.5 * 0.2 + 2000 + 1500 + 1000, 1));
check('short: furniture counted in the total cost', st.furniture === 8000 && st.totalCost === 200000 + frCosts + 8000);
check('occupancy is capped at 100 %', near(ry.compute({ market: 'FR', mode: 'short', price: 100000, nightly: 100, occupancyPct: 150 }).grossAnnual, 36500, 0.5));
check('vacancy is capped at 12 months', ry.compute(Object.assign({}, base, { vacancyMonths: 20 })).collected === 0);

// ---------------------------------------------------------------- Belgium
const beNo = ry.compute({ market: 'BE', mode: 'long', price: 300000, rent: 1100 });
check('BE: without the region the costs are not guessed', beNo.costsMissing === true && beNo.costs === null);
const beW = ry.compute({ market: 'BE', mode: 'long', price: 300000, rent: 1100, costs: { region: 'WAL' } });
check('BE: investment pays the full regional rate (Wallonia 12.5 %), never the own-home rate',
  beW.costs === acquisition.estimate({ country: 'BE', price: 300000, region: 'WAL', ownHome: false }).costs && beW.costs > 37500);
check('BE: Flanders 12 % and Brussels without the own-home allowance',
  ry.compute({ market: 'BE', mode: 'long', price: 300000, rent: 1100, costs: { region: 'VLG' } }).costs === acquisition.estimate({ country: 'BE', price: 300000, region: 'VLG', ownHome: false }).costs &&
  ry.compute({ market: 'BE', mode: 'long', price: 300000, rent: 1100, costs: { region: 'BRU' } }).costs === acquisition.estimate({ country: 'BE', price: 300000, region: 'BRU', ownHome: false }).costs);

// ---------------------------------------------------------------- Luxembourg
const lu = ry.compute({ market: 'LU', mode: 'long', price: 600000, rent: 2600 });
check('LU: 7 % duties, no Bëllegen Akt for an investment, notary not included', lu.costs === 42000 && lu.notaryIncluded === false);
check('LU: legal ceiling = 5 % of (price + duties + works) a year', lu.luCap.monthly === Math.round(642000 * 0.05 / 12) && lu.luCap.over === false);
check('LU: a rent above the ceiling is flagged', ry.compute({ market: 'LU', mode: 'long', price: 600000, rent: 2700 }).luCap.over === true);
check('LU: works raise the ceiling', ry.compute({ market: 'LU', mode: 'long', price: 600000, rent: 2700, works: 20000 }).luCap.over === false);
check('LU: furnished let — supplement allowed, not flagged', ry.compute({ market: 'LU', mode: 'long', price: 600000, rent: 2700, furnished: true }).luCap.over === false);
check('LU: no ceiling for a short-term let, nor in FR/BE', ry.compute({ market: 'LU', mode: 'short', price: 600000, nightly: 150, occupancyPct: 60 }).luCap === null && fr.luCap === null);

// ---------------------------------------------------------------- page
const fresh = D('2026-10-03'), expired = D('2026-11-20');
for (const lang of ['fr', 'en']) {
  const c = ry.COPY[lang];
  const html = ry.pageHTML(lang, { market: 'FR', mode: 'long' }, fresh);
  check(`${lang}: page root is a .wrap`, /^\s*<div class="wrap est-page credit-page yield-page"/.test(html));
  check(`${lang}: every label is text (no [object Object], no undefined)`, ['FR', 'BE', 'LU'].every(m => ry.MODES.every(md => { const h = ry.pageHTML(lang, { market: m, mode: md }, fresh); return !/\[object Object\]|undefined/.test(h); })));
  check(`${lang}: no rent, no price prefilled`, /data-ry="rent" value=""/.test(html) && /data-ry="price" value=""/.test(html));
  check(`${lang}: financing rate = dated reference (20 years) with its source`, /data-ry="rate" value="3.27"/.test(html) && html.includes('Crédit Logement'));
  check(`${lang}: after expiry no rate`, /data-ry="rate" value=""/.test(ry.pageHTML(lang, { market: 'FR', mode: 'long' }, expired)));
  check(`${lang}: listing price taken from the address`, /data-ry="price" value="320000"/.test(ry.pageHTML(lang, { market: 'BE', mode: 'long', price: 320000 }, fresh)));
  check(`${lang}: the rules and warnings are on the page`, c.rules.FR.long.every(r => html.includes(r.slice(0, 30).replace(/'/g, '&#39;'))) && html.includes(c.warning[0].slice(0, 40)));
  const method = ry.resultHTML(lang, { error: 'rent_required' });
  check(`${lang}: before the figures, the method and formulas — no number`, method.includes(c.methodTitle) && method.includes(c.need.rent_required) && !/data-yield-gross/.test(method));
  const res = ry.resultHTML(lang, fin);
  check(`${lang}: result shows gross, net, cash flow, formulas and the credit warning`, /data-yield-gross/.test(res) && /data-yield-net/.test(res) && /data-yield-cashflow/.test(res) && res.includes(c.formulas[0]) && res.includes(c.warning[1]));
  check(`${lang}: negative cash flow shown as a monthly top-up`, res.includes(c.negative(ry._internals.money(-fin.cashflowMonthly, lang))));
  check(`${lang}: "before tax" unless a tax is entered`, res.includes(c.beforeTax) && ry.resultHTML(lang, taxed).includes(c.afterTax));
  check(`${lang}: DPE G warning shown in France`, ry.resultHTML(lang, ry.compute(Object.assign({}, base, { dpe: 'G' }))).includes(c.dpe.G));
  check(`${lang}: LU ceiling shown`, ry.resultHTML(lang, lu).includes('data-yield-lu-cap'));
}
const fr_ = ry.COPY.fr.rules;
check('FR rules: DPE calendar 2025 / 2028 / 2034', /1er janvier 2025/.test(fr_.FR.long[0]) && /2028/.test(fr_.FR.long[0]) && /2034/.test(fr_.FR.long[0]));
check('FR rules: tax thresholds (micro-foncier 30 % / 15 000 €, micro-BIC 50 % / 77 700 €)', /30 %.*15 000 €/.test(fr_.FR.long[2]) && /50 %.*77 700 €/.test(fr_.FR.long[2]));
check('FR tourist let: 120 / 90 days, registration, change of use, 30 % / 15 000 € and 50 % / 77 700 €',
  /120 jours/.test(fr_.FR.short[0]) && /90/.test(fr_.FR.short[0]) && /enregistrement/.test(fr_.FR.short[0]) && /changement d’usage/.test(fr_.FR.short[0]) && /30 %.*15 000 €.*50 %.*77 700 €/.test(fr_.FR.short[2]));
check('BE rules: cadastral income + 40 %, lease registration', /revenu cadastral indexé, majoré de 40 %/.test(fr_.BE.long[2]) && /enregistré/.test(fr_.BE.long[0]));
check('LU rules: 5 % ceiling, no Bëllegen Akt for letting', /5 % du capital investi/.test(fr_.LU.long[0]) && /Bëllegen Akt/.test(fr_.LU.long[1]));
check('fact-check (Oct 2026): F/G rent freeze, pending relaxation bill, Jeanbrun scheme, national registration 20 May 2026, Flanders E/F → D in 6 years, LU 2024–25 depreciation not renewed',
  /août 2022/.test(fr_.FR.long[0]) && /pas encore définitif/.test(fr_.FR.long[0]) && /Jeanbrun/.test(fr_.FR.long[2]) && /téléservice national depuis le 20 mai 2026/.test(fr_.FR.short[0]) &&
  /E ou F doit atteindre au moins le label D dans les six ans/.test(fr_.BE.long[1]) && /n’a pas été reconduit/.test(fr_.LU.long[2]));
check('French DMTO for an existing home = 5 % × 1.0237 + 1.2 % = 6.3185 %', near(acquisition._internals.FR.DMTO_STANDARD, 0.05 * 1.0237 + 0.012, 1e-12) && near(acquisition._internals.FR.DMTO_FIRST_BUYER, 0.045 * 1.0237 + 0.012, 1e-12));
const keys = o => JSON.stringify(o, (k, v) => (typeof v === 'string' ? '' : typeof v === 'function' ? 'fn' : v));
check('fr and en copy have the same structure', keys(ry.COPY.fr) === keys(ry.COPY.en));

// ---------------------------------------------------------------- wiring
const body = fs.readFileSync(path.join(WEB, 'src', 'body.html'), 'utf8');
const app = fs.readFileSync(path.join(WEB, 'src', 'app.js'), 'utf8');
const build = fs.readFileSync(path.join(WEB, 'scripts', 'build.js'), 'utf8');
const i18n = fs.readFileSync(path.join(WEB, 'src', 'i18n.js'), 'utf8');
const iCredit = body.indexOf('data-view="simulator"'), iYield = body.indexOf('data-view="yield"'), iEst = body.indexOf('data-view="estimation"');
check('main nav: Crédit → Rentabilité → Estimer', iCredit > 0 && iCredit < iYield && iYield < iEst);
check('view section and route', body.includes('id="view-yield"') && body.includes('id="yield-root"') && app.includes("case 'yield': renderYield(); break;"));
check('nav labels in fr and en', i18n.includes("yield:'Rentabilité'") && i18n.includes("yield:'Rental yield'"));
check('build ships the service after the credit engine it uses', build.indexOf('+ creditSimulatorService') < build.indexOf('+ rentalYieldService') && /rental-yield\.js/.test(build));
check('listing page links to the yield simulator with the price', /\/yield\?market=\$\{country\}&mode=long&price=/.test(app));

console.log(`\nRENTAL YIELD: ${passed}/${passed} PASSED`);
