-- ============================================================
-- Z Fashion — Baby Age Segment v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Adds 'baby' as a fourth Age Segment, alongside children/youth/adults.
-- Mirrors the partner.js/product.js/onboarding.js change: baby is
-- genuinely distinct from children (different safety-certification
-- regime, different size conventions — pre-walking Footwear barely
-- exists as a real product line — never treated as a synonym for
-- "small child"). A new migration, not an edit to
-- 20260821090000_z_fashion_database_foundation_v1.sql — that migration
-- is already applied; Postgres enums and CHECK constraints are altered
-- forward, never rewritten in place.
-- ============================================================

alter type fashion.age_segment add value if not exists 'baby';

-- The minor-safe gate must cover baby exactly like children/youth — a
-- Partner cannot activate with baby eligibility declared and no
-- acknowledgment, same discipline, not a lighter-touch check for a
-- smaller word in the array. ALTER TYPE ADD VALUE cannot run inside the
-- same transaction as a statement that uses the new value, so this
-- constraint replacement is deliberately its own migration file, not
-- appended to the same statement batch that added 'baby' above would be
-- if it were one migration — Postgres would reject that combination.
alter table fashion.partners drop constraint fashion_partners_minor_safe_gate;

alter table fashion.partners add constraint fashion_partners_minor_safe_gate check (
  not (
    ('baby' = any(age_segments) or 'children' = any(age_segments) or 'youth' = any(age_segments))
    and onboarding_status = 'active'
    and not minor_safe_data_acknowledged
  )
);

comment on constraint fashion_partners_minor_safe_gate on fashion.partners is 'Mirrors the minor-safe gate in partner.js/onboarding.js. Covers baby, children and youth identically — baby is not a lighter-touch segment.';
