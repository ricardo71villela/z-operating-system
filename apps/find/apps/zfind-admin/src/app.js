/* ============================================================
   Z FIND ADMIN — app.js
   ============================================================
   Sprint 1.7. Every data operation goes through window.ZFindServices
   (admin.js / auth.js) — this file never calls Supabase directly.
   ============================================================ */

const LOCALES = ['en', 'pt', 'fr'];
const adminState = { view: 'dashboard', id: null, locale: 'en', zonesCache: null, partnersCache: null };

/** Toast notification — replaces the previous static status box.
    Pattern adapted from Z Imobiliária's own Admin (real, working code).
    Same signature as before (kind, text), so every existing call
    site needs zero changes. */
function showStatus(kind, text) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  host.appendChild(el);
  setTimeout(() => el.remove(), kind === 'error' ? 5000 : 2800);
}

/** Promise-based confirm modal — replaces browser confirm(), which
    looks unprofessional and can't be styled. Pattern adapted from
    Z Imobiliária's admin. Usage: if (await askConfirm('Title','Body')) {...} */
function askConfirm(title, body, okLabel) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-overlay');
    overlay.innerHTML = `
      <div class="confirm-box">
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(body)}</p>
        <div class="actions">
          <button class="btn" id="confirm-cancel">Cancel</button>
          <button class="btn btn-danger" id="confirm-ok">${escapeHtml(okLabel || 'Confirm')}</button>
        </div>
      </div>`;
    overlay.classList.remove('hidden');
    const cleanup = (result) => { overlay.classList.add('hidden'); overlay.innerHTML = ''; resolve(result); };
    document.getElementById('confirm-ok').onclick = () => cleanup(true);
    document.getElementById('confirm-cancel').onclick = () => cleanup(false);
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
  });
}

/* ---------------- Auth gate ---------------- */
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  const result = await window.ZFindServices.auth.signIn(email, password);
  if (result.error) { errEl.textContent = 'Sign-in failed. Check your credentials.'; return; }
  await checkAdminAccess();
}
async function handleSignOut() {
  await window.ZFindServices.auth.signOut();
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
}
async function checkAdminAccess() {
  const profile = await window.ZFindServices.auth.getCurrentProfile();
  if (profile.error || !profile.data || profile.data.role !== 'admin') {
    document.getElementById('login-error').textContent = 'This account does not have Admin access.';
    await window.ZFindServices.auth.signOut();
    return false;
  }
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  navigateAdmin('dashboard');
  return true;
}
async function initAdmin() {
  const session = await window.ZFindServices.auth.getSession();
  if (session.data && session.data.session) await checkAdminAccess();
}

/* ---------------- Router ---------------- */
function navigateAdmin(view, id) {
  adminState.view = view;
  adminState.id = id || null;
  document.querySelectorAll('#sidebar a[data-view]').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  render();
}
function render() {
  const main = document.getElementById('main');
  main.innerHTML = '';
  const routes = {
    dashboard: renderDashboard,
    properties: adminState.id ? renderPropertyEdit : renderPropertiesList,
    developments: adminState.id ? renderDevelopmentEdit : renderDevelopmentsList,
    partners: adminState.id ? renderPartnerEdit : renderPartnersList,
    leads: adminState.id ? renderLeadDetail : renderLeadsList,
  };
  (routes[adminState.view] || renderDashboard)();
}

/* ---------------- Dashboard ---------------- */
async function renderDashboard() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', '<div class="page-title">Dashboard</div><div class="cards" id="dash-cards">Loading…</div>');
  const result = await window.ZFindServices.admin.getDashboardCounts();
  const cardsEl = document.getElementById('dash-cards');
  if (result.error) { cardsEl.textContent = 'Could not load counts.'; return; }
  const c = result.data;
  cardsEl.innerHTML = ['properties', 'developments', 'partners', 'leads'].map(k =>
    `<div class="card"><div class="n">${c[k] == null ? '—' : c[k]}</div><div class="l">${k[0].toUpperCase() + k.slice(1)}</div></div>`
  ).join('');
}

