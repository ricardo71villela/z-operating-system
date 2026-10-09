/* Contract: French mandatory listing information (« mentions obligatoires »).
   The browser service mirrors the SQL validator of migration 20260830112835,
   calls the SQL functions with their exact parameter names, speaks French,
   and both apps are wired to it. The same service is replayed against the
   real SQL in tests/sql/listing-compliance.test.mjs (PGlite). */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const FIND = path.join(__dirname, '..', '..');
const REPO = path.join(FIND, '..', '..');
const MIGRATIONS = path.join(REPO, 'infrastructure', 'supabase', 'migrations');
const C = require(path.join(FIND, 'apps', 'zfind-web', 'src', 'services', 'listing-compliance.js'));

let passed = 0;
function check(label, value) { assert(value, label); passed += 1; console.log('PASS:', label); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const gate = fs.readFileSync(path.join(MIGRATIONS, '20260830112835_z_find_global_listing_compliance_launch_v2.sql'), 'utf8');
const queueName = fs.readdirSync(MIGRATIONS).filter(n => n.endsWith('_z_find_listing_compliance_review_queue_v1.sql')).sort().at(-1);
const queue = fs.readFileSync(path.join(MIGRATIONS, queueName), 'utf8');

console.log('\n=== Z FIND — MENTIONS OBLIGATOIRES (FRANCE) ===');

/* ---------- SQL contract parsed from the migrations ---------- */
const validatorBody = gate.slice(gate.indexOf('function public.zfind_validate_listing_compliance_facts'), gate.indexOf('function public.zfind_assess_listing_compliance'));
const sqlKeys = Array.from(new Set(Array.from(validatorBody.matchAll(/array_append\(v_missing,'([a-z_]+)'\)/g)).map(m => m[1])));
const gateKeys = Array.from(new Set(Array.from(gate.matchAll(/'([a-z_]+)'/g)).map(m => m[1])));
check('every key the SQL validator can report has a French label', sqlKeys.length === 29 && sqlKeys.every(k => C.MISSING_LABELS[k]));
check('… and the gate keys too (review_approval, unsupported_profile, jurisdiction_unresolved)', ['review_approval', 'unsupported_profile', 'jurisdiction_unresolved', 'unsupported_jurisdiction'].every(k => gateKeys.includes(k) && C.MISSING_LABELS[k]));
const factKeys = sqlKeys.filter(k => !['compliance_record', 'energy_cost_range'].includes(k));
const formKeys = new Set(C.FIELDS.filter(d => !d.form).map(d => d.key).concat(['condominium_procedure_status']));
check('the form collects every fact the SQL validator checks', factKeys.every(k => formKeys.has(k)));
const inList = re => { const m = re.exec(validatorBody); return m ? Array.from(m[1].matchAll(/'([^']+)'/g)).map(x => x[1]) : null; };
check('fees_payer values match the SQL list', same(inList(/'fees_payer',''\) not in \(([^)]+)\)/), ['seller', 'buyer', 'landlord', 'tenant', 'shared']));
const optionKeys = key => C.FIELDS.find(d => d.key === key);
check('sale form offers seller / buyer / shared; rent form landlord / tenant / shared',
  same(C.optionsFor(optionKeys('fees_payer'), C.SALE).map(o => o[0]), ['seller', 'buyer', 'shared']) && same(C.optionsFor(optionKeys('fees_payer'), C.RENT).map(o => o[0]), ['landlord', 'tenant', 'shared']));
check('charges_recovery_method / dpe_status / rent_control_status options match the SQL lists',
  same(inList(/'charges_recovery_method',''\) not in \(([^)]+)\)/), C.optionsFor(optionKeys('charges_recovery_method'), C.RENT).map(o => o[0]))
  && same(inList(/v_dpe_status not in \(([^)]+)\)/), C.optionsFor(optionKeys('dpe_status'), C.SALE).map(o => o[0]))
  && same(inList(/v_rent_control_status not in \(([^)]+)\)/), C.optionsFor(optionKeys('rent_control_status'), C.RENT).map(o => o[0])));
check('energy classes A to G, like the SQL', same(C.CLASSES, inList(/not in \(('A'[^)]+)\)/)));

/* ---------- exact mirror of the SQL validator (hand-checked cases) ---------- */
check('empty facts (sale): base keys only — absent booleans pass the SQL check',
  same(C.sqlMissing(C.SALE, {}), ['georisques_disclosure', 'fees_payer', 'agency_fees_amount', 'dpe_status']));
