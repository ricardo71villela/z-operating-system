# Z Fashion — Product Strategy & Priority Order

## Purpose
Defines the product strategy and build sequence for Z Fashion, the fashion,
footwear, sportswear, accessories/leather goods and cosmetics vertical of ZOS. This is a strategic document, not a
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
own Partners. See
[`Z-FASHION-COMPETITIVE-LANDSCAPE.md`](./Z-FASHION-COMPETITIVE-LANDSCAPE.md)
for why this is a proven shape (Miinto) rather than a novel bet, and
[`apps/fashion/docs/architecture/MARKETS-AND-I18N.md`](../apps/fashion/docs/architecture/MARKETS-AND-I18N.md)
for why "France-first" and "20-market platform" are the same architecture,
not two different roadmaps.

## Pragmatic view, one interventant at a time

**As the Client's advocate**, the architect asks: would I trust one cart
across three unknown boutiques I've never heard of? Miinto and Galeries
Lafayette both answer yes, empirically — but only because returns, sizing
and delivery promises are *platform-guaranteed*, not Partner-by-Partner. The
pragmatic conclusion: the Client-facing return policy is a Platform contract
Partners opt into, not a Partner-configurable field, even though pricing and
stock stay Partner-owned. Uniformity where it removes purchase anxiety
(returns, delivery SLA, size guidance); richness where it adds discovery
value (Corner identity, curation).

**As the Partner's advocate**, the architect asks: what is the one thing
that, if broken, makes a boutique quit day one? Not the storefront design —
the stock/price feed. Miinto's own onboarding friction confirms it: boutiques
don't churn because a Corner looks wrong, they churn because inventory goes
out of sync and they oversell. Pragmatic conclusion: the Partner stock feed
contract (Phase 1, item 5 below) is not just sequenced early, it needs a
tighter reliability bar than anything client-facing shipped before it —
better to launch with fewer Partners on a rock-solid feed than many Partners
on a shaky one.

**As the Platform's advocate**, the architect asks: where do we resist the
temptation to over-engineer for 20 markets before proving 1? Geography,
`names{lang}`, and Campaign-type modeling (Soldes vs. Black Friday as
distinct types) are cheap to get right now and expensive to retrofit — those
get built for scale immediately. Fulfillment logistics, multi-currency
settlement to Partners, and market-specific consumer-protection variants are
expensive to get right now and cheap to add market-by-market later — those
get deliberately deferred past France. This is the pragmatism test applied
to every item below: "is this cheap now, expensive later" earns early
investment; everything else waits for a second market to justify it.

## Priority order

### Phase 0 — Foundation (before any UI)
1. **Partner & Registry model** — extend `20-registry` with the Partner
   entity shape Fashion needs (categories sold, age segments served,
   `countryId` + operating `locales[]` from day one), without forking the
   Registry.
2. **Geography reuse decision** — promote `apps/find/packages/geography`
   to a shared `20-registry` capability, or fork it for Fashion. Given a
   second vertical needing the identical Country/Region/City/Zone/Currency
   shape on day one, reuse is the pragmatic default; forking needs an
   explicit reason on the table before Phase 1 starts.
3. **Partner Quality Score gate** — decide whether Corner/All Sale eligibility
   reuses `40-partner-quality-score` unmodified or needs fashion-specific
   signals (open question in ZOS-ALIGNMENT.md) — resolve before onboarding
   the first real Partner.
4. **Minor-safe data policy** (`160-legal-and-compliance`) — non-negotiable
   before any Children/Youth catalog goes live.
5. **Soldes vs. Black Friday as distinct Campaign types** — France's Soldes
   are legally fixed dates; Black Friday is not. Model them as separate
   types now (see MARKETS-AND-I18N.md) — cheap now, expensive to retrofit.

### Phase 1 — Partner-facing (make supply possible)
6. Partner onboarding + catalog management (`fashion-partner` app).
7. Stock/price feed contract (`fashion-domain` package) — this is the
   contract every downstream feature depends on, and per the competitive
   review the single highest-churn-risk item for Partners if it is unreliable.
8. Corner configuration (branding, layout within platform constraints).

### Phase 2 — Client-facing (make demand possible)
9. Unified cart/checkout across Partners — the single highest-risk technical
   decision; see open question on a shared-platform Order primitive. Return
   policy is Platform-guaranteed here, not Partner-configurable.
