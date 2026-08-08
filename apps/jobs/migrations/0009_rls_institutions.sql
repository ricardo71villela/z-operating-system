-- 0009_rls_institutions.sql

begin;

alter table institution_profiles enable row level security;
create policy institution_profiles_select_public on institution_profiles for select using (true);
create policy institution_profiles_manage_org_admins on institution_profiles
  for all using (is_org_member(organization_id, array['owner','admin']::org_role[]) or is_platform_staff());

alter table institution_courses enable row level security;
create policy courses_select_public on institution_courses for select using (true);
create policy courses_manage_org_admins on institution_courses
  for all using (is_org_member(organization_id, array['owner','admin','career_center_staff']::org_role[]));

alter table institution_affiliations enable row level security;
create policy affiliations_owner_manage on institution_affiliations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy affiliations_institution_read on institution_affiliations
  for select using (is_org_member(organization_id, array['owner','admin','career_center_staff']::org_role[]));

alter table offer_institution_reservations enable row level security;
create policy reservations_select_public on offer_institution_reservations for select using (true);
create policy reservations_manage_offer_owner on offer_institution_reservations
  for all using (
    exists (
      select 1 from job_offers jo
      where jo.id = offer_institution_reservations.job_offer_id
        and is_org_member(jo.organization_id, array['owner','admin','recruiter','hiring_manager']::org_role[])
    )
  );

commit;
