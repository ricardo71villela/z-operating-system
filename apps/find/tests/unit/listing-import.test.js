/* Contract: Admin « Nous chargeons pour vous » (zfind-web/src/services/listing-import/listing-import.js, shared with the Partner panel and /api/feed-sync).
   An agency's CSV / Excel export → mapped columns → normalised rows →
   property + DRAFT listing per row through the existing admin commands.
   Never publishes; a known agency reference becomes an update (sync);
   one failing row never stops the others. No network.
   Poliris, compliance facts and sync decisions: listing-import-poliris.test.js. */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const SRC = path.join(__dirname, '..', '..', 'apps', 'zfind-web', 'src', 'services', 'listing-import', 'listing-import.js');
let passed = 0;
function check(label, value) { assert(value, label); passed += 1; console.log('PASS:', label); }

const imp = require(SRC);

/* ---------------- parsing ---------------- */
const csv = [
  'Référence;Type d\'annonce;Type de bien;Prix;Surface habitable;Pièces;Chambres;Code postal;Ville;Titre;Descriptif;DPE;Charges;Taxe foncière;Photos',
  'A1;Vente;Appartement;350 000 €;72,5 m²;3;2;74500;Évian-les-Bains;;"Bel appartement; vue lac,\nproche gare";Classe énergie C;120;950;https://x.test/1.jpg|https://x.test/2.jpg',
  'A2;Location;Maison;1.850;140;5;4;74200;Thonon-les-Bains;Maison familiale;;D;;;',
  'A3;Vente;Parking;25000;12;;;74500;Évian-les-Bains;;;;;;',
  'A4;Vente;Studio;;20;1;0;74500;Évian-les-Bains;;;Non soumis à DPE;;;'
].join('\r\n');
// What French Excel produces (Windows-1252: Latin-1 plus € at 0x80).
const latin1 = Uint8Array.from([...csv].map(c => (c === '€' ? 0x80 : c.charCodeAt(0))));
const table = imp.readCsvBytes(latin1);
check('Windows-1252 file decoded (accents kept)', table.headers[0] === 'Référence' && table.records[0]['Ville'] === 'Évian-les-Bains');
check('semicolon detected; quoted cell keeps ; and line break', table.records.length === 4 && table.records[0]['Descriptif'] === 'Bel appartement; vue lac,\nproche gare');
const utf8 = imp.readCsvBytes(new Uint8Array(Buffer.from('﻿Ref,Prix,Ville\n"B1","420000","Annecy"\n', 'utf8')));
check('UTF-8 with BOM and comma delimiter', utf8.headers[0] === 'Ref' && utf8.records[0].Prix === '420000' && utf8.records[0].Ville === 'Annecy');
const tabs = imp.readCsvBytes(new Uint8Array(Buffer.from('reference\tprix\nC1\t100\n', 'utf8')));
check('tab-separated export', tabs.records[0].prix === '100');

/* ---------------- mapping ---------------- */
const map = imp.autoMap(table.headers);
check('French headers mapped automatically', map.reference === 'Référence' && map.transaction === "Type d'annonce" && map.type === 'Type de bien' && map.price === 'Prix'
  && map.area === 'Surface habitable' && map.rooms === 'Pièces' && map.bedrooms === 'Chambres' && map.postcode === 'Code postal' && map.city === 'Ville'
  && map.title === 'Titre' && map.description === 'Descriptif' && map.dpe === 'DPE' && map.charges === 'Charges' && map.tax === 'Taxe foncière' && map.photos === 'Photos');
check('one column is never used for two fields', new Set(Object.values(map)).size === Object.values(map).length);

