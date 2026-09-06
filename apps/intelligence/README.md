# Z Intelligence

Z Intelligence is a vertical product of the Z Operating System (ZOS) ecosystem. It is in **scaffold stage**: this repository entry exists to register the product's structure, ownership boundary and quality gate ahead of feature implementation.

## Architecture status

**Scaffold — pre-implementation.** No product functionality, database schema or deployed surface exists yet. This app currently renders a placeholder page only.

## Scope

Z Intelligence's product scope (target users, concrete features, data model) is not yet defined. This scaffold intentionally avoids assuming scope so that product decisions are made deliberately rather than inherited from other verticals.

Related domain governance: `80-intelligence/` defines ecosystem-wide principles for AI/ML, recommendation engines, knowledge graphs and geospatial/market intelligence used across ZOS products. Z Intelligence, once scoped, is expected to be a primary implementer of those principles, but the domain document does not itself define this product's features.

## ZOS ownership boundary

### Reused shared ZOS capabilities (expected, not yet integrated)

Canonical shared identity, Registry bindings and other approved ZOS Core capabilities will be reused rather than duplicated once Z Intelligence integrates with shared infrastructure. No shared capability has been wired in yet.

### Z Intelligence-owned domain (to be defined)

Product-specific semantics are not yet defined. This section will be filled in as scope is decided.

## Local setup

From the repository root:

```bash
npm ci
npm run intelligence:typecheck
npm run intelligence:test
```

For local development of the application:

```bash
npm run dev --workspace=@zintelligence/web
```

## Integrated database authority

No database schema exists yet. When Z Intelligence needs persistence, integrated migrations must live under `infrastructure/supabase/migrations/`, per `150-standards/MONOREPO-CONTRACT.md`.

## Quality gates

```bash
npm run intelligence:typecheck
npm run intelligence:test
```

Both currently pass trivially (no code/tests exist beyond the scaffold). They exist so the root `zos:check` gate can include Z Intelligence without silently excluding it, per the monorepo contract.

## Status

Draft — scaffold only, no product functionality.

## Last Updated

2026-09-06