check('empty facts (rent): base + rent keys, furnished absent passes the SQL check',
  same(C.sqlMissing(C.RENT, {}), ['georisques_disclosure', 'fees_payer', 'agency_fees_amount', 'dpe_status', 'surface_habitable_sqm', 'monthly_rent_excl_charges', 'monthly_charges', 'charges_recovery_method', 'deposit_amount', 'tenant_fees_amount', 'inventory_fees_amount', 'rent_control_status']));
check('JSON null booleans are flagged (jsonb_typeof = null)', same(C.sqlMissing(C.SALE, { price_includes_agency_fees: null, is_condominium: null }).slice(-2), ['price_includes_agency_fees', 'is_condominium']));
check('numbers must be JSON numbers, not strings', C.sqlMissing(C.SALE, { agency_fees_amount: '100' }).includes('agency_fees_amount') && !C.sqlMissing(C.SALE, { agency_fees_amount: 0 }).includes('agency_fees_amount'));
check('lowercase energy class accepted (upper() in SQL), energy range checked',
  same(C.sqlMissing(C.SALE, { dpe_status: 'available', dpe_energy_class: 'd', ghg_class: 'e', energy_cost_min: 2000, energy_cost_max: 1500, energy_cost_reference_year: '2023' }).slice(3), ['energy_cost_range']));
check('reference year must be a JSON string', C.sqlMissing(C.SALE, { dpe_status: 'available', energy_cost_reference_year: 2023 }).includes('energy_cost_reference_year'));
check('exemption needs a reason, and no DPE class', same(C.sqlMissing(C.SALE, { dpe_status: 'exempt' }).slice(3), ['dpe_exemption_reason']));
check('copropriété: lots > 0, charges ≥ 0, procedure text',
  same(C.sqlMissing(C.SALE, { is_condominium: true, condominium_lots_count: 0, annual_condominium_charges: 0, condominium_procedure_status: ' ' }).slice(4), ['condominium_lots_count', 'condominium_procedure_status']));
check('rent control applicable: reference rents > 0, supplement ≥ 0',
  same(C.sqlMissing(C.RENT, { rent_control_status: 'applicable', reference_rent: 0, increased_reference_rent: 10, rent_supplement_amount: 0 }).filter(k => /rent$|supplement/.test(k)).slice(-1), ['reference_rent']));

/* ---------- form validation (stricter than the SQL) ---------- */
const v1 = C.validateFacts(C.SALE, { georisques_disclosure: true, fees_payer: 'seller', agency_fees_amount: 0, dpe_status: 'exempt', dpe_exemption_reason: 'Monument historique' });
check('form requires the booleans the SQL lets through when absent',
  !v1.valid && v1.errors.price_includes_agency_fees && v1.errors.is_condominium && same(Object.keys(v1.errors).sort(), ['is_condominium', 'price_includes_agency_fees']));
check('form requires « meublé ou vide » for a rental', !!C.validateFacts(C.RENT, {}).errors.furnished);
const v2 = C.validateFacts(C.SALE, { dpe_status: 'available', dpe_energy_class: 'C', ghg_class: 'C', energy_cost_min: 900, energy_cost_max: 800, energy_cost_reference_year: 'janvier', is_condominium: true, condominium_lots_count: 2.5, annual_condominium_charges: 10, condominium_procedure_status: 'Procédure en cours : ' });
check('range error shown on the maximum field', v2.errors.energy_cost_max === 'Le montant maximum doit être supérieur ou égal au montant minimum.');
check('4-digit reference year, whole lot count, procedure detail required',
  /4 chiffres/.test(v2.errors.energy_cost_reference_year) && /nombre entier/.test(v2.errors.condominium_lots_count) && /nature de la procédure/.test(v2.errors.condominium_procedure_detail));
const v3 = C.validateFacts(C.SALE, { agency_fees_percent: 140, fees_schedule_url: 'mon-site', surface_carrez_sqm: 0 });
check('optional fields are checked when filled', v3.errors.agency_fees_percent && v3.errors.fees_schedule_url && v3.errors.surface_carrez_sqm);
check('unknown profile is never valid', C.validateFacts(null, {}).valid === false);

/* ---------- form values <-> facts ---------- */
const sale = C.buildFacts(C.SALE, { dpe_status: 'available', dpe_energy_class: 'd', ghg_class: 'E', energy_cost_min: '1 200', energy_cost_max: '1 700,50', energy_cost_reference_year: ' 2023 ',
  dpe_exemption_reason: 'ignoré', fees_payer: 'buyer', agency_fees_amount: '15 000', price_includes_agency_fees: 'true', agency_fees_percent: '', is_condominium: 'false',
  condominium_lots_count: '12', condominium_procedure_choice: 'none', monthly_charges: '50', georisques_disclosure: true });
