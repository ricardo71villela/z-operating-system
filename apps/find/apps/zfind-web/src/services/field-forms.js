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
/* Labels per locale. "en" is the Admin's historical wording, kept
   byte-identical; "fr" is the Partner app (agencies in FR / BE / LU).
   Same field ids in every locale, so the shared DOM readers below are
   unchanged. In "fr", fields with no French meaning (Portuguese
   taxable value, permuta) stay as hidden inputs so a save never
   erases a stored value. */
const LABELS = {
  en: {
    legalTitle: 'Legal &amp; Compliance', legalNote: '— Energy Certificate is legally required in every PT listing (DL 101-D/2020)',
    energyRating: 'Energy Rating', energyCert: 'Energy Certificate Nº', license: 'License Nº (reference)',
    location: 'Location', street: 'Street Address', postal: 'Postal Code', lat: 'Latitude', lng: 'Longitude',
    rooms: 'Rooms &amp; Dimensions', bedrooms: 'Bedrooms', living: 'Living Rooms', bathrooms: 'Bathrooms',
    grossArea: 'Gross Private Area — ABP (m²)', dependentArea: 'Dependent Area — ABD (m²)', plot: 'Plot Area (m²)',
    year: 'Year Built', condition: 'Condition', unitFloors: 'Unit Floors (duplex=2, triplex=3)',
    financial: 'Financial', financialNote: '— declared values only, never calculated by Z Find',
    condo: 'Condo Fee — monthly (€)', imi: 'IMI — annual (€)', taxable: 'Taxable Value — VPT (€)',
    payment: 'Payment Terms', trade: 'Accepts trade / permuta',
    refs: 'References &amp; Multimedia', agencyRef: 'Agency Reference', tour: '360° Tour URL',
    save: 'Save all fields above',
    conditions: [['new','New'],['used','Used'],['needs_renovation','Needs renovation'],['renovated','Renovated']],
    energy: ['A+','A','B','B-','C','D','E','F'],
    devTitle: 'Development Details', totalUnits: 'Total Units (Frações)', buildingFloors: 'Building Floors',
    footprint: 'Footprint Area (m²)', completion: 'Expected Completion', phase: 'Project Phase', developer: 'Developer Name',
    phases: [['planning','Planning'],['construction','Construction'],['completed','Completed']],
    hidePortuguese: false
  },
  fr: {
    legalTitle: 'Diagnostic de performance énergétique (DPE)', legalNote: '— la classe énergie est obligatoire dans toute annonce de vente ou de location',
    energyRating: 'Classe énergie', energyCert: 'Numéro du DPE (ADEME)', license: 'N° d’enregistrement (location saisonnière)',
    location: 'Localisation', street: 'Adresse', postal: 'Code postal', lat: 'Latitude', lng: 'Longitude',
    rooms: 'Pièces et surfaces', bedrooms: 'Chambres', living: 'Séjours', bathrooms: 'Salles de bain',
    grossArea: 'Surface habitable (m²)', dependentArea: 'Annexes — cave, garage, terrasse (m²)', plot: 'Terrain (m²)',
    year: 'Année de construction', condition: 'État', unitFloors: 'Niveaux (duplex = 2, triplex = 3)',
    financial: 'Charges et taxes', financialNote: '— valeurs déclarées, jamais calculées par Z Find',
    condo: 'Charges de copropriété — par mois (€)', imi: 'Taxe foncière — par an (€)', taxable: '',
    payment: 'Modalités de paiement', trade: '',
    refs: 'Références et multimédia', agencyRef: 'Référence agence (n° de mandat)', tour: 'Visite virtuelle 360° (URL)',
    save: 'Enregistrer ces champs',
    conditions: [['new','Neuf'],['used','Ancien'],['needs_renovation','À rénover'],['renovated','Rénové']],
    energy: ['A','B','C','D','E','F','G'],
    devTitle: 'Le programme', totalUnits: 'Nombre de lots', buildingFloors: 'Nombre d’étages',
    footprint: 'Emprise au sol (m²)', completion: 'Livraison prévue', phase: 'Avancement', developer: 'Promoteur',
    phases: [['planning','En projet'],['construction','En construction'],['completed','Livré']],
    hidePortuguese: true
  }
};
function labelsFor(opts) { return (opts && LABELS[opts.locale]) || LABELS.en; }

