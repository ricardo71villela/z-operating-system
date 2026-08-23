# Z Desk

Z Desk is the sixth ZOS product and a horizontal B2B operational workspace. It may be subscribed to standalone or enabled alongside Z Studio, Z Find, Z Jobs, Z Mobility or Z Fashion.

## Canonical authority

The Claude foundation is selectively converged; its legacy identity model is not authoritative.

- human identity: `zos.persons`;
- organisation identity: `zos.organisations`;
- Person ↔ Organisation: `zos.memberships`;
- Desk projection: `desk.workspaces` + `desk.workspace_members`;
- Desk-owned domain: communications, Today, calendar, tasks and personnel operations.

The browser never supplies authoritative workspace/actor identity. Web calls use the same-origin `/api/desk/...` proxy. The backend verifies the Supabase bearer session, resolves canonical ZOS membership, and injects Desk workspace/member authority server-side.

## Preserved product foundations

Next.js/React web, FR/EN/ES/PT/IT/DE, NestJS backend, unified email + WhatsApp model, Today workflow, calendar suggestions with human confirmation, tasks/missions, personnel schedules/absence/overtime models, Gmail/Microsoft/Google Calendar/Outlook/WhatsApp adapters, BullMQ foundations and human-in-loop AI design are preserved from the historical source.

## Runtime boundary

Mounted behind canonical ZOS authorization: Auth bootstrap, Today, Events, Messages, Tasks and read-only Personnel views.

D3A additionally mounts hardened Google/Microsoft email and calendar OAuth. `/authorize` requires canonical Desk auth; callback authority comes only from short-lived signed one-time state. Provider access/refresh tokens are encrypted server-side with AES-256-GCM before persistence. Raw tenant/workspace ids and plaintext OAuth token columns are not integration authority.

WhatsApp connect/webhook and background provider sync remain intentionally unmounted/disabled until D3B completes request-signature verification, encrypted credential reads/refresh and idempotency. Personnel mutation workflows return in D4 behind explicit role authority.

## Integrated database authority

Legacy `apps/desk/supabase/migrations/*` is removed from the canonical branch. Z Desk joins the single ZOS migration chain through:

- `infrastructure/supabase/migrations/20260823180000_z_desk_zos_foundation_v1.sql`
- `infrastructure/supabase/migrations/20260823180100_z_desk_domain_v1.sql`
- `infrastructure/supabase/migrations/20260823180200_z_desk_integration_security_v1.sql`
- `infrastructure/supabase/tests/z_desk_zos_convergence_v1.sql`
- `infrastructure/supabase/tests/z_desk_integration_security_v1.sql`

## Validated gates

D0/D1: PASS — source normalization, canonical ZOS identity/organisation convergence and server-derived workspace authority.

D2: PASS on exact head `1151d299391affced5c8ddcd3b6add75a9b26f3f` — complete integrated migration chain, PostgreSQL/RLS, web typecheck/build, backend verification/typecheck/tests/build and ZOS regression workflows all succeeded.

D3A is under exact-head CI validation after introducing signed one-time OAuth state, AES-256-GCM credential storage, cross-workspace provider-account takeover prevention and completed Google/Microsoft calendar token exchange.

## Security boundary

Service-role credentials and provider secrets are backend-only. Caller-provided `tenantId`, `workspaceId`, `createdBy` and equivalents are removed or overwritten. Cross-workspace member references are database-constrained. Provider credential and OAuth-state tables receive no authenticated browser privilege.

## Remaining gates

- D3B — WhatsApp signature verification, encrypted credential reads/refresh, provider sync/webhook idempotency;
- D4 — AI triage, invitations/roles, personnel mutations and full E2E flows;
- D5 — six-product convergence registration after exact-head green proof.
