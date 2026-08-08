# ADR-0001 — Align Z Find with ZOS Architectural Constitution v1.1

## Decision
Adopt ZOS v1.1 incrementally without rewriting Z Find or replacing working identities.

## Context
Z Find already implements strong concepts that match ZOS: Property/Development identity, first-class Representation, Marketplace Listing separation, Geography bounded context, provenance-aware import, human review and versioned history.

## Consequences
- Existing UUIDs and schema remain valid.
- Shared ZOS concepts are introduced through bridges/contracts.
- Listing remains a Marketplace object, not a Registry entity.
- Data Observation complements rather than replaces operational columns.
- Trust becomes an assessment/history concern rather than a boolean/string on an asset.
- No universal lifecycle or Event semantic model is introduced.
