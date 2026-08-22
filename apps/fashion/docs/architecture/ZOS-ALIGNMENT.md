# Z Fashion — ZOS Alignment

## Purpose
Declares how Z Fashion, as a new ZOS vertical, reuses existing canonical ZOS
domains rather than duplicating them, following the same pattern already
applied by Z Jobs and Z Mobility.

## Reused as-is from ZOS core
- **20-registry** — Partner is a Registry entity like any other adherent
  organization; no new registry type is introduced for "fashion store."
- **40-partner-quality-score** — Corner and All Sale eligibility are gated by
  the existing Partner Quality Score model, not a fashion-specific score.
- **30-trust-engine** — reviews, dispute handling and reputation reuse the
  existing Trust Engine rather than a parallel one.

## Extended by Z Fashion
- **50-marketplace** — Corner and All Sale are new marketplace presentation
  modes; the underlying Marketplace Model's listing/publication concepts are
  reused, not replaced.
- **60-data** — product catalog attributes (size grids, age segment, shade
  variants) are Fashion-specific data shapes layered on the shared Data Model.

## Net-new to Z Fashion (no ZOS precedent yet)
- Multi-partner unified cart/checkout spanning several Corners in one order.
- Campaign taxonomy: Saldos, Vendas Privadas, Novas Coleções, Black Friday.
- Minor-safe handling for the Children/Youth segments (age-appropriate
  content, guardian consent where applicable) — see `160-legal-and-compliance`.

## Open questions
- Should Partner Quality Score gain fashion-specific signals (return rate by
  size, image quality) as vertical-specific extensions, or stay generic?

## Resolved

- **Partner-facing Product/Brand API** — resolved 2026-08-21 (ponto 1 of
  the partner-side audit): `fashion-partner`'s API surface had been
  confirmed, by direct inspection, to cover only onboarding and single-
  Product stock updates — Product and Brand had rich domain validation
  (`product.js`, `brand.js`) with zero HTTP surface, meaning a real
  Partner could not put a single item up for sale through this API.
  Fixed by adding `POST /partners/:id/brands`, `POST /partners/:id/products`,
  `GET /partners/:id/products`, `GET /products/:id` — same dual-mode
  discipline as every existing endpoint (in-memory when `DATABASE_URL` is
  unset, real Postgres via `db.js` otherwise), same "domain validation
  runs before the DB ever sees the row" pattern `handleApplyPartner()`
  already established. `db.js` gained `insertBrand()`/`insertProduct()`/
  `listProductsForPartner()`/`getProduct()`, mirroring `insertPartner()`'s
  shape exactly.

- **Shipment & Return lifecycle** — resolved 2026-08-21 (ponto 2 of the
  "onde estamos" status review): `fashion.orders.status` had been a single
  global value (`confirmed`/`cancelled`) with no fulfillment progression at
  all, and no Return entity existed anywhere despite the 14-day policy and
  Cosmetics hygiene-seal exception both already being real rules
  (`isReturnEligible()`, product.js) with nothing to invoke them. Fixed by
  introducing two new state machines, same `ALLOWED_TRANSITIONS` +
  `transition()` + `history` pattern already established by onboarding.js:
  - `shipment.js` — one Shipment per Partner within an Order (the same
    unit `partnerSplits()`/cart.js already uses at checkout, carried
    forward into fulfillment): `confirmed → preparing → shipped →
    delivered`, cancellable only before shipping — once shipped, the
    Client-side remedy is a Return, never a Shipment cancellation.
  - `return.js` — one Return per Product, gated on `isWithinReturnWindow()`
    (14 days from the owning Shipment's `deliveredAt`, never from
    purchase) and `isReturnEligible()` (reused, not re-derived):
    `requested → approved/rejected → in_transit → refunded`.
  Both mirrored in SQL (`20260821230000_z_fashion_shipment_return_v1.sql`)
  as triggers enforcing the exact same transition graphs and eligibility
  checks, same dual-enforcement discipline as `attempt_checkout()` and
  `validate_campaign_discount()`.

