# Z Operating System — Master Blueprint

## Purpose
The canonical architectural orientation document for the Z Operating System. It explains how the system fits together as a whole — what it is, how its domains relate, and what every future product or domain must respect. It is not a replacement for the Foundation, Registry, or Trust Engine documents; where a concept is already formally defined elsewhere, this document synthesizes and links to it rather than reproducing it.

## Scope
Architectural orientation only: definitions, relationships, flows, domain classification, and the minimum conceptual model. Does not contain technical implementation, product requirements, a Marketplace specification, or full domain models — those live in the referenced documents.

## Table of Contents
1. [What the Z Operating System Is](#1-what-the-z-operating-system-is)
2. [The Z Operating System and the Things It Represents](#2-the-z-operating-system-and-the-things-it-represents)
3. [The Architecture at a Glance](#3-the-architecture-at-a-glance)
4. [The System Model](#4-the-system-model)
5. [The Entity and Asset Backbone](#5-the-entity-and-asset-backbone)
6. [The Trust Backbone](#6-the-trust-backbone)
7. [The Data, Knowledge and Intelligence Relationship](#7-the-data-knowledge-and-intelligence-relationship)
8. [The Marketplace as a Product-Facing Capability](#8-the-marketplace-as-a-product-facing-capability)
9. [Cross-Cutting Domains](#9-cross-cutting-domains)
10. [The Minimum Conceptual Model for Every Future Product](#10-the-minimum-conceptual-model-for-every-future-product)
11. [How the System Evolves](#11-how-the-system-evolves)
12. [Open Architectural Questions](#12-open-architectural-questions)
13. [How to Read and Extend This Repository](#13-how-to-read-and-extend-this-repository)

---

## 1. What the Z Operating System Is

The Z Operating System is the system that models, connects and orchestrates the Z ecosystem — organizations, companies, brands, products, assets, data, knowledge, trust and decisions — as one coherent whole. It is infrastructure, not a business (see [Glossary](GLOSSARY.md#z-operating-system)).

**What it is not:** it is not a company, not a product, not a marketing site, not a codebase, not a database schema. Anthropic-style disclaimers aside — concretely, it is not Z Imobiliária, and Z Imobiliária's specific choices (visual, operational, commercial) are not automatically the Z Operating System's choices. See [§2](#2-the-z-operating-system-and-the-things-it-represents).

**Why it exists:** the guiding motto, established from the outset, is *start with trust, and let growth follow*. The system exists because trust, identity and knowledge do not emerge automatically from a collection of independent products — they require a shared, canonical layer that every product can rely on instead of reinventing.

**What it models:** entities and their relationships (via the [Registry](20-registry/ENTITY-ASSET-MODEL.md)), trustworthiness (via the [Trust Engine](30-trust-engine/TRUST-MODEL.md)), and the principles that govern both (via [Foundation](00-foundation/PRINCIPLES.md)).

**What it connects:** companies, brands, products, partners, data, and knowledge, through a shared identity layer rather than parallel, incompatible representations of the same things.

**What it orchestrates:** how information flows between domains — identity, evidence, trust, decisions — without any single product owning authority it shouldn't.

## 2. The Z Operating System and the Things It Represents

The distinction below is unambiguous and must stay that way in every document:

| Concept | What it is | Where it's defined |
|---|---|---|
| **Z Operating System** | The infrastructure itself — the system, not a thing represented within it. | [Glossary](GLOSSARY.md#z-operating-system) |
| **Organization** | The overall entity that owns companies, brands and products. | [Glossary](GLOSSARY.md#organization) |
| **Company** | A business entity represented within the system (e.g. Z Imobiliária) — never conflated with the system itself. | [Glossary](GLOSSARY.md#company) |
| **Brand** | A public-facing identity a Company expresses itself through. | [Glossary](GLOSSARY.md#brand) |
| **Product** | A specific offering a Company delivers, under a Brand. | [Glossary](GLOSSARY.md#product) |
| **Entity** | The universal parent concept — anything the Registry can identify and track. Organization, Company, Brand, Product, Property, Partner are all *categories* of Entity. | [Entity & Asset Model](20-registry/ENTITY-ASSET-MODEL.md#entity) |
| **Asset** | An Entity with ownership and economic/transactional value. | [Entity & Asset Model](20-registry/ENTITY-ASSET-MODEL.md#asset) |
| **Marketplace** | A domain — a product-facing capability of the system — not a Registry Entity category and not a thing the system represents the way it represents a Company. | [§8](#8-the-marketplace-as-a-product-facing-capability) |

The relationship in one sentence: **the Z Operating System is the infrastructure; Organizations, Companies, Brands, Products and other Entities are represented within it via the Registry; the Marketplace is a domain of the system through which some of those represented Entities are discovered and transacted.** None of these things are the system itself, and the system is not reducible to any one of them — including its first and most mature expression, Z Imobiliária (see [Design System §11](architecture/DESIGN-SYSTEM.md#11-relationship-with-z-imobiliária) for how this same distinction is enforced at the interface layer).

## 3. The Architecture at a Glance

The repository's domains, using their actual names and numbering:

| # | Domain | Category |
|---|---|---|
| 00 | `foundation` | Foundational |
| 10 | `company` | Product-facing |
| 20 | `registry` | Foundational |
| 30 | `trust-engine` | Enabling |
| 40 | `partner-quality-score` | Product-facing |
| 50 | `marketplace` | Product-facing |
| 60 | `data` | Enabling |
| 70 | `knowledge-hub` | Product-facing |
| 80 | `intelligence` | Enabling |
| 90 | `platform-engineering` | Enabling |
| 100 | `security` | Enabling |
| 110 | `governance` | Enabling |
| 120 | `operations` | Product-facing |
| 130 | `design` | Enabling |
| 140 | `roadmaps` | Planning / Forward-looking |
| 145 | `research` | Planning / Forward-looking |
| 150 | `standards` | Enabling |
| 160 | `legal-and-compliance` | Enabling |

Plus cross-cutting infrastructure that isn't a numbered domain: `architecture/` (including the [Design System](architecture/DESIGN-SYSTEM.md)), `diagrams/`, `templates/`, `tools/`, and the root [`GLOSSARY.md`](GLOSSARY.md).

**These categories are an orientation model, not a rigid execution pipeline.** A domain's category describes what kind of weight it carries in the system, not a stage it must pass through. Foundational domains (Foundation, Registry) are what every other domain is built on. Enabling domains provide capabilities other domains draw on without being directly business-facing. Product-facing domains are where the ecosystem meets companies, partners and customers. Planning domains are explicitly forward-looking and provisional by nature — Research and Roadmaps are not treated as less important, only as differently scoped.

## 4. The System Model

The full model is defined in [`00-foundation/SYSTEM-MODEL.md`](00-foundation/SYSTEM-MODEL.md); this section orients rather than repeats it.

The system is **not a linear chain**. It is a network of domains connected by dependency and reference, with five domains — Security, Legal & Compliance, Governance, Standards, and Design — drawn *around* that network as cross-cutting constraints rather than *within* it as sequential stages. No domain is "downstream" of these five; they apply wherever relevant, at any point.

The System Model defines:
- **Nodes** — the domains themselves, each with a stated authority (see the Authority Map in `SYSTEM-MODEL.md`).
- **Relationships** — which domains reference which for what (e.g. Trust Engine references Registry for identity, never maintains its own).
- **Flows** — data flow, knowledge flow, decision flow, trust flow, and the design/experience translation flow (System architecture → Design → Product experience), each defined in `SYSTEM-MODEL.md`.
- **Cross-cutting constraints** — the five domains above, which apply across all flows rather than gating any single one.

## 5. The Entity and Asset Backbone

The full model is defined in [`20-registry/ENTITY-ASSET-MODEL.md`](20-registry/ENTITY-ASSET-MODEL.md); this section orients rather than repeats it.

The Registry is the canonical identity backbone every other domain references when it needs to know "which Entity, exactly." Its shape is a graph, not a linear chain: `Entities ↔ Relationships ↔ Assets ↔ States ↔ Events ↔ History`.

At a high level:
- **Entity** — anything the Registry can identify and track over time.
- **Asset** — an Entity with ownership and economic value; Property and Development are today's Asset subtypes, not the whole category.
- **Relationship** — a typed, first-class Registry object connecting Entities; **Representation** is the Relationship with the most architectural weight, granting a Company or Person the right to represent an Asset, with exactly one Representation Active per Asset at a time.
- **State** — several distinct, orthogonal state machines (Asset state, Representation state, Listing state, Transaction state, Verification state), not one.
- **Event / History** — every State transition and Relationship change is recorded and preserved, never deleted for being old.
- **Canonical Record** — the single, authoritative Registry entry for an Entity's Identity (see [Glossary](GLOSSARY.md#canonical-record)).
- **External Reference** — a pointer to an identifier in a system outside the Registry's authority (a cadastral number, a government ID); evidence, never itself the Source of Truth (see [Glossary](GLOSSARY.md#external-reference)).

**One Asset, One Canonical Record.** Each Asset has exactly one canonical Registry record. Multiple representations, observations, documents and external references may refer to the same Asset without conflict — what they must never do is create a second, competing canonical identity (see [`PRINCIPLES.md`](00-foundation/PRINCIPLES.md#one-asset-one-canonical-record)). This matters for every future product because it is the one invariant that keeps the ecosystem from becoming a collection of incompatible, duplicated records of the same real-world things — the exact failure mode the system was built to avoid.

## 6. The Trust Backbone

The full model is defined in [`30-trust-engine/TRUST-MODEL.md`](30-trust-engine/TRUST-MODEL.md); this section orients rather than repeats it.

Trust is a structured, evidence-based, explainable Assessment — never a bare score, never a reputation aggregate. The conceptual flow:

```
Source → Claim → Evidence → Verification → Signal → Assessment → Trust Level
```

**Trust Engine assesses; it does not decide.** It stops at the Trust Level. Marketplace and Governance may consume an Assessment to make a decision within their own authority (rank a listing, approve a partner) — the Trust Engine itself never ranks, approves, or flags anything directly.

**Relationship to Registry:** Registry is authoritative for identity and current state; Trust Engine is authoritative for what the system currently assesses about that Entity's trustworthiness, and why. A Trust Assessment references a Registry Entity's Identity — it is not itself a Registry Entity, and it does not live inside the Registry.

## 7. The Data, Knowledge and Intelligence Relationship

At the architectural level supported by the repository today (Data, Knowledge Hub, Research and Intelligence currently have only their scaffold READMEs — no model documents yet exist for them, so this section stays at the level those READMEs support):

- **Registry** — identity. What exists, and what is currently true about it.
- **Data** ([`60-data/README.md`](60-data/README.md)) — observation. What has been recorded or measured about an Entity, over time. Never the Entity's identity itself.
- **Knowledge Hub** ([`70-knowledge-hub/README.md`](70-knowledge-hub/README.md)) — curated output for external, product-facing audiences (guides, reports, tools).
- **Research** ([`145-research/README.md`](145-research/README.md)) — internal strategic study (benchmarks, competitive analysis, white papers) for the company, not the public.
- **Intelligence** ([`80-intelligence/README.md`](80-intelligence/README.md)) — the systematic, often algorithmic capability that turns Data and Knowledge into recommendations, scores or predictions. AI/ML is one tool within Intelligence, not its boundary.

No detailed technical architecture is defined here for these domains — their internal models have not yet been written. This section exists only to keep the five concepts (identity, observation, curated knowledge, internal research, algorithmic interpretation) from being confused with one another as those domains are developed.

## 8. The Marketplace as a Product-Facing Capability

Marketplace ([`50-marketplace/README.md`](50-marketplace/README.md)) is a **domain** — a product-facing capability — not a Registry Entity category and not a peer of the Z Operating System itself.

Marketplace:
- consumes Registry identity (what exists, and which Representation is currently Active);
- consumes Trust Engine assessments (informing, never determining, visibility and ranking);
- may consume Data and Intelligence (market context, recommendations);
- may be operated by or serve one or more Companies and Products;
- manages discovery, interaction and transaction-oriented processes — listing lifecycle, deduplication, partner onboarding;
- is **not** the canonical owner of identity — that is Registry;
- is **not** the canonical owner of Trust — that is Trust Engine.

This document does not design the Marketplace, define its MVP, or write product requirements — those belong to `50-marketplace`'s own future model documents. Its purpose here is only to fix its position in the architecture: downstream of Registry and Trust Engine, never a substitute for either.

## 9. Cross-Cutting Domains

Five domains apply across the system rather than as sequential stages — this is already established in [`SYSTEM-MODEL.md`](00-foundation/SYSTEM-MODEL.md#cross-cutting-domains) and restated here only for orientation:

- **Security** ([`100-security/README.md`](100-security/README.md)) — applies from the point any capability handling sensitive Asset, partner or financial data is designed, not after.
- **Legal & Compliance** ([`160-legal-and-compliance/README.md`](160-legal-and-compliance/README.md)) — licensing, data protection, AML/KYC — applies wherever relevant regulation touches a domain's activity.
- **Governance** ([`110-governance/README.md`](110-governance/README.md)) — how cross-domain Decisions are made and approved; the authority behind [§11](#11-how-the-system-evolves).
- **Standards** ([`150-standards/README.md`](150-standards/README.md)) — documentation, naming, coding and writing conventions, kept distinct from Governance's decision-making authority.
- **Design** ([`architecture/DESIGN-SYSTEM.md`](architecture/DESIGN-SYSTEM.md), [`130-design/README.md`](130-design/README.md)) — the translation layer between internal system models and human-facing experiences; defines the Z Design Foundations that future products express differently without violating the underlying principles.

## 10. The Minimum Conceptual Model for Every Future Product

Every future product, platform, or major capability built within the Z Operating System must:

1. Use the Registry for canonical identity — no parallel identity system.
2. Respect One Asset, One Canonical Record.
3. Preserve the Registry/Data boundary — identity is never confused with observation.
4. Use the Trust Engine model when trust assessment is relevant — no isolated, bespoke scoring system.
5. Respect the Z Design Foundations (see [Design System §2](architecture/DESIGN-SYSTEM.md#2-token-architecture-three-layers)) — brand-level expression may vary; the underlying principles may not.
6. Respect the Foundation principles in full, without exception (see [`PRINCIPLES.md`](00-foundation/PRINCIPLES.md)).
7. Not create a parallel identity system without an explicitly governed architectural reason.
8. Route cross-domain changes through Governance and Documentation Standards.
9. Apply Security and Legal & Compliance requirements according to the nature of the product.
10. Vary in product-specific implementation while remaining coherent with the underlying system principles.

## 11. How the System Evolves

- **A concept belongs in an existing domain** when it can be expressed as a document or section within that domain's stable Purpose/Scope (see [`DOMAIN-MODEL.md`](00-foundation/DOMAIN-MODEL.md#criteria-for-creating-a-new-domain)) — this is the default assumption.
- **A new domain may be justified** only when all four criteria in `DOMAIN-MODEL.md` are met, including an explicit Governance Decision. This Blueprint does not create, rename, or propose new domains.
- **A new Registry Entity type may be justified** when an existing type (Organization, Company, Brand, Product, Property, Development, Partner, Person) genuinely cannot represent it — extending the existing Entity/Identity/Relationship/State/History shape, never inventing a parallel structure (see [`ENTITY-ASSET-MODEL.md`](20-registry/ENTITY-ASSET-MODEL.md#designed-for-extension)).
- **A new Product** is a Company's or Brand's offering, represented as a Registry Entity — its creation is a Company-domain and Registry event, not an architectural one, unless it requires a new Entity type or domain by the criteria above.
- **Architectural changes are governed** by `110-governance`; **documentation evolves alongside the system** per `150-standards` and the templates in `templates/`.

## 12. Open Architectural Questions

Consolidated from the authoritative Foundation and Registry documents — genuinely unresolved, not blocking current operation:

- **Trust Engine vs. Partner Quality Score** — whether Partner Quality Score remains independent, becomes a Capability of Trust Engine, or is absorbed into it. See [`DOMAIN-MODEL.md`](00-foundation/DOMAIN-MODEL.md#open-architectural-questions).
- **Classification of "Private Collection"** (Coleção Privada) — whether it is a Brand, a Product, or another Registry Entity type. See [`DOMAIN-MODEL.md`](00-foundation/DOMAIN-MODEL.md#open-architectural-questions).

Both are intentionally recorded as open rather than resolved prematurely — resolving either without real content to test the boundary against would risk fixing the wrong answer.

## 13. How to Read and Extend This Repository

Recommended reading order for a new engineer, architect, or AI system:

1. [`README.md`](README.md)
2. [`GLOSSARY.md`](GLOSSARY.md)
3. [`00-foundation/PRINCIPLES.md`](00-foundation/PRINCIPLES.md)
4. [`00-foundation/SYSTEM-MODEL.md`](00-foundation/SYSTEM-MODEL.md)
5. [`00-foundation/DOMAIN-MODEL.md`](00-foundation/DOMAIN-MODEL.md)
6. [`10-company/README.md`](10-company/README.md)
7. [`20-registry/ENTITY-ASSET-MODEL.md`](20-registry/ENTITY-ASSET-MODEL.md)
8. [`30-trust-engine/TRUST-MODEL.md`](30-trust-engine/TRUST-MODEL.md)
9. [`architecture/DESIGN-SYSTEM.md`](architecture/DESIGN-SYSTEM.md)
10. The relevant domain model for the capability being developed.

This Blueprint provides orientation — the shape of the whole. Domain models provide authority for their specific concepts. The Glossary provides canonical terminology. The Foundation provides the principles and system-level rules everything else is checked against. When any two documents appear to disagree, Foundation and the relevant domain's own model take precedence over this Blueprint — this document synthesizes them; it does not supersede them.

## Status
Draft

## Last Updated
2026-07-19

## Related Domains
- All domains
