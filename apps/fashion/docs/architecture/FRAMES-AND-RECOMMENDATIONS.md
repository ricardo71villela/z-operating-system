# Z Fashion — Frames & Recommendations

## Purpose
Defines the primary customer-facing frames (Homepage, Product Page, Corner,
All Sale) and the recommendation logic that connects them — specifically the
deliberate asymmetry between Product Page (same-Corner only, cross-sell for
the Partner) and All Sale (cross-Partner, complementary/similar, editorial).

## Frames

### Product Page
Shows the Product itself plus a recommendations panel (left rail or below,
platform-decided by viewport). **Recommendations are scoped to the same
Corner as the Product being viewed** — this is a deliberate Partner-seat
decision (Central Thesis: keep the Client engaged with this Partner's
assortment, the same way a physical boutique keeps you browsing its own
racks rather than sending you next door). This is the opposite of an
Amazon-style cross-catalog "customers also bought," and correctly so: Amazon
optimizes one global catalog; Z Fashion deliberately chose the Corner model
to preserve Partner identity, and the recommendation logic must be
consistent with that choice, not undermine it.

**Fallback rule (resolved, ethics-driven — see conversation record):** if
the Corner has fewer than a defined threshold of genuinely related products
(same Category intersecting the viewed Product's Categories), the panel
falls back to All Sale-style complementary/similar recommendations —
**but is relabeled**, never disguised as same-store. This exists for two
reasons, not one: it protects the Client from being misled about a
recommendation's origin, and it protects small/independent boutique
Partners (the priority acquisition tier for Sportswear and Accessories,
per Z-FASHION-COMPETITIVE-LANDSCAPE.md) from a structurally weak panel
purely because they have a thin catalog — the tier the whole Corner model
exists to serve should not be the tier most disadvantaged by it.

- Label when same-Corner: **"Mais desta loja"**
- Label when falling back: **"Também pode gostar"** (never reuses the
  same-Corner label — the label itself is the honesty mechanism, not a
  disclaimer buried elsewhere)
- Threshold is a tunable platform parameter, not hardcoded per Partner —
  starting default: 4 related products.

### Corner (per Partner)
The Partner's full storefront view (`corner()` in corner.js). Not itself a
recommendation surface — it *is* the destination the Product Page's
same-Corner recommendations point back into.

### All Sale
Cross-Partner discovery view (`allSale()` in corner.js), filterable by
Segment × Gender × Category × Brand × Partner. Recommendations here work in the
opposite direction from the Product Page by design: **complementary and
similar products across Partners**, functioning as a Destaques-adjacent
discovery opportunity rather than a single-Partner retention tool. "Similar"
uses the same genuine-Category-match discipline already established
(DOMAIN-SKETCH.md) — a product tagged Sportswear only surfaces alongside
genuine Sportswear, never resemblance-based matches.

### Homepage
Composition (top to bottom), each section justified by a decision already
made elsewhere in this document set rather than assumed:

1. **Hero** — an active Campaign takes priority over editorial content when
   one exists (`isActiveOn`, campaign.js); falls back to the lead Destaque
   otherwise. Time-boxed legal events (Soldes) and high-urgency retail
   events (Black Friday) are more relevant to a visiting Client than
   evergreen editorial, so they win the hero slot whenever active.
2. **Segment entry** — Baby / Children / Youth / Adults, four primary tiles,
   mirrors the structural navigation.
3. **Category strip** — Clothing, Footwear, Sportswear, Accessories &
   Leather Goods, Cosmetics (incl. Perfumes).
4. **Destaques** — editorial, cross-Partner curation carousel. Unpaid,
   never influenced by sponsorship — see "Sponsored Destaques" below for
   the paid counterpart, which lives in its own labeled slot, never mixed
   into this carousel.
5. **"Descubra as nossas lojas" (Corners directory)** — deliberately
   spotlights independent-boutique/artisan Partners, not a random or
   popularity-sorted list. This is not decoration: it is the same ethical
   principle already applied to the Product Page recommendation fallback
   (DOMAIN-SKETCH.md / this document's recommendations section) — if
   curation-over-price is the platform's actual differentiation against
   Decathlon-scale players (Z-FASHION-COMPETITIVE-LANDSCAPE.md), and small
   Partners are the priority acquisition tier for Sportswear and
   Accessories, the Homepage must give them structural visibility rather
   than leaving their exposure to chance inside All Sale.
6. **All Sale CTA** — "Ver tudo" entry point into the full cross-Partner
   catalog.
7. **Footer trust signals** — return-policy summary, professional-seller
   disclosure (already a Phase 2 legal requirement per DOMAIN-SKETCH.md).

**Deliberately excluded at launch: personalized/algorithmic recommendations
on the Homepage.** Two reasons, not one — it reinforces the curation-over-
price differentiation rather than competing on a recommendation-engine
arms race, and no personalization/browsing-history system is scoped
anywhere in the current roadmap; adding one here would be undocumented
scope creep into Phase 0.

## Sponsored Destaques (paid, day/week slots)
Resolved by explicit agreement, after flagging a real tension: paid
visibility is a legitimate monetization lever, but it directly conflicts
with the deliberate decision to give small/independent-boutique Partners
structural visibility (the Corners directory, the recommendation fallback)
precisely because they cannot outspend chains like JD Sports or Galeries
Lafayette on paid placement. The resolution keeps both intact rather than
picking one:

- **Physically separate slot.** Sponsored Destaques live in their own
  labeled section — never inserted into the unpaid editorial Destaques
  carousel unlabeled. The EU Omnibus Directive requires paid placement
  that affects ranking/prominence to be clearly disclosed to the consumer
  as such — this is a legal requirement, not just good practice, the same
  class of obligation already applied to the professional-seller
  disclosure duty.
- **Label:** "Patrocinado" / "Em Destaque" — distinct from the "Mais desta
  loja" / "Também pode gostar" labels used in Product Page recommendations,
  so a Client never confuses paid placement with either editorial curation
  or algorithmic cross-sell.
- **The Corners directory is never for sale.** No sponsorship product can
  buy placement there — it is the one Homepage section that exists
  specifically to counteract what paid visibility would otherwise erase.
- **Quality gate before the auction, not instead of it.** A Partner must
  clear a minimum Partner Quality Score (per DOMAIN-SKETCH.md's PQS-per-
  Category model) before being eligible to purchase a Sponsored Destaque
  slot at all — curation-over-price stays true even in the paid slot,
  rather than degrading into "whoever pays most wins" regardless of catalog
  quality.

## Implementation note
Recommendations are **computed, not stored** — the same discipline already
applied to Corner and All Sale (query functions over the existing Product
list, never a separate Recommendation entity or table). This keeps the
asymmetry a pure function of Category/Partner data already on Product,
with zero new storage surface.

## Status
Draft

## Last Updated
2026-08-20