function renderPropertyExtendedFields(d, opts) {
  const L = labelsFor(opts);
  const energyOptions = L.energy.slice();
  if (d.energy_rating && !energyOptions.includes(d.energy_rating)) energyOptions.push(d.energy_rating);
  const conditionOptions = L.conditions;
  const taxableField = L.hidePortuguese
    ? `<input type="hidden" id="attr-taxable-value" value="${d.taxable_value??''}">`
    : `
        <div class="form-field"><label>${L.taxable}</label><input type="number" step="0.01" id="attr-taxable-value" value="${d.taxable_value??''}"></div>`;
  const tradeField = L.hidePortuguese
    ? `<input type="checkbox" id="attr-accepts-trade" ${d.accepts_trade?'checked':''} hidden style="display:none;">`
    : `<div class="form-field"><label><input type="checkbox" id="attr-accepts-trade" ${d.accepts_trade?'checked':''}> ${L.trade}</label></div>`;
  return `
    <div class="page-title" style="font-size:1.1rem;">${L.legalTitle} <span style="font-weight:400; font-size:0.75rem; color:var(--gray-400,#888);">${L.legalNote}</span></div>
    <div class="detail-panel" style="margin-bottom:20px;">
      <div class="form-grid">
        <div class="form-field"><label>${L.energyRating}</label><select id="attr-energy-rating"><option value="">—</option>${energyOptions.map(e => `<option value="${e}" ${d.energy_rating===e?'selected':''}>${e}</option>`).join('')}</select></div>
        <div class="form-field"><label>${L.energyCert}</label><input type="text" id="attr-energy-cert-num" value="${escapeHtmlShared(d.energy_certificate_number||'')}"></div>
        <div class="form-field"><label>${L.license}</label><input type="text" id="attr-license-num" value="${escapeHtmlShared(d.license_number||'')}"></div>
      </div>
    </div>

    <div class="page-title" style="font-size:1.1rem;">${L.location}</div>
    <div class="detail-panel" style="margin-bottom:20px;">
      <div class="form-field" style="margin-bottom:12px;"><label>${L.street}</label><input type="text" id="attr-street-address" value="${escapeHtmlShared(d.street_address||'')}" style="width:100%;"></div>
      <div class="form-grid">
        <div class="form-field"><label>${L.postal}</label><input type="text" id="attr-postal-code" value="${escapeHtmlShared(d.postal_code||'')}"></div>
        <div class="form-field"><label>${L.lat}</label><input type="number" step="0.000001" id="attr-latitude" value="${d.latitude??''}"></div>
        <div class="form-field"><label>${L.lng}</label><input type="number" step="0.000001" id="attr-longitude" value="${d.longitude??''}"></div>
      </div>
    </div>

    <div class="page-title" style="font-size:1.1rem;">${L.rooms}</div>
    <div class="detail-panel" style="margin-bottom:20px;">
      <div class="form-grid">
        <div class="form-field"><label>${L.bedrooms}</label><input type="number" min="0" id="attr-bedrooms" value="${d.bedrooms??''}"></div>
        <div class="form-field"><label>${L.living}</label><input type="number" min="0" id="attr-living-rooms" value="${d.living_rooms??1}"></div>
        <div class="form-field"><label>${L.bathrooms}</label><input type="number" min="0" id="attr-bathrooms" value="${d.bathrooms??''}"></div>
        <div class="form-field"><label>${L.grossArea}</label><input type="number" step="0.01" id="attr-gross-private-area" value="${d.gross_private_area_sqm??''}"></div>
        <div class="form-field"><label>${L.dependentArea}</label><input type="number" step="0.01" id="attr-dependent-area" value="${d.dependent_area_sqm??''}"></div>
        <div class="form-field"><label>${L.plot}</label><input type="number" step="0.01" id="attr-plot-area" value="${d.plot_area_sqm??''}"></div>
        <div class="form-field"><label>${L.year}</label><input type="number" min="1800" max="2100" id="attr-year-built" value="${d.year_built??''}"></div>
        <div class="form-field"><label>${L.condition}</label><select id="attr-condition"><option value="">—</option>${conditionOptions.map(([v,l]) => `<option value="${v}" ${d.condition===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="form-field"><label>${L.unitFloors}</label><input type="number" min="1" id="attr-unit-floors" value="${d.unit_floors??1}"></div>
      </div>
    </div>

    <div class="page-title" style="font-size:1.1rem;">${L.financial} <span style="font-weight:400; font-size:0.75rem; color:var(--gray-400,#888);">${L.financialNote}</span></div>
    <div class="detail-panel" style="margin-bottom:20px;">
      <div class="form-grid">
        <div class="form-field"><label>${L.condo}</label><input type="number" step="0.01" id="attr-condo-fee" value="${d.condo_fee_monthly??''}"></div>
        <div class="form-field"><label>${L.imi}</label><input type="number" step="0.01" id="attr-imi-annual" value="${d.imi_annual??''}"></div>${taxableField}
      </div>
      <div class="form-field" style="margin:12px 0;"><label>${L.payment}</label><textarea id="attr-payment-terms" style="width:100%;">${escapeHtmlShared(d.payment_terms||'')}</textarea></div>
      ${tradeField}
    </div>

    <div class="page-title" style="font-size:1.1rem;">${L.refs}</div>
    <div class="detail-panel" style="margin-bottom:20px;">
      <div class="form-grid">
        <div class="form-field"><label>${L.agencyRef}</label><input type="text" id="attr-agency-ref" value="${escapeHtmlShared(d.agency_reference||'')}"></div>
        <div class="form-field"><label>${L.tour}</label><input type="text" id="attr-tour-360" value="${escapeHtmlShared(d.tour_360_url||'')}"></div>
      </div>
      <button class="btn btn-primary" style="margin-top:14px;" onclick="saveExtendedAttrs('property','${d.id}')">${L.save}</button>
    </div>
  `;
}

/** Development fields — 2 of these 6 (total_units, building context)
    are validated against 2 real Z Imobiliária development pages; the
    rest are reasonable industry-standard additions flagged in the
    taxonomy doc as less verified. */
function renderDevelopmentExtendedFields(d, opts) {
  const L = labelsFor(opts);
  const phaseOptions = L.phases;
  return `
    <div class="page-title" style="font-size:1.1rem;">${L.devTitle}</div>
    <div class="detail-panel" style="margin-bottom:20px;">
      <div class="form-grid">
        <div class="form-field"><label>${L.totalUnits}</label><input type="number" min="0" id="attr-total-units" value="${d.total_units??''}"></div>
        <div class="form-field"><label>${L.buildingFloors}</label><input type="number" min="0" id="attr-building-floors" value="${d.building_floors??''}"></div>
        <div class="form-field"><label>${L.footprint}</label><input type="number" step="0.01" id="attr-footprint-area" value="${d.footprint_area_sqm??''}"></div>
        <div class="form-field"><label>${L.completion}</label><input type="date" id="attr-expected-completion" value="${d.expected_completion||''}"></div>
        <div class="form-field"><label>${L.phase}</label><select id="attr-project-phase"><option value="">—</option>${phaseOptions.map(([v,l]) => `<option value="${v}" ${d.project_phase===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="form-field"><label>${L.developer}</label><input type="text" id="attr-developer-name" value="${escapeHtmlShared(d.developer_name||'')}"></div>
      </div>
      <button class="btn btn-primary" style="margin-top:14px;" onclick="saveExtendedAttrs('development','${d.id}')">${L.save}</button>
    </div>
  `;
}

/* French feature labels by code (the features table stores Portuguese labels). */
const FEATURES_FR = {
  accessibility: 'Accès personnes à mobilité réduite', central_heating: 'Chauffage central', air_conditioning: 'Climatisation',
  storage_room: 'Cellier / débarras', ev_charging: 'Borne de recharge électrique', barbecue: 'Barbecue', closet: 'Dressing / placards',
  fitted_kitchen: 'Cuisine équipée', pantry: 'Garde-manger', home_automation: 'Domotique', elevator: 'Ascenseur', office: 'Bureau',
  electric_shutters: 'Volets électriques', garage_box: 'Garage fermé', entrance_hall: 'Entrée', fiber_internet: 'Fibre optique',
  acoustic_insulation: 'Isolation phonique', thermal_insulation: 'Isolation thermique', garden: 'Jardin', fireplace: 'Cheminée',
  laundry: 'Buanderie', garage_covered: 'Place de parking couverte', garage_uncovered: 'Place de parking extérieure',
  bike_spot: 'Local vélos', furnished: 'Meublé', sun_east: 'Exposition est', sun_north: 'Exposition nord', sun_west: 'Exposition ouest',
  sun_south: 'Exposition sud', solar_panels: 'Panneaux solaires', pool: 'Piscine', ev_charging_ready: 'Pré-équipement borne électrique',
  security_system: 'Alarme / sécurité', terrace: 'Terrasse', balcony: 'Balcon', double_glazing: 'Double vitrage'
};

/** allFeatures: [{id, code, label}]; linkedIds: Set of feature_id
    already linked. Save button/orchestration stays in each app
    (saveFeatures(kind, id) is expected to be a global function). */
function renderFeaturesChecklist(allFeatures, linkedIds, opts) {
  const fr = opts && opts.locale === 'fr';
  const items = fr
    ? allFeatures.map(f => Object.assign({}, f, { label: FEATURES_FR[f.code] || f.label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    : allFeatures;
  return `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:8px;">
    ${items.map(f => `<label style="font-weight:400;"><input type="checkbox" class="feature-checkbox" value="${f.id}" ${linkedIds.has(f.id)?'checked':''}> ${escapeHtmlShared(f.label)}</label>`).join('')}
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
