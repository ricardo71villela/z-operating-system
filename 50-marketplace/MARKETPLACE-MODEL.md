# Marketplace Model

## Purpose
Defines the Marketplace domain's exact authority, its boundaries with Registry, Trust Engine, Data, Intelligence and Company, and the Listing concept — the domain's own central object. This is the model every future Marketplace product (including a future Z Marketplace) must be built against.

## Scope
Domain authority, the Listing concept, Marketplace-owned state machines, and the transaction boundary. Does not define a product's MVP, screens, user journeys, database schema, APIs, business model, or launch strategy — those belong to future product-design work built on top of this model, not to this document.

## Table of Contents
- [Position in the System](#position-in-the-system)
- [Authority Boundary](#authority-boundary)
- [Relationship with Registry](#relationship-with-registry)
- [The Listing Concept](#the-listing-concept)
- [Relationship with Trust Engine](#relationship-with-trust-engine)
- [Relationship with Data and Intelligence](#relationship-with-data-and-intelligence)
- [Relationship with Company, Brand and Product](#relationship-with-company-brand-and-product)
- [Marketplace State](#marketplace-state)
- [The Transaction Boundary](#the-transaction-boundary)
- [Open Architectural Questions](#open-architectural-questions)

---

## Position in the System

Marketplace is a **domain** of the Z Operating System — a product-facing capability, not a Registry Entity category and not a product in itself by default:

```
Z Operating System
    └── Marketplace (domain) — owns capabilities: Listing lifecycle, Discovery,
        Enquiry, Offer/Transaction workflow, Deduplication
            └── Z Marketplace (a future Product — see Open Questions)
```

The domain must be architecturally sound before any such product is designed. This document defines the domain; it does not design the product.

## Authority Boundary

| Capability | Authoritative Domain | Marketplace Role |
|---|---|---|
| Entity identity | Registry | Consumes only |
| Asset identity | Registry | Consumes only |
| Canonical Record | Registry | References by Identity, never duplicates |
| Representation | Registry | Provides the interface where a Representation is proposed; the object and its lifecycle belong to Registry |
| Ownership | Registry | Never touched directly |
| Evidence | Trust Engine | Never evaluates |
| Verification | Trust Engine | Consumes the outcome as input |
| Trust Assessment | Trust Engine | Consumes only |
| Trust Level | Trust Engine | Consumes to inform, never determine, visibility and ranking |
| **Listing** | **Marketplace** | **Owns fully — see below** |
| Marketplace visibility | Marketplace | Owns — a Marketplace Decision informed by Trust Level, never equal to it |
| Search | Marketplace (mechanics) / Intelligence (ranking algorithm) | Owns the process; may delegate algorithmic ranking |
| Ranking | Marketplace (policy) / Intelligence (score) | Owns the policy decision; consumes score as input |
| Recommendation | Intelligence | Consumes and surfaces, does not compute |
| Enquiry | Marketplace | Owns |
| Offer | Marketplace | Owns workflow state; never the legal contract |
| Transaction | Marketplace (process state) / Company + Legal & Compliance (substance) | Tracks state only |
| Legal contract | Company / Legal & Compliance | Never owns |
| Payment | Legal & Compliance / external systems | Never owns without an explicit governed Decision |
| Historical record | Registry (Asset/Representation) + Marketplace (Listing/Transaction, its own scope) | Each domain keeps history of what it owns |

The governing rule throughout: **Marketplace decides within Marketplace authority; it never becomes authoritative for identity (Registry) or trust (Trust Engine).**

## Relationship with Registry

Marketplace consumes, from Registry: Entity, Asset, Canonical Record, Representation (specifically, the currently Active one), Relationship, State, History, External Reference. It creates none of these.

**One Asset, One Canonical Record is preserved by construction:** every Listing must resolve to the Asset's Canonical Record by Identity at creation time, using Registry's existing duplicate-detection principles (`20-registry/ENTITY-ASSET-MODEL.md#canonical-identity`) — never by a Marketplace-local check. Marketplace never creates a second canonical identity, and never creates a competing Representation; it only ever projects the one currently Active Representation.

**Multiple Listings do not violate this principle.** The same Active Representation may be projected as more than one Listing — one per Marketplace product it is exposed through (see [syndication, below](#the-listing-concept)) — because a Listing is a presentation-layer projection, not an identity or a representation claim.

## The Listing Concept

**A Listing is a Marketplace-owned object: a projection of exactly one Active Representation into a specific Marketplace product's discovery and presentation surface.**

It is **not** a Registry Entity, not an Asset, not a Relationship in the Registry sense, not a commercial offer, and not merely a temporary status flag — it is Marketplace's own artifact, referencing Registry objects rather than duplicating them.

```
Asset (Registry, Canonical Record)
   │
   └── Representation (Registry, exactly one Active)
           │
           └── Listing (Marketplace, owned by a specific Marketplace product)
                   │
                   ├── Discovery / Search / Ranking
                   ├── Enquiry
                   └── Offer (workflow state only)
```

**What it references:** the Asset (by Identity), the Active Representation it projects, the Company (via the Representation), and optionally Marketing Content.

**What owns it:** the specific Marketplace product it belongs to — this is what makes syndication across multiple Marketplace products (including a possible future white-label product) architecturally coherent: multiple Listings, one Active Representation, one Canonical Asset. No Listing is ever itself canonical.

**States:** `Draft → Published → Under Offer → Withdrawn` — Listing state, distinct from Asset state and Representation state (see [Marketplace State](#marketplace-state)).

**Relation to Offer/Transaction:** an Offer references a Listing, not the Asset directly — it resolves to the Asset through the Listing → Representation → Asset chain.

**Failure mode this prevents:** duplicate canonical records for the same Asset (`Listing 1 → Property A`, `Listing 2 → duplicate Property A`). Because every Listing must resolve to one Canonical Record at creation, and Registry's identity-resolution principles apply at that point, duplication becomes a Registry-caught error, not a Marketplace-tolerated state.

## Relationship with Trust Engine

**Trust Engine assesses. Marketplace decides within Marketplace authority.** This boundary, established in `30-trust-engine/TRUST-MODEL.md`, is never crossed in either direction.

Legitimate: Marketplace uses a Trust Level as one input to a ranking or eligibility **policy that Marketplace itself defines and owns** — e.g., "require Trust Level ≥ Established to list without additional review" is a Marketplace-owned threshold applied to a Trust Engine output.

Illegitimate: "Trust Engine approves the listing" — this would make Trust Engine a decision-maker, which `TRUST-MODEL.md` explicitly rules out. Trust Engine never approves, ranks, or flags a Listing directly; it only ever produces an Assessment that Marketplace may consume.

**Explainability is preserved end to end:** a Marketplace visibility or ranking decision informed by a Trust Level must remain traceable to the Assessment and its evidence checklist that informed it — a Partner asking "why is my Listing ranked here" gets an answer that traces through both Marketplace's policy and Trust Engine's Assessment, never a black box.

## Relationship with Data and Intelligence

Marketplace may consume Data (observations about the Asset — price history, view counts, market data) and Intelligence (algorithmic ranking scores, recommendations) as additional inputs to its own decisions, on the same terms as Trust Level: **inputs to a Marketplace-owned policy, never authoritative over the Marketplace decision itself.** Marketplace does not compute recommendations or algorithmic scores — that is Intelligence's role — and does not generate market observations — that is Data's role.

## Relationship with Company, Brand and Product

Using the Organization → Company → Brand → Product model already established (`GLOSSARY.md#company`, `20-registry/ENTITY-ASSET-MODEL.md`): a future Z Marketplace, if and when built, would be represented as a Registry Entity of type Product, operated by a Company under a Brand — the same layering already applied to every other product-facing capability. This document does not resolve *which* Company or Brand that would be, whether more than one Company could operate through it, or whether the Z Operating System could operate a Marketplace directly without an intermediating Company — these are genuinely open (see below), not assumed.

## Marketplace State

Registry already distinguishes several orthogonal state machines (`20-registry/ENTITY-ASSET-MODEL.md#state`). Marketplace owns two of them and merely references the rest:

| State machine | Owned by | Examples |
|---|---|---|
| Asset state | Registry | Discovered, Identity Pending, Verified, Active, Inactive, Archived |
| Representation state | Registry | Proposed, Active, Disputed, Ended, Historical |
| **Listing state** | **Marketplace** | Draft, Published, Under Offer, Withdrawn |
| **Transaction state** | **Marketplace** (process only — see boundary below) | Offer Made, Countered, Accepted, Completed |
| Verification state | Trust Engine (referenced, not owned, by Marketplace) | Pending, Verified, Failed, Expired |

These are never collapsed into a single generic status — a Listing can be `Published` while its underlying Asset is `Active` and its Representation is `Active`, and each fact is tracked by the domain that owns it.

## The Transaction Boundary

```
Discovery → Enquiry → Interaction → Offer → Negotiation → Agreement → Transaction → Completion
```

- **Discovery, Enquiry, Interaction:** fully Marketplace.
- **Offer, Negotiation:** Marketplace owns workflow state tracking (`Offer Made`, `Countered`, `Accepted`) — never the legal validity of the offer.
- **Agreement:** the boundary. From here, the legal contract itself is Company / Legal & Compliance territory, not Marketplace's.
- **Transaction, Completion:** Marketplace may track that a transaction reached `Completed` as a state — sufficient to know a Listing should be withdrawn — but financial settlement, ownership transfer, and AML/KYC are explicitly **not** Marketplace's domain; they belong to Legal & Compliance, Operations, and external systems (banks, notaries, land registries).

This boundary is what prevents Marketplace from silently becoming a CRM, an ERP, a legal system, a property registry, a trust system, or a payment system — each of those remains a distinct, deliberately un-owned capability unless a future, explicit, governed architectural Decision says otherwise.

## Open Architectural Questions

- **Is "Z Marketplace" a Product of a specific Company/Brand, or a capability operated by the Z Operating System directly?** Not resolved by `MASTER_BLUEPRINT.md` or any other document.
- **Multi-tenancy:** can more than one Company operate through the same Z Marketplace product, or is it scoped to a single Company initially?
- **"Marketplace Operator"** — is this a Role, a Registry Entity type, or a Relationship? Not yet defined.
- **Syndication across Marketplace products** (including a possible third-party/white-label product) — this document's Listing model supports it conceptually (multiple Listings, one Representation, one Asset), but no document has confirmed it is intended, or how it would be governed.
- **The exact hand-off point** between Marketplace-tracked Transaction state and Company/Legal & Compliance/Operations-owned process — this document proposes the Agreement boundary above, but it is not yet ratified elsewhere.

None of these block current operation; all are recorded intentionally rather than resolved prematurely.

## Status
Draft

## Last Updated
2026-07-19

## Related Domains
- `20-registry`
- `30-trust-engine`
- `40-partner-quality-score`
- `60-data`
- `80-intelligence`
- `10-company`
- `160-legal-and-compliance`
- `120-operations`
