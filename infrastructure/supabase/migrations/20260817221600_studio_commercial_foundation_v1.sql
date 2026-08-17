-- ============================================================
-- Z Studio — commercial authority foundation v1
-- ============================================================
--
-- ZOS owns canonical human identity. Z Studio owns only its local account,
-- subscription, entitlement and AI-usage state. Store/web payment adapters and
-- concrete price/quota configuration are deliberately out of scope here.
-- ============================================================

create schema studio;

comment on schema studio is
'Z Studio product domain. Canonical human identity remains in zos.persons; Studio-local account, commercial and usage state stay here.';

revoke all on schema studio from public, anon, authenticated;
grant usage on schema studio to service_role;


-- ------------------------------------------------------------
-- 1. Local Studio identity
-- ------------------------------------------------------------
--
-- The account id deliberately equals auth.users.id. This mirrors the existing
-- ZOS identity contract where local human identifiers are Auth UUIDs, while the
-- canonical cross-product person remains zos.persons.id.
-- ------------------------------------------------------------

create table studio.accounts (
  id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table studio.accounts is
'Local Z Studio account identity. id equals the Supabase Auth user id; cross-product canonical identity remains zos.persons.';

alter table studio.accounts enable row level security;

revoke all on studio.accounts from public, anon, authenticated;
grant select on studio.accounts to service_role;


-- DB-owned trigger: creation of a real Studio account pre-registers the local
-- Studio identity in the existing ZOS Identity Bridge. It does not itself create
-- a canonical zos.persons row.
create function studio.register_account_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform platform_internal.register_local_person_identity('studio', new.id);
  return new;
end;
$$;

comment on function studio.register_account_identity() is
'Privately registers a new studio.accounts identity with the central ZOS registry as local_only.';

revoke all on function studio.register_account_identity()
from public, anon, authenticated, service_role;

create trigger studio_account_identity_registration
  after insert on studio.accounts
  for each row
  execute function studio.register_account_identity();


-- Narrow account bootstrap RPC. The caller cannot choose an account/person id:
-- both local identity and canonical identity are derived only from auth.uid().
create function public.zstudio_ensure_account()
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_person_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'authentication required'
      using errcode = '28000';
  end if;

  insert into studio.accounts (id)
  values (v_auth_user_id)
  on conflict (id) do nothing;

  select b.canonical_person_id
    into v_person_id
  from zos_api.ensure_current_identity_binding('studio') b;

  if v_person_id is null then
    raise exception 'canonical ZOS person could not be resolved for Studio account'
      using errcode = '23514';
  end if;

  return v_person_id;
end;
$$;

comment on function public.zstudio_ensure_account() is
'Idempotently creates/resolves the authenticated caller local Z Studio account and links it through the existing ZOS Identity Bridge.';

revoke all on function public.zstudio_ensure_account()
from public, anon, authenticated, service_role;

grant execute on function public.zstudio_ensure_account()
to authenticated;


-- ------------------------------------------------------------
-- 2. Paid subscription authority
-- ------------------------------------------------------------

create table studio.subscriptions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references zos.persons(id) on delete restrict,
  plan_code text not null check (plan_code in ('weekly', 'monthly', 'annual')),
  status text not null check (status in ('trialing', 'active', 'grace', 'past_due', 'cancelled', 'expired', 'revoked')),
  billing_source text not null check (billing_source in ('manual', 'web', 'apple_app_store', 'google_play')),
  source_customer_ref text,
  source_subscription_ref text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trial_ends_at is null or trial_started_at is null or trial_ends_at > trial_started_at),
  check (current_period_end is null or current_period_start is null or current_period_end > current_period_start),
  check (status <> 'trialing' or (trial_started_at is not null and trial_ends_at is not null))
);

comment on table studio.subscriptions is
'Z Studio paid-plan subscription authority. Trialing is an introductory state of a weekly/monthly/annual plan; there is no permanent free plan.';

create index idx_studio_subscriptions_person_status
  on studio.subscriptions(person_id, status);

create unique index uq_studio_subscriptions_source_ref
  on studio.subscriptions(billing_source, source_subscription_ref)
  where source_subscription_ref is not null;

alter table studio.subscriptions enable row level security;


-- ------------------------------------------------------------
-- 3. Product/feature entitlement authority
-- ------------------------------------------------------------

create table studio.entitlements (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references zos.persons(id) on delete restrict,
  subscription_id uuid references studio.subscriptions(id) on delete restrict,
  entitlement_code text not null check (entitlement_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  status text not null default 'active' check (status in ('active', 'grace', 'revoked', 'expired')),
  source text not null default 'subscription' check (source in ('subscription', 'manual', 'promotion')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at),
  check (source <> 'subscription' or subscription_id is not null)
);

comment on table studio.entitlements is
'Authoritative Z Studio product/feature access grants. Entitlements belong to a canonical ZOS person but remain Studio-domain data.';

create index idx_studio_entitlements_lookup
  on studio.entitlements(person_id, entitlement_code, status, starts_at, expires_at);

alter table studio.entitlements enable row level security;


-- ------------------------------------------------------------
-- 4. Append-only AI metering
-- ------------------------------------------------------------

create table studio.ai_usage (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references zos.persons(id) on delete restrict,
  subscription_id uuid references studio.subscriptions(id) on delete restrict,
  entitlement_id uuid references studio.entitlements(id) on delete restrict,
  request_id uuid not null unique,
  usage_units integer not null default 1 check (usage_units > 0),
  model text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  created_at timestamptz not null default now()
);

comment on table studio.ai_usage is
'Append-only Z Studio AI metering. Prompt/content text must never be stored here.';

create index idx_studio_ai_usage_person_created
  on studio.ai_usage(person_id, created_at desc);

alter table studio.ai_usage enable row level security;


-- ------------------------------------------------------------
-- 5. Server-only commercial tables
-- ------------------------------------------------------------
-- Browser roles receive no direct Studio table access. Future store/web
-- adapters operate server-side. AI usage stays append-only for service_role.

revoke all on studio.subscriptions, studio.entitlements, studio.ai_usage
from public, anon, authenticated;

grant select, insert, update, delete
on studio.subscriptions, studio.entitlements
to service_role;

grant select, insert
on studio.ai_usage
to service_role;


-- ------------------------------------------------------------
-- 6. Narrow self-scoped entitlement read boundary
-- ------------------------------------------------------------

create function public.zstudio_has_entitlement(p_entitlement_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case
    when auth.uid() is null then false
    else exists (
      select 1
      from zos.persons p
      join studio.entitlements e
        on e.person_id = p.id
      where p.auth_user_id = auth.uid()
        and e.entitlement_code = p_entitlement_code
        and e.status in ('active', 'grace')
        and e.starts_at <= now()
        and (e.expires_at is null or e.expires_at > now())
        and (
          e.subscription_id is null
          or exists (
            select 1
            from studio.subscriptions s
            where s.id = e.subscription_id
              and s.person_id = p.id
              and s.status in ('trialing', 'active', 'grace')
              and (
                (
                  s.status = 'trialing'
                  and s.trial_ends_at is not null
                  and s.trial_ends_at > now()
                )
                or
                (
                  s.status in ('active', 'grace')
                  and (s.current_period_end is null or s.current_period_end > now())
                )
              )
          )
        )
    )
  end;
$$;

comment on function public.zstudio_has_entitlement(text) is
'Checks the authenticated caller own active Z Studio entitlement, including linked subscription validity. Identity is derived only from auth.uid().';

revoke all on function public.zstudio_has_entitlement(text)
from public, anon, service_role;

grant execute on function public.zstudio_has_entitlement(text)
to authenticated;
