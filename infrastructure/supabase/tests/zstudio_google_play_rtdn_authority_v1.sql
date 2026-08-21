-- Z Studio Google Play RTDN authority v1
-- Disposable PostgreSQL verification only. Entire fixture is rolled back.

begin;

insert into auth.users (id, email) values
  ('77777777-7777-4777-8777-777777777777', 'google-rtdn-a@example.test'),
  ('88888888-8888-4888-8888-888888888888', 'google-rtdn-b@example.test');

set role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', false);
select public.zstudio_ensure_account();
select set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', false);
select public.zstudio_ensure_account();
reset role;

do $$
declare
  v_a uuid;
  v_b uuid;
begin
  select p.id into strict v_a from zos.persons p
  where p.auth_user_id = '77777777-7777-4777-8777-777777777777';
  select p.id into strict v_b from zos.persons p
  where p.auth_user_id = '88888888-8888-4888-8888-888888888888';
  perform set_config('zstudio.test.rtdn_person_a', v_a::text, false);
  perform set_config('zstudio.test.rtdn_person_b', v_b::text, false);
end;
$$;

-- Browser roles cannot access any RTDN authority RPC.
do $$
declare
  v_resolve oid := to_regprocedure('public.zstudio_resolve_google_play_rtdn_identity(text,text,uuid,text,boolean)')::oid;
  v_check oid := to_regprocedure('public.zstudio_google_play_rtdn_is_processed(text)')::oid;
  v_mark oid := to_regprocedure('public.zstudio_mark_google_play_rtdn_processed(text,text,integer,timestamptz,text)')::oid;
begin
  if v_resolve is null or v_check is null or v_mark is null then
    raise exception 'Google Play RTDN authority RPC missing';
  end if;
  if has_function_privilege('anon', v_resolve, 'EXECUTE')
     or has_function_privilege('authenticated', v_resolve, 'EXECUTE')
     or has_function_privilege('anon', v_check, 'EXECUTE')
     or has_function_privilege('authenticated', v_check, 'EXECUTE')
     or has_function_privilege('anon', v_mark, 'EXECUTE')
     or has_function_privilege('authenticated', v_mark, 'EXECUTE') then
    raise exception 'Browser role can execute Google Play RTDN authority';
  end if;
  if not has_function_privilege('service_role', v_resolve, 'EXECUTE')
     or not has_function_privilege('service_role', v_check, 'EXECUTE')
     or not has_function_privilege('service_role', v_mark, 'EXECUTE') then
    raise exception 'service_role cannot execute Google Play RTDN authority';
  end if;
end;
$$;

-- Existing provider binding wins and works without optional external account id.
set role service_role;
do $$
declare
  v_person uuid := current_setting('zstudio.test.rtdn_person_a')::uuid;
  v_result jsonb;
begin
  v_result := public.zstudio_apply_verified_commercial_event(
    v_person,
    'google_play',
    'sandbox',
    'google:play:event:rtdn-fixture-active:snapshot:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'google:play:purchase:1111111111111111111111111111111111111111111111111111111111111111',
    'google:play:product:zstudio.access:base_plan:monthly',
    'activated',
    'monthly',
    'active',
    null,
    null,
    now() - interval '1 day',
    now() + interval '29 days',
    false,
    now() - interval '1 hour'
  );
  if v_result ->> 'result' <> 'applied' then
    raise exception 'RTDN existing subscription fixture failed';
  end if;

  v_result := public.zstudio_resolve_google_play_rtdn_identity(
    'sandbox',
    'google:play:purchase:1111111111111111111111111111111111111111111111111111111111111111',
    null,
    'monthly',
    false
  );
  if v_result ->> 'result' <> 'resolved'
     or (v_result ->> 'person_id')::uuid <> v_person
     or not (v_result ->> 'existing_subscription')::boolean then
    raise exception 'RTDN existing provider identity did not resolve';
  end if;
end;
$$;

-- Wrong optional external account id cannot rebind an existing provider chain.
do $$
declare
  v_other uuid := current_setting('zstudio.test.rtdn_person_b')::uuid;
begin
  begin
    perform public.zstudio_resolve_google_play_rtdn_identity(
      'sandbox',
      'google:play:purchase:1111111111111111111111111111111111111111111111111111111111111111',
      v_other,
      'monthly',
      false
    );
    raise exception 'TEST_RTDN_REBIND_ACCEPTED';
  exception when others then
    if sqlerrm = 'TEST_RTDN_REBIND_ACCEPTED' then raise; end if;
    if sqlerrm <> 'GOOGLE_PLAY_RTDN_EXTERNAL_IDENTITY_CONFLICT' then raise; end if;
  end;
end;
$$;
reset role;

-- Production trial RTDN can race device reconcile but only when the exact person
-- already has a global Google purchase preflight reservation.
set role service_role;
do $$
declare
  v_person uuid := current_setting('zstudio.test.rtdn_person_b')::uuid;
  v_prepared jsonb;
  v_resolved jsonb;
begin
  v_prepared := public.zstudio_prepare_google_play_purchase(
    v_person,
    'weekly',
    'production'
  );
  if not (v_prepared ->> 'trial_eligible')::boolean then
    raise exception 'RTDN production trial fixture did not reserve trial';
  end if;

  v_resolved := public.zstudio_resolve_google_play_rtdn_identity(
    'production',
    'google:play:purchase:2222222222222222222222222222222222222222222222222222222222222222',
    v_person,
    'weekly',
    true
  );

  if (v_resolved ->> 'person_id')::uuid <> v_person
     or (v_resolved ->> 'intent_id')::uuid <> (v_prepared ->> 'intent_id')::uuid
     or (v_resolved ->> 'existing_subscription')::boolean
     or not (v_resolved ->> 'trial_reserved')::boolean then
    raise exception 'RTDN production trial did not resolve exact preflight intent';
  end if;
