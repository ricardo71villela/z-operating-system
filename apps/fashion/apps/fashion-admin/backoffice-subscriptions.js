/* ============================================================
   Z FASHION BACKOFFICE — store subscriptions (task 9, real data)
   ============================================================
   The "Abonnements" page: every active or suspended store, the
   monthly fee it owes, its free month, and the state of its Stripe
   subscription (to set up, free month, active, payment failed,
   cancelled). Stripe sends reminders and retries failed payments;
   this page shows which stores need a follow-up (for instance a
   suspension, decided on the Adhésions page).

     GET /admin/subscriptions

   Every node is built with textContent.
   ============================================================ */

(function () {
  'use strict';

  var T = {
    intro: 'L’abonnement de chaque boutique active, facturé par Stripe (carte ou prélèvement SEPA). Stripe relance et retente les paiements échoués ; les boutiques en échec de paiement apparaissent en premier.',
    loading: 'Chargement…', unavailable: 'Impossible de charger les abonnements. Réessayez.', disabled: 'Les abonnements en ligne ne sont pas encore ouverts (Stripe non configuré).',
    empty: 'Aucune boutique active.', retry: 'Réessayer',
    col_store: 'Boutique', col_fee: 'Abonnement HT', col_free: 'Mois offert jusqu’au', col_state: 'État', col_next: 'Prochain prélèvement', col_note: 'À suivre',
    s_not_set_up: 'À mettre en place', s_trial: 'Mois offert', s_active: 'Actif', s_past_due: 'Paiement en échec', s_canceled: 'Résilié',
    n_pastDue: 'Échec depuis le {date}', n_notSetUpLate: 'Mois offert terminé, paiement non mis en place', n_cancelAtEnd: 'Résiliation en fin de période', n_suspended: 'Boutique suspendue',
    total: 'boutiques',
  };
  var BADGE = { not_set_up: 'warn', trial: 'good', active: 'good', past_due: 'bad', canceled: 'bad' };
  var ORDER = { past_due: 0, not_set_up: 1, canceled: 2, trial: 3, active: 4 };

  var root = document.getElementById('adminSubscriptions');
  if (!root) return;
  function t(k) { return T[k] != null ? T[k] : k; }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function money(m) { return m == null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(m / 100); }
  function date(v) { return v ? new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'; }

  function load() {
    root.replaceChildren(el('p', { class: 'section-sub' }, t('loading')));
    window.ZFashionAuth.apiFetch('/admin/subscriptions')
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (b) { return { status: res.status, ok: res.ok, body: b }; }); })
      .then(function (r) {
        if (r.status === 503) { root.replaceChildren(el('p', { class: 'section-sub' }, t('disabled'))); return; }
        if (!r.ok) throw new Error(String(r.status));
        render(r.body.stores || []);
      })
      .catch(function () {
        var b = el('button', { type: 'button', class: 'link' }, t('retry')); b.addEventListener('click', load);
        root.replaceChildren(el('p', { class: 'section-sub' }, t('unavailable')), b);
      });
  }

  function note(s) {
    var out = [];
    if (s.onboardingStatus === 'suspended') out.push(t('n_suspended'));
    if (s.state === 'past_due') out.push(t('n_pastDue').replace('{date}', date(s.pastDueSince)));
    if (s.state === 'not_set_up' && s.freeMonthOver) out.push(t('n_notSetUpLate'));
    if (s.cancelAtPeriodEnd) out.push(t('n_cancelAtEnd'));
    return out.join(' · ');
  }

  function render(stores) {
    stores = stores.slice().sort(function (a, b) { return (ORDER[a.state] - ORDER[b.state]) || String(a.storeName || '').localeCompare(String(b.storeName || '')); });
    var nodes = [el('p', { class: 'section-sub' }, t('intro'))];
    var panel = el('article', { class: 'panel' });
    if (!stores.length) {
      panel.appendChild(el('p', { class: 'apps-empty' }, t('empty')));
    } else {
      var wrap = el('div', { class: 'table-wrap' }); var table = el('table', { class: 'table' });
      var hr = el('tr');
      ['col_store', 'col_fee', 'col_free', 'col_state', 'col_next', 'col_note'].forEach(function (k) { hr.appendChild(el('th', { scope: 'col' }, t(k))); });
      var thead = el('thead'); thead.appendChild(hr);
      var tbody = el('tbody');
      stores.forEach(function (s) {
        var tr = el('tr', { 'data-store': s.partnerId });
        var name = el('td'); name.append(el('strong', null, s.storeName || s.partnerId.slice(0, 8)), el('small', null, String(s.partnerId).slice(0, 8)));
        var st = el('td'); st.appendChild(el('span', { class: 'badge ' + (BADGE[s.state] || '') }, t('s_' + s.state)));
        tr.append(name, el('td', null, money(s.feeMinorUnits)), el('td', null, date(s.freeUntil)), st, el('td', null, date(s.nextBillingAt)), el('td', null, note(s) || '—'));
        tbody.appendChild(tr);
      });
      table.append(thead, tbody); wrap.appendChild(table); panel.appendChild(wrap);
    }
    nodes.push(panel);
    root.replaceChildren.apply(root, nodes);
  }

  var started = false;
  function start() { started = true; load(); }
  document.addEventListener('zfashion:admin-page', function (e) { if (e.detail && e.detail.page === 'subscriptions' && started) load(); });
  if (window.ZFashionAuth && window.ZFashionAuth.me()) start();
  else document.addEventListener('zfashion:auth', start);
  window.Z_FASHION_ADMIN_SUBSCRIPTIONS = 'LIVE';
})();