/* ---------------- values ---------------- */
check('French number formats', imp.num('350 000 €') === 350000 && imp.num('1.250.000') === 1250000 && imp.num('1 250,50') === 1250.5 && imp.num('72,5 m²') === 72.5 && imp.num('1,250,000') === 1250000 && imp.num('350000.00') === 350000 && imp.num('350\u202f000\u00a0€') === 350000 && imp.num('') === null && imp.num('n/c') === null);
check('transaction: location / loyer → rent, default sale', imp.transactionOf('Location') === 'rent' && imp.transactionOf('LOYER') === 'rent' && imp.transactionOf('Vente') === 'sale' && imp.transactionOf('') === 'sale');
check('property types', imp.subtypeOf('Maison de village') === 'villa' && imp.subtypeOf('Appartement T3') === 'apartment' && imp.subtypeOf('Terrain à bâtir') === 'land'
  && imp.subtypeOf('Local commercial') === 'retail' && imp.subtypeOf('Bureaux') === 'office' && imp.subtypeOf('Garage') === null && imp.subtypeOf('Cave') === null);
check('typology from rooms or from the type text', imp.typologyOf('apartment', 'Appartement', 3) === 'T3' && imp.typologyOf('apartment', 'Studio', 1) === 'Studio'
  && imp.typologyOf('apartment', 'Appartement F4', null) === 'T4' && imp.typologyOf('villa', 'Maison', 5) === '5 pièces' && imp.typologyOf('land', 'Terrain', null) === null);
check('DPE letter only when it is one', imp.dpeOf('C') === 'C' && imp.dpeOf('Classe énergie C') === 'C' && imp.dpeOf('d (152 kWh)') === 'D'
  && imp.dpeOf('Non soumis à DPE') === null && imp.dpeOf('Vierge') === null && imp.dpeOf('En cours') === null);

const rows = table.records.map(r => imp.normalizeRow(r, map));
const [r1, r2, r3, r4] = rows;
check('sale row normalised', r1.reference === 'A1' && r1.subtype === 'apartment' && r1.transaction === 'sale' && r1.rentalPeriod === null && r1.price === 350000
  && r1.areaSqm === 72.5 && r1.typology === 'T3' && r1.bedrooms === 2 && r1.postcode === '74500' && r1.energyRating === 'C' && r1.condoFeeMonthly === 120 && r1.propertyTax === 950 && r1.errors.length === 0);
check('missing title built from typology and commune', r1.title === 'T3 — Évian-les-Bains');
check('photo links kept for the server import', r1.photos.length === 2 && r1.warnings.some(w => w.includes('2 photo')));
const numbered = imp.normalizeRow({ Prix: '100', 'Photo 1': 'https://a.test/1.jpg', 'Photo 10': 'https://a.test/10.jpg', 'Photo 2': 'https://a.test/2.jpg http://a.test/2b.jpg', 'Photo 3': 'n/a' }, imp.autoMap(['Prix', 'Photo 1', 'Photo 10', 'Photo 2', 'Photo 3']));
check('numbered photo columns (Photo 1, Photo 2… Photo 10) collected in order, duplicates and non-links dropped', numbered.photos.join() === 'https://a.test/1.jpg,https://a.test/2.jpg,http://a.test/2b.jpg,https://a.test/10.jpg');
check('rent row: monthly, house typology, own title, no description warning', r2.transaction === 'rent' && r2.rentalPeriod === 'monthly' && r2.price === 1850 && r2.subtype === 'villa' && r2.typology === '5 pièces' && r2.title === 'Maison familiale' && r2.warnings.includes('Sans description'));
check('parking refused (not a Z Find type)', r3.errors.some(e => e.includes('Type non accepté')));
check('no price → blocking error; studio typology; no DPE warning', r4.errors.includes('Prix manquant') && r4.typology === 'Studio' && r4.energyRating === null && r4.warnings.includes('Sans classe DPE'));

