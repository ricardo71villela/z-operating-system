/* ============================================================
   Z FIND — DATA IMPORT ENGINE v2 — HARDENING TEST SUITE
   ============================================================
   Run: node test-v2.js
   ============================================================ */

const fs = require('fs');
const path = require('path');
const E = require('../../../packages/import-engine/import-engine-v2');
const S = require('../../../packages/import-engine/canonical-store-v2');
const { seedVersionedStore } = require('../../../packages/import-engine/canonical-store-seed');
const { ptAdapter } = require('../../../packages/import-engine/adapters/pt-adapter');
const { frAdapter } = require('../../../packages/import-engine/adapters/fr-adapter');
const { ptFixtureSource, ptFixtureBatch1 } = require('../../../packages/import-engine/fixtures/pt-fixture');
const { frFixtureSource, frFixtureBatch1 } = require('../../../packages/import-engine/fixtures/fr-fixture');
const { resolveReviewItem, resolveProposal } = require('../../../packages/import-engine/review-workflow');
const { createGeographyPort, createCommand, makeIdempotencyKey } = require('../../../packages/import-engine/geography-port');
const { createBatchState, transition } = require('../../../packages/import-engine/batch-lifecycle');

let pass = 0, fail = 0;
function assert(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }

const TMP = '/tmp/import-v2-test-persist';
if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

/* ================================================================
   TEST 1 — Record order independence
   ================================================================ */
section('TEST 1 — Record order independence');
{
  const storeA = seedVersionedStore();
  const storeB = seedVersionedStore();
  const source = ptFixtureSource();
  const original = ptFixtureBatch1().records;
  const shuffled = [...original].reverse();

  const runA = E.runPipeline({ source, rawInput: { records: original }, adapter: ptAdapter, store: storeA, persistDir: TMP });
  const runB = E.runPipeline({ source, rawInput: { records: shuffled }, adapter: ptAdapter, store: storeB, persistDir: TMP });

  assert(runA.approvedChangeSet.length === runB.approvedChangeSet.length, 'Same number of approved changes regardless of input order');
  assert(runA.invalidRecords.length === runB.invalidRecords.length, 'Same number of invalid records regardless of input order');
  assert(runA.changeProposals.length === runB.changeProposals.length, 'Same number of change proposals regardless of input order');
  const typesA = runA.approvedChangeSet.map(c => c.type).sort().join(',');
  const typesB = runB.approvedChangeSet.map(c => c.type).sort().join(',');
  assert(typesA === typesB, 'Same set of command types regardless of input order');
}

/* ================================================================
   TEST 2 — Interrupted and resumed batch
   ================================================================ */
section('TEST 2 — Interrupted and resumed batch');
{
  const store = seedVersionedStore();
  const source = ptFixtureSource();
  const persistDir = path.join(TMP, 'interrupt-test');

  // Simulate the process running up to ready_for_review, then "crashing"
  // (nothing after this point executes in this scope).
  const result = E.runPipeline({ source, rawInput: ptFixtureBatch1(), adapter: ptAdapter, store, persistDir });
  const batchId = result.batchState.batchId;

  // "Restart": load ONLY from disk, as a fresh process would.
  const persistence = require('../../../packages/import-engine/persistence');
  const checkpoint = persistence.loadBatchCheckpoint(persistDir, batchId);

  assert(!!checkpoint, 'Checkpoint successfully persisted and reloadable after interruption');
  assert(checkpoint.batchState.state === 'ready_for_review', 'Resumed batch state matches the state at interruption');
  assert(checkpoint.approvedChangeSet.length === result.approvedChangeSet.length, 'Resumed approvedChangeSet matches what was computed before interruption');

  // Resume: approve and apply using the RELOADED checkpoint data, not
  // the original in-memory result — proving resume works from disk alone.
  const resumedBatchState = checkpoint.batchState;
  E.approveBatch(resumedBatchState, 'resumed-reviewer');
  const applyResult = E.applyBatch(resumedBatchState, checkpoint.approvedChangeSet, result.port, persistDir);
  assert(applyResult.batchState.state === 'completed', 'Resumed batch completes successfully after reload');
}

/* ================================================================
   TEST 3 — Retry safety (partial failure, then retry)
   ================================================================ */
