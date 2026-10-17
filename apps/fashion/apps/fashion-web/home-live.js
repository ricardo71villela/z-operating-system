/* ============================================================
   Z FASHION — home page, live catalogue
   ============================================================
   Active only when zfashion-config.js gives an API address. Replaces
   the demonstration pieces of the home page with real ones:
     - "Toute la sélection": the 8 newest pieces, linking to their page
     - Corners: the stores that have pieces online
     - bag and favourites buttons open /panier and /favoris
     - search opens /recherche
   The home page's own scripts (app.js…) still run; this file puts the
   real content back whenever they redraw the grid. Values from the API
   always go through esc().
   ============================================================ */

(() => {
  const API = String((window.__ZFASHION_CONFIG__ || {}).apiBaseUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(API)) return;
  const STATE = window.ZFashionCustomerState;

  const COPY = {
    fr: { campaignCopy: 'Des sélections réservées aux membres, préparées avec les boutiques partenaires.', allSaleCopy: 'Les dernières pièces mises en ligne par les boutiques.', seeAll: 'Voir toutes les nouveautés', pieces: 'pièces', empty: 'Les boutiques mettent leurs premières pièces en ligne. Revenez bientôt.', enter: 'Entrer dans le Corner', unavailable: 'Le catalogue est momentanément indisponible.' },
    en: { campaignCopy: 'Members-only selections, prepared with our partner boutiques.', allSaleCopy: 'The latest pieces put online by the boutiques.', seeAll: 'See all new pieces', pieces: 'pieces', empty: 'Boutiques are putting their first pieces online. Come back soon.', enter: 'Enter the Corner', unavailable: 'The catalogue is temporarily unavailable.' },
  };
  const LOCALES = { fr: 'fr-FR', pt: 'pt-PT', en: 'en-GB', es: 'es-ES', it: 'it-IT', de: 'de-DE' };
  const locale = () => document.documentElement.dataset.locale || 'fr';
  const t = (k) => (COPY[locale() === 'fr' ? 'fr' : 'en'] || COPY.fr)[k];
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = (m) => new Intl.NumberFormat(LOCALES[locale()] || 'fr-FR', { style: 'currency', currency: 'EUR' }).format((m || 0) / 100);
  const safeUrl = (u) => (/^https:\/\//.test(String(u || '')) || /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(u || '')) ? String(u) : '');
  const name = (p) => (p.names && (p.names[locale()] || p.names.fr)) || '';
  const $ = (s) => document.querySelector(s);

  let data = null;
  let failed = false;

  // The bag, favourites, account and member buttons lead to the real
  // pages, so the home page's own drawers are never opened on the live site.

  // Bag, favourites and search lead to the real pages.
  const asLink = (selector, href) => {
    const node = $(selector);
    if (!node) return;
    const a = document.createElement('a');
    a.href = href; a.className = node.className; a.id = node.id;
    if (node.getAttribute('aria-label')) a.setAttribute('aria-label', node.getAttribute('aria-label'));
    while (node.firstChild) a.appendChild(node.firstChild);
    node.replaceWith(a);
  };
  asLink('#accountButton', '/compte'); asLink('#memberButton', '/vente-privee');
  asLink('#cartButton', '/panier'); asLink('#wishlistButton', '/favoris'); asLink('#searchTrigger', '/recherche');
  asLink('#mobileCart', '/panier'); asLink('#mobileWishlist', '/favoris'); asLink('#mobileSearch', '/recherche'); asLink('#mobileAccount', '/compte');

  function counts() {
    if (!STATE) return;
    const s = STATE.snapshot();
    const bag = s.bag.reduce((n, i) => n + i.qty, 0);
    [['#cartCount', bag], ['#mobileCartCount', bag], ['#wishlistCount', s.favourites.length], ['#mobileWishlistCount', s.favourites.length]]
      .forEach(([sel, v]) => { const n = $(sel); if (n) n.textContent = String(v); });
  }

  function renderGrid() {
    const grid = $('#productGrid');
    if (!grid) return;
    const pills = $('#filterPills'); if (pills) pills.hidden = true;
    const sort = $('.sort-control'); if (sort) sort.hidden = true;
    const copy = $('[data-i18n="allSaleCopy"]'); if (copy) copy.textContent = t('allSaleCopy');
    const campaign = $('[data-i18n="campaignCopy"]'); if (campaign) campaign.textContent = t('campaignCopy');
    if (failed) { grid.innerHTML = `<p class="empty-drawer" data-live="1">${esc(t('unavailable'))}</p>`; return; }
    if (!data) return;
    const list = data.products.slice(0, 8);
    grid.innerHTML = list.length ? list.map((p) => {
      const img = safeUrl((p.images || [])[0]);
      return `<a class="product-card" data-live="1" href="/produit/${encodeURIComponent(p.id)}" aria-label="${esc((p.brandName || '') + ' ' + name(p))}">
        <div class="product-image">${img ? `<img loading="lazy" src="${esc(img)}" alt="${esc(name(p))}">` : ''}<div class="product-badges"><span>${esc(p.storeName || '')}</span></div></div>
        <div class="product-meta"><strong>${esc(p.brandName || '')}</strong><span class="product-name">${esc(name(p))}</span><span class="price">${esc(money(p.priceMinorUnits))}</span><small>${esc(p.storeName || '')}</small></div></a>`;
    }).join('') : `<p class="empty-drawer" data-live="1">${esc(t('empty'))}</p>`;
    const count = $('#productCount');
    if (count) count.innerHTML = `${esc(data.products.length)} ${esc(t('pieces'))} · <a href="/nouveautes">${esc(t('seeAll'))} →</a>`;
  }

  function renderCorners() {
    const box = $('.corner-grid');
    if (!box || !data) return;
    const stores = data.stores.filter((s) => s.productCount > 0).slice(0, 3);
    const section = $('#corners');
    if (!stores.length) { if (section) section.hidden = true; return; }
    if (section) section.hidden = false;
    box.innerHTML = stores.map((s, i) => `<article class="corner-card corner-${['one', 'two', 'three'][i]}" data-live="1"><div>
      <span>${esc(s.productCount)} ${esc(t('pieces'))}</span><h3>${esc(s.name)}</h3>${s.byline ? `<p>${esc(s.byline)}</p>` : ''}
      <a class="button" href="/corner/${encodeURIComponent(s.partnerId)}">${esc(t('enter'))}</a></div></article>`).join('');
  }

  function render() { renderGrid(); renderCorners(); counts(); }

  // app.js redraws the grid on language change and state changes: put the live grid back.
  const grid = $('#productGrid');
  if (grid) new MutationObserver(() => { if (!grid.querySelector('[data-live]')) renderGrid(); }).observe(grid, { childList: true });
  document.addEventListener('zfashion:preview-state', () => setTimeout(counts, 0));
  document.getElementById('localeSelect')?.addEventListener('change', () => setTimeout(render, 0));

  fetch(API + '/catalog/listing', { headers: { accept: 'application/json' } })
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then((d) => { data = d; render(); })
    .catch(() => { failed = true; render(); });
  counts();
  window.Z_FASHION_HOME_LIVE = 'LIVE';
})();
