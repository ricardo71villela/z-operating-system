# Z Fashion — Product Strategy & Priority Order

## Purpose
Defines the product strategy and build sequence for Z Fashion, the fashion,
footwear and cosmetics vertical of ZOS. This is a strategic document, not a
domain model — it reuses existing canonical ZOS concepts (Registry, Trust
Engine, Partner Quality Score, Marketplace) and introduces no new
architectural authority beyond what is flagged in
[`apps/fashion/docs/architecture/ZOS-ALIGNMENT.md`](../apps/fashion/docs/architecture/ZOS-ALIGNMENT.md).

## Scope
Client/Partner/Platform experience design, Corner and All Sale mechanics,
campaign model, priority order for the first build phases. Does not define
new Registry Entity types, schemas, or APIs — those belong in
`apps/fashion/docs/architecture/` and `packages/fashion-domain/` once
implementation starts.

## Central thesis
Z Fashion succeeds only if three interventants get a coherent deal at once:
the **Client** gets one cart across many stores; the **Partner** keeps control
of stock, pricing and brand identity; the **Platform** gets the trust and data
layer that makes the first two possible without becoming a competitor to its
own Partners.

## Priority order

### Phase 0 — Foundation (before any UI)
1. **Partner & Registry model** — extend `20-registry` with the Partner
   entity shape Fashion needs (categories sold, age segments served) without
   forking the Registry.
2. **Partner Quality Score gate** — decide whether Corner/All Sale eligibility
   reuses `40-partner-quality-score` unmodified or needs fashion-specific
   signals (open question in ZOS-ALIGNMENT.md) — resolve before onboarding
   the first real Partner.
3. **Minor-safe data policy** (`160-legal-and-compliance`) — non-negotiable
   before any Children/Youth catalog goes live.

### Phase 1 — Partner-facing (make supply possible)
4. Partner onboarding + catalog management (`fashion-partner` app).
5. Stock/price feed contract (`fashion-domain` package) — this is the
   contract every downstream feature depends on.
6. Corner configuration (branding, layout within platform constraints).

### Phase 2 — Client-facing (make demand possible)
7. Unified cart/checkout across Partners — the single highest-risk technical
   decision; see open question on a shared-platform Order primitive.
8. All Sale aggregation and filtering (segment × category × Partner).
9. Corner storefront rendering.

### Phase 3 — Growth mechanics
10. Campaign engine: Destaques, Saldos, Vendas Privadas, Novas Coleções.
11. Black Friday as the first full cross-partner seasonal event — deliberately
    sequenced last because it stresses every system above at once (catalog,
    cart, Partner payouts) and should not be the first time those systems meet
    real load.

## Interventant experience summary

| Interventant | Wants | Tension |
|---|---|---|
| Client | One cart, consistent policies, easy discovery, distinct Corners | Uniformity in transaction vs. richness in discovery |
| Partner | Own stock/pricing/brand, visibility, data, no platform competing with them | Shared reach vs. loss of control |
| Platform | Consistent trust/quality across Partners, unified data, sane monetization | Enough standardization to scale vs. not homogenizing Partners into commodities |

## Status
Draft

## Last Updated
2026-08-20
