-- ============================================================
-- Z Studio — Apple purchase preflight authority v1
-- ============================================================
-- Server-only purchase intent + global lifetime trial reservation for StoreKit 2.
-- The Apple account identifier used to sign introductory-offer eligibility is
-- never stored here; only the canonical ZOS person, plan/product and intent are.

create table studio.apple_purchase_intents (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references zos.persons(id) on delete restrict,
  billing_environment text not null check (billing_environment in ('sandbox','production')),
  plan_code text not null check (plan_code in ('weekly','monthly','annual')),
  product_id text not null,
  state text not null check (state in ('prepared','purchase_seen','completed','failed')),
  trial_reserved boolean not null default false,
  source_subscription_ref text,
  intent_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (intent_expires_at > created_at)
);

create unique index uq_studio_apple_purchase_intents_open_person_environment
on studio.apple_purchase_intents(person_id, billing_environment)
where state in ('prepared','purchase_seen');

create unique index uq_studio_apple_purchase_intents_subscription
on studio.apple_purchase_intents(billing_environment, source_subscription_ref)
where source_subscription_ref is not null;

alter table studio.apple_purchase_intents enable row level security;
revoke all on studio.apple_purchase_intents from public, anon, authenticated, service_role;

comment on table studio.apple_purchase_intents is
'Server-only Apple StoreKit purchase preflight intents. They serialize plan selection and the global Z Studio production trial decision; no Apple account transaction identifier or raw JWS is stored.';

