# Z Find — Domain Model

## Purpose
Defines every entity Z Find is conceptually built around, as a Real Estate
Intelligence Platform — not just a listings portal. No SQL, no code. Entities
marked "Conceptual only" exist here so future work never needs to invent them
from scratch, but are NOT implemented for launch.

**This is the first time this document exists as a real file** — it was
previously written only as chat text during Sprint B planning. This revision
also incorporates the Foundation Audit (6-language) structural corrections.

## Relationship to the frozen architecture
"Property" here is the product-facing name for what the frozen Registry
conceptual model calls an Asset with subtype `apartment`/`villa`/`land`.
Same concept, no contradiction — The shared ZOS Registry is not implemented inside this repository; Z Find
keeps its existing UUID identities and migration 0008 exposes an additive
Registry bridge so those identities can later bind to the shared platform
without replacement or duplication.

## Entities

### Property — IMPLEMENTED
A single real-estate unit. subtype: apartment | villa | land. Belongs to a
Zone Lite. May belong to a Development.

### Development — IMPLEMENTED
A collection of Properties (units) delivered as one project. Owned/built by
a Promoter, sold/represented by one or more Partners. May be represented
and listed directly (see Representation), independent of any single unit.

### Representation — IMPLEMENTED
The authorization relationship between a Partner and EITHER a Property OR a
Development (never both — `target_type` discriminates). Exactly one Active
Representation per represented target, enforced at the database level.

### Listing — IMPLEMENTED
The published, discoverable projection of one Representation. channel:
standard | offmarket. Publication lifecycle (revised, Foundation Audit):
`draft → incomplete → pending_review → ready → published → suspended |
archived`. `suspended` (temporary) and `archived` (permanent) replace the
earlier single `unpublished` state, because those are different real
intents. Carries `currency_iso` (mandatory, no default) alongside every
price — no price exists without a declared currency. Carries nullable
`readiness_score`/`readiness_updated_at`, prepared for a future Listing
Quality Engine that is explicitly not implemented yet.

### Partner — IMPLEMENTED
A Z Find marketplace profile/capability for an agency or individual authorized
to represent a Property/Development for sale. Owns an `enquiry_policy`
(direct/qualified/assisted). May belong to an Organisation. Under ZOS v1.1,
Partner is not a replacement for global Person/Organisation identity; the
vertical profile can later bind to those shared identities.

### Organisation — IMPLEMENTED (minimal schema)
Reuses the frozen Registry concept `Organization → Company → Brand →
Product`. An agency, promoter, developer, or future fund is a Company
within an Organisation. One home/registered country per Organisation is a
real-world fact, not a limitation — a Partner's actual market presence
flows through its Listings' Zones, independent of the Organisation's home
country.

### Zone Lite — IMPLEMENTED
A simple (name, city, country) location tag for search filtering.
Explicitly not Geography — no hierarchy, no currency, no multilingual
names. Toponyms (place names) are deliberately NOT translated per locale —
"Porto" stays "Porto" regardless of UI language, matching real-world
convention. Never to be confused with `packages/geography/`.

### System Language — IMPLEMENTED (new, Foundation Audit)
A configurable language the platform supports: code (e.g. `pt-PT`, `en`),
display name, native name, enabled flag, default flag, sort order. Every
locale-bearing table (Listing Content, Media Asset Content) references this
table by foreign key — adding a 7th language is a data change (one row),
never a schema change. Exactly one language may be marked default,
enforced at the database level.

### Listing Content — IMPLEMENTED
The localized title/description for a Listing, one row per (listing,
locale). Carries a translation lifecycle (`missing → ai_generated →
reviewed → approved`) and a content source (`human` | `ai`) — enough
provenance to know how a translation came to exist and whether it has been
vetted, without yet implementing AI translation itself.

### Media Asset — IMPLEMENTED (restructured, Foundation Audit)
Replaces the earlier flat "Media" concept with a small relational
foundation, real foreign keys throughout (no unvalidated polymorphic
entity_type/entity_id):
- **Media Asset** — the immutable original file + core format metadata
  (type, visibility, path, MIME type, size, dimensions).
- **Media Variant** — a derived/processed file (thumbnail, web-optimized
  size, etc.), any number per Media Asset, `variant_type` open-ended
  (configurable like languages, not a hardcoded enum).
- **Listing Media** / **Development Media** — real association tables
  (not polymorphic), each carrying its own `position`/`is_cover`,
  independent per context. The same Media Asset can be linked to a
  Development AND to one of its unit Listings — the reuse the audit
  required.
- **Media Asset Content** — localized ALT text/caption, same per-locale
  pattern as Listing Content, referencing System Language.

No image processing, AI tagging, perceptual hashing, video transcoding, or
CDN logic exists yet — this is schema foundation only.

### Lead — IMPLEMENTED
A contact/enquiry submitted against a Listing.

### User — IMPLEMENTED (admin/partner only)
An authenticated application profile backed by Supabase Auth, linked to a
Partner. Public visitors are not Users in this phase. Migration 0013 adds an
optional bridge to future ZOS Person identity without changing auth UUIDs.

### Search — IMPLEMENTED
A first-class application/analytics record: a set of filters + result count +
timestamp, logged asynchronously on every search, laying groundwork for a
future Saved Search without blocking the current result on that write. It is
not promoted to a Registry Entity merely because it is persisted.

### Article / Guide / Market Report — Conceptual only
Editorial content. No table, no UI, until a future sprint.

### Favourite / Saved Search (user-level) — Conceptual only
Requires public User accounts, which don't exist yet.

## Ownership and authority
Property/Development identity is independent from the Partner that currently
represents it. Representation carries the marketplace authority relationship.
Listing/Media operations are managed within that representation context. Legal
ownership itself is a separate real-world fact/evidence concern, not inferred
from a Partner foreign key. Lead belongs to the Listing it targets. Application
profile identity is backed by Supabase Auth and can later bind to ZOS Person.

## Future Extensibility
Article/Guide/Market Report are intentionally shaped to later live in a
Knowledge Hub-equivalent domain without needing to touch Property/Listing.
Listing Quality Engine can attach to the already-present nullable
`readiness_score` without a future migration. AI translation can target
Listing Content's existing per-locale rows directly. A future video
pipeline slots into the existing Media Variant concept without a schema
change (`media_type = 'video'` is already a valid value).
