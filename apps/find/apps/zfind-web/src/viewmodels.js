/* ============================================================
   Z FIND — VIEW-MODEL / SELECTOR LAYER
   ============================================================
   UI components never read DB, GEOGRAPHY or I18N directly. They call
   these functions, which resolve relationships (asset -> representation
   -> listing -> partner -> geography -> observations -> trust ->
   intelligence) and return plain view-model objects, already
   localized. This is the seam: when DB.js is replaced by real
   Registry/Marketplace/Data/Trust Engine/Intelligence data (e.g.
   from Supabase), only this file needs to change — not the UI.

   This is also the ONLY layer allowed to bridge Geography with the
   other bounded contexts. geography.js itself never imports or
   references DB — this file is where "Marketplace/Registry/Data
   consumes Geography" actually happens, kept in one place so
   Geography's independence is never accidentally violated elsewhere.
   ============================================================ */

/* ---------------- i18n helpers ---------------- */
function t(lang, path, vars) {
  const parts = path.split('.');
  let node = I18N[lang] || I18N.en;
  for (const p of parts) { node = node && node[p]; }
  if (node === undefined) {
    console.warn('Missing i18n key:', path, 'for lang', lang);
    node = path;
  }
  if (vars) {
    Object.keys(vars).forEach(k => { node = node.replace(new RegExp('{{'+k+'}}','g'), vars[k]); });
  }
  return node;
}

/**
 * currencyIso is REQUIRED in principle — callers resolve it via
 * Geography (see resolveAssetGeography below), never hardcode it.
 * The 'EUR' default here exists only as a last-resort safety net if
 * a location somehow fails to resolve, not as the intended path.
 */
function fmtCurrency(value, lang, currencyIso) {
  const locale = { en:'en-IE', pt:'pt-PT', fr:'fr-FR' }[lang] || 'en-IE';
  return new Intl.NumberFormat(locale, { style:'currency', currency: currencyIso || 'EUR', maximumFractionDigits:0 }).format(value);
}
function fmtNumber(value, lang) {
  const locale = { en:'en-IE', pt:'pt-PT', fr:'fr-FR' }[lang] || 'en-IE';
  return new Intl.NumberFormat(locale).format(value);
}
function fmtDate(iso, lang) {
  const locale = { en:'en-GB', pt:'pt-PT', fr:'fr-FR' }[lang] || 'en-GB';
  return new Date(iso).toLocaleDateString(locale, { year:'numeric', month:'short' });
}

/* ---------------- Geography resolution (Registry/Marketplace consuming Geography) ----------------
   The only place Asset.locationId is turned into actual place names
   and a currency. Never duplicates Geography's data — always resolves
   live from geography.js. */
function resolveAssetGeography(asset, lang) {
  const r = asset.locationId ? resolveLocation(asset.locationId) : null;
  if (!r) return { zoneLabel:'', cityLabel:'', countryLabel:'', currencyIso:'EUR' };
  return {
    zoneLabel: r.zone ? geoName(r.zone.names, lang) : '',
    cityLabel: r.city ? geoName(r.city.names, lang) : '',
    countryLabel: r.country ? geoName(r.country.names, lang) : '',
    currencyIso: r.currency ? r.currency.isoCode : 'EUR',
  };
}

/* ---------------- Registry-layer resolution ---------------- */
function getRepresentationHistory(assetId) {
  return Object.values(DB.representations)
    .filter(r => r.assetId === assetId)
    .sort((a,b) => new Date(a.startDate) - new Date(b.startDate));
}
function getActiveRepresentation(assetId) {
  return getRepresentationHistory(assetId).find(r => r.status === 'Active') || null;
}
function getListingForAsset(assetId) {
  const activeRep = getActiveRepresentation(assetId);
  if (!activeRep) return null;
  return Object.values(DB.listings).find(l => l.representationId === activeRep.id && l.state === 'Published') || null;
}

/* ---------------- Trust ---------------- */
function getTrustViewModel(partnerId, lang) {
  const partner = DB.partners[partnerId];
  if (!partner || !partner.trustId) return null;
  const trust = DB.trust[partner.trustId];
  if (!trust) return null;
  return {
    level: trust.level,
    label: t(lang, 'trust.level' + trust.level.charAt(0).toUpperCase() + trust.level.slice(1)),
    checklist: trust.checklist.map(c => ({ key:c.key, positive:c.positive })),
    limitations: trust.limitations || [],
  };
}

