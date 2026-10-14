# Z Fashion Partner API

Node HTTP API for Partner onboarding, catalog, stock, Corners, shipments, returns, commissions, client accounts and the public catalog read surface.

## Modes

| Mode | When | Authentication |
| --- | --- | --- |
| In-memory | `DATABASE_URL` not set | None. For local development and `tests/api.test.js` only. |
| Database | `DATABASE_URL` set | **Required.** The server refuses to start without Supabase Auth, and refuses requests with 503 if it is missing at runtime. |

A disposable local database can run without authentication by setting `FASHION_ALLOW_UNAUTHENTICATED=1`. Never set it on a deployed server.

## Environment

| Variable | Required in database mode | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection (privileged; bypasses RLS, so every route authorizes in code). |
| `SUPABASE_URL` | yes | Supabase project URL, used to verify access tokens. |
| `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`) | yes | Public key used with `SUPABASE_URL` for token verification. |
| `FASHION_ADMIN_USER_IDS` | for admin actions | Comma-separated Supabase auth user ids allowed to approve, reject or suspend Partners. Empty means nobody can. Temporary until ZOS has an admin-role model. |
| `FASHION_ALLOW_UNAUTHENTICATED` | no | `1` disables authentication. Local disposable databases only. |
| `FASHION_DB_SSL_MODE`, `FASHION_DB_SCHEMA` | no | See `src/db.js`. |

## Who can call what

Requests carry `Authorization: Bearer <Supabase access token>`.

| Routes | Caller allowed |
| --- | --- |
| `POST /partners/:id/transition` | Admin (`FASHION_ADMIN_USER_IDS`) |
| `/partners/:id/...` (stock, brands, products, Corner, commission, shipments, returns) | A person who manages that Partner (ZOS membership → registry binding) |
| `POST /shipments`, `POST /returns` | A person who manages the `partnerId` in the body |
| `POST /shipments/:id/transition`, `POST /returns/:id/transition` | A person who manages the Partner that owns the record |
| `/clients/:clientId/...` (wishlist, follows, addresses) | The client themself: `clientId` must equal the caller's auth user id |
| `POST /partners` (apply), `/catalog/...`, `/products/:id`, `/health` | Public |

The decision logic lives in `src/access.js` and is covered by `tests/access.test.js` (every branch) and `tests/auth-gate.test.js` (every scoped route over HTTP, refused before any database query).

Until onboarding calls `platform_internal.link_fashion_partner_organisation()`, no Partner has a linked manager, so Partner routes return 403 once authentication is on. That is expected.
