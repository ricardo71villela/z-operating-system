-- ============================================================
-- Z Fashion — Client Identity & Account v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Closes the gap found while building "Conta do Cliente" (audit
-- 2026-08-21): fashion.carts/fashion.orders carried no Client
-- identity at all — an Order could not be attributed to anyone, so
-- order history could never have existed even in principle. Mirrors
-- cart.js's emptyCart(clientUserId) requirement exactly.
--
-- Points directly at auth.users, the same minimal local-identity-
-- first pattern Z Find/Z Jobs already used for their own human
-- identity fields before a canonical zos.persons binding existed for
-- them — see ACCOUNT-AND-IDENTITY.md "Open" for what registering
-- Z Fashion as a supported domain_code in
-- 20260809213000_zos_identity_bridge_v1.sql would take; not done in
-- this migration, deliberately scoped smaller.
--
-- Also adds fashion.wishlist_items and fashion.corner_follows,
-- mirroring account.js exactly — two simple Client<->Product and
-- Client<->Partner join tables, no new architectural concept.
-- ============================================================

-- A Cart is never anonymous going forward — guest checkout is
-- explicitly out of scope for this pass (see cart.js's own
-- emptyCart() error message). Existing carts (none in any real
-- deployment yet — this vertical has not launched) would need a
-- backfill before this could be NOT NULL against live data; safe to
-- require directly here for the same reason gender/names were.
alter table fashion.carts add column client_user_id uuid not null references auth.users(id);

create index idx_fashion_carts_client on fashion.carts(client_user_id);

comment on column fashion.carts.client_user_id is 'Mirrors emptyCart(clientUserId) in cart.js. Every Order traces back to a Client through this column via cart_id — order history is a query over fashion.orders joined to this, not a separate stored concept.';

create table fashion.wishlist_items (
  client_user_id uuid not null references auth.users(id),
  product_id uuid not null references fashion.products(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (client_user_id, product_id)
);

comment on table fashion.wishlist_items is 'Mirrors account.js addWishlistItem(). Primary key on the pair makes the idempotent-add behavior structural, not just an application-level check — a second INSERT for the same pair is an upsert no-op, never a duplicate row.';

alter table fashion.wishlist_items enable row level security;

create table fashion.corner_follows (
  client_user_id uuid not null references auth.users(id),
  partner_id uuid not null references fashion.partners(id) on delete cascade,
  followed_at timestamptz not null default now(),
  primary key (client_user_id, partner_id)
);

comment on table fashion.corner_follows is 'Mirrors account.js followCorner(). Same idempotent-pair-primary-key discipline as wishlist_items.';

alter table fashion.corner_follows enable row level security;

create index idx_fashion_wishlist_client on fashion.wishlist_items(client_user_id);
create index idx_fashion_corner_follows_client on fashion.corner_follows(client_user_id);
