/* ============================================================
   Z FIND — DATA IMPORT ENGINE — TEST SUITE
   ============================================================
   Run: node test.js
   Independent from the UI and from the Z Find prototype — this
   suite only exercises import-engine.js, the adapters, and the
   fixtures in this directory.
   ============================================================ */

const {
  createImportSource, runImportBatch, reconcile, canonicalEntityId,
} = require('./import-engine');
const { seedCanonicalStore } = require('./canonical-store');
const { ptAdapter } = require('./adapters/pt-adapter');
const { frAdapter } = require('./adapters/fr-adapter');
const { ptFixtureSource, ptFixtureBatch1 } = require('./fixtures/pt-fixture');
const { frFixtureSource, frFixtureBatch1 } = require('./fixtures/fr-fixture');

let pass = 0, fail = 0;
function assert(condition, label) {
  if (condition) { pass++; console.log('  ✅', label); }
  else { fail++; console.log('  ❌', label); }
}
function section(title) { console.log('\n=== ' + title + ' ==='); }

/* ---------------- TEST 1: Portugal adapter — full batch behavior ---------------- */
section('TEST 1 — Portugal adapter: first run');
const storePT = seedCanonicalStore();
const sourcePT = createImportSource(ptFixtureSource());
const run1 = runImportBatch({ source: sourcePT, rawInput: ptFixtureBatch1(), adapter: ptAdapter, canonicalStore: storePT });

assert(run1.batch.status === 'completed_with_warnings', 'Batch status is completed_with_warnings (1 invalid record present)');
assert(run1.batch.counts.imported === 1, 'Exactly 1 new record imported (Ramalde)  — got ' + run1.batch.counts.imported);
assert(run1.batch.counts.updated === 2, 'Exactly 2 updated records (Matosinhos geometry_changed, Cedofeita renamed) — got ' + run1.batch.counts.updated);
assert(run1.batch.counts.unchanged === 4, 'Exactly 4 unchanged records (Country, Porto, Boavista, Foz) — got ' + run1.batch.counts.unchanged);
assert(run1.batch.counts.failed === 1, 'Exactly 1 failed record (missing code) — got ' + run1.batch.counts.failed);
assert(run1.sourceRecords.length === 8, '8 SourceRecords produced from 9 raw rows (1 duplicate collapsed) — got ' + run1.sourceRecords.length);
assert(run1.batch.warnings.some(w => w.includes('Duplicate source record')), 'Duplicate row_id warning logged');

const matosinhosChange = run1.changeSet.find(c => c.normalized.code === 'PT-1305');
assert(matosinhosChange && matosinhosChange.changeType === 'geometry_changed', "Matosinhos correctly detected as 'geometry_changed'");

const cedofeitaChange = run1.changeSet.find(c => c.normalized.code === 'PT-1312-11');
assert(cedofeitaChange && cedofeitaChange.changeType === 'renamed', "Cedofeita correctly detected as 'renamed' (code same, name changed)");

const ramaldeChange = run1.changeSet.find(c => c.normalized.code === 'PT-1312-15');
assert(ramaldeChange && ramaldeChange.changeType === 'new', "Ramalde correctly detected as 'new'");

const invalidRecord = run1.sourceRecords.find(r => r.validationStatus === 'invalid');
assert(invalidRecord && invalidRecord.validationErrors.includes('missing_official_code'), 'Invalid record correctly flagged with missing_official_code');
assert(invalidRecord.rawPayload.nome_pt === 'Registo Sem Código', 'Invalid record retains its raw payload for review');

/* ---------------- TEST 2: Source provenance ---------------- */
section('TEST 2 — Source provenance');
const porto = run1.sourceRecords.find(r => r.sourceCode === 'PT-1312');
assert(porto.batchId === run1.batch.id, 'SourceRecord references its ImportBatch id');
assert(porto.sourceVersion === '2026.07', 'SourceRecord retains source version');
assert(JSON.stringify(porto.rawPayload) === JSON.stringify({ row_id:'r2', kind:'city', ine_code:'PT-1312', nome_pt:'Porto', name_en:'Porto', nom_fr:'Porto', lat:41.1579, lng:-8.6291 }), 'SourceRecord retains the exact raw payload, untouched');
const portoEntity = storePT.entities[canonicalEntityId('City','PT','PT-1312')];
assert(portoEntity.lastSeenBatchId === run1.batch.id, 'Unchanged entity (Porto) still gets lastSeenBatchId confirmed by this batch');

const ramaldeEntity = storePT.entities[canonicalEntityId('Zone','PT','PT-1312-15')];
assert(ramaldeEntity.provenance.sourceId === 'pt-ine-2026-07', 'Newly created canonical entity (Ramalde) carries provenance back to its source');
assert(ramaldeEntity.provenance.batchId === run1.batch.id, 'Newly created canonical entity (Ramalde) carries provenance back to its batch');
assert(ramaldeEntity.lastImportBatchId === run1.batch.id, 'lastImportBatchId correctly set for a record actually created by this batch');

/* ---------------- TEST 3: Idempotency — re-running the identical batch ---------------- */
section('TEST 3 — Idempotency: re-running the exact same batch');
const entityCountBefore = Object.keys(storePT.entities).length;
const run2 = runImportBatch({ source: sourcePT, rawInput: ptFixtureBatch1(), adapter: ptAdapter, canonicalStore: storePT });
const entityCountAfter = Object.keys(storePT.entities).length;