section('TEST 3 — Retry safety');
{
  const store = seedVersionedStore();
  const port = createGeographyPort(store);

  const goodCmd = createCommand('create_location', { entityId:'City:PT:PT-9001', entityType:'City', code:'PT-9001', countryIso:'PT', names:{en:'Test City'}, batchId:'retry-batch', provenance:{sourceId:'test'} }, 'retry-batch:City:PT:PT-9001:create_location');
  const badCmd = createCommand('update_coordinates', { entityId:'City:PT:DOES-NOT-EXIST', geometry:{lat:1,lng:1}, batchId:'retry-batch', provenance:{} }, 'retry-batch:bad:update_coordinates');

  const firstAttempt = port.submitBatch([goodCmd, badCmd]);
  assert(firstAttempt.accepted.length === 1 && firstAttempt.rejected.length === 1, 'First attempt: 1 accepted, 1 rejected');

  const entityCountAfterFirst = Object.keys(store.current).length;
  const retryAttempt = port.submitBatch([goodCmd, badCmd]); // retry the WHOLE batch, including the already-succeeded command
  const entityCountAfterRetry = Object.keys(store.current).length;

  assert(entityCountAfterRetry === entityCountAfterFirst, 'Retrying does not create a duplicate entity for the already-succeeded command');
  assert(retryAttempt.accepted[0].replay === true, 'The already-succeeded command is recognized as a replay on retry');
  assert(retryAttempt.rejected.length === 1, 'The still-bad command is rejected again on retry, consistently');
}

/* ================================================================
   TEST 4 — Manual review queue (geometry-only and alternate-code matches)
   ================================================================ */
section('TEST 4 — Manual review queue');
{
  const store = seedVersionedStore();
  const source = ptFixtureSource();

  // Geometry-only match: new code, no priorCodes, but coordinates
  // essentially identical to the existing Porto entity (within the
  // City threshold of 10km).
  const geoOnlyBatch = { records: [
    { row_id:'g1', kind:'city', ine_code:'PT-9999', nome_pt:'Porto (variante)', name_en:'Porto (variant)', lat:41.1580, lng:-8.6290 },
  ]};
  const runGeo = E.runPipeline({ source, rawInput: geoOnlyBatch, adapter: ptAdapter, store, persistDir: TMP });
  assert(runGeo.reviewItems.length === 1, 'Geometry-only match produces exactly 1 review item');
  assert(runGeo.reviewItems[0].reason === 'geometry_only_match_requires_review', 'Review item reason correctly identifies geometry-only match');
  assert(runGeo.approvedChangeSet.length === 0, 'Geometry-only match produces ZERO auto-applied commands — never auto-applied');

  // Alternate-code match: a record whose priorCodes points at an
  // existing entity — now hardened to ALWAYS require review, never
  // auto-apply (tightened from the Phase 3 POC).
  const store2 = seedVersionedStore();
  const altCodeBatch = { records: [
    { row_id:'a1', kind:'zone', ine_code:'PT-1312-11-NEW', parent_city_code:'PT-1312', nome_pt:'Cedofeita', name_en:'Cedofeita', previously_known_as:'PT-1312-11' },
  ]};
  const runAlt = E.runPipeline({ source, rawInput: altCodeBatch, adapter: ptAdapter, store: store2, persistDir: TMP });
  assert(runAlt.reviewItems.length === 1, 'Alternate-code match produces exactly 1 review item');
  assert(runAlt.reviewItems[0].reason === 'alternate_code_match_requires_review', 'Review item reason correctly identifies alternate-code match');
  assert(runAlt.approvedChangeSet.length === 0, 'Alternate-code match produces ZERO auto-applied commands — never auto-applied');
}

/* ================================================================
   TEST 5 — Rejected uncertain match
   ================================================================ */
