/* ============================================================
   Z FIND ADMIN — « Facturation »
   ============================================================
   Abonnements des agences (Stripe), agences sans moyen de paiement,
   commandes (mises en avant, agence à la une, contacts vendeurs) et
   totaux mensuels. Lecture seule : les remboursements, avoirs et
   changements se font dans le tableau de bord Stripe (liens directs).
   RPC zfind_admin_billing_overview (migration 20261029200000).
   ============================================================ */

const BILL_SUB_STATUS = {
  trialing: ['Mois offerts', 'review'], active: ['Actif', 'active'], past_due: ['Paiement en retard', 'late'], unpaid: ['Impayé', 'late'],
  canceled: ['Résilié', 'inactive'], incomplete: ['Incomplet', 'draft'], incomplete_expired: ['Expiré', 'inactive'], paused: ['En pause', 'inactive']
};
const BILL_ORDER_KIND = {
  highlight_7d: 'Mise en avant 7 jours', highlight_30d: 'Mise en avant 30 jours', highlight_pack: 'Pack de mises en avant',
  agency_featured_month: 'Agence à la une (1 mois)', seller_lead: 'Contact vendeur', seller_lead_qualified: 'Contact vendeur qualifié'
};
const BILL_ORDER_STATUS = { pending: ['En attente', 'draft'], processing: ['Prélèvement SEPA en cours', 'review'], paid: ['Payée', 'active'], failed: ['Échouée', 'late'], canceled: ['Annulée', 'inactive'], refunded: ['Remboursée', 'inactive'] };
const BILL_PM = { card: 'Carte', sepa_debit: 'Prélèvement SEPA' };
const BILL_TIER = { essentiel: 'Essentiel', plus: 'Plus', pro: 'Pro', premium: 'Premium' };
let billingCache = null;

function billDate(iso) { return iso ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)) : '—'; }
function billEuro(cents) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format((Number(cents) || 0) / 100); }
function billEuroInt(v) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v) || 0); }
function billTag(map, key) { const [l, t] = map[key] || [key || '—', 'draft']; return `<span class="tag tag-${t}">${escapeHtml(l)}</span>`; }
function billStripe(kind, id, livemode) {
  if (!id) return '';
  const test = livemode !== true;
  const label = kind === 'customers' ? 'Client Stripe ↗' : 'Abonnement Stripe ↗';
  return `<a href="https://dashboard.stripe.com/${test ? 'test/' : ''}${kind}/${encodeURIComponent(id)}" target="_blank" rel="noopener">${label}</a>`;
}

