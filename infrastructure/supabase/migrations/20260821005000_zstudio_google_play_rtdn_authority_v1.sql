-- ============================================================
-- Z Studio — Google Play RTDN authority v1
-- ============================================================
--
-- Server-only correlation and deduplication for authenticated Google Cloud
-- Pub/Sub Real-time Developer Notifications. RTDN is trigger-only authority:
-- commercial state is always fetched fresh from Google Play Developer API.
-- Raw Pub/Sub OIDC tokens, RTDN payloads and Google purchase tokens are never
-- stored in this authority.
-- ============================================================

create table studio.google_play_rtdn_receipts (
  message_id text primary key
    check (message_id ~ '^[0-9]{1,40}$'),

  notification_kind text not null
    check (
      notification_kind in (
        'subscription',
        'voided_subscription',
        'one_time_ignored',
        'pending_refund_review',
        'test'
      )
    ),

  notification_type integer,
  event_time timestamptz not null,

  source_subscription_ref text
    check (
      source_subscription_ref is null
      or source_subscription_ref ~ '^google:play:purchase:[0-9a-f]{64}$'
    ),

  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table studio.google_play_rtdn_receipts enable row level security;
revoke all on studio.google_play_rtdn_receipts
from public, anon, authenticated, service_role;

comment on table studio.google_play_rtdn_receipts is
'Processed Google Play RTDN message-id ledger. Stores trigger metadata and hashed subscription authority only; never raw OIDC, RTDN payloads or purchase tokens.';


-- Pending refund reviews are support-only. Google requires the pending refund
-- token to submit a ReviewRefund decision, so this narrow server-only queue
-- preserves that action token without mutating subscription or entitlement
-- authority. No review is approved/rejected automatically.
create table studio.google_play_pending_refund_reviews (
  pending_refund_token text primary key
    check (
      length(pending_refund_token) between 1 and 4096
      and pending_refund_token !~ '[[:space:][:cntrl:]]'
    ),
  message_id text not null unique
    check (message_id ~ '^[0-9]{1,40}$'),
  order_id text not null
    check (length(trim(order_id)) between 1 and 256),
  refund_reason integer not null
    check (refund_reason between 1 and 1000),
  person_id uuid references zos.persons(id) on delete restrict,
  event_time timestamptz not null,
  review_due_at timestamptz not null,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'resolved_externally')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (review_due_at > event_time)
);

alter table studio.google_play_pending_refund_reviews enable row level security;
revoke all on studio.google_play_pending_refund_reviews
from public, anon, authenticated, service_role;

comment on table studio.google_play_pending_refund_reviews is
'Server-only Google Play pending refund review support queue. Stores the provider review token because Google requires it for a later ReviewRefund decision; it never grants or revokes product access.';


-- ------------------------------------------------------------
-- 1. Resolve canonical person + optional purchase intent
-- ------------------------------------------------------------

