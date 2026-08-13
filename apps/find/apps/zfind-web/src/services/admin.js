/* ============================================================
   Z FIND — services/admin.js
   ============================================================
   Sprint 1.7 — Admin MVP. Every write the Admin UI performs goes
   through this file — never direct Supabase calls from the UI, same
   discipline as every other service. Relies entirely on migration
   0002's RLS (authenticated + is_admin()) — never service_role, never
   an RLS bypass. If a call fails with authorization_failure, the
   correct fix is checking the signed-in user's profiles.role, never
   loosening a policy here.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./supabaseClient'), require('./image-optimize'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.admin = factory(root.ZFindServices.supabaseClient, root.ZFindServices.imageOptimize);
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule, imageOptimizeModule) {

const { getSupabaseClient, safeQuery, resolveMediaUrl } = supabaseClientModule;

/* ---------------- Dashboard ---------------- */

async function getDashboardCounts() {
  const client = getSupabaseClient();
  const [properties, developments, partners, leads] = await Promise.all([
    client.from('properties').select('id', { count: 'exact', head: true }),
    client.from('developments').select('id', { count: 'exact', head: true }),
    client.from('partners').select('id', { count: 'exact', head: true }),
    client.from('leads').select('id', { count: 'exact', head: true }),
  ]);
  const pickCount = r => (r && !r.error) ? (r.count || 0) : null;
  const firstError = [properties, developments, partners, leads].find(r => r && r.error);
  if (firstError) {
    return { data: null, error: { type: 'malformed_response', context: 'admin.getDashboardCounts', message: firstError.error.message } };
  }
  return { data: { properties: pickCount(properties), developments: pickCount(developments), partners: pickCount(partners), leads: pickCount(leads) }, error: null };
}

/* ---------------- Partners ---------------- */

async function listPartners(searchText) {
  const client = getSupabaseClient();
  let q = client.from('partners').select('id, name, role, status, enquiry_policy, created_at').order('name');
  if (searchText) q = q.ilike('name', `%${searchText}%`);
  return safeQuery(() => q, 'admin.listPartners');
}

async function getPartnerById(id) {
  const client = getSupabaseClient();
  return safeQuery(() => client.from('partners').select('*').eq('id', id).single(), 'admin.getPartnerById');
}

async function createPartner({ name, role, enquiryPolicy }) {
  const client = getSupabaseClient();
  return safeQuery(
    () => client.from('partners').insert({ name, role, enquiry_policy: enquiryPolicy || { direct: true, qualified: false, assisted: false } }).select().single(),
    'admin.createPartner'
  );
}

async function updatePartner(id, fields) {
  const client = getSupabaseClient();
  const patch = {};
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.role !== undefined) patch.role = fields.role;
  if (fields.status !== undefined) patch.status = fields.status;
  if (fields.enquiryPolicy !== undefined) patch.enquiry_policy = fields.enquiryPolicy;
  if (fields.logoStoragePath !== undefined) patch.logo_storage_path = fields.logoStoragePath;
  return safeQuery(() => client.from('partners').update(patch).eq('id', id).select().single(), 'admin.updatePartner');
}

/** Uploads a partner's logo to the same shared, private bucket every
    other image uses, stores the path on partners.logo_storage_path,
    and returns the resolved (signed) URL for immediate display —
    reuses resolveMediaUrl, not a second image pipeline. */
async function uploadPartnerLogo(partnerId, file) {
  const client = getSupabaseClient();
  const path = `partners/${partnerId}/logo-${Date.now()}-${file.name}`;
  const upload = await safeQuery(() => client.storage.from('listing-media').upload(path, file, { contentType: file.type, upsert: true }), 'admin.uploadPartnerLogo:storage', { allowNullData: true });
  if (upload.error) return upload;
  const saved = await updatePartner(partnerId, { logoStoragePath: path });
  if (saved.error) return saved;
  const url = await resolveMediaUrl(path);
  return { data: Object.assign({}, saved.data, { logoUrl: url }), error: null };
}

/* ---------------- Developments ---------------- */

async function listDevelopments(searchText) {
  const client = getSupabaseClient();
  let q = client.from('developments').select('id, name, zone_lite_id, promoter_partner_id, zones_lite(name,city), partners(name)').order('name');
  if (searchText) q = q.ilike('name', `%${searchText}%`);
  return safeQuery(() => q, 'admin.listDevelopments');
}

