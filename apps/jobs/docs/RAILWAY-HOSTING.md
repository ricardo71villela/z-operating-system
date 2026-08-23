# Z Jobs — Railway hosting authority

## Scope

Z Jobs uses Railway as the official hosting platform for the API, operational Web portal and public Montra.

This document defines the repository-side deployment contract only. It does not prove that a Railway project, variables, domains or a production deployment are currently active.

## Service topology

### 1. `zjobs-api`

- Railway source root: repository root `/`.
- Railway config file: `/apps/jobs/apps/api/railway.json`.
- Build: `npm run jobs:typecheck`.
- Start: `npm run start --workspace=@zjobs/api`.
- Health check: `/health`.

The API must use the monorepo root because it imports the Z Jobs domain workspace. Do not set the API source root to `/apps/jobs/apps/api`; Railway would then exclude required sibling workspace files.

Production/shared-ZOS runtime requires the environment described in `apps/jobs/.env.example`, including the database, shared Jobs schema and Supabase Auth server configuration. Secrets remain Railway environment variables and must never be committed.

### 2. `zjobs-web`

- Railway source root: `/apps/jobs/apps/web`.
- Railway config file: `/apps/jobs/apps/web/railway.json`.
- Dockerfile: builds `ZJobsDemo.jsx` into a browser bundle using pinned React/lucide/esbuild tooling, then serves it with Caddy.
- Health check: `/health`.
- Browser API base: `/api`.
- `/api/*` is reverse-proxied over Railway private networking to the API service.

Required Railway variable:

```text
ZJOBS_API_PRIVATE_URL=<private HTTP origin of zjobs-api>
```

Use a Railway service reference/private-domain value rather than a public URL when the API and Web services share the same Railway project/environment. The Caddy route strips `/api` before proxying, so `/api/job-offers` reaches the API as `/job-offers`.

This same-origin gateway avoids browser CORS coupling between independently deployed Railway services.

### 3. `zjobs-montra`

- Railway source root: `/apps/jobs/apps/montra`.
- Railway config file: `/apps/jobs/apps/montra/railway.json`.
- Dockerfile: serves the static public pages with Caddy.
- Health check: `/health`.
- Clean routes preserved:
  - `/candidatos` -> `/candidatos.html`
  - `/empregadores` -> `/empregadores.html`
  - `/ferramentas` -> `/ferramentas.html`

The historical `vercel.json` remains in the source during migration/reconciliation; it is not the Railway authority and may be removed only after Railway cutover is independently verified.

## Railway settings checklist

For each service, connect the same GitHub repository and set the Source Root / Config File exactly as above. Railway Config-as-Code does not automatically follow a custom Root Directory, so the config path must be selected explicitly where required.

Use separate domains for the public Montra and operational Web portal if desired. The API may remain public for integrations or private-only behind the Web gateway depending on the final API exposure decision; that is an operational decision, not encoded here.

## Validation boundary

Repository validation checks that:

- the API Railway config still points to the correct monorepo commands and `/health`;
- Web has a Docker/Caddy build, a `/health` endpoint and the private `/api` reverse proxy;
- Montra has a Docker/Caddy static deployment and preserves its clean routes.

A repository PASS is not a Railway deployment PASS. Final hosting closure requires observing each Railway service deployed successfully and then performing HTTP smoke checks against the Railway domains.
