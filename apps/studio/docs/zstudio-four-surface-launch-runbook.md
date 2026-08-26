# Z Studio — four-surface launch authority

Target end state before external activation: **SOURCE_READY / EXTERNAL_ACTIVATION_PENDING** for all four surfaces.

| Surface | Distribution | Purchase authority | Server reconciliation | Subscription management |
|---|---|---|---|---|
| Web | HTTPS web/PWA | Stripe Checkout | Stripe current state + webhook | Stripe Billing Portal |
| Apple | App Store | StoreKit 2 | App Store Server API/notifications | App Store |
| Google Play | Play Store | Play Billing 9.1 | Android Publisher API + RTDN | Google Play |
| Microsoft Store | PWA/Store package | Stripe Checkout | same Web Stripe authority | Stripe Billing Portal |

## Shared invariants
- One canonical ZOS person.
- One lifetime production trial, irrespective of channel.
- Exactly three plans: weekly / monthly / annual.
- Browser/device evidence never grants entitlement directly.
- Shared server writer is the only commercial subscription/entitlement mutation authority.
- Provider secrets never ship in Web/PWA/native client bundles.
- Restore/reinstall paths always re-fetch provider current state.

## External activation order
1. Apply reviewed Supabase migrations to the production ZOS project.
2. Configure/deploy `z-studio-commercial` over HTTPS with server-only provider secrets.
3. Set the canonical build's `ZSTUDIO_COMMERCIAL_BASE_URL` to that HTTPS origin and rebuild all four surfaces from the same source.
4. Configure Stripe live products/prices/webhook/Billing Portal and verify Web sandbox/live gates.
5. Configure App Store Connect products, introductory trial, API credentials and Server Notifications V2; validate Sandbox/TestFlight.
6. Configure Google Play subscription/base plans/trial offer, service account and Pub/Sub RTDN; validate license-test accounts/internal track.
7. Deploy the production PWA and package/submit it through Microsoft Partner Center.
8. Run the cross-provider trial matrix and full lifecycle matrix before public rollout.
9. Only then enable public production distribution.

## Cross-provider trial matrix
For the same canonical ZOS person, prove each pair at least once:
- Web trial then Apple purchase => Apple paid, no second trial.
- Web trial then Google purchase => Google paid, no second trial.
- Apple trial then Web purchase => Web paid, no second trial.
- Apple trial then Google purchase => Google paid, no second trial.
- Google trial then Web purchase => Web paid, no second trial.
- Google trial then Apple purchase => Apple paid, no second trial.
- Microsoft PWA is Web commerce, so it must share the exact Web history.

## Stop conditions
Do not classify launch as PASS if any surface can purchase without authentication, infer trial eligibility client-side, bypass current-state verification, create duplicate provider identity, or deliver access before the provider state is committed.
