-- ============================================================
-- Z Studio — Google Play reconciliation hardening v1
-- ============================================================
--
-- Retry-safe purchase-intent correlation and terminal historical-trial claim.
-- These RPCs accept only provider state already verified by the privileged
-- Google Play runtime. Raw purchase tokens never cross this database boundary.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Retry-safe current-state correlation, including completed intents
-- ------------------------------------------------------------

create function public.zstudio_reconcile_google_play_purchase_intent(
  p_intent_id uuid,
  p_person_id uuid,
  p_billing_environment text,
  p_plan_code text,
  p_source_subscription_ref text,
  p_provider_trialing boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_environment text := lower(trim(coalesce(p_billing_environment, '')));
  v_plan_code text := lower(trim(coalesce(p_plan_code, '')));
  v_subscription_ref text := trim(coalesce(p_source_subscription_ref, ''));
  v_intent studio.google_play_purchase_intents%rowtype;
  v_trial studio.production_trial_authority%rowtype;
begin
  if p_intent_id is null or p_person_id is null then
    raise exception 'GOOGLE_PLAY_RECONCILE_INTENT_IDENTITY_REQUIRED' using errcode = '22004';
  end if;
  if v_environment not in ('sandbox', 'production') then
    raise exception 'GOOGLE_PLAY_RECONCILE_ENVIRONMENT_INVALID' using errcode = '22023';
  end if;
  if v_plan_code not in ('weekly', 'monthly', 'annual') then
    raise exception 'GOOGLE_PLAY_RECONCILE_PLAN_INVALID' using errcode = '22023';
  end if;
  if v_subscription_ref !~ '^google:play:purchase:[0-9a-f]{64}$' then
    raise exception 'GOOGLE_PLAY_RECONCILE_SUBSCRIPTION_REF_INVALID' using errcode = '22023';
  end if;
  if p_provider_trialing is null then
    raise exception 'GOOGLE_PLAY_RECONCILE_TRIAL_STATE_REQUIRED' using errcode = '22004';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('zstudio:google-play-purchase-intent:' || p_intent_id::text, 0)
  );

  select i.* into v_intent
  from studio.google_play_purchase_intents i
  where i.id = p_intent_id
  for update;

  if not found then
    raise exception 'GOOGLE_PLAY_RECONCILE_INTENT_NOT_FOUND' using errcode = '23503';
  end if;
  if v_intent.person_id <> p_person_id
     or v_intent.billing_environment <> v_environment then
    raise exception 'GOOGLE_PLAY_RECONCILE_INTENT_IDENTITY_CONFLICT' using errcode = '23514';
  end if;
  if v_intent.plan_code <> v_plan_code then
    raise exception 'GOOGLE_PLAY_RECONCILE_INTENT_PLAN_CONFLICT' using errcode = '23514';
  end if;
  if v_intent.source_subscription_ref is not null
     and v_intent.source_subscription_ref <> v_subscription_ref then
    raise exception 'GOOGLE_PLAY_RECONCILE_INTENT_SUBSCRIPTION_CONFLICT' using errcode = '23514';
  end if;
  if v_intent.state not in ('prepared', 'purchase_seen', 'completed') then
    raise exception 'GOOGLE_PLAY_RECONCILE_INTENT_CLOSED' using errcode = '55000';
  end if;

  if v_environment = 'production' and p_provider_trialing then
    if not v_intent.trial_reserved then
      raise exception 'GOOGLE_PLAY_TRIAL_NOT_AUTHORIZED' using errcode = '23514';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('zstudio:production-trial:' || p_person_id::text, 0)
    );

    select t.* into v_trial
    from studio.production_trial_authority t
    where t.person_id = p_person_id
    for update;

    if not found then
      raise exception 'GOOGLE_PLAY_TRIAL_PREFLIGHT_REQUIRED' using errcode = '23514';
    end if;

    if v_trial.state = 'claimed' then
      if v_trial.claimed_billing_source <> 'google_play'
         or v_trial.claimed_source_subscription_ref <> v_subscription_ref then
        raise exception 'COMMERCIAL_TRIAL_ALREADY_CLAIMED' using errcode = '23514';
      end if;
    elsif v_trial.reserved_billing_source <> 'google_play'
          or v_trial.reservation_ref <> p_intent_id::text then
      raise exception 'GOOGLE_PLAY_TRIAL_RESERVATION_CONFLICT' using errcode = '23514';
    end if;
  end if;

  if v_intent.state = 'completed' then
    if v_intent.source_subscription_ref <> v_subscription_ref then
      raise exception 'GOOGLE_PLAY_RECONCILE_COMPLETED_INTENT_CONFLICT' using errcode = '23514';
    end if;
    return jsonb_build_object(
      'result', 'completed',
      'intent_id', v_intent.id,
      'state', v_intent.state,
      'plan_code', v_intent.plan_code,
      'trial_reserved', v_intent.trial_reserved,
      'source_subscription_ref', v_intent.source_subscription_ref
    );
  end if;

  update studio.google_play_purchase_intents i
  set
    state = 'purchase_seen',
    source_subscription_ref = v_subscription_ref,
    updated_at = now()
  where i.id = p_intent_id
  returning * into v_intent;

  return jsonb_build_object(
    'result', 'purchase_seen',
    'intent_id', v_intent.id,
    'state', v_intent.state,
    'plan_code', v_intent.plan_code,
    'trial_reserved', v_intent.trial_reserved,
    'source_subscription_ref', v_intent.source_subscription_ref
  );
