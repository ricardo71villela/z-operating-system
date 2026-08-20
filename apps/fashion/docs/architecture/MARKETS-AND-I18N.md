# Z Fashion — Markets & Internationalization

## Purpose
Defines how Z Fashion launches in France while being architected, from day
one, as the international platform ZOS already knows how to build — Z Find
shipped with a Geography model designed for multiple languages and is
targeting operation across some 20 markets. Z Fashion reuses that same
shared-platform capability instead of building its own geography/locale
layer.

## Decision: reuse Z Find's Geography package, do not fork it

`apps/find/packages/geography` already implements, tested and approved:
`Country → Region (optional) → City → Zone (optional)`, with `names{lang}`
multilingual place names and currency resolved once per Country and never
duplicated per place. It explicitly owns *only* place identity and
currency — not market intelligence, not editorial content — which is exactly
the boundary Z Fashion needs and nothing it needs to redefine.

This is the strongest concrete argument, in the whole Z Fashion effort so
far, for promoting Geography to a true `20-registry`/shared-platform
capability rather than leaving it inside `apps/find`: a second vertical
needing the identical Country/Region/City/Zone/Currency shape, on day one of
its own design, is the exact signal the open question in
`ZOS-ALIGNMENT.md` was watching for.

## France-first, not France-only

Launch scope: France. But every catalog, campaign and Corner data shape must
carry a `locale`/`countryId` from the first schema, not bolted on later —
the same discipline Z Find applied when its France fixture (Paris, Île-de-
France) was built through the identical `resolveLocation()` path as
Portugal, proving the mechanism rather than assuming Portugal and France
would always match.

Concretely, for the Phase 0/1 work already sequenced in
`Z-FASHION-STRATEGY.md`:
- **Partner entity** (Phase 0, item 1) carries `countryId` and operating
  `locales[]` from creation — a Partner is never "just French," it is French
  today, extensible tomorrow.
- **Product catalog** (Phase 1, item 5) stores `names{lang}` and
  `descriptions{lang}` per the Geography convention, sized fields, not
  free-text blobs that only work in one language.
  This includes clothing/footwear/sportswear sizing, which is not just
  translation — size charts differ by country (FR 38 ≠ IT 44 ≠ US 8 for the
  same garment) and must resolve through a canonical size-grid concept, not
  a lookup table per Partner. Sizing is itself Category-conditional (see
  DOMAIN-SKETCH.md): Cosmetics uses format/volume, not a size grid; most
  Accessories & Leather Goods carry no size dimension at all.
- **Campaign calendar** (Phase 3): Black Friday and Soldes are not the same
  event. France's `Soldes` are legally fixed government-set dates twice a
  year; Black Friday is a retailer-driven US import now observed
  EU-wide. The Campaign model must represent both as distinct types with
  independent scheduling rules, not one generic "sale event" — conflating
  them would break compliance the moment a second market with different
  Soldes-equivalent rules (or none at all) is added.

## What France requires that is genuinely France-specific (not deferred)
- Size-grid localization (FR sizing as the initial canonical grid, mapped to
  other systems as markets are added — do not hardcode FR as "the" size).
- Soldes compliance (fixed legal sale windows) as its own Campaign type from
  day one, since retrofitting legal-date logic later is expensive.
- French consumer-protection return-window rules (`160-legal-and-compliance`)
  for the Children/Youth segments in particular.

## What must NOT be France-specific, even at launch
- Currency handling — resolve through Geography's `Country → Currency` chain,
  never hardcode EUR in Fashion's own code even though France is EUR.
- Partner and catalog data shapes — `names{lang}` from the first migration,
  even with only `fr` populated initially, the same way Z Find shipped PT/EN/
  FR structurally before all three were fully exercised.
- Campaign taxonomy — Soldes and Black Friday as named types now, so a third
  market's own legal sale window (Italy's *saldi*, for instance) is a new
  Campaign type, not a schema change.

## Status
Draft

## Last Updated
2026-08-20
