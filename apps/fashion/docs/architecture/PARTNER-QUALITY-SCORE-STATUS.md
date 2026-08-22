# Z Fashion — Partner Quality Score: Status

## Purpose
Records the decision made closing ponto 4 of the partner-side audit
(2026-08-21): what Z Fashion does — and deliberately does not do — about
Partner Quality Score (PQS) while the real, cross-vertical ZOS
implementation does not yet exist.

## Finding
Two places in `fashion-domain` already consume a `partnerQualityScore`:
`commission.js`'s `qualityScoreDiscount()` (feeds into the progressive
commission rate) and `homepage.js`'s `isEligibleForSponsorship()` (gates
the paid Sponsored Destaque slot). Neither has ever received a real score
— `partnerQualityScore` is `null` for every Partner in every real call
path today, because the score itself is owned by a separate ZOS-core
initiative (`40-partner-quality-score/PARTNER-QUALITY-SCORE-MODEL.md`)
that Z Fashion has never been registered against. That document's own
status is `Draft`, and it explicitly states no concrete weights,
dimensions, or formula are fixed yet — "implementation and product
decisions for a later, separately governed phase."

## What this is not
Not a bug. Both consuming functions were already written defensively —
`qualityScoreDiscount()` returns `0` for a non-numeric score,
`isEligibleForSponsorship()` requires `typeof partnerQualityScore ===
'number'` and is `false` otherwise. Neither ever fabricates, defaults
upward, or infers a score. The commission-discount and sponsored-slot
features are correctly, safely inert — not silently broken.

## Decision: do not build a Fashion-local substitute
Considered and rejected. `PARTNER-QUALITY-SCORE-MODEL.md`'s own Boundary
Rules forbid exactly this: *"never a parallel Quality Signal system,"*
*"no parallel Partner record."* A Fashion-only scoring mechanism —
however simplified — would be precisely the kind of parallel system that
architecture exists to prevent, and would need to be torn out and
reconciled against the real Trust Engine's output later rather than
composed with it.

## What was done instead
Both functions now carry an explicit, prominent code comment stating
they are **deliberately, permanently inert** until Z Fashion integrates
with the real Trust Engine — not a placeholder someone might "helpfully"
wire up with fake data, and not a silent gap a future reader would have
to rediscover independently.

## What integrating for real would require
Not scoped here — flagged for whenever it becomes relevant:
- Z Fashion registering as a consuming Marketplace context per
  `50-marketplace/MARKETPLACE-MODEL.md`'s authority (PQS never owns the
  threshold or decision — Marketplace does, and per this document's own
  Authority Map, Z Fashion's own commission/sponsorship logic is a
  Marketplace Decision in that vocabulary).
- The Partner-specific Assessment Model methodology (weights, which
  Signal categories apply) being proposed and governed per
  `110-governance`, since it isn't fixed yet even at the ZOS-core level.
- A real pipeline supplying an actual computed score into
  `effectiveCommissionRate()`/`selectSponsoredDestaque()` call sites —
  today nothing in `fashion-partner`'s API or `fashion-web` (which
  doesn't exist yet either) ever passes one.

## Status
Resolved (as "intentionally inert, clearly documented" — not as
"implemented")

## Last Updated
2026-08-21