- **Partner monetization (subscription + commission)** — resolved as a
  deliberate market-entry position below the two direct France precedents
  (Miinto ~16-20% + ~EUR98/month; Galeries Lafayette ~15% + ~EUR40-49/month,
  see Z-FASHION-COMPETITIVE-LANDSCAPE.md): first month free (subscription
  only — commission still applies from day 1, since it is charged only on a
  sale the Platform already facilitated), a EUR35/month subscription from
  month 2 onward, and category base commission rates (10-15%, lower for
  Sportswear/Cosmetics per their thinner real-world margins) reduced further
  by a volume-progressive discount and a Partner Quality Score discount,
  combined discount capped at 5 percentage points. Built in
  `fashion-domain/src/commission.js` and mirrored in SQL
  (`20260821170000_z_fashion_commission_v1.sql`,
  `fashion.effective_commission_rate()`), same dual-enforcement discipline
  as `cart.js`/`attempt_checkout()` and
  `campaign-pricing.js`/`validate_campaign_discount()` — rate tables are
  reference data (`fashion.commission_rates`,
  `fashion.volume_discount_tiers`, `fashion.partner_monetization_config`),
  not hardcoded in functions, so a rate change is a data update, not a
  migration.
- **Order/Cart primitive** — resolved as Fashion-owned for now, not
  promoted to a ZOS-level shared capability. No other current vertical
  (Z Find, Z Jobs, Z Mobility) needs a multi-seller cart — Z Find sells
  single properties, not multi-partner baskets — so there is no second
  consumer yet to justify shared-platform status, unlike Geography (which
  had one from day one). Built in `fashion-domain/src/cart.js`, **and now
  also in SQL** (`20260821160000_z_fashion_cart_checkout_v1.sql`,
  `fashion.attempt_checkout()`) — validated with the exact critical case
  from cart.js's own tests: two Partners in one Cart, one has enough
  stock, the other doesn't. The whole checkout fails, the first Partner's
  reservation is fully reverted (`quantity_reserved` back to 0), and no
  Order row is created at all. The SQL version needed no manual rollback
  code to achieve this — a single `RAISE EXCEPTION` inside the
  transaction unwinds every change made earlier in the same function
  call automatically, which is structurally safer than cart.js's
  hand-written rollback loop, not merely an independent re-check of it.
  If a future vertical needs the same multi-seller-split-settlement shape, promote then,
  following the exact precedent Geography already set — not before.
- **Geography reuse** — resolved as reuse, with one correction made along
  the way: `@zos/geography` (`packages/geography/geography.js`) is a
  **local JS fixture** used for domain-layer unit tests — it is not the
  real Geography. The actual canonical Geography lives in
  `zos.geography_locations` / `zos.geography_names` in the shared
  Supabase database (`infrastructure/supabase/migrations`), keyed by
  `country_iso` (ISO-3166-1 alpha-2), richer than the JS fixture's
  hardcoded Country/Region/City/Zone objects. `fashion.partners` (the
  real SQL table) uses `country_iso text`. **`partner.js` and
  `campaign.js` were updated to match this exactly** — both now take a
  `countryIso` (ISO-3166-1 alpha-2, e.g. `'FR'`) instead of the fixture's
  internal `countryId`, validated via a new `getCountryByIsoCode()`
  helper in `geography.js`, and `fashion-partner/src/server.js` no longer
  needs the string-hack bridge (`` `country_${iso.toLowerCase()}` ``) that
  existed only to paper over the mismatch. All tests updated and passing.
  Z Find and Z Fashion both ultimately read from the same
  `zos.geography_*` tables; the JS fixture is an offline mirror for fast
  unit tests, never the source of
  truth.
- **Partner-Brand-Category-AgeSegment shape** — fully resolved in
  DOMAIN-SKETCH.md and implemented across `partner.js`, `brand.js` and
  `product.js`, with the mono/multi-brand distinction computed from the
  catalog (`partnerBrandProfile` in `brand.js`), never stored on Partner.
  The equivalent SQL shape (`fashion.partners`, `fashion.category` /
  `fashion.age_segment` enums) is implemented and was verified against a
  real local Postgres instance — including the exact minor-safe-data gate
  as a database CHECK constraint, not only application-level validation.

