# Z Mobility

Z Mobility is the automotive vertical of ZOS. It combines OEM data ingestion, canonical automotive identity, source-aware observations, reconciliation, marketplace publication and future automotive intelligence.

## Architecture

```text
OEM / official sources
        ↓
Discovery + Documents
        ↓
RAW ManufacturerOfficialRecord
        ↓
Staging + Reconciliation
        ↓
Automotive Registry
Manufacturer → Brand → Model → Generation → Version
        ↓
Observations + Provenance
        ↓
Resolved Automotive Profiles
        ↓
Vehicle / Marketplace Projection
        ↓
Z Mobility applications
```

A Version is an OEM product/configuration. A Vehicle is a concrete unit offered on the marketplace.

The physical table `automotive_variants` is retained for backward compatibility; the canonical domain term is `Version`.

See:

- `docs/architecture/ZOS_ALIGNMENT.md`
- `docs/architecture/MIGRATION_PLAN.md`

## Project structure

- `packages/automotive-domain/` — pure canonical TypeScript contracts.
- `scripts/automotive/manufacturers/` — universal OEM pipeline and manufacturer adapters.
- `scripts/automotive/documents/` — document discovery/download/extraction.
- `scripts/automotive/generation/` — RAW official-record generation.
- `scripts/automotive/reconcile/` — Registry identity resolution.
- `scripts/automotive/observations/` — Data Observation mapping.
- `scripts/automotive/resolution/` — resolved read-model policy.
- `scripts/automotive/infrastructure/` — Supabase implementations of ports.
- `src/` — Next.js marketplace/application layer.
- `supabase/migrations/` — reproducible database schema.

## Local setup

```bash
npm install
cp .env.example .env.local   # if your environment uses an example file
npm run typecheck
npm run test:automotive
npm run dev
```

Supabase service-role credentials are required for internal automotive import scripts. Never expose the service-role key to the browser.

## Database

For a fresh local Supabase environment:

```bash
supabase db reset
```

Production migration is additive, but always back up and inspect the live schema before applying migrations.

## Automotive commands

```bash
# Existing OEM ingestion
npm run automotive:ingest -- --manufacturer bmw --market PT

# Canonical Version reconciliation
npm run automotive:reconcile:versions -- bmw_pressclub

# Existing publication compatibility path
npm run automotive:publish:manufacturer-variants

# Convert imported records to source-aware Observations
npm run automotive:observations:build

# Build resolved profiles from Observations
npm run automotive:resolved:build

# Build Observations + Resolved Profiles
npm run automotive:canonical:build
```

## Golden Record compatibility

The legacy Golden tables remain temporarily so existing workflows are not broken. New development must use Registry identity + Observations + Resolved Profiles. `automotive:golden:merge` is deprecated and redirects to the resolved-profile builder.

## Quality gates

```bash
npm run typecheck
npm run lint
npm run test:automotive
```

The canonical domain package has no filesystem/network/Supabase dependency and should remain pure and testable.
