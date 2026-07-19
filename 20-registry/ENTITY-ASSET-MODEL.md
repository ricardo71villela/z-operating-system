# Entity & Asset Model

## Purpose
Defines the canonical conceptual model of the Registry: what an Entity is, how it relates to Assets, Relationships, State and History, and how the system determines that two records refer to the same underlying thing. This is the model every other domain (Trust Engine, Data, Marketplace, Intelligence) references when it needs to know "which entity, exactly."

## Scope
The Entity/Asset conceptual model, canonical identity, and the Registry/Data boundary tested against concrete examples. Does not define partner scoring, trust evaluation, or transaction mechanics — see `30-trust-engine`, `40-partner-quality-score`, `50-marketplace`. Does not redefine terms already canonical in `GLOSSARY.md` (Entity, Asset, Identity, Ownership, Provenance, Organization, Company, Brand, Product, Property, Development, Project, Partner) — it applies them to the Registry specifically: what the Registry owns for each, and how they relate.

## Table of Contents
- [Model Shape: A Graph, Not a Chain](#model-shape-a-graph-not-a-chain)
- [Core Concepts](#core-concepts)
- [Canonical Identity](#canonical-identity)
- [Relationship, State and History](#relationship-state-and-history)
- [Registry / Data Boundary, Tested](#registry--data-boundary-tested)
- [Designed for Extension](#designed-for-extension)

---

## Model Shape: A Graph, Not a Chain

`Entity → Asset → Relationship → State → History` is a useful reading order, not the system's real shape. In practice these five are mutually referential: a State change is itself an Event that becomes History; a Relationship (e.g. Representation) has its own State and History; an Asset's Identity depends on resolving Relationships (is this the same Entity another record already describes?) as much as on its own attributes. The accurate model is a graph:

```
Entities ↔ Relationships ↔ Assets ↔ States ↔ Events ↔ History
```

Every node in this graph carries Provenance. Nothing in the Registry is asserted without a traceable origin.

## Core Concepts

Each concept below is canonical in `GLOSSARY.md`; this section states what the *Registry specifically* owns, doesn't own, and how each concept relates to the others. Where a concept is new (not yet in the Glossary), it is defined here in full and flagged as a candidate for future Glossary inclusion.

### Entity

**Registry owns:** the fact that the Entity exists, its Identity, its current State, and its Relationships to other Entities.
**Registry does not own:** observations or measurements about the Entity — see [Registry / Data Boundary](#registry--data-boundary-tested).
**Relationships:** the universal parent concept — every other concept in this document (Organization, Company, Brand, Product, Property, Development, Partner, Person, Asset) is a category of Entity, not a separate root concept.

### Asset

**Registry owns:** the Asset's Identity and current authoritative state, exactly as for any Entity, plus the ownership/value dimension that distinguishes it.
**Registry does not own:** market value, price history, or valuation estimates — those are Data (observations about the Asset), not the Asset's identity.
**Relationships:** every Asset is an Entity; not every Entity is an Asset (a Market or a Dataset is an Entity, not an Asset — see `GLOSSARY.md#entity`). Property and Development are the Asset subtypes relevant to real estate today; the category is not limited to them.

### Organization, Company, Brand, Product

**Registry owns:** each as a distinct Entity, with the Organization → Company → Brand → Product layering already established in `GLOSSARY.md` applied structurally: a Company Entity may have Relationships to one or more Brand Entities, which in turn relate to Product Entities. Registry does not collapse these into one record — Z Imobiliária (Company), its Brand expression, and its specific Products are separate Entities with Relationships between them, not one Entity with four names.
**Registry does not own:** brand positioning, business strategy, or product requirements — those are `10-company`'s and the relevant product domain's content. Registry only owns that these Entities exist, their Identities, and their structural Relationships to each other.
**Relationships:** Organization is the root; Company, Brand and Product are Entities related to it and to each other by typed Relationships (owns, expresses, delivers).

### Property, Development

**Registry owns:** Identity, State, and Relationships (notably Representation — see below) for these Asset subtypes.
**Registry does not own:** floor area, price, condition, or any other measured/asserted attribute beyond the minimal defining attributes needed for identity resolution — see [Registry / Data Boundary](#registry--data-boundary-tested).
**Relationships:** a Development is composed of, or relates to, multiple Property Entities. Both are Assets, both are Entities.

### Partner, Person

**Registry owns:** the Partner's Identity and its Relationships (notably Representation) to Assets it is authorized to represent.
**Registry does not own:** whether a Partner is trustworthy, or how well it performs — that is `30-trust-engine` and `40-partner-quality-score`.
**Relationships:** a Partner is an Entity; when the Partner is an individual acting on their own behalf (a private seller representing their own Asset, not a Company), the underlying Entity type is **Person**.

**Person** (new concept, not yet in `GLOSSARY.md` — flagged as a candidate addition): an individual human represented in the Registry, subject to `100-security` and `160-legal-and-compliance` data-protection requirements from the point of first record — minimal necessary data only, per the Privacy by Design principle in `00-foundation/PRINCIPLES.md`. A Person Entity exists in the Registry only when the ecosystem genuinely needs to reference that individual across time (e.g. a private seller, a professional in a Representation) — not for every human who ever interacts with the system.

## Canonical Identity

**Identity** (already canonical in `GLOSSARY.md#identity`) is what lets an Entity be recognized consistently across domains and over time. The Registry's job is to determine, as reliably as possible, whether two records describe the same underlying thing — without overreaching into false certainty.

Principles:

- **Identity is determined by strong identifiers plus corroborating attributes — never by a single weak signal.** A cadastral reference or legal registration number, where it exists, is a strong identifier. Matching only on address text or description is not sufficient on its own.
- **Similarity is not Identity.** High similarity between two records triggers a review state (see below), never an automatic merge.
- **Uncertain identity is a first-class state, not a silently resolved one.** A record can be `Identity Pending` or `Possible Duplicate` — these are legitimate, visible states, not failures to hide.
- **Merges preserve history, never delete it.** When two records are confirmed to be the same Entity, both original Identities are preserved as historical aliases pointing to one surviving canonical Identity, with full Provenance of the merge decision (who, when, why).
- **Identity is stable independent of any single mutable attribute.** An Entity's canonical Identity does not change because its address format, description, or representing Company changes.

### Canonical Record

*(New concept, not yet in `GLOSSARY.md` — candidate for future addition.)*

**Definition:** The single, authoritative Registry entry for a given Entity's Identity — the record all other domains reference when they need "the" version of this Entity. Distinct from a **Listing** (Marketplace's published, discoverable instance of an active Representation) and from **Marketing Content** (descriptions and media created by a Representation) — both of which reference the Canonical Record by Identity rather than duplicating it.

### External Reference

*(New concept, not yet in `GLOSSARY.md` — candidate for future addition.)*

**Definition:** A pointer from a Registry Entity to an identifier or record in a system outside the Registry's authority — a cadastral registry number, a government business registration ID, a third-party data provider's ID. An External Reference is evidence usable for identity resolution and Provenance; it is never itself the Source of Truth for the Entity — the Registry's own Identity remains authoritative even when an External Reference changes or becomes unavailable.

## Relationship, State and History

### Relationship

**Definition:** A typed, first-class Registry object connecting two or more Entities — never a flat attribute on one of them. **Representation** is the Relationship type with the most architectural weight in this system: it connects a Company or Person to an Asset, granting the recognized right to represent (list, market, transact) that Asset within the ecosystem.

Representation, specifically:

- Has a start date, and an optional end date (open-ended while active).
- **Exactly one Representation may be Active per Asset at a time.** This is a Registry-level invariant — the formal expression of the One Asset, One Record principle referenced in `00-foundation/README.md`'s Scope and now given a concrete mechanism here.
- Moves through states: `Proposed → Active → Ended → Historical`, with `Disputed` as a possible state when two Companies claim to represent the same Asset (resolved by a defined process, never by "whoever submitted first").
- Can itself be `Verified` — the claim of representation is evidence-backed, evaluated by `30-trust-engine` as a Trust Subject in its own right, distinct from the Company's or the Asset's own trust standing.
- Ending a Representation never deletes it — it becomes `Historical`, preserved, and a new Representation (by the same or a different Company or Person) can then become Active.

This also formalizes how **Ownership** differs from Representation, per `GLOSSARY.md#ownership`: Ownership is who controls an Asset; Representation is who is authorized to represent it in the ecosystem. A Company may represent an Asset without owning it; an Owner may hold Representation of their own Asset directly (see Person, above) without an agency — subject to the same identity verification, data-quality, and transparency rules as any other Representation holder. Open marketplace participation for private sellers means the same Registry/Trust machinery applies to them, not a separate, lighter-touch path.

### State

Not one state machine, but several distinct, orthogonal ones — conflating them is a common source of confusion this document exists to prevent:

| State machine | Owned by | Examples |
|---|---|---|
| Asset state | Registry | Discovered, Identity Pending, Verified, Active, Inactive, Archived |
| Representation state | Registry | Proposed, Active, Disputed, Ended, Historical |
| Listing / marketing state | Marketplace | Draft, Published, Under Offer, Withdrawn |
| Transaction state | Marketplace | Offer Made, Accepted, Completed |
| Verification state | Trust Engine (referenced by Registry, not owned by it) | Pending, Verified, Failed, Expired |

Registry owns the first two; it references, but does not own, the rest.

### History

Every State transition and every Relationship change is recorded as an Event carrying Provenance, and preserved as History. History is never deleted merely because it is old — an old Representation, a superseded Identity, a past dispute all remain visible as History, distinct from current State.

## Registry / Data Boundary, Tested

`00-foundation/DOMAIN-MODEL.md` already states the boundary: Registry = identity and authoritative state; Data = observations, measurements, datasets, events about those Entities. Tested against concrete examples:

**Registry:** Property P exists. Property P is represented by Company C (a Representation Relationship). Property P has State Active.
**Data:** Property P has 125 m². Property P was listed at €650,000. The neighbourhood's average price is €5,200/m². Estimated rental yield is 4.7%.

**Refinement this document adds:** floor area looks static, and it's tempting to treat it as identity. It is not. The rule is: **Registry holds only the minimal defining attributes required for identity resolution and Relationship correctness** — a cadastral reference, geometry/location, a legal registration number, where they exist. Everything else — even attributes that rarely change, like floor area — is Data, because it can be measured differently by different sources, updated, or disputed, without changing *which* Asset is being discussed. "Represented by Company C" is never a flat field either — it is the full Representation Relationship object, with its own State and History, never collapsed into an attribute on the Property record.

## Designed for Extension

This model is deliberately not a taxonomy of every possible Entity type. Organization, Company, Brand, Product, Property, Development, Partner, and Person are the categories needed today. A future Entity type (a new Asset class, a new kind of Relationship) is added by extending this model's existing shape — Entity, Identity, Relationship, State, History, Provenance — not by inventing a parallel structure. This is what lets the Registry support real estate today without being architecturally limited to it.

## Status
Draft

## Last Updated
2026-07-19

## Related Domains
- `00-foundation` (Entity model and Registry/Data boundary defined in `DOMAIN-MODEL.md`)
- `60-data`
- `30-trust-engine`
- `40-partner-quality-score`
- `50-marketplace`
- `10-company`
- `100-security`
- `160-legal-and-compliance`
