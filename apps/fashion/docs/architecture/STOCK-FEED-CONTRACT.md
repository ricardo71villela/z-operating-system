# Z Fashion — Partner Stock & Price Feed Contract

## Purpose
Defines the contract every Partner integration must satisfy, before any
Partner-facing UI is built. Per Z-FASHION-COMPETITIVE-LANDSCAPE.md, this is
the single highest-churn-risk item in the whole project — Miinto's own
onboarding friction confirms boutiques leave not because a Corner looks
wrong, but because inventory desyncs and they oversell. This contract exists
to make that failure mode structurally hard, not just documented as a risk.

## The core problem
Independent-boutique Partners (the priority acquisition tier for Sportswear
and Accessories per the competitive review) typically also sell in a
physical store. The same physical unit can sell in-store while still
showing as available on Z Fashion — flagged as an unresolved gap in
DOMAIN-SKETCH.md's final pass. This contract resolves it.

## Resolved: reservation-based stock, not trust-based sync alone
Two complementary mechanisms, not one:

1. **Partner pushes stock updates** (near-real-time, not batch) — each
   update carries an `observedAt` timestamp from the Partner's own system.
   A stale update (older than what's already applied) is **rejected, not
   silently overwritten** — protects against an out-of-order delivery
   undoing a fresher in-store sale the Partner already reported.
   **Bulk ingestion implemented 2026-08-21** (partner-side audit, ponto 3):
   the only endpoint that existed before this accepted one Product at a
   time — a Partner with 200 SKUs needed 200 separate requests for a
   routine update. `POST /partners/:id/stock/bulk` now processes an array
   of updates, each independently through the exact same
   `applyStockUpdate()` the single-item endpoint uses — one stale item in
   a 200-item batch fails only that item, never the other 199 (per-item
   results, not all-or-nothing; all-or-nothing belongs to checkout
   reservations across Partners, a different concern from feed ingestion).
2. **The platform reserves stock at checkout**, not just at order
   confirmation. A reservation holds units for a short window (default 10
   minutes); if checkout doesn't complete, the reservation expires and the
   units return to available stock automatically. This is what actually
   prevents overselling *between* Partner feed pushes, since no feed is
   truly real-time — the reservation window covers the gap.

## Reliability bar
Per the Phase 0 priority order: this contract needs a **tighter reliability
bar than anything client-facing shipped before it** — better to launch with
fewer Partners on a rock-solid feed than many Partners on a shaky one. A
Partner integration that cannot push near-real-time updates (e.g., a
boutique that can only export a spreadsheet once a day) is not disqualified,
but must accept a visibly wider safety margin — see "Degraded feed mode"
below — rather than being treated identically to a POS-integrated Partner.

## Degraded feed mode (explicit, not silent)
A Partner feeding stock less frequently than near-real-time (e.g., daily
batch) is **not treated as equivalent** to a live-feed Partner. Concretely:
reservation windows for that Partner's products extend automatically, and
their Corner may carry a lower Partner Quality Score weighting for
inventory reliability (ties into the PQS-per-Category model in
DOMAIN-SKETCH.md) — never presented to the Client as a full guarantee it
cannot actually back.

## Still open (honestly, not silently)
- The reservation-window extension for `degraded`-tier Partners described
  above is not implemented — `feedReliabilityTier` exists on the Partner
  record (onboarding.js) but `stock.js`'s reservation hold duration is
  still a single constant regardless of it.
- Stock has no Postgres persistence at all — both the single-item and
  bulk endpoints stay in-memory in every mode, unlike every other Fashion
  entity, which already has a real table. Flagged here rather than
  quietly left inconsistent with the rest of this document's own "trust
  the schema, not just the endpoint" spirit.
- No Partner-ownership check on `productId` — nothing today stops one
  Partner from pushing a stock update for a Product that belongs to
  another Partner.

## Status
Draft

## Last Updated
2026-08-20