/* ---------------- Card view-model (used by Home / Search / Partner grids) ---------------- */
function getListingCardViewModel(listing, lang) {
  const rep = DB.representations[listing.representationId];
  const asset = DB.assets[rep.assetId];
  const content = (DB.content[asset.id] && DB.content[asset.id][lang]) || (DB.content[asset.id] && DB.content[asset.id].en) || {};
  const geo = resolveAssetGeography(asset, lang);

  const priceLabel = listing.priceIsFrom
    ? 'From ' + fmtCurrency(listing.priceCurrent, lang, geo.currencyIso)
    : fmtCurrency(listing.priceCurrent, lang, geo.currencyIso);

  const factsLine = t(lang, 'property.singleRepresentation'); // exactly one Listing per Active Representation, always

  const meta = [];
  if (asset.typology) meta.push(asset.typology);
  if (asset.areaSqm) meta.push(fmtNumber(asset.areaSqm, lang) + ' m²');
  if (asset.kind === 'Development') meta.push(t(lang, 'development.totalUnits', { n: asset.unitIds.length }));
  if (asset.kind === 'Land') meta.push(geo.zoneLabel || geo.cityLabel);

  let badgeLabel = 'Verified';
  if (asset.kind === 'Land') badgeLabel = 'Land';
  else if (asset.kind === 'Development') badgeLabel = 'Development';
  else if (listing.channel === 'offmarket') badgeLabel = 'Off-market';

  return {
    listingId: listing.id,
    assetId: asset.id,
    kind: asset.kind,
    subtype: asset.subtype || null,       // Registry-owned: what the asset is
    channel: listing.channel || 'standard', // Marketplace-owned: how it's distributed
    title: content.title || '',
    description: content.description || '',
    locationLabel: geo.zoneLabel ? (geo.zoneLabel + ', ' + geo.cityLabel) : geo.cityLabel,
    zoneLabel: geo.zoneLabel,
    cityLabel: geo.cityLabel,
    countryLabel: geo.countryLabel,
    currencyIso: geo.currencyIso,
    partnerName: DB.partners[rep.partnerId].name,
    priceLabel,
    priceValue: listing.priceCurrent,
    meta,
    badgeLabel,
    badgeGold: asset.kind === 'Land',
    factsLine,
  };
}

function getAllCardViewModels(lang) {
  return Object.values(DB.listings).map(l => getListingCardViewModel(l, lang));
}

/* ---------------- Sprint 1.2: Supabase-backed Home data ----------------
   Maps a real Supabase row into the EXACT SAME card view-model shape
   getListingCardViewModel() above has always produced, so cardHTML()
   in app.js never needs to change — this file's own header comment
   describes this exact seam ("when DB.js is replaced by real data...
   only this file needs to change"), now used for the first time.

   Known, disclosed simplification: Zones Lite (deliberately NOT
   Geography) has no translated country display name, only a raw
   country_iso code — the location label here shows "Zone, City" only,
   omitting country, rather than fabricating a name lookup Zones Lite
   was never designed to provide. */
function mapSupabasePropertyRowToCard(row, lang) {
  const rep = row.representations[0];
  const listing = rep.listings[0];
  const zone = row.zones_lite || {};
  const contentRows = listing.listing_content || [];
  const content = contentRows.find(c => c.locale === lang) || contentRows.find(c => c.locale === 'en') || {};
  const currencyIso = listing.currency_iso || 'EUR';
  const kind = row.subtype === 'land' ? 'Land' : 'Property';

  const priceLabel = listing.price_is_from
    ? 'From ' + fmtCurrency(listing.price_current, lang, currencyIso)
    : fmtCurrency(listing.price_current, lang, currencyIso);

  const locationLabel = zone.name ? (zone.name + ', ' + zone.city) : (zone.city || '');

  const meta = [];
  if (row.typology) meta.push(row.typology);
  if (row.area_sqm) meta.push(fmtNumber(row.area_sqm, lang) + ' m²');
  if (kind === 'Land') meta.push(zone.name || zone.city || '');

  let badgeLabel = 'Verified';
  if (kind === 'Land') badgeLabel = 'Land';
  else if (listing.channel === 'offmarket') badgeLabel = 'Off-market';

  return {
    listingId: listing.id,
    assetId: row.id,
    kind,
    subtype: row.subtype || null,
    channel: listing.channel || 'standard',
    title: content.title || '',
    locationLabel,
    zoneLabel: zone.name || null,
    cityLabel: zone.city || null,
    countryLabel: null, // see known simplification above
    currencyIso,
    priceLabel,
    priceValue: listing.price_current,
    meta: meta.filter(Boolean),
    badgeLabel,
    badgeGold: kind === 'Land',
    factsLine: t(lang, 'property.singleRepresentation'),
  };
}

