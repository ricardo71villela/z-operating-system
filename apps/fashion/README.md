# Z Fashion

Z Fashion is the Fashion & Lifestyle Retail vertical of the Z Operating System
(ZOS) ecosystem. It is a multi-partner marketplace for clothing, footwear,
sportswear, accessories/leather goods and cosmetics across children, youth
and adult segments, converging with shared
ZOS capabilities according to the **ZOS Architectural Constitution v1.1**.

Inventory belongs to each adherent store (**Partner**). Every Partner can run
its own branded **Corner** (comparable to a department-store concession, e.g.
Galeries Lafayette) while also participating in the platform-wide **All Sale**
section. The unified customer experience — single cart, single checkout, single
order — is owned by Z Fashion regardless of how many Partners a basket spans.

## Architecture status

Pre-implementation. This README and the linked architecture notes establish
scope and the ZOS ownership boundary before any application code is written,
mirroring how Z Jobs and Z Mobility declared their boundary early.

See `docs/architecture/ZOS-ALIGNMENT.md` and
[`140-roadmaps/Z-FASHION-STRATEGY.md`](../../140-roadmaps/Z-FASHION-STRATEGY.md).

## Product surface

- **Client segments** — Children, Youth, Adults.
- **Categories** — Clothing, Footwear, Sportswear, Accessories & Leather
  Goods (Maroquinaria), Cosmetics. Accessories & Leather Goods is its own
  category rather than a Clothing sub-filter for the same reason department
  stores give it a dedicated floor space (Galeries Lafayette, Le Bon Marché
  both run a distinct "Espace Maroquinerie") — bags, wallets, belts have
  their own material/craftsmanship attributes and their own Partner profile
  (small artisan ateliers), separate from apparel sizing logic entirely.
  Sportswear is its own category (not a filter within Clothing/Footwear) because it has
  distinct attributes (sport/activity, technical fabric specs) and because
  Partners in this space — Decathlon-style specialists, sneaker/sportswear
  boutiques — expect their own Corner identity the same way a fashion
  boutique does.
- **Corners** — Partner-branded storefronts within Z Fashion (own visual
  identity, storytelling, curation); commerce plumbing (cart, checkout,
  fulfillment, payments) stays platform-owned. Category is a **Product**-level
  attribute, never a Partner-level one: a single Partner/Corner routinely
  spans several Categories at once (a fashion house selling clothing,
  footwear and leather goods together is the common case, not an edge case),
  so a Partner declares which Categories it operates in (for eligibility and
  taxonomy purposes) but each product carries its own Category independently
  — the Corner simply aggregates whatever Categories that Partner's catalog
  actually contains.
- **All Sale** — cross-partner discovery surface, filterable across every
  Corner's catalog.
- **Campaigns** — Destaques (editorial highlights), Saldos (partner-driven
  clearance), Vendas Privadas (private/early-access sales), Novas Coleções
  (scheduled drops), Black Friday (platform-wide seasonal event).

## ZOS ownership boundary

### Shared-platform candidates
Person identity, Partner/Organization identity, Registry references, Trust
Engine mechanics, Partner Quality Score, Geography/Locale/Currency, audit
mechanics, and integration transport — reused as-is from the ZOS core rather
than rebuilt per vertical.

### Z Fashion-owned domain
Product catalog (apparel/footwear/sportswear/leather-goods/cosmetics
attributes: size, age segment, material, shade/variant — Category lives on
the Product, not the Partner), Corner configuration, All Sale aggregation
rules,
Campaign types and scheduling (Saldos, Vendas Privadas, Novas Coleções, Black
Friday), unified cart/checkout across Partners, returns/exchange policy
harmonization, and minor-safe data handling for the Children/Youth segments.

## Repository structure (proposed)

```text
apps/
  fashion-admin/   internal ops console (partner onboarding, campaign scheduling)
  fashion-partner/ partner-facing portal (catalog, stock, pricing, Corner design)
  fashion-web/     customer-facing storefront (Corners, All Sale, checkout)
packages/
  fashion-domain/  pure TypeScript domain rules (catalog, campaigns, cart)
docs/
  architecture/    ZOS alignment, data model, decision records
  legal/           minor-safe data handling, returns policy, partner terms
```

## Related domains
`20-registry`, `30-trust-engine`, `40-partner-quality-score`, `50-marketplace`,
`100-security`, `160-legal-and-compliance`.

## Status
Draft

## Last Updated
2026-08-20