async function getDevelopmentForEdit(id) {
  const client = getSupabaseClient();
  return safeQuery(
    () => client.from('developments').select(`
      *, zones_lite(id,name,city,country_iso),
      representations(id, status, partner_id, listings(id, price_current, currency_iso, price_is_from, status, listing_content(locale,title,description)))
    `).eq('id', id).single(),
    'admin.getDevelopmentForEdit'
  );
}

async function createDevelopment({ name, zoneLiteId, promoterPartnerId }) {
  const client = getSupabaseClient();
  return safeQuery(() => client.from('developments').insert({ name, zone_lite_id: zoneLiteId, promoter_partner_id: promoterPartnerId }).select().single(), 'admin.createDevelopment');
}

async function updateDevelopment(id, fields) {
  const client = getSupabaseClient();
  const patch = {};
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.zoneLiteId !== undefined) patch.zone_lite_id = fields.zoneLiteId;
  if (fields.promoterPartnerId !== undefined) patch.promoter_partner_id = fields.promoterPartnerId;
  // Migration 0005 — validated against 2 real Z Imobiliária development
  // pages (total_units), plus reasonable industry-standard additions
  // flagged in the taxonomy doc as less verified than the rest.
  if (fields.totalUnits !== undefined) patch.total_units = fields.totalUnits;
  if (fields.buildingFloors !== undefined) patch.building_floors = fields.buildingFloors;
  if (fields.footprintAreaSqm !== undefined) patch.footprint_area_sqm = fields.footprintAreaSqm;
  if (fields.expectedCompletion !== undefined) patch.expected_completion = fields.expectedCompletion;
  if (fields.projectPhase !== undefined) patch.project_phase = fields.projectPhase;
  if (fields.developerName !== undefined) patch.developer_name = fields.developerName;
  return safeQuery(() => client.from('developments').update(patch).eq('id', id).select().single(), 'admin.updateDevelopment');
}

/** Safe delete — same discipline as deleteProperty above: never
    cascade-delete real leads, refuse clearly when they exist, cascade
    cleanly through empty structural rows otherwise. */
async function deleteDevelopment(id) {
  const client = getSupabaseClient();
  const full = await getDevelopmentForEdit(id);
  if (full.error) return full;

  const rep = (full.data.representations || [])[0];
  const listing = rep && (rep.listings || [])[0];

  if (listing) {
    const leadsCheck = await safeQuery(() => client.from('leads').select('id', { count: 'exact', head: true }).eq('listing_id', listing.id), 'admin.deleteDevelopment:leadsCheck', { allowNullData: true });
    if (!leadsCheck.error && leadsCheck.count > 0) {
      return { data: null, error: { type: 'has_real_leads', message: `Cannot delete — this development has ${leadsCheck.count} real lead(s) attached. Unpublish it instead of deleting, so the lead history is never lost.` } };
    }
    await safeQuery(() => client.from('listing_content').delete().eq('listing_id', listing.id), 'admin.deleteDevelopment:content', { allowNullData: true });
    await safeQuery(() => client.from('listings').delete().eq('id', listing.id), 'admin.deleteDevelopment:listing', { allowNullData: true });
  }
  await safeQuery(() => client.from('development_media').delete().eq('development_id', id), 'admin.deleteDevelopment:media', { allowNullData: true });
  if (rep) {
    await safeQuery(() => client.from('representations').delete().eq('id', rep.id), 'admin.deleteDevelopment:representation', { allowNullData: true });
  }
  return safeQuery(() => client.from('developments').delete().eq('id', id), 'admin.deleteDevelopment', { allowNullData: true });
}

/** Mirrors duplicateProperty exactly — same "practically free" three-
    insert shape, media stays with the original. */