check('French numbers (spaces, comma) become JSON numbers; class upper-cased; year trimmed',
  sale.energy_cost_min === 1200 && sale.energy_cost_max === 1700.5 && sale.agency_fees_amount === 15000 && sale.dpe_energy_class === 'D' && sale.energy_cost_reference_year === '2023');
check('only the branches that apply are stored (no exemption reason, no copropriété details, no rent keys)',
  !('dpe_exemption_reason' in sale) && !('condominium_lots_count' in sale) && !('condominium_procedure_status' in sale) && !('monthly_charges' in sale) && !('agency_fees_percent' in sale) && sale.is_condominium === false);
check('built sale facts are valid', C.validateFacts(C.SALE, sale).valid);
const condo = C.buildFacts(C.SALE, { is_condominium: 'true', condominium_procedure_choice: 'ongoing', condominium_procedure_detail: ' mandat ad hoc ' });
check('procedure stored as readable French text (shown on the public page)', condo.condominium_procedure_status === 'Procédure en cours : mandat ad hoc'
  && same(C.procedureParts(condo.condominium_procedure_status), { choice: 'ongoing', detail: 'mandat ad hoc' })
  && C.buildFacts(C.SALE, { is_condominium: 'true', condominium_procedure_choice: 'none' }).condominium_procedure_status === C.PROCEDURE_NONE);
check('garbage in a number field stays a string, so it is reported', C.buildFacts(C.RENT, { deposit_amount: 'deux mois' }).deposit_amount === 'deux mois' && !!C.validateFacts(C.RENT, { deposit_amount: 'deux mois' }).errors.deposit_amount);
check('fees payer outside the allowed values is dropped', !('fees_payer' in C.buildFacts(C.SALE, { fees_payer: 'agency' })));
check('rent control details only when applicable', !('reference_rent' in C.buildFacts(C.RENT, { rent_control_status: 'not_applicable', reference_rent: '20' }))
  && C.buildFacts(C.RENT, { rent_control_status: 'applicable', reference_rent: '20' }).reference_rent === 20);
const fv = C.formValues(C.SALE, condo);
check('formValues is the inverse for radios and the composite procedure', fv.is_condominium === 'true' && fv.condominium_procedure_choice === 'ongoing' && fv.condominium_procedure_detail === 'mandat ad hoc');
check('round trip form → facts → form → facts is stable', same(C.buildFacts(C.SALE, C.formValues(C.SALE, sale)), sale));

/* ---------- prefill ---------- */
const property = { energy_rating: 'C', energy_certificate_number: '2374E0123456X', gross_private_area_sqm: 64.5, area_sqm: 70, condo_fee_monthly: 150 };
const pre = C.prefillFacts(C.SALE, { property, listing: { price_current: 472000 }, existingFacts: {} });
check('prefill from the property: DPE class, ADEME number, surface, annual charges', pre.dpe_status === 'available' && pre.dpe_energy_class === 'C' && pre.dpe_ademe_number === '2374E0123456X' && pre.surface_habitable_sqm === 64.5 && pre.annual_condominium_charges === 1800);
check('prefill rent from the commercial terms', C.prefillFacts(C.RENT, { property: {}, listing: { price_current: 1350 } }).monthly_rent_excl_charges === 1350);
check('stored facts win over the property', C.prefillFacts(C.SALE, { property, existingFacts: { dpe_status: 'exempt', dpe_exemption_reason: 'Monument historique' } }).dpe_status === 'exempt'
  && !('dpe_energy_class' in C.prefillFacts(C.SALE, { property, existingFacts: { dpe_status: 'exempt' } })));
check('Portuguese ratings (A+, B-) are not taken as French classes', !('dpe_energy_class' in C.prefillFacts(C.SALE, { property: { energy_rating: 'A+' } })));

/* ---------- status wording ---------- */
const S = (review_status, facts_valid, extra) => C.statusOf(Object.assign({ jurisdiction_iso: 'FR', profile: C.SALE, review_status, facts_valid, review_note: null }, extra || {}));
check('« À compléter » when nothing saved or facts incomplete', S('unreviewed', false).label === 'À compléter' && S('pending', false).label === 'À compléter');
check('« En attente de validation Z Find » when submitted and complete', S('pending', true).label === 'En attente de validation Z Find');
check('« Validé »', S('approved', true).label === 'Validé');
check('approved but facts invalid (e.g. sale switched to rent) → « À compléter »', S('approved', false).code === 'todo');
check('« Refusé — motif : … »', S('rejected', true, { review_note: 'Classe GES manquante' }).long === 'Refusé — motif : Classe GES manquante');
check('no badge outside France, « Non couvert » for an FR programme', C.statusOf({ jurisdiction_iso: 'BE', profile: null }) === null && S('unreviewed', false, { profile: null }).code === 'unsupported');

