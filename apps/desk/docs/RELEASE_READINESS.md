# Z Desk — Release Readiness Ledger

This ledger records the product-completion boundary on `feature/zdesk-zos-convergence-v1`.
It does **not** authorize merge to `main`, live Supabase mutation, provider-account changes, billing, or production deployment.

## Sequence 1–22

1. Personnel authority/privacy — **PASS**.
2. Today → communication → action authority — **PASS**.
3. Team invitation/role lifecycle — **PASS**. Automatic invitation email delivery remains external-provider work; secure invitation links are available.
4. AI triage implementation/contract — **PASS**. Live AI Gateway smoke remains **BLOCKED** until an authorised `AI_GATEWAY_API_KEY` is available.
5. Primary Z Desk shell / UX — **PASS**.
6. Unified Email + WhatsApp communication workspace — **PASS**.
7. Contacts — **PASS**.
8. Tasks / missions — **PASS**.
9. Calendar — **PASS**.
10. Personnel UX — **PASS**.
11. Integration management UX/authority — **PASS**. Workspace integration mutation is owner/admin-only; live OAuth provider smoke requires authorised provider credentials/accounts.
12. WhatsApp UX/security — **PASS (contract)**. Live Meta webhook/send smoke remains **BLOCKED** pending authorised Meta configuration.
13. Six-language coverage — **PASS** for PT/EN/FR/ES/IT/DE key parity and build coverage.
14. Accessibility foundation — **PASS (automated contract)** for keyboard focus, skip navigation, semantic states and reduced-motion. Live assistive-technology/browser QA remains part of preview QA.
15. Authentication/onboarding — **PASS** using canonical authenticated ZOS bootstrap and invitation acceptance.
16. Settings — **PASS** for AI opt-in, integration lifecycle and manager authority.
17. Observability/readiness — **PASS** for boolean-only readiness and provider health; no secret values are exposed.
18. Consolidated QA — automated release-QA gate added; provider-live and browser/device portions remain explicitly blocked until authorised credentials/preview exist.
19. Security/release gate — automated release-security gate added; final status requires exact-head CI after this gate is committed.
20. D5 six-product convergence — pending formal root convergence update after 18–19 are green.
21. Preview — pending an accessible/authorised Z Desk Vercel preview project. No production deployment is implied.
22. Release — **HOLD**. Requires explicit later authorization for merge/live Supabase/provider/production operations after points 18–21.

## Non-negotiable authority

- Human identity: `zos.persons`.
- Organisation identity: `zos.organisations`.
- Organisation membership: `zos.memberships`.
- Desk projection/role: `desk.workspace_members`.
- Browser callers never provide workspace/tenant/actor authority IDs.
- Provider credentials and OAuth state remain server-only.
- Workspace integrations are owner/admin managed.
- AI starts OFF and remains suggestion-only/human-in-loop.

## Live work intentionally not simulated as PASS

- AI Gateway live request without an authorised key.
- Gmail/Microsoft OAuth E2E without authorised client configuration/accounts.
- Google/Outlook calendar publication E2E without authorised provider configuration.
- WhatsApp webhook/send E2E without authorised Meta configuration.
- Browser/device/assistive-technology preview QA without an accessible preview deployment.
- Production merge/database/provider/deployment operations without explicit release authorization.
