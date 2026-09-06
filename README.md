# Z Operating System — ZOS

ZOS is the shared operating layer behind a portfolio of independent products. Each product retains its own domain semantics, experience and product authority; ZOS Core provides approved shared capabilities such as canonical identity and cross-product infrastructure.

## Active products

| Product | Role | Repository authority |
| --- | --- | --- |
| Z Find | Marketplace / vertical | `apps/find/` |
| Z Mobility | Marketplace / vertical | `apps/mobility/` |
| Z Jobs | Marketplace / vertical | `apps/jobs/` |
| Z Fashion | Marketplace / vertical | `apps/fashion/` |
| Z Studio | Horizontal product | `apps/studio/` |
| Z Desk | Horizontal operational workspace | `apps/desk/` |
| Z Intelligence | Marketplace / vertical (scaffold) | `apps/intelligence/` |

## Shared authority

Canonical shared identity is owned by ZOS Core, including `zos.persons`, `zos.organisations` and `zos.memberships`. Product-specific roles and semantics remain in their owning domains. Z Desk therefore projects workspace access through `desk.workspace_members` and does not introduce a second person, organisation or membership authority.

Integrated Supabase deployment authority lives in `infrastructure/supabase/migrations/`. Product-local fixtures or historical migration sources are not production authority unless explicitly designated by governance.

## Quality gates

The root CI is the ecosystem-level convergence authority and must cover all active products. Product-specific workflows provide deeper gates where needed. A green root gate must not silently exclude an active ZOS product. Z Intelligence is scaffold-stage: its gate currently passes trivially until product functionality exists.

See `150-standards/MONOREPO-CONTRACT.md` for the governance contract and `apps/desk/docs/RELEASE_READINESS.md` for the current Z Desk release boundary.

## Release discipline

Convergence work is production-neutral until separately authorised. Passing CI does not itself authorize merge to `main`, live database mutation, provider-account changes, billing changes or production deployment.
