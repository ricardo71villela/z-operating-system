/* ============================================================
   Z FIND PARTNER — « Contacts vendeurs »
   ============================================================
   Propriétaires qui ont demandé une estimation sur Z Find dans une
   commune où l'agence a des annonces, et qui ont accepté d'être mis en
   relation avec UNE agence. Avant achat : description anonyme. Après
   paiement (prix de pro-offer.js) : le contact est à l'agence seule,
   ses coordonnées s'affichent ici et partent par e-mail.
   Lecture : RPC zfind_partner_seller_leads (migration 20261029230000).
   Paiement : zfind.online/api/billing/seller-lead-checkout.
   ============================================================ */

const psl = { data: null, notice: null };
const PSL_PROJECT = { sell_3m: 'Vendre d’ici 3 mois', sell_12m: 'Vendre dans l’année', later: 'Vendre plus tard' };
const PSL_TYPE = { apartment: 'Appartement', house: 'Maison', land: 'Terrain' };
const PSL_STATUS = { assigned: 'À contacter', contacted: 'Contacté', closed: 'Clos', new: 'Nouveau' };
const PSL_ERRORS = {
  taken: 'Ce contact vient d’être pris par une autre agence.',
  already_pending: 'Vous avez déjà un paiement en cours pour ce contact.',
  other_commune: 'Ce contact concerne une commune où vous n’avez pas d’annonce.',
  partner_not_active: 'Les contacts vendeurs s’ouvrent dès que votre agence est validée.',
  billing_details: 'Complétez d’abord vos informations de facturation dans « Abonnement ».',
  not_configured: 'Le paiement en ligne n’est pas encore ouvert. Écrivez-nous à hello@zfind.online.',
  unauthorized: 'Votre session a expiré : reconnectez-vous.',
  network: 'Connexion impossible. Vérifiez votre réseau et réessayez.'
};

function pslEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function pslEuro(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' €' : ''; }
function pslDate(iso) { return iso ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(new Date(iso)) : ''; }

async function showSellerLeadsView() {
  partnerShowView('view-seller-leads');
  const m = /retour=(ok|annule)/.exec(window.location.hash || '');
  if (m) {
    psl.notice = m[1] === 'ok'
      ? { ok: true, text: 'Paiement reçu : le contact est à vous seul. Ses coordonnées apparaissent ci-dessous et vous arrivent par e-mail ; appelez-le de préférence dans les 24 heures. Par prélèvement SEPA, elles arrivent à réception du paiement (quelques jours) et le contact reste réservé pour vous.' }
      : { ok: false, text: 'Paiement abandonné : rien n’a été débité et le contact est de nouveau disponible.' };
    history.replaceState(null, '', window.location.pathname + '#contacts-vendeurs');
  }
  const host = document.getElementById('psl-root');
  if (host && !psl.data) host.innerHTML = '<div class="pimp-card"><p class="pimp-muted">Chargement…</p></div>';
  const sb = window.ZFindServices.supabaseClient.getSupabaseClient();
  const res = await Promise.resolve(sb.rpc('zfind_partner_seller_leads')).catch(e => ({ error: e }));
  if (!res || res.error || !res.data) {
    if (host) host.innerHTML = '<div class="pimp-card"><p class="pimp-bad">Impossible de lire les contacts vendeurs. Réessayez dans un instant.</p></div>';
    return;
  }
  psl.data = res.data;
  renderSellerLeads();
}

