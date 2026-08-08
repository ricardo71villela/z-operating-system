# Browser Configuration Strategy for Supabase Client Injection

## The problem

`services/supabaseClient.js` reads `process.env.SUPABASE_URL` / `process.env.SUPABASE_ANON_KEY` — correct and testable in Node, but `process.env` does not exist in a browser. The standalone `dist/z-find-prototype.html` (built by `apps/zfind-web/scripts/build.js`) has no Node runtime once shipped — it is a static file opened directly or served as-is.

## Proposed approach: build-time placeholder injection

`apps/zfind-web/scripts/build.js` already has an established, approved pattern for exactly this problem: it reads `path_data.txt` and replaces a literal `__PATH_D__` placeholder in `body.html`, failing hard if the placeholder is missing or left unresolved (see Sprint A's build reproducibility correction). The same mechanism extends cleanly to configuration:

1. `src/config.template.js` (new, committed) contains:
   ```js
   window.__ZFIND_CONFIG__ = {
     supabaseUrl: '__SUPABASE_URL__',
     supabaseAnonKey: '__SUPABASE_ANON_KEY__',
   };
   ```
2. At build time, `build.js` reads `process.env.SUPABASE_URL` / `process.env.SUPABASE_ANON_KEY` (from the *builder's* environment — the person or CI running the build, never from source) and replaces the two placeholders, exactly as it already does for `__PATH_D__` — same hard-fail rule: build refuses to produce output if either variable is unset, or if either placeholder survives the replacement.
3. The browser-side `supabaseClient.js` (a small adaptation of the Node version) reads `window.__ZFIND_CONFIG__` instead of `process.env` — same validation, same error messages, same defensive check against an accidentally-pasted service_role key.

## What this achieves

- **No secret committed to source** — `config.template.js` contains only placeholders; the real values live in the builder's `.env` (already gitignored), never in a tracked file.
- **Consistent with the existing, already-approved build discipline** — no new mechanism invented, just the same one applied twice.
- **Safe to expose once built** — the values injected are the URL and *publishable* key only, which are meant to be public (subject to RLS, never a bypass of it) — this is not a "secret leak," it's the intended, documented client-side configuration.

## What this does NOT do

Does not solve secret management for a future server-side component (if one is ever added) — that would need real environment-variable injection at deploy time (Vercel/Netlify env vars), not a build-time text substitution. Out of scope for the current static-file architecture.

## Status

Proposed, not implemented. Implementing this is part of the full async marketplace migration (explicitly not started yet, per the CTO's instruction to stop before that point).
