/* Contract: listing page financing & purchase costs (FR/BE/LU), travel, similar listings, installable site. */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const costs = require(path.join(WEB, 'src', 'services', 'acquisition-costs.js'));

let passed = 0;
function check(label, value) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('\n=== Z FIND LISTING PAGE ===');

// France: ~7.9 % existing home, ~7.4 % first buyer, ~2.3 % new build at 300 000 €.
const frOld = costs.estimate({ country: 'FR', price: 300000 });
const frFirst = costs.estimate({ country: 'FR', price: 300000, firstBuyer: true });
const frNew = costs.estimate({ country: 'FR', price: 300000, newBuild: true });
check('France existing home: 6.3185 % duties + notary scale + CSI + disbursements ≈ 7.9 %',
  frOld.lines[0].amount === 18956 && near(frOld.costsRate, 0.0794, 0.001));
check('France first buyer keeps the 5.80665 % duties', frFirst.lines[0].amount === 17420);
check('France new build pays the 0.715 % land registration tax instead', frNew.lines[0].key === 'publicityTax' && frNew.lines[0].amount === 2145 && near(frNew.costsRate, 0.0233, 0.001));
check('France notary emoluments follow the official scale with VAT (300 000 € → 3 353 €)', frOld.lines[1].amount === 3353);

// Belgium: regional duties.
const be = (region, ownHome, price) => costs.estimate({ country: 'BE', region, ownHome, price }).lines[0].amount;
check('Belgium own home at 300 000 €: Wallonia 9 000, Flanders 6 000, Brussels 12 500 (200 000 € allowance)',
  be('WAL', true, 300000) === 9000 && be('VLG', true, 300000) === 6000 && be('BRU', true, 300000) === 12500);
check('Belgium other purchases: 12.5 % / 12 % / 12.5 %, no Brussels allowance above 600 000 €',
  be('WAL', false, 300000) === 37500 && be('VLG', false, 300000) === 36000 && be('BRU', true, 700000) === 87500);
check('Belgium needs the region', costs.estimate({ country: 'BE', price: 300000 }).error === 'region_required');
check('REFNIS code gives the Belgian region',
  costs.belgianRegionFromRefnis('21004') === 'BRU' && costs.belgianRegionFromRefnis('11002') === 'VLG' &&
  costs.belgianRegionFromRefnis('24062') === 'VLG' && costs.belgianRegionFromRefnis('25005') === 'WAL' && costs.belgianRegionFromRefnis('62063') === 'WAL');

// Luxembourg: 7 % minus the Bëllegen Akt credit (40 000 € per buyer, main residence, law n° 8540).
const lu1 = costs.estimate({ country: 'LU', price: 700000, ownHome: true, buyers: 1 });
const lu2 = costs.estimate({ country: 'LU', price: 700000, ownHome: true, buyers: 2 });
const luInv = costs.estimate({ country: 'LU', price: 700000, ownHome: false });
check('Luxembourg: 7 % duties, Bëllegen Akt 40 000 € per buyer, never below zero, never for an investment, notary not included',
  lu1.costs === 9000 && lu2.costs === 0 && luInv.costs === 49000 && lu1.notaryIncluded === false);

// Loan maths.
check('monthly payment: 200 000 € over 20 years at 3 % ≈ 1 109 €', Math.round(costs.monthlyPayment(200000, 3, 20)) === 1109);
const fin = costs.financing({ country: 'FR', price: 300000, deposit: 30000, ratePct: 3.3, years: 20 });
check('financing: loan = price + costs − deposit', fin.loan === 300000 + frOld.costs - 30000 && fin.monthly > 0);
check('copy exists in French and English with the same keys',
  JSON.stringify(Object.keys(costs.COPY.fr.lines)) === JSON.stringify(Object.keys(costs.COPY.en.lines)));

// Page wiring.
const read = rel => fs.readFileSync(path.join(WEB, rel), 'utf8');
const app = read('src/app.js');
const build = read('scripts/build.js');
const head = read('src/head_top.txt');
check('listing page shows financing (sale only), travel and similar listings',
  app.includes("${isRentalListing ? '' : financingCardHTML(vm)}") && app.includes('${travelCardHTML(vm)}') &&
  app.includes('id="similar-listings-root"') && app.includes('bindFinancingCard(vm);') && app.includes('renderSimilarListings(vm);'));
check('no more "coming soon" investment placeholder on the listing page', !app.includes("t(L,'property.zInsightsComingSoonBody')"));
check('travel opens a Google Maps route from the listing (Maps URLs)', app.includes("'https://www.google.com/maps/dir/?api=1&origin='"));
check('build loads the cost service and the listing page styles', build.includes("read('services/acquisition-costs.js')") && build.includes("read('listing-page.css')"));

// Installable site.
const manifest = JSON.parse(read('public/manifest.webmanifest'));
check('manifest: standalone app with 192/512 icons (any + maskable)',
  manifest.display === 'standalone' && manifest.start_url.startsWith('/') &&
  ['any', 'maskable'].every(p => manifest.icons.filter(i => i.purpose === p).map(i => i.sizes).join() === '192x192,512x512') &&
  manifest.icons.every(i => fs.existsSync(path.join(WEB, 'public', i.src))));
check('head links the manifest, theme colour and Apple icon', head.includes('rel="manifest" href="/manifest.webmanifest"') && head.includes('name="theme-color"') && head.includes('rel="apple-touch-icon"'));
const sw = read('public/sw.js');
check('service worker is network-first and never caches the database or the API',
  /fetch\(request\)\s*\.then/.test(sw) && sw.includes("url.origin !== self.location.origin") && sw.includes("startsWith('/api/')"));
check('service worker is registered only on https', app.includes("navigator.serviceWorker.register('/sw.js')") && app.includes("location.protocol === 'https:'"));

console.log(`\nLISTING PAGE: ${passed}/${passed} PASSED`);
