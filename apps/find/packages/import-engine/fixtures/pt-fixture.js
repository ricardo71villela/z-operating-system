/* ============================================================
   Z FIND — PORTUGAL FIXTURE (Data Import Engine proof of concept)
   ============================================================
   Illustrative raw source data, shaped exactly as ptAdapter expects
   (row_id, kind, ine_code, nome_pt, name_en, nom_fr, ...). Not real
   government data — no live external source is used in this phase.

   Deliberately includes, per the Phase 3 requirements:
   - unchanged records (Country, one City, two Zones)
   - one changed record (Matosinhos — geometry updated)
   - one renamed location (Cedofeita — code same, name changed)
   - one new record (a new Zone: Ramalde)
   - one invalid record (missing official code)
   - one duplicate source record (Porto's row repeated verbatim)
   ============================================================ */

function ptFixtureSource() {
  return {
    id: 'pt-ine-2026-07',
    name: 'INE-style administrative divisions (illustrative)',
    authority: 'INE (illustrative, not verified real data)',
    country: 'PT',
    version: '2026.07',
    licence: 'CC-BY-4.0 (illustrative)',
    publicationDate: '2026-07-01',
    checksum: 'sha256:illustrative-pt-2026-07',
    attribution: 'Source: INE (illustrative fixture — Z Find Phase 3 proof of concept, not real government data).',
  };
}

function ptFixtureBatch1() {
  return {
    records: [
      // Country — unchanged
      { row_id:'r1', kind:'country', ine_code:'PT', nome_pt:'Portugal', name_en:'Portugal', nom_fr:'Portugal' },

      // City — unchanged
      { row_id:'r2', kind:'city', ine_code:'PT-1312', nome_pt:'Porto', name_en:'Porto', nom_fr:'Porto', lat:41.1579, lng:-8.6291 },

      // City — CHANGED (geometry updated vs. canonical seed)
      { row_id:'r3', kind:'city', ine_code:'PT-1305', nome_pt:'Matosinhos', name_en:'Matosinhos', nom_fr:'Matosinhos', lat:41.1900, lng:-8.6900 },

      // Zone — unchanged
      { row_id:'r4', kind:'zone', ine_code:'PT-1312-04', parent_city_code:'PT-1312', nome_pt:'Boavista', name_en:'Boavista', nom_fr:'Boavista' },
      { row_id:'r5', kind:'zone', ine_code:'PT-1312-09', parent_city_code:'PT-1312', nome_pt:'Foz do Douro', name_en:'Foz do Douro', nom_fr:'Foz do Douro' },

      // Zone — RENAMED (same code PT-1312-11, name differs from canonical seed)
      { row_id:'r6', kind:'zone', ine_code:'PT-1312-11', parent_city_code:'PT-1312', nome_pt:'Cedofeita Histórica', name_en:'Historic Cedofeita', nom_fr:'Cedofeita Historique' },

      // Zone — NEW
      { row_id:'r7', kind:'zone', ine_code:'PT-1312-15', parent_city_code:'PT-1312', nome_pt:'Ramalde', name_en:'Ramalde', nom_fr:'Ramalde' },

      // INVALID — missing official code
      { row_id:'r8', kind:'zone', ine_code:'', parent_city_code:'PT-1312', nome_pt:'Registo Sem Código' },

      // DUPLICATE — exact same row_id as r2 (Porto), appears twice in source
      { row_id:'r2', kind:'city', ine_code:'PT-1312', nome_pt:'Porto', name_en:'Porto', nom_fr:'Porto', lat:41.1579, lng:-8.6291 },
    ],
  };
}

module.exports = { ptFixtureSource, ptFixtureBatch1 };
