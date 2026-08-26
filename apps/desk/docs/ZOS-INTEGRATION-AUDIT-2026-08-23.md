# Z Desk — ZOS Integration Audit — 2026-08-23

## Status

Z Desk is accepted as the sixth ZOS product, classified as a horizontal B2B operational workspace that may be subscribed to standalone or as an add-on to any other ZOS product.

This document records the integration authority before importing the supplied source into the monorepo. It deliberately does not treat the supplied ZIP as production-ready source.

## Supplied source snapshot

The audited ZIP contains 130 entries and approximately 244 KB uncompressed source material under `apps/desk/`.

Implemented foundations include:

- Next.js 16 / React 19 web application;
- next-intl with FR/EN/ES/PT/IT/DE;
- NestJS backend;
- Supabase persistence and RLS migrations;
- BullMQ/Redis queues;
- Gmail + Microsoft email clients/OAuth flows;
- Google/Microsoft calendar clients/sync foundations;
- Meta WhatsApp webhook/send foundations;
- unified contacts/threads/messages;
- Today/inbox decision workflow;
- linked notes and AI-suggested calendar drafts;
- task board / missions;
- personnel schedules, absences, overrides, weekly validation, overtime and workload map;
- human-in-loop AI design.

## ZOS product classification

Z Desk is a **horizontal product**, alongside Z Studio, not a marketplace vertical.

Commercial modes:

1. Z Desk standalone;
2. Z Desk as add-on to one ZOS product;
3. Z Desk used by an organisation that subscribes to several ZOS products.

A customer should retain one canonical ZOS identity/organisation relationship across these modes.

## Canonical authority decisions

### Reuse ZOS — do not duplicate

The supplied `desk_tenants` and `desk_users` model must not become a second canonical identity system.

ZOS already owns:

- `zos.persons` for canonical human identity;
- `zos.organisations` for canonical organisation identity;
- `zos.memberships` for the canonical Person ↔ Organisation relationship.

Desk-specific roles/permissions may remain Desk-owned, but must reference canonical ZOS Person/Membership/Organisation IDs.

Standalone Z Desk customers still receive canonical ZOS Person/Organisation records; they do not need to subscribe to another product first.

### Z Desk-owned domain

The following remain Z Desk semantics and should not be promoted into shared Core merely because they are reusable-looking:

- contacts and communication identities as seen by a Desk workspace;
- threads and messages;
- message decision state;
- linked notes;
- calendar/event draft semantics and human confirmation;
- task board / missions;
- work schedules, schedule overrides, absences, weekly validation and overtime;
- workload map;
- Desk provider-integration orchestration;
- Desk AI triage and follow-up suggestions.

Desk contacts may later acquire optional ZOS Registry bindings when cross-product identity reuse is proven, without making Registry the owner of Desk conversation semantics.

### Shared-capability candidates

The following must be evaluated against existing ZOS authorities before implementation rather than duplicated locally:

- product entitlements/subscription access;
- audit trail;
- consent/preferences;
- secure provider credential/token handling;
- integration/outbox transport where applicable.

Promotion to shared code requires actual cross-product reuse, not hypothetical reuse.

## Mandatory security hardening before source integration

The supplied backend uses `supabaseAdmin` in application controllers while several endpoints accept `tenantId` directly from body/query parameters. Task creation additionally accepts `createdBy` directly.

That model is not acceptable for ZOS integration because service-role access bypasses RLS.

Required authority:

1. authenticate the Supabase/ZOS session at the backend boundary;
2. resolve canonical `zos.persons` identity from the authenticated user;
3. resolve allowed `zos.memberships` / organisation/workspace server-side;
4. derive actor/person and organisation IDs from that authority;
5. reject caller-supplied cross-tenant authority identifiers;
6. apply Desk role checks server-side for privileged actions.

OAuth `state` currently carries a raw tenant identifier for email/calendar authorization. Replace with a signed, opaque, short-lived, session-bound state token before integration.

