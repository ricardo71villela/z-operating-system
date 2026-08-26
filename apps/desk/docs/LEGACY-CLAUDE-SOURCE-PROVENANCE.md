# Z Desk — Legacy Claude Source Provenance

## Purpose

This file records the repository provenance of the Claude-developed Z Desk foundation so it cannot be confused with the current ZOS integration authority.

## Historical source

Historical branch:

`feature/z-desk-foundation`

The branch was created from the old `main` authority at:

`94f025edb4439a84f20aa0601e318a7fb0905985`

Against the current convergence head `390d61cf619759e0edf783a60be804914101b831`, the historical branch was found to be **21 commits ahead of its old base and 430 commits behind the current convergence history**. It therefore must not be merged wholesale into current convergence.

The branch contains the substantial Claude-developed Z Desk source, including Next.js/NestJS application code, integrations, personnel/task/calendar features, Desk-local Supabase migrations and historical root package/lockfile changes.

## Preserved archive

The original pre-quarantine branch tip is preserved without history rewrite at:

`archive/zdesk-claude-foundation-20260823`

This archive is **provenance only**.

## Legacy branch quarantine

The historical `feature/z-desk-foundation` branch has been explicitly marked `NOT ZOS AUTHORITY / DO NOT MERGE` in both a top-level notice and its Desk README.

The connected GitHub action available in this session does not expose branch-ref deletion. The branch therefore remains present but quarantined rather than being imitated as deleted through a force ref move.

No force push or history rewrite was used.

## Canonical authority

Current Z Desk integration authority:

- Issue `#60` — `Z Desk — sixth ZOS product convergence`;
- branch `feature/zdesk-zos-convergence-v1`;
- `apps/desk/docs/ZOS-INTEGRATION-AUDIT-2026-08-23.md`;
- this provenance record.

## Why selective convergence is required

The historical source contains valuable product work but also pre-ZOS authority choices that must not be inherited unchanged:

- `desk_tenants` duplicates canonical `zos.organisations`;
- `desk_users` duplicates canonical `zos.persons` + `zos.memberships`;
- some service-role-backed routes trust caller-supplied tenant/actor identifiers;
- OAuth state/token handling requires hardening;
- Desk-local migrations are not the integrated ZOS migration authority;
- root package/lockfile changes are based on the old five-product repository state.

The current integration must port useful Desk domain/product code while replacing these authorities with the canonical ZOS model.

## Repository classification

```text
archive/zdesk-claude-foundation-20260823   = ORIGINAL CLAUDE PROVENANCE
feature/z-desk-foundation                  = LEGACY QUARANTINED SOURCE — DO NOT MERGE
feature/zdesk-zos-convergence-v1           = CURRENT Z DESK ZOS INTEGRATION AUTHORITY
chore/zos-five-app-convergence-v1          = CURRENT EXISTING PRODUCT CONVERGENCE BASE
main                                       = UNCHANGED
```

No live Supabase, deployment, billing, OAuth provider or production mutation is authorized by this provenance classification.
