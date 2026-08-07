/* ============================================================
   Z FIND — services/leads.js
   ============================================================
   Sprint 1.6: the single, reusable Lead submission service. Every
   enquiry entry point in the app calls this — never Supabase
   directly — so validation and submission logic exist in exactly one
   place, per the mandate to normalise every CTA into one Lead Service.

   Real schema constraint (migration 0001, unchanged, no new columns):
     leads(id, listing_id NOT NULL, contact_type, name, email, phone,
           message, status, created_at)
   There is no language/page/URL/development_id/partner_id/UTM/
   qualification column. Adding them would need a new migration — out
   of scope (Market First: the existing `message` field already lets
   us deliver this context to the business today, honestly and for
   free; real columns are documented technical debt, not fabricated).

   Sprint 1.6 FINAL CORRECTION — real anon grant contract:
   `anon` has INSERT on `leads` but NOT SELECT. No `.select()`/
   `.single()` are ever called — see supabaseClient.js's
   `allowNullData` option, and the module history there, for why.

   Sprint 1.6 FINAL CONTACT VALIDATION:
   1. `name` is now required for all three enquiry modes — the form
      has always asked for it, but validateLead never checked it.
   2. Any non-email string was previously accepted and stored as a
      phone number — "abc", "???", "test" would all have been stored
      as someone's phone. A small, practical, internationally
      tolerant phone rule now gates this (see isValidPhone below).
   3. The contact value is classified as exactly one of email / phone
      / invalid — never silently coerced.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./supabaseClient'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.leads = factory(root.ZFindServices.supabaseClient);
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// MVP phone rule, deliberately simple (no phone-number library, no
// per-country formatting infrastructure — Market First: this is
// enough to reject obvious garbage without pretending to validate
// real-world dialability):
//   1. after trimming, the value may contain ONLY digits, an optional
//      leading '+', spaces, parentheses, and hyphens — anything else
//      (letters, '?', etc.) is rejected outright;
//   2. stripping all non-digit characters must leave between 7 and 15
//      digits (a widely-used practical range covering real national
//      numbers through full E.164-style international numbers,
//      without asserting any specific country's format).
const PHONE_ALLOWED_CHARS_RE = /^[\d+\s()-]+$/;
function isValidPhone(value) {
  if (!value) return false;
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  if (!PHONE_ALLOWED_CHARS_RE.test(trimmed)) return false;
  const digitsOnly = trimmed.replace(/[^\d]/g, '');
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

/** Classifies a raw contact string as exactly one of email / phone /
    invalid — the ONLY place this decision is made, so submitLead and
    validateLead never disagree with each other. The ORIGINAL,
    visitor-entered value is preserved verbatim when a match is found
    (never reformatted/normalised before storage). */
function classifyContact(contact) {
  const trimmed = (contact || '').trim();
  if (!trimmed) return { kind: 'empty', email: null, phone: null };
  if (EMAIL_RE.test(trimmed)) return { kind: 'email', email: trimmed, phone: null };
  if (isValidPhone(trimmed)) return { kind: 'phone', email: null, phone: trimmed };
  return { kind: 'invalid', email: null, phone: null };
}

/** Validates one contact value against a specific expected kind
    ('email' or 'phone') — used now that the form has separate fields
    for each, so a visitor is never forced to guess which single field
    to fill. Returns { valid, value } — value is the trimmed original
    input, never reformatted. */
function validateEmailValue(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return { valid: true, value: null }; // optional field, empty is fine
  return { valid: EMAIL_RE.test(trimmed), value: trimmed };
}
function validatePhoneValue(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return { valid: true, value: null }; // optional field, empty is fine
  return { valid: isValidPhone(trimmed), value: trimmed };
}

/** Builds the honest, non-fabricated context block appended to the
    free-text `message` column — the only real place today's schema
    can carry this information. Only fields the caller actually
    supplies appear; nothing here is invented or defaulted to a
    placeholder value. */
