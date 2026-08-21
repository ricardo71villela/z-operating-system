# Z Find

Z Find is the real-estate marketplace vertical of the Z Operating System (ZOS) ecosystem. It owns real-estate-specific semantics, marketplace lifecycle, property/development taxonomy, partner representation rules, authoring surfaces, search/discovery behavior and jurisdiction-specific public content while progressively reusing approved ZOS shared capabilities.

## Architecture status

**Active implementation.** The original repository-consolidation Sprint A is historical and no longer represents current state.

The source now includes:

- customer-facing Z Find Web application with deterministic HTML build;
- Z Find Admin and Partner surfaces;
- hardened Import Engine and archived predecessor for traceability;
- real-estate domain package and ZOS compatibility/Registry integration;
- shared/integrated Supabase migrations for operational baseline, database convergence, partner atomic commands, lifecycle hardening, rentals, RLS, geography/markets, property taxonomy and related capabilities;
- browser, unit, integration, SEO, legal-routing and architecture-contract tests;
- multilingual/international market and legal-guide foundations.

Implementation state in source must not be confused with a claim that every migration or feature is live in production. Production database/deployment state remains independently gated.

## ZOS ownership boundary

### Reused shared ZOS capabilities

Z Find reuses or converges toward shared ZOS authority for stable cross-product concerns such as canonical Person/Organization identity, Registry references, Geography, provenance/Data Observations, Consent, audit and integration transport.

Canonical runtime Geography is owned by the shared ZOS Supabase `zos.geography_*` model. Local JavaScript geography material is a compatibility/offline fixture, not a competing runtime source of truth.

### Z Find-owned domain

Z Find retains ownership of:

- Property and Development semantics;
- real-estate typology/classification and market taxonomy;
- listings/publication/representation lifecycle;
- partner/admin authoring semantics;
- property media/content boundaries;
- sale, rental and off-market marketplace behavior;
- real-estate search/results/detail experience;
- jurisdiction-specific legal/public guide content;
- real-estate SEO and market presentation rules.

No shared ZOS package owns these vertical semantics.

## Repository layout

```text
apps/
  zfind-web/                     customer-facing marketplace
  zfind-admin/                   internal/admin surface
  zfind-partner/                 partner-facing surface
packages/
  import-engine/                 canonical import engine
  zfind-domain/                  Z Find domain rules
archive/
  import-engine-v1/              superseded proof of concept retained for traceability
content/                         governed market/legal content
config/                          Z Find configuration
docs/                            architecture, ADRs, consolidation and validation records
scripts/                         validation/connectivity/build support
tests/                           browser, unit and integration gates
```

Integrated ZOS database changes intentionally live outside this directory under:

```text
infrastructure/supabase/migrations/
```

That root directory is the integrated ZOS Supabase migration authority.

## Quality gates

From the repository root:

```bash
npm ci
npm run find:check
npm run find:build
```

The full ZOS ecosystem gate also includes Z Find via `npm run zos:check`.

## Key architecture documents

- `docs/architecture/ZOS-ALIGNMENT-v1.1.md`
- `docs/architecture/IMPLEMENTATION-MAP-ZOS-v1.1.md`
- `docs/architecture/VALIDATION-ZOS-v1.1.md`
- `docs/ADR-0001-zos-v1.1-convergence.md`

Historical consolidation reports remain useful as provenance, but they are not current status authority when they describe the repository as not yet pushed to GitHub or persistence/product functionality as absent.

## Status

Active marketplace implementation; production changes remain separately gated.

## Last Updated

2026-08-21