create or replace function public.zstudio_prepare_apple_purchase(
  p_person_id uuid,
  p_plan_code text,
  p_billing_environment text,
  p_product_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_environment text := lower(trim(coalesce(p_billing_environment, '')));
  v_plan text := lower(trim(coalesce(p_plan_code, '')));
  v_product text := trim(coalesce(p_product_id, ''));
  v_expected_product text;
  v_intent studio.apple_purchase_intents%rowtype;
  v_trial studio.production_trial_authority%rowtype;
  v_web_intent studio.web_checkout_intents%rowtype;
  v_google_intent studio.google_play_purchase_intents%rowtype;
  v_intent_id uuid := gen_random_uuid();
  v_trial_eligible boolean := false;
  v_expires_at timestamptz := now() + interval '30 minutes';
begin
  if p_person_id is null then
    raise exception 'APPLE_PURCHASE_PERSON_REQUIRED' using errcode = '22004';
  end if;
  if not exists (select 1 from zos.persons p where p.id = p_person_id) then
    raise exception 'APPLE_PURCHASE_PERSON_NOT_FOUND' using errcode = '23503';
  end if;
  if v_environment not in ('sandbox','production') then
    raise exception 'APPLE_PURCHASE_ENVIRONMENT_INVALID' using errcode = '22023';
  end if;
  if v_plan not in ('weekly','monthly','annual') then
    raise exception 'APPLE_PURCHASE_PLAN_INVALID' using errcode = '22023';
  end if;

  v_expected_product := case v_plan
    when 'weekly' then 'com.zoperatingsystem.zstudio.subscription.weekly'
    when 'monthly' then 'com.zoperatingsystem.zstudio.subscription.monthly'
    when 'annual' then 'com.zoperatingsystem.zstudio.subscription.annual'
  end;
  if v_product <> v_expected_product then
    raise exception 'APPLE_PURCHASE_PRODUCT_INVALID' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('zstudio:apple-purchase:' || p_person_id::text || ':' || v_environment, 0)
  );

  if exists (
    select 1 from studio.subscriptions s
    where s.person_id = p_person_id
      and s.billing_environment = v_environment
      and s.status in ('trialing','active','grace','past_due','paused')
  ) then
    raise exception 'APPLE_PURCHASE_EXISTING_SUBSCRIPTION_CONFLICT' using errcode = '23514';
  end if;

  select i.* into v_intent
  from studio.apple_purchase_intents i
  where i.person_id = p_person_id
    and i.billing_environment = v_environment
    and i.state in ('prepared','purchase_seen')
  order by i.created_at desc
  limit 1
  for update;

  if found then
    if v_intent.intent_expires_at > now() then
      if v_intent.plan_code <> v_plan or v_intent.product_id <> v_product then
        raise exception 'APPLE_PURCHASE_INTENT_CONFLICT' using errcode = '23514';
      end if;
      return jsonb_build_object(
        'result', 'existing',
        'intent_id', v_intent.id,
        'plan_code', v_intent.plan_code,
        'product_id', v_intent.product_id,
        'billing_environment', v_intent.billing_environment,
        'trial_eligible', v_intent.trial_reserved,
        'intent_expires_at', v_intent.intent_expires_at
      );
    end if;

    if v_intent.state = 'purchase_seen' then
      raise exception 'APPLE_PURCHASE_RECONCILIATION_REQUIRED' using errcode = '55000';
    end if;

    update studio.apple_purchase_intents
    set state = 'failed', updated_at = now()
    where id = v_intent.id;

    if v_environment = 'production' and v_intent.trial_reserved then
      delete from studio.production_trial_authority t
      where t.person_id = p_person_id
        and t.state = 'reserved'
        and t.reserved_billing_source = 'apple_app_store'
        and t.reservation_ref = v_intent.id::text
        and t.reservation_expires_at <= now();
    end if;
  end if;

  if v_environment = 'sandbox' then
    v_trial_eligible := true;
  else
    perform pg_advisory_xact_lock(
      hashtextextended('zstudio:production-trial:' || p_person_id::text, 0)
    );

    select t.* into v_trial
    from studio.production_trial_authority t
    where t.person_id = p_person_id
    for update;

    if not found then
      v_trial_eligible := true;
    elsif v_trial.state = 'claimed' then
      v_trial_eligible := false;
    elsif v_trial.reservation_expires_at > now() then
      raise exception 'APPLE_PURCHASE_TRIAL_RESERVED_ELSEWHERE' using errcode = '55000';
    elsif v_trial.reserved_billing_source = 'web' then
      select i.* into v_web_intent from studio.web_checkout_intents i
      where i.id::text = v_trial.reservation_ref and i.person_id = p_person_id and i.billing_environment = 'production';
      if found and v_web_intent.state = 'session_created' then raise exception 'APPLE_PURCHASE_RECONCILIATION_REQUIRED' using errcode = '55000'; end if;
      delete from studio.production_trial_authority t where t.person_id = p_person_id and t.state = 'reserved';
      v_trial_eligible := true;
    elsif v_trial.reserved_billing_source = 'google_play' then
      select i.* into v_google_intent from studio.google_play_purchase_intents i
      where i.id::text = v_trial.reservation_ref and i.person_id = p_person_id and i.billing_environment = 'production';
      if found and v_google_intent.state = 'purchase_seen' then raise exception 'APPLE_PURCHASE_RECONCILIATION_REQUIRED' using errcode = '55000'; end if;
      delete from studio.production_trial_authority t where t.person_id = p_person_id and t.state = 'reserved';
      v_trial_eligible := true;
    elsif v_trial.reserved_billing_source = 'apple_app_store' then
      select i.* into v_intent from studio.apple_purchase_intents i
      where i.id::text = v_trial.reservation_ref and i.person_id = p_person_id and i.billing_environment = 'production';
      if found and v_intent.state = 'purchase_seen' then raise exception 'APPLE_PURCHASE_RECONCILIATION_REQUIRED' using errcode = '55000'; end if;
      delete from studio.production_trial_authority t where t.person_id = p_person_id and t.state = 'reserved';
      v_trial_eligible := true;
    else
      delete from studio.production_trial_authority t where t.person_id = p_person_id and t.state = 'reserved';
      v_trial_eligible := true;
    end if;
  end if;

  insert into studio.apple_purchase_intents (
    id, person_id, billing_environment, plan_code, product_id,
    state, trial_reserved, intent_expires_at
  ) values (
    v_intent_id, p_person_id, v_environment, v_plan, v_product,
    'prepared', v_trial_eligible, v_expires_at
  ) returning * into v_intent;

  if v_environment = 'production' and v_trial_eligible then
    insert into studio.production_trial_authority (
      person_id, state, reserved_billing_source, reservation_ref,
      reservation_expires_at, updated_at
    ) values (
      p_person_id, 'reserved', 'apple_app_store', v_intent_id::text,
      v_expires_at, now()
    )
    on conflict (person_id) do update
    set state = 'reserved', reserved_billing_source = 'apple_app_store', reservation_ref = v_intent_id::text,
        reservation_expires_at = v_expires_at, claimed_billing_source = null,
        claimed_source_subscription_ref = null, claimed_at = null, updated_at = now();
  end if;

  return jsonb_build_object(
    'result', 'prepared', 'intent_id', v_intent.id, 'plan_code', v_intent.plan_code,
    'product_id', v_intent.product_id, 'billing_environment', v_intent.billing_environment,
    'trial_eligible', v_intent.trial_reserved, 'intent_expires_at', v_intent.intent_expires_at
  );
