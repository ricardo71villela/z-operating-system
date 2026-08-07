# Z Find — ZOS v1.1 Validation

## Repository quality gate

Run from repository root:

```bash
npm ci
npm run check
npm run build:zfind
npm run build:admin
npm run build:partner
```

`npm run check` validates:
- Geography Import Engine v2 regression suite
- archived Import Engine v1 regression suite
- SEO page generator unit suite
- ZOS v1.1 contract tests
- JavaScript syntax across apps/packages/scripts/tests
- sequential/additive migration policy
- presence of required ZOS alignment artifacts

## Validation performed during ZOS v1.1 alignment

Passed without installed third-party dependencies:
- Import Engine v2: **55/55**
- Import Engine v1 archive regression: **42/42**
- SEO page generator: **28/28**
- ZOS alignment contracts: **6/6**
- JavaScript syntax: **71 files**
- Supabase migrations: **13 sequential/additive migrations**

Total executed assertions in these suites: **131 passed**.

## Environment-limited gates

`npm ci` could not complete in the isolated audit environment because its npm
mirror returned HTTP 404 for `tslib@2.8.1`. Consequently Playwright/browser
checks and builds that require installed dependencies were not executed here.
This is an environment/package-mirror limitation, not a failing test observed in
Z Find.

After unpacking on a normal development machine, run the commands above. Apply
migrations `0008`–`0013` first to local/staging Supabase/Postgres and validate
RLS/policies before production.
