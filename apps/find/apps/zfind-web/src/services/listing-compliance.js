/* ============================================================
   Z FIND — services/listing-compliance.js
   ============================================================
   Mandatory listing information (« mentions obligatoires ») for France,
   Belgium (Wallonie, Bruxelles-Capitale, Flandre) and Luxembourg,
   shared by the Partner panel (entry), the Admin (review) and the
   importer (facts from files).

   The database is the authority:
   - migration 20260830112835_z_find_global_listing_compliance_launch_v2:
     table, zfind_save_listing_compliance (Partner or Admin; back to
     'pending' whenever the facts change), zfind_admin_review_listing_compliance
     (Admin: approved | rejected), publish trigger;
   - migration 20261014120000_z_find_compliance_coverage_be_lu_class_g_v1:
     profiles (zfind_listing_compliance_profile), the pure validator
     zfind_compliance_profile_missing(profile, facts), the gate extended to
     Belgium and Luxembourg (a listing cannot become 'published' unless
     facts are valid AND approved; already published listings untouched).
   Read companions (migration 20261009120000_z_find_listing_compliance_review_queue_v1):
   zfind_list_listing_compliance_status, zfind_admin_list_listing_compliance.

   Profiles:
     fr_residential_sale_v1, fr_residential_rent_v1   logement (unchanged)
     fr_new_development_sale_v1                       programme neuf / VEFA
     fr_commercial_sale_v1, fr_commercial_rent_v1     bureaux, commerces, activité
     fr_land_sale_v1, fr_land_rent_v1                 terrain
     be_wal_sale_v1, be_wal_rent_v1                   Wallonie (certificat PEB)
     be_bru_sale_v1, be_bru_rent_v1                   Bruxelles-Capitale (certificat PEB)
     be_vla_sale_v1, be_vla_rent_v1                   Flandre (EPC, watertoets, urbanisme)
     lu_sale_v1, lu_rent_v1                           Luxembourg (passeport énergétique)

   This module:
   - FIELDS: the facts each profile collects (required + useful optional
     ones), with French labels (official Dutch terms in parentheses for
     Flanders);
   - sqlMissing(): an exact mirror of the SQL validator (same keys, same
     order, same JSON type rules) — kept in step by tests on generated cases;
   - validateFacts(): sqlMissing + the stricter checks the form applies,
     with one French message per field;
   - buildFacts() / prefillFacts(): form values <-> facts JSON;
   - statusOf(), factRows(), describeError(): French wording;
   - RPC wrappers (safeQuery shape, never throws).
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null);
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.listingCompliance = factory(root.ZFindServices.supabaseClient);
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {
  'use strict';

  /* ---------------- Profiles ---------------- */
  const SALE = 'fr_residential_sale_v1';
  const RENT = 'fr_residential_rent_v1';
  const NEW_DEV = 'fr_new_development_sale_v1';
  const COM_SALE = 'fr_commercial_sale_v1';
  const COM_RENT = 'fr_commercial_rent_v1';
  const LAND_SALE = 'fr_land_sale_v1';
  const LAND_RENT = 'fr_land_rent_v1';
  const WAL_SALE = 'be_wal_sale_v1';
  const WAL_RENT = 'be_wal_rent_v1';
  const BRU_SALE = 'be_bru_sale_v1';
  const BRU_RENT = 'be_bru_rent_v1';
  const VLA_SALE = 'be_vla_sale_v1';
  const VLA_RENT = 'be_vla_rent_v1';
  const LU_SALE = 'lu_sale_v1';
  const LU_RENT = 'lu_rent_v1';

  const FR_RESIDENTIAL = Object.freeze([SALE, RENT]);
  const FR_PROFILES = Object.freeze([SALE, RENT, NEW_DEV, COM_SALE, COM_RENT, LAND_SALE, LAND_RENT]);
  const BE_PROFILES = Object.freeze([WAL_SALE, WAL_RENT, BRU_SALE, BRU_RENT, VLA_SALE, VLA_RENT]);
  const LU_PROFILES = Object.freeze([LU_SALE, LU_RENT]);
  const PROFILES = Object.freeze(FR_PROFILES.concat(BE_PROFILES, LU_PROFILES));

  const PROFILE_INFO = Object.freeze({
    [SALE]: { country: 'FR', region: null, kind: 'sale', label: 'Vente d’un logement', short: 'Vente — logement' },
    [RENT]: { country: 'FR', region: null, kind: 'rent', label: 'Location d’un logement', short: 'Location — logement' },
    [NEW_DEV]: { country: 'FR', region: null, kind: 'sale', label: 'Programme neuf — vente en l’état futur d’achèvement (VEFA)', short: 'Vente — programme neuf' },
    [COM_SALE]: { country: 'FR', region: null, kind: 'sale', label: 'Vente de bureaux, commerce ou local d’activité', short: 'Vente — local professionnel' },
    [COM_RENT]: { country: 'FR', region: null, kind: 'rent', label: 'Location de bureaux, commerce ou local d’activité', short: 'Location — local professionnel' },
    [LAND_SALE]: { country: 'FR', region: null, kind: 'sale', label: 'Vente d’un terrain', short: 'Vente — terrain' },
    [LAND_RENT]: { country: 'FR', region: null, kind: 'rent', label: 'Location d’un terrain', short: 'Location — terrain' },
    [WAL_SALE]: { country: 'BE', region: 'WAL', kind: 'sale', label: 'Vente en Wallonie', short: 'Vente — Wallonie' },
    [WAL_RENT]: { country: 'BE', region: 'WAL', kind: 'rent', label: 'Location en Wallonie', short: 'Location — Wallonie' },
    [BRU_SALE]: { country: 'BE', region: 'BRU', kind: 'sale', label: 'Vente en Région de Bruxelles-Capitale', short: 'Vente — Bruxelles' },
    [BRU_RENT]: { country: 'BE', region: 'BRU', kind: 'rent', label: 'Location en Région de Bruxelles-Capitale', short: 'Location — Bruxelles' },
    [VLA_SALE]: { country: 'BE', region: 'VLA', kind: 'sale', label: 'Vente en Flandre (Vlaanderen)', short: 'Vente — Flandre' },
    [VLA_RENT]: { country: 'BE', region: 'VLA', kind: 'rent', label: 'Location en Flandre (Vlaanderen)', short: 'Location — Flandre' },
    [LU_SALE]: { country: 'LU', region: null, kind: 'sale', label: 'Vente au Luxembourg', short: 'Vente — Luxembourg' },
    [LU_RENT]: { country: 'LU', region: null, kind: 'rent', label: 'Location au Luxembourg', short: 'Location — Luxembourg' }
  });
  /** French label of a profile (long or short). */
  function profileLabel(profile, short) { const i = PROFILE_INFO[profile]; return i ? (short ? i.short : i.label) : ''; }

  const COUNTRY_FR = Object.freeze({ FR: 'France', BE: 'Belgique', LU: 'Luxembourg' });
  const REGION_FR = Object.freeze({ WAL: 'Wallonie', BRU: 'Bruxelles-Capitale', VLA: 'Flandre (Vlaanderen)' });
  /** « France », « Belgique — Wallonie », « Luxembourg »… for a profile or a country. */
  function jurisdictionLabel(profile, country) {
    const i = PROFILE_INFO[profile];
    const c = (i && i.country) || String(country || '').toUpperCase();
    if (!COUNTRY_FR[c]) return '';
    return i && i.region ? `${COUNTRY_FR[c]} — ${REGION_FR[i.region]}` : COUNTRY_FR[c];
  }

  /** Belgian region from the commune NIS code, else the postcode (mirror of SQL zfind_be_region). */
  function beRegion(communeCode, postalCode) {
    const code = String(communeCode == null ? '' : communeCode).trim();
    if (/^\d{5}$/.test(code)) {
      if (code.startsWith('21')) return 'BRU';
      if (code.startsWith('25') || '5689'.includes(code[0])) return 'WAL';
      if (code.startsWith('23') || code.startsWith('24') || '1347'.includes(code[0])) return 'VLA';
    }
    const pc = String(postalCode == null ? '' : postalCode).replace(/\s/g, '');
    if (/^\d{4}$/.test(pc)) {
      const n = Number(pc);
      if (n >= 1000 && n <= 1299) return 'BRU';
      if ((n >= 1300 && n <= 1499) || (n >= 4000 && n <= 7999)) return 'WAL';
      if ((n >= 1500 && n <= 3999) || (n >= 8000 && n <= 9999)) return 'VLA';
    }
    return null;
  }

  /** Profile of a listing from what the importer / UI knows (mirror of zfind_listing_compliance_profile).
      ctx: { country, propertyClass ('residential'|'commercial'|'land'), target ('property'|'development'),
             inDevelopment, transaction ('sale'|'rent'), communeCode, postalCode } */
  function profileFor(ctx) {
    const c = ctx || {};
    const country = String(c.country || '').toUpperCase();
    const tx = c.transaction === 'rent' ? 'rent' : c.transaction === 'sale' || !c.transaction ? 'sale' : null;
    if (!tx) return null;
    if (country === 'FR') {
      if (c.target === 'development') return tx === 'sale' ? NEW_DEV : null;
      if (c.propertyClass === 'residential') return tx === 'rent' ? RENT : c.inDevelopment ? NEW_DEV : SALE;
      if (c.propertyClass === 'commercial') return tx === 'rent' ? COM_RENT : COM_SALE;
      if (c.propertyClass === 'land') return tx === 'rent' ? LAND_RENT : LAND_SALE;
      return null;
    }
    if (country === 'BE') {
      const r = beRegion(c.communeCode, c.postalCode);
      return r ? `be_${r.toLowerCase()}_${tx}_v1` : null;
    }
    if (country === 'LU') return `lu_${tx}_v1`;
    return null;
  }

  /* ---------------- Class scales ---------------- */
  const CLASSES = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G']);                                  // DPE logement (France)
  const TERTIARY_CLASSES = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);              // DPE tertiaire
  const WAL_CLASSES = Object.freeze(['A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G']);
  const BRU_CLASSES = Object.freeze(['A++', 'A+', 'A', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E+', 'E', 'E-', 'F', 'G']);
  const VLA_LABELS = Object.freeze(['A+', 'A', 'B', 'C', 'D', 'E', 'F']);
  const LU_CLASSES = Object.freeze(['A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
  const FLOOD_SCORES = Object.freeze(['A', 'B', 'C', 'D']);
  function classesFor(def, profile) {
    if (def.key === 'dpe_energy_class' || def.key === 'ghg_class') return [COM_SALE, COM_RENT].includes(profile) ? TERTIARY_CLASSES : CLASSES;
    if (def.key === 'peb_class') return profile.startsWith('be_bru_') ? BRU_CLASSES : WAL_CLASSES;
    if (def.key === 'epc_label') return VLA_LABELS;
    if (def.key.startsWith('cpe_')) return LU_CLASSES;
    return CLASSES;
  }

  const FEES_PAYERS = Object.freeze(['seller', 'buyer', 'landlord', 'tenant', 'shared']);
  const PROCEDURE_NONE = 'Aucune procédure en cours';
  const PROCEDURE_ONGOING_PREFIX = 'Procédure en cours : ';

  /* ---------------- Field catalogue ----------------
     key: the facts JSON key (SQL contract) — or, for the two composite
     form controls, a form-only key (form: true).
     when(f): the field applies (else it is neither shown nor stored).
     required / requiredByProfile: the form requires it when it applies. */
  const isAvailable = f => f.dpe_status === 'available';
  const isExempt = f => f.dpe_status === 'exempt';
  const isPending = f => f.dpe_status === 'pending_completion';
  const isCondo = f => f.is_condominium === true;
  const isRentControlled = f => f.rent_control_status === 'applicable';
  const pebAvailable = f => f.peb_status === 'available';
  const pebExempt = f => f.peb_status === 'exempt';
  const epcAvailable = f => f.epc_status === 'available';
  const epcExempt = f => f.epc_status === 'exempt';
  const plotBuilt = f => f.plot_is_built === true;
  const cpeAvailable = f => f.cpe_status === 'available';
  const cpeExempt = f => f.cpe_status === 'exempt';
  const always = () => true;

  const DPE_FULL = [SALE, RENT, NEW_DEV];                 // DPE logement + dépenses d'énergie
  const DPE_ALL = [SALE, RENT, NEW_DEV, COM_SALE, COM_RENT];
  const FEES_FR = [SALE, RENT, NEW_DEV, COM_SALE, COM_RENT, LAND_SALE, LAND_RENT];
  const SALES_FR = [SALE, NEW_DEV, COM_SALE, LAND_SALE];
  const CONDO = [SALE, COM_SALE];
  const PEB = [WAL_SALE, WAL_RENT, BRU_SALE, BRU_RENT];
  const WAL = [WAL_SALE, WAL_RENT];
  const BRU = [BRU_SALE, BRU_RENT];
  const VLA = [VLA_SALE, VLA_RENT];
  const BE_RENTS = [WAL_RENT, BRU_RENT, VLA_RENT];
  const SALE_PAYERS = [['seller', 'du vendeur'], ['buyer', 'de l’acquéreur'], ['shared', 'partagés vendeur / acquéreur']];
  const RENT_PAYERS = [['landlord', 'du bailleur'], ['tenant', 'du locataire'], ['shared', 'partagés bailleur / locataire']];
  const byKind = (sales, rents) => { const o = {}; PROFILES.forEach(p => { o[p] = PROFILE_INFO[p].kind === 'rent' ? rents : sales; }); return o; };
  const YES_NO = [['true', 'Oui'], ['false', 'Non']];
  const CERT_EXEMPTIONS = ['Terrain non bâti', 'Bâtiment destiné à la démolition', 'Bien non soumis à certification (hors champ régional)', 'Bâtiment de moins de 50 m²'];

  const GROUPS = Object.freeze([
    ['dpe', 'Performance énergétique (DPE)'],
    ['peb', 'Certificat PEB (performance énergétique des bâtiments)'],
    ['epc', 'Certificat de performance énergétique (EPC — energieprestatiecertificaat)'],
    ['cpe', 'Certificat de performance énergétique (passeport énergétique)'],
    ['fees', 'Honoraires d’agence'],
    ['condo', 'Copropriété'],
    ['surface', 'Surfaces'],
    ['land', 'Terrain'],
    ['rent', 'Loyer et charges'],
    ['rentBe', 'Loyer et charges communes'],
    ['tenant', 'Dépôt de garantie et frais à la charge du locataire'],
    ['rentControl', 'Encadrement des loyers'],
    ['flood', 'Risque d’inondation (watertoets — overstromingsgevoeligheid)'],
    ['urban', 'Informations urbanistiques (stedenbouwkundige informatie)'],
    ['risks', 'Risques (Géorisques)']
  ]);

  const FIELDS = Object.freeze([
    /* ---- France: DPE ---- */
    { key: 'dpe_status', group: 'dpe', type: 'enum', required: true, profiles: DPE_ALL, when: always,
      label: 'Diagnostic de performance énergétique',
      options: [['available', 'Le bien dispose d’un DPE'], ['exempt', 'Le bien est exempté de DPE']],
      optionsByProfile: {
        [NEW_DEV]: [['available', 'Le DPE est disponible (programme achevé)'], ['pending_completion', 'Programme non achevé : DPE établi à l’achèvement'], ['exempt', 'Le bien est exempté de DPE']],
        [COM_SALE]: [['available', 'Le bien dispose d’un DPE tertiaire'], ['exempt', 'Le bien est exempté de DPE']],
        [COM_RENT]: [['available', 'Le bien dispose d’un DPE tertiaire'], ['exempt', 'Le bien est exempté de DPE']]
      } },
    { key: 'dpe_energy_class', group: 'dpe', type: 'class', required: true, profiles: DPE_ALL, when: isAvailable,
      label: 'Classe énergie' },
    { key: 'ghg_class', group: 'dpe', type: 'class', required: true, profiles: DPE_ALL, when: isAvailable,
      label: 'Classe climat (GES)' },
    { key: 'energy_cost_min', group: 'dpe', type: 'number', min: 0, required: true, profiles: DPE_FULL, when: isAvailable,
      label: 'Dépenses annuelles d’énergie estimées — minimum (€)' },
    { key: 'energy_cost_max', group: 'dpe', type: 'number', min: 0, required: true, profiles: DPE_FULL, when: isAvailable,
      label: 'Dépenses annuelles d’énergie estimées — maximum (€)' },
    { key: 'energy_cost_reference_year', group: 'dpe', type: 'year', required: true, profiles: DPE_FULL, when: isAvailable,
      label: 'Année de référence des prix de l’énergie', placeholder: 'ex. : 2023' },
    { key: 'dpe_ademe_number', group: 'dpe', type: 'text', maxLength: 40, required: false, profiles: DPE_ALL, when: isAvailable,
      label: 'Numéro ADEME du DPE (facultatif)' },
    { key: 'dpe_exemption_reason', group: 'dpe', type: 'text', maxLength: 300, required: true, profiles: DPE_ALL, when: isExempt,
      label: 'Motif de l’exemption',
      suggestions: ['Bâtiment de moins de 50 m² isolé', 'Monument historique', 'Lieu de culte', 'Construction provisoire (moins de 2 ans)', 'Bâtiment agricole, artisanal ou industriel non résidentiel', 'Résidence secondaire occupée moins de 4 mois par an'] },
    { key: 'energy_standard', group: 'dpe', type: 'text', maxLength: 80, required: false, profiles: [NEW_DEV], when: isPending,
      label: 'Réglementation environnementale visée (facultatif)', placeholder: 'ex. : RE2020' },

    /* ---- Belgium: certificat PEB (Wallonie, Bruxelles-Capitale) ---- */
    { key: 'peb_status', group: 'peb', type: 'enum', required: true, profiles: PEB, when: always,
      label: 'Certificat PEB',
      options: [['available', 'Le bien dispose d’un certificat PEB'], ['exempt', 'Pas de certificat PEB requis']] },
    { key: 'peb_class', group: 'peb', type: 'class', required: true, profiles: PEB, when: pebAvailable,
      label: 'Classe énergétique PEB' },
    { key: 'peb_specific_consumption_kwh_m2', group: 'peb', type: 'number', min: 0, required: true, profiles: WAL, when: pebAvailable,
      label: 'Consommation spécifique d’énergie primaire (kWh/m².an)' },
    { key: 'peb_total_consumption_kwh', group: 'peb', type: 'number', min: 0, required: true, profiles: WAL, when: pebAvailable,
      label: 'Consommation théorique totale d’énergie primaire (kWh/an)' },
    { key: 'peb_primary_energy_kwh_m2', group: 'peb', type: 'number', min: 0, required: true, profiles: BRU, when: pebAvailable,
      label: 'Consommation d’énergie primaire (kWh EP/m².an)' },
    { key: 'peb_co2_kg_m2', group: 'peb', type: 'number', min: 0, required: true, profiles: BRU, when: pebAvailable,
      label: 'Émissions annuelles de CO₂ (kg CO₂/m².an)' },
    { key: 'peb_certificate_code', group: 'peb', type: 'text', maxLength: 60, profiles: PEB, when: pebAvailable,
      requiredByProfile: { [WAL_SALE]: true, [WAL_RENT]: true, [BRU_SALE]: false, [BRU_RENT]: false },
      labelByProfile: { [WAL_SALE]: 'Code unique du certificat PEB', [WAL_RENT]: 'Code unique du certificat PEB',
        [BRU_SALE]: 'Numéro du certificat PEB (facultatif)', [BRU_RENT]: 'Numéro du certificat PEB (facultatif)' } },
    { key: 'peb_exemption_reason', group: 'peb', type: 'text', maxLength: 300, required: true, profiles: PEB, when: pebExempt,
      label: 'Motif (pas de certificat PEB requis)', suggestions: CERT_EXEMPTIONS },

    /* ---- Belgium: Flandre — EPC ---- */
    { key: 'epc_status', group: 'epc', type: 'enum', required: true, profiles: VLA, when: always,
      label: 'Certificat de performance énergétique (EPC)',
      options: [['available', 'Le bien dispose d’un EPC'], ['exempt', 'Pas d’EPC requis (vrijgesteld)']] },
    { key: 'epc_score_kwh_m2', group: 'epc', type: 'number', min: 0, required: true, profiles: VLA, when: epcAvailable,
      label: 'Score énergétique — kengetal (kWh/m².an)' },
    { key: 'epc_label', group: 'epc', type: 'class', required: false, profiles: VLA, when: epcAvailable,
      label: 'Label énergétique (energielabel, facultatif)' },
    { key: 'epc_address_in_ad', group: 'epc', type: 'check', required: false, profiles: VLA, when: epcAvailable, shortLabel: 'Adresse complète dans l’annonce',
      label: 'L’annonce indique l’adresse complète du bien (rue, numéro, boîte) — dispense du code unique.' },
    { key: 'epc_unique_code', group: 'epc', type: 'text', maxLength: 60, required: true, profiles: VLA, when: epcAvailable,
      formWhen: v => v.epc_address_in_ad !== true,
      label: 'Code unique de l’EPC (unieke code)' },
    { key: 'epc_exemption_reason', group: 'epc', type: 'text', maxLength: 300, required: true, profiles: VLA, when: epcExempt,
      label: 'Motif (pas d’EPC requis)', suggestions: CERT_EXEMPTIONS.concat(['Logement déclaré inhabitable']) },
    { key: 'renovation_obligation', group: 'epc', type: 'bool', required: true, profiles: [VLA_SALE], when: always,
      label: 'Obligation de rénovation (renovatieplicht)',
      options: [['true', 'S’applique (label E ou F) — mentionnée dans l’annonce'], ['false', 'Ne s’applique pas']] },

    /* ---- Luxembourg — passeport énergétique ---- */
    { key: 'cpe_status', group: 'cpe', type: 'enum', required: true, profiles: LU_PROFILES, when: always,
      label: 'Certificat de performance énergétique',
      options: [['available', 'Le bien dispose d’un certificat valide'], ['exempt', 'Pas de certificat requis']] },
    { key: 'cpe_energy_class', group: 'cpe', type: 'class', required: true, profiles: LU_PROFILES, when: cpeAvailable,
      label: 'Classe de performance énergétique' },
    { key: 'cpe_insulation_class', group: 'cpe', type: 'class', required: true, profiles: LU_PROFILES, when: cpeAvailable,
      label: 'Classe d’isolation thermique' },
    { key: 'cpe_environmental_class', group: 'cpe', type: 'class', required: false, profiles: LU_PROFILES, when: cpeAvailable,
      label: 'Classe de performance environnementale (facultatif)' },
    { key: 'cpe_exemption_reason', group: 'cpe', type: 'text', maxLength: 300, required: true, profiles: LU_PROFILES, when: cpeExempt,
      label: 'Motif (pas de certificat requis)', suggestions: ['Terrain non bâti', 'Vente en vue de la démolition', 'Vente publique forcée ou sur saisie', 'Bâtiment non soumis (monument, culte, provisoire…)'] },

    /* ---- Fees ---- */
    { key: 'fees_payer', group: 'fees', type: 'enum', profiles: FEES_FR.concat(LU_PROFILES), when: always,
      requiredByProfile: Object.assign(Object.fromEntries(FEES_FR.map(p => [p, true])), { [COM_RENT]: false, [LU_SALE]: false, [LU_RENT]: false }),
      labelByProfile: { [COM_RENT]: 'Honoraires à la charge (facultatif)', [LU_SALE]: 'Commission d’agence à la charge (facultatif)', [LU_RENT]: 'Commission d’agence à la charge (facultatif)' },
      label: 'Honoraires à la charge',
      optionsByProfile: byKind(SALE_PAYERS, RENT_PAYERS) },
    { key: 'agency_fees_amount', group: 'fees', type: 'number', min: 0, profiles: FEES_FR.concat(LU_PROFILES), when: always,
      requiredByProfile: Object.assign(Object.fromEntries(FEES_FR.map(p => [p, true])), { [COM_RENT]: false, [LU_SALE]: false, [LU_RENT]: false }),
      labelByProfile: Object.assign(byKind('Montant des honoraires (€ TTC)', 'Honoraires d’agence totaux (€ TTC)'), {
        [LAND_RENT]: 'Honoraires à la charge du locataire (€ TTC)',
        [COM_RENT]: 'Honoraires d’agence (€ HT ou TTC, facultatif)',
        [LU_SALE]: 'Commission d’agence (€ TTC, facultatif)', [LU_RENT]: 'Commission d’agence (€ TTC, facultatif)' }) },
    { key: 'price_includes_agency_fees', group: 'fees', type: 'bool', required: true, profiles: SALES_FR, when: always,
      label: 'Le prix affiché inclut les honoraires',
      options: [['true', 'Oui, honoraires inclus'], ['false', 'Non, prix net vendeur']] },
    { key: 'agency_fees_percent', group: 'fees', type: 'number', min: 0, max: 100, required: false, profiles: SALES_FR.concat([LU_SALE]), when: always,
      label: 'Honoraires en % du prix hors honoraires (facultatif)' },
    { key: 'fees_schedule_url', group: 'fees', type: 'url', required: false, profiles: FEES_FR, when: always,
      label: 'Lien vers votre barème d’honoraires (facultatif)', placeholder: 'https://' },

    /* ---- Copropriété ---- */
    { key: 'is_condominium', group: 'condo', type: 'bool', required: true, profiles: CONDO, when: always,
      label: 'Bien soumis au statut de la copropriété',
      options: [['true', 'Oui'], ['false', 'Non']] },
    { key: 'condominium_lots_count', group: 'condo', type: 'number', min: 0, positive: true, integer: true, required: true, profiles: CONDO, when: isCondo,
      label: 'Nombre de lots de la copropriété' },
    { key: 'annual_condominium_charges', group: 'condo', type: 'number', min: 0, required: true, profiles: CONDO, when: isCondo,
      label: 'Charges courantes annuelles — quote-part du lot (€)' },
    { key: 'condominium_procedure_choice', form: true, group: 'condo', type: 'enum', required: true, profiles: CONDO, when: isCondo,
      label: 'Procédure en cours (art. 29-1 A et 29-1 de la loi du 10 juillet 1965)',
      options: [['none', 'Aucune procédure en cours'], ['ongoing', 'Procédure en cours']] },
    { key: 'condominium_procedure_detail', form: true, group: 'condo', type: 'text', maxLength: 300, required: true, profiles: CONDO,
      when: isCondo, formWhen: v => v.condominium_procedure_choice === 'ongoing',
      label: 'Nature de la procédure', placeholder: 'ex. : mandat ad hoc, administration provisoire' },
    { key: 'surface_carrez_sqm', group: 'surface', type: 'number', min: 0, positive: true, required: false, profiles: CONDO, when: isCondo,
      label: 'Surface loi Carrez (m², facultatif)' },
    { key: 'surface_habitable_sqm', group: 'surface', type: 'number', min: 0, positive: true, profiles: [SALE, RENT, NEW_DEV], when: always,
      requiredByProfile: { [SALE]: false, [RENT]: true, [NEW_DEV]: false },
      labelByProfile: { [SALE]: 'Surface habitable (m², facultatif)', [RENT]: 'Surface habitable (m²)', [NEW_DEV]: 'Surface habitable (m², facultatif)' } },

    /* ---- Terrain ---- */
    { key: 'land_serviced', group: 'land', type: 'enum', required: false, profiles: [LAND_SALE, LAND_RENT], when: always,
      label: 'Viabilisation (facultatif)',
      options: [['serviced', 'Terrain viabilisé'], ['partly', 'Partiellement viabilisé'], ['not_serviced', 'Non viabilisé']] },

    /* ---- France: rent (residential) ---- */
    { key: 'monthly_rent_excl_charges', group: 'rent', type: 'number', min: 0, required: true, profiles: [RENT], when: always,
      label: 'Loyer mensuel hors charges (€)' },
    { key: 'monthly_charges', group: 'rent', type: 'number', min: 0, required: true, profiles: [RENT], when: always,
      label: 'Charges mensuelles (€)' },
    { key: 'charges_recovery_method', group: 'rent', type: 'enum', required: true, profiles: [RENT], when: always,
      label: 'Modalité de récupération des charges',
      options: [['provision', 'Provision avec régularisation annuelle'], ['forfait', 'Forfait de charges'], ['none', 'Aucune charge récupérable']] },
    { key: 'furnished', group: 'rent', type: 'bool', required: true, profiles: [RENT], when: always,
      label: 'Type de location',
      options: [['true', 'Meublée'], ['false', 'Vide (non meublée)']] },

    { key: 'deposit_amount', group: 'tenant', type: 'number', min: 0, required: true, profiles: [RENT], when: always,
      label: 'Dépôt de garantie (€)' },
    { key: 'tenant_fees_amount', group: 'tenant', type: 'number', min: 0, required: true, profiles: [RENT], when: always,
      label: 'Honoraires locataire — visite, dossier, bail (€ TTC)' },
    { key: 'inventory_fees_amount', group: 'tenant', type: 'number', min: 0, required: true, profiles: [RENT], when: always,
      label: 'Honoraires locataire — état des lieux (€ TTC)' },

    { key: 'rent_control_status', group: 'rentControl', type: 'enum', required: true, profiles: [RENT], when: always,
      label: 'Commune soumise à l’encadrement des loyers',
      options: [['applicable', 'Oui, encadrement applicable'], ['not_applicable', 'Non applicable']] },
    { key: 'reference_rent', group: 'rentControl', type: 'number', min: 0, positive: true, required: true, profiles: [RENT], when: isRentControlled,
      label: 'Loyer de référence (€ / mois)' },
    { key: 'increased_reference_rent', group: 'rentControl', type: 'number', min: 0, positive: true, required: true, profiles: [RENT], when: isRentControlled,
      label: 'Loyer de référence majoré (€ / mois)' },
    { key: 'rent_supplement_amount', group: 'rentControl', type: 'number', min: 0, required: true, profiles: [RENT], when: isRentControlled,
      label: 'Complément de loyer (€ / mois, 0 si aucun)' },

    /* ---- Belgium: rent ---- */
    { key: 'monthly_rent', group: 'rentBe', type: 'number', min: 0, required: true, profiles: BE_RENTS, when: always,
      label: 'Loyer mensuel demandé (€)' },
    { key: 'monthly_common_charges', group: 'rentBe', type: 'number', min: 0, required: true, profiles: BE_RENTS, when: always,
      label: 'Charges communes mensuelles (€, 0 si aucune)' },

    /* ---- Flandre: watertoets ---- */
    { key: 'flood_p_score', group: 'flood', type: 'enum', required: true, profiles: [VLA_SALE], when: always,
      label: 'Score de la parcelle (P-score)',
      options: FLOOD_SCORES.map(s => [s, s]) },
    { key: 'plot_is_built', group: 'flood', type: 'bool', required: true, profiles: [VLA_SALE], when: always,
      label: 'Parcelle bâtie',
      options: [['true', 'Oui (bâtiment sur la parcelle)'], ['false', 'Non (terrain non bâti)']] },
    { key: 'flood_g_score', group: 'flood', type: 'enum', required: true, profiles: [VLA_SALE], when: plotBuilt,
      label: 'Score du bâtiment (G-score)',
      options: FLOOD_SCORES.map(s => [s, s]) },

    /* ---- Flandre: stedenbouwkundige informatie ---- */
    { key: 'urban_permit_issued', group: 'urban', type: 'bool', required: true, profiles: [VLA_SALE], when: always,
      label: 'Permis d’urbanisme délivré (stedenbouwkundige vergunning / omgevingsvergunning)', options: YES_NO },
    { key: 'urban_zoning_designation', group: 'urban', type: 'text', maxLength: 200, required: true, profiles: [VLA_SALE], when: always,
      label: 'Affectation urbanistique la plus récente (meest recente stedenbouwkundige bestemming)', placeholder: 'ex. : woongebied (zone d’habitat)' },
    { key: 'urban_summons', group: 'urban', type: 'bool', required: true, profiles: [VLA_SALE], when: always,
      label: 'Citation ou mesure de réparation en cours (dagvaarding / herstelvordering)', options: YES_NO },
    { key: 'urban_preemption_right', group: 'urban', type: 'bool', required: true, profiles: [VLA_SALE], when: always,
      label: 'Droit de préemption (voorkooprecht)', options: YES_NO },
    { key: 'urban_subdivision_permit', group: 'urban', type: 'bool', required: true, profiles: [VLA_SALE], when: always,
      label: 'Permis de lotir (verkavelingsvergunning)', options: YES_NO },

    /* ---- France: Géorisques ---- */
    { key: 'georisques_disclosure', group: 'risks', type: 'check', required: true, profiles: FR_PROFILES, when: always, shortLabel: 'Mention Géorisques dans l’annonce',
      label: 'L’annonce mentionne : « Les informations sur les risques auxquels ce bien est exposé sont disponibles sur le site Géorisques : www.georisques.gouv.fr ».' }
  ]);

  /* French label of every key the SQL validator / gate can report. */
  const MISSING_LABELS = Object.freeze({
    compliance_record: 'mentions non enregistrées',
    jurisdiction_unresolved: 'commune du bien non renseignée',
    unsupported_jurisdiction: 'pays non couvert par le contrôle',
    unsupported_profile: 'type d’annonce non couvert par le contrôle',
    be_region_unresolved: 'région belge non déterminée (commune ou code postal à vérifier)',
    review_approval: 'validation Z Find',
    georisques_disclosure: 'mention Géorisques',
    fees_payer: 'charge des honoraires',
    agency_fees_amount: 'montant des honoraires',
    dpe_status: 'DPE ou exemption',
    dpe_energy_class: 'classe énergie',
    ghg_class: 'classe climat (GES)',
    energy_cost_min: 'dépenses d’énergie minimum',
    energy_cost_max: 'dépenses d’énergie maximum',
    energy_cost_range: 'fourchette des dépenses d’énergie',
    energy_cost_reference_year: 'année de référence des prix de l’énergie',
    dpe_exemption_reason: 'motif d’exemption du DPE',
    price_includes_agency_fees: 'prix honoraires inclus ou non',
    is_condominium: 'statut de copropriété',
    condominium_lots_count: 'nombre de lots',
    annual_condominium_charges: 'charges annuelles de copropriété',
    condominium_procedure_status: 'procédure en cours dans la copropriété',
    surface_habitable_sqm: 'surface habitable',
    monthly_rent_excl_charges: 'loyer hors charges',
    monthly_charges: 'charges mensuelles',
    charges_recovery_method: 'modalité de récupération des charges',
    deposit_amount: 'dépôt de garantie',
    tenant_fees_amount: 'honoraires locataire',
    inventory_fees_amount: 'honoraires d’état des lieux',
    furnished: 'location meublée ou vide',
    rent_control_status: 'encadrement des loyers',
    reference_rent: 'loyer de référence',
    increased_reference_rent: 'loyer de référence majoré',
    rent_supplement_amount: 'complément de loyer',
    peb_status: 'certificat PEB ou motif',
    peb_class: 'classe énergétique PEB',
    peb_specific_consumption_kwh_m2: 'consommation spécifique d’énergie primaire',
    peb_total_consumption_kwh: 'consommation théorique totale d’énergie primaire',
    peb_certificate_code: 'code unique du certificat PEB',
    peb_primary_energy_kwh_m2: 'consommation d’énergie primaire',
    peb_co2_kg_m2: 'émissions de CO₂',
    peb_exemption_reason: 'motif (pas de certificat PEB)',
    monthly_rent: 'loyer mensuel',
    monthly_common_charges: 'charges communes',
    epc_status: 'EPC ou motif',
    epc_score_kwh_m2: 'score énergétique EPC (kengetal)',
    epc_unique_code: 'code unique de l’EPC ou adresse complète',
    epc_exemption_reason: 'motif (pas d’EPC)',
    renovation_obligation: 'obligation de rénovation (renovatieplicht)',
    flood_p_score: 'P-score (parcelle)',
    plot_is_built: 'parcelle bâtie ou non',
    flood_g_score: 'G-score (bâtiment)',
    urban_permit_issued: 'permis d’urbanisme (vergunning)',
    urban_zoning_designation: 'affectation urbanistique (bestemming)',
    urban_summons: 'citation en justice (dagvaarding)',
    urban_preemption_right: 'droit de préemption (voorkooprecht)',
    urban_subdivision_permit: 'permis de lotir (verkavelingsvergunning)',
    cpe_status: 'certificat de performance énergétique ou motif',
    cpe_energy_class: 'classe de performance énergétique',
    cpe_insulation_class: 'classe d’isolation thermique',
    cpe_exemption_reason: 'motif (pas de certificat)'
  });

  /* One message per field, shown under the field. */
  const MESSAGES = Object.freeze({
    georisques_disclosure: 'Cochez la mention Géorisques : elle est obligatoire dans toute annonce.',
    fees_payer: 'Indiquez à qui incombent les honoraires.',
    agency_fees_amount: 'Indiquez le montant des honoraires en euros (0 s’il n’y en a pas).',
    dpe_status: 'Indiquez si le bien dispose d’un DPE ou s’il en est exempté.',
    dpe_energy_class: 'Choisissez la classe énergie.',
    ghg_class: 'Choisissez la classe climat GES.',
    energy_cost_min: 'Indiquez le montant minimum estimé des dépenses annuelles d’énergie (en euros).',
    energy_cost_max: 'Indiquez le montant maximum estimé des dépenses annuelles d’énergie (en euros).',
    energy_cost_range: 'Le montant maximum doit être supérieur ou égal au montant minimum.',
    energy_cost_reference_year: 'Indiquez l’année de référence des prix de l’énergie (4 chiffres, ex. : 2023).',
    dpe_exemption_reason: 'Précisez le motif de l’exemption de DPE.',
    price_includes_agency_fees: 'Indiquez si le prix affiché inclut les honoraires.',
    is_condominium: 'Indiquez si le bien est soumis au statut de la copropriété.',
    condominium_lots_count: 'Indiquez le nombre de lots de la copropriété (nombre entier supérieur à 0).',
    annual_condominium_charges: 'Indiquez le montant annuel des charges courantes (quote-part du lot, en euros).',
    condominium_procedure_status: 'Indiquez s’il existe une procédure en cours dans la copropriété.',
    condominium_procedure_choice: 'Indiquez s’il existe une procédure en cours dans la copropriété.',
    condominium_procedure_detail: 'Précisez la nature de la procédure en cours.',
    surface_habitable_sqm: 'Indiquez la surface habitable en m² (supérieure à 0).',
    monthly_rent_excl_charges: 'Indiquez le loyer mensuel hors charges (en euros).',
    monthly_charges: 'Indiquez le montant mensuel des charges (0 s’il n’y en a pas).',
    charges_recovery_method: 'Choisissez la modalité de récupération des charges.',
    deposit_amount: 'Indiquez le montant du dépôt de garantie (0 s’il n’y en a pas).',
    tenant_fees_amount: 'Indiquez les honoraires de visite, dossier et bail à la charge du locataire (0 s’il n’y en a pas).',
    inventory_fees_amount: 'Indiquez les honoraires d’état des lieux à la charge du locataire (0 s’il n’y en a pas).',
    furnished: 'Indiquez si le logement est loué meublé ou vide.',
    rent_control_status: 'Indiquez si la commune est soumise à l’encadrement des loyers.',
    reference_rent: 'Indiquez le loyer de référence (supérieur à 0).',
    increased_reference_rent: 'Indiquez le loyer de référence majoré (supérieur à 0).',
    rent_supplement_amount: 'Indiquez le complément de loyer (0 s’il n’y en a pas).',
    agency_fees_percent: 'Saisissez un pourcentage entre 0 et 100.',
    fees_schedule_url: 'Saisissez une adresse complète commençant par https://',
    surface_carrez_sqm: 'Saisissez une surface en m² supérieure à 0.',
    dpe_ademe_number: 'Le numéro ADEME ne peut pas dépasser 40 caractères.',
    peb_status: 'Indiquez si le bien dispose d’un certificat PEB.',
    peb_class: 'Choisissez la classe énergétique du certificat PEB.',
    peb_specific_consumption_kwh_m2: 'Indiquez la consommation spécifique d’énergie primaire (kWh/m².an).',
    peb_total_consumption_kwh: 'Indiquez la consommation théorique totale d’énergie primaire (kWh/an).',
    peb_certificate_code: 'Indiquez le code unique du certificat PEB.',
    peb_primary_energy_kwh_m2: 'Indiquez la consommation d’énergie primaire (kWh EP/m².an).',
    peb_co2_kg_m2: 'Indiquez les émissions annuelles de CO₂ (kg CO₂/m².an).',
    peb_exemption_reason: 'Précisez pourquoi aucun certificat PEB n’est requis.',
    monthly_rent: 'Indiquez le loyer mensuel demandé (en euros).',
    monthly_common_charges: 'Indiquez le montant mensuel des charges communes (0 s’il n’y en a pas).',
    epc_status: 'Indiquez si le bien dispose d’un EPC.',
    epc_score_kwh_m2: 'Indiquez le score énergétique de l’EPC (kengetal, kWh/m².an).',
    epc_unique_code: 'Indiquez le code unique de l’EPC, ou cochez la case si l’annonce donne l’adresse complète.',
    epc_exemption_reason: 'Précisez pourquoi aucun EPC n’est requis.',
    epc_label: 'Choisissez un label de A+ à F.',
    renovation_obligation: 'Indiquez si l’obligation de rénovation (renovatieplicht) s’applique.',
    flood_p_score: 'Choisissez le P-score de la parcelle (A à D).',
    plot_is_built: 'Indiquez si la parcelle est bâtie.',
    flood_g_score: 'Choisissez le G-score du bâtiment (A à D).',
    urban_permit_issued: 'Indiquez si un permis d’urbanisme a été délivré.',
    urban_zoning_designation: 'Indiquez l’affectation urbanistique la plus récente.',
    urban_summons: 'Indiquez si une citation ou une mesure de réparation est en cours.',
    urban_preemption_right: 'Indiquez si un droit de préemption s’applique.',
    urban_subdivision_permit: 'Indiquez si un permis de lotir s’applique.',
    cpe_status: 'Indiquez si le bien dispose d’un certificat de performance énergétique.',
    cpe_energy_class: 'Choisissez la classe de performance énergétique.',
    cpe_insulation_class: 'Choisissez la classe d’isolation thermique.',
    cpe_environmental_class: 'Choisissez une classe de la liste.',
    cpe_exemption_reason: 'Précisez pourquoi aucun certificat n’est requis.'
  });

  /* ---------------- JSON type helpers (mirror of the SQL helpers) ---------------- */
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const nonNeg = (o, k) => has(o, k) && isNum(o[k]) && o[k] >= 0;      // zfind_jsonb_nonnegative_number
  const positive = (o, k) => has(o, k) && isNum(o[k]) && o[k] > 0;     // zfind_jsonb_positive_number
  const textPresent = (o, k) => has(o, k) && typeof o[k] === 'string' && o[k].trim() !== ''; // zfind_jsonb_text_present
  /* ->> on a JSON value: strings as-is, other scalars as their JSON text, missing/null as null. */
  function asText(o, k) {
    if (!has(o, k) || o[k] === null) return null;
    return typeof o[k] === 'string' ? o[k] : JSON.stringify(o[k]);
  }
  /* jsonb_typeof(x) <> 'boolean' is NULL (so not true) when the key is absent;
     a JSON null is present (jsonb_typeof = 'null') and therefore flagged. */
  const presentNotBoolean = (o, k) => has(o, k) && typeof o[k] !== 'boolean';
  /* coalesce(jsonb_typeof(x), '') <> 'boolean': absent is flagged too (new profiles). */
  const notBoolean = (o, k) => !(has(o, k) && typeof o[k] === 'boolean');
  const inList = (o, k, list) => list.includes((asText(o, k) || '').toUpperCase());

  function profileKind(profile) { return PROFILE_INFO[profile] ? PROFILE_INFO[profile].kind : null; }
  function profileCountry(profile) { return PROFILE_INFO[profile] ? PROFILE_INFO[profile].country : null; }

  /** Exact mirror of zfind_compliance_profile_missing (and so of
      zfind_validate_listing_compliance_facts for an existing record):
      same keys, same order. */
  function sqlMissing(profile, facts) {
    const f = facts && typeof facts === 'object' && !Array.isArray(facts) ? facts : {};
    const m = [];
    const georisques = () => { if (f.georisques_disclosure !== true) m.push('georisques_disclosure'); };
    const energyCosts = () => {
      if (!nonNeg(f, 'energy_cost_min')) m.push('energy_cost_min');
      if (!nonNeg(f, 'energy_cost_max')) m.push('energy_cost_max');
      if (nonNeg(f, 'energy_cost_min') && nonNeg(f, 'energy_cost_max') && f.energy_cost_max < f.energy_cost_min) m.push('energy_cost_range');
      if (!textPresent(f, 'energy_cost_reference_year')) m.push('energy_cost_reference_year');
    };
    const condo = strict => {
      if (strict ? notBoolean(f, 'is_condominium') : presentNotBoolean(f, 'is_condominium')) {
        m.push('is_condominium');
      } else if (f.is_condominium === true) {
        if (!positive(f, 'condominium_lots_count')) m.push('condominium_lots_count');
        if (!nonNeg(f, 'annual_condominium_charges')) m.push('annual_condominium_charges');
        if (!textPresent(f, 'condominium_procedure_status')) m.push('condominium_procedure_status');
      }
    };

    if (profile === SALE || profile === RENT) {
      georisques();
      if (!FEES_PAYERS.includes(asText(f, 'fees_payer') || '')) m.push('fees_payer');
      if (!nonNeg(f, 'agency_fees_amount')) m.push('agency_fees_amount');
      const dpe = asText(f, 'dpe_status') || '';
      if (!['available', 'exempt'].includes(dpe)) {
        m.push('dpe_status');
      } else if (dpe === 'available') {
        if (!inList(f, 'dpe_energy_class', CLASSES)) m.push('dpe_energy_class');
        if (!inList(f, 'ghg_class', CLASSES)) m.push('ghg_class');
        energyCosts();
      } else if (!textPresent(f, 'dpe_exemption_reason')) {
        m.push('dpe_exemption_reason');
      }
      if (profile === SALE) {
        if (presentNotBoolean(f, 'price_includes_agency_fees')) m.push('price_includes_agency_fees');
        condo(false);
      } else {
        if (!positive(f, 'surface_habitable_sqm')) m.push('surface_habitable_sqm');
        if (!nonNeg(f, 'monthly_rent_excl_charges')) m.push('monthly_rent_excl_charges');
        if (!nonNeg(f, 'monthly_charges')) m.push('monthly_charges');
        if (!['provision', 'forfait', 'none'].includes(asText(f, 'charges_recovery_method') || '')) m.push('charges_recovery_method');
        if (!nonNeg(f, 'deposit_amount')) m.push('deposit_amount');
        if (!nonNeg(f, 'tenant_fees_amount')) m.push('tenant_fees_amount');
        if (!nonNeg(f, 'inventory_fees_amount')) m.push('inventory_fees_amount');
        if (presentNotBoolean(f, 'furnished')) m.push('furnished');
        const rc = asText(f, 'rent_control_status') || '';
        if (!['applicable', 'not_applicable'].includes(rc)) {
          m.push('rent_control_status');
        } else if (rc === 'applicable') {
          if (!positive(f, 'reference_rent')) m.push('reference_rent');
          if (!positive(f, 'increased_reference_rent')) m.push('increased_reference_rent');
          if (!nonNeg(f, 'rent_supplement_amount')) m.push('rent_supplement_amount');
        }
      }
      return m;
    }

    if (profile === NEW_DEV) {
      georisques();
      if (!FEES_PAYERS.includes(asText(f, 'fees_payer') || '')) m.push('fees_payer');
      if (!nonNeg(f, 'agency_fees_amount')) m.push('agency_fees_amount');
      const dpe = asText(f, 'dpe_status') || '';
      if (!['available', 'exempt', 'pending_completion'].includes(dpe)) {
        m.push('dpe_status');
      } else if (dpe === 'available') {
        if (!inList(f, 'dpe_energy_class', CLASSES)) m.push('dpe_energy_class');
        if (!inList(f, 'ghg_class', CLASSES)) m.push('ghg_class');
        energyCosts();
      } else if (dpe === 'exempt' && !textPresent(f, 'dpe_exemption_reason')) {
        m.push('dpe_exemption_reason');
      }
      if (presentNotBoolean(f, 'price_includes_agency_fees')) m.push('price_includes_agency_fees');
      return m;
    }

    if ([COM_SALE, COM_RENT, LAND_SALE, LAND_RENT].includes(profile)) {
      georisques();
      if (profile === COM_SALE || profile === LAND_SALE) {
        if (!['seller', 'buyer', 'shared'].includes(asText(f, 'fees_payer') || '')) m.push('fees_payer');
        if (!nonNeg(f, 'agency_fees_amount')) m.push('agency_fees_amount');
        if (notBoolean(f, 'price_includes_agency_fees')) m.push('price_includes_agency_fees');
      } else if (profile === LAND_RENT) {
        if (!['landlord', 'tenant', 'shared'].includes(asText(f, 'fees_payer') || '')) m.push('fees_payer');
        if (!nonNeg(f, 'agency_fees_amount')) m.push('agency_fees_amount');
      }
      if (profile === COM_SALE || profile === COM_RENT) {
        const dpe = asText(f, 'dpe_status') || '';
        if (!['available', 'exempt'].includes(dpe)) {
          m.push('dpe_status');
        } else if (dpe === 'available') {
          if (!inList(f, 'dpe_energy_class', TERTIARY_CLASSES)) m.push('dpe_energy_class');
          if (!inList(f, 'ghg_class', TERTIARY_CLASSES)) m.push('ghg_class');
        } else if (!textPresent(f, 'dpe_exemption_reason')) {
          m.push('dpe_exemption_reason');
        }
      }
      if (profile === COM_SALE) condo(true);
      return m;
    }

    if ([WAL_SALE, WAL_RENT, BRU_SALE, BRU_RENT].includes(profile)) {
      const st = asText(f, 'peb_status') || '';
      if (!['available', 'exempt'].includes(st)) {
        m.push('peb_status');
      } else if (st === 'available') {
        if (profile.startsWith('be_wal_')) {
          if (!inList(f, 'peb_class', WAL_CLASSES)) m.push('peb_class');
          if (!nonNeg(f, 'peb_specific_consumption_kwh_m2')) m.push('peb_specific_consumption_kwh_m2');
          if (!nonNeg(f, 'peb_total_consumption_kwh')) m.push('peb_total_consumption_kwh');
          if (!textPresent(f, 'peb_certificate_code')) m.push('peb_certificate_code');
        } else {
          if (!inList(f, 'peb_class', BRU_CLASSES)) m.push('peb_class');
          if (!nonNeg(f, 'peb_primary_energy_kwh_m2')) m.push('peb_primary_energy_kwh_m2');
          if (!nonNeg(f, 'peb_co2_kg_m2')) m.push('peb_co2_kg_m2');
        }
      } else if (!textPresent(f, 'peb_exemption_reason')) {
        m.push('peb_exemption_reason');
      }
      if (profile.endsWith('_rent_v1')) {
        if (!nonNeg(f, 'monthly_rent')) m.push('monthly_rent');
        if (!nonNeg(f, 'monthly_common_charges')) m.push('monthly_common_charges');
      }
      return m;
    }

    if (profile === VLA_SALE || profile === VLA_RENT) {
      const st = asText(f, 'epc_status') || '';
      if (!['available', 'exempt'].includes(st)) {
        m.push('epc_status');
      } else if (st === 'available') {
        if (!nonNeg(f, 'epc_score_kwh_m2')) m.push('epc_score_kwh_m2');
        if (!textPresent(f, 'epc_unique_code') && f.epc_address_in_ad !== true) m.push('epc_unique_code');
      } else if (!textPresent(f, 'epc_exemption_reason')) {
        m.push('epc_exemption_reason');
      }
      if (profile === VLA_SALE) {
        if (notBoolean(f, 'renovation_obligation')) m.push('renovation_obligation');
        if (!inList(f, 'flood_p_score', FLOOD_SCORES)) m.push('flood_p_score');
        if (notBoolean(f, 'plot_is_built')) {
          m.push('plot_is_built');
        } else if (f.plot_is_built === true) {
          if (!inList(f, 'flood_g_score', FLOOD_SCORES)) m.push('flood_g_score');
        }
        if (notBoolean(f, 'urban_permit_issued')) m.push('urban_permit_issued');
        if (!textPresent(f, 'urban_zoning_designation')) m.push('urban_zoning_designation');
        if (notBoolean(f, 'urban_summons')) m.push('urban_summons');
        if (notBoolean(f, 'urban_preemption_right')) m.push('urban_preemption_right');
        if (notBoolean(f, 'urban_subdivision_permit')) m.push('urban_subdivision_permit');
      } else {
        if (!nonNeg(f, 'monthly_rent')) m.push('monthly_rent');
        if (!nonNeg(f, 'monthly_common_charges')) m.push('monthly_common_charges');
      }
      return m;
    }

    if (profile === LU_SALE || profile === LU_RENT) {
      const st = asText(f, 'cpe_status') || '';
      if (!['available', 'exempt'].includes(st)) {
        m.push('cpe_status');
      } else if (st === 'available') {
        if (!inList(f, 'cpe_energy_class', LU_CLASSES)) m.push('cpe_energy_class');
        if (!inList(f, 'cpe_insulation_class', LU_CLASSES)) m.push('cpe_insulation_class');
      } else if (!textPresent(f, 'cpe_exemption_reason')) {
        m.push('cpe_exemption_reason');
      }
      return m;
    }

    return ['unsupported_profile'];
  }

  /** What the form requires: everything the SQL validator requires, plus
      the booleans the SQL lets through when absent (price incl. fees,
      copropriété, meublé), a 4-digit reference year, a whole number of
      lots and well-formed optional fields.
      Returns { valid, missing (SQL keys), errors: { formFieldKey: message } }. */
  function validateFacts(profile, facts) {
    const f = facts && typeof facts === 'object' && !Array.isArray(facts) ? facts : {};
    if (!PROFILES.includes(profile)) return { valid: false, missing: ['unsupported_profile'], errors: {} };
    const missing = sqlMissing(profile, f);
    const errors = {};
    const add = (key, field) => { const k = field || key; if (!errors[k]) errors[k] = MESSAGES[key] || MESSAGES[k] || 'Champ à vérifier.'; };
    missing.forEach(key => {
      if (key === 'energy_cost_range') add('energy_cost_range', 'energy_cost_max');
      else if (key === 'condominium_procedure_status') add('condominium_procedure_choice');
      else add(key);
    });
    const requireBool = key => { if (typeof f[key] !== 'boolean') { add(key); if (!missing.includes(key)) missing.push(key); } };
    if (profile === SALE) { requireBool('price_includes_agency_fees'); requireBool('is_condominium'); }
    if (profile === NEW_DEV) requireBool('price_includes_agency_fees');
    if (profile === RENT) requireBool('furnished');
    if (DPE_FULL.includes(profile) && f.dpe_status === 'available' && textPresent(f, 'energy_cost_reference_year') && !/^(19|20)\d{2}$/.test(f.energy_cost_reference_year.trim())) add('energy_cost_reference_year');
    if (CONDO.includes(profile) && f.is_condominium === true && positive(f, 'condominium_lots_count') && !Number.isInteger(f.condominium_lots_count)) add('condominium_lots_count');
    if (CONDO.includes(profile) && f.is_condominium === true && typeof f.condominium_procedure_status === 'string'
        && f.condominium_procedure_status.startsWith(PROCEDURE_ONGOING_PREFIX.trim()) && !procedureParts(f.condominium_procedure_status).detail) add('condominium_procedure_detail');
    if (has(f, 'agency_fees_percent') && !(isNum(f.agency_fees_percent) && f.agency_fees_percent >= 0 && f.agency_fees_percent <= 100)) add('agency_fees_percent');
    if (has(f, 'fees_schedule_url') && !(typeof f.fees_schedule_url === 'string' && /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(f.fees_schedule_url))) add('fees_schedule_url');
    if (has(f, 'surface_carrez_sqm') && !positive(f, 'surface_carrez_sqm')) add('surface_carrez_sqm');
    if ((profile === SALE || profile === NEW_DEV) && has(f, 'surface_habitable_sqm') && !positive(f, 'surface_habitable_sqm')) add('surface_habitable_sqm');
    if (has(f, 'dpe_ademe_number') && !(typeof f.dpe_ademe_number === 'string' && f.dpe_ademe_number.length <= 40)) add('dpe_ademe_number');
    // Optional facts of the new profiles: well formed when present.
    if ([COM_RENT, LU_SALE, LU_RENT].includes(profile)) {
      if (has(f, 'fees_payer') && !FEES_PAYERS.includes(asText(f, 'fees_payer') || '')) add('fees_payer');
      if (has(f, 'agency_fees_amount') && !nonNeg(f, 'agency_fees_amount')) add('agency_fees_amount');
    }
    if (VLA.includes(profile) && has(f, 'epc_label') && !inList(f, 'epc_label', VLA_LABELS)) add('epc_label');
    if (LU_PROFILES.includes(profile) && has(f, 'cpe_environmental_class') && !inList(f, 'cpe_environmental_class', LU_CLASSES)) add('cpe_environmental_class');
    return { valid: Object.keys(errors).length === 0 && missing.length === 0, missing, errors };
  }

  /* ---------------- Form values <-> facts ---------------- */

  /* "1 234,50" / "1234.5" / " 12 " -> number; '' -> undefined; garbage stays a string (flagged by the validator). */
  function parseNumber(raw) {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : String(raw);
    const s = String(raw).replace(/[\s  ]/g, '').replace(',', '.');
    if (s === '') return undefined;
    if (!/^-?\d+(\.\d+)?$/.test(s)) return String(raw).trim();
    return Number(s);
  }
  function parseBool(raw) {
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  }

  function procedureParts(status) {
    const s = typeof status === 'string' ? status.trim() : '';
    if (!s) return { choice: '', detail: '' };
    if (s === PROCEDURE_NONE) return { choice: 'none', detail: '' };
    if (s.startsWith(PROCEDURE_ONGOING_PREFIX.trim())) return { choice: 'ongoing', detail: s.slice(PROCEDURE_ONGOING_PREFIX.trim().length).replace(/^\s*:?\s*/, '').trim() };
    return { choice: 'ongoing', detail: s };
  }

  function fieldsFor(profile) { return FIELDS.filter(d => d.profiles.includes(profile)); }

  /** The branch selectors (enum / bool / check answers) of raw form values,
      so the fields' when() can be evaluated. */
  function selectorsFrom(profile, values) {
    const v = values || {};
    const selectors = {};
    fieldsFor(profile).forEach(d => {
      if (d.form) return;
      if (d.type === 'bool') selectors[d.key] = parseBool(v[d.key]);
      else if (d.type === 'enum') selectors[d.key] = v[d.key] ? String(v[d.key]) : undefined;
      else if (d.type === 'check') selectors[d.key] = v[d.key] === true || v[d.key] === 'true' ? true : undefined;
    });
    return selectors;
  }

  /** values: { key: raw form value } (strings from inputs/radios/selects,
      booleans from checkboxes). Returns the facts JSON for the profile:
      JSON numbers / booleans / trimmed strings, only the keys of the
      branches that apply (DPE vs exemption, copropriété, encadrement…). */
  function buildFacts(profile, values) {
    const v = values || {};
    const facts = {};
    const relevant = fieldsFor(profile);
    const selectors = selectorsFrom(profile, v);
    relevant.forEach(d => {
      if (d.form || !d.when(selectors)) return;
      if (d.formWhen && !d.formWhen(selectors)) return;
      const raw = v[d.key];
      let value;
      if (d.type === 'number') value = parseNumber(raw);
      else if (d.type === 'bool') value = parseBool(raw);
      else if (d.type === 'check') value = raw === true || raw === 'true' ? true : undefined;
      else if (d.type === 'class') value = raw ? String(raw).trim().toUpperCase() : undefined;
      else if (d.type === 'enum') value = raw ? String(raw) : undefined;
      else { const s = raw == null ? '' : String(raw).trim(); value = s === '' ? undefined : s; }
      if (value !== undefined) facts[d.key] = value;
    });
    if (CONDO.includes(profile) && selectors.is_condominium === true) {
      const choice = v.condominium_procedure_choice;
      const detail = String(v.condominium_procedure_detail || '').trim();
      if (choice === 'none') facts.condominium_procedure_status = PROCEDURE_NONE;
      else if (choice === 'ongoing') facts.condominium_procedure_status = PROCEDURE_ONGOING_PREFIX + detail;
    }
    if (facts.fees_payer && !FEES_PAYERS.includes(facts.fees_payer)) delete facts.fees_payer;
    return facts;
  }

  /** The inverse of buildFacts, for filling the form. */
  function formValues(profile, facts) {
    const f = facts || {};
    const out = {};
    fieldsFor(profile).forEach(d => {
      if (d.form || !has(f, d.key) || f[d.key] === null) return;
      out[d.key] = d.type === 'bool' ? String(f[d.key]) : d.type === 'check' ? f[d.key] === true : String(f[d.key]);
    });
    if (CONDO.includes(profile) && has(f, 'condominium_procedure_status')) {
      const p = procedureParts(f.condominium_procedure_status);
      out.condominium_procedure_choice = p.choice;
      out.condominium_procedure_detail = p.detail;
    }
    return out;
  }

  /** Facts to start the form with: what is already stored wins; what is
      missing comes from the property (energy class, certificate number,
      surface, copropriété charges) and the commercial terms (rent). */
  function prefillFacts(profile, ctx) {
    const c = ctx || {};
    const p = c.property || {};
    const l = c.listing || {};
    const existing = c.existingFacts && typeof c.existingFacts === 'object' ? c.existingFacts : {};
    const derived = {};
    const rating = String(p.energy_rating || '').trim().toUpperCase();
    const certificate = p.energy_certificate_number && String(p.energy_certificate_number).trim() ? String(p.energy_certificate_number).trim() : '';
    const surface = Number(p.gross_private_area_sqm) > 0 ? Number(p.gross_private_area_sqm) : Number(p.area_sqm) > 0 ? Number(p.area_sqm) : null;
    if (DPE_ALL.includes(profile)) {
      const scale = [COM_SALE, COM_RENT].includes(profile) ? TERTIARY_CLASSES : CLASSES;
      if (scale.includes(rating)) { derived.dpe_status = 'available'; derived.dpe_energy_class = rating; }
      if (certificate) derived.dpe_ademe_number = certificate.slice(0, 40);
    } else if (PEB.includes(profile)) {
      const scale = profile.startsWith('be_bru_') ? BRU_CLASSES : WAL_CLASSES;
      if (scale.includes(rating)) { derived.peb_status = 'available'; derived.peb_class = rating; }
      if (certificate) derived.peb_certificate_code = certificate.slice(0, 60);
    } else if (VLA.includes(profile)) {
      if (VLA_LABELS.includes(rating)) { derived.epc_status = 'available'; derived.epc_label = rating; }
      if (certificate) derived.epc_unique_code = certificate.slice(0, 60);
    } else if (LU_PROFILES.includes(profile)) {
      if (LU_CLASSES.includes(rating)) { derived.cpe_status = 'available'; derived.cpe_energy_class = rating; }
    }
    if (surface && [SALE, RENT, NEW_DEV].includes(profile)) derived.surface_habitable_sqm = surface;
    if (CONDO.includes(profile) && Number(p.condo_fee_monthly) > 0) derived.annual_condominium_charges = Math.round(Number(p.condo_fee_monthly) * 12 * 100) / 100;
    if (profile === RENT && Number(l.price_current) > 0) derived.monthly_rent_excl_charges = Number(l.price_current);
    if (BE_RENTS.includes(profile) && Number(l.price_current) > 0) derived.monthly_rent = Number(l.price_current);
    const merged = Object.assign({}, derived, existing);
    // A stored exemption must not be overridden by a derived class.
    if (existing.dpe_status && existing.dpe_status !== 'available') delete merged.dpe_energy_class;
    if (existing.peb_status === 'exempt') delete merged.peb_class;
    if (existing.epc_status === 'exempt') delete merged.epc_label;
    if (existing.cpe_status === 'exempt') delete merged.cpe_energy_class;
    return merged;
  }

  /* ---------------- Status & wording ---------------- */

  const GATED = Object.freeze(['FR', 'BE', 'LU']);

  /** row: { jurisdiction_iso, profile, review_status, review_note, facts_valid, missing? }
      Returns null when no mandatory-information rules apply (country outside FR / BE / LU). */
  function statusOf(row) {
    if (!row || !GATED.includes(String(row.jurisdiction_iso || '').toUpperCase())) return null;
    const country = String(row.jurisdiction_iso).toUpperCase();
    if (!PROFILES.includes(row.profile)) {
      const missing = Array.isArray(row.missing) ? row.missing : [];
      if (country === 'BE' && missing.includes('be_region_unresolved')) {
        return { code: 'unsupported', tone: 'warn', label: 'Région à préciser', long: 'Région belge non déterminée : choisissez la commune du bien (section « Le bien ») pour afficher les mentions de la Wallonie, de Bruxelles-Capitale ou de la Flandre.' };
      }
      return { code: 'unsupported', tone: 'warn', label: 'Non couvert', long: `Type d’annonce non couvert par les mentions obligatoires (${COUNTRY_FR[country]}) : publication impossible pour l’instant.` };
    }
    const note = row.review_note ? String(row.review_note) : '';
    if (row.review_status === 'rejected') {
      return { code: 'rejected', tone: 'bad', label: 'Refusé', long: note ? `Refusé — motif : ${note}` : 'Refusé', note };
    }
    if (!row.facts_valid) return { code: 'todo', tone: 'todo', label: 'À compléter', long: 'À compléter' };
    if (row.review_status === 'approved') return { code: 'approved', tone: 'ok', label: 'Validé', long: 'Validé par Z Find' };
    if (row.review_status === 'pending') return { code: 'pending', tone: 'wait', label: 'En attente de validation Z Find', long: 'En attente de validation Z Find' };
    return { code: 'todo', tone: 'todo', label: 'À compléter', long: 'À compléter' };
  }

  function labelFor(def, profile) {
    return (def.labelByProfile && def.labelByProfile[profile]) || def.label || def.key;
  }
  function isRequired(def, profile) {
    return def.requiredByProfile ? !!def.requiredByProfile[profile] : !!def.required;
  }
  function optionsFor(def, profile) {
    if (def.type === 'class') return classesFor(def, profile).map(c => [c, c]);
    return (def.optionsByProfile && def.optionsByProfile[profile]) || def.options || [];
  }

  const money = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
  const num = n => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);

  /** Readable French rows { group, label, value } of submitted facts (Admin detail). */
  function factRows(profile, facts) {
    const f = facts || {};
    const rows = [];
    fieldsFor(profile).forEach(d => {
      if (d.form || !has(f, d.key) || f[d.key] === null || f[d.key] === '') return;
      const raw = f[d.key];
      const label = labelFor(d, profile);
      let value;
      if (d.type === 'check') value = raw === true ? 'Oui' : 'Non';
      else if (d.type === 'bool' || d.type === 'enum') {
        const opt = optionsFor(d, profile).find(([k]) => k === String(raw));
        value = opt ? opt[1] : (typeof raw === 'boolean' ? (raw ? 'Oui' : 'Non') : String(raw));
      } else if (d.type === 'number' && isNum(raw)) {
        const unit = /\(([^)]*(kWh|kg CO₂)[^)]*)\)/.exec(label);
        value = /€/.test(label) ? money(raw) : /m²\b|m²,|m²\)/.test(label) && !unit ? num(raw) + ' m²' : unit ? num(raw) + ' ' + unit[1].replace(/,?\s*facultatif/, '') : /%/.test(label) ? num(raw) + ' %' : num(raw);
      } else value = String(raw);
      if (d.key === 'georisques_disclosure') value = raw === true ? 'Oui, mention présente' : 'Non';
      rows.push({ group: d.group, key: d.key, label: d.shortLabel || label.replace(/,\s*facultatif\)/, ')').replace(/\s*\(facultatif\)/, ''), value });
    });
    if (CONDO.includes(profile) && has(f, 'condominium_procedure_status')) {
      rows.push({ group: 'condo', key: 'condominium_procedure_status', label: 'Procédure en cours dans la copropriété', value: String(f.condominium_procedure_status) });
    }
    const order = GROUPS.map(g => g[0]);
    return rows.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  }

  function missingText(keys) {
    const list = (Array.isArray(keys) ? keys : []).map(k => MISSING_LABELS[k] || k);
    return list.join(', ');
  }

  function parseKeyList(text) {
    const m = /(\[[^\]]*\])/.exec(text || '');
    if (!m) return [];
    try { const arr = JSON.parse(m[1]); return Array.isArray(arr) ? arr.map(String) : []; } catch (_) { return []; }
  }

  const LIFECYCLE_FR = { draft: 'brouillon', incomplete: 'incomplète', pending_review: 'à vérifier', ready: 'prête à publier', published: 'publiée', suspended: 'suspendue', archived: 'archivée' };
  const GATE_COUNTRY = { France: ['France', 'en France'], Belgium: ['Belgique', 'en Belgique'], Luxembourg: ['Luxembourg', 'au Luxembourg'] };

  /** French message for any error raised by the compliance or Listing
      lifecycle commands (PostgREST passes the SQL message through). */
  function describeError(error, fallback) {
    const fb = fallback || 'L’opération a échoué. Réessayez dans un instant.';
    if (!error) return fb;
    if (error.type === 'network_failure') return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
    const msg = String(error.message || '');
    let m;
    if ((m = /(France|Belgium|Luxembourg) Listing compliance gate failed/i.exec(msg))) {
      const country = GATE_COUNTRY[m[1]] || GATE_COUNTRY.France;
      const keys = parseKeyList(msg);
      const facts = keys.filter(k => k !== 'review_approval');
      if (!facts.length) return `Publication bloquée : les mentions obligatoires (${country[0]}) n’ont pas encore été validées par Z Find. Validez-les dans « Mentions obligatoires à valider », puis publiez.`;
      return `Publication bloquée : mentions obligatoires (${country[0]}) incomplètes — ${missingText(facts)}. L’agence doit les compléter, puis Z Find doit les valider.`;
    }
    if ((m = /(France|Belgium|Luxembourg) Listings must be created before publication/i.exec(msg))) {
      const country = GATE_COUNTRY[m[1]] || GATE_COUNTRY.France;
      return `Une annonce ${country[1]} doit d’abord être créée, complétée et validée avant d’être publiée.`;
    }
    if (/Suspend the Listing before changing approved compliance facts/i.test(msg)) return 'Cette annonce est en ligne : les mentions validées ne peuvent pas être modifiées. Demandez à Z Find de suspendre l’annonce, puis modifiez-les.';
    if (/Compliance facts are incomplete/i.test(msg)) return `Validation impossible : mentions incomplètes — ${missingText(parseKeyList(msg))}. Refusez avec un motif pour que l’agence les complète.`;
    if (/Compliance record not found/i.test(msg)) return 'Aucune mention obligatoire n’a été enregistrée pour cette annonce.';
    if (/Listing compliance access denied/i.test(msg)) return 'Vous n’avez pas accès aux mentions de cette annonce.';
    if (/Admin role required/i.test(msg)) return 'Action réservée à l’équipe Z Find.';
    if (/p_decision must be/i.test(msg)) return 'Décision invalide : choisissez Valider ou Refuser.';
    if (/p_facts must be|p_source_evidence must be/i.test(msg)) return 'Les mentions envoyées sont mal formées. Rechargez la page et réessayez.';
    if (/Listing not found|Listing .* not found/i.test(msg)) return 'Annonce introuvable.';
    if ((m = /Illegal Listing transition: (\w+) -> (\w+)/i.exec(msg))) return `Changement de statut impossible : « ${LIFECYCLE_FR[m[1]] || m[1]} » vers « ${LIFECYCLE_FR[m[2]] || m[2]} ».`;
    if (/must have a positive price/i.test(msg)) return 'L’annonce doit avoir un prix supérieur à 0 avant ce changement de statut.';
    if (/non-empty title and description/i.test(msg)) return 'L’annonce doit avoir au moins un titre et une description avant ce changement de statut.';
    if (/while Representation is/i.test(msg)) return 'Activez d’abord le mandat (bouton « Activer ») avant de publier l’annonce.';
    if (/already has a published Listing/i.test(msg)) return 'Ce mandat a déjà une annonce publiée.';
    if (error.type === 'authorization_failure') return 'Accès refusé. Reconnectez-vous puis réessayez.';
    return fb;
  }

  /* ---------------- RPC wrappers ---------------- */
  let clientModule = supabaseClientModule;
  function svc() {
    if (!clientModule && typeof require === 'function') clientModule = require('./supabaseClient');
    return clientModule;
  }
  function rpc(name, args, context, options) {
    const m = svc();
    return m.safeQuery(() => m.getSupabaseClient().rpc(name, args), context, options);
  }

  /* Exact argument names of the SQL functions (asserted by the unit test). */
  function getListingCompliance(listingId) {
    return rpc('zfind_get_listing_compliance', { p_listing_id: listingId }, 'listingCompliance.get');
  }
  function saveListingCompliance(listingId, facts, sourceEvidence) {
    return rpc('zfind_save_listing_compliance', { p_listing_id: listingId, p_facts: facts || {}, p_source_evidence: sourceEvidence || {} }, 'listingCompliance.save');
  }
  function reviewListingCompliance(listingId, decision, note) {
    return rpc('zfind_admin_review_listing_compliance', { p_listing_id: listingId, p_decision: decision, p_note: note == null || String(note).trim() === '' ? null : String(note).trim() }, 'listingCompliance.review');
  }
  function listStatuses(listingIds) {
    const ids = Array.from(new Set((listingIds || []).filter(Boolean)));
    if (!ids.length) return Promise.resolve({ data: [], error: null });
    return rpc('zfind_list_listing_compliance_status', { p_listing_ids: ids }, 'listingCompliance.listStatuses', { allowNullData: true });
  }
  function adminQueue(reviewStatus, listingId) {
    return rpc('zfind_admin_list_listing_compliance', { p_review_status: reviewStatus === undefined ? 'pending' : reviewStatus, p_listing_id: listingId || null }, 'listingCompliance.adminQueue', { allowNullData: true });
  }

  return Object.freeze({
    SALE, RENT, NEW_DEV, COM_SALE, COM_RENT, LAND_SALE, LAND_RENT,
    WAL_SALE, WAL_RENT, BRU_SALE, BRU_RENT, VLA_SALE, VLA_RENT, LU_SALE, LU_RENT,
    PROFILES, FR_PROFILES, BE_PROFILES, LU_PROFILES, FR_RESIDENTIAL, PROFILE_INFO,
    CLASSES, TERTIARY_CLASSES, WAL_CLASSES, BRU_CLASSES, VLA_LABELS, LU_CLASSES, FLOOD_SCORES,
    GROUPS, FIELDS, MISSING_LABELS, MESSAGES, PROCEDURE_NONE, PROCEDURE_ONGOING_PREFIX,
    profileKind, profileCountry, profileLabel, jurisdictionLabel, beRegion, profileFor,
    fieldsFor, labelFor, isRequired, optionsFor, classesFor, selectorsFrom,
    sqlMissing, validateFacts, buildFacts, formValues, prefillFacts, procedureParts, parseNumber,
    statusOf, factRows, missingText, describeError,
    getListingCompliance, saveListingCompliance, reviewListingCompliance, listStatuses, adminQueue,
    _setClientModuleForTests(m) { clientModule = m; }
  });
});
