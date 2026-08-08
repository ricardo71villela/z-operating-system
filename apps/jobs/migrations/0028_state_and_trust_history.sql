-- 0028_state_and_trust_history.sql
-- ZOS v1.1: keep domain-owned state machines, standardise history.
-- Also separates organization verification history from the organization row.

begin;

create table if not exists job_offer_status_history (
  id              uuid primary key default gen_random_uuid(),
  job_offer_id    uuid not null references job_offers(id) on delete cascade,
  from_status     job_offer_status,
  to_status       job_offer_status not null,
  changed_by      uuid references auth.users(id),
  reason          text,
  correlation_id  text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_job_offer_status_history_offer
  on job_offer_status_history(job_offer_id, created_at);

create or replace function capture_job_offer_status_history()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    insert into job_offer_status_history(job_offer_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif old.status is distinct from new.status then
    insert into job_offer_status_history(job_offer_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_job_offer_status_history on job_offers;
create trigger trg_job_offer_status_history
after insert or update of status on job_offers
for each row execute function capture_job_offer_status_history();

create table if not exists organization_verification_assessments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  verification_type text not null default 'employer_identity',
  outcome            verification_status not null,
  assessed_by        uuid references auth.users(id),
  evidence           jsonb not null default '[]'::jsonb,
  notes              text,
  expires_at         timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists idx_org_verification_assessments_org
  on organization_verification_assessments(organization_id, created_at desc);

create or replace function capture_org_verification_assessment()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' or old.verification_status is distinct from new.verification_status then
    insert into organization_verification_assessments(
      organization_id, outcome, assessed_by, notes
    ) values (
      new.organization_id,
      new.verification_status,
      case when new.verification_status in ('verified','enhanced_verified','restricted','suspended','rejected') then auth.uid() else null end,
      case when new.verification_status = 'rejected' then new.rejection_reason else null end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_org_verification_assessment on company_profiles;
create trigger trg_org_verification_assessment
after insert or update of verification_status on company_profiles
for each row execute function capture_org_verification_assessment();

alter table job_offer_status_history enable row level security;
alter table organization_verification_assessments enable row level security;

create policy job_offer_status_history_read on job_offer_status_history
  for select using (
    is_platform_staff() or exists (
      select 1 from job_offers jo
      where jo.id = job_offer_status_history.job_offer_id
        and is_org_member(jo.organization_id)
    )
  );

create policy organization_verification_assessments_read on organization_verification_assessments
  for select using (is_platform_staff() or is_org_member(organization_id));

commit;
