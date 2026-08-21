# Z Operating System — ZOS

ZOS is the shared operating system and engineering platform for the Z ecosystem.

This repository combines two complementary layers:

1. **Strategic architecture and governance** — principles, domain models, standards, security, data, intelligence and operating rules.
2. **Operational product engineering** — independent products, shared packages, database infrastructure and CI/CD that implement those rules.

The repository is the intended **single source of truth** for the Z ecosystem.

> **One ecosystem. Multiple independent products. Shared capabilities. Separate domain ownership.**

---

## Active products

### Independent marketplace verticals

- **Z Find** — real estate marketplace.
- **Z Mobility** — automotive marketplace and automotive-data platform.
- **Z Jobs** — employment marketplace.
- **Z Fashion** — fashion and lifestyle multi-partner marketplace.

Each marketplace owns its own domain semantics, product experience, business lifecycle and vertical data. ZOS may provide shared identity, Registry, Geography, Consent, Trust, audit and other approved cross-product capabilities without taking ownership of vertical semantics.

### Horizontal ZOS product

- **Z Studio** — cross-platform content-creation product distributed across Web, Apple, Google Play and Microsoft/PWA surfaces. It is part of the ZOS ecosystem but is not modelled as a marketplace vertical.

### Future concepts

- **Z Living** — future product concept.
- **Z Finance** — future product concept; any regulated financial capability requires its own legal and architectural gate before implementation.

---

## Architectural constitution

ZOS follows Architectural Constitution v1.1 and the repository-wide principles in `00-foundation/`.

Core invariants include:

- platform capabilities and product ownership remain explicitly separated;
- canonical identity is shared only where stable cross-product identity is required;
- Registry answers **“what is it?”**;
- Data Observations answer **“what was observed about it?”**;
- product-specific lifecycles remain product-owned;
- cross-product activation requires explicit consent;
- AI may assist interpretation and processing but does not automatically author canonical truth;
- integration messages are transport mechanisms, not a universal semantic Event model;
- shared intelligence does not imply shared ownership of product semantics;
- every authoritative fact has one designated source of truth.

See also `150-standards/MONOREPO-CONTRACT.md` for the operational contract applied to every product in this monorepo.

---

## Repository structure

```text
00-foundation/                    ZOS principles and system/domain models
10-company/                       company context
20-registry/                      canonical entity/asset identity model
30-trust-engine/                  shared trust model
40-partner-quality-score/         partner quality model
50-marketplace/                   shared marketplace concepts
60-data/                          shared data concepts
70-knowledge-hub/                 knowledge domain
80-intelligence/                  intelligence domain
90-platform-engineering/          platform engineering guidance
100-security/                     cross-cutting security
110-governance/                   governance and decisions
120-operations/                   operations
130-design/                       cross-cutting design
140-roadmaps/                     product and ecosystem roadmaps
145-research/                     research
150-standards/                    repository and engineering standards
160-legal-and-compliance/         legal/compliance guidance

apps/
  find/                           Z Find
  mobility/                       Z Mobility
  jobs/                           Z Jobs
  studio/                         Z Studio
  fashion/                        Z Fashion

packages/                         genuinely shared ZOS packages/fixtures
infrastructure/supabase/          integrated shared Supabase authority
.github/workflows/                product and ecosystem CI gates
```

Internal product topology is intentionally allowed to differ when required by the runtime. Z Jobs and Z Fashion use nested `apps/` and `packages/`; Z Mobility is a Next.js-oriented application with automotive pipelines; Z Find retains controlled legacy/consolidation structure; Z Studio contains Web/backend/commercial/native/PWA surfaces. The common requirement is the operational contract, not identical folders.

---

## Database authority

`infrastructure/supabase/migrations/` is the **integrated ZOS Supabase migration authority**.

Product-local migration folders may remain for historical development, isolated tests or compatibility, but they are not the integrated production deployment authority unless Governance explicitly declares otherwise.

No migration is considered ecosystem-safe merely because it passes in one product branch. Changes that touch shared infrastructure must pass the complete ordered migration chain after convergence with other active shared-infrastructure work.

---

## Root quality gates

The root package exposes ecosystem-level commands:

```bash
npm ci
npm run zos:setup
npm run zos:check
npm run zos:test
npm run zos:build
```

`zos:check` is intended to cover all five active products. Product-specific workflows remain authoritative for deeper vertical checks such as PostgreSQL/RLS, browser, native-store or release contracts.

A green ecosystem gate must not silently exclude an active product.

---

## Current integration rule

Long-running product branches may evolve independently, but branches that both modify shared infrastructure must converge on a neutral integration branch and prove the combined tree before either line can be promoted to `main`.

No force-push, history rewrite, production deployment or live database mutation is required for that convergence.

---

## Status

Active monorepo. Architecture and product implementation evolve through controlled, forward-only changes.

## Last Updated

2026-08-21
