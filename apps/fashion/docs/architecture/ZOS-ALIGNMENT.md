# Z Fashion — ZOS Alignment

## Purpose
Declares how Z Fashion reuses canonical ZOS domains without duplicating shared authority and freezes the ownership boundary implementation must preserve.

## Reused from ZOS Core

- **Registry** — Fashion Partner identity attaches to canonical ZOS organization/partner identity; Fashion does not create a second organization registry.
- **Geography** — canonical runtime Geography remains the shared Supabase `zos.geography_*` model. `packages/geography/geography.js` is an offline/unit-test fixture only.
- **Trust Engine** — shared trust/reputation mechanics remain ZOS-owned.
- **Partner Quality Score** — the generic score remains ZOS-owned. Fashion may provide product-specific observations, but does not fork a second scoring authority.
- **Data / Provenance** — shared observation/provenance mechanics remain ZOS-owned where cross-product canonical facts are involved.
- **Integration transport** — cross-boundary transport/outbox mechanics remain shared technical infrastructure, not Fashion semantics.

## Z Fashion-owned domain

Z Fashion owns Product, Brand, Category, Corner, All Sale aggregation, campaigns, stock-feed freshness/reservations, Fashion pricing history, Partner operational onboarding extensions, multi-partner Cart/checkout/order orchestration, and Fashion-specific commerce rules.

## Cart / Order decision

The multi-partner Cart/checkout primitive remains **Fashion-owned**. It is not promoted to ZOS Core merely because reuse is theoretically possible. Promotion requires a second independent product with the same semantic need and an explicit Governance decision.

The current SQL checkout implementation uses one PostgreSQL transaction so a failure unwinds earlier reservations atomically.

## Partner / Brand / Category decision

- Partner is the store/legal organization.
- Brand is independent from Partner.
- A Partner can be mono-brand or multi-brand without that distinction becoming stored identity authority.
- Category belongs to Product; a Partner/Corner may span multiple categories.

## Geography decision

Fashion uses `country_iso` (ISO-3166-1 alpha-2) to align with canonical ZOS Geography.

`packages/geography/geography.js` exists only so pure domain tests can validate stable ISO conventions without database/network I/O. It is deliberately not an npm workspace package. If a genuine shared runtime package is needed later, it must be introduced separately with an explicit dependency contract and atomic root lockfile update.

## Partner Quality Score decision

Fashion-specific operational evidence may later become input to the shared Partner Quality Score. Such evidence remains signal/observation data, not a Fashion-owned scoring authority. New shared scoring rules require Governance review.

## Database authority

All Fashion migrations intended for the shared ZOS database live under `infrastructure/supabase/migrations/`. That directory is the integrated Supabase migration authority.

## Validation history versus current authority

Fashion foundation migrations were originally validated against the ZOS/Find/Jobs/Studio migration chain that existed on the Fashion development line. Those results remain historical evidence, but they do not prove compatibility with later Z Studio shared-infrastructure work.

Z Studio and Z Fashion histories are now combined on `chore/zos-five-app-convergence-v1`. Current compatibility authority is the ecosystem PostgreSQL convergence job in `.github/workflows/ci.yml`: it applies the complete integrated migration directory in timestamp order and then executes Studio and Fashion assertions on the same disposable database.

Until that converged GitHub Actions job is observed green, current Studio/Fashion PostgreSQL compatibility is **UNPROVEN**, not PASS.

A green disposable CI database still does not mean migrations have been applied to the live shared Supabase project. Live mutation is a separate explicit operational gate.

## Historical Fashion-local checks

The Fashion development line previously exercised Partner constraints, Brand/Product constraints, campaign scheduling, Corner configuration, stock freshness and reservation behavior, onboarding transitions, price-history rules and atomic multi-partner checkout rollback. These remain useful component evidence; the converged ecosystem CI is the compatibility authority for the complete current migration set.

## Status

Converged source boundary defined; cross-product PostgreSQL proof pending observed CI.

## Last Updated

2026-08-21