create function public.zstudio_resolve_google_play_rtdn_identity(
  p_billing_environment text,
  p_source_subscription_ref text,
  p_external_account_id uuid,
  p_plan_code text,
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
  v_subscription_ref text := trim(coalesce(p_source_subscription_ref, ''));
  v_plan_code text := lower(trim(coalesce(p_plan_code, '')));
  v_subscription studio.subscriptions%rowtype;
  v_intent studio.google_play_purchase_intents%rowtype;
  v_person_id uuid;
  v_existing_subscription boolean := false;
begin
  if v_environment not in ('sandbox', 'production') then
    raise exception 'GOOGLE_PLAY_RTDN_ENVIRONMENT_INVALID' using errcode = '22023';
  end if;
  if v_subscription_ref !~ '^google:play:purchase:[0-9a-f]{64}$' then
    raise exception 'GOOGLE_PLAY_RTDN_SUBSCRIPTION_REF_INVALID' using errcode = '22023';
  end if;
  if v_plan_code not in ('weekly', 'monthly', 'annual') then
    raise exception 'GOOGLE_PLAY_RTDN_PLAN_INVALID' using errcode = '22023';
  end if;
  if p_provider_trialing is null then
    raise exception 'GOOGLE_PLAY_RTDN_TRIAL_STATE_REQUIRED' using errcode = '22004';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'zstudio:google-play-rtdn:' || v_environment || ':' || v_subscription_ref,
      0
    )
  );

  select s.* into v_subscription
  from studio.subscriptions s
  where s.billing_source = 'google_play'
    and s.billing_environment = v_environment
    and s.source_subscription_ref = v_subscription_ref
  for update;

  if found then
    v_existing_subscription := true;
    v_person_id := v_subscription.person_id;

    if p_external_account_id is not null
       and p_external_account_id <> v_person_id then
      raise exception 'GOOGLE_PLAY_RTDN_EXTERNAL_IDENTITY_CONFLICT'
        using errcode = '23514';
    end if;
  else
    if p_external_account_id is null then
      raise exception 'GOOGLE_PLAY_RTDN_EXTERNAL_IDENTITY_REQUIRED'
        using errcode = '23514';
    end if;

    if not exists (
      select 1 from zos.persons p where p.id = p_external_account_id
    ) then
      raise exception 'GOOGLE_PLAY_RTDN_PERSON_NOT_FOUND'
        using errcode = '23503';
    end if;

    v_person_id := p_external_account_id;

    -- A fresh provider chain cannot bypass the same-environment recoverable
    -- subscription guard merely because the RTDN arrived before device
    -- reconciliation. Plan replacement is deliberately out of scope in v1.
    if exists (
      select 1
      from studio.subscriptions s
      where s.person_id = v_person_id
        and s.billing_source = 'google_play'
        and s.billing_environment = v_environment
        and s.source_subscription_ref <> v_subscription_ref
        and s.status in ('trialing', 'active', 'grace', 'past_due', 'paused')
    ) then
      raise exception 'GOOGLE_PLAY_RTDN_EXISTING_SUBSCRIPTION_CONFLICT'
        using errcode = '23514';
    end if;
  end if;

  -- Prefer an already-bound exact intent (including a completed one for retry).
  select i.* into v_intent
  from studio.google_play_purchase_intents i
  where i.person_id = v_person_id
    and i.billing_environment = v_environment
    and i.source_subscription_ref = v_subscription_ref
    and i.state in ('purchase_seen', 'completed')
  order by i.created_at desc
  limit 1
  for update;

  if not found and not v_existing_subscription then
    -- Initial RTDN may race the device reconcile. There can be at most one open
    -- intent for the person/environment. Bindability is checked again by the
    -- dedicated reconcile RPC before any commercial writer is called.
    select i.* into v_intent
    from studio.google_play_purchase_intents i
    where i.person_id = v_person_id
      and i.billing_environment = v_environment
      and i.state in ('prepared', 'purchase_seen')
    order by i.created_at desc
    limit 1
    for update;
  end if;

  if found then
    if v_intent.plan_code <> v_plan_code then
      raise exception 'GOOGLE_PLAY_RTDN_INTENT_PLAN_CONFLICT'
        using errcode = '23514';
    end if;
    if v_intent.source_subscription_ref is not null
       and v_intent.source_subscription_ref <> v_subscription_ref then
      raise exception 'GOOGLE_PLAY_RTDN_INTENT_SUBSCRIPTION_CONFLICT'
        using errcode = '23514';
    end if;
  end if;

  if v_environment = 'production' and p_provider_trialing then
    if v_intent.id is null or not v_intent.trial_reserved then
      raise exception 'GOOGLE_PLAY_RTDN_TRIAL_PREFLIGHT_REQUIRED'
        using errcode = '23514';
    end if;
  end if;

  return jsonb_build_object(
    'result', 'resolved',
    'person_id', v_person_id,
    'intent_id', v_intent.id,
    'existing_subscription', v_existing_subscription,
    'trial_reserved', case when v_intent.id is null then false else v_intent.trial_reserved end
  );
end;
$$;

revoke all on function public.zstudio_resolve_google_play_rtdn_identity(text,text,uuid,text,boolean)
from public, anon, authenticated, service_role;
grant execute on function public.zstudio_resolve_google_play_rtdn_identity(text,text,uuid,text,boolean)
to service_role;

