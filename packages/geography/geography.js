/* ============================================================
   ZOS — GEOGRAPHY (shared bounded context, packages/geography)
   ============================================================
   Owns ONLY: canonical place identity, administrative hierarchy
   (Country -> Region? -> City -> Zone?), multilingual place names,
   and Currencies (referenced by Country, not duplicated per place).

   Promoted from apps/find/packages/geography to packages/geography
   (@zos/geography) once a second vertical — Z Fashion — needed the
   identical Country/Region/City/Zone/Currency shape on day one of
   its own design (see apps/fashion/docs/architecture/
   MARKETS-AND-I18N.md and ZOS-ALIGNMENT.md's open question, now
   resolved: reuse, not fork). Z Find and Z Fashion both consume
   this module; neither owns it.

   Explicitly does NOT own and never will, per approved scope:
   market intelligence, lifestyle classification, investment scoring,
   editorial content, AI recommendations, market semantics. Those are
   future, independent bounded contexts built ON TOP of Geography —
   this file must never grow those responsibilities.

   This module has zero knowledge of Registry, Marketplace, Data,
   Trust Engine, Intelligence, or any vertical-specific domain (Z Find's
   Asset/Listing, Z Fashion's Partner/Product). It is consumed by
   them; it never consumes them. Region and Zone are deliberately
   optional in the hierarchy — not every country needs a Region layer
   (see Country without a Region below), and not every City needs
   Zones (e.g. a rural land Asset may resolve only to a City).
   ============================================================ */

const GEOGRAPHY = {

  currencies: {
    currency_eur: { id:'currency_eur', isoCode:'EUR', symbol:'€', decimalPlaces:0 },
  },

  countries: {
    country_pt: {
      id:'country_pt', isoCode:'PT', defaultCurrencyId:'currency_eur',
      names:{ en:'Portugal', pt:'Portugal', fr:'Portugal' },
    },
    country_fr: {
      id:'country_fr', isoCode:'FR', defaultCurrencyId:'currency_eur',
      names:{ en:'France', pt:'França', fr:'France' },
    },
  },

  /* Region is an optional administrative layer. Portugal's fixture
     data below does not use it (Porto and Matosinhos sit directly
     under Country) — proving the hierarchy does not force a layer
     no country needs. France's fixture uses it once, to prove the
     same hierarchy supports a country that does. */
  regions: {
    region_idf: { id:'region_idf', countryId:'country_fr', names:{ en:'Île-de-France', fr:'Île-de-France', pt:'Ilha de França' } },
  },

  cities: {
    city_porto:       { id:'city_porto',       countryId:'country_pt', regionId:null,        names:{ en:'Porto',       pt:'Porto',       fr:'Porto' },       coordinates:{ lat:41.1579, lng:-8.6291 } },
    city_matosinhos:  { id:'city_matosinhos',  countryId:'country_pt', regionId:null,        names:{ en:'Matosinhos', pt:'Matosinhos', fr:'Matosinhos' },   coordinates:{ lat:41.1815, lng:-8.6873 } },
    city_paris:       { id:'city_paris',       countryId:'country_fr', regionId:'region_idf', names:{ en:'Paris',      pt:'Paris',      fr:'Paris' },        coordinates:{ lat:48.8566, lng:2.3522 } },
  },

  /* Zone is the finest-grained level, and is itself optional — a
     rural Land asset may reference a City directly with no Zone. */
  zones: {
    zone_boavista:      { id:'zone_boavista',      cityId:'city_porto',      names:{ en:'Boavista',       pt:'Boavista',       fr:'Boavista' } },
    zone_foz:            { id:'zone_foz',            cityId:'city_porto',      names:{ en:'Foz do Douro',   pt:'Foz do Douro',   fr:'Foz do Douro' } },
    zone_cedofeita:      { id:'zone_cedofeita',      cityId:'city_porto',      names:{ en:'Cedofeita',       pt:'Cedofeita',       fr:'Cedofeita' } },
    zone_matosinhos_sul: { id:'zone_matosinhos_sul', cityId:'city_matosinhos', names:{ en:'Matosinhos Sul', pt:'Matosinhos Sul', fr:'Matosinhos Sul' } },
    zone_le_marais:      { id:'zone_le_marais',      cityId:'city_paris',      names:{ en:'Le Marais',       pt:'Le Marais',       fr:'Le Marais' } },
    zone_saint_germain:  { id:'zone_saint_germain',  cityId:'city_paris',      names:{ en:'Saint-Germain-des-Prés', pt:'Saint-Germain-des-Prés', fr:'Saint-Germain-des-Prés' } },
  },
};

/* ---------------- Pure lookup functions ----------------
   No dependency on any other bounded context. A caller supplies a
   Zone id OR a City id — both are valid "location references" per
   the approved model, since Zone is optional. */

function geoName(namesMap, lang) {
  return (namesMap && (namesMap[lang] || namesMap.en)) || '';
}

function getCurrency(currencyId) { return GEOGRAPHY.currencies[currencyId] || null; }
function getCountry(countryId) { return GEOGRAPHY.countries[countryId] || null; }
function getRegion(regionId) { return regionId ? (GEOGRAPHY.regions[regionId] || null) : null; }
function getCity(cityId) { return GEOGRAPHY.cities[cityId] || null; }
function getZone(zoneId) { return GEOGRAPHY.zones[zoneId] || null; }

/**
 * Resolves a location reference (a Zone id or a City id — Zone is
 * optional in the hierarchy) up through its full ancestry.
 * Returns null fields for any level that doesn't apply, never throws.
 */
function resolveLocation(locationId) {
  let zone = getZone(locationId);
  let city = zone ? getCity(zone.cityId) : getCity(locationId);
  if (!city) return null;
  const region = getRegion(city.regionId);
  const country = getCountry(city.countryId);
  const currency = country ? getCurrency(country.defaultCurrencyId) : null;
  return { zone, city, region, country, currency };
}

function locationLabel(locationId, lang) {
  const r = resolveLocation(locationId);
  if (!r) return '';
  const zoneOrCity = r.zone ? geoName(r.zone.names, lang) : geoName(r.city.names, lang);
  return r.zone ? `${zoneOrCity}, ${geoName(r.city.names, lang)}` : zoneOrCity;
}

module.exports = {
  GEOGRAPHY,
  geoName,
  getCurrency,
  getCountry,
  getRegion,
  getCity,
  getZone,
  resolveLocation,
  locationLabel,
};
