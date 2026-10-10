/* ============================================================
   Z FIND ADMIN — Mentions obligatoires à valider
   ============================================================
   Review queue of the French mandatory listing information submitted by
   the agencies (zfind_admin_list_listing_compliance, migration
   20261009120000), detail of the submitted facts in French, and the two
   decisions of zfind_admin_review_listing_compliance:
   « Valider » (approved) / « Refuser » (rejected, reason required).
   Publishing stays the existing « Publier » lifecycle action on the
   listing's page: the database gate lets it through once validated.
   Bulk « Valider » and the « Valider les mentions et publier » shortcut
   on the listing's page: bulk.js.
   Wording / facts rendering: zfind-web services/listing-compliance.js.
   ============================================================ */

const COMPLIANCE_FILTERS = [
  ['pending', 'À valider'], ['rejected', 'Refusées'], ['approved', 'Validées'], ['', 'Toutes']
];
const COMPLIANCE_PROFILE_FR = {
  fr_residential_sale_v1: 'Vente — logement',
  fr_residential_rent_v1: 'Location — logement'
};
const COMPLIANCE_TAG = { ok: 'published', wait: 'review', todo: 'late', bad: 'late', warn: 'draft' };
/* This file is loaded before app.js (which declares adminState): no top-level use of adminState here. */
let complianceFilter = 'pending';
let complianceByListing = new Map();

function lcAdmin() { return window.ZFindServices.listingCompliance; }

function complianceTag(status, prefix) {
  if (!status) return '<span class="muted">—</span>';
  const title = status.note ? ` title="${escapeHtml('Motif : ' + status.note)}"` : '';
  return `<span class="tag tag-${COMPLIANCE_TAG[status.tone] || 'draft'}"${title}>${escapeHtml((prefix || '') + status.label)}</span>`;
}

function complianceStatusOfRow(r) {
  return lcAdmin().statusOf({ jurisdiction_iso: r.jurisdiction_iso, profile: r.profile, review_status: r.review_status, review_note: r.review_note, facts_valid: !!r.facts_valid });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function openComplianceQueue(filter) {
  complianceFilter = filter == null ? 'pending' : filter;
  navigateAdmin('conformite');
}

async function renderComplianceQueue() {
  const main = document.getElementById('main');
  const f = complianceFilter;
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Mentions obligatoires à valider</div>
    <p class="muted" style="margin:-8px 0 14px; max-width:760px; font-size:.84rem;">Annonces en France : l’agence saisit les mentions exigées par la loi (DPE, honoraires, copropriété, Géorisques, loyer…). Vérifiez-les puis Validez ou Refusez avec un motif. Une annonce en France ne peut être publiée qu’après validation.</p>
    <div class="status-chips" id="cq-chips">${COMPLIANCE_FILTERS.map(([v, l]) => `<button class="chip${v === f ? ' on' : ''}" data-filter="${v}" onclick="openComplianceQueue('${v}')">${l}</button>`).join('')}</div>
    ${bulkBarHtml('compliance')}
    <table><thead><tr>${bulkHeadCell('compliance')}<th>Agence</th><th>Annonce</th><th>Commune</th><th>Type</th><th>Soumis le</th><th>Saisie</th><th>Statut</th></tr></thead>
    <tbody id="cq-tbody"><tr><td colspan="8">Chargement…</td></tr></tbody></table>`);
  const res = await lcAdmin().adminQueue(f === '' ? null : f);
  const tbody = document.getElementById('cq-tbody');
  if (!tbody) return;
  if (res.error) { tbody.innerHTML = `<tr><td colspan="8">${escapeHtml(lcAdmin().describeError(res.error, 'Chargement impossible.'))}</td></tr>`; bulkAfterRows('compliance'); return; }
  const rows = res.data || [];
  complianceRowsCache = rows; // bulk.js « Valider »
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted">${f === 'pending' ? 'Aucune mention à valider. 👍' : 'Aucune annonce avec ce filtre.'}</td></tr>`;
    bulkAfterRows('compliance');
    return;
  }
  // Only complete mentions waiting for a decision can be validated in bulk.
  tbody.innerHTML = rows.map(r => `
    <tr data-listing="${escapeHtml(r.listing_id)}" onclick="navigateAdmin('conformite','${escapeHtml(r.listing_id)}')" style="cursor:pointer">
      ${bulkRowCell('compliance', r.listing_id, r.review_status === 'pending' && !!r.facts_valid)}
      <td>${escapeHtml(r.partner_name || '—')}</td>
      <td>${r.title ? escapeHtml(r.title) : '<span class="muted">(sans titre)</span>'}${r.agency_reference ? `<br><span class="muted">Réf. ${escapeHtml(r.agency_reference)}</span>` : ''}</td>
      <td>${escapeHtml(r.commune || '—')}${r.postal_code ? ` <span class="muted">${escapeHtml(r.postal_code)}</span>` : ''}</td>
      <td>${escapeHtml(COMPLIANCE_PROFILE_FR[r.profile] || '—')}</td>
      <td>${escapeHtml(fmtDateTime(r.submitted_at))}</td>
      <td>${r.facts_valid ? '<span class="tag tag-active">Complète</span>' : '<span class="tag tag-late">Incomplète</span>'}</td>
      <td>${complianceTag(complianceStatusOfRow(r))}</td>
    </tr>`).join('');
  bulkAfterRows('compliance');
}

