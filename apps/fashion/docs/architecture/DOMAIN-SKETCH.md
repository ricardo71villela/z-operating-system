# Z Fashion — Domain Sketch (pre-implementation)

## Purpose
Consolidates every correction made during the Z Fashion design conversation
into one coherent entity sketch, before Phase 0 implementation starts. Not a
schema — a checkpoint to catch the next inconsistency before it becomes code.

## Entities and what each one owns

- **Partner** — the store/legal entity holding stock. Owns: pricing, stock
  levels, fulfillment, brand relationships it carries. Declares which
  Categories it operates in (taxonomy/eligibility only). Is **not** a Brand.
- **Brand** — a fashion/sportswear/leather-goods label. A Partner can be
  mono-brand (sells only its own Brand — a brand-direct Corner) or
  multi-brand (sells several Brands — a boutique/chain Corner). Brand lives
  on the **Product**, referenced, never duplicated per Product row (same
  discipline Geography already applies to Currency).
- **Category** — Clothing, Footwear, Sportswear, Accessories & Leather
  Goods, Cosmetics. Lives on the **Product**, not the Partner. **Multi-valued,
  not a single enum**: a genuine performance running shoe (designed and
  marketed for the activity, technical sole/upper) is legitimately both
  Footwear and Sportswear at once — but a casual/lifestyle sneaker that
  merely *looks* athletic is Footwear only, never Sportswear. Same for
  apparel: a technical running/ski jacket is Clothing and Sportswear; a
  casual jacket styled to look sporty is Clothing only. **Sportswear is
  defined by genuine athletic/technical purpose, never by aesthetic
  resemblance** — conflating "looks sporty" with "is Sportswear" is
  precisely the curation failure that would make Z Fashion's Sportswear
  category indistinguishable from a general streetwear rack, undermining
  the curation-over-price differentiation already identified against
  Decathlon in the competitive review.
  Modeling Category as a single field would force an arbitrary primary choice
  on products that genuinely span two — the same class of mistake already
  caught twice this conversation (Category-on-Partner, then Brand-on-Partner).
- **Product** — the unit that actually carries Category (multi-valued),
  Brand (single reference), size/segment attributes, and belongs to exactly
  one Partner (the stock owner).
- **Corner** — a Partner-scoped storefront view. Aggregates whatever
  Categories and Brands that Partner's catalog contains. One Partner, one
  Corner.
- **All Sale** — not a separate copy of the catalog. A cross-Partner *view*
  over every published Product, filterable by Segment × Category × Brand ×
  Partner. A Product published by a Partner is visible in its own Corner
  *and* in All Sale by default (see "Resolved" below) — Corner and All Sale
  are two lenses on the same underlying Product set, not two places a
  Partner uploads to separately.
- **Age Segment** — Children, Youth, Adults. Lives on the **Product**, same
  discipline as Category: **never inferred from size or appearance alone**.
  A children's-sized version of an adult product is not automatically
  eligible for the Children segment — genuine Children/Youth eligibility
  depends on the applicable safety certification and material compliance
  for that Category (EU toy-safety-adjacent standards for younger children's
  clothing hardware — drawstrings, small parts; EU Cosmetic Regulation
  Annex III age-based restrictions for Cosmetics aimed at under-3s in
  particular) — not on "it comes in a small size" or "it looks childlike."
  This is the same resemblance-vs-genuine-purpose principle just corrected
  for Sportswear, applied to the segment with real regulatory stakes
  (`160-legal-and-compliance`), not just a curation-quality stake.
- **Campaign** — Destaques, Saldos, Vendas Privadas, Novas Coleções, Soldes,
  Black Friday. A Product can be attached to zero or more active Campaigns
  independently of its Category/Brand/Partner. Soldes and Black Friday are
  distinct Campaign types (legal fixed-date vs. retailer-driven), not one
  generic "sale event" type — decided in MARKETS-AND-I18N.md.

## Relationship sketch