/* ---------- errors in French ---------- */
check('publish gate, review missing only', /^Publication bloquée : les mentions obligatoires \(France\) n’ont pas encore été validées/.test(C.describeError({ message: 'France Listing compliance gate failed: ["review_approval"]' })));
check('publish gate, facts missing listed in French', C.describeError({ message: 'France Listing compliance gate failed: ["ghg_class", "review_approval"]' }).includes('classe climat (GES)'));
check('published listing facts locked', /^Cette annonce est en ligne/.test(C.describeError({ message: 'Suspend the Listing before changing approved compliance facts' })));
check('lifecycle errors translated', C.describeError({ message: 'Illegal Listing transition: draft -> published' }) === 'Changement de statut impossible : « brouillon » vers « publiée ».'
  && /mandat/.test(C.describeError({ message: 'Listing cannot be published while Representation is proposed; activate the Representation first' })));
check('unknown error → the caller’s French fallback, never the raw English', C.describeError({ message: 'some internal failure' }, 'Impossible.') === 'Impossible.');

/* ---------- readable facts (Admin detail) ---------- */
const rows = C.factRows(C.SALE, Object.assign({}, sale, { surface_carrez_sqm: 64.2 }));
const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
check('facts rendered in French for the Admin', byKey.fees_payer.value === 'de l’acquéreur' && byKey.price_includes_agency_fees.value === 'Oui, honoraires inclus'
  && /15\s000,00\s€/.test(byKey.agency_fees_amount.value) && byKey.surface_carrez_sqm.value === '64,2 m²' && byKey.surface_carrez_sqm.label === 'Surface loi Carrez (m²)' && byKey.georisques_disclosure.label === 'Mention Géorisques dans l’annonce');

/* ---------- French only ---------- */
const visible = [];
C.FIELDS.forEach(d => { visible.push(d.label || '', ...Object.values(d.labelByProfile || {}), d.placeholder || '', ...(d.suggestions || []));
  [...(d.options || []), ...Object.values(d.optionsByProfile || {}).flat()].forEach(o => visible.push(o[1])); });
visible.push(...Object.values(C.MESSAGES), ...Object.values(C.MISSING_LABELS), ...C.GROUPS.map(g => g[1]));
const partnerUi = fs.readFileSync(path.join(FIND, 'apps', 'zfind-partner', 'src', 'compliance.js'), 'utf8');
const adminUi = fs.readFileSync(path.join(FIND, 'apps', 'zfind-admin', 'src', 'compliance.js'), 'utf8');
const NOT_FRENCH = /\b(the|and|save|submit|approve|reject|pending|approved|rejected|loading|error|guardar|aprovar|rejeitar|anúncio|morada|renda|fiador)\b/i;
check('every label, option and message of the service is French', visible.filter(Boolean).every(t => !NOT_FRENCH.test(t)));
const textNodes = src => Array.from(src.matchAll(/>([^<>{}$`]*[A-Za-zÀ-ÿ][^<>{}$`]*)</g)).map(m => m[1].trim()).filter(Boolean);
check('visible text in both apps’ compliance screens is French', textNodes(partnerUi).concat(textNodes(adminUi)).every(t => !NOT_FRENCH.test(t)));

