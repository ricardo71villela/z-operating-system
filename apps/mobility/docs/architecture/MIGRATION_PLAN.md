# Z Mobility migration plan (M1–M6)

## M1 — Automotive Domain Foundation — implemented

- Shared pure TypeScript package: `packages/automotive-domain`.
- Canonical entities: Manufacturer, Brand, Model, Generation, Version, Vehicle.
- Legacy `variant` → canonical `version` compatibility mapping.
- Marketplace vehicle contract is shared with the UI.

## M2 — Observation Model — implemented

- `AutomotiveObservation`, metric definitions, source/provenance and validity.
- Official-record and staging-record mappers.
- Supabase Observation repository.

## M3 — Database Baseline — implemented

- Reproducible legacy baseline under `supabase/migrations`.
- ZOS alignment migration adds semantic Version view, Observations, state history, resolved profiles and marketplace boundary columns.
- Source seed migration.

Before applying to production, create a database backup and review the generated migration against the live schema. The migrations are additive and intentionally avoid destructive renames/drops.

## M4 — Reconciliation v3 — implemented side-by-side

- Uses canonical Version language.
- Uses an Automotive Registry repository port.
- Persists legacy `variant` fields for compatibility while also recording `canonical_entity_type = version`.
- Existing V2 remains available during transition.

Run:

```bash
npm run automotive:reconcile:versions -- bmw_pressclub
```

## M5 — Resolved Automotive Projection — implemented

Build observations after staging records are imported:

```bash
npm run automotive:observations:build
```

Build resolved profiles:

```bash
npm run automotive:resolved:build
```

Or both:

```bash
npm run automotive:canonical:build
```

The legacy `automotive:golden:merge` command now redirects to the resolved-profile builder.

## M6 — Marketplace Boundary — implemented

- DB row mapping lives in `src/services/vehicles.ts`.
- UI consumes `MarketplaceVehicle`, not `SupabaseVehicle` rows.
- `version_id` links a concrete vehicle to Registry Version.
- `dealer_organization_id` prepares the ZOS Organization boundary.
- Legacy `dealer_id`, `variant` and `verified` remain temporarily for compatibility.

## Safe production order

1. Back up the current Supabase database.
2. Apply migrations.
3. Run `npm run typecheck` and `npm run test:automotive`.
4. Run existing OEM ingestion/reconciliation/publisher in dry-run where available.
5. Run `automotive:observations:build`.
6. Run `automotive:resolved:build`.
7. Verify marketplace reads.
8. Only then migrate consumers away from Golden tables.
