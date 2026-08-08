# Principles

## Purpose
Defines the non-negotiable principles that govern every domain of the Z Operating System. These are not slogans — each one below is defined precisely enough to be checked against, and every domain's decisions should be traceable back to one or more of these principles.

## Scope
System-wide operating principles. Does not cover domain-specific rules (e.g. deduplication logic belongs in `50-marketplace`, not here) — only the principles those rules must respect.

## Table of Contents
- [Source of Truth](#source-of-truth)
- [Explicit Ownership](#explicit-ownership)
- [Traceability](#traceability)
- [Provenance](#provenance)
- [Separation of Concerns](#separation-of-concerns)
- [Domain Boundaries](#domain-boundaries)
- [Controlled Evolution](#controlled-evolution)
- [Human Accountability](#human-accountability)
- [Privacy by Design](#privacy-by-design)
- [Security by Design](#security-by-design)
- [AI-Assisted, Human-Governed](#ai-assisted-human-governed)
- [Documentation as Infrastructure](#documentation-as-infrastructure)
- [Data Quality Before Intelligence](#data-quality-before-intelligence)
- [Trust as a System Property](#trust-as-a-system-property)
- [One Asset, One Canonical Record](#one-asset-one-canonical-record)

## Principles

### Source of Truth
Every fact represented in the ecosystem has exactly one designated authoritative location. Copies, caches and derived views are permitted everywhere; authority is not. See `GLOSSARY.md#source-of-truth`.

### Explicit Ownership
Every Entity, domain, and Decision has a named owner — a person, role, or defined process — responsible for it. Ownership is never implicit or assumed by default.

### Traceability
Any piece of information in the system can be traced back to how it came to be: its origin, the Decisions that shaped it, and the changes it has undergone. Traceability is what makes the system auditable years later.

### Provenance
A specific form of traceability applied to data and Registry state: every recorded fact carries where it came from, when, and through what process it entered the system. See `GLOSSARY.md#provenance`.

### Separation of Concerns
Each domain owns a distinct set of responsibilities that no other domain duplicates. When two domains appear to overlap, the boundary is clarified in `DOMAIN-MODEL.md` rather than left ambiguous or resolved by convenience.

### Domain Boundaries
A domain's Scope statement defines what belongs inside it and, explicitly, what does not. Boundaries are deliberately over-communicated (stating what is excluded, not just what is included) because ambiguity compounds as the system grows.

### Controlled Evolution
The architecture can grow — new domains, new capabilities, new relationships — but growth happens through a defined process (proposal → review → Decision), never through ad hoc additions that bypass Governance.

### Human Accountability
Regardless of how much of a process is automated or AI-assisted, a specific human or human-governed body remains accountable for the outcome. Automation executes; humans answer for results.

### Privacy by Design
Systems handling personal data (leads, partners, any natural person) are designed from the outset to collect the minimum necessary, protect it proportionally, and comply with applicable law — not retrofitted after the fact. See `160-legal-and-compliance`.

### Security by Design
Security constraints are considered at the point a capability is designed, not added afterward. Security is cross-cutting — it applies to every domain, not a downstream stage. See `100-security`.

### AI-Assisted, Human-Governed
Artificial Intelligence may assist, draft, recommend, or accelerate work across any domain, but does not hold unsupervised authority over Decisions that affect trust, legal standing, or irreversible state changes. See `GLOSSARY.md#agent`.

### Documentation as Infrastructure
This repository is treated with the same rigor as production infrastructure: changes are deliberate, reviewed, and traceable. Documentation is not an afterthought to the "real" system — for the Z Operating System, it is a primary artifact of the system itself.

### Data Quality Before Intelligence
Intelligence (recommendations, scores, predictions) is only as trustworthy as the Data and Registry state it is built on. Investment in data quality and Registry correctness precedes investment in Intelligence capability, not the other way around.

### Trust as a System Property
Trust is not a feature bolted onto one domain — it is an emergent property that depends on Registry correctness, Data quality, Provenance, and explainability working together. No single domain can manufacture Trust in isolation.

### One Asset, One Canonical Record
Each Asset has exactly one canonical Registry record — its Identity, per `20-registry/ENTITY-ASSET-MODEL.md`. Multiple systems, Representations, observations, Documents and External References may all refer to the same Asset without conflict; what they must never do is create a second, competing canonical identity for it. The Registry is the sole authority for canonical Asset identity — every other domain that references an Asset (Data, Trust Engine, Marketplace, Intelligence) resolves to this one record rather than maintaining its own. This is the concrete mechanism behind the Registry/Data boundary and the Representation invariant already defined in `00-foundation/DOMAIN-MODEL.md` and `20-registry/ENTITY-ASSET-MODEL.md` — this entry states the principle; those documents state the mechanism.

## Status
Draft

## Last Updated
2026-07-19

## Related Domains
- All domains (every domain's decisions should trace back to one or more principles here)