function mapSupabaseDevelopmentRowToCard(row, lang) {
  const rep = row.representations[0];
  const listing = rep.listings[0];
  const zone = row.zones_lite || {};
  const contentRows = listing.listing_content || [];
  const content = contentRows.find(c => c.locale === lang) || contentRows.find(c => c.locale === 'en') || {};
  const currencyIso = listing.currency_iso || 'EUR';

  const priceLabel = listing.price_is_from
    ? 'From ' + fmtCurrency(listing.price_current, lang, currencyIso)
    : fmtCurrency(listing.price_current, lang, currencyIso);

  const locationLabel = zone.name ? (zone.name + ', ' + zone.city) : (zone.city || '');

  return {
    listingId: listing.id,
    assetId: row.id,
    kind: 'Development',
    subtype: null,
    channel: listing.channel || 'standard',
    title: content.title || row.name || '',
    locationLabel,
    zoneLabel: zone.name || null,
    cityLabel: zone.city || null,
    countryLabel: null,
    currencyIso,
    priceLabel,
    priceValue: listing.price_current,
    meta: [],
    badgeLabel: 'Development',
    badgeGold: false,
    factsLine: t(lang, 'property.singleRepresentation'),
  };
}

/** Sprint 1.3: loads real Search page data from Supabase. Merges
    Property results (search.search(), respects all filters natively)
    with Development results (developments.listPublished(), which has
    no filter params — so budget/text filters are applied client-side
    here) — closing the gap flagged in Sprint 1.2: the Search page's
    "development" pill has always existed in the UI, but search.js was
    Property-only, so filtering by development would have silently
    returned nothing. Per Market First Engineering Policy: this is not
    a speculative abstraction, it completes UI behavior that already
    existed as a promise to the user. Developments are only queried
    when the current subtype filter could include them (empty filter,
    or explicitly includes 'development') — avoiding a wasted request
    when a user has filtered them out entirely. */
async function loadSearchResults(lang, filters) {
  const services = window.ZFindServices;
  if (!services || !services.search || !services.developments) {
    return { cards: [], error: { type: 'malformed_response', message: 'Supabase services not loaded.' } };
  }
  const f = filters || {};
  const subtypeList = Array.isArray(f.subtype) ? f.subtype : (f.subtype ? [f.subtype] : []);
  const wantsDevelopments = subtypeList.length === 0 || subtypeList.includes('development');
  const propertySubtypes = subtypeList.filter(s => s !== 'development');

  const calls = [];
  const wantsProperties = subtypeList.length === 0 || propertySubtypes.length > 0;
  if (wantsProperties) {
    calls.push(services.search.search({
      subtype: propertySubtypes.length === 1 ? propertySubtypes[0] : undefined, // service accepts one value; multi-subtype narrowing happens client-side below like the old searchCards() always did
      channel: f.channel || undefined,
      budgetMin: f.budgetMin,
      budgetMax: f.budgetMax,
      zoneLiteId: f.zoneLiteId || undefined,
    }));
  }
  if (wantsDevelopments && f.channel !== 'offmarket') { // Developments have no off-market channel concept in this schema
    calls.push(services.developments.listPublished(f.zoneLiteId || undefined));
  }

  const results = await Promise.all(calls);
  let idx = 0;
  const propertiesResult = wantsProperties ? results[idx++] : { data: [], error: null };
  const developmentsResult = (wantsDevelopments && f.channel !== 'offmarket') ? results[idx++] : { data: [], error: null };

  if (propertiesResult.error && propertiesResult.error.type !== 'empty_result') {
    return { cards: [], error: propertiesResult.error };
  }
  if (developmentsResult.error && developmentsResult.error.type !== 'empty_result') {
    return { cards: [], error: developmentsResult.error };
  }

  let propertyCards = (propertiesResult.data || []).map(row => mapSupabasePropertyRowToCard(row, lang));
  if (propertySubtypes.length > 1) propertyCards = propertyCards.filter(c => propertySubtypes.includes(c.subtype)); // multi-select narrowing, service only accepts one

  let developmentCards = (developmentsResult.data || []).map(row => mapSupabaseDevelopmentRowToCard(row, lang));
  // Client-side budget/text filtering for developments (listPublished has no filter params):
  if (f.budgetMin != null) developmentCards = developmentCards.filter(c => c.priceValue >= f.budgetMin);
  if (f.budgetMax != null) developmentCards = developmentCards.filter(c => c.priceValue <= f.budgetMax);

  let cards = propertyCards.concat(developmentCards);

  const q = (f.q || '').trim().toLowerCase();
  if (q) {
    cards = cards.filter(c => (c.title + ' ' + (c.locationLabel || '')).toLowerCase().includes(q));
  }

  return { cards, error: null };
}


