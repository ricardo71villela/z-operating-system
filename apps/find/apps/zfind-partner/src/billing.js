/* ============================================================
   Z FIND PARTNER — « Abonnement »
   ============================================================
   Ce que l'agence paiera et comment : palier selon les annonces
   publiées, mois offerts, moyen de paiement (carte ou prélèvement SEPA,
   saisi sur la page Stripe — jamais ici), factures dans le portail
   Stripe. Serveur : zfind.online/api/billing/* (jeton de session).
   ============================================================ */

const pbill = { data: null, loading: false, busy: false };
const PBILL_API = 'https://zfind.online/api/billing/';
const PBILL_COUNTRIES = { FR: 'France', BE: 'Belgique', LU: 'Luxembourg' };
const PBILL_PM = { card: 'carte bancaire', sepa_debit: 'prélèvement SEPA' };

async function pbillToken() {
  const r = await window.ZFindServices.auth.getSession();
  return r && r.data && r.data.session ? r.data.session.access_token : null;
}
async function pbillCall(route, method, body) {
  const token = await pbillToken();
  if (!token) return { ok: false, error: 'unauthorized' };
  try {
    const res = await fetch(PBILL_API + route, {
      method, headers: Object.assign({ Authorization: 'Bearer ' + token }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => ({}));
    return Object.assign({ httpStatus: res.status }, json);
  } catch (_) {
    return { ok: false, error: 'network' };
  }
}
function pbillDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const t = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(d);
  return t.replace(/^1 /, '1er ');
}
function pbillEuro(v) { return new Intl.NumberFormat('fr-FR').format(v) + ' € HT'; }

async function showBillingView() {
  partnerShowView('view-billing');
  const host = document.getElementById('pbill-root');
  const back = /retour=(ok|annule)/.exec(window.location.hash || '');
  if (back) history.replaceState(null, '', window.location.pathname + window.location.search + '#abonnement');
  if (host) host.innerHTML = '<div class="pimp-card"><p class="pimp-muted">Chargement…</p></div>';
  const data = await pbillCall('status', 'GET');
  if (!data.ok) { if (host) host.innerHTML = '<div class="pimp-card"><p class="pimp-bad">Impossible de lire votre abonnement. Réessayez dans un instant.</p></div>'; return; }
  pbill.data = data;
  renderPartnerBilling(back ? back[1] : null);
}

function pbillStatusHtml(d) {
  const s = d.subscription;
  const free = d.freeMonthsEnd ? pbillDate(d.freeMonthsEnd) : null;
  if (!s) {
    return free
      ? `<div class="pimp-note warn"><p><strong>Mois offerts jusqu’au ${free}.</strong> Aucun prélèvement avant cette date. Enregistrez votre moyen de paiement avant le ${free} pour continuer à publier ensuite.</p></div>`
      : '<div class="pimp-note warn"><p><strong>Les mois offerts sont terminés.</strong> Enregistrez votre moyen de paiement pour continuer à publier.</p></div>';
  }
  const pm = s.paymentMethodType ? PBILL_PM[s.paymentMethodType] || s.paymentMethodType : null;
  if (s.status === 'trialing') return `<div class="pimp-note"><p><span class="status-badge tone-ok">Moyen de paiement enregistré</span> ${pm ? `(${escapeHtmlPartner(pm)}) ` : ''}— premier prélèvement le ${escapeHtmlPartner(pbillDate(s.trialEnd))}${s.cancelAtPeriodEnd ? ' ; résiliation demandée : l’abonnement s’arrêtera à cette date' : ''}.</p></div>`;
  if (s.status === 'active') return `<div class="pimp-note"><p><span class="status-badge tone-ok">Abonnement actif</span> ${pm ? `(${escapeHtmlPartner(pm)}) ` : ''}— ${s.cancelAtPeriodEnd ? 'résiliation demandée, fin le' : 'prochaine facture le'} ${escapeHtmlPartner(pbillDate(s.currentPeriodEnd))}.</p></div>`;
  if (s.status === 'past_due' || s.status === 'unpaid') return '<div class="pimp-note warn"><p><span class="status-badge tone-bad">Paiement en échec</span> Mettez à jour votre moyen de paiement dans « Factures et moyen de paiement ».</p></div>';
  if (s.status === 'canceled') return '<div class="pimp-note warn"><p><span class="status-badge tone-off">Abonnement résilié</span> Vous pouvez vous réabonner ci-dessous.</p></div>';
  return `<div class="pimp-note"><p><span class="status-badge tone-wait">${escapeHtmlPartner(s.status)}</span></p></div>`;
}

function renderPartnerBilling(back) {
  const host = document.getElementById('pbill-root');
  const d = pbill.data;
  if (!host || !d) return;
  const s = d.subscription;
  const canSubscribe = !s || s.status === 'canceled' || s.status === 'incomplete_expired';
  const a = d.account || {};
  const prices = (window.ZFindServices.proOffer && window.ZFindServices.proOffer.PRICES) || {};
  const tierLines = window.ZFindServices.proOffer ? window.ZFindServices.proOffer.tierLinesFr(prices) : [];
  host.innerHTML = `
    ${back === 'ok' ? '<div class="pimp-note"><p><strong>Merci.</strong> Votre moyen de paiement est enregistré ; la confirmation peut prendre quelques instants.</p></div>' : ''}
    ${back === 'annule' ? '<div class="pimp-note"><p>Enregistrement interrompu : rien n’a été enregistré.</p></div>' : ''}
    ${d.testMode ? '<div class="pimp-note warn"><p><strong>Mode test</strong> : aucun paiement réel n’est effectué.</p></div>' : ''}
    <div class="pimp-card">
      <div class="pimp-step"><span class="pimp-num">€</span><div>
        <h3>Votre palier : ${escapeHtmlPartner(d.tierName)} — ${pbillEuro(d.priceHt)} / mois</h3>
        <p class="pimp-sub">${d.activeListings} annonce${d.activeListings > 1 ? 's' : ''} publiée${d.activeListings > 1 ? 's' : ''} aujourd’hui. Le palier est recalculé avant chaque facture selon vos annonces publiées, sans engagement de durée. Z Desk et l’application Z Studio sont inclus.</p>
      </div></div>
      ${pbillStatusHtml(d)}
      <ul class="pbill-tiers">${tierLines.map(([k, v]) => `<li><span>${escapeHtmlPartner(k)}</span><b>${escapeHtmlPartner(v)}</b></li>`).join('')}</ul>
      <p class="pimp-muted">${d.vatMode === 'franchise' ? 'TVA non applicable, art. 293 B du CGI.' : 'Prix hors TVA. France : TVA 20 % ajoutée. Belgique et Luxembourg : autoliquidation avec votre numéro de TVA intracommunautaire.'}</p>
    </div>
    ${!d.paymentsReady ? '<div class="pimp-card"><p class="pimp-sub">Le paiement en ligne ouvre bientôt : vous pourrez enregistrer votre carte ou votre IBAN ici, avant la fin des mois offerts.</p></div>' : canSubscribe ? `
    <div class="pimp-card" id="pbill-form">
      <div class="pimp-step"><span class="pimp-num">1</span><div>
        <h3>Informations de facturation</h3>
        <p class="pimp-sub">Vous saisirez ensuite votre carte ou votre IBAN sur la page sécurisée de notre prestataire de paiement, Stripe : Z Find ne voit jamais ces données.</p>
      </div></div>
      <div class="pfeed-grid">
        <label class="pfeed-field"><span>Raison sociale</span><input type="text" id="pbill-name" value="${escapeHtmlPartner(a.legalName || '')}" autocomplete="organization"></label>
        <label class="pfeed-field"><span>E-mail de facturation</span><input type="email" id="pbill-email" value="${escapeHtmlPartner(a.billingEmail || '')}" autocomplete="email"></label>
        <label class="pfeed-field"><span>Pays</span><select id="pbill-country" onchange="pbillCountryChange()">${Object.keys(PBILL_COUNTRIES).map(c => `<option value="${c}"${(a.country || 'FR') === c ? ' selected' : ''}>${PBILL_COUNTRIES[c]}</option>`).join('')}</select></label>
        <label class="pfeed-field"><span id="pbill-vat-label">N° de TVA intracommunautaire${(a.country || 'FR') === 'FR' ? ' (facultatif)' : ''}</span><input type="text" id="pbill-vat" value="${escapeHtmlPartner(a.vatNumber || '')}" placeholder="${(a.country || 'FR') === 'BE' ? 'BE0123456789' : (a.country || 'FR') === 'LU' ? 'LU12345678' : 'FR12345678901'}" autocomplete="off"></label>
      </div>
      <p class="pimp-error" id="pbill-error"></p>
      <div class="pimp-actions"><button class="btn btn-primary" id="pbill-subscribe" onclick="partnerBillingSubscribe()">Enregistrer mon moyen de paiement</button></div>
    </div>` : ''}
    ${d.paymentsReady && a.vatRegime ? `<div class="pimp-card"><div class="pimp-actions" style="margin-top:0;"><button class="btn" id="pbill-portal" onclick="partnerBillingPortal()">Factures et moyen de paiement</button><span class="pimp-muted">Changer de carte ou d’IBAN, télécharger vos factures, résilier.</span></div></div>` : ''}`;
}

function pbillCountryChange() {
  const c = document.getElementById('pbill-country').value;
  const label = document.getElementById('pbill-vat-label');
  const input = document.getElementById('pbill-vat');
  if (label) label.textContent = 'N° de TVA intracommunautaire' + (c === 'FR' ? ' (facultatif)' : '');
  if (input) input.placeholder = c === 'BE' ? 'BE0123456789' : c === 'LU' ? 'LU12345678' : 'FR12345678901';
}

const PBILL_FIELD_ERRORS = {
  legalName: 'Indiquez la raison sociale.',
  billingEmail: 'Indiquez une adresse e-mail de facturation valide.',
  vatNumber: { required: 'Le numéro de TVA intracommunautaire est obligatoire pour une agence belge ou luxembourgeoise.', invalid: 'Ce numéro de TVA ne correspond pas au format du pays choisi.' }
};

async function partnerBillingSubscribe() {
  if (pbill.busy) return;
  const err = document.getElementById('pbill-error');
  const btn = document.getElementById('pbill-subscribe');
  pbill.busy = true; if (btn) btn.disabled = true; if (err) err.textContent = '';
  const r = await pbillCall('subscription-checkout', 'POST', {
    legalName: document.getElementById('pbill-name').value.trim(),
    billingEmail: document.getElementById('pbill-email').value.trim(),
    country: document.getElementById('pbill-country').value,
    vatNumber: document.getElementById('pbill-vat').value.trim()
  });
  pbill.busy = false; if (btn) btn.disabled = false;
  if (r.ok && r.url) { window.location.href = r.url; return; }
  if (r.error === 'validation' && r.fields) {
    const k = Object.keys(r.fields)[0];
    const m = PBILL_FIELD_ERRORS[k];
    if (err) err.textContent = typeof m === 'string' ? m : (m && m[r.fields[k]]) || 'Vérifiez les champs.';
    return;
  }
  if (r.error === 'already_subscribed') { showBillingView(); return; }
  if (err) err.textContent = r.error === 'network' ? 'Connexion impossible. Vérifiez votre réseau et réessayez.' : 'L’enregistrement n’a pas pu démarrer. Réessayez dans un instant ou écrivez à hello@zfind.online.';
}

async function partnerBillingPortal() {
  const btn = document.getElementById('pbill-portal');
  if (btn) btn.disabled = true;
  const r = await pbillCall('portal', 'POST', {});
  if (btn) btn.disabled = false;
  if (r.ok && r.url) { window.location.href = r.url; return; }
  showStatus('error', 'Le portail n’a pas pu s’ouvrir. Réessayez dans un instant.');
}
