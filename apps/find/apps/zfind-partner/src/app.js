/* ============================================================
   Z FIND PARTNER — APP.JS
   ============================================================
   Deliberately small: login + a strict role check + an empty
   dashboard shell that proves real isolation (Migration 0006/0007),
   not a promise of it. No property/lead management yet — that's
   the next announced step, built once this foundation is confirmed
   working end-to-end in a real browser, not just via curl.
   ============================================================ */

async function boot() {
  const { data: sessionData } = await window.ZFindServices.auth.getSession();
  const session = sessionData && sessionData.session;
  if (session) {
    await tryEnterDashboard();
  }
}

async function handlePartnerLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  if (!email || !password) {
    errorEl.textContent = 'Enter your email and password.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Signing in…';

  const result = await window.ZFindServices.auth.signIn(email, password);
  if (result.error) {
    errorEl.textContent = 'Incorrect email or password.';
    btn.disabled = false;
    btn.textContent = 'Sign in';
    return;
  }

  await tryEnterDashboard();
  btn.disabled = false;
  btn.textContent = 'Sign in';
}


/** Same discipline as the Admin's role !== 'admin' check — a
    successful Supabase login is NOT the same as being allowed into
    this app. Anyone who isn't specifically partner_user is signed
    back out immediately, with a clear reason, never silently let
    through to a dashboard that isn't theirs to use. */
async function tryEnterDashboard() {
  const profileResult = await window.ZFindServices.auth.getCurrentProfile();
  const errorEl = document.getElementById('login-error');

  if (profileResult.error || !profileResult.data || profileResult.data.role !== 'partner_user' || !profileResult.data.partner_id) {
    await window.ZFindServices.auth.signOut();
    if (errorEl) errorEl.textContent = 'This account is not set up as a Z Find partner.';
    return;
  }

  const partnerId = profileResult.data.partner_id;
  const partnerResult = await window.ZFindServices.partnerDashboard.getOwnPartnerSummary(partnerId);

  document.getElementById('view-login').style.display = 'none';
  document.getElementById('view-dashboard').style.display = '';
  document.getElementById('dash-partner-name').textContent = partnerResult.data ? partnerResult.data.name : '';
  loadPortfolio();
}

/** Loads the partner's own properties/developments — reuses admin.js's
    listProperties/listDevelopments UNCHANGED. RLS (Migration 0006)
    does all the actual restricting; this never adds a partner_id
    filter itself, by design — if it needed to, that would mean RLS
    isn't trustworthy on its own, which the isolation test already
    disproved. */
async function loadPortfolio() {
  const listEl = document.getElementById('portfolio-list');
  const [propsResult, devsResult] = await Promise.all([
    window.ZFindServices.admin.listProperties(),
    window.ZFindServices.admin.listDevelopments(),
  ]);
  const properties = propsResult.error ? [] : propsResult.data;
  const developments = devsResult.error ? [] : devsResult.data;

  if (!properties.length && !developments.length) {
    listEl.innerHTML = '<div class="portfolio-empty">Nothing here yet — add your first property or development above.</div>';
    return;
  }

  const propRows = properties.map(p => `
    <div class="portfolio-row" onclick="openDetail('property','${p.id}')">
      <div>
        <div class="name">${escapeHtmlPartner(p.typology || p.subtype || 'Untitled property')}</div>
        <div class="meta">${p.zones_lite ? escapeHtmlPartner(p.zones_lite.name + ', ' + p.zones_lite.city) : 'No zone set yet'}${p.area_sqm ? ' · ' + p.area_sqm + ' m²' : ''}</div>
      </div>
      <span class="kind-tag">Property</span>
    </div>`).join('');
  const devRows = developments.map(d => `
    <div class="portfolio-row" onclick="openDetail('development','${d.id}')">
      <div>
        <div class="name">${escapeHtmlPartner(d.name)}</div>
        <div class="meta">${d.zones_lite ? escapeHtmlPartner(d.zones_lite.name + ', ' + d.zones_lite.city) : 'No zone set yet'}</div>
      </div>
      <span class="kind-tag">Development</span>
    </div>`).join('');

  listEl.innerHTML = propRows + devRows;
}