async function duplicateDevelopment(id) {
  const original = await getDevelopmentForEdit(id);
  if (original.error) return original;
  const d = original.data;
  const rep = (d.representations || [])[0];
  const listing = rep && (rep.listings || [])[0];

  const client = getSupabaseClient();
  const newDev = await safeQuery(
    () => client.from('developments').insert({ name: d.name + ' (copy)', zone_lite_id: d.zone_lite_id, promoter_partner_id: d.promoter_partner_id }).select().single(),
    'admin.duplicateDevelopment:development'
  );
  if (newDev.error) return newDev;
  if (!rep) return newDev;

  const newRep = await safeQuery(
    () => client.from('representations').insert({ target_type: 'development', development_id: newDev.data.id, partner_id: rep.partner_id, status: 'proposed' }).select().single(),
    'admin.duplicateDevelopment:representation'
  );
  if (newRep.error || !listing) return newDev;

  const newListing = await safeQuery(
    () => client.from('listings').insert({ representation_id: newRep.data.id, channel: 'standard', price_current: listing.price_current, currency_iso: listing.currency_iso, price_is_from: listing.price_is_from, status: 'draft' }).select().single(),
    'admin.duplicateDevelopment:listing'
  );
  if (newListing.error) return newDev;

  const contentRows = (listing.listing_content || []).map(c => ({ listing_id: newListing.data.id, locale: c.locale, title: c.title, description: c.description }));
  if (contentRows.length) await safeQuery(() => client.from('listing_content').insert(contentRows), 'admin.duplicateDevelopment:content', { allowNullData: true });

  return newDev;
}

/* ---------------- Properties ---------------- */

async function listProperties(searchText) {
  const client = getSupabaseClient();
  const q = client.from('properties').select(`
    id, subtype, typology, area_sqm, zone_lite_id, zones_lite(name,city),
    representations(id, status, partner_id, partners(name), listings(id, price_current, currency_iso, status, listing_content(locale,title)))
  `).order('created_at', { ascending: false });
  const result = await safeQuery(() => q, 'admin.listProperties');
  if (!searchText || result.error) return result;
  // Search is client-side (small admin dataset, per Market First — a
  // full-text search index is not justified by this MVP's scale).
  const needle = searchText.toLowerCase();
  const filtered = (result.data || []).filter(p => {
    const rep = (p.representations || [])[0];
    const listing = rep && (rep.listings || [])[0];
    const title = listing && (listing.listing_content || []).map(c => c.title).join(' ');
    const zone = p.zones_lite && (p.zones_lite.name + ' ' + p.zones_lite.city);
    const partner = rep && rep.partners && rep.partners.name;
    const haystack = [p.id, title, zone, partner].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(needle);
  });
  return { data: filtered, error: null };
}

async function getPropertyForEdit(id) {
  const client = getSupabaseClient();
  return safeQuery(
    () => client.from('properties').select(`
      *, zones_lite(id,name,city,country_iso),
      representations(id, status, partner_id, listings(id, price_current, currency_iso, price_is_from, status, listing_content(locale,title,description)))
    `).eq('id', id).single(),
    'admin.getPropertyForEdit'
  );
}

async function createProperty({ subtype, typology, areaSqm, floor, zoneLiteId, developmentId }) {
  const client = getSupabaseClient();
  return safeQuery(
    () => client.from('properties').insert({ subtype, typology, area_sqm: areaSqm, floor, zone_lite_id: zoneLiteId, development_id: developmentId || null }).select().single(),
    'admin.createProperty'
  );
}

/** For the Partner Dashboard's own "+ New" flow — a plain
    createProperty() leaves the partner unable to see their own new
    row again, since the SELECT policy (Migration 0006) requires an
    existing representation. The Partner command creates both atomically, using
    'proposed' status (not yet an active, live listing — that's a
    separate, deliberate step, not implied by just creating a
    draft). Sensible minimal defaults; full field editing is a
    separate, later flow. */
async function createPropertyForPartner(fields) {
  const client = getSupabaseClient();
  return safeQuery(
    () => client.rpc('zfind_partner_create_property', {
      p_subtype: fields.subtype,
      p_typology: fields.typology ?? null,
      p_area_sqm: fields.areaSqm ?? null,
      p_floor: fields.floor ?? null,
      p_zone_lite_id: fields.zoneLiteId ?? null
    }),
    'admin.createPropertyForPartner'
  );
}

async function createDevelopmentForPartner(fields) {
  const client = getSupabaseClient();
  return safeQuery(
    () => client.rpc('zfind_partner_create_development', {
      p_name: fields.name,
      p_zone_lite_id: fields.zoneLiteId ?? null
    }),
    'admin.createDevelopmentForPartner'
  );
}

