#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const body = read('apps/zfind-web/src/body.html');
const app = read('apps/zfind-web/src/app.js');
const css = read('apps/zfind-web/src/css_block.txt');
const i18n = read('apps/zfind-web/src/i18n.js');
const i18nPhase4 = read('apps/zfind-web/src/i18n-phase4.js');
const sixLanguageMenu = read('apps/zfind-web/src/six-language-menu.js');
const publicLocales = read('apps/zfind-web/src/services/public-locales.js');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${passed}: ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${failed}: ${label}`);
  }
}

function sorted(values) { return values.slice().sort(); }
function sameSet(actual, expected) {
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
}

const sixLocales = ['fr','en','pt','es','de','it'];

check('EN opportunistic slogan retired', !i18n.includes('Not an opportunistic portal.'));
check('PT opportunistic slogan retired', !i18n.includes('Não é um portal oportunista.'));
check('FR opportunistic slogan retired', !i18n.includes('Pas un portail opportuniste.') && !body.includes('Pas un portail opportuniste.'));
check('EN hero explicitly international',
  i18n.includes("eyebrow:'International real-estate portal'") &&
  i18n.includes("titleLine1:'Explore real-estate opportunities across'"));
check('PT hero explicitly international',
  i18n.includes("eyebrow:'Portal imobiliário internacional'") &&
  i18n.includes("titleLine1:'Explore oportunidades imobiliárias em'"));
check('FR hero explicitly international',
  i18n.includes("eyebrow:'Portail immobilier international'") &&
  i18n.includes("titleLine1:\"Explorez des opportunités immobilières sur\""));
check('ES DE IT hero translations are present',
  i18nPhase4.includes("es: {") && i18nPhase4.includes("eyebrow:'Portal inmobiliario internacional'") &&
  i18nPhase4.includes("de: {") && i18nPhase4.includes("eyebrow:'Internationales Immobilienportal'") &&
  i18nPhase4.includes("it: {") && i18nPhase4.includes("eyebrow:'Portale immobiliare internazionale'"));

const marketRegistry = read('apps/zfind-web/src/services/market-registry.js');

check('two market selectors exist', (body.match(/data-market-select/g) || []).length === 2);
check('header market selector exists', body.includes('id="header-market"'));
check('hero market selector exists', body.includes('id="hero-market"'));
check('empty-state market CTA exists', body.includes('id="home-status-market-cta"'));
check('market selector now enters marketplace view',
  app.includes("navigate('market', marketKey, {})") &&
  app.includes("case 'market': renderMarket(state.id); break;"));
check('legacy direct guide-navigation mode retired',
  !app.includes("const MARKET_GUIDE_MODE = 'content-navigation-only';") &&
  !app.includes('const MARKET_GUIDES = Object.freeze'));
check('market registry has the exact 24 approved market keys',
  ["'PT'","'ES'","'FR'","'DE'","'IT'","'IE'",
   "'GB-ENG'","'GB-SCT'","'GB-WLS'","'GB-NIR'",
   "'NL'","'BE'","'US'","'CA'","'MX'","'BR'","'AR'",
   "'CL'","'DO'","'PL'","'GR'","'HR'","'CY'","'AE-DU'"]
    .every(key => marketRegistry.includes(key)));
check('Dubai remains exact AE-DU market',
  marketRegistry.includes("'AE-DU'") &&
  marketRegistry.includes("kind:'emirate'") &&
  marketRegistry.includes("code:'AE-DU'") &&
  !marketRegistry.includes("key:'AE'"));

const menuLangs = Array.from(body.matchAll(/<button[^>]*data-lang="([^"]+)"/g), m => m[1]);
const disabledLangs = Array.from(body.matchAll(/<button[^>]*data-lang="([^"]+)"[^>]*disabled/g), m => m[1]);

check('legacy horizontal language switch removed', !body.includes('class="lang-switch"'));
check('compact dropdown summary exists',
  body.includes('class="lang-menu"') && body.includes('id="current-lang-label"'));
check('all six public languages are visibly listed',
  JSON.stringify(menuLangs) === JSON.stringify(sixLocales));
check('static source keeps conservative ES DE IT fallback before production activation',
  sameSet(disabledLangs, ['es','de','it']));
check('production language activator enables all six translated languages',
  sixLanguageMenu.includes("['fr', 'en', 'pt', 'es', 'de', 'it']") &&
  sixLanguageMenu.includes('button.disabled = false') &&
  sixLanguageMenu.includes("button.removeAttribute('disabled')") &&
  sixLanguageMenu.includes('planned.remove()'));
check('Phase-4 locale authority remains exact six',
  sixLocales.every(v => publicLocales.includes(`'${v}'`)) &&
  publicLocales.includes('TRANSLATED_PUBLIC_LOCALES'));
check('runtime selectable set follows translated public authority',
  app.includes('PUBLIC_LOCALE_CONFIG.LEGACY_TRANSLATED_LOCALES.slice()'));
check('legacy planned-language labels remain harmless fallback copy',
  i18n.includes("planned:'Coming soon'") &&
  i18n.includes("planned:'Brevemente'") &&
  i18n.includes("planned:'Bientôt'"));
check('current language label sync exists',
  app.includes("document.getElementById('current-lang-label')") &&
  app.includes('state.lang.toUpperCase()'));
check('language menu closes after valid selection',
  app.includes("document.getElementById('language-menu')") &&
  app.includes("menu.removeAttribute('open')"));
check('compact language menu styling exists',
  css.includes('.lang-menu-summary') && css.includes('.lang-menu-panel'));

check('EN empty state useful', i18n.includes("emptyTitle:'New opportunities are being added'"));
check('PT empty state useful', i18n.includes("emptyTitle:'Novas oportunidades estão a ser adicionadas'"));
check('FR empty state useful', i18n.includes("emptyTitle:\"De nouvelles opportunités sont en cours d'ajout\""));
check('ES DE IT empty states are genuinely translated',
  i18nPhase4.includes("emptyTitle:'Se están incorporando nuevas oportunidades'") &&
  i18nPhase4.includes("emptyTitle:'Neue Angebote werden hinzugefügt'") &&
  i18nPhase4.includes("emptyTitle:'Stiamo aggiungendo nuove opportunità'"));

const primaryCategoryButtons = Array.from(
  body.matchAll(/<button[^>]*data-cat="(residential|commercial|developments|land)"[^>]*>/g),
  match => match[1]
);

check('four primary categories include Commercial',
  JSON.stringify(primaryCategoryButtons) === JSON.stringify(['residential','commercial','developments','land']));

check('Commercial maps to canonical subtypes and never subtype=commercial',
  app.includes("commercial:Object.freeze(['office','retail','industrial_logistics','hospitality'])") &&
  !app.includes("subtype:'commercial'") && !app.includes('subtype:"commercial"'));

check('commercial subtype labels exist in all six public languages',
  (i18n.match(/typeOffice:/g)||[]).length===3 &&
  (i18n.match(/typeRetail:/g)||[]).length===3 &&
  (i18n.match(/typeIndustrialLogistics:/g)||[]).length===3 &&
  (i18n.match(/typeHospitality:/g)||[]).length===3 &&
  (i18nPhase4.match(/typeOffice:/g)||[]).length===3 &&
  (i18nPhase4.match(/typeRetail:/g)||[]).length===3 &&
  (i18nPhase4.match(/typeIndustrialLogistics:/g)||[]).length===3 &&
  (i18nPhase4.match(/typeHospitality:/g)||[]).length===3);

check('Buy Rent is inside balanced filter row',
  body.includes('class="search-fields search-fields-balanced"') &&
  body.indexOf('class="transaction-filter-block transaction-filter-inline"') > body.indexOf('class="search-fields search-fields-balanced"'));
check('Commercial search pill exists', body.includes('data-filter="commercial"') && app.includes("if (filterKey === 'commercial')"));
check('home category synchronizes type choices', app.includes('function setHomeCategory(category)') && app.includes('function syncHomeTypeOptions('));
check('balanced category and filter CSS exists',
  css.includes('.cat-tabs.design-balanced-categories') &&
  css.includes('grid-template-columns:repeat(4,minmax(0,1fr))') &&
  css.includes('.search-fields.search-fields-balanced'));
check('info columns have equalized spacing',
  css.includes('.principle-strip.design-balanced-principles') &&
  css.includes('padding:28px 28px 30px') && css.includes('min-height:64px'));
check('home status rhythm is normalized',
  css.includes('DESIGN.1C-R1 rhythm') && css.includes('#home-status.design-home-status'));

const designHeroAsset = path.join(__dirname, '../../apps/zfind-web/public/brand/zfind-atlantic-hero.webp');
const designHeroBuild = fs.readFileSync(path.join(__dirname, '../../apps/zfind-web/scripts/build.js'), 'utf8');

check('approved Atlantic hero visual is integrated on Home',
  body.includes('class="hero-atlantic-visual"') &&
  body.includes('src="brand/zfind-atlantic-hero.webp"') &&
  css.includes('.hero-atlantic-visual'));
check('Atlantic hero visual is decorative and dimension-stable',
  body.includes('alt=""') && body.includes('aria-hidden="true"') &&
  body.includes('width="1448"') && body.includes('height="1086"'));
check('Atlantic hero asset is web-optimized WebP',
  fs.existsSync(designHeroAsset) && fs.statSync(designHeroAsset).size > 30000 && fs.statSync(designHeroAsset).size < 200000);
check('header right edge receives dedicated desktop breathing room',
  css.includes('header.site .wrap.nav-row') && css.includes('max-width:1440px') &&
  css.includes('padding-left:40px') && css.includes('padding-right:40px'));
check('local build copies approved hero asset into dist brand',
  designHeroBuild.includes('zfind-atlantic-hero.webp') &&
  designHeroBuild.includes('distBrand') && designHeroBuild.includes('fs.copyFileSync'));

console.log('');
console.log(`DESIGN_INTERNATIONAL_HOME_TOTAL=${passed + failed}`);
console.log(`DESIGN_INTERNATIONAL_HOME_PASS=${passed}`);
console.log(`DESIGN_INTERNATIONAL_HOME_FAIL=${failed}`);

process.exit(failed ? 1 : 0);
