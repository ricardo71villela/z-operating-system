/* ============================================================
   Z FIND PARTNER — « Soumettre à validation »
   ============================================================
   The agency hands a draft listing to Z Find (migration
   20261009180000: zfind_partner_submit_listing, draft -> « En attente
   de validation » only; Z Find then approves and publishes).
   - Listing workspace: status badge, checklist of what is still missing
     (instant client precheck, the same rules as the database —
     services/listing-submission.js), « Soumettre à validation »,
     « Retirer de la validation », last Z Find return reason.
   - Portfolio: status badge per listing and « Soumettre à validation »
     on drafts, with the missing items from the database.
   - After the mentions obligatoires are saved on a draft: offer to submit.
   ============================================================ */

const submissionState = {
  listing: null, kind: null, assetId: null,
  frTitle: '', frDescription: '',
  photoCount: null, compliance: null, complianceLoaded: false,
  notice: null, highlight: false, busy: false
};

function lsub() { return window.ZFindServices.listingSubmission; }

function submissionBadgeHtml(status) {
  const info = lsub().statusInfo(status);
  return `<span class="status-badge tone-${info.tone}">${escapeHtmlPartner(info.label)}</span>`;
}

/* ---------------- Listing workspace ---------------- */

function submissionPanelHostHtml() {
  return '<div id="partner-submission-panel" class="submit-card"><div class="compliance-loading">Vérification de l’annonce…</div></div>';
}

/** Called by loadPartnerListingWorkspace once the listing and its texts are known. */
function initSubmission(kind, assetId, listing, contentRows) {
  const fr = (contentRows || []).find(r => r.locale === 'fr') || {};
  Object.assign(submissionState, {
    listing: Object.assign({}, listing), kind, assetId,
    frTitle: fr.title || '', frDescription: fr.description || '',
    photoCount: null, compliance: null, complianceLoaded: false, notice: null, highlight: false, busy: false
  });
  lsub().listStatuses([listing.id]).then(res => {
    const row = !res.error && Array.isArray(res.data) ? res.data[0] : null;
    if (!row || !submissionState.listing || submissionState.listing.id !== listing.id) return;
    submissionState.notice = row.last_notice_reason ? { kind: row.last_notice_kind, reason: row.last_notice_reason, at: row.last_notice_at } : null;
    if (row.status && row.status !== submissionState.listing.status) submissionSetStatus(row.status);
    renderSubmissionPanel();
  });
  renderSubmissionPanel();
}

function submissionSetCompliance(payload) {
  submissionState.compliance = payload || null;
  submissionState.complianceLoaded = true;
  renderSubmissionPanel();
}
function submissionSetPhotos(count) { submissionState.photoCount = count; renderSubmissionPanel(); }
function submissionSetText(locale, title, description) {
  if (locale !== 'fr') return;
  submissionState.frTitle = title || ''; submissionState.frDescription = description || '';
  renderSubmissionPanel();
}
function submissionSetListing(listing) {
  if (!listing || !submissionState.listing || listing.id !== submissionState.listing.id) return;
  Object.assign(submissionState.listing, listing);
  renderSubmissionPanel();
}
function submissionSetStatus(status) {
  if (!submissionState.listing) return;
  submissionState.listing.status = status;
  if (complianceState.listing && complianceState.listing.id === submissionState.listing.id) complianceState.listing.status = status;
}

function submissionInput() {
  const s = submissionState;
  const c = s.compliance || {};
  const property = complianceState.property;
  const zoneCountry = property && property.zones_lite ? property.zones_lite.country_iso : null;
  return {
    jurisdiction: c.jurisdiction_iso || zoneCountry || null,
    frTitle: s.frTitle, frDescription: s.frDescription,
    priceCurrent: s.listing ? s.listing.price_current : 0,
    photoCount: s.photoCount,
    complianceProfile: c.profile || null,
    factsValid: !!(c.validation && c.validation.facts_valid),
    reviewStatus: c.review_status
  };
}