async function updateProperty(id, fields) {
  const client = getSupabaseClient();
  const patch = {};
  ['subtype', 'typology'].forEach(k => { if (fields[k] !== undefined) patch[k] = fields[k]; });
  if (fields.areaSqm !== undefined) patch.area_sqm = fields.areaSqm;
  if (fields.floor !== undefined) patch.floor = fields.floor;
  if (fields.zoneLiteId !== undefined) patch.zone_lite_id = fields.zoneLiteId;
  if (fields.developmentId !== undefined) patch.development_id = fields.developmentId;
  // Migration 0005 — legal/compliance
  if (fields.energyRating !== undefined) patch.energy_rating = fields.energyRating;
  if (fields.energyCertificateNumber !== undefined) patch.energy_certificate_number = fields.energyCertificateNumber;
  if (fields.licenseNumber !== undefined) patch.license_number = fields.licenseNumber;
  // Location
  if (fields.streetAddress !== undefined) patch.street_address = fields.streetAddress;
  if (fields.postalCode !== undefined) patch.postal_code = fields.postalCode;
  if (fields.latitude !== undefined) patch.latitude = fields.latitude;
  if (fields.longitude !== undefined) patch.longitude = fields.longitude;
  // Rooms & dimensions
  if (fields.bedrooms !== undefined) patch.bedrooms = fields.bedrooms;
  if (fields.livingRooms !== undefined) patch.living_rooms = fields.livingRooms;
  if (fields.bathrooms !== undefined) patch.bathrooms = fields.bathrooms;
  if (fields.grossPrivateAreaSqm !== undefined) patch.gross_private_area_sqm = fields.grossPrivateAreaSqm;
  if (fields.dependentAreaSqm !== undefined) patch.dependent_area_sqm = fields.dependentAreaSqm;
  if (fields.plotAreaSqm !== undefined) patch.plot_area_sqm = fields.plotAreaSqm;
  if (fields.yearBuilt !== undefined) patch.year_built = fields.yearBuilt;
  if (fields.condition !== undefined) patch.condition = fields.condition;
  if (fields.unitFloors !== undefined) patch.unit_floors = fields.unitFloors;
  // Financial — factual only, never calculated (see taxonomy doc)
  if (fields.condoFeeMonthly !== undefined) patch.condo_fee_monthly = fields.condoFeeMonthly;
  if (fields.imiAnnual !== undefined) patch.imi_annual = fields.imiAnnual;
  if (fields.taxableValue !== undefined) patch.taxable_value = fields.taxableValue;
  if (fields.paymentTerms !== undefined) patch.payment_terms = fields.paymentTerms;
  if (fields.acceptsTrade !== undefined) patch.accepts_trade = fields.acceptsTrade;
  // References & multimedia
  if (fields.agencyReference !== undefined) patch.agency_reference = fields.agencyReference;
  if (fields.tour360Url !== undefined) patch.tour_360_url = fields.tour360Url;
  return safeQuery(() => client.from('properties').update(patch).eq('id', id).select().single(), 'admin.updateProperty');
}

/** Safe delete: a naive DELETE on properties fails silently-ish
    against a generic FK error whenever a representation/listing still
    references it (no ON DELETE CASCADE, by design — migration 0001
    never added one). Found via a real Admin screenshot showing
    "Could not delete — it may still be referenced elsewhere" with no
    way to act on it.

    Correct behaviour, not a workaround: NEVER cascade-delete real
    leads — if any listing tied to this property has leads, refuse
    clearly and tell the caller exactly why. Only cascade through the
    purely structural, empty rows (listing_content, listing_media,
    listings, representations) when there is nothing real to lose. */
async function deleteProperty(id) {
  const client = getSupabaseClient();
  const full = await getPropertyForEdit(id);
  if (full.error) return full;

  const rep = (full.data.representations || [])[0];
  const listing = rep && (rep.listings || [])[0];

  if (listing) {
    const leadsCheck = await safeQuery(() => client.from('leads').select('id', { count: 'exact', head: true }).eq('listing_id', listing.id), 'admin.deleteProperty:leadsCheck', { allowNullData: true });
    if (!leadsCheck.error && leadsCheck.count > 0) {
      return { data: null, error: { type: 'has_real_leads', message: `Cannot delete — this property has ${leadsCheck.count} real lead(s) attached. Unpublish it instead of deleting, so the lead history is never lost.` } };
    }
    await safeQuery(() => client.from('listing_content').delete().eq('listing_id', listing.id), 'admin.deleteProperty:content', { allowNullData: true });
    await safeQuery(() => client.from('listing_media').delete().eq('listing_id', listing.id), 'admin.deleteProperty:media', { allowNullData: true });
    await safeQuery(() => client.from('listings').delete().eq('id', listing.id), 'admin.deleteProperty:listing', { allowNullData: true });
  }
  if (rep) {
    await safeQuery(() => client.from('representations').delete().eq('id', rep.id), 'admin.deleteProperty:representation', { allowNullData: true });
  }
  return safeQuery(() => client.from('properties').delete().eq('id', id), 'admin.deleteProperty', { allowNullData: true });
}

