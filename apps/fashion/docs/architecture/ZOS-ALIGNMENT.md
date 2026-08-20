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
- **Order/Cart primitive** — resolved as Fashion-owned for now, not
  promoted to a ZOS-level shared capability. No other current vertical
  (Z Find, Z Jobs, Z Mobility) needs a multi-seller cart — Z Find sells
  single properties, not multi-partner baskets — so there is no second
  consumer yet to justify shared-platform status, unlike Geography (which
  had one from day one). Built in `fashion-domain/src/cart.js`. If a future
  vertical needs the same multi-seller-split-settlement shape, promote then,
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