/* ---------------- Partners ---------------- */
async function renderPartnersList() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Partners <button class="btn btn-primary" onclick="showNewPartnerForm()">+ New partner</button></div>
    <div class="toolbar"><input type="text" id="partner-search" placeholder="Search by name…" oninput="loadPartnersList(this.value)"></div>
    <div id="new-partner-form"></div>
    <table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody id="partners-tbody"><tr><td colspan="4">Loading…</td></tr></tbody></table>`);
  await loadPartnersList();
}
async function loadPartnersList(search) {
  const result = await window.ZFindServices.admin.listPartners(search);
  const tbody = document.getElementById('partners-tbody');
  if (result.error) { tbody.innerHTML = '<tr><td colspan="4">Could not load partners.</td></tr>'; return; }
  const rows = result.data || [];
  tbody.innerHTML = rows.length ? rows.map(p => `
    <tr onclick="navigateAdmin('partners','${p.id}')" style="cursor:pointer">
      <td>${escapeHtml(p.name)}</td><td>${p.role}</td>
      <td><span class="tag tag-${p.status}">${p.status}</span></td>
      <td></td>
    </tr>`).join('') : '<tr><td colspan="4">No partners yet.</td></tr>';
}
function showNewPartnerForm() {
  document.getElementById('new-partner-form').innerHTML = `
    <div class="detail-panel" style="margin-bottom:16px;">
      <div class="form-field"><label>Name</label><input type="text" id="np-name"></div>
      <div class="form-field"><label>Role</label><select id="np-role"><option value="agency">Agency</option><option value="promoter">Promoter</option></select></div>
      <button class="btn btn-primary" onclick="submitNewPartner()">Create</button>
    </div>`;
}
async function submitNewPartner() {
  const name = document.getElementById('np-name').value.trim();
  const role = document.getElementById('np-role').value;
  if (!name) { showStatus('error', 'Name is required.'); return; }
  const result = await window.ZFindServices.admin.createPartner({ name, role });
  if (result.error) { showStatus('error', 'Could not create partner.'); return; }
  document.getElementById('new-partner-form').innerHTML = '';
  showStatus('success', 'Partner created.');
  loadPartnersList();
}
async function renderPartnerEdit() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', '<div id="partner-edit-root">Loading…</div>');
  const result = await window.ZFindServices.admin.getPartnerById(adminState.id);
  const root = document.getElementById('partner-edit-root');
  if (result.error) { root.textContent = 'Could not load partner.'; return; }
  const p = result.data;
  const logoUrl = p.logo_storage_path ? await window.ZFindServices.supabaseClient.resolveMediaUrl(p.logo_storage_path) : null;
  root.innerHTML = `
    <a class="back-link" onclick="navigateAdmin('partners')">← Back to partners</a>
    <div class="page-title" style="display:flex; justify-content:space-between; align-items:center;">
      <span>${escapeHtml(p.name)}</span>
      <button class="btn" style="color:#c0392b; border-color:#c0392b;" onclick="deleteAsset('partner','${p.id}','partners')">Delete</button>
    </div>
    <div class="detail-panel">
      <div class="form-field"><label>Logo</label>
        ${logoUrl ? `<img src="${logoUrl}" alt="" style="width:80px;height:80px;object-fit:cover;border-radius:6px;display:block;margin-bottom:8px;">` : '<p style="color:#999;font-size:.8rem;margin-bottom:8px;">No logo yet.</p>'}
        <input type="file" id="pe-logo-input" accept="image/*" onchange="handlePartnerLogoUpload('${p.id}')">
      </div>
      <div class="form-field"><label>Name</label><input type="text" id="pe-name" value="${escapeHtml(p.name)}"></div>
      <div class="form-field"><label>Role</label><select id="pe-role"><option value="agency" ${p.role==='agency'?'selected':''}>Agency</option><option value="promoter" ${p.role==='promoter'?'selected':''}>Promoter</option></select></div>
      <div class="form-field"><label>Status</label><select id="pe-status"><option value="active" ${p.status==='active'?'selected':''}>Active</option><option value="inactive" ${p.status==='inactive'?'selected':''}>Inactive</option></select></div>
      <div class="form-field"><label>Contact policy — Direct</label><input type="checkbox" id="pe-direct" ${p.enquiry_policy.direct?'checked':''}></div>
      <div class="form-field"><label>Contact policy — Qualified</label><input type="checkbox" id="pe-qualified" ${p.enquiry_policy.qualified?'checked':''}></div>
      <div class="form-field"><label>Contact policy — Assisted</label><input type="checkbox" id="pe-assisted" ${p.enquiry_policy.assisted?'checked':''}></div>
      <button class="btn btn-primary" onclick="savePartner('${p.id}')">Save</button>
    </div>`;
}
async function handlePartnerLogoUpload(partnerId) {
  const input = document.getElementById('pe-logo-input');
  const file = input.files[0];
  if (!file) return;
  showStatus('success', 'Uploading logo…');
  const result = await window.ZFindServices.admin.uploadPartnerLogo(partnerId, file);
  showStatus(result.error ? 'error' : 'success', result.error ? 'Logo upload failed.' : 'Logo uploaded.');
  if (!result.error) renderPartnerEditRefresh();
}
function renderPartnerEditRefresh() { document.getElementById('main').innerHTML = ''; renderPartnerEdit(); }
async function savePartner(id) {
  const fields = {
    name: document.getElementById('pe-name').value.trim(),
    role: document.getElementById('pe-role').value,
    status: document.getElementById('pe-status').value,
    enquiryPolicy: {
      direct: document.getElementById('pe-direct').checked,
      qualified: document.getElementById('pe-qualified').checked,
      assisted: document.getElementById('pe-assisted').checked,
    },
  };
  const result = await window.ZFindServices.admin.updatePartner(id, fields);
  showStatus(result.error ? 'error' : 'success', result.error ? 'Could not save.' : 'Saved.');
}

/* ---------------- Developments & Properties: shared list/edit scaffolding ---------------- */
async function renderDevelopmentsList() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Developments <button class="btn btn-primary" onclick="showNewDevelopmentForm()">+ New development</button></div>
    <div class="toolbar"><input type="text" id="dev-search" placeholder="Search by name…" oninput="loadDevelopmentsList(this.value)"></div>
    <div id="new-dev-form"></div>
    <table><thead><tr><th>Name</th><th>Zone</th><th>Promoter</th></tr></thead><tbody id="devs-tbody"><tr><td colspan="3">Loading…</td></tr></tbody></table>`);
  await loadDevelopmentsList();
}
async function loadDevelopmentsList(search) {
  const result = await window.ZFindServices.admin.listDevelopments(search);
  const tbody = document.getElementById('devs-tbody');
  if (result.error) { tbody.innerHTML = '<tr><td colspan="3">Could not load.</td></tr>'; return; }
  const rows = result.data || [];
  tbody.innerHTML = rows.length ? rows.map(d => `
    <tr onclick="navigateAdmin('developments','${d.id}')" style="cursor:pointer">
      <td>${escapeHtml(d.name)}</td><td>${d.zones_lite ? escapeHtml(d.zones_lite.name) : ''}</td><td>${d.partners ? escapeHtml(d.partners.name) : ''}</td>
    </tr>`).join('') : '<tr><td colspan="3">No developments yet.</td></tr>';
}
async function showNewDevelopmentForm() {
  const zones = await getZonesCached();
  const partners = await getPartnersCached();
  document.getElementById('new-dev-form').innerHTML = `
    <div class="detail-panel" style="margin-bottom:16px;">
      <div class="form-field"><label>Name</label><input type="text" id="nd-name"></div>
      <div class="form-field"><label>Zone</label>${zoneComboHTML("nd-zone", zones, null)}</div>
      <div class="form-field"><label>Promoter partner</label><select id="nd-partner">${partners.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></div>
      <button class="btn btn-primary" onclick="submitNewDevelopment()">Create</button>
    </div>`;
}
async function submitNewDevelopment() {
  const name = document.getElementById('nd-name').value.trim();
  if (!name) { showStatus('error', 'Name is required.'); return; }
  const result = await window.ZFindServices.admin.createDevelopment({ name, zoneLiteId: document.getElementById('nd-zone').value, promoterPartnerId: document.getElementById('nd-partner').value });
  if (result.error) { showStatus('error', 'Could not create development.'); return; }
  document.getElementById('new-dev-form').innerHTML = '';
  showStatus('success', 'Development created.');
  loadDevelopmentsList();
}
async function renderDevelopmentEdit() {
  const result = await window.ZFindServices.admin.getDevelopmentForEdit(adminState.id);
  const main = document.getElementById('main');
  if (result.error) { main.insertAdjacentHTML('beforeend', 'Could not load.'); return; }
  await renderAssetEditShell(main, {
    kind: 'development', data: result.data, backView: 'developments',
    titleField: 'name',
  });
}

