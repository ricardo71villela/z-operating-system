/* ============================================================
   Z FIND — NATURAL-LANGUAGE SEARCH (French and English)

   Turns a sentence into the portal's search filters, without any external
   service: "T3 avec balcon à Évian moins de 450 000 €",
   "3-bedroom house in Namur under 400k", "location studio Luxembourg".
   What is not recognised stays as place text (resolved to a commune by
   place-search.js). Returns what was understood so the page can show it.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.naturalSearch = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function fold(value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /* "450 000", "450k", "450 k€", "1,2 M€", "1.2m", "450000" → number */
  function parseAmount(raw, unit) {
    let n = Number(String(raw).replace(/\s| | /g, '').replace(',', '.'));
    if (!Number.isFinite(n)) return null;
    const u = fold(unit || '').replace(/[€\s]|eur(os?)?/g, '');
    if (u === 'k') n *= 1000;
    else if (u === 'm' || u === 'million' || u === 'millions') n *= 1000000;
    return n > 0 ? Math.round(n) : null;
  }

  const AMOUNT = '(\\d{1,3}(?:[\\s\\u00a0\\u202f]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*(k|m|millions?|mio)?\\s*(?:€|eur(?:os?)?)?';

  // A bare amount counts as a budget only with a currency or k / M: "450 000 €", "450k".
  const AMOUNT_WITH_UNIT = '(\\d{1,3}(?:[\\s\\u00a0\\u202f]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*(k|m|millions?|mio)?\\s*(?:€|eur(?:os?)?)(?![a-z])|(\\d+(?:[.,]\\d+)?)\\s*(k|m|mio)(?:€)?(?![a-z0-9²])';

  const RULES = [
    // transaction
    { re: /\b(a louer|location|louer|loue|rent(?:al)?|to rent|for rent|lease)\b/, apply: f => { f.transactionType = 'rent'; }, label: 'transaction' },
    { re: /\b(a vendre|acheter|achat|vente|buy|to buy|for sale|purchase)\b/, apply: f => { f.transactionType = 'sale'; }, label: 'transaction' },
    // property type
    { re: /\b(programmes? neufs?|neuf|vefa|new[- ]build|new development|off[- ]plan)\b/, apply: f => { f.subtype = 'development'; }, label: 'type' },
    { re: /\b(terrains?|parcelles?|land|plot|building plot)\b/, apply: f => { f.subtype = 'land'; }, label: 'type' },
    { re: /\b(maisons?|villas?|house|houses|home|chalet)\b/, apply: f => { f.subtype = 'villa'; }, label: 'type' },
    { re: /\b(appartements?|appart|studios?|duplex|penthouse|apartments?|flats?|loft)\b/, apply: (f, m) => { f.subtype = 'apartment'; if (/studio/.test(m[1])) f.roomsMin = f.roomsMin || 1; }, label: 'type' },
    // rooms / bedrooms
    { re: /\b[tf]\s?(\d)\b/, apply: (f, m) => { f.roomsMin = Number(m[1]); if (!f.subtype) f.subtype = 'apartment'; }, label: 'rooms' },
    { re: /\b(\d)\s*(?:pieces?|rooms?)\b/, apply: (f, m) => { f.roomsMin = Number(m[1]); }, label: 'rooms' },
    { re: /\b(\d)\s*(?:chambres?|ch\.?|bedrooms?|beds?|bed)\b|\b(\d)[- ]bed(?:room)?\b/, apply: (f, m) => { f.bedsMin = Number(m[1] || m[2]); }, label: 'beds' },
    // surface
    { re: /\b(?:(plus de|au moins|minimum|min\.?|over|at least|more than|from)\s*)?(\d{2,4})\s*(?:m2|m²|m²|sqm|metres? carres?|square met(?:er|re)s?)/, apply: (f, m) => { f.areaMin = Number(m[2]); }, label: 'area' },
    // price range, max, min
    { re: new RegExp('\\b(?:entre|between)\\s*' + AMOUNT + '\\s*(?:et|and|-|a)\\s*' + AMOUNT), apply: (f, m) => { f.priceMin = parseAmount(m[1], m[2]); f.priceMax = parseAmount(m[3], m[4]); }, label: 'price' },
    { re: new RegExp("\\b(?:moins de|max(?:imum)?\\.?|jusqu a|jusqu'a|budget(?: max)?|under|below|up to|less than|max\\.?)\\s*" + AMOUNT), apply: (f, m) => { f.priceMax = parseAmount(m[1], m[2]); }, label: 'price' },
    { re: new RegExp('\\b(?:plus de|a partir de|minimum|min\\.?|over|from|more than)\\s*' + AMOUNT), apply: (f, m) => { f.priceMin = parseAmount(m[1], m[2]); }, label: 'price' },
    { re: new RegExp(AMOUNT_WITH_UNIT), apply: (f, m) => { if (f.priceMax == null) f.priceMax = parseAmount(m[1] || m[3], m[2] || m[4]); }, label: 'price' },
    // features
    { re: /\b(balcon|terrasse|jardin|exterieur|balcony|terrace|garden|outdoor space|patio)\b/, apply: f => { f.outdoor = true; }, label: 'outdoor' },
    { re: /\b(parking|garage|box|place de parking|parking space)\b/, apply: f => { f.parking = true; }, label: 'parking' },
    { re: /\b(ascenseur|elevator|lift)\b/, apply: f => { f.lift = true; }, label: 'lift' },
    { re: /\b(?:dpe|classe energie|classe energetique|energy (?:class|rating)|epc)\s*([a-g])\b/, apply: (f, m) => { f.energyMax = m[1].toUpperCase(); }, label: 'energy' }
  ];

  const STOP_WORDS = new Set(('avec et de des du d l la le les un une a au aux en dans sur pres proche pas cher chere je cherche recherche '
    + 'recherchons voudrais veux pour batir construire constructible with and an the in near at looking for i am want to of close around cheap '
    + 'quartier centre center ville city commune secteur region me moi nous please svp').split(' '));

  function parse(text) {
    const original = String(text || '').trim();
    let rest = ' ' + fold(original).replace(/[,;!?()]/g, ' ') + ' ';
    const filters = {};
    const understood = [];
    RULES.forEach(rule => {
      const m = rule.re.exec(rest);
      if (!m) return;
      const before = JSON.stringify(filters);
      rule.apply(filters, m);
      if (JSON.stringify(filters) !== before && !understood.includes(rule.label)) understood.push(rule.label);
      rest = rest.replace(m[0], ' ');
    });
    // Place = the words left over: stop words dropped, postcodes (4-5 digits) kept.
    const place = understood.length
      ? rest.split(/\s+/).filter(w => w && !STOP_WORDS.has(w) && !/^[€.]+$/.test(w) && (!/^\d+$/.test(w) || /^\d{4,5}$/.test(w))).join(' ')
      : original;
    return { filters, place, understood, hasCriteria: understood.length > 0 };
  }

  /* Words that only make sense as criteria: the search bar treats the text as
     a sentence when it contains any of them, else as a plain place name. */
  function looksLikeSentence(text) {
    return parse(text).hasCriteria;
  }

  return Object.freeze({ parse, parseAmount, looksLikeSentence, fold });
});