function renderSubmissionPanel() {
  const host = document.getElementById('partner-submission-panel');
  const s = submissionState;
  if (!host || !s.listing) return;
  const status = s.listing.status;
  const svc = lsub();
  const head = (sub) => `<div class="submit-head"><div><h3>Validation par Z Find</h3><p class="compliance-sub">${sub}</p></div><div class="submit-status" id="submission-status">${submissionBadgeHtml(status)}</div></div>`;
  const returned = s.notice && s.notice.kind === 'returned_to_draft' && svc.canSubmit(status)
    ? `<div class="compliance-note bad" id="submission-return-note"><strong>Renvoyée en brouillon par Z Find${s.notice.at ? ' le ' + escapeHtmlPartner(new Date(s.notice.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })) : ''}.</strong> Motif : ${escapeHtmlPartner(s.notice.reason)}</div>` : '';

  if (status === 'pending_review') {
    host.innerHTML = head('Votre annonce a été transmise. Z Find vérifie les textes, les photos et les mentions obligatoires, puis la met en ligne.')
      + `<div class="submit-actions"><button type="button" class="btn" id="withdraw-listing-btn" onclick="withdrawPartnerListing()" ${s.busy ? 'disabled' : ''}>Retirer de la validation</button>
         <span class="compliance-hint">Pour modifier l’annonce avant la vérification, retirez-la puis soumettez-la à nouveau.</span></div>`;
    return;
  }
  if (!svc.canSubmit(status)) {
    const text = {
      ready: 'Z Find a validé votre annonce : elle sera mise en ligne prochainement.',
      published: 'Votre annonce est en ligne sur Z Find.',
      suspended: 'Annonce suspendue par Z Find. Écrivez à hello@zfind.online pour la remettre en ligne.',
      archived: 'Annonce archivée.'
    }[status] || '';
    host.innerHTML = head(escapeHtmlPartner(text));
    return;
  }

  // Brouillon: checklist + « Soumettre à validation ».
  const loading = s.photoCount === null || !s.complianceLoaded;
  const items = svc.checklist(submissionInput());
  const missing = items.filter(i => !i.ok);
  const list = loading ? '<div class="compliance-loading">Vérification de l’annonce…</div>' : `
    <ul class="submit-checklist${s.highlight ? ' highlight' : ''}" id="submission-checklist">
      ${items.map(i => `<li class="${i.ok ? 'ok' : 'todo'}" data-code="${i.code}"><span class="mark" aria-hidden="true">${i.ok ? '✓' : '!'}</span>
        <span class="what">${escapeHtmlPartner(i.label)}</span>${i.ok ? '' : `<span class="help">${escapeHtmlPartner(i.help)}</span>`}</li>`).join('')}
    </ul>`;
  const hint = loading ? '' : missing.length
    ? `${missing.length} élément${missing.length > 1 ? 's' : ''} à compléter avant l’envoi.`
    : 'Tout est prêt : Z Find vérifiera l’annonce avant de la mettre en ligne.';
  host.innerHTML = head('Quand votre annonce est complète, soumettez-la : Z Find la vérifie puis la publie. Les mentions obligatoires doivent être enregistrées, pas encore validées.')
    + returned + list
    + `<div class="submit-actions"><button type="button" class="btn btn-primary" id="submit-listing-btn" onclick="submitPartnerListing()" ${loading || s.busy ? 'disabled' : ''}>${s.busy ? 'Envoi…' : 'Soumettre à validation'}</button>
       <span class="compliance-hint${missing.length && s.highlight ? ' bad' : ''}" id="submission-hint">${hint}</span></div>`;
}

