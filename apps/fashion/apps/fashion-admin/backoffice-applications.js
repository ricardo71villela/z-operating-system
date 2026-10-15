/* ============================================================
   Z FASHION BACKOFFICE — store applications (real data)
   ============================================================
   The "Adhésions" page. Unlike the other backoffice pages (still
   demonstration content, see app.js), this one reads and changes real
   data through the Partner API, as the signed-in admin:

     GET  /admin/partner-applications?status=
     GET  /admin/partner-applications/:partnerId
     POST /admin/partner-applications/:partnerId/decision

   Decisions follow the onboarding state machine (applied → under review
   → approved / rejected; approved → active; active ⇄ suspended). The
   API re-checks every decision; this page only offers the moves that
   are valid from the current status. Rejecting or suspending needs a
   note, which the store is shown.

   Every node is built with textContent: nothing from the API is ever
   parsed as HTML.
   ============================================================ */

(function () {
  'use strict';

  var STRINGS = {
    fr: {
      intro: 'Demandes d’adhésion des boutiques — données réelles. Chaque décision est enregistrée avec votre compte.',
      filter_todo: 'À traiter', filter_approved: 'Approuvées', filter_active: 'Actives', filter_suspended: 'Suspendues', filter_rejected: 'Refusées', filter_all: 'Toutes',
      col_store: 'Boutique', col_siret: 'SIRET', col_categories: 'Catégories', col_fee: 'Abonnement', col_received: 'Reçue le', col_status: 'Statut',
      status_applied: 'Reçue', status_under_review: 'En examen', status_approved: 'Approuvée', status_rejected: 'Refusée', status_active: 'Active', status_suspended: 'Suspendue',
      cat_clothing: 'Vêtements', cat_footwear: 'Chaussures', cat_sportswear: 'Sport', cat_accessories_leather_goods: 'Accessoires', cat_cosmetics: 'Cosmétiques',
      age_adults: 'Adultes', age_youth: 'Adolescents', age_children: 'Enfants', age_baby: 'Bébés',
      perMonth: 'HT / mois', empty: 'Aucune demande dans cette liste.', loading: 'Chargement…',
      unavailable: 'Impossible de charger les demandes. Réessayez.', back: '← Retour à la liste',
      h_company: 'Entreprise', h_contact: 'Contact', h_catalog: 'Ce que la boutique vend', h_terms: 'Conditions et offre', h_decision: 'Décision',
      tradeName: 'Nom', legalName: 'Raison sociale', siret: 'SIRET', vat: 'TVA', address: 'Adresse', email: 'E-mail', phone: 'Téléphone', website: 'Site',
      categories: 'Catégories', customers: 'Clientèle', minorSafe: 'Engagement mineurs', yes: 'Oui', no: 'Non', none: '—',
      termsVersion: 'Version des CG Partner acceptée', acceptedAt: 'Acceptées le', fee: 'Abonnement applicable', received: 'Demande reçue le',
      lastNote: 'Dernière note', decidedAt: 'Dernière décision le', stockMode: 'Mode de stock',
      tier_degraded: 'Mise à jour manuelle (fichier)', tier_live: 'Flux automatique',
      noteRequired: 'Note pour la boutique (obligatoire — la boutique la verra)', noteOptional: 'Note pour la boutique (facultative)',
      noteRequiredToReject: 'Note pour la boutique (obligatoire pour refuser — la boutique la verra)',
      act_under_review: 'Commencer l’examen', act_approved: 'Approuver', act_rejected: 'Refuser', act_active: 'Activer la boutique', act_suspended: 'Suspendre', act_reactivate: 'Réactiver',
      chooseStockMode: 'Mode de stock à l’activation',
      activeHint: 'Une boutique active apparaît dans le catalogue public.',
      noMoreActions: 'Aucune décision possible depuis ce statut.',
      saving: 'Enregistrement…', saved: 'Décision enregistrée.',
      err_note_required: 'Une note est obligatoire pour cette décision.', err_note_too_long: 'Note trop longue (1000 caractères maximum).',
      err_feedReliabilityTier_required: 'Choisissez le mode de stock.', err_conflict: 'Le statut a changé entre-temps : la fiche a été rechargée.',
      err_generic: 'La décision n’a pas pu être enregistrée.',
    },
    en: {
      intro: 'Store applications — live data. Every decision is recorded with your account.',
      filter_todo: 'To review', filter_approved: 'Approved', filter_active: 'Active', filter_suspended: 'Suspended', filter_rejected: 'Rejected', filter_all: 'All',
      col_store: 'Store', col_siret: 'SIRET', col_categories: 'Categories', col_fee: 'Subscription', col_received: 'Received', col_status: 'Status',
      status_applied: 'Received', status_under_review: 'Under review', status_approved: 'Approved', status_rejected: 'Rejected', status_active: 'Active', status_suspended: 'Suspended',
      cat_clothing: 'Clothing', cat_footwear: 'Footwear', cat_sportswear: 'Sportswear', cat_accessories_leather_goods: 'Accessories', cat_cosmetics: 'Cosmetics',
      age_adults: 'Adults', age_youth: 'Teens', age_children: 'Children', age_baby: 'Babies',
      perMonth: 'excl. VAT / month', empty: 'No application in this list.', loading: 'Loading…',
      unavailable: 'Could not load applications. Try again.', back: '← Back to the list',
      h_company: 'Company', h_contact: 'Contact', h_catalog: 'What the store sells', h_terms: 'Terms and offer', h_decision: 'Decision',
      tradeName: 'Name', legalName: 'Registered name', siret: 'SIRET', vat: 'VAT', address: 'Address', email: 'E-mail', phone: 'Phone', website: 'Website',
      categories: 'Categories', customers: 'Customers', minorSafe: 'Minors commitment', yes: 'Yes', no: 'No', none: '—',
      termsVersion: 'Partner terms version accepted', acceptedAt: 'Accepted on', fee: 'Applicable subscription', received: 'Application received',
      lastNote: 'Latest note', decidedAt: 'Latest decision', stockMode: 'Stock mode',
      tier_degraded: 'Manual update (file)', tier_live: 'Automatic feed',
      noteRequired: 'Note for the store (required — the store will see it)', noteOptional: 'Note for the store (optional)',
      noteRequiredToReject: 'Note for the store (required to reject — the store will see it)',
      act_under_review: 'Start review', act_approved: 'Approve', act_rejected: 'Reject', act_active: 'Activate the store', act_suspended: 'Suspend', act_reactivate: 'Reactivate',
      chooseStockMode: 'Stock mode on activation',
      activeHint: 'An active store appears in the public catalogue.',
      noMoreActions: 'No decision is possible from this status.',
      saving: 'Saving…', saved: 'Decision recorded.',
      err_note_required: 'A note is required for this decision.', err_note_too_long: 'Note too long (1000 characters max).',
      err_feedReliabilityTier_required: 'Choose the stock mode.', err_conflict: 'The status changed in the meantime: the record was reloaded.',
      err_generic: 'The decision could not be recorded.',
    },
  };

  var FILTERS = [
    { id: 'todo', statuses: ['applied', 'under_review'] },
    { id: 'approved', statuses: ['approved'] },
    { id: 'active', statuses: ['active'] },
    { id: 'suspended', statuses: ['suspended'] },
    { id: 'rejected', statuses: ['rejected'] },
    { id: 'all', statuses: null },
  ];

  /* Moves offered from each status (the API enforces the same graph). */
  var ACTIONS = {
    applied: [{ to: 'under_review', label: 'act_under_review' }],
    under_review: [{ to: 'approved', label: 'act_approved' }, { to: 'rejected', label: 'act_rejected', needsNote: true, danger: true }],
    approved: [{ to: 'active', label: 'act_active', needsTier: true }],
    active: [{ to: 'suspended', label: 'act_suspended', needsNote: true, danger: true }],
    suspended: [{ to: 'active', label: 'act_reactivate', needsTier: true }],
    rejected: [],
  };

  var BADGE = { applied: 'warn', under_review: 'warn', approved: 'good', active: 'good', suspended: 'bad', rejected: 'bad' };

  function locale() {
    var l = document.documentElement.dataset.locale || 'fr';
    return STRINGS[l] ? l : 'fr';
  }
  function t(key) { return (STRINGS[locale()] || STRINGS.fr)[key] || STRINGS.fr[key] || key; }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function money(minor) {
    if (minor == null) return t('none');
    return new Intl.NumberFormat(locale() === 'fr' ? 'fr-FR' : 'en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(minor / 100) + ' ' + t('perMonth');
  }
  function date(value, withTime) {
    if (!value) return t('none');
    var d = new Date(value);
    return d.toLocaleDateString(locale() === 'fr' ? 'fr-FR' : 'en-GB', withTime ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function siret(s) { return s ? String(s).replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4') : t('none'); }
  function list(values, prefix) { return (values || []).map(function (v) { return t(prefix + v); }).join(', ') || t('none'); }
  function badge(status) { return el('span', { class: 'badge ' + (BADGE[status] || '') }, t('status_' + status)); }

  var root = document.getElementById('adminApplications');
  if (!root) return;
  var state = { filter: 'todo', applications: [], counts: {}, selected: null, message: null };

  function api(path, init) { return window.ZFashionAuth.apiFetch(path, init); }

  // ---------- list

  function load() {
    root.replaceChildren(el('p', { class: 'section-sub' }, t('loading')));
    return api('/admin/partner-applications')
      .then(function (res) { if (!res.ok) throw new Error(String(res.status)); return res.json(); })
      .then(function (body) { state.applications = body.applications; state.counts = body.countsByStatus || {}; render(); })
      .catch(function () { root.replaceChildren(el('p', { class: 'section-sub' }, t('unavailable'))); });
  }

  function countFor(filter) {
    if (!filter.statuses) return Object.keys(state.counts).reduce(function (n, k) { return n + state.counts[k]; }, 0);
    return filter.statuses.reduce(function (n, s) { return n + (state.counts[s] || 0); }, 0);
  }

  function renderList() {
    var nodes = [el('p', { class: 'section-sub' }, t('intro'))];
    var bar = el('div', { class: 'filterbar', role: 'tablist' });
    FILTERS.forEach(function (f) {
      var b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(state.filter === f.id) }, t('filter_' + f.id) + ' · ' + countFor(f));
      if (state.filter === f.id) b.className = 'active';
      b.addEventListener('click', function () { state.filter = f.id; render(); });
      bar.appendChild(b);
    });
    nodes.push(bar);

    var filter = FILTERS.filter(function (f) { return f.id === state.filter; })[0];
    var rows = state.applications.filter(function (a) { return !filter.statuses || filter.statuses.indexOf(a.onboardingStatus) !== -1; });
    var panel = el('article', { class: 'panel' });
    if (!rows.length) {
      panel.appendChild(el('p', { class: 'apps-empty' }, t('empty')));
    } else {
      var wrap = el('div', { class: 'table-wrap' });
      var table = el('table', { class: 'table' });
      var head = el('tr');
      ['col_store', 'col_siret', 'col_categories', 'col_fee', 'col_received', 'col_status'].forEach(function (k) { head.appendChild(el('th', { scope: 'col' }, t(k))); });
      var thead = el('thead'); thead.appendChild(head);
      var tbody = el('tbody');
      rows.forEach(function (a) {
        var tr = el('tr', { class: 'apps-row', tabindex: '0' });
        var store = el('td'); store.append(el('strong', null, a.tradeName), el('small', null, a.postalCode + ' ' + a.city));
        tr.append(store, el('td', null, siret(a.registrationNumber)), el('td', null, list(a.categories, 'cat_')),
          el('td', null, money(a.monthlySubscriptionFeeMinorUnits)), el('td', null, date(a.createdAt)));
        var st = el('td'); st.appendChild(badge(a.onboardingStatus)); tr.appendChild(st);
        var open = function () { openDetail(a.partnerId); };
        tr.addEventListener('click', open);
        tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
        tbody.appendChild(tr);
      });
      table.append(thead, tbody); wrap.appendChild(table); panel.appendChild(wrap);
    }
    nodes.push(panel);
    root.replaceChildren.apply(root, nodes);
  }

  // ---------- detail

  function openDetail(partnerId) {
    state.message = null;
    return api('/admin/partner-applications/' + encodeURIComponent(partnerId))
      .then(function (res) { if (!res.ok) throw new Error(String(res.status)); return res.json(); })
      .then(function (body) { state.selected = body.application; render(); window.scrollTo(0, 0); })
      .catch(function () { state.message = { error: true, text: t('unavailable') }; render(); });
  }

  function metric(label, value) {
    var row = el('div', { class: 'metric' });
    row.append(el('span', null, t(label)), el('strong', null, value == null || value === '' ? t('none') : String(value)));
    return row;
  }
  function card(title, metrics) {
    var c = el('article', { class: 'detail-card' });
    c.appendChild(el('h4', null, t(title)));
    metrics.forEach(function (m) { c.appendChild(m); });
    return c;
  }

  function renderDetail() {
    var a = state.selected;
    var nodes = [];
    var back = el('button', { type: 'button', class: 'link apps-back' }, t('back'));
    back.addEventListener('click', function () { state.selected = null; state.message = null; load(); });
    nodes.push(back);

    var head = el('div', { class: 'apps-head' });
    head.append(el('h2', null, a.tradeName), badge(a.onboardingStatus));
    nodes.push(head);

    if (state.message) nodes.push(el('p', { class: 'apps-msg' + (state.message.error ? ' err' : ''), role: 'status' }, state.message.text));

    var grid = el('div', { class: 'detail-grid' });
    grid.append(
      card('h_company', [metric('legalName', a.legalName), metric('siret', siret(a.registrationNumber)), metric('vat', a.vatNumber),
        metric('address', a.addressLine1 + ', ' + a.postalCode + ' ' + a.city)]),
      card('h_contact', [metric('email', a.contactEmail), metric('phone', a.contactPhone), metric('website', a.website), metric('received', date(a.createdAt, true))]),
      card('h_catalog', [metric('categories', list(a.categories, 'cat_')), metric('customers', list(a.ageSegments, 'age_')),
        metric('minorSafe', a.minorSafeDataAcknowledged ? t('yes') : t('no'))]),
      card('h_terms', [metric('termsVersion', a.termsVersion), metric('acceptedAt', date(a.termsAcceptedAt, true)), metric('fee', money(a.monthlySubscriptionFeeMinorUnits)),
        metric('stockMode', a.feedReliabilityTier ? t('tier_' + a.feedReliabilityTier) : null)])
    );
    nodes.push(grid);

    nodes.push(renderDecision(a));
    root.replaceChildren.apply(root, nodes);
  }

  function renderDecision(a) {
    var panel = el('article', { class: 'panel apps-decision' });
    panel.appendChild(el('h3', null, t('h_decision')));
    if (a.decisionNote || a.decidedAt) {
      panel.append(metric('lastNote', a.decisionNote), metric('decidedAt', date(a.decidedAt, true)));
    }
    var actions = ACTIONS[a.onboardingStatus] || [];
    if (!actions.length) { panel.appendChild(el('p', { class: 'section-sub' }, t('noMoreActions'))); return panel; }

    var needsNote = actions.some(function (x) { return x.needsNote; });
    var needsTier = actions.some(function (x) { return x.needsTier; });
    var form = el('div', { class: 'apps-form' });

    var noteLabel = el('label', { for: 'appsNote' },
      !needsNote ? t('noteOptional') : actions.length > 1 ? t('noteRequiredToReject') : t('noteRequired'));
    var note = el('textarea', { id: 'appsNote', rows: '3', maxlength: '1000' });
    form.append(noteLabel, note);

    var tierSelect = null;
    if (needsTier) {
      var tl = el('label', { for: 'appsTier' }, t('chooseStockMode'));
      tierSelect = el('select', { id: 'appsTier' });
      ['degraded', 'live'].forEach(function (v) { tierSelect.appendChild(el('option', { value: v }, t('tier_' + v))); });
      if (a.feedReliabilityTier) tierSelect.value = a.feedReliabilityTier;
      form.append(tl, tierSelect, el('p', { class: 'section-sub' }, t('activeHint')));
    }

    var buttons = el('div', { class: 'apps-actions' });
    actions.forEach(function (action) {
      var b = el('button', { type: 'button', class: action.danger ? 'apps-danger' : 'apps-primary' }, t(action.label));
      b.addEventListener('click', function () { decide(a, action, note.value, tierSelect && tierSelect.value, buttons); });
      buttons.appendChild(b);
    });
    form.appendChild(buttons);
    panel.appendChild(form);
    return panel;
  }

  function decide(a, action, noteText, tier, buttons) {
    if (action.needsNote && !noteText.trim()) { state.message = { error: true, text: t('err_note_required') }; return render(); }
    Array.prototype.forEach.call(buttons.children, function (b) { b.disabled = true; });
    var payload = { toStatus: action.to, note: noteText };
    if (action.needsTier) payload.feedReliabilityTier = tier;
    api('/admin/partner-applications/' + encodeURIComponent(a.partnerId) + '/decision', { method: 'POST', body: payload })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (body) { return { status: res.status, body: body }; }); })
      .then(function (r) {
        if (r.status === 200) { state.selected = r.body.application; state.message = { error: false, text: t('saved') }; return render(); }
        if (r.status === 409) return openDetail(a.partnerId).then(function () { state.message = { error: true, text: t('err_conflict') }; render(); });
        if (r.status === 422 && r.body.fieldErrors && r.body.fieldErrors.length) {
          var fe = r.body.fieldErrors[0];
          var key = 'err_' + fe.field + '_' + fe.code;
          state.message = { error: true, text: STRINGS.fr[key] ? t(key) : t('err_generic') };
          return render();
        }
        state.message = { error: true, text: t('err_generic') }; render();
      })
      .catch(function () { state.message = { error: true, text: t('err_generic') }; render(); });
  }

  function render() { return state.selected ? renderDetail() : renderList(); }

  // ---------- start once the admin is signed in

  document.getElementById('localeSelect').addEventListener('change', function () { setTimeout(render, 0); });
  function start() { load(); }
  if (window.ZFashionAuth && window.ZFashionAuth.me()) start();
  else document.addEventListener('zfashion:auth', start);
  window.Z_FASHION_ADMIN_APPLICATIONS = 'LIVE';
})();
