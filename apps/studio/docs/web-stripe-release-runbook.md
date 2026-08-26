# Z Studio — Web / Stripe release runbook

## Frozen architecture
- Web and Microsoft PWA use hosted Stripe Checkout.
- Stripe is never an entitlement authority. Verified current Stripe state is normalized server-side and written through the shared ZOS commercial writer.
- One lifetime production trial per canonical ZOS person is enforced by `studio.production_trial_authority`.
- Browser code never receives Stripe secret keys, price IDs, webhook secrets or Supabase secret keys.

## Required production configuration
Set only after the production activation gate is authorized:
- `STRIPE_ENVIRONMENT=production`
- `STRIPE_SECRET_KEY=sk_live_...`
- `STRIPE_PRICE_WEEKLY=price_...`
- `STRIPE_PRICE_MONTHLY=price_...`
- `STRIPE_PRICE_ANNUAL=price_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- `STRIPE_SUCCESS_URL=https://<web-origin>/...`
- `STRIPE_CANCEL_URL=https://<web-origin>/...`
- `SUPABASE_URL=https://...supabase.co`
- `SUPABASE_SECRET_KEY=sb_secret_...`
- `SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`
- Web build: `ZSTUDIO_COMMERCIAL_BASE_URL=https://<commercial-runtime-origin>`

## Stripe catalog
Create exactly three recurring EUR prices matching the source authority:
- weekly: EUR 5.99
- monthly: EUR 14.99
- annual: EUR 119.99

Do not encode the lifetime-trial decision in a browser-controlled Stripe parameter. The Checkout server decides whether the exact session receives the 3-day trial after global ZOS preflight.

## Endpoints
- checkout: `/api/web/checkout`
- webhook: `/api/web/webhook`
- customer portal: `/api/web/portal`

Configure the Stripe webhook to the exact deployed webhook URL and copy its signing secret into `STRIPE_WEBHOOK_SECRET`. Enable/configure Stripe Billing Portal before exposing the Web "Manage subscription" action.

## Production verification
1. New person: trial eligible, exactly one 3-day trial.
2. Same person after trial claimed elsewhere: no second trial.
3. Checkout cancel/expiry: no entitlement.
4. Successful paid checkout: Studio + AI access active.
5. Webhook duplicate and out-of-order delivery: no regression.
6. Renewal: current state remains active.
7. Cancel at period end: access remains until verified period end.
8. Expiry/past due/recovery: access follows shared authority.
9. Billing Portal opens only for the authenticated person's bound Stripe Customer.
10. Raw Stripe secrets/provider payloads never appear in client responses.

## Activation gate
Source may be prepared in advance, but live Stripe account/product/webhook mutations and production checkout stay OFF until explicitly authorized.
