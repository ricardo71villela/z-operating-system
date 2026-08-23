# Z Fashion

Z Fashion is the Fashion & Lifestyle Retail vertical of the Z Operating System (ZOS) ecosystem. It is a multi-partner marketplace for clothing, footwear, sportswear, accessories/leather goods and cosmetics across Baby, Children, Youth and Adult segments, converging with shared ZOS capabilities according to the **ZOS Architectural Constitution v1.1**.

Inventory belongs to each adherent store (**Partner**). Every Partner can operate its own branded **Corner** while also participating in the platform-wide **All Sale** discovery surface. Z Fashion owns the unified commerce semantics across Partners: catalog, cart, checkout/order orchestration, stock, shipments, returns and Fashion-specific commercial rules.

## Architecture status

**Integrated pre-production implementation.** Z Fashion is no longer architecture-only or pre-implementation. The Claude-developed Fashion history has been reconciled into the five-product convergence branch while preserving its Git ancestry and current ZOS shared authorities.

Implemented source now includes:

- `packages/fashion-domain/` — pure Z Fashion domain rules for Partner, Brand, Product, Campaign, Corner, Stock, onboarding, recommendations, pricing history, commission, Product Page, catalog listing, search, client account, size grids, style groups, market scoping, shipment, returns, addresses, payments and multi-partner Cart;
- `apps/fashion-partner/` — Partner API with in-memory development/test mode and PostgreSQL integration for onboarding, Brand/Product management, stock feeds, Corner configuration, shipments, returns, pricing, commissions and client-facing catalog/account endpoints used by the current prototypes;
- client-account capabilities for Wishlist, followed Corners/Boutiques and address book;
- multilingual product names/descriptions and search foundations;
- Fashion market/locale rules aligned with the shared ZOS Geography authority;
- Fashion client identity bridge into the canonical ZOS person/Registry model;
- integrated `fashion.*` migrations for Partner, Brand/Product, Campaigns, Stock, onboarding transitions, price history, atomic checkout, commissions, Baby/Gender product semantics, client account, style groups, shipment/return, addresses, payment state and stock-feed persistence APIs;
- PostgreSQL convergence workflow, pure-domain tests and real PostgreSQL Partner API integration tests.

On 2026-08-23, the converged `Z Fashion PostgreSQL` gate passed the complete integrated ZOS migration sequence, Fashion constraints, the full domain suite and the Partner API against a disposable PostgreSQL database. This is source/integration evidence only; it is not evidence that the Fashion migrations are live in the shared production Supabase project.

## Product surface

- **Client segments** — Baby, Children, Youth, Adults.
- **Categories** — Clothing, Footwear, Sportswear, Accessories & Leather Goods, Cosmetics.
- **Gender** — Product-owned `female`, `male` or `unisex`; never inferred from Category or Partner.
- **Brand** — Product-level identity independent from Partner identity. A Partner can be mono-brand or multi-brand.
- **Corners** — Partner-branded storefront semantics with Partner-specific identity/curation while commerce plumbing remains platform-owned.
- **All Sale** — cross-partner discovery with market/category/segment/gender/size/brand/Partner filtering foundations.
- **Campaigns** — Destaques, Saldos, Vendas Privadas, Novas Coleções and Black Friday.
- **Stock** — Partner-owned inventory with timestamp freshness rules, batch feed support, reliability tiers, reservations and ownership checks.
- **Cart / checkout** — Z Fashion-owned multi-partner cart with atomic PostgreSQL checkout rules.
- **Client account** — Wishlist, followed Corners/Boutiques and addresses are implemented in domain/API foundations.
- **Fulfilment** — shipment and return state machines plus Partner API operations are implemented.
- **Partner monetization** — subscription/commission rules and SQL authorities are implemented; live collection is not activated.
- **Payments** — Stripe-oriented payment state/contracts are scaffolded in source/database, but no live Stripe checkout/webhook activation has been performed.

## What is not yet production-ready

The current source must not be described as a launched marketplace. The remaining product/activation boundaries are explicit:

- there is no complete production customer storefront under `fashion-web` yet; current customer experience work consists of domain/view models, APIs and prototypes rather than the final deployable storefront;
- there is no completed `fashion-admin` internal operations application yet;
- real Supabase Auth is not yet wired through all Partner/client HTTP surfaces; current development APIs still contain scoped non-production identity paths;
- the Fashion checkout/order SQL authority exists, but the complete customer checkout HTTP/UI flow is not yet wired end-to-end;
- Stripe is configured/scaffolded but not connected to live credentials, live checkout, production webhooks or settlements;
- Fashion migrations have not been applied to the live/shared Supabase project by this convergence work;
- no Z Fashion production deployment or go-live has been performed.

## ZOS ownership boundary

### Reused shared ZOS capabilities

Person identity, Partner/Organization identity, Registry references, Trust Engine mechanics, Partner Quality Score, canonical Geography/Locale/Currency, audit mechanics and integration transport remain ZOS authorities rather than Fashion-specific duplicates.

`packages/geography/geography.js` is a shared offline/unit-test fixture module, not runtime Geography authority. Canonical runtime Geography remains the shared Supabase `zos.geography_*` model.

### Z Fashion-owned domain

Z Fashion owns:

- product catalog and Fashion-specific attributes;
- Brand/Product/Category/Age Segment/Gender/size/style relationships;
- Corner configuration and presentation semantics;
- All Sale aggregation and Fashion discovery rules;
- campaign types and scheduling;
- Partner stock-feed semantics and reservation rules;
- Fashion pricing history and commission rules;
- Partner onboarding extensions specific to Fashion operations;
- unified multi-partner Cart/checkout/order orchestration;
- shipment/return/exchange harmonization rules;
- Fashion client-account semantics such as Wishlist and followed Corners;
- minor-safe handling rules specific to Baby/Children/Youth experiences.

No Fashion-owned package should use the `@zos/*` namespace. Fashion-owned packages use `@zfashion/*`; `@zos/*` is reserved for genuinely shared ZOS capabilities.

## Repository structure

```text
apps/
  fashion-partner/               implemented API + Partner/prototype surfaces
  fashion-admin/                 planned production internal operations surface
  fashion-web/                   planned production customer storefront
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

From the repository root:

```bash
npm run fashion:setup
npm run fashion:check
```

The dedicated `Z Fashion PostgreSQL` gate applies the complete ordered ZOS migration sequence before running Fashion database, domain and real PostgreSQL Partner API checks.

## Related domains

`20-registry`, `30-trust-engine`, `40-partner-quality-score`, `50-marketplace`, `60-data`, `100-security`, `160-legal-and-compliance`.

## Status

Integrated pre-production implementation — source/database foundation substantial and convergence-tested; final customer/admin applications, real auth/payment wiring, live database activation and production deployment remain gated.

## Last Updated

2026-08-23
