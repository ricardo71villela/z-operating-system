-- ============================================================
-- Z FIND — server functions (alerts, reviews, daily job): table privileges
-- ============================================================
-- In this project the service_role has no default privileges on public
-- tables, so the server functions using the secret key got
-- "permission denied" (42501). Grant exactly what they use:
--   - full access to the two alert/review tables (server-only tables);
--   - read access to the published inventory and the enquiries, used to
--     match search alerts and to verify that a reviewer really contacted
--     the agency.
-- Nothing changes for anon / authenticated.
-- ============================================================

grant select, insert, update, delete on public.zfind_alert_subscriptions to service_role;
grant select, insert, update, delete on public.zfind_partner_reviews to service_role;

grant select on public.properties, public.zones_lite, public.representations,
  public.listings, public.listing_content, public.partners, public.leads
  to service_role;
