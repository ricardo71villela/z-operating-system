# Z Studio — Microsoft Store release runbook

## Frozen architecture
Microsoft Store is a distribution surface, not a fourth Z Studio billing authority.

- Package: PWA / Microsoft Store distribution.
- Commerce: the same Web/Stripe checkout and Stripe Billing Portal used by the browser version.
- Identity/trial/entitlement: shared ZOS authority.
- Do not introduce `microsoft_store` into `studio.subscriptions.billing_source` or `studio.billing_events.billing_source`.
- Do not add `Windows.Services.Store` billing for Z Studio v1.

## PWA source requirements already governed by the build
- `manifest.webmanifest`
- standalone display
- service worker registration
- 192/512/maskable icons
- HTTPS deployment
- canonical Web app build and legal pages

## External Partner Center sequence
1. Have a stable production HTTPS Z Studio web origin.
2. Create/verify Microsoft Partner Center developer account.
3. Reserve the Z Studio product name.
4. Use the Microsoft-supported PWA packaging/submission path (including PWABuilder when applicable).
5. Enter the Partner Center package/publisher identity exactly as issued by Microsoft.
6. Generate/upload the Store package.
7. Complete listing, age rating, privacy/support information and screenshots.
8. Certification test must exercise the same Web/Stripe checkout opened from the installed PWA.

## Commercial verification
- Plan buttons in the installed Microsoft PWA call `/api/web/checkout`.
- Hosted Checkout URL must be `https://checkout.stripe.com/...`.
- "Manage subscription" calls `/api/web/portal` and opens a Stripe-hosted portal.
- No Microsoft-specific subscription object or trial history exists in ZOS.

## Release blockers that are intentionally external
- production HTTPS deployment
- Partner Center identity/account agreements
- reserved Store name and publisher/package identifiers
- Store screenshots/listing/certification
