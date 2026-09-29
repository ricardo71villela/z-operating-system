/* ============================================================
   Z FIND — PUBLIC LISTING QUALITY GATE

   The last line of defence between the database and the public site:
   whatever is marked "published", a row only reaches Home, Search, the
   map, market pages and the generated SEO pages when it is a real,
   priced listing.

   Refused:
     - test / QA data: a title or name carrying "[TEST", "[QA" or
       "Synthetic QA" (the 2026 QA inventory was published by mistake);
     - a listing without a positive price;
     - optionally, a listing outside the public launch markets
       (FR / BE / LU) — the browser passes the launch-scope service.

   Pure functions over the PostgREST row shape used by search.js and
   developments.js: row.representations[0].listings[0].
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.listingQuality = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const TEST_MARKER = /\[\s*(?:test|qa)\b|\bsynthetic\s+qa\b/i;

  function listingOf(row) {
    const rep = row && Array.isArray(row.representations) ? row.representations[0] : null;
    return rep && Array.isArray(rep.listings) ? rep.listings[0] || null : null;
  }

  function titlesOf(row) {
    const listing = listingOf(row);
    const content = listing && Array.isArray(listing.listing_content) ? listing.listing_content : [];
    return [row && row.name].concat(content.map(c => c && c.title)).filter(v => typeof v === 'string' && v);
  }

  function isTestTitle(value) {
    return typeof value === 'string' && TEST_MARKER.test(value);
  }

  function isTestRow(row) {
    return titlesOf(row).some(isTestTitle);
  }

  function hasPositivePrice(row) {
    const listing = listingOf(row);
    return !!listing && Number(listing.price_current) > 0;
  }

  function countryOf(row) {
    return row && row.zones_lite ? row.zones_lite.country_iso || null : null;
  }

  /* isLaunchCountry(iso) → boolean; omitted = every country accepted. */
  function isPublicRow(row, isLaunchCountry) {
    if (!row || isTestRow(row) || !hasPositivePrice(row)) return false;
    if (typeof isLaunchCountry === 'function' && !isLaunchCountry(countryOf(row))) return false;
    return true;
  }

  function filterPublicRows(rows, isLaunchCountry) {
    return Array.isArray(rows) ? rows.filter(row => isPublicRow(row, isLaunchCountry)) : rows;
  }

  /* Filters a safeQuery() result ({ data, error, count }) in place of its data. */
  function filterResult(result, isLaunchCountry) {
    if (!result || !Array.isArray(result.data)) return result;
    const data = filterPublicRows(result.data, isLaunchCountry);
    if (data.length === result.data.length) return result;
    return Object.assign({}, result, { data, count: result.count == null ? result.count : data.length });
  }

  return Object.freeze({ isTestTitle, isTestRow, hasPositivePrice, isPublicRow, filterPublicRows, filterResult });
});