end;
$$;

revoke all on function public.zstudio_reconcile_google_play_purchase_intent(uuid,uuid,text,text,text,boolean)
from public, anon, authenticated, service_role;
grant execute on function public.zstudio_reconcile_google_play_purchase_intent(uuid,uuid,text,text,text,boolean)
to service_role;

comment on function public.zstudio_reconcile_google_play_purchase_intent(uuid,uuid,text,text,text,boolean) is
'Retry-safe server-only correlation of a verified Google Play current-state snapshot to the exact authenticated purchase intent. Completed exact intents remain valid for acknowledgement retries.';


-- ------------------------------------------------------------
-- 2. Claim a verified historical Google trial without granting access
-- ------------------------------------------------------------

create function public.zstudio_claim_verified_google_play_trial_consumption(
  p_intent_id uuid,
  p_person_id uuid,
  p_source_subscription_ref text,
  p_billing_environment text,
  p_claimed_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_environment text := lower(trim(coalesce(p_billing_environment, '')));
  v_subscription_ref text := trim(coalesce(p_source_subscription_ref, ''));
  v_intent studio.google_play_purchase_intents%rowtype;
  v_trial studio.production_trial_authority%rowtype;
begin
  if p_intent_id is null or p_person_id is null or p_claimed_at is null then
    raise exception 'GOOGLE_PLAY_TRIAL_CONSUMPTION_ARGUMENT_REQUIRED' using errcode = '22004';
  end if;
  if v_environment not in ('sandbox', 'production') then
    raise exception 'GOOGLE_PLAY_TRIAL_CONSUMPTION_ENVIRONMENT_INVALID' using errcode = '22023';
  end if;
  if v_subscription_ref !~ '^google:play:purchase:[0-9a-f]{64}$' then
    raise exception 'GOOGLE_PLAY_TRIAL_CONSUMPTION_SUBSCRIPTION_REF_INVALID' using errcode = '22023';
  end if;

  if v_environment = 'sandbox' then
    return jsonb_build_object('result', 'sandbox_ignored');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('zstudio:production-trial:' || p_person_id::text, 0)
  );

  select i.* into v_intent
  from studio.google_play_purchase_intents i
  where i.id = p_intent_id
    and i.person_id = p_person_id
    and i.billing_environment = 'production'
    and i.trial_reserved
    and i.state in ('purchase_seen', 'completed')
    and i.source_subscription_ref = v_subscription_ref
  for update;

  if not found then
    raise exception 'GOOGLE_PLAY_TRIAL_CONSUMPTION_INTENT_INVALID' using errcode = '23514';
  end if;

  select t.* into v_trial
  from studio.production_trial_authority t
  where t.person_id = p_person_id
  for update;

  if not found then
    raise exception 'GOOGLE_PLAY_TRIAL_CONSUMPTION_PREFLIGHT_REQUIRED' using errcode = '23514';
  end if;

  if v_trial.state = 'claimed' then
    if v_trial.claimed_billing_source = 'google_play'
       and v_trial.claimed_source_subscription_ref = v_subscription_ref then
      return jsonb_build_object('result', 'duplicate');
    end if;
    raise exception 'GOOGLE_PLAY_TRIAL_CONSUMPTION_ALREADY_CLAIMED' using errcode = '23514';
  end if;

  if v_trial.reserved_billing_source <> 'google_play'
     or v_trial.reservation_ref <> p_intent_id::text then
    raise exception 'GOOGLE_PLAY_TRIAL_CONSUMPTION_RESERVATION_CONFLICT' using errcode = '23514';
  end if;

  update studio.production_trial_authority t
  set
    state = 'claimed',
    claimed_billing_source = 'google_play',
    claimed_source_subscription_ref = v_subscription_ref,
    claimed_at = p_claimed_at,
    updated_at = now()
  where t.person_id = p_person_id;

  return jsonb_build_object('result', 'claimed');