## Status
Draft

## Last Updated
2026-08-20

## Database validation note
`20260821090000_z_fashion_database_foundation_v1.sql` was applied end-to-end
against a real local Postgres instance (stubbing only Supabase's `auth`/
`storage` schemas and roles, which aren't present outside a real Supabase
project) — every existing ZOS/Z Find/Z Jobs/Studio migration ran cleanly in
sequence, followed by this one, with no conflicts. Functional checks
confirmed the `fashion_partners_minor_safe_gate` CHECK constraint rejects
and accepts rows exactly like `onboarding.js`'s application-level gate does.
Not yet applied to the actual live/shared Supabase project — that requires
credentials this environment doesn't have.

## Product/Brand SQL validation note
`20260821110000_z_fashion_brand_product_v1.sql` was validated the same way
as the Partner foundation migration — applied end-to-end against local
Postgres, then exercised with 8 real INSERTs mirroring product.js's own
test cases: Sportswear without technical_purpose rejected, with it
accepted; Children-segment Clothing without safety_certifications
rejected, with it accepted; Cosmetics with size rejected, with format
accepted; a sized Category without size rejected; Accessories & Leather
Goods without size accepted (confirming it correctly falls outside the
sized-category constraint). All four CHECK constraints fired exactly once,
on exactly the case they were meant to catch.

## Campaign SQL validation note
`20260821120000_z_fashion_campaign_v1.sql` mirrors campaign.js's Soldes
legal-window rule using a `BEFORE INSERT/UPDATE` trigger against a new
`fashion.official_soldes_windows` reference table (CHECK constraints can't
query other tables). Validated with real inserts: the real 2026 winter
window (7 Jan – 3 Feb) is accepted, an invented date range is rejected, a
Soldes campaign missing country_iso is rejected, and Black Friday accepts
any date range since it carries no legal constraint. corner_configs was
also exercised for the first time with real inserts (byline over 140 chars
rejected, invalid hex color rejected, a valid config accepted) — closing a
gap where that table existed but had never been tested against real data.

## Stock SQL validation note (bug caught and fixed)
`20260821130000_z_fashion_stock_v1.sql` adds real row-level locking
(`SELECT ... FOR UPDATE`) inside `fashion.reserve_stock()` — the actual
mechanism, not available in the pure-JS stock.js, that protects against two
concurrent checkouts reserving the same last unit. Validation caught a real
bug: the stale-update trigger originally fired whenever quantity_available
changed for any reason, including `confirm_reservation()`'s legitimate
deduction on a completed sale — which doesn't touch last_updated_at at all
and was being wrongly rejected as "stale." Fixed by scoping the trigger to
only fire when last_updated_at itself is being asserted to a new value
(a genuine Partner feed push), never on reservation-driven changes. Full
8-step scenario validated after the fix: stale update rejected, fresh
update accepted, reservation reduces sellable without touching total stock,
over-reservation rejected, release frees units, confirm commits the
deduction without false-triggering staleness, and a subsequent real feed
update still works correctly afterward.

## Onboarding transitions & price-history SQL validation notes
`20260821140000_z_fashion_onboarding_transitions_v1.sql`: onboarding_status
could previously be set to any value via plain UPDATE — the state machine
only existed in onboarding.js. A trigger now mirrors ALLOWED_TRANSITIONS
exactly, including rejected as a terminal state. Validated all 7 cases:
applied→active (skipping a step) rejected, applied→under_review→approved→
active accepted in sequence, active→under_review (invalid reverse) rejected,
active→suspended accepted, and rejected→under_review rejected (terminal).

`20260821150000_z_fashion_price_history_v1.sql`: mirrors price-history.js
and campaign-pricing.js. Validated the same 3 cases as
campaign-pricing.test.js — a genuine 25% reduction below the real 30-day
low accepted, a price equal to the 30-day low correctly rejected as not a
genuine reduction, and a product with no price history in the window
rejected rather than falling back to a guess.
