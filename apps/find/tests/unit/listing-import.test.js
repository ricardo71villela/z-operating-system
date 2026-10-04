/* Contract: Admin « Nous chargeons pour vous » (zfind-admin/src/import.js).
   An agency's CSV / Excel export → mapped columns → normalised rows →
   property + DRAFT listing per row through the existing admin commands.
   Never publishes; skips rows already imported (same agency reference);
   one failing row never stops the others. No network. */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const SRC = path.join(__dirname, '..', '..', 'apps', 'zfind-admin', 'src', 'import.js');
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
check('photos are reported, not imported', r1.photos.length === 2 && r1.warnings.some(w => w.includes('2 fotografia')));
check('rent row: monthly, house typology, own title, no description warning', r2.transaction === 'rent' && r2.rentalPeriod === 'monthly' && r2.price === 1850 && r2.subtype === 'villa' && r2.typology === '5 pièces' && r2.title === 'Maison familiale' && r2.warnings.includes('Sem descrição'));
check('parking refused (not a Z Find type)', r3.errors.some(e => e.includes('Tipo não aceite')));
check('no price → blocking error; studio typology; no DPE warning', r4.errors.includes('Preço em falta') && r4.typology === 'Studio' && r4.energyRating === null && r4.warnings.includes('Sem classe DPE'));

/* ---------------- import (browser path, fake Supabase) ---------------- */
(async () => {
  const rpcs = [];
  const fakeClient = {
    from(table) {
      const q = { calls: [['from', table]] };
      q.select = (...a) => { q.calls.push(['select', ...a]); return q; };
      q.eq = (...a) => { q.calls.push(['eq', ...a]); return q; };
      q.then = (ok, ko) => Promise.resolve({ data: [{ properties: { agency_reference: 'a2' } }], error: null }).then(ok, ko);
      fakeClient.lastQuery = q;
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
  const sandbox = { window: { ZFindServices: { supabaseClient: { getSupabaseClient: () => fakeClient } } }, TextDecoder, console };
  vm.runInNewContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'import.js' });
  const svc = sandbox.window.ZFindServices.listingImport;
  check('browser build registers window.ZFindServices.listingImport', svc && typeof svc.importAll === 'function');

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
    async setListingStatus() { throw new Error('must never publish'); }
  };
  const extra = svc.normalizeRow({ Ref: 'B9', Prix: '200000', Type: 'Maison', CP: '01210', Ville: 'Ferney' }, { reference: 'Ref', price: 'Prix', type: 'Type', postcode: 'CP', city: 'Ville' });
  const progress = [];
  const results = await svc.importAll([r1, r2, r3, r4, extra], 'partner-1', 'FR', admin, (i, r) => progress.push([i, r.status]));

  check('existing references read for this agency only', JSON.stringify(fakeClient.lastQuery.calls) === JSON.stringify([['from', 'representations'], ['select', 'properties!inner(agency_reference)'], ['eq', 'partner_id', 'partner-1'], ['eq', 'target_type', 'property']]));
  check('statuses: created, already imported (case-insensitive ref), refused type, missing price, failed step',
    results.map(r => r.status).join(',') === 'ok,duplicate,skipped,skipped,error' && progress.length === 5);
  check('row 1: property created with type, typology, area', log[0][0] === 'createProperty' && log[0][1].subtype === 'apartment' && log[0][1].typology === 'T3' && log[0][1].areaSqm === 72.5);
  const up = log.find(l => l[0] === 'updateProperty' && l[1] === 'prop-1')[2];
  check('row 1: characteristics, reference, address fields, taxe foncière', up.agencyReference === 'A1' && up.bedrooms === 2 && up.energyRating === 'C' && up.postalCode === '74500'
    && up.grossPrivateAreaSqm === 72.5 && up.condoFeeMonthly === 120 && up.imiAnnual === 950 && !('photos' in up));
  check('row 1: commune chosen by name among the postcode\'s communes', rpcs.some(([nme, a]) => nme === 'zfind_set_asset_commune' && a.p_asset_id === 'prop-1' && a.p_code === '74119' && a.p_country === 'FR' && a.p_kind === 'property')
    && results[0].message === 'Comuna: Évian-les-Bains');
  check('row 1: draft listing for the agency, price, French text', log.some(l => l[0] === 'createInitialListing' && l[1] === 'property' && l[2] === 'prop-1' && l[3] === 'partner-1')
    && log.some(l => l[0] === 'updateListingCommercial' && l[1] === 'lst-prop-1' && l[2].transactionType === 'sale' && l[2].priceCurrent === 350000 && l[2].currencyIso === 'EUR' && l[2].rentalPeriod === null)
    && log.some(l => l[0] === 'upsertListingContent' && l[1] === 'lst-prop-1' && l[2] === 'fr' && l[3].title === 'T3 — Évian-les-Bains' && l[3].description.includes('vue lac')));
  check('a failing step is reported and the run goes on', results[4].status === 'error' && results[4].message.startsWith('preço: boom'));
  check('nothing is ever published', !log.some(l => l[0] === 'setListingStatus'));

  // Same reference twice in one file: the second is recognised; unknown commune: imported, commune left to set.
  const again = await svc.importAll([r1, r1], 'partner-1', 'FR', admin);
  check('same reference twice in one file: second one skipped', again[0].status === 'ok' && again[1].status === 'duplicate');
  const loose = svc.normalizeRow({ Prix: '99000', Type: 'Appartement', Ville: 'Nulle-Part' }, { price: 'Prix', type: 'Type', city: 'Ville' });
  const [lr] = await svc.importAll([loose], 'partner-1', 'FR', admin);
  check('unknown commune: still imported as draft, commune left to set by hand', lr.status === 'ok' && lr.message === 'Comuna a definir');

  console.log(`\nLISTING IMPORT: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