end;
$$;

revoke all on function public.zstudio_claim_verified_google_play_trial_consumption(uuid,uuid,text,text,timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.zstudio_claim_verified_google_play_trial_consumption(uuid,uuid,text,text,timestamptz)
to service_role;

comment on function public.zstudio_claim_verified_google_play_trial_consumption(uuid,uuid,text,text,timestamptz) is
'Claims the lifetime Z Studio production trial after Google current-state proves an already-consumed historical free trial. It never creates subscriptions, entitlements or billing events.';


-- ------------------------------------------------------------
-- 3. Close a provider-proven canceled pending purchase
-- ------------------------------------------------------------

create function public.zstudio_fail_google_play_purchase_intent(
  p_intent_id uuid,
  p_person_id uuid,
  p_billing_environment text,
  p_source_subscription_ref text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_environment text := lower(trim(coalesce(p_billing_environment, '')));
  v_subscription_ref text := trim(coalesce(p_source_subscription_ref, ''));
  v_intent studio.google_play_purchase_intents%rowtype;
begin
  if p_intent_id is null or p_person_id is null then
    raise exception 'GOOGLE_PLAY_FAIL_INTENT_IDENTITY_REQUIRED' using errcode = '22004';
  end if;
  if v_environment not in ('sandbox', 'production') then
    raise exception 'GOOGLE_PLAY_FAIL_INTENT_ENVIRONMENT_INVALID' using errcode = '22023';
  end if;
  if v_subscription_ref !~ '^google:play:purchase:[0-9a-f]{64}$' then
    raise exception 'GOOGLE_PLAY_FAIL_INTENT_SUBSCRIPTION_REF_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('zstudio:google-play-purchase-intent:' || p_intent_id::text, 0)
  );

  select i.* into v_intent
  from studio.google_play_purchase_intents i
  where i.id = p_intent_id
  for update;

  if not found then
    raise exception 'GOOGLE_PLAY_FAIL_INTENT_NOT_FOUND' using errcode = '23503';
  end if;
  if v_intent.person_id <> p_person_id
     or v_intent.billing_environment <> v_environment
     or v_intent.source_subscription_ref <> v_subscription_ref then
    raise exception 'GOOGLE_PLAY_FAIL_INTENT_AUTHORITY_CONFLICT' using errcode = '23514';
  end if;

  if v_intent.state = 'failed' then
    return jsonb_build_object(
      'result', 'duplicate',
      'intent_id', v_intent.id,
      'state', v_intent.state
    );
  end if;
  if v_intent.state <> 'purchase_seen' then
    raise exception 'GOOGLE_PLAY_FAIL_INTENT_REQUIRES_PURCHASE' using errcode = '55000';
  end if;

  update studio.google_play_purchase_intents i
  set
    state = 'failed',
    closed_at = now(),
    updated_at = now()
  where i.id = p_intent_id
  returning * into v_intent;

  if v_environment = 'production' and v_intent.trial_reserved then
    delete from studio.production_trial_authority t
    where t.person_id = p_person_id
      and t.state = 'reserved'
      and t.reserved_billing_source = 'google_play'
      and t.reservation_ref = p_intent_id::text;
  end if;

  return jsonb_build_object(
    'result', 'failed',
    'intent_id', v_intent.id,
    'state', v_intent.state
  );
end;
$$;

revoke all on function public.zstudio_fail_google_play_purchase_intent(uuid,uuid,text,text)
from public, anon, authenticated, service_role;
grant execute on function public.zstudio_fail_google_play_purchase_intent(uuid,uuid,text,text)
to service_role;

comment on function public.zstudio_fail_google_play_purchase_intent(uuid,uuid,text,text) is
'Closes the exact Google Play purchase intent after current-state proves a pending purchase was canceled. It releases only the exact still-reserved Google production trial and never mutates commercial subscription authority.';
