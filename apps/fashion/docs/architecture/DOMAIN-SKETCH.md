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
- **Gender** — Female, Male, Unisex. Lives on the **Product**, single-valued
  (never multi, unlike Category): a garment/accessory targets one Gender or
  is explicitly marketed Unisex, it does not simultaneously target two
  Genders the way a running shoe genuinely spans two Categories. Owned by
  `product.js` itself, not `partner.js` — unlike Category and Age Segment, a
  Partner never declares which Genders it operates in (no compliance-gate
  question the way minor-safe data raises one for Age Segment); Gender is
  purely a Product classification, same shape as Brand. **Always explicit,
  never defaulted or inferred** from Category or Age Segment — the same
  never-inferred discipline already applied throughout this document.
- **Product** — the unit that actually carries Category (multi-valued),
  Brand (single reference), Age Segment (multi-valued, genuine-eligibility
  discipline), Names/Descriptions (`names{lang}` — see MARKETS-AND-I18N.md;
  a non-empty `fr` key is always required, other locale keys optional, same
  France-first-not-France-only discipline applied everywhere else), and
  belongs to exactly one Partner (the stock owner). **"Size"
  is not a universal Product field** — the same single-field mistake already
  caught for Category and Brand, just one layer deeper: Clothing/Footwear/
  Sportswear carry a genuine size (resolved via a canonical size-grid, per
  MARKETS-AND-I18N.md); Cosmetics (which explicitly includes Perfumes/
  Fragrances — same Partner profile, same regulatory framework, not a
  separate category) carries a *format/volume* (ml, shade) that
  is a different concept entirely, not a point on the same size scale; most
  Accessories & Leather Goods (bags, wallets) carry no size dimension at
  all, while a subset (belts, gloves) does. The Product schema must make
  this attribute **Category-conditional**, not a shared field every Product
  fills in or leaves blank.
- **Corner** — a Partner-scoped storefront view. Aggregates whatever
  Categories and Brands that Partner's catalog contains. One Partner, one
  Corner.
- **All Sale** — not a separate copy of the catalog. A cross-Partner *view*
  over every published Product, filterable by Segment × Category × Brand ×
  Partner. A Product published by a Partner is visible in its own Corner
  *and* in All Sale by default (see "Resolved" below) — Corner and All Sale
  are two lenses on the same underlying Product set, not two places a
  Partner uploads to separately.
- **Age Segment** — Baby, Children, Youth, Adults. Lives on the **Product**,
  same discipline as Category: **never inferred from size or appearance
  alone**. Baby is a distinct segment from Children, not a synonym for "very
  small child" — it carries its own safety-certification regime and its own
  size conventions (age-in-months rather than a shared grid; pre-walking
  Footwear is barely a real product line, unlike Children's), so collapsing
  it into Children would repeat the same single-field mistake this section
  keeps correcting, just at the segment boundary this time. A children's-sized
  version of an adult product is not automatically eligible for the Children
  segment — genuine Baby/Children/Youth eligibility depends on the applicable
  safety certification and material compliance for that Category (EU
  toy-safety-adjacent standards for younger children's clothing hardware —
  drawstrings, small parts — apply with extra weight to Baby; EU Cosmetic
  Regulation Annex III age-based restrictions for Cosmetics aimed at
  under-3s in particular, which is precisely the Baby segment's core age
  range) — not on "it comes in a small size" or "it looks childlike."
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
Product 1───1 Gender      (single-valued: female / male / unisex, always explicit)
Product *───* Age Segment (same discipline, real safety/cert stakes)
Product *───* Campaign    (zero or more active at once)

All Sale = view(Product) filtered by Segment × Gender × Category × Brand × Partner
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

## Client-seat return policy: the Cosmetics (including Perfumes) exception
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
unconditional acceptance.

**Legal grounding (EU Consumer Rights Directive 2011/83/EU, as amended by
the Omnibus Directive 2019/2161):** the 14-day right of withdrawal on B2C
distance sales is mandatory for the selling trader — a Partner has no
discretion to refuse it. The only exemptions are the closed Article 16 list
(custom/personalized goods, perishables, goods that deteriorate rapidly,
hygiene-sealed goods once unsealed, goods inseparably mixed with others,
etc.). None of Clothing, Footwear, Sportswear or Accessories/Leather Goods
qualify for any exemption; Cosmetics' hygiene-seal exemption (Article 16(e))
is the one genuine category-level carve-out in the initial catalog. "Return
policy is a Platform contract Partners opt into" is therefore not quite
right — Partners are not opting into anything, they are already bound to
this individually as traders; the Platform is standardizing *enforcement*
of an obligation, not granting Partners a choice they're waiving.

From **19 June 2026**, EU law additionally requires a visible digital
"withdrawal button" (new CRD Article 11a) in the online checkout / order-
management flow for any trader selling to EU consumers through a website or
app — a concrete Phase 2 compliance requirement for `fashion-web`, not
optional UX polish.

Concretely, beyond the legal minimum:

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

## Final pass: remaining gaps before Phase 0 is considered closed

- **Stock sync / oversell risk for omnichannel Partners.** Independent
  boutiques (the priority Partner tier for both Sportswear and Accessories,
  per the competitive review) typically also sell in a physical store —
  the same unit can be sold in-store while it's showing as available on
  Z Fashion. Miinto's own onboarding friction (flagged early in the
  competitive review) is exactly this failure mode. The stock feed contract
  (Phase 1, item 7) needs either near-real-time push updates or a checkout-
  time reservation/hold step, not a periodic batch sync — this is a
  reliability requirement, not just an integration nicety.
