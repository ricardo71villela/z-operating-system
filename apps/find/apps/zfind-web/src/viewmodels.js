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
  const locale = { fr:'fr-FR', en:'en-IE', pt:'pt-PT', es:'es-ES', de:'de-DE', it:'it-IT' }[lang] || 'fr-FR';
  return new Intl.NumberFormat(locale, { style:'currency', currency: currencyIso || 'EUR', maximumFractionDigits:0 }).format(value);
}

/**
 * Formats one Listing price without collapsing commercial semantics.
 *
 * sale:
 *   €500,000
 *
 * rent/monthly:
 *   €1,500 /month
 *
 * rent/seasonal:
 *   €8,000 /season
 *
 * rent/yearly:
 *   €18,000 /year
 *
 * Database constraints own validity. This function only projects it.
 * Historical test fixtures that predate transaction_type safely read as sale.
 */
function formatListingPrice(listing, lang, currencyIso) {
  const base = fmtCurrency(listing.price_current, lang, currencyIso);
  const prefix = listing.price_is_from ? (t(lang, 'search.priceFrom') + ' ') : '';

  if ((listing.transaction_type || 'sale') !== 'rent') {
    return prefix + base;
  }

  const suffixKey = {
    monthly: 'search.perMonth',
    seasonal: 'search.perSeason',
    yearly: 'search.perYear',
  }[listing.rental_period];

  return prefix + base + (suffixKey ? (' ' + t(lang, suffixKey)) : '');
}

function fmtNumber(value, lang) {
  const locale = { fr:'fr-FR', en:'en-IE', pt:'pt-PT', es:'es-ES', de:'de-DE', it:'it-IT' }[lang] || 'fr-FR';
  return new Intl.NumberFormat(locale).format(value);
}
function fmtDate(iso, lang) {
  const locale = { fr:'fr-FR', en:'en-GB', pt:'pt-PT', es:'es-ES', de:'de-DE', it:'it-IT' }[lang] || 'fr-FR';
  return new Date(iso).toLocaleDateString(locale, { year:'numeric', month:'short' });
}

/**
 * Public routes use short language codes (/en, /pt, /fr), while
 * persisted localized content follows the system-language contract
 * (en, pt-PT, fr).
 *
 * Keep that distinction at this boundary: routing remains stable and
 * content lookup uses the canonical persisted locale.
 */
function contentLocaleForLang(lang) {
  if (
    typeof ZFindServices !== 'undefined' &&
    ZFindServices.publicLocales
  ) {
    return (
      ZFindServices.publicLocales.persistedLocaleFor(lang)
      || lang
    );
  }

  return lang === 'pt'
    ? 'pt-PT'
    : lang;
}