async function renderComplianceDetail() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', `<a class="back-link" onclick="navigateAdmin('conformite')">← Retour aux mentions à valider</a><div id="cq-detail">Chargement…</div>`);
  const listingId = adminState.id;
  const [queueRes, fullRes] = await Promise.all([lcAdmin().adminQueue(null, listingId), lcAdmin().getListingCompliance(listingId)]);
  const host = document.getElementById('cq-detail');
  if (!host) return;
  if (fullRes.error) { host.textContent = lcAdmin().describeError(fullRes.error, 'Chargement impossible.'); return; }
  const meta = (!queueRes.error && Array.isArray(queueRes.data) && queueRes.data[0]) || {};
  const c = fullRes.data || {};
  const validation = c.validation || {};
  const status = lcAdmin().statusOf({ jurisdiction_iso: c.jurisdiction_iso, profile: c.profile, review_status: c.review_status, review_note: c.review_note, facts_valid: !!validation.facts_valid });
  const rows = lcAdmin().factRows(c.profile, c.facts);
  const groups = lcAdmin().GROUPS.map(([g, label]) => {
    const items = rows.filter(r => r.group === g);
    if (!items.length) return '';
    return `<tr class="cq-group"><th colspan="2">${escapeHtml(label)}</th></tr>` + items.map(r => `<tr><td class="cq-k">${escapeHtml(r.label)}</td><td>${escapeHtml(r.value)}</td></tr>`).join('');
  }).join('');
  const missing = (validation.missing || []).filter(k => k !== 'compliance_record');
  const canDecide = c.review_status && c.review_status !== 'unreviewed';
  host.innerHTML = `
    <div class="page-title cq-title">${meta.title ? escapeHtml(meta.title) : 'Annonce sans titre'} ${complianceTag(status)}</div>
    <div class="cq-meta">
      <div><span class="k">Agence</span>${escapeHtml(meta.partner_name || '—')}</div>
      <div><span class="k">Commune</span>${escapeHtml([meta.commune, meta.postal_code].filter(Boolean).join(' ') || '—')}</div>
      <div><span class="k">Type</span>${escapeHtml(COMPLIANCE_PROFILE_FR[c.profile] || 'Non couvert')}</div>
      <div><span class="k">Référence</span>${escapeHtml(meta.agency_reference || '—')}</div>
      <div><span class="k">Prix de l’annonce</span>${meta.price_current != null ? escapeHtml(fmtN(meta.price_current) + ' ' + (meta.currency_iso === 'EUR' || !meta.currency_iso ? '€' : meta.currency_iso) + (meta.transaction_type === 'rent' ? ' / mois' : '')) : '—'}</div>
      <div><span class="k">Statut de l’annonce</span>${escapeHtml(LISTING_STATUS_FR[meta.listing_status] || meta.listing_status || '—')}</div>
      <div><span class="k">Soumis le</span>${escapeHtml(fmtDateTime(meta.submitted_at))}</div>
      <div><span class="k">Décision</span>${c.reviewed_at ? escapeHtml(fmtDateTime(c.reviewed_at)) : '—'}</div>
    </div>
    ${c.review_note ? `<div class="cq-note">Motif du refus : ${escapeHtml(c.review_note)}</div>` : ''}
    ${missing.length ? `<div class="cq-missing"><strong>Mentions incomplètes :</strong> ${escapeHtml(lcAdmin().missingText(missing))}. La validation est impossible tant qu’elles manquent ; refusez avec un motif pour que l’agence les complète.</div>` : ''}
    <h3 class="section-title">Informations déclarées par l’agence</h3>
    ${rows.length ? `<table class="cq-facts">${groups}</table>` : '<p class="muted">Aucune information saisie.</p>'}
    <h3 class="section-title">Décision</h3>
    <div class="detail-panel cq-decision">
      <div class="form-field"><label for="cq-note">Motif du refus (obligatoire pour refuser, transmis à l’agence)</label><textarea id="cq-note" maxlength="500" placeholder="ex. : classe GES absente du DPE joint, montant des honoraires à corriger…"></textarea></div>
      <div class="cq-actions">
        <button class="btn btn-primary" id="cq-approve" ${canDecide && validation.facts_valid && c.review_status !== 'approved' ? '' : 'disabled'} onclick="reviewCompliance('${escapeHtml(listingId)}','approved')">Valider</button>
        <button class="btn btn-danger" id="cq-reject" ${canDecide && c.review_status !== 'rejected' ? '' : 'disabled'} onclick="reviewCompliance('${escapeHtml(listingId)}','rejected')">Refuser</button>
        ${meta.property_id ? `<a class="cq-link" onclick="navigateAdmin('properties','${escapeHtml(meta.property_id)}')">Ouvrir la fiche du bien</a>` : meta.development_id ? `<a class="cq-link" onclick="navigateAdmin('developments','${escapeHtml(meta.development_id)}')">Ouvrir le programme</a>` : ''}
      </div>
      <p class="muted" style="margin-top:10px;">Après validation, publiez l’annonce depuis sa fiche : « Envoyer en vérification » si elle est en brouillon, « Approuver (prête à publier) », puis « Publier ».</p>
    </div>`;
}

