# ARCHIVED — Data Import Engine v1 (Proof of Concept)

**Status: Superseded. Do not use for new work.**

This is the original Phase 3 proof-of-concept implementation of the Data Import Engine. It is preserved here for historical traceability, not as an active codebase.

## Why archived, not deleted

Every architectural lesson learned while building this version fed directly into the hardened v2 (`packages/import-engine/`) — the review workflow, the versioned canonical store, the matching policy, and the Geography Port were all designed in direct response to gaps found here. Deleting it would lose that traceable lineage.

## Why superseded

v1 auto-applied uncertain reconciliation matches (alternate-code and geometry-only matches) and had no review workflow, no batch lifecycle state machine, no rollback mechanism beyond a documented limitation, and a flat (non-versioned) canonical store. v2 corrects all of these — see `docs/adr/` for the specific decisions.

## Do not

- Do not extend this version.
- Do not reference it from any new code.
- Do not treat its test suite (`test.js`, 42 passing) as current coverage — it tests v1's now-superseded behavior, not v2's.
