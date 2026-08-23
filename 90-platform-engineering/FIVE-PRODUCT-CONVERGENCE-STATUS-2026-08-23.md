# ZOS Five-Product Convergence Status — 2026-08-23

## Purpose

This document records the current source and CI authority for the five active ZOS products after the 2026-08-23 reconciliation waves.

It is a source/engineering snapshot, **not** a production deployment authority. It does not authorize a merge to `main`, a live database mutation, a production deployment, Stripe live activation, Railway mutation, Vercel mutation, or store submission.

## Current convergence authority

- Repository: `ricardo71villela/z-operating-system`
- Convergence branch: `chore/zos-five-app-convergence-v1`
- Convergence PR: `#34` — open, draft, not merged
- Base `main`: `94f025edb4439a84f20aa0601e318a7fb0905985`
- Fully validated convergence head before this documentation-only reconciliation: `62313404d095b864aa7c09383a44784eeb7bf47a`
- Internal workflow matrix on `62313404d095b864aa7c09383a44784eeb7bf47a`: **15/15 PASS**

Validated workflows on that exact source head:

1. Z Studio AI Authority — PASS
2. Z Studio Content Persistence PostgreSQL — PASS
3. Z Studio Commercial Activation PostgreSQL — PASS
4. Z Studio Cross-Platform Release PostgreSQL — PASS
5. ZOS Core PostgreSQL — PASS
6. Z Studio Entitlement PostgreSQL — PASS
7. Z Studio Paid AI PostgreSQL — PASS
8. Z Jobs Shared ZOS PostgreSQL — PASS
9. Z Fashion PostgreSQL — PASS
10. Z Mobility PostgreSQL — PASS
11. Z Studio Apple StoreKit Authority — PASS
12. ZOS Platform CI — PASS
13. Z Studio Release Authority — PASS
14. Z Find Browser — PASS
15. Z Jobs PostgreSQL — PASS

## Z Find

Recent convergence work is registered through PRs `#43`, `#44`, `#45`, `#46` and `#49`.

Current source authority includes:

- Web/Admin/Partner release hardening;
- source-controlled `noindex` for private Admin/Partner surfaces;
- six public locales: FR / EN / PT / ES / DE / IT;
- Admin authoring authority for `fr`, `en`, `pt-PT`, `es`, `de`, `it`;
- Partner language authority derived dynamically from enabled system languages;
- 24 markets × 6 locales = 144 deterministic market SEO pages;
- canonical/hreflang/indexation contracts;
- no fabricated editorial listing translation: a localized listing URL/hreflang exists only when genuine localized editorial content exists;
- browser and release gates aligned with the six-language authority.

Production/domain rebinding remains a separate external gate. This snapshot records source and CI only.

## Z Fashion

Recent convergence work is registered through PRs `#47`, `#50`, `#52` and `#55`.

### Paid Order and immutable checkout authority

- Order starts `pending_payment`, never commercially confirmed before payment succeeds;
- immutable `order_items` snapshot at checkout;
- exact payment amount/order identity gates before stock confirmation;
- paid lifecycle separated from Partner Shipment fulfillment;
- partial/full refund accounting;
- unpaid cancellation releases reservations.

### Partner-safe Order operations

- a Partner sees only its own Order split and Shipment;
- independent boutique fulfillment timelines are preserved;
- duplicate Shipment authority is rejected;
- Admin aggregate reconciles Partner subtotals against immutable Order total.

### Return settlement authority

- Return quantity is explicit;
- partial Returns are supported;
- cumulative over-return is rejected;
- concurrent partial Return inserts serialize on the immutable Order line;
- refund amount = purchased unit price × returned quantity;
- Return + Order refund aggregate settle atomically;
- provider/webhook retries are idempotent;
- ambiguous legacy pre-production Returns are not guessed.

### Customer post-purchase Order view

- Client ownership is enforced at the domain boundary;
- one multi-boutique Order is projected as independent Partner packages;
- Return history is attached per purchased line;
- active/refunded/remaining Return quantities are reconciled;
- delivery-window eligibility is exposed without pretending product/hygiene eligibility is known;
- immutable Order refund total, Return refunds and net paid are reconciled;
- duplicate Shipment authority, over-return and refund inconsistencies are detected;
- resulting read model is deeply immutable.

