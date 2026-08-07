# ADR-0003 — Progressive convergence with ZOS v1.1

## Status
Accepted.

## Context

The Z Operating System architecture is now available and the earlier assumption
that Z Jobs had to invent a standalone platform foundation is no longer valid.
At the same time, Z Jobs already contains mature identity/organization, RLS,
employment-domain and migration work that should not be discarded.

## Decision

Z Jobs will converge progressively with the ZOS Architectural Constitution v1.1.

- Employment semantics remain in Z Jobs.
- Existing local IDs stay valid.
- Persons, organizations and geography can receive optional canonical Registry
  references before any physical extraction to a shared service.
- Domain-specific state machines remain independent; history mechanics are made
  consistent.
- Sourced facts are represented as Data Observations with provenance.
- Verification history is separated from the organization identity.
- Cross-system transport may use an integration outbox/message envelope, without
  introducing a universal semantic Event model.
- Shared code is promoted only after reuse is proven by another vertical.

## Consequences

Positive:
- no rewrite
- no destructive ID migration
- clear future ZOS cutover path
- better provenance and history
- fewer duplicated platform concepts over time

Costs:
- temporary compatibility columns/tables
- some projections remain duplicated while the shared ZOS runtime does not yet
  exist
- later migrations will be required to replace local platform primitives with
  shared ones
