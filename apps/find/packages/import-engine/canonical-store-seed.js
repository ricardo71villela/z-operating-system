/* ============================================================
   Z FIND — CANONICAL STORE SEED (v2, versioned)
   ============================================================
   Same illustrative PT/FR data as the Phase 3 proof of concept,
   re-seeded into the versioned store so even the starting state has
   a proper history entry (batchId: 'seed') rather than being
   injected without provenance.
   ============================================================ */

const { createVersionedStore, recordChange } = require('./canonical-store-v2');

function seedVersionedStore() {
  const store = createVersionedStore();
  const put = (entityType, countryIso, code, names, parentCode, parentEntityType, geometry) => {
    const entityId = `${entityType}:${countryIso}:${code}`;
    recordChange(store, {
      entityId, batchId: 'seed', changeType: 'new', before: null,
      after: { entityId, entityType, code, countryIso, parentCode: parentCode || null, parentEntityType: parentEntityType || null, names, geometry: geometry || null, status: 'active' },
      provenance: { sourceId: 'seed', batchId: 'seed', importedAt: '2026-01-01T00:00:00.000Z' },
    });
  };

  // Portugal
  put('Country', 'PT', 'PT', { en:'Portugal', pt:'Portugal', fr:'Portugal' });
  put('City', 'PT', 'PT-1312', { en:'Porto', pt:'Porto', fr:'Porto' }, 'PT', 'Country', { lat:41.1579, lng:-8.6291 });
  put('City', 'PT', 'PT-1305', { en:'Matosinhos', pt:'Matosinhos', fr:'Matosinhos' }, 'PT', 'Country', { lat:41.1815, lng:-8.6873 });
  put('Zone', 'PT', 'PT-1312-04', { en:'Boavista', pt:'Boavista', fr:'Boavista' }, 'PT-1312', 'City');
  put('Zone', 'PT', 'PT-1312-09', { en:'Foz do Douro', pt:'Foz do Douro', fr:'Foz do Douro' }, 'PT-1312', 'City');
  put('Zone', 'PT', 'PT-1312-11', { en:'Cedofeita', pt:'Cedofeita', fr:'Cedofeita' }, 'PT-1312', 'City');
  put('Zone', 'PT', 'PT-1305-02', { en:'Matosinhos Sul', pt:'Matosinhos Sul', fr:'Matosinhos Sul' }, 'PT-1305', 'City');

  // France
  put('Country', 'FR', 'FR', { en:'France', pt:'França', fr:'France' });
  put('Region', 'FR', 'FR-IDF', { en:'Île-de-France', pt:'Ilha de França', fr:'Île-de-France' }, 'FR', 'Country');
  put('City', 'FR', 'FR-75056', { en:'Paris', pt:'Paris', fr:'Paris' }, 'FR-IDF', 'Region', { lat:48.8566, lng:2.3522 });
  put('Zone', 'FR', 'FR-75056-03', { en:'Le Marais', pt:'Le Marais', fr:'Le Marais' }, 'FR-75056', 'City');
  put('Zone', 'FR', 'FR-75056-06', { en:'Saint-Germain-des-Prés', pt:'Saint-Germain-des-Prés', fr:'Saint-Germain-des-Prés' }, 'FR-75056', 'City');

  return store;
}

module.exports = { seedVersionedStore };
