'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(
  __dirname,
  '../../../..'
);

const FIND = path.join(
  ROOT,
  'apps/find'
);

const WEB = path.join(
  FIND,
  'apps/zfind-web'
);

const locales = require(
  path.join(
    WEB,
    'src/services/public-locales.js'
  )
);

const routes = require(
  path.join(
    WEB,
    'src/services/public-routes.js'
  )
);

const seo = require(
  path.join(
    WEB,
    'src/services/seo-page-generator.js'
  )
);

const app = fs.readFileSync(
  path.join(WEB, 'src/app.js'),
  'utf8'
);

const body = fs.readFileSync(
  path.join(WEB, 'src/body.html'),
  'utf8'
);

const head = fs.readFileSync(
  path.join(WEB, 'src/head_top.txt'),
  'utf8'
);

const viewmodels = fs.readFileSync(
  path.join(WEB, 'src/viewmodels.js'),
  'utf8'
);

const migration = fs.readFileSync(
  path.join(
    ROOT,
    'infrastructure/supabase/migrations/20260814224500_z_find_french_default_language_convergence_v1.sql'
  ),
  'utf8'
);

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS:', name);
}

console.log(
  '\n=== PHASE 4 — PUBLIC LANGUAGE FOUNDATION ==='
);

test('six public languages', () => {
  assert.deepStrictEqual(
    locales.PUBLIC_LOCALES,
    ['fr','en','pt','es','de','it']
  );
});

test('French public default', () => {
  assert.strictEqual(
    locales.DEFAULT_PUBLIC_LOCALE,
    'fr'
  );
});

test('one Portuguese public identity', () => {
  assert.strictEqual(
    locales.persistedLocaleFor('pt'),
    'pt-PT'
  );

  assert.strictEqual(
    locales.publicLocaleForPersisted('pt-PT'),
    'pt'
  );

  assert(
    !JSON.stringify(locales).includes('pt-BR')
  );
});

test('six formatting locales', () => {
  assert.deepStrictEqual(
    locales.PUBLIC_LOCALES.map(
      x => locales.formattingLocaleFor(x)
    ),
    [
      'fr-FR',
      'en-IE',
      'pt-PT',
      'es-ES',
      'de-DE',
      'it-IT'
    ]
  );
});

test('six-language menu is visible while only translated locales are selectable', () => {
  assert.deepStrictEqual(
    locales.LEGACY_TRANSLATED_LOCALES,
    ['fr','en','pt']
  );

  assert.deepStrictEqual(
    locales.PUBLIC_LOCALES,
    ['fr','en','pt','es','de','it']
  );

  const panelMatch = body.match(
    /<div\s+class="lang-menu-panel"[^>]*>([\s\S]*?)<\/div>/
  );

  assert(
    panelMatch,
    'compact language menu panel must exist'
  );

  const panel = panelMatch[1];

  for (const lang of locales.PUBLIC_LOCALES) {
    assert(
      panel.includes(`data-lang="${lang}"`),
      `language menu must visibly include ${lang}`
    );
  }

  for (const lang of locales.LEGACY_TRANSLATED_LOCALES) {
    assert(
      new RegExp(
        `<button[^>]*data-lang="${lang}"(?![^>]*disabled)[^>]*>`
      ).test(panel),
      `${lang} must remain selectable`
    );
  }

  for (const lang of ['es','de','it']) {
    assert(
      new RegExp(
        `<button[^>]*data-lang="${lang}"[^>]*disabled[^>]*>`
      ).test(panel),
      `${lang} must be visible but disabled until complete translations ship`
    );
  }
});

test('French remains the static public default in the compact menu', () => {
  assert(
    body.includes(
      'id="current-lang-label">FR</span>'
    )
  );

  assert.strictEqual(
    locales.DEFAULT_PUBLIC_LOCALE,
    'fr'
  );
});

