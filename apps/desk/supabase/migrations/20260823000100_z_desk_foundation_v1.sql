-- Z Desk — foundation schema (v1)
-- Multi-tenant unified inbox (email + WhatsApp) + calendar engine, human-in-loop AI suggestions.
-- See apps/desk/docs/architecture/ADR-0001-mvp-human-in-loop.md for the confidence_score decision.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────
-- Tenants & membership
-- ─────────────────────────────────────────────────────────────────

create table if not exists desk_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists desk_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references desk_tenants(id) on delete cascade,
  auth_user_id uuid not null, -- references Supabase auth.users
  email text not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (tenant_id, auth_user_id)
);

create index if not exists idx_desk_users_tenant on desk_users(tenant_id);

-- ─────────────────────────────────────────────────────────────────
-- Channel integrations (Gmail / Microsoft Graph / WhatsApp Cloud API)
-- ─────────────────────────────────────────────────────────────────

create table if not exists desk_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references desk_tenants(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'microsoft', 'whatsapp', 'google_calendar', 'microsoft_calendar')),
  external_account_id text not null,
  oauth_tokens jsonb, -- encrypted at rest; never exposed to the browser
  sync_state jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'error', 'disconnected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, external_account_id)
);

create index if not exists idx_desk_integrations_tenant on desk_integrations(tenant_id);

-- ─────────────────────────────────────────────────────────────────
-- Contacts (people the tenant communicates with, across channels)
-- ─────────────────────────────────────────────────────────────────

create table if not exists desk_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references desk_tenants(id) on delete cascade,
  display_name text,
  email text,
  whatsapp_number text,
  created_at timestamptz not null default now()
);

create index if not exists idx_desk_contacts_tenant on desk_contacts(tenant_id);

-- ─────────────────────────────────────────────────────────────────
-- Threads (unifies an email thread and/or a WhatsApp chat into one conversation)
-- ─────────────────────────────────────────────────────────────────

create table if not exists desk_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references desk_tenants(id) on delete cascade,
  contact_id uuid references desk_contacts(id) on delete set null,
  email_thread_id text,
  whatsapp_chat_id text,
  subject text,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_desk_threads_tenant on desk_threads(tenant_id);
create index if not exists idx_desk_threads_contact on desk_threads(contact_id);

-- ─────────────────────────────────────────────────────────────────
-- Messages (individual email or WhatsApp messages within a thread)
-- ─────────────────────────────────────────────────────────────────

create table if not exists desk_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references desk_tenants(id) on delete cascade,
  thread_id uuid not null references desk_threads(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  direction text not null check (direction in ('inbound', 'outbound')),
  body text,
  ai_summary text,
  ai_priority text check (ai_priority in ('low', 'normal', 'high')),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_desk_messages_tenant on desk_messages(tenant_id);
create index if not exists idx_desk_messages_thread on desk_messages(thread_id);

-- ─────────────────────────────────────────────────────────────────
-- Events (calendar engine — source of truth, synced with Google/Outlook)
-- ─────────────────────────────────────────────────────────────────

create table if not exists desk_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references desk_tenants(id) on delete cascade,
  thread_id uuid references desk_threads(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null default 'manual' check (source in ('manual', 'ai_suggested')),
  status text not null default 'confirmed' check (status in ('draft', 'confirmed', 'cancelled')),
  -- Confidence score persisted from AI suggestion onward, per ADR-0001 —
  -- not used for autonomous decisions in v1, but avoids a future schema migration.
  confidence_score numeric(4,3) check (confidence_score >= 0 and confidence_score <= 1),
  external_calendar_provider text check (external_calendar_provider in ('google_calendar', 'microsoft_calendar')),
  external_calendar_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_desk_events_tenant on desk_events(tenant_id);
create index if not exists idx_desk_events_thread on desk_events(thread_id);
create index if not exists idx_desk_events_starts_at on desk_events(starts_at);

-- ─────────────────────────────────────────────────────────────────
-- Row Level Security — tenant isolation
-- ─────────────────────────────────────────────────────────────────

alter table desk_tenants enable row level security;
alter table desk_users enable row level security;
alter table desk_integrations enable row level security;
alter table desk_contacts enable row level security;
alter table desk_threads enable row level security;
alter table desk_messages enable row level security;
alter table desk_events enable row level security;

-- Policies are intentionally deferred to a follow-up migration once the
-- auth/session model (Supabase auth ↔ desk_users) is finalized. RLS is
-- enabled now so no table is ever accidentally left open.