/* ---------- RPC names and argument names = SQL signatures ---------- */
const signature = (sql, name) => {
  const m = new RegExp(`function public\\.${name}\\(([^)]*)\\)`).exec(sql);
  return m ? m[1].split(',').map(a => a.trim().split(/\s+/)[0]).filter(Boolean) : null;
};
const calls = [];
C._setClientModuleForTests({ getSupabaseClient: () => ({ rpc: (name, args) => { calls.push({ name, args }); return Promise.resolve({ data: [], error: null }); } }), safeQuery: fn => fn() });
(async () => {
  await C.getListingCompliance('L1');
  await C.saveListingCompliance('L1', { a: 1 });
  await C.reviewListingCompliance('L1', 'rejected', '  motif  ');
  await C.listStatuses(['L1', 'L1', null, 'L2']);
  await C.adminQueue();
  await C.adminQueue(null, 'L1');
  const expect = {
    zfind_get_listing_compliance: signature(gate, 'zfind_get_listing_compliance'),
    zfind_save_listing_compliance: signature(gate, 'zfind_save_listing_compliance'),
    zfind_admin_review_listing_compliance: signature(gate, 'zfind_admin_review_listing_compliance'),
    zfind_list_listing_compliance_status: signature(queue, 'zfind_list_listing_compliance_status'),
    zfind_admin_list_listing_compliance: signature(queue, 'zfind_admin_list_listing_compliance')
  };
  check('RPC argument names equal the SQL parameter names', calls.every(c => same(Object.keys(c.args), expect[c.name])) && Object.values(expect).every(Boolean));
  check('save always sends JSON objects; review trims the note; statuses deduplicated',
    same(calls[1].args.p_source_evidence, {}) && calls[2].args.p_note === 'motif' && same(calls[3].args.p_listing_ids, ['L1', 'L2']));
  check('queue defaults to pending; detail asks for any status of one listing', calls[4].args.p_review_status === 'pending' && calls[5].args.p_review_status === null && calls[5].args.p_listing_id === 'L1');
  await C.reviewListingCompliance('L1', 'approved', '');
  check('an empty note is sent as null', calls[6].args.p_note === null);

  /* ---------- the new migration ---------- */
  check('queue migration: read-only, additive, no table/policy change',
    !/\b(create|alter|drop)\s+(table|policy)\b/i.test(queue) && !/\b(insert|update|delete)\s+(into|public\.|from)/i.test(queue.replace(/--.*$/gm, '')));
  check('queue migration: security definer, pinned search_path, same Admin check as the review function',
    (queue.match(/security definer/g) || []).length === 2 && (queue.match(/set search_path = pg_catalog/g) || []).length === 2
    && queue.includes("p.role = 'admin'") && queue.includes('zfind_can_manage_listing_compliance(l.id)'));
  check('queue migration: revoked from public/anon, granted to authenticated only',
    /revoke all on function public\.zfind_list_listing_compliance_status\(uuid\[\]\) from public, anon, authenticated/.test(queue)
    && /grant execute on function public\.zfind_admin_list_listing_compliance\(text, uuid\) to authenticated;/.test(queue) && !/to anon/.test(queue));
  const latest = fs.readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort();
  check('queue migration is newer than the compliance gate migration', latest.indexOf(queueName) > latest.indexOf('20260830112835_z_find_global_listing_compliance_launch_v2.sql'));

  /* ---------- wiring in both apps ---------- */
  const read = rel => fs.readFileSync(path.join(FIND, 'apps', rel), 'utf8');
  const partnerBuild = read('zfind-partner/scripts/build.js');
  const adminBuild = read('zfind-admin/scripts/build.js');
  const partnerApp = read('zfind-partner/src/app.js');
  const adminApp = read('zfind-admin/src/app.js');
  const adminBody = read('zfind-admin/src/body.html');
  check('both builds load the shared service (zfind-web) and their own screen',
    partnerBuild.includes("readWeb('services/listing-compliance.js')") && partnerBuild.includes("readPartner('compliance.js')")
    && adminBuild.includes("readWeb('services/listing-compliance.js')") && adminBuild.includes("readAdmin('compliance.js')")
    && partnerBuild.indexOf('listingComplianceService + ') < partnerBuild.indexOf('complianceJs + ') && partnerBuild.indexOf('complianceJs + ') < partnerBuild.indexOf('+ appJs'));
  check('partner: section in the listing workspace, reloaded after the commercial terms, badge in the portfolio',
    partnerApp.includes('${complianceHostHtml()}') && partnerApp.includes('loadPartnerCompliance(listing)') && partnerApp.includes('loadPartnerCompliance(Object.assign(')
    && partnerApp.includes('decoratePortfolioCompliance()') && partnerUi.includes('saveListingCompliance('));
  check('partner never moves the Listing lifecycle (no partner command exists)', !/setListingStatus|zfind_admin_transition_listing/.test(partnerApp + partnerUi));
  check('admin: queue route, sidebar entry, review with reason, list column and filter',
    adminApp.includes("conformite: adminState.id ? renderComplianceDetail : renderComplianceQueue") && adminBody.includes("openComplianceQueue('pending')")
    && adminUi.includes("reviewListingCompliance(listingId, decision") && adminUi.includes('Indiquez le motif du refus') && adminApp.includes('propComplianceMatches(p, f.compliance)'));
  check('admin « Publier » shows lifecycle / compliance errors in French', /listingCompliance\.describeError\(result\.error, 'Impossible de changer le statut de l’annonce\.'\)/.test(adminApp));
  check('admin compliance.js does not touch adminState at load time (loaded before app.js)',
    adminUi.split('\n').filter(l => /^\S/.test(l) && /adminState/.test(l) && !/^\s*(\/\*|\/\/)/.test(l)).length === 0);

  console.log(`\n${passed} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
