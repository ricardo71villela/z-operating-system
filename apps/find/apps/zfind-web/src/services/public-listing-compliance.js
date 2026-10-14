/* ============================================================
   Z FIND — PUBLIC LISTING COMPLIANCE RUNTIME
   Approved public facts only. Internal evidence/reviewer metadata
   never enters this renderer; the database RPC is the authority.
   ============================================================ */

(function () {
  'use strict';

  const SERVICE = window.ZFindServices && window.ZFindServices.supabaseClient;
  if (!SERVICE) return;

  const { getSupabaseClient } = SERVICE;
  const BLOCK_ID = 'zfind-public-listing-compliance';
  const observedRoots = new WeakSet();
  let requestSerial = 0;
  let timer = null;

  const COPY = {
    fr: {
      title: 'Informations réglementaires',
      verified: 'Informations vérifiées avant publication',
      eyebrow: { FR: 'France', BE: 'Belgique', LU: 'Luxembourg', WAL: 'Belgique — Wallonie', BRU: 'Belgique — Bruxelles-Capitale', VLA: 'Belgique — Flandre' },
      dpe: 'DPE',
      ghg: 'GES',
      energyCost: 'Dépenses énergétiques estimées',
      exemption: 'DPE — exemption',
      dpePending: 'DPE',
      dpePendingValue: 'établi à l’achèvement du programme',
      fees: 'Honoraires d’agence',
      feesPayer: 'Honoraires à la charge',
      seller: 'du vendeur', buyer: 'de l’acquéreur', landlord: 'du bailleur', tenant: 'du locataire', shared: 'partagés',
      priceIncludesFees: 'Prix honoraires inclus',
      georisques: 'Les informations sur les risques auxquels ce bien est exposé sont disponibles sur Géorisques.',
      condominium: 'Copropriété',
      lots: 'lots',
      annualCharges: 'Charges annuelles',
      procedure: 'Procédure',
      livingArea: 'Surface habitable',
      baseRent: 'Loyer hors charges',
      charges: 'Charges mensuelles',
      deposit: 'Dépôt de garantie',
      tenantFees: 'Honoraires locataire',
      inventoryFees: 'État des lieux',
      furnished: 'Meublé',
      yes: 'Oui', no: 'Non',
      rentControl: 'Encadrement des loyers',
      applicable: 'Applicable', notApplicable: 'Non applicable',
      referenceRent: 'Loyer de référence',
      increasedReferenceRent: 'Loyer de référence majoré',
      supplement: 'Complément de loyer',
      landServiced: 'Viabilisation', serviced: 'Terrain viabilisé', partly: 'Partiellement viabilisé', not_serviced: 'Non viabilisé',
      peb: 'Classe PEB', pebSpecific: 'Consommation spécifique d’énergie primaire', pebTotal: 'Consommation totale d’énergie primaire',
      pebPrimary: 'Consommation d’énergie primaire', pebCo2: 'Émissions de CO₂', pebCode: 'Code unique du certificat PEB', certExempt: 'Certificat énergétique',
      epcScore: 'Score énergétique EPC', epcLabel: 'Label énergétique EPC', epcCode: 'Code unique EPC', renovation: 'Obligation de rénovation (renovatieplicht)',
      floodP: 'Inondation — P-score (parcelle)', floodG: 'Inondation — G-score (bâtiment)',
      urbanPermit: 'Permis d’urbanisme délivré', urbanZoning: 'Affectation urbanistique', urbanSummons: 'Citation / mesure de réparation',
      urbanPreemption: 'Droit de préemption', urbanSubdivision: 'Permis de lotir',
      monthlyRent: 'Loyer mensuel', commonCharges: 'Charges communes mensuelles',
      cpeEnergy: 'Classe de performance énergétique', cpeInsulation: 'Classe d’isolation thermique', cpeEnvironment: 'Classe de performance environnementale',
      commission: 'Commission d’agence'
    },
    en: {
      title: 'Regulatory information', verified: 'Information verified before publication',
      eyebrow: { FR: 'France', BE: 'Belgium', LU: 'Luxembourg', WAL: 'Belgium — Wallonia', BRU: 'Belgium — Brussels-Capital', VLA: 'Belgium — Flanders' },
      dpe: 'Energy rating', ghg: 'GHG rating',
      energyCost: 'Estimated annual energy cost', exemption: 'Energy rating exemption', dpePending: 'Energy rating', dpePendingValue: 'issued on completion of the development',
      fees: 'Agency fees', feesPayer: 'Fees payable by',
      seller: 'seller', buyer: 'buyer', landlord: 'landlord', tenant: 'tenant', shared: 'shared', priceIncludesFees: 'Price includes fees',
      georisques: 'Information about risks affecting this property is available on Géorisques.', condominium: 'Condominium', lots: 'lots',
      annualCharges: 'Annual charges', procedure: 'Proceedings', livingArea: 'Living area', baseRent: 'Rent excluding charges', charges: 'Monthly charges',
      deposit: 'Security deposit', tenantFees: 'Tenant fees', inventoryFees: 'Inventory fees', furnished: 'Furnished', yes: 'Yes', no: 'No',
      rentControl: 'Rent control', applicable: 'Applicable', notApplicable: 'Not applicable', referenceRent: 'Reference rent',
      increasedReferenceRent: 'Increased reference rent', supplement: 'Rent supplement',
      landServiced: 'Utilities', serviced: 'Serviced plot', partly: 'Partly serviced', not_serviced: 'Not serviced',
      peb: 'EPB class', pebSpecific: 'Specific primary energy use', pebTotal: 'Total primary energy use',
      pebPrimary: 'Primary energy use', pebCo2: 'CO₂ emissions', pebCode: 'EPB certificate code', certExempt: 'Energy certificate',
      epcScore: 'EPC energy score', epcLabel: 'EPC energy label', epcCode: 'EPC unique code', renovation: 'Renovation obligation',
      floodP: 'Flood risk — P-score (plot)', floodG: 'Flood risk — G-score (building)',
      urbanPermit: 'Planning permit issued', urbanZoning: 'Zoning designation', urbanSummons: 'Planning summons / remedy',
      urbanPreemption: 'Pre-emption right', urbanSubdivision: 'Subdivision permit',
      monthlyRent: 'Monthly rent', commonCharges: 'Monthly common charges',
      cpeEnergy: 'Energy performance class', cpeInsulation: 'Thermal insulation class', cpeEnvironment: 'Environmental performance class',
      commission: 'Agency commission'
    }
  };

  /* EU energy-label colours, A (green) to G (red); further classes (H, I) stay red. */
  const CLASS_COLORS = { A: '#008c4a', B: '#4fae33', C: '#b5cf2a', D: '#ffe600', E: '#f9b31b', F: '#ec6626', G: '#e30613', H: '#c0050f', I: '#9b040c', X: '#9b040c' };
  function classBadge(value) {
    const v = String(value || '').toUpperCase();
    if (!v) return '';
    const color = CLASS_COLORS[v.charAt(0)] || '#888';
    const dark = ['C', 'D', 'E'].includes(v.charAt(0));
    return `<span class="zfind-energy-badge" data-class="${escapeHtml(v)}" style="background:${color};color:${dark ? '#1a1a1a' : '#fff'}">${escapeHtml(v)}</span>`;
  }

  function lang() {
    const raw = (location.hash.replace(/^#\/?/, '').split('/')[0] || document.documentElement.lang || 'fr').toLowerCase();
    return raw === 'en' ? 'en' : 'fr';
  }

  function copy() { return COPY[lang()] || COPY.fr; }

  function route() {
    const clean = location.hash.replace(/^#\/?/, '').split('?')[0];
    const parts = clean.split('/').filter(Boolean);
    const view = parts[1];
    const id = parts[2];
    if (!id || !['property','land','development'].includes(view)) return null;
    return { view, kind: view === 'development' ? 'development' : (view === 'land' ? 'land' : 'property'), assetId: id };
  }

  function rootFor(view) {
    return document.getElementById(view === 'development' ? 'development-root' : view === 'land' ? 'land-root' : 'property-root');
  }

  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return new Intl.NumberFormat(lang() === 'fr' ? 'fr-FR' : 'en-GB', { style:'currency', currency:'EUR', maximumFractionDigits:0 }).format(n);
  }

  function number(value, suffix) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return new Intl.NumberFormat(lang() === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits:2 }).format(n) + (suffix || '');
  }

  function row(label, value) {
    if (value == null || value === '') return '';
    return `<div class="zfind-compliance-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
  }

  /* A row whose value is an energy class, shown as a coloured badge. */
  function classRow(label, value) {
    if (value == null || value === '') return '';
    return `<div class="zfind-compliance-row"><span>${escapeHtml(label)}</span><strong>${classBadge(value)}</strong></div>`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function render(data, targetRoot) {
    const existing = document.getElementById(BLOCK_ID);
    if (existing) existing.remove();
    if (!data || !data.facts || !['FR', 'BE', 'LU'].includes(data.jurisdiction_iso)) return;

    const c = copy();
    const f = data.facts;
    const p = String(data.profile || '');
    const rows = [];
    const yesNo = v => (v === true ? c.yes : v === false ? c.no : null);
    const unit = (value, suffix) => number(value, suffix);

    if (data.jurisdiction_iso === 'FR') {
      if (f.dpe_status === 'available') {
        rows.push(classRow(c.dpe, f.dpe_energy_class));
        rows.push(classRow(c.ghg, f.ghg_class));
        const min = money(f.energy_cost_min);
        const max = money(f.energy_cost_max);
        if (min && max) rows.push(row(c.energyCost, `${min} – ${max} (${f.energy_cost_reference_year || ''})`));
      } else if (f.dpe_status === 'exempt') {
        rows.push(row(c.exemption, f.dpe_exemption_reason));
      } else if (f.dpe_status === 'pending_completion') {
        rows.push(row(c.dpePending, c.dpePendingValue));
      }
      if (f.fees_payer) rows.push(row(c.feesPayer, c[f.fees_payer] || f.fees_payer));
      rows.push(row(c.fees, money(f.agency_fees_amount)));
      if (/^fr_(commercial|land)_sale_v1$|^fr_new_development_sale_v1$/.test(p)) rows.push(row(c.priceIncludesFees, yesNo(f.price_includes_agency_fees)));

      if ((p === 'fr_residential_sale_v1' || p === 'fr_commercial_sale_v1') && f.is_condominium === true) {
        rows.push(row(c.condominium, `${f.condominium_lots_count} ${c.lots}`));
        rows.push(row(c.annualCharges, money(f.annual_condominium_charges)));
        rows.push(row(c.procedure, f.condominium_procedure_status));
      }
      if (/^fr_land_/.test(p) && f.land_serviced) rows.push(row(c.landServiced, c[f.land_serviced] || f.land_serviced));

      if (p === 'fr_residential_rent_v1') {
        rows.push(row(c.livingArea, number(f.surface_habitable_sqm, ' m²')));
        rows.push(row(c.baseRent, money(f.monthly_rent_excl_charges)));
        rows.push(row(c.charges, money(f.monthly_charges)));
        rows.push(row(c.deposit, money(f.deposit_amount)));
        rows.push(row(c.tenantFees, money(f.tenant_fees_amount)));
        rows.push(row(c.inventoryFees, money(f.inventory_fees_amount)));
        rows.push(row(c.furnished, f.furnished === true ? c.yes : c.no));
        rows.push(row(c.rentControl, f.rent_control_status === 'applicable' ? c.applicable : c.notApplicable));
        if (f.rent_control_status === 'applicable') {
          rows.push(row(c.referenceRent, money(f.reference_rent)));
          rows.push(row(c.increasedReferenceRent, money(f.increased_reference_rent)));
          rows.push(row(c.supplement, money(f.rent_supplement_amount)));
        }
      }
    } else if (/^be_(wal|bru)_/.test(p)) {
      if (f.peb_status === 'available') {
        rows.push(classRow(c.peb, f.peb_class));
        rows.push(row(c.pebSpecific, unit(f.peb_specific_consumption_kwh_m2, ' kWh/m².an')));
        rows.push(row(c.pebTotal, unit(f.peb_total_consumption_kwh, ' kWh/an')));
        rows.push(row(c.pebPrimary, unit(f.peb_primary_energy_kwh_m2, ' kWh EP/m².an')));
        rows.push(row(c.pebCo2, unit(f.peb_co2_kg_m2, ' kg CO₂/m².an')));
        rows.push(row(c.pebCode, f.peb_certificate_code));
      } else if (f.peb_status === 'exempt') {
        rows.push(row(c.certExempt, f.peb_exemption_reason));
      }
    } else if (/^be_vla_/.test(p)) {
      if (f.epc_status === 'available') {
        rows.push(row(c.epcScore, unit(f.epc_score_kwh_m2, ' kWh/m².an')));
        rows.push(classRow(c.epcLabel, f.epc_label));
        rows.push(row(c.epcCode, f.epc_unique_code));
      } else if (f.epc_status === 'exempt') {
        rows.push(row(c.certExempt, f.epc_exemption_reason));
      }
      rows.push(row(c.renovation, f.renovation_obligation === true ? c.applicable : f.renovation_obligation === false ? c.notApplicable : null));
      rows.push(row(c.floodP, f.flood_p_score));
      if (f.plot_is_built === true) rows.push(row(c.floodG, f.flood_g_score));
      rows.push(row(c.urbanPermit, yesNo(f.urban_permit_issued)));
      rows.push(row(c.urbanZoning, f.urban_zoning_designation));
      rows.push(row(c.urbanSummons, yesNo(f.urban_summons)));
      rows.push(row(c.urbanPreemption, yesNo(f.urban_preemption_right)));
      rows.push(row(c.urbanSubdivision, yesNo(f.urban_subdivision_permit)));
    } else if (/^lu_/.test(p)) {
      if (f.cpe_status === 'available') {
        rows.push(classRow(c.cpeEnergy, f.cpe_energy_class));
        rows.push(classRow(c.cpeInsulation, f.cpe_insulation_class));
        rows.push(classRow(c.cpeEnvironment, f.cpe_environmental_class));
      } else if (f.cpe_status === 'exempt') {
        rows.push(row(c.certExempt, f.cpe_exemption_reason));
      }
      if (f.fees_payer) rows.push(row(c.feesPayer, c[f.fees_payer] || f.fees_payer));
      rows.push(row(c.commission, money(f.agency_fees_amount)));
    }
    if (/^be_[a-z]{3}_rent_v1$/.test(p)) {
      rows.push(row(c.monthlyRent, money(f.monthly_rent)));
      rows.push(row(c.commonCharges, money(f.monthly_common_charges)));
    }

    const regionMatch = /^be_(wal|bru|vla)_/.exec(p);
    const eyebrow = c.eyebrow[regionMatch ? regionMatch[1].toUpperCase() : data.jurisdiction_iso] || '';
    const georisques = data.jurisdiction_iso === 'FR'
      ? `<p class="zfind-compliance-georisques">${escapeHtml(c.georisques)} <a href="https://www.georisques.gouv.fr/" target="_blank" rel="noopener noreferrer">georisques.gouv.fr</a></p>` : '';

    const section = document.createElement('section');
    section.id = BLOCK_ID;
    section.className = 'zfind-public-compliance-card';
    section.setAttribute('aria-label', c.title);
    section.innerHTML = `
      <div class="zfind-compliance-head">
        <div>
          <span class="eyebrow">${escapeHtml(eyebrow)}</span>
          <h2>${escapeHtml(c.title)}</h2>
        </div>
        <span class="zfind-compliance-verified">✓ ${escapeHtml(c.verified)}</span>
      </div>
      <div class="zfind-compliance-grid">${rows.join('')}</div>
      ${georisques}`;

    const wrap = targetRoot.querySelector(':scope > .wrap') || targetRoot;
    const actions = wrap.querySelector('.detail-actions-row');
    if (actions) wrap.insertBefore(section, actions);
    else wrap.appendChild(section);
  }

  async function refresh() {
    const r = route();
    const old = document.getElementById(BLOCK_ID);
    if (!r) { if (old) old.remove(); return; }

    const targetRoot = rootFor(r.view);
    if (!targetRoot) return;

    const serial = ++requestSerial;
    try {
      const client = getSupabaseClient();
      const result = await client.rpc('zfind_public_get_asset_compliance', {
        p_kind: r.kind,
        p_asset_id: r.assetId
      });
      if (serial !== requestSerial) return;
      if (result.error || !result.data) { if (old) old.remove(); return; }
      render(result.data, targetRoot);
    } catch (_) {
      if (old) old.remove();
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 50);
  }

  function observe() {
    ['property-root','land-root','development-root'].forEach(id => {
      const node = document.getElementById(id);
      if (!node || observedRoots.has(node)) return;
      observedRoots.add(node);
      new MutationObserver(schedule).observe(node, { childList:true, subtree:true });
    });
  }

  window.addEventListener('hashchange', schedule);
  document.addEventListener('DOMContentLoaded', () => { observe(); schedule(); });

  window.ZFindPublicListingCompliance = Object.freeze({ refresh, render, classBadge });
})();
