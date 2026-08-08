/* ============================================================
   Z FIND — services/field-forms.js
   ============================================================
   Pure HTML generation for Migration 0005's field taxonomy — written
   once, reused by BOTH apps/zfind-admin and apps/zfind-partner. Save
   orchestration (calling admin.js's updateProperty/updateDevelopment,
   showing a toast) stays in each app, since the two apps have
   different notification UIs — only the HTML itself is shared here,
   to avoid maintaining 30+ hand-written fields in two places that
   would inevitably drift apart.

   Depends on nothing external — has its own local escape helper, so
   it never assumes what else either app has defined.

   Both apps are expected to provide, in their own global scope:
   - `.form-grid` / `.form-field` / `.page-title` / `.detail-panel`
     CSS classes (styled however fits each app's design language —
     the shared HTML only uses the class NAMES, never colors/fonts
     directly, except where inline style is genuinely structural,
     e.g. width:100% for a long text field).
   - A global function `saveExtendedAttrs(kind, id)` and
     `saveFeatures(kind, id)`, called from the generated buttons'
     onclick — each app defines its own, calling into admin.js.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.ZFindServices = root.ZFindServices || {}; root.ZFindServices.fieldForms = factory(); }
})(typeof window !== 'undefined' ? window : this, function () {

function escapeHtmlShared(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

/** Migration 0005's field taxonomy, rendered in the SAME groups as
    docs/architecture/PROPERTY-FIELD-TAXONOMY.md — legal/compliance
    first (it's a real Portuguese legal requirement, not just another
    field), then location, rooms & dimensions, financial (factual
    only), references & multimedia. */
