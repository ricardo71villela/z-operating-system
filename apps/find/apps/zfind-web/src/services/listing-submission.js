/* ============================================================
   Z FIND — services/listing-submission.js
   ============================================================
   « Soumettre à validation » (Partner) and the Admin bulk review
   actions, shared by both apps.

   The database is the authority — migration
   20261009180000_z_find_partner_listing_submission_v1:
   - zfind_partner_submit_listing: draft | incomplete -> pending_review
     (Partner of the agency only), after the readiness check
     zfind_listing_submission_missing;
   - zfind_partner_withdraw_listing_submission: pending_review -> draft;
   - zfind_list_listing_submission_status: status, readiness codes, last
     Z Find return / refusal reason;
   - zfind_admin_return_listing_to_draft: Admin, with a reason (e-mailed
     to the agency by /api/lead-notify).
   Admin approval / publication stay zfind_admin_transition_listing and
   zfind_admin_review_listing_compliance (existing RPCs).

   This module:
   - STATUS: Listing statuses in French (Partner and Admin wording);
   - precheck() / checklist(): an exact mirror of the SQL readiness check
     (same codes, same order — asserted against the SQL by
     tests/sql/partner-submit.test.mjs), for an instant checklist;
   - missingText(): the same French phrases as the SQL error message;
   - bulk plans (planBulk), a sequential runner with progress (runBulk)
     and the French result summary (summarize);
   - describeError(): French text for every error of these commands;
   - RPC wrappers (safeQuery shape, never throw).
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null);
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.listingSubmission = factory(root.ZFindServices.supabaseClient);
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {
  'use strict';

  /* ---------------- Statuses ---------------- */
  const STATUS = Object.freeze({
    draft: Object.freeze({ label: 'Brouillon', tone: 'draft' }),
    incomplete: Object.freeze({ label: 'À compléter', tone: 'draft' }),
    pending_review: Object.freeze({ label: 'En attente de validation', tone: 'wait' }),
    ready: Object.freeze({ label: 'Prête à publier', tone: 'ready' }),
    published: Object.freeze({ label: 'Publiée', tone: 'ok' }),
    suspended: Object.freeze({ label: 'Suspendue', tone: 'off' }),
    archived: Object.freeze({ label: 'Archivée', tone: 'off' })
  });
  function statusInfo(status) { return STATUS[status] || { label: status || '—', tone: 'draft' }; }
  function statusLabel(status) { return statusInfo(status).label; }
  function canSubmit(status) { return status === 'draft' || status === 'incomplete'; }

  /* ---------------- Readiness (mirror of zfind_listing_submission_missing) ---------------- */
  const CODES = Object.freeze(['commune', 'title_fr', 'description_fr', 'price', 'photo', 'compliance_unsupported', 'compliance_facts', 'compliance_rejected']);

  /* Exactly the phrases of zfind_listing_submission_missing_text (SQL error message). */
  const SQL_PHRASES = Object.freeze({
    commune: 'la commune du bien',
    title_fr: 'un titre en français',
    description_fr: 'une description en français',
    price: 'un prix supérieur à 0',
    photo: 'au moins une photo',
    compliance_facts: 'les mentions obligatoires (France) complètes et enregistrées',
    compliance_rejected: 'les mentions obligatoires corrigées (refusées par Z Find)',
    compliance_unsupported: 'un type de bien couvert en France (logement en vente ou en location)'
  });

  /* Checklist wording: what to do, and where. */
  const CHECK_LABELS = Object.freeze({
    commune: ['Commune du bien', 'Section « Le bien » : choisissez la commune.'],
    title_fr: ['Titre en français', 'Section « Textes » : titre en français.'],
    description_fr: ['Description en français', 'Section « Textes » : description en français.'],
    price: ['Prix', 'Section « Conditions » : prix supérieur à 0.'],
    photo: ['Au moins une photo', 'Section « Photos » : ajoutez une photo.'],
    compliance_facts: ['Mentions obligatoires (France)', 'Complétez et enregistrez les mentions obligatoires.'],
    compliance_rejected: ['Mentions obligatoires corrigées', 'Z Find a refusé les mentions : corrigez-les puis enregistrez-les.'],
    compliance_unsupported: ['Type de bien couvert en France', 'Seuls les logements en vente ou en location peuvent être publiés en France : écrivez à hello@zfind.online.']
  });

  function present(v) { return typeof v === 'string' ? v.trim() !== '' : false; }

  /** Codes of what is missing before « Soumettre à validation », same rules
      and order as the SQL. Input:
        { jurisdiction, frTitle, frDescription, priceCurrent, photoCount,
          complianceProfile, factsValid, reviewStatus } */
  function precheck(input) {
    const i = input || {};
    const missing = [];
    const jurisdiction = i.jurisdiction ? String(i.jurisdiction).toUpperCase() : '';
    if (!jurisdiction) missing.push('commune');
    if (!present(i.frTitle)) missing.push('title_fr');
    if (!present(i.frDescription)) missing.push('description_fr');
    if (!(Number(i.priceCurrent) > 0)) missing.push('price');
    if (!(Number(i.photoCount) > 0)) missing.push('photo');
    if (jurisdiction === 'FR') {
      if (!i.complianceProfile) missing.push('compliance_unsupported');
      else if (!i.factsValid) missing.push('compliance_facts');
      else if (i.reviewStatus === 'rejected') missing.push('compliance_rejected');
    }
    return missing;
  }

  /** Every item that applies to this listing, with ok / missing. */
  function checklist(input) {
    const missing = precheck(input);
    const fr = String((input && input.jurisdiction) || '').toUpperCase() === 'FR';
    const items = ['commune', 'title_fr', 'description_fr', 'price', 'photo'];
    if (fr) {
      const special = missing.find(c => c === 'compliance_unsupported' || c === 'compliance_rejected');
      items.push(special || 'compliance_facts');
    }
    return items.map(code => ({ code, ok: !missing.includes(code), label: CHECK_LABELS[code][0], help: CHECK_LABELS[code][1] }));
  }

  function missingText(codes) {
    return (Array.isArray(codes) ? codes : []).map(c => SQL_PHRASES[c] || c).join(', ');
  }

  /** Codes listed in the SQL message « Soumission impossible. Il manque : … . » */
  function missingFromMessage(message) {
    const m = /Il manque : (.*)\.\s*$/.exec(String(message || ''));
    if (!m) return [];
    const text = m[1];
    return CODES.filter(c => text.includes(SQL_PHRASES[c]));
  }

  /* ---------------- Errors ---------------- */
  const FRENCH_PREFIXES = ['Soumission impossible', 'Retrait impossible', 'Renvoi impossible', 'Accès refusé', 'Annonce introuvable', 'Annonce non précisée', 'Motif obligatoire', 'Motif trop long'];

  let complianceModule = null;
  function compliance() {
    if (complianceModule) return complianceModule;
    if (typeof window !== 'undefined' && window.ZFindServices && window.ZFindServices.listingCompliance) return window.ZFindServices.listingCompliance;
    if (typeof require === 'function') { try { complianceModule = require('./listing-compliance'); } catch (_) { /* browser */ } }
    return complianceModule;
  }

  function describeError(error, fallback) {
    const fb = fallback || 'L’opération a échoué. Réessayez dans un instant.';
    if (!error) return fb;
    if (error.type === 'network_failure') return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
    const msg = String(error.message || '');
    if (FRENCH_PREFIXES.some(p => msg.startsWith(p))) return msg;
    const c = compliance();
    return c ? c.describeError(error, fb) : fb;
  }

  /** Short reason for a bulk summary line (« bloquées : … »). */
  function shortReason(error) {
    const msg = String((error && error.message) || '');
    if (/France Listing compliance gate failed/i.test(msg)) {
      let keys = [];
      try { const m = /(\[[^\]]*\])/.exec(msg); keys = m ? JSON.parse(m[1]) : []; } catch (_) { keys = []; }
      return keys.filter(k => k !== 'review_approval').length ? 'mentions obligatoires incomplètes' : 'mentions obligatoires non validées';
    }
    if (/France Listings must be created before publication/i.test(msg)) return 'mentions obligatoires non validées';
    if (/while Representation is/i.test(msg)) return 'mandat non actif';
    if (/already has a published Listing/i.test(msg)) return 'une autre annonce du mandat est déjà publiée';
    if (/must have a positive price/i.test(msg)) return 'prix manquant';
    if (/non-empty title and description/i.test(msg)) return 'titre ou description manquant';
    if (/Compliance facts are incomplete/i.test(msg)) return 'mentions incomplètes (à refuser avec un motif)';
    if (/Compliance record not found/i.test(msg)) return 'aucune mention enregistrée';
    if (/Illegal Listing transition: (\w+) ->/i.test(msg)) return `statut « ${statusLabel(/Illegal Listing transition: (\w+) ->/i.exec(msg)[1])} »`;
    if (/Admin role required/i.test(msg)) return 'action réservée à l’équipe Z Find';
    if (error && error.type === 'network_failure') return 'connexion impossible';
    return describeError(error);
  }

  /* ---------------- Admin bulk actions ---------------- */
  const ACTIONS = Object.freeze({
    approve: Object.freeze({ label: 'Approuver (prête à publier)', progress: 'Approbation', done: ['approuvée', 'approuvées'] }),
    publish: Object.freeze({ label: 'Publier', progress: 'Publication', done: ['publiée', 'publiées'] }),
    return: Object.freeze({ label: 'Renvoyer en brouillon', progress: 'Renvoi en brouillon', done: ['renvoyée en brouillon', 'renvoyées en brouillon'] }),
    validate: Object.freeze({ label: 'Valider', progress: 'Validation des mentions', done: ['validée', 'validées'] }),
    validate_publish: Object.freeze({ label: 'Valider les mentions et publier', progress: 'Validation et publication', done: ['publiée', 'publiées'] })
  });

  /** What one bulk action does to one listing, from its current status:
      { steps: [...] } (statuses to go through, in order, via
      zfind_admin_transition_listing), { returnToDraft: true },
      { reviewCompliance: true }, or { skip: 'reason' } — nothing is sent. */
  function planBulk(action, status) {
    if (action === 'approve') {
      if (status === 'pending_review') return { steps: ['ready'] };
      if (status === 'ready') return { skip: 'déjà prête à publier' };
      return { skip: `statut « ${statusLabel(status)} »` };
    }
    if (action === 'publish' || action === 'validate_publish') {
      const pre = action === 'validate_publish' ? { reviewCompliance: true } : {};
      if (status === 'ready') return Object.assign(pre, { steps: ['published'] });
      if (status === 'pending_review' || status === 'suspended') return Object.assign(pre, { steps: ['ready', 'published'] });
      if (status === 'published') return { skip: 'déjà publiée' };
      if (status === 'draft' || status === 'incomplete') return { skip: 'pas encore soumise par l’agence' };
      return { skip: `statut « ${statusLabel(status)} »` };
    }
    if (action === 'return') {
      if (status === 'pending_review' || status === 'ready' || status === 'incomplete') return { returnToDraft: true };
      if (status === 'draft') return { skip: 'déjà en brouillon' };
      return { skip: `statut « ${statusLabel(status)} »` };
    }
    if (action === 'validate') return { reviewCompliance: true };
    return { skip: 'action inconnue' };
  }

  /** Runs the action on each item ONE AFTER THE OTHER (never in parallel:
      each call is a locked lifecycle command). items: [{ id, listingId,
      status, label }]. deps: { transition(listingId, to), returnToDraft(listingId, reason),
      approveCompliance(listingId) } -> { data, error }. onProgress(done, total, item, result). */
  async function runBulk(action, items, deps, options) {
    const opts = options || {};
    const list = Array.isArray(items) ? items : [];
    const results = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const plan = planBulk(action, item.status);
      let result;
      if (plan.skip) {
        result = { item, outcome: 'skipped', reason: plan.skip };
      } else {
        let error = null; let status = item.status;
        try {
          if (plan.reviewCompliance && !(opts.skipComplianceFor && opts.skipComplianceFor(item))) {
            const r = await deps.approveCompliance(item.listingId);
            if (r && r.error) error = r.error;
          }
          if (!error && plan.returnToDraft) {
            const r = await deps.returnToDraft(item.listingId, opts.reason);
            if (r && r.error) error = r.error; else status = 'draft';
          }
          for (const to of (!error && plan.steps) || []) {
            const r = await deps.transition(item.listingId, to);
            if (r && r.error) { error = r.error; break; }
            status = to;
          }
        } catch (e) {
          error = { type: 'network_failure', message: e && e.message };
        }
        result = error
          ? { item, outcome: 'failed', reason: shortReason(error), message: describeError(error), status }
          : { item, outcome: 'done', status };
      }
      results.push(result);
      if (typeof opts.onProgress === 'function') opts.onProgress(i + 1, list.length, item, result);
    }
    return results;
  }

  function plural(n, one, many) { return `${n} ${n > 1 ? many : one}`; }

  function groupReasons(rows) {
    const counts = new Map();
    rows.forEach(r => counts.set(r.reason, (counts.get(r.reason) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }

  /** « 12 publiées, 2 bloquées : mentions obligatoires non validées » */
  function summarize(action, results) {
    const a = ACTIONS[action] || ACTIONS.publish;
    const done = results.filter(r => r.outcome === 'done');
    const failed = results.filter(r => r.outcome === 'failed');
    const skipped = results.filter(r => r.outcome === 'skipped');
    const parts = [plural(done.length, a.done[0], a.done[1])];
    const phrase = (rows, one, many) => {
      const groups = groupReasons(rows);
      if (groups.length === 1) return `${plural(rows.length, one, many)} : ${groups[0][0]}`;
      return `${plural(rows.length, one, many)} (${groups.map(([reason, n]) => `${n} : ${reason}`).join(' ; ')})`;
    };
    if (failed.length) parts.push(phrase(failed, 'bloquée', 'bloquées'));
    if (skipped.length) parts.push(phrase(skipped, 'ignorée', 'ignorées'));
    return parts.join(', ');
  }

  /* ---------------- Partner « Soumettre toutes les annonces prêtes » ----------------
     After an import: the listings it created or updated. Readiness is read
     once (zfind_list_listing_submission_status), then every ready draft is
     submitted ONE AFTER THE OTHER (zfind_partner_submit_listing); the others
     are reported with what they miss. Nothing else than draft / incomplete
     -> « En attente de validation » ever happens here. */
  const BLOCK_SHORT = Object.freeze({
    commune: 'commune', title_fr: 'titre', description_fr: 'description', price: 'prix', photo: 'photo',
    compliance_unsupported: 'type de bien', compliance_facts: 'mentions obligatoires', compliance_rejected: 'mentions refusées'
  });
  /** deps: { listStatuses(ids) -> { data: rows, error }, submit(id) -> { data, error } }.
      → [{ listingId, outcome: 'submitted' | 'blocked' | 'skipped', reason, missing }] */
  async function submitAllReady(listingIds, deps, options) {
    const opts = options || {};
    const ids = Array.from(new Set((listingIds || []).filter(Boolean)));
    if (!ids.length) return [];
    const st = await deps.listStatuses(ids);
    if (st.error) return ids.map(id => ({ listingId: id, outcome: 'blocked', reason: describeError(st.error, 'Lecture des annonces impossible.'), missing: [] }));
    const byId = new Map((st.data || []).map(r => [r.listing_id, r]));
    const results = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const row = byId.get(id);
      let result;
      if (!row) result = { listingId: id, outcome: 'skipped', reason: 'annonce introuvable', missing: [] };
      else if (!canSubmit(row.status)) result = { listingId: id, outcome: 'skipped', reason: `déjà « ${statusLabel(row.status)} »`, missing: [], status: row.status };
      else {
        const missing = Array.isArray(row.missing) ? row.missing.filter(c => CODES.includes(c)) : [];
        if (missing.length) result = { listingId: id, outcome: 'blocked', reason: `il manque ${missingText(missing)}`, missing };
        else {
          let r;
          try { r = await deps.submit(id); } catch (e) { r = { error: { type: 'network_failure', message: e && e.message } }; }
          if (r && r.error) {
            const codes = missingFromMessage(r.error.message);
            result = { listingId: id, outcome: 'blocked', reason: codes.length ? `il manque ${missingText(codes)}` : describeError(r.error), missing: codes };
          } else result = { listingId: id, outcome: 'submitted', reason: '', missing: [], status: 'pending_review' };
        }
      }
      results.push(result);
      if (typeof opts.onProgress === 'function') opts.onProgress(i + 1, ids.length, result);
    }
    return results;
  }

  /** « 3 soumises à validation, 2 bloquées (photo : 2 ; mentions obligatoires : 1), 1 ignorée » */
  function summarizeSubmitAll(results) {
    const list = results || [];
    const done = list.filter(r => r.outcome === 'submitted').length;
    const blocked = list.filter(r => r.outcome === 'blocked');
    const skipped = list.filter(r => r.outcome === 'skipped').length;
    const parts = [plural(done, 'soumise à validation', 'soumises à validation')];
    if (blocked.length) {
      const counts = new Map();
      blocked.forEach(r => (r.missing && r.missing.length ? r.missing.map(c => BLOCK_SHORT[c] || c) : ['autre raison']).forEach(k => counts.set(k, (counts.get(k) || 0) + 1)));
      parts.push(`${plural(blocked.length, 'bloquée', 'bloquées')} (${Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} : ${n}`).join(' ; ')})`);
    }
    if (skipped) parts.push(plural(skipped, 'ignorée (pas en brouillon)', 'ignorées (pas en brouillon)'));
    return parts.join(', ');
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

  /* Exact argument names of the SQL functions (asserted by tests/sql/partner-submit.test.mjs). */
  function submitListing(listingId) {
    return rpc('zfind_partner_submit_listing', { p_listing_id: listingId }, 'listingSubmission.submit');
  }
  function withdrawSubmission(listingId) {
    return rpc('zfind_partner_withdraw_listing_submission', { p_listing_id: listingId }, 'listingSubmission.withdraw');
  }
  function listStatuses(listingIds) {
    const ids = Array.from(new Set((listingIds || []).filter(Boolean)));
    if (!ids.length) return Promise.resolve({ data: [], error: null });
    return rpc('zfind_list_listing_submission_status', { p_listing_ids: ids }, 'listingSubmission.listStatuses', { allowNullData: true });
  }
  function returnToDraft(listingId, reason) {
    return rpc('zfind_admin_return_listing_to_draft', { p_listing_id: listingId, p_reason: reason == null ? null : String(reason).trim() }, 'listingSubmission.returnToDraft');
  }

  return Object.freeze({
    STATUS, CODES, SQL_PHRASES, CHECK_LABELS, ACTIONS,
    statusInfo, statusLabel, canSubmit,
    precheck, checklist, missingText, missingFromMessage,
    describeError, shortReason,
    planBulk, runBulk, summarize, submitAllReady, summarizeSubmitAll,
    submitListing, withdrawSubmission, listStatuses, returnToDraft,
    _setClientModuleForTests(m) { clientModule = m; },
    _setComplianceModuleForTests(m) { complianceModule = m; }
  });
});
