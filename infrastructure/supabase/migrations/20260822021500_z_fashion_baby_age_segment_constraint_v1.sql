-- ============================================================
-- Z Fashion — Baby Age Segment: minor-safe constraint v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Second half of the 'baby' Age Segment change, split out from
-- 20260822021000_z_fashion_baby_age_segment_v1.sql so this file's use
-- of the new enum value 'baby' runs in a transaction committed after
-- the ADD VALUE, per Postgres's restriction on using a new enum value
-- in the same transaction that added it (SQLSTATE 55P04).
--
-- The minor-safe gate must cover baby exactly like children/youth — a
-- Partner cannot activate with baby eligibility declared and no
-- acknowledgment, same discipline, not a lighter-touch check for a
-- smaller word in the array.
-- ============================================================

alter table fashion.partners drop constraint fashion_partners_minor_safe_gate;

alter table fashion.partners add constraint fashion_partners_minor_safe_gate check (
  not (
    ('baby' = any(age_segments) or 'children' = any(age_segments) or 'youth' = any(age_segments))
    and onboarding_status = 'active'
    and not minor_safe_data_acknowledged
  )
);

comment on constraint fashion_partners_minor_safe_gate on fashion.partners is 'Mirrors the minor-safe gate in partner.js/onboarding.js. Covers baby, children and youth identically — baby is not a lighter-touch segment.';
