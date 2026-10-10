/* Contract: Admin import of an agency portfolio — Poliris / SeLoger format,
   French mandatory information built from the file, and re-import as a
   synchronisation (create / update / archive), zfind-web/src/services/listing-import/
   poliris.js + listing-import.js (shared by Admin, Partner and /api/feed-sync). Fixtures: tests/fixtures/poliris (annonces v1 in UTF-8 and
   Windows-1252, the next export v2, a spreadsheet export with the
   mandatory-information columns, the agency ZIP). No network. */
'use strict';
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const ADMIN = path.join(__dirname, '..', '..', 'apps', 'zfind-web', 'src', 'services', 'listing-import');
const FIX = path.join(__dirname, '..', 'fixtures', 'poliris');
const P = require(path.join(ADMIN, 'poliris.js'));
const imp = require(path.join(ADMIN, 'listing-import.js'));
const C = require(path.join(__dirname, '..', '..', 'apps', 'zfind-web', 'src', 'services', 'listing-compliance.js'));
let passed = 0;
function check(label, value, extra) { if (!value && extra !== undefined) console.error(JSON.stringify(extra, null, 1)); assert(value, label); passed += 1; console.log('PASS:', label); }
const bytes = name => new Uint8Array(fs.readFileSync(path.join(FIX, name)));
const sp = s => String(s).replace(/[  ]/g, ' ');

/* ---------------- Poliris parsing ---------------- */
const v1u = imp.readCsvBytes(bytes('annonces-v1-utf8.csv'));
const v1l = imp.readCsvBytes(bytes('annonces-v1-latin1.csv'));
check('Poliris detected (no header, "!#"), 4 listings, version from column 301, 329 columns (4.09)', v1u.format === 'poliris' && v1u.records.length === 4 && v1u.version === '4.09' && v1u.columnCount === 329 && v1u.invalidLines === 0);
check('Windows-1252 file decoded exactly like the UTF-8 one (é, €-free, « », –)', JSON.stringify(v1l.records) === JSON.stringify(v1u.records) && v1l.records[0].city === 'Évian-les-Bains' && v1l.records[0].title === 'T3 vue lac – résidence « Les Sources »');
check('<BR> becomes a line break in the description', v1u.records[0].description.split('\n').length === 3 && v1u.records[0].description.endsWith('www.georisques.gouv.fr'));
check('agency id (column 1) and technical id (175) read', JSON.stringify(v1u.agencyIds) === '["lacimmo74"]' && v1u.records[1].technicalId === '000207');
check('sale: column 15 is the buyer fee % and 302 / 303 the payer and the price without fees; price is FAI', v1u.records[0].feesPercent === '4.65' && v1u.records[0].feesPayer === '1' && v1u.records[0].priceExclFees === '430000' && v1u.records[0].priceIncludesFees === 'oui' && !('tenantFees' in v1u.records[0]));
check('rent: column 15 is the tenant fee in €, 306 the inventory fee, 304 the charges method, rent CC', v1u.records[1].tenantFees === '690' && v1u.records[1].inventoryFees === '144' && v1u.records[1].chargesMethod === '2' && v1u.records[1].rentIncludesCharges === 'oui' && !('feesPercent' in v1u.records[1]));
check('type + sub-type (column 181) combined', v1u.records[2].type === 'Maison/villa — Maison de village');
check('mapping is fixed for Poliris (positions), not guessed', JSON.stringify(imp.mapFor(v1u)) === JSON.stringify(v1u.map) && v1u.map.reference === 'reference');

const csvTable = imp.readCsvBytes(new Uint8Array(Buffer.from('Référence;Prix\nA;1\n', 'utf8')));
check('a header CSV is not mistaken for Poliris', csvTable.format === 'csv' && !P.looksLikePoliris('Référence;Prix\nA;1') && !P.looksLikePoliris('"a";"b"'));

