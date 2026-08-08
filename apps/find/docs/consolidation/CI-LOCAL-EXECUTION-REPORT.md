# CI Local Execution Report

**This documents a manual, local execution of every step in `.github/workflows/ci.yml`. It is NOT a report of GitHub Actions actually running — this repository has not been pushed to GitHub. Sprint A is not formally closed until it is, and the workflow runs green there.**

## Steps executed, in order

| Step | Result | Notes |
|---|---|---|
| `actions/checkout@v4` | N/A locally | Only meaningful once pushed; the repository tree already exists locally |
| `actions/setup-node@v4` | ✅ | Node v22.22.2 available |
| `npm install` | ✅ | `playwright@1.62.0` installed, 0 vulnerabilities |
| `npx playwright install --with-deps chromium` | ⚠️ Sandbox limitation, worked around for local verification only | See below |
| `npm run build:zfind` | ✅ | 127,373 bytes, 3/3 placeholders resolved, 0 remaining |
| `npm run test:import-engine` | ✅ | 55/55 passed |
| `npm run test:import-engine-v1-archive` | ✅ | 42/42 passed |
| `npm run test:browser` | ✅ | 15/15 scenarios passed |

## The Chromium installation limitation, in detail

This development sandbox has no route to the CDN Playwright 1.62.0 needs to download its expected Chromium revision (1234). A different, older Chromium revision (1194) happens to already be cached in this sandbox from earlier work. To verify the browser test suite's *logic* locally, I temporarily added an opt-in-only environment variable override (`LOCAL_SANDBOX_CHROMIUM_PATH`) to `browser_test.js`, ran the suite once against the cached binary, confirmed 15/15 passing, and then **reverted the file to its exact original state** — verified by SHA-256 checksum match before and after (`b318c230...`, identical).

**The committed `browser_test.js` contains no trace of this workaround.** On a real GitHub Actions runner, `npx playwright install --with-deps chromium` will download the correct browser directly (runners have full internet access) — this limitation is specific to this development sandbox, not to the workflow or the test suite itself.

## What this proves, and what it doesn't

**Proves:** every test's logic passes, the build is reproducible, and the workflow's steps are individually correct and in the right order.

**Does not prove:** that GitHub Actions itself will execute this workflow successfully end-to-end — that requires an actual push and an actual run on GitHub's infrastructure, which has not happened.
