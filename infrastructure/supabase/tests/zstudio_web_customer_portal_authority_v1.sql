begin;
insert into auth.users(id,email) values('b1000000-0000-4000-8000-000000000001','portal@test');
set role authenticated; select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',false); select public.zstudio_ensure_account(); reset role;
do $$ declare p uuid; begin select id into p from zos.persons where auth_user_id='b1000000-0000-4000-8000-000000000001'; insert into studio.billing_customer_bindings(person_id,billing_source,billing_provider,billing_environment,source_customer_ref) values(p,'web','stripe','production','cus_ZStudioPortalTest'); perform set_config('zstudio.portal.p',p::text,false); end $$;
do $$ begin if has_function_privilege('authenticated','public.zstudio_get_web_stripe_customer_for_portal(uuid,text)','EXECUTE') then raise exception 'authenticated can resolve customer'; end if; end $$;
set role service_role;
do $$ declare x jsonb; begin x:=public.zstudio_get_web_stripe_customer_for_portal(current_setting('zstudio.portal.p')::uuid,'production'); if x->>'source_customer_ref'<>'cus_ZStudioPortalTest' then raise exception 'wrong customer'; end if; end $$; reset role;
select 'ZSTUDIO_WEB_CUSTOMER_PORTAL_POSTGRES_AUTHORITY=PASS';
rollback;
