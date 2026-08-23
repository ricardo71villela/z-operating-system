# Z Desk legacy source branch — NOT ZOS integration authority

This branch (`feature/z-desk-foundation`) is retained only as historical/provenance source for the Claude-developed Z Desk foundation.

It was created from the old `main` authority at `94f025edb4439a84f20aa0601e318a7fb0905985` and diverges materially from the current multi-product convergence history.

## Do not merge this branch

This branch is **NOT** the ZOS integration authority and must not be merged directly into `main` or `chore/zos-five-app-convergence-v1`.

The canonical Z Desk convergence work is tracked by:

- Issue `#60` — `Z Desk — sixth ZOS product convergence`
- branch `feature/zdesk-zos-convergence-v1`
- audit authority `apps/desk/docs/ZOS-INTEGRATION-AUDIT-2026-08-23.md` on that branch

## Why direct merge is unsafe

The historical source contains architecture that must be adapted before ZOS integration, including:

- `desk_tenants` as an independent organisation authority, while ZOS already owns canonical `zos.organisations`;
- `desk_users` as an independent person/membership authority, while ZOS already owns `zos.persons` and `zos.memberships`;
- application controllers using service-role Supabase access while accepting caller-supplied tenant/actor identifiers;
- Desk-local migrations under `apps/desk/supabase/migrations/` rather than the single integrated ZOS migration authority;
- OAuth/token and authorization flows that require hardening before production use;
- root workspace/lockfile changes based on the pre-convergence repository state.

The source remains valuable and should be selectively ported/reworked under the canonical Z Desk convergence branch rather than merged wholesale.

## Preserved archival pointer

The original pre-notice branch tip has been preserved at:

`archive/zdesk-claude-foundation-20260823`

No history rewrite was performed.
