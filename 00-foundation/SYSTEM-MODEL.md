# System Model

## Purpose
Describes how the domains of the Z Operating System relate to one another — as a network of dependencies, authority and flows, not as a linear pipeline. This is the conceptual model a new engineer (or an AI system) should read to understand how the ecosystem actually works.

## Scope
The relationships between domains: what depends on what, who is authoritative for which kind of information, and how data, knowledge and decisions flow between domains. Does not define what each domain contains internally — see each domain's own `README.md`, and `DOMAIN-MODEL.md` for the criteria that define a domain.

## Table of Contents
- [Why a Network, Not a Chain](#why-a-network-not-a-chain)
- [Core Domains and Their Relationships](#core-domains-and-their-relationships)
- [Cross-Cutting Domains](#cross-cutting-domains)
- [Flows](#flows)
- [Authority Map](#authority-map)

## Why a Network, Not a Chain

An earlier draft of this model proposed a linear sequence (Company → Registry → Data → Knowledge → Intelligence → Trust → Marketplace → Operations). That sequence is useful as a teaching aid for the order in which a new domain typically becomes relevant to a new initiative, but it is not how the system actually behaves: Trust depends on both Registry and Data simultaneously; Intelligence consumes Knowledge and Data and feeds back into Trust; Governance, Security, Legal & Compliance, Standards and Design act on every domain rather than at one stage. The real model is a network.

## Core Domains and Their Relationships

```
                              GOVERNANCE
                                  │
                 (approves changes to domain boundaries,
                  scoring rules, and cross-domain policy)
                                  │
        ┌─────────────┬──────────┼──────────┬─────────────┐
        │             │          │          │             │
    COMPANY  ◄───►  REGISTRY ◄──►  DATA  ◄──►  KNOWLEDGE  ◄─►  INTELLIGENCE
        │             │          │          │             │
        │             └────► TRUST ENGINE ◄─┴─────────────┘
        │                       │
        │              PARTNER QUALITY SCORE
        │                       │
        └──────────────► MARKETPLACE ◄───────────────────┘
                                  │
                             OPERATIONS
                                  │
                             ROADMAPS
```

Read this as dependency and reference, not as sequential stages:

- **Company** provides the organizational context (who Z is) that Registry represents as Entities.
- **Registry** is the identity layer every other domain references when it needs to know "which entity, exactly."
- **Data** and **Registry** reference each other constantly: Registry defines identity, Data records observations about that identity.
- **Knowledge** and **Intelligence** both consume Data, and both can feed each other — a Knowledge Hub article can be informed by an Intelligence-generated market analysis, and Intelligence can surface gaps that prompt new Knowledge content.
- **Trust Engine** depends on Registry (whose entity is this) and Data (what do we know about it), and produces the trust signals that Marketplace and Partner Quality Score consume.
- **Partner Quality Score** is a specific, narrower application built on Trust Engine's model, scoped to partners.
- **Marketplace** depends on Registry (what exists), Trust Engine (can it be trusted), and Company (whose business context it operates in).
- **Operations** sits downstream of Marketplace and Company as the domain that tracks whether the system is working as intended.
- **Roadmaps** is informed by Operations and Company, and hosts forward-looking direction, including provisional future-product concepts.

## Cross-Cutting Domains

Some domains do not sit at a stage in the network at all — they apply as constraints across every other domain simultaneously:

- **Security** — applies to every domain that stores or processes data, from the moment a capability is designed (Security by Design).
- **Legal & Compliance** — applies to every domain handling licensing, personal data, or financial regulation.
- **Governance** — applies wherever a cross-domain Decision needs to be made, at any point in the network.
- **Standards** — applies to how every domain documents itself, regardless of subject matter.
- **Design** — applies wherever a domain's output reaches a human interface, across Company, Marketplace, and Knowledge Hub alike.

These five are drawn *around* the network above, not *within* it — no domain is "downstream" of them; all domains are inside their scope at all times.

## Flows

- **Data flow:** Data domain → Registry (as observations resolve to entity updates) → Trust Engine (as signals) → Marketplace/Intelligence (as inputs to decisions or recommendations).
- **Knowledge flow:** Data + Research → Knowledge Hub (curated for external audiences) and → Intelligence (as training/reference input), kept distinct per `GLOSSARY.md#knowledge`.
- **Decision flow:** Any domain may propose a change; Governance is the domain that resolves cross-domain Decisions; Standards governs how the resulting change is documented; the change is recorded with Provenance.
- **Trust flow:** Registry correctness + Data quality → Trust Engine evaluation → expressed as Trust indicators consumed by Marketplace, and, for partners specifically, refined into a Partner Quality Score.

## Authority Map

| Question | Authoritative domain |
|---|---|
| Does this entity exist, and what is its canonical state? | Registry |
| What do we know/observe about this entity over time? | Data |
| Can this entity/partner be trusted, and why? | Trust Engine |
| How does a partner's quality translate to visibility? | Partner Quality Score |
| How does this entity get discovered and transacted? | Marketplace |
| What guides the company's decisions and direction? | Company / Roadmaps |
| Who approves a cross-domain rule change? | Governance |
| Is this legally/compliantly sound? | Legal & Compliance |
| Is this secure? | Security |

## Status
Draft

## Last Updated
2026-07-18

## Related Domains
- All domains
