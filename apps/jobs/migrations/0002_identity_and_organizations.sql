-- 0002_identity_and_organizations.sql
-- Z Jobs — utilizadores, organizações, memberships, papéis.
-- Assume auth.users do Supabase como fonte de identidade central.
-- Se o ZOS já tiver um esquema `identity`, este bloco deve ser substituído
-- por foreign keys para esse esquema em vez de duplicar `auth.users`.

begin;

do $$ begin
  create type organization_type as enum (
    'employer',
    'employer_group',
    'recruitment_agency',
    'temp_work_agency',
    'university',
    'polytechnic',
    'vocational_school',
    'training_center',
    'public_entity',
    'platform_admin'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type org_role as enum (
    'owner',
    'admin',
    'recruiter',
    'hiring_manager',
    'viewer',
    'career_center_staff',
    'platform_moderator',
    'platform_auditor',
    'platform_superadmin'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
exception when duplicate_object then null; end $$;

-- ---------- Person profile (1:1 com auth.users) ----------
create table if not exists persons (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  full_name       text not null,
  headline        text,                     -- título profissional
  avatar_url      text,
  locale          text references locales(code),
  country_code    char(2) references countries(code),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table persons is
  'Identidade pessoal única. Dados sensíveis (telefone, morada, nascimento)
   NÃO vivem aqui — ver candidate_private_data (0004).';

-- ---------- Organizations ----------
create table if not exists organizations (
  id                uuid primary key default gen_random_uuid(),
  type              organization_type not null,
  legal_name        text not null,
  display_name      text not null,
  tax_id            text,
  country_code      char(2) references countries(code),
  website           text,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_organizations_type on organizations(type);

-- ---------- Memberships (papel de um user numa organização) ----------
create table if not exists organization_memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            org_role not null,
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id, role)
);

create index if not exists idx_memberships_org on organization_memberships(organization_id);
create index if not exists idx_memberships_user on organization_memberships(user_id);

comment on table organization_memberships is
  'Um utilizador pode pertencer a várias organizações com papéis diferentes.
   Nunca colocar permissões empresariais no perfil pessoal (secção 5).';

-- ---------- Invitations ----------
create table if not exists organization_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email           text not null,
  role            org_role not null,
  status          invitation_status not null default 'pending',
  invited_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '14 days')
);

create index if not exists idx_invitations_org on organization_invitations(organization_id);
create index if not exists idx_invitations_email on organization_invitations(email);

-- ---------- Audit log genérico ----------
create table if not exists audit_logs (
  id              uuid primary key default gen_random_uuid(),
  actor_user_id   uuid references auth.users(id),
  organization_id uuid references organizations(id),
  entity_type     text not null,
  entity_id       uuid not null,
  action          text not null,          -- 'create' | 'update' | 'approve' | 'reject' | ...
  before_state    jsonb,
  after_state     jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_audit_entity on audit_logs(entity_type, entity_id);
create index if not exists idx_audit_org on audit_logs(organization_id);

commit;
