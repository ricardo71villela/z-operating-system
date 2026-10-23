-- Z Fashion — dedicated database login for the API, v1
--
-- The Z Fashion API connected as `postgres`, the owner of every schema of
-- the shared ZOS database. This adds `zfashion_app`, a login limited to
-- what Z Fashion uses:
--   * the fashion schema (tables, sequences, functions);
--   * the four platform_internal fashion functions (partner identity,
--     onboarding);
--   * the e-mail column of auth.users (read only, for partner e-mails).
-- Nothing in the jobs, find, desk, studio, zos or public schemas.
--
-- The role keeps BYPASSRLS on purpose: the API authorises every partner
-- request itself (fashion_partner_ids_for_auth_user, see
-- apps/fashion/apps/fashion-partner/src/db.js) and was written against a
-- privileged connection; row-level security is not its access model.
--
-- The password is NOT in this file. The owner sets it once in the SQL
-- editor (alter role zfashion_app password '…') and uses it in
-- DATABASE_URL on Vercel (user zfashion_app.<project-ref> on the pooler).
--
-- Idempotent: safe to run again.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'zfashion_app') then
    create role zfashion_app login bypassrls nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end $$;

alter role zfashion_app set search_path = fashion;

grant usage on schema fashion to zfashion_app;
grant select, insert, update, delete on all tables in schema fashion to zfashion_app;
grant usage, select, update on all sequences in schema fashion to zfashion_app;
grant execute on all functions in schema fashion to zfashion_app;

-- Objects created later in fashion by postgres (future migrations).
alter default privileges for role postgres in schema fashion
  grant select, insert, update, delete on tables to zfashion_app;
alter default privileges for role postgres in schema fashion
  grant usage, select, update on sequences to zfashion_app;
alter default privileges for role postgres in schema fashion
  grant execute on functions to zfashion_app;

grant usage on schema platform_internal to zfashion_app;
-- Only the fashion functions that exist (one of them was created outside
-- the migrations on some databases).
do $$
declare
  f text;
begin
  foreach f in array array[
    'platform_internal.fashion_partner_ids_for_auth_user(uuid)',
    'platform_internal.link_fashion_partner_organisation(uuid, uuid)',
    'platform_internal.apply_fashion_partner_owner(uuid, uuid, text)',
    'platform_internal.fashion_submit_partner_application(uuid, jsonb, jsonb)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('grant execute on function %s to zfashion_app', f);
    end if;
  end loop;
end $$;

grant usage on schema auth to zfashion_app;
grant select (id, email) on auth.users to zfashion_app;

commit;

-- Check (expected: true, true, false):
-- select has_table_privilege('zfashion_app', 'fashion.partners', 'select'),
--        has_column_privilege('zfashion_app', 'auth.users', 'email', 'select'),
--        has_table_privilege('zfashion_app', 'jobs.applications', 'select');
