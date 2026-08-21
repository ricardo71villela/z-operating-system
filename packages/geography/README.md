# ZOS Geography Fixture

`geography.js` is a shared **offline/unit-test fixture module** used by product-domain tests and compatibility code.

It is deliberately **not an npm workspace package** and deliberately **not the canonical runtime Geography source of truth**.

Canonical runtime Geography lives in the shared ZOS Supabase model (`zos.geography_locations`, `zos.geography_names` and related integrated migrations under `infrastructure/supabase/migrations/`).

The fixture may mirror stable conventions such as ISO-3166-1 alpha-2 `country_iso` values so that pure domain tests can run without network/database I/O. It must not gain vertical-specific semantics and must not be treated as authoritative data merely because more than one product imports it by repository path.

If a future shared runtime/client package is genuinely required, it should be introduced as a separate governed `@zos/*` package with its own consumers, contract and lockfile integration rather than promoting this fixture implicitly.

## Status

Non-authoritative shared test/compatibility fixture.

## Last Updated

2026-08-21