// Variants seen in the wild: spaces around !#, a raw line break in a description, an older 4.08 line, the version only in the last column (4.11).
const base = { 1: 'ag', 2: 'R1', 3: 'Vente', 4: 'Appartement', 5: '74500', 6: 'Evian', 11: '100000', 15: '5', 18: '2', 20: 'T2', 21: 'Texte' };
const spaced = P.formatLine(Object.assign({}, base, { 301: '4.08-007' }), 306).split('!#').join(' !# ');
const broken = P.formatLine(Object.assign({}, base, { 2: 'R2', 21: 'Ligne un', 301: '4.08-007' }), 306).replace('Ligne un', 'Ligne un\r\nLigne deux');
const last411 = P.formatLine(Object.assign({}, base, { 2: 'R3', 334: '4.11' }), 334);
const mixed = P.toTable([spaced, broken, last411].join('\r\n'));
check('spaces around !#, raw line break in a field, 4.08-007 (306 columns) and a 4.11 line (version in the last column) all read', mixed.records.length === 3 && mixed.records[0].reference === 'R1'
  && mixed.records[1].description === 'Ligne un\nLigne deux' && mixed.records[2].reference === 'R3' && JSON.stringify(mixed.versions) === '["4.08-007","4.11"]', mixed);
check('a too-short line is counted, not imported', P.toTable('"a"!#"b"!#"c"\r\n' + spaced).invalidLines === 1);
check('fields: quotes replaced by apostrophes when writing (spec)', P.formatLine({ 1: 'Camping "Les flots"' }, 2) === '"Camping \'Les flots\'"!#""');

/* ---------------- normalisation ---------------- */
const rows1 = v1u.records.map(r => imp.normalizeRow(r, v1u.map));
const [ev1024, th2031, pub77, park] = rows1;
check('sale row: apartment, price, area, rooms, floor, year, GPS, 3 photo links (columns 85, 86, 164)', ev1024.subtype === 'apartment' && ev1024.transaction === 'sale' && ev1024.price === 450000 && ev1024.areaSqm === 78.5
  && ev1024.typology === 'T3' && ev1024.floor === 2 && ev1024.yearBuilt === 1975 && ev1024.latitude === 46.4012 && ev1024.photos.length === 3 && ev1024.photos[2].endsWith('/10.jpg') && ev1024.condoFeeMonthly === 180);
check('rent row: monthly, charges are the tenant’s monthly charges, furnished, deposit', th2031.transaction === 'rent' && th2031.rentalPeriod === 'monthly' && th2031.monthlyCharges === 90 && th2031.condoFeeMonthly === null && th2031.furnished === true && th2031.deposit === 2120);
check('house with photo files (ZIP) instead of links', pub77.subtype === 'villa' && pub77.typology === '6 pièces' && pub77.photos.length === 0 && pub77.photoFiles.join() === 'pub77-1.jpg,pub77-2.jpg' && pub77.plotAreaSqm === 830);
check('parking refused', park.errors.some(e => e.startsWith('Type non accepté')));
check('listing kinds Z Find does not take are refused with a French reason', imp.normalizeRow({ t: 'Location vacances', p: '500' }, { transaction: 't', price: 'p' }).errors.includes('Location saisonnière / vacances non prise en charge')
  && imp.normalizeRow({ t: 'Viager', p: '500' }, { transaction: 't', price: 'p' }).errors.includes('Viager non pris en charge'));
check('Poliris property types', imp.subtypeOf('Maison/villa') === 'villa' && imp.subtypeOf('Château') === 'villa' && imp.subtypeOf('Hôtel particulier') === 'villa' && imp.subtypeOf('Loft/atelier/surface') === 'apartment'
  && imp.subtypeOf('Immeuble') === null && imp.subtypeOf('Parking/box') === null && imp.subtypeOf('Terrain') === 'land' && imp.subtypeOf('Appartement — Studette') === 'apartment' && imp.typologyOf('apartment', 'Appartement — Studette', 1) === 'Studio');
check('DPE status: class → available, NS / non soumis → exempt, VI (vierge) → unknown', imp.dpeStatusOf('D') === 'available' && imp.dpeStatusOf('NS') === 'exempt' && imp.dpeStatusOf('Non soumis') === 'exempt' && imp.dpeStatusOf('VI') === null && imp.dpeOf('VI') === null);
check('fees payer: Poliris codes (sales) and words', imp.feesPayerOf('1', 'sale') === 'buyer' && imp.feesPayerOf('2', 'sale') === 'seller' && imp.feesPayerOf('3', 'sale') === 'shared'
  && imp.feesPayerOf('Acquéreur', 'sale') === 'buyer' && imp.feesPayerOf('vendeur', 'sale') === 'seller' && imp.feesPayerOf('acquéreur et vendeur', 'sale') === 'shared' && imp.feesPayerOf('bailleur', 'rent') === 'landlord' && imp.feesPayerOf('partagés', 'rent') === 'shared' && imp.feesPayerOf('', 'sale') === null);
