# Z Mobility — ZOS Alignment v1.1

This repository implements the Z Mobility vertical against the ZOS Architectural Constitution v1.1.

## Domain boundary

Z Mobility owns automotive semantics. Shared ZOS concerns (identity, organizations, trust, audit, platform mechanisms) are referenced through explicit boundaries and are not reimplemented as automotive concepts.

## Canonical automotive identity

The canonical hierarchy is:

```text
Manufacturer → Brand → Model → Generation → Version → Vehicle
```

`variant` remains a legacy ingestion/database term. It maps to canonical `Version` without changing existing UUIDs. `public.automotive_versions` is a semantic compatibility view over `public.automotive_variants`.

A `Version` is an OEM product/configuration. A `Vehicle` is a concrete marketplace unit and may reference a Version.

## Registry vs Data

Registry tables identify automotive entities. Technical values are observations, not identity fields.

```text
OEM source → RAW/staging → Registry resolution → Observations → Resolved Projection
```

`ManufacturerOfficialRecord.technicalData` intentionally remains flexible at the RAW boundary. The Observation mappers convert scalar technical data into metric-keyed, source-aware observations.

## Provenance

Every observation can retain source, document URL/type/hash, parser version, external record ID, staging/import references, market/language, raw key/value and timestamps.

## Golden Records

`automotive_golden_records` and `automotive_golden_sources` are retained only for compatibility. They are no longer a second canonical identity or the target architecture.

The target read model is `automotive_resolved_profiles`, derived from `automotive_observations` through a versioned resolution policy. Conflicting observations are preserved.

## State and lifecycle

There is no universal automotive lifecycle. Import runs, staging, reconciliation, marketplace vehicles and verification retain separate state machines. Changes to staging state are recorded in `automotive_state_history`.

## Marketplace boundary

Supabase rows are infrastructure types. `src/services/vehicles.ts` maps them to the shared `MarketplaceVehicle` contract before UI components receive them. Legacy `verified` is treated only as a temporary UI projection until ZOS Trust becomes authoritative.

## Compatibility rules

1. Do not rename/drop `automotive_variants` during this migration.
2. Do not delete Golden tables until all readers use Observations/Resolved Profiles.
3. Do not let frontend components consume Supabase row types directly.
4. Do not add OEM-specific fields to canonical TypeScript contracts.
5. Do not collapse source disagreements during ingestion.
