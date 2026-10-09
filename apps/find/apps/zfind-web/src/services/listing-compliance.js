/* ============================================================
   Z FIND — services/listing-compliance.js
   ============================================================
   French mandatory listing information (« mentions obligatoires »),
   shared by the Partner panel (entry) and the Admin (review).

   The database is the authority — migration
   20260830112835_z_find_global_listing_compliance_launch_v2:
   - zfind_validate_listing_compliance_facts: profiles
     fr_residential_sale_v1 / fr_residential_rent_v1;
   - zfind_save_listing_compliance (Partner or Admin): stores the facts
     and puts the record back to review_status = 'pending' whenever the
     facts change;
   - zfind_admin_review_listing_compliance (Admin): approved | rejected;
   - trigger zfind_listing_compliance_before_publish: a France Listing
     cannot become 'published' unless facts are valid AND approved.
   Read companions (migration 20261009120000_z_find_listing_compliance_review_queue_v1):
   zfind_list_listing_compliance_status, zfind_admin_list_listing_compliance.

   This module:
   - FIELDS: the facts each profile collects (required + useful optional
     ones), with French labels;
   - sqlMissing(): an exact mirror of the SQL validator (same keys, same
     order, same JSON type rules) — kept in step by a unit test;
   - validateFacts(): sqlMissing + the stricter checks the form applies
     (booleans must be answered, year format, whole lot count, optional
     fields well formed), with one French message per field;
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

  const SALE = 'fr_residential_sale_v1';
  const RENT = 'fr_residential_rent_v1';
  const PROFILES = Object.freeze([SALE, RENT]);
  const CLASSES = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  const FEES_PAYERS = Object.freeze(['seller', 'buyer', 'landlord', 'tenant', 'shared']);
  const PROCEDURE_NONE = 'Aucune procédure en cours';
  const PROCEDURE_ONGOING_PREFIX = 'Procédure en cours : ';

  /* ---------------- Field catalogue ----------------
     key: the facts JSON key (SQL contract) — or, for the two composite
     form controls, a form-only key (form: true).
     when(f): the field applies (else it is neither shown nor stored).
     required: the form requires it when it applies. */
  const isAvailable = f => f.dpe_status === 'available';
  const isExempt = f => f.dpe_status === 'exempt';
  const isCondo = f => f.is_condominium === true;
  const isRentControlled = f => f.rent_control_status === 'applicable';
  const always = () => true;

  const GROUPS = Object.freeze([
    ['dpe', 'Performance énergétique (DPE)'],
    ['fees', 'Honoraires d’agence'],
    ['condo', 'Copropriété'],
    ['surface', 'Surfaces'],
    ['rent', 'Loyer et charges'],
    ['tenant', 'Dépôt de garantie et frais à la charge du locataire'],
    ['rentControl', 'Encadrement des loyers'],
    ['risks', 'Risques (Géorisques)']
  ]);

  const FIELDS = Object.freeze([
    { key: 'dpe_status', group: 'dpe', type: 'enum', required: true, profiles: PROFILES, when: always,
      label: 'Diagnostic de performance énergétique',
      options: [['available', 'Le bien dispose d’un DPE'], ['exempt', 'Le bien est exempté de DPE']] },
    { key: 'dpe_energy_class', group: 'dpe', type: 'class', required: true, profiles: PROFILES, when: isAvailable,
      label: 'Classe énergie' },
    { key: 'ghg_class', group: 'dpe', type: 'class', required: true, profiles: PROFILES, when: isAvailable,
      label: 'Classe climat (GES)' },
    { key: 'energy_cost_min', group: 'dpe', type: 'number', min: 0, required: true, profiles: PROFILES, when: isAvailable,
      label: 'Dépenses annuelles d’énergie estimées — minimum (€)' },
    { key: 'energy_cost_max', group: 'dpe', type: 'number', min: 0, required: true, profiles: PROFILES, when: isAvailable,
      label: 'Dépenses annuelles d’énergie estimées — maximum (€)' },
    { key: 'energy_cost_reference_year', group: 'dpe', type: 'year', required: true, profiles: PROFILES, when: isAvailable,
      label: 'Année de référence des prix de l’énergie', placeholder: 'ex. : 2023' },
    { key: 'dpe_ademe_number', group: 'dpe', type: 'text', maxLength: 40, required: false, profiles: PROFILES, when: isAvailable,
      label: 'Numéro ADEME du DPE (facultatif)' },
    { key: 'dpe_exemption_reason', group: 'dpe', type: 'text', maxLength: 300, required: true, profiles: PROFILES, when: isExempt,
      label: 'Motif de l’exemption',
      suggestions: ['Bâtiment de moins de 50 m² isolé', 'Monument historique', 'Lieu de culte', 'Construction provisoire (moins de 2 ans)', 'Bâtiment agricole, artisanal ou industriel non résidentiel', 'Résidence secondaire occupée moins de 4 mois par an'] },

    { key: 'fees_payer', group: 'fees', type: 'enum', required: true, profiles: PROFILES, when: always,
      label: 'Honoraires à la charge',
      optionsByProfile: {
        [SALE]: [['seller', 'du vendeur'], ['buyer', 'de l’acquéreur'], ['shared', 'partagés vendeur / acquéreur']],
        [RENT]: [['landlord', 'du bailleur'], ['tenant', 'du locataire'], ['shared', 'partagés bailleur / locataire']]
      } },
    { key: 'agency_fees_amount', group: 'fees', type: 'number', min: 0, required: true, profiles: PROFILES, when: always,
      labelByProfile: { [SALE]: 'Montant des honoraires (€ TTC)', [RENT]: 'Honoraires d’agence totaux (€ TTC)' } },
    { key: 'price_includes_agency_fees', group: 'fees', type: 'bool', required: true, profiles: [SALE], when: always,
      label: 'Le prix affiché inclut les honoraires',
      options: [['true', 'Oui, honoraires inclus'], ['false', 'Non, prix net vendeur']] },
    { key: 'agency_fees_percent', group: 'fees', type: 'number', min: 0, max: 100, required: false, profiles: [SALE], when: always,
      label: 'Honoraires en % du prix hors honoraires (facultatif)' },
    { key: 'fees_schedule_url', group: 'fees', type: 'url', required: false, profiles: PROFILES, when: always,
      label: 'Lien vers votre barème d’honoraires (facultatif)', placeholder: 'https://' },

    { key: 'is_condominium', group: 'condo', type: 'bool', required: true, profiles: [SALE], when: always,
      label: 'Bien soumis au statut de la copropriété',
      options: [['true', 'Oui'], ['false', 'Non']] },
    { key: 'condominium_lots_count', group: 'condo', type: 'number', min: 0, positive: true, integer: true, required: true, profiles: [SALE], when: isCondo,
      label: 'Nombre de lots de la copropriété' },
    { key: 'annual_condominium_charges', group: 'condo', type: 'number', min: 0, required: true, profiles: [SALE], when: isCondo,
      label: 'Charges courantes annuelles — quote-part du lot (€)' },
    { key: 'condominium_procedure_choice', form: true, group: 'condo', type: 'enum', required: true, profiles: [SALE], when: isCondo,
      label: 'Procédure en cours (art. 29-1 A et 29-1 de la loi du 10 juillet 1965)',
      options: [['none', 'Aucune procédure en cours'], ['ongoing', 'Procédure en cours']] },
    { key: 'condominium_procedure_detail', form: true, group: 'condo', type: 'text', maxLength: 300, required: true, profiles: [SALE],
      when: isCondo, formWhen: v => v.condominium_procedure_choice === 'ongoing',
      label: 'Nature de la procédure', placeholder: 'ex. : mandat ad hoc, administration provisoire' },
    { key: 'surface_carrez_sqm', group: 'surface', type: 'number', min: 0, positive: true, required: false, profiles: [SALE], when: isCondo,
      label: 'Surface loi Carrez (m², facultatif)' },
    { key: 'surface_habitable_sqm', group: 'surface', type: 'number', min: 0, positive: true, profiles: PROFILES, when: always,
      requiredByProfile: { [SALE]: false, [RENT]: true },
      labelByProfile: { [SALE]: 'Surface habitable (m², facultatif)', [RENT]: 'Surface habitable (m²)' } },

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

    { key: 'georisques_disclosure', group: 'risks', type: 'check', required: true, profiles: PROFILES, when: always, shortLabel: 'Mention Géorisques dans l’annonce',
      label: 'L’annonce mentionne : « Les informations sur les risques auxquels ce bien est exposé sont disponibles sur le site Géorisques : www.georisques.gouv.fr ».' }
  ]);

  /* French label of every key the SQL validator / gate can report. */
  const MISSING_LABELS = Object.freeze({
    compliance_record: 'mentions non enregistrées',
    jurisdiction_unresolved: 'commune du bien non renseignée',
    unsupported_jurisdiction: 'pays non couvert par le contrôle',
    unsupported_profile: 'type d’annonce non couvert (logement en vente ou en location uniquement)',
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
    rent_supplement_amount: 'complément de loyer'
  });

  /* One message per field, shown under the field. */
  const MESSAGES = Object.freeze({
    georisques_disclosure: 'Cochez la mention Géorisques : elle est obligatoire dans toute annonce.',
    fees_payer: 'Indiquez à qui incombent les honoraires.',
    agency_fees_amount: 'Indiquez le montant des honoraires en euros (0 s’il n’y en a pas).',
    dpe_status: 'Indiquez si le bien dispose d’un DPE ou s’il en est exempté.',
    dpe_energy_class: 'Choisissez la classe énergie (A à G).',
    ghg_class: 'Choisissez la classe climat GES (A à G).',
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
    dpe_ademe_number: 'Le numéro ADEME ne peut pas dépasser 40 caractères.'
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

  function profileKind(profile) { return profile === SALE ? 'sale' : profile === RENT ? 'rent' : null; }

  /** Exact mirror of zfind_validate_listing_compliance_facts for a known
      FR profile and an existing record: same keys, same order. */
  function sqlMissing(profile, facts) {
    const f = facts && typeof facts === 'object' && !Array.isArray(facts) ? facts : {};
    const m = [];
    if (f.georisques_disclosure !== true) m.push('georisques_disclosure');
    if (!FEES_PAYERS.includes(asText(f, 'fees_payer') || '')) m.push('fees_payer');
    if (!nonNeg(f, 'agency_fees_amount')) m.push('agency_fees_amount');
    const dpe = asText(f, 'dpe_status') || '';
    if (!['available', 'exempt'].includes(dpe)) {
      m.push('dpe_status');
    } else if (dpe === 'available') {
      if (!CLASSES.includes((asText(f, 'dpe_energy_class') || '').toUpperCase())) m.push('dpe_energy_class');
      if (!CLASSES.includes((asText(f, 'ghg_class') || '').toUpperCase())) m.push('ghg_class');
      if (!nonNeg(f, 'energy_cost_min')) m.push('energy_cost_min');
      if (!nonNeg(f, 'energy_cost_max')) m.push('energy_cost_max');
      if (nonNeg(f, 'energy_cost_min') && nonNeg(f, 'energy_cost_max') && f.energy_cost_max < f.energy_cost_min) m.push('energy_cost_range');
      if (!textPresent(f, 'energy_cost_reference_year')) m.push('energy_cost_reference_year');
    } else if (!textPresent(f, 'dpe_exemption_reason')) {
      m.push('dpe_exemption_reason');
    }
    if (profile === SALE) {
      if (presentNotBoolean(f, 'price_includes_agency_fees')) m.push('price_includes_agency_fees');
      if (presentNotBoolean(f, 'is_condominium')) {
        m.push('is_condominium');
      } else if (f.is_condominium === true) {
        if (!positive(f, 'condominium_lots_count')) m.push('condominium_lots_count');
        if (!nonNeg(f, 'annual_condominium_charges')) m.push('annual_condominium_charges');
        if (!textPresent(f, 'condominium_procedure_status')) m.push('condominium_procedure_status');
      }
    } else if (profile === RENT) {
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
    if (profile === RENT) requireBool('furnished');
    if (f.dpe_status === 'available' && textPresent(f, 'energy_cost_reference_year') && !/^(19|20)\d{2}$/.test(f.energy_cost_reference_year.trim())) add('energy_cost_reference_year');
    if (profile === SALE && f.is_condominium === true && positive(f, 'condominium_lots_count') && !Number.isInteger(f.condominium_lots_count)) add('condominium_lots_count');
    if (profile === SALE && f.is_condominium === true && typeof f.condominium_procedure_status === 'string'
        && f.condominium_procedure_status.startsWith(PROCEDURE_ONGOING_PREFIX.trim()) && !procedureParts(f.condominium_procedure_status).detail) add('condominium_procedure_detail');
    if (has(f, 'agency_fees_percent') && !(isNum(f.agency_fees_percent) && f.agency_fees_percent >= 0 && f.agency_fees_percent <= 100)) add('agency_fees_percent');
    if (has(f, 'fees_schedule_url') && !(typeof f.fees_schedule_url === 'string' && /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(f.fees_schedule_url))) add('fees_schedule_url');
    if (has(f, 'surface_carrez_sqm') && !positive(f, 'surface_carrez_sqm')) add('surface_carrez_sqm');
    if (profile === SALE && has(f, 'surface_habitable_sqm') && !positive(f, 'surface_habitable_sqm')) add('surface_habitable_sqm');
    if (has(f, 'dpe_ademe_number') && !(typeof f.dpe_ademe_number === 'string' && f.dpe_ademe_number.length <= 40)) add('dpe_ademe_number');
    return { valid: Object.keys(errors).length === 0 && missing.length === 0, missing, errors };
  }

  /* ---------------- Form values <-> facts ---------------- */

  /* "1 234,50" / "1234.5" / " 12 " -> number; '' -> undefined; garbage stays a string (flagged by the validator). */
  function parseNumber(raw) {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : String(raw);
    const s = String(raw).replace(/[\s  ]/g, '').replace(',', '.');
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

  /** values: { key: raw form value } (strings from inputs/radios/selects,
      booleans from checkboxes). Returns the facts JSON for the profile:
      JSON numbers / booleans / trimmed strings, only the keys of the
      branches that apply (DPE vs exemption, copropriété, encadrement). */
  function buildFacts(profile, values) {
    const v = values || {};
    const facts = {};
    const relevant = fieldsFor(profile);
    // First pass: the branch selectors, so when() can be evaluated.
    const selectors = {};
    relevant.forEach(d => {
      if (d.form) return;
      if (d.type === 'bool') selectors[d.key] = parseBool(v[d.key]);
      else if (d.type === 'enum') selectors[d.key] = v[d.key] ? String(v[d.key]) : undefined;
    });
    relevant.forEach(d => {
      if (d.form || !d.when(selectors)) return;
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
    if (profile === SALE && selectors.is_condominium === true) {
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
    if (has(f, 'condominium_procedure_status')) {
      const p = procedureParts(f.condominium_procedure_status);
      out.condominium_procedure_choice = p.choice;
      out.condominium_procedure_detail = p.detail;
    }
    return out;
  }

  /** Facts to start the form with: what is already stored wins; what is
      missing comes from the property (DPE class, ADEME number, surface,
      copropriété charges) and the commercial terms (rent). */
  function prefillFacts(profile, ctx) {
    const c = ctx || {};
    const p = c.property || {};
    const l = c.listing || {};
    const existing = c.existingFacts && typeof c.existingFacts === 'object' ? c.existingFacts : {};
    const derived = {};
    const rating = String(p.energy_rating || '').trim().toUpperCase();
    if (CLASSES.includes(rating)) { derived.dpe_status = 'available'; derived.dpe_energy_class = rating; }
    if (p.energy_certificate_number && String(p.energy_certificate_number).trim()) derived.dpe_ademe_number = String(p.energy_certificate_number).trim().slice(0, 40);
    const surface = Number(p.gross_private_area_sqm) > 0 ? Number(p.gross_private_area_sqm) : Number(p.area_sqm) > 0 ? Number(p.area_sqm) : null;
    if (surface) derived.surface_habitable_sqm = surface;
    if (profile === SALE && Number(p.condo_fee_monthly) > 0) derived.annual_condominium_charges = Math.round(Number(p.condo_fee_monthly) * 12 * 100) / 100;
    if (profile === RENT && Number(l.price_current) > 0) derived.monthly_rent_excl_charges = Number(l.price_current);
    const merged = Object.assign({}, derived, existing);
    // A stored DPE exemption must not be overridden by a derived class.
    if (existing.dpe_status === 'exempt') { delete merged.dpe_energy_class; }
    return merged;
  }

  /* ---------------- Status & wording ---------------- */

  /** row: { jurisdiction_iso, profile, review_status, review_note, facts_valid }
      Returns null when France rules do not apply (not a France listing). */
  function statusOf(row) {
    if (!row || String(row.jurisdiction_iso || '').toUpperCase() !== 'FR') return null;
    if (!PROFILES.includes(row.profile)) {
      return { code: 'unsupported', tone: 'warn', label: 'Non couvert', long: 'Type d’annonce non couvert par le contrôle (logements en vente ou en location uniquement) : publication impossible en France pour l’instant.' };
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
    if (def.type === 'class') return CLASSES.map(c => [c, c]);
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
      let value;
      if (d.type === 'check') value = raw === true ? 'Oui, mention présente' : 'Non';
      else if (d.type === 'bool' || d.type === 'enum') {
        const opt = optionsFor(d, profile).find(([k]) => k === String(raw));
        value = opt ? opt[1] : (typeof raw === 'boolean' ? (raw ? 'Oui' : 'Non') : String(raw));
      } else if (d.type === 'number' && isNum(raw)) {
        value = /€/.test(labelFor(d, profile)) ? money(raw) : /m²/.test(labelFor(d, profile)) ? num(raw) + ' m²' : /%/.test(labelFor(d, profile)) ? num(raw) + ' %' : num(raw);
      } else value = String(raw);
      rows.push({ group: d.group, key: d.key, label: d.shortLabel || labelFor(d, profile).replace(/,\s*facultatif\)/, ')').replace(/\s*\(facultatif\)/, ''), value });
    });
    if (has(f, 'condominium_procedure_status')) {
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

  /** French message for any error raised by the compliance or Listing
      lifecycle commands (PostgREST passes the SQL message through). */
  function describeError(error, fallback) {
    const fb = fallback || 'L’opération a échoué. Réessayez dans un instant.';
    if (!error) return fb;
    if (error.type === 'network_failure') return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
    const msg = String(error.message || '');
    let m;
    if (/France Listing compliance gate failed/i.test(msg)) {
      const keys = parseKeyList(msg);
      const facts = keys.filter(k => k !== 'review_approval');
      if (!facts.length) return 'Publication bloquée : les mentions obligatoires (France) n’ont pas encore été validées par Z Find. Validez-les dans « Mentions obligatoires à valider », puis publiez.';
      return `Publication bloquée : mentions obligatoires (France) incomplètes — ${missingText(facts)}. L’agence doit les compléter, puis Z Find doit les valider.`;
    }
    if (/France Listings must be created before publication/i.test(msg)) return 'Une annonce en France doit d’abord être créée, complétée et validée avant d’être publiée.';
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
    SALE, RENT, PROFILES, CLASSES, GROUPS, FIELDS, MISSING_LABELS, MESSAGES, PROCEDURE_NONE, PROCEDURE_ONGOING_PREFIX,
    profileKind, fieldsFor, labelFor, isRequired, optionsFor,
    sqlMissing, validateFacts, buildFacts, formValues, prefillFacts, procedureParts, parseNumber,
    statusOf, factRows, missingText, describeError,
    getListingCompliance, saveListingCompliance, reviewListingCompliance, listStatuses, adminQueue,
    _setClientModuleForTests(m) { clientModule = m; }
  });
});