/** Loads real Home page data from Supabase: published Property
    listings (apartment/villa/land) and published Development
    listings, fetched concurrently (Promise.all — never sequential
    cascading requests). Returns a shape the caller (app.js) can
    render directly, distinguishing a genuine error from an empty
    result so the UI can show the right state for each. */
async function loadHomeCards(lang) {
  const services = window.ZFindServices;
  if (!services || !services.search || !services.developments) {
    return { properties: [], developments: [], error: { type: 'malformed_response', message: 'Supabase services not loaded.' } };
  }

  const [propertiesResult, developmentsResult] = await Promise.all([
    services.search.search({}),
    services.developments.listPublished(),
  ]);

  if (propertiesResult.error && propertiesResult.error.type !== 'empty_result') {
    return { properties: [], developments: [], error: propertiesResult.error };
  }
  if (developmentsResult.error && developmentsResult.error.type !== 'empty_result') {
    return { properties: [], developments: [], error: developmentsResult.error };
  }

  const propertyCards = (propertiesResult.data || []).map(row => mapSupabasePropertyRowToCard(row, lang));
  const developmentCards = (developmentsResult.data || []).map(row => mapSupabaseDevelopmentRowToCard(row, lang));

  return { properties: propertyCards, developments: developmentCards, error: null };
}

/* ---------------- Search selector ----------------
   The UI never filters raw DB data itself — it always calls this.
   Deduplication is guaranteed structurally: it iterates DB.listings,
   which by construction holds exactly one Listing per Active
   Representation, so a canonical Asset can never appear twice here
   regardless of how many historical Representations it has had.

   subtype  = Registry classification filter (apartment/villa/development/land)
   channel  = Marketplace distribution filter (standard/offmarket)
   These are two independent axes, never conflated into one field. */