end;
$$;

-- A new production trial with no exact preflight is rejected.
do $$
declare
  v_person uuid := current_setting('zstudio.test.rtdn_person_a')::uuid;
begin
  begin
    perform public.zstudio_resolve_google_play_rtdn_identity(
      'production',
      'google:play:purchase:3333333333333333333333333333333333333333333333333333333333333333',
      v_person,
      'annual',
      true
    );
    raise exception 'TEST_RTDN_TRIAL_WITHOUT_PREFLIGHT_ACCEPTED';
  exception when others then
    if sqlerrm = 'TEST_RTDN_TRIAL_WITHOUT_PREFLIGHT_ACCEPTED' then raise; end if;
    if sqlerrm <> 'GOOGLE_PLAY_RTDN_TRIAL_PREFLIGHT_REQUIRED' then raise; end if;
  end;
end;
$$;

-- Dedupe is false before final success marker, then true; exact repeats are safe
-- and conflicting reuse of one Pub/Sub message id fails closed.
do $$
declare
  v_mark jsonb;
begin
  if public.zstudio_google_play_rtdn_is_processed('9000000000000001') then
    raise exception 'Fresh RTDN message unexpectedly already processed';
  end if;

  v_mark := public.zstudio_mark_google_play_rtdn_processed(
    '9000000000000001',
    'subscription',
    2,
    timestamptz '2026-08-21 00:30:00+00',
    'google:play:purchase:1111111111111111111111111111111111111111111111111111111111111111'
  );
  if v_mark ->> 'result' <> 'processed' then
    raise exception 'Fresh RTDN message was not marked processed';
  end if;
  if not public.zstudio_google_play_rtdn_is_processed('9000000000000001') then
    raise exception 'Processed RTDN message lookup remained false';
  end if;

  v_mark := public.zstudio_mark_google_play_rtdn_processed(
    '9000000000000001',
    'subscription',
    2,
    timestamptz '2026-08-21 00:30:00+00',
    'google:play:purchase:1111111111111111111111111111111111111111111111111111111111111111'
  );
  if v_mark ->> 'result' <> 'duplicate' then
    raise exception 'Exact RTDN marker duplicate was not idempotent';
  end if;

  begin
    perform public.zstudio_mark_google_play_rtdn_processed(
      '9000000000000001',
      'test',
      null,
      timestamptz '2026-08-21 00:30:00+00',
      null
    );
    raise exception 'TEST_RTDN_MESSAGE_CONFLICT_ACCEPTED';
  exception when others then
    if sqlerrm = 'TEST_RTDN_MESSAGE_CONFLICT_ACCEPTED' then raise; end if;
    if sqlerrm <> 'GOOGLE_PLAY_RTDN_MESSAGE_CONFLICT' then raise; end if;
  end;
end;
$$;
reset role;

-- Receipt ledger contains only normalized trigger metadata, never browser-readable.
do $$
begin
  if (
    select count(*)
    from studio.google_play_rtdn_receipts r
    where r.message_id = '9000000000000001'
      and r.notification_kind = 'subscription'
      and r.notification_type = 2
      and r.source_subscription_ref =
        'google:play:purchase:1111111111111111111111111111111111111111111111111111111111111111'
  ) <> 1 then
    raise exception 'RTDN receipt ledger mismatch';
  end if;
end;
$$;

-- Pending refund review is queued through the service RPC without exposing the
-- support-only queue table to service_role. Internal row contents are verified
-- only after returning to the disposable-test owner role.
set role service_role;
do $$
declare
  v_person uuid := current_setting('zstudio.test.rtdn_person_a')::uuid;
  v_result jsonb;
begin
  v_result := public.zstudio_record_google_play_pending_refund_review(
    '9000000000000002',
    'pending-refund-review-token-1',
    'GPA.REFUND-REVIEW-1',
    7,
    v_person::text,
    timestamptz '2026-08-21 00:35:00+00'
  );
  if v_result ->> 'result' <> 'recorded' then
    raise exception 'Pending refund review was not recorded';
  end if;

  begin
    perform 1
    from studio.google_play_pending_refund_reviews r
    where r.message_id = '9000000000000002';
    raise exception 'TEST_RTDN_PRIVATE_QUEUE_EXPOSED';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

do $$
declare
  v_person uuid := current_setting('zstudio.test.rtdn_person_a')::uuid;
begin
  if not exists (
    select 1
    from studio.google_play_pending_refund_reviews r
    where r.message_id = '9000000000000002'
      and r.pending_refund_token = 'pending-refund-review-token-1'
      and r.order_id = 'GPA.REFUND-REVIEW-1'
      and r.refund_reason = 7
      and r.person_id = v_person
      and r.status = 'pending_review'
      and r.review_due_at = r.event_time + interval '24 hours'
  ) then
    raise exception 'Pending refund support queue contents invalid';
  end if;
end;
$$;

select 'ZSTUDIO_GOOGLE_PLAY_RTDN_POSTGRES_AUTHORITY=PASS';
rollback;