-- Z Studio — brand kit cloud sync authority v1
--
-- Adds per-account storage for saved brand kits (name, accent color, site,
-- phone, watermark flag, active languages, category + spec labels), so the
-- same brand kits are available when someone continues on another device.
--
-- Deliberately does NOT store the logo image: the logo stays device-only
-- (IndexedDB), exactly as documented in the privacy policy. Only the small
-- text/config fields already shown in the app UI are synced.
--
-- RLS-only table: every row is owned by exactly the account that created it.
-- There is no service-role write path here, because brand kits are not
-- commercial/entitlement data — unlike the studio_accounts / commercial
-- authority tables, the client (with the user's own JWT) is the only writer.

create table if not exists public.studio_brand_kits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists studio_brand_kits_user_id_idx on public.studio_brand_kits (user_id);

alter table public.studio_brand_kits enable row level security;

drop policy if exists studio_brand_kits_select_own on public.studio_brand_kits;
create policy studio_brand_kits_select_own on public.studio_brand_kits
  for select using (auth.uid() = user_id);

drop policy if exists studio_brand_kits_insert_own on public.studio_brand_kits;
create policy studio_brand_kits_insert_own on public.studio_brand_kits
  for insert with check (auth.uid() = user_id);

drop policy if exists studio_brand_kits_update_own on public.studio_brand_kits;
create policy studio_brand_kits_update_own on public.studio_brand_kits
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists studio_brand_kits_delete_own on public.studio_brand_kits;
create policy studio_brand_kits_delete_own on public.studio_brand_kits
  for delete using (auth.uid() = user_id);

-- keep updated_at accurate on every upsert coming from the client (PostgREST
-- "Prefer: resolution=merge-duplicates" issues an INSERT ... ON CONFLICT DO
-- UPDATE, which fires this trigger like any other UPDATE)
create or replace function public.studio_brand_kits_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists studio_brand_kits_set_updated_at on public.studio_brand_kits;
create trigger studio_brand_kits_set_updated_at
  before update on public.studio_brand_kits
  for each row execute function public.studio_brand_kits_set_updated_at();
