/* ============================================================
   Z FASHION BACKOFFICE — product moderation (task 8, real data)
   ============================================================
   The "Produits" page. A new product waits here until an admin approves
   it; only then can it appear on the site. Only the first publication
   is moderated. An admin can also withdraw a product that is online,
   and reinstate one that was refused. Refusing or withdrawing needs a
   note: the store sees it in its space and can ask for a new review.

     GET  /admin/products?status=pending|approved|rejected
     POST /admin/products/:productId/moderation  { toStatus, note? }

   Every node is built with textContent; photo addresses are only used
   when they are https (or the local API in development).
   ============================================================ */

(function () {
  'use strict';

  var T = {
    intro: 'Les nouveaux produits des boutiques attendent votre validation avant d’apparaître sur le site. Seule la première mise en ligne est contrôlée ; vous pouvez retirer un produit à tout moment.',
    tab_pending: 'À valider', tab_approved: 'En ligne', tab_rejected: 'Refusés ou retirés',
    loading: 'Chargement…', unavailable: 'Impossible de charger les produits. Réessayez.', retry: 'Réessayer',
    empty_pending: 'Aucun produit à valider.', empty_approved: 'Aucun produit en ligne.', empty_rejected: 'Aucun produit refusé ou retiré.',
    store: 'Boutique', price: 'Prix', stock: 'Stock', ref: 'Référence', submitted: 'Soumis le', decided: 'Décision le',
    noPrice: 'sans prix', noPhoto: 'Pas de photo', photos: 'photos', photo: 'photo', pieces: 'en stock',
    approve: 'Approuver', reject: 'Refuser', withdraw: 'Retirer du site', reinstate: 'Remettre en ligne',
    notePlaceholder: 'Motif pour la boutique (obligatoire, la boutique le verra)',
    confirmReject: 'Confirmer le refus', confirmWithdraw: 'Confirmer le retrait', cancel: 'Annuler',
    lastNote: 'Motif communiqué à la boutique', warnings: 'À vérifier',
    w_noPrice: 'Pas de prix : le produit ne s’affichera pas tant que la boutique n’en indique pas un.',
    w_noPhoto: 'Pas de photo.', w_noStock: 'Stock à zéro.',
    saved_approved: 'Produit approuvé : il apparaît sur le site.', saved_rejected: 'Produit refusé ou retiré. La boutique voit votre motif.',
    err_note_required: 'Indiquez le motif pour la boutique.', err_note_too_long: 'Motif trop long (1000 caractères maximum).',
    err_conflict: 'Le produit a changé entre-temps : la liste a été rechargée.', err_generic: 'La décision n’a pas pu être enregistrée.',
    g_female: 'Femme', g_male: 'Homme', g_unisex: 'Mixte',
    cat_clothing: 'Vêtements', cat_footwear: 'Chaussures', cat_sportswear: 'Sport', cat_accessories_leather_goods: 'Accessoires', cat_cosmetics: 'Cosmétiques',
    age_adults: 'Adultes', age_youth: 'Adolescents', age_children: 'Enfants', age_baby: 'Bébés',
    size: 'Taille', format: 'Format', certifications: 'Certifications',
  };
  var TABS = ['pending', 'approved', 'rejected'];

  var root = document.getElementById('adminProducts');
  if (!root) return;
  var state = { tab: 'pending', products: [], counts: {}, open: null, message: null, busy: false };

  function t(k) { return T[k] != null ? T[k] : k; }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function api(path, init) { return window.ZFashionAuth.apiFetch(path, init); }
  function money(minor) {
    return minor == null ? t('noPrice') : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(minor / 100);
  }
  function date(v) {
    return v ? new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  }
  function safeImage(u) {
    u = String(u || '');
    return /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(u) ? u : '';
  }
  function name(p) { return (p.names && (p.names.fr || Object.values(p.names)[0])) || '—'; }
  function sizeLabel(p) {
    if (p.size && p.size.value != null) return t('size') + ' ' + p.size.value + (p.size.system && p.size.system !== 'ALPHA' ? ' (' + p.size.system + ')' : '');
    if (p.format && p.format.volumeMl != null) return t('format') + ' ' + p.format.volumeMl + ' ml';
    if (p.format && p.format.shade) return t('format') + ' ' + p.format.shade;
    return '';
  }

  // ---------- data

  function load() {
    state.open = null;
    root.replaceChildren(el('p', { class: 'section-sub' }, t('loading')));
    return api('/admin/products?status=' + state.tab)
      .then(function (res) { if (!res.ok) throw new Error(String(res.status)); return res.json(); })
      .then(function (body) { state.products = body.products || []; state.counts = body.counts || {}; render(); })
      .catch(function () {
        var retry = el('button', { type: 'button', class: 'link' }, t('retry'));
        retry.addEventListener('click', load);
        root.replaceChildren(el('p', { class: 'section-sub' }, t('unavailable')), retry);
      });
  }

  function decide(product, toStatus, note) {
    state.busy = true; render();
    return api('/admin/products/' + encodeURIComponent(product.id) + '/moderation', { method: 'POST', body: { toStatus: toStatus, note: note || undefined } })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, status: res.status, body: body }; }); })
      .then(function (r) {
        state.busy = false;
        if (r.ok) {
          state.message = { error: false, text: t('saved_' + toStatus) };
          return load();
        }
        var code = r.body && r.body.error;
        if (r.status === 409) { state.message = { error: true, text: t('err_conflict') }; return load(); }
        state.message = { error: true, text: T['err_' + code] || t('err_generic') };
        render();
      })
      .catch(function () { state.busy = false; state.message = { error: true, text: t('err_generic') }; render(); });
  }

  // ---------- view

  function render() {
    var nodes = [el('p', { class: 'section-sub' }, t('intro'))];
    var bar = el('div', { class: 'filterbar', role: 'tablist' });
    TABS.forEach(function (id) {
      var b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(state.tab === id) }, t('tab_' + id) + ' · ' + (state.counts[id] || 0));
      if (state.tab === id) b.className = 'active';
      b.addEventListener('click', function () { if (state.tab !== id) { state.tab = id; state.message = null; load(); } });
      bar.appendChild(b);
    });
    nodes.push(bar);
    if (state.message) nodes.push(el('p', { class: 'mod-message' + (state.message.error ? ' error' : ''), role: 'status' }, state.message.text));
    if (!state.products.length) {
      var empty = el('article', { class: 'panel' }); empty.appendChild(el('p', { class: 'apps-empty' }, t('empty_' + state.tab)));
      nodes.push(empty);
    } else {
      var grid = el('div', { class: 'mod-grid' });
      state.products.forEach(function (p) { grid.appendChild(card(p)); });
      nodes.push(grid);
    }
    root.replaceChildren.apply(root, nodes);
  }

  function card(p) {
    var art = el('article', { class: 'panel mod-card', 'data-product': p.id });
    var media = el('div', { class: 'mod-media' });
    var images = (p.images || []).map(safeImage).filter(Boolean);
    if (images.length) {
      media.appendChild(el('img', { src: images[0], alt: name(p), loading: 'lazy' }));
      if (images.length > 1) {
        var thumbs = el('div', { class: 'mod-thumbs' });
        images.slice(1, 5).forEach(function (u) { thumbs.appendChild(el('img', { src: u, alt: '', loading: 'lazy' })); });
        media.appendChild(thumbs);
      }
    } else {
      media.appendChild(el('div', { class: 'mod-nophoto' }, t('noPhoto')));
    }

    var body = el('div', { class: 'mod-body' });
    body.appendChild(el('p', { class: 'kicker' }, (p.brandName || '') + (p.storeName ? ' · ' + p.storeName : '')));
    body.appendChild(el('h3', null, name(p)));
    var facts = [
      (p.categories || []).map(function (c) { return t('cat_' + c); }).join(', '),
      t('g_' + p.gender),
      (p.ageSegments || []).map(function (a) { return t('age_' + a); }).join(', '),
      sizeLabel(p),
    ].filter(Boolean).join(' · ');
    body.appendChild(el('p', { class: 'mod-facts' }, facts));
    var desc = p.descriptions && (p.descriptions.fr || Object.values(p.descriptions)[0]);
    if (desc) body.appendChild(el('p', { class: 'mod-desc' }, desc));

    var metrics = el('div', { class: 'mod-metrics' });
    [['price', money(p.priceMinorUnits)], ['stock', String(p.quantityAvailable || 0) + ' ' + t('pieces')],
      ['ref', p.sku || '—'], [state.tab === 'pending' ? 'submitted' : 'decided', date(state.tab === 'pending' ? p.submittedAt : p.moderatedAt)]]
      .forEach(function (m) { var row = el('div', { class: 'metric' }); row.append(el('span', null, t(m[0])), el('strong', null, m[1])); metrics.appendChild(row); });
    if ((p.safetyCertifications || []).length) {
      var cert = el('div', { class: 'metric' }); cert.append(el('span', null, t('certifications')), el('strong', null, p.safetyCertifications.join(', '))); metrics.appendChild(cert);
    }
    body.appendChild(metrics);

    var warnings = [];
    if (p.priceMinorUnits == null) warnings.push(t('w_noPrice'));
    if (!images.length) warnings.push(t('w_noPhoto'));
    if (!p.quantityAvailable) warnings.push(t('w_noStock'));
    if (warnings.length && state.tab === 'pending') {
      var w = el('div', { class: 'boundary mod-warn' }); w.appendChild(el('strong', null, t('warnings') + ' : '));
      w.appendChild(document.createTextNode(warnings.join(' ')));
      body.appendChild(w);
    }
    if (p.moderationNote && state.tab !== 'approved') {
      var n = el('div', { class: 'boundary' }); n.append(el('strong', null, t('lastNote') + ' : '), document.createTextNode(p.moderationNote));
      body.appendChild(n);
    }
    body.appendChild(actions(p));
    art.append(media, body);
    return art;
  }

  function button(label, cls, onClick) {
    var b = el('button', { type: 'button', class: cls }, label);
    if (state.busy) b.disabled = true;
    b.addEventListener('click', onClick);
    return b;
  }

  function actions(p) {
    var box = el('div', { class: 'mod-actions' });
    var needsNote = state.tab === 'pending' ? 'reject' : state.tab === 'approved' ? 'withdraw' : null;
    if (state.open === p.id && needsNote) {
      var area = el('textarea', { rows: '3', maxlength: '1000', placeholder: t('notePlaceholder'), 'aria-label': t('notePlaceholder') });
      var row = el('div', { class: 'mod-buttons' });
      row.append(
        button(t(needsNote === 'reject' ? 'confirmReject' : 'confirmWithdraw'), 'mod-btn danger', function () {
          if (!area.value.trim()) { state.message = { error: true, text: t('err_note_required') }; render(); return; }
          decide(p, 'rejected', area.value);
        }),
        button(t('cancel'), 'mod-btn', function () { state.open = null; render(); })
      );
      box.append(area, row);
      setTimeout(function () { area.focus(); }, 0);
      return box;
    }
    var buttons = el('div', { class: 'mod-buttons' });
    if (state.tab === 'pending') {
      buttons.append(button(t('approve'), 'mod-btn primary', function () { decide(p, 'approved'); }),
        button(t('reject'), 'mod-btn', function () { state.open = p.id; state.message = null; render(); }));
    } else if (state.tab === 'approved') {
      buttons.append(button(t('withdraw'), 'mod-btn', function () { state.open = p.id; state.message = null; render(); }));
    } else {
      buttons.append(button(t('reinstate'), 'mod-btn primary', function () { decide(p, 'approved'); }));
    }
    box.appendChild(buttons);
    return box;
  }

  // ---------- start once the admin is signed in, reload when the page is shown

  var started = false;
  function start() { started = true; load(); }
  document.addEventListener('zfashion:admin-page', function (e) { if (e.detail && e.detail.page === 'products' && started) load(); });
  if (window.ZFashionAuth && window.ZFashionAuth.me()) start();
  else document.addEventListener('zfashion:auth', start);
  window.Z_FASHION_ADMIN_PRODUCTS = 'LIVE';
})();
