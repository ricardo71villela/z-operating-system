/* ============================================================
   Z FIND ADMIN — services/listingImport (window.ZFindServices.listingImport)
   ============================================================
   « Nous chargeons pour vous » : an agency sends the export of its
   software and Z Find loads — then keeps up to date — its portfolio.

   Input formats
   - Poliris / SeLoger (annonces.csv, "a"!#"b", no header, fixed
     columns; alone or in the agency’s ZIP with the photo files):
     services/poliris (window.ZFindServices.poliris), auto-detected;
   - any CSV / Excel table with a header row (separators ; , tab |,
     SheetJS for Excel): the Admin maps the columns once (FIELDS).
   Files are decoded as UTF-8, or Windows-1252 / ISO-8859-1 when they
   are not valid UTF-8 (French Excel and most agency software).

   Re-import = synchronisation, per agency (planSync / applyPlan)
   - match: same agency (representations.partner_id) + same agency
     reference (properties.agency_reference, case-insensitive);
   - new reference → property + DRAFT listing + French content, through
     the same commands as by hand (zfind_create_property,
     zfind_update_asset, zfind_set_asset_commune,
     zfind_admin_create_initial_listing, listing commercial terms,
     listing_content). Nothing is published;
   - known reference → only what changed: price / rent, surfaces, rooms,
     DPE, charges, French title / description, new photo links (queued,
     never twice: zfind_media_import_queue is unique on listing+url) and
     the mandatory information;
   - « Import complet du portefeuille »: that agency’s listings with an
     agency reference that are absent from the file are archived with
     the lifecycle command zfind_admin_transition_listing(…,'archived')
     — never deleted, other agencies never touched.
   A preview (planSync, read only) is shown before anything is written.

   French mandatory information (France, residential sale / rent)
   - complianceFor(): facts built from the row with the shared
     services/listing-compliance.js (buildFacts / validateFacts), saved
     with zfind_save_listing_compliance once the listing exists: the
     listing lands in « Mentions obligatoires à valider ». The RPC
     accepts partial facts; what is missing is reported per row
     (« mentions incomplètes : … ») so the Admin knows what to ask.
     Compliance never blocks the import of the listing itself.
   - on re-import, facts from the file are merged over the stored ones
     (manual answers kept); a PUBLISHED listing’s facts are never
     changed (the SQL refuses it: « Suspend the Listing before changing
     approved compliance facts ») — reported instead.
   Pure helpers (parse, map, normalise, plan, report) are testable in Node.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null, require('./poliris'), require('../../zfind-web/src/services/listing-compliance.js'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    const S = root.ZFindServices;
    // listing-compliance.js may be concatenated after this file: resolved when used.
    root.ZFindServices.listingImport = factory(S.supabaseClient, () => S.poliris, () => S.listingCompliance);
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule, polirisRef, complianceRef) {
  'use strict';

  const P = () => (typeof polirisRef === 'function' ? polirisRef() : polirisRef);
  const C = () => (typeof complianceRef === 'function' ? complianceRef() : complianceRef);

  function fold(value) {
    return String(value == null ? '' : value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* ---------------- file → rows ---------------- */

  /* French Excel and agency software save in Windows-1252 / ISO-8859-1:
     decode as UTF-8 and fall back when it is not valid UTF-8. */
  /* 0x80–0x9F in Windows-1252 (€, ’, –, —, œ, …). Browsers decode them; some
     runtimes (Node without full ICU) give the C1 control characters instead. */
  const CP1252_C1 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
  function decodeBytes(bytes) {
    const utf8 = new TextDecoder('utf-8').decode(bytes);
    if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
    return new TextDecoder('windows-1252').decode(bytes).replace(/[\u0080-\u009f]/g, c => CP1252_C1[c.charCodeAt(0) - 0x80]);
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
    if (!rows.length) return { format: 'csv', headers: [], records: [] };
    const headers = rows[0].map((h, i) => String(h || '').trim() || `Colonne ${i + 1}`);
    const records = rows.slice(1).map(r => {
      const o = {};
      headers.forEach((h, i) => { o[h] = r[i] == null ? '' : String(r[i]).trim(); });
      return o;
    });
    return { format: 'csv', headers, records };
  }

  /** Bytes of a text export → table. Poliris (no header, "!#") is
      recognised before the header-based reader. */
  function readCsvBytes(bytes) {
    const text = decodeBytes(bytes);
    const poliris = P();
    if (poliris && poliris.looksLikePoliris(text)) return poliris.toTable(text);
    return toTable(parseCsv(text, detectDelimiter(text)));
  }

  /* ---------------- column mapping (header CSV / Excel) ----------------
     [key, French label (also the downloadable template header), synonyms (folded), group]
     group 'base': the listing; 'mentions': French mandatory information. */
  const FIELDS = [
    ['reference', 'Référence (n° de mandat)', ['reference', 'ref', 'reference annonce', 'reference agence', 'reference agence du bien', 'mandat', 'n mandat', 'numero mandat', 'numero de mandat', 'no mandat', 'id annonce', 'identifiant'], 'base'],
    ['transaction', 'Vente / location', ['type d annonce', 'type annonce', 'transaction', 'type transaction', 'type de transaction', 'nature', 'vente location', 'offre'], 'base'],
    ['type', 'Type de bien', ['type de bien', 'type bien', 'type', 'categorie', 'type de propriete', 'bien', 'famille'], 'base'],
    ['price', 'Prix / loyer (€)', ['prix', 'prix de vente', 'prix fai', 'prix honoraires inclus', 'price', 'montant', 'loyer', 'loyer cc', 'loyer charges comprises', 'loyer mensuel', 'prix loyer'], 'base'],
    ['area', 'Surface habitable (m²)', ['surface', 'surface habitable', 'surface m2', 'surface m²', 'sh', 'superficie'], 'base'],
    ['rooms', 'Pièces', ['pieces', 'nb pieces', 'nombre de pieces', 'nb de pieces', 'nbre pieces'], 'base'],
    ['bedrooms', 'Chambres', ['chambres', 'nb chambres', 'nombre de chambres', 'nb de chambres'], 'base'],
    ['bathrooms', 'Salles de bain', ['salles de bain', 'nb salles de bain', 'salle de bain', 'salles d eau', 'nb salles d eau'], 'base'],
    ['plot', 'Terrain (m²)', ['surface terrain', 'terrain', 'surface du terrain', 'terrain m2'], 'base'],
    ['floor', 'Étage', ['etage', 'niveau', 'num etage'], 'base'],
    ['postcode', 'Code postal', ['code postal', 'cp', 'zip', 'code postal du bien'], 'base'],
    ['city', 'Commune (ville)', ['ville', 'commune', 'localite', 'ville du bien', 'commune ville'], 'base'],
    ['address', 'Adresse', ['adresse', 'adresse du bien', 'rue'], 'base'],
    ['title', 'Titre', ['titre', 'libelle', 'intitule', 'title', 'titre annonce', 'accroche'], 'base'],
    ['description', 'Description', ['description', 'descriptif', 'texte', 'texte annonce', 'annonce', 'description fr'], 'base'],
    ['year', 'Année de construction', ['annee de construction', 'annee construction', 'construction'], 'base'],
    ['charges', 'Charges mensuelles (€)', ['charges', 'charges mensuelles', 'charges copropriete', 'charges de copropriete', 'charges mensuelles locataire'], 'base'],
    ['tax', 'Taxe foncière / an (€)', ['taxe fonciere'], 'base'],
    ['photos', 'Photos (liens)', ['photos', 'photo', 'images', 'url photos', 'photos url', 'url images', 'photos liens'], 'base'],
    ['latitude', 'Latitude', ['latitude', 'lat'], 'base'],
    ['longitude', 'Longitude', ['longitude', 'lng', 'lon'], 'base'],
    ['dpe', 'DPE (classe énergie)', ['dpe', 'classe energie', 'classe energetique', 'dpe classe', 'etiquette energie', 'dpe lettre', 'consommation energie classe', 'dpe classe energie'], 'mentions'],
    ['dpeValue', 'DPE — consommation (kWh/m²/an)', ['consommation energie', 'consommation energetique', 'dpe valeur', 'valeur dpe', 'dpe kwh', 'dpe consommation kwh m2 an', 'dpe consommation'], 'mentions'],
    ['ges', 'GES (classe climat)', ['ges', 'classe ges', 'classe climat', 'etiquette ges', 'etiquette climat', 'ges classe', 'ges classe climat'], 'mentions'],
    ['gesValue', 'GES — émissions (kg CO₂/m²/an)', ['emissions ges', 'emission ges', 'ges valeur', 'valeur ges', 'ges emissions kg co2 m2 an', 'ges emissions'], 'mentions'],
    ['energyCostMin', 'Dépenses d’énergie estimées — minimum (€/an)', ['depenses d energie estimees minimum an', 'depenses energie min', 'depense energie minimum', 'cout energie min', 'dpe cout min', 'energie min'], 'mentions'],
    ['energyCostMax', 'Dépenses d’énergie estimées — maximum (€/an)', ['depenses d energie estimees maximum an', 'depenses energie max', 'depense energie maximum', 'cout energie max', 'dpe cout max', 'energie max'], 'mentions'],
    ['energyCostYear', 'Année de référence des prix de l’énergie', ['annee de reference des prix de l energie', 'annee de reference', 'annee reference energie', 'dpe annee de reference', 'annee reference'], 'mentions'],
    ['ademe', 'Numéro ADEME du DPE', ['numero ademe du dpe', 'numero ademe', 'n ademe', 'ademe', 'numero dpe'], 'mentions'],
    ['feesPayer', 'Honoraires à la charge de', ['honoraires a la charge de', 'honoraires a la charge', 'charge des honoraires', 'honoraires charge'], 'mentions'],
    ['feesAmount', 'Honoraires (€ TTC)', ['honoraires ttc', 'honoraires', 'montant honoraires', 'montant des honoraires', 'honoraires euros', 'frais d agence'], 'mentions'],
    ['feesPercent', 'Honoraires (% du prix)', ['honoraires du prix', 'pourcentage honoraires', 'honoraires pourcentage', 'honoraires en pourcentage', 'taux honoraires', 'honoraires pct'], 'mentions'],
    ['priceExclFees', 'Prix hors honoraires (€)', ['prix hors honoraires', 'prix net vendeur', 'net vendeur', 'prix hors honoraires acquereur'], 'mentions'],
    ['priceIncludesFees', 'Honoraires inclus dans le prix (oui / non)', ['honoraires inclus dans le prix oui non', 'honoraires inclus dans le prix', 'honoraires inclus'], 'mentions'],
    ['feesScheduleUrl', 'Barème des honoraires (lien)', ['bareme des honoraires lien', 'bareme des honoraires', 'bareme honoraires', 'url bareme', 'lien bareme'], 'mentions'],
    ['condo', 'Copropriété (oui / non)', ['copropriete oui non', 'copropriete', 'en copropriete', 'bien en copropriete', 'soumis copropriete'], 'mentions'],
    ['condoLots', 'Nombre de lots', ['nombre de lots', 'nb lots', 'lots', 'nombre de lots de la copropriete'], 'mentions'],
    ['condoAnnualCharges', 'Charges annuelles de copropriété (€)', ['charges annuelles de copropriete', 'charges annuelles', 'charges annuelles copropriete', 'quote part annuelle'], 'mentions'],
    ['condoProcedure', 'Procédure en cours dans la copropriété (oui / non)', ['procedure en cours dans la copropriete oui non', 'procedure en cours', 'procedure copropriete', 'syndicat en procedure'], 'mentions'],
    ['condoProcedureDetail', 'Détail de la procédure', ['detail de la procedure', 'detail procedure', 'nature de la procedure'], 'mentions'],
    ['surfaceCarrez', 'Surface loi Carrez (m²)', ['surface loi carrez', 'surface carrez', 'carrez', 'loi carrez'], 'mentions'],
    ['rentIncludesCharges', 'Loyer charges comprises (oui / non)', ['loyer charges comprises oui non', 'loyer cc oui non', 'charges comprises'], 'mentions'],
    ['rentExclCharges', 'Loyer hors charges (€)', ['loyer hors charges', 'loyer hc', 'loyer mensuel hors charges'], 'mentions'],
    ['chargesMethod', 'Modalité des charges (provision / forfait)', ['modalite des charges provision forfait', 'modalite des charges', 'modalites charges', 'modalite charges', 'type de charges'], 'mentions'],
    ['furnished', 'Meublé (oui / non)', ['meuble oui non', 'meuble', 'meublee', 'location meublee'], 'mentions'],
    ['deposit', 'Dépôt de garantie (€)', ['depot de garantie', 'depot garantie', 'caution'], 'mentions'],
    ['tenantFees', 'Honoraires locataire (€ TTC)', ['honoraires locataire ttc', 'honoraires locataire', 'frais locataire', 'honoraires charge locataire'], 'mentions'],
    ['inventoryFees', 'Honoraires état des lieux (€ TTC)', ['honoraires etat des lieux ttc', 'honoraires etat des lieux', 'part honoraires etat des lieux', 'etat des lieux', 'honoraires edl'], 'mentions'],
    ['rentSupplement', 'Complément de loyer (€)', ['complement de loyer', 'complement loyer'], 'mentions'],
    ['georisques', 'Mention Géorisques dans l’annonce (oui / non)', ['mention georisques dans l annonce oui non', 'mention georisques', 'georisques'], 'mentions']
  ];
  const FIELD_KEYS = FIELDS.map(f => f[0]);

  /* Exact header names first (every field), then « starts with » for
     what is left: « Charges annuelles » must not be taken by « Charges ». */
  function autoMap(headers) {
    const map = {};
    const used = new Set();
    const folded = headers.map(h => fold(h));
    FIELDS.forEach(([key, , synonyms]) => {
      const idx = folded.findIndex((h, i) => !used.has(i) && synonyms.includes(h));
      if (idx >= 0) { map[key] = headers[idx]; used.add(idx); }
    });
    FIELDS.forEach(([key, , synonyms]) => {
      if (map[key]) return;
      const idx = folded.findIndex((h, i) => !used.has(i) && synonyms.some(s => s.length > 3 && h.startsWith(s)));
      if (idx >= 0) { map[key] = headers[idx]; used.add(idx); }
    });
    return map;
  }

  /** Downloadable template: every column the importer understands, one example row. */
  function templateCsv() {
    const example = {
      reference: 'EV-1024', transaction: 'Vente', type: 'Appartement', price: '435000', area: '78,5', rooms: '3', bedrooms: '2', bathrooms: '1', plot: '',
      floor: '2', postcode: '74500', city: 'Évian-les-Bains', address: '12 avenue des Sources', title: 'T3 vue lac', description: 'Bel appartement… Les informations sur les risques auxquels ce bien est exposé sont disponibles sur le site Géorisques : www.georisques.gouv.fr',
      year: '1975', charges: '180', tax: '1250', photos: 'https://exemple.fr/1.jpg | https://exemple.fr/2.jpg', latitude: '', longitude: '',
      dpe: 'D', dpeValue: '215', ges: 'D', gesValue: '38', energyCostMin: '1250', energyCostMax: '1720', energyCostYear: '2023', ademe: '',
      feesPayer: 'acquéreur', feesAmount: '15000', feesPercent: '3,57', priceExclFees: '420000', priceIncludesFees: 'oui', feesScheduleUrl: 'https://exemple.fr/bareme',
      condo: 'oui', condoLots: '24', condoAnnualCharges: '2160', condoProcedure: 'non', condoProcedureDetail: '', surfaceCarrez: '76,2',
      rentIncludesCharges: '', rentExclCharges: '', chargesMethod: '', furnished: '', deposit: '', tenantFees: '', inventoryFees: '', rentSupplement: '', georisques: 'oui'
    };
    const cell = v => (/[;"\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v);
    return '﻿' + FIELDS.map(f => cell(f[1])).join(';') + '\r\n' + FIELDS.map(f => cell(example[f[0]] || '')).join(';') + '\r\n';
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
  const round2 = n => Math.round(n * 100) / 100;

  /** oui / non, yes / no, 1 / 0, x → boolean; anything else → undefined. */
  function yesNo(value) {
    const f = fold(value);
    if (['oui', 'o', 'yes', 'y', 'true', 'vrai', '1', 'x'].includes(f)) return true;
    if (['non', 'n', 'no', 'false', 'faux', '0'].includes(f)) return false;
    return undefined;
  }

  function transactionOf(value) {
    const f = fold(value);
    if (/\b(location|louer|loyer|rent|bail)\b/.test(f) || f.startsWith('loc')) return 'rent';
    return 'sale';
  }
  /* Kinds of listing Z Find does not take (Poliris column 3 offers them all). */
  function transactionErrorOf(value) {
    const f = fold(value);
    if (/vacances|saisonn/.test(f)) return 'Location saisonnière / vacances non prise en charge';
    if (/\bviager\b/.test(f)) return 'Viager non pris en charge';
    if (/cession de bail|fonds de commerce|droit au bail/.test(f)) return 'Cession de bail / fonds de commerce non pris en charge';
    if (/produit catalogue|modele de maison/.test(f)) return 'Modèle de maison (constructeur) non pris en charge';
    return null;
  }

  const TYPE_RULES = [
    [/\b(parking|garage|box|cave)\b/, null],
    [/\b(immeuble|batiment|entreprises?|inconnu|modele de maison)\b/, null],
    [/\bloft\b/, 'apartment'],
    [/\b(terrain|lot a batir|parcelle)\b/, 'land'],
    [/\b(bureau|bureaux)\b/, 'office'],
    [/\b(local commercial|boutique|commerce|fonds de commerce|murs commerciaux)\b/, 'retail'],
    [/\b(entrepot|local d activite|locaux d activite|hangar|atelier|local)\b/, 'industrial_logistics'],
    [/\b(hotel|gite|chambre d hote)\b/, 'hospitality'],
    [/\b(maison|villa|chalet|propriete|ferme|mas|longere|demeure|manoir|chateau|hotel particulier|bastide|pavillon)\b/, 'villa'],
    [/\b(appartement|studio|studette|duplex|triplex|loft|penthouse|attique|t\d|f\d)\b/, 'apartment']
  ];
  function subtypeOf(value) {
    const f = fold(value);
    if (!f) return 'apartment';
    if (/\bhotel particulier\b/.test(f)) return 'villa';
    for (const [re, subtype] of TYPE_RULES) if (re.test(f)) return subtype;
    return 'apartment';
  }
  const RESIDENTIAL = ['apartment', 'villa'];

  function typologyOf(subtype, typeValue, rooms) {
    const f = fold(typeValue);
    if (/\b(studio|studette)\b/.test(f)) return 'Studio';
    // "Appartement T3", "F4", "Maison 5 pièces" when the file has no rooms column.
    const m = /\b[tf](\d{1,2})\b/.exec(f) || /\b(\d{1,2}) pieces?\b/.exec(f);
    if (!rooms && m) rooms = Number(m[1]);
    if (!rooms) return null;
    if (subtype === 'apartment') return `T${rooms}`;
    if (subtype === 'villa') return `${rooms} pièces`;
    return null;
  }

  /* "C", "C (152 kWh)", "Classe énergie C" → C; "Non soumis à DPE", "Vierge", "En cours", "NS", "VI" → null. */
  function dpeOf(value) {
    const f = fold(value);
    const m = /^([a-g])\b/.exec(f) || /\b(?:classe|dpe|etiquette|lettre|energie|ges|climat)\s+([a-g])\b/.exec(f);
    return m ? m[1].toUpperCase() : null;
  }
  /* available (a class), exempt (Poliris "NS", « non soumis », « exempté »), or unknown
     (« vierge » / "VI": an empty DPE is no longer valid — the agency must provide one). */
  function dpeStatusOf(value) {
    const f = fold(value);
    if (f === 'ns' || /non soumis|exempt/.test(f)) return 'exempt';
    if (dpeOf(value)) return 'available';
    return null;
  }

  /** « acquéreur », « vendeur », « bailleur », « locataire », « partagés », Poliris 1 / 2 / 3. */
  function feesPayerOf(value, transaction) {
    const f = fold(value);
    if (!f) return null;
    if (transaction !== 'rent' && P() && P().FEES_PAYER_CODES[f]) return P().FEES_PAYER_CODES[f];
    const buyer = /\b(acquereurs?|acheteurs?|acquereur)\b/.test(f);
    const seller = /\bvendeurs?\b/.test(f);
    const landlord = /\b(bailleurs?|proprietaires?)\b/.test(f);
    const tenant = /\blocataires?\b/.test(f);
    if (/partag|les deux|\bmixte\b/.test(f) || (buyer && seller) || (landlord && tenant)) return 'shared';
    if (buyer) return 'buyer';
    if (seller) return 'seller';
    if (landlord) return 'landlord';
    if (tenant) return 'tenant';
    return null;
  }

  function chargesMethodOf(value) {
    const f = fold(value);
    if (!f) return null;
    if (P() && P().CHARGES_METHOD_CODES[f]) return P().CHARGES_METHOD_CODES[f];
    if (/forfait/.test(f)) return 'forfait';
    if (/provision|regularisation|previsionnel/.test(f)) return 'provision';
    if (/^(aucune?|none|sans)\b/.test(f)) return 'none';
    return null;
  }

  /* One file row → what will be created / compared, plus warnings / blocking errors. */
  function normalizeRow(record, map) {
    const get = key => (map[key] ? String(record[map[key]] == null ? '' : record[map[key]]).trim() : '');
    const warnings = []; const errors = [];
    const typeValue = get('type');
    const subtype = subtypeOf(typeValue);
    if (subtype === null) errors.push('Type non accepté sur Z Find (parking, garage, cave, immeuble entier…)');
    const transactionError = transactionErrorOf(get('transaction'));
    if (transactionError) errors.push(transactionError);
    const transaction = transactionOf(get('transaction'));
    const price = num(get('price'));
    if (!(price > 0)) errors.push('Prix manquant');
    const rooms = int(get('rooms'));
    const titleFromFile = get('title');
    const title = titleFromFile || [typologyOf(subtype, typeValue, rooms) || typeValue, get('city')].filter(Boolean).join(' — ');
    if (!get('postcode') && !get('city')) warnings.push('Ni code postal ni commune : à localiser à la main');
    if (!get('description')) warnings.push('Sans description');
    // One column with several links, and/or numbered columns (Photo 1, Photo 2… as many exports do).
    const photoCells = [get('photos')].concat(Object.keys(record).filter(h => h !== map.photos && /^(photos?|images?|img|url photos?|url images?|lien photo) ?\d{1,2}$/.test(fold(h)))
      .sort((a, b) => Number(fold(a).replace(/\D/g, '')) - Number(fold(b).replace(/\D/g, ''))).map(h => String(record[h] || '').trim()));
    const tokens = photoCells.join(' ').split(/[\s|;,]+/).filter(Boolean);
    const photos = [...new Set(tokens.filter(u => /^https?:\/\//i.test(u)))];
    // File names (Poliris ZIP: the photos travel next to annonces.csv).
    const photoFiles = [...new Set(tokens.filter(u => !/^https?:\/\//i.test(u) && /\.(jpe?g|png|gif|webp|bmp)$/i.test(u)))];
    if (photos.length) warnings.push(`${photos.length} photo(s) à importer depuis les liens`);
    const dpeRaw = get('dpe');
    const dpe = dpeOf(dpeRaw);
    if (!dpe && subtype !== 'land') warnings.push('Sans classe DPE');
    const area = num(get('area'));
    const carrez = num(get('surfaceCarrez'));
    const charges = num(get('charges'));
    const lat = num(get('latitude')); const lng = num(get('longitude'));
    const year = int(get('energyCostYear'));
    return {
      reference: get('reference') || null,
      agencyId: get('agencyId') || null,
      subtype, transaction, price, rentalPeriod: transaction === 'rent' ? 'monthly' : null,
      typology: typologyOf(subtype, typeValue, rooms),
      areaSqm: area != null ? area : carrez, livingAreaSqm: area, plotAreaSqm: num(get('plot')), floor: int(get('floor')),
      bedrooms: int(get('bedrooms')), bathrooms: int(get('bathrooms')),
      postcode: get('postcode').replace(/\s+/g, '') || null, city: get('city') || null, address: get('address') || null,
      latitude: lat != null && Math.abs(lat) <= 90 && lat !== 0 ? lat : null, longitude: lng != null && Math.abs(lng) <= 180 && lng !== 0 ? lng : null,
      title: title.slice(0, 160), titleFromFile: !!titleFromFile, description: get('description') || null,
      energyRating: dpe, yearBuilt: int(get('year')),
      condoFeeMonthly: transaction === 'sale' ? charges : null, monthlyCharges: transaction === 'rent' ? charges : null,
      propertyTax: num(get('tax')),
      // French mandatory information (complianceFor)
      dpeStatus: dpeStatusOf(dpeRaw), dpeValue: num(get('dpeValue')), gesClass: dpeOf(get('ges')), gesValue: num(get('gesValue')),
      energyCostMin: num(get('energyCostMin')), energyCostMax: num(get('energyCostMax')), energyCostYear: year && year >= 1900 && year <= 2100 ? String(year) : null,
      ademeNumber: get('ademe') || null,
      feesPayer: feesPayerOf(get('feesPayer'), transaction), feesAmount: num(get('feesAmount')), feesPercent: num(get('feesPercent')),
      priceExclFees: num(get('priceExclFees')), priceIncludesFees: yesNo(get('priceIncludesFees')), feesScheduleUrl: get('feesScheduleUrl') || null,
      condo: yesNo(get('condo')), condoLots: num(get('condoLots')), condoAnnualCharges: num(get('condoAnnualCharges')),
      condoProcedure: yesNo(get('condoProcedure')), condoProcedureDetail: get('condoProcedureDetail') || null, surfaceCarrez: carrez,
      rentIncludesCharges: yesNo(get('rentIncludesCharges')), rentExclCharges: num(get('rentExclCharges')), chargesMethod: chargesMethodOf(get('chargesMethod')),
      furnished: yesNo(get('furnished')), deposit: num(get('deposit')), tenantFees: num(get('tenantFees')), inventoryFees: num(get('inventoryFees')),
      rentSupplement: num(get('rentSupplement')), georisques: yesNo(get('georisques')),
      photos, photoFiles, warnings, errors
    };
  }

  /* ---------------- French mandatory information ---------------- */

  /** Form values (listing-compliance.js FIELDS keys) the row provides. */
  function complianceValues(row) {
    const v = {};
    const set = (k, value) => { if (value !== null && value !== undefined && value !== '') v[k] = value; };
    const sale = row.transaction !== 'rent';
    // Géorisques: stated by a column, or the mention is in the description itself.
    if (row.georisques === true || /georisques/.test(fold(row.description))) v.georisques_disclosure = true;
    set('dpe_status', row.dpeStatus);
    if (row.dpeStatus === 'available') {
      set('dpe_energy_class', row.energyRating);
      set('ghg_class', row.gesClass);
      set('energy_cost_min', row.energyCostMin);
      set('energy_cost_max', row.energyCostMax);
      set('energy_cost_reference_year', row.energyCostYear);
      set('dpe_ademe_number', row.ademeNumber ? String(row.ademeNumber).slice(0, 40) : null);
    }
    set('fees_schedule_url', row.feesScheduleUrl && /^https?:\/\//i.test(row.feesScheduleUrl) ? row.feesScheduleUrl : null);
    if (row.livingAreaSqm > 0) set('surface_habitable_sqm', row.livingAreaSqm);
    if (sale) {
      if (['buyer', 'seller', 'shared'].includes(row.feesPayer)) set('fees_payer', row.feesPayer);
      let amount = row.feesAmount;
      if (amount == null && row.price > 0 && row.priceExclFees > 0 && row.price >= row.priceExclFees) amount = round2(row.price - row.priceExclFees);
      // Poliris column 15 (sales): buyer fees in % of the price excluding fees.
      if (amount == null && row.feesPayer === 'buyer' && row.feesPercent != null && row.price > 0) amount = round2(row.price - row.price / (1 + row.feesPercent / 100));
      set('agency_fees_amount', amount);
      if (typeof row.priceIncludesFees === 'boolean') set('price_includes_agency_fees', row.priceIncludesFees);
      if (row.feesPercent != null && row.feesPercent >= 0 && row.feesPercent <= 100) set('agency_fees_percent', row.feesPercent);
      if (typeof row.condo === 'boolean') set('is_condominium', row.condo);
      if (row.condo === true) {
        set('condominium_lots_count', row.condoLots);
        let annual = row.condoAnnualCharges;
        if (annual == null && row.condoFeeMonthly != null) annual = round2(row.condoFeeMonthly * 12);
        set('annual_condominium_charges', annual);
        if (row.condoProcedure === false) v.condominium_procedure_choice = 'none';
        else if (row.condoProcedure === true) { v.condominium_procedure_choice = 'ongoing'; set('condominium_procedure_detail', row.condoProcedureDetail); }
        if (row.surfaceCarrez > 0) set('surface_carrez_sqm', row.surfaceCarrez);
      }
    } else {
      if (['landlord', 'tenant', 'shared'].includes(row.feesPayer)) set('fees_payer', row.feesPayer);
      // Loi ALUR: the tenant's share never exceeds the landlord's, so tenant fees > 0 means both pay.
      else if (row.tenantFees > 0) set('fees_payer', 'shared');
      else if (row.tenantFees === 0) set('fees_payer', 'landlord');
      set('agency_fees_amount', row.feesAmount);
      let rentExcl = row.rentExclCharges;
      if (rentExcl == null && row.price > 0) {
        if (row.rentIncludesCharges === false) rentExcl = row.price;
        else if (row.rentIncludesCharges === true && row.monthlyCharges != null && row.price >= row.monthlyCharges) rentExcl = round2(row.price - row.monthlyCharges);
      }
      set('monthly_rent_excl_charges', rentExcl);
      set('monthly_charges', row.monthlyCharges);
      set('charges_recovery_method', row.chargesMethod);
      if (typeof row.furnished === 'boolean') set('furnished', row.furnished);
      set('deposit_amount', row.deposit);
      set('tenant_fees_amount', row.tenantFees);
      set('inventory_fees_amount', row.inventoryFees);
      set('rent_supplement_amount', row.rentSupplement);
    }
    return v;
  }

  /** France + residential sale / rent: { applicable, profile, facts, missing, complete, text }. */
  function complianceFor(row, country) {
    const svc = C();
    if (!svc || String(country || '').toUpperCase() !== 'FR' || !RESIDENTIAL.includes(row.subtype)) return { applicable: false };
    const profile = row.transaction === 'rent' ? svc.RENT : svc.SALE;
    const facts = svc.buildFacts(profile, complianceValues(row));
    return describeFacts(profile, facts);
  }

  function describeFacts(profile, facts) {
    const svc = C();
    const check = svc.validateFacts(profile, facts);
    const missing = check.missing.slice();
    Object.keys(check.errors).forEach(k => { if (!missing.includes(k) && svc.MISSING_LABELS[k]) missing.push(k); });
    return { applicable: true, profile, facts, missing, complete: check.valid, text: check.valid ? 'mentions complètes' : `mentions incomplètes : ${svc.missingText(missing)}` };
  }

  /* Stored facts, overlaid with what the file says (manual answers the file cannot carry — Géorisques, encadrement… — are kept). */
  function mergeFacts(profile, existing, fromFile) {
    const svc = C();
    const base = svc.formValues(profile, existing || {});
    const overlay = svc.formValues(profile, fromFile || {});
    return svc.buildFacts(profile, Object.assign(base, overlay));
  }

  function sameJson(a, b) {
    const norm = o => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));
    return norm(a) === norm(b);
  }

  /* ---------------- synchronisation plan (pure) ---------------- */

  const fmtNum = n => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
  const fmtMoney = n => fmtNum(n) + ' €';
  const refKey = ref => String(ref == null ? '' : ref).trim().toLowerCase();
  const differs = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) > 0.005 : String(a) !== String(b));
  const cleanText = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  /* Property columns compared on re-import: [row key, DB column, admin.updateProperty key, French label, format]. */
  const PROPERTY_DIFF = [
    ['areaSqm', 'area_sqm', 'areaSqm', 'Surface', v => fmtNum(v) + ' m²'],
    ['plotAreaSqm', 'plot_area_sqm', 'plotAreaSqm', 'Terrain', v => fmtNum(v) + ' m²'],
    ['typology', 'typology', 'typology', 'Typologie', v => v],
    ['bedrooms', 'bedrooms', 'bedrooms', 'Chambres', v => v],
    ['bathrooms', 'bathrooms', 'bathrooms', 'Salles de bain', v => v],
    ['floor', 'floor', 'floor', 'Étage', v => v],
    ['yearBuilt', 'year_built', 'yearBuilt', 'Année de construction', v => v],
    ['energyRating', 'energy_rating', 'energyRating', 'Classe énergie', v => v],
    ['condoFeeMonthly', 'condo_fee_monthly', 'condoFeeMonthly', 'Charges de copropriété / mois', fmtMoney],
    ['propertyTax', 'imi_annual', 'imiAnnual', 'Taxe foncière', fmtMoney],
    ['postcode', 'postal_code', 'postalCode', 'Code postal', v => v],
    ['address', 'street_address', 'streetAddress', 'Adresse', v => v],
    ['latitude', 'latitude', 'latitude', 'Latitude', v => v],
    ['longitude', 'longitude', 'longitude', 'Longitude', v => v]
  ];

  /** What a known listing would change. entry: a portfolio entry (loadPortfolio). */
  function diffEntry(row, entry, country) {
    const changes = []; const notes = [];
    const property = {}; const commercial = {}; const content = {};
    const p = entry.property || {}; const l = entry.listing;
    const priceLabel = row.transaction === 'rent' ? 'Loyer' : 'Prix';
    if (row.transaction !== l.transactionType) {
      commercial.transactionType = row.transaction; commercial.rentalPeriod = row.rentalPeriod;
      changes.push({ field: 'transaction', group: 'commercial', label: 'Vente / location', from: l.transactionType === 'rent' ? 'location' : 'vente', to: row.transaction === 'rent' ? 'location' : 'vente' });
    }
    if (row.price > 0 && differs(row.price, Number(l.price))) {
      commercial.priceCurrent = row.price;
      changes.push({ field: 'price', group: 'commercial', label: priceLabel, from: Number(l.price) > 0 ? fmtMoney(Number(l.price)) : '—', to: fmtMoney(row.price) });
    }
    PROPERTY_DIFF.forEach(([rk, col, key, label, fmt]) => {
      const v = row[rk];
      if (v === null || v === undefined || v === '') return; // a value missing from the file never erases
      if (rk === 'condoFeeMonthly' && row.transaction === 'rent') return;
      const cur = p[col];
      const curN = typeof v === 'number' && cur !== null && cur !== undefined && cur !== '' ? Number(cur) : cur;
      if (cur === null || cur === undefined || cur === '' || differs(v, curN)) {
        property[key] = v;
        if (rk === 'areaSqm') property.grossPrivateAreaSqm = v;
        if (rk === 'latitude' || rk === 'longitude') return changes.some(c => c.field === 'gps') || changes.push({ field: 'gps', group: 'property', label: 'Coordonnées GPS', from: '', to: 'mises à jour' });
        changes.push({ field: rk, group: 'property', label, from: cur === null || cur === undefined || cur === '' ? '—' : fmt(curN), to: fmt(v) });
      }
    });
    if (row.titleFromFile && cleanText(row.title) !== cleanText(l.title)) {
      content.title = row.title;
      changes.push({ field: 'title', group: 'content', label: 'Titre', from: l.title || '—', to: row.title });
    }
    if (row.description && cleanText(row.description) !== cleanText(l.description)) {
      content.description = row.description;
      changes.push({ field: 'description', group: 'content', label: 'Description', from: '', to: 'modifiée' });
    }
    if (content.title !== undefined || content.description !== undefined) {
      if (content.title === undefined) content.title = l.title || row.title;
      if (content.description === undefined) content.description = l.description || '';
    }
    const known = new Set((entry.queuedUrls || []).map(u => String(u)));
    const room = Math.max(0, 40 - known.size);
    const newPhotos = row.photos.filter(u => !known.has(u)).slice(0, room);
    if (newPhotos.length) changes.push({ field: 'photos', group: 'photos', label: 'Photos', from: '', to: `+${newPhotos.length} nouvelle${newPhotos.length > 1 ? 's' : ''}` });

    let facts = null; let compliance = null;
    const comp = complianceFor(row, country);
    if (comp.applicable && (!entry.compliance || entry.compliance.error)) {
      // Stored facts unknown: never overwrite what the agency may have entered by hand.
      notes.push('Mentions obligatoires non comparées (lecture impossible) : laissées telles quelles');
    } else if (comp.applicable) {
      const existing = entry.compliance && entry.compliance.facts && typeof entry.compliance.facts === 'object' ? entry.compliance.facts : null;
      const merged = mergeFacts(comp.profile, existing, comp.facts);
      compliance = describeFacts(comp.profile, merged);
      const changed = Object.keys(merged).length > 0 && (!existing || !sameJson(merged, existing));
      if (changed && l.status === 'published') {
        notes.push('Annonce en ligne : les mentions obligatoires du fichier ne sont pas appliquées (suspendez l’annonce, puis réimportez)');
      } else if (changed) {
        facts = merged;
        changes.push({ field: 'facts', group: 'facts', label: 'Mentions obligatoires', from: '', to: existing ? 'mises à jour (à revalider)' : 'enregistrées (à valider)' });
      }
      if (!compliance.complete) notes.push(compliance.text);
    }
    return { changes, notes, property, commercial, content, photos: newPhotos, photoOffset: known.size, facts, compliance };
  }

  /** rows (normaliseRow) + the agency’s portfolio → the plan shown before anything is written.
      opts: { country, fullSync, agencyId (grouped Poliris files: only that agency’s lines) }. */
  function planSync(rows, portfolio, opts) {
    const o = opts || {};
    const byRef = new Map();
    (portfolio || []).forEach(e => { if (e.refKey) byRef.set(e.refKey, e); });
    const plan = { creates: [], updates: [], unchanged: [], archives: [], errors: [], ignored: [], archiveBlocked: null, fullSync: !!o.fullSync };
    const seen = new Map();
    rows.forEach((row, index) => {
      const line = index + (o.lineOffset == null ? 2 : o.lineOffset);
      if (o.agencyId && row.agencyId && row.agencyId !== o.agencyId) { plan.ignored.push({ row, index, line }); return; }
      if (row.errors.length) { plan.errors.push({ row, index, line, message: row.errors.join(' · ') }); return; }
      const key = refKey(row.reference);
      if (key) {
        if (seen.has(key)) { plan.errors.push({ row, index, line, message: `Référence en double dans le fichier (déjà ligne ${seen.get(key)})` }); return; }
        seen.set(key, line);
      }
      const entry = key ? byRef.get(key) : null;
      const compliance = complianceFor(row, o.country);
      if (!entry) { plan.creates.push({ row, index, line, compliance, notes: key ? [] : ['Sans référence : impossible de la reconnaître au prochain import'] }); return; }
      if (!entry.listing) {
        plan.errors.push({ row, index, line, entry, message: entry.archivedOnly ? 'Annonce archivée sur Z Find : elle ne peut pas être réactivée par import, recréez-la à la main' : 'Bien déjà présent sans annonce : à compléter à la main' });
        return;
      }
      const diff = diffEntry(row, entry, o.country);
      const item = Object.assign({ row, index, line, entry }, diff);
      if (diff.changes.length || diff.notes.some(n => /^Annonce en ligne/.test(n))) plan.updates.push(item); else plan.unchanged.push(item);
    });
    if (plan.fullSync) {
      if (!seen.size) plan.archiveBlocked = 'Aucune référence reconnue dans le fichier : rien n’est retiré.';
      else {
        (portfolio || []).forEach(e => {
          if (!e.refKey || !e.listing || e.listing.status === 'archived' || seen.has(e.refKey)) return;
          plan.archives.push({ entry: e, reference: e.reference, title: e.listing.title, status: e.listing.status });
        });
      }
    }
    plan.counts = { create: plan.creates.length, update: plan.updates.length, archive: plan.archives.length, error: plan.errors.length, unchanged: plan.unchanged.length, ignored: plan.ignored.length };
    return plan;
  }

  /* ---------------- reading the agency’s portfolio (browser) ---------------- */

  function client() { return supabaseClientModule.getSupabaseClient(); }

  const PORTFOLIO_SELECT = 'id, status, properties!inner(id, agency_reference, subtype, typology, area_sqm, gross_private_area_sqm, plot_area_sqm, floor, bedrooms, bathrooms, year_built, energy_rating, condo_fee_monthly, imi_annual, postal_code, street_address, latitude, longitude, removed_at), '
    + 'listings(id, status, transaction_type, rental_period, price_current, created_at, listing_content(locale, title, description))';

  /** representation rows → one entry per agency reference (the agency’s
      live listing for it: the newest non-archived one). */
  function portfolioFromRows(rows) {
    const byRef = new Map();
    (rows || []).forEach(rep => {
      const p = rep.properties;
      if (!p || p.removed_at || !String(p.agency_reference || '').trim()) return;
      const key = refKey(p.agency_reference);
      const listings = (rep.listings || []).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      const live = listings.find(l => l.status !== 'archived');
      const entry = byRef.get(key) || { reference: String(p.agency_reference).trim(), refKey: key, propertyId: p.id, property: p, representationId: rep.id, listing: null, archivedOnly: false, queuedUrls: [], compliance: null };
      if (live && (!entry.listing || String(live.created_at || '') > String(entry.listing.createdAt || ''))) {
        const fr = (live.listing_content || []).find(c => c.locale === 'fr') || (live.listing_content || [])[0] || {};
        Object.assign(entry, { propertyId: p.id, property: p, representationId: rep.id, archivedOnly: false });
        entry.listing = { id: live.id, status: live.status, transactionType: live.transaction_type, rentalPeriod: live.rental_period, price: live.price_current, createdAt: live.created_at, title: fr.title || '', description: fr.description || '' };
      } else if (!entry.listing && listings.length) entry.archivedOnly = true;
      byRef.set(key, entry);
    });
    return Array.from(byRef.values());
  }

  /** The agency’s imported portfolio, with the photo links already queued. Read only. */
  async function loadPortfolio(partnerId) {
    const { data, error } = await client().from('representations').select(PORTFOLIO_SELECT).eq('partner_id', partnerId).eq('target_type', 'property');
    if (error) return { data: null, error };
    const entries = portfolioFromRows(data);
    const ids = entries.filter(e => e.listing).map(e => e.listing.id);
    const byListing = new Map(entries.filter(e => e.listing).map(e => [e.listing.id, e]));
    for (let i = 0; i < ids.length; i += 150) {
      const q = await client().from('zfind_media_import_queue').select('listing_id, url').in('listing_id', ids.slice(i, i + 150));
      if (q.error) return { data: null, error: q.error };
      (q.data || []).forEach(r => { const e = byListing.get(r.listing_id); if (e) e.queuedUrls.push(r.url); });
    }
    return { data: entries, error: null };
  }

  /** Stored compliance facts of the listings the file matches (needed to
      compare), a few calls at a time. compliance: listing-compliance.js. */
  async function loadComplianceFor(entries, compliance, concurrency) {
    const todo = (entries || []).filter(e => e.listing && e.compliance === null);
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const e = todo[i++];
        const r = await compliance.getListingCompliance(e.listing.id);
        e.compliance = r.error ? { facts: null, error: r.error } : { facts: (r.data && r.data.facts) || {}, reviewStatus: r.data && r.data.review_status, hasRecord: !!(r.data && r.data.review_status && r.data.review_status !== 'unreviewed') };
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency || 6, todo.length) }, worker));
    return entries;
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

  /* ---------------- writing (browser) ---------------- */

  const step = async (label, fn) => { const r = await fn(); if (r && r.error) throw new Error(`${label} : ${r.error.message || r.error.type || 'erreur'}`); return r && r.data; };

  async function importRow(row, partnerId, country, admin, communeResolver) {
    const prop = await step('bien', () => admin.createProperty({ subtype: row.subtype, typology: row.typology, areaSqm: row.areaSqm, floor: row.floor }));
    const propertyId = prop && (prop.id || (Array.isArray(prop) && prop[0] && prop[0].id));
    if (!propertyId) throw new Error('bien : identifiant manquant');
    const extra = {};
    if (row.bedrooms != null) extra.bedrooms = row.bedrooms;
    if (row.bathrooms != null) extra.bathrooms = row.bathrooms;
    if (row.plotAreaSqm != null) extra.plotAreaSqm = row.plotAreaSqm;
    if (row.areaSqm != null) extra.grossPrivateAreaSqm = row.areaSqm;
    if (row.energyRating) extra.energyRating = row.energyRating;
    if (row.ademeNumber) extra.energyCertificateNumber = String(row.ademeNumber).slice(0, 40);
    if (row.yearBuilt) extra.yearBuilt = row.yearBuilt;
    if (row.condoFeeMonthly != null) extra.condoFeeMonthly = row.condoFeeMonthly;
    if (row.propertyTax != null) extra.imiAnnual = row.propertyTax;
    if (row.postcode) extra.postalCode = row.postcode;
    if (row.address) extra.streetAddress = row.address;
    if (row.latitude != null && row.longitude != null) { extra.latitude = row.latitude; extra.longitude = row.longitude; }
    if (row.reference) extra.agencyReference = row.reference;
    if (Object.keys(extra).length) await step('caractéristiques', () => admin.updateProperty(propertyId, extra));
    let commune = null;
    const found = await (communeResolver || resolveCommune)(country, row.postcode, row.city);
    if (found) {
      const set = await client().rpc('zfind_set_asset_commune', { p_kind: 'property', p_asset_id: propertyId, p_country: country, p_code: found.code });
      if (!set.error) commune = found.name;
    }
    const listing = await step('annonce', () => admin.createInitialListing('property', propertyId, partnerId));
    const listingId = listing && listing.id;
    await step('prix', () => admin.updateListingCommercial(listingId, { transactionType: row.transaction, rentalPeriod: row.rentalPeriod, priceCurrent: row.price, currencyIso: 'EUR', priceIsFrom: false }));
    await step('texte', () => admin.upsertListingContent(listingId, 'fr', { title: row.title, description: row.description || '' }));
    return { propertyId, listingId, commune };
  }

  function evidenceOf(source) {
    const s = source || {};
    return { source: 'admin_import', format: s.format || 'csv', file: s.fileName || null, version: s.version || null, imported_at: new Date().toISOString() };
  }

  async function saveFacts(compliance, listingId, facts, source) {
    if (!compliance || !facts || !Object.keys(facts).length) return null;
    const r = await compliance.saveListingCompliance(listingId, facts, evidenceOf(source));
    return r.error ? `mentions non enregistrées : ${compliance.describeError(r.error, 'erreur')}` : null;
  }

  /** Writes a plan. ctx: { partnerId, country, admin, compliance (listing-compliance.js),
      source: { format, fileName, version }, zipPhoto(name) → Blob|null, communeResolver }.
      onProgress(done, total, result). One item never stops the others.
      Returns results (one per created / updated / archived / error / unchanged item) and
      photoJobs ({ listingId, urls, offset }) for the photo queue. */
  async function applyPlan(plan, ctx, onProgress) {
    const c = ctx || {};
    const results = []; const photoJobs = [];
    const total = plan.creates.length + plan.updates.length + plan.archives.length;
    let done = 0;
    const push = r => { results.push(r); if (r.kind !== 'error' && r.kind !== 'unchanged') { done += 1; if (onProgress) onProgress(done, total, r); } };
    plan.errors.forEach(e => results.push({ kind: 'error', status: 'error', line: e.line, reference: e.row.reference, message: e.message }));

    for (const item of plan.creates) {
      const { row } = item;
      try {
        const r = await importRow(row, c.partnerId, c.country, c.admin, c.communeResolver);
        const details = [r.commune ? `Commune : ${r.commune}` : 'Commune à définir'].concat(item.notes || []);
        let complianceText = '';
        if (item.compliance && item.compliance.applicable) {
          const err = await saveFacts(c.compliance, r.listingId, item.compliance.facts, c.source);
          complianceText = err || item.compliance.text;
        }
        if (row.photos.length) photoJobs.push({ listingId: r.listingId, urls: row.photos.slice(0, 40), offset: 0 });
        if (row.photoFiles.length && c.zipPhoto) {
          const n = await uploadZipPhotos(c.admin, r.listingId, row.photoFiles, c.zipPhoto);
          details.push(`${n} photo(s) du ZIP ajoutée(s)`);
        }
        push(Object.assign({ kind: 'create', status: 'ok', line: item.line, reference: row.reference, message: details.join(' · '), compliance: complianceText }, r));
      } catch (e) { push({ kind: 'create', status: 'error', line: item.line, reference: row.reference, message: e.message }); }
    }

    for (const item of plan.updates) {
      const { row, entry } = item;
      const listingId = entry.listing.id;
      const applied = []; const failed = [];
      const run = async (label, fn) => { try { await step(label, fn); return true; } catch (e) { failed.push(e.message); return false; } };
      const of = group => item.changes.filter(x => x.group === group);
      if (Object.keys(item.commercial).length && await run('prix', () => c.admin.updateListingCommercial(listingId, item.commercial))) applied.push(...of('commercial'));
      if (Object.keys(item.property).length && await run('caractéristiques', () => c.admin.updateProperty(entry.propertyId, item.property))) applied.push(...of('property'));
      if (Object.keys(item.content).length && await run('texte', () => c.admin.upsertListingContent(listingId, 'fr', item.content))) applied.push(...of('content'));
      let complianceText = item.compliance ? item.compliance.text : '';
      if (item.facts) {
        const err = await saveFacts(c.compliance, listingId, item.facts, c.source);
        if (err) { failed.push(err); complianceText = err; } else applied.push(...of('facts'));
      }
      if (item.photos.length) { photoJobs.push({ listingId, urls: item.photos, offset: item.photoOffset }); applied.push(...of('photos')); }
      const text = applied.map(changeText).concat(item.notes.filter(n => !/^mentions incomplètes/.test(n)), failed).join(' · ');
      push({ kind: 'update', status: failed.length ? 'error' : 'ok', line: item.line, reference: row.reference, listingId, propertyId: entry.propertyId, message: text || 'Aucun changement appliqué', compliance: complianceText });
    }

    for (const a of plan.archives) {
      const r = await c.admin.setListingStatus(a.entry.listing.id, 'archived');
      const msg = r.error ? (c.compliance ? c.compliance.describeError(r.error, 'Retrait impossible') : 'Retrait impossible') : `Retirée (archivée) — absente du fichier, était « ${STATUS_FR[a.status] || a.status} »`;
      push({ kind: 'archive', status: r.error ? 'error' : 'ok', line: null, reference: a.reference, listingId: a.entry.listing.id, propertyId: a.entry.propertyId, message: msg, compliance: '' });
    }
    plan.unchanged.forEach(u => results.push({ kind: 'unchanged', status: 'ok', line: u.line, reference: u.row.reference, listingId: u.entry.listing.id, propertyId: u.entry.propertyId, message: 'Inchangée', compliance: u.compliance ? u.compliance.text : '' }));
    return { results, photoJobs };
  }

  async function uploadZipPhotos(admin, listingId, names, zipPhoto) {
    let n = 0;
    for (const name of names.slice(0, 40)) {
      try {
        const blob = await zipPhoto(name);
        if (!blob) continue;
        const ext = (/\.(\w+)$/.exec(name) || [])[1] || 'jpg';
        const type = ext.toLowerCase() === 'png' ? 'image/png' : ext.toLowerCase() === 'gif' ? 'image/gif' : ext.toLowerCase() === 'webp' ? 'image/webp' : 'image/jpeg';
        const file = typeof File === 'function' ? new File([blob], name.split('/').pop(), { type }) : Object.assign(blob, { name });
        const r = await admin.uploadListingMedia(listingId, file, { isCover: n === 0 });
        if (!r.error) n += 1;
      } catch (_) { /* one bad photo never stops the import */ }
    }
    return n;
  }

  const STATUS_FR = { draft: 'brouillon', incomplete: 'incomplète', pending_review: 'à vérifier', ready: 'prête à publier', published: 'publiée', suspended: 'suspendue', archived: 'archivée' };
  const KIND_FR = { create: 'Création', update: 'Mise à jour', archive: 'Retrait', error: 'Erreur', unchanged: 'Inchangée' };
  function changeText(ch) { return ch.from ? `${ch.label} : ${ch.from} → ${ch.to}` : `${ch.label} : ${ch.to}`; }

  /** Results → CSV (UTF-8 with BOM, « ; ») for the downloadable report. */
  function resultsCsv(results) {
    const cell = v => { const s = v == null ? '' : String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ['Ligne du fichier', 'Référence', 'Action', 'Résultat', 'Détail', 'Mentions obligatoires', 'Identifiant annonce'];
    const lines = (results || []).map(r => [r.line == null ? '' : r.line, r.reference || '', KIND_FR[r.kind] || r.kind, r.status === 'ok' ? 'OK' : 'Erreur', r.message || '', r.compliance || '', r.listingId || ''].map(cell).join(';'));
    return '﻿' + head.join(';') + '\r\n' + lines.join('\r\n') + (lines.length ? '\r\n' : '');
  }

  /* ---------------- reading files (browser) ---------------- */

  function loadScript(globalName, src) {
    if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
    if (window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => (window[globalName] ? resolve(window[globalName]) : reject(new Error(globalName)));
      s.onerror = () => reject(new Error(globalName));
      document.head.appendChild(s);
    });
  }
  /* Excel: SheetJS; ZIP: JSZip — both loaded on demand from cdnjs (Admin only). */
  const loadSheetJs = () => loadScript('XLSX', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  const loadJsZip = () => loadScript('JSZip', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');

  /** ZIP bytes (agency software export: annonces.csv + photos) → table with zipPhoto(name). */
  async function readZip(bytes, JSZipLib) {
    const zip = await JSZipLib.loadAsync(bytes);
    const files = Object.values(zip.files).filter(f => !f.dir);
    const csv = files.find(f => /(^|\/)annonces?\.(csv|txt)$/i.test(f.name)) || files.find(f => /\.csv$/i.test(f.name));
    if (!csv) throw new Error('Aucun fichier annonces.csv dans le ZIP');
    const table = readCsvBytes(await csv.async('uint8array'));
    const byName = new Map(files.filter(f => /\.(jpe?g|png|gif|webp|bmp)$/i.test(f.name)).map(f => [f.name.split('/').pop().toLowerCase(), f]));
    table.zipPhotoCount = byName.size;
    table.zipPhoto = async name => { const f = byName.get(String(name).split('/').pop().toLowerCase()); return f ? f.async('blob') : null; };
    table.zipEntry = csv.name;
    return table;
  }

  async function readFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(file.name)) return readZip(bytes, await loadJsZip());
    if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
      const XLSX = await loadSheetJs();
      const wb = XLSX.read(bytes, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      return Object.assign(toTable(rows.filter(r => r.some(v => String(v).trim() !== ''))), { format: 'excel' });
    }
    return readCsvBytes(bytes);
  }

  /** The table’s own mapping (Poliris: fixed positions) or the automatic one. */
  function mapFor(table) { return table && table.map ? Object.assign({}, table.map) : autoMap((table && table.headers) || []); }

  return Object.freeze({
    FIELDS, FIELD_KEYS, RESIDENTIAL, STATUS_FR, KIND_FR,
    fold, decodeBytes, detectDelimiter, parseCsv, toTable, readCsvBytes, autoMap, mapFor, templateCsv,
    num, yesNo, transactionOf, transactionErrorOf, subtypeOf, typologyOf, dpeOf, dpeStatusOf, feesPayerOf, chargesMethodOf, normalizeRow,
    complianceValues, complianceFor, mergeFacts, diffEntry, planSync, changeText, resultsCsv,
    portfolioFromRows, loadPortfolio, loadComplianceFor, resolveCommune, importRow, applyPlan, readZip, readFile
  });
});
