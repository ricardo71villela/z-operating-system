# Z Studio — AI backend authority

This directory is the server-side boundary for Z Studio AI features. The browser and Capacitor builds never receive provider credentials.

## Production architecture

- Runtime: Vercel Function (`api/ai.js`)
- Gateway: Vercel AI Gateway, Anthropic Messages-compatible endpoint
- Default model: `anthropic/claude-3-haiku` (kept as the current authority until the live cost/quality gate explicitly changes it)
- Client contract: `POST /api/ai` with `system`, `user`, and optional `max_tokens`
- Hard output ceiling: 1200 tokens per request
- Upstream timeout: 20 seconds

The model may be changed without a source edit by setting `AI_MODEL` to a valid Gateway model id such as `creator/model-name`. Any model change still requires a release-quality and cost review.

## Environment variables

### Required

`AI_GATEWAY_API_KEY`

A Vercel AI Gateway API key used to authenticate the request to the Gateway. The legacy variable name `ANTHROPIC_API_KEY` is accepted temporarily as a compatibility fallback so existing production does not break during migration, but it must be retired after `AI_GATEWAY_API_KEY` is confirmed live.

Provider BYOK credentials are a separate concern: if Z Studio uses an Anthropic provider key, configure it through Vercel AI Gateway BYOK rather than treating the provider key as the Gateway authentication key.

### Optional

`AI_MODEL`

Overrides the default Gateway model id.

`ALLOWED_ORIGINS`

Comma-separated additional origins. The function already trusts the canonical Z Studio web origin plus the Capacitor origins used by the current native configuration:

- `https://z-studio-web.vercel.app`
- `capacitor://localhost`
- `https://localhost`

The list is additive and fail-closed: an empty/missing `ALLOWED_ORIGINS` no longer means "allow every browser origin".

## Security and cost controls implemented in code

- provider/Gateway credential stays server-side
- browser origins are explicitly allowlisted
- invalid origins are rejected before inference
- request body type and length validation
- hard output-token ceiling
- 20 second upstream timeout
- `Cache-Control: no-store`
- provider/billing details are logged server-side but never returned to clients
- safe error codes for configuration, provider, timeout and rate-limit failures
- request ids for support/debugging
- structured logs record latency and token usage when the Gateway returns usage metadata; prompt contents are not logged
- a 12 requests/minute/IP in-memory limit remains as a secondary local backstop

## Commercial blockers that code alone cannot truthfully solve

### 1. AI Gateway billing/credits

A production request must succeed against the current Vercel team billing state. Previous runtime evidence showed Gateway 403 responses related to free-tier/model access and card/credit verification. A READY deployment is not proof that inference is commercially available.

### 2. Distributed abuse protection

The in-memory map is not authoritative across multiple Vercel instances. Before commercial launch, configure a Vercel WAF rate-limit rule for `POST /api/ai`. This is the distributed cost-control layer; the code map is only defense in depth.

### 3. Paid-user entitlement

Z Studio does not yet have a user/account or store-receipt authority in this standalone architecture. CORS and IP rate limiting are not authentication. Do not claim paid-user entitlement until the commercial identity/subscription or store-receipt mechanism exists and is validated.

## Validation

From `backend/`:

```sh
npm run check
npm test
```

The repository also contains `.github/workflows/zstudio-ai-authority.yml`, which runs the same contract on backend changes and pull requests to `master`.
