-- ============================================================
-- Z Fashion — Client Address v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Mirrors address.js: the last direct checkout blocker from the
-- customer-side audit's priority list (2026-08-21) — "Adresses" had
-- stayed an empty placeholder in the Account prototype until now.
-- Payment methods deliberately NOT added here — a PSP-integration
-- decision (which provider, tokenization scheme), not a pure schema
-- one; left open, same as this schema already leaves Phase 2
-- payment/shipping open elsewhere.
-- ============================================================

create type fashion.address_type as enum ('shipping', 'billing');

create table fashion.client_addresses (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id),
  type fashion.address_type not null,
  recipient_name text,
  line1 text not null check (length(trim(both from line1)) > 0),
  line2 text,
  postal_code text not null check (length(trim(both from postal_code)) > 0),
  city text not null check (length(trim(both from city)) > 0),
  country_iso text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table fashion.client_addresses is 'Mirrors address.js. country_iso is not FK-constrained to a Fashion-local table — validated at the application layer the same way partner.js validates Partner.countryIso, against the shared @zos/geography package (single source of truth for valid country codes across every ZOS vertical, not duplicated here as a second constraint table).';

alter table fashion.client_addresses enable row level security;

create policy fashion_client_addresses_own_rows on fashion.client_addresses
  for all using (client_user_id = auth.uid());

comment on policy fashion_client_addresses_own_rows on fashion.client_addresses is 'A Client only ever sees or modifies their own addresses — never another Client''s, even with RLS otherwise permissive elsewhere in this schema for public reference data.';

-- Mirrors addAddress()'s default-exclusivity rule in address.js: setting
-- is_default=true on one Address un-defaults every other Address of the
-- same Client and the same type, in the same transaction — never two
-- simultaneous defaults of one type for one Client, enforced here rather
-- than left as an application-layer-only responsibility.
create or replace function fashion.enforce_single_default_address() returns trigger as $$
begin
  if new.is_default then
    update fashion.client_addresses
    set is_default = false
    where client_user_id = new.client_user_id
      and type = new.type
      and id <> new.id
      and is_default = true;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_fashion_client_addresses_single_default
  before insert or update on fashion.client_addresses
  for each row
  execute function fashion.enforce_single_default_address();

comment on trigger trg_fashion_client_addresses_single_default on fashion.client_addresses is 'Mirrors the default-exclusivity behavior in address.js addAddress().';

create index idx_fashion_client_addresses_client on fashion.client_addresses(client_user_id);
