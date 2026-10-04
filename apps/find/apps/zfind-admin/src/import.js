/* ============================================================
   Z FIND ADMIN — services/listingImport (window.ZFindServices.listingImport)
   ============================================================
   « Nous chargeons pour vous » : an agency sends the export of its
   software (CSV or Excel); the Admin maps the columns once and every
   row becomes a property + a DRAFT listing for that agency, through
   the same commands as by hand (zfind_create_property,
   zfind_update_asset, zfind_set_asset_commune,
   zfind_admin_create_initial_listing, listing commercial terms and
   French content). Nothing is published: publication stays the usual
   compliance review. Photos are not imported yet (the agency adds them
   in its panel). Rows already imported for the agency (same agency
   reference) are skipped.
   Pure helpers (parse, map, normalise) are testable in Node.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else { root.ZFindServices = root.ZFindServices || {}; root.ZFindServices.listingImport = factory(root.ZFindServices.supabaseClient); }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {
  'use strict';

  function fold(value) {
    return String(value == null ? '' : value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* ---------------- file → rows ---------------- */

  /* French Excel saves CSV in Windows-1252: decode as UTF-8 and fall back when it is not. */
  function decodeBytes(bytes) {
    const utf8 = new TextDecoder('utf-8').decode(bytes);
    if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
    return new TextDecoder('windows-1252').decode(bytes);
  }

  function detectDelimiter(text) {
    const lines = String(text).split(/\r?\n/).filter(l => l.trim()).slice(0, 10);
    let best = ';', bestScore = -1;
    [';', ',', '\t', '|'].forEach(d => {
      const counts = lines.map(l => splitLine(l, d).length);
      const min = Math.min(...counts);
      const consistent = counts.every(c => c === counts[0]);
      const score = min > 1 ? min + (consistent ? 1000 : 0) : -1;
      if (score > bestScore) { bestScore = score; best = d; }
    });
    return best;
  }

  function splitLine(line, d) { return parseCsv(line, d)[0] || []; }

  /* RFC 4180-ish: quotes, doubled quotes, delimiters and line breaks inside quotes. */
  function parseCsv(text, delimiter) {
    const d = delimiter || ';';
    const rows = []; let row = []; let cell = ''; let quoted = false;
    const s = String(text);
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
        else cell += c;
      } else if (c === '"' && cell === '') quoted = true;
      else if (c === d) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(v => v.trim() !== '')) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.some(v => v.trim() !== '')) rows.push(row);
    return rows;
  }

  /* rows[0] = headers → { headers, records: [{header: value}] } */
  function toTable(rows) {
    if (!rows.length) return { headers: [], records: [] };
    const headers = rows[0].map((h, i) => String(h || '').trim() || `Colonne ${i + 1}`);
    const records = rows.slice(1).map(r => {
      const o = {};
      headers.forEach((h, i) => { o[h] = r[i] == null ? '' : String(r[i]).trim(); });
      return o;
    });
    return { headers, records };
  }

  function readCsvBytes(bytes) {
    const text = decodeBytes(bytes);
    return toTable(parseCsv(text, detectDelimiter(text)));
  }

  /* ---------------- column mapping ---------------- */

  const FIELDS = [
    ['reference', 'Referência (n.º de mandato)', ['reference', 'ref', 'reference annonce', 'reference agence', 'mandat', 'n mandat', 'numero mandat', 'numero de mandat', 'no mandat', 'id annonce', 'identifiant']],
    ['transaction', 'Venda / arrendamento', ['type d annonce', 'type annonce', 'transaction', 'type transaction', 'type de transaction', 'nature', 'vente location', 'offre']],
    ['type', 'Tipo de bem', ['type de bien', 'type bien', 'type', 'categorie', 'type de propriete', 'bien', 'famille']],
    ['price', 'Preço / renda (€)', ['prix', 'prix de vente', 'prix fai', 'prix honoraires inclus', 'price', 'montant', 'loyer', 'loyer cc', 'loyer charges comprises', 'loyer mensuel']],
    ['area', 'Superfície (m²)', ['surface', 'surface habitable', 'surface m2', 'surface m²', 'sh', 'superficie', 'surface carrez', 'surface loi carrez']],
    ['rooms', 'Divisões (pièces)', ['pieces', 'nb pieces', 'nombre de pieces', 'nb de pieces', 'nbre pieces']],
    ['bedrooms', 'Quartos (chambres)', ['chambres', 'nb chambres', 'nombre de chambres', 'nb de chambres']],
    ['bathrooms', 'Casas de banho', ['salles de bain', 'nb salles de bain', 'salle de bain', 'salles d eau', 'nb salles d eau']],
    ['plot', 'Terreno (m²)', ['surface terrain', 'terrain', 'surface du terrain']],
    ['floor', 'Andar (étage)', ['etage', 'niveau', 'num etage']],
    ['postcode', 'Código postal', ['code postal', 'cp', 'zip', 'code postal du bien']],
    ['city', 'Comuna (ville)', ['ville', 'commune', 'localite', 'ville du bien']],
    ['address', 'Morada', ['adresse', 'adresse du bien', 'rue']],
    ['title', 'Título', ['titre', 'libelle', 'intitule', 'title', 'titre annonce', 'accroche']],
    ['description', 'Descrição', ['description', 'descriptif', 'texte', 'texte annonce', 'annonce', 'description fr']],
    ['dpe', 'DPE (classe energia)', ['dpe', 'classe energie', 'classe energetique', 'dpe classe', 'etiquette energie', 'dpe lettre', 'consommation energie classe']],
    ['year', 'Ano de construção', ['annee de construction', 'annee construction', 'construction']],
    ['charges', 'Despesas de condomínio / mês (€)', ['charges', 'charges mensuelles', 'charges copropriete', 'charges de copropriete']],
    ['tax', 'Taxe foncière / ano (€)', ['taxe fonciere']],
    ['photos', 'Fotografias (URL)', ['photos', 'photo', 'images', 'url photos', 'photos url', 'url images']]
  ];

  function autoMap(headers) {
    const map = {};
    const used = new Set();
    const folded = headers.map(h => fold(h));
    FIELDS.forEach(([key, , synonyms]) => {
      let idx = folded.findIndex((h, i) => !used.has(i) && synonyms.includes(h));
      if (idx < 0) idx = folded.findIndex((h, i) => !used.has(i) && synonyms.some(s => s.length > 3 && h.startsWith(s)));
      if (idx >= 0) { map[key] = headers[idx]; used.add(idx); }
    });
    return map;
  }

  /* ---------------- values ---------------- */

  function num(value) {
    if (value == null) return null;
    let s = String(value).replace(/m2|m²/gi, '').replace(/[^\d,.-]/g, '');
    if (!s) return null;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.250.000,50
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');                 // 1,250,000.50
    else s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function int(value) { const n = num(value); return n == null ? null : Math.round(n); }

  function transactionOf(value) {
    const f = fold(value);
    if (/\b(location|louer|loyer|rent|bail)\b/.test(f) || f.startsWith('loc')) return 'rent';
    return 'sale';
  }

  const TYPE_RULES = [
    [/\b(parking|garage|box|cave)\b/, null],
    [/\b(terrain|lot a batir|parcelle)\b/, 'land'],
    [/\b(bureau|bureaux)\b/, 'office'],
    [/\b(local commercial|boutique|commerce|fonds de commerce|murs commerciaux)\b/, 'retail'],
    [/\b(entrepot|local d activite|locaux d activite|hangar|atelier)\b/, 'industrial_logistics'],
    [/\b(hotel|gite|chambre d hote)\b/, 'hospitality'],
    [/\b(maison|villa|chalet|propriete|ferme|mas|longere|demeure|manoir)\b/, 'villa'],
    [/\b(appartement|studio|duplex|triplex|loft|penthouse|attique|t\d|f\d)\b/, 'apartment']
  ];
  function subtypeOf(value) {
    const f = fold(value);
    if (!f) return 'apartment';
    for (const [re, subtype] of TYPE_RULES) if (re.test(f)) return subtype;
    return 'apartment';
  }

  function typologyOf(subtype, typeValue, rooms) {
    const f = fold(typeValue);
    if (/\bstudio\b/.test(f)) return 'Studio';
    // "Appartement T3", "F4", "Maison 5 pièces" when the file has no rooms column.
    const m = /\b[tf](\d{1,2})\b/.exec(f) || /\b(\d{1,2}) pieces?\b/.exec(f);
    if (!rooms && m) rooms = Number(m[1]);
    if (!rooms) return null;
    if (subtype === 'apartment') return `T${rooms}`;
    if (subtype === 'villa') return `${rooms} pièces`;
    return null;
  }

  /* "C", "C (152 kWh)", "Classe énergie C" → C; "Non soumis à DPE", "Vierge", "En cours" → null. */
  function dpeOf(value) {
    const f = fold(value);
    const m = /^([a-g])\b/.exec(f) || /\b(?:classe|dpe|etiquette|lettre|energie)\s+([a-g])\b/.exec(f);
    return m ? m[1].toUpperCase() : null;
  }

  /* One file row → what will be created, plus warnings / blocking errors. */
  function normalizeRow(record, map) {
    const get = key => (map[key] ? String(record[map[key]] == null ? '' : record[map[key]]).trim() : '');
    const warnings = []; const errors = [];
    const typeValue = get('type');
    const subtype = subtypeOf(typeValue);
    if (subtype === null) errors.push('Tipo não aceite no Z Find (parque, garagem, cave)');
    const transaction = transactionOf(get('transaction'));
    const price = num(get('price'));
    if (!(price > 0)) errors.push('Preço em falta');
    const rooms = int(get('rooms'));
    const title = get('title') || [typologyOf(subtype, typeValue, rooms) || typeValue, get('city')].filter(Boolean).join(' — ');
    if (!get('postcode') && !get('city')) warnings.push('Sem código postal nem comuna: localizar à mão');
    if (!get('description')) warnings.push('Sem descrição');
    const photos = get('photos') ? get('photos').split(/[\s|;,]+/).filter(u => /^https?:\/\//i.test(u)) : [];
    if (photos.length) warnings.push(`${photos.length} fotografia(s) a acrescentar pela agência`);
    const dpe = dpeOf(get('dpe'));
    if (!dpe && subtype !== 'land') warnings.push('Sem classe DPE');
    return {
      reference: get('reference') || null,
      subtype, transaction, price, rentalPeriod: transaction === 'rent' ? 'monthly' : null,
      typology: typologyOf(subtype, typeValue, rooms),
      areaSqm: num(get('area')), plotAreaSqm: num(get('plot')), floor: int(get('floor')),
      bedrooms: int(get('bedrooms')), bathrooms: int(get('bathrooms')),
      postcode: get('postcode').replace(/\s+/g, '') || null, city: get('city') || null, address: get('address') || null,
      title: title.slice(0, 160), description: get('description') || null,
      energyRating: dpe, yearBuilt: int(get('year')), condoFeeMonthly: num(get('charges')), propertyTax: num(get('tax')),
      photos, warnings, errors
    };
  }

  /* ---------------- import (browser) ---------------- */

  function client() { return supabaseClientModule.getSupabaseClient(); }

  async function existingReferences(partnerId) {
    const { data, error } = await client().from('representations')
      .select('properties!inner(agency_reference)').eq('partner_id', partnerId).eq('target_type', 'property');
    if (error) return new Set();
    return new Set((data || []).map(r => r.properties && r.properties.agency_reference).filter(Boolean).map(s => String(s).trim().toLowerCase()));
  }

  async function resolveCommune(country, postcode, city) {
    const q = postcode || city;
    if (!q) return null;
    const { data } = await client().rpc('zfind_commune_search', { p_country: country, p_query: fold(q) });
    const list = data || [];
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    const c = fold(city);
    return list.find(x => fold(x.name) === c) || (c ? list.find(x => fold(x.name).startsWith(c) || c.startsWith(fold(x.name))) : null) || null;
  }

  async function importRow(row, partnerId, country, admin) {
    const step = async (label, fn) => { const r = await fn(); if (r && r.error) throw new Error(`${label}: ${r.error.message || r.error.type || 'erro'}`); return r && r.data; };
    const prop = await step('bem', () => admin.createProperty({ subtype: row.subtype, typology: row.typology, areaSqm: row.areaSqm, floor: row.floor }));
    const propertyId = prop && (prop.id || (Array.isArray(prop) && prop[0] && prop[0].id));
    if (!propertyId) throw new Error('bem: sem identificador');
    const extra = {};
    if (row.bedrooms != null) extra.bedrooms = row.bedrooms;
    if (row.bathrooms != null) extra.bathrooms = row.bathrooms;
    if (row.plotAreaSqm != null) extra.plotAreaSqm = row.plotAreaSqm;
    if (row.areaSqm != null) extra.grossPrivateAreaSqm = row.areaSqm;
    if (row.energyRating) extra.energyRating = row.energyRating;
    if (row.yearBuilt) extra.yearBuilt = row.yearBuilt;
    if (row.condoFeeMonthly != null) extra.condoFeeMonthly = row.condoFeeMonthly;
    if (row.propertyTax != null) extra.imiAnnual = row.propertyTax;
    if (row.postcode) extra.postalCode = row.postcode;
    if (row.address) extra.streetAddress = row.address;
    if (row.reference) extra.agencyReference = row.reference;
    if (Object.keys(extra).length) await step('características', () => admin.updateProperty(propertyId, extra));
    let commune = null;
    const found = await resolveCommune(country, row.postcode, row.city);
    if (found) {
      const set = await client().rpc('zfind_set_asset_commune', { p_kind: 'property', p_asset_id: propertyId, p_country: country, p_code: found.code });
      if (!set.error) commune = found.name;
    }
    const listing = await step('anúncio', () => admin.createInitialListing('property', propertyId, partnerId));
    const listingId = listing && listing.id;
    await step('preço', () => admin.updateListingCommercial(listingId, { transactionType: row.transaction, rentalPeriod: row.rentalPeriod, priceCurrent: row.price, currencyIso: 'EUR', priceIsFrom: false }));
    await step('texto', () => admin.upsertListingContent(listingId, 'fr', { title: row.title, description: row.description || '' }));
    return { propertyId, listingId, commune };
  }

  /* rows: normalised rows; onProgress(i, result). Sequential, one row never stops the others. */
  async function importAll(rows, partnerId, country, admin, onProgress) {
    const known = await existingReferences(partnerId);
    const results = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let result;
      if (row.errors.length) result = { status: 'skipped', message: row.errors.join(' · ') };
      else if (row.reference && known.has(row.reference.toLowerCase())) result = { status: 'duplicate', message: 'Já importado (mesma referência)' };
      else {
        try {
          const r = await importRow(row, partnerId, country, admin);
          if (row.reference) known.add(row.reference.toLowerCase());
          result = Object.assign({ status: 'ok', message: r.commune ? `Comuna: ${r.commune}` : 'Comuna a definir' }, r);
        } catch (e) { result = { status: 'error', message: e.message }; }
      }
      results.push(result);
      if (onProgress) onProgress(i, result);
    }
    return results;
  }

  /* Excel: SheetJS loaded on demand from cdnjs (Admin only). */
  function loadSheetJs() {
    if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('xlsx')));
      s.onerror = () => reject(new Error('xlsx'));
      document.head.appendChild(s);
    });
  }

  async function readFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
      const XLSX = await loadSheetJs();
      const wb = XLSX.read(bytes, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      return toTable(rows.filter(r => r.some(v => String(v).trim() !== '')));
    }
    return readCsvBytes(bytes);
  }

  return Object.freeze({ FIELDS, fold, decodeBytes, detectDelimiter, parseCsv, toTable, readCsvBytes, autoMap, num, transactionOf, subtypeOf, typologyOf, dpeOf, normalizeRow, resolveCommune, importRow, importAll, readFile });
});
