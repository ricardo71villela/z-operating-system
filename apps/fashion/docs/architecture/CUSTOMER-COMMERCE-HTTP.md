# Z Fashion — Customer Commerce HTTP Authority

Status: **source authority implemented; runtime activation intentionally OFF**.

This increment connects the existing Z Fashion customer-site architecture to the canonical Cart / Order / Stock / Client authorities without activating live commerce.

## Source authority

### Customer API

`apps/fashion/apps/fashion-partner/src/customer-commerce.js`

Authenticated self-scoped routes:

- `POST /me/cart`
- `POST /me/cart/:cartId/items`
- `GET /me/cart/:cartId/checkout-preflight`
- `POST /me/cart/:cartId/checkout`
- `GET /me/orders`
- `GET /me/orders/:orderId`

There is deliberately no client identifier in the URL and no payment endpoint in this authority.

### Authentication

The production adapter requires a Bearer access token and verifies it with Supabase Auth before resolving the authenticated Client id. The browser cannot choose another Client id through path or request body.

No service-role key is used by the browser.

### Server-derived commercial authority

When a Cart item is created, browser input is limited to the Product id and quantity. The server derives:

- canonical Partner ownership from `fashion.products.partner_id`;
- current unit price from `fashion.current_price(product_id)`.

Caller-supplied Partner or price values are not commercial authority.

### Checkout preflight

Preflight checks:

- authenticated Cart ownership;
- non-empty Cart;
- current price availability;
- immutable Cart price vs current price;
- current sellable stock (`quantity_available - quantity_reserved`).

Checkout runs only when preflight is clean. The existing `fashion.attempt_checkout()` transaction remains the Order/Stock authority.

### Idempotency

Migration:

`infrastructure/supabase/migrations/20260827002000_z_fashion_checkout_http_authority_v1.sql`

It adds `fashion.checkout_requests` and the server-only function:

`fashion.attempt_checkout_idempotent(client_user_id, cart_id, idempotency_key)`

The function binds one authenticated Client + `Idempotency-Key` to one Cart and at most one Order. Network retries with the same key return the original Order and cannot reserve stock twice.

### Payment boundary

A successful checkout creates only a `pending_payment` Order and stock reservation. It does **not**:

- confirm payment;
- commit a stock sale;
- create Shipment authority;
- call Stripe;
- expose a browser payment mutation.

Payment remains a separate verified-provider authority.

## Browser adapter

`apps/fashion/apps/fashion-web/customer-commerce-api.js`

The customer-site shell loads a commerce adapter, but it is fail-closed by default. It can make a request only when runtime configuration explicitly provides all three:

1. `enabled: true`;
2. a secure API base URL;
3. a function that returns the authenticated Client access token.

No production URL, Supabase credential or access token is embedded in the static bundle.

Outside localhost, the adapter rejects non-HTTPS API URLs.

## Default release state

`FASHION_ENABLE_CLIENT_COMMERCE_WRITES` defaults to disabled.

Therefore source integration does not itself enable Cart mutation, stock reservation or Order creation in any deployed environment.

## Validation authority

`Z Fashion PostgreSQL` proves the increment against disposable PostgreSQL 17 by applying the complete integrated ZOS migration sequence, then validating:

- all existing Fashion domain contracts;
- all customer-site contracts;
- browser adapter fail-closed behavior;
- existing Partner database round-trips;
- authenticated Cart ownership;
- server-derived Partner and current price;
- checkout preflight;
- atomic pending-payment Order creation;
- exact stock reservation;
- retry idempotency;
- cross-Client Order isolation;
- absence of Shipment creation before payment.

## Explicit activation hold

Until a separate release decision is made:

- no live Supabase migration is authorized by this source change;
- no Production environment variable activation;
- no real customer authentication activation;
- no real Cart/Order mutation through the Preview;
- no Stripe live/test checkout activation;
- no production deployment caused by this increment;
- no change to existing payment confirmation authority.

The next production gate should verify authenticated browser-to-API routing, canonical Client identity bootstrap, CORS/origin policy, rate limiting, Stripe PaymentIntent creation/confirmation boundaries, and end-to-end cancellation/retry behavior before writes are enabled.
