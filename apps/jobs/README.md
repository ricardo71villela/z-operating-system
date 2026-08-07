# Z Jobs

Z Jobs is the Employment vertical of the Z Operating System (ZOS) ecosystem.
This repository owns employment-specific semantics while progressively converging
with shared ZOS capabilities according to the **ZOS Architectural Constitution
v1.1**.

The launch scope covers Portugal, Italy, Spain, France and Germany. Candidates
use the platform free of charge; employers receive the first published offer free
once verified, with billing rules applying from the second offer onward.

## Architecture status

The repository contains a real backend foundation, a pure TypeScript domain
package, versioned PostgreSQL migrations, RLS policies, a Postgres vertical slice,
public marketing pages and an operational web prototype.

The ZOS v1.1 alignment is **progressive, not a rewrite**:

- existing local UUIDs and foreign keys are preserved;
- persons, organizations and locations can attach future canonical ZOS Registry IDs;
- Job Offer and Application keep their own independent state machines;
- state history and organization verification assessments are explicit;
- sourced facts can be represented as Data Observations with provenance;
- integration uses a technical message/outbox boundary, not a universal Event model;
- employment rules, matching, salary logic and candidate/employer semantics remain in Z Jobs.

See `docs/architecture/ZOS-ALIGNMENT-v1.1.md`.

## Repository structure

```text
apps/
  api/        Node HTTP API + Postgres store
  web/        operational portal prototype
  montra/     public marketing pages
packages/
  domain/     pure employment-domain TypeScript rules
    src/zos/  ZOS v1.1 compatibility primitives (candidate for later promotion)
migrations/   ordered PostgreSQL migrations (0001..0030)
seeds/        development/reference data
local-dev/    minimal Supabase Auth stub for local Postgres/CI
tools/        ingestion/reference-data tools
docs/         architecture, legal, Postgres/RLS and audit documentation
```

## ZOS ownership boundary

### Shared-platform candidates

Person identity, Organization identity/memberships, Geography/Locale/Currency,
Audit mechanics, Registry references, Data Observation/provenance mechanics and
integration transport.

### Z Jobs-owned domain

Candidate profiles, Employer Profiles, Job Offers, Applications, Occupations,
Salary References, Employment Matching, Candidate Scoring, Labor Intelligence,
Employer Responsibility and institution/employment workflows.

No component is promoted to shared ZOS code merely because it looks reusable.
Promotion requires demonstrated reuse by at least two verticals.

## Local setup

### 1. Database

```bash
psql -c "CREATE DATABASE zjobs;"
psql -d zjobs -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
psql -d zjobs -f local-dev/00_supabase_stub.sql
```

### 2. Apply migrations in order

```bash
for f in $(ls migrations/*.sql | sort); do
  psql -d zjobs -v ON_ERROR_STOP=1 -f "$f"
done
```

### 3. Development data

```bash
for f in seeds/dev_seed_*.sql; do
  psql -d zjobs -v ON_ERROR_STOP=1 -f "$f"
done
```

### 4. Domain dependencies and validation

```bash
cd packages/domain
npm install
npm run typecheck
npm test
```

### 5. API

```bash
cd ../../apps/api
npm ci
npm run typecheck
DATABASE_URL="postgresql://zjobs_app:zjobs_app_dev_pw@localhost:5432/zjobs" npm start
```

Without the full Supabase Auth environment variables the repository retains its
local development authentication path. See `.env.example` and
`docs/POSTGRES-INTEGRATION.md`.

## Validation

CI validates domain rules and the Postgres/RLS vertical slice. The ZOS alignment
also adds strict typecheck gates for the domain and API.

See `docs/architecture/VALIDATION.md` for the exact validation state of this
adapted repository.

## Key documentation

- `docs/architecture/ZOS-ALIGNMENT-v1.1.md`
- `docs/architecture/IMPLEMENTATION-MAP.md`
- `docs/architecture/VALIDATION.md`
- `docs/ADR-0003-zos-v1.1-convergence.md`
- `docs/POSTGRES-INTEGRATION.md`
- `docs/legal/TERMOS-DE-SERVICO.md`
- `docs/legal/POLITICA-DE-PRIVACIDADE.md`
- `docs/AUDITORIA-TECNICA-2026-08.md` (historical audit; some counts/statuses predate migrations 0027–0030)

## Production caution

Migrations `0027`–`0030` are additive compatibility migrations. Apply them to
local/staging first, review the schema diff and RLS behaviour, then promote to
production. Do not delete the pre-ZOS tables or IDs during this convergence phase.