Provider refresh/access tokens must remain server-only. A JSONB column must not be treated by itself as the complete token-security model; use an approved secret/encryption contract and never expose provider tokens to browser clients.

## Functional gaps in supplied source

The ZIP is a substantial foundation, but not production-complete:

- no automated test files are supplied;
- no package lockfiles are supplied;
- no `.env.example` files are supplied despite README setup references;
- backend TypeScript is not fully strict (`strict: false`);
- calendar OAuth callbacks do not yet exchange authorization codes for tokens;
- AI triage is a placeholder and currently returns empty summary/normal priority/no meeting intent;
- team invitation and role-management flow is not built;
- Desk role distinctions are not enforced in current RLS/backend authorization;
- email OAuth state is not safely session-bound;
- email token refresh handling is TODO;
- email/calendar polling is a v1 shortcut; provider push/webhook support remains future work;
- HTTP server and BullMQ workers currently share one process;
- complete production deployment/provider activation is not established.

## Database integration direction

Do not copy `apps/desk/supabase/migrations/*` unchanged as a second migration authority.

Create forward-only integrated ZOS migrations under:

`infrastructure/supabase/migrations/`

The integrated Desk schema should use a Desk-owned namespace/boundary while referencing canonical ZOS Person/Organisation/Membership authorities. Existing timestamps from the supplied ZIP must be renumbered if they collide with the live convergence chain.

The migration chain must be proven from the full ZOS baseline on disposable PostgreSQL before any live database decision.

## Commercial model

Z Desk needs a product entitlement that works in both modes:

- standalone Desk subscription;
- Desk add-on entitlement attached to a customer already entitled to Studio/Find/Jobs/Mobility/Fashion.

Do not create a second customer identity just because billing originates from a different product. Commercial provider events must resolve to canonical ZOS customer/person/organisation authority and grant Desk access server-side.

Exact pricing, plan catalog and provider activation remain separate product/commercial decisions.

## Required convergence sequence

### D0 — source normalization

- preserve supplied source provenance;
- remove malformed empty ZIP directories;
- add deterministic dependency lockfiles;
- add env contracts without secrets;
- align package naming and root scripts.

### D1 — ZOS identity/organisation convergence

- replace `desk_tenants` authority;
- replace `desk_users` identity authority;
- add Desk workspace/role projection referencing ZOS Core;
- implement session-derived backend authorization.

### D2 — integrated PostgreSQL authority

- forward-only Desk migrations under root migration authority;
- RLS/PostgreSQL tests for cross-organisation isolation;
- service-role route tests proving caller IDs cannot escape membership authority.

### D3 — integrations hardening

- signed OAuth state;
- safe token storage/refresh;
- complete Google/Microsoft calendar OAuth;
- provider webhook verification/idempotency;
- integration ownership tests.

### D4 — product completion

- real AI triage through approved ZOS/AI authority;
- invitations and Desk role permissions;
- end-to-end Today/tasks/calendar/personnel flows;
- accessibility/i18n validation.

### D5 — six-product convergence

- root `desk:setup`, `desk:typecheck`, `desk:test`, `desk:build`, `desk:check` scripts;
- dedicated Z Desk PostgreSQL workflow;
- root ZOS CI expanded from five products to six;
- convergence PR/status documentation renamed and updated only after exact-head green proof.

## Stop line

This audit does not authorize:

- merge to `main`;
- live Supabase mutation;
- production deployment;
- live billing/Stripe activation;
- Google/Microsoft/Meta production OAuth/account changes;
- force push/history rewrite.

## Initial maturity assessment

- supplied product/prototype maturity: approximately **60%**;
- safe ZOS-integrated production readiness: approximately **35%** before D0–D5 hardening.

The gap is primarily authorization, canonical identity convergence, integration completion, automated testing and release authority — not absence of product concept or domain scope.
