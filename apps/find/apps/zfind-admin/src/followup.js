/* ============================================================
   Z FIND ADMIN — services/followup (window.ZFindServices.followup)
   ============================================================
   What arrives from the site and has to be followed up
   (migration 20261004200000_z_find_admin_followup_v1):
   - owner / buyer estimation requests: list, assign an owner's request
     to ONE agency (only with the owner's consent; enforced by the
     database), status and note;
   - enquiries on listings: list with agency and the 24 h flag, status;
   - agency reviews: moderation;
   - photo links of imported listings: queue, progress.
   Admin rights are checked by the database (is_admin()); the e-mails
   and photo downloads are done by the site's server functions, which
   this module only nudges (they process what is pending, nothing else).
   ============================================================ */

(function (root, factory) {
  root.ZFindServices = root.ZFindServices || {};
  root.ZFindServices.followup = factory(root.ZFindServices.supabaseClient);
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {
  'use strict';

  const { getSupabaseClient, safeQuery } = supabaseClientModule;
  const SITE = 'https://zfind.online';

  /* ---------------- estimation requests ---------------- */
  function estimations(status) {
    const client = getSupabaseClient();
    let q = client.from('zfind_estimation_requests').select('*, partners(name)').order('created_at', { ascending: false }).limit(300);
    if (status === 'open') q = q.in('status', ['new', 'assigned']);
    else if (status) q = q.eq('status', status);
    return safeQuery(() => q, 'followup.estimations', { allowNullData: true });
  }
  function assignEstimation(id, partnerId) {
    return safeQuery(() => getSupabaseClient().rpc('zfind_admin_assign_estimation', { p_id: id, p_partner_id: partnerId || null }), 'followup.assignEstimation');
  }
  function setEstimationStatus(id, status, note) {
    return safeQuery(() => getSupabaseClient().rpc('zfind_admin_set_estimation_status', { p_id: id, p_status: status || null, p_note: note == null ? null : note }), 'followup.setEstimationStatus');
  }

  /* ---------------- enquiries ---------------- */
  function leads(status) {
    return safeQuery(() => getSupabaseClient().rpc('zfind_admin_leads', { p_status: status || null, p_limit: 300 }), 'followup.leads', { allowNullData: true });
  }
  function setLeadStatus(id, status) {
    return safeQuery(() => getSupabaseClient().rpc('zfind_admin_set_lead_status', { p_lead_id: id, p_status: status }), 'followup.setLeadStatus');
  }

  /* ---------------- reviews ---------------- */
  function reviews(status) {
    return safeQuery(() => getSupabaseClient().rpc('zfind_admin_reviews', { p_status: status || null }), 'followup.reviews', { allowNullData: true });
  }
  function moderateReview(id, decision) {
    return safeQuery(() => getSupabaseClient().rpc('zfind_admin_moderate_review', { p_id: id, p_decision: decision }), 'followup.moderateReview');
  }

  /* ---------------- review queue decisions ---------------- */
  /* decision: 'approve' (→ ready to publish) | 'reject' (→ incomplete, reason required). Returns one result per listing. */
  function reviewListings(listingIds, decision, reason) {
    return safeQuery(() => getSupabaseClient().rpc('zfind_admin_review_listings', { p_listing_ids: listingIds, p_decision: decision, p_reason: reason == null || reason === '' ? null : reason }), 'followup.reviewListings');
  }
  function reviewHistory(partnerId) {
    return safeQuery(() => getSupabaseClient().rpc('zfind_admin_review_history', { p_limit: 200, p_partner: partnerId || null }), 'followup.reviewHistory', { allowNullData: true });
  }

  /* ---------------- photo links ---------------- */
  function queuePhotos(listingId, urls) {
    const rows = (urls || []).slice(0, 40).map((url, i) => ({ listing_id: listingId, url, position: i }));
    if (!rows.length) return Promise.resolve({ data: [], error: null });
    return safeQuery(() => getSupabaseClient().from('zfind_media_import_queue').upsert(rows, { onConflict: 'listing_id,url', ignoreDuplicates: true }), 'followup.queuePhotos', { allowNullData: true });
  }
  async function photoProgress(listingIds) {
    const ids = (listingIds || []).filter(Boolean);
    if (!ids.length) return { data: { pending: 0, done: 0, failed: 0, errors: [] }, error: null };
    const res = await safeQuery(() => getSupabaseClient().from('zfind_media_import_queue').select('listing_id, url, status, error').in('listing_id', ids.slice(0, 300)), 'followup.photoProgress', { allowNullData: true });
    if (res.error) return res;
    const rows = res.data || [];
    const n = s => rows.filter(r => r.status === s).length;
    return { data: { pending: n('pending') + n('processing'), done: n('done'), failed: n('failed'), errors: rows.filter(r => r.status === 'failed') }, error: null };
  }

  /* The site's server functions process only what is pending; the call carries no data.
     no-cors: the Admin does not need the answer, progress is read from the database. */
  function nudge(pathName) {
    try { return fetch(SITE + pathName, { method: 'POST', mode: 'no-cors', keepalive: true }).catch(() => null); } catch (_) { return Promise.resolve(null); }
  }
  const runPhotoImport = () => nudge('/api/media-import');
  const sendToAgencies = () => nudge('/api/lead-notify');

  return Object.freeze({ estimations, assignEstimation, setEstimationStatus, leads, setLeadStatus, reviews, moderateReview, reviewListings, reviewHistory, queuePhotos, photoProgress, runPhotoImport, sendToAgencies, SITE });
});
