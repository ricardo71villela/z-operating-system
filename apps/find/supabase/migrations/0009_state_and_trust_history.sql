-- ============================================================
-- Z FIND — MIGRATION 0009 — State History + Trust Boundary
-- ============================================================
-- ZOS v1.1 does not impose one universal lifecycle. Listing,
-- Representation and Verification keep distinct state machines while their
-- transitions/assessments become durable and auditable.
-- ============================================================

create table listing_state_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id),
  from_status text,
  to_status text not null,
  actor_profile_id uuid references profiles(id),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);
alter table listing_state_history enable row level security;

create table representation_state_history (
  id uuid primary key default gen_random_uuid(),
  representation_id uuid not null references representations(id),
  from_status text,
  to_status text not null,
  actor_profile_id uuid references profiles(id),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);
alter table representation_state_history enable row level security;

create or replace function public.capture_listing_state_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into listing_state_history(listing_id, from_status, to_status, actor_profile_id)
    values (new.id, null, new.status, auth.uid());
  elsif old.status is distinct from new.status then
    insert into listing_state_history(listing_id, from_status, to_status, actor_profile_id)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

insert into listing_state_history(listing_id, from_status, to_status, reason, metadata)
select id, null, status, 'baseline_migration', jsonb_build_object('migration','0009') from listings;

create trigger trg_listing_state_history
after insert or update of status on listings
for each row execute function public.capture_listing_state_history();

create or replace function public.capture_representation_state_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into representation_state_history(representation_id, from_status, to_status, actor_profile_id)
    values (new.id, null, new.status, auth.uid());
  elsif old.status is distinct from new.status then
    insert into representation_state_history(representation_id, from_status, to_status, actor_profile_id)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

insert into representation_state_history(representation_id, from_status, to_status, reason, metadata)
select id, null, status, 'baseline_migration', jsonb_build_object('migration','0009') from representations;

create trigger trg_representation_state_history
after insert or update of status on representations
for each row execute function public.capture_representation_state_history();

create table verification_assessments (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('partner','representation','property','development')),
  partner_id uuid references partners(id),
  representation_id uuid references representations(id),
  property_id uuid references properties(id),
  development_id uuid references developments(id),
  verification_kind text not null,
  outcome text not null check (outcome in ('pending','verified','partially_verified','failed','expired')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source_reference text,
  evidence jsonb not null default '{}'::jsonb,
  assessor_profile_id uuid references profiles(id),
  assessed_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint verification_assessments_subject_shape check (
    (subject_type = 'partner' and partner_id is not null and representation_id is null and property_id is null and development_id is null)
    or (subject_type = 'representation' and representation_id is not null and partner_id is null and property_id is null and development_id is null)
    or (subject_type = 'property' and property_id is not null and partner_id is null and representation_id is null and development_id is null)
    or (subject_type = 'development' and development_id is not null and partner_id is null and representation_id is null and property_id is null)
  )
);
alter table verification_assessments enable row level security;

create policy "admin: full access to listing_state_history" on listing_state_history
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin: full access to representation_state_history" on representation_state_history
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin: full access to verification_assessments" on verification_assessments
  for all to authenticated using (is_admin()) with check (is_admin());

grant select, insert, update, delete on listing_state_history, representation_state_history, verification_assessments to authenticated;

comment on column partners.trust_level is 'Legacy marketplace projection. Trust truth belongs in verification_assessments; keep this field for compatibility until consumers migrate.';
