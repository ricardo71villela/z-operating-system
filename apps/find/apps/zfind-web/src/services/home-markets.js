/* ============================================================
   Z FIND — HOME "NOS MARCHÉS" (always visible)

   One card per launch market (France, Belgique, Luxembourg) under the
   home search: national official price, number of communes, direct links
   to every top-level division (régions / cantons) and to the market page.
   Data: /geo/summary.json (build_public_divisions.py), ~2 KB.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.homeMarkets = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const ORDER = Object.freeze(['FR', 'BE', 'LU']);
  const COPY = Object.freeze({
    fr: Object.freeze({
      eyebrow: 'Nos marchés', title: 'France, Belgique et Luxembourg, région par région',
      names: { FR: 'France', BE: 'Belgique', LU: 'Luxembourg' },
      level: { FR: 'régions', BE: 'régions', LU: 'cantons' },
      communes: n => `${n.toLocaleString('fr-FR')} communes`,
      price: { FR: 'Appartements, prix médian', BE: 'Maisons, prix médian', LU: 'Appartements, prix enregistré' },
      period: p => (p === '12m' ? '12 derniers mois' : p),
      explore: 'Explorer par région', open: 'Voir le marché', more: n => `+ ${n}`
    }),
    en: Object.freeze({
      eyebrow: 'Our markets', title: 'France, Belgium and Luxembourg, region by region',
      names: { FR: 'France', BE: 'Belgium', LU: 'Luxembourg' },
      level: { FR: 'regions', BE: 'regions', LU: 'cantons' },
      communes: n => `${n.toLocaleString('en-IE')} municipalities`,
      price: { FR: 'Apartments, median price', BE: 'Houses, median price', LU: 'Apartments, registered price' },
      period: p => (p === '12m' ? 'last 12 months' : p),
      explore: 'Explore by region', open: 'View market', more: n => `+ ${n}`
    })
  });
  const MAX_CHIPS = 6;

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function money(v, lang, unit) {
    if (v == null) return '—';
    const n = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-IE', { maximumFractionDigits: 0 }).format(v);
    const suffix = unit === 'eur_m2' ? '/m²' : '';
    return lang === 'fr' ? `${n} €${suffix}` : `€${n}${suffix}`;
  }

  let summaryPromise = null;
  function loadSummary() {
    if (!summaryPromise) {
      summaryPromise = fetch('/geo/summary.json', { credentials: 'omit' })
        .then(r => { if (!r.ok) throw new Error('summary ' + r.status); return r.json(); })
        .catch(e => { summaryPromise = null; throw e; });
    }
    return summaryPromise;
  }

  function marketHref(lang, key, query) { return `#/${lang}/market/${key}${query ? '?' + query : ''}`; }

  function cardHTML(lang, c, key, m) {
    const name = d => (lang === 'fr' ? d.n : d.en || d.n);
    const chips = m.top.slice(0, MAX_CHIPS)
      .map(d => `<a class="hm-chip" href="${esc(marketHref(lang, key, 'div=' + encodeURIComponent(d.c)))}">${esc(name(d))}</a>`).join('');
    const more = m.top.length > MAX_CHIPS
      ? `<a class="hm-chip hm-more" href="${esc(marketHref(lang, key, 'go=regions'))}">${c.more(m.top.length - MAX_CHIPS)}</a>` : '';
    const price = key === 'BE' ? m.pm : m.pa;
    return `
      <article class="hm-card" data-home-market="${key}">
        <h3><a href="${esc(marketHref(lang, key))}">${c.names[key]}</a></h3>
        <p class="hm-meta">${m.top.length} ${c.level[key]} · ${c.communes(m.communes)}</p>
        <p class="hm-price"><strong>${money(price, lang, m.priceUnit)}</strong><span>${c.price[key]} · ${esc(c.period(m.period))}</span></p>
        <div class="hm-chips">${chips}${more}</div>
        <div class="hm-actions">
          <a class="hm-primary" href="${esc(marketHref(lang, key, 'go=regions'))}">${c.explore}</a>
          <a class="hm-secondary" href="${esc(marketHref(lang, key))}">${c.open}</a>
        </div>
      </article>`;
  }

  async function render(rootEl, lang) {
    if (!rootEl) return false;
    const c = COPY[lang] || COPY.en;
    let summary;
    try { summary = await loadSummary(); } catch (_) { rootEl.innerHTML = ''; return false; }
    rootEl.innerHTML = `
      <div class="block-head"><div><span class="eyebrow">${c.eyebrow}</span><h2>${c.title}</h2></div></div>
      <div class="hm-grid">${ORDER.filter(k => summary[k]).map(k => cardHTML(lang, c, k, summary[k])).join('')}</div>`;
    return true;
  }

  return Object.freeze({ COPY, ORDER, render, _internals: Object.freeze({ cardHTML, marketHref }) });
});
