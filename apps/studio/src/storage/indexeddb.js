// src/storage/indexeddb.js — persistência local do rascunho (fotos, textos,
// marca). Fica só no dispositivo da pessoa, nunca é enviado para lado
// nenhum. Extraído na Phase 2 (continuação) da auditoria de estabilização.

// ═══════════════════════════════════════════════════════════════
//  RASCUNHO LOCAL (IndexedDB) — guarda automaticamente as fotos
//  carregadas, textos e marca no browser, para não se perder nada
//  se a página for fechada ou recarregada por acidente. Fica só
//  neste dispositivo — nunca é enviado para lado nenhum.
// ═══════════════════════════════════════════════════════════════
const DRAFT_DB = 'zstudio-draft', DRAFT_STORE = 'kv';
function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB indisponível')); return; }
    const req = indexedDB.open(DRAFT_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DRAFT_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, 'readwrite');
    tx.objectStore(DRAFT_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, 'readonly');
    const req = tx.objectStore(DRAFT_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbDelete(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, 'readwrite');
    tx.objectStore(DRAFT_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

