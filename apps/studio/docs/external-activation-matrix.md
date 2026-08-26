# Z Studio — external activation matrix

This is the exact external configuration boundary after source readiness. Values are intentionally absent when they are secrets or provider-issued identifiers.

## Shared Supabase / ZOS
- `SUPABASE_URL` — production ZOS Supabase HTTPS project URL
- `SUPABASE_SECRET_KEY` — server-only `sb_secret_...`
- `SUPABASE_PUBLISHABLE_KEY` — public client auth key
- Apply all reviewed Z Studio commercial migrations before provider production activation.

## Canonical client build
- `ZSTUDIO_COMMERCIAL_BASE_URL=https://<z-studio-commercial-origin>`
- Must be one HTTPS origin with no path/query/hash.
- Empty value is deliberately fail-closed: plan UI remains disabled.

## Web + Microsoft PWA / Stripe
- `STRIPE_ENVIRONMENT=sandbox|production`
- `STRIPE_SECRET_KEY=sk_test_...|sk_live_...`
- `STRIPE_PRICE_WEEKLY=price_...`
- `STRIPE_PRICE_MONTHLY=price_...`
- `STRIPE_PRICE_ANNUAL=price_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- `STRIPE_SUCCESS_URL=https://<web-origin>/...`
- `STRIPE_CANCEL_URL=https://<web-origin>/...`

Sandbox catalog already prepared (livemode=false):
- product `prod_V6vQHl1tOiyBaP`
- weekly `price_1U6haiLelsX3mv7ivtJpIntG`
- monthly `price_1U6haqLelsX3mv7i60H6VWAH`
- annual `price_1U6hayLelsX3mv7iJ7kluTSE`

Still external: Billing Portal configuration, exact webhook after commercial runtime URL exists, secret installation, E2E checkout. Live Stripe resources remain intentionally uncreated until the explicit live gate.

## Apple App Store
- `APPLE_ENVIRONMENT=sandbox|production`
- `APPLE_BUNDLE_ID=com.zoperatingsystem.zstudio`
- `APPLE_APP_APPLE_ID=<numeric App Store app id>` — mandatory in production
- `APPLE_ISSUER_ID=<App Store Connect issuer id>`
- `APPLE_KEY_ID=<In-App Purchase API key id>`
- `APPLE_PRIVATE_KEY=<PEM private key>`

External console objects:
- App Store Connect app record
- one auto-renewable subscription group
- weekly/monthly/annual products from `store-products.v1.json`
- 3-day introductory free trial on each product
- App Store Server Notifications V2 URL/credentials
- Sandbox/TestFlight accounts and review metadata

## Google Play
- `GOOGLE_PLAY_ENVIRONMENT=sandbox|production`
- `GOOGLE_PLAY_PACKAGE_NAME=com.zoperatingsystem.zstudio`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=<service-account JSON>`
- `GOOGLE_PLAY_PUBSUB_AUDIENCE=https://<commercial-origin>/api/google/play/rtdn`
- `GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL=<push-auth service account>`
- `GOOGLE_PLAY_PUBSUB_SUBSCRIPTION=projects/<project>/subscriptions/<subscription>`

External console objects:
- Play Console app
- subscription product `zstudio.access`
- base plans `weekly`, `monthly`, `annual`
- offer `trial-3d`
- Android Publisher service-account permission
- Pub/Sub topic + push subscription / RTDN
- license testers / internal test track

## Microsoft Store
No Microsoft billing secrets exist by design. Microsoft is a distribution surface for the same Web/PWA commerce.

External Partner Center objects:
- developer account legal identity and agreements
- reserved product name
- package/publisher identity issued by Microsoft
- stable HTTPS PWA URL
- Store package/listing/screenshots/age rating/privacy/support metadata
- certification submission

## Current stop line
Source target: `SOURCE_READY / EXTERNAL_ACTIVATION_PENDING` on Web, Apple, Google Play and Microsoft Store.

Do not declare launch PASS until provider sandbox E2E, cross-provider lifetime-trial matrix, production credentials, production current-state verification and store certification are complete.