/** Duplicates a property (row + its representation + listing +
    listing_content) — "practically free" per the brief's own
    condition for building it. Media stays with the original; the
    duplicate starts with none (duplicates the LISTING, not photos). */
async function duplicateProperty(id) {
  const original = await getPropertyForEdit(id);
  if (original.error) return original;
  const p = original.data;
  const rep = (p.representations || [])[0];
  const listing = rep && (rep.listings || [])[0];

  const client = getSupabaseClient();
  const newProp = await safeQuery(
    () => client.from('properties').insert({ subtype: p.subtype, typology: p.typology, area_sqm: p.area_sqm, floor: p.floor, zone_lite_id: p.zone_lite_id, development_id: p.development_id }).select().single(),
    'admin.duplicateProperty:property'
  );
  if (newProp.error) return newProp;
  if (!rep) return newProp;

  const newRep = await safeQuery(
    () => client.from('representations').insert({ target_type: 'property', property_id: newProp.data.id, partner_id: rep.partner_id, status: 'proposed' }).select().single(),
    'admin.duplicateProperty:representation'
  );
  if (newRep.error || !listing) return newProp;

  const newListing = await safeQuery(
    () => client.from('listings').insert({ representation_id: newRep.data.id, channel: 'standard', price_current: listing.price_current, currency_iso: listing.currency_iso, price_is_from: listing.price_is_from, status: 'draft' }).select().single(),
    'admin.duplicateProperty:listing'
  );
  if (newListing.error) return newProp;

  const contentRows = (listing.listing_content || []).map(c => ({ listing_id: newListing.data.id, locale: c.locale, title: c.title, description: c.description }));
  if (contentRows.length) await safeQuery(() => client.from('listing_content').insert(contentRows), 'admin.duplicateProperty:content', { allowNullData: true });

  return newProp;
}

/* ---------------- Translations (listing_content) ---------------- */

async function upsertListingContent(listingId, locale, fields) {
  const client = getSupabaseClient();
  return safeQuery(
    () => client.from('listing_content').upsert({ listing_id: listingId, locale, title: fields.title, description: fields.description }, { onConflict: 'listing_id,locale' }).select().single(),
    'admin.upsertListingContent'
  );
}

/* ---------------- Publish / unpublish ---------------- */

async function setListingStatus(listingId, status) {
  if (!['published', 'draft'].includes(status)) {
    return { data: null, error: { type: 'malformed_response', context: 'admin.setListingStatus', message: 'status must be published or draft.' } };
  }
  const client = getSupabaseClient();
  const result = await safeQuery(() => client.from('listings').update({ status }).eq('id', listingId).select().single(), 'admin.setListingStatus');
  // SEO REGENERATION TRIGGER POINT: once the Vercel/domain phase is
  // done, this is where a Vercel Deploy Hook gets called (or a
  // Supabase Database Webhook on this same UPDATE does it server-side
  // instead — either is valid, not decided yet) to regenerate the
  // static SEO pages (services/seo-page-generator.js +
  // scripts/generate-seo-pages.js) so publish/unpublish reflects on
  // the indexable pages automatically. Not implemented here — no
  // infrastructure exists yet to call. Left as a comment, not a stub
  // function, so it isn't mistaken for something already wired up.
  return result;
}

/* ---------------- Media ----------------
   IMPORTANT, corrected: listing_media and development_media both have
   a COMPOSITE primary key (media_asset_id, listing_id) /
   (media_asset_id, development_id) — neither table has its own `id`
   column. An earlier version of this file assumed a plain `id` and
   would have failed on every write once used against the real schema
   — caught before shipping by checking migration 0001 directly rather
   than continuing to assume. Every function below identifies a row by
   its real composite key.

   One shared, parameterised implementation for both media tables —
   they differ only in table name, owner column, and bucket-path
   prefix; duplicating this logic per asset type would be exactly the
   kind of avoidable duplication the brief asks not to introduce. */
