-- ============================================================
-- Z Fashion — Payment (Stripe) v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Mirrors payment.js: closes ponto 1 of the "o que falta" review
-- (2026-08-21) — Payment had been deliberately left open in
-- ACCOUNT-AND-IDENTITY.md pending a PSP decision. Stripe confirmed.
-- Configured the same way Z Studio's platform billing adapters and
-- Z Jobs's billing.ts were: the real shape exists and is ready, the
-- live/production connection (real STRIPE_SECRET_KEY,
-- STRIPE_WEBHOOK_SECRET, leaving test mode) is a deliberate, separate
-- "go live" step this migration does not perform.
--
-- PCI-DSS boundary, non-negotiable: no column here ever holds raw card
-- data. Every *_id column is an opaque Stripe-issued reference —
-- meaningless without a live Stripe account to resolve it, never
-- reconstructable into a card number on its own.
-- ============================================================

create type fashion.payment_status as enum (
  'requires_payment_method', 'requires_confirmation', 'processing',
  'succeeded', 'failed', 'refunded'
);

alter table fashion.orders add column stripe_payment_intent_id text;
alter table fashion.orders add column stripe_customer_id text;
alter table fashion.orders add column payment_status fashion.payment_status not null default 'requires_payment_method';
alter table fashion.orders add column payment_amount_minor_units integer;

comment on column fashion.orders.stripe_payment_intent_id is 'Opaque Stripe PaymentIntent id (e.g. "pi_..."). Mirrors payment.js createPaymentIntent()/attachStripePaymentIntentId(). Null until the API layer has actually called Stripe — never fabricated.';
comment on column fashion.orders.stripe_customer_id is 'Opaque Stripe Customer id (e.g. "cus_..."), reused across a Client''s future Orders once created on their first payment attempt. Never a substitute for fashion.carts.client_user_id (auth.users) — this is Stripe''s own identity for billing purposes, a separate reference.';

-- Mirrors ALLOWED_TRANSITIONS in payment.js exactly — second,
-- independent enforcement, same discipline as every other state
-- machine already mirrored in this schema.
create or replace function fashion.check_payment_status_transition() returns trigger as $$
begin
  if old.payment_status = new.payment_status then
    return new;
  end if;

  if not (
    (old.payment_status = 'requires_payment_method' and new.payment_status in ('requires_confirmation', 'processing', 'failed')) or
    (old.payment_status = 'requires_confirmation' and new.payment_status in ('processing', 'failed')) or
    (old.payment_status = 'processing' and new.payment_status in ('succeeded', 'failed')) or
    (old.payment_status = 'succeeded' and new.payment_status = 'refunded') or
    (old.payment_status = 'failed' and new.payment_status = 'requires_payment_method')
  ) then
    raise exception 'fashion.orders.payment_status: cannot move from "%" to "%"', old.payment_status, new.payment_status;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_fashion_orders_payment_status_transition
  before update on fashion.orders
  for each row
  execute function fashion.check_payment_status_transition();

comment on trigger trg_fashion_orders_payment_status_transition on fashion.orders is 'Mirrors transition()/ALLOWED_TRANSITIONS in payment.js.';

-- Standard Stripe-integration idempotency pattern: Stripe may deliver
-- the same webhook event more than once (its own documented at-least-
-- once delivery guarantee) — this table lets the webhook handler check
-- "have I already processed event evt_xyz" before acting a second time,
-- never trusting a single delivery as authoritative on its own.
create table fashion.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

comment on table fashion.stripe_webhook_events is 'Idempotency log for Stripe webhook delivery — a live webhook handler (not yet built, see PARTNER-QUALITY-SCORE-STATUS.md-style "not yet connected" note in payment.js) must insert here before acting on an event, and skip if the insert conflicts on stripe_event_id.';

alter table fashion.stripe_webhook_events enable row level security;