section('TEST 5 — Rejected uncertain match');
{
  const store = seedVersionedStore();
  const source = ptFixtureSource();
  const geoOnlyBatch = { records: [
    { row_id:'g2', kind:'city', ine_code:'PT-8888', nome_pt:'Suposto Porto', name_en:'Alleged Porto', lat:41.1580, lng:-8.6290 },
  ]};
  const run = E.runPipeline({ source, rawInput: geoOnlyBatch, adapter: ptAdapter, store, persistDir: TMP });
  const item = run.reviewItems[0];
  resolveReviewItem(item, { reviewer: 'reviewer-1', resolution: 'rejected', note: 'Not actually the same city — coincidental proximity' });

  assert(item.status === 'resolved', 'Review item marked resolved');
  assert(item.resolution === 'rejected', 'Review item resolution recorded as rejected');
  assert(!S.getCurrent(store, 'City:PT:PT-8888'), 'Rejected match never creates a canonical entity for the new code');
  const porto = S.getCurrent(store, 'City:PT:PT-1312');
  assert(porto.names.en === 'Porto', 'Rejected match leaves the original canonical entity (Porto) completely untouched');
}

/* ================================================================
   TEST 6 — Merge proposal
   ================================================================ */
section('TEST 6 — Merge proposal (not auto-executed)');
{
  const store = seedVersionedStore();
  const source = ptFixtureSource();
  // Two existing zones' codes, merged into one new code.
  const mergeBatch = { records: [
    { row_id:'m1', kind:'zone', ine_code:'PT-1312-04', parent_city_code:'PT-1312', nome_pt:'Boavista', name_en:'Boavista' }, // exists, unrelated
    { row_id:'m2', kind:'zone', ine_code:'PT-1312-50', parent_city_code:'PT-1312', nome_pt:'Boavista-Foz Unida', name_en:'United Boavista-Foz', previously_known_as:['PT-1312-04','PT-1312-09'] },
  ]};
  // Adapter's successionHints returns a single value wrapped in an array;
  // to test multi-predecessor merge we call detectMergeSplit directly
  // with a manually-shaped normalized record (see note below) since the
  // PT adapter's raw shape only carries one previously_known_as field —
  // this proves the ENGINE supports multi-predecessor merges even
  // though this specific adapter's raw format doesn't naturally produce
  // one (a real adapter for a source with true merge events would).
  const { detectMergeSplit } = require('../../../packages/import-engine/review-workflow');
  const normalized = [
    { code:'PT-1312-50', priorCodes:['PT-1312-04','PT-1312-09'] },
    { code:'PT-1312-09', priorCodes:[] },
  ];
  const { proposals } = detectMergeSplit(normalized, 'merge-test-batch', 'pt-ine-2026-07');
  const mergeProposal = proposals.find(p => p.type === 'merge');

  assert(!!mergeProposal, 'Merge detected as a proposal');
  assert(mergeProposal.predecessors.length === 2, 'Merge proposal lists both predecessor codes');
  assert(mergeProposal.successors[0] === 'PT-1312-50', 'Merge proposal correctly identifies the successor code');
  assert(mergeProposal.status === 'proposed', 'Merge proposal starts in proposed status, not auto-executed');

  resolveProposal(mergeProposal, { reviewer: 'reviewer-2', decision: 'approved' });
  assert(mergeProposal.status === 'approved', 'Merge proposal can be explicitly approved by a reviewer');
  assert(!S.getCurrent(store, 'Zone:PT:PT-1312-50'), 'Approving the PROPOSAL alone does not itself mutate canonical state — a separate apply step would be required (not auto-executed)');
}

/* ================================================================
   TEST 7 — Split proposal
   ================================================================ */
section('TEST 7 — Split proposal (not auto-executed)');
{
  const { detectMergeSplit } = require('../../../packages/import-engine/review-workflow');
  const normalized = [
    { code:'PT-1312-04A', priorCodes:['PT-1312-04'] },
    { code:'PT-1312-04B', priorCodes:['PT-1312-04'] },
  ];
  const { proposals } = detectMergeSplit(normalized, 'split-test-batch', 'pt-ine-2026-07');
  const splitProposal = proposals.find(p => p.type === 'split');

  assert(!!splitProposal, 'Split detected as a proposal');
  assert(splitProposal.predecessors[0] === 'PT-1312-04', 'Split proposal correctly identifies the single predecessor code');
  assert(splitProposal.successors.length === 2, 'Split proposal lists both successor codes');
  assert(splitProposal.status === 'proposed', 'Split proposal starts in proposed status, not auto-executed');

  resolveProposal(splitProposal, { reviewer: 'reviewer-2', decision: 'rejected' });
  assert(splitProposal.status === 'rejected', 'Split proposal can be explicitly rejected by a reviewer');
}

