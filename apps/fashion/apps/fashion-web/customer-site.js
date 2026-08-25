(() => {
  const AUTH = window.ZFashionCustomerRoutes;
  const CATALOG = window.ZFashionCustomerCatalog;
  const supported = ['fr','pt','en','es','it','de'];

  const stored = (() => {
    try { return localStorage.getItem('zfashion_locale'); } catch (_) { return null; }
  })();
  let locale = supported.includes(stored) ? stored : 'fr';
  let currentSort = 'featured';

  const resolveRoute = pathname => AUTH.routes.find(r => r.path === pathname || (r.pattern && new RegExp(r.pattern).test(pathname))) || null;
  const route = resolveRoute(location.pathname);
  const routeTitle = id => AUTH.titles[locale]?.[id] || AUTH.titles.fr[id] || id;
  const sh = key => AUTH.shell[locale]?.[key] || AUTH.shell.fr[key] || key;
  const intro = group => AUTH.groupIntro[locale]?.[group] || AUTH.groupIntro.fr[group] || '';

  const commerceCopy = {
    fr:{pieces:'pièces',sort:'Trier',featured:'Sélection',priceLow:'Prix ↑',priceHigh:'Prix ↓',boutique:'Boutique',size:'Taille',sizes:'Tailles disponibles',stock:'Stock démonstratif',noReserve:'Aucune réservation de stock',productPreview:'Produit démonstratif',viewProduct:'Voir le produit',viewCorner:'Voir le Corner',allCorners:'Toutes les boutiques',searchPlaceholder:'Marques, pièces, boutiques…',searchHint:'Saisissez une marque, une pièce ou une boutique.',noResults:'Aucun résultat dans le catalogue Preview.',privateIntro:'Sélection confidentielle accessible ici en démonstration. L’accès membre réel reste désactivé.',memberOnly:'Sélection membre',prepareBag:'Voir le panier',save:'Voir les favoris',returns:'Retours définis par boutique',fulfilment:'Expédition identifiée par boutique',salePrice:'Prix Preview',from:'Depuis',catalogue:'Catalogue',results:'Résultats',partnerSelection:'Sélection de la boutique'},
    pt:{pieces:'peças',sort:'Ordenar',featured:'Destaques',priceLow:'Preço ↑',priceHigh:'Preço ↓',boutique:'Boutique',size:'Tamanho',sizes:'Tamanhos disponíveis',stock:'Stock demonstrativo',noReserve:'Sem reserva de stock',productPreview:'Produto demonstrativo',viewProduct:'Ver produto',viewCorner:'Ver Corner',allCorners:'Todas as boutiques',searchPlaceholder:'Marcas, peças, boutiques…',searchHint:'Pesquise uma marca, uma peça ou uma boutique.',noResults:'Nenhum resultado no catálogo Preview.',privateIntro:'Seleção reservada apresentada em modo demonstração. O acesso real de membro continua desativado.',memberOnly:'Seleção de membro',prepareBag:'Ver carrinho',save:'Ver favoritos',returns:'Devoluções definidas por boutique',fulfilment:'Envio identificado por boutique',salePrice:'Preço Preview',from:'Desde',catalogue:'Catálogo',results:'Resultados',partnerSelection:'Seleção da boutique'},
    en:{pieces:'pieces',sort:'Sort',featured:'Featured',priceLow:'Price ↑',priceHigh:'Price ↓',boutique:'Boutique',size:'Size',sizes:'Available sizes',stock:'Demonstrative stock',noReserve:'No stock reservation',productPreview:'Demonstrative product',viewProduct:'View product',viewCorner:'View Corner',allCorners:'All boutiques',searchPlaceholder:'Brands, pieces, boutiques…',searchHint:'Search for a brand, piece or boutique.',noResults:'No results in the Preview catalogue.',privateIntro:'A reserved selection shown in demonstration mode. Real member access remains disabled.',memberOnly:'Member selection',prepareBag:'View bag',save:'View favourites',returns:'Returns defined by boutique',fulfilment:'Shipping identified by boutique',salePrice:'Preview price',from:'From',catalogue:'Catalogue',results:'Results',partnerSelection:'Boutique selection'},
    es:{pieces:'piezas',sort:'Ordenar',featured:'Destacados',priceLow:'Precio ↑',priceHigh:'Precio ↓',boutique:'Boutique',size:'Talla',sizes:'Tallas disponibles',stock:'Stock demostrativo',noReserve:'Sin reserva de stock',productPreview:'Producto demostrativo',viewProduct:'Ver producto',viewCorner:'Ver Corner',allCorners:'Todas las boutiques',searchPlaceholder:'Marcas, piezas, boutiques…',searchHint:'Busca una marca, una pieza o una boutique.',noResults:'Sin resultados en el catálogo Preview.',privateIntro:'Selección reservada mostrada en modo demostración. El acceso real de miembro sigue desactivado.',memberOnly:'Selección de miembro',prepareBag:'Ver carrito',save:'Ver favoritos',returns:'Devoluciones definidas por boutique',fulfilment:'Envío identificado por boutique',salePrice:'Precio Preview',from:'Desde',catalogue:'Catálogo',results:'Resultados',partnerSelection:'Selección de la boutique'},
    it:{pieces:'articoli',sort:'Ordina',featured:'In evidenza',priceLow:'Prezzo ↑',priceHigh:'Prezzo ↓',boutique:'Boutique',size:'Taglia',sizes:'Taglie disponibili',stock:'Stock dimostrativo',noReserve:'Nessuna prenotazione stock',productPreview:'Prodotto dimostrativo',viewProduct:'Vedi prodotto',viewCorner:'Vedi Corner',allCorners:'Tutte le boutique',searchPlaceholder:'Brand, articoli, boutique…',searchHint:'Cerca un brand, un articolo o una boutique.',noResults:'Nessun risultato nel catalogo Preview.',privateIntro:'Selezione riservata mostrata in modalità dimostrativa. L’accesso membro reale resta disattivato.',memberOnly:'Selezione membro',prepareBag:'Vedi carrello',save:'Vedi preferiti',returns:'Resi definiti dalla boutique',fulfilment:'Spedizione identificata per boutique',salePrice:'Prezzo Preview',from:'Da',catalogue:'Catalogo',results:'Risultati',partnerSelection:'Selezione boutique'},
    de:{pieces:'Artikel',sort:'Sortieren',featured:'Empfohlen',priceLow:'Preis ↑',priceHigh:'Preis ↓',boutique:'Boutique',size:'Größe',sizes:'Verfügbare Größen',stock:'Demobestand',noReserve:'Keine Bestandsreservierung',productPreview:'Demoprodukt',viewProduct:'Produkt ansehen',viewCorner:'Corner ansehen',allCorners:'Alle Boutiquen',searchPlaceholder:'Marken, Artikel, Boutiquen…',searchHint:'Suchen Sie nach Marke, Artikel oder Boutique.',noResults:'Keine Ergebnisse im Preview-Katalog.',privateIntro:'Reservierte Auswahl im Demo-Modus. Der echte Mitgliederzugang bleibt deaktiviert.',memberOnly:'Mitgliederauswahl',prepareBag:'Warenkorb ansehen',save:'Favoriten ansehen',returns:'Rückgabe je Boutique geregelt',fulfilment:'Versand je Boutique ausgewiesen',salePrice:'Preview-Preis',from:'Ab',catalogue:'Katalog',results:'Ergebnisse',partnerSelection:'Boutique-Auswahl'}
  };
  const cc = key => commerceCopy[locale]?.[key] || commerceCopy.fr[key] || key;

  const slugLabel = () => {
    const parts = location.pathname.split('/').filter(Boolean);
    const raw = parts.at(-1) || '';
    return decodeURIComponent(raw).replace(/[-_]+/g,' ').replace(/\b\w/g, c => c.toUpperCase());
  };
  const slug = () => decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1) || '');
  const partnerFor = product => CATALOG.partners.find(p => p.id === product.partnerId);
  const productCopy = product => product.copy[locale] || product.copy.fr;
  const partnerCopy = partner => partner.specialty[locale] || partner.specialty.fr;
  const badgeCopy = product => CATALOG.badges[locale]?.[product.badge] || CATALOG.badges.fr[product.badge] || product.badge;
  const money = value => new Intl.NumberFormat(({fr:'fr-FR',pt:'pt-PT',en:'en-GB',es:'es-ES',it:'it-IT',de:'de-DE'})[locale],{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value);

  const setLocale = next => {
    if (!supported.includes(next)) return;
    locale = next;
    try { localStorage.setItem('zfashion_locale', next); } catch (_) {}
    document.documentElement.dataset.locale = next;
    document.documentElement.lang = ({fr:'fr-FR',pt:'pt-PT',en:'en',es:'es',it:'it',de:'de'})[next];
    document.getElementById('localeSelect').value = next;
    render();
  };

  const setShellCopy = () => {
    document.querySelectorAll('[data-shell-copy]').forEach(el => {
      const value = sh(el.dataset.shellCopy);
      if (value) el.textContent = value;
    });
    document.getElementById('brandEndorsement').textContent = sh('brand');
    document.querySelectorAll('[data-route-link]').forEach(el => {
      const key = el.dataset.routeLink;
      if (AUTH.titles[locale]?.[key]) el.textContent = AUTH.titles[locale][key];
    });
  };

  const card = (title, copy, href, index='') => `
    <article class="route-card">
      <span class="route-index">${index}</span>
      <div><h3>${title}</h3><p>${copy}</p></div>
      ${href ? `<a href="${href}">${sh('open')} →</a>` : ''}
    </article>`;

  const productCard = product => {
    const copy = productCopy(product);
    const partner = partnerFor(product);
    return `<article class="commerce-product-card" data-product="${product.id}" data-price="${product.price}">
      <a class="commerce-product-image" href="/produit/${product.slug}" aria-label="${copy.name}">
        <img src="${product.image}" alt="${copy.name}" loading="lazy">
        <span class="commerce-badge">${product.sale ? CATALOG.badges[locale].sale : badgeCopy(product)}</span>
      </a>
      <div class="commerce-product-meta">
        <div><span class="commerce-brand">${product.brand}</span><a class="commerce-name" href="/produit/${product.slug}">${copy.name}</a></div>
        <div class="commerce-price">${product.compareAt ? `<s>${money(product.compareAt)}</s>` : ''}<strong>${money(product.price)}</strong></div>
      </div>
      <a class="commerce-partner" href="/corner/${partner.id}">${partner.name} · ${partner.city}</a>
    </article>`;
  };

  const sortedProducts = products => {
    const result = [...products];
    if (currentSort === 'price-asc') result.sort((a,b)=>a.price-b.price);
    if (currentSort === 'price-desc') result.sort((a,b)=>b.price-a.price);
    return result;
  };

  const productGrid = (products, options={}) => {
    const sorted = sortedProducts(products);
    if (!sorted.length) return `<div class="commerce-empty"><h2>${cc('noResults')}</h2><p>${sh('empty')}</p><a class="route-button secondary" href="/nouveautes">${routeTitle('new')}</a></div>`;
    const toolbar = options.toolbar === false ? '' : `<div class="commerce-toolbar"><span><strong id="commerceCount">${sorted.length}</strong> ${cc('pieces')}</span><label>${cc('sort')}<select id="commerceSort"><option value="featured">${cc('featured')}</option><option value="price-asc">${cc('priceLow')}</option><option value="price-desc">${cc('priceHigh')}</option></select></label></div>`;
    return `${toolbar}<div class="commerce-product-grid" id="commerceProductGrid">${sorted.map(productCard).join('')}</div>`;
  };

  const productsForCategory = id => {
    if (id === 'new') return CATALOG.products.filter(p => p.isNew);
    if (id === 'sale') return CATALOG.products.filter(p => p.sale);
    return CATALOG.products.filter(p => p.category === id);
  };

  const wireSort = products => {
    const select = document.getElementById('commerceSort');
    if (!select) return;
    select.value = currentSort;
    select.addEventListener('change', e => {
      currentSort = e.target.value;
      const grid = document.getElementById('commerceProductGrid');
      if (grid) grid.innerHTML = sortedProducts(products).map(productCard).join('');
    });
  };

  const searchResults = query => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return CATALOG.products;
    return CATALOG.products.filter(product => {
      const partner = partnerFor(product);
      const copy = productCopy(product);
      return [product.brand,copy.name,copy.description,partner.name,partner.city,product.category].join(' ').toLocaleLowerCase().includes(q);
    });
  };

  const renderCategory = () => {
    const products = productsForCategory(route.id);
    queueMicrotask(()=>wireSort(products));
    return productGrid(products);
  };

  const renderSearch = () => {
    const initial = new URLSearchParams(location.search).get('q') || '';
    const results = searchResults(initial);
    queueMicrotask(()=>{ wireSort(results); const input=document.getElementById('customerSearchInput'); if(input) input.focus(); });
    return `<form class="commerce-search" id="searchForm"><label><span>${cc('searchHint')}</span><div><input id="customerSearchInput" name="q" type="search" value="${initial.replace(/"/g,'&quot;')}" placeholder="${cc('searchPlaceholder')}" autocomplete="off"><button type="submit">${sh('search')}</button></div></label></form><div id="searchResults">${productGrid(results)}</div>`;
  };

  const renderProduct = () => {
    const product = CATALOG.products.find(p => p.slug === slug());
    if (!product) return `<div class="commerce-empty"><h2>${cc('noResults')}</h2><a class="route-button secondary" href="/nouveautes">${routeTitle('new')}</a></div>`;
    const copy = productCopy(product);
    const partner = partnerFor(product);
    queueMicrotask(()=>document.querySelectorAll('[data-size]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-size]').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected')})));
    return `<article class="commerce-product-detail">
      <div class="commerce-detail-media"><img src="${product.image}" alt="${copy.name}"></div>
      <div class="commerce-detail-copy">
        <p class="eyebrow">${product.brand} · ${cc('productPreview')}</p>
        <h2>${copy.name}</h2>
        <div class="commerce-detail-price">${product.compareAt ? `<s>${money(product.compareAt)}</s>` : ''}<strong>${money(product.price)}</strong></div>
        <p>${copy.description}</p>
        <a class="commerce-corner-link" href="/corner/${partner.id}">${cc('boutique')}: ${partner.name} · ${partner.city}</a>
        <div class="commerce-size-block"><div><strong>${cc('sizes')}</strong><span>${cc('noReserve')}</span></div><div class="commerce-sizes">${product.sizes.map(size=>`<button type="button" data-size="${size}">${size}</button>`).join('')}</div></div>
        <div class="commerce-services"><span>${cc('stock')}</span><span>${cc('fulfilment')}</span><span>${cc('returns')}</span></div>
        <div class="commerce-detail-actions"><a class="route-button" href="/panier">${cc('prepareBag')}</a><a class="route-button secondary" href="/favoris">${cc('save')}</a></div>
      </div>
    </article>`;
  };

  const renderCorners = () => `<div class="commerce-corner-grid">${CATALOG.partners.map(partner=>{
    const count = CATALOG.products.filter(p=>p.partnerId===partner.id).length;
    return `<article class="commerce-corner-card"><a href="/corner/${partner.id}"><img src="${partner.image}" alt="${partner.name}" loading="lazy"><div><span>${partner.city} · ${partner.country}</span><h2>${partner.name}</h2><p>${partnerCopy(partner)}</p><small>${count} ${cc('pieces')} · ${cc('viewCorner')} →</small></div></a></article>`;
  }).join('')}</div>`;

  const renderCorner = () => {
    const partner = CATALOG.partners.find(p=>p.id===slug());
    if (!partner) return `<div class="commerce-empty"><h2>${cc('noResults')}</h2><a class="route-button secondary" href="/corners">${cc('allCorners')}</a></div>`;
    const products = CATALOG.products.filter(p=>p.partnerId===partner.id);
    queueMicrotask(()=>wireSort(products));
    return `<section class="corner-profile"><img src="${partner.image}" alt="${partner.name}"><div><p class="eyebrow">${partner.city} · ${partner.country}</p><h2>${partner.name}</h2><p>${partnerCopy(partner)}</p><a href="/corners">${cc('allCorners')} →</a></div></section><h2 class="commerce-section-title">${cc('partnerSelection')}</h2>${productGrid(products)}`;
  };

  const renderPrivateSale = () => {
    const products = CATALOG.products.filter(p=>p.privateSale);
    queueMicrotask(()=>wireSort(products));
    return `<section class="private-sale-banner"><div><p class="eyebrow">Z FASHION · PRIVATE SALE</p><h2>${cc('memberOnly')}</h2><p>${cc('privateIntro')}</p><a class="route-button secondary" href="/connexion">${routeTitle('login')}</a></div></section>${productGrid(products)}`;
  };

  const renderCommerce = type => {
    if (type === 'category') return renderCategory();
    if (type === 'search') return renderSearch();
    if (type === 'product') return renderProduct();
    if (type === 'corners') return renderCorners();
    if (type === 'corner') return renderCorner();
    return renderPrivateSale();
  };

  const accountLinks = () => [['profile','/compte/profil'],['addresses','/compte/adresses'],['orders','/compte/commandes'],['returns','/compte/retours'],['tracking','/compte/suivi']];
  const renderCustomer = type => {
    if (type === 'account') return `<div class="route-list">${accountLinks().map(([id,path])=>`<a href="${path}"><span>${routeTitle(id)}</span><small>${sh('open')} →</small></a>`).join('')}</div>`;
    if (type === 'login') return `<form class="preview-form"><label>Email<input type="email" autocomplete="email" disabled></label><label>Password<input type="password" disabled></label><button class="route-button" type="button" disabled>${sh('previewOnly')}</button></form>`;
    if (type === 'orders') return `<div class="route-grid">${card('ZF-2026-0001',routeTitle('order'),'/compte/commandes/ZF-2026-0001','01')}${card('ZF-2026-0002',routeTitle('order'),'/compte/commandes/ZF-2026-0002','02')}</div>`;
    if (type === 'order') return `<div class="preview-panel"><div><h2>${slugLabel()}</h2><p>${intro('customer')}</p></div><div><h2>${sh('previewOnly')}</h2><p>${sh('empty')}</p></div></div>`;
    if (type === 'tracking') return `<form class="preview-form"><label>${routeTitle('tracking')}<input type="text" value="ZF-2026-0001" disabled></label><button class="route-button" type="button" disabled>${sh('previewOnly')}</button></form>`;
    return `<div class="preview-panel"><div><h2>${routeTitle(route.id)}</h2><p>${intro('customer')}</p></div><div><h2>${sh('previewOnly')}</h2><p>${sh('empty')}</p></div></div>`;
  };

  const checkoutOrder = ['checkoutIdentify','checkoutDelivery','checkoutPayment','checkoutReview','checkoutConfirmation'];
  const checkoutPath = {checkoutIdentify:'/checkout',checkoutDelivery:'/checkout/livraison',checkoutPayment:'/checkout/paiement',checkoutReview:'/checkout/revision',checkoutConfirmation:'/checkout/confirmation'};
  const renderCheckout = () => `<div class="route-list">${checkoutOrder.map((id,i)=>`<a href="${checkoutPath[id]}" ${route.id===id?'aria-current="step"':''}><span>${routeTitle(id)}</span><small>${String(i+1).padStart(2,'0')}</small></a>`).join('')}</div><div class="status-strip"><div><strong>Payment</strong><span>Disabled</span></div><div><strong>Stock reservation</strong><span>Disabled</span></div><div><strong>Order creation</strong><span>Disabled</span></div></div>`;

  const serviceLinks = () => [['delivery','/livraisons'],['refunds','/retours-remboursements'],['help','/aide'],['contact','/contact']];
  const legalLinks = () => [['legalNotice','/mentions-legales'],['termsSale','/cgv'],['termsUse','/conditions-utilisation'],['privacy','/confidentialite'],['cookies','/cookies'],['consent','/consentement']];
  const renderService = type => {
    if (type === 'help') return `<div class="route-list">${serviceLinks().filter(([id])=>id!=='help').map(([id,path])=>`<a href="${path}"><span>${routeTitle(id)}</span><small>${sh('open')} →</small></a>`).join('')}</div>`;
    if (type === 'contact') return `<form class="preview-form"><label>Email<input type="email" disabled></label><label>Message<textarea disabled></textarea></label><button class="route-button" type="button" disabled>${sh('previewOnly')}</button></form>`;
    return `<div class="preview-panel"><div><h2>${routeTitle(route.id)}</h2><p>${intro('service')}</p></div><div><h2>${sh('previewOnly')}</h2><p>${sh('empty')}</p></div></div>`;
  };
  const renderLegal = type => {
    if (type === 'consent') return `<div class="preview-panel"><div><h2>${routeTitle('consent')}</h2><p>${intro('legal')}</p></div><div><label><input type="checkbox" checked disabled> Essential</label><br><label><input type="checkbox" disabled> Analytics</label><br><label><input type="checkbox" disabled> Marketing</label></div></div>`;
    return `<div class="route-list">${legalLinks().map(([id,path])=>`<a href="${path}" ${route.id===id?'aria-current="page"':''}><span>${routeTitle(id)}</span><small>${route.id===id?'•':sh('open')+' →'}</small></a>`).join('')}</div><div class="status-strip"><div><strong>${sh('previewOnly')}</strong><span>${intro('legal')}</span></div><div><strong>Production</strong><span>Legal review required</span></div><div><strong>Consent</strong><span>UX foundation ready</span></div></div>`;
  };

  const renderBreadcrumb = () => {
    const bc = document.getElementById('breadcrumb');
    const groupLabel = {commerce:'Z Fashion',customer:routeTitle('account'),checkout:'Checkout',service:routeTitle('help'),legal:routeTitle('legalNotice')}[route.group];
    bc.innerHTML = `<a href="/">${sh('home')}</a><span>›</span><span>${groupLabel}</span><span>›</span><strong>${routeTitle(route.id)}</strong>`;
  };
  const renderActions = () => {
    const el = document.getElementById('pageActions');
    if (route.group === 'commerce') el.innerHTML = `<a href="/corners">Corners</a><a class="secondary" href="/favoris">${sh('favourites')}</a>`;
    else if (route.group === 'customer') el.innerHTML = `<a href="/compte">${routeTitle('account')}</a><a class="secondary" href="/aide">${sh('help')}</a>`;
    else if (route.group === 'checkout') el.innerHTML = `<a href="/panier">${sh('back')}</a>`;
    else if (route.group === 'service') el.innerHTML = `<a href="/aide">${sh('help')}</a>`;
    else el.innerHTML = `<a href="/consentement">${routeTitle('consent')}</a>`;
  };
  const markActiveNav = () => document.querySelectorAll('.customer-category-bar a').forEach(a => a.getAttribute('href')===location.pathname?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'));

  const wireCommerce = () => {
    if (route.type === 'search') {
      const form = document.getElementById('searchForm');
      form?.addEventListener('submit', e => {
        e.preventDefault();
        const q = String(new FormData(form).get('q') || '');
        history.replaceState(null,'',`/recherche${q ? `?q=${encodeURIComponent(q)}` : ''}`);
        const results = searchResults(q);
        document.getElementById('searchResults').innerHTML = productGrid(results);
        wireSort(results);
      });
    }
  };

  const render = () => {
    if (!route) { location.replace('/'); return; }
    setShellCopy(); renderBreadcrumb(); markActiveNav();
    document.getElementById('pageEyebrow').textContent = `Z FASHION · ${route.group.toUpperCase()}`;
    const title = routeTitle(route.id);
    if (route.type === 'product') {
      const product = CATALOG.products.find(p=>p.slug===slug());
      document.getElementById('pageTitle').textContent = product ? productCopy(product).name : title;
    } else if (route.type === 'corner') {
      const partner = CATALOG.partners.find(p=>p.id===slug());
      document.getElementById('pageTitle').textContent = partner?.name || title;
    } else if (route.id === 'order') document.getElementById('pageTitle').textContent = slugLabel();
    else document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageIntro').textContent = route.type === 'privateSale' ? cc('privateIntro') : intro(route.group);
    document.title = `${document.getElementById('pageTitle').textContent} — Z Fashion`;
    renderActions();
    const content = document.getElementById('pageContent');
    if (route.group === 'commerce') content.innerHTML = renderCommerce(route.type);
    if (route.group === 'customer') content.innerHTML = renderCustomer(route.type);
    if (route.group === 'checkout') content.innerHTML = renderCheckout();
    if (route.group === 'service') content.innerHTML = renderService(route.type);
    if (route.group === 'legal') content.innerHTML = renderLegal(route.type);
    wireCommerce();
  };

  document.getElementById('localeSelect').addEventListener('change', e => setLocale(e.target.value));
  document.getElementById('menuButton').addEventListener('click', () => document.querySelector('.customer-category-bar').scrollIntoView({behavior:'smooth',block:'nearest'}));
  setLocale(locale);
  window.Z_FASHION_FULL_CUSTOMER_SITE = 'FOUNDATION_PASS';
  window.Z_FASHION_CUSTOMER_COMMERCE = 'PREVIEW_PASS';
})();