async function renderPropertiesList() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Properties <button class="btn btn-primary" onclick="showNewPropertyForm()">+ New property</button></div>
    <div class="toolbar"><input type="text" id="prop-search" placeholder="Search by reference, title, zone, partner…" oninput="loadPropertiesList(this.value)"></div>
    <div id="new-prop-form"></div>
    <table><thead><tr><th>Title</th><th>Subtype</th><th>Zone</th><th>Partner</th><th>Status</th><th></th></tr></thead><tbody id="props-tbody"><tr><td colspan="6">Loading…</td></tr></tbody></table>`);
  await loadPropertiesList();
}
async function loadPropertiesList(search) {
  const result = await window.ZFindServices.admin.listProperties(search);
  const tbody = document.getElementById('props-tbody');
  if (result.error) { tbody.innerHTML = '<tr><td colspan="6">Could not load.</td></tr>'; return; }
  const rows = result.data || [];
  tbody.innerHTML = rows.length ? rows.map(p => {
    const rep = (p.representations || [])[0];
    const listing = rep && (rep.listings || [])[0];
    const title = listing && (listing.listing_content || []).find(c => c.locale === 'en');
    const status = listing ? listing.status : 'draft';
    return `<tr onclick="navigateAdmin('properties','${p.id}')" style="cursor:pointer">
      <td>${title ? escapeHtml(title.title) : '(untitled)'}</td><td>${p.subtype}</td>
      <td>${p.zones_lite ? escapeHtml(p.zones_lite.name) : ''}</td>
      <td>${rep && rep.partners ? escapeHtml(rep.partners.name) : ''}</td>
      <td><span class="tag tag-${status==='published'?'published':'draft'}">${status}</span></td>
      <td><span onclick="event.stopPropagation(); duplicatePropertyRow('${p.id}')" style="cursor:pointer; color:#555;">Duplicate</span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6">No properties yet.</td></tr>';
}
async function duplicatePropertyRow(id) {
  const result = await window.ZFindServices.admin.duplicateProperty(id);
  showStatus(result.error ? 'error' : 'success', result.error ? 'Could not duplicate.' : 'Duplicated.');
  if (!result.error) loadPropertiesList();
}
async function showNewPropertyForm() {
  const zones = await getZonesCached();
  document.getElementById('new-prop-form').innerHTML = `
    <div class="detail-panel" style="margin-bottom:16px;">
      <div class="form-field"><label>Subtype</label><select id="npr-subtype"><option value="apartment">Apartment</option><option value="villa">Villa</option><option value="land">Land</option></select></div>
      <div class="form-field"><label>Typology</label><input type="text" id="npr-typology" placeholder="e.g. T2"></div>
      <div class="form-field"><label>Area (m²)</label><input type="number" id="npr-area"></div>
      <div class="form-field"><label>Zone</label>${zoneComboHTML('npr-zone', zones, null)}</div>
      <button class="btn btn-primary" onclick="submitNewProperty()">Create</button>
    </div>`;
}
async function submitNewProperty() {
  const result = await window.ZFindServices.admin.createProperty({
    subtype: document.getElementById('npr-subtype').value,
    typology: document.getElementById('npr-typology').value.trim() || null,
    areaSqm: Number(document.getElementById('npr-area').value) || null,
    zoneLiteId: document.getElementById('npr-zone').value,
  });
  if (result.error) { showStatus('error', 'Could not create property.'); return; }
  document.getElementById('new-prop-form').innerHTML = '';
  showStatus('success', 'Property created.');
  loadPropertiesList();
}
async function renderPropertyEdit() {
  const result = await window.ZFindServices.admin.getPropertyForEdit(adminState.id);
  const main = document.getElementById('main');
  if (result.error) { main.insertAdjacentHTML('beforeend', 'Could not load.'); return; }
  await renderAssetEditShell(main, { kind: 'property', data: result.data, backView: 'properties' });
}

/** Shared edit shell for Property/Development: translations (3
    locale tabs), explicit marketplace lifecycles, and a media manager. Photos use
    DIFFERENT tables depending on kind — a Development's own photos
    (development_media) exist independently of whether it has a
    listing yet; a Property's photos (listing_media) are tied to its
    listing. Both are supported, correctly, using the real composite
    key (media_asset_id + owner id) on each table. */

const REPRESENTATION_ADMIN_TRANSITIONS = Object.freeze({
  proposed: Object.freeze([
    ['active', 'Activate'],
    ['disputed', 'Dispute']
  ]),
  active: Object.freeze([
    ['disputed', 'Dispute'],
    ['ended', 'End']
  ]),
  disputed: Object.freeze([
    ['active', 'Resolve → active'],
    ['ended', 'End']
  ]),
  ended: Object.freeze([])
});

const LISTING_ADMIN_TRANSITIONS = Object.freeze({
  draft: Object.freeze([
    ['pending_review', 'Submit review'],
    ['incomplete', 'Mark incomplete'],
    ['archived', 'Archive']
  ]),

  incomplete: Object.freeze([
    ['draft', 'Back to draft'],
    ['pending_review', 'Submit review'],
    ['archived', 'Archive']
  ]),

  pending_review: Object.freeze([
    ['incomplete', 'Mark incomplete'],
    ['ready', 'Mark ready'],
    ['archived', 'Archive']
  ]),

  ready: Object.freeze([
    ['pending_review', 'Return to review'],
    ['published', 'Publish'],
    ['archived', 'Archive']
  ]),

  published: Object.freeze([
    ['suspended', 'Suspend'],
    ['archived', 'Archive']
  ]),

  suspended: Object.freeze([
    ['ready', 'Return to ready'],
    ['archived', 'Archive']
  ]),

  archived: Object.freeze([])
});