function _mediaOps(table, ownerColumn, pathPrefix) {
  async function upload(ownerId, file, opts) {
    const options = opts || {};
    const client = getSupabaseClient();

    // Real problem found while investigating this: a partner-uploaded
    // photo went straight to storage as-is, and media_assets.width/
    // height were always null — nothing ever measured or optimized
    // it. See services/image-optimize.js's header for the exact scope
    // decision (client-side resize+recompress, not a server pipeline).
    const optimized = await imageOptimizeModule.optimizeImage(file);
    const uploadBlob = optimized.blob;
    const uploadContentType = optimized.skipped ? file.type : 'image/jpeg';
    const uploadFileName = optimized.skipped ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg';

    const path = `${pathPrefix}/${ownerId}/${Date.now()}-${uploadFileName}`;
    const uploadResult = await safeQuery(() => client.storage.from('listing-media').upload(path, uploadBlob, { contentType: uploadContentType }), `admin.${table}.upload:storage`, { allowNullData: true });
    if (uploadResult.error) return uploadResult;

    const asset = await safeQuery(
      () => client.from('media_assets').insert({ media_type: 'image', visibility: 'public', original_storage_path: path, mime_type: uploadContentType, width: optimized.width, height: optimized.height }).select().single(),
      `admin.${table}.upload:asset`
    );
    if (asset.error) return asset;

    const existing = await safeQuery(() => client.from(table).select('position').eq(ownerColumn, ownerId).order('position', { ascending: false }).limit(1), `admin.${table}.upload:position`);
    const nextPosition = (existing.data && existing.data[0] ? existing.data[0].position + 1 : 0);

    const link = { media_asset_id: asset.data.id, position: nextPosition, is_cover: !!options.isCover };
    link[ownerColumn] = ownerId;
    return safeQuery(() => client.from(table).insert(link).select().single(), `admin.${table}.upload:link`);
  }

  async function list(ownerId) {
    const client = getSupabaseClient();
    const result = await safeQuery(
      () => client.from(table).select(`media_asset_id, ${ownerColumn}, position, is_cover, media_assets(id, original_storage_path, media_variants(variant_type, storage_path))`).eq(ownerColumn, ownerId).order('position'),
      `admin.${table}.list`
    );
    if (result.error) return result;
    const withUrls = await Promise.all((result.data || []).map(async m => Object.assign({}, m, { url: await resolveMediaUrl(m.media_assets.original_storage_path) })));
    return { data: withUrls, error: null };
  }

  /** `orderedMediaAssetIds` is the full ordered list of media_asset_id
      values for this ONE owner (never mixed across owners) — matches
      what a drag-and-drop UI naturally produces for a single gallery. */
  async function reorder(ownerId, orderedMediaAssetIds) {
    const client = getSupabaseClient();
    const results = await Promise.all(orderedMediaAssetIds.map((mediaAssetId, index) =>
      safeQuery(() => client.from(table).update({ position: index }).eq('media_asset_id', mediaAssetId).eq(ownerColumn, ownerId), `admin.${table}.reorder`, { allowNullData: true })
    ));
    const firstError = results.find(r => r.error);
    return firstError || { data: null, error: null };
  }

  async function setCover(ownerId, mediaAssetId) {
    const client = getSupabaseClient();
    await safeQuery(() => client.from(table).update({ is_cover: false }).eq(ownerColumn, ownerId), `admin.${table}.setCover:clear`, { allowNullData: true });
    return safeQuery(() => client.from(table).update({ is_cover: true }).eq('media_asset_id', mediaAssetId).eq(ownerColumn, ownerId).select().single(), `admin.${table}.setCover:set`);
  }

  async function remove(ownerId, mediaAssetId, storagePath) {
    const client = getSupabaseClient();
    const unlink = await safeQuery(() => client.from(table).delete().eq('media_asset_id', mediaAssetId).eq(ownerColumn, ownerId), `admin.${table}.delete:unlink`, { allowNullData: true });
    if (unlink.error) return unlink;
    if (storagePath) await safeQuery(() => client.storage.from('listing-media').remove([storagePath]), `admin.${table}.delete:storage`, { allowNullData: true });
    return { data: null, error: null };
  }

  return { upload, list, reorder, setCover, remove };
}

const _listingMediaOps = _mediaOps('listing_media', 'listing_id', 'listings');
const _developmentMediaOps = _mediaOps('development_media', 'development_id', 'developments');

