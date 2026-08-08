create table zos.persons (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table zos.persons is 'Canonical human identities shared across ZOS verticals. Authentication remains owned by Supabase Auth.';

alter table zos.persons enable row level security;

create table zos.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  country_iso text check (country_iso is null or char_length(country_iso) = 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table zos.organisations is 'Canonical organisations shared across ZOS. Domain roles such as partner, dealer and employer remain owned by their verticals.';

alter table zos.organisations enable row level security;
