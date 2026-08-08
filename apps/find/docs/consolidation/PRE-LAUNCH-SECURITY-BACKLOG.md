# Pre-Launch Security Backlog

**Status: documented, not implemented.** None of the items below are built yet — this is a tracked backlog, not a claim of coverage. Each must be resolved before Z Find Portugal accepts real public traffic.

## 1. CAPTCHA / spam protection
The public `leads` insert policy (migration 0001) accepts any anonymous submission with no challenge. Before launch: add a CAPTCHA (e.g. hCaptcha/Turnstile) or equivalent on the enquiry form, verified server-side before the insert is accepted.

## 2. Rate limiting
Neither `leads` inserts nor `searches` inserts are rate-limited per IP/session today. Before launch: add rate limiting (Supabase Edge Function or a proxy layer) to prevent a single actor from flooding either table.

## 3. Input length validation
The migration's `leads.message`, `name`, `email`, `phone` columns are unbounded `text` — no maximum length is enforced at the database level. Before launch: add explicit length constraints (`check (char_length(message) <= N)`) so a malicious or malformed submission can't write an arbitrarily large payload.

## 4. Consent / privacy
No consent checkbox, privacy policy link, or data-processing disclosure exists on the enquiry form yet. Before launch (and likely a legal, not just engineering, requirement under GDPR): add an explicit consent step before any `leads` row is created.

## 5. Abuse prevention for public search logging
`searches` accepts anonymous inserts with an unrestricted `filters jsonb` payload and no validation of shape or size. Before launch: constrain the accepted filter shape (reject unexpected keys/oversized payloads) so this table can't become a write-anything sink.

---

None of these block Week 1's read-only connectivity work. All must be resolved before any real (non-staging) public traffic reaches these tables.