function renderPropertyExtendedFields(d) {
  const energyOptions = ['A+','A','B','B-','C','D','E','F'];
  const conditionOptions = [['new','New'],['used','Used'],['needs_renovation','Needs renovation'],['renovated','Renovated']];
  return `
    <div class="page-title" style="font-size:1.1rem;">Legal &amp; Compliance <span style="font-weight:400; font-size:0.75rem; color:var(--gray-400,#888);">— Energy Certificate is legally required in every PT listing (DL 101-D/2020)</span></div>
    <div class="detail-panel" style="margin-bottom:20px;">
      <div class="form-grid">
        <div class="form-field"><label>Energy Rating</label><select id="attr-energy-rating"><option value="">—</option>${energyOptions.map(e => `<option value="${e}" ${d.energy_rating===e?'selected':''}>${e}</option>`).join('')}</select></div>
        <div class="form-field"><label>Energy Certificate Nº</label><input type="text" id="attr-energy-cert-num" value="${escapeHtmlShared(d.energy_certificate_number||'')}"></div>
        <div class="form-field"><label>License Nº (reference)</label><input type="text" id="attr-license-num" value="${escapeHtmlShared(d.license_number||'')}"></div>
      </div>
    </div>

    <div class="page-title" style="font-size:1.1rem;">Location</div>
    <div class="detail-panel" style="margin-bottom:20px;">
      <div class="form-field" style="margin-bottom:12px;"><label>Street Address</label><input type="text" id="attr-street-address" value="${escapeHtmlShared(d.street_address||'')}" style="width:100%;"></div>
      <div class="form-grid">
        <div class="form-field"><label>Postal Code</label><input type="text" id="attr-postal-code" value="${escapeHtmlShared(d.postal_code||'')}"></div>
        <div class="form-field"><label>Latitude</label><input type="number" step="0.000001" id="attr-latitude" value="${d.latitude??''}"></div>
        <div class="form-field"><label>Longitude</label><input type="number" step="0.000001" id="attr-longitude" value="${d.longitude??''}"></div>
      </div>
    </div>

    <div class="page-title" style="font-size:1.1rem;">Rooms &amp; Dimensions</div>
    <div class="detail-panel" style="margin-bottom:20px;">
      <div class="form-grid">
        <div class="form-field"><label>Bedrooms</label><input type="number" min="0" id="attr-bedrooms" value="${d.bedrooms??''}"></div>
        <div class="form-field"><label>Living Rooms</label><input type="number" min="0" id="attr-living-rooms" value="${d.living_rooms??1}"></div>
        <div class="form-field"><label>Bathrooms</label><input type="number" min="0" id="attr-bathrooms" value="${d.bathrooms??''}"></div>
        <div class="form-field"><label>Gross Private Area — ABP (m²)</label><input type="number" step="0.01" id="attr-gross-private-area" value="${d.gross_private_area_sqm??''}"></div>
        <div class="form-field"><label>Dependent Area — ABD (m²)</label><input type="number" step="0.01" id="attr-dependent-area" value="${d.dependent_area_sqm??''}"></div>
        <div class="form-field"><label>Plot Area (m²)</label><input type="number" step="0.01" id="attr-plot-area" value="${d.plot_area_sqm??''}"></div>
        <div class="form-field"><label>Year Built</label><input type="number" min="1800" max="2100" id="attr-year-built" value="${d.year_built??''}"></div>
        <div class="form-field"><label>Condition</label><select id="attr-condition"><option value="">—</option>${conditionOptions.map(([v,l]) => `<option value="${v}" ${d.condition===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="form-field"><label>Unit Floors (duplex=2, triplex=3)</label><input type="number" min="1" id="attr-unit-floors" value="${d.unit_floors??1}"></div>
      </div>
    </div>

    <div class="page-title" style="font-size:1.1rem;">Financial <span style="font-weight:400; font-size:0.75rem; color:var(--gray-400,#888);">— declared values only, never calculated by Z Find</span></div>
    <div class="detail-panel" style="margin-bottom:20px;">
      <div class="form-grid">
        <div class="form-field"><label>Condo Fee — monthly (€)</label><input type="number" step="0.01" id="attr-condo-fee" value="${d.condo_fee_monthly??''}"></div>
        <div class="form-field"><label>IMI — annual (€)</label><input type="number" step="0.01" id="attr-imi-annual" value="${d.imi_annual??''}"></div>
        <div class="form-field"><label>Taxable Value — VPT (€)</label><input type="number" step="0.01" id="attr-taxable-value" value="${d.taxable_value??''}"></div>
      </div>
      <div class="form-field" style="margin:12px 0;"><label>Payment Terms</label><textarea id="attr-payment-terms" style="width:100%;">${escapeHtmlShared(d.payment_terms||'')}</textarea></div>
      <div class="form-field"><label><input type="checkbox" id="attr-accepts-trade" ${d.accepts_trade?'checked':''}> Accepts trade / permuta</label></div>
    </div>

    <div class="page-title" style="font-size:1.1rem;">References &amp; Multimedia</div>
    <div class="detail-panel" style="margin-bottom:20px;">
      <div class="form-grid">
        <div class="form-field"><label>Agency Reference</label><input type="text" id="attr-agency-ref" value="${escapeHtmlShared(d.agency_reference||'')}"></div>
        <div class="form-field"><label>360° Tour URL</label><input type="text" id="attr-tour-360" value="${escapeHtmlShared(d.tour_360_url||'')}"></div>
      </div>
      <button class="btn btn-primary" style="margin-top:14px;" onclick="saveExtendedAttrs('property','${d.id}')">Save all fields above</button>
    </div>
  `;
}

/** Development fields — 2 of these 6 (total_units, building context)
    are validated against 2 real Z Imobiliária development pages; the
    rest are reasonable industry-standard additions flagged in the
    taxonomy doc as less verified. */
function renderDevelopmentExtendedFields(d) {
  const phaseOptions = [['planning','Planning'],['construction','Construction'],['completed','Completed']];
  return `
    <div class="page-title" style="font-size:1.1rem;">Development Details</div>
    <div class="detail-panel" style="margin-bottom:20px;">
      <div class="form-grid">
        <div class="form-field"><label>Total Units (Frações)</label><input type="number" min="0" id="attr-total-units" value="${d.total_units??''}"></div>
        <div class="form-field"><label>Building Floors</label><input type="number" min="0" id="attr-building-floors" value="${d.building_floors??''}"></div>
        <div class="form-field"><label>Footprint Area (m²)</label><input type="number" step="0.01" id="attr-footprint-area" value="${d.footprint_area_sqm??''}"></div>
        <div class="form-field"><label>Expected Completion</label><input type="date" id="attr-expected-completion" value="${d.expected_completion||''}"></div>
        <div class="form-field"><label>Project Phase</label><select id="attr-project-phase"><option value="">—</option>${phaseOptions.map(([v,l]) => `<option value="${v}" ${d.project_phase===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="form-field"><label>Developer Name</label><input type="text" id="attr-developer-name" value="${escapeHtmlShared(d.developer_name||'')}"></div>
      </div>
      <button class="btn btn-primary" style="margin-top:14px;" onclick="saveExtendedAttrs('development','${d.id}')">Save all fields above</button>
    </div>
  `;
}

/** allFeatures: [{id, code, label}]; linkedIds: Set of feature_id
    already linked. Save button/orchestration stays in each app
    (saveFeatures(kind, id) is expected to be a global function). */
function renderFeaturesChecklist(allFeatures, linkedIds) {
  return `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:8px;">
    ${allFeatures.map(f => `<label style="font-weight:400;"><input type="checkbox" class="feature-checkbox" value="${f.id}" ${linkedIds.has(f.id)?'checked':''}> ${escapeHtmlShared(f.label)}</label>`).join('')}
  </div>`;
}

/** Reads every field id this module renders and returns the patch
    object shape admin.js's updateProperty/updateDevelopment expect —
    shared so BOTH apps' saveExtendedAttrs orchestration reads the
    exact same set of ids the exact same way, never drifting. */
function readPropertyExtendedFieldsFromDOM() {
  const num = elId => { const el = document.getElementById(elId); if (!el || el.value === '') return null; const n = Number(el.value); return Number.isNaN(n) ? null : n; };
  const txt = elId => { const el = document.getElementById(elId); const v = el ? el.value.trim() : ''; return v || null; };
  return {
    energyRating: txt('attr-energy-rating'), energyCertificateNumber: txt('attr-energy-cert-num'), licenseNumber: txt('attr-license-num'),
    streetAddress: txt('attr-street-address'), postalCode: txt('attr-postal-code'), latitude: num('attr-latitude'), longitude: num('attr-longitude'),
    bedrooms: num('attr-bedrooms'), livingRooms: num('attr-living-rooms'), bathrooms: num('attr-bathrooms'),
    grossPrivateAreaSqm: num('attr-gross-private-area'), dependentAreaSqm: num('attr-dependent-area'), plotAreaSqm: num('attr-plot-area'),
    yearBuilt: num('attr-year-built'), condition: txt('attr-condition'), unitFloors: num('attr-unit-floors'),
    condoFeeMonthly: num('attr-condo-fee'), imiAnnual: num('attr-imi-annual'), taxableValue: num('attr-taxable-value'),
    paymentTerms: txt('attr-payment-terms'), acceptsTrade: !!document.getElementById('attr-accepts-trade')?.checked,
    agencyReference: txt('attr-agency-ref'), tour360Url: txt('attr-tour-360'),
  };
}

function readDevelopmentExtendedFieldsFromDOM() {
  const num = elId => { const el = document.getElementById(elId); if (!el || el.value === '') return null; const n = Number(el.value); return Number.isNaN(n) ? null : n; };
  const txt = elId => { const el = document.getElementById(elId); const v = el ? el.value.trim() : ''; return v || null; };
  return {
    totalUnits: num('attr-total-units'), buildingFloors: num('attr-building-floors'), footprintAreaSqm: num('attr-footprint-area'),
    expectedCompletion: txt('attr-expected-completion'), projectPhase: txt('attr-project-phase'), developerName: txt('attr-developer-name'),
  };
}

return { renderPropertyExtendedFields, renderDevelopmentExtendedFields, renderFeaturesChecklist, readPropertyExtendedFieldsFromDOM, readDevelopmentExtendedFieldsFromDOM };

});
