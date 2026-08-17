#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const registry = require(path.join(
  ROOT,
  'apps/zfind-web/src/services/market-registry.js'
));

const mapDir = path.join(
  ROOT,
  'apps/zfind-web/public/brand/markets'
);
const generatorPath = path.join(
  ROOT,
  'apps/zfind-web/scripts/generate-market-map-assets.py'
);

const app = read('apps/zfind-web/src/app.js');
const css = read('apps/zfind-web/src/css_block.txt');
const build = read('apps/zfind-web/scripts/build.js');

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

const markets = registry.listMarkets();

check('exact 24 markets retained', markets.length === 24);

check('every market exposes one deterministic SVG asset path',
  markets.every(m =>
    typeof m.mapAsset === 'string' &&
    /^brand\/markets\/[a-z0-9-]+\.svg$/.test(m.mapAsset)
  ));

check('all market map asset paths are unique',
  new Set(markets.map(m => m.mapAsset)).size === 24);

check('all 24 exact SVG assets exist',
  fs.existsSync(mapDir) &&
  markets.every(m => fs.existsSync(path.join(
    ROOT,
    'apps/zfind-web/public',
    m.mapAsset
  ))));

check('every SVG declares exact market key and Natural Earth provenance',
  markets.every(m => {
    const file = path.join(
      ROOT,
      'apps/zfind-web/public',
      m.mapAsset
    );
    if (!fs.existsSync(file)) return false;
    const svg = fs.readFileSync(file, 'utf8');
    return svg.includes(`data-market-key="${m.key}"`) &&
      svg.includes('data-map-source="Natural Earth"') &&
      svg.includes('<path') &&
      svg.includes('fill-rule="evenodd"');
  }));

check('England/Scotland/Wales/Northern Ireland assets are distinct',
  ['GB-ENG','GB-SCT','GB-WLS','GB-NIR']
    .map(key => fs.existsSync(path.join(
      ROOT,
      'apps/zfind-web/public',
      registry.getMarket(key).mapAsset
    )) ? fs.readFileSync(path.join(
      ROOT,
      'apps/zfind-web/public',
      registry.getMarket(key).mapAsset
    ), 'utf8') : '')
    .filter(Boolean)
    .length === 4 &&
  new Set(['GB-ENG','GB-SCT','GB-WLS','GB-NIR'].map(key => {
    const file = path.join(
      ROOT,
      'apps/zfind-web/public',
      registry.getMarket(key).mapAsset
    );
    return fs.existsSync(file)
      ? require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex')
      : '';
  })).size === 4);

check('Dubai asset is explicitly AE-DU, never generic AE',
  registry.getMarket('AE-DU').mapAsset === 'brand/markets/ae-du.svg' &&
  !markets.some(m => m.key === 'AE'));

check('reproducible map generator exists', fs.existsSync(generatorPath));

if (fs.existsSync(generatorPath)) {
  const generator = fs.readFileSync(generatorPath, 'utf8');
  check('generator pins all three upstream Natural Earth Git blobs',
    generator.includes('9d99f26dc470fcdbd08b062c813005acbdf73ccb') &&
    generator.includes('85c8767de8d1564bb171892762347a4b9fae30b6') &&
    generator.includes('4a8438f98ac7dfec7dc1739b1eaf91398ad33f22'));
  check('generator selects UK constituent countries from map units',
    generator.includes('ne_50m_admin_0_map_units.geojson') &&
    generator.includes("'GB-ENG': 'England'") &&
    generator.includes("'GB-SCT': 'Scotland'") &&
    generator.includes("'GB-WLS': 'Wales'") &&
    generator.includes("'GB-NIR': 'Northern Ireland'"));
  check('generator selects Dubai from admin-1 source',
    generator.includes('ne_10m_admin_1_states_provinces.geojson') &&
    generator.includes("market_key == 'AE-DU'") &&
    generator.includes("normalize_text(value) == 'dubai'"));
}

check('market renderer uses registry-backed decorative image',
  app.includes('class="market-map-visual"') &&
  app.includes('src="${market.mapAsset}"') &&
  app.includes('alt=""') &&
  app.includes('aria-hidden="true"'));