function lifecycleTag(status) {
  const visual =
    status === 'published'
      ? 'published'
      : 'draft';

  return `<span class="tag tag-${visual}">${escapeHtml(status)}</span>`;
}


function renderRepresentationLifecycleControls(rep) {
  if (!rep) return '';

  const transitions =
    REPRESENTATION_ADMIN_TRANSITIONS[rep.status] || [];

  const buttons = transitions
    .map(([toStatus, label]) => (
      `<button class="btn"
        onclick="transitionRepresentation('${rep.id}','${toStatus}')"
      >${label}</button>`
    ))
    .join('');

  return `
    <span style="margin-right:8px;">
      Representation:
      ${lifecycleTag(rep.status)}
      ${buttons}
    </span>
  `;
}


function renderListingLifecycleControls(listing) {
  if (!listing) return '';

  const transitions =
    LISTING_ADMIN_TRANSITIONS[listing.status] || [];

  const buttons = transitions
    .map(([toStatus, label]) => {
      const cls =
        toStatus === 'published'
          ? 'btn btn-primary'
          : 'btn';

      return (
        `<button class="${cls}"
          onclick="transitionListing('${listing.id}','${toStatus}')"
        >${label}</button>`
      );
    })
    .join('');

  return `
    <span style="margin-right:8px;">
      Listing:
      ${lifecycleTag(listing.status)}
      ${buttons}
    </span>
  `;
}


async function renderAssetEditShell(main, opts) {
  const rep = (opts.data.representations || [])[0];
  const listing = rep && (rep.listings || [])[0];
  const contentByLocale = {};
  (listing ? listing.listing_content || [] : []).forEach(c => { contentByLocale[c.locale] = c; });
  const isPublished = listing && listing.status === 'published';
  const mediaOwnerId = opts.kind === 'development' ? opts.data.id : (listing ? listing.id : null);
  const mediaKind = opts.kind === 'development' ? 'development' : 'listing';
  const zones = await getZonesCached();
  const d = opts.data;

  main.insertAdjacentHTML('beforeend', `
    <a class="back-link" onclick="navigateAdmin('${opts.backView}')">← Back</a>
    <div class="page-title">
      ${opts.kind === 'development' ? escapeHtml(d.name) : 'Edit property'}
      <span>
        ${rep ? renderRepresentationLifecycleControls(rep) : ''}
        ${listing
          ? renderListingLifecycleControls(listing)
          : `<button class="btn btn-primary" onclick="createInitialListingUi('${opts.kind}','${d.id}','${rep ? rep.partner_id : ''}')">Create listing</button>`}
        <button class="btn" onclick="duplicateAsset('${opts.kind}','${d.id}')">Duplicate</button>
        <button class="btn btn-danger" onclick="deleteAsset('${opts.kind}','${d.id}','${opts.backView}')">Delete</button>
      </span>
    </div>

    <div class="page-title" style="font-size:1.1rem;">Details</div>
    <div class="detail-panel" style="margin-bottom:20px;">
      ${opts.kind === 'property' ? `
        <div class="form-grid">
          <div class="form-field"><label>Subtype</label><select id="attr-subtype"><option value="apartment" ${d.subtype==='apartment'?'selected':''}>Apartment</option><option value="villa" ${d.subtype==='villa'?'selected':''}>Villa</option><option value="land" ${d.subtype==='land'?'selected':''}>Land</option></select></div>
          <div class="form-field"><label>Typology</label><input type="text" id="attr-typology" value="${escapeHtml(d.typology||'')}"></div>
          <div class="form-field"><label>Area (m²)</label><input type="number" id="attr-area" value="${d.area_sqm||''}"></div>
          <div class="form-field"><label>Floor</label><input type="number" id="attr-floor" value="${d.floor||''}"></div>
          <div class="form-field"><label>Zone</label>${zoneComboHTML('attr-zone', zones, d.zone_lite_id)}</div>
        </div>
        <button class="btn btn-primary" onclick="saveAssetAttrs('property','${d.id}')">Save details</button>
      ` : `
        <div class="form-grid">
          <div class="form-field"><label>Name</label><input type="text" id="attr-name" value="${escapeHtml(d.name)}"></div>
          <div class="form-field"><label>Zone</label>${zoneComboHTML('attr-zone', zones, d.zone_lite_id)}</div>
        </div>
        <button class="btn btn-primary" onclick="saveAssetAttrs('development','${d.id}')">Save details</button>
      `}
    </div>

    ${opts.kind === 'property' ? window.ZFindServices.fieldForms.renderPropertyExtendedFields(d) : window.ZFindServices.fieldForms.renderDevelopmentExtendedFields(d)}

    ${opts.kind === 'development' ? `
      <div class="page-title" style="font-size:1.1rem;">Units</div>
      <div class="detail-panel" style="margin-bottom:20px;">
        <div id="units-list">Loading…</div>
        <button class="btn btn-primary" style="margin-top:14px;" onclick="addUnitToDevelopment('${d.id}', '${escapeHtml(d.zone_lite_id||'')}')">+ Add unit</button>
      </div>
    ` : ''}

    <div class="page-title" style="font-size:1.1rem;">Features</div>
    <div class="detail-panel" style="margin-bottom:20px;">
      <div id="features-grid">Loading…</div>
      <button class="btn btn-primary" style="margin-top:14px;" onclick="saveFeatures('${opts.kind}','${d.id}')">Save features</button>
    </div>

    <div class="locale-tabs">${LOCALES.map(l => `<div class="locale-tab ${l==='en'?'active':''}" data-locale="${l}" onclick="switchLocaleTab('${l}')">${l.toUpperCase()}</div>`).join('')}</div>
    <div class="detail-panel" style="margin-bottom:20px;">
      ${listing ? LOCALES.map(l => `
        <div class="locale-content" data-locale="${l}" ${l!=='en'?'style="display:none"':''}>
          <div class="form-field"><label>Title (${l.toUpperCase()})</label><input type="text" id="content-title-${l}" value="${escapeHtml((contentByLocale[l]||{}).title||'')}"></div>
          <div class="form-field"><label>Description (${l.toUpperCase()})</label><textarea id="content-desc-${l}">${escapeHtml((contentByLocale[l]||{}).description||'')}</textarea></div>
          <button class="btn btn-primary" onclick="saveTranslation('${listing.id}','${l}')">Save ${l.toUpperCase()}</button>
        </div>`).join('') : `<p style="color:#999;">Create a listing above before editing translations.</p>`}
    </div>
    <div class="page-title" style="font-size:1.1rem;">Photos</div>
    <div class="media-grid" id="media-grid" data-owner-id="${mediaOwnerId||''}" data-media-kind="${mediaKind}">Loading…</div>
    ${mediaOwnerId ? `<input type="file" id="media-upload-input" accept="image/*" onchange="handleMediaUpload('${mediaOwnerId}','${mediaKind}')">` : '<p style="color:#999;">Photos become available once this record is fully created.</p>'}
  `);
  if (mediaOwnerId) loadMediaGrid(mediaOwnerId, mediaKind);
  loadFeaturesGrid(opts.kind, d.id);
  if (opts.kind === 'development') loadUnitsList(d.id);
}

