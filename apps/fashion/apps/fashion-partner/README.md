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
| `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | for photos and logos | Server-side key used **only** to write to the `zfashion-media` Storage bucket. Without it, uploads return 503. Never sent to a browser. |
| `FASHION_MEDIA_BUCKET` | no | Storage bucket name (default `zfashion-media`). |
| `FASHION_PUBLIC_API_URL` | no | In-memory mode only: base URL used for `/media/...` links (default `http://127.0.0.1:$PORT`). |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | for payments | Stripe keys (`sk_test_`/`pk_test_` until go-live). The secret key never leaves the server; the publishable key is sent to the payment form. Without them, `POST …/payment` returns 503. |
| `STRIPE_WEBHOOK_SECRET` | for payments | Signing secret (`whsec_…`) of the Stripe webhook endpoint `https://<api>/stripe/webhook`, events `payment_intent.succeeded`, `payment_intent.processing`, `payment_intent.payment_failed`. |
| `FASHION_SHIPPING_COUNTRIES` | no | Comma-separated ISO codes a Client may ship to (default `FR`). |
| `FASHION_ALLOW_UNAUTHENTICATED` | no | `1` disables authentication. Local disposable databases only. |
| `FASHION_DB_SSL_MODE`, `FASHION_DB_SCHEMA` | no | See `src/db.js`. |

## Who can call what

Requests carry `Authorization: Bearer <Supabase access token>`.

| Routes | Caller allowed |
| --- | --- |
| `POST /partners/:id/transition` | Admin (`FASHION_ADMIN_USER_IDS`) |
| `GET /admin/partner-applications[?status=]`, `GET /admin/partner-applications/:partnerId`, `POST /admin/partner-applications/:partnerId/decision` | Admin. Decisions follow the onboarding graph; rejecting or suspending needs a note (shown to the store); activating needs the stock mode. Status and note are written in one transaction. |
| `GET /partners/:id/application` | A person who manages that Partner: application status and latest decision note |
| `/partners/:id/...` (stock, brands, products, inventory, price, photos, logo, Corner, commission, shipments, returns) | A person who manages that Partner (ZOS membership → registry binding) |
| `GET /partners/:id/orders` | A person who manages that Partner: its paid Orders, its own lines only |
| `POST /shipments`, `POST /returns` | A person who manages the `partnerId` in the body |
| `POST /shipments/:id/transition`, `POST /returns/:id/transition` | A person who manages the Partner that owns the record |
| `/clients/:clientId/...` (wishlist, follows, addresses, cart, checkout, orders) | The client themself: `clientId` must equal the caller's auth user id |
| `POST /stripe/webhook` | Stripe only: every request must carry a valid `Stripe-Signature` for `STRIPE_WEBHOOK_SECRET` (raw body, 5-minute tolerance), otherwise 400. |
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

## Photos and logos

Product photos and store logos are uploaded **through this API** (raw JPEG, PNG or WebP body), never straight from a browser to Storage:

| Route | What it does |
| --- | --- |
| `POST /partners/:id/products/:productId/images` | Adds a photo (appended; first = cover). 415 if the content is not JPEG/PNG/WebP or does not match the declared type, 413 above 5 MB, 409 above 8 photos. |
| `POST /partners/:id/products/:productId/images/order` | `{ imageIds }`, cover first; must name every photo once. |
| `DELETE /partners/:id/products/:productId/images/:imageId` | Removes the photo and its file; positions close up. |
| `POST /partners/:id/logo` | Stores a logo and returns its public URL for the Corner settings. |

Rules live in `fashion-domain/src/media.js` (type recognised from the file content, size, count, paths built from ids). Files go to the public-read bucket `zfashion-media` under `partners/<partnerId>/...`; rows in `fashion.product_images` (migration `20261015150000_z_fashion_product_images_v1.sql`, which also refuses a 9th photo and a photo of another store's product). Inventory, product pages and listing cards (`imageUrl`) include them. The Partner console scales photos down to 2000 px before sending.


## Cart, checkout and orders

| Route | What it does |
| --- | --- |
| `GET /clients/:id/cart` | The open Cart priced at **current** prices: lines (name, brand, size, photo, store, stock status), one block per store, subtotal, delivery, total, `canCheckout`, `pendingOrderId`. |
| `PUT /clients/:id/cart/items/:productId` | `{ quantity }` 1–10 (0 removes). 409 `insufficient_stock` (with `sellable`) or `product_unavailable` (store not active, no price). |
| `DELETE /clients/:id/cart/items/:productId` | Removes the line. |
| `POST /clients/:id/checkout` | `{ addressId }` (a shipping address of this Client, in `FASHION_SHIPPING_COUNTRIES`). Creates a `pending_payment` Order: lines repriced and frozen, address frozen, one ticket per store with its commission, stock held 30 minutes. All-or-nothing. |
| `GET /clients/:id/orders`, `GET /clients/:id/orders/:orderId` | The Client's Orders (no commission shown). |
| `POST /clients/:id/orders/:orderId/cancel` | Abandons an unpaid checkout and releases the stock. Refused (409) while a payment is processing or once paid. |
| `GET /partners/:id/orders` | The store's **paid** Orders: its lines, its ticket (amount, rate, commission), delivery address, shipment. |

Rules (`fashion-domain/src/checkout.js`, mirrored by migration `20261016090000_z_fashion_checkout_v2.sql`): one open Cart per Client; changing the Cart or checking out again cancels its unpaid Order; an unpaid Order past its hold is cancelled automatically (`fashion.expire_pending_orders()`, run before each Cart read and checkout) unless its payment is processing; delivery is included (0 €) at launch; a paid Order closes the Cart. `GET /partners/:id/commission` now reports this month's real sales and commission from paid Orders.

## Payment (Stripe)

| Route | What it does |
| --- | --- |
| `POST /clients/:id/orders/:orderId/payment` | Opens the payment of a `pending_payment` Order: creates its Stripe PaymentIntent (one per Order, idempotency key = Order id, `transfer_group` = `order_<id>` for the later payouts to stores) or reuses it, extends the stock hold to at least 15 min from now (never beyond 60 min after checkout), resets a declined payment. Returns `clientSecret` + `publishableKey` for Stripe.js (Payment Element). 409 `order_not_payable` when the hold ran out or the Order is paid/cancelled. |
| `POST /stripe/webhook` | Signed Stripe events. `payment_intent.succeeded` with the exact total moves the Order to `paid` (stock committed, one Shipment per store, Cart closed); `processing` and `payment_failed` update the payment status. Each event is applied once (`fashion.stripe_webhook_events`) and only forward. A payment that arrives for a cancelled Order, or for another amount, is **refunded automatically**; if Stripe refuses the refund nothing is recorded and Stripe retries. |

Card data never reaches this server (PCI scope stays with Stripe). Rules: `fashion-domain/src/payment.js` `applyPaymentEvent()`, mirrored by migration `20261016120000_z_fashion_stripe_payment_v2.sql`. Payouts to stores (Stripe Connect) are task 12.