check('market map styling preserves ivory/gold visual language',
  css.includes('.market-map-visual') &&
  css.includes('filter:drop-shadow') &&
  css.includes('mask-image:linear-gradient'));

check('local build copies full market-map directory into dist',
  build.includes("'markets'") &&
  build.includes('copyDirectoryRecursive') &&
  build.includes('Market map assets: copied to dist/brand/markets'));

console.log('');
console.log(`COUNTRY_MARKET_MAP_TOTAL=${passed + failed}`);
console.log(`COUNTRY_MARKET_MAP_PASSED=${passed}`);
console.log(`COUNTRY_MARKET_MAP_FAILED=${failed}`);

if (failed) process.exit(1);

/* MAP.V4 mainland-relief contract */
(() => {
  const expectedNoteMarkets = [
    'PT','ES','FR','DE','IT','NL',
    'MX','BR','AR','CL','GR','HR'
  ];

  const expectedCopy = {
    fr:'Les territoires non continentaux ne sont pas représentés sur cette carte.',
    en:'Non-mainland territories are not represented on this map.',
    pt:'Os territórios não continentais não estão representados neste mapa.',
    es:'Los territorios no continentales no están representados en este mapa.',
    de:'Nicht zum Festland gehörende Gebiete sind auf dieser Karte nicht dargestellt.',
    it:'I territori non continentali non sono rappresentati in questa mappa.'
  };

  function requireV4(label, condition) {
    if (!condition) throw new Error(`MAP.V4 failed: ${label}`);
    console.log(`PASS MAP.V4: ${label}`);
  }

  const v4Markets = registry.listMarkets();
  const actualNoteMarkets = v4Markets
    .filter(m => m.mapOmitsNonMainland)
    .map(m => m.key);

  requireV4(
    'approved omission-note market set exact',
    JSON.stringify(actualNoteMarkets) === JSON.stringify(expectedNoteMarkets)
  );

  requireV4(
    'omission-note copy exact 6/6',
    ['fr','en','pt','es','de','it'].every(locale =>
      registry.marketPresentation('PT', locale).mapOmissionNote === expectedCopy[locale]
    )
  );

  let totalBytes = 0;

  requireV4(
    '24 SVGs expose real relief and exact note metadata',
    v4Markets.every(m => {
      const file = path.join(ROOT, 'apps/zfind-web/public', m.mapAsset);
      const svg = fs.readFileSync(file, 'utf8');
      const bytes = fs.statSync(file).size;
      totalBytes += bytes;

      return (
        bytes <= 900000 &&
        svg.includes('data-map-mode="mainland-relief-v2-r2"') &&
        svg.includes('data:image/jpeg;base64,') &&
        svg.includes('<clipPath') &&
        svg.includes(
          `data-omitted-non-mainland="${m.mapOmitsNonMainland ? 'true' : 'false'}"`
        )
      );
    })
  );

  requireV4('24-SVG total budget', totalBytes <= 8000000);

  requireV4(
    'US CA unchanged and insular markets preserved',
    ['US','CA','IE','GB-ENG','GB-SCT','GB-WLS','GB-NIR','DO','CY','AE-DU']
      .every(key => registry.getMarket(key).mapOmitsNonMainland === false)
  );

  const generatorV4 = fs.readFileSync(generatorPath, 'utf8');

  requireV4(
    'generator locks relief land and physical-mainland contract',
    generatorV4.includes('e3aa47b13aff26e1b4b3792a94100d8667d3147046aeac7840be00a15f839d18') &&
    generatorV4.includes('2d76878175b8054acd9c5a52917ee9ea59a36fc5') &&
    generatorV4.includes('HOME_PHYSICAL_LANDMASS_INTERSECTION_V1') &&
    generatorV4.includes('sys.dont_write_bytecode = True')
  );

  requireV4(
    'app conditionally renders localized omission note',
    app.includes('market-map-omission-note') &&
    app.includes('market.mapOmitsNonMainland') &&
    app.includes('copy.mapOmissionNote')
  );

  requireV4(
    'note styling discreet',
    css.includes('.market-map-omission-note{') &&
    css.includes('font-size:11px') &&
    css.includes('color:var(--gray-500)')
  );
})();
