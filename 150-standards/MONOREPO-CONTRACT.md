# ZOS Monorepo Contract

## Purpose
Defines the minimum operational contract that every ZOS product or vertical must satisfy inside the `z-operating-system` monorepo. This standard normalizes governance and authority without forcing every product to use the same internal folder topology or technology stack.

## Scope
Applies to Z Find, Z Mobility, Z Jobs, Z Studio, Z Fashion and every future ZOS product integrated into this repository.

## 1. Product independence
Each product owns its domain semantics, lifecycle, application experience and product-specific data. Shared ZOS capabilities do not own vertical semantics merely because they are reusable.

Products may use different internal structures when justified by their runtime shape. Structural uniformity is not an architectural goal; explicit ownership and repeatable quality gates are.

## 2. Package namespaces
- `@zos/*` is reserved for capabilities that are genuinely shared across products and owned by ZOS Core.
- New product-owned packages, and product packages renamed for architectural reasons, use a product namespace, for example `@zjobs/*`, `@zfind/*`, `@zmobility/*`, `@zstudio/*`, `@zfashion/*`.
- A pre-existing unscoped or historical product package identifier may remain stable when renaming it would create unnecessary workspace, deployment, build-cache or external-project risk. Such an identifier must never use the reserved `@zos/*` namespace and its owning product must be explicit in source/documentation.
- Historical identifiers are compatibility names, not evidence of shared ZOS ownership.
- A capability is not promoted to `@zos/*` until at least two independent products require the same semantic capability and Governance approves the promotion.

## 3. Required product contract
Every product under `apps/<product>/` must maintain:
- a current `README.md` declaring product scope, architecture status and ZOS ownership boundary;
- executable quality gates reachable from the repository root;
- explicit documentation of any local database or migration source that is not the integrated deployment authority;
- no production secret committed to source;
- product-specific semantics isolated from shared packages.

The product may otherwise choose `src/`, nested `apps/`, `packages/`, `backend/`, `native/`, `pwa/`, `scripts/` or another topology appropriate to its runtime.

## 4. Database authority
`infrastructure/supabase/migrations/` is the integrated ZOS Supabase migration authority.

Vertical-local migration directories may exist for historical development, isolated testing or compatibility, but they are not production deployment authority unless a Governance decision explicitly says otherwise.

Every new integrated migration must:
1. be forward-only;
2. preserve existing product ownership boundaries;
3. be executable in timestamp order after every earlier integrated migration;
4. be covered by an ephemeral PostgreSQL convergence gate before any live mutation;
5. avoid introducing a second canonical source for an existing ZOS identity or shared capability.

## 5. Shared runtime authority
Canonical shared identity, Registry bindings, Geography, Consent and other approved ZOS Core capabilities live in their designated shared authority. Fixtures, mirrors, caches and local test modules must identify themselves as non-authoritative when they are not the source of truth.

A shared source fixture does not automatically become an npm workspace package. Package-manager authority is introduced only when there is a real package dependency contract and the root lockfile is updated atomically with it.

## 6. Root quality gates
The repository root must expose an aggregate gate that covers every active product. A green root CI result must never imply whole-ZOS health while silently excluding an active product.

Product-specific workflows remain allowed and encouraged, but the root gate is the ecosystem-level authority.

The root lockfile and workspace declarations must remain mutually consistent so `npm ci` is deterministic.

## 7. Branch convergence
Long-running product branches may evolve independently, but two branches that both change shared infrastructure cannot be promoted independently without a convergence gate.

Before either branch becomes integrated authority, the combined tree must validate:
- the complete ordered Supabase migration sequence;
- root package/workspace/lockfile consistency;
- each affected product's tests/typechecks/build contract;
- namespace and source-of-truth invariants;
- no accidental live deployment or production database mutation.

No force-push or history rewrite is required for convergence.

## 8. Documentation authority
Top-level repository documentation must list every active ZOS product and distinguish independent marketplaces/verticals from horizontal products or tools. Historical READMEs must not claim obsolete states such as "not pushed to GitHub" or "pre-implementation" once implementation exists.

Operational documentation must describe durable repository/provider authority, not the network limitations or credentials of a particular development assistant or workstation.

## Status
Adopted for convergence work; production-neutral.

## Last Updated
2026-08-21
