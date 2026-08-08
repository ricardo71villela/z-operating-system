-- 0007_rls_policies.sql
-- Z Jobs — Row Level Security (secção 15 e 23).
-- Princípio: negar por defeito; conceder o mínimo necessário.

begin;

-- ---------- Helper: papel do utilizador numa organização ----------
create or replace function is_org_member(p_org_id uuid, p_roles org_role[] default null)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from organization_memberships m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and (p_roles is null or m.role = any(p_roles))
  );
$$;

create or replace function is_platform_staff()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from organization_memberships m
    where m.user_id = auth.uid()
      and m.role in ('platform_moderator', 'platform_auditor', 'platform_superadmin')
  );
$$;

create or replace function is_verified_employer(p_org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from company_profiles c
    where c.organization_id = p_org_id
      and c.verification_status in ('verified', 'enhanced_verified')
  );
$$;

-- ================= persons =================
alter table persons enable row level security;

create policy persons_select_own on persons
  for select using (user_id = auth.uid());

create policy persons_select_public_minimum on persons
  for select using (true);  -- headline/avatar considerados não sensíveis; UI decide o que expõe

create policy persons_update_own on persons
  for update using (user_id = auth.uid());

create policy persons_insert_own on persons
  for insert with check (user_id = auth.uid());

-- ================= organizations =================
alter table organizations enable row level security;

create policy organizations_select_public on organizations
  for select using (true);  -- nome/tipo de organização não são sensíveis

create policy organizations_insert_authenticated on organizations
  for insert with check (auth.uid() is not null and created_by = auth.uid());

create policy organizations_update_members on organizations
  for update using (is_org_member(id, array['owner','admin']::org_role[]) or is_platform_staff());

-- ================= organization_memberships =================
alter table organization_memberships enable row level security;

create policy memberships_select_own_org on organization_memberships
  for select using (is_org_member(organization_id) or user_id = auth.uid() or is_platform_staff());

create policy memberships_manage_admins on organization_memberships
  for all using (is_org_member(organization_id, array['owner','admin']::org_role[]) or is_platform_staff());

-- ================= candidate_profiles =================
alter table candidate_profiles enable row level security;

create policy candidate_profiles_select_own on candidate_profiles
  for select using (user_id = auth.uid());

create policy candidate_profiles_select_public on candidate_profiles
  for select using (visibility = 'public');

create policy candidate_profiles_select_verified_employers on candidate_profiles
  for select using (
    visibility = 'visible_to_verified_employers'
    and exists (
      select 1 from organization_memberships m
      where m.user_id = auth.uid()
        and is_verified_employer(m.organization_id)
    )
  );

create policy candidate_profiles_upsert_own on candidate_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ================= candidate_private_data (NUNCA visível diretamente) =================
alter table candidate_private_data enable row level security;

create policy candidate_private_data_owner_only on candidate_private_data
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Acesso de organizações a dados privados passa exclusivamente por
-- candidate_data_consents + uma view/RPC dedicada (ver domain layer),
-- nunca por SELECT direto na tabela.

-- ================= candidate_data_consents =================
alter table candidate_data_consents enable row level security;

create policy consents_owner_manage on candidate_data_consents
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy consents_org_read_own_grants on candidate_data_consents
  for select using (is_org_member(organization_id));

-- ================= candidate_experiences / education / skills / languages / documents =================
alter table candidate_experiences enable row level security;
create policy experiences_owner on candidate_experiences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy experiences_visible_with_profile on candidate_experiences for select using (
  exists (select 1 from candidate_profiles p where p.user_id = candidate_experiences.user_id and p.visibility in ('public'))
);

alter table candidate_education enable row level security;
create policy education_owner on candidate_education for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table candidate_skills enable row level security;
create policy candidate_skills_owner on candidate_skills for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table candidate_languages enable row level security;
create policy candidate_languages_owner on candidate_languages for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table candidate_documents enable row level security;
create policy documents_owner_only on candidate_documents for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Acesso de recrutadores a documentos (ex. CV) é feito via signed URL emitido
-- por RPC que verifica consentimento — nunca via SELECT direto desta tabela.

-- ================= company_profiles =================
alter table company_profiles enable row level security;

create policy company_profiles_select_public on company_profiles
  for select using (verification_status in ('verified', 'enhanced_verified'));

create policy company_profiles_select_own_org on company_profiles
  for select using (is_org_member(organization_id) or is_platform_staff());

create policy company_profiles_update_org_admins on company_profiles
  for update using (is_org_member(organization_id, array['owner','admin']::org_role[]));

create policy company_profiles_insert_org_admins on company_profiles
  for insert with check (is_org_member(organization_id, array['owner','admin']::org_role[]));

create policy company_profiles_moderate_staff on company_profiles
  for update using (is_platform_staff());

-- ================= job_offers =================
alter table job_offers enable row level security;

create policy job_offers_select_published on job_offers
  for select using (status = 'published');

create policy job_offers_select_own_org on job_offers
  for select using (is_org_member(organization_id) or is_platform_staff());

create policy job_offers_insert_verified_employers on job_offers
  for insert with check (
    is_org_member(organization_id, array['owner','admin','recruiter','hiring_manager']::org_role[])
    and is_verified_employer(organization_id)
  );

create policy job_offers_update_own_org on job_offers
  for update using (
    is_org_member(organization_id, array['owner','admin','recruiter','hiring_manager']::org_role[])
    or is_platform_staff()
  );

comment on policy job_offers_insert_verified_employers on job_offers is
  'Reforça em RLS a regra de negócio: só empregadores verificados publicam
   (secção 7). A validação de salário fixo é feita no domain layer, não RLS,
   porque exige lógica mais rica do que uma policy permite exprimir bem.';

-- ================= applications =================
alter table applications enable row level security;

create policy applications_candidate_own on applications
  for all using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());

create policy applications_org_view_own_offers on applications
  for select using (
    exists (
      select 1 from job_offers jo
      where jo.id = applications.job_offer_id
        and is_org_member(jo.organization_id)
    )
  );

create policy applications_org_update_own_offers on applications
  for update using (
    exists (
      select 1 from job_offers jo
      where jo.id = applications.job_offer_id
        and is_org_member(jo.organization_id, array['owner','admin','recruiter','hiring_manager']::org_role[])
    )
  );

-- ================= saved_job_offers / job_alerts =================
alter table saved_job_offers enable row level security;
create policy saved_offers_owner on saved_job_offers for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table job_alerts enable row level security;
create policy job_alerts_owner on job_alerts for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ================= audit_logs =================
alter table audit_logs enable row level security;
create policy audit_logs_staff_and_org_admins on audit_logs
  for select using (is_platform_staff() or is_org_member(organization_id, array['owner','admin']::org_role[]));
-- Inserts de audit_logs feitos apenas via funções security definer / triggers,
-- nunca diretamente pelo cliente.

commit;
