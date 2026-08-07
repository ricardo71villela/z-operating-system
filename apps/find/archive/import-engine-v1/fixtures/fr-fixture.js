/* ============================================================
   Z FIND — FRANCE FIXTURE (Data Import Engine validation)
   ============================================================
   Illustrative raw source data, shaped exactly as frAdapter expects
   (line_id, type, insee_code, nom_fr, ...). Not real government data.

   Proves, using the SAME shared pipeline as Portugal with zero engine
   changes:
   - a different hierarchy depth (City's parent is Region, not Country)
   - a different code system shape (INSEE-style vs INE-style)
   - unchanged records (Country, Region, City, one Zone)
   - a new Region/City/Zone chain, exercising same-batch parent
     resolution (the new City references the new Region, both arriving
     in the same batch, in hierarchy order)
   ============================================================ */

function frFixtureSource() {
  return {
    id: 'fr-insee-2026-07',
    name: 'INSEE-style administrative divisions (illustrative)',
    authority: 'INSEE (illustrative, not verified real data)',
    country: 'FR',
    version: '2026.07',
    licence: 'Etalab-2.0 (illustrative)',
    publicationDate: '2026-07-01',
    checksum: 'sha256:illustrative-fr-2026-07',
    attribution: 'Source: INSEE (illustrative fixture — Z Find Phase 3 proof of concept, not real government data).',
  };
}

function frFixtureBatch1() {
  return {
    records: [
      // Country — unchanged
      { line_id:'l1', type:'pays', insee_code:'FR', nom_fr:'France', name_en:'France', nome_pt:'França' },

      // Region — unchanged
      { line_id:'l2', type:'region', insee_code:'FR-IDF', nom_fr:'Île-de-France', name_en:'Île-de-France', nome_pt:'Ilha de França' },

      // City — unchanged (parent = Region, not Country)
      { line_id:'l3', type:'commune', insee_code:'FR-75056', parent_region_code:'FR-IDF', nom_fr:'Paris', name_en:'Paris', nome_pt:'Paris', latitude:48.8566, longitude:2.3522 },

      // Zone — unchanged
      { line_id:'l4', type:'quartier', insee_code:'FR-75056-03', parent_commune_code:'FR-75056', nom_fr:'Le Marais', name_en:'Le Marais', nome_pt:'Le Marais' },

      // NEW Region
      { line_id:'l5', type:'region', insee_code:'FR-PAC', nom_fr:'Provence-Alpes-Côte d\u2019Azur', name_en:'Provence-Alpes-Côte d\u2019Azur', nome_pt:'Provença-Alpes-Costa Azul' },

      // NEW City under the NEW Region — same batch, hierarchy order respected
      { line_id:'l6', type:'commune', insee_code:'FR-13055', parent_region_code:'FR-PAC', nom_fr:'Marseille', name_en:'Marseille', nome_pt:'Marselha', latitude:43.2965, longitude:5.3698 },

      // NEW Zone under the NEW City
      { line_id:'l7', type:'quartier', insee_code:'FR-13055-01', parent_commune_code:'FR-13055', nom_fr:'Le Vieux-Port', name_en:'Le Vieux-Port', nome_pt:'Le Vieux-Port' },
    ],
  };
}

module.exports = { frFixtureSource, frFixtureBatch1 };
