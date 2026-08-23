# Z Desk

Z Desk is the sixth ZOS product and a horizontal B2B operational workspace. It may be subscribed to standalone or enabled alongside Z Studio, Z Find, Z Jobs, Z Mobility or Z Fashion.

## Canonical authority

The Claude foundation is selectively converged; its legacy identity model is not authoritative.

- human identity: `zos.persons`;
- organisation identity: `zos.organisations`;
- Person ↔ Organisation: `zos.memberships`;
- Desk projection: `desk.workspaces` + `desk.workspace_members`;
- Desk-owned domain: communications, Today, calendar, tasks and personnel operations.

The browser never supplies authoritative workspace/actor identity. Web calls use the same-origin `/api/desk/...` proxy. The backend verifies the Supabase bearer session, resolves canonical ZOS membership, and injects the Desk workspace/member authority server-side.

## Preserved product foundations

Next.js/React web, FR/EN/ES/PT/IT/DE, NestJS backend, unified email + WhatsApp model, Today workflow, calendar suggestions with human confirmation, tasks/missions, personnel schedules/absence/overtime models, Gmail/Microsoft/Google Calendar/Outlook/WhatsApp adapters, BullMQ foundations and human-in-loop AI design are preserved from the historical source.

## D1 runtime boundary

Mounted behind canonical ZOS authorization: Auth bootstrap, Today, Events, Messages, Tasks and read-only Personnel views.

Provider connect/OAuth/webhook modules remain source-present but intentionally unmounted until D3 completes encrypted credential handling, one-time OAuth state, refresh and webhook verification. External calendar push is a no-op in D1/D2. Personnel mutation workflows are retained in provenance and return in D4 behind explicit role authority.

## Integrated database authority

Legacy `apps/desk/supabase/migrations/*` is removed from the canonical branch. Z Desk joins the single ZOS migration chain through:

- `infrastructure/supabase/migrations/20260823180000_z_desk_zos_foundation_v1.sql`
- `infrastructure/supabase/migrations/20260823180100_z_desk_domain_v1.sql`
- `infrastructure/supabase/tests/z_desk_zos_convergence_v1.sql`

## Security boundary

Service-role credentials are backend-only. Caller-provided `tenantId`, `workspaceId`, `createdBy` and equivalents are removed or overwritten. Cross-workspace member references are database-constrained. Provider credentials receive no authenticated browser privilege.

## Remaining gates

- D2 — full integrated PostgreSQL/RLS run and dependency-backed typecheck/build;
- D3 — secure provider credentials, OAuth and webhooks;
- D4 — AI triage, invitations/roles, personnel mutations and full E2E flows;
- D5 — permanent Z Desk CI and six-product convergence registration.