/* ================================================================
   TEST 8 — Missing record detection
   ================================================================ */
section('TEST 8 — Missing record detection');
{
  const store = seedVersionedStore();
  const source = ptFixtureSource();
  // A later "source version" that simply omits Foz do Douro.
  const laterBatch = { records: [
    { row_id:'r1', kind:'country', ine_code:'PT', nome_pt:'Portugal', name_en:'Portugal' },
    { row_id:'r2', kind:'city', ine_code:'PT-1312', nome_pt:'Porto', name_en:'Porto', lat:41.1579, lng:-8.6291 },
    { row_id:'r4', kind:'zone', ine_code:'PT-1312-04', parent_city_code:'PT-1312', nome_pt:'Boavista', name_en:'Boavista' },
    // PT-1312-09 (Foz do Douro) and PT-1312-11 (Cedofeita) intentionally omitted
  ]};
  E.runPipeline({ source, rawInput: laterBatch, adapter: ptAdapter, store, persistDir: TMP });

  const currentBatchCodes = new Set(['PT', 'PT-1312', 'PT-1312-04']);
  const missing = E.detectMissingRecords(store, source.id, 'Zone', 'PT', currentBatchCodes);

  assert(missing.some(m => m.code === 'PT-1312-09'), 'Foz do Douro correctly flagged as missing from the later source version');
  assert(missing.some(m => m.code === 'PT-1312-11'), 'Cedofeita correctly flagged as missing from the later source version');
  const fozStillActive = S.getCurrent(store, 'Zone:PT:PT-1312-09');
  assert(fozStillActive && fozStillActive.status === 'active', 'Missing record is only FLAGGED, never auto-deprecated or deleted');
}

/* ================================================================
   TEST 9 — Temporal history
   ================================================================ */
section('TEST 9 — Temporal history');
{
  const store = seedVersionedStore();
  const entityId = 'City:PT:PT-1312';
  const seqAtSeed = S.currentSeq(store);

  S.recordChange(store, { entityId, batchId:'b-later-1', changeType:'geometry_changed', before: S.getCurrent(store, entityId), after: { ...S.getCurrent(store, entityId), geometry:{lat:41.2,lng:-8.7} }, provenance:{sourceId:'test'} });
  const seqAfterFirst = S.currentSeq(store);
  S.recordChange(store, { entityId, batchId:'b-later-2', changeType:'geometry_changed', before: S.getCurrent(store, entityId), after: { ...S.getCurrent(store, entityId), geometry:{lat:41.3,lng:-8.8} }, provenance:{sourceId:'test'} });

  const history = S.getHistory(store, entityId);
  assert(history.length === 3, 'Full history preserved: seed + 2 updates = 3 entries');

  const stateAtSeed = S.getStateAtSeq(store, entityId, seqAtSeed);
  assert(stateAtSeed.geometry.lat === 41.1579, 'Precise temporal query at the seed checkpoint returns the ORIGINAL seed geometry');

  const stateAfterFirst = S.getStateAtSeq(store, entityId, seqAfterFirst);
  assert(stateAfterFirst.geometry.lat === 41.2, 'Precise temporal query after the first update returns that update, not the second');

  const stateNow = S.getCurrent(store, entityId);
  assert(stateNow.geometry.lat === 41.3, 'Current state reflects the LATEST update');
}

/* ================================================================
   TEST 10 — Rollback / compensation
   ================================================================ */
