/* ============================================================
   Z FIND PARTNER — Mentions obligatoires (France)
   ============================================================
   Section of the listing workspace where the agency enters the facts
   French law requires in a property advertisement (DPE / GES, energy
   costs, fees, copropriété, Géorisques, and for rentals rent, charges,
   deposit, tenant fees, rent control). Field set, client validation
   and wording come from the shared zfind-web service
   services/listing-compliance.js (window.ZFindServices.listingCompliance),
   a mirror of the database validator.

   Saving calls zfind_save_listing_compliance: the record goes (back) to
   « En attente de validation Z Find » whenever the facts change. The
   agency then submits the draft listing (submission.js,
   zfind_partner_submit_listing: brouillon -> en attente de validation
   only); approval and publication stay with Z Find.
   ============================================================ */

const complianceState = { listing: null, property: null, payload: null, profile: null };

function lc() { return window.ZFindServices.listingCompliance; }

const COMPLIANCE_PROFILE_FR = {
  fr_residential_sale_v1: 'Vente d’un logement',
  fr_residential_rent_v1: 'Location d’un logement'
};

function complianceBadgeHtml(status, prefix) {
  if (!status) return '';
  const label = (prefix || '') + status.label;
  const title = status.code === 'rejected' && status.note ? ` title="${escapeHtmlPartner('Motif : ' + status.note)}"` : '';
  return `<span class="compliance-badge tone-${status.tone}"${title}>${escapeHtmlPartner(label)}</span>`;
}

/* ---------------- Portfolio badges ---------------- */

/** First non-archived listing of an asset row (properties / developments list shape). */
function assetListingId(row) {
  const reps = (row && row.representations) || [];
  for (const rep of reps) {
    if (rep.status === 'ended') continue;
    const listing = (rep.listings || []).find(l => l.status !== 'archived');
    if (listing) return listing.id;
  }
  return null;
}

async function decoratePortfolioCompliance() {
  const slots = Array.from(document.querySelectorAll('[data-compliance-listing]'));
  const ids = slots.map(el => el.dataset.complianceListing).filter(Boolean);
  if (!ids.length || !lc()) return;
  const res = await lc().listStatuses(ids);
  if (res.error || !Array.isArray(res.data)) return;
  const byId = new Map(res.data.map(r => [r.listing_id, r]));
  slots.forEach(el => {
    const status = lc().statusOf(byId.get(el.dataset.complianceListing));
    el.innerHTML = complianceBadgeHtml(status, 'Mentions : ');
  });
}

/* ---------------- Listing workspace section ---------------- */

function complianceHostHtml() {
  return '<div id="partner-compliance-section" class="compliance-card"><div class="compliance-loading">Chargement des mentions obligatoires…</div></div>';
}

async function loadPartnerCompliance(listing, property) {
  if (!listing || !lc()) return;
  complianceState.listing = listing;
  if (property !== undefined) complianceState.property = property;
  const res = await lc().getListingCompliance(listing.id);
  submissionSetCompliance(res.error ? null : res.data); // checklist of submission.js
  const host = document.getElementById('partner-compliance-section');
  if (!host) return;
  if (res.error) {
    host.innerHTML = `<div class="compliance-head"><h3>Mentions obligatoires (France)</h3></div><p class="compliance-sub">${escapeHtmlPartner(lc().describeError(res.error, 'Impossible de charger les mentions obligatoires.'))}</p>`;
    return;
  }
  renderPartnerCompliance(res.data);
}