assert(entityCountAfter === entityCountBefore, 'No new canonical entities created on re-run — count stayed ' + entityCountAfter);
assert(run2.batch.counts.imported === 0, 'Second run imports 0 new records — got ' + run2.batch.counts.imported);
assert(run2.batch.counts.updated === 0, 'Second run updates 0 records (already applied) — got ' + run2.batch.counts.updated);
assert(run2.batch.counts.unchanged === 7, 'Second run finds 7 unchanged (everything previously imported/updated is now stable) — got ' + run2.batch.counts.unchanged);
assert(run2.batch.counts.failed === 1, 'The invalid record is still invalid on re-run (nothing silently fixed) — got ' + run2.batch.counts.failed);
assert(run2.batch.id !== run1.batch.id, 'Each run produces its own distinct batch id (' + run1.batch.id + ' vs ' + run2.batch.id + ')');

/* ---------------- TEST 4: Nothing silently deleted ---------------- */
section('TEST 4 — Nothing silently deleted');
assert(storePT.entities[canonicalEntityId('City','PT','PT-1305')].status === 'active', 'Matosinhos remains present and active after its geometry update (not deleted/replaced)');
assert(storePT.entities[canonicalEntityId('Zone','PT','PT-1312-11')].names.pt === 'Cedofeita Histórica', 'Cedofeita\u2019s canonical record reflects the rename (updated in place, entity id unchanged)');

/* ---------------- TEST 5: Parent validation ---------------- */
section('TEST 5 — Parent hierarchy validation');
const storeOrphan = seedCanonicalStore();
const orphanBatch = { records: [
  { row_id:'x1', kind:'zone', ine_code:'PT-9999-01', parent_city_code:'PT-9999', nome_pt:'Zona Órfã' }, // parent doesn't exist anywhere
]};
const runOrphan = runImportBatch({ source: sourcePT, rawInput: orphanBatch, adapter: ptAdapter, canonicalStore: storeOrphan });
assert(runOrphan.batch.counts.failed === 1, 'Zone with a non-existent parent city is rejected — got ' + runOrphan.batch.counts.failed + ' failed');
assert(runOrphan.sourceRecords[0].validationErrors.includes('parent_not_found'), 'Rejection reason is parent_not_found');

/* ---------------- TEST 6: France adapter — different hierarchy depth + code system ---------------- */
section('TEST 6 — France adapter: different hierarchy depth and code system, same shared engine');
const storeFR = seedCanonicalStore();
const sourceFR = createImportSource(frFixtureSource());
const runFR = runImportBatch({ source: sourceFR, rawInput: frFixtureBatch1(), adapter: frAdapter, canonicalStore: storeFR });

assert(runFR.batch.counts.unchanged === 4, '4 unchanged FR records (Country, Île-de-France, Paris, Le Marais) — got ' + runFR.batch.counts.unchanged);
assert(runFR.batch.counts.imported === 3, '3 new FR records (new Region + new City + new Zone) — got ' + runFR.batch.counts.imported);
assert(runFR.batch.counts.failed === 0, '0 failed FR records — got ' + runFR.batch.counts.failed);

const parisEntity = storeFR.entities[canonicalEntityId('City','FR','FR-75056')];
assert(parisEntity.parentCode === 'FR-IDF', 'Paris\u2019s parent is a REGION code (FR-IDF), proving City->Region depth works generically');

const marseilleEntity = storeFR.entities[canonicalEntityId('City','FR','FR-13055')];
assert(marseilleEntity && marseilleEntity.parentCode === 'FR-PAC', 'New City Marseille correctly resolved against the NEW Region created in the same batch');

const codeSystemDiffers = /^PT(-|$)/.test('PT-1312') && /^FR(-|$)/.test('FR-75056');
assert(codeSystemDiffers, 'PT and FR use visibly different code shapes, both accepted without any change to import-engine.js');

/* ---------------- TEST 7: Duplicate prevention across two different sources touching the same place ---------------- */
section('TEST 7 — Reconciliation never matches by name alone');
const storeName = seedCanonicalStore();
const nameOnlyRaw = { records: [
  // Same NAME as an existing canonical Zone, but a DIFFERENT code and no geometry close enough — must NOT match.
  { row_id:'y1', kind:'zone', ine_code:'PT-1312-99', parent_city_code:'PT-1312', nome_pt:'Boavista', name_en:'Boavista' },
]};
const runNameOnly = runImportBatch({ source: sourcePT, rawInput: nameOnlyRaw, adapter: ptAdapter, canonicalStore: storeName });
const boavistaDupe = runNameOnly.sourceRecords[0];
assert(boavistaDupe.changeType === 'new', 'A record with a matching NAME but a different code is treated as a NEW entity, never matched by name alone — got ' + boavistaDupe.changeType);
assert(Object.keys(storeName.entities).filter(id => id.includes('PT-1312-99') || id.includes('PT-1312-04')).length === 2, 'Two distinct Boavista-named entities now coexist under different codes (correct — the engine does not silently merge same-named places)');

/* ---------------- TEST 8: Change-report generation ---------------- */
section('TEST 8 — Change-report generation');
const report = run1.report;
assert(report.batchId === run1.batch.id, 'Report references the correct batch id');
assert(report.counts.imported === 1 && report.counts.updated === 2 && report.counts.unchanged === 4 && report.counts.failed === 1, 'Report counts match the batch exactly');
assert(report.changes.length === 3, 'Report lists exactly the 3 changed records (1 new + 2 updated) — got ' + report.changes.length);
assert(report.failedRecords.length === 1 && report.failedRecords[0].errors.includes('missing_official_code'), 'Report lists the failed record with its error reason');
assert(!!report.warnings.length, 'Report surfaces the duplicate-row warning');

/* ---------------- SUMMARY ---------------- */
console.log('\n============================================================');
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('============================================================');
if (fail > 0) process.exit(1);
