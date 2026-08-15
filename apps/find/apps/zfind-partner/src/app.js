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

let authoringTaxonomyCache = null;

async function getAuthoringTaxonomyCached() {
  if (authoringTaxonomyCache) {
    return {
      data: authoringTaxonomyCache,
      error: null
    };
  }

  const result =
    await window.ZFindServices.propertyTaxonomy
      .getAuthoringTaxonomy();

  if (!result.error) {
    authoringTaxonomyCache = result.data;
  }

  return result;
}

async function getResidentialDefaultSubtype() {
  const taxonomyResult =
    await getAuthoringTaxonomyCached();

  if (taxonomyResult.error) {
    return {
      data: null,
      error: taxonomyResult.error
    };
  }

  const subtype =
    window.ZFindServices.propertyTaxonomy
      .getDefaultSubtype(
        taxonomyResult.data,
        'residential'
      );

  if (!subtype) {
    return {
      data: null,
      error: new Error(
        'No enabled Residential Property subtype'
      )
    };
  }

  return {
    data: subtype,
    error: null
  };
}

/** No name field exists for a Property. This one-click Partner
    workflow preserves the existing lightweight creation UX, but
    its initial Residential subtype is now derived from canonical
    taxonomy sort order rather than hard-coded in the browser.
    Representation still starts as proposed; creating an Asset does
    not imply publication. */
