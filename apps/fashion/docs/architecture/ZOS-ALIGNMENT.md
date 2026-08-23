# Z Fashion — ZOS Alignment

## Purpose

Declares how Z Fashion reuses canonical ZOS domains without duplicating shared authority and records the current convergence status of the implemented Fashion product boundary.

## Reused from ZOS Core

- **Person / Registry identity** — Fashion clients bind into canonical ZOS person identity through the shared identity/Registry bridge; Fashion does not create a competing person registry.
- **Partner / Organization identity** — Fashion Partner identity attaches to canonical ZOS organization/partner identity; Fashion does not create a second organization registry.
- **Geography** — canonical runtime Geography remains the shared Supabase `zos.geography_*` model. `packages/geography/geography.js` is an offline/unit-test fixture only.
- **Trust Engine** — shared trust/reputation mechanics remain ZOS-owned.
- **Partner Quality Score** — the generic score remains ZOS-owned. Fashion may consume the score or contribute Fashion-specific observations, but does not fork a second scoring authority.
- **Data / Provenance** — shared observation/provenance mechanics remain ZOS-owned where cross-product canonical facts are involved.
- **Integration transport** — cross-boundary transport/outbox mechanics remain shared technical infrastructure, not Fashion semantics.

## Z Fashion-owned domain

Z Fashion owns Product, Brand, Category, Age Segment, Gender, sizing/style grouping, Corner, All Sale aggregation, campaigns, stock-feed freshness/reservations, Fashion pricing history, Partner onboarding extensions, Partner monetization rules, client-account Fashion semantics, multi-partner Cart/checkout/order orchestration, shipments/returns and Fashion-specific commerce rules.

## Cart / Order decision

The multi-partner Cart/checkout primitive remains **Fashion-owned**. It is not promoted to ZOS Core merely because reuse is theoretically possible. Promotion requires a second independent product with the same semantic need and an explicit Governance decision.

The current SQL checkout implementation uses one PostgreSQL transaction so a failure unwinds earlier reservations atomically.

The SQL/database authority must not be confused with a completed customer checkout product surface: final customer checkout HTTP/UI and live payment integration remain separate pre-production work.

## Partner / Brand / Product decision

- Partner is the store/legal organization.
- Brand is independent from Partner.
- A Partner can be mono-brand or multi-brand without that distinction becoming stored identity authority.
- Category, Gender, Age Segment, size and style grouping are Product-domain concerns.
- A Partner/Corner may span multiple categories and brands.

## Client identity decision

Fashion now has a product-local client anchor and a ZOS identity-bridge extension following the same additive compatibility principle used elsewhere in the ecosystem. Canonical human identity remains ZOS-owned.

The bridge being present in migrations does not imply that every current development HTTP endpoint is production-authenticated. Real Supabase Auth wiring across the final customer and Partner surfaces remains an explicit activation/implementation boundary.

## Geography decision

Fashion uses ISO country codes and shared market/locale conventions aligned with canonical ZOS Geography.

`packages/geography/geography.js` exists only so pure domain tests can validate stable ISO conventions without database/network I/O. It is deliberately not a competing runtime source of truth.

## Partner Quality Score decision

Fashion-specific operational evidence may become input to the shared Partner Quality Score. The score itself and generic scoring mechanics remain ZOS-owned. Fashion monetization may consume an externally supplied quality score without rebuilding that score locally.

## Stock authority decision

`20260821130000_z_fashion_stock_v1.sql` is the canonical Fashion stock/reservation table authority. During five-product convergence, a later Fashion development migration was found to duplicate that model. It was reconciled forward-only so the later migration adds only the missing `fashion.apply_stock_update(...)` API required by the Partner service.

Reservation semantics therefore retain one database authority rather than two competing table/function models.

## Payment decision

Fashion owns its payment/order semantics, but live processor activation is separate from source convergence. Stripe-oriented payment state/contracts exist in source and database migrations; live credentials, checkout API wiring, production webhook reconciliation, settlement and refund operations have not been activated by this work.

## Database authority

All Fashion migrations intended for the shared ZOS database live under `infrastructure/supabase/migrations/`. That directory is the integrated Supabase migration authority.

The Fashion-only timestamp collision discovered during convergence was resolved by moving the later Fashion migration sequence onto unused integrated timestamps while preserving logical order and content. The Mobility migration authority at `20260821170000` remains unchanged.

## Convergence history and current authority

The Claude-developed `feature/z-fashion-foundation` history advanced beyond the earlier Fashion snapshot that had first been included in the five-product convergence branch. The missing 27 Fashion commits were reconciled into `chore/zos-five-app-convergence-v1` through a true two-parent merge commit, preserving their Git ancestry while keeping current ZOS shared authorities.

Two integration defects were then exposed and corrected without weakening runtime rules:

1. a later stock-persistence migration duplicated the existing stock authority and was converted into a forward-only API extension;
2. an old PostgreSQL integration test attempted the forbidden `applied -> active` onboarding transition and was updated to exercise `applied -> under_review -> approved -> active` before asserting the independent activation constraints.

## Current validation authority

As of 2026-08-23, convergence HEAD validation has observed:

- the complete integrated ZOS migration directory applied successfully to a disposable PostgreSQL database;
- Fashion Partner constraint smoke checks passing;
- the complete current Fashion domain suite passing;
- Fashion Partner API checks passing against real PostgreSQL;
- the dedicated `Z Fashion PostgreSQL` workflow passing;
- the full five-product internal GitHub workflow matrix passing 15/15 on the same converged source line.

This establishes **source and cross-product PostgreSQL compatibility = PASS** for the converged Fashion implementation.

It still does **not** mean the migrations have been applied to the live shared Supabase project, that Stripe is live, or that Z Fashion has been deployed to production. Those remain separate explicit operational gates.

## Production boundary

Current Fashion implementation is substantial but pre-production. In particular:

- final `fashion-web` customer storefront is not complete;
- final `fashion-admin` operations application is not complete;
- real auth wiring is not complete across all HTTP surfaces;
- customer checkout/payment is not wired end-to-end to live Stripe;
- live shared Supabase has not been mutated by convergence;
- no production Z Fashion deployment has been performed.

## Status

Five-product source/database convergence **PASS**. Z Fashion remains an integrated pre-production implementation pending final customer/admin applications, production auth/payment wiring, live database activation and deployment.

## Last Updated

2026-08-23