async function renderBilling() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Facturation</div>
    <p class="muted" style="margin:-8px 0 14px; max-width:860px; font-size:.84rem;">Abonnements des agences et achats ponctuels, tels qu’enregistrés par les notifications de Stripe. Montants hors TVA. Les remboursements, avoirs et changements de moyen de paiement se font dans le tableau de bord Stripe.</p>
    <div class="toolbar"><button class="btn" onclick="loadBilling()">Actualiser</button></div>
    <div id="billing-root">Chargement…</div>`);
  loadBilling();
}

async function loadBilling() {
  const root = document.getElementById('billing-root');
  if (!root) return;
  const sb = window.ZFindServices.supabaseClient.getSupabaseClient();
  const res = await Promise.resolve(sb.rpc('zfind_admin_billing_overview')).catch(e => ({ error: e }));
  if (!res || res.error) {
    root.innerHTML = `<p>${/Could not find|does not exist|schema cache/.test((res && res.error && res.error.message) || '') ? 'Migrations 20261029140000 et 20261029200000 non appliquées.' : 'Chargement impossible.'}</p>`;
    return;
  }
  billingCache = res.data || {};
  renderBillingData();
}

function renderBillingData() {
  const root = document.getElementById('billing-root');
  const d = billingCache;
  if (!root || !d) return;
  const t = d.totals || {};
  const subs = d.subscriptions || [];
  const without = d.without_subscription || [];
  const orders = d.orders || [];
  const highlights = orders.filter(o => /^highlight|^agency_featured/.test(o.kind));
  const leads = orders.filter(o => /^seller_lead/.test(o.kind));
  const ordersTable = (list, empty) => list.length ? `<table><thead><tr><th>Date</th><th>Agence</th><th>Achat</th><th>Montant HT</th><th>Statut</th><th>Détail</th></tr></thead><tbody>${list.map(o => `<tr>
      <td class="nowrap">${escapeHtml(billDate(o.created_at))}</td><td>${escapeHtml(o.partner_name || '—')}</td>
      <td>${escapeHtml(BILL_ORDER_KIND[o.kind] || o.kind)}${o.quantity > 1 ? ` × ${fmtN(o.quantity)}` : ''}</td>
      <td class="nowrap">${escapeHtml(billEuro(o.amount_ht_cents))}</td><td>${billTag(BILL_ORDER_STATUS, o.status)}${o.paid_at ? `<br><span class="muted">payée le ${escapeHtml(billDate(o.paid_at))}</span>` : ''}</td>
      <td class="muted" style="font-size:.78rem">${escapeHtml(Object.entries(o.details || {}).filter(([, v]) => v != null && typeof v !== 'object').map(([k, v]) => `${k} : ${v}`).join(' · '))}</td></tr>`).join('')}</tbody></table>` : `<p class="muted">${empty}</p>`;
  root.innerHTML = `
    <div class="cards">
      <div class="card"><div class="n">${escapeHtml(billEuroInt(t.mrr_ht))}</div><div class="l">Revenu mensuel HT (abonnements payants)</div></div>
      <div class="card"><div class="n">${escapeHtml(billEuroInt(t.trialing_mrr_ht))}</div><div class="l">Revenu mensuel HT à venir (mois offerts)</div></div>
      <div class="card"><div class="n">${fmtN(t.active || 0)} / ${fmtN(t.trialing || 0)}</div><div class="l">Abonnements actifs / en mois offerts</div></div>
      <div class="card${t.past_due ? ' card-warn' : ''}"><div class="n">${fmtN(t.past_due || 0)}</div><div class="l">Paiements en retard</div></div>
      <div class="card${without.length ? ' card-warn' : ''}"><div class="n">${fmtN(without.length)}</div><div class="l">Agences actives sans moyen de paiement</div></div>
      <div class="card"><div class="n">${escapeHtml(billEuro(t.orders_paid_month_ht_cents))}</div><div class="l">Achats payés ce mois-ci (HT)</div></div>
    </div>

    <h3 class="section-title">Abonnements (${fmtN(subs.length)})</h3>
    ${subs.length ? `<table><thead><tr><th>Agence</th><th>Statut</th><th>Palier</th><th>Annonces</th><th>Échéance</th><th>Paiement</th><th>Facturation</th><th></th></tr></thead><tbody>${subs.map(s => `<tr>
      <td><strong>${escapeHtml(s.partner_name || '—')}</strong>${s.legal_name && s.legal_name !== s.partner_name ? `<br><span class="muted">${escapeHtml(s.legal_name)}</span>` : ''}</td>
      <td>${billTag(BILL_SUB_STATUS, s.status)}${s.cancel_at_period_end ? '<br><span class="muted">résiliation demandée</span>' : ''}</td>
      <td class="nowrap">${escapeHtml(BILL_TIER[s.tier] || '—')}${s.price_ht ? `<br><span class="muted">${escapeHtml(billEuroInt(s.price_ht))} HT / mois</span>` : ''}</td>
      <td>${s.active_listings == null ? '—' : fmtN(s.active_listings)}</td>
      <td class="nowrap">${s.status === 'trialing' ? `1er prélèvement<br>${escapeHtml(billDate(s.trial_end))}` : escapeHtml(billDate(s.current_period_end))}</td>
      <td>${escapeHtml(BILL_PM[s.payment_method_type] || s.payment_method_type || '—')}</td>
      <td class="muted" style="font-size:.78rem">${escapeHtml(s.billing_email || '')}${s.country ? `<br>${escapeHtml(s.country)}` : ''}${s.vat_number ? ` · ${escapeHtml(s.vat_number)}` : ''}${s.vat_regime === 'reverse_charge' ? '<br>autoliquidation' : ''}</td>
      <td class="nowrap">${billStripe('subscriptions', s.stripe_subscription_id, s.livemode)}<br>${billStripe('customers', s.stripe_customer_id, s.livemode)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun abonnement enregistré pour le moment.</p>'}

    <h3 class="section-title">Agences actives sans moyen de paiement (${fmtN(without.length)})</h3>
    ${without.length ? `<table><thead><tr><th>Agence</th><th>Inscrite le</th><th>Annonces publiées</th></tr></thead><tbody>${without.map(p => `<tr>
      <td><a onclick="navigateAdmin('partners','${escapeHtml(p.partner_id)}')" style="cursor:pointer">${escapeHtml(p.partner_name)}</a></td><td>${escapeHtml(billDate(p.created_at))}</td><td>${fmtN(p.published || 0)}</td></tr>`).join('')}</tbody></table>
      <p class="muted" style="font-size:.8rem">Elles doivent enregistrer leur carte ou leur IBAN dans l’espace Partner (« Abonnement ») avant la fin des mois offerts.</p>` : '<p class="muted">Toutes les agences actives ont un moyen de paiement.</p>'}

    <h3 class="section-title">Mises en avant et agence à la une (${fmtN(highlights.length)})</h3>
    ${ordersTable(highlights, 'Aucune mise en avant achetée pour le moment.')}

    <h3 class="section-title">Contacts vendeurs vendus (${fmtN(leads.length)})</h3>
    ${ordersTable(leads, 'Aucun contact vendeur vendu pour le moment.')}`;
}
