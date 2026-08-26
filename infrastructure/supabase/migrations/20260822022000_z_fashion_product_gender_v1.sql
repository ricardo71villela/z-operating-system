-- ============================================================
-- Z Fashion — Product Gender v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Mirrors the GENDERS constant added to product.js: Gender is a
-- single-valued, always-explicit Product attribute ('female', 'male',
-- 'unisex') — owned by fashion.products itself, not partner.js/
-- fashion.partners, since a Partner never declares Gender eligibility
-- the way it does Category/Age Segment (no compliance-gate question
-- here, same shape as Brand).
--
-- Also closes a gap left by 20260821180000_z_fashion_baby_age_segment_v1.sql:
-- that migration added 'baby' to fashion.age_segment and to the
-- Partner-level minor-safe gate, but missed the equivalent
-- Product-level constraint (fashion_products_minor_segment_requires_
-- certification), which still only covered children/youth. Fixed here
-- rather than left silently inconsistent with product.js, which
-- already requires certification for baby.
-- ============================================================

create type fashion.gender as enum ('female', 'male', 'unisex');

comment on type fashion.gender is 'Mirrors GENDERS in product.js. Single-valued — a Product targets one Gender or is explicitly Unisex, never left blank or inferred.';

-- No DEFAULT on purpose: gender is always explicit in product.js, and the
-- schema has no live Product rows yet (this vertical has not launched),
-- so NOT NULL without a default is safe here and enforces the same
-- never-inferred discipline at the database level.
alter table fashion.products add column gender fashion.gender not null;

create index idx_fashion_products_gender on fashion.products(gender);

-- Fix: extend the minor-segment certification gate to cover 'baby',
-- matching product.js's needsCertification check exactly. The original
-- foundation migration predates the Baby segment and was never
-- backfilled at the Product level (only the Partner-level gate was).
alter table fashion.products drop constraint fashion_products_minor_segment_requires_certification;

alter table fashion.products add constraint fashion_products_minor_segment_requires_certification check (
  not (
    'baby' = any(age_segments) or 'children' = any(age_segments) or 'youth' = any(age_segments)
  ) or coalesce(array_length(safety_certifications, 1), 0) > 0
);

comment on constraint fashion_products_minor_segment_requires_certification on fashion.products is 'Mirrors needsCertification in product.js. Covers baby, children and youth identically.';
