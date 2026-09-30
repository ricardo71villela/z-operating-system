/* ============================================================
   Z FIND — SEARCH FILTERS (shared by the site and the alert e-mails)

   Advanced criteria applied to published listings already scoped by
   market, type, transaction and price: commune (code or name), price
   bounds, surface, rooms, bedrooms, energy class, outdoor space,
   parking, lift, free text (accents ignored), then the chosen order.
   Developments carry none of the property-level facts, so property-only
   criteria leave them out. Pure functions over search cards.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.searchFilters = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const ENERGY_ORDER = 'ABCDEFG';

  function foldSearchText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[’'`-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function cardMatchesPlace(card, place) {
    if (!place) return true;
    if (place.country && card.countryIso && place.country !== card.countryIso) return false;
    const names = [place.name].concat(place.aliases || []).map(foldSearchText).filter(Boolean);
    const labels = [card.cityLabel, card.zoneLabel].map(foldSearchText).filter(Boolean);
    if (labels.some(label => names.includes(label))) return true;
    return !!(card.postalCode && Array.isArray(place.postcodes) && place.postcodes.includes(String(card.postalCode)));
  }

  /* The facts the advanced criteria use, read from a published property
     row (PostgREST shape of search.js). Shared by the site's card mapping
     and by the alert e-mails, so both judge a listing the same way. */
  function propertyFacts(row) {
    const r = row || {};
    const rep = Array.isArray(r.representations) ? r.representations[0] : null;
    const listing = rep && Array.isArray(rep.listings) ? rep.listings[0] || {} : {};
    const attrs = r.attributes && typeof r.attributes === 'object' ? r.attributes : {};
    const positive = v => (typeof v === 'number' && v > 0) || v === true || (typeof v === 'string' && v !== '' && v !== '0' && v !== 'false');
    const typologyRooms = /^[TF]\s?(\d+)/i.exec(String(r.typology || ''));
    return {
      areaSqm: r.area_sqm == null ? null : Number(r.area_sqm),
      rooms: typologyRooms ? Number(typologyRooms[1])
        : (r.bedrooms != null && r.living_rooms != null ? Number(r.bedrooms) + Number(r.living_rooms) : null),
      bedrooms: r.bedrooms == null ? null : Number(r.bedrooms),
      energyRating: r.energy_rating ? String(r.energy_rating).toUpperCase() : null,
      hasOutdoor: positive(attrs.balcony_sqm) || positive(attrs.terrace_sqm) || positive(attrs.garden) || positive(attrs.rooftop),
      hasParking: positive(attrs.parking_spaces) || positive(attrs.garage_spaces),
      hasLift: positive(attrs.elevator),
      postalCode: r.postal_code || null,
      createdAt: listing.created_at || null
    };
  }

  function applyAdvancedSearchFilters(cards, f) {
    const num = v => (v === '' || v == null ? null : Number(v));
    const areaMin = num(f.areaMin), roomsMin = num(f.roomsMin), bedsMin = num(f.bedsMin);
    const energyMax = f.energyMax && ENERGY_ORDER.includes(String(f.energyMax).toUpperCase()) ? String(f.energyMax).toUpperCase() : null;
    const propertyOnly = areaMin != null || roomsMin != null || bedsMin != null || energyMax || f.outdoor || f.parking || f.lift;
    const priceMin = num(f.budgetMin), priceMax = num(f.budgetMax);
    let out = cards.filter(card => {
      if (propertyOnly && card.kind === 'Development') return false;
      // Also enforced by the database query; repeated here so every source agrees.
      if (priceMin != null && !(Number(card.priceValue) >= priceMin)) return false;
      if (priceMax != null && !(Number(card.priceValue) <= priceMax)) return false;
      if (areaMin != null && !(card.areaSqm >= areaMin)) return false;
      if (roomsMin != null && !(card.rooms >= roomsMin)) return false;
      if (bedsMin != null && !(card.bedrooms >= bedsMin)) return false;
      if (energyMax && !(card.energyRating && ENERGY_ORDER.indexOf(card.energyRating) >= 0 && ENERGY_ORDER.indexOf(card.energyRating) <= ENERGY_ORDER.indexOf(energyMax))) return false;
      if (f.outdoor && !card.hasOutdoor) return false;
      if (f.parking && !card.hasParking) return false;
      if (f.lift && !card.hasLift) return false;
      return true;
    });
    if (f.place) {
      out = out.filter(card => cardMatchesPlace(card, f.place));
    } else {
      const q = foldSearchText(f.q);
      if (q) out = out.filter(card => foldSearchText([card.title, card.locationLabel, card.cityLabel, card.zoneLabel, card.postalCode].filter(Boolean).join(' ')).includes(q));
    }
    const price = c => (typeof c.priceValue === 'number' ? c.priceValue : Number(c.priceValue) || 0);
    const ppm2 = c => (c.areaSqm > 0 && price(c) > 0 ? price(c) / c.areaSqm : Infinity);
    const time = c => (c.createdAt ? Date.parse(c.createdAt) || 0 : 0);
    if (f.sort === 'price_asc') out = out.slice().sort((a, b) => price(a) - price(b));
    else if (f.sort === 'price_desc') out = out.slice().sort((a, b) => price(b) - price(a));
    else if (f.sort === 'ppm2_asc') out = out.slice().sort((a, b) => ppm2(a) - ppm2(b));
    else if (f.sort === 'recent') out = out.slice().sort((a, b) => time(b) - time(a));
    return out;
  }

  return Object.freeze({ ENERGY_ORDER, foldSearchText, cardMatchesPlace, propertyFacts, applyAdvancedSearchFilters });
});
