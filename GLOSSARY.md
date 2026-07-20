# Glossary

## Purpose
Single source of truth for terms used across the Z ecosystem, so definitions never drift between domains. This is the canonical language of the system — every domain document should use these terms exactly as defined here, not redefine them locally.

## Scope
Cross-domain terminology only. Domain-specific technical terms used nowhere else stay defined inside their own domain's documents, with a note pointing back here if they relate to a canonical term.

## Table of Contents
- [System-level terms](#system-level-terms)
- [Organizational terms](#organizational-terms)
- [Registry terms](#registry-terms)
- [Data & knowledge terms](#data--knowledge-terms)
- [Trust & marketplace terms](#trust--marketplace-terms)
- [Governance & decision terms](#governance--decision-terms)
- [Design & experience terms](#design--experience-terms)
- [Technical terms](#technical-terms)

---

## System-level terms

### Z Operating System

**Definition:** The system that models, connects and orchestrates the Z ecosystem — organizations, companies, brands, products, assets, data, knowledge, trust and decisions — as one coherent whole. It is infrastructure, not a business.

**Related concepts:** Organization, Company, Platform, Domain.

**Canonical usage:** "The Z Operating System represents Z Imobiliária as a Company" — never "the Z Operating System is a company."

**Avoid confusing with:** *Company* (a business entity the system represents) or *Platform* (the technical/product layer that implements parts of the system). The Z Operating System is the superset; it is not reducible to either.

### Z Intelligence

**Definition:** The aggregate intelligence capability produced by the Z Operating System — the synthesis of Data, Knowledge, Trust and Intelligence domains into decisions and recommendations that are explainable and traceable to their sources.

**Related concepts:** Intelligence, Knowledge, Data, Trust.

**Canonical usage:** "Z Intelligence" refers to system-wide output; "Intelligence" (the domain) refers to the methods and infrastructure that produce it.

**Avoid confusing with:** *Artificial Intelligence*, which is one input to Z Intelligence, not a synonym for it.

### Platform

**Definition:** The technical implementation layer — software, infrastructure, and interfaces — that operationalizes parts of the Z Operating System. A platform is built; the Z Operating System is modeled.

**Related concepts:** Z Operating System, Capability, Service.

**Canonical usage:** "The zimobiliaria.pt platform implements the Marketplace domain for the Z Imobiliária company."

**Avoid confusing with:** The Z Operating System itself, which is conceptual/architectural infrastructure, not code.

### Interface

**Definition:** The point of interaction between a human (or another system) and a Capability, Product, or Service — the surface presented to the user, not the logic or infrastructure behind it.

**Related concepts:** Platform, Product, Capability, User Experience.

**Canonical usage:** "The valuation tool's Interface is one surface built on the Platform layer."

**Avoid confusing with:** *Platform*, which is the broader technical implementation layer; an Interface is one surface a Platform presents, not the Platform itself.

### Domain

**Definition:** A top-level, bounded area of responsibility within this repository (e.g. `20-registry`, `70-knowledge-hub`). A domain owns a distinct set of concepts and decisions that no other domain owns. See `00-foundation/DOMAIN-MODEL.md` for the full criteria.

**Related concepts:** Capability, Service.

**Canonical usage:** "This belongs in the Registry domain" — referring to one of the 18 numbered folders.

**Avoid confusing with:** *Capability* (something a domain or platform can do) or *Service* (a runtime implementation of a capability).

### Capability

**Definition:** Something the ecosystem is able to do — a function, not a place. A capability may be described within a domain but is not itself a domain (e.g. "deduplication" is a capability within Registry/Marketplace, not a domain of its own).

**Related concepts:** Domain, Service.

**Canonical usage:** "Partner scoring is a capability of the Trust Engine domain."

**Avoid confusing with:** *Service*, which is a capability that has been implemented and deployed.

### Service

**Definition:** A running, operational implementation of one or more capabilities — belongs to the Platform layer, not to this documentation repository.

**Related concepts:** Capability, Platform.

**Canonical usage:** "The `notify-lead` Edge Function is a service that implements a Trust/Marketplace capability."

**Avoid confusing with:** *Capability*, which is the abstract function; a service is its concrete implementation.

---

## Organizational terms

### Organization

**Definition:** The overall legal and operational entity that owns companies, brands and products represented within the Z Operating System.

**Related concepts:** Company, Brand, Product.

**Canonical usage:** "Z is the Organization; Z Imobiliária is a Company within it."

**Avoid confusing with:** *Company*, which is one level below Organization, not a synonym.

### Company

**Definition:** A business entity within the Organization that operates commercially, with its own model, revenue and market context (e.g. Z Imobiliária, PortInvest & Co.). Represented within the Z Operating System, never conflated with it.

**Related concepts:** Organization, Brand, Product.

**Canonical usage:** "Z Imobiliária is a Company represented in the Registry." A Company may have one or more Brands; Brand expression is not identical to the Company itself. Products and market-facing experiences may be associated with the Company and/or with one of its Brands — e.g. Z Imobiliária (Company) expresses itself through its visual Brand and through specific real-estate Products and experiences, without those being interchangeable with "Z Imobiliária" as a Company entity. (Which of Z Imobiliária's specific sub-brands are Brands versus Products in this model is not yet fully mapped — see `architecture/DESIGN-SYSTEM.md` §11 for the open limitation.)

**Avoid confusing with:** The *Z Operating System*, which is not itself a Company (see System-level terms above).

### Brand

**Definition:** A public-facing identity used to present a Company or Product to the market. A Company may operate under one or more brands (e.g. "Coleção Privada / Private Collection / Collection Privée" as a brand line within Z Imobiliária).

**Related concepts:** Company, Product.

**Canonical usage:** "Coleção Privada is a Brand, not a separate Company."

**Avoid confusing with:** *Product*, which is a specific offering, not an identity.

### Product

**Definition:** A specific offering created and delivered by a Company under a Brand (e.g. a valuation tool, a specific development being marketed).

**Related concepts:** Company, Brand, Service.

**Canonical usage:** "The free valuation tool is a Product of Z Imobiliária."

**Avoid confusing with:** *Service*, which is the technical implementation of a Product's capabilities.

---

## Registry terms

### Registry

**Definition:** The domain and canonical layer that holds identity, authoritative state, and relationships of entities relevant to the Z ecosystem. Registry answers "what exists, and what is the truth about it" — it does not hold observations or analytics about those entities.

**Related concepts:** Entity, Identity, Provenance, Data.

**Canonical usage:** "The property's canonical record lives in the Registry; its view-count history lives in Data."

**Avoid confusing with:** *Data*, which holds observations, measurements and events about entities the Registry defines — not the entities' identity or authoritative state itself.

### Entity

**Definition:** Anything that can be identified, referenced and tracked over time within the Registry — an organization, company, brand, product, partner, property, development, project, market, or dataset.

**Related concepts:** Identity, Asset, Registry.

**Canonical usage:** "A property is an Entity; its price history is Data about that Entity."

**Avoid confusing with:** *Asset*, which is a specific kind of Entity with ownership and value (not every Entity is an Asset — a Market is an Entity but not an Asset).

### Asset

**Definition:** An Entity that has ownership and economic/transactional value, and can be represented and transacted within the ecosystem. Property and Development are today's Asset subtypes; the category is not limited to real estate — see `20-registry/ENTITY-ASSET-MODEL.md`.

**Related concepts:** Entity, Ownership, Registry.

**Canonical usage:** "A listed property is an Asset represented in the Registry."

**Avoid confusing with:** *Entity* in general — every Asset is an Entity, but not every Entity is an Asset.

### Identity

**Definition:** The unique, stable reference that lets an Entity be recognized consistently across domains and over time (an identifier plus the minimal defining attributes).

**Related concepts:** Entity, Registry, Provenance.

**Canonical usage:** "Two listings for the same property must resolve to one Identity in the Registry."

**Avoid confusing with:** *Ownership*, which concerns who controls an Entity, not what makes it recognizable.

### Ownership

**Definition:** The explicit assignment of responsibility or control for an Entity, a domain, or a decision, to a specific person, role, or organizational unit.

**Related concepts:** Entity, Governance, Domain.

**Canonical usage:** "Registry ownership rules determine which representation of a duplicated property becomes canonical."

**Avoid confusing with:** *Identity*, which is about recognition, not control.

### Provenance

**Definition:** The traceable origin and history of change of a piece of information — where it came from, when, and through what process.

**Related concepts:** Traceability, Registry, Data.

**Canonical usage:** "Every Registry state change carries provenance: source, timestamp, actor."

**Avoid confusing with:** *History*, which is the record of states over time; provenance is specifically about origin and trust in that record.

### Canonical Record

**Definition:** The single, authoritative Registry entry for a given Entity's Identity — the record every other domain references when it needs "the" version of that Entity. See `20-registry/ENTITY-ASSET-MODEL.md`.

**Related concepts:** Entity, Identity, Registry, Source of Truth.

**Canonical usage:** "A Listing references the Asset's Canonical Record by Identity; it does not duplicate it."

**Avoid confusing with:** *Listing*, which is Marketplace's published, discoverable instance of an active Representation, and *Marketing Content*, which is descriptions and media created by a Representation — both reference the Canonical Record rather than being one.

### External Reference

**Definition:** A pointer from a Registry Entity to an identifier or record in a system outside the Registry's authority — a cadastral registry number, a government business registration ID, a third-party data provider's ID.

**Related concepts:** Provenance, Source of Truth, Registry.

**Canonical usage:** "A cadastral reference is an External Reference used as evidence for identity resolution, not as the Entity's Source of Truth."

**Avoid confusing with:** *Source of Truth* — an External Reference is evidence usable for identity resolution and Provenance; it is never itself authoritative. The Registry's own Identity remains the Source of Truth even when an External Reference changes or becomes unavailable.

### Property

**Definition:** A real estate Asset — residential, commercial, or land — represented as an Entity in the Registry.

**Related concepts:** Asset, Development, Entity.

**Canonical usage:** As used today across the operational website and admin panel.

**Avoid confusing with:** *Development* or *Project*, which are broader or earlier-stage than a single Property.

### Development

**Definition:** A real estate Asset composed of multiple Properties or units delivered as a coordinated whole (e.g. a residential building under construction).

**Related concepts:** Property, Project, Asset.

**Canonical usage:** "República 427 is a Development containing multiple Properties."

**Avoid confusing with:** *Project*, which may be broader than real estate delivery (e.g. a research or investment initiative).

### Project

**Definition:** A bounded initiative with a defined outcome, which may or may not produce a real estate Asset (e.g. an investment memorandum engagement, a feasibility study).

**Related concepts:** Development, Research.

**Canonical usage:** "The Almancil Senior Living feasibility study is a Project."

**Avoid confusing with:** *Development*, which specifically refers to a real estate delivery.

### Market

**Definition:** A defined geographic or segment context (e.g. "Greater Porto residential") used to scope analysis, reporting and Intelligence — itself an Entity that can be referenced.

**Related concepts:** Entity, Intelligence, Research.

**Canonical usage:** "Porto 2026 is a Market covered in a Research report."

**Avoid confusing with:** *Marketplace*, which is the transactional domain, not an analytical scope.

---

## Data & knowledge terms

### Data

**Definition:** Observations, measurements, datasets, events, and pipelines about or around Registry entities — the analytical and operational layer that sits on top of Registry identity, not the identity itself.

**Related concepts:** Registry, Dataset, Knowledge.

**Canonical usage:** "Page-view counts are Data about a Property Entity held in the Registry."

**Avoid confusing with:** *Registry*, which holds identity and authoritative state, not observations.

### Observation

**Definition:** The fundamental Data object — a single recorded fact about a Registry Entity, for a given Metric, at a point in time, from a Source. See `60-data/DATA-MODEL.md`.

**Related concepts:** Data, Metric, Dataset, Source.

**Canonical usage:** "A Property's asking price is a Metric; each recorded value of it over time is an Observation."

**Avoid confusing with:** *Evidence* — an Observation becomes Evidence only once Trust Engine judges it relevant to a specific trust question; not every Observation is Evidence.

### Dataset

**Definition:** A defined, bounded collection of Data with a known source, schema and quality level.

**Related concepts:** Data, Provenance.

**Canonical usage:** "The Supabase `properties` table backs a Dataset consumed by the static page generator."

**Avoid confusing with:** *Registry*, which is not a dataset — it is the authoritative entity layer that datasets may reference.

### Knowledge

**Definition:** Curated, human- or system-produced understanding derived from Data — guides, reports, articles — intended primarily for external/product audiences (see `70-knowledge-hub`).

**Related concepts:** Data, Intelligence, Research.

**Canonical usage:** "The Porto 2026 investment pillar article is Knowledge Hub output."

**Avoid confusing with:** *Research*, which is internal-facing strategic study, or *Intelligence*, which is the systematic/algorithmic production of insight.

### Intelligence

**Definition:** The systematic, often algorithmic, capability that turns Data and Knowledge into recommendations, scores, or predictions — including AI/ML, recommendation engines, knowledge graphs, and geospatial/market/investment intelligence. Must remain explainable (see Principles).

**Related concepts:** Artificial Intelligence, Data, Knowledge, Trust.

**Canonical usage:** "The valuation simulator is a Product powered by the Intelligence domain."

**Avoid confusing with:** *Artificial Intelligence*, which is one tool within Intelligence, not its full scope.

### Artificial Intelligence

**Definition:** Machine learning and generative models used as one implementation tool within the Intelligence domain. Never a synonym for Intelligence itself.

**Related concepts:** Intelligence, Agent.

**Canonical usage:** "This feature uses Artificial Intelligence" is more precise than "this feature is Intelligence."

**Avoid confusing with:** *Intelligence* (the domain, broader) or *Agent* (a specific AI-driven actor).

### Agent

**Definition:** A bounded, AI-assisted actor that performs a defined task under human governance — never an autonomous decision-maker for matters requiring human accountability (see Principles).

**Related concepts:** Artificial Intelligence, Governance, Human Accountability.

**Canonical usage:** "A content-generation Agent drafts a listing description; a human approves it."

**Avoid confusing with:** *Service*, which is not necessarily AI-driven.

### Source of Truth

**Definition:** The single, designated place where a given piece of information is authoritative. Every fact in the ecosystem should have exactly one Source of Truth.

**Related concepts:** Registry, Provenance, Ownership.

**Canonical usage:** "Registry is the Source of Truth for property identity; Supabase `properties` table is its current technical implementation."

**Avoid confusing with:** A *copy* or *cache* of data, which may exist in many places but is never itself the Source of Truth.

---

## Trust & marketplace terms

### Trust

**Definition:** A measurable, explainable property assigned to Entities, Partners, and content, indicating how much confidence the ecosystem and its users can place in them. Produced by the Trust Engine domain.

**Related concepts:** Trust Engine, Score, Explainability.

**Canonical usage:** "This property has a high Trust indicator because its Registry record is fully verified."

**Avoid confusing with:** *Score*, which is one mechanism for expressing Trust, not Trust itself.

### Evidence

**Definition:** A Claim, Observation, or Document that has been judged relevant to assessing a Trust Subject, and carries sufficient Provenance to be weighed by a Trust Model.

**Related concepts:** Trust, Provenance, Source of Truth.

**Canonical usage:** "Not every Data point is Evidence — only those judged relevant and sufficiently provenanced."

**Avoid confusing with:** *Data*, which is the raw observation; Evidence is Data (or a Claim/Document) once judged relevant to a specific trust question.

### Signal

**Definition:** A discrete, typed unit derived from Evidence, carrying polarity, weight and freshness, that feeds into a Trust Assessment.

**Related concepts:** Evidence, Trust, Score.

**Canonical usage:** "Identity verification is one Signal among several that combine into a Trust Assessment."

**Avoid confusing with:** *Score*, which is one possible numeric output of combining multiple Signals; a Signal is an input, a Score can be an output.

### Transparency

**Definition:** The property of making the origin, reasoning and limitations of a fact, claim or assessment visible and inspectable, rather than presenting a bare conclusion.

**Related concepts:** Provenance, Evidence, Trust.

**Canonical usage:** "Transparency requires showing why a Trust Level was assigned, not just the Trust Level itself."

**Avoid confusing with:** *Provenance*, which is the traceable origin of a specific piece of information; Transparency is the broader practice of surfacing that origin and reasoning to the user rather than hiding it.

### Partner

**Definition:** An external agency, developer, or private seller participating in the Marketplace under the ecosystem's standards, represented as an Entity in the Registry.

**Related concepts:** Marketplace, Partner Quality Score, Entity.

**Canonical usage:** As used in current partner-onboarding discussions.

**Avoid confusing with:** *Company*, which refers specifically to Z's own business entities, not third parties.

### Marketplace

**Definition:** The domain governing how Entities (properties, partners, private sellers) transact and are discovered within the ecosystem, built on Registry and Trust.

**Related concepts:** Registry, Trust Engine, Partner.

**Canonical usage:** As defined in `50-marketplace/README.md`.

**Avoid confusing with:** *Registry*, which defines what exists; Marketplace defines how it is transacted and discovered.

### Score

**Definition:** A specific, formula-derived numeric or categorical output of an evaluation process (e.g. the Partner Quality Score).

**Related concepts:** Trust, Metric, KPI.

**Canonical usage:** "Partner Quality Score is a Score; Trust is the broader property it contributes to."

**Avoid confusing with:** *Metric*, which is a raw measurement, not necessarily a synthesized evaluation.

### Metric

**Definition:** A single, directly measured quantity (e.g. response time, listing completeness percentage).

**Related concepts:** Score, KPI, Data.

**Canonical usage:** "Response time is a Metric that feeds into the Partner Quality Score."

**Avoid confusing with:** *KPI*, which is a metric selected specifically to track progress against a goal.

### KPI

**Definition:** A Metric explicitly chosen to track progress toward a defined business or operational goal, owned by the `120-operations` domain.

**Related concepts:** Metric, Operations.

**Canonical usage:** "Lead-to-visit conversion rate is a KPI tracked in Operations."

**Avoid confusing with:** *Metric* in general — every KPI is a metric, but not every metric is a KPI.

---

## Governance & decision terms

### Decision

**Definition:** A determination made by a defined authority (human or governed process) that changes how the ecosystem operates or is documented. Must be traceable to who made it and when.

**Related concepts:** Governance, Ownership, Traceability.

**Canonical usage:** "The Registry re-scope was a Decision recorded in this repository's history."

**Avoid confusing with:** A *proposal*, which is not yet a Decision until approved.

### Governance

**Definition:** The domain and process defining who can make which Decisions, and how conflicting proposals are resolved, owned by `110-governance`.

**Related concepts:** Decision, Ownership, Policy.

**Canonical usage:** As defined in `110-governance/README.md`.

**Avoid confusing with:** *Standards*, which defines conventions, not decision authority.

### Policy

**Definition:** A standing rule that constrains behavior across the ecosystem until formally changed (e.g. a data-retention policy).

**Related concepts:** Governance, Standard.

**Canonical usage:** "Data retention Policy is defined once and applied across all domains handling personal data."

**Avoid confusing with:** *Standard*, which is a convention for consistency, not necessarily a constraint with compliance implications.

### Standard

**Definition:** A defined convention (naming, structure, writing style, coding, ADR process) that keeps output consistent across the ecosystem, owned by `150-standards`.

**Related concepts:** Policy, Governance.

**Canonical usage:** As defined in `150-standards/README.md`.

**Avoid confusing with:** *Policy*, which typically has compliance or risk implications; a Standard is primarily about consistency.

### Workflow

**Definition:** A repeatable sequence of steps, human or automated, that accomplishes a defined outcome within a domain.

**Related concepts:** Capability, Service, Agent.

**Canonical usage:** "Property page generation is a Workflow triggered by Supabase webhooks."

**Avoid confusing with:** *Service*, which is the running implementation; a Workflow is the defined sequence it executes.

---

## Design & experience terms

### Design System

**Definition:** The documented set of visual tokens, principles and rules of use that keep an interface's expression consistent and coherent across the ecosystem — see `architecture/DESIGN-SYSTEM.md`.

**Related concepts:** Visual Identity, Standard, Interface.

**Canonical usage:** "The Design System defines the token architecture; a specific brand's visual identity is one expression of it."

**Avoid confusing with:** *Visual Identity*, which is a specific Brand's concrete implementation, and *Brand*, which is the public-facing identity itself, not its visual rules.

### Visual Identity

**Definition:** The concrete visual expression of a Brand or Company — specific colors, typography and imagery as actually implemented — distinct from the underlying Design System principles that govern it.

**Related concepts:** Brand, Design System.

**Canonical usage:** "Z Imobiliária's visual identity is the Z Imobiliária Brand Expression layer of the Design System."

**Avoid confusing with:** *Design System*, which defines the transversal principles and token architecture; Visual Identity is one Brand's specific implementation of it.

### User Experience

**Definition:** How a person perceives and moves through an interaction with an Interface or Product — the outcome Design and the relevant product domain jointly shape.

**Related concepts:** Interface, Product, Design System.

**Canonical usage:** "User experience principles are defined by Design; product-specific user journeys are defined by the owning product domain."

**Avoid confusing with:** *Interface*, which is the surface itself; User Experience is the quality of interacting with that surface.

## Technical terms

*(Reserved for domain-specific technical terms that recur across more than one domain. None recorded yet — add here only when a term is genuinely used in two or more domains with the same meaning.)*
