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
  *and* in All Sale by default — Corner and All Sale are two lenses on the
  same underlying Product set, not two places a Partner uploads to
  separately (open question to confirm in Phase 1: whether a Partner can
  opt a specific Product out of All Sale while keeping it Corner-only, e.g.
  for an exclusive drop).
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

Product *───* Category   (multi-valued tag, not a single field)
Product *───* Campaign   (zero or more active at once)

All Sale = view(Product) filtered by Segment × Category × Brand × Partner
Corner   = view(Product) filtered by Partner = this Partner
```

## Open questions this sketch surfaces
- Sportswear eligibility rule (genuine athletic/technical purpose vs.
  aesthetic resemblance) needs to become an explicit, checkable rule in the
  Partner Quality Score or catalog-submission validation — not left as
  editorial judgment per listing, or it will drift the moment catalog volume
  grows past what curators can review by eye.
- Can a Product be Corner-only (opted out of All Sale) for exclusive drops,
  or is publication always both? Needs a Phase 1 decision before the
  catalog schema is final.
- Does multi-valued Category affect Partner Quality Score weighting (e.g. a
  Partner strong in Footwear but weak in the Sportswear side of the same
  product)? Deferred — flagged, not blocking Phase 0.

## Status
Draft — supersedes scattered Category/Brand notes in README.md and
ZOS-ALIGNMENT.md; those stay as the narrative explanation, this is the
checkpoint.

## Last Updated
2026-08-20
