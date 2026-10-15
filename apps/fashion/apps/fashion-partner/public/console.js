/* ============================================================
   Z FASHION — Partner console (real data)
   ============================================================
   Runs after zfashion-auth.js (data-surface="partner") has signed in a
   person who manages at least one store. Every read and write goes to
   the Partner API with the session token (ZFashionAuth.apiFetch); the
   API authorises each call for the selected store.

     Vue d'ensemble  GET /partners/:id/application, /inventory, /corner-config
     Catalogue       GET /inventory, /brands; POST /brands, /products,
                     /products/:pid/price, /stock/:pid
     Stock           POST /partners/:id/stock/bulk (manual edits and CSV)
     Corner          GET/POST /partners/:id/corner-config

   Orders, shipments, returns and payouts are not here yet: they arrive
   with checkout. Every node is built with textContent; nothing from the
   API or from an imported file is parsed as HTML.
   ============================================================ */

(function () {
  'use strict';

  var CATEGORIES = ['clothing', 'footwear', 'sportswear', 'accessories_leather_goods', 'cosmetics'];
  var SIZED = ['clothing', 'footwear', 'sportswear'];
  var AGES = ['adults', 'youth', 'children', 'baby'];
  var SKU_RE = /^[^;,"\r\n]{1,64}$/;

  var STRINGS = {
    fr: {
      partnerSpace: 'Espace Partner', store: 'Boutique', language: 'Langue',
      tabOverview: 'Vue d’ensemble', tabCatalogue: 'Catalogue', tabStock: 'Stock', tabCorner: 'Corner',
      loading: 'Chargement…', unavailable: 'Le service est momentanément indisponible. Réessayez.',
      status_applied: 'Demande reçue', status_under_review: 'En cours d’examen', status_approved: 'Approuvée', status_active: 'En ligne', status_suspended: 'Suspendue', status_rejected: 'Non retenue',
      sb_applied: 'Votre demande d’adhésion est en cours d’examen. Vous pouvez déjà préparer votre catalogue : il ne sera visible qu’après l’activation de votre boutique.',
      sb_under_review: 'Votre demande d’adhésion est en cours d’examen. Vous pouvez déjà préparer votre catalogue : il ne sera visible qu’après l’activation de votre boutique.',
      sb_approved: 'Votre demande est approuvée. L’équipe Z Fashion prépare l’activation de votre boutique ; votre catalogue sera alors visible.',
      sb_active: 'Votre boutique est visible dans le catalogue Z Fashion.',
      sb_suspended: 'Votre boutique n’est plus visible dans le catalogue pour le moment.',
      sb_rejected: 'Votre demande d’adhésion n’a pas été retenue.',
      teamNote: 'Message de l’équipe Z Fashion :',
      kpiProducts: 'Produits', kpiNoPrice: 'Sans prix', kpiOutOfStock: 'Sans stock disponible', kpiFee: 'Abonnement', perMonth: 'HT / mois',
      nextSteps: 'Pour être prêt à vendre',
      step1: 'Créer vos produits (avec un prix)', step2: 'Indiquer le stock de chaque produit', step3: 'Configurer votre Corner (nom et logo)', step4: 'Activation de la boutique par Z Fashion',
      comingTitle: 'Bientôt dans votre espace', comingBody: 'Commandes, expéditions, retours et versements arriveront avec l’ouverture des ventes.',
      // catalogue
      newProduct: 'Nouveau produit', cancel: 'Annuler', save: 'Enregistrer', saving: 'Enregistrement…',
      colRef: 'Réf.', colProduct: 'Produit', colBrand: 'Marque', colCategory: 'Catégorie', colSize: 'Taille / format', colPrice: 'Prix TTC', colStock: 'Stock vendable',
      noProducts: 'Aucun produit pour l’instant. Créez votre premier produit.',
      edit: 'Modifier', priceSaved: 'Prix mis à jour.',
      fNameFr: 'Nom du produit (français) *', fNameEn: 'Nom en anglais', fDescFr: 'Description (français)', fSku: 'Votre référence (SKU)',
      fSkuHint: 'Sert à importer le stock par fichier. Une référence par taille.', fBrand: 'Marque *', fNewBrand: '+ Nouvelle marque…', fNewBrandName: 'Nom de la nouvelle marque *',
      fCategories: 'Catégories *', fTechnical: 'Article de sport à usage technique (course, randonnée…)', fTechnicalHint: 'Obligatoire pour la catégorie Sport : un article qui a seulement le style sportif va en Vêtements ou Chaussures.',
      fGender: 'Genre *', g_female: 'Femme', g_male: 'Homme', g_unisex: 'Unisexe', fAges: 'Clientèle *', fCerts: 'Certifications de sécurité (enfants) *', fCertsHint: 'Séparées par des virgules, ex. EN 71-1, OEKO-TEX',
      fSizeSystem: 'Système de taille *', sys_EU: 'EU (chaussures)', sys_FR: 'FR (vêtements femme, ex. 38)', sys_ALPHA: 'Lettres (XS à XXL)', fSizeValue: 'Taille *',
      fFormatKind: 'Format *', fmt_volume: 'Contenance (ml)', fmt_shade: 'Teinte', fFormatValue: 'Valeur *',
      fPrice: 'Prix de vente TTC (€) *', fInitialStock: 'Stock initial',
      cat_clothing: 'Vêtements', cat_footwear: 'Chaussures', cat_sportswear: 'Sport', cat_accessories_leather_goods: 'Accessoires et maroquinerie', cat_cosmetics: 'Cosmétiques et parfums',
      age_adults: 'Adultes', age_youth: 'Adolescents', age_children: 'Enfants', age_baby: 'Bébés',
      productCreated: 'Produit créé.',
      e_name: 'Indiquez le nom du produit en français.', e_brand: 'Choisissez ou créez une marque.', e_categories: 'Choisissez au moins une catégorie.',
      e_technical: 'La catégorie Sport demande un usage technique (sinon choisissez Vêtements ou Chaussures).', e_gender: 'Choisissez le genre.',
      e_ages: 'Choisissez au moins une clientèle.', e_certs: 'Indiquez au moins une certification de sécurité pour les enfants.',
      e_size: 'Indiquez la taille.', e_sizeNumber: 'Pour ce système, la taille est un nombre (ex. 38).', e_sizeAlpha: 'Choisissez une taille de XS à XXL.',
      e_format: 'Indiquez le format (contenance ou teinte).', e_cosmeticsMix: 'Un produit cosmétique se vend seul : ne le mélangez pas avec une catégorie à tailles.',
      e_price: 'Indiquez un prix valide (ex. 89,90).', e_sku: 'Référence invalide (64 caractères max., sans ; , ").', e_skuTaken: 'Cette référence est déjà utilisée par un autre produit.',
      e_stock: 'Le stock est un nombre entier positif.', e_server: 'Le produit n’a pas pu être enregistré :',
      // stock
      stockIntro: 'Mettez à jour les quantités disponibles, une par une ou avec un fichier.',
      colAvailable: 'Disponible', colReserved: 'Réservé', colSellable: 'Vendable', colUpdated: 'Mis à jour',
      saveStock: 'Enregistrer les modifications', noChanges: 'Aucune modification à enregistrer.', stockSaved: '{ok} quantité(s) enregistrée(s).', stockFailed: '{n} refusée(s) :',
      csvTitle: 'Importer un fichier de stock', csvBody: 'Fichier CSV avec deux colonnes : référence et quantité (séparateur ; ou ,). Seuls les produits qui ont une référence peuvent être importés.',
      csvChoose: 'Choisir un fichier', csvTemplate: 'Télécharger le modèle', csvMatched: '{n} ligne(s) reconnue(s)', csvUnknown: 'Références inconnues : {list}',
      csvInvalid: 'Lignes illisibles : {list}', csvImport: 'Importer {n} ligne(s)', csvNone: 'Aucune ligne reconnue dans ce fichier.', csvDuplicate: 'Références en double (dernière valeur gardée) : {list}',
      noSku: 'sans référence',
      // corner
      cornerIntro: 'Votre Corner est l’espace à votre image dans Z Fashion. Il apparaît quand votre boutique est en ligne.',
      fDisplayName: 'Nom affiché *', fByline: 'Accroche (140 caractères max.)', fAccent: 'Couleur de la boutique', fLogo: 'Adresse du logo (https) *',
      fLogoHint: 'Le téléversement du logo arrive avec les photos produits. En attendant, indiquez l’adresse d’une image en ligne.',
      preview: 'Aperçu', cornerSaved: 'Corner enregistré.', e_displayName: 'Indiquez le nom affiché.', e_logo: 'Indiquez une adresse https valide pour le logo.', e_byline: 'Accroche trop longue.',
    },
    en: {
      partnerSpace: 'Partner space', store: 'Store', language: 'Language',
      tabOverview: 'Overview', tabCatalogue: 'Catalogue', tabStock: 'Stock', tabCorner: 'Corner',
      loading: 'Loading…', unavailable: 'The service is temporarily unavailable. Try again.',
      status_applied: 'Application received', status_under_review: 'Under review', status_approved: 'Approved', status_active: 'Live', status_suspended: 'Suspended', status_rejected: 'Not accepted',
      sb_applied: 'Your application is being reviewed. You can already prepare your catalogue: it becomes visible once your store is activated.',
      sb_under_review: 'Your application is being reviewed. You can already prepare your catalogue: it becomes visible once your store is activated.',
      sb_approved: 'Your application is approved. The Z Fashion team is preparing your store’s activation; your catalogue will then be visible.',
      sb_active: 'Your store is visible in the Z Fashion catalogue.',
      sb_suspended: 'Your store is not visible in the catalogue for now.',
      sb_rejected: 'Your application was not accepted.',
      teamNote: 'Message from the Z Fashion team:',
      kpiProducts: 'Products', kpiNoPrice: 'Without price', kpiOutOfStock: 'No sellable stock', kpiFee: 'Subscription', perMonth: 'excl. VAT / month',
      nextSteps: 'To be ready to sell',
      step1: 'Create your products (with a price)', step2: 'Enter the stock of each product', step3: 'Set up your Corner (name and logo)', step4: 'Store activation by Z Fashion',
      comingTitle: 'Coming to your space', comingBody: 'Orders, shipments, returns and payouts arrive when sales open.',
      newProduct: 'New product', cancel: 'Cancel', save: 'Save', saving: 'Saving…',
      colRef: 'Ref.', colProduct: 'Product', colBrand: 'Brand', colCategory: 'Category', colSize: 'Size / format', colPrice: 'Price incl. VAT', colStock: 'Sellable stock',
      noProducts: 'No products yet. Create your first product.',
      edit: 'Edit', priceSaved: 'Price updated.',
      fNameFr: 'Product name (French) *', fNameEn: 'English name', fDescFr: 'Description (French)', fSku: 'Your reference (SKU)',
      fSkuHint: 'Used to import stock from a file. One reference per size.', fBrand: 'Brand *', fNewBrand: '+ New brand…', fNewBrandName: 'New brand name *',
      fCategories: 'Categories *', fTechnical: 'Sports item with a technical use (running, hiking…)', fTechnicalHint: 'Required for Sportswear: an item that only looks sporty goes in Clothing or Footwear.',
      fGender: 'Gender *', g_female: 'Women', g_male: 'Men', g_unisex: 'Unisex', fAges: 'Customers *', fCerts: 'Safety certifications (children) *', fCertsHint: 'Comma-separated, e.g. EN 71-1, OEKO-TEX',
      fSizeSystem: 'Size system *', sys_EU: 'EU (footwear)', sys_FR: 'FR (women’s clothing, e.g. 38)', sys_ALPHA: 'Letters (XS to XXL)', fSizeValue: 'Size *',
      fFormatKind: 'Format *', fmt_volume: 'Volume (ml)', fmt_shade: 'Shade', fFormatValue: 'Value *',
      fPrice: 'Selling price incl. VAT (€) *', fInitialStock: 'Initial stock',
      cat_clothing: 'Clothing', cat_footwear: 'Footwear', cat_sportswear: 'Sportswear', cat_accessories_leather_goods: 'Accessories and leather goods', cat_cosmetics: 'Cosmetics and fragrance',
      age_adults: 'Adults', age_youth: 'Teens', age_children: 'Children', age_baby: 'Babies',
      productCreated: 'Product created.',
      e_name: 'Enter the product name in French.', e_brand: 'Choose or create a brand.', e_categories: 'Choose at least one category.',
      e_technical: 'Sportswear needs a technical use (otherwise choose Clothing or Footwear).', e_gender: 'Choose the gender.',
      e_ages: 'Choose at least one customer group.', e_certs: 'Enter at least one children’s safety certification.',
      e_size: 'Enter the size.', e_sizeNumber: 'For this system the size is a number (e.g. 38).', e_sizeAlpha: 'Choose a size from XS to XXL.',
      e_format: 'Enter the format (volume or shade).', e_cosmeticsMix: 'A cosmetics product is sold on its own: do not mix it with a sized category.',
      e_price: 'Enter a valid price (e.g. 89.90).', e_sku: 'Invalid reference (64 characters max., no ; , ").', e_skuTaken: 'This reference is already used by another product.',
      e_stock: 'Stock is a positive whole number.', e_server: 'The product could not be saved:',
      stockIntro: 'Update available quantities one by one or with a file.',
      colAvailable: 'Available', colReserved: 'Reserved', colSellable: 'Sellable', colUpdated: 'Updated',
      saveStock: 'Save changes', noChanges: 'No changes to save.', stockSaved: '{ok} quantity(ies) saved.', stockFailed: '{n} refused:',
      csvTitle: 'Import a stock file', csvBody: 'CSV file with two columns: reference and quantity (separator ; or ,). Only products with a reference can be imported.',
      csvChoose: 'Choose a file', csvTemplate: 'Download the template', csvMatched: '{n} line(s) recognised', csvUnknown: 'Unknown references: {list}',
      csvInvalid: 'Unreadable lines: {list}', csvImport: 'Import {n} line(s)', csvNone: 'No line recognised in this file.', csvDuplicate: 'Duplicate references (last value kept): {list}',
      noSku: 'no reference',
      cornerIntro: 'Your Corner is your own space in Z Fashion. It appears when your store is live.',
      fDisplayName: 'Display name *', fByline: 'Tagline (140 characters max.)', fAccent: 'Store colour', fLogo: 'Logo address (https) *',
      fLogoHint: 'Logo upload arrives with product photos. Meanwhile, enter the address of an online image.',
      preview: 'Preview', cornerSaved: 'Corner saved.', e_displayName: 'Enter the display name.', e_logo: 'Enter a valid https address for the logo.', e_byline: 'Tagline too long.',
    },
  };

  var locale = 'fr';
  try { var saved = localStorage.getItem('zfashion_console_locale'); if (STRINGS[saved]) locale = saved; } catch (e) {}
  function t(key, vars) {
    var s = (STRINGS[locale] && STRINGS[locale][key]) || STRINGS.fr[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(String(vars[k])); });
    return s;
  }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function $(id) { return document.getElementById(id); }
  function money(minor) {
    if (minor == null) return '—';
    return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { style: 'currency', currency: 'EUR' }).format(minor / 100);
  }
  function parseEuros(raw) {
    var s = String(raw || '').trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    var cents = Math.round(Number(s) * 100);
    return cents > 0 && cents <= 10000000 ? cents : null;
  }
  function dateTime(v) {
    if (!v) return '—';
    return new Date(v).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function productName(p) { return (p.names && (p.names[locale] || p.names.fr)) || '—'; }
  function sizeLabel(p) {
    if (p.size) return (p.size.system === 'ALPHA' ? '' : p.size.system + ' ') + p.size.value;
    if (p.format) return p.format.volumeMl ? p.format.volumeMl + ' ml' : (p.format.shade || '—');
    return '—';
  }

  // ---------- state

  var state = { partnerId: null, partnerIds: [], app: null, inventory: [], brands: [], corner: null, tab: 'overview', showForm: false, csv: null };
  function api(path, init) { return window.ZFashionAuth.apiFetch('/partners/' + encodeURIComponent(state.partnerId) + path, init); }
  function json(res) { return res.json().catch(function () { return {}; }).then(function (body) { return { status: res.status, ok: res.ok, body: body }; }); }

  function flash(text, isError) {
    var f = $('pcFlash');
    f.textContent = text; f.className = 'pc-flash' + (isError ? ' err' : ''); f.hidden = false;
    clearTimeout(flash.timer);
    if (!isError) flash.timer = setTimeout(function () { f.hidden = true; }, 3500);
  }

  function loadAll() {
    return Promise.all([
      api('/application').then(json),
      api('/inventory').then(json),
      api('/brands').then(json),
      api('/corner-config').then(json),
    ]).then(function (r) {
      state.app = r[0].ok ? r[0].body : null;
      state.inventory = r[1].ok ? r[1].body.products : [];
      state.brands = r[2].ok ? r[2].body.brands : [];
      state.corner = r[3].ok ? r[3].body.cornerConfig : null;
      if (!r[1].ok) throw new Error('inventory ' + r[1].status);
      render();
    }).catch(function () {
      $('tab-' + state.tab).replaceChildren(el('p', { class: 'pc-error' }, t('unavailable')));
    });
  }

  function storeCategories() { return state.app && state.app.categories && state.app.categories.length ? state.app.categories : CATEGORIES; }
  function storeAges() { return state.app && state.app.ageSegments && state.app.ageSegments.length ? state.app.ageSegments : ['adults']; }

  // ---------- language & tabs

  function applyStatic() {
    document.documentElement.lang = locale === 'fr' ? 'fr-FR' : 'en-GB';
    document.documentElement.dataset.locale = locale;
    $('pcLocale').value = locale;
    document.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = t(n.dataset.i18n); });
  }
  $('pcLocale').addEventListener('change', function (e) {
    locale = STRINGS[e.target.value] ? e.target.value : 'fr';
    try { localStorage.setItem('zfashion_console_locale', locale); } catch (err) {}
    applyStatic(); render();
  });
  document.querySelectorAll('.pc-tabs button').forEach(function (b) {
    b.addEventListener('click', function () { state.tab = b.dataset.tab; render(); });
  });

  function render() {
    document.querySelectorAll('.pc-tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)); });
    ['overview', 'catalogue', 'stock', 'corner'].forEach(function (id) { $('tab-' + id).hidden = id !== state.tab; });
    ({ overview: renderOverview, catalogue: renderCatalogue, stock: renderStock, corner: renderCorner })[state.tab]();
  }

  // ---------- overview

  var BADGE = { applied: 'warn', under_review: 'warn', approved: 'good', active: 'good', suspended: 'bad', rejected: 'bad' };

  function renderOverview() {
    var root = $('tab-overview'); var nodes = [];
    var app = state.app;
    var card = el('article', { class: 'pc-card' });
    if (app) {
      var head = el('div', { class: 'pc-store-head' });
      head.append(el('h2', null, app.tradeName || ''), el('span', { class: 'pc-badge ' + (BADGE[app.onboardingStatus] || '') }, t('status_' + app.onboardingStatus)));
      card.append(head, el('p', { class: 'pc-muted' }, t('sb_' + app.onboardingStatus)));
      if (app.decisionNote && (app.onboardingStatus === 'rejected' || app.onboardingStatus === 'suspended')) {
        var note = el('p', { class: 'pc-note' }); note.append(el('strong', null, t('teamNote') + ' '), document.createTextNode(app.decisionNote));
        card.appendChild(note);
      }
    }
    nodes.push(card);

    var inv = state.inventory;
    var noPrice = inv.filter(function (p) { return p.priceMinorUnits == null; }).length;
    var noStock = inv.filter(function (p) { return !p.stock || p.stock.sellable <= 0; }).length;
    var kpis = el('div', { class: 'pc-kpis' });
    [[t('kpiProducts'), String(inv.length)], [t('kpiNoPrice'), String(noPrice)], [t('kpiOutOfStock'), String(noStock)],
      [t('kpiFee'), app && app.monthlySubscriptionFeeMinorUnits ? money(app.monthlySubscriptionFeeMinorUnits).replace(/,00/, '') + ' ' + t('perMonth') : '—']]
      .forEach(function (k) { var d = el('div', { class: 'pc-kpi' }); d.append(el('span', null, k[0]), el('strong', null, k[1])); kpis.appendChild(d); });
    nodes.push(kpis);

    var steps = [
      [t('step1'), inv.length > 0 && noPrice === 0],
      [t('step2'), inv.length > 0 && inv.every(function (p) { return p.stock; })],
      [t('step3'), !!(state.corner && state.corner.logoUrl)],
      [t('step4'), !!(app && app.onboardingStatus === 'active')],
    ];
    var todo = el('article', { class: 'pc-card' }); todo.appendChild(el('h3', null, t('nextSteps')));
    var ul = el('ul', { class: 'pc-checklist' });
    steps.forEach(function (s, i) {
      var li = el('li'); li.append(el('span', { class: 'pc-check' + (s[1] ? ' done' : ''), 'aria-hidden': 'true' }, s[1] ? '✓' : String(i + 1)), el('span', null, s[0]));
      ul.appendChild(li);
    });
    todo.appendChild(ul); nodes.push(todo);

    var soon = el('article', { class: 'pc-card pc-soon' });
    soon.append(el('h3', null, t('comingTitle')), el('p', { class: 'pc-muted' }, t('comingBody')));
    nodes.push(soon);
    root.replaceChildren.apply(root, nodes);
  }

  // ---------- catalogue

  function renderCatalogue() {
    var root = $('tab-catalogue'); var nodes = [];
    var bar = el('div', { class: 'pc-toolbar' });
    bar.appendChild(el('span', { class: 'pc-muted' }, state.inventory.length + ' · ' + t('kpiProducts').toLowerCase()));
    if (!state.showForm) {
      var nb = el('button', { class: 'pc-btn', type: 'button' }, t('newProduct'));
      nb.addEventListener('click', function () { state.showForm = true; render(); });
      bar.appendChild(nb);
    }
    nodes.push(bar);
    if (state.showForm) nodes.push(productForm());
    nodes.push(catalogueTable());
    root.replaceChildren.apply(root, nodes);
  }

  function catalogueTable() {
    var wrap = el('div', { class: 'pc-table-wrap' });
    if (!state.inventory.length) { wrap.appendChild(el('p', { class: 'pc-empty' }, t('noProducts'))); return wrap; }
    var table = el('table', { class: 'pc-table' });
    var hr = el('tr');
    [['colRef'], ['colProduct'], ['colBrand'], ['colCategory'], ['colSize'], ['colPrice', 'num'], ['colStock', 'num']].forEach(function (c) { hr.appendChild(el('th', { scope: 'col', class: c[1] || null }, t(c[0]))); });
    var thead = el('thead'); thead.appendChild(hr);
    var tbody = el('tbody');
    state.inventory.forEach(function (p) {
      var tr = el('tr');
      tr.append(el('td', null, p.sku || '—'), el('td', null, productName(p)), el('td', null, p.brandName || '—'),
        el('td', null, (p.categories || []).map(function (c) { return t('cat_' + c); }).join(', ')), el('td', null, sizeLabel(p)));
      var priceCell = el('td', { class: 'num' });
      priceCell.appendChild(el('span', null, money(p.priceMinorUnits) + ' '));
      var eb = el('button', { class: 'pc-btn secondary small', type: 'button' }, t('edit'));
      eb.addEventListener('click', function () { editPrice(priceCell, p); });
      priceCell.appendChild(eb);
      tr.append(priceCell, el('td', { class: 'num' }, p.stock ? String(p.stock.sellable) : '—'));
      tbody.appendChild(tr);
    });
    table.append(thead, tbody); wrap.appendChild(table);
    return wrap;
  }

  function editPrice(cell, p) {
    var input = el('input', { type: 'text', inputmode: 'decimal', 'aria-label': t('colPrice'), value: p.priceMinorUnits != null ? (p.priceMinorUnits / 100).toFixed(2).replace('.', locale === 'fr' ? ',' : '.') : '' });
    var ok = el('button', { class: 'pc-btn small', type: 'button' }, t('save'));
    cell.replaceChildren(input, document.createTextNode(' '), ok);
    input.focus();
    ok.addEventListener('click', function () {
      var cents = parseEuros(input.value);
      if (cents == null) return flash(t('e_price'), true);
      ok.disabled = true;
      api('/products/' + encodeURIComponent(p.id) + '/price', { method: 'POST', body: { priceMinorUnits: cents } }).then(json).then(function (r) {
        if (!r.ok) { ok.disabled = false; return flash(t('e_price'), true); }
        p.priceMinorUnits = cents; flash(t('priceSaved')); render();
      }).catch(function () { ok.disabled = false; flash(t('unavailable'), true); });
    });
  }

  function field(label, control, hint) {
    var f = el('label', { class: 'pc-field' }); f.appendChild(el('span', null, label)); f.appendChild(control);
    if (hint) f.appendChild(el('p', { class: 'pc-hint' }, hint));
    return f;
  }
  function checks(name, values, labelPrefix, checkedValues) {
    var box = el('div', { class: 'pc-checks', role: 'group' });
    values.forEach(function (v) {
      var l = el('label'); var i = el('input', { type: 'checkbox', name: name, value: v });
      i.checked = (checkedValues || []).indexOf(v) !== -1;
      l.append(i, el('span', null, t(labelPrefix + v))); box.appendChild(l);
    });
    return box;
  }
  function checkedValues(form, name) {
    return Array.prototype.slice.call(form.querySelectorAll('input[name="' + name + '"]:checked')).map(function (i) { return i.value; });
  }

  function productForm() {
    var form = el('form', { class: 'pc-card pc-form', novalidate: true });
    form.appendChild(el('h2', null, t('newProduct')));
    var errBox = el('div', { class: 'pc-error', role: 'alert', hidden: true }); form.appendChild(errBox);

    var g1 = el('div', { class: 'pc-grid2' });
    var nameFr = el('input', { name: 'nameFr', required: true, maxlength: '160' });
    var nameEn = el('input', { name: 'nameEn', maxlength: '160' });
    var sku = el('input', { name: 'sku', maxlength: '64' });
    g1.append(field(t('fNameFr'), nameFr), field(t('fNameEn'), nameEn), field(t('fSku'), sku, t('fSkuHint')));
    form.appendChild(g1);
    var desc = el('textarea', { name: 'descFr', rows: '3', maxlength: '2000' });
    form.appendChild(field(t('fDescFr'), desc));

    var g2 = el('div', { class: 'pc-grid2' });
    var brand = el('select', { name: 'brand' });
    state.brands.forEach(function (b) { brand.appendChild(el('option', { value: b.id }, b.name)); });
    brand.appendChild(el('option', { value: '__new' }, t('fNewBrand')));
    var newBrand = el('input', { name: 'newBrand', maxlength: '120' });
    var newBrandField = field(t('fNewBrandName'), newBrand);
    function syncBrand() { newBrandField.hidden = brand.value !== '__new'; }
    brand.addEventListener('change', syncBrand);
    var gender = el('select', { name: 'gender' });
    gender.appendChild(el('option', { value: '' }, '—'));
    ['female', 'male', 'unisex'].forEach(function (g) { gender.appendChild(el('option', { value: g }, t('g_' + g))); });
    g2.append(field(t('fBrand'), brand), newBrandField, field(t('fGender'), gender));
    form.appendChild(g2);
    syncBrand();

    var cats = checks('categories', storeCategories(), 'cat_', storeCategories().length === 1 ? storeCategories() : []);
    form.appendChild(field(t('fCategories'), cats));
    var technical = el('input', { type: 'checkbox', name: 'technical' });
    var techChecks = el('div', { class: 'pc-checks' }); var techLabel = el('label'); techLabel.append(technical, el('span', null, t('fTechnical'))); techChecks.appendChild(techLabel);
    var techField = el('div', { class: 'pc-field' }); techField.append(techChecks, el('p', { class: 'pc-hint' }, t('fTechnicalHint')));
    form.appendChild(techField);

    var ages = checks('ages', storeAges(), 'age_', ['adults'].filter(function (a) { return storeAges().indexOf(a) !== -1; }));
    form.appendChild(field(t('fAges'), ages));
    var certs = el('input', { name: 'certs', maxlength: '300' });
    var certsField = field(t('fCerts'), certs, t('fCertsHint'));
    form.appendChild(certsField);

    var sizeRow = el('div', { class: 'pc-grid2' });
    var sizeSystem = el('select', { name: 'sizeSystem' });
    ['EU', 'FR', 'ALPHA'].forEach(function (s) { sizeSystem.appendChild(el('option', { value: s }, t('sys_' + s))); });
    var sizeValue = el('input', { name: 'sizeValue', maxlength: '8' });
    sizeRow.append(field(t('fSizeSystem'), sizeSystem), field(t('fSizeValue'), sizeValue));
    form.appendChild(sizeRow);

    var fmtRow = el('div', { class: 'pc-grid2' });
    var fmtKind = el('select', { name: 'fmtKind' });
    ['volume', 'shade'].forEach(function (f) { fmtKind.appendChild(el('option', { value: f }, t('fmt_' + f))); });
    var fmtValue = el('input', { name: 'fmtValue', maxlength: '60' });
    fmtRow.append(field(t('fFormatKind'), fmtKind), field(t('fFormatValue'), fmtValue));
    form.appendChild(fmtRow);

    var g3 = el('div', { class: 'pc-grid2' });
    var price = el('input', { name: 'price', inputmode: 'decimal', placeholder: '89,90' });
    var stock = el('input', { name: 'stock', type: 'number', min: '0', step: '1', inputmode: 'numeric' });
    g3.append(field(t('fPrice'), price), field(t('fInitialStock'), stock));
    form.appendChild(g3);

    function sync() {
      var c = checkedValues(form, 'categories'), a = checkedValues(form, 'ages');
      techField.hidden = c.indexOf('sportswear') === -1;
      certsField.hidden = !a.some(function (x) { return x !== 'adults'; });
      sizeRow.hidden = !c.some(function (x) { return SIZED.indexOf(x) !== -1; });
      fmtRow.hidden = c.indexOf('cosmetics') === -1;
      if (c.indexOf('footwear') !== -1 && sizeSystem.value !== 'EU') sizeSystem.value = 'EU';
    }
    form.addEventListener('change', sync); sync();

    var actions = el('div', { class: 'pc-toolbar' });
    var cancel = el('button', { class: 'pc-btn secondary', type: 'button' }, t('cancel'));
    cancel.addEventListener('click', function () { state.showForm = false; render(); });
    var submit = el('button', { class: 'pc-btn', type: 'submit' }, t('save'));
    actions.append(cancel, submit); form.appendChild(actions);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errors = [];
      var c = checkedValues(form, 'categories'), a = checkedValues(form, 'ages');
      var body = { names: { fr: nameFr.value.trim() }, categories: c, ageSegments: a, gender: gender.value };
      if (nameEn.value.trim()) body.names.en = nameEn.value.trim();
      if (desc.value.trim()) body.descriptions = { fr: desc.value.trim() };
      if (!body.names.fr) errors.push(t('e_name'));
      if (sku.value.trim()) { if (!SKU_RE.test(sku.value.trim())) errors.push(t('e_sku')); else body.sku = sku.value.trim(); }
      if (brand.value === '__new' && !newBrand.value.trim()) errors.push(t('e_brand'));
      if (!c.length) errors.push(t('e_categories'));
      if (c.indexOf('sportswear') !== -1) { if (!technical.checked) errors.push(t('e_technical')); else body.technicalPurpose = true; }
      if (!body.gender) errors.push(t('e_gender'));
      if (!a.length) errors.push(t('e_ages'));
      if (a.some(function (x) { return x !== 'adults'; })) {
        var list = certs.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        if (!list.length) errors.push(t('e_certs')); else body.safetyCertifications = list;
      }
      var sized = c.some(function (x) { return SIZED.indexOf(x) !== -1; });
      if (sized && c.indexOf('cosmetics') !== -1) errors.push(t('e_cosmeticsMix'));
      if (sized) {
        var v = sizeValue.value.trim();
        if (!v) errors.push(t('e_size'));
        else if (sizeSystem.value === 'ALPHA') { v = v.toUpperCase(); if (['XS', 'S', 'M', 'L', 'XL', 'XXL'].indexOf(v) === -1) errors.push(t('e_sizeAlpha')); else body.size = { system: 'ALPHA', value: v }; }
        else { var n = Number(v.replace(',', '.')); if (!isFinite(n) || n <= 0) errors.push(t('e_sizeNumber')); else body.size = { system: sizeSystem.value, value: n }; }
      }
      if (c.indexOf('cosmetics') !== -1) {
        var fv = fmtValue.value.trim();
        if (!fv) errors.push(t('e_format'));
        else if (fmtKind.value === 'volume') { var ml = Number(fv.replace(',', '.')); if (!isFinite(ml) || ml <= 0) errors.push(t('e_format')); else body.format = { volumeMl: ml }; }
        else body.format = { shade: fv };
      }
      var cents = parseEuros(price.value);
      if (cents == null) errors.push(t('e_price')); else body.priceMinorUnits = cents;
      var initialStock = null;
      if (stock.value !== '') { initialStock = Number(stock.value); if (!Number.isInteger(initialStock) || initialStock < 0) errors.push(t('e_stock')); }
      if (errors.length) { errBox.textContent = errors.join(' '); errBox.hidden = false; errBox.scrollIntoView({ block: 'center' }); return; }
      errBox.hidden = true;
      submit.disabled = true; submit.textContent = t('saving');

      var brandStep = brand.value === '__new'
        ? api('/brands', { method: 'POST', body: { name: newBrand.value.trim() } }).then(json).then(function (r) { if (!r.ok) throw { server: r.body.error }; state.brands.push(r.body.brand); return r.body.brand.id; })
        : Promise.resolve(brand.value);
      brandStep.then(function (brandId) {
        body.brandId = brandId;
        return api('/products', { method: 'POST', body: body }).then(json);
      }).then(function (r) {
        if (r.status === 409) throw { message: t('e_skuTaken') };
        if (!r.ok) throw { server: r.body.error };
        if (initialStock == null) return r;
        return api('/stock/' + encodeURIComponent(r.body.product.id), { method: 'POST', body: { quantityAvailable: initialStock, observedAt: new Date().toISOString() } }).then(function () { return r; });
      }).then(function () {
        state.showForm = false; flash(t('productCreated')); return loadAll();
      }).catch(function (err) {
        submit.disabled = false; submit.textContent = t('save');
        errBox.textContent = err && err.message ? err.message : t('e_server') + ' ' + (err && err.server ? err.server : t('unavailable'));
        errBox.hidden = false;
      });
    });
    return form;
  }

  // ---------- stock

  function renderStock() {
    var root = $('tab-stock'); var nodes = [el('p', { class: 'pc-muted' }, t('stockIntro'))];
    var wrap = el('div', { class: 'pc-table-wrap' });
    var inputs = [];
    if (!state.inventory.length) wrap.appendChild(el('p', { class: 'pc-empty' }, t('noProducts')));
    else {
      var table = el('table', { class: 'pc-table' });
      var hr = el('tr');
      [['colRef'], ['colProduct'], ['colSize'], ['colAvailable', 'num'], ['colReserved', 'num'], ['colSellable', 'num'], ['colUpdated']].forEach(function (c) { hr.appendChild(el('th', { scope: 'col', class: c[1] || null }, t(c[0]))); });
      var thead = el('thead'); thead.appendChild(hr);
      var tbody = el('tbody');
      state.inventory.forEach(function (p) {
        var tr = el('tr');
        var current = p.stock ? p.stock.quantityAvailable : '';
        var input = el('input', { type: 'number', min: '0', step: '1', 'aria-label': t('colAvailable') + ' — ' + productName(p), value: String(current) });
        inputs.push({ product: p, input: input, original: String(current) });
        var qty = el('td', { class: 'num' }); qty.appendChild(input);
        tr.append(el('td', null, p.sku || t('noSku')), el('td', null, productName(p)), el('td', null, sizeLabel(p)), qty,
          el('td', { class: 'num' }, p.stock ? String(p.stock.quantityReserved) : '0'), el('td', { class: 'num' }, p.stock ? String(p.stock.sellable) : '—'),
          el('td', null, p.stock ? dateTime(p.stock.lastUpdatedAt) : '—'));
        tbody.appendChild(tr);
      });
      table.append(thead, tbody); wrap.appendChild(table);
    }
    nodes.push(wrap);
    var bar = el('div', { class: 'pc-toolbar' });
    var saveBtn = el('button', { class: 'pc-btn', type: 'button' }, t('saveStock'));
    saveBtn.disabled = !state.inventory.length;
    saveBtn.addEventListener('click', function () {
      var updates = []; var bad = false;
      inputs.forEach(function (x) {
        if (x.input.value === x.original) return;
        var n = Number(x.input.value);
        if (x.input.value === '' || !Number.isInteger(n) || n < 0) { bad = true; return; }
        updates.push({ productId: x.product.id, quantityAvailable: n });
      });
      if (bad) return flash(t('e_stock'), true);
      if (!updates.length) return flash(t('noChanges'));
      sendStock(updates, saveBtn);
    });
    bar.append(el('span'), saveBtn);
    nodes.push(bar);
    nodes.push(csvCard());
    root.replaceChildren.apply(root, nodes);
  }

  function sendStock(updates, button) {
    var observedAt = new Date().toISOString();
    if (button) button.disabled = true;
    return api('/stock/bulk', { method: 'POST', body: { updates: updates.map(function (u) { return { productId: u.productId, quantityAvailable: u.quantityAvailable, observedAt: observedAt }; }) } })
      .then(json).then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        var failed = r.body.results.filter(function (x) { return !x.ok; });
        var msg = t('stockSaved', { ok: r.body.summary.ok });
        if (failed.length) {
          var names = failed.map(function (f) { var p = state.inventory.filter(function (x) { return x.id === f.productId; })[0]; return p ? (p.sku || productName(p)) : f.productId; });
          msg += ' ' + t('stockFailed', { n: failed.length }) + ' ' + names.join(', ');
        }
        flash(msg, failed.length > 0);
        state.csv = null;
        return loadAll();
      }).catch(function () { if (button) button.disabled = false; flash(t('unavailable'), true); });
  }

  /** "reference;quantity" or "reference,quantity", optional header line. */
  function parseStockCsv(text) {
    var lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/);
    var bySku = {}; state.inventory.forEach(function (p) { if (p.sku) bySku[p.sku] = p; });
    var matched = {}, unknown = [], invalid = [], duplicates = [];
    lines.forEach(function (line, i) {
      if (!line.trim()) return;
      var sep = line.indexOf(';') !== -1 ? ';' : line.indexOf('\t') !== -1 ? '\t' : ',';
      var cols = line.split(sep).map(function (c) { return c.trim().replace(/^"|"$/g, ''); });
      var ref = cols[0], qtyRaw = cols[1];
      if (i === 0 && !/^\d+$/.test(qtyRaw || '')) return; // header
      if (!ref || !/^\d+$/.test(qtyRaw || '')) { invalid.push(i + 1); return; }
      var p = bySku[ref];
      if (!p) { unknown.push(ref); return; }
      if (matched[p.id]) duplicates.push(ref);
      matched[p.id] = { productId: p.id, quantityAvailable: Number(qtyRaw) };
    });
    return { updates: Object.keys(matched).map(function (k) { return matched[k]; }), unknown: unknown, invalid: invalid, duplicates: duplicates };
  }

  function csvCard() {
    var card = el('article', { class: 'pc-card' });
    card.append(el('h3', null, t('csvTitle')), el('p', { class: 'pc-muted' }, t('csvBody')));
    var bar = el('div', { class: 'pc-toolbar' });
    var file = el('input', { type: 'file', accept: '.csv,.txt,text/csv', 'aria-label': t('csvChoose') });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { state.csv = parseStockCsv(String(reader.result || '')); renderStock(); };
      reader.readAsText(f);
    });
    var tpl = el('button', { class: 'pc-btn secondary', type: 'button' }, t('csvTemplate'));
    tpl.addEventListener('click', function () {
      var rows = ['reference;quantite'].concat(state.inventory.filter(function (p) { return p.sku; }).map(function (p) { return p.sku + ';' + (p.stock ? p.stock.quantityAvailable : 0); }));
      var blob = new Blob([rows.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
      var a = el('a', { href: URL.createObjectURL(blob), download: 'stock-z-fashion.csv' });
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    });
    bar.append(file, tpl); card.appendChild(bar);

    if (state.csv) {
      var c = state.csv; var sum = el('div', { class: 'pc-csv-summary', role: 'status' });
      sum.appendChild(el('p', null, c.updates.length ? t('csvMatched', { n: c.updates.length }) : t('csvNone')));
      if (c.unknown.length) sum.appendChild(el('p', { class: 'pc-error' }, t('csvUnknown', { list: c.unknown.slice(0, 20).join(', ') + (c.unknown.length > 20 ? '…' : '') })));
      if (c.invalid.length) sum.appendChild(el('p', { class: 'pc-error' }, t('csvInvalid', { list: c.invalid.slice(0, 20).join(', ') })));
      if (c.duplicates.length) sum.appendChild(el('p', { class: 'pc-muted' }, t('csvDuplicate', { list: c.duplicates.join(', ') })));
      card.appendChild(sum);
      if (c.updates.length) {
        var go = el('button', { class: 'pc-btn', type: 'button' }, t('csvImport', { n: c.updates.length }));
        go.addEventListener('click', function () { sendStock(c.updates, go); });
        card.appendChild(go);
      }
    }
    return card;
  }

  // ---------- corner

  function renderCorner() {
    var root = $('tab-corner');
    var c = state.corner || {};
    var form = el('form', { class: 'pc-card pc-form', novalidate: true });
    form.append(el('p', { class: 'pc-muted' }, t('cornerIntro')));
    var errBox = el('div', { class: 'pc-error', role: 'alert', hidden: true }); form.appendChild(errBox);
    var name = el('input', { maxlength: '80', value: c.displayName || (state.app && state.app.tradeName) || '' });
    var byline = el('input', { maxlength: '140', value: c.byline || '' });
    var accent = el('input', { type: 'color', value: c.accentColor || '#151515' });
    var logo = el('input', { type: 'url', inputmode: 'url', placeholder: 'https://', value: c.logoUrl || '' });
    var g = el('div', { class: 'pc-grid2' });
    g.append(field(t('fDisplayName'), name), field(t('fAccent'), accent));
    form.append(g, field(t('fByline'), byline), field(t('fLogo'), logo, t('fLogoHint')));

    var preview = el('div', { class: 'pc-corner-preview', 'aria-label': t('preview') });
    var band = el('div', { class: 'pc-corner-band' }); var bodyBox = el('div', { class: 'pc-corner-body' });
    var img = el('img', { alt: '' }); var txt = el('div'); var pn = el('strong'); var pb = el('p', { class: 'pc-muted' });
    txt.append(pn, pb); bodyBox.append(img, txt); preview.append(band, bodyBox);
    function sync() {
      band.style.background = accent.value; pn.textContent = name.value || '—'; pb.textContent = byline.value;
      if (/^https:\/\//.test(logo.value.trim())) { img.src = logo.value.trim(); img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
    }
    form.addEventListener('input', sync); sync();
    form.append(el('p', { class: 'pc-label' }, t('preview')), preview);

    var save = el('button', { class: 'pc-btn', type: 'submit' }, t('save'));
    form.appendChild(save);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errors = [];
      if (!name.value.trim()) errors.push(t('e_displayName'));
      if (byline.value.length > 140) errors.push(t('e_byline'));
      var url = logo.value.trim(); var okUrl = false;
      try { okUrl = new URL(url).protocol === 'https:'; } catch (err) { okUrl = false; }
      if (!okUrl) errors.push(t('e_logo'));
      if (errors.length) { errBox.textContent = errors.join(' '); errBox.hidden = false; return; }
      errBox.hidden = true; save.disabled = true; save.textContent = t('saving');
      api('/corner-config', { method: 'POST', body: { displayName: name.value.trim(), byline: byline.value.trim() || null, accentColor: accent.value, logoUrl: url } })
        .then(json).then(function (r) {
          save.disabled = false; save.textContent = t('save');
          if (!r.ok) { errBox.textContent = t('e_server') + ' ' + (r.body.error || ''); errBox.hidden = false; return; }
          state.corner = r.body.cornerConfig; flash(t('cornerSaved'));
        }).catch(function () { save.disabled = false; save.textContent = t('save'); flash(t('unavailable'), true); });
    });
    root.replaceChildren(form);
  }

  // ---------- start

  function start() {
    var me = window.ZFashionAuth.me();
    state.partnerIds = (me && me.partnerIds) || [];
    if (!state.partnerIds.length) return;
    var saved = null; try { saved = localStorage.getItem('zfashion_console_store'); } catch (e) {}
    state.partnerId = state.partnerIds.indexOf(saved) !== -1 ? saved : state.partnerIds[0];
    var select = $('pcStore');
    if (state.partnerIds.length > 1) {
      $('pcStoreSwitch').hidden = false;
      state.partnerIds.forEach(function (id) { select.appendChild(el('option', { value: id }, id.slice(0, 8))); });
      select.value = state.partnerId;
      select.addEventListener('change', function () {
        state.partnerId = select.value;
        try { localStorage.setItem('zfashion_console_store', state.partnerId); } catch (e) {}
        state.showForm = false; state.csv = null; loadAll();
      });
      // Label each store by its name once known.
      state.partnerIds.forEach(function (id) {
        window.ZFashionAuth.apiFetch('/partners/' + encodeURIComponent(id) + '/application').then(json).then(function (r) {
          var opt = select.querySelector('option[value="' + id + '"]'); if (opt && r.ok && r.body.tradeName) opt.textContent = r.body.tradeName;
        }).catch(function () {});
      });
    }
    $('tab-overview').replaceChildren(el('p', { class: 'pc-muted' }, t('loading')));
    loadAll();
  }

  applyStatic();
  if (window.ZFashionAuth && window.ZFashionAuth.me()) start();
  else document.addEventListener('zfashion:auth', start);
  window.Z_FASHION_PARTNER_CONSOLE = 'LIVE';
})();
