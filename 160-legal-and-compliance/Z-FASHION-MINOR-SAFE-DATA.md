# Z Fashion — Minor-Safe Data Policy

## Purpose
Closes the gap flagged repeatedly during Z Fashion's design (README.md,
ZOS-ALIGNMENT.md, DOMAIN-SKETCH.md) as "non-negotiable before any Baby/
Children/Youth catalog goes live," and never actually written until now.
Defines how Z Fashion handles data touching the Baby/Children/Youth
segments — as distinct from product-safety compliance for children's goods
(covered in DOMAIN-SKETCH.md's Age Segment section), which is a separate
regulatory regime this document does not duplicate.

## Scope
Personal-data handling under GDPR where a Baby/Child/Youth is the data
subject or the product recipient. Does not cover product safety
certification for baby's/children's/youth items (see DOMAIN-SKETCH.md) or
general platform data protection (see `100-security`, `10-company`).

## The central framing decision
Two regulatory regimes get conflated easily and must not be:

1. **Selling products for children** (a product-safety and labeling
   question — already addressed for Age Segment eligibility).
2. **Collecting personal data from a child as data subject** (a GDPR
   Article 8 question — this document's actual scope).

Z Fashion's ordinary purchase flow does **not** require the child to be the
account holder or data subject at all: a parent/guardian browses, buys, and
manages the order for a Baby- or Children-segment product, the same way most
baby/children's-fashion e-commerce already operates. If that remains true in
implementation, **GDPR Article 8's child-consent-for-information-society-
services regime does not apply**, because the service is not being offered
directly to the child. This is the default assumption and the one worth
protecting deliberately in product design — the moment the platform lets a
child create their own account, submit their own profile data, or receive
personalized marketing directly, Article 8 engages and the rest of this
document becomes load-bearing rather than precautionary.

## If a minor is ever the account holder or data subject
Applies if a future feature (a Youth-segment personal account, a wishlist
tied to a child's own profile, etc.) makes the child the actual user:

- **Age of digital consent is not uniform across the EU.** GDPR sets 16 as
  the default, but allows Member States to lower it to a floor of 13.
  **France has set it at 15** — the France-launch default. A 20-market
  platform cannot hardcode 15; the age-of-consent threshold must resolve
  per-country the same way Geography already resolves Currency, not be a
  single constant.
- **Below the applicable age, parental consent is mandatory**, not optional
  — processing without it is unlawful, not merely risky.
- **No targeted/behavioral advertising to minors.** The Digital Services Act
  prohibits platforms that are "aware with reasonable certainty" a user is
  a minor from showing targeted advertising based on profiling of that
  minor's data — this applies regardless of GDPR consent status, and
  applies to Z Fashion's own Destaques/Campaign personalization logic if it
  ever runs against a minor's own data, not just third-party ads.

## Practical defaults for Z Fashion's launch scope
- Account holders are adults (parents/guardians); Baby/Children/Youth
  segments describe the **product**, not the account — Baby least of all
  ever plausibly becomes the account holder.
- Campaign/Destaques personalization for Baby/Children/Youth-segment
  purchases targets the purchasing adult's behavior, never a child's own
  inferred profile.
- If Youth-segment self-service accounts are ever introduced (plausible —
  "Youth" as a segment implies teenagers who may want their own experience
  eventually), that feature requires this document to be revisited *before*
  build, with a per-country age-of-consent table and a parental-consent
  flow — not retrofitted after launch.

## Status
Draft — first substantive content in `160-legal-and-compliance` scoped to
Z Fashion; the domain's existing README stays real-estate/GDPR-general and
is not modified by this document.

## Last Updated
2026-08-20
