# Z Intelligence

Z Intelligence is a vertical product of the Z Operating System (ZOS) ecosystem. It is in **early stage**: a Next.js scaffold registers the product's structure, ownership boundary and quality gate, and its first real feature — a market-intelligence data ingestion pipeline — has landed under `pipelines/`.

## Architecture status

**Early stage.** The customer-facing surface (`src/`) is still a placeholder page; no UI features exist yet. The first functional piece is a standalone Python data-ingestion pipeline under `pipelines/`, independent of the Next.js runtime (see "Project structure" below).

## Scope

Z Intelligence's product scope (target users, full feature set) is still being defined incrementally, feature by feature, rather than assumed upfront.

The first feature is **real-estate market-intelligence ingestion**: a pipeline that ingests public French open data (BAN addresses, DVF notarial transactions, ADEME DPE energy diagnostics) for a defined set of communes, and produces prioritized prospecting lists, per-street pricing grids and market statistics. See `pipelines/prospection-immobiliere-74200-74500/README.md` for the full pipeline documentation (in French, matching its data sources and intended local users).

Related domain governance: `80-intelligence/` defines ecosystem-wide principles for AI/ML, recommendation engines, knowledge graphs and geospatial/market intelligence used across ZOS products. This ingestion pipeline is Z Intelligence's first concrete implementation of that domain's "geospatial/investment/market intelligence" scope.

## Project structure

```text
apps/intelligence/
  src/app/                        placeholder Next.js surface (no features yet)
  pipelines/
    prospection-immobiliere-74200-74500/   real-estate market-intelligence ingestion (Python, standalone)
```

Per `150-standards/MONOREPO-CONTRACT.md` §1, a product may use different internal structures per runtime shape — this pipeline is plain Python (pandas/requests), independent of the product's Next.js app, and does not participate in the root npm workspace.

## ZOS ownership boundary

### Reused shared ZOS capabilities (expected, not yet integrated)

Canonical shared identity, Registry bindings and other approved ZOS Core capabilities will be reused rather than duplicated once Z Intelligence integrates with shared infrastructure. No shared capability has been wired in yet.

### Z Intelligence-owned domain

- Market-intelligence data ingestion (real-estate pricing/scoring pipeline, first instance).
- No shared ZOS package owns this vertical's semantics. It does not currently share data or database authority with Z Find; any future convergence (e.g. feeding Z Find with market intelligence) is a separate Governance decision.

## Local setup

From the repository root, for the Next.js scaffold:

```bash
npm ci
npm run intelligence:typecheck
npm run intelligence:test
```

For the real-estate ingestion pipeline:

```bash
cd apps/intelligence/pipelines/prospection-immobiliere-74200-74500
pip install -r requirements.txt
python src/main.py
```

It can also be run on demand from GitHub Actions via the "Z Intelligence — Prospection Immobiliere 74200/74500" workflow (`workflow_dispatch`).

## Integrated database authority

No database schema exists yet. The ingestion pipeline currently writes to local CSV/PDF/GeoJSON files only (`pipelines/.../output/`); no Supabase table has been created. When Z Intelligence needs persistence, integrated migrations must live under `infrastructure/supabase/migrations/`, per `150-standards/MONOREPO-CONTRACT.md`.

## Quality gates

```bash
npm run intelligence:typecheck
npm run intelligence:test
```

Both currently pass trivially (the Next.js surface has no code/tests beyond the scaffold). The pipeline has its own Python tests (`pipelines/prospection-immobiliere-74200-74500/src/test_pricing.py`, `test_argumentaire.py`) runnable directly with `python <file>`; they are not yet wired into the root Node-based `zos:check` gate, since that would require a Python runtime step in the root CI. This is noted as follow-up work, not silently assumed done.

## Status

Draft — Next.js surface is a scaffold; the real-estate ingestion pipeline is a working first feature.

## Last Updated

2026-09-06