async function uploadListingMedia(listingId, file, opts) { return _listingMediaOps.upload(listingId, file, opts); }
async function listListingMedia(listingId) { return _listingMediaOps.list(listingId); }
async function reorderListingMedia(listingId, orderedMediaAssetIds) { return _listingMediaOps.reorder(listingId, orderedMediaAssetIds); }
async function setCoverMedia(listingId, mediaAssetId) { return _listingMediaOps.setCover(listingId, mediaAssetId); }
async function deleteListingMedia(listingId, mediaAssetId, storagePath) { return _listingMediaOps.remove(listingId, mediaAssetId, storagePath); }

async function uploadDevelopmentMedia(developmentId, file, opts) { return _developmentMediaOps.upload(developmentId, file, opts); }
async function listDevelopmentMedia(developmentId) { return _developmentMediaOps.list(developmentId); }
async function reorderDevelopmentMedia(developmentId, orderedMediaAssetIds) { return _developmentMediaOps.reorder(developmentId, orderedMediaAssetIds); }
async function setCoverDevelopmentMedia(developmentId, mediaAssetId) { return _developmentMediaOps.setCover(developmentId, mediaAssetId); }
async function deleteDevelopmentMedia(developmentId, mediaAssetId, storagePath) { return _developmentMediaOps.remove(developmentId, mediaAssetId, storagePath); }

/** Creates a minimal, valid representation + draft listing for a
    Property or Development that doesn't have one yet — intentionally
    minimal (a starting price of 0 the admin edits immediately after),
    not a full pricing wizard (Market First). Previously this lived as
    a direct Supabase call inside app.js — moved here so the UI never
    writes to Supabase directly, matching every other operation. */
async function createInitialListing(kind, ownerId, partnerId) {
  const client = getSupabaseClient();
  const repInsert = kind === 'development'
    ? { target_type: 'development', development_id: ownerId, partner_id: partnerId, status: 'proposed' }
    : { target_type: 'property', property_id: ownerId, partner_id: partnerId, status: 'proposed' };
  const rep = await safeQuery(() => client.from('representations').insert(repInsert).select().single(), 'admin.createInitialListing:representation');
  if (rep.error) return rep;
  return safeQuery(
    () => client.from('listings').insert({ representation_id: rep.data.id, channel: 'standard', price_current: 0, currency_iso: 'EUR', status: 'draft' }).select().single(),
    'admin.createInitialListing:listing'
  );
}

/* ---------------- Leads ---------------- */

async function listLeads(opts) {
  const options = opts || {};
  const client = getSupabaseClient();
  let q = client.from('leads').select('id, listing_id, contact_type, name, email, phone, message, status, created_at').order('created_at', { ascending: false }).limit(200);
  if (options.contactType) q = q.eq('contact_type', options.contactType);
  const result = await safeQuery(() => q, 'admin.listLeads');
  if (result.error || !options.searchText) return result;
  const needle = options.searchText.toLowerCase();
  const filtered = (result.data || []).filter(l => [l.name, l.email, l.phone, l.message].filter(Boolean).join(' ').toLowerCase().includes(needle));
  return { data: filtered, error: null };
}

async function getLeadById(id) {
  const client = getSupabaseClient();
  return safeQuery(() => client.from('leads').select('*').eq('id', id).single(), 'admin.getLeadById');
}

/** Never built until now — found via a real need to remove a test
    partner record. Same safety discipline as deleteProperty/
    deleteDevelopment: representations.partner_id is NOT NULL (a
    representation always belongs to exactly one partner), so a
    partner with any properties/developments still cannot simply be
    deleted — refuse clearly, telling the caller exactly what to
    remove first, rather than a generic FK-violation error. Also
    checks developments.promoter_partner_id, a separate reference. */
async function deletePartner(id) {
  const client = getSupabaseClient();
  const repsCheck = await safeQuery(() => client.from('representations').select('id', { count: 'exact', head: true }).eq('partner_id', id), 'admin.deletePartner:repsCheck', { allowNullData: true });
  if (!repsCheck.error && repsCheck.count > 0) {
    return { data: null, error: { type: 'has_dependent_listings', message: `Cannot delete — this partner still has ${repsCheck.count} propert(y/ies)/development(s) attached. Delete or reassign those first.` } };
  }
  const promoterCheck = await safeQuery(() => client.from('developments').select('id', { count: 'exact', head: true }).eq('promoter_partner_id', id), 'admin.deletePartner:promoterCheck', { allowNullData: true });
  if (!promoterCheck.error && promoterCheck.count > 0) {
    return { data: null, error: { type: 'has_dependent_listings', message: `Cannot delete — this partner is still the promoter of ${promoterCheck.count} development(s). Reassign those first.` } };
  }
  return safeQuery(() => client.from('partners').delete().eq('id', id), 'admin.deletePartner', { allowNullData: true });
}
// Migration 0005 populated `features` with 36 real rows (elevator,
// pool, ev_charging, etc.) — these functions are the Admin's way to
// read/write which ones apply to a given property or development, via
// the property_features/development_features junction tables.