async function createNewProperty() {
  const subtypeResult =
    await getResidentialDefaultSubtype();

  if (subtypeResult.error || !subtypeResult.data) {
    alert(
      'No Residential Property subtype is currently available.'
    );
    return;
  }

  const result =
    await window.ZFindServices.admin
      .createPropertyForPartner({
        subtype: subtypeResult.data,
        typology: null,
        areaSqm: null,
        floor: null,
        zoneLiteId: null
      });

  if (result.error) {
    alert('Could not create property.');
    return;
  }

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
  loadPartnerListingWorkspace(kind, id);
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
  const subtypeResult =
    await getResidentialDefaultSubtype();

  if (subtypeResult.error || !subtypeResult.data) {
    showStatus(
      'error',
      'No Residential subtype is available for a new unit.'
    );
    return;
  }

  const result =
    await window.ZFindServices.admin.createProperty({
      subtype: subtypeResult.data,
      typology: null,
      areaSqm: null,
      floor: null,
      zoneLiteId: currentDevelopmentZoneLiteId,
      developmentId: detailId
    });

  if (result.error) {
    showStatus(
      'error',
      'Could not create unit.'
    );
    return;
  }

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


/* ---------------- Partner Listing / Content / Media workspace ---------------- */


function renderPartnerListingCommercialEditor(listing) {
  const transactionType =
    listing.transaction_type === 'rent'
      ? 'rent'
      : 'sale';

  const rentalPeriod =
    ['monthly', 'seasonal', 'yearly']
      .includes(listing.rental_period)
      ? listing.rental_period
      : 'monthly';

  const currency =
    escapeHtmlPartner(
      String(listing.currency_iso || 'EUR')
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase()
    );

  const price =
    Number.isFinite(Number(listing.price_current))
      ? Number(listing.price_current)
      : 0;

  return `
    <div
      id="partner-listing-commercial-editor"
      style="
        border:1px solid #e5e5e5;
        border-radius:10px;
        padding:16px;
        margin-bottom:18px;
        background:#fff;
      "
    >
      <h3 style="margin:0 0 5px;">Commercial terms</h3>

      <p style="margin:0 0 14px;color:#777;font-size:.82rem;">
        You control the commercial terms of your Listing.
        Publication and lifecycle remain controlled by Z Find.
      </p>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
          gap:12px;
        "
      >
        <label>
          <span>Market</span>
          <select
            id="partner-listing-transaction-type"
            onchange="syncPartnerRentalPeriodControl()"
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
          id="partner-listing-rental-period-wrap"
          style="${
            transactionType === 'rent'
              ? ''
              : 'display:none;'
          }"
        >
          <span>Rental period</span>
          <select id="partner-listing-rental-period">
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
            id="partner-listing-price-current"
            type="number"
            min="0"
            step="0.01"
            value="${price}"
          >
        </label>

        <label>
          <span>Currency</span>
          <input
            id="partner-listing-currency-iso"
            type="text"
            maxlength="3"
            value="${currency}"
            placeholder="EUR"
          >
        </label>

        <label style="display:flex;align-items:center;gap:8px;">
          <input
            id="partner-listing-price-is-from"
            type="checkbox"
            ${listing.price_is_from ? 'checked' : ''}
          >
          <span>Price is “from”</span>
        </label>
      </div>

      <button
        class="btn btn-primary"
        style="margin-top:14px;"
        onclick="
          savePartnerListingCommercial(
            '${listing.id}'
          )
        "
      >
        Save commercial terms
      </button>
    </div>
  `;
}


function syncPartnerRentalPeriodControl() {
  const type = document.getElementById(
    'partner-listing-transaction-type'
  );

  const wrap = document.getElementById(
    'partner-listing-rental-period-wrap'
  );

  const period = document.getElementById(
    'partner-listing-rental-period'
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


async function savePartnerListingCommercial(listingId) {
  const transactionType =
    document.getElementById(
      'partner-listing-transaction-type'
    ).value;

  const rentalPeriod =
    transactionType === 'rent'
      ? document.getElementById(
          'partner-listing-rental-period'
        ).value
      : null;

  const result =
    await window.ZFindServices.admin
      .updateListingCommercial(
        listingId,
        {
          transactionType,
          rentalPeriod,
          priceCurrent:
            document.getElementById(
              'partner-listing-price-current'
            ).value,
          currencyIso:
            document.getElementById(
              'partner-listing-currency-iso'
            ).value,
          priceIsFrom:
            document.getElementById(
              'partner-listing-price-is-from'
            ).checked
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
    syncPartnerRentalPeriodControl();
  }
}


async function loadPartnerListingWorkspace(kind, assetId) {
  const host = document.getElementById('view-detail');
  if (!host) return;

  const old = document.getElementById(
    'partner-listing-workspace'
  );
  if (old) old.remove();

  const zone = document.createElement('div');
  zone.id = 'partner-listing-workspace';
  zone.className = 'detail-panel';
  zone.style.marginTop = '24px';

  zone.innerHTML = `
    <div class="page-title" style="font-size:1.05rem;">
      Listing content & media
    </div>
    <div id="partner-listing-workspace-body">
      Loading…
    </div>
  `;

  const removeZone = document.getElementById(
    'partner-remove-asset-zone'
  );

  if (removeZone && removeZone.parentNode === host) {
    host.insertBefore(zone, removeZone);
  } else {
    host.appendChild(zone);
  }

  const body = document.getElementById(
    'partner-listing-workspace-body'
  );

  const listingResult =
    await window.ZFindServices.admin
      .getPartnerListingForAsset(kind, assetId);

  if (listingResult.error) {
    body.textContent =
      listingResult.error.message ||
      'Could not load listing workspace.';
    return;
  }

  const listing = listingResult.data;

  if (!listing) {
    body.innerHTML = `
      <p style="color:var(--gray-500);margin:0 0 14px;">
        This asset does not yet have a working Listing.
        Create a draft to add descriptions and photos.
      </p>
      <button
        type="button"
        class="btn btn-primary"
        onclick="createPartnerDraftListing('${kind}','${assetId}')"
      >Create draft listing</button>
    `;
    return;
  }

  const [
    languagesResult,
    contentResult
  ] = await Promise.all([
    window.ZFindServices.admin
      .listPartnerEnabledLanguages(),
    window.ZFindServices.admin
      .listPartnerListingContent(listing.id)
  ]);

  if (languagesResult.error || contentResult.error) {
    body.textContent = 'Could not load listing content.';
    return;
  }

  const languages = languagesResult.data || [];
  const rows = contentResult.data || [];

  const byLocale = new Map(
    rows.map(row => [row.locale, row])
  );

  const localePanels = languages.map(lang => {
    const row = byLocale.get(lang.code) || {};
    const label =
      lang.native_name ||
      lang.display_name ||
      lang.code.toUpperCase();

    return `
      <div
        style="border:1px solid var(--gray-200);border-radius:10px;padding:14px;margin-bottom:12px;"
      >
        <div style="font-weight:600;margin-bottom:10px;">
          ${escapeHtmlPartner(label)}
          <span style="font-weight:400;color:var(--gray-500);">
            · ${escapeHtmlPartner(lang.code.toUpperCase())}
          </span>
        </div>

        <div class="form-field" style="margin-bottom:10px;">
          <label>Title</label>
          <input
            type="text"
            id="partner-content-title-${lang.code}"
            value="${escapeHtmlPartner(row.title || '')}"
          >
        </div>

        <div class="form-field">
          <label>Description</label>
          <textarea
            id="partner-content-description-${lang.code}"
            rows="6"
          >${escapeHtmlPartner(row.description || '')}</textarea>
        </div>

        <div style="margin-top:10px;">
          <button
            type="button"
            class="btn"
            onclick="savePartnerListingLocale(
              '${listing.id}',
              '${lang.code}'
            )"
          >Save ${escapeHtmlPartner(lang.code.toUpperCase())}</button>
        </div>
      </div>
    `;
  }).join('');

  body.innerHTML = `
      ${renderPartnerListingCommercialEditor(listing)}
    <div
      style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px;"
    >
      <div>
        <strong>Listing status:</strong>
        ${escapeHtmlPartner(listing.status)}
      </div>
      <div style="font-size:.82rem;color:var(--gray-500);">
        Publication/lifecycle approval remains controlled by Z Find.
      </div>
    </div>

    <div class="page-title" style="font-size:.95rem;">
      Descriptions
    </div>

    ${
      localePanels ||
      '<p style="color:var(--gray-500);">No enabled languages.</p>'
    }

    <div
      class="page-title"
      style="font-size:.95rem;margin-top:24px;"
    >
      Photos
    </div>

    <div
      style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px;"
    >
      <input
        id="partner-media-file"
        type="file"
        accept="image/*"
      >
      <button
        type="button"
        class="btn btn-primary"
        onclick="uploadPartnerWorkspaceMedia(
          '${kind}',
          '${assetId}',
          '${listing.id}'
        )"
      >Upload photo</button>
    </div>

    <div
      id="partner-media-grid"
      data-asset-kind="${kind}"
      data-asset-id="${assetId}"
      data-listing-id="${listing.id}"
    >
      Loading photos…
    </div>
  `;

  await loadPartnerWorkspaceMedia(
    kind,
    assetId,
    listing.id
  );
}

async function createPartnerDraftListing(kind, assetId) {
  const result =
    await window.ZFindServices.admin
      .ensurePartnerDraftListing(kind, assetId);

  if (result.error) {
    showStatus(
      'error',
      result.error.message ||
      'Could not create draft listing.'
    );
    return;
  }

  showStatus('success', 'Draft listing created.');
  await loadPartnerListingWorkspace(kind, assetId);
}

async function savePartnerListingLocale(listingId, locale) {
  const titleEl = document.getElementById(
    `partner-content-title-${locale}`
  );
  const descriptionEl = document.getElementById(
    `partner-content-description-${locale}`
  );

  const result =
    await window.ZFindServices.admin
      .savePartnerListingContent(
        listingId,
        locale,
        {
          title: titleEl ? titleEl.value.trim() : '',
          description: descriptionEl
            ? descriptionEl.value.trim()
            : ''
        }
      );

  showStatus(
    result.error ? 'error' : 'success',
    result.error
      ? (
          result.error.message ||
          'Could not save content.'
        )
      : `${locale.toUpperCase()} content saved.`
  );
}

function _partnerWorkspaceMediaFns(kind) {
  if (kind === 'development') {
    return {
      list:
        window.ZFindServices.admin
          .listDevelopmentMedia,
      upload:
        window.ZFindServices.admin
          .uploadPartnerDevelopmentMedia,
      reorder:
        window.ZFindServices.admin
          .reorderPartnerDevelopmentMedia,
      cover:
        window.ZFindServices.admin
          .setPartnerDevelopmentMediaCover,
      remove:
        window.ZFindServices.admin
          .deletePartnerDevelopmentMedia
    };
  }

  return {
    list:
      window.ZFindServices.admin
        .listListingMedia,
    upload:
      window.ZFindServices.admin
        .uploadPartnerListingMedia,
    reorder:
      window.ZFindServices.admin
        .reorderPartnerListingMedia,
    cover:
      window.ZFindServices.admin
        .setPartnerListingMediaCover,
    remove:
      window.ZFindServices.admin
        .deletePartnerListingMedia
  };
}

async function loadPartnerWorkspaceMedia(
  kind,
  assetId,
  listingId
) {
  const grid = document.getElementById(
    'partner-media-grid'
  );
  if (!grid) return;

  const mediaKind =
    kind === 'development'
      ? 'development'
      : 'listing';

  const ownerId =
    mediaKind === 'development'
      ? assetId
      : listingId;

  const fns = _partnerWorkspaceMediaFns(kind);
  const result = await fns.list(ownerId);

  if (result.error) {
    grid.textContent =
      result.error.message ||
      'Could not load photos.';
    return;
  }

  const items = (result.data || []).slice().sort(
    (a, b) =>
      (a.position || 0) - (b.position || 0)
  );

  if (!items.length) {
    grid.innerHTML =
      '<p style="color:var(--gray-500);">No photos yet.</p>';
    return;
  }

  grid.innerHTML = items.map((m, index) => {
    const asset = m.media_assets || {};
    const url = m.url || asset.url || '';

    return `
      <div
        data-partner-media-id="${m.media_asset_id}"
        style="display:flex;align-items:center;gap:12px;border:1px solid var(--gray-200);border-radius:10px;padding:10px;margin-bottom:8px;"
      >
        ${
          url
            ? `<img
                src="${escapeHtmlPartner(url)}"
                alt=""
                style="width:72px;height:54px;object-fit:cover;border-radius:7px;"
              >`
            : `<div
                style="width:72px;height:54px;background:var(--gray-100);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:.75rem;"
              >Photo</div>`
        }

        <div style="flex:1;">
          <div style="font-size:.84rem;">
            Photo ${index + 1}
            ${
              m.is_cover
                ? ' · <strong>Cover</strong>'
                : ''
            }
          </div>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button
            type="button"
            class="btn"
            onclick="movePartnerWorkspaceMedia(
              '${kind}',
              '${assetId}',
              '${listingId}',
              '${m.media_asset_id}',
              -1
            )"
          >↑</button>

          <button
            type="button"
            class="btn"
            onclick="movePartnerWorkspaceMedia(
              '${kind}',
              '${assetId}',
              '${listingId}',
              '${m.media_asset_id}',
              1
            )"
          >↓</button>

          ${
            !m.is_cover
              ? `<button
                  type="button"
                  class="btn"
                  onclick="setPartnerWorkspaceCover(
                    '${kind}',
                    '${assetId}',
                    '${listingId}',
                    '${m.media_asset_id}'
                  )"
                >Set cover</button>`
              : ''
          }

          <button
            type="button"
            class="btn"
            style="border-color:#b42318;color:#b42318;"
            onclick="deletePartnerWorkspaceMedia(
              '${kind}',
              '${assetId}',
              '${listingId}',
              '${m.media_asset_id}'
            )"
          >Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

async function uploadPartnerWorkspaceMedia(
  kind,
  assetId,
  listingId
) {
  const input = document.getElementById(
    'partner-media-file'
  );

  const file =
    input &&
    input.files &&
    input.files[0];

  if (!file) {
    showStatus('error', 'Choose an image first.');
    return;
  }

  const mediaKind =
    kind === 'development'
      ? 'development'
      : 'listing';

  const ownerId =
    mediaKind === 'development'
      ? assetId
      : listingId;

  const fns = _partnerWorkspaceMediaFns(kind);

  const count = document.querySelectorAll(
    '#partner-media-grid [data-partner-media-id]'
  ).length;

  const result = await fns.upload(
    ownerId,
    file,
    {
      position: count,
      isCover: count === 0
    }
  );

  if (result.error) {
    showStatus(
      'error',
      result.error.message || 'Could not upload photo.'
    );
    return;
  }

  input.value = '';
  showStatus('success', 'Photo uploaded.');

  await loadPartnerWorkspaceMedia(
    kind,
    assetId,
    listingId
  );
}

async function movePartnerWorkspaceMedia(
  kind,
  assetId,
  listingId,
  mediaAssetId,
  direction
) {
  const ids = Array.from(
    document.querySelectorAll(
      '#partner-media-grid [data-partner-media-id]'
    )
  ).map(el => el.dataset.partnerMediaId);

  const index = ids.indexOf(mediaAssetId);
  const next = index + direction;

  if (
    index < 0 ||
    next < 0 ||
    next >= ids.length
  ) return;

  [ids[index], ids[next]] = [
    ids[next],
    ids[index]
  ];

  const mediaKind =
    kind === 'development'
      ? 'development'
      : 'listing';

  const ownerId =
    mediaKind === 'development'
      ? assetId
      : listingId;

  const fns = _partnerWorkspaceMediaFns(kind);
  const result = await fns.reorder(ownerId, ids);

  if (result.error) {
    showStatus(
      'error',
      result.error.message ||
      'Could not reorder photos.'
    );
    return;
  }

  await loadPartnerWorkspaceMedia(
    kind,
    assetId,
    listingId
  );
}

async function setPartnerWorkspaceCover(
  kind,
  assetId,
  listingId,
  mediaAssetId
) {
  const ownerId =
    kind === 'development'
      ? assetId
      : listingId;

  const fns = _partnerWorkspaceMediaFns(kind);

  const result = await fns.cover(
    ownerId,
    mediaAssetId
  );

  if (result.error) {
    showStatus(
      'error',
      result.error.message ||
      'Could not set cover.'
    );
    return;
  }

  showStatus('success', 'Cover updated.');

  await loadPartnerWorkspaceMedia(
    kind,
    assetId,
    listingId
  );
}

async function deletePartnerWorkspaceMedia(
  kind,
  assetId,
  listingId,
  mediaAssetId
) {
  const ok = window.confirm('Delete this photo?');
  if (!ok) return;

  const ownerId =
    kind === 'development'
      ? assetId
      : listingId;

  const fns = _partnerWorkspaceMediaFns(kind);

  const result = await fns.remove(
    ownerId,
    mediaAssetId
  );

  if (result.error) {
    showStatus(
      'error',
      result.error.message ||
      'Could not delete photo.'
    );
    return;
  }

  showStatus('success', 'Photo deleted.');

  await loadPartnerWorkspaceMedia(
    kind,
    assetId,
    listingId
  );
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