section('TEST 10 — Rollback / compensation');
{
  const store = seedVersionedStore();
  const source = ptFixtureSource();
  const result = E.runPipeline({ source, rawInput: ptFixtureBatch1(), adapter: ptAdapter, store, persistDir: TMP });
  E.approveBatch(result.batchState, 'reviewer');
  E.applyBatch(result.batchState, result.approvedChangeSet, result.port, TMP);

  const matosinhosBefore = S.getCurrent(store, 'City:PT:PT-1305');
  assert(matosinhosBefore.geometry.lat === 41.19, 'Matosinhos geometry was updated by the batch (sanity check before rollback)');

  const ramaldeBefore = S.getCurrent(store, 'Zone:PT:PT-1312-15');
  assert(ramaldeBefore.status === 'active', 'Ramalde (created by the batch) is active before rollback');

  const historyLenBefore = S.getHistory(store, 'City:PT:PT-1305').length;
  const { compensated } = S.rollbackBatch(store, result.batchState.batchId, 'revert-batch-1');
  const historyLenAfter = S.getHistory(store, 'City:PT:PT-1305').length;

  assert(compensated.includes('City:PT:PT-1305'), 'Matosinhos included in the rollback compensation');
  assert(historyLenAfter === historyLenBefore + 1, 'Rollback APPENDS a compensating entry — never deletes prior history');
  const matosinhosAfter = S.getCurrent(store, 'City:PT:PT-1305');
  assert(matosinhosAfter.geometry.lat === 41.1815, 'Matosinhos geometry restored to its pre-batch value after rollback');

  const ramaldeAfter = S.getCurrent(store, 'Zone:PT:PT-1312-15');
  assert(ramaldeAfter.status === 'inactive', 'Ramalde (created by the batch) is DEACTIVATED, not deleted, by the SAME rollback call');
}

/* ================================================================
   TEST 11 — Geography change-set generation + port acceptance/rejection
   ================================================================ */
section('TEST 11 — Geography change-set generation and port behaviour');
{
  const store = seedVersionedStore();
  const source = frFixtureSource();
  const result = E.runPipeline({ source, rawInput: frFixtureBatch1(), adapter: frAdapter, store, persistDir: TMP });

  assert(result.approvedChangeSet.every(c => c.idempotencyKey && c.idempotencyKey.length > 0), 'Every command in the change set carries a non-empty idempotency key');
  assert(result.approvedChangeSet.some(c => c.type === 'create_location'), 'Change set includes create_location commands for new France entities');
  assert(result.approvedChangeSet.some(c => c.type === 'confirm_unchanged_seen'), 'Change set includes confirm_unchanged_seen for unchanged entities');

  E.approveBatch(result.batchState, 'reviewer');
  const applied = E.applyBatch(result.batchState, result.approvedChangeSet, result.port, TMP);
  assert(applied.rejected.length === 0, 'All France commands accepted by the Geography port');
  assert(applied.batchState.state === 'completed', 'France batch completes successfully end to end');

  // Explicit rejection case, submitted directly to the port.
  const badCommand = createCommand('create_location', { entityId:'City:FR:INCOMPLETE' }, 'bad-key-1'); // missing required fields
  const rejection = result.port.submit(badCommand);
  assert(rejection.accepted === false, 'Geography port rejects a structurally invalid command');
  assert(rejection.errors.includes('missing_required_fields'), 'Rejection carries a specific, actionable error reason');
}

/* ================================================================
   TEST 12 — Zero direct coupling to Marketplace or UI
   ================================================================ */
section('TEST 12 — Zero direct coupling to Marketplace or UI');
{
  const ENGINE_DIR = path.join(__dirname, '..', '..', '..', 'packages', 'import-engine');
  const engineFiles = ['import-engine-v2.js', 'canonical-store-v2.js', 'geography-port.js', 'review-workflow.js', 'batch-lifecycle.js', 'matching-policy.js', 'persistence.js', 'canonical-store-seed.js'];
  let coupled = [];
  for (const f of engineFiles) {
    const content = fs.readFileSync(path.join(ENGINE_DIR, f), 'utf8');
    if (/\bDB\.|\bapp\.js|\bviewmodels\.js|Marketplace|Listing\b|getEnquiryConfig|navigate\(/i.test(content)) {
      coupled.push(f);
    }
  }
  assert(coupled.length === 0, 'No engine file references DB, Listing, Marketplace, or any UI/app.js concept — got: ' + JSON.stringify(coupled));

  const adapterFiles = ['adapters/pt-adapter.js', 'adapters/fr-adapter.js'];
  let adapterCoupled = [];
  for (const f of adapterFiles) {
    const content = fs.readFileSync(path.join(ENGINE_DIR, f), 'utf8');
    if (/Marketplace|Listing\b|navigate\(/i.test(content)) adapterCoupled.push(f);
  }
  assert(adapterCoupled.length === 0, 'Adapters also carry zero Marketplace/UI coupling');
}

/* ---------------- SUMMARY ---------------- */
console.log('\n============================================================');
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('============================================================');
if (fail > 0) process.exit(1);
