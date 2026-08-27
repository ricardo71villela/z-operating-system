#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const welcomeSource = read(
  'apps/zfind-web/src/services/international-welcome.js'
);
const buildSource = read(
  'apps/zfind-web/scripts/build.js'
);
const body = read(
  'apps/zfind-web/src/body.html'
);

const publicLocales = require(
  path.join(ROOT, 'apps/zfind-web/src/services/public-locales.js')
);
const publicRoutes = require(
  path.join(ROOT, 'apps/zfind-web/src/services/public-routes.js')
);
const marketRegistry = require(
  path.join(ROOT, 'apps/zfind-web/src/services/market-registry.js')
);

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

const expectedLocales = ['fr','en','pt','es','de','it'];

check(
  'welcome authority exposes the exact six public locales',
  JSON.stringify(publicLocales.PUBLIC_LOCALES) ===
    JSON.stringify(expectedLocales)
);

check(
  'welcome copy exists in all six public locales',
  expectedLocales.every(locale =>
    welcomeSource.includes(`${locale}: Object.freeze({`)
  )
);

check(
  'welcome keeps language independent from market navigation',
  welcomeSource.includes('let selectedLocale = resolveInitialLocale()') &&
  welcomeSource.includes('function selectLocale(localeValue)') &&
  welcomeSource.includes('function enterMarket(marketKey)')
);

check(
  'market entry uses canonical six-locale public market routes',
  welcomeSource.includes('marketRegistry.marketPath(') &&
  welcomeSource.includes('marketKey,') &&
  welcomeSource.includes('selectedLocale')
);

check(
  'visual picker uses existing registry map assets',
  welcomeSource.includes('image.src = market.mapAsset') &&
  welcomeSource.includes("className = 'zfind-welcome-market-grid'") &&
  welcomeSource.includes("className = 'zfind-welcome-market'")
);

check(
  'visual picker is keyboard-native and labelled',
  welcomeSource.includes("button.type = 'button'") &&
  welcomeSource.includes("button.setAttribute('aria-label', copy().enter(label))") &&
  welcomeSource.includes("grid.setAttribute('role', 'group')")
);

check(
  'native hero market select remains as accessible fallback',
  body.includes('id="hero-market"') &&
  welcomeSource.includes("select.removeAttribute('onchange')") &&
  welcomeSource.includes("select.addEventListener('change'")
);

check(
  'native fallback follows the independently selected locale',
  welcomeSource.includes('marketRegistry.marketLabel(') &&
  welcomeSource.includes("firstOption.textContent = copy().chooseMarket")
);

check(
  'welcome no longer opens automatically on initial page load',
  !welcomeSource.includes(
    "document.addEventListener('DOMContentLoaded', render)"
  ) &&
  welcomeSource.includes('bindExplicitOpenControls')
);

check(
  'passive hash routing closes rather than reopens the welcome panel',
  welcomeSource.includes("root.addEventListener('hashchange', function () {") &&
  welcomeSource.includes('close();') &&
  !welcomeSource.includes('root.setTimeout(render, 0)')
);

check(
  'existing Home market CTA is the explicit welcome open authority',
  body.includes('id="home-status-market-cta"') &&
  welcomeSource.includes(
    "document.getElementById('home-status-market-cta')"
  ) &&
  welcomeSource.includes("cta.addEventListener('click', render)")
);

check(
  'welcome service exposes explicit open and close controls',
  welcomeSource.includes('open: render') &&
  welcomeSource.includes('close,') &&
  welcomeSource.includes('function close()')
);

check(
  'welcome service is included by deterministic Z Find build',
  buildSource.includes(
    "read('services/international-welcome.js')"
  ) &&
  buildSource.includes(
    "+ '\\n' + internationalWelcomeService"
  )
);

check(
  'existing map asset copy remains in deterministic build',
  buildSource.includes("const marketMapSource = path.join(") &&
  buildSource.includes("'markets'") &&
  buildSource.includes('copyDirectoryRecursive(')
);

const markets = marketRegistry.listMarkets();

check(
  'market registry retains the complete approved international set',
  markets.length === 24
);

check(
  'every market has a versioned SVG map asset',
  markets.every(market =>
    /^brand\/markets\/[a-z0-9-]+\.svg$/.test(market.mapAsset) &&
    fs.existsSync(
      path.join(
        ROOT,
        'apps/zfind-web/public',
        market.mapAsset
      )
    )
  )
);

check(
  'every market has a localized label in all six locales',
  markets.every(market =>
    expectedLocales.every(locale =>
      typeof marketRegistry.marketLabel(
        market.key,
        locale
      ) === 'string'
    )
  )
);

check(
  'every market has a canonical route in all six locales',
  markets.every(market =>
    expectedLocales.every(locale => {
      const publicPath = marketRegistry.marketPath(
        market.key,
        locale
      );
      const parsed = publicRoutes.parsePublicPath(publicPath);
      return (
        parsed &&
        parsed.type === 'market' &&
        parsed.locale === locale &&
        marketRegistry.marketBySlug(
          locale,
          parsed.slug
        ).key === market.key
      );
    })
  )
);

check(
  'welcome locale persistence is isolated from legacy shell language state',
  welcomeSource.includes(
    "const STORAGE_KEY = 'zfind_welcome_locale'"
  ) &&
  !welcomeSource.includes(
    "localStorage.setItem('zfind_lang'"
  )
);

check(
  'welcome module never creates geography authority',
  !welcomeSource.includes('geography =') &&
  !welcomeSource.includes('country_iso') &&
  welcomeSource.includes(
    'marketRegistry.listMarkets()'
  )
);

console.log('');
console.log(
  `INTERNATIONAL_WELCOME_TOTAL=${passed + failed}`
);
console.log(
  `INTERNATIONAL_WELCOME_PASS=${passed}`
);
console.log(
  `INTERNATIONAL_WELCOME_FAIL=${failed}`
);

process.exit(failed ? 1 : 0);
