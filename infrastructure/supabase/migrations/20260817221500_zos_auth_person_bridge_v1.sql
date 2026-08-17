-- ZOS — Supabase Auth -> canonical ZOS person bridge v1
--
-- Authentication remains owned by Supabase Auth. This bridge only guarantees
-- that every authenticated identity has exactly one canonical zos.persons row.
-- It does not create vertical profiles, organisations, memberships, Studio
-- subscriptions, or entitlements.

create function zos.sync_auth_user_to_person()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into zos.persons (auth_user_id)
  values (new.id)
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

comment on function zos.sync_auth_user_to_person() is
'Idempotently materializes a new Supabase Auth identity as a canonical ZOS person. It never creates vertical or commercial records.';

-- This function is trigger-only. No browser or API role needs to call it.
revoke all on function zos.sync_auth_user_to_person()
from public, anon, authenticated, service_role;

create trigger zos_auth_user_person_bridge
  after insert on auth.users
  for each row
  execute function zos.sync_auth_user_to_person();

-- Forward-only backfill for Auth identities that pre-date this bridge.
-- zos.persons.auth_user_id is UNIQUE, so existing canonical bindings are kept.
insert into zos.persons (auth_user_id)
select u.id
from auth.users u
where u.id is not null
on conflict (auth_user_id) do nothing;