function buildContextBlock(context) {
  const c = context || {};
  const lines = [];
  if (c.language) lines.push(`Language: ${c.language}`);
  if (c.page) lines.push(`Page: ${c.page}`);
  if (c.url) lines.push(`URL: ${c.url}`);
  if (c.developmentId) lines.push(`Development: ${c.developmentId}`);
  if (c.partnerId) lines.push(`Partner: ${c.partnerId}`);
  if (c.source) lines.push(`Source: ${c.source}`);
  if (c.campaign) lines.push(`Campaign: ${c.campaign}`);
  if (c.utm && typeof c.utm === 'object') {
    Object.keys(c.utm).sort().forEach(key => {
      if (c.utm[key]) lines.push(`${key}: ${c.utm[key]}`);
    });
  }
  if (!lines.length) return '';
  return `[Context — ${lines.join(' | ')}]`;
}

/** Builds the qualification block — ONLY for contactType 'qualified',
    and ONLY from values actually present. Direct/assisted enquiries
    never carry this block; a qualified enquiry missing one of the
    three answers simply omits that one line, it is never invented. */
function buildQualificationBlock(qualification) {
  const q = qualification || {};
  const lines = [];
  if (q.lookingFor) lines.push(`Looking for: ${q.lookingFor}`);
  if (q.budget) lines.push(`Budget: ${q.budget}`);
  if (q.timing) lines.push(`Timing: ${q.timing}`);
  if (!lines.length) return '';
  return `[Qualification — ${lines.join(' | ')}]`;
}

/** Validates a lead submission. Now takes email and phone as SEPARATE
    fields — a visitor can provide one or both, never forced to guess
    which single field to fill (the previous single "contact" field
    forced a choice; leads.email and leads.phone have always existed
    as separate columns in the real schema, this was purely an
    application-layer limitation, not a schema one).
    Returns { valid, errors, email, phone } — never throws. */
function validateLead({ listingId, contactType, name, email, phone }) {
  const errors = [];
  if (!listingId) errors.push('missing_listing_id');
  if (!contactType || !['direct', 'qualified', 'assisted'].includes(contactType)) errors.push('invalid_contact_type');

  const trimmedName = (name || '').trim();
  if (!trimmedName) errors.push('missing_name'); // required for all three modes; no minimum length beyond non-empty

  const emailResult = validateEmailValue(email);
  const phoneResult = validatePhoneValue(phone);
  if (!emailResult.valid) errors.push('invalid_email'); // never silently dropped or miscategorised as a phone
  if (!phoneResult.valid) errors.push('invalid_phone');
  if (!emailResult.value && !phoneResult.value) errors.push('missing_contact_method'); // at least one real contact method required

  return { valid: errors.length === 0, errors, email: emailResult.value, phone: phoneResult.value };
}

/** Submits one lead. email and phone are now separate, optional
    fields — a visitor can give both (agent may prefer to call, keep
    email as backup, or vice versa), not forced into a single guessed
    field. At least one must be present and valid (enforced by
    validateLead above).

    `qualification` ({lookingFor, budget, timing}) is only folded into
    the message when contactType === 'qualified'. */
async function submitLead({ listingId, contactType, name, email, phone, userMessage, qualification, context }) {
  const validation = validateLead({ listingId, contactType, name, email, phone });
  if (!validation.valid) {
    return { data: null, error: { type: 'validation_failure', message: 'Please check the highlighted fields.', fields: validation.errors } };
  }
  const trimmedName = (name || '').trim();

  const qualificationBlock = contactType === 'qualified' ? buildQualificationBlock(qualification) : '';
  const contextBlock = buildContextBlock(context);
  const message = [userMessage, qualificationBlock, contextBlock].filter(Boolean).join('\n\n');

  const client = getSupabaseClient();
  // No .select(), no .single() — see the module header for exactly
  // why: anon has INSERT only, never SELECT, on this table.
  return safeQuery(
    () => client.from('leads').insert({
      listing_id: listingId,
      contact_type: contactType,
      name: trimmedName,
      email: validation.email,
      phone: validation.phone,
      message: message || null,
    }),
    'leads.submitLead',
    { allowNullData: true }
  );
}

return { submitLead, validateLead, classifyContact, isValidPhone, validateEmailValue, validatePhoneValue, buildContextBlock, buildQualificationBlock };

});
