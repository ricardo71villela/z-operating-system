# Z Fashion — ZOS Alignment

## Purpose
Declares how Z Fashion, as a new ZOS vertical, reuses existing canonical ZOS
domains rather than duplicating them, following the same pattern already
applied by Z Jobs and Z Mobility.

## Reused as-is from ZOS core
- **20-registry** — Partner is a Registry entity like any other adherent
  organization; no new registry type is introduced for "fashion store."
- **40-partner-quality-score** — Corner and All Sale eligibility are gated by
  the existing Partner Quality Score model, not a fashion-specific score.
- **30-trust-engine** — reviews, dispute handling and reputation reuse the
  existing Trust Engine rather than a parallel one.

## Extended by Z Fashion
- **50-marketplace** — Corner and All Sale are new marketplace presentation
  modes; the underlying Marketplace Model's listing/publication concepts are
  reused, not replaced.
- **60-data** — product catalog attributes (size grids, age segment, shade
  variants) are Fashion-specific data shapes layered on the shared Data Model.

## Net-new to Z Fashion (no ZOS precedent yet)
- Multi-partner unified cart/checkout spanning several Corners in one order.
- Campaign taxonomy: Saldos, Vendas Privadas, Novas Coleções, Black Friday.
- Minor-safe handling for the Children/Youth segments (age-appropriate
  content, guardian consent where applicable) — see `160-legal-and-compliance`.

## Open questions
- Does "unified checkout across Partners" require a new shared-platform
  capability (a ZOS-level Order/Cart primitive), or does it stay Fashion-owned
  until a second vertical needs the same pattern?
- Should Partner Quality Score gain fashion-specific signals (return rate by
  size, image quality) as vertical-specific extensions, or stay generic?

## Status
Draft

## Last Updated
2026-08-20
