-- ============================================================
-- Z Fashion — Store payouts v1 (Stripe Connect, task 12)
-- Shared ZOS database (infrastructure/supabase)
--
-- Decided 2026-10-15: every week a store receives its CLOSED sales —
-- tickets delivered more than 14 days ago with no return still open —
-- minus the Z Fashion commission computed on what the Client kept.
-- Stripe fees are paid by Z Fashion; the subscription is billed apart.
-- Mirrors fashion-domain/src/payouts.js.
--
--  1. fashion.partner_payout_accounts: the store's Stripe connected
--     account (Express) and its status, refreshed from Stripe.
--  2. fashion.partner_transfers: one row per (Order, store) once a
--     payout is attempted — processing / transferred / failed.
--  3. fashion.partner_payout_lines(): every paid ticket with its kept
--     amount, commission, net, delivery date, end of return window and
--     state (awaiting_delivery, return_window, return_in_progress,
--     due, transferred, nothing_due).
--  4. claim / complete / fail commands used by the weekly payout run:
--     a ticket is claimed (processing) before Stripe is called with an
--     idempotency key, so a ticket can never be paid twice; a failed or
--     stuck (> 1 h) attempt is retried at the next run.
-- ============================================================

create table fashion.partner_payout_accounts (
  partner_id uuid primary key references fashion.partners(id) on delete cascade,
  stripe_account_id text not null unique check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  details_submitted boolean not null default false,
  transfers_active boolean not null default false,
  payouts_enabled boolean not null default false,
  requirements_due text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table fashion.partner_payout_accounts is
  'The store''s Stripe connected account (Express, created by Z Fashion, onboarding hosted by Stripe). Status columns are a cache of Stripe, refreshed when the store or the payout run reads them.';

alter table fashion.partner_payout_accounts enable row level security;
revoke all on table fashion.partner_payout_accounts from public, anon, authenticated, service_role;

create table fashion.partner_transfers (
  order_id uuid not null references fashion.orders(id),
  partner_id uuid not null references fashion.partners(id),
  gross_minor_units integer not null check (gross_minor_units >= 0),
  refunded_minor_units integer not null check (refunded_minor_units >= 0),
  commission_rate_percent integer not null check (commission_rate_percent between 0 and 100),
  commission_minor_units integer not null check (commission_minor_units >= 0),
  net_minor_units integer not null check (net_minor_units >= 0),
  status text not null check (status in ('processing', 'transferred', 'failed')),
  stripe_account_id text,
  stripe_transfer_id text unique,
  failure text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  transferred_at timestamptz,
  primary key (order_id, partner_id),
  foreign key (order_id, partner_id) references fashion.order_tickets(order_id, partner_id),
  check (status <> 'transferred' or (stripe_transfer_id is not null and transferred_at is not null))
);

create index idx_fashion_partner_transfers_partner on fashion.partner_transfers(partner_id, created_at desc);

comment on table fashion.partner_transfers is
  'One payout per (Order, store). Written when the weekly run claims a due ticket; never deleted. Amounts are frozen at claim time.';

alter table fashion.partner_transfers enable row level security;
revoke all on table fashion.partner_transfers from public, anon, authenticated, service_role;

-- Every paid ticket with its payout state (payouts.js payoutLine()).
create or replace function fashion.partner_payout_lines(
  p_partner_id uuid default null,
  p_now timestamptz default now()
)
returns table (
  order_id uuid,
  partner_id uuid,
  order_created_at timestamptz,
  gross_minor_units integer,
  refunded_minor_units integer,
  kept_minor_units integer,
  commission_rate_percent integer,
  commission_minor_units integer,
  net_minor_units integer,
  delivered_at timestamptz,
  eligible_at timestamptz,
  open_returns integer,
  state text,
  transfer_status text,
  stripe_transfer_id text,
  transferred_at timestamptz
)
language sql
stable
set search_path = pg_catalog
as $$
  with base as (
    select
      t.order_id, t.partner_id, o.created_at as order_created_at, o.status as order_status,
      t.subtotal_minor_units as gross,
      coalesce((select sum(r.refunded_minor_units) from fashion.returns r
                where r.order_id = t.order_id and r.partner_id = t.partner_id and r.status = 'refunded'), 0)::integer as refunded,
      (select count(*) from fashion.returns r
        where r.order_id = t.order_id and r.partner_id = t.partner_id
          and r.status in ('requested', 'approved', 'in_transit'))::integer as open_returns,
      s.delivered_at,
      pt.status as transfer_status, pt.stripe_transfer_id, pt.transferred_at,
      pt.gross_minor_units as t_gross, pt.refunded_minor_units as t_refunded,
      pt.commission_rate_percent as t_rate, pt.commission_minor_units as t_commission, pt.net_minor_units as t_net
    from fashion.order_tickets t
    join fashion.orders o on o.id = t.order_id
    left join fashion.shipments s on s.order_id = t.order_id and s.partner_id = t.partner_id and s.status = 'delivered'
    left join fashion.partner_transfers pt on pt.order_id = t.order_id and pt.partner_id = t.partner_id
    where o.status in ('paid', 'fulfilling', 'fulfilled', 'partially_refunded', 'refunded')
      and (p_partner_id is null or t.partner_id = p_partner_id)
  ),
  amounts as (
    select b.*,
      -- A whole-Order refund leaves the store nothing to receive.
      case when b.order_status = 'refunded' then b.gross else least(b.refunded, b.gross) end as refunded_eff
    from base b
  ),
  computed as (
    select a.*,
      (a.gross - a.refunded_eff) as kept,
      fashion.ticket_commission_rate_percent((a.gross - a.refunded_eff)::bigint) as rate,
      fashion.ticket_commission_owed_minor_units((a.gross - a.refunded_eff)::bigint)::integer as commission,
      a.delivered_at + interval '14 days' as eligible
    from amounts a
  )
  select
    c.order_id, c.partner_id, c.order_created_at,
    coalesce(c.t_gross, c.gross),
    coalesce(c.t_refunded, c.refunded_eff),
    coalesce(c.t_gross - c.t_refunded, c.kept),
    coalesce(c.t_rate, c.rate),
    coalesce(c.t_commission, c.commission),
    coalesce(c.t_net, c.kept - c.commission),
    c.delivered_at,
    c.eligible,
    c.open_returns,
    case
      when c.transfer_status = 'transferred' then 'transferred'
      when c.delivered_at is null then 'awaiting_delivery'
      when c.eligible > p_now then 'return_window'
      when c.open_returns > 0 then 'return_in_progress'
      when (c.kept - c.commission) <= 0 then 'nothing_due'
      else 'due'
    end,
    c.transfer_status, c.stripe_transfer_id, c.transferred_at
  from computed c
  order by c.order_created_at desc, c.partner_id;
$$;

comment on function fashion.partner_payout_lines(uuid, timestamptz) is
  'Mirrors payouts.js payoutLine(): kept = ticket - refunded returns (whole Order refunded = nothing kept), commission by ticket tier on kept, net = kept - commission; due 14 days after delivery with no open return.';

-- Claims one due ticket for payout. Returns null when nothing is to be
-- paid now; otherwise the frozen amounts, destination and the Order's
-- PaymentIntent (whose charge funds the transfer).
create or replace function fashion.claim_partner_transfer(p_order_id uuid, p_partner_id uuid)
returns jsonb
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_line record;
  v_account fashion.partner_payout_accounts%rowtype;
  v_existing fashion.partner_transfers%rowtype;
  v_pi text;
  v_attempt integer;
begin
  -- Serialise claims on this ticket.
  perform 1 from fashion.order_tickets where order_id = p_order_id and partner_id = p_partner_id for update;
  if not found then
    raise exception 'claim_partner_transfer: no ticket for order % and store %', p_order_id, p_partner_id;
  end if;

  select * into v_existing from fashion.partner_transfers where order_id = p_order_id and partner_id = p_partner_id;
  if found and (v_existing.status = 'transferred'
                or (v_existing.status = 'processing' and v_existing.updated_at > now() - interval '1 hour')) then
    return null;
  end if;

  select * into v_line from fashion.partner_payout_lines(p_partner_id) l where l.order_id = p_order_id;
  if not found or v_line.state <> 'due' then
    return null;
  end if;

  select * into v_account from fashion.partner_payout_accounts where partner_id = p_partner_id;
  if not found or not v_account.transfers_active then
    return null;
  end if;

  select stripe_payment_intent_id into v_pi from fashion.orders where id = p_order_id;

  insert into fashion.partner_transfers (
    order_id, partner_id, gross_minor_units, refunded_minor_units, commission_rate_percent,
    commission_minor_units, net_minor_units, status, stripe_account_id, attempts
  ) values (
    p_order_id, p_partner_id, v_line.gross_minor_units, v_line.refunded_minor_units, v_line.commission_rate_percent,
    v_line.commission_minor_units, v_line.net_minor_units, 'processing', v_account.stripe_account_id, 1
  )
  on conflict (order_id, partner_id) do update set
    gross_minor_units = excluded.gross_minor_units,
    refunded_minor_units = excluded.refunded_minor_units,
    commission_rate_percent = excluded.commission_rate_percent,
    commission_minor_units = excluded.commission_minor_units,
    net_minor_units = excluded.net_minor_units,
    status = 'processing',
    stripe_account_id = excluded.stripe_account_id,
    failure = null,
    attempts = fashion.partner_transfers.attempts + 1,
    updated_at = now()
  returning attempts into v_attempt;

  return jsonb_build_object(
    'orderId', p_order_id,
    'partnerId', p_partner_id,
    'netMinorUnits', v_line.net_minor_units,
    'stripeAccountId', v_account.stripe_account_id,
    'paymentIntentId', v_pi,
    'attempt', v_attempt
  );
end;
$$;

create or replace function fashion.complete_partner_transfer(p_order_id uuid, p_partner_id uuid, p_stripe_transfer_id text)
returns void
language plpgsql
set search_path = pg_catalog
as $$
begin
  if p_stripe_transfer_id is null or p_stripe_transfer_id !~ '^tr_[A-Za-z0-9]+$' then
    raise exception 'complete_partner_transfer: invalid transfer id';
  end if;
  update fashion.partner_transfers
    set status = 'transferred', stripe_transfer_id = p_stripe_transfer_id, transferred_at = now(), failure = null, updated_at = now()
    where order_id = p_order_id and partner_id = p_partner_id and status in ('processing', 'failed');
  if not found then
    raise exception 'complete_partner_transfer: no claimed payout for order % and store %', p_order_id, p_partner_id;
  end if;
end;
$$;

create or replace function fashion.fail_partner_transfer(p_order_id uuid, p_partner_id uuid, p_failure text)
returns void
language plpgsql
set search_path = pg_catalog
as $$
begin
  update fashion.partner_transfers
    set status = 'failed', failure = left(coalesce(p_failure, 'unknown'), 200), updated_at = now()
    where order_id = p_order_id and partner_id = p_partner_id and status = 'processing';
end;
$$;

revoke all on function fashion.partner_payout_lines(uuid, timestamptz) from public, anon, authenticated;
revoke all on function fashion.claim_partner_transfer(uuid, uuid) from public, anon, authenticated;
revoke all on function fashion.complete_partner_transfer(uuid, uuid, text) from public, anon, authenticated;
revoke all on function fashion.fail_partner_transfer(uuid, uuid, text) from public, anon, authenticated;
