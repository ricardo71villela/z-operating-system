-- ============================================================
-- Z Fashion — Store subscriptions v1 (Stripe Billing, task 9)
-- Shared ZOS database (infrastructure/supabase)
--
-- The monthly subscription (39 / 49 / 59 EUR excl. VAT by number of
-- categories, fashion.subscription_fee_tiers) is billed by Stripe
-- Billing, apart from the payouts. The store sets it up once on a
-- Stripe-hosted page (card or SEPA direct debit); the first month after
-- activation is free (a Stripe trial ending one month after
-- activation). Mirrors fashion-domain/src/subscription.js.
--
--  1. fashion.partners.activated_at: when the store first became
--     active (set by a trigger; existing active stores get their last
--     update date). Starts the free month.
--  2. fashion.partner_subscriptions: the store's Stripe customer and
--     subscription and a cache of its state, refreshed from Stripe on
--     every webhook event (Stripe stays the source of truth).
-- ============================================================

-- 1. Activation date

alter table fashion.partners add column activated_at timestamptz;

update fashion.partners set activated_at = updated_at
 where onboarding_status in ('active', 'suspended') and activated_at is null;

create or replace function fashion.stamp_partner_activation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.onboarding_status = 'active' and new.activated_at is null then
    new.activated_at := now();
  end if;
  return new;
end;
$$;

create trigger fashion_partners_stamp_activation
  before insert or update of onboarding_status on fashion.partners
  for each row execute function fashion.stamp_partner_activation();

revoke all on function fashion.stamp_partner_activation() from public, anon, authenticated;

comment on column fashion.partners.activated_at is
  'When the store first became active. The first month of subscription after this date is free.';

-- 2. Subscriptions

create table fashion.partner_subscriptions (
  partner_id uuid primary key references fashion.partners(id) on delete cascade,
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  stripe_subscription_id text unique check (stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  stripe_status text,
  state text not null default 'not_set_up'
    check (state in ('not_set_up', 'trial', 'active', 'past_due', 'canceled')),
  monthly_fee_minor_units integer check (monthly_fee_minor_units is null or monthly_fee_minor_units > 0),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  past_due_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fashion_partner_subscriptions_state_needs_subscription check (
    state = 'not_set_up' or stripe_subscription_id is not null
  )
);

comment on table fashion.partner_subscriptions is
  'The store''s Stripe Billing customer and subscription (monthly fee). State columns are a cache of Stripe, refreshed on webhook events; past_due_since is when payment first failed in the current incident.';

alter table fashion.partner_subscriptions enable row level security;
revoke all on table fashion.partner_subscriptions from public, anon, authenticated, service_role;
