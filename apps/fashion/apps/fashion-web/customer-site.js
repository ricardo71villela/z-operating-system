(() => {
  const AUTH = window.ZFashionCustomerRoutes;
  const supported = ['fr','pt','en','es','it','de'];

  const stored = (() => {
    try { return localStorage.getItem('zfashion_locale'); } catch (_) { return null; }
  })();
  let locale = supported.includes(stored) ? stored : 'fr';

  const resolveRoute = pathname => AUTH.routes.find(r => r.path === pathname || (r.pattern && new RegExp(r.pattern).test(pathname))) || null;
  const route = resolveRoute(location.pathname);
  const routeTitle = id => AUTH.titles[locale]?.[id] || AUTH.titles.fr[id] || id;
  const sh = key => AUTH.shell[locale]?.[key] || AUTH.shell.fr[key] || key;
  const intro = group => AUTH.groupIntro[locale]?.[group] || AUTH.groupIntro.fr[group] || '';

  const slugLabel = () => {
    const parts = location.pathname.split('/').filter(Boolean);
    const raw = parts.at(-1) || '';
    return decodeURIComponent(raw).replace(/[-_]+/g,' ').replace(/\b\w/g, c => c.toUpperCase());
  };

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

  const categoryCards = () => {
    const names = {
      fr:['Sélection éditoriale','Pièces signatures','Boutiques partenaires'],pt:['Seleção editorial','Peças assinatura','Boutiques parceiras'],en:['Editorial selection','Signature pieces','Partner boutiques'],es:['Selección editorial','Piezas distintivas','Boutiques colaboradoras'],it:['Selezione editoriale','Pezzi distintivi','Boutique partner'],de:['Editoriale Auswahl','Signature-Pieces','Partner-Boutiquen']
    }[locale];
    const copies = {
      fr:['Une première sélection adaptée à cette destination.','Produits démonstratifs avec détail, tailles et disponibilité par boutique.','Accédez aux Corners qui composent la sélection Z Fashion.'],pt:['Uma primeira seleção adaptada a esta área.','Produtos demonstrativos com detalhe, tamanhos e disponibilidade por boutique.','Aceda aos Corners que compõem a seleção Z Fashion.'],en:['A first edit tailored to this destination.','Demonstrative products with detail, sizing and boutique availability.','Open the Corners that make up the Z Fashion selection.'],es:['Una primera selección adaptada a esta sección.','Productos demostrativos con detalle, tallas y disponibilidad por boutique.','Accede a los Corners que componen la selección Z Fashion.'],it:['Una prima selezione dedicata a questa sezione.','Prodotti dimostrativi con dettagli, taglie e disponibilità per boutique.','Scopri i Corners che compongono la selezione Z Fashion.'],de:['Eine erste Auswahl passend zu diesem Bereich.','Demoprodukte mit Details, Größen und Boutique-Verfügbarkeit.','Öffnen Sie die Corners, aus denen die Z Fashion Auswahl besteht.']
    }[locale];
    return `<div class="route-grid">${card(names[0],copies[0],'/produit/selection-01','01')}${card(names[1],copies[1],'/produit/selection-02','02')}${card(names[2],copies[2],'/corners','03')}</div>`;
  };

  const renderCommerce = type => {
    if (type === 'category') return categoryCards();
    if (type === 'search') return `<form class="preview-form" id="searchForm"><label>${routeTitle('search')}<input type="search" name="q" autocomplete="off" placeholder="${locale==='fr'?'Marques, pièces, boutiques…':locale==='pt'?'Marcas, peças, boutiques…':'Brands, pieces, boutiques…'}"></label><button class="route-button" type="submit">${sh('search')}</button></form><div class="status-strip"><div><strong>${sh('previewOnly')}</strong><span>${sh('empty')}</span></div><div><strong>Z Fashion</strong><span>FR · PT · EN · ES · IT · DE</span></div><div><strong>Search</strong><span>UI contract ready; live catalogue binding remains gated.</span></div></div>`;
    if (type === 'product') return `<div class="preview-panel"><div><p class="eyebrow">Z FASHION · PRODUCT</p><h2>${slugLabel()}</h2><p>${intro('commerce')}</p><div class="page-actions"><a href="/panier">${sh('bag')}</a><a class="secondary" href="/favoris">${sh('favourites')}</a></div></div><div><h2>${sh('previewOnly')}</h2><p>${sh('empty')}</p><div class="status-strip"><div><strong>Stock</strong><span>Preview</span></div><div><strong>Size</strong><span>Preview</span></div><div><strong>Checkout</strong><span>Disabled</span></div></div></div></div>`;
    if (type === 'corners') return `<div class="route-grid">${card('Atelier 27','Porto · Portugal','/corner/atelier-27','01')}${card('Maison Nord','Paris · France','/corner/maison-nord','02')}${card('Linea 44','Milan · Italia','/corner/linea-44','03')}</div>`;
    if (type === 'corner') return `<div class="preview-panel"><div><p class="eyebrow">Z FASHION · CORNER</p><h2>${slugLabel()}</h2><p>${intro('commerce')}</p></div><div><h2>${sh('previewOnly')}</h2><p>${sh('empty')}</p><a class="route-button" href="/corners">${sh('back')}</a></div></div>`;
    return `<div class="preview-panel"><div><h2>${routeTitle('privateSale')}</h2><p>${intro('commerce')}</p></div><div><h2>${sh('previewOnly')}</h2><p>${sh('empty')}</p></div></div>`;
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

  const render = () => {
    if (!route) { location.replace('/'); return; }
    setShellCopy(); renderBreadcrumb(); markActiveNav();
    document.getElementById('pageEyebrow').textContent = `Z FASHION · ${route.group.toUpperCase()}`;
    const title = routeTitle(route.id);
    document.getElementById('pageTitle').textContent = ['product','corner','order'].includes(route.id) ? slugLabel() : title;
    document.getElementById('pageIntro').textContent = intro(route.group);
    document.title = `${title} — Z Fashion`;
    renderActions();
    const content = document.getElementById('pageContent');
    if (route.group === 'commerce') content.innerHTML = renderCommerce(route.type);
    if (route.group === 'customer') content.innerHTML = renderCustomer(route.type);
    if (route.group === 'checkout') content.innerHTML = renderCheckout();
    if (route.group === 'service') content.innerHTML = renderService(route.type);
    if (route.group === 'legal') content.innerHTML = renderLegal(route.type);
    document.getElementById('searchForm')?.addEventListener('submit', e => { e.preventDefault(); const q = new FormData(e.currentTarget).get('q') || ''; history.replaceState(null,'',`/recherche?q=${encodeURIComponent(q)}`); });
  };

  document.getElementById('localeSelect').addEventListener('change', e => setLocale(e.target.value));
  document.getElementById('menuButton').addEventListener('click', () => document.querySelector('.customer-category-bar').scrollIntoView({behavior:'smooth',block:'nearest'}));
  setLocale(locale);
  window.Z_FASHION_FULL_CUSTOMER_SITE = 'FOUNDATION_PASS';
})();
