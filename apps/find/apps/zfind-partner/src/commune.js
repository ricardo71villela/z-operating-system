/* ============================================================
   Z FIND PARTNER — services/commune (window.ZFindServices.commune)
   ============================================================
   Locate a property or development in its commune (France, Belgium,
   Luxembourg), migration 20261004140000_z_find_partner_commune_v1:
   - search(country, query): zfind_commune_search, by postcode or name;
   - setAsset(kind, id, country, code): zfind_set_asset_commune — the
     server checks the commune exists and that the partner owns the asset.
   ============================================================ */

(function (root, factory) {
  root.ZFindServices = root.ZFindServices || {};
  root.ZFindServices.commune = factory(root.ZFindServices.supabaseClient);
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {
  'use strict';

  const { getSupabaseClient } = supabaseClientModule;

  /* Same folding as the public site's place search and the loader. */
  function fold(value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[’'`]/g, ' ').replace(/[-‐–]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  async function search(country, query) {
    const q = fold(query);
    if (q.length < 2) return { data: [], error: null };
    try {
      const { data, error } = await getSupabaseClient().rpc('zfind_commune_search', { p_country: country, p_query: q });
      return { data: data || [], error: error || null };
    } catch (e) { return { data: [], error: e }; }
  }

  async function setAsset(kind, assetId, country, code) {
    try {
      const { data, error } = await getSupabaseClient().rpc('zfind_set_asset_commune', { p_kind: kind, p_asset_id: assetId, p_country: country, p_code: code });
      return { data: data || null, error: error || null };
    } catch (e) { return { data: null, error: e }; }
  }

  function zoneLabel(zone) {
    if (!zone) return '';
    return zone.name === zone.city || !zone.city ? zone.name : `${zone.name}, ${zone.city}`;
  }

  return Object.freeze({ fold, search, setAsset, zoneLabel });
});
