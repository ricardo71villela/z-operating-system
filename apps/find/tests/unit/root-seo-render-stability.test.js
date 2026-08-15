'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FIND_ROOT =
  path.resolve(
    __dirname,
    '../..'
  );

const SRC =
  path.join(
    FIND_ROOT,
    'apps/zfind-web/src'
  );

const head =
  fs.readFileSync(
    path.join(
      SRC,
      'head_top.txt'
    ),
    'utf8'
  );

const body =
  fs.readFileSync(
    path.join(
      SRC,
      'body.html'
    ),
    'utf8'
  );

const i18nSource =
  fs.readFileSync(
    path.join(
      SRC,
      'i18n.js'
    ),
    'utf8'
  );

const sandbox = {
  console,
};

vm.createContext(
  sandbox
);

vm.runInContext(
  i18nSource +
  '\nthis.__I18N = I18N;',
  sandbox
);

const FR =
  sandbox.__I18N.fr;

let passed = 0;
let failed = 0;

function assert(
  condition,
  label
) {
  if (condition) {
    console.log(
      '  ✅ ' + label
    );
    passed += 1;
  } else {
    console.log(
      '  ❌ ' + label
    );
    failed += 1;
  }
}

function resolveKey(key) {
  return key
    .split('.')
    .reduce(
      (current, part) =>
        current == null
          ? undefined
          : current[part],
      FR
    );
}

function escapeRegExp(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );
}

function renderedText(
  source,
  key,
  attr = 'data-i18n'
) {
  const escaped =
    escapeRegExp(key);

  const re =
    new RegExp(
      `<([a-z0-9]+)\\b[^>]*\\b${attr}="${escaped}"[^>]*>` +
      `([\\s\\S]*?)` +
      `<\\/\\1>`,
      'i'
    );

  const match =
    source.match(re);

  if (!match) {
    return null;
  }

  return match[2]
    .replace(
      /<br\s*\/?>/gi,
      '\n'
    )
    .replace(
      /<[^>]+>/g,
      ''
    )
    .trim();
}


console.log(
  '\n=== 1. Root SEO ==='
);

assert(
  head.includes(
    '<meta name="description" content="'
  ),
  'meta description exists'
);

assert(
  head.includes(
    '<meta name="robots" content="index,follow">'
  ),
  'robots meta exists'
);

assert(
  head.includes(
    '<link rel="canonical" href="https://zfind.online/">'
  ),
  'canonical is production root'
);

assert(
  head.includes(
    '<meta property="og:title" content="'
  ) &&
  head.includes(
    '<meta property="og:description" content="'
  ) &&
  head.includes(
    '<meta property="og:url" content="https://zfind.online/">'
  ),
  'Open Graph root metadata exists'
);

assert(
  head.includes(
    '<meta name="twitter:card" content="summary">'
  ),
  'Twitter card exists without fabricated image'
);

const schemaMatch =
  head.match(
    /<script type="application\/ld\+json" id="zfind-root-website-schema">([\s\S]*?)<\/script>/
  );

let schema = null;

try {
  schema =
    schemaMatch
      ? JSON.parse(
          schemaMatch[1]
        )
      : null;
} catch (_) {}

assert(
  !!schema &&
  schema['@type'] === 'WebSite' &&
  schema.name === 'Z Find' &&
  schema.url ===
    'https://zfind.online/',
  'WebSite JSON-LD valid'
);


console.log(
  '\n=== 2. Initial French render ==='
);

const keys = [
  'navigation.home',
  'navigation.search',
  'navigation.partner',
  'navigation.simulator',
  'common.publish',
  'common.signIn',
  'hero.eyebrow',
  'hero.titleLine1',
  'hero.titleLineEm',
  'hero.lead',
  'search.tabResidential',
  'search.tabDevelopments',
  'search.tabLand',
  'search.buy',
  'search.rent',
  'search.rentalPeriod',
  'search.typeAny',
  'search.typeApartment',
  'search.typeVilla',
  'search.typeDevelopment',
  'search.typeLand',
  'search.anyBudget',
  'search.budgetUnder400',
  'search.budget400to700',
  'search.budgetOver700',
  'common.search',
  'hero.p1body',
  'hero.p2body',
  'hero.p3body',
];

for (const key of keys) {
  assert(
    renderedText(
      body,
      key
    ) ===
      resolveKey(key),
    `${key} pre-render matches I18N`
  );
}

for (
  const key
  of [
    'hero.p1title',
    'hero.p2title',
    'hero.p3title',
  ]
) {
  assert(
    renderedText(
      body,
      key,
      'data-i18n-html'
    ) ===
      resolveKey(key),
    `${key} line breaks preserved`
  );
}

const homeStart =
  body.indexOf(
    '<section class="view active" id="view-home">'
  );

const searchStart =
  body.indexOf(
    '<!-- ============ SEARCH ============ -->',
    homeStart
  );

const home =
  body.slice(
    homeStart,
    searchStart
  );

assert(
  home.includes(
    `placeholder="${FR.search.locationPh}"`
  ),
  'home location placeholder pre-rendered'
);

assert(
  /<html lang="fr">/.test(
    head
  ),
  'static default language remains French'
);

console.log(
  '\n============================================================'
);

console.log(
  `RESULT: ${passed} passed, ${failed} failed`
);

console.log(
  '============================================================'
);

if (failed) {
  process.exitCode = 1;
}
