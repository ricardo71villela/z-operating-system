/* ============================================================
   Z FIND — services/property-taxonomy.js

   Phase 4R R2.3A

   Read-only adapter between authenticated authoring surfaces and
   the canonical relational Property taxonomy.

   Structural authority:
     DB property_classes / property_subtypes

   This service never writes taxonomy and never queries the
   reference tables directly.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./supabaseClient'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.propertyTaxonomy = factory(
      root.ZFindServices.supabaseClient
    );
  }
})(
  typeof window !== 'undefined' ? window : this,
  function (supabaseClientModule) {
    'use strict';

    const {
      getSupabaseClient,
      safeQuery
    } = supabaseClientModule;

    function normalizedSortOrder(value) {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }

    function normalizeClass(row) {
      if (!row || typeof row.code !== 'string') return null;

      const code = row.code.trim();
      if (!code) return null;

      return {
        code,
        enabled: row.enabled === true,
        sortOrder: normalizedSortOrder(row.sort_order)
      };
    }

    function normalizeSubtype(row) {
      if (
        !row ||
        typeof row.code !== 'string' ||
        typeof row.property_class !== 'string'
      ) {
        return null;
      }

      const code = row.code.trim();
      const propertyClass = row.property_class.trim();

      if (!code || !propertyClass) return null;

      return {
        code,
        propertyClass,
        enabled: row.enabled === true,
        sortOrder: normalizedSortOrder(row.sort_order)
      };
    }

    function normalizeTaxonomy(raw) {
      const source = raw && typeof raw === 'object' ? raw : {};

      const classes = Array.isArray(source.classes)
        ? source.classes.map(normalizeClass).filter(Boolean)
        : [];

      const subtypes = Array.isArray(source.subtypes)
        ? source.subtypes.map(normalizeSubtype).filter(Boolean)
        : [];

      classes.sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.code.localeCompare(b.code)
      );

      subtypes.sort(
        (a, b) =>
          a.propertyClass.localeCompare(b.propertyClass) ||
          a.sortOrder - b.sortOrder ||
          a.code.localeCompare(b.code)
      );

      return { classes, subtypes };
    }

    async function getAuthoringTaxonomy() {
      const client = getSupabaseClient();

      const result = await safeQuery(
        () => client.rpc(
          'zfind_authoring_property_taxonomy'
        ),
        'propertyTaxonomy.getAuthoringTaxonomy'
      );

      if (result.error) return result;

      return {
        data: normalizeTaxonomy(result.data),
        error: null
      };
    }

    /** Returns every subtype currently available for NEW authoring,
        ordered first by authoritative Property-class sort order and
        then by subtype sort order.

        A subtype is authorable only when BOTH the subtype and its
        owning Property class are enabled. */
    function listEnabledAuthoringSubtypes(taxonomy) {
      const source = taxonomy || {};
      const classes = Array.isArray(source.classes)
        ? source.classes
        : [];
      const subtypes = Array.isArray(source.subtypes)
        ? source.subtypes
        : [];

      const enabledClassOrder = new Map();

      classes.forEach(item => {
        if (
          item &&
          typeof item.code === 'string' &&
          item.enabled === true
        ) {
          enabledClassOrder.set(
            item.code,
            normalizedSortOrder(item.sortOrder)
          );
        }
      });

      return subtypes
        .filter(
          item =>
            item &&
            item.enabled === true &&
            enabledClassOrder.has(item.propertyClass)
        )
        .slice()
        .sort(
          (a, b) =>
            enabledClassOrder.get(a.propertyClass) -
              enabledClassOrder.get(b.propertyClass) ||
            normalizedSortOrder(a.sortOrder) -
              normalizedSortOrder(b.sortOrder) ||
            String(a.code).localeCompare(String(b.code))
        );
    }

    function listEnabledSubtypes(taxonomy, propertyClass) {
      const source = taxonomy || {};
      const classes = Array.isArray(source.classes)
        ? source.classes
        : [];
      const subtypes = Array.isArray(source.subtypes)
        ? source.subtypes
        : [];

      const classEnabled = classes.some(
        item =>
          item &&
          item.code === propertyClass &&
          item.enabled === true
      );

      if (!classEnabled) return [];

      return subtypes
        .filter(
          item =>
            item &&
            item.propertyClass === propertyClass &&
            item.enabled === true
        )
        .slice()
        .sort(
          (a, b) =>
            normalizedSortOrder(a.sortOrder) -
              normalizedSortOrder(b.sortOrder) ||
            String(a.code).localeCompare(String(b.code))
        );
    }

    function getDefaultSubtype(taxonomy, propertyClass) {
      const choices = listEnabledSubtypes(
        taxonomy,
        propertyClass
      );

      return choices.length ? choices[0].code : null;
    }

    function humanizeCode(code) {
      return String(code == null ? '' : code)
        .trim()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(
          /\b\w/g,
          character => character.toUpperCase()
        );
    }

    return {
      normalizeTaxonomy,
      getAuthoringTaxonomy,
      listEnabledAuthoringSubtypes,
      listEnabledSubtypes,
      getDefaultSubtype,
      humanizeCode
    };
  }
);