/* ---------------- import (browser path, fake Supabase) ---------------- */
(async () => {
  const rpcs = [];
  const queries = [];
  const fakeClient = {
    from(table) {
      const q = { calls: [['from', table]] };
      ['select', 'eq', 'in'].forEach(m => { q[m] = (...a) => { q.calls.push([m, ...a]); return q; }; });
      q.then = (ok, ko) => {
        const data = table === 'representations' ? [{
          id: 'rep-a2', status: 'active',
          properties: { id: 'prop-a2', agency_reference: 'a2', area_sqm: 140, typology: '5 pièces', bedrooms: 4, postal_code: '74200', energy_rating: 'D', removed_at: null },
          listings: [{ id: 'lst-a2', status: 'draft', transaction_type: 'rent', rental_period: 'monthly', price_current: 1900, created_at: '2026-10-01T10:00:00Z', listing_content: [{ locale: 'fr', title: 'Maison familiale', description: '' }] }]
        }] : [];
        return Promise.resolve({ data, error: null }).then(ok, ko);
      };
      queries.push(q);
      return q;
    },
    async rpc(name, args) {
      rpcs.push([name, args]);
      if (name === 'zfind_commune_search') {
        if (args.p_query === '74500') return { data: [{ code: '74119', name: 'Évian-les-Bains' }, { code: '74218', name: 'Neuvecelle' }], error: null };
        return { data: [], error: null };
      }
      if (name === 'zfind_set_asset_commune') return { data: { zone_lite_id: 'z1' }, error: null };
      return { data: null, error: null };
    }
  };
  const sandbox = { window: { ZFindServices: { supabaseClient: { getSupabaseClient: () => fakeClient } } }, TextDecoder, console, Intl };
  vm.runInNewContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'import.js' });
  const svc = sandbox.window.ZFindServices.listingImport;
  check('browser build registers window.ZFindServices.listingImport', svc && typeof svc.planSync === 'function' && typeof svc.applyPlan === 'function');

  const log = [];
  let n = 0;
  const admin = {
    async createProperty(f) { log.push(['createProperty', f]); n += 1; return { data: { id: 'prop-' + n }, error: null }; },
    async updateProperty(id, f) { log.push(['updateProperty', id, f]); return { data: {}, error: null }; },
    async createInitialListing(kind, id, partnerId) { log.push(['createInitialListing', kind, id, partnerId]); return { data: { id: 'lst-' + id, status: 'draft' }, error: null }; },
    async updateListingCommercial(id, f) {
      log.push(['updateListingCommercial', id, f]);
      return id === 'lst-prop-2' ? { data: null, error: { message: 'boom' } } : { data: {}, error: null };
    },
    async upsertListingContent(id, locale, f) { log.push(['upsertListingContent', id, locale, f]); return { data: {}, error: null }; },
    async setListingStatus(id, st) { log.push(['setListingStatus', id, st]); return { data: {}, error: null }; }
  };
  const portfolio = await svc.loadPortfolio('partner-1');
  check('portfolio read for this agency only, then its queued photo links', JSON.stringify(queries[0].calls.slice(2)) === JSON.stringify([['eq', 'partner_id', 'partner-1'], ['eq', 'target_type', 'property']])
    && queries[0].calls[1][1].includes('properties!inner(') && queries[0].calls[1][1].includes('agency_reference') && queries[0].calls[1][1].includes('listing_content(')
    && queries[1].calls[0][1] === 'zfind_media_import_queue' && JSON.stringify(queries[1].calls[2]) === JSON.stringify(['in', 'listing_id', ['lst-a2']]));
  check('portfolio entry keyed by agency reference', portfolio.data.length === 1 && portfolio.data[0].refKey === 'a2' && portfolio.data[0].listing.id === 'lst-a2' && portfolio.data[0].listing.title === 'Maison familiale');

  const extra = svc.normalizeRow({ Ref: 'B9', Prix: '200000', Type: 'Maison', CP: '01210', Ville: 'Ferney' }, { reference: 'Ref', price: 'Prix', type: 'Type', postcode: 'CP', city: 'Ville' });
  const plan = svc.planSync([r1, r2, r3, r4, extra], portfolio.data, { country: 'FR' });
  check('plan: 2 to create, known reference (case-insensitive) to update, refused type and missing price in error',
    plan.counts.create === 2 && plan.counts.update === 1 && plan.counts.error === 2 && plan.counts.archive === 0 && plan.updates[0].row === r2);
  check('update shows the rent change in French', plan.updates[0].changes.map(c => svc.changeText(c)).join('|').replace(/[  ]/g, ' ') === 'Loyer : 1 900 € → 1 850 €');
  check('error lines carry the file line number', plan.errors.map(e => e.line).join(',') === '4,5');

  const progress = [];
  const out = await svc.applyPlan(plan, { partnerId: 'partner-1', country: 'FR', admin }, (done, total, r) => progress.push([done, total, r.kind]));
  const results = out.results;
  check('results: errors, created, failed step, updated', results.map(r => r.kind + ':' + r.status).join(',') === 'error:error,error:error,create:ok,create:error,update:ok' && progress.length === 3);
  check('row 1: property created with type, typology, area', log[0][0] === 'createProperty' && log[0][1].subtype === 'apartment' && log[0][1].typology === 'T3' && log[0][1].areaSqm === 72.5);
  const up = log.find(l => l[0] === 'updateProperty' && l[1] === 'prop-1')[2];
  check('row 1: characteristics, reference, address fields, taxe foncière', up.agencyReference === 'A1' && up.bedrooms === 2 && up.energyRating === 'C' && up.postalCode === '74500'
    && up.grossPrivateAreaSqm === 72.5 && up.condoFeeMonthly === 120 && up.imiAnnual === 950 && !('photos' in up));
  check('row 1: commune chosen by name among the postcode\'s communes', rpcs.some(([nme, a]) => nme === 'zfind_set_asset_commune' && a.p_asset_id === 'prop-1' && a.p_code === '74119' && a.p_country === 'FR' && a.p_kind === 'property')
    && results[2].message.startsWith('Commune : Évian-les-Bains'));
  check('row 1: draft listing for the agency, price, French text', log.some(l => l[0] === 'createInitialListing' && l[1] === 'property' && l[2] === 'prop-1' && l[3] === 'partner-1')
    && log.some(l => l[0] === 'updateListingCommercial' && l[1] === 'lst-prop-1' && l[2].transactionType === 'sale' && l[2].priceCurrent === 350000 && l[2].currencyIso === 'EUR' && l[2].rentalPeriod === null)
    && log.some(l => l[0] === 'upsertListingContent' && l[1] === 'lst-prop-1' && l[2] === 'fr' && l[3].title === 'T3 — Évian-les-Bains' && l[3].description.includes('vue lac')));
  check('a failing step is reported and the run goes on', results[3].status === 'error' && results[3].message.startsWith('prix : boom'));
  check('known listing: only the rent is written, nothing else', log.filter(l => l[1] === 'lst-a2' || l[1] === 'prop-a2').map(l => l[0] + JSON.stringify(l[2])).join('|') === 'updateListingCommercial{"priceCurrent":1850}');
  check('photo links of the created listing handed to the queue', out.photoJobs.length === 1 && out.photoJobs[0].listingId === 'lst-prop-1' && out.photoJobs[0].urls.length === 2 && out.photoJobs[0].offset === 0);
  check('nothing is ever published (no archive without « import complet »)', !log.some(l => l[0] === 'setListingStatus'));

  // Same reference twice in one file: the second is an error; unknown commune: imported, commune left to set.
  const again = svc.planSync([r1, r1], [], { country: 'FR' });
  check('same reference twice in one file: second one in error', again.counts.create === 1 && again.errors[0].message.includes('Référence en double'));
  const loose = svc.normalizeRow({ Prix: '99000', Type: 'Appartement', Ville: 'Nulle-Part' }, { price: 'Prix', type: 'Type', city: 'Ville' });
  const lr = (await svc.applyPlan(svc.planSync([loose], [], { country: 'FR' }), { partnerId: 'partner-1', country: 'FR', admin })).results[0];
  check('unknown commune: still imported as draft, commune left to set by hand', lr.status === 'ok' && lr.message.startsWith('Commune à définir'));

  console.log(`\nLISTING IMPORT: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
