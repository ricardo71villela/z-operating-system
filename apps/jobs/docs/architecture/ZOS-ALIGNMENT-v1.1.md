# Z Jobs — ZOS v1.1 Alignment

## Purpose

This repository remains the owner of the Employment domain. It is now prepared
for progressive convergence with the shared Z Operating System without requiring
a rewrite or prematurely moving business semantics out of Z Jobs.

The alignment follows the ratified **ZOS Architectural Constitution v1.1**:

1. Platform & Domain Ownership Boundaries
2. Registry & Canonical Identity
3. State, Lifecycle & History Governance
4. Registry Relationships
5. Data Observation & Provenance
6. Workflow & Pipeline Execution
7. Integration & Interface Principles

## Ownership boundary

### Strong candidates for shared ZOS ownership

- person identity
- organization identity and memberships
- geography / locale / currency primitives
- audit mechanics
- Registry references
- Data Observation / provenance mechanics
- integration transport mechanics

### Remain owned by Z Jobs

- candidate profile and professional history
- employer profile semantics
- job offers
- applications
- occupations
- salary references
- employment matching
- candidate scoring
- labor legislation and salary simulator rules
- employer responsibility metrics
- institution/employment-specific workflows

## Registry bridge

Migration `0027_zos_registry_bridge.sql` adds optional `zos_registry_id` fields
to persons, organizations and locations. Existing UUID primary keys are preserved.
This permits a later central Registry cutover without invalidating current rows,
foreign keys, RLS policies or application code.

Job offers and applications are deliberately not promoted to the shared Registry
here. They remain Employment-domain entities unless a future cross-vertical need
proves otherwise.

## Lifecycle / history

ZOS does not impose one lifecycle on every entity. Z Jobs keeps its existing,
distinct state machines for job offers, applications, reports and verification.

Migration `0028_state_and_trust_history.sql` adds durable history for job-offer
state changes and separate organization verification assessments. Existing
`company_profiles.verification_status` remains as the current operational
projection for compatibility.

## Data Observation / provenance

Migration `0029_data_observations_and_provenance.sql` introduces a local
implementation of the ZOS Observation primitive:

- subject identity (future Registry id or local bridge)
- metric
- value
- unit
- source
- observation time
- validity
- provenance method
- confidence
- supersession

This is appropriate for sourced employment data such as salary references,
legislation-derived metrics and market observations. It does not replace
Employment-domain entities or Trust assessments.

## Trust boundary

Verification is not treated as an intrinsic truth flag on an organization.
`organization_verification_assessments` records assessment history separately.
The existing verification status remains the UI/application projection until a
shared Trust Engine exists.

## Integration

Migration `0030_integration_outbox.sql` provides a transactional outbox-compatible
transport mechanism and a controlled enqueue RPC. It is intentionally called an
**integration message**, not a universal Event model. Domain meaning remains in
Z Jobs; the platform owns only transport mechanics.

## TypeScript compatibility package

`packages/domain/src/zos/` contains small compatibility primitives for:

- Registry references
- state-transition history
- Observations / provenance
- verification assessments
- integration messages

They are intentionally infrastructure-light and can later move into a shared ZOS
package if at least two verticals converge on the same implementation.

## Non-goals

This alignment does **not**:

- create a new universal lifecycle
- make every Jobs object a Registry entity
- turn Knowledge into a synonym for Data
- introduce a universal Event semantic
- remove current tables or IDs
- force a monorepo migration
- rewrite authentication, RLS or the existing API

The repository remains deployable as Z Jobs while becoming easier to connect to a
future shared ZOS platform.
