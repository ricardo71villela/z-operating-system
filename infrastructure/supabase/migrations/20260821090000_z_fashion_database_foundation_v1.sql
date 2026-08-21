-- ============================================================
-- Z Fashion — Database Foundation v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Vertical schema: fashion
-- Core schemas (zos, zos_api) remain authoritative and separate.
-- Partner keeps its own local identity here — no direct foreign key
-- to zos.organisations — following the same pattern already used by
-- Z Find and Z Jobs: local identity first, canonical binding via
-- zos.registry_bindings is optional and added later, not required
-- to launch.
-- ============================================================

create schema if not exists fashion;

comment on schema fashion is 'Z Fashion vertical: Partner, Corner and catalog domain data. Owns no ZOS-shared concept — Geography and Currency are read from zos.*, never duplicated here.';

create type fashion.category as enum (
  'clothing',
  'footwear',
  'sportswear',
  'accessories_leather_goods',
  'cosmetics'
);

comment on type fashion.category is 'Mirrors CATEGORIES in fashion-domain/src/partner.js. Cosmetics includes Perfumes/Fragrances — not a separate value.';

create type fashion.age_segment as enum ('children', 'youth', 'adults');

create type fashion.feed_reliability_tier as enum ('live', 'degraded');

create type fashion.onboarding_status as enum (
  'applied', 'under_review', 'approved', 'rejected', 'active', 'suspended'
);

create table fashion.partners (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (char_length(trim(legal_name)) > 0),
  country_iso text not null check (country_iso ~ '^[A-Z]{2}$'),
  locales text[] not null check (array_length(locales, 1) > 0),
  categories fashion.category[] not null check (array_length(categories, 1) > 0),
  age_segments fashion.age_segment[] not null default array['adults']::fashion.age_segment[],
  minor_safe_data_acknowledged boolean not null default false,
  onboarding_status fashion.onboarding_status not null default 'applied',
  feed_reliability_tier fashion.feed_reliability_tier,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fashion_partners_minor_safe_gate check (
    not (
      ('children' = any(age_segments) or 'youth' = any(age_segments))
      and onboarding_status = 'active'
      and not minor_safe_data_acknowledged
    )
  ),
  constraint fashion_partners_active_requires_feed_tier check (
    onboarding_status <> 'active' or feed_reliability_tier is not null
  )
);

comment on table fashion.partners is 'The store/legal entity holding stock. Never a Brand — see DOMAIN-SKETCH.md. country_iso follows the same ISO-3166-1 alpha-2 convention as zos.geography_locations; this table does not duplicate Geography, it references the same code space.';

alter table fashion.partners enable row level security;

create index idx_fashion_partners_country on fashion.partners(country_iso);
create index idx_fashion_partners_status on fashion.partners(onboarding_status);

create table fashion.corner_configs (
  partner_id uuid primary key references fashion.partners(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) > 0),
  byline text check (byline is null or char_length(byline) <= 140),
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table fashion.corner_configs is 'What a Partner may customize about their Corner — the entire surface, by construction. No column for layout or markup. Mirrors corner-config.js exactly; byline capped at 140 chars (MAX_BYLINE_LENGTH).';

alter table fashion.corner_configs enable row level security;

create policy "partners manage their own record"
on fashion.partners
for all
to authenticated
using (id = (auth.jwt() ->> 'fashion_partner_id')::uuid)
with check (id = (auth.jwt() ->> 'fashion_partner_id')::uuid);

comment on policy "partners manage their own record" on fashion.partners is 'Placeholder claim-based policy — fashion_partner_id is not yet issued by any auth flow. Revisit once fashion-partner auth is wired to Supabase Auth; do not treat this as production-ready access control yet.';