function findLocalizedContentRow(rows, lang) {
  const localizedRows = rows || [];
  const locale = contentLocaleForLang(lang);

  return localizedRows.find(c => c.locale === locale)
    || localizedRows.find(c => c.locale === 'en')
    || null;
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

/* ---------------- Sprint 1.2: Supabase-backed Home data ----------------
   Maps a real Supabase row into the shared public card view-model shape
   consumed by cardHTML(), so Home/Search/Partner stay presentation-aligned
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
  const content = findLocalizedContentRow(contentRows, lang) || {};
  const currencyIso = listing.currency_iso || 'EUR';
  const kind = row.subtype === 'land' ? 'Land' : 'Property';

  const priceLabel = formatListingPrice(listing, lang, currencyIso);

  const locationLabel = zone.name ? (zone.name + ', ' + zone.city) : (zone.city || '');

  const meta = [];
  if (row.typology) meta.push(row.typology);
  if (row.area_sqm) meta.push(fmtNumber(row.area_sqm, lang) + ' m²');
  if (kind === 'Land') meta.push(zone.name || zone.city || '');

  let badgeLabel = 'Verified';
  if (kind === 'Land') badgeLabel = 'Land';
  else if (listing.channel === 'offmarket') badgeLabel = 'Off-market';
  else if ((listing.transaction_type || 'sale') === 'rent') badgeLabel = t(lang, 'search.forRent');

  return {
    listingId: listing.id,
    assetId: row.id,
    kind,
    subtype: row.subtype || null,
    channel: listing.channel || 'standard',
    transactionType: listing.transaction_type || 'sale',
    rentalPeriod: listing.rental_period || null,
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
  const content = findLocalizedContentRow(contentRows, lang) || {};
  const currencyIso = listing.currency_iso || 'EUR';

  const priceLabel = formatListingPrice(listing, lang, currencyIso);

  const locationLabel = zone.name ? (zone.name + ', ' + zone.city) : (zone.city || '');

  return {
    listingId: listing.id,
    assetId: row.id,
    kind: 'Development',
    subtype: null,
    channel: listing.channel || 'standard',
    transactionType: listing.transaction_type || 'sale',
    rentalPeriod: listing.rental_period || null,
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
      transactionType: f.transactionType || undefined,
      rentalPeriod: f.rentalPeriod || undefined,
      budgetMin: f.budgetMin,
      budgetMax: f.budgetMax,
      zoneLiteId: f.zoneLiteId || undefined,
    }));
  }
  if (wantsDevelopments && f.channel !== 'offmarket') { // Developments have no off-market channel concept in this schema
    calls.push(services.developments.listPublished(f.zoneLiteId || undefined, f.transactionType || undefined, f.rentalPeriod || undefined));
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
  const content = findLocalizedContentRow(contentRows, lang) || { title: '', description: '' };
  const currencyIso = listing.currency_iso || 'EUR';

  // Gallery media, ordered, cover first — mirrors listing_media's own
  // position/is_cover columns, never re-sorted by any other rule.
  const mediaRows = (listing.listing_media || []).slice().sort((a, b) => (b.is_cover - a.is_cover) || (a.position - b.position));
  const media = mediaRows.map(m => {
    const asset = m.media_assets || {};
    const contentRow = findLocalizedContentRow(asset.media_asset_content, lang);
    return { storagePath: pickMediaStoragePath(asset), altText: (contentRow && contentRow.alt_text) || content.title || '' };
  });

  const priceLabel = formatListingPrice(listing, lang, currencyIso);

  return {
    asset: { id: row.id, typology: row.typology, areaSqm: row.area_sqm, subtype: row.subtype },
    listing: { id: listing.id, priceCurrent: listing.price_current, transactionType: listing.transaction_type || 'sale', rentalPeriod: listing.rental_period || null },
    partner,
    geo: {
      zoneLabel: zone.name || null,
      cityLabel: zone.city || null,
      countryLabel: zone.country_iso || '', // see known simplification above — never null, avoids literally rendering "null"
      currencyIso,
    },
    content,
    media,
    verification: null, // Safe public Verification exists as a separate read path; it is not Trust and is not automatically fetched yet.
    trust: null,           // Trust Engine not implemented in Supabase — documented technical debt, template already omits gracefully
    // Public factual attributes are strictly source-backed.
    // Missing attributes are omitted rather than replaced with prototype,
    // inferred or default values.
    facts: [
      row.typology != null && row.typology !== ''
        ? { labelKey: 'property.typology', value: row.typology }
        : null,
      row.area_sqm != null
        ? { labelKey: 'property.grossArea', value: fmtNumber(row.area_sqm, lang) + ' m²' }
        : null,
    ].filter(Boolean),
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
  if (!propertyId) {
    return { viewModel: null, notFound: true, error: null };
  }
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



/* ---------------- Sprint 1.8: Supabase-backed Land detail ----------------
   Land is deliberately NOT a separate persistence/domain entity here:
   in Z Find's current schema it is a Property with subtype='land'.

   The runtime therefore reuses properties.getPropertyById() and the
   existing Property detail mapper for relationships/content/media, then
   narrows the public Land view-model to facts that actually exist in the
   database.

   Crucially, the old prototype's zoning/planning/GDV/construction
   scenarios are NOT copied forward. They have no equivalent public
   source-backed model yet. Absence is rendered as absence — never as
   invented estimates. */
function mapSupabaseLandRowToDetailViewModel(row, lang) {
  const viewModel = mapSupabasePropertyRowToDetailViewModel(row, lang);

  const hasPlotArea = row.plot_area_sqm != null;
  const factualAreaSqm = hasPlotArea ? row.plot_area_sqm : row.area_sqm;

  viewModel.asset.plotAreaSqm = hasPlotArea ? row.plot_area_sqm : null;
  viewModel.asset.areaSqm = row.area_sqm != null ? row.area_sqm : null;

  viewModel.facts = factualAreaSqm != null ? [{
    labelKey: hasPlotArea ? 'land.plotArea' : 'property.grossArea',
    value: fmtNumber(factualAreaSqm, lang) + ' m²',
  }] : [];

  // These bounded contexts do not yet expose public, evidence-backed
  // Land data. Never project the old DB.js prototype values here.
  viewModel.market = null;
  viewModel.intelligence = null;
  viewModel.trust = null;
  viewModel.planningContext = null;
  viewModel.scenarios = [];

  return viewModel;
}

/** Loads a published Land record through the existing Property service.
    A non-Land Property id is treated as not-found for this route: the
    /land/:id route must never silently render an apartment or villa. */
async function loadLandDetail(propertyId, lang) {
  if (!propertyId) {
    return { viewModel: null, notFound: true, error: null };
  }
  const services = window.ZFindServices;
  if (!services || !services.properties) {
    return {
      viewModel: null,
      notFound: false,
      error: {
        type: 'malformed_response',
        message: 'Supabase services not loaded.',
      },
    };
  }

  const result = await services.properties.getPropertyById(propertyId, lang);

  if (result.error && result.error.type === 'empty_result') {
    return { viewModel: null, notFound: true, error: null };
  }

  if (result.error) {
    return { viewModel: null, notFound: false, error: result.error };
  }

  if (!result.data || result.data.subtype !== 'land') {
    return { viewModel: null, notFound: true, error: null };
  }

  const viewModel = mapSupabaseLandRowToDetailViewModel(result.data, lang);

  if (
    viewModel.media[0] &&
    viewModel.media[0].storagePath &&
    window.ZFindServices.supabaseClient
  ) {
    viewModel.media[0].url =
      await window.ZFindServices.supabaseClient.resolveMediaUrl(
        viewModel.media[0].storagePath
      );
  }

  return { viewModel, notFound: false, error: null };
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
  const content = findLocalizedContentRow(contentRows, lang) || { title: row.name || '', description: '' };
  const currencyIso = listing.currency_iso || 'EUR';

  const ownMediaRows = (row.development_media || []).slice().sort((a, b) => (b.is_cover - a.is_cover) || (a.position - b.position));
  const listingMediaRows = (listing.listing_media || []).slice().sort((a, b) => (b.is_cover - a.is_cover) || (a.position - b.position));
  const mediaRows = ownMediaRows.length ? ownMediaRows : listingMediaRows; // prefer the Development's own photos; fall back to its listing's
  const media = mediaRows.map(m => {
    const asset = m.media_assets || {};
    const contentRow = findLocalizedContentRow(asset.media_asset_content, lang);
    return { storagePath: pickMediaStoragePath(asset), altText: (contentRow && contentRow.alt_text) || content.title || '' };
  });

  const priceLabel = formatListingPrice(listing, lang, currencyIso);

  return {
    asset: { id: row.id, name: row.name },
    listing: { id: listing.id, priceCurrent: listing.price_current, transactionType: listing.transaction_type || 'sale', rentalPeriod: listing.rental_period || null },
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
  if (!developmentId) {
    return { viewModel: null, notFound: true, error: null };
  }
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
      priceLabel: formatListingPrice(ulisting, lang, ulisting.currency_iso || 'EUR'),
    };
  });

  if (viewModel.media[0] && viewModel.media[0].storagePath && window.ZFindServices.supabaseClient) {
    viewModel.media[0].url = await window.ZFindServices.supabaseClient.resolveMediaUrl(viewModel.media[0].storagePath);
  }
  return { viewModel, notFound: false, error: null };
}