check('charges method: 1 forfait, 2 provision, 3 left to the agency; oui / non', imp.chargesMethodOf('1') === 'forfait' && imp.chargesMethodOf('2') === 'provision' && imp.chargesMethodOf('3') === null && imp.chargesMethodOf('Provision sur charges') === 'provision'
  && imp.yesNo('OUI') === true && imp.yesNo('non') === false && imp.yesNo('') === undefined);

/* ---------------- French mandatory information from the file ---------------- */
const c1 = imp.complianceFor(ev1024, 'FR');
check('sale (Poliris): complete facts — DPE + costs, fees from price − price without fees, FAI, copropriété, Géorisques found in the description',
  c1.applicable && c1.profile === C.SALE && c1.complete && c1.text === 'mentions complètes' && C.sqlMissing(C.SALE, c1.facts).length === 0
  && c1.facts.agency_fees_amount === 20000 && c1.facts.agency_fees_percent === 4.65 && c1.facts.price_includes_agency_fees === true && c1.facts.condominium_lots_count === 24
  && c1.facts.annual_condominium_charges === 2160 && c1.facts.condominium_procedure_status === C.PROCEDURE_NONE && c1.facts.energy_cost_reference_year === '2023' && c1.facts.georisques_disclosure === true, c1);
const c2 = imp.complianceFor(th2031, 'FR');
check('rent (Poliris): rent excl. charges = rent CC − charges, provision, furnished, deposit, tenant / inventory fees; payer shared (tenant pays a share)',
  c2.profile === C.RENT && c2.facts.monthly_rent_excl_charges === 1060 && c2.facts.monthly_charges === 90 && c2.facts.charges_recovery_method === 'provision' && c2.facts.furnished === true
  && c2.facts.deposit_amount === 2120 && c2.facts.tenant_fees_amount === 690 && c2.facts.inventory_fees_amount === 144 && c2.facts.fees_payer === 'shared', c2);
check('rent: what the file cannot say is reported in French', !c2.complete && c2.text === 'mentions incomplètes : mention Géorisques, montant des honoraires, encadrement des loyers', c2.text);
const c3 = imp.complianceFor(pub77, 'FR');
check('sale paid by the seller without an amount, no energy costs: reported, valid facts still kept', !c3.complete && c3.facts.fees_payer === 'seller' && c3.facts.is_condominium === false && !('agency_fees_amount' in c3.facts)
  && c3.missing.includes('agency_fees_amount') && c3.missing.includes('energy_cost_min') && c3.text.startsWith('mentions incomplètes : mention Géorisques, montant des honoraires'), c3);
check('not applicable outside France or for non-residential property', imp.complianceFor(ev1024, 'BE').applicable === false && imp.complianceFor(Object.assign({}, ev1024, { subtype: 'land' }), 'FR').applicable === false);
const buyerPct = imp.complianceFor(Object.assign({}, ev1024, { priceExclFees: null, feesPercent: 5, price: 420000 }), 'FR');
check('sale: buyer fees from the Poliris % when the price without fees is missing', buyerPct.facts.agency_fees_amount === 20000, buyerPct.facts);

const hdr = imp.readCsvBytes(bytes('export-tableur-mentions.csv'));
const hmap = imp.autoMap(hdr.headers);
check('spreadsheet: the new French columns are recognised', hmap.ges === 'Classe GES' && hmap.feesPayer === 'Honoraires à la charge de' && hmap.feesAmount === 'Honoraires (€ TTC)' && hmap.condoAnnualCharges === 'Charges annuelles de copropriété (€)'
  && hmap.charges === 'Charges' && hmap.energyCostMin.startsWith('Dépenses d’énergie') && hmap.rentExclCharges === 'Loyer hors charges (€)' && hmap.georisques.startsWith('Mention Géorisques') && hmap.surfaceCarrez === 'Surface loi Carrez (m²)' && hmap.area === 'Surface habitable', hmap);
