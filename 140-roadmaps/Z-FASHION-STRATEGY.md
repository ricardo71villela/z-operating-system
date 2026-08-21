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
Partners comply with, not a Partner-configurable field — and not
optional in the first place: under EU Consumer Rights Directive 2011/83/EU
(as amended by the Omnibus Directive 2019/2161), the 14-day right of
withdrawal on B2C distance sales is mandatory for the Partner as the
selling trader, with no discretion to opt out, except the closed Article 16
exception list (custom/personalized goods, perishables, hygiene-sealed
goods once unsealed, inseparably-mixed goods, etc.) — Clothing, Footwear,
Sportswear and Accessories/Leather Goods carry no such exception; Cosmetics'
hygiene-seal exemption (already modeled) is the one category-level
carve-out that actually exists in law. The Platform isn't asking Partners
to accept a policy; it is standardizing enforcement of an obligation each
Partner already carries individually. From 19 June 2026, EU law additionally
requires a visible digital "withdrawal button" (CRD Article 11a) in the
checkout/order-management flow — a concrete Phase 2 compliance item, not
just a UX nicety. Uniformity where it removes purchase anxiety
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
   Registry. Category and Brand both live on the **Product**, not the
   Partner — a Partner declares the set of Categories it operates in (many
   span several: a brand selling clothing, footwear and bags together is
   the common case), and a Partner can be mono-brand (a brand selling
   direct) or multi-brand (a boutique selling several brands, e.g. the
   JD Sports/Miinto shape already validated in the competitive review) —
   its Corner aggregates whatever Categories and Brands its catalog
   actually contains.
2. **Geography reuse — done.** `apps/find/packages/geography` promoted to
   `packages/geography` (`@zos/geography`); `partner.js` requires it
   directly and validates `countryId` against it. No longer open.
3. **Partner Quality Score gate** — decide whether Corner/All Sale eligibility
   reuses `40-partner-quality-score` unmodified or needs fashion-specific
   signals (open question in ZOS-ALIGNMENT.md) — resolve before onboarding
   the first real Partner.
4. **Minor-safe data policy — done.** See
   `160-legal-and-compliance/Z-FASHION-MINOR-SAFE-DATA.md` and the
   `minorSafeDataAcknowledged` gate enforced in `partner.js`.
5. **Soldes vs. Black Friday as distinct Campaign types** — France's Soldes
   are legally fixed dates; Black Friday is not. Model them as separate
   types now (see MARKETS-AND-I18N.md) — cheap now, expensive to retrofit.

### Phase 1 — Partner-facing (make supply possible) — done
6. **Partner onboarding — done.** State machine in `onboarding.js`:
   `applied → under_review → approved/rejected → active ⇄ suspended`.
   Activation is gated, not a checklist someone could skip: requires a
   declared feed reliability tier (`live`/`degraded`, never defaulted) and
   re-checks the minor-safe acknowledgment for Children/Youth Partners at
   the moment of activation, not just at Partner creation.
7. **Stock/price feed contract — done.** See `STOCK-FEED-CONTRACT.md` and
   `fashion-domain/src/stock.js`: stale-update rejection (protects a fresher
   in-store sale from being undone by out-of-order delivery) and
   checkout-time reservations with expiry (the actual oversell-prevention
   mechanism between Partner feed pushes) — both implemented and tested.
8. **Corner configuration — done.** `corner-config.js` encodes the
   "configuration within a shared component system" corollary by
   construction: the schema (displayName, byline capped at 140 chars,
   one accent hex color, logoUrl) is the entire customizable surface —
   there is no field for custom layout or markup, so Partner brand
   identity and Platform component consistency are both protected by what
   the schema simply doesn't expose.

### Phase 2 — Client-facing (make demand possible)
9. **Unified cart/checkout across Partners — done.** `cart.js`:
   `attemptCheckoutReservation` reserves stock across every Partner a Cart
   touches, all-or-nothing — if any item fails, every reservation already
   made in that attempt is released, and no partial state is ever returned
   to the caller. This was the single highest-risk decision in the project;
   see ZOS-ALIGNMENT.md "Resolved" for why it stays Fashion-owned rather
   than promoted to a ZOS-level primitive. Return
   policy is Platform-guaranteed here (consistent process, not free/
   unconditional — see DOMAIN-SKETCH.md), not Partner-configurable.
10. All Sale aggregation and filtering (segment × category × Partner) —
    done in Phase 0 (`corner.js`'s `allSale()`).
11. **Corner storefront view model — done; visual rendering — not started.**
    `corner-page.js` assembles the view model a Corner page needs (header
    from CornerConfig, categories present, mono/multi brand profile,
    product cards with resolved Brand names) from existing domain records —
    same bridging-function pattern Z Find's `viewmodels.js` already
    established, not a new concept. This is domain logic that decides *what*
    a Corner page should show, not the HTML/React that actually renders it —
    `apps/fashion-web` (README's proposed repository structure) does not
    exist yet in any branch as of 2026-08-21. Do not read "done" here as
    "a customer can open a Corner page" — that remains Phase 2's open item.
    `cornerExclusive` products are already correctly scoped in the view
    model (rendered on the Corner page; excluded from All Sale), so the
    only remaining work is the rendering layer itself, not further domain
    design.

### Phase 3 — Growth mechanics
12. **Campaign engine — pricing legality done.** `price-history.js` and
    `campaign-pricing.js`: every advertised Campaign discount is validated
    against a genuine 30-day reference price (EU Omnibus Directive,
    transposed in France since 28 May 2022) — a Partner cannot inflate the
    "before" price to fake a bigger discount, because the reference is
    computed from actual price history, never taken from Partner input.
    This applies to every Campaign type with a reduction (Saldos, Black
    Friday, Vendas Privadas alike), not just Soldes. Campaign types
    themselves (Destaques, Saldos, Vendas Privadas, Novas Coleções) were
    already done in Phase 0 (`campaign.js`) — Soldes and Black Friday as
    distinct types per MARKETS-AND-I18N.md, not a single generic "sale
    event."
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
