# Validation — Z Jobs ZOS v1.1 alignment

## Completed in the adaptation environment

- `packages/domain`: strict TypeScript typecheck — PASS
- all compiled domain test files — PASS (18 test files)
- new ZOS compatibility primitives test — PASS
- `apps/api`: strict TypeScript typecheck — PASS using temporary local type stubs
  for dependencies that were unavailable from the isolated package registry in
  the original adaptation environment
- migration sequence checked statically through `0030`

## Dependency-install limitation in the adaptation environment

`npm ci` for the API could not complete because the isolated npm mirror returned
404 for a transitive package (`xtend@4.0.2`). This is an environment/package-mirror
limitation, not a repository error discovered by the typechecker.

The temporary validation stubs used for typechecking are **not included** in the
final repository ZIP.

## Required validation on the development machine / CI

```bash
# Domain
cd packages/domain
npm install
npm run typecheck
npm test

# API
cd ../../apps/api
npm ci
npm run typecheck
npm test

# Full Postgres/RLS vertical slice from repo root
# Follow README / docs/POSTGRES-INTEGRATION.md to create the local database,
# apply migrations 0001..0030 and seeds, then:
DATABASE_URL="postgresql://..." npx tsx apps/api/scripts/verify-vertical-slice.ts
```

A production Supabase database must never receive migrations 0027–0030 without
first applying them to local/staging and reviewing the diff.
