/* ============================================================
   Z FIND — PLACE SEARCH (communes of France, Belgique, Luxembourg)

   One index per country, built by scripts/geography/build_public_divisions.py:
   /geo/search/{fr,be,lu}.json, rows [code, name, "postcodes", "alias|alias", parent].
   Finds a commune by name (accents and case ignored), postcode, Dutch or
   German name, locality or Luxembourg-City district, for the search bars
   and the natural-language search. Loaded lazily, cached per country.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.placeSearch = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const COUNTRIES = Object.freeze(['FR', 'BE', 'LU']);

  function fold(value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[’'`]/g, ' ').replace(/[-‐–]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const cache = new Map();
  let loader = path => fetch('/' + path, { credentials: 'omit' }).then(r => {
    if (!r.ok) throw new Error(path + ' ' + r.status);
    return r.json();
  });
  function setLoader(fn) { loader = fn; cache.clear(); }

  function loadCountry(country) {
    const key = String(country || '').toUpperCase();
    if (!COUNTRIES.includes(key)) return Promise.resolve([]);
    if (!cache.has(key)) {
      cache.set(key, Promise.resolve(loader(`geo/search/${key.toLowerCase()}.json`))
        .then(rows => (Array.isArray(rows) ? rows : []).map(r => ({
          country: key, code: r[0], name: r[1], postcodes: r[2] ? r[2].split(' ') : [],
          aliases: r[3] ? r[3].split('|') : [], parent: r[4] || '',
          folded: fold(r[1]), foldedAliases: r[3] ? r[3].split('|').map(fold) : []
        })))
        .catch(error => { cache.delete(key); throw error; }));
    }
    return cache.get(key);
  }

  function score(place, q, digits) {
    if (digits) return place.postcodes.some(cp => cp.startsWith(q)) ? (place.postcodes.includes(q) ? 6 : 3) : -1;
    if (place.folded === q) return 5;
    if (place.folded.startsWith(q)) return 4;
    const alias = place.foldedAliases.findIndex(a => a === q);
    if (alias >= 0) return 4.5;
    if (place.foldedAliases.some(a => a.startsWith(q))) return 2.5;
    if (place.folded.includes(q)) return 2;
    if (place.foldedAliases.some(a => a.includes(q))) return 1;
    return -1;
  }

  /* search("evian") → [{ country, code, name, parent, via, score }] */
  async function search(query, options) {
    const q = fold(query);
    if (q.length < 2) return [];
    const opts = options || {};
    const countries = (opts.countries && opts.countries.length ? opts.countries : COUNTRIES).filter(c => COUNTRIES.includes(c));
    const digits = /^\d+$/.test(q);
    const lists = await Promise.all(countries.map(c => loadCountry(c).catch(() => [])));
    const found = [];
    lists.forEach(list => list.forEach(place => {
      const s = score(place, q, digits);
      if (s < 0) return;
      const via = s < 4 || s === 4.5 ? (place.aliases.find(a => fold(a).includes(q)) || '') : '';
      found.push({ country: place.country, code: place.code, name: place.name, parent: place.parent, postcodes: place.postcodes, via, score: s });
    }));
    found.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name, 'fr'));
    return found.slice(0, opts.limit || 8);
  }

  /* The commune a listing zone's city refers to: an exact name, alias or
     postcode match that is unique in its country, else null. */
  async function resolveCity(country, name, postcode) {
    const list = await loadCountry(country).catch(() => []);
    const q = fold(name);
    if (postcode) {
      const byCp = list.filter(p => p.postcodes.includes(String(postcode)) && (!q || p.folded === q || p.foldedAliases.includes(q)));
      if (byCp.length === 1) return byCp[0];
    }
    if (!q) return null;
    const exact = list.filter(p => p.folded === q);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return null;
    const alias = list.filter(p => p.foldedAliases.includes(q));
    return alias.length === 1 ? alias[0] : null;
  }

  /* "FR:74119" ⇄ { country, code } — the commune in a search URL. */
  function encode(place) { return place ? `${place.country}:${place.code}` : ''; }
  function decode(value) {
    const m = /^(FR|BE|LU):([A-Za-z0-9-]{2,40})$/.exec(String(value || ''));
    return m ? { country: m[1], code: m[2] } : null;
  }
  async function byCode(value) {
    const ref = decode(value);
    if (!ref) return null;
    const list = await loadCountry(ref.country).catch(() => []);
    return list.find(p => p.code === ref.code) || null;
  }

  return Object.freeze({ COUNTRIES, fold, search, resolveCity, encode, decode, byCode, setLoader, _internals: Object.freeze({ score, loadCountry }) });
});