## Z Jobs

Recent convergence work is registered through PRs `#42`, `#48`, `#51`, `#53` and `#54`.

### Railway source preparation

Source is prepared for Railway API, Web and public Montra, including Web→API private-network proxying and a CI hosting contract.

**Railway live deployment remains NOT VERIFIED and no Railway account/project/domain/variable mutation is recorded by this convergence work.**

### Explainable intelligence foundation

- Match Intelligence adds confidence and factor roles without creating a second score authority;
- Candidate Intelligence derives profile completeness, preference coverage and next actions for the candidate;
- Employer Intelligence derives evidence level, responsibility components, badges, strengths, attention areas and explicit limitations;
- paid placement does not affect intelligence results;
- no protected candidate attributes are used for these calculations.

### Recruiter funnel intelligence

- current application stage counts;
- active backlog and unacknowledged applications;
- interview / offer / hire rates;
- median time to first response and hire where evidence exists;
- explicit data coverage and limitations.

### Explicit qualification matching

The existing PostgreSQL columns `responsibilities`, `required_qualifications` and `preferred_qualifications` now cross the application boundary end-to-end.

Rules:

- required qualifications are the primary explicit skills evidence when present;
- preferred-only overlap may improve relevance only to partial;
- responsibilities are not silently promoted to hard requirements;
- legacy offers without explicit qualification fields retain title+description fallback;
- existing score weights and explainable matching authority remain unchanged.

Permanent PostgreSQL E2E coverage proves:

`HTTP create → PostgreSQL columns → store enrichment → review → publish → candidate → matched-offers → explicit_requirements evidence → translated explanation`.

The dedicated `Verify explicit requirements PostgreSQL matching` workflow step is PASS.

## Z Jobs Intelligence API — explicit HOLD

Branch: `feature/zjobs-intelligence-api-v1`

Current isolated commit:

`b5fdf06375af487c75ce5606a84aebe8ccacd8eb` — `feat(jobs): expose candidate and employer intelligence through existing API data`

This branch is **NOT integrated into convergence**.

Reason for HOLD:

`GET /candidates/:id/profile-bundle` exposes a candidate profile bundle and does not yet have the explicit router-level authorization boundary required before `candidateIntelligence` may be attached to it.

Required pre-merge security contract:

- unauthenticated request → blocked;
- own candidate → allowed;
- different authenticated candidate → blocked;
- authorized platform staff → allowed;
- Candidate Intelligence remains candidate-only;
- tests must prove the boundary against real PostgreSQL/RLS before integration.

Employer Intelligence API exposure may proceed only without exposing individual candidate records and without introducing a second scoring or persistence authority.

## Z Studio

No new Studio product mutation is introduced by the Fashion/Jobs waves recorded here.

The earlier one-off mobile initial-state failure (`EMPTY` expected, `loading` observed) was re-run without source change and passed. The subsequent full convergence heads returned to green, including the exact `62313404...` 15/15 matrix above.

## Z Mobility

No source mutation was introduced by the Fashion/Jobs waves recorded here. Z Mobility PostgreSQL remains PASS on the fully validated convergence head.

## Safety boundary

As of this snapshot:

```text
MAIN_MERGED=false
MAIN_MUTATED=false
LIVE_SUPABASE_MUTATION=false
PRODUCTION_DEPLOYMENT=false
STRIPE_LIVE_ACTIVATION=false
RAILWAY_LIVE_MUTATION=false
VERCEL_MUTATION_FROM_RECENT_FASHION_JOBS_WAVES=false
STORE_SUBMISSION=false
FORCE_PUSH=false
```

PR `#34` remains the convergence gate and remains intentionally draft.

## Next controlled work

1. harden `GET /candidates/:id/profile-bundle` authorization;
2. expose Candidate Intelligence only after self/staff access tests pass;
3. expose Employer Intelligence through aggregate-safe existing API authority;
4. validate Z Jobs typecheck/tests + PostgreSQL + Shared ZOS PostgreSQL;
5. return the complete convergence head to a fully observed green matrix before any merge-to-main decision.

## Last Updated

2026-08-23