async function submitPartnerListing() {
  const s = submissionState;
  const svc = lsub();
  if (!s.listing || s.busy) return;
  const missing = svc.precheck(submissionInput());
  if (missing.length) {
    s.highlight = true;
    renderSubmissionPanel();
    const panel = document.getElementById('partner-submission-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showStatus('error', `Soumission impossible : ${missing.length} élément${missing.length > 1 ? 's' : ''} à compléter (voir la liste).`);
    return;
  }
  s.busy = true; renderSubmissionPanel();
  const res = await svc.submitListing(s.listing.id);
  s.busy = false;
  if (res.error) {
    renderSubmissionPanel();
    showStatus('error', svc.describeError(res.error, 'Impossible de soumettre l’annonce.'));
    return;
  }
  submissionSetStatus((res.data && res.data.status) || 'pending_review');
  s.highlight = false;
  renderSubmissionPanel();
  const offer = document.getElementById('compliance-submit-offer');
  if (offer) offer.remove();
  showStatus('success', 'Annonce soumise à validation. Z Find la vérifie avant de la mettre en ligne.');
}

async function withdrawPartnerListing() {
  const s = submissionState;
  if (!s.listing || s.busy) return;
  s.busy = true; renderSubmissionPanel();
  const res = await lsub().withdrawSubmission(s.listing.id);
  s.busy = false;
  if (res.error) {
    renderSubmissionPanel();
    showStatus('error', lsub().describeError(res.error, 'Impossible de retirer l’annonce de la validation.'));
    return;
  }
  submissionSetStatus((res.data && res.data.status) || 'draft');
  renderSubmissionPanel();
  showStatus('success', 'Annonce retirée de la validation : elle est de nouveau en brouillon.');
}

/** After « Enregistrer les mentions » of the mentions on a draft listing. */
function offerSubmitAfterCompliance() {
  const s = submissionState;
  if (!s.listing || !lsub().canSubmit(s.listing.status)) return;
  const actions = document.querySelector('#partner-compliance-section .compliance-actions');
  if (!actions || document.getElementById('compliance-submit-offer')) return;
  const missing = lsub().precheck(submissionInput());
  actions.insertAdjacentHTML('afterend', `
    <div class="compliance-note wait submit-offer" id="compliance-submit-offer">
      <div><strong>Mentions enregistrées.</strong> Votre annonce est encore un brouillon : soumettez-la pour que Z Find la vérifie et la publie.${missing.length ? ` Il reste ${missing.length} élément${missing.length > 1 ? 's' : ''} à compléter (voir « Validation par Z Find »).` : ''}</div>
      <div class="submit-offer-actions">
        <button type="button" class="btn btn-primary" onclick="submitPartnerListing()">Soumettre à validation</button>
        <button type="button" class="btn" onclick="document.getElementById('compliance-submit-offer').remove()">Plus tard</button>
      </div>
    </div>`);
}

/* ---------------- Portfolio ---------------- */

function assetListing(row) {
  const reps = (row && row.representations) || [];
  for (const rep of reps) {
    if (rep.status === 'ended') continue;
    const listing = (rep.listings || []).find(l => l.status !== 'archived');
    if (listing) return listing;
  }
  return null;
}

function submissionSlotHtml(row, kind) {
  const listing = assetListing(row);
  if (!listing) return '';
  return `<span class="submission-slot" data-submission-listing="${escapeHtmlPartner(listing.id)}" data-asset-kind="${kind}" data-asset-id="${escapeHtmlPartner(row.id)}" data-status="${escapeHtmlPartner(listing.status || '')}">${submissionSlotInner(listing.status, null)}</span>`;
}

function submissionSlotInner(status, row) {
  const returned = row && row.last_notice_kind === 'returned_to_draft' && lsub().canSubmit(status)
    ? `<span class="status-badge tone-bad" title="${escapeHtmlPartner('Motif : ' + row.last_notice_reason)}">Renvoyée par Z Find</span>` : '';
  const button = lsub().canSubmit(status)
    ? '<button type="button" class="btn-sm submit-row-btn" onclick="event.stopPropagation(); portfolioSubmit(this)">Soumettre à validation</button>' : '';
  return returned + submissionBadgeHtml(status) + button;
}

async function decoratePortfolioSubmission() {
  const slots = Array.from(document.querySelectorAll('[data-submission-listing]'));
  if (!slots.length || !lsub()) return;
  const res = await lsub().listStatuses(slots.map(el => el.dataset.submissionListing));
  if (res.error || !Array.isArray(res.data)) return;
  const byId = new Map(res.data.map(r => [r.listing_id, r]));
  slots.forEach(el => {
    const row = byId.get(el.dataset.submissionListing);
    if (!row) return;
    el.dataset.status = row.status;
    el.innerHTML = submissionSlotInner(row.status, row);
  });
}

async function portfolioSubmit(btn) {
  const slot = btn.closest('[data-submission-listing]');
  const rowEl = btn.closest('.portfolio-row');
  if (!slot || !rowEl) return;
  const listingId = slot.dataset.submissionListing;
  const old = rowEl.nextElementSibling && rowEl.nextElementSibling.classList.contains('portfolio-submit-panel') ? rowEl.nextElementSibling : null;
  if (old) old.remove();
  btn.disabled = true; btn.textContent = 'Vérification…';
  const check = await lsub().listStatuses([listingId]);
  const row = !check.error && Array.isArray(check.data) ? check.data[0] : null;
  if (row && !row.ready && lsub().canSubmit(row.status)) {
    btn.disabled = false; btn.textContent = 'Soumettre à validation';
    const missing = Array.isArray(row.missing) ? row.missing : [];
    rowEl.insertAdjacentHTML('afterend', `
      <div class="portfolio-submit-panel" data-for="${escapeHtmlPartner(listingId)}">
        <div class="psp-title">Avant de soumettre cette annonce, complétez :</div>
        <ul class="submit-checklist highlight">${missing.map(code => {
          const [label, help] = lsub().CHECK_LABELS[code] || [code, ''];
          return `<li class="todo" data-code="${escapeHtmlPartner(code)}"><span class="mark" aria-hidden="true">!</span><span class="what">${escapeHtmlPartner(label)}</span><span class="help">${escapeHtmlPartner(help)}</span></li>`;
        }).join('')}</ul>
        <div class="submit-actions">
          <button type="button" class="btn btn-primary" onclick="openDetail('${escapeHtmlPartner(slot.dataset.assetKind)}','${escapeHtmlPartner(slot.dataset.assetId)}')">Compléter l’annonce</button>
          <button type="button" class="btn" onclick="this.closest('.portfolio-submit-panel').remove()">Fermer</button>
        </div>
      </div>`);
    return;
  }
  const res = await lsub().submitListing(listingId);
  if (res.error) {
    btn.disabled = false; btn.textContent = 'Soumettre à validation';
    showStatus('error', lsub().describeError(res.error, 'Impossible de soumettre l’annonce.'));
    return;
  }
  const status = (res.data && res.data.status) || 'pending_review';
  slot.dataset.status = status;
  slot.innerHTML = submissionSlotInner(status, null);
  showStatus('success', 'Annonce soumise à validation. Z Find la vérifie avant de la mettre en ligne.');
}