end;
$$;

revoke all on function public.zstudio_prepare_apple_purchase(uuid,text,text,text)
from public, anon, authenticated, service_role;
grant execute on function public.zstudio_prepare_apple_purchase(uuid,text,text,text) to service_role;

create or replace function public.zstudio_reconcile_apple_purchase_intent(
  p_intent_id uuid, p_person_id uuid, p_billing_environment text, p_plan_code text,
  p_product_id text, p_source_subscription_ref text, p_provider_trialing boolean
)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_environment text := lower(trim(coalesce(p_billing_environment, '')));
  v_plan text := lower(trim(coalesce(p_plan_code, '')));
  v_product text := trim(coalesce(p_product_id, ''));
  v_source_ref text := trim(coalesce(p_source_subscription_ref, ''));
  v_intent studio.apple_purchase_intents%rowtype;
begin
  if p_intent_id is null or p_person_id is null or p_provider_trialing is null then raise exception 'APPLE_PURCHASE_RECONCILE_REQUIRED' using errcode = '22004'; end if;
  if v_environment not in ('sandbox','production') or v_plan not in ('weekly','monthly','annual') then raise exception 'APPLE_PURCHASE_RECONCILE_INVALID' using errcode = '22023'; end if;
  if v_source_ref !~ '^[0-9]+$' then raise exception 'APPLE_PURCHASE_SUBSCRIPTION_REF_INVALID' using errcode = '22023'; end if;
  select i.* into v_intent from studio.apple_purchase_intents i
  where i.id = p_intent_id and i.person_id = p_person_id and i.billing_environment = v_environment for update;
  if not found then raise exception 'APPLE_PURCHASE_INTENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_intent.plan_code <> v_plan or v_intent.product_id <> v_product then raise exception 'APPLE_PURCHASE_INTENT_PRODUCT_CONFLICT' using errcode = '23514'; end if;
  if p_provider_trialing and not v_intent.trial_reserved then raise exception 'APPLE_PURCHASE_TRIAL_NOT_AUTHORIZED' using errcode = '23514'; end if;
  if v_intent.source_subscription_ref is not null and v_intent.source_subscription_ref <> v_source_ref then raise exception 'APPLE_PURCHASE_INTENT_SUBSCRIPTION_CONFLICT' using errcode = '23514'; end if;
  if v_intent.state = 'completed' then return jsonb_build_object('result','completed','intent_id',v_intent.id); end if;
  if v_intent.state not in ('prepared','purchase_seen') then raise exception 'APPLE_PURCHASE_INTENT_NOT_OPEN' using errcode = '55000'; end if;
  if exists (select 1 from studio.apple_purchase_intents i where i.billing_environment = v_environment and i.source_subscription_ref = v_source_ref and i.id <> v_intent.id) then raise exception 'APPLE_PURCHASE_SUBSCRIPTION_IDENTITY_CONFLICT' using errcode = '23514'; end if;
  update studio.apple_purchase_intents i set state = 'purchase_seen', source_subscription_ref = v_source_ref, updated_at = now()
  where i.id = v_intent.id returning * into v_intent;
  return jsonb_build_object('result','reconciled','intent_id',v_intent.id,'trial_reserved',v_intent.trial_reserved);
end;
$$;