- **Pricing currency and FX risk allocation.** A Product's price is stored
  once, in the Partner's own operating currency (via the reused Geography
  `Country → Currency` chain — never duplicated per locale). When browsed
  from a different market, price is *displayed* converted at a periodic FX
  rate; the actual **settlement to the Partner happens in the Partner's own
  currency** — Z Fashion, not the Partner, absorbs FX timing risk between
  order and settlement. Getting this backwards (settling in the buyer's
  currency) would push currency risk onto small boutiques least able to
  hedge it, undermining the "Partner keeps control" principle established
  in the Central Thesis.
- **VAT: deemed-supplier exposure.** Under the EU VAT e-commerce package,
  a marketplace can become the deemed supplier — liable to charge and remit
  VAT itself rather than the underlying seller — under specific conditions
  (notably for non-EU sellers, or above certain facilitation thresholds).
  All Partners in the France launch are expected to be EU-established, which
  keeps Z Fashion outside deemed-supplier territory initially, but this
  must be re-checked the moment a non-EU Partner or a market outside the EU
  VAT area is onboarded — flagged for `160-legal-and-compliance`, not
  resolved here.
- **Marketplace trader-disclosure duty.** Since the Omnibus Directive
  amendments to the CRD, a marketplace must inform consumers, for each
  offer, whether the seller is a professional trader and whether EU
  consumer rights (including the withdrawal right already established)
  apply to that specific purchase. Every onboarded Partner is expected to
  be a professional trader, so this is a straightforward disclosure to
  surface in the Corner/product page, not a hard design problem — but it is
  a Phase 2 UI requirement, not optional copy.
- **Open by design, not a gap: duplicate listings across Partners.** If two
  Partners sell the identical product (same Brand, same model), All Sale
  shows two separate listings, one per Partner-Corner — it does **not**
  merge them into a single product page with multiple offers (no "Buy Box"
  concept). This preserves each Partner's own pricing, stock and Corner
  identity per the Central Thesis, at the cost of some catalog duplication
  in All Sale. Explicitly not revisited unless catalog volume later proves
  this creates real discovery friction — deliberate, not deferred out of
  oversight.

## Status
Draft — supersedes scattered Category/Brand notes in README.md and
ZOS-ALIGNMENT.md; those stay as the narrative explanation, this is the
checkpoint. This document is considered feature-complete for the
pre-implementation stage: further corrections belong in Phase 0/1 design
docs once real schema work starts, not as further edits here.

## Last Updated
2026-08-20