10. All Sale aggregation and filtering (segment × category × Partner).
11. Corner storefront rendering.

### Phase 3 — Growth mechanics
12. Campaign engine: Destaques, Saldos, Vendas Privadas, Novas Coleções —
    Soldes and Black Friday implemented as distinct Campaign types per
    MARKETS-AND-I18N.md, not a single generic "sale event."
13. Black Friday as the first full cross-partner seasonal event — deliberately
    sequenced last because it stresses every system above at once (catalog,
    cart, Partner payouts) and should not be the first time those systems meet
    real load.

## Interventant experience summary

| Interventant | Wants | Tension |
|---|---|---|
| Client | One cart, consistent policies, easy discovery, distinct Corners | Uniformity in transaction vs. richness in discovery |
| Partner | Own stock/pricing/brand, visibility, data, no platform competing with them | Shared reach vs. loss of control |
| Platform | Consistent trust/quality across Partners, unified data, sane monetization | Enough standardization to scale vs. not homogenizing Partners into commodities |

## Competitive analysis (France-specific players)

Full model-level analysis (owned-inventory vs. P2P resale vs. Partner
marketplace, and why Miinto is the direct precedent) lives in
[`Z-FASHION-COMPETITIVE-LANDSCAPE.md`](./Z-FASHION-COMPETITIVE-LANDSCAPE.md).
This table is the France-specific, player-by-player read:

| Player | Model | What it validates or warns |
|---|---|---|
| **Galeries Lafayette Marketplace** | Department-store Corners + shared marketplace layer; ~20% of galerieslafayette.com revenue comes from the marketplace, ~80 active professional sellers, 1,300+ brands, sellers required to match-or-beat GL's own shipping terms | Directly validates the Corner + All Sale hybrid as a proven French model, not a novel bet. Their seller shipping-parity rule is exactly the kind of platform-level trust rule Z Fashion should adopt without owning fulfillment itself. |
| **Printemps.com** | Curated marketplace, vetted-brand selection, luxury-leaning | Confirms *curation quality* (not catalog size) is what premium positioning is built on — relevant if Z Fashion wants to avoid competing purely on price against Shein/Amazon. |
| **Veepee (vente-privée)** | Time-limited flash-sale "events" pitched by sellers rather than a permanent catalog | Functionally close to the "Vendas Privadas" feature already proven at French scale — worth studying their seller-pitch → approval → time-boxed-event workflow as a template for the Campaign engine (Phase 3). |
| **Zalando** | Pan-European aggregator with heavy owned logistics and warehousing | Warning, not a template: Zalando's moat is capital-intensive owned fulfillment. Z Fashion should stay asset-light (Partner-fulfilled) at least through the France launch. |
| **Vinted** | P2P resale, one of the most-visited fashion sites in France (72M+ members Europe-wide) | Different category (peer resale vs. professional Partner stock) — not a direct competitor for launch scope, but confirms French shoppers already default to marketplace-style browsing over single-brand sites. |
| **Shein / fast-fashion aggregators** | Price-first, high SKU churn | Explicitly not the fight to pick — competing on price erodes the Partner margin and brand identity the Corner model exists to protect. |
| **Decathlon** | Vertically-integrated sportswear retailer, own-brand heavy, huge French footprint | Warning + opportunity: Decathlon dominates on price/own-brand for mass sportswear, so Z Fashion's Sportswear category should lean into multi-brand + specialist-boutique curation (running/climbing/cycling specialists) rather than competing on Decathlon's basics. |
| **La Redoute** | Multi-brand, mobile-optimized | Reinforces mobile-first checkout as table stakes in this market, not a differentiator — budget for it accordingly rather than treating it as a Phase 3 nice-to-have. |

Net read: Z Fashion's Corner + All Sale + Vendas Privadas combination is not
speculative — every piece already has a working French proof point
(Galeries Lafayette, Printemps, Veepee respectively). The differentiation is
doing all three *coherently in one platform*, segmented by Children/Youth/
Adults from the start (the gap identified in the competitive-landscape
review), and reusing ZOS's Registry/Trust/Quality-Score machinery so Partner
onboarding is cheaper than any single-vertical competitor above.

## Status
Draft

## Last Updated
2026-08-20
