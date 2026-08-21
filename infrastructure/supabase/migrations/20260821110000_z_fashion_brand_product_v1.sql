-- ============================================================
-- Z Fashion — Brand & Product v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Mirrors fashion-domain/src/brand.js and product.js exactly. Every
-- invariant enforced in those JS validators is re-enforced here as a
-- CHECK constraint — the database is a second, independent
-- enforcement point, not a passive store trusting application code
-- (see fashion_partners_minor_safe_gate in the foundation migration
-- for the same discipline applied to Partner).
-- ============================================================

create table fashion.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  house_label_of_partner_id uuid references fashion.partners(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table fashion.brands is 'Mirrors brand.js. Never a Partner — a Partner''s own house label is still just a Brand row, referenced by its Products like any other. One-directional: house_label_of_partner_id may point back at a Partner; Partner never points at a Brand.';

alter table fashion.brands enable row level security;

create table fashion.products (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references fashion.partners(id) on delete cascade,
  brand_id uuid not null references fashion.brands(id) on delete restrict,
  categories fashion.category[] not null check (array_length(categories, 1) > 0),
  technical_purpose boolean not null default false,
  age_segments fashion.age_segment[] not null default array['adults']::fashion.age_segment[],
  safety_certifications text[] not null default array[]::text[],
  size jsonb,
  format jsonb,
  corner_exclusive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Sportswear requires genuine technical purpose, never aesthetic
  -- resemblance — a casual sneaker that merely looks athletic is
  -- Footwear only (see DOMAIN-SKETCH.md).
  constraint fashion_products_sportswear_requires_technical_purpose check (
    not ('sportswear' = any(categories)) or technical_purpose
  ),

  -- Children/Youth eligibility is never inferred from size or
  -- appearance alone — genuine safety certification is required.
  constraint fashion_products_minor_segment_requires_certification check (
    not (
      'children' = any(age_segments) or 'youth' = any(age_segments)
    ) or coalesce(array_length(safety_certifications, 1), 0) > 0
  ),

  -- Size is Category-conditional, never a universal field: Clothing/
  -- Footwear/Sportswear require it.
  constraint fashion_products_sized_categories_require_size check (
    not (categories && array['clothing','footwear','sportswear']::fashion.category[])
    or size is not null
  ),

  -- Cosmetics carries `format` (volume/shade), never `size` — a
  -- different concept, not a point on the same scale.
  constraint fashion_products_cosmetics_format_not_size check (
    not ('cosmetics' = any(categories))
    or (format is not null and size is null)
  )
);

comment on table fashion.products is 'Mirrors product.js exactly — every invariant from that validator (Sportswear genuine-purpose, Children/Youth certification, Category-conditional size, Cosmetics format-not-size) is enforced here independently as a CHECK constraint, not only in application code.';

alter table fashion.products enable row level security;

create index idx_fashion_products_partner on fashion.products(partner_id);
create index idx_fashion_products_brand on fashion.products(brand_id);
create index idx_fashion_products_categories on fashion.products using gin(categories);
create index idx_fashion_products_corner_exclusive on fashion.products(corner_exclusive) where corner_exclusive = false;
