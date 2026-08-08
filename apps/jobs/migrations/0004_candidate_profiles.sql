-- 0004_candidate_profiles.sql
-- Z Jobs — identidade profissional do candidato (secção 6).

begin;

do $$ begin
  create type profile_visibility as enum (
    'private',
    'applications_only',
    'visible_to_verified_employers',
    'public'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type contract_type as enum (
    'permanent',
    'fixed_term',
    'temporary_agency',
    'interim',
    'project_based',
    'seasonal',
    'paid_internship',
    'trainee_program',
    'replacement_contract',
    'other'
  );
exception when duplicate_object then null; end $$;

-- Dados públicos/semi-públicos do perfil profissional.
create table if not exists candidate_profiles (
  user_id                   uuid primary key references auth.users(id) on delete cascade,
  professional_title        text,
  summary                   text,
  intro_video_url           text,
  location_id               uuid references locations(id),
  work_authorization_notes  text,
  is_internationally_mobile boolean not null default false,
  availability              text,               -- 'immediate' | 'in_30_days' | 'in_90_days' | 'not_looking'
  desired_salary_min        numeric(12,2),
  desired_salary_max        numeric(12,2),
  desired_salary_currency   char(3) references currencies(code),
  desired_work_regime       work_regime,
  desired_contract_types    contract_type[] not null default '{}',
  interested_in_first_job   boolean not null default false,
  interested_in_senior_roles boolean not null default false,
  interested_in_interim     boolean not null default false,
  visibility                profile_visibility not null default 'private',
  is_open_to_offers         boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Dados privados/sensíveis — nunca expostos por RLS a outra organização
-- sem consentimento explícito (secção 6 e 15).
create table if not exists candidate_private_data (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  phone           text,
  full_address    text,
  date_of_birth   date,
  national_id_ref text,     -- referência opaca, nunca o documento em si
  accessibility_notes text,  -- opcional, protegido, só para adaptação
  updated_at      timestamptz not null default now()
);

comment on table candidate_private_data is
  'Nunca legível diretamente por organizações. Partilha só via
   candidate_data_consents (abaixo).';

create table if not exists candidate_data_consents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  fields          text[] not null,     -- ex: '{phone,full_address}'
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz
);

create index if not exists idx_consents_user on candidate_data_consents(user_id);
create index if not exists idx_consents_org on candidate_data_consents(organization_id);

create table if not exists candidate_experiences (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  company_name    text not null,
  title           text not null,
  start_date      date not null,
  end_date        date,
  is_current      boolean not null default false,
  description     text,
  location_id     uuid references locations(id),
  created_at      timestamptz not null default now()
);

create index if not exists idx_experiences_user on candidate_experiences(user_id);

create table if not exists candidate_education (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  institution_name  text not null,
  institution_org_id uuid references organizations(id),  -- link opcional a instituição verificada
  degree            text,
  field_of_study    text,
  start_date        date,
  end_date          date,
  created_at        timestamptz not null default now()
);

create index if not exists idx_education_user on candidate_education(user_id);

create table if not exists skills (
  id      uuid primary key default gen_random_uuid(),
  name    text not null unique,
  category text
);

create table if not exists candidate_skills (
  user_id     uuid not null references auth.users(id) on delete cascade,
  skill_id    uuid not null references skills(id),
  proficiency text,    -- 'basic' | 'intermediate' | 'advanced' | 'expert'
  primary key (user_id, skill_id)
);

create table if not exists candidate_languages (
  user_id     uuid not null references auth.users(id) on delete cascade,
  locale_code text not null references locales(code),
  proficiency text not null,  -- CEFR: A1..C2 or 'native'
  primary key (user_id, locale_code)
);

create table if not exists candidate_documents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  doc_type        text not null,     -- 'cv' | 'certificate' | 'portfolio' | 'cover_letter'
  storage_path    text not null,     -- caminho no bucket privado, acedido via signed URL
  created_at      timestamptz not null default now()
);

create index if not exists idx_documents_user on candidate_documents(user_id);

commit;
