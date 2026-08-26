begin;

do $$ begin
  if has_function_privilege('authenticated','public.zstudio_prepare_apple_purchase(uuid,text,text,text)','EXECUTE') then raise exception 'authenticated can execute Apple preflight'; end if;
  if not has_function_privilege('service_role','public.zstudio_prepare_apple_purchase(uuid,text,text,text)','EXECUTE') then raise exception 'service role cannot execute Apple preflight'; end if;
end $$;

insert into auth.users(id,email) values('a1000000-0000-4000-8000-000000000001','apple-a@test');
set role authenticated; select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',false); select public.zstudio_ensure_account(); reset role;
do $$ declare p uuid; begin select id into p from zos.persons where auth_user_id='a1000000-0000-4000-8000-000000000001'; perform set_config('zstudio.apple.p',p::text,false); end $$;
set role service_role;
do $$ declare p uuid:=current_setting('zstudio.apple.p')::uuid; x jsonb; i uuid; begin
  x:=public.zstudio_prepare_apple_purchase(p,'monthly','production','com.zoperatingsystem.zstudio.subscription.monthly');
  if (x->>'trial_eligible')::boolean is not true then raise exception 'trial not reserved'; end if;
  i:=(x->>'intent_id')::uuid; perform set_config('zstudio.apple.i',i::text,false);
  perform public.zstudio_reconcile_apple_purchase_intent(i,p,'production','monthly','com.zoperatingsystem.zstudio.subscription.monthly','2000000000001000',true);
  perform public.zstudio_apply_verified_commercial_event(p,'apple_app_store','production','app:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','2000000000001000','com.zoperatingsystem.zstudio.subscription.monthly','trial_started','monthly','trialing',now(),now()+interval '3 days',null,null,false,now());
  perform public.zstudio_complete_apple_purchase_intent(i,p,'production','2000000000001000',true);
end $$; reset role;
do $$ declare p uuid:=current_setting('zstudio.apple.p')::uuid; begin if not exists(select 1 from studio.production_trial_authority where person_id=p and state='claimed' and claimed_billing_source='apple_app_store') then raise exception 'Apple trial not claimed'; end if; end $$;

insert into auth.users(id,email) values('a2000000-0000-4000-8000-000000000002','apple-b@test');
set role authenticated; select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000002',false); select public.zstudio_ensure_account(); reset role;
do $$ declare p uuid; begin select id into p from zos.persons where auth_user_id='a2000000-0000-4000-8000-000000000002'; perform set_config('zstudio.apple.p2',p::text,false); end $$;
set role service_role;
do $$ declare p uuid:=current_setting('zstudio.apple.p2')::uuid; begin
  begin
    perform public.zstudio_apply_verified_commercial_event(p,'apple_app_store','production','app:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','2000000000002000','com.zoperatingsystem.zstudio.subscription.weekly','trial_started','weekly','trialing',now(),now()+interval '3 days',null,null,false,now());
    raise exception 'UNPREPARED_ACCEPTED';
  exception when others then if sqlerrm='UNPREPARED_ACCEPTED' then raise; end if; if sqlerrm<>'APPLE_PURCHASE_TRIAL_PREFLIGHT_REQUIRED' then raise; end if; end;
end $$; reset role;

insert into studio.production_trial_authority(person_id,state,claimed_billing_source,claimed_source_subscription_ref,claimed_at)
select current_setting('zstudio.apple.p2')::uuid,'claimed','web','sub_prior',now();
set role service_role;
do $$ declare p uuid:=current_setting('zstudio.apple.p2')::uuid; x jsonb; begin
  x:=public.zstudio_prepare_apple_purchase(p,'annual','production','com.zoperatingsystem.zstudio.subscription.annual');
  if (x->>'trial_eligible')::boolean is not false then raise exception 'second trial offered'; end if;
end $$; reset role;

insert into auth.users(id,email) values('a3000000-0000-4000-8000-000000000003','apple-c@test');
set role authenticated; select set_config('request.jwt.claim.sub','a3000000-0000-4000-8000-000000000003',false); select public.zstudio_ensure_account(); reset role;
do $$ declare p uuid; begin select id into p from zos.persons where auth_user_id='a3000000-0000-4000-8000-000000000003'; perform set_config('zstudio.apple.p3',p::text,false); end $$;
set role service_role;
do $$ declare p uuid:=current_setting('zstudio.apple.p3')::uuid; x jsonb; begin x:=public.zstudio_prepare_apple_purchase(p,'weekly','sandbox','com.zoperatingsystem.zstudio.subscription.weekly'); if (x->>'trial_eligible')::boolean is not true then raise exception 'sandbox trial missing'; end if; end $$; reset role;
do $$ declare p uuid:=current_setting('zstudio.apple.p3')::uuid; begin if exists(select 1 from studio.production_trial_authority where person_id=p) then raise exception 'sandbox mutated production trial'; end if; end $$;

select 'ZSTUDIO_APPLE_PURCHASE_PREFLIGHT_POSTGRES_AUTHORITY=PASS';
rollback;
