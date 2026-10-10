/* ============================================================
   Z FIND — services/listing-import/poliris.js (window.ZFindServices.poliris; Admin, Partner, /api/feed-sync)
   ============================================================
   Reader for the « Poliris » / SeLoger exchange format: the export
   French agency software produces for the portals (Hektor, Apimo,
   Netty, AC3, La Boîte Immo, Périclès…).

   Format (SeLoger « Spécifications Techniques d’Exportation »):
   - file Annonces.csv, usually inside a ZIP with Config.txt, Photos.cfg
     and, when photos are not sent as links, the photo files;
   - one listing per line (CRLF), NO header row;
   - every field wrapped in double quotes and separated by !#
     ("a"!#"b"!#"c"), empty fields still present; no line breaks in a
     field (<BR> stands for one); decimal point;
   - fixed positions: « l’ordre seul des champs fait foi ». Versions
     4.08 (révisions 001–007), 4.09 (May 2021: DPE date/version, energy
     cost range, reference year) and later revisions only append
     columns (« compatibilité ascendante »), so the ranks below hold for
     4.08 / 4.09 / 4.10 / 4.11 files; unknown extra columns are ignored.
   - column 301 « Version Format » (e.g. "4.08-007", "4.09", "4.11");
     the file is in « annule et remplace » mode: it always contains the
     agency’s whole portfolio.

   Sources (column ranks, codes):
   - SeLoger, « Spécifications Techniques d’Exportation — Transfert
     automatisé d’annonces vers les supports SeLoger.com », version 4.09
     du 31 mai 2021 (with the 4.08 revision history), as transcribed in
     https://github.com/MeilleursBiens/php-seloger-poliris-feed
     (SELOGER_POLIRIS.md) — https://packagist.org/packages/meilleursbiens/seloger-poliris-feed
   - same library, src/Announcement.php: 0-based field indexes
     (fields[1] = reference, fields[174] = technical id, fields[300] =
     version), which matches rank - 1 below.
   Encoding: the spec does not fix one; files are very often
   Windows-1252 / ISO-8859-1 — the caller decodes (UTF-8 first,
   Windows-1252 fallback, see import.js decodeBytes).

   Pure: no DOM, no network. Testable in Node.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.ZFindServices = root.ZFindServices || {}; root.ZFindServices.poliris = factory(); }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

  /* Rank (1-based, as in the spec) of each column Z Find reads. */
  const RANK = Object.freeze({
    agencyId: 1,              // Identifiant agence (grouped files: several agencies)
    reference: 2,             // Référence agence du bien (shown, our match key)
    transaction: 3,           // Type d’annonce: vente, location, location vacances, viager…
    type: 4,                  // Type de bien: appartement, maison/villa, terrain, parking/box…
    postcode: 5,              // CP à afficher
    city: 6,                  // Ville à afficher
    country: 7,
    address: 8,
    price: 11,                // Prix (FAI, « charges acquéreur comprises ») / loyer CC + complément
    rentIncludesCharges: 13,  // Loyer CC OUI/NON
    fees: 15,                 // Ventes: honoraires acquéreur en % du prix hors honoraires; locations: honoraires locataire en €
    area: 16,                 // Surface (m²)
    plot: 17,                 // Surface terrain
    rooms: 18,
    bedrooms: 19,
    title: 20,                // Libellé
    description: 21,          // Descriptif (<BR> = line break)
    charges: 23,              // Charges (€/mois, mandatory for rentals)
    floor: 24,
    furnished: 26,            // Meublé OUI/NON
    year: 27,                 // Année de construction
    bathrooms: 29,
    showerRooms: 30,
    realPostcode: 108,        // CP réel du bien (when the displayed one is blurred)
    realCity: 109,
    mandateNumber: 112,
    deposit: 161,             // Dépôt de garantie
    technicalId: 175,         // Identifiant technique (unique, constant)
    dpeValue: 176,            // Consommation énergie kWhEP/m²/an
    dpeClass: 177,            // Bilan consommation énergie: A–G, VI (vierge), NS (non soumis)
    gesValue: 178,            // Émissions GES kg éqCO2/m²/an
    gesClass: 179,            // Bilan émission GES: A–G, VI, NS
    subtype: 181,             // Sous-type de bien (maison de village, studette, duplex…)
    condo: 258,               // En copropriété OUI/NON (loi ALUR)
    condoLots: 259,
    condoAnnualCharges: 260,  // quote-part annuelle du budget prévisionnel
    condoProcedure: 261,      // Syndicat des copropriétaires en procédure OUI/NON
    condoProcedureDetail: 262,
    latitude: 298,
    longitude: 299,
    version: 301,             // Version Format
    feesPayer: 302,           // 1 acquéreur, 2 vendeur, 3 acquéreur et vendeur (ventes)
    priceExclFees: 303,       // Prix hors honoraires acquéreur
    chargesMethod: 304,       // 1 forfait, 2 provision avec régularisation, 3 remboursement annuel
    rentSupplement: 305,      // Complément de loyer
    inventoryFees: 306,       // Part honoraires état des lieux
    feesScheduleUrl: 307,     // URL du barème des honoraires
    dpeDate: 324,             // 4.09
    dpeVersion: 325,          // 4.09
    energyCostMin: 326,       // 4.09: DPE coût min conso
    energyCostMax: 327,       // 4.09: DPE coût max conso
    energyCostYear: 328       // 4.09: année de référence
  });
  /* Photo 1–9, 10–20, 21–30: a file name in the ZIP or an http(s) URL. */
  const PHOTO_RANKS = Object.freeze([].concat(range(85, 93), range(164, 174), range(264, 273)));
  const MIN_FIELDS = 21; // up to the description: anything shorter is not a listing line

  /* ---------------- detection ---------------- */

  /** A Poliris file: lines start with a quote and carry many "!#" separators. */
  function looksLikePoliris(text) {
    const first = String(text || '').replace(/^﻿/, '').split(/\r?\n/).find(l => l.trim());
    if (!first) return false;
    const separators = (first.match(/"\s*!#\s*"/g) || []).length;
    return /^\s*"/.test(first) && separators >= MIN_FIELDS - 1;
  }

  /* ---------------- parsing ---------------- */

  function splitFields(record) {
    let s = record.trim();
    if (s.startsWith('"')) s = s.slice(1);
    if (s.endsWith('"')) s = s.slice(0, -1);
    // Spec: "a"!#"b" (some exporters write "a" !# "b"); a field never contains "!#".
    return s.split(/"\s*!#\s*"/).map(v => v.replace(/<br\s*\/?>/gi, '\n').trim());
  }

  /** text → array of field arrays (index 0 = rank 1). A record normally
      fits on one line; a description with a raw line break (non-compliant
      exporter) is glued back until the line ends with a closing quote and
      the next one opens a new record. */
  function parse(text) {
    const lines = String(text || '').replace(/^﻿/, '').split(/\r\n|\n|\r/);
    const records = [];
    let current = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (current === null) {
        if (!line.trim()) continue;
        current = line;
      } else current += '\n' + line;
      const next = lines.slice(i + 1).find(l => l.trim());
      const closed = /"\s*$/.test(current) && (next === undefined || /^\s*"/.test(next));
      if (closed) { records.push(splitFields(current)); current = null; }
    }
    if (current !== null && current.trim()) records.push(splitFields(current));
    return records;
  }

  const at = (fields, rank) => (fields[rank - 1] == null ? '' : String(fields[rank - 1]).trim());

  /** "4.08-007", "4.09", "4.11"… from column 301, else from the last non-empty column. */
  function versionOf(fields) {
    const v = at(fields, RANK.version);
    if (/^\d\.\d{2}/.test(v)) return v;
    for (let i = fields.length - 1; i >= Math.max(0, fields.length - 5); i--) {
      if (/^\d\.\d{2}(-\d{3})?$/.test(String(fields[i] || '').trim())) return String(fields[i]).trim();
    }
    return null;
  }

  function fold(value) {
    return String(value == null ? '' : value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /** One line → a record keyed by Z Find import field keys (see import.js
      FIELDS), with the Poliris semantics already resolved: column 15 is a
      percentage for sales and a tenant amount for rentals; the price is
      « honoraires inclus » for sales and « charges comprises » for
      rentals unless column 13 says NON. */
  function toRecord(fields) {
    const get = rank => at(fields, rank);
    const transaction = get(RANK.transaction);
    const isRent = /\bloc/.test(fold(transaction));
    const photos = PHOTO_RANKS.map(get).filter(Boolean);
    const record = {
      agencyId: get(RANK.agencyId),
      reference: get(RANK.reference),
      technicalId: get(RANK.technicalId),
      transaction,
      type: [get(RANK.type), get(RANK.subtype)].filter(Boolean).join(' — '),
      postcode: get(RANK.realPostcode) || get(RANK.postcode),
      city: get(RANK.realCity) || get(RANK.city),
      address: get(RANK.address),
      price: get(RANK.price),
      area: get(RANK.area),
      plot: get(RANK.plot),
      rooms: get(RANK.rooms),
      bedrooms: get(RANK.bedrooms),
      bathrooms: String((Number(get(RANK.bathrooms)) || 0) + (Number(get(RANK.showerRooms)) || 0) || ''),
      floor: get(RANK.floor),
      year: get(RANK.year),
      title: get(RANK.title),
      description: get(RANK.description),
      dpe: get(RANK.dpeClass),
      dpeValue: get(RANK.dpeValue),
      ges: get(RANK.gesClass),
      gesValue: get(RANK.gesValue),
      energyCostMin: get(RANK.energyCostMin),
      energyCostMax: get(RANK.energyCostMax),
      energyCostYear: get(RANK.energyCostYear),
      charges: get(RANK.charges),
      furnished: get(RANK.furnished),
      deposit: get(RANK.deposit),
      condo: get(RANK.condo),
      condoLots: get(RANK.condoLots),
      condoAnnualCharges: get(RANK.condoAnnualCharges),
      condoProcedure: get(RANK.condoProcedure),
      condoProcedureDetail: get(RANK.condoProcedureDetail),
      feesScheduleUrl: get(RANK.feesScheduleUrl),
      latitude: get(RANK.latitude),
      longitude: get(RANK.longitude),
      photos: photos.join(' | ')
    };
    if (isRent) {
      record.tenantFees = get(RANK.fees);
      record.inventoryFees = get(RANK.inventoryFees);
      record.chargesMethod = get(RANK.chargesMethod);
      record.rentSupplement = get(RANK.rentSupplement);
      // Spec: the rent is « charges et complément de loyer compris » unless Loyer CC = NON.
      record.rentIncludesCharges = fold(get(RANK.rentIncludesCharges)) === 'non' ? 'non' : 'oui';
    } else {
      record.feesPercent = get(RANK.fees);
      record.feesPayer = get(RANK.feesPayer);
      record.priceExclFees = get(RANK.priceExclFees);
      // Spec: « Prix du bien exprimé charges acquéreur comprises » (FAI).
      record.priceIncludesFees = 'oui';
    }
    Object.keys(record).forEach(k => { if (record[k] === '') delete record[k]; });
    return record;
  }

  /** text → the import table: { format, version, headers, records, map,
      agencyIds, invalidLines }. records are keyed by field key and map is
      the identity, so the generic normaliser reads them directly. */
  function toTable(text) {
    const all = parse(text);
    const valid = all.filter(f => f.length >= MIN_FIELDS);
    const records = valid.map(toRecord);
    const versions = Array.from(new Set(valid.map(versionOf).filter(Boolean)));
    const headers = Array.from(records.reduce((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set; }, new Set()));
    const map = {};
    headers.forEach(h => { map[h] = h; });
    const agencyIds = Array.from(new Set(records.map(r => r.agencyId).filter(Boolean)));
    return { format: 'poliris', version: versions[0] || null, versions, headers, records, map, agencyIds, invalidLines: all.length - valid.length, columnCount: valid.reduce((m, f) => Math.max(m, f.length), 0) };
  }

  /* ---------------- codes ---------------- */

  /** Column 302 (sales): 1 acquéreur, 2 vendeur, 3 acquéreur et vendeur. */
  const FEES_PAYER_CODES = Object.freeze({ 1: 'buyer', 2: 'seller', 3: 'shared' });
  /** Column 304 (rentals): 1 forfait, 2 provision + régularisation annuelle;
      3 (« remboursement annuel par le locataire ») has no equivalent in the
      Z Find facts: left for the agency to state. */
  const CHARGES_METHOD_CODES = Object.freeze({ 1: 'forfait', 2: 'provision' });

  /** Builds one line (tests and the downloadable sample). values: { rank: value }. */
  function formatLine(values, length) {
    const n = Math.max(length || RANK.energyCostYear + 1, ...Object.keys(values).map(Number));
    const cells = [];
    for (let rank = 1; rank <= n; rank++) {
      const v = values[rank] == null ? '' : String(values[rank]).replace(/"/g, "'").replace(/\r?\n/g, '<BR>');
      cells.push('"' + v + '"');
    }
    return cells.join('!#');
  }

  return Object.freeze({ RANK, PHOTO_RANKS, MIN_FIELDS, FEES_PAYER_CODES, CHARGES_METHOD_CODES, looksLikePoliris, parse, splitFields, versionOf, toRecord, toTable, formatLine });
});