comment on function public.zstudio_resolve_google_play_rtdn_identity(text,text,uuid,text,boolean) is
'Resolves authenticated Google Play RTDN current-state to canonical ZOS identity and an optional exact purchase intent. Existing provider binding wins; new chains require Google obfuscatedExternalAccountId. Production trials additionally require the global preflight reservation.';


-- ------------------------------------------------------------
-- 2. Record support-only pending refund review
-- ------------------------------------------------------------

create function public.zstudio_record_google_play_pending_refund_review(
  p_message_id text,
  p_pending_refund_token text,
  p_order_id text,
  p_refund_reason integer,
  p_obfuscated_account_id text,
  p_event_time timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_message_id text := trim(coalesce(p_message_id, ''));
  v_token text := coalesce(p_pending_refund_token, '');
  v_order_id text := trim(coalesce(p_order_id, ''));
  v_account_id text := nullif(lower(trim(coalesce(p_obfuscated_account_id, ''))), '');
  v_person_id uuid;
  v_existing studio.google_play_pending_refund_reviews%rowtype;
begin
  if v_message_id !~ '^[0-9]{1,40}$' then
    raise exception 'GOOGLE_PLAY_RTDN_MESSAGE_ID_INVALID' using errcode = '22023';
  end if;
  if length(v_token) < 1 or length(v_token) > 4096
     or v_token ~ '[[:space:][:cntrl:]]' then
    raise exception 'GOOGLE_PLAY_RTDN_PENDING_REFUND_TOKEN_INVALID' using errcode = '22023';
  end if;
  if length(v_order_id) < 1 or length(v_order_id) > 256 then
    raise exception 'GOOGLE_PLAY_RTDN_ORDER_ID_INVALID' using errcode = '22023';
  end if;
  if p_refund_reason is null or p_refund_reason < 1 or p_refund_reason > 1000 then
    raise exception 'GOOGLE_PLAY_RTDN_REFUND_REASON_INVALID' using errcode = '22023';
  end if;
  if p_event_time is null then
    raise exception 'GOOGLE_PLAY_RTDN_EVENT_TIME_REQUIRED' using errcode = '22004';
  end if;

  if v_account_id is not null
     and v_account_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_person_id := v_account_id::uuid;
    if not exists (select 1 from zos.persons p where p.id = v_person_id) then
      v_person_id := null;
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('zstudio:google-play-refund-review:' || v_message_id, 0)
  );

  select r.* into v_existing
  from studio.google_play_pending_refund_reviews r
  where r.message_id = v_message_id
     or r.pending_refund_token = v_token
  order by r.created_at
  limit 1
  for update;

  if found then
    if v_existing.message_id = v_message_id
       and v_existing.pending_refund_token = v_token
       and v_existing.order_id = v_order_id
       and v_existing.refund_reason = p_refund_reason
       and v_existing.person_id is not distinct from v_person_id
       and v_existing.event_time = p_event_time then
      return jsonb_build_object('result', 'duplicate');
    end if;
    raise exception 'GOOGLE_PLAY_RTDN_PENDING_REFUND_CONFLICT' using errcode = '23505';
  end if;

  insert into studio.google_play_pending_refund_reviews (
    pending_refund_token,
    message_id,
    order_id,
    refund_reason,
    person_id,
    event_time,
    review_due_at
  ) values (
    v_token,
    v_message_id,
    v_order_id,
    p_refund_reason,
    v_person_id,
    p_event_time,
    p_event_time + interval '24 hours'
  );

  return jsonb_build_object('result', 'recorded');
end;
$$;

