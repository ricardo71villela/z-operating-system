# Z Find Web — Build Documentation

## Source manifest (14 artifacts, in read/concatenation order)

1. `src/head_top.txt`
2. `src/css_block.txt`
3. `src/body.html` (contains 3× `__PATH_D__` placeholder)
4. `src/path_data.txt` (resolves the placeholder — see below)
5. `src/vendor-supabase.js` — **new, Sprint 1.1**: Supabase JS SDK (UMD build), inlined — no external CDN dependency at runtime
6. `src/config.template.js` — **new, Sprint 1.1**: contains `__SUPABASE_URL__`/`__SUPABASE_ANON_KEY__` placeholders, resolved at build time from the builder's environment (see below)
7. `src/services/supabaseClient.js` — **new, Sprint 1.1**
8. `src/services/properties.js` — **new, Sprint 1.1**
9. `src/services/developments.js` — **new, Sprint 1.1**
10. `src/services/search.js` — **new, Sprint 1.1**
11. `src/services/auth.js` — **new, Sprint 1.1**
12. `src/geography.js`
13. `src/db.js`
14. `src/i18n.js`
15. `src/viewmodels.js`
16. `src/app.js`

(Numbering above runs to 16 because items 12–16 were the original 5 UI/data files; "14 artifacts" in the heading counts distinct new-or-original *files*, matching the Sprint A convention of counting `path_data.txt` as the 9th — see below for why that convention exists.)

## Why `path_data.txt` exists

Discovered during Sprint A: `body.html` has always depended on a traced SVG logo path that was substituted manually in every prior build, never delivered as its own file. This was a real gap — the previously-delivered "8 source files" could never actually build a working prototype standalone. `path_data.txt` closes that gap without changing any approved content: it is byte-for-byte identical to the value every prior build already used.

## Sprint 1.1 — Supabase layer added

The 5 `src/services/*.js` files were originally written and tested as Node/CommonJS modules (for `test-connectivity.js` and future server-side use). Sprint 1.1 adapted their outer loading shell (UMD-style: `module.exports` in Node, `window.ZFindServices.*` in the browser) so the exact same, already-tested files also work inside the browser build with zero bundler — their internal logic is unchanged. `vendor-supabase.js` and `config.template.js` are new files that make this possible: the SDK itself (inlined, avoiding an external CDN dependency at runtime) and the build-time config injection (same placeholder-substitution mechanism as `__PATH_D__`).

**This build now REQUIRES `SUPABASE_URL` and `SUPABASE_ANON_KEY`** to be set (via `.env` or the environment directly) — it will refuse to run without both, even though the shipped UI does not yet call into these services (that begins in Sprint 1.2). `npm run build:zfind` loads `.env` automatically via `dotenv/config`.

**The build's output bytes changed substantially starting Sprint 1.1** (+~230KB, from the inlined SDK and 5 services files) — this is expected, not a regression. Any `ZFIND_APPROVED_REFERENCE` comparison against a pre-Sprint-1.1 reference file will now correctly fail; only a Sprint-1.1-or-later reference is meaningful going forward.

## Running the build

```
npm run build:zfind
```
(equivalent to `node -r dotenv/config apps/zfind-web/scripts/build.js`, requires `.env` or exported `SUPABASE_URL`/`SUPABASE_ANON_KEY`)

Produces `apps/zfind-web/dist/z-find-prototype.html`.

## Strict validation mode

```
ZFIND_APPROVED_REFERENCE=/path/to/approved.html npm run build:zfind
```

Fails hard (non-zero exit, thrown error) if:
- any source file is missing;
- `body.html` contains zero `__PATH_D__` occurrences (unexpected shape change);
- any `__PATH_D__` placeholder remains unresolved after replacement;
- `SUPABASE_URL` or `SUPABASE_ANON_KEY` is missing from the environment;
- either Supabase config placeholder remains unresolved after replacement;
- the generated output differs from the provided reference file in any single byte.

Partial success is never reported as success.
