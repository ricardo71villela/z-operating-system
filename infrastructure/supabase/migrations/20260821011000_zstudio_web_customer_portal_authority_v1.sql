-- ============================================================
-- Z Studio — Web Stripe customer portal authority v1
-- ============================================================
-- Read-only, server-only resolution of the already-bound Stripe Customer for
-- the authenticated canonical ZOS person. No browser role can read the binding.

create or replace function public.zstudio_get_web_stripe_customer_for_portal(
  p_person_id uuid,
  p_billing_environment text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_environment text := lower(trim(coalesce(p_billing_environment, '')));
  v_binding studio.billing_customer_bindings%rowtype;
begin
  if p_person_id is null then
    raise exception 'WEB_PORTAL_PERSON_REQUIRED' using errcode = '22004';
  end if;
  if v_environment not in ('sandbox','production') then
    raise exception 'WEB_PORTAL_ENVIRONMENT_INVALID' using errcode = '22023';
  end if;
  select b.* into v_binding from studio.billing_customer_bindings b
  where b.person_id = p_person_id and b.billing_source = 'web' and b.billing_provider = 'stripe'
    and b.billing_environment = v_environment and b.source_customer_ref is not null
  order by b.created_at limit 1;
  if not found then raise exception 'WEB_PORTAL_CUSTOMER_NOT_FOUND' using errcode = 'P0002'; end if;
  return jsonb_build_object('result','resolved','source_customer_ref',v_binding.source_customer_ref);
end;
$$;

revoke all on function public.zstudio_get_web_stripe_customer_for_portal(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.zstudio_get_web_stripe_customer_for_portal(uuid,text) to service_role;
comment on function public.zstudio_get_web_stripe_customer_for_portal(uuid,text) is
'Server-only resolution of the canonical Stripe Customer binding used to create a hosted Stripe Billing Portal session.';