function searchCards(lang, filters) {
  filters = filters || {};
  const q = (filters.q || '').trim().toLowerCase();
  const subtype = filters.subtype || '';       // '' = any; string OR array of strings
  const channel = filters.channel || '';       // '' = any
  const budgetMax = filters.budgetMax || null;
  const budgetMin = filters.budgetMin || null;
  const subtypeList = Array.isArray(subtype) ? subtype : (subtype ? [subtype] : []);

  return getAllCardViewModels(lang).filter(card => {
    if (subtypeList.length && !subtypeList.includes(card.subtype)) return false;
    if (channel && card.channel !== channel) return false;
    if (budgetMax != null && card.priceValue > budgetMax) return false;
    if (budgetMin != null && card.priceValue < budgetMin) return false;
    if (q) {
      const haystack = (card.title + ' ' + card.zoneLabel + ' ' + card.cityLabel + ' ' + card.countryLabel + ' ' + card.partnerName).toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/* ---------------- Property detail ---------------- */
function getPropertyDetailViewModel(assetId, lang) {
  const asset = DB.assets[assetId];
  const listing = getListingForAsset(assetId);
  const rep = getActiveRepresentation(assetId);
  const partner = DB.partners[rep.partnerId];
  const content = (DB.content[assetId] && DB.content[assetId][lang]) || DB.content[assetId].en;
  const geo = resolveAssetGeography(asset, lang);
  const obs = DB.observations[assetId] || [];
  const intel = DB.intelligence[assetId];
  const trust = getTrustViewModel(partner.id, lang);
  const history = getRepresentationHistory(assetId);

  const findObs = (metric) => obs.find(o => o.metric === metric);

  return {
    asset, listing, partner, geo, content, trust,
    facts: [
      { labelKey:'property.typology', value: asset.typology },
      { labelKey:'property.grossArea', value: fmtNumber(asset.areaSqm, lang) + ' m²' },
      { labelKey:'property.energyRating', value:'B' },
      { labelKey:'property.bathrooms', value:'3' },
      { labelKey:'property.parking', value:'2' },
      { labelKey:'property.yearBuilt', value:'2019' },
    ],
    market: {
      avgPriceZone: findObs('avg_price_sqm_zone'),
      priceThis: findObs('price_sqm_this'),
      trend: findObs('price_trend_12m'),
      comparables: findObs('comparable_transactions_6m'),
    },
    intelligence: intel ? intel.yield : null,
    priceLabel: fmtCurrency(listing.priceCurrent, lang, geo.currencyIso),
    representationNote: history.length > 1
      ? { multiple:true, activePartner: partner.name, activeSince: fmtDate(rep.startDate, lang) }
      : { multiple:false },
  };
}

/** Picks the best storage path to display for a media asset: a
    'large' variant if present (a web-optimized derivative — the whole
    point of media_variants existing), else any other variant, else
    the immutable original as a last resort. Shared by Property and
    Development — one rule, not two copies of it. Returns the raw
    storage PATH, not yet a usable URL — resolving that is a separate,
    async step (see supabaseClient.js's resolveMediaUrl), because the
    'listing-media' bucket is private and a bare path is never
    directly fetchable. */
function pickMediaStoragePath(mediaAsset) {
  const variants = mediaAsset.media_variants || [];
  const large = variants.find(v => v.variant_type === 'large');
  const anyVariant = variants[0];
  return (large || anyVariant || {}).storage_path || mediaAsset.original_storage_path || null;
}

/* Matches partners.enquiry_policy's own column default in migration
   0001 exactly — used only when the embed returns no partner at all
   (never fabricated, just the same safe fallback the database itself
   already defines). */
const DEFAULT_ENQUIRY_POLICY = { direct: true, qualified: false, assisted: false };

/* ---------------- Sprint 1.4: Supabase-backed Property detail ----------------
   IMPORTANT, discovered before writing this function: the OLD
   getPropertyDetailViewModel() read from DB.observations,
   DB.intelligence, and getTrustViewModel() — the Data/Observation,
   Intelligence, and Trust Engine bounded contexts. NONE of these
   exist in the Supabase schema (migration 0001 has no observations,
   intelligence, or trust tables at all) — implementing them now would
   mean a new migration and three new bounded contexts, which would
   clearly and materially delay launch. Per Market First Engineering
   Policy, this is documented technical debt, not fixed here.

   The good news: app.js's EXISTING template already renders these
   sections conditionally (`${vm.market.avgPriceZone || ... ? ... :
   ''}`, `${vm.intelligence ? ... : ''}`, `${vm.trust ? ... : ''}`,
   `${vm.representationNote.multiple ? ... : ''}`) — this function
   only needs to return the correct "no data" shape (all null/false)
   for these fields, and the existing template gracefully omits every
   section with zero visual regression and zero template changes.

   Known, disclosed simplification (same as Home/Search): countryLabel
   returns the raw zones_lite.country_iso code (e.g. "PT"), not a
   translated country name — Zones Lite was never designed to provide
   one. Returning null here would literally render the text "null" in
   app.js's un-conditional eyebrow-line interpolation — a real bug
   this function avoids by always returning a usable string.

   facts[] energyRating/bathrooms/parking/yearBuilt are kept as the
   EXACT SAME hardcoded placeholder values the old fixture-based code
   always used (never real per-property data even before this
   migration — this is pre-existing debt, not introduced here; fixing
   it needs new Supabase columns, out of scope for a data-source
   migration). typology/areaSqm ARE real. */
function mapSupabasePropertyRowToDetailViewModel(row, lang) {
  const rep = row.representations[0];
  const listing = rep.listings[0];
  const zone = row.zones_lite || {};
  const partner = rep.partners ? { id: rep.partners.id, name: rep.partners.name, enquiryPolicy: rep.partners.enquiry_policy || DEFAULT_ENQUIRY_POLICY } : { id: null, name: '', enquiryPolicy: DEFAULT_ENQUIRY_POLICY };
  const contentRows = listing.listing_content || [];
  const content = contentRows.find(c => c.locale === lang) || contentRows.find(c => c.locale === 'en') || { title: '', description: '' };
  const currencyIso = listing.currency_iso || 'EUR';

  // Gallery media, ordered, cover first — mirrors listing_media's own
  // position/is_cover columns, never re-sorted by any other rule.
  const mediaRows = (listing.listing_media || []).slice().sort((a, b) => (b.is_cover - a.is_cover) || (a.position - b.position));
  const media = mediaRows.map(m => {
    const asset = m.media_assets || {};
    const contentRow = (asset.media_asset_content || []).find(c => c.locale === lang) || (asset.media_asset_content || []).find(c => c.locale === 'en');
    return { storagePath: pickMediaStoragePath(asset), altText: (contentRow && contentRow.alt_text) || content.title || '' };
  });

  const priceLabel = listing.price_is_from
    ? 'From ' + fmtCurrency(listing.price_current, lang, currencyIso)
    : fmtCurrency(listing.price_current, lang, currencyIso);

  return {
    asset: { id: row.id, typology: row.typology, areaSqm: row.area_sqm, subtype: row.subtype },
    listing: { id: listing.id, priceCurrent: listing.price_current },
    partner,
    geo: {
      zoneLabel: zone.name || null,
      cityLabel: zone.city || null,
      countryLabel: zone.country_iso || '', // see known simplification above — never null, avoids literally rendering "null"
      currencyIso,
    },
    content,
    media,
    trust: null,           // Trust Engine not implemented in Supabase — documented technical debt, template already omits gracefully
    facts: [
      { labelKey: 'property.typology', value: row.typology },
      { labelKey: 'property.grossArea', value: fmtNumber(row.area_sqm, lang) + ' m²' },
      { labelKey: 'property.energyRating', value: 'B' },   // pre-existing hardcoded placeholder, not introduced by this migration
      { labelKey: 'property.bathrooms', value: '3' },       // same
      { labelKey: 'property.parking', value: '2' },         // same
      { labelKey: 'property.yearBuilt', value: '2019' },    // same
    ],
    market: { avgPriceZone: null, priceThis: null, trend: null, comparables: null }, // Data/Observation not implemented in Supabase — documented technical debt
    intelligence: null, // Intelligence bounded context not implemented in Supabase — documented technical debt
    priceLabel,
    representationNote: { multiple: false }, // representation history requires querying deprecated representations — deferred, documented technical debt
  };
}

/** Sprint 1.4: loads one Property's full detail from Supabase. Returns
    a distinct 'not_found' outcome (property doesn't exist OR isn't
    published — RLS makes both look identical, by design) separate
    from a genuine network/service error, so the caller can show the
    right UI for each. */
async function loadPropertyDetail(propertyId, lang) {
  const services = window.ZFindServices;
  if (!services || !services.properties) {
    return { viewModel: null, notFound: false, error: { type: 'malformed_response', message: 'Supabase services not loaded.' } };
  }

  const result = await services.properties.getPropertyById(propertyId, lang);

  if (result.error && result.error.type === 'empty_result') {
    return { viewModel: null, notFound: true, error: null };
  }
  if (result.error) {
    return { viewModel: null, notFound: false, error: result.error };
  }

  const viewModel = mapSupabasePropertyRowToDetailViewModel(result.data, lang);
  if (viewModel.media[0] && viewModel.media[0].storagePath && window.ZFindServices.supabaseClient) {
    viewModel.media[0].url = await window.ZFindServices.supabaseClient.resolveMediaUrl(viewModel.media[0].storagePath);
  }
  return { viewModel, notFound: false, error: null };
}


function getDevelopmentDetailViewModel(assetId, lang) {
  const asset = DB.assets[assetId];
  const listing = getListingForAsset(assetId);
  const rep = getActiveRepresentation(assetId);
  const partner = DB.partners[rep.partnerId];
  const content = (DB.content[assetId] && DB.content[assetId][lang]) || DB.content[assetId].en;
  const geo = resolveAssetGeography(asset, lang);

  const units = asset.unitIds.map(uid => {
    const u = DB.assets[uid];
    return {
      id: u.id, typology: u.typology, areaSqm: u.areaSqm, floor: u.floor,
      price: DB.unitPrice[uid], status: DB.unitStatus[uid],
      priceLabel: fmtCurrency(DB.unitPrice[uid], lang, geo.currencyIso),
    };
  });

  return {
    asset, listing, partner, geo, content, units,
    priceLabel: 'From ' + fmtCurrency(listing.priceCurrent, lang, geo.currencyIso),
  };
}

/* ---------------- Sprint 1.5: Supabase-backed Development detail ----------------
   Deliberately its OWN function, not a variant of the Property mapper
   — a Development is not a Property (per the brief). Where a genuine,
   natural reuse existed (Z Intelligence/Trust/Insights placeholders
   follow the exact same "always an object, null fields" contract as
   Sprint 1.4), the SAME shape is used so app.js's rendering for these
   sections can be identical on both pages — this is reuse where it
   costs nothing, not a forced abstraction.

   Real gap discovered before writing this: the OLD fixture had a
   per-unit `status` of 'available'|'reserved'|'sold', with no
   equivalent column anywhere in the Supabase schema.

   CORRECTED (initial version of this comment was wrong): I originally
   reasoned that since listUnitsForDevelopment() only returns units
   with an active representation + published listing, every returned
   unit could honestly be labeled 'available'. That inference doesn't
   hold — "published" proves the listing is visible/marketed, not that
   the unit is still commercially available (as opposed to under offer,
   reserved, or sold — none of which have a real column either). No
   `status` field is assigned to units at all anymore; the UI shows a
   neutral "Enquire" call-to-action instead (see app.js) rather than
   any availability claim. A real availability model needs its own
   column/workflow — documented technical debt, not built here. */
function mapSupabaseDevelopmentRowToDetailViewModel(row, lang) {
  const rep = row.representations[0];
  const listing = rep.listings[0];
  const zone = row.zones_lite || {};
  const contentRows = listing.listing_content || [];
  const content = contentRows.find(c => c.locale === lang) || contentRows.find(c => c.locale === 'en') || { title: row.name || '', description: '' };
  const currencyIso = listing.currency_iso || 'EUR';

  const ownMediaRows = (row.development_media || []).slice().sort((a, b) => (b.is_cover - a.is_cover) || (a.position - b.position));
  const listingMediaRows = (listing.listing_media || []).slice().sort((a, b) => (b.is_cover - a.is_cover) || (a.position - b.position));
  const mediaRows = ownMediaRows.length ? ownMediaRows : listingMediaRows; // prefer the Development's own photos; fall back to its listing's
  const media = mediaRows.map(m => {
    const asset = m.media_assets || {};
    const contentRow = (asset.media_asset_content || []).find(c => c.locale === lang) || (asset.media_asset_content || []).find(c => c.locale === 'en');
    return { storagePath: pickMediaStoragePath(asset), altText: (contentRow && contentRow.alt_text) || content.title || '' };
  });

  const priceLabel = 'From ' + fmtCurrency(listing.price_current, lang, currencyIso);

  return {
    asset: { id: row.id, name: row.name },
    listing: { id: listing.id, priceCurrent: listing.price_current },
    partner: rep.partners ? { id: rep.partners.id, name: rep.partners.name, enquiryPolicy: rep.partners.enquiry_policy || DEFAULT_ENQUIRY_POLICY } : { id: null, name: '', enquiryPolicy: DEFAULT_ENQUIRY_POLICY },
    geo: { zoneLabel: zone.name || null, cityLabel: zone.city || null, countryLabel: zone.country_iso || '', currencyIso },
    content,
    media,
    priceLabel,
    trust: null,          // same documented technical debt as Property (Sprint 1.4) — Trust Engine not implemented
    market: { avgPriceZone: null, priceThis: null, trend: null, comparables: null }, // same — Data/Observation not implemented
    intelligence: null,   // same — Intelligence bounded context not implemented
  };
}

/** Loads one Development's full detail + its units, concurrently
    (Promise.all — the two are independent queries, never sequential). */
async function loadDevelopmentDetail(developmentId, lang) {
  const services = window.ZFindServices;
  if (!services || !services.developments) {
    return { viewModel: null, notFound: false, error: { type: 'malformed_response', message: 'Supabase services not loaded.' } };
  }

  const [devResult, unitsResult] = await Promise.all([
    services.developments.getDevelopmentById(developmentId),
    services.developments.listUnitsForDevelopment(developmentId),
  ]);

  if (devResult.error && devResult.error.type === 'empty_result') {
    return { viewModel: null, notFound: true, error: null };
  }
  if (devResult.error) {
    return { viewModel: null, notFound: false, error: devResult.error };
  }
  if (unitsResult.error && unitsResult.error.type !== 'empty_result') {
    return { viewModel: null, notFound: false, error: unitsResult.error };
  }

  const viewModel = mapSupabaseDevelopmentRowToDetailViewModel(devResult.data, lang);
  // CTO correction: "published" proves the listing is visible, not
  // that the unit is commercially available, reserved, or sold — none
  // of those exist as real data. No `status` field is assigned here
  // at all anymore; the UI shows a neutral "Enquire" call-to-action
  // instead of a fabricated availability claim (see app.js).
  viewModel.units = (unitsResult.data || []).map(u => {
    const urep = u.representations[0];
    const ulisting = urep.listings[0];
    return {
      id: u.id, typology: u.typology, areaSqm: u.area_sqm, floor: u.floor,
      price: ulisting.price_current,
      priceLabel: fmtCurrency(ulisting.price_current, lang, ulisting.currency_iso || 'EUR'),
    };
  });

  if (viewModel.media[0] && viewModel.media[0].storagePath && window.ZFindServices.supabaseClient) {
    viewModel.media[0].url = await window.ZFindServices.supabaseClient.resolveMediaUrl(viewModel.media[0].storagePath);
  }
  return { viewModel, notFound: false, error: null };
}


function getLandDetailViewModel(assetId, lang) {
  const asset = DB.assets[assetId];
  const listing = getListingForAsset(assetId);
  const rep = getActiveRepresentation(assetId);
  const partner = DB.partners[rep.partnerId];
  const content = (DB.content[assetId] && DB.content[assetId][lang]) || DB.content[assetId].en;
  const geo = resolveAssetGeography(asset, lang);
  const land = DB.land[assetId];
  const intel = DB.intelligence[assetId];

  return {
    asset, listing, partner, geo, content,
    knownFacts: land.knownFacts,
    planningContext: land.planningContext,
    scenarios: intel ? intel.scenarios : [],
    priceLabel: fmtCurrency(listing.priceCurrent, lang, geo.currencyIso),
    enquiryConfig: getEnquiryConfig(listing.id),
  };
}

/* ---------------- Partner detail ---------------- */
function getPartnerDetailViewModel(partnerId, lang) {
  const partner = DB.partners[partnerId];
  const trust = getTrustViewModel(partnerId, lang);
  const portfolioListings = Object.values(DB.listings).filter(l => {
    const rep = DB.representations[l.representationId];
    return rep.partnerId === partnerId;
  });
  const cards = portfolioListings.map(l => getListingCardViewModel(l, lang));
  return {
    partner, trust, cards,
    counts: {
      total: cards.length,
      developments: cards.filter(c => c.kind === 'Development').length,
      land: cards.filter(c => c.kind === 'Land').length,
    },
    avgResponse: partner.avgResponseHours,
  };
}

/* ---------------- Enquiry config ----------------
   Resolution order, per the approved Phase 2.5 refactor:
   1. Listing.enquiryConfig, if this specific Listing overrides the default.
   2. The representing Partner's enquiryPolicy (the new default source).
   3. A safe, conservative fallback if neither exists. */
function getEnquiryConfig(listingId) {
  const listing = DB.listings[listingId];
  if (!listing) return { direct:true, qualified:false, assisted:false };
  if (listing.enquiryConfig) return listing.enquiryConfig;
  const rep = DB.representations[listing.representationId];
  const partner = rep ? DB.partners[rep.partnerId] : null;
  if (partner && partner.enquiryPolicy) return partner.enquiryPolicy;
  return { direct:true, qualified:false, assisted:false };
}