/** Units: properties where development_id = this development. Each
    row links straight into the property's own full edit view (same
    30+ field taxonomy, same Features) — a unit is a real Property,
    never a lighter/different record just because it belongs to a
    development. */
async function loadUnitsList(developmentId) {
  const listEl = document.getElementById('units-list');
  if (!listEl) return;
  const result = await window.ZFindServices.admin.listUnitsForDevelopment(developmentId);
  if (result.error) { listEl.innerHTML = 'Could not load units.'; return; }
  if (!result.data.length) { listEl.innerHTML = '<p style="color:#999;">No units yet.</p>'; return; }
  listEl.innerHTML = result.data.map(u => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--gray-200,#eee); cursor:pointer;" onclick="navigateAdmin('properties','${u.id}')">
      <span>${escapeHtml(u.typology || u.subtype || 'Unit')}${u.area_sqm ? ' · ' + u.area_sqm + ' m²' : ''}${u.floor != null ? ' · Floor ' + u.floor : ''}</span>
      <span style="color:#999; font-size:0.8rem;">${u.zones_lite ? escapeHtml(u.zones_lite.name) : ''}</span>
    </div>`).join('');
}

/** New unit inherits the development's own zone by default — a real
    convenience (units are almost always in the same zone as their
    development), never forced (still editable afterward like any
    other field). */
async function addUnitToDevelopment(developmentId, zoneLiteId) {
  const result = await window.ZFindServices.admin.createProperty({ subtype: 'apartment', typology: null, areaSqm: null, floor: null, zoneLiteId: zoneLiteId || null, developmentId });
  if (result.error) { showStatus('error', 'Could not create unit.'); return; }
  showStatus('success', 'Unit added.');
  loadUnitsList(developmentId);
}

async function saveAssetAttrs(kind, id) {
  let result;
  if (kind === 'property') {
    result = await window.ZFindServices.admin.updateProperty(id, {
      subtype: document.getElementById('attr-subtype').value,
      typology: document.getElementById('attr-typology').value.trim() || null,
      areaSqm: Number(document.getElementById('attr-area').value) || null,
      floor: Number(document.getElementById('attr-floor').value) || null,
      zoneLiteId: document.getElementById('attr-zone').value,
    });
  } else {
    result = await window.ZFindServices.admin.updateDevelopment(id, {
      name: document.getElementById('attr-name').value.trim(),
      zoneLiteId: document.getElementById('attr-zone').value,
    });
  }
  showStatus(result.error ? 'error' : 'success', result.error ? 'Could not save details.' : 'Details saved.');
}

/** Collects every Migration 0005 field for the given kind and saves
    them in one call. Numeric fields use Number(...) || null pattern
    consistently — an empty input becomes null (field genuinely
    unknown), never a stored zero that would misrepresent a real
    value. Text fields trim and become null when empty, never an
    empty string sitting in the database ambiguously. */
async function saveExtendedAttrs(kind, id) {
  const result = kind === 'property'
    ? await window.ZFindServices.admin.updateProperty(id, window.ZFindServices.fieldForms.readPropertyExtendedFieldsFromDOM())
    : await window.ZFindServices.admin.updateDevelopment(id, window.ZFindServices.fieldForms.readDevelopmentExtendedFieldsFromDOM());
  showStatus(result.error ? 'error' : 'success', result.error ? 'Could not save fields.' : 'Fields saved.');
}

/** Renders the shared 36-feature checklist for either a Property or a
    Development, pre-checking whichever ones are already linked via
    property_features / development_features. */
async function loadFeaturesGrid(kind, id) {
  const grid = document.getElementById('features-grid');
  if (!grid) return;
  const [allFeatures, linked] = await Promise.all([
    window.ZFindServices.admin.listFeatures(),
    kind === 'property' ? window.ZFindServices.admin.getPropertyFeatureIds(id) : window.ZFindServices.admin.getDevelopmentFeatureIds(id),
  ]);
  if (allFeatures.error) { grid.innerHTML = 'Could not load features.'; return; }
  const linkedIds = new Set((linked.data || []).map(r => r.feature_id));
  grid.innerHTML = window.ZFindServices.fieldForms.renderFeaturesChecklist(allFeatures.data, linkedIds);
}

async function saveFeatures(kind, id) {
  const checked = Array.from(document.querySelectorAll('.feature-checkbox:checked')).map(el => el.value);
  const result = kind === 'property'
    ? await window.ZFindServices.admin.setPropertyFeatures(id, checked)
    : await window.ZFindServices.admin.setDevelopmentFeatures(id, checked);
  showStatus(result.error ? 'error' : 'success', result.error ? 'Could not save features.' : `${checked.length} feature(s) saved.`);
}

async function duplicateAsset(kind, id) {
  const result = kind === 'property' ? await window.ZFindServices.admin.duplicateProperty(id) : await window.ZFindServices.admin.duplicateDevelopment(id);
  showStatus(result.error ? 'error' : 'success', result.error ? 'Could not duplicate.' : 'Duplicated.');
  if (!result.error) navigateAdmin(kind === 'property' ? 'properties' : 'developments');
}

async function deleteAsset(kind, id, backView) {
  const ok = await askConfirm('Delete ' + kind, 'This cannot be undone.', 'Delete');
  if (!ok) return;
  const result = kind === 'property' ? await window.ZFindServices.admin.deleteProperty(id)
    : kind === 'development' ? await window.ZFindServices.admin.deleteDevelopment(id)
    : await window.ZFindServices.admin.deletePartner(id);
  if (result.error) { showStatus('error', result.error.message || 'Could not delete.'); return; }
  navigateAdmin(backView);
}

/** Fills the gap noted in the previous delivery: a Property or
    Development created via "+ New…" has no representation/listing yet,
    so it cannot be published or photographed until one exists.
    Routed through admin.createInitialListing() — the UI itself never
    calls Supabase directly (this previously did, corrected here). */

function renderListingCommercialEditor(listing) {
  if (!listing) return '';

  const transactionType =
    listing.transaction_type === 'rent' ? 'rent' : 'sale';

  const rentalPeriod =
    ['monthly', 'seasonal', 'yearly']
      .includes(listing.rental_period)
      ? listing.rental_period
      : 'monthly';

  const channel =
    listing.channel === 'offmarket'
      ? 'offmarket'
      : 'standard';

  const currency =
    String(listing.currency_iso || 'EUR')
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 3)
      .toUpperCase();

  const price =
    Number.isFinite(Number(listing.price_current))
      ? Number(listing.price_current)
      : 0;

  return `
    <div
      id="listing-commercial-editor"
      style="
        margin:18px 0;
        padding:18px;
        border:1px solid #e7e7e7;
        border-radius:10px;
        background:#fff;
      "
    >
      <div style="margin-bottom:14px;">
        <strong>Commercial terms</strong>
        <div style="font-size:.8rem;color:#777;margin-top:4px;">
          Market terms only. Listing and Representation lifecycle remain
          controlled separately.
        </div>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
          gap:12px;
        "
      >
        <label>
          <span>Market</span>
          <select
            id="listing-transaction-type"
            onchange="syncListingRentalPeriodControl()"
          >
            <option value="sale" ${
              transactionType === 'sale' ? 'selected' : ''
            }>Sale</option>
            <option value="rent" ${
              transactionType === 'rent' ? 'selected' : ''
            }>Rental</option>
          </select>
        </label>

        <label
          id="listing-rental-period-wrap"
          style="${
            transactionType === 'rent'
              ? ''
              : 'display:none;'
          }"
        >
          <span>Rental period</span>
          <select id="listing-rental-period">
            <option value="monthly" ${
              rentalPeriod === 'monthly' ? 'selected' : ''
            }>Monthly</option>
            <option value="seasonal" ${
              rentalPeriod === 'seasonal' ? 'selected' : ''
            }>Seasonal</option>
            <option value="yearly" ${
              rentalPeriod === 'yearly' ? 'selected' : ''
            }>Yearly</option>
          </select>
        </label>

        <label>
          <span>Price</span>
          <input
            id="listing-price-current"
            type="number"
            min="0"
            step="0.01"
            value="${price}"
          >
        </label>

        <label>
          <span>Currency</span>
          <input
            id="listing-currency-iso"
            type="text"
            maxlength="3"
            value="${currency}"
            placeholder="EUR"
          >
        </label>

        <label>
          <span>Distribution</span>
          <select id="listing-channel">
            <option value="standard" ${
              channel === 'standard' ? 'selected' : ''
            }>Standard</option>
            <option value="offmarket" ${
              channel === 'offmarket' ? 'selected' : ''
            }>Off-market</option>
          </select>
        </label>

        <label style="display:flex;align-items:center;gap:8px;">
          <input
            id="listing-price-is-from"
            type="checkbox"
            ${listing.price_is_from ? 'checked' : ''}
          >
          <span>Price is “from”</span>
        </label>
      </div>

      <button
        class="btn btn-primary"
        style="margin-top:14px;"
        onclick="saveListingCommercial('${listing.id}')"
      >
        Save commercial terms
      </button>
    </div>
  `;
}


function syncListingRentalPeriodControl() {
  const type = document.getElementById(
    'listing-transaction-type'
  );

  const wrap = document.getElementById(
    'listing-rental-period-wrap'
  );

  const period = document.getElementById(
    'listing-rental-period'
  );

  if (!type || !wrap) return;

  const isRent = type.value === 'rent';

  wrap.style.display = isRent ? '' : 'none';

  if (
    isRent &&
    period &&
    !['monthly', 'seasonal', 'yearly']
      .includes(period.value)
  ) {
    period.value = 'monthly';
  }
}


async function saveListingCommercial(listingId) {
  const transactionType =
    document.getElementById(
      'listing-transaction-type'
    ).value;

  const rentalPeriod =
    transactionType === 'rent'
      ? document.getElementById(
          'listing-rental-period'
        ).value
      : null;

  const priceCurrent =
    document.getElementById(
      'listing-price-current'
    ).value;

  const currencyIso =
    document.getElementById(
      'listing-currency-iso'
    ).value;

  const channel =
    document.getElementById(
      'listing-channel'
    ).value;

  const priceIsFrom =
    document.getElementById(
      'listing-price-is-from'
    ).checked;

  const result =
    await window.ZFindServices.admin
      .updateListingCommercial(
        listingId,
        {
          transactionType,
          rentalPeriod,
          priceCurrent,
          currencyIso,
          channel,
          priceIsFrom
        }
      );

  showStatus(
    result.error ? 'error' : 'success',
    result.error
      ? (
          result.error.message ||
          'Could not save commercial terms.'
        )
      : 'Commercial terms saved.'
  );

  if (!result.error) {
    syncListingRentalPeriodControl();
  }
}


async function createInitialListingUi(kind, ownerId, existingPartnerId) {
  let partnerId = existingPartnerId;
  if (!partnerId) {
    const partners = await getPartnersCached();
    if (!partners.length) { showStatus('error', 'Create a partner first — a listing must be represented by one.'); return; }
    partnerId = partners[0].id;
  }
  const result = await window.ZFindServices.admin.createInitialListing(kind, ownerId, partnerId);
  showStatus(result.error ? 'error' : 'success', result.error ? 'Could not create the listing.' : 'Listing created — set a real price and translations below.');
  if (!result.error) render();
}
function switchLocaleTab(locale) {
  document.querySelectorAll('.locale-tab').forEach(t => t.classList.toggle('active', t.dataset.locale === locale));
  document.querySelectorAll('.locale-content').forEach(c => { c.style.display = c.dataset.locale === locale ? '' : 'none'; });
}
async function saveTranslation(listingId, locale) {
  const title = document.getElementById(`content-title-${locale}`).value.trim();
  const description = document.getElementById(`content-desc-${locale}`).value.trim();
  const result = await window.ZFindServices.admin.upsertListingContent(listingId, locale, { title, description });
  showStatus(result.error ? 'error' : 'success', result.error ? 'Could not save translation.' : `Saved ${locale.toUpperCase()}.`);
}
async function transitionListing(listingId, toStatus) {
  const result =
    await window.ZFindServices.admin
      .setListingStatus(listingId, toStatus);

  showStatus(
    result.error ? 'error' : 'success',
    result.error
      ? (result.error.message || 'Could not update Listing status.')
      : `Listing moved to ${toStatus}.`
  );

  if (!result.error) render();
}

async function transitionRepresentation(
  representationId,
  toStatus
) {
  const result =
    await window.ZFindServices.admin
      .setRepresentationStatus(
        representationId,
        toStatus
      );

  showStatus(
    result.error ? 'error' : 'success',
    result.error
      ? (
          result.error.message
          || 'Could not update Representation status.'
        )
      : `Representation moved to ${toStatus}.`
  );

  if (!result.error) render();
}

/* ---------------- Media manager ---------------- */
function _mediaAdminFns(kind) {
  return kind === 'development'
    ? { list: window.ZFindServices.admin.listDevelopmentMedia, reorder: window.ZFindServices.admin.reorderDevelopmentMedia, setCover: window.ZFindServices.admin.setCoverDevelopmentMedia, del: window.ZFindServices.admin.deleteDevelopmentMedia, upload: window.ZFindServices.admin.uploadDevelopmentMedia }
    : { list: window.ZFindServices.admin.listListingMedia, reorder: window.ZFindServices.admin.reorderListingMedia, setCover: window.ZFindServices.admin.setCoverMedia, del: window.ZFindServices.admin.deleteListingMedia, upload: window.ZFindServices.admin.uploadListingMedia };
}
async function loadMediaGrid(ownerId, kind) {
  const grid = document.getElementById('media-grid');
  const fns = _mediaAdminFns(kind);
  const result = await fns.list(ownerId);
  if (result.error) { grid.textContent = 'Could not load photos.'; return; }
  const items = result.data || [];
  grid.innerHTML = items.length ? items.map(m => `
    <div class="media-item ${m.is_cover?'cover':''}" draggable="true" data-media-asset-id="${m.media_asset_id}" ondragstart="mediaDragStart(event)" ondragover="event.preventDefault()" ondrop="mediaDrop(event,'${ownerId}','${kind}')">
      ${m.is_cover ? '<span class="cover-badge">Cover</span>' : ''}
      <img src="${m.url || ''}" alt="" onclick="event.stopPropagation(); openLightbox('${m.url || ''}')">      <div class="actions">
        <span onclick="setCover('${ownerId}','${kind}','${m.media_asset_id}')">Set cover</span>
        <span onclick="deleteMedia('${ownerId}','${kind}','${m.media_asset_id}','${m.media_assets.original_storage_path}')">✕</span>
      </div>
    </div>`).join('') : '<p style="color:#999;">No photos yet.</p>';
}
let mediaDragSourceId = null;
function mediaDragStart(e) { mediaDragSourceId = e.target.closest('.media-item').dataset.mediaAssetId; }
async function mediaDrop(e, ownerId, kind) {
  e.preventDefault();
  const target = e.target.closest('.media-item');
  if (!target || target.dataset.mediaAssetId === mediaDragSourceId) return;
  const ids = Array.from(document.querySelectorAll('#media-grid .media-item')).map(el => el.dataset.mediaAssetId);
  const from = ids.indexOf(mediaDragSourceId), to = ids.indexOf(target.dataset.mediaAssetId);
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  await _mediaAdminFns(kind).reorder(ownerId, ids);
  loadMediaGrid(ownerId, kind);
}
async function setCover(ownerId, kind, mediaAssetId) {
  await _mediaAdminFns(kind).setCover(ownerId, mediaAssetId);
  loadMediaGrid(ownerId, kind);
}
async function deleteMedia(ownerId, kind, mediaAssetId, storagePath) {
  await _mediaAdminFns(kind).del(ownerId, mediaAssetId, storagePath);
  loadMediaGrid(ownerId, kind);
}
async function handleMediaUpload(ownerId, kind) {
  const input = document.getElementById('media-upload-input');
  const file = input.files[0];
  if (!file) return;
  showStatus('success', 'Uploading…');
  const result = await _mediaAdminFns(kind).upload(ownerId, file, {});
  showStatus(result.error ? 'error' : 'success', result.error ? 'Upload failed.' : 'Uploaded.');
  input.value = '';
  if (!result.error) loadMediaGrid(ownerId, kind);
}

/* ---------------- Leads ---------------- */
async function renderLeadsList() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', `
    <div class="page-title">Leads</div>
    <div class="toolbar">
      <input type="text" id="lead-search" placeholder="Search name, email, phone, message…" oninput="loadLeadsList()">
      <select id="lead-filter" onchange="loadLeadsList()"><option value="">All types</option><option value="direct">Direct</option><option value="qualified">Qualified</option><option value="assisted">Assisted</option></select>
    </div>
    <table><thead><tr><th>Date</th><th>Name</th><th>Contact</th><th>Type</th></tr></thead><tbody id="leads-tbody"><tr><td colspan="4">Loading…</td></tr></tbody></table>`);
  await loadLeadsList();
}
async function loadLeadsList() {
  const searchText = document.getElementById('lead-search').value;
  const contactType = document.getElementById('lead-filter').value;
  const result = await window.ZFindServices.admin.listLeads({ searchText, contactType });
  const tbody = document.getElementById('leads-tbody');
  if (result.error) { tbody.innerHTML = '<tr><td colspan="4">Could not load leads.</td></tr>'; return; }
  const rows = result.data || [];
  tbody.innerHTML = rows.length ? rows.map(l => `
    <tr onclick="navigateAdmin('leads','${l.id}')" style="cursor:pointer">
      <td>${new Date(l.created_at).toLocaleDateString()}</td><td>${escapeHtml(l.name||'')}</td>
      <td>${escapeHtml([l.email, l.phone].filter(Boolean).join(' · '))}</td><td>${l.contact_type}</td>
    </tr>`).join('') : '<tr><td colspan="4">No leads yet.</td></tr>';
}
async function renderLeadDetail() {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', '<div id="lead-detail-root">Loading…</div>');
  const result = await window.ZFindServices.admin.getLeadById(adminState.id);
  const root = document.getElementById('lead-detail-root');
  if (result.error) { root.textContent = 'Could not load lead.'; return; }
  const l = result.data;
  root.innerHTML = `
    <a class="back-link" onclick="navigateAdmin('leads')">← Back to leads</a>
    <div class="page-title">Lead detail</div>
    <div class="detail-panel">
      <div class="row"><span class="k">Date</span><span>${new Date(l.created_at).toLocaleString()}</span></div>
      <div class="row"><span class="k">Name</span><span>${escapeHtml(l.name||'')}</span></div>
      <div class="row"><span class="k">Email</span><span>${escapeHtml(l.email||'—')}</span></div>
      <div class="row"><span class="k">Phone</span><span>${escapeHtml(l.phone||'—')}</span></div>
      <div class="row"><span class="k">Type</span><span>${l.contact_type}</span></div>
      <div class="row"><span class="k">Listing</span><span>${l.listing_id}</span></div>
      <div style="margin-top:14px; white-space:pre-wrap; font-size:.85rem; color:#444;">${escapeHtml(l.message||'')}</div>
    </div>`;
}

/* ---------------- Small shared helpers ---------------- */
async function getZonesCached() {
  if (adminState.zonesCache) return adminState.zonesCache;
  const result = await window.ZFindServices.admin.listZones();
  adminState.zonesCache = result.data || [];
  return adminState.zonesCache;
}
async function getPartnersCached() {
  if (adminState.partnersCache) return adminState.partnersCache;
  const result = await window.ZFindServices.admin.listPartners();
  adminState.partnersCache = result.data || [];
  return adminState.partnersCache;
}
/* ---------------- Searchable zone combo (pattern from Z Imobiliária's admin) ----------------
   Renders as HTML (call inside a template literal), backed by a
   hidden <input>, so every existing call site that reads
   document.getElementById(id).value keeps working with zero changes. */
let zoneComboZones = {};
function zoneComboHTML(id, zones, selectedId) {
  zoneComboZones[id] = zones;
  const selectedZone = zones.find(z => String(z.id) === String(selectedId));
  return `
    <div class="zone-combo" id="${id}-wrap">
      <input type="hidden" id="${id}" value="${selectedId || ''}">
      <button type="button" class="zone-combo-btn" onclick="toggleZoneCombo('${id}')">
        <span id="${id}-label">${selectedZone ? escapeHtml(selectedZone.name) + ', ' + escapeHtml(selectedZone.city) : '— Select zone —'}</span>
        <span style="opacity:.6">▾</span>
      </button>
      <div class="zone-combo-panel" id="${id}-panel">
        <input type="text" class="zone-combo-search" placeholder="Search zone…" oninput="renderZoneComboList('${id}', this.value)" onclick="event.stopPropagation()">
        <div class="zone-combo-list" id="${id}-list"></div>
      </div>
    </div>`;
}
function toggleZoneCombo(id) {
  const panel = document.getElementById(id + '-panel');
  const wasOpen = panel.classList.contains('open');
  document.querySelectorAll('.zone-combo-panel.open').forEach(p => p.classList.remove('open'));
  if (!wasOpen) { panel.classList.add('open'); renderZoneComboList(id, ''); }
}
function renderZoneComboList(id, filter) {
  const list = document.getElementById(id + '-list');
  if (!list) return;
  const q = (filter || '').toLowerCase().trim();
  const zones = zoneComboZones[id] || [];
  const selected = document.getElementById(id).value;
  const matches = zones.filter(z => !q || z.name.toLowerCase().includes(q) || z.city.toLowerCase().includes(q));
  list.innerHTML = matches.length
    ? matches.map(z => `<button type="button" class="zone-combo-item ${String(z.id)===String(selected)?'selected':''}" onclick="selectZoneCombo('${id}','${z.id}')">${escapeHtml(z.name)}, ${escapeHtml(z.city)}</button>`).join('')
    : '<div class="zone-combo-empty">No results.</div>';
}
function selectZoneCombo(id, zoneId) {
  document.getElementById(id).value = zoneId;
  const zone = (zoneComboZones[id] || []).find(z => String(z.id) === String(zoneId));
  document.getElementById(id + '-label').textContent = zone ? zone.name + ', ' + zone.city : '';
  document.getElementById(id + '-panel').classList.remove('open');
}
document.addEventListener('click', (e) => {
  document.querySelectorAll('.zone-combo-panel.open').forEach(p => {
    const wrap = p.closest('.zone-combo');
    if (wrap && !wrap.contains(e.target)) p.classList.remove('open');
  });
});

function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

/** Lightbox — click a media thumbnail to view it full-size. Pattern
    adapted from Z Imobiliária's admin. */
function openLightbox(url) {
  if (!url) return;
  const overlay = document.getElementById('lightbox-overlay');
  overlay.innerHTML = `<img src="${url}" alt="">`;
  overlay.classList.remove('hidden');
}
function closeLightbox() {
  const overlay = document.getElementById('lightbox-overlay');
  overlay.classList.add('hidden');
  overlay.innerHTML = '';
}

document.addEventListener('DOMContentLoaded', initAdmin);