const [h501, h502] = hdr.records.map(r => imp.normalizeRow(r, hmap));
const ch1 = imp.complianceFor(h501, 'FR'); const ch2 = imp.complianceFor(h502, 'FR');
check('spreadsheet sale: complete (Carrez kept, procedure « non »)', ch1.complete && ch1.facts.surface_carrez_sqm === 94.1 && ch1.facts.agency_fees_amount === 20000 && ch1.facts.condominium_procedure_status === C.PROCEDURE_NONE, ch1);
check('spreadsheet rent: rent excl. charges from its own column, only fees amount and rent control missing', ch2.facts.monthly_rent_excl_charges === 1780 && ch2.facts.furnished === false && ch2.text === 'mentions incomplètes : montant des honoraires, encadrement des loyers', ch2);
const templateHeaders = imp.templateCsv().replace(/^﻿/, '').split('\r\n')[0].split(';');
const tmap = imp.autoMap(templateHeaders);
check('downloadable template: every column maps back to its own field', templateHeaders.length === imp.FIELDS.length && imp.FIELDS.every(([key, label]) => tmap[key] === label), imp.FIELDS.filter(([k, l]) => tmap[k] !== l).map(f => f[0]));
check('« Charges annuelles » is never taken by « Charges »', imp.autoMap(['Charges annuelles', 'Prix']).charges === undefined && imp.autoMap(['Charges annuelles', 'Prix']).condoAnnualCharges === 'Charges annuelles');

const merged = imp.mergeFacts(C.RENT, { georisques_disclosure: true, rent_control_status: 'not_applicable', fees_payer: 'landlord', agency_fees_amount: 900, dpe_status: 'exempt', dpe_exemption_reason: 'x' }, c2.facts);
check('merge: manual answers kept (Géorisques, encadrement, amount), file wins where it speaks, branches pruned (exempt → available)',
  merged.georisques_disclosure === true && merged.rent_control_status === 'not_applicable' && merged.agency_fees_amount === 900 && merged.fees_payer === 'shared' && merged.dpe_status === 'available' && !('dpe_exemption_reason' in merged), merged);

/* ---------------- synchronisation plan ---------------- */
// The portfolio as the first import left it (what loadPortfolio would read back).
let lid = 0;
function entryFromRow(row, status, facts) {
  lid += 1;
  return {
    reference: row.reference, refKey: row.reference.toLowerCase(), propertyId: 'prop-' + lid, archivedOnly: false,
    property: { agency_reference: row.reference, area_sqm: row.areaSqm, plot_area_sqm: row.plotAreaSqm, typology: row.typology, bedrooms: row.bedrooms, bathrooms: row.bathrooms, floor: row.floor, year_built: row.yearBuilt, energy_rating: row.energyRating,
      condo_fee_monthly: row.condoFeeMonthly, imi_annual: row.propertyTax, postal_code: row.postcode, street_address: row.address, latitude: row.latitude, longitude: row.longitude },
    listing: { id: 'lst-' + lid, status: status || 'draft', transactionType: row.transaction, price: row.price, title: row.title, description: row.description || '' },
    queuedUrls: row.photos.slice(), compliance: { facts: facts === undefined ? imp.complianceFor(row, 'FR').facts || {} : facts }
  };
}
const portfolio = [entryFromRow(ev1024, 'published'), entryFromRow(th2031), entryFromRow(pub77, 'pending_review'),
  { reference: 'OLD-1', refKey: 'old-1', propertyId: 'prop-old', listing: { id: 'lst-old', status: 'archived', price: 1, title: 'Vendue' }, queuedUrls: [], compliance: { facts: {} } }];

const same = imp.planSync(rows1, portfolio, { country: 'FR', fullSync: true, lineOffset: 1 });
check('same file again: nothing to create, update or archive', same.counts.create === 0 && same.counts.update === 0 && same.counts.archive === 0 && same.counts.unchanged === 3 && same.counts.error === 1, same.counts);

