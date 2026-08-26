# Z Studio — Apple App Store release runbook

## Frozen architecture
- Bundle/app identity: `com.zoperatingsystem.zstudio`.
- StoreKit 2 is the device purchase surface; App Store Server API / notifications and current state are the provider authority.
- Apple uses the same global lifetime ZOS trial authority as Web and Google Play.
- The three existing subscription products stay canonical; no duplicate trial/non-trial products are required.

## App Store Connect catalog
Create one auto-renewable subscription group for Z Studio access and exactly these products:
- `com.zoperatingsystem.zstudio.subscription.weekly`
- `com.zoperatingsystem.zstudio.subscription.monthly`
- `com.zoperatingsystem.zstudio.subscription.annual`

Configure the intended recurring prices and a 3-day introductory free trial on each product. The app does not trust StoreKit's local eligibility alone: before purchase, the server reserves/checks the global ZOS lifetime trial and signs StoreKit introductory-offer eligibility (`allowIntroductoryOffer` true/false) for the verified `appTransactionID`.

Do not expose a promoted in-app purchase path that can initiate the introductory subscription outside the in-app ZOS preflight flow.

## Required server configuration
- `APPLE_ENVIRONMENT` according to sandbox/production runtime
- `APPLE_BUNDLE_ID=com.zoperatingsystem.zstudio`
- App Store Connect issuer ID
- In-App Purchase API key ID
- private key
- Apple root certificates/current verification assets already expected by the commercial runtime
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_PUBLISHABLE_KEY`
- `ZSTUDIO_COMMERCIAL_BASE_URL` injected into the canonical app build

## Purchase order
1. Authenticated ZOS person obtains verified `AppTransaction.shared` identifier.
2. `/api/apple/prepare` reserves the exact plan and global trial decision.
3. Server signs introductory-offer eligibility.
4. StoreKit `purchase` receives canonical `appAccountToken` and signed eligibility JWS.
5. Device JWS is sent to `/api/apple/reconcile`.
6. Server verifies Apple evidence and fetches fresh current subscription state.
7. Exact Apple purchase intent is correlated.
8. Shared commercial writer applies the verified state.
9. Purchase intent is completed.
10. Only then does the device finish the StoreKit transaction.

## Restore / lifecycle
- Transaction updates are listened to but never finished before server delivery.
- Unfinished/current entitlements are reconciled on app lifecycle.
- `AppStore.sync()` is reserved for explicit Restore Purchases.
- Family-shared transactions remain excluded from v1 ownership binding.

## Production verification
Test purchase, trial, paid-without-trial, pending/Ask to Buy, restore, renewal, cancellation, grace, billing retry, expiry, refund/revocation, duplicate server notifications, appAccountToken identity mismatch and reinstall/device restore.
