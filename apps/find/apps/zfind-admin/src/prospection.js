/* ============================================================
   Z FIND ADMIN — services/prospection (window.ZFindServices.prospection)
   ============================================================
   Operations overview and the prospection base (zfind_agencias), read
   and corrected by administrators only: RLS policies "admin read /
   admin update agencias" + is_admin(), and the security-definer RPC
   zfind_admin_operations_overview() (migration 20261003220000).
   Never service_role from the browser.
   ============================================================ */

(function (root, factory) {
  root.ZFindServices = root.ZFindServices || {};
  root.ZFindServices.prospection = factory(root.ZFindServices.supabaseClient);
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {
  'use strict';

  const { getSupabaseClient, safeQuery } = supabaseClientModule;
  const TABLE = 'zfind_agencias';
  const LIST_COLUMNS = 'id,country,name,trade_name,type,network,is_natural_person,postcode,city,email,phone,website,email_outreach_allowed,do_not_contact,active';
  const EXPORT_COLUMNS = ['country', 'type', 'network', 'name', 'trade_name', 'is_natural_person', 'address', 'postcode', 'city',
    'email', 'email_source', 'phone', 'phone_source', 'website', 'email_outreach_allowed', 'do_not_contact', 'source', 'source_id', 'company_id', 'last_seen_at'];
  const PAGE = 50;
  const EXPORT_MAX = 50000;

  function overview() {
    const client = getSupabaseClient();
    return safeQuery(() => client.rpc('zfind_admin_operations_overview'), 'prospection.overview');
  }

  function applyFilters(q, f) {
    const filters = f || {};
    q = q.eq('active', true);
    if (filters.country) q = q.eq('country', filters.country);
    if (filters.type) q = q.eq('type', filters.type);
    if (filters.network) q = q.eq('network', filters.network);
    if (filters.postcode) q = q.like('postcode', `${String(filters.postcode).replace(/[^0-9A-Za-z]/g, '')}%`);
    if (filters.withEmail) q = q.not('email', 'is', null);
    if (filters.outreach) q = q.eq('email_outreach_allowed', true);
    if (filters.search) {
      const s = String(filters.search).replace(/[,()%*]/g, ' ').trim();
      if (s) q = q.or(`name.ilike.%${s}%,trade_name.ilike.%${s}%,city.ilike.%${s}%,email.ilike.%${s}%`);
    }
    return q;
  }

  function list(filters, page) {
    const client = getSupabaseClient();
    const from = Math.max(0, (Number(page) || 0) * PAGE);
    return safeQuery(
      () => applyFilters(client.from(TABLE).select(LIST_COLUMNS, { count: 'exact' }), filters)
        .order('country').order('postcode').order('name').range(from, from + PAGE - 1),
      'prospection.list');
  }

  function get(id) {
    const client = getSupabaseClient();
    return safeQuery(() => client.from(TABLE).select('*').eq('id', id).single(), 'prospection.get');
  }

  function setDoNotContact(id, value) {
    const client = getSupabaseClient();
    const now = new Date().toISOString();
    return safeQuery(() => client.from(TABLE).update({ do_not_contact: !!value, do_not_contact_at: value ? now : null, updated_at: now }).eq('id', id).select('id'), 'prospection.setDoNotContact');
  }

  /* Manual correction: source = 'manual'. Empty string clears the value. */
  function updateContacts(id, values) {
    const client = getSupabaseClient();
    const patch = { updated_at: new Date().toISOString() };
    ['email', 'phone', 'website'].forEach(k => {
      if (values[k] === undefined) return;
      const v = String(values[k] || '').trim();
      patch[k] = v || null;
      patch[`${k}_source`] = v ? 'manual' : null;
    });
    return safeQuery(() => client.from(TABLE).update(patch).eq('id', id).select('id'), 'prospection.updateContacts');
  }

  /* All rows matching the filters (pages of 1000, up to EXPORT_MAX). */
  async function exportRows(filters, onProgress) {
    const client = getSupabaseClient();
    const rows = [];
    for (let from = 0; from < EXPORT_MAX; from += 1000) {
      const res = await safeQuery(
        () => applyFilters(client.from(TABLE).select(EXPORT_COLUMNS.join(',')), filters).order('id').range(from, from + 999),
        'prospection.export');
      if (res.error) return res;
      rows.push(...(res.data || []));
      if (onProgress) onProgress(rows.length);
      if (!res.data || res.data.length < 1000) break;
    }
    return { data: rows, error: null, truncated: rows.length >= EXPORT_MAX };
  }

  function toCsv(rows) {
    const cell = v => {
      const s = v == null ? '' : String(v);
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // Semicolon + BOM: opens correctly in Excel (French / Portuguese locales).
    return '﻿' + [EXPORT_COLUMNS.join(';')].concat(rows.map(r => EXPORT_COLUMNS.map(c => cell(r[c])).join(';'))).join('\r\n');
  }

  /* Self sign-ups (migration 20261004110000): admin read via RLS,
     decision via zfind_admin_review_signup() (also (de)activates the partner). */
  function signups(status) {
    const client = getSupabaseClient();
    return safeQuery(() => {
      let q = client.from('zfind_partner_signups')
        .select('id,created_at,role,country,company_id,establishment_id,legal_name,trade_name,address,postcode,city,phone,email,website,card_number,card_authority,plan,founder_wave,status,review_note,reviewed_at,partner_id,agencia_id')
        .order('created_at', { ascending: false }).limit(200);
      if (status) q = q.eq('status', status);
      return q;
    }, 'prospection.signups', { allowNullData: true });
  }

  function reviewSignup(id, decision, note) {
    const client = getSupabaseClient();
    return safeQuery(() => client.rpc('zfind_admin_review_signup', { p_signup_id: id, p_decision: decision, p_note: note || null }), 'prospection.reviewSignup');
  }

  function signupLeadCounts() {
    const client = getSupabaseClient();
    return safeQuery(() => client.rpc('zfind_admin_signup_lead_counts'), 'prospection.signupLeadCounts', { allowNullData: true });
  }

  return Object.freeze({ PAGE, EXPORT_COLUMNS, EXPORT_MAX, overview, list, get, setDoNotContact, updateContacts, exportRows, toCsv, signups, reviewSignup, signupLeadCounts, _internals: { applyFilters } });
});