const v2 = imp.readCsvBytes(bytes('annonces-v2-latin1.csv'));
const rows2 = v2.records.map(r => imp.normalizeRow(r, v2.map));
const plan = imp.planSync(rows2, portfolio, { country: 'FR', fullSync: true, lineOffset: 1 });
check('next export: 1 to create, 1 to update, 1 to archive, 1 in error, 1 unchanged', plan.counts.create === 1 && plan.counts.update === 1 && plan.counts.archive === 1 && plan.counts.error === 1 && plan.counts.unchanged === 1, plan.counts);
const u = plan.updates[0];
check('update: the price change is shown « Prix : 450 000 € → 435 000 € » and only the price is written', u.row.reference === 'EV-1024' && sp(imp.changeText(u.changes[0])) === 'Prix : 450 000 € → 435 000 €'
  && JSON.stringify(u.commercial) === '{"priceCurrent":435000}' && !Object.keys(u.property).length && !Object.keys(u.content).length && !u.photos.length && u.facts === null);
check('archive: the listing absent from the file (PUB-77), never the already archived one', plan.archives.length === 1 && plan.archives[0].reference === 'PUB-77' && plan.archives[0].status === 'pending_review');
check('create: the new studio (sale), with facts — DPE « NS » = exempt (reason to ask), procedure in progress', plan.creates[0].row.reference === 'EV-1100' && plan.creates[0].line === 4
  && plan.creates[0].compliance.facts.dpe_status === 'exempt' && plan.creates[0].compliance.missing.includes('dpe_exemption_reason') && plan.creates[0].compliance.facts.condominium_procedure_status === 'Procédure en cours : Mandat ad hoc', plan.creates[0].compliance);
check('error: the parking line, with its file line number', plan.errors[0].row.reference === 'EV-P12' && plan.errors[0].line === 3);
const partial = imp.planSync(rows2, portfolio, { country: 'FR', fullSync: false });
check('without « import complet »: nothing archived', partial.counts.archive === 0 && partial.counts.update === 1);
check('a file without any reference never archives anything', imp.planSync([imp.normalizeRow({ p: '100' }, { price: 'p' })], portfolio, { fullSync: true }).archives.length === 0
  && /Aucune référence/.test(imp.planSync([imp.normalizeRow({ p: '100' }, { price: 'p' })], portfolio, { fullSync: true }).archiveBlocked));

// Facts change on a PUBLISHED listing: reported, never written (the SQL forbids it).
const pubChanged = Object.assign({}, ev1024, { energyCostMin: 1300 });
const pubPlan = imp.planSync([pubChanged], portfolio, { country: 'FR' });
check('published listing whose facts changed in the file: no facts written, French note', pubPlan.updates.length === 1 && pubPlan.updates[0].facts === null && pubPlan.updates[0].changes.length === 0
  && pubPlan.updates[0].notes.some(n => n.startsWith('Annonce en ligne : les mentions obligatoires du fichier ne sont pas appliquées')));
const draftChanged = Object.assign({}, th2031, { deposit: 2300, photos: th2031.photos.concat(['https://photos.lacimmo.test/th2031/2.jpg']), description: 'Nouveau texte', bedrooms: 2 });
const dPlan = imp.planSync([draftChanged], portfolio, { country: 'FR' }).updates[0];
check('draft listing: facts merged and re-sent for validation, new photo only, description and rooms', dPlan.facts && dPlan.facts.deposit_amount === 2300 && dPlan.photos.join() === 'https://photos.lacimmo.test/th2031/2.jpg' && dPlan.photoOffset === 1
  && dPlan.content.description === 'Nouveau texte' && dPlan.content.title === th2031.title && dPlan.property.bedrooms === 2
  && dPlan.changes.map(c => sp(imp.changeText(c))).join(' | ') === 'Chambres : 1 → 2 | Description : modifiée | Photos : +1 nouvelle | Mentions obligatoires : mises à jour (à revalider)', dPlan.changes);
const archivedOnly = imp.planSync([th2031], [{ reference: 'TH-2031', refKey: 'th-2031', listing: null, archivedOnly: true }], { country: 'FR' });
check('a reference whose listing was archived on Z Find: reported, not recreated twice', archivedOnly.counts.error === 1 && /archivée/.test(archivedOnly.errors[0].message));
const grouped = imp.planSync([Object.assign({}, ev1024, { agencyId: 'autre' }), th2031], [], { country: 'FR', agencyId: 'lacimmo74' });
check('grouped file: lines of another software agency id are ignored', grouped.counts.ignored === 1 && grouped.counts.create === 1);

