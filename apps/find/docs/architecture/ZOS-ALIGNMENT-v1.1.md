# Z Find — ZOS Architectural Constitution v1.1 Alignment

## Status
Implemented as an additive, compatibility-preserving baseline.

## Architectural boundaries

### ZOS/shared authority candidates
- Person identity binding (without replacing Supabase Auth)
- Organisation identity binding
- Geography canonical references
- State/history mechanics
- Trust/verification primitives
- Data Observation + provenance primitives
- Integration transport/outbox mechanics

### Z Find domain ownership
- Property
- Development
- Representation
- Listing semantics
- Real-estate field taxonomy
- Property/development features
- Leads/enquiries
- Search semantics
- Partner marketplace configuration

## Constitution mapping

### 1. Platform & Domain Ownership Boundaries
Z Find keeps real-estate semantics local. Shared identities/capabilities are exposed through bridges rather than duplicated as new canonical records.

### 2. Registry & Canonical Identity
`properties`, `developments` and `organisations` retain their existing UUIDs. `registry_bindings` permits later attachment to a shared ZOS Registry without replacing those IDs.

`Listing` is intentionally NOT promoted to Registry identity. It remains a Marketplace projection of a `Representation`.

### 3. State, Lifecycle & History Governance
Separate state machines are preserved for Listing and Representation. Migration 0009 records their transitions independently. Verification has its own outcomes and history.

### 4. Registry Relationship Model
`representations` already implements the correct first-class relationship pattern: Partner ↔ Property/Development with its own status, temporal fields and database constraints.

### 5. Data Observation & Provenance
Migration 0010 introduces Data Sources, Metric Definitions, Observations and Evidence. Existing columns remain operational projections; observations are used when source/time/provenance matter.

### 6. Workflow & Pipeline Execution
The Geography Import Engine remains a Z Find bounded-context workflow. It keeps idempotency, review queues, change proposals, append-only history and rollback compensation. It is not promoted prematurely to a universal ZOS pipeline.

### 7. Integration & Interface Principles
Migration 0011 adds a technical outbox. It is explicitly transport infrastructure, not a universal semantic Event model.

## Compatibility rules
- No existing table is dropped.
- No existing UUID changes.
- `partners.trust_level` remains as a legacy UI projection while Trust truth migrates to `verification_assessments`.
- `zones_lite` remains a lightweight Marketplace search projection while it can optionally bind to canonical Geography.
- Supabase Auth remains unchanged; `identity_bindings` only creates a future ZOS Person bridge.
