-- Z Find — facturation des agences avec Stripe (v1 : abonnements ; les
-- commandes servent aussi aux mises en avant et aux contacts vendeurs).
--
-- Le serveur (api/billing.js, rôle service_role) est le seul à écrire.
-- L'agence connectée lit ses propres lignes dans l'espace Partner (RLS :
-- profiles.partner_id). Aucune donnée de carte ni d'IBAN n'est stockée ici :
-- Stripe les garde. Idempotent, sans suppression.

-- Compte de facturation d'une agence (client Stripe).
create table if not exists public.zfind_billing_accounts (
  partner_id uuid primary key references public.partners(id) on delete restrict,
  stripe_customer_id text unique,
  legal_name text,
  billing_email text,
  country text check (country in ('FR', 'BE', 'LU')),
  vat_number text,
  vat_regime text check (vat_regime in ('fr_standard', 'reverse_charge', 'franchise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Abonnement mensuel (un par agence), miroir de l'abonnement Stripe.
create table if not exists public.zfind_billing_subscriptions (
  partner_id uuid primary key references public.partners(id) on delete restrict,
  stripe_subscription_id text unique,
  status text not null default 'incomplete',
  tier text check (tier in ('essentiel', 'plus', 'pro', 'premium')),
  stripe_price_id text,
  active_listings integer,
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  payment_method_type text,
  updated_at timestamptz not null default now()
);

-- Achats ponctuels (mises en avant, agence à la une, contacts vendeurs).
create table if not exists public.zfind_billing_orders (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  kind text not null check (kind in ('highlight_7d', 'highlight_30d', 'highlight_pack', 'agency_featured_month', 'seller_lead', 'seller_lead_qualified')),
  quantity integer not null default 1 check (quantity > 0),
  amount_ht_cents integer not null check (amount_ht_cents >= 0),
  currency text not null default 'eur',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'canceled', 'refunded')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists zfind_billing_orders_partner_idx on public.zfind_billing_orders (partner_id, created_at desc);

-- Événements Stripe déjà traités (les webhooks peuvent arriver deux fois).
create table if not exists public.zfind_stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

alter table public.zfind_billing_accounts enable row level security;
alter table public.zfind_billing_subscriptions enable row level security;
alter table public.zfind_billing_orders enable row level security;
alter table public.zfind_stripe_events enable row level security;

-- Lecture par l'agence connectée de ses propres lignes.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'zfind_billing_accounts' and policyname = 'zfind_billing_accounts_own_read') then
    create policy zfind_billing_accounts_own_read on public.zfind_billing_accounts for select to authenticated
      using (partner_id = (select p.partner_id from public.profiles p where p.id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'zfind_billing_subscriptions' and policyname = 'zfind_billing_subscriptions_own_read') then
    create policy zfind_billing_subscriptions_own_read on public.zfind_billing_subscriptions for select to authenticated
      using (partner_id = (select p.partner_id from public.profiles p where p.id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'zfind_billing_orders' and policyname = 'zfind_billing_orders_own_read') then
    create policy zfind_billing_orders_own_read on public.zfind_billing_orders for select to authenticated
      using (partner_id = (select p.partner_id from public.profiles p where p.id = auth.uid()));
  end if;
end $$;

revoke all on public.zfind_billing_accounts, public.zfind_billing_subscriptions, public.zfind_billing_orders, public.zfind_stripe_events from public, anon, authenticated;
grant select on public.zfind_billing_accounts, public.zfind_billing_subscriptions, public.zfind_billing_orders to authenticated;
grant select, insert, update on public.zfind_billing_accounts, public.zfind_billing_subscriptions, public.zfind_billing_orders, public.zfind_stripe_events to service_role;

-- Nombre d'annonces publiées d'une agence (choix du palier d'abonnement).
create or replace function public.zfind_partner_active_listings(p_partner_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.listings l
  join public.representations r on r.id = l.representation_id
  where r.partner_id = p_partner_id
    and l.status = 'published';
$$;
revoke all on function public.zfind_partner_active_listings(uuid) from public, anon, authenticated;
grant execute on function public.zfind_partner_active_listings(uuid) to service_role;
