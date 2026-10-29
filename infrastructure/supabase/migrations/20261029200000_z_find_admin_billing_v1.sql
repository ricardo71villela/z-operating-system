-- Z Find — Admin « Facturation » : abonnements des agences, agences sans
-- moyen de paiement, commandes (mises en avant, agence à la une, contacts
-- vendeurs) et totaux. Lecture seule, réservée aux administrateurs (is_admin()).
-- Prérequis : 20261029140000_z_find_billing_v1. Idempotent.

-- Mode de l'abonnement Stripe (test ou réel), pour les liens vers le tableau de bord.
alter table public.zfind_billing_subscriptions add column if not exists livemode boolean;

create or replace function public.zfind_admin_billing_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_price jsonb := '{"essentiel": 99, "plus": 129, "pro": 149, "premium": 199}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé aux administrateurs.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'partner_id', s.partner_id, 'partner_name', pa.name, 'status', s.status, 'tier', s.tier,
        'price_ht', (v_price ->> s.tier)::int, 'active_listings', s.active_listings,
        'trial_end', s.trial_end, 'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end,
        'payment_method_type', s.payment_method_type, 'stripe_subscription_id', s.stripe_subscription_id,
        'legal_name', a.legal_name, 'billing_email', a.billing_email, 'country', a.country, 'vat_number', a.vat_number,
        'vat_regime', a.vat_regime, 'stripe_customer_id', a.stripe_customer_id, 'updated_at', s.updated_at, 'livemode', s.livemode
      ) order by pa.name)
        from public.zfind_billing_subscriptions s
        join public.partners pa on pa.id = s.partner_id
        left join public.zfind_billing_accounts a on a.partner_id = s.partner_id), '[]'::jsonb),
    'without_subscription', coalesce((
      select jsonb_agg(jsonb_build_object(
        'partner_id', pa.id, 'partner_name', pa.name, 'created_at', pa.created_at,
        'published', (select count(*) from public.representations r join public.listings li on li.representation_id = r.id where r.partner_id = pa.id and li.status = 'published')
      ) order by pa.created_at)
        from public.partners pa
       where pa.status = 'active'
         and not exists (select 1 from public.zfind_billing_subscriptions s where s.partner_id = pa.id and s.status in ('trialing', 'active', 'past_due', 'unpaid'))), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'partner_name', pa.name, 'kind', o.kind, 'quantity', o.quantity, 'amount_ht_cents', o.amount_ht_cents,
        'status', o.status, 'created_at', o.created_at, 'paid_at', o.paid_at, 'details', o.details
      ) order by o.created_at desc)
        from (select * from public.zfind_billing_orders order by created_at desc limit 300) o
        join public.partners pa on pa.id = o.partner_id), '[]'::jsonb),
    'totals', jsonb_build_object(
      'mrr_ht', coalesce((select sum((v_price ->> s.tier)::int) from public.zfind_billing_subscriptions s where s.status in ('active', 'past_due')), 0),
      'trialing_mrr_ht', coalesce((select sum((v_price ->> s.tier)::int) from public.zfind_billing_subscriptions s where s.status = 'trialing'), 0),
      'active', (select count(*) from public.zfind_billing_subscriptions s where s.status = 'active'),
      'trialing', (select count(*) from public.zfind_billing_subscriptions s where s.status = 'trialing'),
      'past_due', (select count(*) from public.zfind_billing_subscriptions s where s.status in ('past_due', 'unpaid')),
      'canceled', (select count(*) from public.zfind_billing_subscriptions s where s.status = 'canceled'),
      'orders_paid_month_ht_cents', coalesce((select sum(o.amount_ht_cents) from public.zfind_billing_orders o where o.status = 'paid' and o.paid_at >= date_trunc('month', now())), 0),
      'orders_paid_total_ht_cents', coalesce((select sum(o.amount_ht_cents) from public.zfind_billing_orders o where o.status = 'paid'), 0)
    )
  );
end;
$$;
revoke all on function public.zfind_admin_billing_overview() from public, anon;
grant execute on function public.zfind_admin_billing_overview() to authenticated;
