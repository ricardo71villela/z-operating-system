-- 0008_institutions.sql
-- Z Jobs — instituições de ensino/formação (secção 9).
-- Deliberadamente enxuto: só os modelos fundamentais, não uma solução
-- universitária completa (secção 9: "não desenvolvas já... se isso
-- comprometer o MVP"). organization_type já cobre university, polytechnic,
-- vocational_school, training_center — esta migration estende essas
-- organizações com os campos institucionais específicos.

begin;

create table if not exists institution_profiles (
  organization_id   uuid primary key references organizations(id) on delete cascade,
  description       text,
  career_center_url text,
  has_career_center boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table institution_profiles is
  'Extensão de organizations para type IN (university, polytechnic,
   vocational_school, training_center). Só instituições verificadas podem
   ter ofertas reservadas nos seus alunos (ver offer_reservations).';

create table if not exists institution_courses (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  name              text not null,
  field_of_study    text,
  degree_level      text,     -- 'licenciatura' | 'mestrado' | 'doutoramento' | 'curso_tecnico' | 'bootcamp'
  created_at        timestamptz not null default now()
);

create index if not exists idx_courses_org on institution_courses(organization_id);

-- Ligação entre um candidato e uma instituição (aluno ou alumni), sempre
-- com consentimento explícito do candidato — nunca importada em massa
-- sem opt-in (secção 15: privacy by design).
create table if not exists institution_affiliations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  affiliation_type  text not null,  -- 'student' | 'alumni'
  course_id         uuid references institution_courses(id),
  consented_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_affiliations_org on institution_affiliations(organization_id);
create index if not exists idx_affiliations_user on institution_affiliations(user_id);

-- Ofertas reservadas a alunos/alumni de uma instituição específica
-- (secção 9: "empresas parceiras; ofertas reservadas").
create table if not exists offer_institution_reservations (
  id                uuid primary key default gen_random_uuid(),
  job_offer_id      uuid not null references job_offers(id) on delete cascade,
  institution_org_id uuid not null references organizations(id),
  created_at        timestamptz not null default now(),
  unique (job_offer_id, institution_org_id)
);

create index if not exists idx_reservations_offer on offer_institution_reservations(job_offer_id);
create index if not exists idx_reservations_institution on offer_institution_reservations(institution_org_id);

commit;
