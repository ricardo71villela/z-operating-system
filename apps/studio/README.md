# Z Studio

Z Studio is the horizontal content-creation product of the Z Operating System (ZOS) ecosystem. It is not a marketplace vertical. The same product is delivered across Web, Apple, Google Play and Microsoft/PWA surfaces while sharing one ZOS identity and one server-authoritative commercial state.

## Architecture status

Active implementation. The source contains:

- Web application source and deterministic build pipeline;
- passwordless/shared ZOS identity bridge;
- AI backend runtime;
- privileged commercial runtime;
- Apple StoreKit integration and App Store Server verification/reconciliation;
- Google Play Billing integration, current-state reconciliation and RTDN handling;
- Stripe Web checkout/webhook/customer-portal integration;
- Capacitor native shells for iOS and Android;
- PWA/Microsoft Store distribution path;
- visual/golden regression assets and release runbooks;
- shared Supabase migrations under the integrated ZOS migration authority.

Source readiness does **not** imply that external store accounts, live Stripe, production credentials, submissions or production deployment are active. External activation is a separate operational gate.

## Product topology

```text
app/             built/current HTML application outputs
src/             application source and platform bridges
scripts/         deterministic build and local tooling
backend/         AI backend runtime
commercial/      privileged billing/store verification runtime
native/          Capacitor + iOS/Android native bridges
pwa/             PWA distribution assets
legal/           product legal documents
assets/          product assets
goldens*/        visual regression authorities
tests/           application/UX/layout/native authority tests
docs/            release and activation runbooks
```

The topology is intentionally different from marketplace verticals because Z Studio is a horizontal cross-platform product with native-store and commercial-runtime responsibilities.

## ZOS ownership boundary

### Reused from ZOS

- canonical Person identity and account linkage;
- shared identity/consent rules where applicable;
- integrated Supabase migration authority;
- ecosystem security/governance standards.

### Z Studio-owned

- editor/content-creation semantics;
- templates, rendering and export behavior;
- AI product behavior and quotas;
- Studio subscription/catalog semantics;
- commercial verification adapters for Web/Apple/Google;
- native bridge lifecycle and StoreKit/Play Billing orchestration;
- visual regression authorities and product-specific release contracts.

Studio commercial events may update Studio entitlement state only through the shared server-authoritative commercial writer. Browser/native clients never grant themselves an entitlement.

## Database authority

Studio migrations are integrated under:

```text
infrastructure/supabase/migrations/
```

That directory, not `apps/studio/`, is the integrated ZOS Supabase migration authority. Studio-specific SQL tests live under `infrastructure/supabase/tests/`.

## Commercial surfaces

- **Web** — Stripe Checkout + verified webhook/current-state reconciliation + Billing Portal.
- **Apple** — StoreKit purchase/restore with server-side App Store verification and global trial authority.
- **Google Play** — Play Billing purchase/restore with server-side current-state verification and RTDN reconciliation.
- **Microsoft Store** — PWA distribution; commerce follows the Web/Stripe authority rather than introducing a fourth billing source.

## Quality gates

From the repository root:

```bash
npm run studio:setup
npm ci --prefix apps/studio/commercial
npm run studio:check
```

`backend/` currently has no third-party dependencies or lockfile, so its syntax/tests run directly through `studio:ai:check`; there is intentionally no fake install step for it.

The root ZOS CI also runs Studio inside the five-product ecosystem gate. Product-specific Studio workflows remain responsible for deeper release, billing-provider and PostgreSQL authority tests.

## Package identity

The product root is `@zstudio/app`. Existing internal component package names may remain as compatibility identifiers where changing them would add deployment/build risk; they are Studio-owned and do not use the reserved `@zos/*` namespace. New Studio-owned packages use `@zstudio/*`.

## External activation

External launch requirements and environment contracts are documented in:

- `docs/external-activation-matrix.md`
- `docs/zstudio-four-surface-launch-runbook.md`
- `docs/web-stripe-release-runbook.md`
- `docs/apple-release-runbook.md`
- `docs/google-play-release-runbook.md`
- `docs/microsoft-store-release-runbook.md`

No source-only convergence task should silently activate live Stripe, mutate production Supabase, deploy production, submit a store build, or create/accept external legal agreements.

## Status

Source implementation active; external activation remains independently gated.

## Last Updated

2026-08-21
