-- Z Find — Partner Representation policy convergence
--
-- Forward-only correction for remote migration drift:
-- the remote database still retained the historical
-- "partner: manage own representations" FOR ALL policy even though
-- the intended hardened model is read-only for Partner users.
--
-- Partner creation of Representations is exclusively owned by the
-- atomic SECURITY DEFINER create commands. Partner users may only
-- SELECT Representations belonging to their own Partner.

drop policy if exists
  "partner: manage own representations"
on public.representations;

drop policy if exists
  "partner: view own representations"
on public.representations;

create policy
  "partner: view own representations"
on public.representations
for select
to authenticated
using (
  public.is_own_partner(partner_id)
);
