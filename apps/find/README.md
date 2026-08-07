# Z Find Platform

**Status: Sprint A locally complete — GitHub activation pending.**

This repository consolidates, for the first time, artifacts that were previously only ever delivered as standalone downloads across multiple work phases: the Z Find prototype, the Data Import Engine (v2, hardened), and the archived v1 proof of concept.

## What Sprint A did

- Copied every approved artifact into a real directory structure, with checksum verification against the source at every step (see `docs/consolidation/ARTIFACT-INVENTORY.md`).
- Discovered and corrected a real build-reproducibility gap (a 9th source artifact, `path_data.txt`, was never delivered as its own file — see `apps/zfind-web/README.md`).
- Replaced the ad hoc manual build process with a deterministic script (`apps/zfind-web/scripts/build.js`) that fails hard rather than silently on any inconsistency.
- Re-ran every existing test suite from its new location, fixing only path references (never logic): 55/55 (Import Engine v2 integration), 42/42 (archived v1), 15/15 (browser).
- Archived Import Engine v1 with an explicit `ARCHIVED.md` explaining why it's kept and why it's superseded.

## What Sprint A explicitly did NOT do

- Did not connect the Import Engine to the real Geography module (`packages/geography/geography.js` and `apps/zfind-web/src/geography.js` are intentionally still two byte-identical copies — deduplication is Sprint B).
- Did not add persistence.
- Did not add product functionality.
- Did not modify runtime behavior anywhere.

## Repository layout

```
apps/zfind-web/       — the Z Find prototype (source + deterministic build)
packages/geography/    — Geography bounded context (copy, see above)
packages/import-engine/ — Data Import Engine v2 (canonical)
archive/import-engine-v1/ — superseded proof of concept, kept for traceability
tests/{integration,browser}/ — test suites, run from their consolidated locations
docs/                 — architecture docs, ADRs, consolidation records
.github/workflows/    — CI configuration (not yet active — see below)
```

## On CI status

A GitHub Actions workflow (`.github/workflows/ci.yml`) is included and every one of its steps has been run manually in the development sandbox with passing results (see `docs/consolidation/CI-LOCAL-EXECUTION-REPORT.md`). It has **not** run as actual GitHub Actions, because this repository has not yet been pushed to GitHub. Sprint A is not formally closed until that push happens and the workflow goes green there.

---

## ZOS Architectural Constitution v1.1 baseline

This repository is aligned incrementally with **ZOS Architectural Constitution v1.1**.
Existing Z Find identities and marketplace behavior are preserved; shared-platform
concerns are introduced through compatibility bridges and explicit boundaries.

Key documents:
- `docs/architecture/ZOS-ALIGNMENT-v1.1.md`
- `docs/architecture/IMPLEMENTATION-MAP-ZOS-v1.1.md`
- `docs/architecture/VALIDATION-ZOS-v1.1.md`
- `docs/ADR-0001-zos-v1.1-convergence.md`

Quality gate:

```bash
npm ci
npm run check
```

Apply Supabase migrations `0008`–`0013` to local/staging before production.
