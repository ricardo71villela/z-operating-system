'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../../../..');
const FIND = path.join(ROOT, 'apps/find');
const WEB = path.join(FIND, 'apps/zfind-web');
const SRC = path.join(WEB, 'src');

const locales = require(path.join(SRC, 'services/public-locales.js'));
const routes = require(path.join(SRC, 'services/public-routes.js'));

const app = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
const body = fs.readFileSync(path.join(SRC, 'body.html'), 'utf8');
const head = fs.readFileSync(path.join(SRC, 'head_top.txt'), 'utf8');
const viewmodels = fs.readFileSync(path.join(SRC, 'viewmodels.js'), 'utf8');
const i18n = fs.readFileSync(path.join(SRC, 'i18n.js'), 'utf8');
const i18nPhase4 = fs.readFileSync(path.join(SRC, 'i18n-phase4.js'), 'utf8');
const sixLanguageMenu = fs.readFileSync(path.join(SRC, 'six-language-menu.js'), 'utf8');
const build = fs.readFileSync(path.join(WEB, 'scripts/build.js'), 'utf8');
const migration = fs.readFileSync(
  path.join(ROOT, 'infrastructure/supabase/migrations/20260814224500_z_find_french_default_language_convergence_v1.sql'),
  'utf8'
);

const REQUIRED = ['fr','en','pt','es','de','it'];
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS:', name);
}

function keyPaths(value, prefix = '') {
  return Object.keys(value).flatMap(key => {
    const next = prefix ? `${prefix}.${key}` : key;
    const child = value[key];
    return child && typeof child === 'object' && !Array.isArray(child)
      ? keyPaths(child, next)
      : [next];
  }).sort();
}

console.log('\n=== Z FIND — SIX-LANGUAGE PUBLIC CONTRACT ===');

test('exact six public languages', () => {
  assert.deepStrictEqual(locales.PUBLIC_LOCALES, REQUIRED);
});

test('all six are translated/selectable authorities', () => {
  assert.deepStrictEqual(locales.TRANSLATED_PUBLIC_LOCALES, REQUIRED);
  assert.deepStrictEqual(locales.LEGACY_TRANSLATED_LOCALES, REQUIRED);
});

test('French remains public default', () => {
  assert.strictEqual(locales.DEFAULT_PUBLIC_LOCALE, 'fr');
});

test('Portuguese keeps one public identity and pt-PT persistence', () => {
  assert.strictEqual(locales.persistedLocaleFor('pt'), 'pt-PT');
  assert.strictEqual(locales.publicLocaleForPersisted('pt-PT'), 'pt');
  assert(!JSON.stringify(locales).includes('pt-BR'));
});

test('six formatting locales', () => {
  assert.deepStrictEqual(
    REQUIRED.map(x => locales.formattingLocaleFor(x)),
    ['fr-FR','en-IE','pt-PT','es-ES','de-DE','it-IT']
  );
});

test('language menu contains all six languages', () => {
  for (const lang of REQUIRED) {
    assert(body.includes(`data-lang="${lang}"`), `missing ${lang} language button`);
  }
});

test('production language activator enables every translated locale', () => {
  assert(sixLanguageMenu.includes("['fr', 'en', 'pt', 'es', 'de', 'it']"));
  assert(sixLanguageMenu.includes("button.disabled = false"));
  assert(sixLanguageMenu.includes("button.removeAttribute('disabled')"));
  assert(sixLanguageMenu.includes("planned.remove()"));
});

test('build includes Phase-4 translations and menu activation before app', () => {
  const phase4Pos = build.indexOf('+ i18nPhase4');
  const menuPos = build.indexOf('+ sixLanguageMenu');
  const appPos = build.indexOf('+ app');
  assert(phase4Pos >= 0 && menuPos > phase4Pos && appPos > menuPos);
});

test('ES DE IT translation dictionaries match complete EN key shape', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${i18n}\n${i18nPhase4}\nthis.__Z_FIND_I18N__ = I18N;`,
    context,
    { filename: 'zfind-six-language-i18n.bundle.js' }
  );

  const dict = context.__Z_FIND_I18N__;
  const englishKeys = keyPaths(dict.en);
  assert(englishKeys.length > 250, 'expected complete interface dictionary');

  for (const locale of REQUIRED) {
    assert(dict[locale], `missing ${locale} dictionary`);
    assert.deepStrictEqual(keyPaths(dict[locale]), englishKeys, `${locale} key shape differs from EN`);
  }
});

test('new locale copy is genuine rather than English fallback', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${i18n}\n${i18nPhase4}\nthis.d = I18N;`, context);
  const d = context.d;
  assert.strictEqual(d.es.common.search, 'Buscar');
  assert.strictEqual(d.de.common.search, 'Suchen');
  assert.strictEqual(d.it.common.search, 'Cerca');
  assert.notStrictEqual(d.es.hero.lead, d.en.hero.lead);
  assert.notStrictEqual(d.de.hero.lead, d.en.hero.lead);
  assert.notStrictEqual(d.it.hero.lead, d.en.hero.lead);
});

test('runtime uses central translated locale authority', () => {
  assert(app.includes('PUBLIC_LOCALE_CONFIG.LEGACY_TRANSLATED_LOCALES'));
  assert(!app.includes("localStorage.getItem('zfind_lang') || 'en'"));
});

test('root document and WebSite JSON-LD remain French', () => {
  assert(head.includes('<html lang="fr">'));
  assert(head.includes('<title>Z Find — De vraies opportunités immobilières</title>'));
  const match = head.match(/<script type="application\/ld\+json" id="zfind-root-website-schema">([\s\S]*?)<\/script>/);
  assert(match);
  assert.strictEqual(JSON.parse(match[1]).inLanguage, 'fr');
});

test('all six viewmodel formatting locales exist', () => {
  ["fr:'fr-FR'","en:'en-IE'","pt:'pt-PT'","es:'es-ES'","de:'de-DE'","it:'it-IT'"]
    .forEach(token => assert(viewmodels.includes(token)));
});

test('Property routes exist in six languages', () => {
  const slug = 'test-123456';
  assert.deepStrictEqual(
    REQUIRED.map(locale => routes.buildEntityPath({ locale, kind:'property', slug })),
    ['/fr/bien/'+slug,'/en/property/'+slug,'/pt/imovel/'+slug,'/es/inmueble/'+slug,'/de/immobilie/'+slug,'/it/immobile/'+slug]
  );
});

test('Development routes exist in six languages', () => {
  const slug = 'campo-alegre-74d210';
  assert.deepStrictEqual(
    REQUIRED.map(locale => routes.buildEntityPath({ locale, kind:'development', slug })),
    ['/fr/programme/'+slug,'/en/development/'+slug,'/pt/empreendimento/'+slug,'/es/promocion/'+slug,'/de/neubauprojekt/'+slug,'/it/nuova-costruzione/'+slug]
  );
});

test('database language authority already contains all six with French default', () => {
  for (const persisted of ['fr','en','pt-PT','es','de','it']) {
    assert(migration.includes(`'${persisted}'`));
  }
  assert(migration.includes("where code = 'fr'"));
  assert(!migration.includes('pt-BR'));
});

assert.strictEqual(passed, 16);
console.log('');
console.log(`SIX-LANGUAGE PUBLIC CONTRACT: ${passed}/16 PASSED`);
