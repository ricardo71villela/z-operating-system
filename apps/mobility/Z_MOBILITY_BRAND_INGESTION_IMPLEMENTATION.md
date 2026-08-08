# Z Mobility — Manufacturer-wide ingestion

This implementation changes the normal ingestion unit from one model to one complete manufacturer catalogue.

## What is implemented

- Manufacturer-wide CLI input; `modelSlug` and `modelName` are optional diagnostic filters.
- BMW Portugal catalogue discovery from the official all-models page.
- One `ManufacturerSource` per discovered official model/variant page.
- Source identity preserved through attachments, downloads and extraction.
- HTML requests cached during attachment discovery; no second download of the same page.
- Manufacturer-specific attachment filtering delegated to the BMW adapter.
- Every extracted HTML document is sent to generation; the first-document limitation is removed.
- Per-document generation reports plus deterministic manufacturer-wide record consolidation.
- Duplicate records removed by `externalId`.
- BMW technical-page parser for attribute/value tables.
- Optional `minConfidence` filter.
- Generated records returned by the pipeline.
- Non-dry runs send generated records to the existing staging importer.
- SQL source registration for BMW.
- BMW catalogue and parser tests.

## Install the files

Overlay the contents of the delivered ZIP on the repository root.

## Register the BMW source in Supabase

Execute:

`scripts/automotive/sql/insert-bmw-source.sql`

## Validate locally

```bash
npx tsc --noEmit
npm run test:automotive
git diff --check
```

## Complete BMW dry run

```bash
npm run automotive:ingest -- \
  --manufacturer bmw \
  --market PT \
  --model-year 2026 \
  --min-confidence 0.5 \
  --dry-run
```

## Optional single-model diagnostic run

```bash
npm run automotive:ingest -- \
  --manufacturer bmw \
  --market PT \
  --model-slug i5 \
  --model-name "BMW i5" \
  --generation G60 \
  --model-year 2026 \
  --dry-run
```

## Import BMW into staging

After reviewing the dry-run output, remove `--dry-run`:

```bash
npm run automotive:ingest -- \
  --manufacturer bmw \
  --market PT \
  --model-year 2026 \
  --min-confidence 0.5
```

This writes only to the existing staging/import layer. Generated records continue to require legal review and are not automatically published.

## Validation performed in the delivery environment

- `git diff --check`: passed.
- Syntax/transpile validation for every changed TypeScript file: passed.
- Static TypeScript validation of all `scripts/automotive/**/*.ts`: passed using the repository contracts and temporary declarations for dependencies whose compiled runtime files were incomplete inside the uploaded ZIP.

Run the repository's normal `npx tsc --noEmit` and `npm run test:automotive` commands on the development machine, where the complete installed dependencies are available.
