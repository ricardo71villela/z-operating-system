# Domain Model

## Purpose
Defines what qualifies as a "domain" in this repository, the criteria for creating a new one, and the specific boundary rules needed to keep closely related domains from overlapping — most importantly, the Registry/Data distinction.

## Scope
The structural definition of a domain and the rules for domain boundaries. Does not contain the content of any individual domain — see each domain's own `README.md`.

## Table of Contents
- [What Is a Domain](#what-is-a-domain)
- [Criteria for Creating a New Domain](#criteria-for-creating-a-new-domain)
- [When Something Is a Capability, Not a Domain](#when-something-is-a-capability-not-a-domain)
- [The Registry / Data Boundary](#the-registry--data-boundary)
- [Other Boundary Rules](#other-boundary-rules)
- [Open Architectural Questions](#open-architectural-questions)

## What Is a Domain

A domain is one of the top-level, numbered folders in this repository. A domain:

1. Owns a distinct set of concepts and Decisions that no other domain owns (Separation of Concerns).
2. Has a clear Purpose and Scope statement that states both what belongs and what explicitly does not.
3. Can be described in one sentence without needing "and" to join two unrelated responsibilities.
4. Is expected to accumulate real documents over time — a domain that will only ever hold a single short document is probably a Capability inside another domain, not a domain itself.

## Criteria for Creating a New Domain

A new numbered domain is justified only when **all** of the following are true:

- The concept cannot be adequately covered as a section within an existing domain's documents.
- The concept has its own stable Purpose/Scope that doesn't shift depending on which other domain is being discussed.
- The concept is expected to generate multiple documents over time, not just one.
- A Governance Decision has approved the addition (per `110-governance`).

If a concept fails any of these, it belongs inside an existing domain as a document or section, not as a new folder. This is a deliberate high bar — the gapped numbering (increments of 10) exists to make room for genuine future domains, not to encourage frequent additions.

## When Something Is a Capability, Not a Domain

A Capability (see `GLOSSARY.md#capability`) is something the ecosystem can *do*, described within the domain that owns it. Examples: "deduplication" is a capability of Registry/Marketplace; "lead notification" is a capability spanning Marketplace and Platform Engineering. Capabilities do not get their own numbered folder — they get a section or document inside the domain that owns them.

## The Registry / Data Boundary

This is the most important boundary in the current architecture and is stated here explicitly per the approved Decision:

- **Registry** = identity, canonical representation, relationships, and authoritative state of Entities. Registry answers: *what exists, and what is currently true about it.*
- **Data** = observations, measurements, datasets, events, and pipelines about or around those Entities. Data answers: *what have we recorded or measured about it, over time.*

A concrete test: if correcting a piece of information means changing what an Entity *is* (its identity or current authoritative state), it belongs in Registry. If correcting it means adding or reconciling an *observation* (a price seen on a date, a page-view count, a lead event), it belongs in Data.

Registry is the model: `Entity → Identity → Relationships → State → History → Provenance`. Data operates on top of and around Entities the Registry defines; Data never introduces a parallel identity system — every Dataset that refers to an Entity refers to its Registry Identity.

## Other Boundary Rules

- **Foundation vs. Company:** Foundation defines what the Z Operating System *is* as a system (ontology, principles, model). Company defines how a specific business (Organization, Company, Brand, Product) is represented and operates within that system. Foundation is never restated inside Company; Company references Foundation instead of redefining it.
- **Knowledge Hub vs. Research vs. Intelligence:** Knowledge Hub is curated output for external/product audiences. Research is internal strategic study (benchmarks, competitive analysis, white papers). Intelligence is the systematic/algorithmic capability that produces recommendations, scores or predictions from Data and Knowledge. The same underlying study can inform more than one of these, but each domain's *output* has a different audience and form.
- **Standards vs. Governance:** Standards defines the convention (e.g. how an ADR is formatted). Governance defines the process for approving a change to that convention. A disagreement about *what* the naming convention should be is a Standards question; a disagreement about *who gets to change it* is a Governance question.
- **Design and its neighbors:** Design owns visual language, design principles, experience principles, design tokens, interaction patterns at the conceptual level, and visual expression foundations — see `130-design` and `architecture/DESIGN-SYSTEM.md`. It does not own: brand identity, company positioning, or business identity (that's `10-company`); product requirements, product-specific workflows, or domain-specific user journeys (that's the relevant product domain, e.g. `50-marketplace`); content or knowledge itself (that's `70-knowledge-hub` — Design owns how content is presented, never authority over the content); technical implementation, component code, frontend infrastructure, performance, or technical accessibility implementation (that's `90-platform-engineering`); or approval of exceptions and decision authority regarding deviations from established design standards (that's `110-governance`).

## Open Architectural Questions

- **Trust Engine vs. Partner Quality Score:** Whether Partner Quality Score remains an independent domain, becomes a Capability of Trust Engine, or is absorbed into it, is an open question. **Status: Open Architectural Question.** Provisional relationship: Trust Engine defines trust models, signals, evidence and evaluation in general; Partner Quality Score is a specific scoring framework applied to partners, built on top of it. No ADR has been created for this; none should be until real scoring content exists to test the boundary against.

## Status
Draft

## Last Updated
2026-07-19

## Related Domains
- `20-registry`
- `60-data`
- `10-company`
- `30-trust-engine`
- `40-partner-quality-score`
- `110-governance`
- `150-standards`
- `130-design`
- `90-platform-engineering`
- `70-knowledge-hub`
