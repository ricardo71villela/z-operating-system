# Z Find — ZOS v1.1 Implementation Baseline

## Purpose
This baseline aligns Z Find with the ratified ZOS Architectural Constitution v1.1 without a destructive rewrite.

## What changed

### Registry / Identity
- Existing Property, Development, Organisation and Partner IDs are preserved.
- Migration `0008` adds compatibility bindings to a future shared ZOS Registry.
- Migration `0013` bridges Supabase application profiles to future ZOS Person identity.

### State / Lifecycle / History
- Listing and Representation keep separate state machines.
- Migration `0009` adds durable transition histories and baseline snapshots.

### Trust
- Verification truth is represented through `verification_assessments`.
- `partners.trust_level` remains a compatibility/UI projection only.

### Data / Provenance
- Migration `0010` adds Data Sources, Metric Definitions, Observations and Evidence.
- Existing columns remain the current operational read model.

### Relationships
- `representations` remains the canonical first-class Z Find authority relationship between Partner and Property/Development.

### Geography
- `zones_lite` remains a Marketplace/search projection.
- Migration `0012` adds an optional canonical Geography binding.
- The Geography import engine stays a bounded-context workflow and is not prematurely promoted to a universal ZOS pipeline.

### Integration
- Migration `0011` adds a transactional outbox foundation.
- Integration messages are transport contracts, not a universal semantic Event model.

## New domain contracts
`packages/zfind-domain/` contains dependency-free JavaScript contracts for:
- Registry references
- independent state machines
- Data Observations
- Trust assessments
- Marketplace Listing projections
- Integration message envelopes

## Validation
`npm run check` passed in the audit environment:
- Import Engine v2: 55/55
- Import Engine v1 regression: 42/42
- SEO generator: 28/28
- ZOS alignment: 6/6
- JS syntax: 71 files
- migrations: 13 sequential/additive

See `docs/architecture/VALIDATION-ZOS-v1.1.md` for environment-limited gates.
