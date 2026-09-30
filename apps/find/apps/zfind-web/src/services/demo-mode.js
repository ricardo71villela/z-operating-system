/* ============================================================
   Z FIND — DEMONSTRATION MODE

   For presentations (bank, agencies) before the paid features are
   switched on. Opening any page with ?demo=1 (in the address or in the
   route, e.g. #/fr/market/FR?demo=1) turns it on for the browser tab;
   ?demo=0 or the banner's "Quit" link turns it off.

   In this mode only:
     - empty "Featured" slots show fictitious sponsored listings;
     - agencies without published reviews show fictitious example reviews.
   Everything shown is labelled "example / fictitious" on the item itself,
   and a banner stays at the top of every page. Organic search results
   are never touched, demo items never link to a real listing, and
   nothing is written anywhere.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.demoMode = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const KEY = 'zfind_demo';

  const COPY = Object.freeze({
    fr: Object.freeze({
      banner: 'Mode démonstration : les annonces « À la une » et les avis marqués « exemple » sont fictifs.',
      quit: 'Quitter la démonstration', badge: 'À la une · exemple', agency: 'Agence exemple', sponsored: 'Emplacement sponsorisé — exemple fictif', from: 'à partir de'
    }),
    en: Object.freeze({
      banner: 'Demonstration mode: "Featured" listings and reviews marked "example" are fictitious.',
      quit: 'Quit the demonstration', badge: 'Featured · example', agency: 'Example agency', sponsored: 'Sponsored slot — fictitious example', from: 'from'
    })
  });

  const LISTINGS = Object.freeze({
    FR: [
      { fr: 'Maison 5 pièces, vue lac', en: '5-room house, lake view', place: 'Évian-les-Bains', price: 890000, meta: ['T5', '162 m²'] },
      { fr: 'Appartement T3 avec terrasse', en: '2-bed apartment with terrace', place: 'Annecy', price: 485000, meta: ['T3', '74 m²'] },
      { fr: 'Programme neuf, du T2 au T4', en: 'New development, 1 to 3 beds', place: 'Thonon-les-Bains', price: 289000, from: true, meta: ['VEFA', '24 lots'] },
      { fr: 'Loft rénové', en: 'Renovated loft', place: 'Lyon 6e', price: 720000, meta: ['T4', '110 m²'] },
      { fr: 'Villa avec piscine', en: 'Villa with pool', place: 'Aix-en-Provence', price: 1250000, meta: ['T6', '210 m²'] },
      { fr: 'Appartement familial', en: 'Family apartment', place: 'Bordeaux', price: 540000, meta: ['T4', '96 m²'] }
    ],
    BE: [
      { fr: 'Appartement 2 chambres', en: '2-bedroom apartment', place: 'Ixelles', price: 395000, meta: ['2 ch.', '88 m²'] },
      { fr: 'Maison 4 façades', en: 'Detached house', place: 'Namur', price: 520000, meta: ['4 ch.', '190 m²'] },
      { fr: 'Nouveau projet résidentiel', en: 'New residential project', place: 'Liège', price: 239000, from: true, meta: ['Neuf', '36 lots'] },
      { fr: 'Villa contemporaine', en: 'Contemporary villa', place: 'Waterloo', price: 950000, meta: ['5 ch.', '280 m²'] },
      { fr: 'Penthouse avec terrasse', en: 'Penthouse with terrace', place: 'Uccle', price: 1100000, meta: ['3 ch.', '165 m²'] },
      { fr: 'Maison de ville', en: 'Town house', place: 'Mons', price: 285000, meta: ['3 ch.', '140 m²'] }
    ],
    LU: [
      { fr: 'Appartement 2 chambres', en: '2-bedroom apartment', place: 'Luxembourg-Kirchberg', price: 890000, meta: ['2 ch.', '82 m²'] },
      { fr: 'Maison jumelée', en: 'Semi-detached house', place: 'Esch-sur-Alzette', price: 780000, meta: ['4 ch.', '170 m²'] },
      { fr: 'Résidence neuve', en: 'New residence', place: 'Strassen', price: 690000, from: true, meta: ['Neuf', '18 lots'] },
      { fr: 'Maison avec jardin', en: 'House with garden', place: 'Bertrange', price: 1450000, meta: ['5 ch.', '240 m²'] },
      { fr: 'Duplex lumineux', en: 'Bright duplex', place: 'Mersch', price: 720000, meta: ['3 ch.', '120 m²'] },
      { fr: 'Appartement rénové', en: 'Renovated apartment', place: 'Differdange', price: 495000, meta: ['2 ch.', '78 m²'] }
    ]
  });

  const REVIEWS = Object.freeze({
    fr: [
      { rating: 5, author_label: 'Claire M. (exemple)', comment: 'Réponse le jour même, visite organisée rapidement et dossier complet (diagnostics, charges). Très professionnel.' },
      { rating: 4, author_label: 'Thomas R. (exemple)', comment: 'Bon suivi et informations claires. Un petit délai pour obtenir le règlement de copropriété.' },
      { rating: 5, author_label: 'Sophie L. (exemple)', comment: 'Estimation argumentée avec les ventes du quartier, vendu au prix en six semaines.' }
    ],
    en: [
      { rating: 5, author_label: 'Claire M. (example)', comment: 'Same-day reply, quick viewing and a complete file (surveys, service charges). Very professional.' },
      { rating: 4, author_label: 'Thomas R. (example)', comment: 'Good follow-up and clear information. A short delay to get the building rules.' },
      { rating: 5, author_label: 'Sophie L. (example)', comment: 'Valuation backed by local sales; sold at the asking price in six weeks.' }
    ]
  });

  function copyFor(lang) { return COPY[lang] || COPY.en; }

  function storage() {
    try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch (_) { return null; }
  }

  /* Reads ?demo= from the address and the route; remembers it for the tab. */
  function sync(locationLike) {
    const loc = locationLike || (typeof location !== 'undefined' ? location : null);
    const text = loc ? `${loc.search || ''}&${String(loc.hash || '').split('?')[1] || ''}` : '';
    const m = /(?:^|[?&])demo=([01])\b/.exec(text);
    const store = storage();
    if (m && store) {
      try { if (m[1] === '1') store.setItem(KEY, '1'); else store.removeItem(KEY); } catch (_) { /* private mode */ }
    }
    if (m) return m[1] === '1';
    try { return Boolean(store && store.getItem(KEY) === '1'); } catch (_) { return false; }
  }

  let active = false;
  function isOn() { return active; }
  function refresh(locationLike) { active = sync(locationLike); return active; }
  /* Turns the mode off and removes ?demo=1 from the address, so a reload
     or a shared link does not turn it back on. */
  function quit(locationLike) {
    const store = storage();
    try { if (store) store.removeItem(KEY); } catch (_) { /* ignore */ }
    active = false;
    const loc = locationLike || (typeof location !== 'undefined' ? location : null);
    if (!loc) return '';
    const clean = value => String(value || '').replace(/([?&])demo=1(&|$)/, (m, a, b) => (b ? a : '')).replace(/[?&]$/, '');
    const next = String(loc.pathname || '/') + clean(loc.search) + clean(loc.hash);
    return next;
  }

  /* Banner link: clean address, then a fresh page without the examples. */
  function quitAndReload() {
    const next = quit();
    if (!next || typeof location === 'undefined') return;
    if (next.split('#')[0] !== location.pathname + location.search) { location.replace(next); return; }
    try { history.replaceState(null, '', next); } catch (_) { /* ignore */ }
    location.reload();
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(v, lang) {
    const n = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-IE', { maximumFractionDigits: 0 }).format(v);
    return lang === 'fr' ? `${n} €` : `€${n}`;
  }

  function featuredListing(marketKey, position) {
    const list = LISTINGS[marketKey] || LISTINGS.FR;
    return list[(Math.max(1, position) - 1) % list.length];
  }

  /* A sponsored slot filled with a fictitious listing (never a real link). */
  function featuredSlotHTML(marketKey, position, lang, className) {
    const c = copyFor(lang);
    const item = featuredListing(marketKey, position);
    const title = lang === 'fr' ? item.fr : item.en;
    const price = (item.from ? c.from + ' ' : '') + money(item.price, lang);
    const cls = String(className || '');
    const labelClass = /market-featured/.test(cls) ? 'market-featured-label' : (/search-featured/.test(cls) ? 'search-featured-label' : '');
    return `
      <div class="${esc(cls)} zdemo-slot" data-demo-slot="${position}" aria-label="${esc(c.sponsored)}">
        ${labelClass ? `<span class="${labelClass} zdemo-label">${esc(c.badge)}</span>` : ''}
        <div class="card zdemo-card" onclick="navigate('pro')">
          <div class="thumb zdemo-thumb zdemo-thumb-${((position - 1) % 6) + 1}"><span class="badge gold">${esc(c.badge)}</span></div>
          <div class="body">
            <div class="price">${esc(price)}</div>
            <div class="loc">${esc(title)} — ${esc(item.place)}</div>
            <div class="meta">${item.meta.map(m => `<span>${esc(m)}</span>`).join('')}</div>
            <div class="facts-count">${esc(c.agency)} · ${esc(c.sponsored)}</div>
          </div>
        </div>
      </div>`;
  }

  function exampleReviews(lang, partnerId) {
    const now = Date.now();
    return (REVIEWS[lang] || REVIEWS.en).map((r, i) => Object.assign({
      id: `demo-${i}`, partner_id: partnerId || null, lang, verified_contact: true,
      published_at: new Date(now - (i + 1) * 23 * 86400000).toISOString(), partner_reply: null
    }, r));
  }

  function bannerHTML(lang) {
    const c = copyFor(lang);
    return `<div class="zdemo-banner" id="zdemo-banner" role="status"><span>${esc(c.banner)}</span>
      <a href="#" onclick="window.ZFindServices.demoMode.quitAndReload(); return false;">${esc(c.quit)}</a></div>`;
  }

  /* Keeps the banner in sync with the mode (called on every route change). */
  function applyBanner(doc, lang) {
    if (!doc || !doc.body) return;
    const existing = doc.getElementById('zdemo-banner');
    if (!active) { if (existing) existing.remove(); return; }
    if (existing && existing.dataset.lang === lang) return;
    if (existing) existing.remove();
    doc.body.insertAdjacentHTML('afterbegin', bannerHTML(lang));
    const el = doc.getElementById('zdemo-banner');
    if (el) el.dataset.lang = lang;
  }

  return Object.freeze({ COPY, LISTINGS, isOn, refresh, quit, quitAndReload, featuredSlotHTML, featuredListing, exampleReviews, bannerHTML, applyBanner, _internals: Object.freeze({ sync }) });
});
