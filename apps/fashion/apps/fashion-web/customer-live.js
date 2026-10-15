/* ============================================================
   Z FASHION — live storefront (real catalogue from the API)
   ============================================================
   Active only when zfashion-config.js gives an API address
   (window.__ZFASHION_CONFIG__.apiBaseUrl). Without it the site keeps
   its demonstration layers unchanged.

   When active, this layer owns #pageContent on:
     catalogue pages   /nouveautes /femme /homme /enfant /sport
                       /accessoires /beaute /soldes /recherche
                       /vente-privee /produit/:id /corners /corner/:id
     /favoris, /panier (the bag stays in this browser until checkout)
   and other layers hand over to it through ZFashionLive.owns(route).
   customer-checkout.js registers the checkout and account pages the
   same way.

   Data: GET /catalog/listing (public): every priced product of active
   stores with names, photos, price, stock label, store and site
   sections (fashion-domain/src/storefront.js). Nothing from the API
   is inserted as HTML: every value goes through esc().
   ============================================================ */

(() => {
  const CONFIG = window.__ZFASHION_CONFIG__ || {};
  const API = String(CONFIG.apiBaseUrl || '').replace(/\/+$/, '');
  const ROUTES = window.ZFashionCustomerRoutes;
  const STATE = window.ZFashionCustomerState;
  const active = /^https?:\/\//.test(API) && !!ROUTES && !!STATE;

  const COPY = {
    fr: {
      loading: 'Chargement…', unavailable: 'Le catalogue est momentanément indisponible. Réessayez dans un instant.', retry: 'Réessayer',
      pieces: 'pièces', sort: 'Trier', newest: 'Nouveautés', priceLow: 'Prix croissant', priceHigh: 'Prix décroissant',
      empty: 'Aucune pièce pour l’instant', emptyCopy: 'Les boutiques ajoutent leurs pièces au fil des jours. Revenez bientôt.',
      noSale: 'Pas de soldes en ce moment', noSaleCopy: 'Les prix barrés apparaîtront ici pendant les périodes de soldes.',
      privateSoon: 'Ventes privées bientôt', privateSoonCopy: 'Les ventes privées réservées aux membres ouvriront prochainement.',
      searchHint: 'Marque, pièce ou boutique', search: 'Rechercher', noResults: 'Aucun résultat',
      notFound: 'Cette pièce n’est plus disponible', notFoundCopy: 'Elle a peut-être été vendue ou retirée par la boutique.',
      backToNew: 'Voir les nouveautés', soldBy: 'Vendu et expédié par', size: 'Taille', format: 'Format', otherSizes: 'Autres tailles',
      in_stock: 'En stock', low_stock: 'Dernières pièces', out_of_stock: 'Épuisé',
      add: 'Ajouter au panier', added: 'Ajouté au panier', soldOut: 'Épuisé', save: 'Favori', maxQty: 'Quantité maximale atteinte.',
      delivery: 'Livraison incluse en France', returns: 'Retours sous 14 jours après livraison', sellerNote: 'Chaque boutique prépare et expédie son colis.',
      corners: 'Boutiques', viewCorner: 'Voir la boutique', allCorners: 'Toutes les boutiques', cornerPieces: 'pièces en ligne',
      noCorners: 'Les boutiques arrivent', noCornersCopy: 'Les premières boutiques ouvrent leur Corner très bientôt.',
      bagEmpty: 'Votre panier est vide', bagEmptyCopy: 'Ajoutez des pièces depuis le catalogue.', remove: 'Retirer',
      summary: 'Résumé', subtotal: 'Sous-total', deliveryLine: 'Livraison', included: 'Incluse', total: 'Total TTC', checkout: 'Commander',
      lineUnavailable: 'Plus disponible — retirez-la pour commander.', lineStock: 'Stock insuffisant pour cette quantité.',
      bagNote: 'Le paiement se fait en une fois ; chaque boutique expédie ses pièces.',
      favEmpty: 'Aucun favori', favEmptyCopy: 'Touchez ♡ sur une pièce pour la retrouver ici.',
      quantity: 'Quantité',
    },
    en: {
      loading: 'Loading…', unavailable: 'The catalogue is temporarily unavailable. Please try again shortly.', retry: 'Try again',
      pieces: 'pieces', sort: 'Sort', newest: 'Newest', priceLow: 'Price: low to high', priceHigh: 'Price: high to low',
      empty: 'No pieces yet', emptyCopy: 'Boutiques add new pieces every day. Come back soon.',
      noSale: 'No sale right now', noSaleCopy: 'Reduced prices will appear here during sale periods.',
      privateSoon: 'Private sales coming soon', privateSoonCopy: 'Members-only private sales will open soon.',
      searchHint: 'Brand, piece or boutique', search: 'Search', noResults: 'No results',
      notFound: 'This piece is no longer available', notFoundCopy: 'It may have been sold or withdrawn by the boutique.',
      backToNew: 'See what’s new', soldBy: 'Sold and shipped by', size: 'Size', format: 'Format', otherSizes: 'Other sizes',
      in_stock: 'In stock', low_stock: 'Last pieces', out_of_stock: 'Sold out',
      add: 'Add to bag', added: 'Added to bag', soldOut: 'Sold out', save: 'Favourite', maxQty: 'Maximum quantity reached.',
      delivery: 'Delivery included in France', returns: 'Returns within 14 days of delivery', sellerNote: 'Each boutique prepares and ships its own parcel.',
      corners: 'Boutiques', viewCorner: 'Visit the boutique', allCorners: 'All boutiques', cornerPieces: 'pieces online',
      noCorners: 'Boutiques are coming', noCornersCopy: 'The first boutiques open their Corner very soon.',
      bagEmpty: 'Your bag is empty', bagEmptyCopy: 'Add pieces from the catalogue.', remove: 'Remove',
      summary: 'Summary', subtotal: 'Subtotal', deliveryLine: 'Delivery', included: 'Included', total: 'Total incl. VAT', checkout: 'Checkout',
      lineUnavailable: 'No longer available — remove it to check out.', lineStock: 'Not enough stock for this quantity.',
      bagNote: 'You pay once; each boutique ships its own pieces.',
      favEmpty: 'No favourites', favEmptyCopy: 'Tap ♡ on a piece to find it here.',
      quantity: 'Quantity',
    },
  };
  const LOCALES = { fr: 'fr-FR', pt: 'pt-PT', en: 'en-GB', es: 'es-ES', it: 'it-IT', de: 'de-DE' };
  const locale = () => document.documentElement.dataset.locale || 'fr';
  const lang = () => (locale() === 'fr' ? 'fr' : 'en');
  const t = (key) => COPY[lang()][key] || COPY.fr[key] || key;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = (minor) => new Intl.NumberFormat(LOCALES[locale()] || 'fr-FR', { style: 'currency', currency: 'EUR' }).format((minor || 0) / 100);
  const safeUrl = (u) => (/^https:\/\//.test(String(u || '')) || /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(u || '')) ? String(u) : '');
  const MAX_QTY = 10;

  const resolveRoute = (pathname) => ROUTES.routes.find((r) => r.path === pathname || (r.pattern && new RegExp(r.pattern).test(pathname))) || null;
  const route = active ? resolveRoute(location.pathname) : null;
  const page = document.getElementById('pageContent');
  const lastSegment = () => decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1) || '');

  // ---------- catalogue

  const CACHE_KEY = 'zfashion_live_catalogue_v1';
  let catalogue = null; // { products, stores, byId, storeById }
  let loading = null;
  let failed = false;

  function index(data) {
    const byId = new Map(data.products.map((p) => [p.id, p]));
    const storeById = new Map(data.stores.map((s) => [s.partnerId, s]));
    return { products: data.products, stores: data.stores, byId, storeById };
  }
  function loadCatalogue() {
    if (catalogue) return Promise.resolve(catalogue);
    if (loading) return loading;
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (cached && cached.at > Date.now() - 60000 && Array.isArray(cached.data.products)) {
        catalogue = index(cached.data);
        return Promise.resolve(catalogue);
      }
    } catch (_) { /* no cache */ }
    loading = fetch(API + '/catalog/listing', { headers: { accept: 'application/json' } })
      .then((r) => { if (!r.ok) throw new Error('listing ' + r.status); return r.json(); })
      .then((data) => {
        catalogue = index(data); failed = false;
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch (_) {}
        return catalogue;
      })
      .catch((err) => { failed = true; loading = null; throw err; });
    return loading;
  }

  const name = (p) => (p.names && (p.names[locale()] || p.names.fr)) || '';
  const description = (p) => (p.descriptions && (p.descriptions[locale()] || p.descriptions.fr)) || '';
  const sizeLabel = (p) => {
    if (p.size) return (p.size.system && !/^alpha$/i.test(p.size.system) ? p.size.system + ' ' : '') + p.size.value;
    if (p.format) return p.format.volumeMl ? p.format.volumeMl + ' ml' : (p.format.shade || '');
    return '';
  };
  const storeName = (p) => p.storeName || (catalogue && catalogue.storeById.get(p.partnerId) || {}).name || '';
  const cover = (p) => safeUrl((p.images || [])[0]);

  // ---------- markup helpers

  const emptyBlock = (title, copy, href, label) => `<div class="commerce-empty"><h2>${esc(title)}</h2><p>${esc(copy)}</p>${href ? `<a class="route-button secondary" href="${esc(href)}">${esc(label)}</a>` : ''}</div>`;
  const productCard = (p) => `<article class="commerce-product-card" data-product="${esc(p.id)}" data-price="${esc(p.priceMinorUnits)}">
      <a class="commerce-product-image" href="/produit/${encodeURIComponent(p.id)}" aria-label="${esc(name(p))}">
        ${cover(p) ? `<img src="${esc(cover(p))}" alt="${esc(name(p))}" loading="lazy">` : '<span class="zf-live-noimg" aria-hidden="true">Z</span>'}
        ${p.availability && !p.availability.sellable ? `<span class="commerce-badge">${esc(t('out_of_stock'))}</span>` : ''}
      </a>
      <div class="commerce-product-meta">
        <div><span class="commerce-brand">${esc(p.brandName || '')}</span><a class="commerce-name" href="/produit/${encodeURIComponent(p.id)}">${esc(name(p))}</a></div>
        <div class="commerce-price"><strong>${esc(money(p.priceMinorUnits))}</strong></div>
      </div>
      <a class="commerce-partner" href="/corner/${encodeURIComponent(p.partnerId)}">${esc(storeName(p))}${sizeLabel(p) ? ' · ' + esc(sizeLabel(p)) : ''}</a>
    </article>`;

  let currentSort = 'newest';
  const sorted = (list) => {
    const r = [...list];
    if (currentSort === 'price-asc') r.sort((a, b) => a.priceMinorUnits - b.priceMinorUnits);
    else if (currentSort === 'price-desc') r.sort((a, b) => b.priceMinorUnits - a.priceMinorUnits);
    return r;
  };
  const grid = (list, emptyTitle, emptyCopy) => {
    if (!list.length) return emptyBlock(emptyTitle || t('empty'), emptyCopy || t('emptyCopy'), '/nouveautes', t('backToNew'));
    return `<div class="commerce-toolbar"><span><strong id="commerceCount">${list.length}</strong> ${esc(t('pieces'))}</span><label>${esc(t('sort'))}<select id="liveSort">
      <option value="newest">${esc(t('newest'))}</option><option value="price-asc">${esc(t('priceLow'))}</option><option value="price-desc">${esc(t('priceHigh'))}</option></select></label></div>
      <div class="commerce-product-grid" id="commerceProductGrid">${sorted(list).map(productCard).join('')}</div>`;
  };
  function wireSort(list) {
    const select = document.getElementById('liveSort');
    if (!select) return;
    select.value = currentSort;
    select.addEventListener('change', () => {
      currentSort = select.value;
      document.getElementById('commerceProductGrid').innerHTML = sorted(list).map(productCard).join('');
    });
  }
  function setTitle(text) {
    const h = document.getElementById('pageTitle');
    if (h && text) { h.textContent = text; document.title = text + ' — Z Fashion'; }
  }

  // ---------- pages

  const SECTION_OF = { women: 'women', men: 'men', kids: 'kids', sport: 'sport', accessories: 'accessories', beauty: 'beauty' };

  function renderCategory() {
    let list = catalogue.products;
    if (SECTION_OF[route.id]) list = list.filter((p) => (p.sections || []).includes(SECTION_OF[route.id]));
    if (route.id === 'sale') { page.innerHTML = emptyBlock(t('noSale'), t('noSaleCopy'), '/nouveautes', t('backToNew')); return; }
    page.innerHTML = grid(list);
    wireSort(list);
  }

  function searchMatches(q) {
    const terms = q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return catalogue.products;
    return catalogue.products.filter((p) => {
      const hay = [name(p), p.names && p.names.fr, p.brandName, storeName(p), description(p), sizeLabel(p)].join(' ').toLocaleLowerCase();
      return terms.every((term) => hay.includes(term));
    });
  }
  function renderSearch() {
    const q = new URLSearchParams(location.search).get('q') || '';
    page.innerHTML = `<form class="commerce-search" id="liveSearch"><label><span>${esc(t('searchHint'))}</span><div><input id="customerSearchInput" name="q" type="search" value="${esc(q)}" autocomplete="off"><button type="submit">${esc(t('search'))}</button></div></label></form><div id="searchResults"></div>`;
    const show = (query) => {
      const list = searchMatches(query);
      document.getElementById('searchResults').innerHTML = grid(list, t('noResults'), t('emptyCopy'));
      wireSort(list);
    };
    show(q);
    document.getElementById('liveSearch').addEventListener('submit', (e) => {
      e.preventDefault();
      const value = document.getElementById('customerSearchInput').value.trim();
      history.replaceState(null, '', '/recherche' + (value ? '?q=' + encodeURIComponent(value) : ''));
      show(value);
    });
  }

  function renderProduct() {
    const p = catalogue.byId.get(lastSegment());
    document.querySelector('.page-hero').hidden = true;
    if (!p) { page.innerHTML = emptyBlock(t('notFound'), t('notFoundCopy'), '/nouveautes', t('backToNew')); setTitle(t('notFound')); return; }
    setTitle(name(p));
    const images = (p.images || []).map(safeUrl).filter(Boolean);
    const siblings = p.styleId ? catalogue.products.filter((o) => o.styleId === p.styleId && o.partnerId === p.partnerId) : [p];
    const label = p.availability ? p.availability.label : 'out_of_stock';
    const sellable = !!(p.availability && p.availability.sellable);
    const fav = STATE.snapshot().favourites.includes(p.id);
    page.innerHTML = `<article class="commerce-product-detail">
      <div class="commerce-detail-media">${images.length ? images.map((src, i) => `<img src="${esc(src)}" alt="${esc(name(p))}${i ? ' — ' + (i + 1) : ''}"${i ? ' loading="lazy"' : ''}>`).join('') : '<span class="zf-live-noimg" aria-hidden="true">Z</span>'}</div>
      <div class="commerce-detail-copy">
        <p class="eyebrow">${esc(p.brandName || '')}</p>
        <h1>${esc(name(p))}</h1>
        <div class="commerce-detail-price"><strong>${esc(money(p.priceMinorUnits))}</strong></div>
        ${description(p) ? `<p>${esc(description(p))}</p>` : ''}
        <a class="commerce-corner-link" href="/corner/${encodeURIComponent(p.partnerId)}">${esc(t('soldBy'))} ${esc(storeName(p))}</a>
        <div class="commerce-size-block"><div><strong>${esc(p.size ? t('size') : t('format'))}</strong><span class="zf-live-stock zf-live-${esc(label)}">${esc(t(label))}</span></div>
          <div class="commerce-sizes">${siblings.length > 1
            ? siblings.map((o) => `<a href="/produit/${encodeURIComponent(o.id)}" class="${o.id === p.id ? 'selected' : ''}${o.availability && o.availability.sellable ? '' : ' zf-live-out'}" ${o.id === p.id ? 'aria-current="true"' : ''}>${esc(sizeLabel(o) || '—')}</a>`).join('')
            : `<span class="selected">${esc(sizeLabel(p) || '—')}</span>`}</div></div>
        <div class="commerce-detail-actions">
          <button class="route-button" type="button" id="liveAddToBag" ${sellable ? '' : 'disabled'}>${esc(sellable ? t('add') : t('soldOut'))}</button>
          <button class="route-button secondary" type="button" data-preview-favourite="${esc(p.id)}">${fav ? '♥' : '♡'} ${esc(t('save'))}</button>
        </div>
        <div class="commerce-services"><span>${esc(t('delivery'))}</span><span>${esc(t('returns'))}</span><span>${esc(t('sellerNote'))}</span></div>
      </div>
    </article>`;
    const add = document.getElementById('liveAddToBag');
    add.addEventListener('click', () => {
      const line = STATE.snapshot().bag.find((i) => i.productId === p.id);
      if (line && line.qty >= MAX_QTY) { toast(t('maxQty')); return; }
      STATE.addBag(p.id, sizeLabel(p) || 'U', 1);
      toast(t('added'));
    });
  }

  function renderCorners() {
    const stores = catalogue.stores.filter((s) => s.productCount > 0);
    if (!stores.length) { page.innerHTML = emptyBlock(t('noCorners'), t('noCornersCopy'), '/nouveautes', t('backToNew')); return; }
    page.innerHTML = `<div class="commerce-corner-grid">${stores.map((s) => `<article class="commerce-corner-card"><a href="/corner/${encodeURIComponent(s.partnerId)}">
      ${safeUrl(s.logoUrl) ? `<img class="zf-live-logo" src="${esc(safeUrl(s.logoUrl))}" alt="${esc(s.name)}" loading="lazy">` : ''}
      <div><h2>${esc(s.name)}</h2>${s.byline ? `<p>${esc(s.byline)}</p>` : ''}<small>${esc(s.productCount)} ${esc(t('cornerPieces'))} · ${esc(t('viewCorner'))} →</small></div></a></article>`).join('')}</div>`;
  }

  function renderCorner() {
    const id = lastSegment();
    const store = catalogue.storeById.get(id);
    const list = catalogue.products.filter((p) => p.partnerId === id);
    if (!store && !list.length) { page.innerHTML = emptyBlock(t('notFound'), '', '/corners', t('allCorners')); return; }
    const title = (store && store.name) || storeName(list[0]);
    setTitle(title);
    page.innerHTML = `<section class="corner-profile"${store && /^#[0-9a-f]{6}$/i.test(store.accentColor || '') ? ` style="border-top:6px solid ${esc(store.accentColor)}"` : ''}>
        ${store && safeUrl(store.logoUrl) ? `<img class="zf-live-logo" src="${esc(safeUrl(store.logoUrl))}" alt="${esc(title)}">` : ''}
        <div><h2>${esc(title)}</h2>${store && store.byline ? `<p>${esc(store.byline)}</p>` : ''}<a href="/corners">${esc(t('allCorners'))} →</a></div></section>
      ${grid(list)}`;
    wireSort(list);
  }

  function renderPrivateSale() {
    page.innerHTML = emptyBlock(t('privateSoon'), t('privateSoonCopy'), '/nouveautes', t('backToNew'));
  }

  function renderFavourites() {
    const ids = STATE.snapshot().favourites;
    const list = ids.map((id) => catalogue.byId.get(id)).filter(Boolean);
    if (!list.length) { page.innerHTML = emptyBlock(t('favEmpty'), t('favEmptyCopy'), '/nouveautes', t('backToNew')); return; }
    page.innerHTML = `<div class="commerce-product-grid">${list.map(productCard).join('')}</div>`;
  }

  /** Bag lines joined with the live catalogue (price, stock, store). */
  function bagView() {
    const lines = STATE.snapshot().bag.map((entry) => {
      const p = catalogue.byId.get(entry.productId) || null;
      let issue = null;
      if (!p) issue = 'lineUnavailable';
      else if (!p.availability || !p.availability.sellable) issue = 'lineUnavailable';
      return { entry, p, issue, total: p ? p.priceMinorUnits * entry.qty : 0 };
    });
    const subtotal = lines.filter((l) => !l.issue).reduce((s, l) => s + l.total, 0);
    return { lines, subtotal, ok: lines.length > 0 && lines.every((l) => !l.issue) };
  }

  function renderBag() {
    const view = bagView();
    if (!view.lines.length) { page.innerHTML = emptyBlock(t('bagEmpty'), t('bagEmptyCopy'), '/nouveautes', t('backToNew')); return; }
    page.innerHTML = `<div class="bag-layout"><div class="bag-lines">${view.lines.map(({ entry, p, issue, total }) => `<article class="bag-line${issue ? ' zf-live-issue' : ''}">
        ${p && cover(p) ? `<img src="${esc(cover(p))}" alt="${esc(name(p))}">` : '<span class="zf-live-noimg" aria-hidden="true">Z</span>'}
        <div><small>${esc(p ? storeName(p) : '')}</small><h3>${p ? `<a href="/produit/${encodeURIComponent(p.id)}">${esc(name(p))}</a>` : '—'}</h3>
          ${p && sizeLabel(p) ? `<p>${esc(p.size ? t('size') : t('format'))} : ${esc(sizeLabel(p))}</p>` : ''}
          ${issue ? `<p class="zf-live-warn">${esc(t(issue))}</p>` : ''}
          <div class="bag-line-controls"><button type="button" data-live-minus="${esc(entry.productId)}" data-size="${esc(entry.size)}" aria-label="−">−</button><span aria-label="${esc(t('quantity'))}">${esc(entry.qty)}</span><button type="button" data-live-plus="${esc(entry.productId)}" data-size="${esc(entry.size)}" aria-label="+" ${entry.qty >= MAX_QTY || issue ? 'disabled' : ''}>+</button><button class="bag-remove" type="button" data-live-remove="${esc(entry.productId)}" data-size="${esc(entry.size)}">${esc(t('remove'))}</button></div></div>
        <strong class="bag-line-price">${p && !issue ? esc(money(total)) : ''}</strong></article>`).join('')}</div>
      <aside class="bag-summary"><h2>${esc(t('summary'))}</h2>
        <div class="bag-summary-row"><span>${esc(t('subtotal'))}</span><strong>${esc(money(view.subtotal))}</strong></div>
        <div class="bag-summary-row"><span>${esc(t('deliveryLine'))}</span><span>${esc(t('included'))}</span></div>
        <div class="bag-summary-row total"><span>${esc(t('total'))}</span><strong>${esc(money(view.subtotal))}</strong></div>
        ${view.ok ? `<a class="route-button" href="/checkout">${esc(t('checkout'))}</a>` : `<button class="route-button" type="button" disabled>${esc(t('checkout'))}</button>`}
        <p class="bag-boundary">${esc(t('bagNote'))}</p></aside></div>`;
    const find = (btn) => STATE.snapshot().bag.find((i) => i.productId === btn.dataset.liveMinus || i.productId === btn.dataset.livePlus);
    page.querySelectorAll('[data-live-minus]').forEach((b) => b.addEventListener('click', () => { const i = find(b); if (i) STATE.setBagQty(i.productId, i.size, i.qty - 1); }));
    page.querySelectorAll('[data-live-plus]').forEach((b) => b.addEventListener('click', () => { const i = find(b); if (i && i.qty < MAX_QTY) STATE.setBagQty(i.productId, i.size, i.qty + 1); }));
    page.querySelectorAll('[data-live-remove]').forEach((b) => b.addEventListener('click', () => STATE.removeBag(b.dataset.liveRemove, b.dataset.size)));
  }

  // ---------- toast (shared #customerToast)

  function toast(message) {
    const el = document.getElementById('customerToast');
    if (!el) return;
    el.textContent = message; el.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  // ---------- ownership and rendering

  const OWN_TYPES = { category: renderCategory, search: renderSearch, product: renderProduct, corners: renderCorners, corner: renderCorner, privateSale: renderPrivateSale };
  const OWN_IDS = { favourites: renderFavourites, bag: renderBag };
  const extra = new Map(); // route id -> { render, needsCatalogue } (customer-checkout.js)

  function ownerOf(r) {
    if (!active || !r) return null;
    if (extra.has(r.id)) return extra.get(r.id);
    if (r.group === 'commerce' && OWN_TYPES[r.type]) return { render: OWN_TYPES[r.type], needsCatalogue: true };
    if (OWN_IDS[r.id]) return { render: OWN_IDS[r.id], needsCatalogue: true };
    return null;
  }

  let renderToken = 0;
  function render() {
    const owner = ownerOf(route);
    if (!owner || !page) return;
    const token = ++renderToken;
    const run = () => { if (token === renderToken) { owner.render(); page.dataset.live = route.id; } };
    if (!owner.needsCatalogue || catalogue) return run();
    page.innerHTML = `<p class="zf-live-loading">${esc(t('loading'))}</p>`;
    loadCatalogue().then(run).catch(() => {
      if (token !== renderToken) return;
      page.innerHTML = `<div class="commerce-empty"><h2>${esc(t('unavailable'))}</h2><button class="route-button secondary" type="button" id="liveRetry">${esc(t('retry'))}</button></div>`;
      document.getElementById('liveRetry').addEventListener('click', () => { failed = false; render(); });
    });
  }

  if (active) {
    const style = document.createElement('style');
    style.textContent = [
      '.zf-live-loading{padding:60px 0;text-align:center;opacity:.7}',
      '.zf-live-noimg{display:grid;place-items:center;width:100%;aspect-ratio:3/4;background:#f1efeb;color:#bbb;font:600 42px/1 Georgia,serif}',
      '.bag-line .zf-live-noimg{width:96px}',
      '.zf-live-warn{color:#8a1c1c;font-size:13px;margin:4px 0}',
      '.zf-live-issue{opacity:.75}',
      '.zf-live-stock{font-size:13px}.zf-live-low_stock{color:#8a5a10}.zf-live-out_of_stock{color:#8a1c1c}',
      '.commerce-sizes a{display:inline-flex;align-items:center;justify-content:center;min-width:46px;height:40px;padding:0 10px;border:1px solid var(--zf-line,#ddd);text-decoration:none;color:inherit}',
      '.commerce-sizes a.selected,.commerce-sizes span.selected{border-color:currentColor;font-weight:600}',
      '.commerce-sizes span.selected{display:inline-flex;align-items:center;min-height:40px;padding:0 10px;border:1px solid currentColor}',
      '.commerce-sizes a.zf-live-out{text-decoration:line-through;opacity:.5}',
      '.commerce-detail-media img+img{margin-top:8px}',
      '.zf-live-logo{max-height:120px;object-fit:contain;background:#fff;padding:12px}',
      '.preview-ribbon{display:none!important}',
    ].join('\n');
    document.head.appendChild(style);
    // Introductions written for the demonstration no longer apply.
    Object.keys(ROUTES.groupIntro || {}).forEach((l) => {
      ROUTES.groupIntro[l].checkout = l === 'fr'
        ? 'Finalisez votre commande en quelques étapes. Paiement sécurisé par Stripe.'
        : 'Complete your order in a few steps. Secure payment by Stripe.';
    });
    const note = document.querySelector('[data-shell-copy="footerPreview"]');
    if (note) note.remove();
    document.addEventListener('zfashion:preview-state', () => { if (route && (route.id === 'bag' || route.id === 'favourites')) render(); });
    window.addEventListener('pageshow', (e) => { if (e.persisted) render(); });
  }

  window.ZFashionLive = {
    active,
    api: API,
    route,
    owns: (r) => !!ownerOf(r),
    render,
    register: (routeId, renderFn, { needsCatalogue = false } = {}) => { extra.set(routeId, { render: renderFn, needsCatalogue }); },
    loadCatalogue,
    catalogue: () => catalogue,
    bagView: () => (catalogue ? bagView() : null),
    helpers: { esc, money, t, lang, locale, name, sizeLabel, storeName, cover, safeUrl, setTitle, emptyBlock, toast },
  };
  window.Z_FASHION_LIVE_STOREFRONT = active ? 'LIVE' : 'DEMO';
})();
