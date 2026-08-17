-- Z Studio — commercial authority foundation v1
--
-- ZOS owns canonical identity. The Studio domain owns only Z Studio product,
-- subscription, entitlement and AI-usage state. Store/web payment adapters are
-- deliberately out of scope for this foundation.

create schema studio;

comment on schema studio is
'Z Studio product domain. Canonical human identity remains in zos.persons; Studio-specific commercial and usage state must stay here.';

revoke all on schema studio from public, anon, authenticated;
grant usage on schema studio to service_role;

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
  check (current_period_end is null or current_period_start is null or current_period_end > current_period_start)
);

comment on table studio.subscriptions is
'Z Studio subscription records. A trial belongs to a paid weekly/monthly/annual plan; there is no permanent free plan.';

create index idx_studio_subscriptions_person_status
  on studio.subscriptions(person_id, status);

create unique index uq_studio_subscriptions_source_ref
  on studio.subscriptions(billing_source, source_subscription_ref)
  where source_subscription_ref is not null;

alter table studio.subscriptions enable row level security;

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
  check (expires_at is null or expires_at > starts_at)
);

comment on table studio.entitlements is
'Authoritative Z Studio product/feature access grants. Entitlements belong to a canonical ZOS person but remain Studio-domain data.';

create index idx_studio_entitlements_lookup
  on studio.entitlements(person_id, entitlement_code, status, starts_at, expires_at);

alter table studio.entitlements enable row level security;

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

-- No browser role may read or mutate Studio commercial authority directly.
-- Future store/web adapters operate server-side. AI usage is append-only for the
-- normal service role; destructive retention remains an explicit DB operation.
revoke all on studio.subscriptions, studio.entitlements, studio.ai_usage
  from public, anon, authenticated;

grant select, insert, update, delete on studio.subscriptions, studio.entitlements
  to service_role;

grant select, insert on studio.ai_usage
  to service_role;

-- Narrow authenticated read boundary. The caller cannot choose a person_id;
-- identity is always derived from auth.uid().
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
      join studio.entitlements e on e.person_id = p.id
      where p.auth_user_id = auth.uid()
        and e.entitlement_code = p_entitlement_code
        and e.status in ('active', 'grace')
        and e.starts_at <= now()
        and (e.expires_at is null or e.expires_at > now())
    )
  end;
$$;

comment on function public.zstudio_has_entitlement(text) is
'Checks the authenticated caller own Z Studio entitlement. Identity is derived only from auth.uid(); no person identifier is accepted from the client.';

revoke all on function public.zstudio_has_entitlement(text)
  from public, anon, service_role;

grant execute on function public.zstudio_has_entitlement(text)
  to authenticated;