function renderPartnerCompliance(payload) {
  const host = document.getElementById('partner-compliance-section');
  if (!host) return;
  const svc = lc();
  complianceState.payload = payload;
  const jurisdiction = String((payload && payload.jurisdiction_iso) || '').toUpperCase();
  const profile = payload && payload.profile;
  complianceState.profile = profile;

  if (!jurisdiction) {
    host.innerHTML = `<div class="compliance-head"><div><h3>Mentions obligatoires (France)</h3>
      <p class="compliance-sub">Indiquez d’abord la commune du bien (section « Le bien »). Pour un bien situé en France, les mentions exigées par la loi s’afficheront ici.</p></div></div>`;
    return;
  }
  if (jurisdiction !== 'FR') { host.remove(); return; }

  const validation = (payload && payload.validation) || {};
  const status = svc.statusOf({
    jurisdiction_iso: jurisdiction, profile, review_status: payload.review_status,
    review_note: payload.review_note, facts_valid: !!validation.facts_valid
  });

  if (status.code === 'unsupported') {
    host.innerHTML = `<div class="compliance-head"><div><h3>Mentions obligatoires (France)</h3>
      <p class="compliance-sub">${escapeHtmlPartner(status.long)} Écrivez-nous à hello@zfind.online pour ce type de bien.</p></div>${complianceBadgeHtml(status)}</div>`;
    return;
  }

  const listing = complianceState.listing || {};
  const locked = listing.status === 'published';
  const facts = svc.prefillFacts(profile, { property: complianceState.property, listing, existingFacts: payload.facts });
  const values = svc.formValues(profile, facts);
  const hasRecord = payload.review_status && payload.review_status !== 'unreviewed';

  const groups = svc.GROUPS.map(([groupKey, groupLabel]) => {
    const defs = svc.fieldsFor(profile).filter(d => d.group === groupKey);
    if (!defs.length) return '';
    return `<fieldset class="compliance-group" data-group="${groupKey}">
      <legend>${escapeHtmlPartner(groupLabel)}</legend>
      <div class="compliance-grid">${defs.map(d => renderComplianceField(d, profile, values)).join('')}</div>
    </fieldset>`;
  }).join('');

  const reviewed = payload.reviewed_at ? new Date(payload.reviewed_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  host.innerHTML = `
    <div class="compliance-head">
      <div>
        <h3>Mentions obligatoires (France)</h3>
        <p class="compliance-sub">${escapeHtmlPartner(COMPLIANCE_PROFILE_FR[profile] || '')} — informations exigées par la loi dans toute annonce publiée en France. Z Find les vérifie avant la mise en ligne. Les champs marqués * sont obligatoires.</p>
      </div>
      <div class="compliance-status" id="compliance-status">${complianceBadgeHtml(status)}</div>
    </div>
    ${status.code === 'rejected' ? `<div class="compliance-note bad"><strong>Refusé par Z Find${reviewed ? ' le ' + escapeHtmlPartner(reviewed) : ''}.</strong> ${status.note ? 'Motif : ' + escapeHtmlPartner(status.note) + '. ' : ''}Corrigez les informations ci-dessous puis soumettez-les à nouveau.</div>` : ''}
    ${status.code === 'approved' ? `<div class="compliance-note ok"><strong>Validé par Z Find${reviewed ? ' le ' + escapeHtmlPartner(reviewed) : ''}.</strong> Toute modification renverra les mentions en validation.</div>` : ''}
    ${status.code === 'pending' ? '<div class="compliance-note wait">Vos mentions ont été transmises. Z Find les vérifie avant de publier l’annonce.</div>' : ''}
    ${locked ? '<div class="compliance-note">Annonce en ligne : pour modifier ces mentions, demandez à Z Find de suspendre l’annonce.</div>' : ''}
    <form id="compliance-form" class="compliance-form" onsubmit="return false" oninput="complianceSyncVisibility()" onchange="complianceSyncVisibility()">
      <fieldset class="compliance-lock" ${locked ? 'disabled' : ''}>${groups}</fieldset>
    </form>
    <div class="compliance-summary" id="compliance-summary" role="alert"></div>
    <div class="compliance-actions">
      <button type="button" class="btn btn-primary" id="compliance-save" ${locked ? 'disabled' : ''} onclick="savePartnerCompliance()">Enregistrer les mentions</button>
      <span class="compliance-hint">La mise en ligne reste décidée par Z Find une fois les mentions validées.</span>
    </div>`;
  complianceSyncVisibility();
  if (hasRecord && !validation.facts_valid) showComplianceErrors(svc.validateFacts(profile, facts).errors, false);
}

function renderComplianceField(d, profile, values) {
  const svc = lc();
  const key = d.key;
  const id = 'cf-' + key;
  const required = svc.isRequired(d, profile);
  const label = escapeHtmlPartner(svc.labelFor(d, profile)) + (required ? ' <span class="req">*</span>' : '');
  const value = values[key];
  const err = `<div class="cf-error" id="cf-err-${key}"></div>`;
  let control;
  if (d.type === 'check') {
    return `<div class="form-field cf-field cf-wide" data-key="${key}">
      <label class="cf-check"><input type="checkbox" id="${id}" ${value === true ? 'checked' : ''}> <span>${escapeHtmlPartner(svc.labelFor(d, profile))}${required ? ' <span class="req">*</span>' : ''}</span></label>${err}</div>`;
  }
  if (d.type === 'enum' || d.type === 'bool') {
    const opts = svc.optionsFor(d, profile);
    control = `<div class="cf-choices" role="radiogroup" aria-labelledby="${id}-label">${opts.map(([v, l]) => `
      <label class="cf-choice"><input type="radio" name="${id}" value="${escapeHtmlPartner(v)}" ${String(value) === v ? 'checked' : ''}> ${escapeHtmlPartner(l)}</label>`).join('')}</div>`;
    return `<div class="form-field cf-field cf-wide" data-key="${key}"><label id="${id}-label">${label}</label>${control}${err}</div>`;
  }
  if (d.type === 'class') {
    control = `<select id="${id}"><option value="">—</option>${svc.CLASSES.map(c => `<option value="${c}" ${String(value || '').toUpperCase() === c ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
  } else if (d.type === 'number') {
    control = `<input type="text" inputmode="decimal" id="${id}" value="${escapeHtmlPartner(value == null ? '' : String(value).replace('.', ','))}" autocomplete="off">`;
  } else if (d.type === 'year') {
    control = `<input type="text" inputmode="numeric" maxlength="4" id="${id}" value="${escapeHtmlPartner(value || '')}" placeholder="${escapeHtmlPartner(d.placeholder || '')}" autocomplete="off">`;
  } else {
    const list = d.suggestions ? ` list="${id}-list"` : '';
    control = `<input type="${d.type === 'url' ? 'url' : 'text'}" id="${id}"${list} maxlength="${d.maxLength || 300}" value="${escapeHtmlPartner(value || '')}" placeholder="${escapeHtmlPartner(d.placeholder || '')}" autocomplete="off">`
      + (d.suggestions ? `<datalist id="${id}-list">${d.suggestions.map(s => `<option value="${escapeHtmlPartner(s)}">`).join('')}</datalist>` : '');
  }
  const wide = d.type === 'text' && (d.maxLength || 0) > 100 ? ' cf-wide' : '';
  return `<div class="form-field cf-field${wide}" data-key="${key}"><label for="${id}">${label}</label>${control}${err}</div>`;
}

/** Raw form values by key (strings, booleans for the Géorisques checkbox). */
function readComplianceValues() {
  const svc = lc();
  const out = {};
  svc.fieldsFor(complianceState.profile).forEach(d => {
    const id = 'cf-' + d.key;
    if (d.type === 'enum' || d.type === 'bool') {
      const checked = document.querySelector(`input[name="${id}"]:checked`);
      out[d.key] = checked ? checked.value : '';
    } else if (d.type === 'check') {
      const el = document.getElementById(id);
      out[d.key] = !!(el && el.checked);
    } else {
      const el = document.getElementById(id);
      out[d.key] = el ? el.value : '';
    }
  });
  return out;
}

/** Shows only the fields of the branches that apply (DPE vs exemption, copropriété, encadrement). */
function complianceSyncVisibility() {
  const svc = lc();
  const profile = complianceState.profile;
  if (!svc || !profile || !document.getElementById('compliance-form')) return;
  const values = readComplianceValues();
  const selectors = {
    dpe_status: values.dpe_status || undefined,
    is_condominium: values.is_condominium === 'true' ? true : values.is_condominium === 'false' ? false : undefined,
    rent_control_status: values.rent_control_status || undefined
  };
  svc.fieldsFor(profile).forEach(d => {
    const el = document.querySelector(`.cf-field[data-key="${d.key}"]`);
    if (!el) return;
    const show = d.when(selectors) && (!d.formWhen || d.formWhen(values));
    el.style.display = show ? '' : 'none';
  });
  document.querySelectorAll('.compliance-group').forEach(g => {
    const anyVisible = Array.from(g.querySelectorAll('.cf-field')).some(f => f.style.display !== 'none');
    g.style.display = anyVisible ? '' : 'none';
  });
}

function showComplianceErrors(errors, scroll) {
  document.querySelectorAll('.cf-error').forEach(el => { el.textContent = ''; });
  document.querySelectorAll('.cf-field.has-error').forEach(el => el.classList.remove('has-error'));
  const keys = Object.keys(errors || {});
  let first = null;
  keys.forEach(key => {
    const err = document.getElementById('cf-err-' + key);
    const field = document.querySelector(`.cf-field[data-key="${key}"]`);
    if (!err || !field || field.style.display === 'none') return;
    err.textContent = errors[key];
    field.classList.add('has-error');
    if (!first) first = field;
  });
  const summary = document.getElementById('compliance-summary');
  if (summary) summary.textContent = keys.length ? `${keys.length} point${keys.length > 1 ? 's' : ''} à compléter ou corriger avant l’envoi à Z Find.` : '';
  if (scroll && first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function savePartnerCompliance() {
  const svc = lc();
  const listing = complianceState.listing;
  const profile = complianceState.profile;
  if (!svc || !listing || !profile) return;
  const facts = svc.buildFacts(profile, readComplianceValues());
  const check = svc.validateFacts(profile, facts);
  if (!check.valid) {
    showComplianceErrors(check.errors, true);
    showStatus('error', 'Mentions incomplètes : corrigez les champs signalés.');
    return;
  }
  showComplianceErrors({}, false);
  const btn = document.getElementById('compliance-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }
  const previous = complianceState.payload && complianceState.payload.review_status;
  const result = await svc.saveListingCompliance(listing.id, facts, { channel: 'partner_panel', form: 'fr_compliance_v1', submitted_at: new Date().toISOString() });
  if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer les mentions'; }
  if (result.error) {
    showStatus('error', svc.describeError(result.error, 'Impossible d’enregistrer les mentions obligatoires.'));
    return;
  }
  renderPartnerCompliance(result.data);
  submissionSetCompliance(result.data);
  const now = result.data && result.data.review_status;
  if (now === 'pending') offerSubmitAfterCompliance(); // draft listing: « Soumettre à validation » now?
  if (now === 'pending') showStatus('success', 'Mentions enregistrées et transmises à Z Find pour validation.');
  else if (now === 'rejected' && previous === 'rejected') showStatus('error', 'Aucune modification : corrigez les points signalés par Z Find avant de renvoyer les mentions.');
  else showStatus('success', 'Mentions enregistrées (inchangées).');
}
