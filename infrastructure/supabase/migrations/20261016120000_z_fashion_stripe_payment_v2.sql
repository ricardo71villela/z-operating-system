-- ============================================================
-- Z Fashion — Stripe payment v2 (task 11 of the launch list)
-- Shared ZOS database (infrastructure/supabase)
--
-- Connects a pending-payment Order (checkout_v2) to a Stripe
-- PaymentIntent and lets the Stripe webhook move it to paid.
--
--  1. One PaymentIntent per Order (unique stripe_payment_intent_id).
--  2. fashion.start_order_payment(): the Client opens the payment
--     form. Refused unless the Order is pending_payment and its hold
--     has not run out; a declined payment can be retried; the hold is
--     extended to at least 15 minutes from now, never beyond 60
--     minutes after checkout.
--  3. fashion.record_stripe_payment_event(): one webhook event, once
--     (fashion.stripe_webhook_events), applied forward only on the
--     payment graph (payment.js applyPaymentEvent()). A successful
--     payment of a pending Order with the exact total runs
--     fashion.confirm_order_payment() (stock committed, one Shipment
--     per store). A payment that arrives for a cancelled Order, or for
--     another amount, is reported so the API refunds it.
--  4. fashion.mark_late_payment_refunded(): records that refund.
--
-- The webhook handler calls (3), refunds when told to, then (4), in
-- one transaction: if Stripe refuses the refund, nothing is recorded
-- and Stripe delivers the event again.
-- ============================================================

create unique index uq_fashion_orders_payment_intent
  on fashion.orders(stripe_payment_intent_id) where stripe_payment_intent_id is not null;

alter table fashion.stripe_webhook_events add column payment_intent_id text;
alter table fashion.stripe_webhook_events add column outcome text;
revoke all on table fashion.stripe_webhook_events from public, anon, authenticated, service_role;

create or replace function fashion.start_order_payment(p_order_id uuid)
returns text
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_order fashion.orders%rowtype;
begin
  select * into v_order from fashion.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using detail = p_order_id::text;
  end if;
  if v_order.status <> 'pending_payment'
     or v_order.payment_expires_at is null
     or (v_order.payment_expires_at <= now() and v_order.payment_status not in ('processing', 'succeeded')) then
    raise exception 'order_not_payable' using detail = v_order.status;
  end if;
  if v_order.payment_status in ('processing', 'succeeded') then
    raise exception 'payment_in_progress' using detail = p_order_id::text;
  end if;
  if v_order.payment_status = 'failed' then
    update fashion.orders set payment_status = 'requires_payment_method' where id = p_order_id;
  end if;
  update fashion.orders
    set payment_expires_at = least(
      created_at + interval '60 minutes',
      greatest(payment_expires_at, now() + interval '15 minutes'))
    where id = p_order_id;
  return v_order.stripe_payment_intent_id;
end;
$$;

comment on function fashion.start_order_payment(uuid) is
  'Client opens the payment form: checks the Order can be paid, resets a declined payment, extends the hold (>= 15 min from now, <= 60 min after checkout). Returns the existing PaymentIntent id or null.';

create or replace function fashion.attach_payment_intent(p_order_id uuid, p_payment_intent_id text)
returns void
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_current text;
begin
  if p_payment_intent_id is null or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$' then
    raise exception 'attach_payment_intent: invalid PaymentIntent id';
  end if;
  select stripe_payment_intent_id into v_current from fashion.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using detail = p_order_id::text;
  end if;
  if v_current is not null and v_current <> p_payment_intent_id then
    raise exception 'attach_payment_intent: Order % already has PaymentIntent %', p_order_id, v_current;
  end if;
  update fashion.orders set stripe_payment_intent_id = p_payment_intent_id where id = p_order_id;
end;
$$;

-- Applies one Stripe PaymentIntent event. Returns the outcome:
-- duplicate | unknown_payment_intent | processing | failed | ignored |
-- confirmed | already_recorded | late_payment | amount_mismatch.
-- late_payment and amount_mismatch mean: refund this PaymentIntent.
create or replace function fashion.record_stripe_payment_event(
  p_event_id text,
  p_event_type text,
  p_payment_intent_id text,
  p_order_id uuid,
  p_status text,
  p_amount_received integer
)
returns text
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_order fashion.orders%rowtype;
  v_steps text[];
  v_step text;
  v_outcome text;
