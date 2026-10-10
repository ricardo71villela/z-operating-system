/* Contract: services/listing-submission.js — « Soumettre à validation »
   precheck (mirror of the SQL readiness check, which
   tests/sql/partner-submit.test.mjs compares on generated states), French
   statuses and errors, Admin bulk plans, sequential runner and summary.
   No network, no database. */
'use strict';
const path = require('path');
const assert = require('assert');
const S = require(path.join(__dirname, '..', '..', 'apps', 'zfind-web', 'src', 'services', 'listing-submission.js'));

let passed = 0;
function check(label, value) { assert(value, label); passed += 1; console.log('PASS:', label); }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  console.log('\n=== Z FIND LISTING SUBMISSION ===');
  const full = { jurisdiction: 'FR', frTitle: 'T3 vue lac', frDescription: 'Bel appartement.', priceCurrent: 472000, photoCount: 3, complianceProfile: 'fr_residential_sale_v1', factsValid: true, reviewStatus: 'pending' };

  /* ---------- statuses ---------- */
  check('French statuses', ['draft', 'pending_review', 'ready', 'published', 'archived'].map(S.statusLabel).join(' | ') === 'Brouillon | En attente de validation | Prête à publier | Publiée | Archivée');
  check('only drafts can be submitted', S.canSubmit('draft') && S.canSubmit('incomplete') && !S.canSubmit('pending_review') && !S.canSubmit('ready') && !S.canSubmit('published'));

  /* ---------- precheck ---------- */
  check('complete FR listing with mentions only pending (not approved): nothing missing', eq(S.precheck(full), []));
  check('empty input: commune, title, description, price, photo (no French rule without a commune)', eq(S.precheck({}), ['commune', 'title_fr', 'description_fr', 'price', 'photo']));
  check('blank title / description are missing', eq(S.precheck(Object.assign({}, full, { frTitle: '  ', frDescription: '\n' })), ['title_fr', 'description_fr']));
  check('price 0, negative, text → missing', ['0', -5, 'abc', null].every(p => eq(S.precheck(Object.assign({}, full, { priceCurrent: p })), ['price'])));
  check('price as a numeric string is accepted', eq(S.precheck(Object.assign({}, full, { priceCurrent: '1350' })), []));
  check('no photo → missing', eq(S.precheck(Object.assign({}, full, { photoCount: 0 })), ['photo']));
  check('FR: incomplete or unsaved mentions → compliance_facts', eq(S.precheck(Object.assign({}, full, { factsValid: false })), ['compliance_facts']));
  check('FR: refused mentions → compliance_rejected', eq(S.precheck(Object.assign({}, full, { reviewStatus: 'rejected' })), ['compliance_rejected']));
  check('FR: invalid AND refused → compliance_facts first (as SQL)', eq(S.precheck(Object.assign({}, full, { factsValid: false, reviewStatus: 'rejected' })), ['compliance_facts']));
  check('FR: no profile (development, commercial) → compliance_unsupported', eq(S.precheck(Object.assign({}, full, { complianceProfile: null })), ['compliance_unsupported']));
  check('BE / LU: no French mentions rule', eq(S.precheck(Object.assign({}, full, { jurisdiction: 'be', complianceProfile: null, factsValid: false })), []));
  check('jurisdiction case-insensitive', eq(S.precheck(Object.assign({}, full, { jurisdiction: 'fr', factsValid: false })), ['compliance_facts']));

  /* ---------- checklist + messages ---------- */
  const list = S.checklist(Object.assign({}, full, { photoCount: 0 }));
  check('checklist: 6 items for France, photo missing with a French hint', list.length === 6 && list.find(i => i.code === 'photo').ok === false && list.find(i => i.code === 'photo').help.includes('Photos') && list.filter(i => !i.ok).length === 1);
  check('checklist: 5 items outside France', S.checklist(Object.assign({}, full, { jurisdiction: 'LU' })).length === 5);
  check('checklist: unsupported FR type replaces the mentions item', S.checklist(Object.assign({}, full, { complianceProfile: null })).pop().code === 'compliance_unsupported');
  const sqlMsg = 'Soumission impossible. Il manque : un titre en français, au moins une photo, les mentions obligatoires (France) complètes et enregistrées.';
  check('missingFromMessage() reads the SQL message back to codes', eq(S.missingFromMessage(sqlMsg), ['title_fr', 'photo', 'compliance_facts']));
  check('missingText() builds the same phrases', 'Soumission impossible. Il manque : ' + S.missingText(['title_fr', 'photo', 'compliance_facts']) + '.' === sqlMsg);

  /* ---------- errors ---------- */
  check('French SQL messages pass through unchanged', S.describeError({ message: sqlMsg }) === sqlMsg && S.describeError({ message: 'Accès refusé : cette annonce n’est pas gérée par votre agence.' }).startsWith('Accès refusé'));
  check('lifecycle errors in French (via listing-compliance)', S.describeError({ message: 'Illegal Listing transition: draft -> ready' }) === 'Changement de statut impossible : « brouillon » vers « prête à publier ».');
  check('network failure in French', S.describeError({ type: 'network_failure', message: 'fetch failed' }) === 'Connexion impossible. Vérifiez votre réseau et réessayez.');
  check('unknown English error → French fallback, never the raw text', S.describeError({ message: 'something exploded' }, 'Impossible de soumettre.') === 'Impossible de soumettre.');
  check('short reasons for the summary', S.shortReason({ message: 'France Listing compliance gate failed: ["review_approval"]' }) === 'mentions obligatoires non validées'
    && S.shortReason({ message: 'France Listing compliance gate failed: ["dpe_status","review_approval"]' }) === 'mentions obligatoires incomplètes'
    && S.shortReason({ message: 'Listing cannot be published while Representation is proposed; activate the Representation first' }) === 'mandat non actif'
    && S.shortReason({ message: 'Illegal Listing transition: draft -> ready' }) === 'statut « Brouillon »');

  /* ---------- bulk plans ---------- */
  check('approve: only « à vérifier »', eq(S.planBulk('approve', 'pending_review'), { steps: ['ready'] }) && S.planBulk('approve', 'ready').skip === 'déjà prête à publier' && S.planBulk('approve', 'draft').skip === 'statut « Brouillon »');
  check('publish: ready → published; à vérifier / suspendue go through « prête »', eq(S.planBulk('publish', 'ready'), { steps: ['published'] }) && eq(S.planBulk('publish', 'pending_review'), { steps: ['ready', 'published'] }) && eq(S.planBulk('publish', 'suspended'), { steps: ['ready', 'published'] }));
  check('publish: drafts are never published by the Admin bulk (agency must submit)', S.planBulk('publish', 'draft').skip === 'pas encore soumise par l’agence' && S.planBulk('publish', 'published').skip === 'déjà publiée');
  check('return to draft: from à vérifier / prête / à compléter only', ['pending_review', 'ready', 'incomplete'].every(s => S.planBulk('return', s).returnToDraft) && S.planBulk('return', 'published').skip === 'statut « Publiée »');
  check('validate and publish: compliance review first', eq(S.planBulk('validate_publish', 'ready'), { reviewCompliance: true, steps: ['published'] }));

  /* ---------- runner ---------- */
  const calls = [];
  let inFlight = 0, maxInFlight = 0;
  const later = v => new Promise(res => setTimeout(() => res(v), 5));
  const deps = {
    transition: async (id, to) => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); calls.push(`${id}:${to}`); const r = await later(id === 'b' && to === 'published' ? { error: { message: 'France Listing compliance gate failed: ["review_approval"]' } } : { data: {} }); inFlight--; return r; },
    returnToDraft: async (id, reason) => { calls.push(`${id}:return:${reason}`); return { data: {} }; },
    approveCompliance: async id => { calls.push(`${id}:compliance`); return id === 'z' ? { error: { message: 'Compliance facts are incomplete: ["dpe_status"]' } } : { data: {} }; }
  };
  const progress = [];
  let res = await S.runBulk('publish', [{ listingId: 'a', status: 'ready' }, { listingId: 'b', status: 'pending_review' }, { listingId: 'c', status: 'draft' }, { listingId: 'd', status: 'ready' }], deps, { onProgress: (d, t, item, r) => progress.push(`${d}/${t}:${r.outcome}`) });
  check('runner: strictly sequential (never two calls at once), in order', maxInFlight === 1 && eq(calls, ['a:published', 'b:ready', 'b:published', 'd:published']));
  check('runner: progress after each listing', eq(progress, ['1/4:done', '2/4:failed', '3/4:skipped', '4/4:done']));
  check('runner: failed listing keeps the last status reached', res[1].status === 'ready' && res[1].reason === 'mentions obligatoires non validées' && res[1].message.startsWith('Publication bloquée'));
  check(`summary: « ${S.summarize('publish', res)} »`, S.summarize('publish', res) === '2 publiées, 1 bloquée : mentions obligatoires non validées, 1 ignorée : pas encore soumise par l’agence');
  calls.length = 0;
  res = await S.runBulk('return', [{ listingId: 'a', status: 'pending_review' }, { listingId: 'b', status: 'ready' }], deps, { reason: 'Photos floues' });
  check('return: the reason goes with every listing', eq(calls, ['a:return:Photos floues', 'b:return:Photos floues']) && S.summarize('return', res) === '2 renvoyées en brouillon');
  calls.length = 0;
  res = await S.runBulk('validate_publish', [{ listingId: 'z', status: 'ready' }], deps);
  check('validate and publish: refused validation stops before publishing', eq(calls, ['z:compliance']) && S.summarize('validate_publish', res) === '0 publiée, 1 bloquée : mentions incomplètes (à refuser avec un motif)');
  res = await S.runBulk('validate', [{ listingId: 'v1' }, { listingId: 'v2' }], deps);
  check('bulk « Valider » the mentions', S.summarize('validate', res) === '2 validées');
  res = await S.runBulk('publish', [{ listingId: 'n', status: 'ready' }], { transition: async () => { throw new Error('fetch failed'); } });
  check('a thrown network error is reported, not raised', res[0].outcome === 'failed' && res[0].reason === 'connexion impossible');
  check('summary with several reasons', S.summarize('publish', [{ outcome: 'failed', reason: 'x' }, { outcome: 'failed', reason: 'y' }, { outcome: 'failed', reason: 'x' }]) === '0 publiée, 3 bloquées (2 : x ; 1 : y)');

  /* ---------- RPC wrappers: names and arguments ---------- */
  const sent = [];
  S._setClientModuleForTests({ getSupabaseClient: () => ({ rpc: async (n, a) => { sent.push([n, a]); return { data: {}, error: null }; } }), safeQuery: async fn => fn() });
  await S.submitListing('l1'); await S.withdrawSubmission('l1'); await S.listStatuses(['l1', 'l1', null, 'l2']); await S.returnToDraft('l1', '  Motif  ');
  check('RPC names and argument names', eq(sent, [['zfind_partner_submit_listing', { p_listing_id: 'l1' }], ['zfind_partner_withdraw_listing_submission', { p_listing_id: 'l1' }],
    ['zfind_list_listing_submission_status', { p_listing_ids: ['l1', 'l2'] }], ['zfind_admin_return_listing_to_draft', { p_listing_id: 'l1', p_reason: 'Motif' }]]));
  const empty = await S.listStatuses([]);
  check('no ids: no call', empty.data.length === 0 && sent.length === 4);

  console.log(`\nLISTING SUBMISSION: ${passed}/${passed} PASSED`);
})().catch(e => { console.error(e); process.exit(1); });