revoke all on function public.zstudio_reconcile_apple_purchase_intent(uuid,uuid,text,text,text,text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.zstudio_reconcile_apple_purchase_intent(uuid,uuid,text,text,text,text,boolean) to service_role;

create or replace function public.zstudio_complete_apple_purchase_intent(
  p_intent_id uuid, p_person_id uuid, p_billing_environment text,
  p_source_subscription_ref text, p_provider_trialing boolean
)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_environment text := lower(trim(coalesce(p_billing_environment, '')));
  v_source_ref text := trim(coalesce(p_source_subscription_ref, ''));
  v_intent studio.apple_purchase_intents%rowtype;
  v_trial studio.production_trial_authority%rowtype;
begin
  if p_intent_id is null or p_person_id is null or p_provider_trialing is null then raise exception 'APPLE_PURCHASE_COMPLETE_REQUIRED' using errcode = '22004'; end if;
  if v_environment not in ('sandbox','production') or v_source_ref !~ '^[0-9]+$' then raise exception 'APPLE_PURCHASE_COMPLETE_INVALID' using errcode = '22023'; end if;
  select i.* into v_intent from studio.apple_purchase_intents i where i.id = p_intent_id and i.person_id = p_person_id and i.billing_environment = v_environment for update;
  if not found then raise exception 'APPLE_PURCHASE_INTENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_intent.state = 'completed' then
    if v_intent.source_subscription_ref = v_source_ref then return jsonb_build_object('result','duplicate','intent_id',v_intent.id); end if;
    raise exception 'APPLE_PURCHASE_INTENT_SUBSCRIPTION_CONFLICT' using errcode = '23514';
  end if;
  if v_intent.state <> 'purchase_seen' or v_intent.source_subscription_ref <> v_source_ref then raise exception 'APPLE_PURCHASE_INTENT_NOT_RECONCILED' using errcode = '55000'; end if;
  if v_environment = 'production' and v_intent.trial_reserved then
    select t.* into v_trial from studio.production_trial_authority t where t.person_id = p_person_id for update;
    if p_provider_trialing then
      if not found or v_trial.state <> 'claimed' or v_trial.claimed_billing_source <> 'apple_app_store' or v_trial.claimed_source_subscription_ref <> v_source_ref then raise exception 'APPLE_PURCHASE_TRIAL_CLAIM_MISSING' using errcode = '23514'; end if;
    elsif found and v_trial.state = 'reserved' and v_trial.reserved_billing_source = 'apple_app_store' and v_trial.reservation_ref = v_intent.id::text then
      delete from studio.production_trial_authority t where t.person_id = p_person_id;
    end if;
  end if;
  update studio.apple_purchase_intents i set state = 'completed', completed_at = now(), updated_at = now() where i.id = v_intent.id;
  return jsonb_build_object('result','completed','intent_id',v_intent.id);
end;
$$;

revoke all on function public.zstudio_complete_apple_purchase_intent(uuid,uuid,text,text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.zstudio_complete_apple_purchase_intent(uuid,uuid,text,text,boolean) to service_role;

create or replace function studio.zstudio_validate_apple_trial_preflight_on_billing_event()
returns trigger language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_trial studio.production_trial_authority%rowtype;
  v_intent studio.apple_purchase_intents%rowtype;
begin
  if new.billing_environment <> 'production' or new.billing_source <> 'apple_app_store' or new.event_type <> 'trial_started' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('zstudio:production-trial:' || new.person_id::text, 0));
  select t.* into v_trial from studio.production_trial_authority t where t.person_id = new.person_id for update;
  if not found or v_trial.state <> 'reserved' or v_trial.reserved_billing_source <> 'apple_app_store' then raise exception 'APPLE_PURCHASE_TRIAL_PREFLIGHT_REQUIRED' using errcode = '23514'; end if;
  select i.* into v_intent from studio.apple_purchase_intents i
  where i.id::text = v_trial.reservation_ref and i.person_id = new.person_id and i.billing_environment = 'production'
    and i.state in ('prepared','purchase_seen') and i.trial_reserved = true for update;
  if not found or v_intent.product_id <> new.source_product_ref or v_intent.plan_code <> new.target_plan_code
     or (v_intent.source_subscription_ref is not null and v_intent.source_subscription_ref <> new.source_subscription_ref) then
    raise exception 'APPLE_PURCHASE_TRIAL_PREFLIGHT_INVALID' using errcode = '23514';
  end if;
  if v_intent.state = 'prepared' then
    update studio.apple_purchase_intents i set state = 'purchase_seen', source_subscription_ref = new.source_subscription_ref, updated_at = now() where i.id = v_intent.id;
  end if;
  return new;
end;
$$;

revoke all on function studio.zstudio_validate_apple_trial_preflight_on_billing_event() from public, anon, authenticated, service_role;
drop trigger if exists zstudio_apple_trial_preflight_before_billing_event on studio.billing_events;
create trigger zstudio_apple_trial_preflight_before_billing_event before insert on studio.billing_events
for each row execute function studio.zstudio_validate_apple_trial_preflight_on_billing_event();
comment on function studio.zstudio_validate_apple_trial_preflight_on_billing_event() is
'Internal fail-closed guard requiring an exact Apple purchase intent and global Apple trial reservation before any production Apple trial_started event can reach the shared commercial writer.';