```text
Partner 1───* Product *───1 Brand
   │                        (Brand is optional-but-typical;
   │                         a Partner's own house label is
   1                         also just a Brand)
   │
Corner (1:1 with Partner)

Product *───* Category    (multi-valued tag, genuine purpose not resemblance)
Product *───* Age Segment (same discipline, real safety/cert stakes)
Product *───* Campaign    (zero or more active at once)

All Sale = view(Product) filtered by Segment × Category × Brand × Partner
Corner   = view(Product) filtered by Partner = this Partner
```

## Resolved: Corner-only vs. All Sale publication
Default is **both** — a published Product appears in its Partner's Corner
and in All Sale simultaneously; that is the baseline, not a Partner choice.
A Partner *may* mark a specific Product `cornerExclusive: true` to withhold
it from All Sale (e.g. a genuine timed exclusive drop) — opt-out, not
opt-in, so All Sale stays comprehensive by default and exclusivity is a
deliberate, visible exception rather than the norm.

## Resolved: Partner Quality Score per Category, not per Partner
A Partner selling across several Categories does not get one blended trust
score. Partner Quality Score is tracked **per (Partner × Category) pair** —
a Partner can be excellent in Footwear and unproven in Sportswear
simultaneously, and Corner/All Sale surfaces that distinction (e.g. a
category-specific rating badge) rather than one aggregate number hiding a
weak category behind a strong one. This also gives the Sportswear
genuine-purpose eligibility rule (above) a natural enforcement point: a
Partner's Sportswear-category score can weight in mis-tagged-as-Sportswear
disputes without touching their Footwear standing at all.

## Client-seat return policy: the Cosmetics exception
The Client-seat principle already established ("return policy is a Platform
contract Partners opt into, not Partner-configurable") has exactly one
category-driven carve-out that must be modeled explicitly, not treated as a
platform bug later: **opened/hygiene-sealed Cosmetics are legally exempt
from standard withdrawal-return rights** once the seal is broken (the
health/hygiene exemption under EU consumer-rights rules on distance
selling). This is not a Partner preference to configure — it is a
Category-level legal constraint that must ship in the Phase 0/2 returns
model from day one: the platform-guaranteed return policy applies uniformly
*except* where a Category itself carries a legal exemption, and Cosmetics is
the one Category in the initial catalog where that applies.

## Corrected: "Platform-guaranteed" return policy is not "free, unconditional, no-questions"
Consistency across Partners was the point of making returns a Platform
contract — that does not mean the contract is "wear it, then return it for
a full refund." EU distance-selling rules already draw this line: a
consumer may handle a product to the extent needed to establish its nature
and characteristics (the way one would in a physical store), but use beyond
that entitles the seller to deduct the resulting diminished value — the
Platform-guaranteed policy must encode that condition explicitly, not imply
unconditional acceptance. Concretely:

- Returned Products go through a **condition check** (tags/seal intact,
  unworn, original packaging where applicable) before a refund is issued —
  this is the Partner's protection, symmetric to the Client's protection of
  a uniform, predictable process.
- A Product returned in used/worn condition is not an automatic full refund;
  it triggers a **value-diminishment assessment** (partial refund or
  rejection), platform-adjudicated so Partners aren't individually forced
  into disputes with Clients over it.
- Return abuse (repeat "wardrobing" — buying, wearing once, returning) is a
  **Client-side trust signal**, tracked the same way Partner Quality Score
  tracks Partner trust — not modeled yet in this sketch, but flagged here so
  it isn't discovered as a gap after Phase 2 checkout ships.
- "Free return shipping" (who pays the shipping label) is a separate,
  independent decision from "is the return accepted" — the two get
  conflated easily and must not be, since a Partner or Platform could
  reasonably subsidize shipping while still enforcing condition checks.

## Status
Draft — supersedes scattered Category/Brand notes in README.md and
ZOS-ALIGNMENT.md; those stay as the narrative explanation, this is the
checkpoint.

## Last Updated
2026-08-20