function renderSellerLeads() {
  const host = document.getElementById('psl-root');
  const d = psl.data;
  if (!host || !d) return;
  const P = (window.ZFindServices.proOffer && window.ZFindServices.proOffer.PRICES) || {};
  const active = d.partner_status === 'active';
  const pending = new Set((d.pending || []).map(x => x.id));
  const available = d.available || [];
  const purchased = d.purchased || [];
  const communes = (d.communes || []).map(c => c.name).filter(Boolean);
  host.innerHTML = `
    ${psl.notice ? `<div class="pimp-card phl-notice ${psl.notice.ok ? 'ok' : ''}">${pslEsc(psl.notice.text)}</div>` : ''}
    ${active ? '' : `<div class="pimp-card phl-notice">${pslEsc(PSL_ERRORS.partner_not_active)}</div>`}
    <div class="pimp-card">
      <h3 class="pstats-h">Contacts disponibles</h3>
      <p class="pimp-sub">Des propriétaires de ${communes.length ? pslEsc(communes.slice(0, 6).join(', ')) + (communes.length > 6 ? '…' : '') : 'vos communes'} ont demandé une estimation sur Z Find et accepté d’être mis en relation avec <strong>une seule agence</strong> : la première qui achète le contact l’obtient en exclusivité. Contact ${P.sellerLead} € HT ; qualifié (téléphone et vente prévue dans les 6 mois) ${P.sellerLeadQualified} € HT.</p>
      ${available.length ? `<div class="phl-table-wrap"><table class="pstats-table psl-table"><thead><tr><th>Reçu le</th><th>Commune</th><th>Bien</th><th>Estimation Z Find</th><th>Projet</th><th></th></tr></thead><tbody>
        ${available.map(x => `<tr>
          <td>${pslEsc(pslDate(x.created_at))}</td>
          <td>${pslEsc(x.place || '')}</td>
          <td>${pslEsc([PSL_TYPE[x.type] || x.type, x.surface ? x.surface + ' m²' : null].filter(Boolean).join(', '))}</td>
          <td>${x.low && x.high ? `${pslEsc(pslEuro(x.low))} – ${pslEsc(pslEuro(x.high))}` : '—'}</td>
          <td>${pslEsc(PSL_PROJECT[x.project] || 'Non précisé')}${x.qualified ? '<br><span class="phl-state live">Qualifié</span>' : x.has_phone ? '' : '<br><span class="pimp-muted">sans téléphone</span>'}</td>
          <td>${pending.has(x.id) ? '<span class="phl-state payment">Paiement en cours</span>' : `<button type="button" class="btn btn-primary psl-buy" data-id="${pslEsc(x.id)}" ${active ? '' : 'disabled'}>Acheter ${x.qualified ? P.sellerLeadQualified : P.sellerLead} € HT</button>`}</td>
        </tr>`).join('')}
      </tbody></table></div>` : `<p class="pimp-muted">Aucun contact disponible pour l’instant dans vos communes. Ils apparaissent ici dès qu’un propriétaire accepte la mise en relation.</p>`}
      <div class="pimp-bad" id="psl-error" role="alert"></div>
    </div>
    <div class="pimp-card">
      <h3 class="pstats-h">Vos contacts</h3>
      ${purchased.length ? `<div class="phl-table-wrap"><table class="pstats-table psl-table"><thead><tr><th>Acheté le</th><th>Propriétaire</th><th>Bien</th><th>Estimation</th><th>Projet</th><th>Suivi</th></tr></thead><tbody>
        ${purchased.map(x => `<tr>
          <td>${pslEsc(pslDate(x.sold_at))}</td>
          <td><strong>${pslEsc(x.name || 'Propriétaire')}</strong><br><a href="mailto:${pslEsc(x.email)}">${pslEsc(x.email)}</a>${x.phone ? `<br><a href="tel:${pslEsc(String(x.phone).replace(/[^\d+]/g, ''))}">${pslEsc(x.phone)}</a>` : ''}</td>
          <td>${pslEsc(x.line || x.place || '')}</td>
          <td>${x.low && x.high ? `${pslEsc(pslEuro(x.low))} – ${pslEsc(pslEuro(x.high))}` : '—'}</td>
          <td>${pslEsc(PSL_PROJECT[x.project] || 'Non précisé')}</td>
          <td>${pslEsc(PSL_STATUS[x.status] || x.status)}</td>
        </tr>`).join('')}
      </tbody></table></div>` : '<p class="pimp-muted">Aucun contact acheté pour l’instant.</p>'}
      <p class="pimp-muted">L’estimation Z Find est statistique : seul votre avis de valeur après visite engage l’agence.</p>
    </div>`;
  host.querySelectorAll('.psl-buy').forEach(b => b.addEventListener('click', () => pslBuy(b.dataset.id, b)));
}

async function pslBuy(id, btn) {
  const err = document.getElementById('psl-error');
  if (err) err.textContent = '';
  if (btn) btn.disabled = true;
  const r = await pbillCall('seller-lead-checkout', 'POST', { requestId: id });
  if (r && r.ok && typeof r.url === 'string' && /^https:\/\//.test(r.url)) { window.location.assign(r.url); return; }
  if (btn) btn.disabled = false;
  if (err) err.textContent = PSL_ERRORS[r && r.error] || 'L’achat n’a pas pu aboutir. Réessayez dans un instant ; si cela persiste, écrivez-nous à hello@zfind.online.';
  if (r && r.error === 'taken') { psl.data = null; setTimeout(showSellerLeadsView, 1500); }
}