async function reviewCompliance(listingId, decision) {
  const noteEl = document.getElementById('cq-note');
  const note = noteEl ? noteEl.value.trim() : '';
  if (decision === 'rejected' && !note) {
    showStatus('error', 'Indiquez le motif du refus : il est transmis à l’agence.');
    if (noteEl) noteEl.focus();
    return;
  }
  if (decision === 'rejected' && !(await askConfirm('Refuser les mentions ?', `L’agence verra le motif : « ${note} » et devra corriger avant une nouvelle validation.`, 'Refuser'))) return;
  const result = await lcAdmin().reviewListingCompliance(listingId, decision, decision === 'rejected' ? note : null);
  if (result.error) { showStatus('error', lcAdmin().describeError(result.error, 'Impossible d’enregistrer la décision.')); return; }
  showStatus('success', decision === 'approved' ? 'Mentions validées. L’annonce peut être publiée depuis sa fiche.' : 'Mentions refusées. L’agence reçoit le motif par e-mail et le voit dans son espace.');
  if (decision === 'rejected') bulkNotifyAgencies(); // bulk.js: /api/lead-notify sends the pending notices
  render();
}

/* ---------------- Indicator on the « Biens et annonces » list ---------------- */

async function loadPropertiesCompliance(rows) {
  const ids = (rows || []).map(p => (propListing(p).listing || {}).id).filter(Boolean);
  if (!ids.length || !lcAdmin()) return;
  const res = await lcAdmin().listStatuses(ids);
  if (res.error || !Array.isArray(res.data)) return;
  complianceByListing = new Map(res.data.map(r => [r.listing_id, r]));
  renderPropRows();
}

function propComplianceStatus(p) {
  const { listing } = propListing(p);
  const row = listing && complianceByListing.get(listing.id);
  return row ? complianceStatusOfRow(row) : null;
}

function propComplianceMatches(p, filter) {
  if (!filter) return true;
  const s = propComplianceStatus(p);
  if (filter === 'none') return !s;
  return !!s && s.code === filter;
}

/* ---------------- Line on a property's page, next to « Publier » ---------------- */
async function loadAssetComplianceLine(listing) {
  const host = document.getElementById('asset-compliance-line');
  if (!host || !listing || !lcAdmin()) return;
  const res = await lcAdmin().listStatuses([listing.id]);
  const row = !res.error && Array.isArray(res.data) ? res.data[0] : null;
  const status = row ? complianceStatusOfRow(row) : null;
  if (!status) { host.remove(); return; }
  const blocked = status.code !== 'approved';
  // Both waiting (mentions to validate, listing to publish): one click.
  const shortcut = row.review_status === 'pending' && row.facts_valid && ['pending_review', 'ready', 'suspended'].includes(listing.status)
    ? `<button class="btn btn-primary" id="validate-publish-btn" onclick="validateAndPublish('${escapeHtml(listing.id)}','${escapeHtml(listing.status)}')">Valider les mentions et publier</button>` : '';
  host.innerHTML = `<strong>Mentions obligatoires (France) :</strong> ${complianceTag(status)}
    ${blocked ? '<span class="muted">— la publication sera refusée tant qu’elles ne sont pas validées.</span>' : ''}
    ${row.review_status && row.review_status !== 'unreviewed' ? `<a class="cq-link" onclick="navigateAdmin('conformite','${escapeHtml(listing.id)}')">Voir les mentions</a>` : ''}
    ${shortcut}`;
}

/* ---------------- Dashboard card ---------------- */
async function loadComplianceQueueCard() {
  const ops = document.getElementById('ops-cards');
  if (!ops || !lcAdmin()) return;
  const res = await lcAdmin().adminQueue('pending');
  if (res.error) return;
  const n = (res.data || []).length;
  const html = `<div class="card${n ? ' card-warn' : ''}" id="card-compliance" onclick="openComplianceQueue('pending')" style="cursor:pointer"><div class="n">${fmtN(n)}</div><div class="l">Mentions obligatoires à valider (France)</div></div>`;
  const anchor = document.getElementById('card-review');
  if (anchor) anchor.insertAdjacentHTML('afterend', html); else ops.insertAdjacentHTML('afterbegin', html);
}