revoke all on function public.zstudio_record_google_play_pending_refund_review(text,text,text,integer,text,timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.zstudio_record_google_play_pending_refund_review(text,text,text,integer,text,timestamptz)
to service_role;

comment on function public.zstudio_record_google_play_pending_refund_review(text,text,text,integer,text,timestamptz) is
'Records an authenticated Google Play PendingRefundReviewNotification for human/support handling within the provider review window. It never mutates commercial access.';


-- ------------------------------------------------------------
-- 3. Cheap processed-message lookup before provider API calls
-- ------------------------------------------------------------

create function public.zstudio_google_play_rtdn_is_processed(
  p_message_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_message_id text := trim(coalesce(p_message_id, ''));
begin
  if v_message_id !~ '^[0-9]{1,40}$' then
    raise exception 'GOOGLE_PLAY_RTDN_MESSAGE_ID_INVALID' using errcode = '22023';
  end if;

  return exists (
    select 1
    from studio.google_play_rtdn_receipts r
    where r.message_id = v_message_id
  );
end;
$$;

revoke all on function public.zstudio_google_play_rtdn_is_processed(text)
from public, anon, authenticated, service_role;
grant execute on function public.zstudio_google_play_rtdn_is_processed(text)
to service_role;


-- ------------------------------------------------------------
-- 4. Mark message processed only after the entire action succeeds
-- ------------------------------------------------------------

create function public.zstudio_mark_google_play_rtdn_processed(
  p_message_id text,
  p_notification_kind text,
  p_notification_type integer,
  p_event_time timestamptz,
  p_source_subscription_ref text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_message_id text := trim(coalesce(p_message_id, ''));
  v_kind text := lower(trim(coalesce(p_notification_kind, '')));
  v_subscription_ref text := nullif(trim(coalesce(p_source_subscription_ref, '')), '');
  v_existing studio.google_play_rtdn_receipts%rowtype;
begin
  if v_message_id !~ '^[0-9]{1,40}$' then
    raise exception 'GOOGLE_PLAY_RTDN_MESSAGE_ID_INVALID' using errcode = '22023';
  end if;
  if v_kind not in (
    'subscription',
    'voided_subscription',
    'one_time_ignored',
    'pending_refund_review',
    'test'
  ) then
    raise exception 'GOOGLE_PLAY_RTDN_KIND_INVALID' using errcode = '22023';
  end if;
  if p_event_time is null then
    raise exception 'GOOGLE_PLAY_RTDN_EVENT_TIME_REQUIRED' using errcode = '22004';
  end if;
  if p_notification_type is not null
     and (p_notification_type < 0 or p_notification_type > 1000) then
    raise exception 'GOOGLE_PLAY_RTDN_NOTIFICATION_TYPE_INVALID' using errcode = '22023';
  end if;
  if v_subscription_ref is not null
     and v_subscription_ref !~ '^google:play:purchase:[0-9a-f]{64}$' then
    raise exception 'GOOGLE_PLAY_RTDN_SUBSCRIPTION_REF_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('zstudio:google-play-rtdn-message:' || v_message_id, 0)
  );

  select r.* into v_existing
  from studio.google_play_rtdn_receipts r
  where r.message_id = v_message_id
  for update;

  if found then
    if v_existing.notification_kind = v_kind
       and v_existing.notification_type is not distinct from p_notification_type
       and v_existing.event_time = p_event_time
       and v_existing.source_subscription_ref is not distinct from v_subscription_ref then
      return jsonb_build_object('result', 'duplicate');
    end if;

    raise exception 'GOOGLE_PLAY_RTDN_MESSAGE_CONFLICT' using errcode = '23505';
  end if;

  insert into studio.google_play_rtdn_receipts (
    message_id,
    notification_kind,
    notification_type,
    event_time,
    source_subscription_ref
  ) values (
    v_message_id,
    v_kind,
    p_notification_type,
    p_event_time,
    v_subscription_ref
  );

  return jsonb_build_object('result', 'processed');
end;
$$;

revoke all on function public.zstudio_mark_google_play_rtdn_processed(text,text,integer,timestamptz,text)
from public, anon, authenticated, service_role;
grant execute on function public.zstudio_mark_google_play_rtdn_processed(text,text,integer,timestamptz,text)
to service_role;

comment on function public.zstudio_mark_google_play_rtdn_processed(text,text,integer,timestamptz,text) is
'Idempotently records one successfully handled Google Play RTDN message after provider reconciliation. The receipt contains no raw RTDN or purchase token.';
