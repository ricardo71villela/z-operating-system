/* ============================================================
   Z FIND — FRANCE ADAPTER
   ============================================================
   All France-specific logic lives here. Deliberately structured
   differently from the Portugal adapter in two ways the shared
   engine must handle without modification:
   1. Hierarchy depth: City's parent here is REGION, not Country.
   2. Code system: illustrative INSEE-style numeric-ish codes
      ("FR-<insee>[-<zone>]"), a different shape from Portugal's.

   Code system is illustrative — NOT verified real INSEE codes (no
   live external data used, per Phase 3 instructions).
   ============================================================ */

const frAdapter = {
  countryIso: 'FR',

  sourceParser(rawInput) {
    return rawInput.records || [];
  },

  rawId(raw) {
    return raw.line_id;
  },

  entityType(raw) {
    if (raw.type === 'pays') return 'Country';
    if (raw.type === 'region') return 'Region';
    if (raw.type === 'commune') return 'City';
    if (raw.type === 'quartier') return 'Zone';
    throw new Error(`Unknown FR record type: ${raw.type}`);
  },

  fieldMapping(raw) {
    return { code: raw.insee_code };
  },

  hierarchyMapping(raw) {
    if (raw.type === 'pays') return { parentCode: null, parentEntityType: null };
    if (raw.type === 'region') return { parentCode: 'FR', parentEntityType: 'Country' };
    if (raw.type === 'commune') return { parentCode: raw.parent_region_code, parentEntityType: 'Region' };
    if (raw.type === 'quartier') return { parentCode: raw.parent_commune_code, parentEntityType: 'City' };
    return { parentCode: null, parentEntityType: null };
  },

  translationMapping(raw) {
    const names = {};
    if (raw.nom_fr) names.fr = raw.nom_fr;
    if (raw.name_en) names.en = raw.name_en;
    if (raw.nome_pt) names.pt = raw.nome_pt;
    return names;
  },

  geometryMapping(raw) {
    return (raw.latitude != null && raw.longitude != null) ? { lat: raw.latitude, lng: raw.longitude } : null;
  },

  successionHints(raw) {
    return raw.ancien_code ? [raw.ancien_code] : [];
  },

  validationRules: [
    (raw, normalized) => {
      const errs = [];
      if (normalized.code && !/^FR(-[A-Za-z0-9]+)*$/.test(normalized.code)) {
        errs.push('insee_code_does_not_match_fr_format');
      }
      return errs;
    },
  ],
};

module.exports = { frAdapter };
