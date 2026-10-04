/* ============================================================
   Z FIND PARTNER — services/partnerSignup (window.ZFindServices.partnerSignup)
   ============================================================
   Self sign-up of agencies and developers (migration
   20261004110000_z_find_partner_self_signup_v1):
   1. lookup()   — zfind_registry_lookup: the agency's establishments
                   from the registry, public data only (no contacts).
   2. register() — auth.signUp with the application in the account's
                   metadata (data.zfind_signup). Works whether or not
                   e-mail confirmation is required.
   3. complete() — zfind_partner_complete_signup(): at first sign-in,
                   creates partner + partner_user profile + the
                   « à vérifier » application. Idempotent.
   Never service_role; publication always stays with the Admin.
   ============================================================ */

(function (root, factory) {
  root.ZFindServices = root.ZFindServices || {};
  root.ZFindServices.partnerSignup = factory(root.ZFindServices.supabaseClient);
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {
  'use strict';

  const { getSupabaseClient } = supabaseClientModule;

  function digits(v) { return String(v || '').replace(/\D/g, ''); }

  /* FR: SIREN (9) or SIRET (14) with the Luhn key; BE: enterprise number (10, mod 97). */
  function validateNumber(country, value) {
    const d = digits(value);
    if (country === 'FR') {
      if (d.length !== 9 && d.length !== 14) return { ok: false, reason: 'length' };
      // La Poste's SIRETs (356 000 000) are the documented exception to the Luhn key.
      if (d.startsWith('356000000')) return { ok: true, digits: d };
      let sum = 0;
      for (let i = 0; i < d.length; i++) {
        let n = Number(d[d.length - 1 - i]);
        if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
        sum += n;
      }
      return sum % 10 === 0 ? { ok: true, digits: d } : { ok: false, reason: 'checksum' };
    }
    if (country === 'BE') {
      const b = d.length === 9 ? '0' + d : d;
      if (b.length !== 10) return { ok: false, reason: 'length' };
      const ok = 97 - (Number(b.slice(0, 8)) % 97) === Number(b.slice(8));
      return ok ? { ok: true, digits: b } : { ok: false, reason: 'checksum' };
    }
    return { ok: true, digits: d };
  }

  async function lookup(country, number) {
    try {
      const { data, error } = await getSupabaseClient().rpc('zfind_registry_lookup', { p_country: country, p_number: number });
      return { data: data || [], error: error || null };
    } catch (e) { return { data: [], error: e }; }
  }

  async function register(email, password, application, redirectTo) {
    try {
      const { data, error } = await getSupabaseClient().auth.signUp({
        email,
        password,
        options: { data: { zfind_signup: application }, emailRedirectTo: redirectTo || undefined }
      });
      if (error) return { data: null, error };
      // Supabase answers a sign-up for an existing e-mail with an empty identities list.
      const existing = data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
      return { data: { session: data.session || null, user: data.user || null, existing }, error: null };
    } catch (e) { return { data: null, error: e }; }
  }

  async function complete() {
    try {
      const { data, error } = await getSupabaseClient().rpc('zfind_partner_complete_signup');
      return { data: data || null, error: error || null };
    } catch (e) { return { data: null, error: e }; }
  }

  async function ownSignup() {
    try {
      const { data, error } = await getSupabaseClient().from('zfind_partner_signups')
        .select('status, plan, founder_wave, country, role, created_at').maybeSingle();
      return { data: data || null, error: error || null };
    } catch (e) { return { data: null, error: e }; }
  }

  /* Enquiries received (total, since sign-up, during the free period). */
  async function leadStats() {
    try {
      const { data, error } = await getSupabaseClient().rpc('zfind_partner_lead_stats');
      return { data: data || null, error: error || null };
    } catch (e) { return { data: null, error: e }; }
  }

  /* « Répondue » / « Clôturée » on one of the agency's own enquiries (checked by the database). */
  async function setLeadStatus(leadId, status) {
    try {
      const { data, error } = await getSupabaseClient().rpc('zfind_partner_set_lead_status', { p_lead_id: leadId, p_status: status });
      return { data: data || null, error: error || null };
    } catch (e) { return { data: null, error: e }; }
  }

  return Object.freeze({ validateNumber, lookup, register, complete, ownSignup, leadStats, setLeadStatus, _internals: { digits } });
});
