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
| `FASHION_ALLOWED_ORIGINS` | for the dashboards | Comma-separated origins of the Partner dashboard and admin backoffice (exact match, e.g. `https://admin.zfashion.online`). Others get no CORS headers. |
| `FASHION_PARTNER_TERMS_VERSION`, `FASHION_PARTNER_TERMS_URL` | to open store applications | Version label and https URL of the published Partner terms. Until both are set, the adhesion page says applications are not open and `POST /partner-applications` returns 503. Changing the version makes stores accept the new one. |
| `FASHION_ALLOW_UNAUTHENTICATED` | no | `1` disables authentication. Local disposable databases only. |
| `FASHION_DB_SSL_MODE`, `FASHION_DB_SCHEMA` | no | See `src/db.js`. |

## Who can call what

Requests carry `Authorization: Bearer <Supabase access token>`.

| Routes | Caller allowed |
| --- | --- |
| `POST /partners/:id/transition` | Admin (`FASHION_ADMIN_USER_IDS`) |
| `GET /admin/partner-applications[?status=]`, `GET /admin/partner-applications/:partnerId`, `POST /admin/partner-applications/:partnerId/decision` | Admin. Decisions follow the onboarding graph; rejecting or suspending needs a note (shown to the store); activating needs the stock mode. Status and note are written in one transaction. |
| `GET /partners/:id/application` | A person who manages that Partner: application status and latest decision note |
| `/partners/:id/...` (stock, brands, products, inventory, price, Corner, commission, shipments, returns) | A person who manages that Partner (ZOS membership → registry binding) |
| `POST /shipments`, `POST /returns` | A person who manages the `partnerId` in the body |
| `POST /shipments/:id/transition`, `POST /returns/:id/transition` | A person who manages the Partner that owns the record |
| `/clients/:clientId/...` (wishlist, follows, addresses) | The client themself: `clientId` must equal the caller's auth user id |
| `POST /partner-applications` | Any signed-in person: submits the adhesion form; creates the store (`applied`) and links the account to it (see migration `20261014230000_z_fashion_partner_onboarding_v1.sql`) |
| `GET /me` | Any signed-in person: returns their user id, `isAdmin` and the Partner ids they manage (grants nothing by itself) |
| `GET /onboarding/offer` | Public: offer from the database + published terms |
| `POST /partners` (apply), `/catalog/...`, `/products/:id`, `/health` | Public |

The decision logic lives in `src/access.js` and is covered by `tests/access.test.js` (every branch) and `tests/auth-gate.test.js` (every scoped route over HTTP, refused before any database query).

Only **active** stores are visible in the public catalogue (`/catalog/*`, `/products/:id`, wishlist and followed Corners); applied, under-review, approved, rejected and suspended stores are hidden.

Stores apply on `public/adhesion.html`: the account that submits the form becomes the store's manager in the same transaction, so `GET /me` lists the store immediately (status `applied`). Approval stays an admin action. Stores created another way have no manager until linked.

## Partner console

`public/dashboard.html` (+ `console.js`, `console.css`) is the real Partner space, behind the Partner sign-in: overview (status, decision note, subscription, readiness checklist), catalogue (create products with brand, reference, size or format, price; edit prices), stock (edit quantities, import a `reference;quantity` CSV, download the template) and Corner settings. It uses `GET /partners/:id/inventory`, `GET /partners/:id/brands`, `POST /partners/:id/products/:productId/price` and `GET /partners/:id/corner-config`. Products can carry the store's own reference (`sku`, unique per store, migration `20261015120000_z_fashion_product_sku_v1.sql`), which is how stock files are matched.

`public/preview-dashboard.html` is the earlier visual mock-up, kept as a design reference; it holds no real data and needs no sign-in.

