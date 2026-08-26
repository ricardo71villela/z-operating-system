-- ============================================================
-- Z Fashion — Customer checkout HTTP authority v1
-- Forward-only source migration. No live database mutation here.
--
-- Adds a server-only idempotency authority in front of the existing
-- fashion.attempt_checkout() transaction. Browser retries must never
-- reserve stock twice or create duplicate Orders.
-- ============================================================

create table fashion.checkout_requests (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete restrict,
  cart_id uuid not null references fashion.carts(id) on delete restrict,
  idempotency_key text not null check (length(trim(idempotency_key)) between 8 and 200),
  order_id uuid references fashion.orders(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (client_user_id, idempotency_key)
);

comment on table fashion.checkout_requests is
'Server-only checkout retry authority. One authenticated Client + Idempotency-Key can resolve to at most one Cart and one Order; repeated HTTP delivery returns the original Order instead of reserving stock twice.';

alter table fashion.checkout_requests enable row level security;
create index idx_fashion_checkout_requests_cart on fashion.checkout_requests(cart_id);
create index idx_fashion_checkout_requests_order on fashion.checkout_requests(order_id) where order_id is not null;

revoke all on fashion.checkout_requests from public, anon, authenticated;
grant select, insert, update on fashion.checkout_requests to service_role;

create or replace function fashion.attempt_checkout_idempotent(
  p_client_user_id uuid,
  p_cart_id uuid,
  p_idempotency_key text
) returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $$
declare
  v_cart_client_user_id uuid;
  v_request fashion.checkout_requests%rowtype;
  v_order_id uuid;
begin
  if p_client_user_id is null then
    raise exception 'attempt_checkout_idempotent: client user id is required'
      using errcode = '22004';
  end if;
  if p_cart_id is null then
    raise exception 'attempt_checkout_idempotent: cart id is required'
      using errcode = '22004';
  end if;
  if p_idempotency_key is null
     or length(trim(p_idempotency_key)) < 8
     or length(trim(p_idempotency_key)) > 200 then
    raise exception 'attempt_checkout_idempotent: Idempotency-Key must contain 8..200 characters'
      using errcode = '22023';
  end if;

  select c.client_user_id
    into v_cart_client_user_id
  from fashion.carts c
  where c.id = p_cart_id
  for update;

  if not found or v_cart_client_user_id <> p_client_user_id then
    raise exception 'attempt_checkout_idempotent: Cart does not belong to authenticated Client'
      using errcode = '42501';
  end if;

  insert into fashion.checkout_requests (
    client_user_id,
    cart_id,
    idempotency_key
  ) values (
    p_client_user_id,
    p_cart_id,
    trim(p_idempotency_key)
  )
  on conflict (client_user_id, idempotency_key) do nothing;

  select cr.*
    into v_request
  from fashion.checkout_requests cr
  where cr.client_user_id = p_client_user_id
    and cr.idempotency_key = trim(p_idempotency_key)
  for update;

  if v_request.cart_id <> p_cart_id then
    raise exception 'attempt_checkout_idempotent: Idempotency-Key is already bound to another Cart'
      using errcode = '23514';
  end if;

  if v_request.order_id is not null then
    return v_request.order_id;
  end if;

  v_order_id := fashion.attempt_checkout(p_cart_id);

  update fashion.checkout_requests
  set order_id = v_order_id,
      completed_at = now()
  where id = v_request.id;

  return v_order_id;
end;
$$;

comment on function fashion.attempt_checkout_idempotent(uuid, uuid, text) is
'Server-only idempotent wrapper around fashion.attempt_checkout(). Verifies Cart ownership, binds one Client Idempotency-Key to one Cart, and returns the same Order on retries.';

revoke all on function fashion.attempt_checkout_idempotent(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function fashion.attempt_checkout_idempotent(uuid, uuid, text)
to service_role;
