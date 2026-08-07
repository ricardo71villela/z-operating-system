/* ============================================================
   Z FIND — PORTUGAL ADAPTER
   ============================================================
   All Portugal-specific logic lives here. The shared engine
   (import-engine.js) never contains a PT-shaped branch — this file
   is the only place that knows what a Portuguese source record looks
   like, what its code system is, and how its hierarchy is shaped.

   Code system: illustrative INE-style codes, shaped
   "PT-<city-code>[-<zone-code>]" — NOT verified real government
   codes (no live external data used, per Phase 3 instructions).
   Portugal's hierarchy in this adapter has NO Region level: City's
   parent is Country directly.
   ============================================================ */

const ptAdapter = {
  countryIso: 'PT',

  // Raw source -> array of raw records.
  sourceParser(rawInput) {
    return rawInput.records || [];
  },

  // Stable identifier for within-batch duplicate detection — uses the
  // source's own raw id field, not the resolved official code (a
  // record could theoretically arrive twice with a typo'd code; the
  // raw id is what the SOURCE considers "the same row").
  rawId(raw) {
    return raw.row_id;
  },

  entityType(raw) {
    if (raw.kind === 'country') return 'Country';
    if (raw.kind === 'city') return 'City';
    if (raw.kind === 'zone') return 'Zone';
    throw new Error(`Unknown PT record kind: ${raw.kind}`);
  },

  fieldMapping(raw) {
    return { code: raw.ine_code };
  },

  hierarchyMapping(raw) {
    if (raw.kind === 'country') return { parentCode: null, parentEntityType: null };
    if (raw.kind === 'city') return { parentCode: 'PT', parentEntityType: 'Country' };
    if (raw.kind === 'zone') return { parentCode: raw.parent_city_code, parentEntityType: 'City' };
    return { parentCode: null, parentEntityType: null };
  },

  translationMapping(raw) {
    const names = {};
    if (raw.nome_pt) names.pt = raw.nome_pt;
    if (raw.name_en) names.en = raw.name_en;
    if (raw.nom_fr) names.fr = raw.nom_fr;
    return names;
  },

  geometryMapping(raw) {
    return (raw.lat != null && raw.lng != null) ? { lat: raw.lat, lng: raw.lng } : null;
  },

  successionHints(raw) {
    return raw.previously_known_as ? [raw.previously_known_as] : [];
  },

  // Adapter-specific validation, layered on top of shared structural checks.
  validationRules: [
    (raw, normalized) => {
      const errs = [];
      if (normalized.code && !/^PT(-[A-Za-z0-9]+)*$/.test(normalized.code)) {
        errs.push('ine_code_does_not_match_pt_format');
      }
      return errs;
    },
  ],
};

module.exports = { ptAdapter };
