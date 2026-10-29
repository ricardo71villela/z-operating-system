/* ============================================================
   Z FIND PARTNER — « Mises en avant »
   ============================================================
   Mettre une annonce « À la une » (7 ou 30 jours, crédit inclus Pro /
   Premium, crédit d'un pack de 5) et « Agence à la une » (une commune,
   un mois). 6 emplacements par commune, 1 agence par commune et par
   mois : quand c'est complet, la première date libre est proposée.
   Lecture et crédits : RPC zfind_partner_* (migration 20261029220000).
   Paiement : zfind.online/api/billing/*-checkout (Stripe Checkout).
   ============================================================ */

const phl = { data: null, quote: null, agencyQuote: null, notice: null };
const PHL_STATE = { live: 'En cours', upcoming: 'À venir', payment: 'Paiement en cours', ended: 'Terminée' };
const PHL_SOURCE = { order: 'Achat', pack: 'Crédit pack', included: 'Incluse dans l’abonnement' };
const PHL_ERRORS = {
  full: 'Complet sur cette période.',
  partner_not_active: 'Les mises en avant s’ouvrent dès que votre agence est validée.',
  billing_details: 'Complétez d’abord vos informations de facturation dans « Abonnement » (raison sociale, e-mail, n° de TVA pour la Belgique et le Luxembourg).',
  not_configured: 'Le paiement en ligne n’est pas encore ouvert. Écrivez-nous à hello@zfind.online.',
  not_published: 'Cette annonce n’est pas publiée : seules les annonces en ligne peuvent être mises en avant.',
  no_commune: 'La commune de cette annonce est inconnue : complétez sa localisation.',
  no_credit: 'Plus de crédit disponible.',
  start: 'Choisissez une date de début entre aujourd’hui et dans un an.',
  already_yours: 'Votre agence est déjà à la une de cette commune ce mois-là.',
  highlight_start: 'Choisissez une date de début entre aujourd’hui et dans un an.',
  highlight_not_published: 'Cette annonce n’est pas publiée.',
  highlight_no_commune: 'La commune de cette annonce est inconnue.',
  unauthorized: 'Votre session a expiré : reconnectez-vous.',
  network: 'Connexion impossible. Vérifiez votre réseau et réessayez.'
};

function phlEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function phlPrices() { return (window.ZFindServices.proOffer && window.ZFindServices.proOffer.PRICES) || {}; }
function phlDate(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d).replace(/^1 /, '1er ');
}
function phlMonth(iso) {
  const d = new Date(String(iso).slice(0, 7) + '-15T12:00:00Z');
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}
/** Dernier jour affiché (la fin stockée est exclue). */
function phlLastDay(iso) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function phlAddDays(iso, n) { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function phlErr(code) { return PHL_ERRORS[code] || 'L’opération n’a pas pu aboutir. Réessayez dans un instant ; si cela persiste, écrivez-nous à hello@zfind.online.'; }
function phlSb() { return window.ZFindServices.supabaseClient.getSupabaseClient(); }
async function phlRpc(name, args) {
  const res = await Promise.resolve(phlSb().rpc(name, args || {})).catch(e => ({ error: e }));
  return res || { error: { message: 'network' } };
}

async function showHighlightsView() {
  partnerShowView('view-highlights');
  const m = /retour=(ok|annule)/.exec(window.location.hash || '');
  if (m) {
    phl.notice = m[1] === 'ok'
      ? { ok: true, text: 'Paiement reçu. Votre mise en avant est confirmée et apparaît à la date choisie. Par prélèvement SEPA, la confirmation arrive à réception du paiement (quelques jours) : l’emplacement reste réservé en attendant.' }
      : { ok: false, text: 'Paiement abandonné : rien n’a été débité et l’emplacement a été libéré.' };
    history.replaceState(null, '', window.location.pathname + '#mises-en-avant');
  }
  await loadPartnerHighlights();
}

async function loadPartnerHighlights() {
  const host = document.getElementById('phl-root');
  if (host && !phl.data) host.innerHTML = '<div class="pimp-card"><p class="pimp-muted">Chargement…</p></div>';
  const res = await phlRpc('zfind_partner_highlights_overview');
  if (res.error || !res.data) {
    if (host) host.innerHTML = '<div class="pimp-card"><p class="pimp-bad">Impossible de lire vos mises en avant. Réessayez dans un instant.</p></div>';
    return;
  }
  phl.data = res.data;
  renderPartnerHighlights();
}

function phlCredits(c) {
  const incl = Math.max(0, (+c.included_per_month || 0) - (+c.included_used || 0));
  const pack = Math.max(0, (+c.pack_total || 0) - (+c.pack_used || 0));
  return { incl, pack, inclTotal: +c.included_per_month || 0 };
}

function renderPartnerHighlights() {
  const host = document.getElementById('phl-root');
  const d = phl.data;
  if (!host || !d) return;
  const P = phlPrices();
  const credits = phlCredits(d.credits || {});
  const active = d.partner_status === 'active';
  const listings = (d.listings || []).filter(l => l.has_scope);
  const noScope = (d.listings || []).length - listings.length;
  const communes = d.communes || [];
  const today = d.today;
  const months = Array.from({ length: 12 }, (_, i) => { const x = new Date(String(today).slice(0, 7) + '-15T12:00:00Z'); x.setUTCMonth(x.getUTCMonth() + i); return x.toISOString().slice(0, 7); });
  const q = phl.quote;
  const aq = phl.agencyQuote;

  host.innerHTML = `
    ${phl.notice ? `<div class="pimp-card phl-notice ${phl.notice.ok ? 'ok' : ''}">${phlEsc(phl.notice.text)}</div>` : ''}
    ${active ? '' : `<div class="pimp-card phl-notice">${phlEsc(PHL_ERRORS.partner_not_active)}</div>`}
    <div class="pimp-counts">
      <div class="pimp-count ${credits.incl ? 'good' : ''}"><strong>${credits.incl}</strong><span>${credits.inclTotal ? `crédit${credits.incl > 1 ? 's' : ''} inclus restant${credits.incl > 1 ? 's' : ''} ce mois-ci (sur ${credits.inclTotal})` : 'crédit inclus (formules Pro et Premium)'}</span></div>
      <div class="pimp-count ${credits.pack ? 'good' : ''}"><strong>${credits.pack}</strong><span>crédit${credits.pack > 1 ? 's' : ''} de pack restant${credits.pack > 1 ? 's' : ''}</span></div>
      <div class="pimp-count info"><strong>${(d.highlights || []).filter(h => h.state === 'live').length}</strong><span>annonce${(d.highlights || []).filter(h => h.state === 'live').length > 1 ? 's' : ''} à la une aujourd’hui</span></div>
    </div>

    <div class="pimp-card">
      <h3 class="pstats-h">Mettre une annonce à la une</h3>
      <p class="pimp-sub">Votre annonce apparaît dans les emplacements « À la une » de sa commune, de la page du pays et à côté des résultats de recherche, toujours signalée et jamais mélangée aux résultats. ${d.capacity || 6} emplacements par commune : si c’est complet, nous vous proposons la première date libre.</p>
      ${listings.length ? `
      <div class="phl-form">
        <div class="form-field"><label for="phl-listing">Annonce</label><select id="phl-listing">${listings.map(l => `<option value="${phlEsc(l.listing_id)}">${phlEsc(l.title)} — ${phlEsc(l.commune || '')}</option>`).join('')}</select></div>
        <div class="form-field"><label for="phl-product">Formule</label><select id="phl-product">
          <option value="7d">7 jours — ${P.highlight7Days} € HT</option>
          <option value="30d">30 jours — ${P.highlight30Days} € HT</option>
          ${credits.incl ? '<option value="included">30 jours — crédit inclus dans votre abonnement</option>' : ''}
          ${credits.pack ? '<option value="pack">30 jours — crédit de votre pack</option>' : ''}
        </select></div>
        <div class="form-field"><label for="phl-start">À partir du</label><input type="date" id="phl-start" min="${phlEsc(today)}" max="${phlEsc(phlAddDays(today, 365))}" value="${phlEsc((q && q.start) || today)}"></div>
        <div class="phl-go"><button type="button" class="btn" id="phl-check" ${active ? '' : 'disabled'}>Vérifier la disponibilité</button></div>
      </div>
      <div id="phl-quote">${q ? phlQuoteHTML(q) : ''}</div>` : `<p class="pimp-muted">Aucune annonce publiée${noScope ? ' avec une commune connue' : ''} pour l’instant : les mises en avant concernent les annonces en ligne.</p>`}
      ${noScope ? `<p class="pimp-muted">${noScope} annonce${noScope > 1 ? 's' : ''} sans commune connue ne peu${noScope > 1 ? 'vent' : 't'} pas être mise${noScope > 1 ? 's' : ''} en avant : complétez sa localisation.</p>` : ''}
      <div class="phl-pack">
        <div><strong>Pack de ${P.highlightPackSize} mises en avant de 30 jours — ${P.highlightPack} € HT</strong><br><span class="pimp-muted">Soit ${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(P.highlightPack / P.highlightPackSize)} € HT la mise en avant au lieu de ${P.highlight30Days} €. Les crédits n’expirent pas.</span></div>
        <button type="button" class="btn" id="phl-buy-pack" ${active ? '' : 'disabled'}>Acheter le pack</button>
      </div>
      <div class="pimp-bad" id="phl-error" role="alert"></div>
    </div>

    <div class="pimp-card">
      <h3 class="pstats-h">Agence à la une — ${P.agencyFeaturedMonth} € HT / commune / mois</h3>
      <p class="pimp-sub">Votre agence présentée « À la une » en tête des pages « Immobilier à {commune} » et « Agences immobilières à {commune} », avec un lien vers votre page agence. Une seule agence par commune et par mois.</p>
      ${communes.length ? `
      <div class="phl-form">
        <div class="form-field"><label for="phl-commune">Commune</label><select id="phl-commune">${communes.map(c => `<option value="${phlEsc(c.commune_code)}">${phlEsc(c.name)} (${phlEsc(c.commune_code)})</option>`).join('')}</select></div>
        <div class="form-field"><label for="phl-month">Mois</label><select id="phl-month">${months.map(m => `<option value="${m}" ${aq && aq.month === m ? 'selected' : ''}>${phlEsc(phlMonth(m))}</option>`).join('')}</select></div>
        <div class="phl-go"><button type="button" class="btn" id="phl-agency-check" ${active ? '' : 'disabled'}>Vérifier la disponibilité</button></div>
      </div>
      <div id="phl-agency-quote">${aq ? phlAgencyQuoteHTML(aq) : ''}</div>` : '<p class="pimp-muted">Disponible pour les communes françaises où vous avez des annonces.</p>'}
      <div class="pimp-bad" id="phl-agency-error" role="alert"></div>
    </div>

    <div class="pimp-card">
      <h3 class="pstats-h">Vos mises en avant</h3>
      ${(d.highlights || []).length ? `<div class="phl-table-wrap"><table class="pstats-table"><thead><tr><th>Annonce</th><th>Commune</th><th>Période</th><th>Formule</th><th>État</th><th></th></tr></thead><tbody>
        ${d.highlights.map(h => `<tr><td>${phlEsc(h.title)}</td><td>${phlEsc(h.commune || '')}</td><td>du ${phlDate(h.starts_on)} au ${phlDate(phlLastDay(h.ends_on))}</td><td>${phlEsc(PHL_SOURCE[h.source] || h.source)}</td><td><span class="phl-state ${phlEsc(h.state)}">${phlEsc(PHL_STATE[h.state] || h.state)}</span></td><td>${h.can_cancel ? `<button type="button" class="btn phl-cancel" data-id="${phlEsc(h.id)}">Annuler</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="pimp-muted">Aucune mise en avant pour l’instant.</p>'}
      ${(d.agency_features || []).length ? `<h4>Agence à la une</h4><ul class="phl-list">${d.agency_features.map(f => `<li>${phlEsc(phlMonth(f.month))} — ${phlEsc(((communes.find(c => c.commune_code === f.commune_code) || {}).name) || 'commune')} (${phlEsc(f.commune_code)}) <span class="phl-state ${phlEsc(f.state)}">${phlEsc(PHL_STATE[f.state] || f.state)}</span></li>`).join('')}</ul>` : ''}
    </div>`;

  const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  bind('phl-check', phlCheck);
  bind('phl-buy-pack', () => phlPay('highlight-pack-checkout', {}, 'phl-error', 'phl-buy-pack'));
  bind('phl-agency-check', phlAgencyCheck);
  host.querySelectorAll('.phl-cancel').forEach(b => b.addEventListener('click', () => phlCancel(b.dataset.id)));
  phlBindQuoteButtons();
  if (q) { const sel = document.getElementById('phl-listing'); if (sel) sel.value = q.listingId; const pr = document.getElementById('phl-product'); if (pr && [...pr.options].some(o => o.value === q.product)) pr.value = q.product; }
  if (aq) { const c = document.getElementById('phl-commune'); if (c) c.value = aq.commune; }
}

function phlQuoteHTML(q) {
  const P = phlPrices();
  if (q.ok) {
    const credit = q.product === 'included' || q.product === 'pack';
    const price = q.product === '7d' ? P.highlight7Days : P.highlight30Days;
    return `<div class="phl-answer ok"><span>Disponible à ${phlEsc(q.commune || 'cette commune')}, du <strong>${phlDate(q.starts_on)}</strong> au <strong>${phlDate(phlLastDay(q.ends_on))}</strong>.</span>
      <button type="button" class="btn btn-primary" id="phl-confirm">${credit ? 'Utiliser mon crédit' : `Payer ${price} € HT`}</button></div>`;
  }
  if (q.error === 'full') {
    return `<div class="phl-answer full"><span><strong>Complet${q.commune ? ' à ' + phlEsc(q.commune) : ''}</strong> : les emplacements sont pris sur cette période.${q.next_start ? ` Première date libre : du <strong>${phlDate(q.next_start)}</strong> au <strong>${phlDate(phlLastDay(q.next_end))}</strong>.` : ' Aucune date libre dans l’année.'}</span>
      ${q.next_start ? `<button type="button" class="btn" id="phl-use-next" data-start="${phlEsc(q.next_start)}">Choisir cette date</button>` : ''}</div>`;
  }
  return `<div class="phl-answer full"><span>${phlEsc(phlErr(q.error))}</span></div>`;
}

function phlAgencyQuoteHTML(aq) {
  const P = phlPrices();
  if (aq.ok) return `<div class="phl-answer ok"><span>Disponible en <strong>${phlEsc(phlMonth(aq.month))}</strong>.</span><button type="button" class="btn btn-primary" id="phl-agency-confirm">Payer ${P.agencyFeaturedMonth} € HT</button></div>`;
  if (aq.error === 'full') {
    return `<div class="phl-answer full"><span><strong>Déjà prise en ${phlEsc(phlMonth(aq.month))}.</strong>${aq.next_month ? ` Prochain mois libre : <strong>${phlEsc(phlMonth(aq.next_month))}</strong>.` : ''}</span>
      ${aq.next_month ? `<button type="button" class="btn" id="phl-agency-next" data-month="${phlEsc(String(aq.next_month).slice(0, 7))}">Choisir ce mois</button>` : ''}</div>`;
  }
  return `<div class="phl-answer full"><span>${phlEsc(phlErr(aq.error))}</span></div>`;
}

function phlBindQuoteButtons() {
  const c = document.getElementById('phl-confirm');
  if (c) c.addEventListener('click', phlConfirm);
  const n = document.getElementById('phl-use-next');
  if (n) n.addEventListener('click', () => { document.getElementById('phl-start').value = n.dataset.start; phlCheck(); });
  const ac = document.getElementById('phl-agency-confirm');
  if (ac) ac.addEventListener('click', phlAgencyConfirm);
  const an = document.getElementById('phl-agency-next');
  if (an) an.addEventListener('click', () => { document.getElementById('phl-month').value = an.dataset.month; phlAgencyCheck(); });
}

async function phlCheck() {
  const listingId = document.getElementById('phl-listing').value;
  const product = document.getElementById('phl-product').value;
  const start = document.getElementById('phl-start').value;
  const err = document.getElementById('phl-error');
  err.textContent = '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) { err.textContent = PHL_ERRORS.start; return; }
  const days = product === '7d' ? 7 : 30;
  const res = await phlRpc('zfind_partner_highlight_quote', { p_listing: listingId, p_days: days, p_start: start });
  if (res.error || !res.data) { err.textContent = phlErr('network'); return; }
  phl.quote = Object.assign({ listingId, product, start }, res.data);
  document.getElementById('phl-quote').innerHTML = phlQuoteHTML(phl.quote);
  phlBindQuoteButtons();
}

async function phlConfirm() {
  const q = phl.quote;
  if (!q || !q.ok) return;
  const err = document.getElementById('phl-error');
  const btn = document.getElementById('phl-confirm');
  err.textContent = '';
  if (q.product === 'included' || q.product === 'pack') {
    btn.disabled = true;
    const res = await phlRpc('zfind_partner_use_highlight_credit', { p_listing: q.listingId, p_start: q.starts_on, p_source: q.product });
    btn.disabled = false;
    const r = res.data;
    if (res.error || !r) { err.textContent = phlErr('network'); return; }
    if (!r.ok) {
      if (r.error === 'full') { phl.quote = Object.assign({}, q, r, { ok: false }); document.getElementById('phl-quote').innerHTML = phlQuoteHTML(phl.quote); phlBindQuoteButtons(); return; }
      err.textContent = phlErr(r.error); return;
    }
    phl.quote = null;
    phl.notice = { ok: true, text: `C’est fait : « ${r.title || 'votre annonce'} » sera à la une du ${phlDate(r.starts_on)} au ${phlDate(phlLastDay(r.ends_on))}.` };
    await loadPartnerHighlights();
    return;
  }
  await phlPay('highlight-checkout', { listingId: q.listingId, product: q.product, start: q.starts_on }, 'phl-error', 'phl-confirm', r => {
    phl.quote = Object.assign({}, q, { ok: false, error: 'full', next_start: r.nextStart, next_end: r.nextEnd });
    document.getElementById('phl-quote').innerHTML = phlQuoteHTML(phl.quote);
    phlBindQuoteButtons();
  });
}

async function phlAgencyCheck() {
  const sel = document.getElementById('phl-commune');
  const commune = sel.value;
  const month = document.getElementById('phl-month').value;
  const err = document.getElementById('phl-agency-error');
  err.textContent = '';
  const res = await phlRpc('zfind_partner_agency_feature_quote', { p_commune: commune, p_month: month + '-01' });
  if (res.error || !res.data) { err.textContent = phlErr('network'); return; }
  const name = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent.replace(/\s*\([^)]*\)\s*$/, '') : '';
  phl.agencyQuote = Object.assign({ commune, communeName: name }, res.data, { month: res.data.month ? String(res.data.month).slice(0, 7) : month });
  document.getElementById('phl-agency-quote').innerHTML = phlAgencyQuoteHTML(phl.agencyQuote);
  phlBindQuoteButtons();
}

async function phlAgencyConfirm() {
  const aq = phl.agencyQuote;
  if (!aq || !aq.ok) return;
  await phlPay('agency-feature-checkout', { communeCode: aq.commune, month: aq.month, communeName: aq.communeName }, 'phl-agency-error', 'phl-agency-confirm', r => {
    phl.agencyQuote = Object.assign({}, aq, { ok: false, error: 'full', next_month: r.nextMonth });
    document.getElementById('phl-agency-quote').innerHTML = phlAgencyQuoteHTML(phl.agencyQuote);
    phlBindQuoteButtons();
  });
}

/** Stripe Checkout : la page de paiement s'ouvre dans l'onglet. */
async function phlPay(route, body, errId, btnId, onFull) {
  const err = document.getElementById(errId);
  const btn = document.getElementById(btnId);
  if (err) err.textContent = '';
  if (btn) btn.disabled = true;
  const r = await pbillCall(route, 'POST', body);
  if (r && r.ok && typeof r.url === 'string' && /^https:\/\//.test(r.url)) { window.location.assign(r.url); return; }
  if (btn) btn.disabled = false;
  if (r && r.error === 'full' && onFull) { onFull(r); return; }
  if (err) err.textContent = phlErr(r && r.error);
}

async function phlCancel(id) {
  const res = await phlRpc('zfind_partner_cancel_highlight', { p_id: id });
  const err = document.getElementById('phl-error');
  if (res.error) { if (err) err.textContent = 'Cette mise en avant ne peut plus être annulée.'; return; }
  phl.notice = { ok: true, text: 'Mise en avant annulée : votre crédit est de nouveau disponible.' };
  await loadPartnerHighlights();
}