test('runtime uses central default authority', () => {
  assert(
    app.includes(
      'PUBLIC_LOCALE_CONFIG.DEFAULT_PUBLIC_LOCALE'
    )
  );

  assert(
    !app.includes(
      "localStorage.getItem('zfind_lang') || 'en'"
    )
  );
});

test('root document and SEO are French', () => {
  assert(
    head.includes('<html lang="fr">')
  );

  assert(
    head.includes(
      '<title>Z Find — De vraies opportunités immobilières</title>'
    )
  );

  assert(
    head.includes(
      'Achetez, louez et investissez'
    )
  );
});

test('root WebSite JSON-LD is French', () => {
  const match = head.match(
    /<script type="application\/ld\+json" id="zfind-root-website-schema">([\s\S]*?)<\/script>/
  );

  assert(match);

  const schema = JSON.parse(match[1]);

  assert.strictEqual(
    schema.inLanguage,
    'fr'
  );
});

test('all six viewmodel locales exist', () => {
  [
    "fr:'fr-FR'",
    "en:'en-IE'",
    "pt:'pt-PT'",
    "es:'es-ES'",
    "de:'de-DE'",
    "it:'it-IT'"
  ].forEach(
    token => assert(viewmodels.includes(token))
  );
});

test('Property routes exist in six languages', () => {
  const slug = 'test-123456';

  assert.deepStrictEqual(
    locales.PUBLIC_LOCALES.map(
      locale =>
        routes.buildEntityPath({
          locale,
          kind: 'property',
          slug
        })
    ),
    [
      '/fr/bien/' + slug,
      '/en/property/' + slug,
      '/pt/imovel/' + slug,
      '/es/inmueble/' + slug,
      '/de/immobilie/' + slug,
      '/it/immobile/' + slug
    ]
  );
});

test('Development routes exist in six languages', () => {
  const slug = 'campo-alegre-74d210';

  assert.deepStrictEqual(
    locales.PUBLIC_LOCALES.map(
      locale =>
        routes.buildEntityPath({
          locale,
          kind: 'development',
          slug
        })
    ),
    [
      '/fr/programme/' + slug,
      '/en/development/' + slug,
      '/pt/empreendimento/' + slug,
      '/es/promocion/' + slug,
      '/de/neubauprojekt/' + slug,
      '/it/nuova-costruzione/' + slug
    ]
  );
});

test('public intents exclude Off-market', () => {
  assert.deepStrictEqual(
    routes.INTENTS,
    ['buy','rent','invest','developments']
  );

  assert.throws(
    () =>
      routes.buildIntentPath({
        locale: 'fr',
        intent: 'offmarket'
      })
  );
});

test('French is SEO x-default', () => {
  assert.strictEqual(
    seo.DEFAULT_LOCALE,
    'fr'
  );

  const html = seo.buildListingPage({
    kind: 'property',
    baseUrl: 'https://zfind.online',
    locale: 'en',
    id: 'test-property',
    title: 'Test',
    description: 'Test property',
    priceValue: 100000,
    currencyIso: 'EUR',
    priceIsFrom: false,
    zoneLabel: 'Test',
    cityLabel: 'Porto',
    countryIsoCode: 'PT',
    imageUrl: null,
    imageAlt: null
  });

  assert(
    html.includes(
      'hreflang="x-default" href="https://zfind.online/fr/property/test-property"'
    )
  );
});

test('migration changes default only', () => {
  assert(
    migration.includes(
      "where code = 'fr'"
    )
  );

  assert(
    migration.includes(
      "'pt-PT'"
    )
  );

  assert(
    migration.includes(
      'zfind_system_languages_one_default_idx'
    )
  );

  assert(
    !migration.includes('pt-BR')
  );

  assert(
    !migration.includes('sort_order =')
  );
});

assert.strictEqual(
  passed,
  15
);

console.log('');
console.log(
  `PUBLIC LANGUAGE FOUNDATION: ${passed}/15 PASSED`
);