/* ---------------- portfolio read-back ---------------- */
const pf = imp.portfolioFromRows([
  { id: 'r1', properties: { id: 'p1', agency_reference: ' EV-1 ', removed_at: null }, listings: [
    { id: 'l-old', status: 'archived', created_at: '2026-01-01', listing_content: [] },
    { id: 'l-new', status: 'published', transaction_type: 'sale', price_current: 10, created_at: '2026-02-01', listing_content: [{ locale: 'en', title: 'EN' }, { locale: 'fr', title: 'FR', description: 'd' }] }] },
  { id: 'r2', properties: { id: 'p2', agency_reference: null }, listings: [{ id: 'x', status: 'draft' }] },
  { id: 'r3', properties: { id: 'p3', agency_reference: 'GONE', removed_at: '2026-03-01' }, listings: [{ id: 'y', status: 'draft' }] },
  { id: 'r4', properties: { id: 'p4', agency_reference: 'ARCH' }, listings: [{ id: 'z', status: 'archived', created_at: '2026-01-01' }] }
]);
check('portfolio: live listing per reference (French text), no reference / removed property left out, archived-only flagged',
  pf.length === 2 && pf[0].refKey === 'ev-1' && pf[0].listing.id === 'l-new' && pf[0].listing.title === 'FR' && pf[1].refKey === 'arch' && pf[1].listing === null && pf[1].archivedOnly === true, pf);

