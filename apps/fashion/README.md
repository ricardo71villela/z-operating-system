# Z Fashion

Z Fashion is the Fashion & Lifestyle Retail vertical of the Z Operating System (ZOS) ecosystem. It is a multi-partner marketplace for clothing, footwear, sportswear, accessories/leather goods and cosmetics across children, youth and adult segments, converging with shared ZOS capabilities according to the **ZOS Architectural Constitution v1.1**.

Inventory belongs to each adherent store (**Partner**). Every Partner can operate its own branded **Corner** while also participating in the platform-wide **All Sale** discovery surface. The unified customer experience — cart, checkout and order orchestration across Partners — is owned by Z Fashion.

## Architecture status

**Foundation implementation in progress.** The initial architecture-only phase has already advanced into executable code and database contracts.

Current implemented foundation includes:

- `packages/fashion-domain/` — pure Z Fashion domain rules for Partner, Brand, Product, Campaign, Corner, Stock, onboarding, recommendations, pricing history and multi-partner Cart;
- `apps/fashion-partner/` — Partner API with in-memory development/test path plus PostgreSQL integration path;
- integrated `fashion.*` migrations under `infrastructure/supabase/migrations/` for Partner, Brand/Product, Campaigns, Stock, onboarding transitions, price history and atomic checkout;
- PostgreSQL convergence workflow and real DB integration tests;
- explicit ZOS alignment, internationalization, stock-feed, legal and brand-voice documentation.

The current source is not evidence of a live Z Fashion production database deployment. Live/shared Supabase mutation remains a separate operational gate.

See `docs/architecture/ZOS-ALIGNMENT.md` and [`140-roadmaps/Z-FASHION-STRATEGY.md`](../../140-roadmaps/Z-FASHION-STRATEGY.md).

## Product surface

- **Client segments** — Children, Youth, Adults.
- **Categories** — Clothing, Footwear, Sportswear, Accessories & Leather Goods, Cosmetics. Category is Product-owned; a Partner/Corner can span several categories.
- **Brand** — Product-level identity independent from Partner identity. A Partner can be mono-brand or multi-brand without changing the Partner model.
- **Corners** — Partner-branded storefronts inside Z Fashion; visual identity and curation may be Partner-specific while commerce plumbing remains platform-owned.
- **All Sale** — cross-partner discovery surface across participating Corners.
- **Campaigns** — Destaques, Saldos, Vendas Privadas, Novas Coleções and Black Friday.
- **Stock** — Partner-owned inventory with stale-feed protection and transactional reservation semantics.
- **Cart / checkout** — Z Fashion-owned multi-partner cart with atomic checkout rules; not promoted to ZOS Core unless a second independent product demonstrates the same semantic requirement.

## ZOS ownership boundary

### Reused shared ZOS capabilities

Person identity, Partner/Organization identity, Registry references, Trust Engine mechanics, Partner Quality Score, canonical Geography/Locale/Currency, audit mechanics and integration transport are reused from ZOS rather than reimplemented as Fashion-specific authorities.

The local `@zos/geography` JavaScript package is an offline/unit-test fixture. Canonical runtime Geography remains the shared Supabase `zos.geography_*` model.

### Z Fashion-owned domain

Z Fashion owns:

- product catalog and Fashion-specific attributes;
- Brand/Product/Category/Age Segment relationships;
- Corner configuration and presentation semantics;
- All Sale aggregation rules;
- campaign types and scheduling;
- Partner stock-feed semantics and reservation rules;
- pricing-history rules used by Fashion campaigns;
- Partner onboarding state machine extensions specific to Fashion operations;
- unified multi-partner Cart/checkout/order orchestration;
- returns/exchange harmonization rules;
- minor-safe handling rules specific to Children/Youth product experiences.

No Fashion-owned package should use the `@zos/*` namespace. Fashion-owned packages use `@zfashion/*`; `@zos/*` is reserved for genuinely shared ZOS capabilities.

## Repository structure

```text
apps/
  fashion-partner/               implemented Partner API foundation
  fashion-admin/                 planned internal operations surface
  fashion-web/                   planned customer storefront
packages/
  fashion-domain/                implemented pure domain rules
docs/
  architecture/                  ZOS alignment and domain contracts
```

Shared/integrated database migrations intentionally live outside this product directory under:

```text
infrastructure/supabase/migrations/
```

That directory is the integrated ZOS Supabase migration authority.

## Quality gates

From the repository root, after product setup:

```bash
npm run fashion:setup
npm run fashion:check
```

The deeper PostgreSQL gate applies the full ordered ZOS migration sequence before running Fashion-specific DB checks.

## Related domains

`20-registry`, `30-trust-engine`, `40-partner-quality-score`, `50-marketplace`, `60-data`, `100-security`, `160-legal-and-compliance`.

## Status

Foundation implementation — not production-launched.

## Last Updated

2026-08-21
