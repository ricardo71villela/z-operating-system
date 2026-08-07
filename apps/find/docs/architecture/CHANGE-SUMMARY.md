# Phase 2.5 — Change Summary

No git repository backs this prototype (single-file HTML delivery). This is a structural change summary in place of a git diff.

## New file
- `geography.js` (+143 lines) — the Geography bounded context, fully independent.

## Modified files

**`db.js`**
- `locations: {...}` object (4 informal entries) → REMOVED entirely.
- Every `asset.locationId` migrated from `loc_*` → `zone_*` (Geography reference).
- `asset.subtype` ADDED to every Property/Development/Land asset.
- `listing.category` → REMOVED. `listing.channel` ADDED (`'standard'|'offmarket'`).
- `partner.enquiryPolicy` ADDED to both partners (default enquiry config).
- `listing.enquiryConfig` REMOVED from 3 listings where it now matches the partner default (kept only as override on 3 that differ).
- France fixture ADDED: 1 asset, 1 representation, 1 listing, content (en/pt/fr), observations.

**`viewmodels.js`**
- `getPropertySubtype()` REMOVED (subtype is now a stored field, not derived).
- `resolveAssetGeography(asset, lang)` ADDED — the sole Geography-consuming function.
- `fmtCurrency(value, lang)` → `fmtCurrency(value, lang, currencyIso)` — signature changed, no hardcoded `'EUR'` in the call path.
- `getListingCardViewModel`, `getPropertyDetailViewModel`, `getDevelopmentDetailViewModel`, `getLandDetailViewModel`: `DB.locations[...]` lookups → `resolveAssetGeography(...)`.
- `searchCards`: `category` param → `subtype` (string or array) + `channel`.
- `getEnquiryConfig`: single-source lookup → 3-step resolution (Listing → Partner → fallback).

**`app.js`**
- `pillFilterToQuery` / `currentPillForQuery` / `submitHomeSearch`: rewritten for the subtype/channel two-axis model.
- `renderHome`: `card.category` → `card.subtype` for the land-section split.
- `renderProperty` / `renderDevelopment` / `renderLand`: every `vm.location.*` reference → `vm.geo.*`; country label added to hero eyebrow lines.

**`browser_test.js`**
- Villa-filter expectation: 1 → 2 (subtype/channel independence now correctly returns both the standard and off-market villa).
- All-results / partner-portfolio expectations: 6 → 7 (France asset added).
- One stale `{category:'land'}` call fixed to `{subtype:'land'}`.

## Unchanged files
- `i18n.js` — 0 new keys required (Geography names live in Geography's own `names{lang}`, not i18n.js).
- `css_block.txt`, `head_top.txt` — no changes.

## Untouched bounded contexts
Registry, Marketplace, Trust Engine, Data, Intelligence — no changes to their approved models. Only the Z Find product-layer fixture (`db.js`) and its view-model consumption changed.
