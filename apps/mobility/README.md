# Z Mobility

Z Mobility is the automotive marketplace and automotive-data vertical of the Z Operating System (ZOS). It combines OEM data ingestion, domain-owned automotive identity, source-aware technical observations, reconciliation, marketplace publication and future automotive intelligence.

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
Mobility-owned automotive identity
Manufacturer → Brand → Model → Generation → Version
        ↓                    ↘ local_only ZOS Registry bindings
Technical Observations + Provenance
        ↓
Resolved Automotive Profiles
        ↓
Vehicle / Marketplace Projection
        ↓
Z Mobility applications
```

A `Version` is an OEM product/configuration. A `Vehicle` is a concrete unit offered on the marketplace.

The physical table `public.automotive_variants` is retained for runtime compatibility; the canonical Mobility domain term is `Version` and `public.automotive_versions` is its semantic compatibility view over the same UUID identity.

ZOS does not take ownership of automotive semantics. Local automotive identities participate in the cross-product Registry through `zos.registry_bindings` with `domain_code = 'mobility'`; they are not duplicated as a second canonical automotive table in Core.

See:

- `docs/architecture/ZOS_ALIGNMENT.md`
- `docs/architecture/MIGRATION_PLAN.md`

## Project structure

- `packages/automotive-domain/` — pure canonical TypeScript contracts.
- `scripts/automotive/manufacturers/` — universal OEM pipeline and manufacturer adapters.
- `scripts/automotive/documents/` — document discovery/download/extraction.
- `scripts/automotive/generation/` — RAW official-record generation.
- `scripts/automotive/reconcile/` — automotive identity resolution.
- `scripts/automotive/observations/` — technical Observation mapping.
- `scripts/automotive/resolution/` — resolved read-model policy.
- `scripts/automotive/infrastructure/` — Supabase implementations of ports.
- `src/` — Next.js marketplace/application layer.
- `supabase/migrations/` — historical/local reproducible Mobility baseline retained for development provenance.

## Integrated database authority

The integrated ZOS Supabase migration authority is:

```text
infrastructure/supabase/migrations/
```

Mobility joins that authority through:

```text
20260821170000_z_mobility_database_convergence_v1.sql
20260821171000_z_mobility_registry_binding_trigger_hardening_v1.sql
```

The convergence deliberately keeps current operational tables in `public` so existing ingestion/marketplace code is not broken by a schema move. The `mobility` schema owns convergence helpers and makes the vertical boundary explicit. This follows the same compatibility principle used by Z Find: schema purity is not achieved by breaking a working runtime.

`apps/mobility/supabase/migrations/` remains useful as historical/local development provenance but is **not** a second production deployment authority.

A successful disposable PostgreSQL convergence run proves source compatibility only. It does not mean the migration has been applied to the live/shared Supabase project.

## ZOS ownership boundary

### Shared ZOS

- canonical Organisation identity;
- Registry binding mechanics;
- shared Geography;
- shared generic Data/Observation primitives when facts become cross-product inputs;
- ecosystem security/governance/audit principles.

### Z Mobility

- Manufacturer, Brand, Model, Generation, Version and Vehicle semantics;
- OEM/source ingestion and reconciliation;
- automotive technical metrics/observations;
- resolved automotive profiles;
- automotive marketplace projection and publication behavior;
- automotive-specific source ranking and reconciliation policy.

`public.automotive_observations` remains a Mobility-owned technical ingestion store. It must not be confused with Registry identity or with the generic cross-product `zos.observations` authority.

## Local setup

From the repository root:

```bash
npm ci
npm run mobility:typecheck
npm run mobility:test
npm run mobility:build
```

For local development of the application:

```bash
npm run dev --workspace=z-mobility-next
```

Supabase service-role credentials are required for privileged internal automotive import scripts. Never expose the service-role key to the browser.

## Automotive commands

```bash
npm run automotive:ingest --workspace=z-mobility-next -- --manufacturer bmw --market PT
npm run automotive:reconcile:versions --workspace=z-mobility-next -- bmw_pressclub
npm run automotive:publish:manufacturer-variants --workspace=z-mobility-next
npm run automotive:observations:build --workspace=z-mobility-next
npm run automotive:resolved:build --workspace=z-mobility-next
npm run automotive:canonical:build --workspace=z-mobility-next
```

## Golden Record compatibility

The legacy Golden tables remain temporarily so existing workflows are not broken. New development targets automotive identity + Observations + Resolved Profiles. `automotive:golden:merge` is deprecated and redirects to the resolved-profile builder.

## Quality gates

The root ecosystem CI runs:

```bash
npm run mobility:typecheck
npm run mobility:test
```

The dedicated `Z Mobility PostgreSQL` workflow additionally applies the **complete integrated ZOS migration chain** to a disposable PostgreSQL database and runs `infrastructure/supabase/tests/z_mobility_database_convergence_v1.sql`.

The canonical domain package has no filesystem/network/Supabase dependency and should remain pure and testable.

## Status

Source converged into the shared ZOS database authority; live database application remains separately gated.

## Last Updated

2026-08-21
