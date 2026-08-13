begin;

-- ============================================================
-- Z FIND — RENTAL MARKET FOUNDATION V1
--
-- Commercial axes remain deliberately independent:
--
--   transaction_type = sale | rent
--   channel          = standard | offmarket
--
-- `channel` remains a distribution/exposure concept and MUST
-- NOT be overloaded with transaction intent.
--
-- `rental_period` is meaningful only for rent Listings.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Explicit transaction intent
-- ------------------------------------------------------------

alter table public.listings
  add column transaction_type text;


-- Preserve any historical semantic signal:
-- a pre-existing rental_period means the Listing was already
-- expressing rental behaviour; everything else converges to sale.

update public.listings
set transaction_type =
  case
    when rental_period is not null then 'rent'
    else 'sale'
  end
where transaction_type is null;


alter table public.listings
  alter column transaction_type
  set default 'sale';


alter table public.listings
  alter column transaction_type
  set not null;


alter table public.listings
  add constraint listings_transaction_type_check
  check (
    transaction_type in (
      'sale',
      'rent'
    )
  );


-- ------------------------------------------------------------
-- 2. Rental semantic invariant
--
-- sale -> rental_period MUST be null
-- rent -> rental_period MUST be present
--
-- Existing rental_period CHECK continues to own its vocabulary:
-- monthly | seasonal | yearly.
-- ------------------------------------------------------------

alter table public.listings
  add constraint listings_transaction_rental_period_shape
  check (
    (
      transaction_type = 'sale'
      and rental_period is null
    )
    or
    (
      transaction_type = 'rent'
      and rental_period is not null
    )
  );


comment on column public.listings.transaction_type is
  'Commercial transaction intent for a Z Find Listing: sale or rent. Independent from channel, which remains standard/offmarket distribution.';


comment on column public.listings.rental_period is
  'Rental price period. Required when transaction_type=rent and forbidden when transaction_type=sale.';


-- ------------------------------------------------------------
-- 3. Search support
-- ------------------------------------------------------------

create index if not exists
  idx_zfind_listings_transaction_status
on public.listings (
  transaction_type,
  status
);


-- ------------------------------------------------------------
-- 4. Partner commercial-edit boundary
--
-- Partner already has an ownership-scoped UPDATE RLS policy
-- over Listings plus explicit column-level UPDATE grants.
--
-- transaction_type belongs to that same commercial surface.
-- Lifecycle, representation ownership and structural authority
-- remain unchanged.
-- ------------------------------------------------------------

grant update (
  transaction_type
)
on public.listings
to authenticated;


commit;