begin
  if p_status not in ('processing', 'succeeded', 'failed') then
    raise exception 'record_stripe_payment_event: unsupported status %', p_status;
  end if;

  insert into fashion.stripe_webhook_events (stripe_event_id, event_type, payment_intent_id)
  values (p_event_id, p_event_type, p_payment_intent_id)
  on conflict (stripe_event_id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  select * into v_order from fashion.orders where stripe_payment_intent_id = p_payment_intent_id for update;
  if not found and p_order_id is not null then
    -- PaymentIntent created but its id not saved (API stopped in between): match on metadata.order_id.
    select * into v_order from fashion.orders
    where id = p_order_id and stripe_payment_intent_id is null for update;
    if found then
      update fashion.orders set stripe_payment_intent_id = p_payment_intent_id where id = v_order.id;
    end if;
  end if;
  if v_order.id is null then
    update fashion.stripe_webhook_events set outcome = 'unknown_payment_intent' where stripe_event_id = p_event_id;
    return 'unknown_payment_intent';
  end if;

  -- Forward-only path (payment.js pathTo()).
  v_steps := case p_status
    when 'processing' then case when v_order.payment_status in ('requires_payment_method', 'requires_confirmation')
                                then array['processing'] else array[]::text[] end
    when 'failed' then case when v_order.payment_status in ('requires_payment_method', 'requires_confirmation', 'processing')
                            then array['failed'] else array[]::text[] end
    else case v_order.payment_status
      when 'requires_payment_method' then array['processing', 'succeeded']
      when 'requires_confirmation' then array['processing', 'succeeded']
      when 'processing' then array['succeeded']
      when 'failed' then array['requires_payment_method', 'processing', 'succeeded']
      else array[]::text[] end
  end;

  foreach v_step in array v_steps loop
    update fashion.orders set payment_status = v_step::fashion.payment_status where id = v_order.id;
  end loop;

  if p_status <> 'succeeded' then
    v_outcome := case when cardinality(v_steps) > 0 then p_status else 'ignored' end;
  elsif cardinality(v_steps) = 0 then
    v_outcome := 'already_recorded';
  else
    update fashion.orders set payment_amount_minor_units = p_amount_received where id = v_order.id;
    if v_order.status = 'cancelled' then
      v_outcome := 'late_payment';
    elsif v_order.status <> 'pending_payment' then
      v_outcome := 'already_recorded';
    elsif p_amount_received is distinct from v_order.total_minor_units then
      v_outcome := 'amount_mismatch';
    else
      perform fashion.confirm_order_payment(v_order.id);
      v_outcome := 'confirmed';
    end if;
  end if;

  update fashion.stripe_webhook_events set outcome = v_outcome where stripe_event_id = p_event_id;
  return v_outcome;
end;
$$;

comment on function fashion.record_stripe_payment_event(text, text, text, uuid, text, integer) is
  'Mirrors payment.js applyPaymentEvent(): one Stripe event once, forward-only on the payment graph; confirms a pending Order paid with its exact total; reports late_payment / amount_mismatch for the API to refund.';

-- A payment that could not be kept (Order cancelled, wrong amount) was refunded by Stripe.
create or replace function fashion.mark_late_payment_refunded(p_payment_intent_id text)
returns void
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_order fashion.orders%rowtype;
begin
  select * into v_order from fashion.orders where stripe_payment_intent_id = p_payment_intent_id for update;
  if not found then
    raise exception 'order_not_found' using detail = p_payment_intent_id;
  end if;
  if v_order.status = 'pending_payment' then
    -- Wrong amount on a still-pending Order: it is not paid, release its stock.
    perform fashion.cancel_pending_order(v_order.id);
  elsif v_order.status <> 'cancelled' then
    raise exception 'mark_late_payment_refunded: Order % is %, use the refund workflow', v_order.id, v_order.status;
  end if;
  if v_order.payment_status = 'succeeded' then
    update fashion.orders set payment_status = 'refunded' where id = v_order.id;
  end if;
end;
$$;

revoke all on function fashion.start_order_payment(uuid) from public, anon, authenticated;
revoke all on function fashion.attach_payment_intent(uuid, text) from public, anon, authenticated;
revoke all on function fashion.record_stripe_payment_event(text, text, text, uuid, text, integer) from public, anon, authenticated;
revoke all on function fashion.mark_late_payment_refunded(text) from public, anon, authenticated;
