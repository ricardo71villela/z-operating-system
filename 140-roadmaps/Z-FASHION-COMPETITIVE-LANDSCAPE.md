# Z Fashion — Competitive Landscape

## Purpose
Grounds the Z Fashion architecture in what already exists in the market, so
we borrow proven mechanics instead of re-deriving them, and spend design
effort only where a real gap remains.

## The three models already in the market

### 1. Owned-inventory fast fashion (Zalando, ASOS, La Redoute, Amazon Fashion)
Buy or consign stock centrally, own the warehouse, own the brand
relationship. Massive selection, fast delivery, no Partner identity —
the retailer *is* the brand the customer trusts. Not our model: Z Fashion
never holds stock, so we cannot compete on Zalando's logistics scale and
should not try to.

### 2. Peer-to-peer resale (Vinted, Vestiaire Collective, The RealReal)
Individuals list used items; the platform earns on buyer fees or
authentication services. Strong on trust-for-secondhand and circularity, weak
on "new season" discovery. Not our model, but Saldos/private-sale mechanics
can borrow their buyer-trust patterns (condition disclosure, protection
guarantees) if Z Fashion ever adds a resale layer later.

### 3. Independent-boutique marketplace (**Miinto** — the direct precedent)
This is the closest existing analog to what was described for Z Fashion, and
it validates three architectural decisions rather than leaving them as open
questions:

- **No central stock, ever.** Miinto explicitly does not hold inventory;
  boutiques ship from their own store. Confirms Z Fashion's Partner-owned
  stock model is not a compromise, it is the proven shape of this business.
- **Commission only on sales the platform actually generates.** No listing
  fees, no shelf fees. This is what makes Partners willing to keep pricing
  control — directly informs the Phase 1 monetization decision.
- **The integration layer is the real product, not the storefront.** Miinto's
  onboarding friction is POS/catalog connection (they lean on third-party
  integrators — Tradebyte, Cymbio — because boutiques won't hand-build
  feeds). This reprioritizes our own roadmap: the Partner stock/price feed
  contract (already Phase 1, item 5) is the highest-risk item in the entire
  project, not the checkout or the storefront.

Miinto also demonstrates the Corner concept works at scale (1,800+ partner
boutiques, own digital storefront per boutique) and that department-store
concession curation (luxury + premium + entry brands side by side) is a
viable assortment strategy — supports keeping Corners *and* All Sale as
parallel, not competing, discovery paths.

### Adjacent luxury-corner precedent
Galeries Lafayette and Printemps run the physical version of exactly the
Corner model online-first Z Fashion is proposing — brand-run concession,
shared checkout, shared loyalty. Confirms the physical intuition behind
Corners translates directly online; no need to invent new vocabulary for
Partners who already understand "having a corner."

## What nobody in this list does well
None of Zalando/ASOS/Vinted/Miinto explicitly segments **Children, Youth,
Adults as a first-class navigation axis** across clothing + footwear +
cosmetics together — most either specialize in one category (fashion-only,
or resale-only) or bolt "kids" on as a filter, not a segment. This is the
one place Z Fashion can differentiate on structure, not just on the
Partner-marketplace mechanic it borrows from Miinto.

## Sportswear: partners, not just competitors

Sportswear needs its own partner-sourcing read, separate from the general
fashion competitive analysis above, because the sportswear retail landscape
in France splits into three tiers that map to very different roles for
Z Fashion — competitor, big Corner tenant, or the boutiques the model is
actually built for.

| Tier | Examples | Role for Z Fashion |
|---|---|---|
| Mass multi-sport retailers | Decathlon, Intersport, Go Sport | **Competitors, not target Partners.** Own-brand heavy, price-led, already have their own massive direct e-commerce reach — a Corner offers them little Z Fashion doesn't already give them, and their scale would drown smaller Partners in All Sale if onboarded. |
| Multi-brand sneaker/streetwear chains | JD Sports, Foot Locker, Courir, Chausport | **Plausible large Corner tenants.** Multi-brand (Nike/adidas/New Balance/Jordan), strong footfall, French presence (JD Sports alone runs 130+ stores in France) — a Corner here brings volume and legitimizes the Sportswear category quickly, but negotiating power skews toward them, not Z Fashion, given their size. |
| Independent single-sport specialist boutiques | Running (i-Run-style), cycling, climbing, triathlon specialists | **This is the real Miinto-shaped opportunity.** Small, expert-curated, no meaningful e-commerce reach of their own, exactly the profile that benefits most from a Corner + shared checkout — same thesis as the fashion boutiques the whole Z Fashion model is built for. Prioritize this tier for the first Sportswear Partner cohort. |
| Brand-direct (DTC) | Nike, adidas, Patagonia, New Balance | **Long-term Corner candidates, not launch-priority.** Brands increasingly value marketplaces as a genuine channel (confirmed in the Miinto luxury-brand pattern above), but they typically want proven traffic before committing — approach after the specialist-boutique cohort has demonstrated volume. |

Practical read for Phase 1 Partner onboarding (item 6 in the priority order):
sequence Sportswear Partner acquisition **specialist boutiques first**, not
the big chains — it is both the more defensible position against Decathlon's
price dominance (curation over price, same logic already applied to general
fashion above) and the tier where Z Fashion's Corner model creates the most
value the Partner couldn't get alone.

## Accessories & Leather Goods: partner landscape

Same tiering logic as Sportswear, applied to bags, wallets, belts and small
leather goods:

| Tier | Examples | Role for Z Fashion |
|---|---|---|
| Department-store corners | Galeries Lafayette, Le Bon Marché ("Espace Maroquinerie") | **Direct Corner precedent, not a Partner target itself.** These are department stores, not onboardable Partners — but they prove the category deserves its own dedicated space, exactly the argument for giving it its own Category rather than burying it inside Clothing. |
| Mid-market multi-brand e-tailers | Gandy, Stalric, Beausoleil Maroquinerie | **Plausible Corner tenants.** Already multi-brand online specialists (Lancel, Lancaster, Mac Douglas, Longchamp), proven e-commerce operators — bring immediate catalog depth but, as with the Sportswear chains, negotiate from an established online position of their own. |
| Independent artisan ateliers | Small Made-in-France leather workshops, several holding the EPV ("Entreprise du Patrimoine Vivant") craftsmanship label | **The Miinto-shaped opportunity here too.** Small production runs, strong craft story, little to no e-commerce reach of their own — the exact profile a Corner + shared checkout benefits most, and a strong editorial-Destaques fit given the craftsmanship narrative. |
| Luxury/designer brand-direct | Longchamp, Lancel and similar house brands | **Corner candidates once volume is proven**, same logic as Sportswear's brand-direct tier — approach after the artisan/mid-market cohort is live. |

Practical read: prioritize independent artisan ateliers for the first
Accessories & Leather Goods cohort, the same sequencing decision already
made for Sportswear above — it is the tier structurally most dependent on
what a Corner uniquely offers, and the craftsmanship story is strong
editorial material for Destaques from day one.

## Status
Draft

## Last Updated
2026-08-20
