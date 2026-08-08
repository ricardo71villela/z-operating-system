# Geography Implementation — Z Find

## Status
Implemented, tested, approved. Closes Phase 2.5.

## Approved Boundaries

Geography owns **only**: canonical place identity, administrative hierarchy, multilingual place names, location relationships, and currencies (referenced, never duplicated).

Geography explicitly **does not own**: market intelligence, lifestyle classification, investment scoring, editorial content, AI recommendations, market semantics. These remain future, independent bounded contexts built on top of Geography.

`geography.js` has **zero references** to `DB`, `Asset`, `Listing`, `Partner`, or any other context — verified programmatically before delivery (`grep -c '\bDB\.' geography.js` → 0). Marketplace, Registry, Data and Intelligence consume Geography; Geography consumes nothing.

## Entities and Responsibilities

| Entity | Fields | Responsibility |
|---|---|---|
| `Country` | `id, isoCode, defaultCurrencyId, names{lang}` | Root of the hierarchy; anchors default Currency |
| `Region` | `id, countryId, names{lang}` | **Optional** — not every country needs this layer (Portugal's fixture doesn't use it; France's does, via `region_idf`) |
| `City` | `id, countryId, regionId\|null, names{lang}, coordinates` | Minimum required level for any urban Asset |
| `Zone` | `id, cityId, names{lang}` | **Optional**, finest-grained level (e.g. a rural Land asset could reference a City directly) |
| `Currency` | `id, isoCode, symbol, decimalPlaces` | Referenced by Country, never duplicated per place |

## Public Functions (`geography.js`)

```
getCurrency(currencyId)      getCountry(countryId)
getRegion(regionId)          getCity(cityId)
getZone(zoneId)
resolveLocation(locationId)  → { zone, city, region, country, currency } | null
geoName(namesMap, lang)      → string, falls back to English if lang missing
locationLabel(locationId, lang) → "Zone, City" or "City" if no Zone
```

`locationId` accepts either a Zone id or a City id (Zone is optional).

## Dependency Rules

```
Registry, Marketplace, Data, Intelligence  ──consume──►  Geography
Geography  ──consumes nothing──
```

The only bridge point is `viewmodels.js`'s `resolveAssetGeography(asset, lang)` — the sole function in the codebase allowed to translate a Registry `Asset.locationId` into Geography data. No other file reaches into `GEOGRAPHY` directly.

## Subtype / Channel Rules

Two independent axes, never conflated (this was the Phase 2.5 audit's central finding):

- **`Asset.subtype`** (Registry-owned) — what the asset *is*: `apartment | villa | development | land`.
- **`Listing.channel`** (Marketplace-owned) — how it's *distributed*: `standard | offmarket`.

A villa can be `standard` or `offmarket`; the "Villas" search filter correctly returns both, distinguished by channel, not conflated into one field as before.

## Currency Resolution

Never hardcoded. Every price display resolves currency via: `Asset.locationId → Zone → City → Country → Currency.isoCode`, then `fmtCurrency(value, lang, currencyIso)`. Verified: Portugal and France both resolve independently to `EUR` through the same mechanism — proving the chain works, not proving currency divergence (both countries share the Euro; the mechanism itself doesn't hardcode that they must).

## Enquiry Policy Resolution

Order: `Listing.enquiryConfig` (if present, overrides) → `Partner.enquiryPolicy` (default) → safe fallback (`{direct:true, qualified:false, assisted:false}`). Only 3 of 7 listings carry an explicit override (Cedofeita, Land, Off-market villa); the rest inherit Z Imobiliária's default policy.

## Portugal and France Examples

```
Portugal: Country(PT) → City(Porto, no Region) → Zone(Boavista|Foz|Cedofeita)
                       → City(Matosinhos, no Region) → Zone(Matosinhos Sul)
France:   Country(FR) → Region(Île-de-France) → City(Paris) → Zone(Le Marais|Saint-Germain-des-Prés)
```

Both resolve currency to EUR via the identical `resolveLocation()` path. France's fixture includes one live asset (`asset_apt_paris_marais`) validated end-to-end: search, card, detail page, currency, and all 3 languages.

## Known Limitations

- Only PT/FR populated; a third, structurally different country (e.g. federal/Länder-style) not yet validated against the Region layer.
- `names{lang}` on Geography entities is open to any language code, but the UI itself still only ships PT/EN/FR — intentionally decoupled, not yet exercised beyond 3.
- No postal code / street-level granularity (Zone is the finest level) — out of scope per the approved design.
- Currency *conversion* (viewing a France listing's price in a non-EUR context) is explicitly not addressed — Geography resolves the *native* currency only.

## Tests Executed

**Node (logic):** Geography independence (0 `DB` references), dedup unchanged (Cedofeita: 2 representations → 1 listing), 7 total cards, currency resolution for both countries, subtype array filtering, channel filtering, free-text search matching country name, enquiry policy resolution (default + 3 overrides), PT (no Region) vs. FR (with Region) hierarchy resolution.

**Chromium headless (real browser, 15+ scenarios):** full navigation suite, France property page in all 3 languages, mobile viewport (7 pages, 0px horizontal overflow), zero console/page errors (only the expected Google Fonts 403 from sandbox network restrictions, unrelated to app logic).

**i18n:** 149 keys × 3 languages = 447 combinations checked, 0 missing — unchanged count from before Geography, confirming place names correctly stayed inside Geography's own `names{lang}` maps rather than leaking into `i18n.js`.
