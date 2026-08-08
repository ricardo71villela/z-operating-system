/* ============================================================
   Z FIND — PERSISTENCE (proof-of-concept durability)
   ============================================================
   Plain JSON files on disk. Explicitly not production
   infrastructure — per Phase 3.1 instructions, this is only what's
   needed to prove the engine can survive a process restart mid-batch
   and resume correctly, not a real storage architecture.
   ============================================================ */

const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function saveStore(dir, store) {
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, 'canonical-store.json'), JSON.stringify(store, null, 2));
}

function loadStore(dir) {
  const file = path.join(dir, 'canonical-store.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveBatchCheckpoint(dir, batchId, checkpoint) {
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, `batch-${sanitize(batchId)}.json`), JSON.stringify(checkpoint, null, 2));
}

function loadBatchCheckpoint(dir, batchId) {
  const file = path.join(dir, `batch-${sanitize(batchId)}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sanitize(id) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

module.exports = { saveStore, loadStore, saveBatchCheckpoint, loadBatchCheckpoint, ensureDir };
