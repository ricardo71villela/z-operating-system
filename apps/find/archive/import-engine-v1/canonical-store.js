/* ============================================================
   Z FIND — CANONICAL STORE (Data Import Engine proof of concept)
   ============================================================
   This is NOT the live GEOGRAPHY object from the Z Find prototype.
   It is a standalone snapshot, shaped identically (Country/Region/
   City/Zone), seeded with illustrative official codes so the import
   engine has something realistic to reconcile against.

   The codes below are ILLUSTRATIVE, invented for this proof of
   concept — they are shaped like real Portuguese (INE-style) and
   French (INSEE-style) administrative codes, but are not verified
   real government codes. No live external data is used, per Phase 3
   instructions.
   ============================================================ */

function seedCanonicalStore() {
  const entities = {};

  const put = (entityType, countryIso, code, names, parentCode, geometry) => {
    const id = `${entityType}:${countryIso}:${code}`;
    entities[id] = {
      entityId: id, entityType, code, countryIso, parentCode: parentCode || null,
      names, geometry: geometry || null, status: 'active',
      lastImportBatchId: null,
      provenance: { sourceId: 'seed', batchId: null, importedAt: '2026-01-01T00:00:00.000Z' },
    };
  };

  // ---- Portugal ----
  put('Country', 'PT', 'PT', { en:'Portugal', pt:'Portugal', fr:'Portugal' }, null);
  put('City', 'PT', 'PT-1312', { en:'Porto', pt:'Porto', fr:'Porto' }, 'PT', { lat:41.1579, lng:-8.6291 });
  put('City', 'PT', 'PT-1305', { en:'Matosinhos', pt:'Matosinhos', fr:'Matosinhos' }, 'PT', { lat:41.1815, lng:-8.6873 });
  put('Zone', 'PT', 'PT-1312-04', { en:'Boavista', pt:'Boavista', fr:'Boavista' }, 'PT-1312');
  put('Zone', 'PT', 'PT-1312-09', { en:'Foz do Douro', pt:'Foz do Douro', fr:'Foz do Douro' }, 'PT-1312');
  put('Zone', 'PT', 'PT-1312-11', { en:'Cedofeita', pt:'Cedofeita', fr:'Cedofeita' }, 'PT-1312');
  put('Zone', 'PT', 'PT-1305-02', { en:'Matosinhos Sul', pt:'Matosinhos Sul', fr:'Matosinhos Sul' }, 'PT-1305');

  // ---- France ----
  put('Country', 'FR', 'FR', { en:'France', pt:'França', fr:'France' }, null);
  put('Region', 'FR', 'FR-IDF', { en:'Île-de-France', pt:'Ilha de França', fr:'Île-de-France' }, 'FR');
  put('City', 'FR', 'FR-75056', { en:'Paris', pt:'Paris', fr:'Paris' }, 'FR-IDF', { lat:48.8566, lng:2.3522 });
  put('Zone', 'FR', 'FR-75056-03', { en:'Le Marais', pt:'Le Marais', fr:'Le Marais' }, 'FR-75056');
  put('Zone', 'FR', 'FR-75056-06', { en:'Saint-Germain-des-Prés', pt:'Saint-Germain-des-Prés', fr:'Saint-Germain-des-Prés' }, 'FR-75056');

  return { entities };
}

module.exports = { seedCanonicalStore };