async function listFeatures() {
  const client = getSupabaseClient();
  return safeQuery(() => client.from('features').select('id, code, label').order('label'), 'admin.listFeatures');
}

async function getPropertyFeatureIds(propertyId) {
  const client = getSupabaseClient();
  return safeQuery(() => client.from('property_features').select('feature_id').eq('property_id', propertyId), 'admin.getPropertyFeatureIds');
}

async function getDevelopmentFeatureIds(developmentId) {
  const client = getSupabaseClient();
  return safeQuery(() => client.from('development_features').select('feature_id').eq('development_id', developmentId), 'admin.getDevelopmentFeatureIds');
}

/** Replaces the full feature set for a property/development in one
    call — delete everything, then insert the new selection. Simple
    and correct for a checkbox-list UI (the whole set is always
    submitted together, never a single toggle), at the cost of two
    round trips instead of a precise diff — acceptable for a list of
    at most 36 rows. */
async function setPropertyFeatures(propertyId, featureIds) {
  const client = getSupabaseClient();
  const del = await safeQuery(() => client.from('property_features').delete().eq('property_id', propertyId), 'admin.setPropertyFeatures:clear', { allowNullData: true });
  if (del.error) return del;
  if (!featureIds.length) return { data: [], error: null };
  return safeQuery(() => client.from('property_features').insert(featureIds.map(fid => ({ property_id: propertyId, feature_id: fid }))), 'admin.setPropertyFeatures:insert', { allowNullData: true });
}

async function setDevelopmentFeatures(developmentId, featureIds) {
  const client = getSupabaseClient();
  const del = await safeQuery(() => client.from('development_features').delete().eq('development_id', developmentId), 'admin.setDevelopmentFeatures:clear', { allowNullData: true });
  if (del.error) return del;
  if (!featureIds.length) return { data: [], error: null };
  return safeQuery(() => client.from('development_features').insert(featureIds.map(fid => ({ development_id: developmentId, feature_id: fid }))), 'admin.setDevelopmentFeatures:insert', { allowNullData: true });
}

/** Different from developments.js's own listUnitsForDevelopment,
    deliberately: that one is published-only, correct for what a
    visitor on the live site should see. This one shows every unit
    regardless of publish status — correct for Admin/Partner
    management, where a partner needs to see and edit a draft unit
    before it's ever published. RLS (Migration 0006), not a status
    filter, is what correctly restricts a partner_user to only their
    own development's units — same discipline as every other admin.js
    list function. */
async function listUnitsForDevelopment(developmentId) {
  const client = getSupabaseClient();
  return safeQuery(
    () => client.from('properties').select('id, subtype, typology, area_sqm, floor, zone_lite_id, zones_lite ( name, city, country_iso )').eq('development_id', developmentId).order('created_at'),
    'admin.listUnitsForDevelopment'
  );
}

/* ---------------- Zones (for dropdowns) ---------------- */

async function listZones() {
  const client = getSupabaseClient();
  return safeQuery(() => client.from('zones_lite').select('id, name, city, country_iso').order('name'), 'admin.listZones');
}

return {
  getDashboardCounts,
  listPartners, getPartnerById, createPartner, updatePartner, deletePartner, uploadPartnerLogo,
  listDevelopments, getDevelopmentForEdit, createDevelopment, updateDevelopment, deleteDevelopment, duplicateDevelopment, createDevelopmentForPartner,
  listProperties, getPropertyForEdit, createProperty, updateProperty, deleteProperty, duplicateProperty, createPropertyForPartner,
  upsertListingContent, setListingStatus, createInitialListing,
  uploadListingMedia, listListingMedia, reorderListingMedia, setCoverMedia, deleteListingMedia,
  uploadDevelopmentMedia, listDevelopmentMedia, reorderDevelopmentMedia, setCoverDevelopmentMedia, deleteDevelopmentMedia,
  listLeads, getLeadById,
  listUnitsForDevelopment,
  listFeatures, getPropertyFeatureIds, getDevelopmentFeatureIds, setPropertyFeatures, setDevelopmentFeatures,
  listZones,
};

});
