/* Launch scope contract: France, Belgique, Luxembourg in fr/en are public;
   everything else stays in the source, hidden from the published surface. */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const WEB = path.join(ROOT, 'apps', 'zfind-web');
const launchScope = require(path.join(WEB, 'src', 'services', 'launch-scope.js'));
const registry = require(path.join(WEB, 'src', 'services', 'market-registry.js'));
const { buildPublicBody } = require(path.join(WEB, 'scripts', 'launch-surface.js'));

let passed = 0;
function check(label, value) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}

console.log('\n=== Z FIND LAUNCH SCOPE ===');

check('launch markets are exactly FR, BE, LU',
  JSON.stringify(launchScope.LAUNCH_MARKET_KEYS) === JSON.stringify(['FR', 'BE', 'LU']));
check('launch locales are exactly fr, en',
  JSON.stringify(launchScope.LAUNCH_LOCALES) === JSON.stringify(['fr', 'en']));

const publicMarkets = launchScope.filterMarkets(registry.listMarkets());
check('registry keeps every historical market (hidden, not deleted)',
  registry.listMarkets().length === 25 && !!registry.getMarket('PT') && !!registry.getMarket('AE-DU'));
check('public market list is FR, BE, LU',
  JSON.stringify(publicMarkets.map(m => m.key)) === JSON.stringify(['FR', 'BE', 'LU']));

const lu = registry.getMarket('LU');
check('Luxembourg market is registered with its own map and country search scope',
  lu && lu.mapAsset === 'brand/markets/lu.svg' &&
  fs.existsSync(path.join(WEB, 'public', lu.mapAsset)) &&
  lu.searchScope.kind === 'country_iso' && lu.searchScope.value === 'LU');
check('Luxembourg has no legal guide route until one is written',
  lu.legalRoute === null && lu.touristRentalRoute === null);

const routes = launchScope.publicGuideRoutes(registry.listMarkets());
check('public guide routes are the French and Belgian guides only',
  JSON.stringify([...routes].sort()) === JSON.stringify(
    ['legal-belgium', 'legal-fr', 'tourist-rental-belgium', 'tourist-rental-fr']));

const body = fs.readFileSync(path.join(WEB, 'src', 'body.html'), 'utf8');
const launch = buildPublicBody(body, {
  scope: 'launch',
  publicGuideRoutes: routes,
  defaultGuideRoutes: { legal: 'legal-fr', rental: 'tourist-rental-fr' }
});

check('launch HTML keeps the French and Belgian guides',
  launch.html.includes('id="view-legal-fr"') && launch.html.includes('id="view-legal-belgium"'));
check('launch HTML leaves hidden jurisdictions out',
  !launch.html.includes('id="view-legal-es"') && !launch.html.includes('id="view-legal"') &&
  !launch.html.includes('id="view-legal-dubai"') && launch.report.removedGuides.length === 44);
check('jurisdiction selectors only link to published guides',
  !/<button\b[^>]*onclick="navigate\('legal-(es|de|it|ie|netherlands|dubai)'\)"/.test(launch.html));
check('no internal editorial markers reach the public HTML',
  !launch.html.includes('LEGAL_STATUS') && !/Master [A-Z]{2}(-[A-Z]{2,3})? ·/.test(launch.html) &&
  !launch.html.includes('audit final avant lancement'));
check('reader-facing status wording replaces internal markers in French guides',
  launch.html.includes('À confirmer localement') && launch.html.includes('Règles vérifiées jusqu’en août 2026.'));
check('French wording fixes are applied',
  launch.html.includes('à la date de ce guide') && !launch.html.includes('à la date de cette guide') &&
  launch.html.includes('Ne jamais assimiler automatiquement'));
check('static footer guide links default to the French guides',
  launch.html.includes(`onclick="navigate('legal-fr');return false;" data-i18n="footer.legalGuide"`) &&
  launch.html.includes(`onclick="navigate('tourist-rental-fr');return false;" data-i18n="footer.alManual"`));

check('published HTML keeps only the fr/en language buttons',
  launch.html.includes('data-lang="fr"') && launch.html.includes('data-lang="en"') &&
  !['pt', 'es', 'de', 'it'].some(l => launch.html.includes(`data-lang="${l}"`)) &&
  !launch.html.includes('Português') && !launch.html.includes('Bientôt'));
const menuRuntime = fs.readFileSync(path.join(WEB, 'src', 'six-language-menu.js'), 'utf8');
check('language menu runtime skips locales left out of the launch build',
  menuRuntime.includes('!launchScope.isLaunchLocale(locale)) continue;'));

const registrySrc = fs.readFileSync(path.join(WEB, 'src', 'services', 'market-registry.js'), 'utf8');
check('French market copy uses the right place preposition',
  !registrySrc.includes('sur Z Find pour ${label}') &&
  !registrySrc.includes('informations de marché pour ${label}') &&
  registrySrc.includes("'Luxembourg': 'au'") && registrySrc.includes("return `${FR_PREPOSITION[label] || 'en'} ${label}`;"));

const all = buildPublicBody(body, { scope: 'all', publicGuideRoutes: routes });
check('ZFIND_LAUNCH_SCOPE=all keeps every language button',
  ['fr', 'en', 'pt', 'es', 'de', 'it'].every(l => all.html.includes(`data-lang="${l}"`)));
check('ZFIND_LAUNCH_SCOPE=all rebuilds every jurisdiction, still without internal markers',
  all.html.includes('id="view-legal-es"') && all.html.includes('id="view-legal"') &&
  !all.html.includes('LEGAL_STATUS') && !all.html.includes('Regra de produto para o Z Find'));

const app = fs.readFileSync(path.join(WEB, 'src', 'app.js'), 'utf8');
check('app lists and renders public markets only',
  app.includes('publicMarkets()') && app.includes('const market = getPublicMarket(marketKey);'));
check('hidden locales in the URL fall back to a launch locale',
  app.includes('LAUNCH_SCOPE_SERVICE.isLaunchLocale(lang)'));

const build = fs.readFileSync(path.join(WEB, 'scripts', 'build.js'), 'utf8');
check('build bundles the launch scope before the market registry',
  build.indexOf("+ launchScopeService + '\\n'") > -1 &&
  build.indexOf("+ launchScopeService + '\\n'") < build.indexOf("+ marketRegistryService + '\\n'"));

console.log(`\nLAUNCH SCOPE: ${passed}/${passed} PASSED`);
