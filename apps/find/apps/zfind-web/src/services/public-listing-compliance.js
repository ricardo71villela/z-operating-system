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
      dpe: 'DPE',
      ghg: 'GES',
      energyCost: 'Dépenses énergétiques estimées',
      exemption: 'DPE — exemption',
      fees: 'Honoraires d’agence',
      feesPayer: 'Honoraires à la charge',
      seller: 'du vendeur', buyer: 'de l’acquéreur', landlord: 'du bailleur', tenant: 'du locataire', shared: 'partagés',
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
      supplement: 'Complément de loyer'
    },
    en: {
      title: 'Regulatory information', verified: 'Information verified before publication', dpe: 'Energy rating', ghg: 'GHG rating',
      energyCost: 'Estimated annual energy cost', exemption: 'Energy rating exemption', fees: 'Agency fees', feesPayer: 'Fees payable by',
      seller: 'seller', buyer: 'buyer', landlord: 'landlord', tenant: 'tenant', shared: 'shared',
      georisques: 'Information about risks affecting this property is available on Géorisques.', condominium: 'Condominium', lots: 'lots',
      annualCharges: 'Annual charges', procedure: 'Proceedings', livingArea: 'Living area', baseRent: 'Rent excluding charges', charges: 'Monthly charges',
      deposit: 'Security deposit', tenantFees: 'Tenant fees', inventoryFees: 'Inventory fees', furnished: 'Furnished', yes: 'Yes', no: 'No',
      rentControl: 'Rent control', applicable: 'Applicable', notApplicable: 'Not applicable', referenceRent: 'Reference rent',
      increasedReferenceRent: 'Increased reference rent', supplement: 'Rent supplement'
    }
  };

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
    if (!data || !data.facts || data.jurisdiction_iso !== 'FR') return;

    const c = copy();
    const f = data.facts;
    const rows = [];

    if (f.dpe_status === 'available') {
      rows.push(row(c.dpe, String(f.dpe_energy_class || '').toUpperCase()));
      rows.push(row(c.ghg, String(f.ghg_class || '').toUpperCase()));
      const min = money(f.energy_cost_min);
      const max = money(f.energy_cost_max);
      if (min && max) rows.push(row(c.energyCost, `${min} – ${max} (${f.energy_cost_reference_year || ''})`));
    } else if (f.dpe_status === 'exempt') {
      rows.push(row(c.exemption, f.dpe_exemption_reason));
    }

    rows.push(row(c.feesPayer, c[f.fees_payer] || f.fees_payer));
    rows.push(row(c.fees, money(f.agency_fees_amount)));

    if (data.profile === 'fr_residential_sale_v1' && f.is_condominium === true) {
      rows.push(row(c.condominium, `${f.condominium_lots_count} ${c.lots}`));
      rows.push(row(c.annualCharges, money(f.annual_condominium_charges)));
      rows.push(row(c.procedure, f.condominium_procedure_status));
    }

    if (data.profile === 'fr_residential_rent_v1') {
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

    const section = document.createElement('section');
    section.id = BLOCK_ID;
    section.className = 'zfind-public-compliance-card';
    section.setAttribute('aria-label', c.title);
    section.innerHTML = `
      <div class="zfind-compliance-head">
        <div>
          <span class="eyebrow">France</span>
          <h2>${escapeHtml(c.title)}</h2>
        </div>
        <span class="zfind-compliance-verified">✓ ${escapeHtml(c.verified)}</span>
      </div>
      <div class="zfind-compliance-grid">${rows.join('')}</div>
      <p class="zfind-compliance-georisques">${escapeHtml(c.georisques)} <a href="https://www.georisques.gouv.fr/" target="_blank" rel="noopener noreferrer">georisques.gouv.fr</a></p>`;

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

  window.ZFindPublicListingCompliance = Object.freeze({ refresh });
})();
