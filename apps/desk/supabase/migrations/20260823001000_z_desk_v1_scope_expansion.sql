-- Z Desk — v1 scope expansion (ADR-0002)
-- Adds: message state (conversation lifecycle), linked notes, contact
-- relationship signals, and follow-up event blocks. The human-in-loop
-- discipline from ADR-0001 is unchanged — this only widens what the AI
-- may organize and suggest.

-- ─────────────────────────────────────────────────────────────────
-- Message state (replaces ai_priority as the primary triage signal;
-- ai_priority is kept for now as a secondary sort hint)
-- ─────────────────────────────────────────────────────────────────

alter table desk_messages
  add column if not exists state text not null default 'pending_decision'
    check (state in ('pending_decision', 'awaiting_reply', 'action_pending', 'resolved'));

create index if not exists idx_desk_messages_state on desk_messages(tenant_id, state);

-- ─────────────────────────────────────────────────────────────────
-- Contact relationship signals (feed AI priority weighting)
-- ─────────────────────────────────────────────────────────────────

alter table desk_contacts
  add column if not exists thread_count integer not null default 0,
  add column if not exists last_interaction_at timestamptz,
  add column if not exists relationship_tier text not null default 'new'
    check (relationship_tier in ('new', 'recurring', 'priority'));

-- ─────────────────────────────────────────────────────────────────
-- Notes — always linked to at least one origin (thread, event, or contact).
-- Enforced at the application layer (not a DB constraint, since "at least
-- one of three nullable FKs is non-null" is awkward in SQL check
-- constraints across NULLs) — see backend note-creation service.
-- ─────────────────────────────────────────────────────────────────

create table if not exists desk_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references desk_tenants(id) on delete cascade,
  thread_id uuid references desk_threads(id) on delete set null,
  event_id uuid references desk_events(id) on delete set null,
  contact_id uuid references desk_contacts(id) on delete set null,
  body text not null,
  source text not null default 'manual' check (source in ('manual', 'voice_transcription', 'ai_summary')),
  created_by uuid references desk_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_desk_notes_tenant on desk_notes(tenant_id);
create index if not exists idx_desk_notes_thread on desk_notes(thread_id);
create index if not exists idx_desk_notes_event on desk_notes(event_id);
create index if not exists idx_desk_notes_contact on desk_notes(contact_id);

alter table desk_notes enable row level security;

-- ─────────────────────────────────────────────────────────────────
-- Event type — distinguishes meetings from suggested follow-up blocks.
-- Both remain source='ai_suggested', status='draft' until confirmed,
-- per ADR-0001.
-- ─────────────────────────────────────────────────────────────────

alter table desk_events
  add column if not exists event_type text not null default 'meeting'
    check (event_type in ('meeting', 'follow_up_block'));