function escapeHtmlPartner(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

/** No name field exists for a property — creates immediately with
    sensible minimal defaults ('apartment', status 'proposed', not
    yet a live listing), same "practically free" philosophy already
    established for the Admin. Full field editing is a separate,
    later step, not this one. */
async function createNewProperty() {
  const result = await window.ZFindServices.admin.createPropertyForPartner({ subtype: 'apartment', typology: null, areaSqm: null, floor: null, zoneLiteId: null });
  if (result.error) { alert('Could not create property.'); return; }
  loadPortfolio();
}

function openNewDevelopmentForm() {
  document.getElementById('new-dev-form').style.display = '';
  document.getElementById('new-dev-name').focus();
}
function closeNewDevelopmentForm() {
  document.getElementById('new-dev-form').style.display = 'none';
  document.getElementById('new-dev-name').value = '';
  document.getElementById('new-dev-error').textContent = '';
}
async function saveNewDevelopment() {
  const name = document.getElementById('new-dev-name').value.trim();
  const errorEl = document.getElementById('new-dev-error');
  if (!name) { errorEl.textContent = 'Enter a name for the development.'; return; }
  const result = await window.ZFindServices.admin.createDevelopmentForPartner({ name, zoneLiteId: null });
  if (result.error) { errorEl.textContent = 'Could not create development.'; return; }
  closeNewDevelopmentForm();
  loadPortfolio();
}

/* ---------------- Detail view: full field taxonomy, shared with Admin ---------------- */
let detailKind = null;
let detailId = null;

function showStatus(type, message) {
  const host = document.getElementById('toast-host');
  const toast = document.createElement('div');
  toast.className = 'toast' + (type === 'error' ? ' error' : '');
  toast.textContent = message;
  host.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

async function openDetail(kind, id) {
  detailKind = kind; detailId = id;
  document.getElementById('view-dashboard').style.display = 'none';
  document.getElementById('view-detail').style.display = '';
  document.getElementById('dash-partner-name-2').textContent = document.getElementById('dash-partner-name').textContent;

  const result = kind === 'property' ? await window.ZFindServices.admin.getPropertyForEdit(id) : await window.ZFindServices.admin.getDevelopmentForEdit(id);
  if (result.error) { showStatus('error', 'Could not load.'); backToPortfolio(); return; }
  const d = result.data;

  document.getElementById('detail-title').textContent = kind === 'property' ? (d.typology || d.subtype || 'Property') : d.name;
  document.getElementById('detail-extended-fields').innerHTML = kind === 'property'
    ? window.ZFindServices.fieldForms.renderPropertyExtendedFields(d)
    : window.ZFindServices.fieldForms.renderDevelopmentExtendedFields(d);
  loadFeaturesGrid(kind, id);

  // Units only make sense for a Development — same analogous feature
  // as the Admin's own, reusing admin.js's listUnitsForDevelopment
  // and createProperty unchanged, RLS (not new code here) is what
  // correctly keeps this scoped to the partner's own development.
  const unitsSection = document.getElementById('detail-units-section');
  if (kind === 'development') {
    unitsSection.style.display = '';
    currentDevelopmentZoneLiteId = d.zone_lite_id || null;
    loadDetailUnits(id);
  } else {
    unitsSection.style.display = 'none';
  }
  ensurePartnerRemoveButton(kind, id);
}

let currentDevelopmentZoneLiteId = null;

async function loadDetailUnits(developmentId) {
  const listEl = document.getElementById('detail-units-list');
  const result = await window.ZFindServices.admin.listUnitsForDevelopment(developmentId);
  if (result.error) { listEl.innerHTML = 'Could not load units.'; return; }
  if (!result.data.length) { listEl.innerHTML = '<p style="color:var(--gray-500);">No units yet.</p>'; return; }
  listEl.innerHTML = result.data.map(u => `
    <div class="portfolio-row" onclick="openDetail('property','${u.id}')">
      <div>
        <div class="name">${escapeHtmlPartner(u.typology || u.subtype || 'Unit')}</div>
        <div class="meta">${u.area_sqm ? u.area_sqm + ' m²' : ''}${u.floor != null ? ' · Floor ' + u.floor : ''}</div>
      </div>
      <span class="kind-tag">${u.zones_lite ? escapeHtmlPartner(u.zones_lite.name) : ''}</span>
    </div>`).join('');
}

/** New unit inherits the development's own zone by default — same
    real convenience already built for Admin, still fully editable
    afterward like any other field. */
async function addUnitToCurrentDevelopment() {
  const result = await window.ZFindServices.admin.createProperty({ subtype: 'apartment', typology: null, areaSqm: null, floor: null, zoneLiteId: currentDevelopmentZoneLiteId, developmentId: detailId });
  if (result.error) { showStatus('error', 'Could not create unit.'); return; }
  showStatus('success', 'Unit added.');
  loadDetailUnits(detailId);
}

function backToPortfolio() {
  document.getElementById('view-detail').style.display = 'none';
  document.getElementById('view-dashboard').style.display = '';
  loadPortfolio();
}

function ensurePartnerRemoveButton(kind, id) {
  const host = document.getElementById('view-detail');
  if (!host) return;

  const previous = document.getElementById(
    'partner-remove-asset-zone'
  );
  if (previous) previous.remove();

  const zone = document.createElement('div');
  zone.id = 'partner-remove-asset-zone';
  zone.className = 'detail-panel';
  zone.style.marginTop = '24px';
  zone.style.borderColor = 'rgba(180,35,24,.25)';

  const label = kind === 'development'
    ? 'Delete development'
    : 'Delete property';

  zone.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;">
      <div>
        <div style="font-weight:600;">Remove from your portfolio</div>
        <div style="font-size:.86rem;color:var(--gray-500);margin-top:4px;">
          Protected leads, verification and audit history are preserved automatically when required.
        </div>
      </div>
      <button
        type="button"
        class="btn"
        style="border-color:#b42318;color:#b42318;background:#fff;"
        onclick="removePartnerAsset('${kind}','${id}')"
      >${label}</button>
    </div>
  `;

  host.appendChild(zone);
}

async function removePartnerAsset(kind, id) {
  const label = kind === 'development'
    ? 'development'
    : 'property';

  const ok = window.confirm(
    `Delete this ${label}?\n\n` +
    'It will disappear from your portfolio and from the market. ' +
    'If protected commercial or audit records exist, Z Find will ' +
    'preserve them instead of physically destroying them.'
  );

  if (!ok) return;

  const result =
    await window.ZFindServices.admin.removeAssetForPartner(
      kind,
      id
    );

  if (result.error) {
    showStatus(
      'error',
      result.error.message || `Could not delete ${label}.`
    );
    return;
  }

  const physicallyDeleted =
    result.data &&
    result.data.mode === 'hard_deleted';

  showStatus(
    'success',
    physicallyDeleted
      ? `${label === 'development' ? 'Development' : 'Property'} deleted.`
      : `${label === 'development' ? 'Development' : 'Property'} removed. Protected history was preserved.`
  );

  backToPortfolio();
}

/** Reuses the exact same shared reader Admin uses — the 30+ field ids
    are read the exact same way in both apps, never duplicated or
    allowed to drift. */
async function saveExtendedAttrs(kind, id) {
  const result = kind === 'property'
    ? await window.ZFindServices.admin.updateProperty(id, window.ZFindServices.fieldForms.readPropertyExtendedFieldsFromDOM())
    : await window.ZFindServices.admin.updateDevelopment(id, window.ZFindServices.fieldForms.readDevelopmentExtendedFieldsFromDOM());
  showStatus(result.error ? 'error' : 'success', result.error ? 'Could not save fields.' : 'Fields saved.');
}

async function loadFeaturesGrid(kind, id) {
  const grid = document.getElementById('detail-features-grid');
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

async function handlePartnerSignOut() {
  await window.ZFindServices.auth.signOut();
  document.getElementById('view-dashboard').style.display = 'none';
  document.getElementById('view-detail').style.display = 'none';
  document.getElementById('view-leads').style.display = 'none';
  document.getElementById('view-login').style.display = '';
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
}

/* ---------------- Navigation between Portfolio / Detail / Leads ---------------- */
function showPortfolioView() {
  document.getElementById('view-detail').style.display = 'none';
  document.getElementById('view-leads').style.display = 'none';
  document.getElementById('view-dashboard').style.display = '';
  loadPortfolio();
}

function showLeadsView() {
  document.getElementById('view-dashboard').style.display = 'none';
  document.getElementById('view-detail').style.display = 'none';
  document.getElementById('view-leads').style.display = '';
  document.getElementById('dash-partner-name-3').textContent = document.getElementById('dash-partner-name').textContent;
  loadLeadsView();
}

/** Reuses admin.js's listLeads UNCHANGED — same discipline as
    loadPortfolio: RLS (Migration 0006's "partner: read own leads",
    SELECT-only) does the real restricting, this never adds a
    partner_id filter itself. */
async function loadLeadsView() {
  const listEl = document.getElementById('leads-list');
  const result = await window.ZFindServices.admin.listLeads({});
  if (result.error) { listEl.innerHTML = '<div class="portfolio-empty">Could not load leads.</div>'; return; }
  if (!result.data.length) { listEl.innerHTML = '<div class="portfolio-empty">No leads yet — they\'ll appear here as soon as someone reaches out about one of your listings.</div>'; return; }

  listEl.innerHTML = result.data.map(l => {
    const contact = [l.email, l.phone].filter(Boolean).join(' · ') || 'No contact info';
    const date = new Date(l.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    return `
    <div class="lead-row">
      <div class="top">
        <span class="name">${escapeHtmlPartner(l.name || 'Unnamed')}</span>
        <span class="date">${date}</span>
      </div>
      <div class="contact">${escapeHtmlPartner(contact)} <span class="lead-status ${l.status}">${escapeHtmlPartner(l.status)}</span></div>
      ${l.message ? `<div class="message">${escapeHtmlPartner(l.message)}</div>` : ''}
    </div>`;
  }).join('');
}

boot();
