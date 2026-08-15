'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');

function read(...parts) {
  return fs.readFileSync(
    path.join(ROOT, ...parts),
    'utf8'
  );
}

const servicePath = path.join(
  ROOT,
  'apps/find/apps/zfind-web/src/services/property-taxonomy.js'
);

const serviceSource = fs.readFileSync(
  servicePath,
  'utf8'
);

const adminBuild = read(
  'apps/find/apps/zfind-admin/scripts/build.js'
);

const partnerBuild = read(
  'apps/find/apps/zfind-partner/scripts/build.js'
);

const adminApp = read(
  'apps/find/apps/zfind-admin/src/app.js'
);

const partnerApp = read(
  'apps/find/apps/zfind-partner/src/app.js'
);

const packageJson = JSON.parse(
  read('apps/find/package.json')
);

function has(source, re, message) {
  assert.ok(re.test(source), message);
}

function lacks(source, re, message) {
  assert.ok(!re.test(source), message);
}


// ------------------------------------------------------------
// Shared taxonomy semantics
// ------------------------------------------------------------

has(
  serviceSource,
  /function listEnabledAuthoringSubtypes\(/,
  'Shared taxonomy service must expose one all-class authoring selector'
);

const taxonomyService = require(servicePath);

const taxonomy = taxonomyService.normalizeTaxonomy({
  classes: [
    {
      code: 'land',
      enabled: true,
      sort_order: 3
    },
    {
      code: 'commercial',
      enabled: false,
      sort_order: 2
    },
    {
      code: 'residential',
      enabled: true,
      sort_order: 1
    }
  ],
  subtypes: [
    {
      code: 'land',
      property_class: 'land',
      enabled: true,
      sort_order: 1
    },
    {
      code: 'villa',
      property_class: 'residential',
      enabled: true,
      sort_order: 2
    },
    {
      code: 'apartment',
      property_class: 'residential',
      enabled: true,
      sort_order: 1
    },
    {
      code: 'disabled_home',
      property_class: 'residential',
      enabled: false,
      sort_order: 0
    },
    {
      code: 'office',
      property_class: 'commercial',
      enabled: true,
      sort_order: 1
    }
  ]
});

assert.deepStrictEqual(
  taxonomyService
    .listEnabledAuthoringSubtypes(taxonomy)
    .map(item => item.code),
  ['apartment', 'villa', 'land'],
  'Authoring subtype order must follow class authority then subtype authority'
);

assert.strictEqual(
  taxonomyService.getDefaultSubtype(
    taxonomy,
    'residential'
  ),
  'apartment',
  'Residential default must still come from canonical subtype sort order'
);


// ------------------------------------------------------------
// Build composition
// ------------------------------------------------------------

has(
  adminBuild,
  /readWeb\(['"]services\/property-taxonomy\.js['"]\)/,
  'Admin build must read shared Property taxonomy service'
);

has(
  partnerBuild,
  /readWeb\(['"]services\/property-taxonomy\.js['"]\)/,
  'Partner build must read shared Property taxonomy service'
);

has(
  adminBuild,
  /supabaseClient \+ ['"]\\n['"][\s\S]*?propertyTaxonomyService \+ ['"]\\n['"]/,
  'Admin bundle must load taxonomy service after Supabase client'
);

has(
  partnerBuild,
  /supabaseClient \+ ['"]\\n['"][\s\S]*?propertyTaxonomyService \+ ['"]\\n['"]/,
  'Partner bundle must load taxonomy service after Supabase client'
);


// ------------------------------------------------------------
// Admin authoring
// ------------------------------------------------------------

has(
  adminApp,
  /getAuthoringTaxonomyCached/,
  'Admin must cache the canonical authoring taxonomy'
);

has(
  adminApp,
  /listEnabledAuthoringSubtypes/,
  'Admin new Property choices must derive from canonical taxonomy'
);

has(
  adminApp,
  /renderPropertySubtypeOptions/,
  'Admin Property subtype selects must be generated dynamically'
);

has(
  adminApp,
  /current — unavailable for new authoring/,
  'Admin edit must preserve a disabled historical current subtype'
);

has(
  adminApp,
  /getDefaultSubtype\([\s\S]*?['"]residential['"]/,
  'Admin unit default must derive from Residential taxonomy authority'
);

lacks(
  adminApp,
  /<option\s+value=['"](?:apartment|villa|land|commercial)['"]/i,
  'Admin must contain no hard-coded Property subtype options'
);

lacks(
  adminApp,
  /subtype\s*:\s*['"]apartment['"]/,
  'Admin must contain no magic apartment authoring default'
);


// ------------------------------------------------------------
// Partner authoring
// ------------------------------------------------------------

has(
  partnerApp,
  /getAuthoringTaxonomyCached/,
  'Partner must consume cached canonical authoring taxonomy'
);

has(
  partnerApp,
  /getDefaultSubtype\([\s\S]*?['"]residential['"]/,
  'Partner one-click Property/unit creation must derive Residential default'
);

lacks(
  partnerApp,
  /subtype\s*:\s*['"]apartment['"]/,
  'Partner must contain no magic apartment authoring default'
);

lacks(
  partnerApp,
  /<option\s+value=['"]commercial['"]/i,
  'Partner must never manufacture Commercial as a subtype'
);


// ------------------------------------------------------------
// Authority boundaries
// ------------------------------------------------------------

lacks(
  adminApp + '\n' + partnerApp,
  /\.from\(\s*['"]property_classes['"]\s*\)/i,
  'Authoring apps must not query Property classes directly'
);

lacks(
  adminApp + '\n' + partnerApp,
  /\.from\(\s*['"]property_subtypes['"]\s*\)/i,
  'Authoring apps must not query Property subtypes directly'
);

lacks(
  adminApp + '\n' + partnerApp,
  /property_class\s*:/i,
  'Browser authoring must not send Property class as mutation authority'
);

assert.strictEqual(
  packageJson.scripts[
    'test:property-taxonomy-authoring-consumption'
  ],
  'node tests/unit/property-taxonomy-authoring-consumption.test.js',
  'R2.3B dedicated test must be registered'
);

assert.ok(
  packageJson.scripts.check.includes(
    'npm run test:property-taxonomy-authoring-consumption'
  ),
  'R2.3B regression must participate in full check'
);

console.log(
  'PASS: Phase 4R R2.3B Property taxonomy authoring consumption — Admin/Partner derive subtype choices and defaults from canonical taxonomy'
);