/* ---------------- apply ---------------- */
(async () => {
  const log = [];
  let n = 0;
  const admin = {
    async createProperty(f) { n += 1; log.push(['createProperty', f]); return { data: { id: 'np-' + n }, error: null }; },
    async updateProperty(id, f) { log.push(['updateProperty', id, f]); return { data: {}, error: null }; },
    async createInitialListing(kind, id) { log.push(['createInitialListing', id]); return { data: { id: 'nl-' + id }, error: null }; },
    async updateListingCommercial(id, f) { log.push(['updateListingCommercial', id, f]); return { data: {}, error: null }; },
    async upsertListingContent(id, locale, f) { log.push(['upsertListingContent', id, locale, f]); return { data: {}, error: null }; },
    async setListingStatus(id, st) { log.push(['setListingStatus', id, st]); return { data: {}, error: null }; },
    async uploadListingMedia(id, file, o) { log.push(['upload', id, file.name, o.isCover]); return { data: {}, error: null }; }
  };
  const saved = [];
  const compliance = Object.assign({}, C, {
    async saveListingCompliance(id, facts, evidence) { saved.push({ id, facts, evidence }); return id === 'lst-2' ? { data: null, error: { message: 'Listing compliance access denied' } } : { data: {}, error: null }; }
  });
  const ctx = { partnerId: 'p-lac', country: 'FR', admin, compliance, source: { format: 'poliris', fileName: 'annonces.csv', version: '4.09' }, communeResolver: async () => ({ code: '74119', name: 'Évian-les-Bains' }) };
  // communeResolver avoids the network; zfind_set_asset_commune goes through the client: give importRow one.
  const fakeSb = { getSupabaseClient: () => ({ rpc: async () => ({ data: {}, error: null }) }) };
  const vm = require('vm');
  const sandbox = { window: { ZFindServices: { supabaseClient: fakeSb, poliris: P, listingCompliance: C } }, TextDecoder, console, Intl };
  vm.runInNewContext(fs.readFileSync(path.join(ADMIN, 'listing-import.js'), 'utf8'), sandbox, { filename: 'import.js' });
  const svc = sandbox.window.ZFindServices.listingImport;
  const plan2 = svc.planSync(rows2, portfolio, { country: 'FR', fullSync: true, lineOffset: 1 });
  const out = await svc.applyPlan(plan2, ctx);
  const byKind = k => out.results.filter(r => r.kind === k);
  check('apply: one creation, one update, one archive, the parking error and the unchanged listing reported', out.results.map(r => r.kind).sort().join() === 'archive,create,error,unchanged,update');
  check('creation: draft listing + facts saved after the listing exists, with import evidence', log.some(l => l[0] === 'createInitialListing') && saved.length === 1 && saved[0].id === 'nl-np-1' && saved[0].facts.dpe_status === 'exempt'
    && saved[0].evidence.source === 'admin_import' && saved[0].evidence.format === 'poliris' && saved[0].evidence.version === '4.09' && byKind('create')[0].compliance.startsWith('mentions incomplètes : '));
  check('update: only the price written on the published listing; no facts sent', log.filter(l => l[1] === 'lst-1').map(l => l[0] + JSON.stringify(l[2])).join() === 'updateListingCommercial{"priceCurrent":435000}' && !saved.some(s => s.id === 'lst-1')
    && sp(byKind('update')[0].message) === 'Prix : 450 000 € → 435 000 €');
  check('archive: through the lifecycle command, to archived — never a delete', log.some(l => l[0] === 'setListingStatus' && l[1] === 'lst-3' && l[2] === 'archived') && byKind('archive')[0].status === 'ok' && byKind('archive')[0].message.includes('absente du fichier')
    && !log.some(l => /delete|remove/i.test(l[0])));
  check('nothing published', !log.some(l => l[0] === 'setListingStatus' && l[2] !== 'archived'));

  // A compliance failure never blocks the listing; ZIP photos uploaded for new listings (first = cover).
  const ctx2 = Object.assign({}, ctx, { zipPhoto: async name => (name === 'pub77-1.jpg' || name === 'pub77-2.jpg' ? new Blob(['x']) : null) });
  const out2 = await svc.applyPlan(svc.planSync([pub77], [], { country: 'FR' }), ctx2);
  check('ZIP photo files uploaded to the new listing, first one as cover', out2.results[0].status === 'ok' && log.filter(l => l[0] === 'upload').map(l => l[2] + ':' + l[3]).join() === 'pub77-1.jpg:true,pub77-2.jpg:false' && out2.results[0].message.includes('2 photo(s) du ZIP'));
  const failing = svc.planSync([draftChanged], portfolio, { country: 'FR' });
  const out3 = await svc.applyPlan(failing, ctx);
  check('facts refused by the database: the rest is applied, the error is reported in French', out3.results[0].kind === 'update' && out3.results[0].status === 'error'
    && out3.results[0].message.includes('Chambres : 1 → 2') && out3.results[0].compliance === 'mentions non enregistrées : Vous n’avez pas accès aux mentions de cette annonce.' && out3.photoJobs[0].offset === 1);

  /* ---------------- report ---------------- */
  const csv = imp.resultsCsv(out.results);
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  check('report CSV: BOM, French header, one line per result, « ; » escaped', csv.charCodeAt(0) === 0xFEFF && lines[0] === 'Ligne du fichier;Référence;Action;Résultat;Détail;Mentions obligatoires;Identifiant annonce'
    && lines.length === 1 + out.results.length && lines.some(l => l.startsWith('3;EV-P12;Erreur;Erreur;')) && lines.some(l => /^;PUB-77;Retrait;OK;/.test(l)) && imp.resultsCsv([{ kind: 'create', status: 'ok', message: 'a;b' }]).includes('"a;b"'));

  /* ---------------- ZIP (agency export) ---------------- */
  let JSZip = null;
  for (const p of ['jszip', process.env.JSZIP_PATH, '/opt/node-tools/node_modules/jszip'].filter(Boolean)) { try { JSZip = require(p); break; } catch (_) { /* next */ } }
  if (JSZip) {
    const t = await imp.readZip(fs.readFileSync(path.join(FIX, 'lacimmo74.zip')), JSZip);
    const blob = await t.zipPhoto('PUB77-1.JPG');
    check('ZIP: Annonces.csv (Windows-1252) found and read as Poliris, photo files reachable by name', t.format === 'poliris' && t.records.length === 4 && t.zipEntry === 'Annonces.csv' && t.zipPhotoCount === 2 && blob && blob.size > 0 && (await t.zipPhoto('absent.jpg')) === null);
  } else console.log('SKIP: ZIP reading (jszip not installed here; covered by the browser test)');

  console.log(`\nLISTING IMPORT — POLIRIS & SYNC: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
