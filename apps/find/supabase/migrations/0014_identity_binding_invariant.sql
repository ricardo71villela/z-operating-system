-- ============================================================
-- Z FIND — MIGRATION 0014 — Identity Binding Invariant
-- ============================================================
-- Every local application profile must have exactly one Identity Bridge row.
--
-- profiles.id remains the Supabase Auth/application identity.
-- identity_bindings does NOT replace that UUID and does NOT create a second
-- canonical Person record. It only provides the optional binding point to a
-- shared ZOS Person identity.
--
-- Migration 0013 backfilled the profiles that existed at that moment.
-- This migration makes that relationship durable for every future profile.
-- ============================================================


create function public.zfind_create_identity_binding_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into identity_bindings(profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;


create trigger profiles_create_identity_binding
after insert on profiles
for each row
execute function public.zfind_create_identity_binding_for_profile();


-- Defensive reconciliation in case profiles were created after migration 0013
-- but before this invariant was installed.
insert into identity_bindings(profile_id)
select id
from profiles
on conflict (profile_id) do nothing;


-- The function exists solely for trigger execution. It is not an application
-- RPC and should not be callable directly by API roles.
revoke all on function public.zfind_create_identity_binding_for_profile() from public;


comment on function public.zfind_create_identity_binding_for_profile()
is 'Maintains the Z Find profile -> ZOS Person identity binding bridge without replacing Supabase Auth/profile identity.';
