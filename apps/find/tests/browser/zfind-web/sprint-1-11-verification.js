'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../..');

const viewmodels = fs.readFileSync(
  path.join(ROOT, 'apps/zfind-web/src/viewmodels.js'),
  'utf8'
);

const properties = fs.readFileSync(
  path.join(ROOT, 'apps/zfind-web/src/services/properties.js'),
  'utf8'
);

const app = fs.readFileSync(
  path.join(ROOT, 'apps/zfind-web/src/app.js'),
  'utf8'
);

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);

  assert(
    start >= 0,
    `Missing start marker: ${startMarker}`
  );

  const end = source.indexOf(endMarker, start);

  assert(
    end > start,
    `Missing end marker after: ${startMarker}`
  );

  return source.slice(start, end);
}

const propertyMapper = section(
  viewmodels,
  'function mapSupabasePropertyRowToDetailViewModel',
  '/** Sprint 1.4:'
);

const landMapper = section(
  viewmodels,
  'function mapSupabaseLandRowToDetailViewModel',
  '/** Loads a published Land record'
);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ❌ ${name}`);
    console.error(`     ${error.message}`);
  }
}

console.log('\n=== Z FIND — SPRINT 1.11 VERIFICATION ===\n');

test('Property detail no longer emits invented Energy Rating', () => {
  assert(
    !propertyMapper.includes("labelKey: 'property.energyRating'"),
    'Property mapper must not emit an energy rating without source-backed data'
  );
});

test('Property detail no longer emits invented Bathrooms', () => {
  assert(
    !propertyMapper.includes("labelKey: 'property.bathrooms'"),
    'Property mapper must not emit bathroom count without source-backed data'
  );
});

test('Property detail no longer emits invented Parking', () => {
  assert(
    !propertyMapper.includes("labelKey: 'property.parking'"),
    'Property mapper must not emit parking count without source-backed data'
  );
});

test('Property detail no longer emits invented Year Built', () => {
  assert(
    !propertyMapper.includes("labelKey: 'property.yearBuilt'"),
    'Property mapper must not emit year built without source-backed data'
  );
});

test('Property facts still use real typology', () => {
  assert(
    propertyMapper.includes(
      "{ labelKey: 'property.typology', value: row.typology }"
    ),
    'Real typology must remain source-backed from row.typology'
  );
});

test('Property facts still use real gross area', () => {
  assert(
    propertyMapper.includes(
      "{ labelKey: 'property.grossArea', value: fmtNumber(row.area_sqm, lang) + ' m²' }"
    ),
    'Real gross area must remain source-backed from row.area_sqm'
  );
});

test('Missing typology is omitted rather than rendered as a fake fact', () => {
  assert(
    propertyMapper.includes(
      "row.typology != null && row.typology !== ''"
    ),
    'Typology must be null-safe'
  );
});

test('Missing area is omitted rather than formatted as a fake fact', () => {
  assert(
    propertyMapper.includes('row.area_sqm != null'),
    'Gross area must be null-safe'
  );
});

test('Property facts discard absent values', () => {
  assert(
    propertyMapper.includes('].filter(Boolean)'),
    'Absent factual attributes must be filtered from the public facts array'
  );
});

test('Public Property service actually reads typology and area_sqm', () => {
  assert(
    /id,\s*subtype,\s*typology,\s*area_sqm,\s*plot_area_sqm,\s*floor/.test(
      properties
    ),
    'Public Property query must continue reading the fields used by public facts'
  );
});

test('No unsupported factual columns were invented in the Property service', () => {
  for (const field of [
    'energy_rating',
    'bathrooms',
    'parking',
    'year_built'
  ]) {
    assert(
      !new RegExp(`\\b${field}\\b`).test(properties),
      `Sprint 1.11 must not invent persistence field ${field}`
    );
  }
});

test('Property UI continues to render facts generically from vm.facts', () => {
  assert(
    app.includes('vm.facts.map'),
    'Public UI must continue consuming the view-model facts array'
  );
});

test('Land continues to replace Property facts with its own source-backed area fact', () => {
  assert(
    landMapper.includes('viewModel.facts = factualAreaSqm != null'),
    'Land must continue using its own factual area projection'
  );

  assert(
    landMapper.includes(
      "labelKey: hasPlotArea ? 'land.plotArea' : 'property.grossArea'"
    ),
    'Land fact must remain based on real plot_area_sqm / area_sqm'
  );
});

test('Sprint does not convert Verification into Trust', () => {
  assert(
    propertyMapper.includes('trust: null'),
    'Trust remains intentionally unimplemented on public Property detail'
  );
});

test('Sprint does not invent Market Intelligence', () => {
  assert(
    propertyMapper.includes(
      'market: { avgPriceZone: null, priceThis: null, trend: null, comparables: null }'
    ),
    'Market Intelligence must remain absent until evidence-backed public data exists'
  );
});

console.log(`\nSprint 1.11: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
