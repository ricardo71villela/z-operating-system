# Z Jobs — Vercel hosting

Z Jobs runs on Vercel as three projects, all connected to the same GitHub repository (`ricardo71villela/z-operating-system`, branch `main`). This document is the repository-side contract, checked by `apps/jobs/tools/verify-vercel-hosting.mjs`. It does not prove that the projects, variables or domains exist.

## 1. `z-jobs-api` — API

- Root Directory: `apps/jobs/apps/api`. Keep "Include files outside the Root Directory" on, because the API imports `apps/jobs/packages/domain`.
- Framework preset: Other. `vercel.json` sets the install and build commands.
- Build: `node vercel/build.mjs` bundles `vercel/handler.ts`, which wraps `src/server.ts`, with esbuild. It writes `.vercel/output` (Build Output API):
  - one Node 22 function (`index.func`) that receives every path;
  - the Supabase CA certificate next to the bundle.
- Health: `GET /health`.

Environment variables (Production). Secrets are entered in the Vercel dashboard and never committed:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase **session pooler** URL (Connect → Session pooler), without `sslmode` — the API sets `search_path` at connection start, which needs a session connection |
| `PG_POOL_MAX` | `1` (one connection per function instance) |
| `JOBS_DB_SCHEMA` | `jobs` (shared ZOS database) |
| `JOBS_DB_SSL_MODE` | `verify-full` (certificate checked against the bundled Supabase CA) |
| `SUPABASE_URL` | project URL |
| `SUPABASE_PUBLISHABLE_KEY` | publishable key |
| `SUPABASE_SECRET_KEY` | secret key (server only) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | transactional e-mail |

## 2. `z-jobs-app` — operational portal

- Root Directory: `apps/jobs/apps/web`. Framework preset: Other.
- Build: esbuild bundles `entry.jsx` → `dist/app.js`, and `index.html` is copied to `dist/`.
- The browser calls `/api/*` on the same origin. Vercel forwards these calls to `https://z-jobs-api-zoperatingsystem.vercel.app/*` (the project's stable team alias) (an external rewrite), so there is no CORS. If the API gets another domain, update the first rewrite in `apps/jobs/apps/web/vercel.json`.
- Any other path serves `index.html` (single-page app).

## 3. `z-jobs` — public site (montra)

- Root Directory: `apps/jobs/apps/montra`. Framework preset: Other. No build: static pages.
- Clean French routes `/candidats`, `/employeurs`, `/outils`. The old Portuguese addresses redirect permanently (301).

## Not covered here

- Custom domains: add them per project when chosen.
- Database migrations: they are applied manually in Supabase, never by a deployment.
