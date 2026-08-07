# Z Mobility — Validation Report

Validation performed after the ZOS v1.1 alignment (M1–M6).

## Passed gates

- TypeScript: `tsc --noEmit` — PASS
- ESLint: `eslint .` — PASS
- Automotive test suite — 54/54 PASS
- Merge-conflict marker scan — PASS

## Test execution note

The source archive contained `node_modules` installed on macOS. The audit environment is Linux, so `tsx` could not load the bundled Darwin `esbuild` binary. The same TypeScript test sources were therefore compiled with the project TypeScript compiler and executed with Node's native test runner. All 54 automotive tests passed.

The final distributable archive intentionally excludes `node_modules`. Run `npm ci` (or `npm install`) on the target machine so native packages are installed for the correct platform.

## Build note

`next build` could not be completed in the audit environment because Next.js attempted to download the Linux SWC package and the isolated package mirror did not provide it. TypeScript and ESLint both pass; run `npm ci && npm run build` on the target development/CI environment as the final platform-specific build gate.

## Database note

The Supabase schema is now represented by versioned migrations under `supabase/migrations/`. The audit environment does not contain the Supabase CLI/Postgres service, so migrations were not applied to a disposable database here. Before production deployment, run the migrations in staging (or `supabase db reset` locally), inspect the resulting schema, and back up the live database.

## Architecture alignment

The implementation preserves backward compatibility while introducing:

- canonical automotive domain (`Version` semantics while retaining the physical `automotive_variants` table);
- source-aware `Observation` records and provenance;
- registry-oriented Reconciliation V3;
- resolved automotive profiles rather than a second Golden identity;
- explicit state-transition history;
- marketplace domain mapping instead of exposing Supabase rows directly;
- repository/port boundaries for new canonical services.