/* ---------------- Sprint 1.9: Supabase-backed Partner detail ----------------
   A public Partner profile is a Z Find Marketplace projection of the real
   Partner row plus ONLY the published opportunities that anonymous RLS allows
   the visitor to see.

   Important boundary: partners.trust_level is deliberately NOT consumed here.
   That column is a legacy marketplace projection; Verification truth belongs
   in verification_assessments. Until a public Trust projection exists, the
   honest public Partner-detail value is trust:null.

   Portfolio cards reuse the exact Property/Development Supabase card mappers
   already used by Home/Search — no second card model and no fixture bridge. */
async function loadPartnerDetail(partnerId, lang) {
  const services = window.ZFindServices;

  if (!partnerId) {
    return { viewModel: null, notFound: true, error: null };
  }

  if (!services || !services.partners) {
    return {
      viewModel: null,
      notFound: false,
      error: {
        type: 'malformed_response',
        message: 'Supabase Partner service not loaded.'
      }
    };
  }

  const [partnerResult, propertiesResult, developmentsResult] = await Promise.all([
    services.partners.getPublicPartnerById(partnerId),
    services.partners.listPublishedProperties(partnerId),
    services.partners.listPublishedDevelopments(partnerId),
  ]);

  if (partnerResult.error && partnerResult.error.type === 'empty_result') {
    return { viewModel: null, notFound: true, error: null };
  }

  if (partnerResult.error) {
    return { viewModel: null, notFound: false, error: partnerResult.error };
  }

  if (!partnerResult.data) {
    return { viewModel: null, notFound: true, error: null };
  }

  if (propertiesResult.error && propertiesResult.error.type !== 'empty_result') {
    return { viewModel: null, notFound: false, error: propertiesResult.error };
  }

  if (developmentsResult.error && developmentsResult.error.type !== 'empty_result') {
    return { viewModel: null, notFound: false, error: developmentsResult.error };
  }

  const row = partnerResult.data;

  const propertyCards = (propertiesResult.data || [])
    .map(propertyRow => mapSupabasePropertyRowToCard(propertyRow, lang));

  const developmentCards = (developmentsResult.data || [])
    .map(developmentRow => mapSupabaseDevelopmentRowToCard(developmentRow, lang));

  const cards = propertyCards.concat(developmentCards);

  const partner = {
    id: row.id,
    name: row.name || '',
    role: row.role || null,
    enquiryPolicy: row.enquiry_policy || DEFAULT_ENQUIRY_POLICY,
    logoStoragePath: row.logo_storage_path || null,
    logoUrl: null,
  };

  if (
    partner.logoStoragePath &&
    services.supabaseClient &&
    services.supabaseClient.resolveMediaUrl
  ) {
    partner.logoUrl = await services.supabaseClient.resolveMediaUrl(
      partner.logoStoragePath
    );
  }

  return {
    viewModel: {
      partner,
      trust: null,
      cards,
      counts: {
        total: cards.length,
        developments: cards.filter(card => card.kind === 'Development').length,
        land: cards.filter(card => card.kind === 'Land').length,
      },
      avgResponse: row.avg_response_hours,
    },
    notFound: false,
    error: null,
  };
}
