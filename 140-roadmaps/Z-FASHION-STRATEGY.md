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

## Stakeholder-pragmatic design (the architect's test)

Every structural decision below is checked from three seats before it is
accepted. If it fails any one of the three, it is not "done," regardless of
how elegant it is for the other two.

- **Client seat.** Does this make the basket, the return, or the discovery
  simpler — or does it just make our data model cleaner at the client's
  expense? A checkout that asks the client to think about which Partner they
  are buying from has failed this seat.
- **Partner seat.** Does this keep the Partner in control of stock, price and
  brand — or does it quietly turn them into an anonymous SKU feed? A Corner
  that looks identical to every other Corner has failed this seat.
- **Platform seat.** Does this scale without a linear increase in ops
  headcount per Partner or per market — or does every new country/Partner
  require bespoke engineering? A campaign engine that needs a developer to
  configure each Saldos event has failed this seat.

Pragmatic corollary: when two seats pull in opposite directions (e.g. Partner
wants a fully custom Corner layout, Platform needs consistent components to
scale), the resolution is *configuration within a shared component system*,
not *custom code per Partner* and not *forcing one visual template on
everyone*. This is the same trade-off Galeries Lafayette's own marketplace
already made (see below) — it is a proven pattern, not a hypothesis.

## Competitive analysis

| Player | Model | What it validates or warns |
|---|---|---|
| **Galeries Lafayette (marketplace)** | Department-store corners + a shared marketplace layer; >18% of GL.com revenue now comes from third-party sellers, ~330K active buyers, avg. basket ~€105 | Directly validates the Corner + All Sale hybrid — this is not a novel bet, it is a proven French model. Their seller requirement (match-or-beat GL's own shipping terms) is the kind of platform-level consistency rule Z Fashion should adopt for trust, without owning fulfillment itself. |
| **Printemps.com** | Curated marketplace, 500+ vetted brands, strict brand-selection policy, luxury-leaning | Confirms that *curation quality* (not catalog size) is what premium positioning is built on — relevant if Z Fashion wants to avoid competing purely on price against Shein/Amazon. |
| **Veepee (vente-privee)** | Time-limited flash-sale "events" pitched by sellers, not a permanent catalog; 30–70% off, tight per-unit margin, huge per-event volume | This *is* effectively our "Vendas Privadas" feature already proven at scale — worth studying their seller-pitch → approval → time-boxed-event workflow directly as a template for the Campaign engine (Phase 3). |
| **Zalando** | Pan-European aggregator with heavy owned logistics and warehousing | Warning, not a template: Zalando's moat is capital-intensive owned fulfillment. Z Fashion should stay asset-light (Partner-fulfilled) at least through the France launch — replicating Zalando's logistics stack is not a Phase 0–2 fight worth picking. |
| **Vinted** | P2P resale marketplace, currently the #1-trafficked fashion site in France | Different category (peer resale vs. professional Partner stock) — not a direct competitor for Z Fashion's launch scope, but its scale is a reminder that French shoppers already default to marketplace-style browsing over single-brand sites; that behavior works in Z Fashion's favor. |
| **Shein / fast fashion aggregators** | Price-first, high SKU churn | Explicitly not the fight to pick. Competing on price against Shein erodes exactly the Partner margin and brand identity that Z Fashion's Corner model exists to protect. |
| **La Redoute (Galeries Lafayette Group)** | Multi-brand, mobile-optimized, ~9M customers | Reinforces that mobile-first checkout is table stakes in this market, not a differentiator — budget for it accordingly, don't treat it as a Phase 3 nice-to-have. |

Net read: Z Fashion's Corner + All Sale + Vendas Privadas model is not
speculative — every piece already has a working proof point in the French
market (Galeries Lafayette, Printemps, Veepee respectively). The
differentiation is in doing all three *coherently in one platform*, and in
reusing ZOS's Registry/Trust/Quality-Score machinery so Partner onboarding is
cheaper than it is for any single-vertical competitor above.

## Launch market and international shape

France is the launch market, but — exactly as Z Find was designed in 6
languages while targeting 20 markets from day one rather than retrofitting
i18n later — Z Fashion's data model must treat locale, currency, tax regime
and size-grid conventions (EU/UK/US/kids' age-based sizing) as first-class
from Phase 0, not as a France-only assumption that gets generalized later.

Concretely, this means:

- **Reuse, don't rebuild**: geography/locale/currency primitives come from
  the shared ZOS layer (the same ones Z Jobs and Z Find already consume) —
  Z Fashion adds only what is genuinely fashion-specific (size grids per
  category/age-segment, care-label/composition data).
- **France-specific ≠ Fashion-specific**: French VAT rules, French consumer
  return-law minimums (`160-legal-and-compliance`) and French payment
  preferences are launch-market configuration, not hardcoded assumptions in
  the domain model — the same separation Z Find already applies per country
  in `apps/find/content/legal/<COUNTRY>/`.
- **Corner localization is a Partner concern, not a platform rebuild**: a
  Partner selling in France and later in Italy configures locale-specific
  copy/pricing on their existing Corner — it is not a new integration.

## Status
Draft

## Last Updated
2026-08-20
