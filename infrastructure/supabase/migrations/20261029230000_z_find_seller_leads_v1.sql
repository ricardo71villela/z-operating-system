-- ============================================================
-- Z Find — contacts vendeurs (estimation gratuite) vendus aux agences v1
--
-- Offre publique (src/services/pro-offer.js) : « Contact vendeur »
-- 49 € HT, « Contact vendeur qualifié » 79 € HT (téléphone et projet de
-- vente dans les 6 mois). Chaque contact est transmis à UNE seule agence
-- partenaire de la commune du bien : la première qui l'achète.
--
-- Règles :
--   * en vente : demandes d'estimation de propriétaires (mode 'owner')
--     qui ont coché, séparément, l'accord de mise en relation avec une
--     agence ; ni « simple curiosité », ni plus de 30 jours, ni déjà
--     attribuées ;
--   * visibles des agences actives qui ont des annonces dans la commune
--     (arrondissements de Paris, Lyon, Marseille ramenés à la ville) ;
--   * avant achat, l'agence ne voit qu'une description anonyme (commune,
--     type, surface, fourchette d'estimation, projet) : jamais le nom,
--     l'e-mail ni le téléphone ;
--   * achat : réservation 35 min (SEPA en cours : 10 jours), puis payé →
--     attribué à l'agence et transmis par e-mail (circuit existant
--     zfind_pending_estimation_forwards, api/lead-notify.js) ; abandon →
--     de nouveau en vente ;
--   * l'Admin ne peut plus attribuer à la main un contact réservé ou vendu.
-- Prolonge 20261029220000 (commandes, webhook). Idempotent.
-- ============================================================

alter table public.zfind_estimation_requests
  add column if not exists sale_order_id uuid references public.zfind_billing_orders(id) on delete set null,
  add column if not exists sale_hold_partner_id uuid references public.partners(id) on delete set null,
  add column if not exists sale_hold_expires_at timestamptz,
  add column if not exists sold_at timestamptz;
create index if not exists idx_zfind_estimations_sellable on public.zfind_estimation_requests (commune_code, created_at desc)
  where mode = 'owner' and agency_consent and status = 'new' and partner_id is null;

-- ------------------------------------------------------------ règles
-- Arrondissement → ville (zones Z Find au niveau de la ville).
create or replace function public.zfind_city_commune(p_code text)
returns text
language sql
immutable
as $$
  select case
    when p_code ~ '^751(0[1-9]|1\d|20)$' then '75056'
    when p_code ~ '^6938[1-9]$' then '69123'
    when p_code ~ '^132(0[1-9]|1[0-6])$' then '13055'
    else nullif(upper(btrim(coalesce(p_code, ''))), '') end;
$$;

create or replace function public.zfind_seller_lead_qualified(p_phone text, p_project text)
returns boolean
language sql
immutable
as $$
  select nullif(btrim(coalesce(p_phone, '')), '') is not null and p_project = 'sell_3m';
$$;

-- Communes où l'agence a des annonces (publiées, prêtes ou en validation).
create or replace function public.zfind_partner_lead_communes(p_partner uuid)
returns table (commune_code text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct public.zfind_city_commune(z.commune_code), coalesce(z.city, z.name)
    from public.representations r
    join public.listings li on li.representation_id = r.id and li.status in ('published', 'ready', 'pending_review')
    left join public.properties p on p.id = r.property_id
    left join public.developments d on d.id = coalesce(r.development_id, p.development_id)
    join public.zones_lite z on z.id = coalesce(p.zone_lite_id, d.zone_lite_id)
   where r.partner_id = p_partner and z.commune_code is not null;
$$;
revoke all on function public.zfind_partner_lead_communes(uuid) from public, anon, authenticated;

create or replace function public.zfind_seller_lead_on_sale(r public.zfind_estimation_requests)
returns boolean
language sql
stable
as $$
  select r.mode = 'owner' and r.agency_consent and r.status = 'new' and r.partner_id is null
     and r.commune_code is not null and coalesce(r.project, '') <> 'curious'
     and r.created_at > now() - interval '30 days'
     and r.sold_at is null
     and not (r.sale_hold_expires_at is not null and r.sale_hold_expires_at > now());
$$;

-- ------------------------------------------------------------ espace Partner
create or replace function public.zfind_partner_seller_leads()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_partner uuid := public.zfind_partner_me();
begin
  if v_partner is null then raise exception 'Accès réservé aux comptes agence.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'partner_status', (select status from public.partners where id = v_partner),
    'communes', coalesce((select jsonb_agg(jsonb_build_object('commune_code', c.commune_code, 'name', c.name) order by c.name) from public.zfind_partner_lead_communes(v_partner) c), '[]'::jsonb),
    -- Description anonyme seulement : jamais nom, e-mail ni téléphone.
    'available', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'created_at', r.created_at, 'place', r.place, 'commune_code', public.zfind_city_commune(r.commune_code),
               'type', r.property->>'type', 'surface', r.property->>'surface', 'condition', r.property->>'condition',
               'low', r.estimate->>'low', 'high', r.estimate->>'high', 'project', r.project,
               'qualified', public.zfind_seller_lead_qualified(r.phone, r.project), 'has_phone', nullif(btrim(coalesce(r.phone, '')), '') is not null)
             order by r.created_at desc)
        from public.zfind_estimation_requests r
       where public.zfind_seller_lead_on_sale(r)
         and public.zfind_city_commune(r.commune_code) in (select c.commune_code from public.zfind_partner_lead_communes(v_partner) c)), '[]'::jsonb),
    'purchased', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'created_at', r.created_at, 'sold_at', r.sold_at, 'place', r.place,
               'line', r.property->>'line', 'low', r.estimate->>'low', 'high', r.estimate->>'high', 'project', r.project,
               'name', r.name, 'email', r.email, 'phone', r.phone, 'status', r.status,
               'qualified', public.zfind_seller_lead_qualified(r.phone, r.project))
             order by r.sold_at desc nulls last)
        from public.zfind_estimation_requests r
       where r.partner_id = v_partner and r.sale_order_id is not null and r.sold_at is not null), '[]'::jsonb),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'place', r.place, 'until', r.sale_hold_expires_at))
        from public.zfind_estimation_requests r
       where r.sale_hold_partner_id = v_partner and r.sold_at is null and r.sale_hold_expires_at > now()), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.zfind_partner_seller_leads() from public, anon;
grant execute on function public.zfind_partner_seller_leads() to authenticated;

-- ------------------------------------------------------------ serveur : réservation + commande
create or replace function public.zfind_order_seller_lead(p_partner uuid, p_request uuid, p_amount_ht_cents integer, p_qualified_amount_ht_cents integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r public.zfind_estimation_requests%rowtype;
  v_qualified boolean;
  v_kind text;
  v_amount integer;
  v_order uuid;
begin
  if (select status from public.partners where id = p_partner) <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'partner_not_active');
  end if;
  select * into r from public.zfind_estimation_requests where id = p_request for update;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'taken'); end if;
  if r.sale_hold_partner_id = p_partner and r.sale_hold_expires_at > now() and r.sold_at is null then
    return jsonb_build_object('ok', false, 'error', 'already_pending');
  end if;
  if not public.zfind_seller_lead_on_sale(r) then return jsonb_build_object('ok', false, 'error', 'taken'); end if;
  if public.zfind_city_commune(r.commune_code) not in (select c.commune_code from public.zfind_partner_lead_communes(p_partner) c) then
    return jsonb_build_object('ok', false, 'error', 'other_commune');
  end if;
  v_qualified := public.zfind_seller_lead_qualified(r.phone, r.project);
  v_kind := case when v_qualified then 'seller_lead_qualified' else 'seller_lead' end;
  v_amount := case when v_qualified then p_qualified_amount_ht_cents else p_amount_ht_cents end;
  insert into public.zfind_billing_orders (partner_id, kind, quantity, amount_ht_cents, status, details)
  values (p_partner, v_kind, 1, v_amount, 'pending', jsonb_build_object('request_id', r.id, 'place', r.place, 'project', r.project))
  returning id into v_order;
  update public.zfind_estimation_requests
     set sale_order_id = v_order, sale_hold_partner_id = p_partner, sale_hold_expires_at = now() + interval '35 minutes', updated_at = now()
   where id = r.id;
  return jsonb_build_object('ok', true, 'order_id', v_order, 'kind', v_kind, 'amount_ht_cents', v_amount, 'place', r.place, 'qualified', v_qualified);
end;
$$;
revoke all on function public.zfind_order_seller_lead(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.zfind_order_seller_lead(uuid, uuid, integer, integer) to service_role;

-- ------------------------------------------------------------ cycle de la commande (prolonge 20261029220000)
create or replace function public.zfind_order_paid(p_order uuid, p_payment_intent text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.zfind_billing_orders%rowtype;
  v_conflict boolean := false;
begin
  select * into o from public.zfind_billing_orders where id = p_order for update;
  if o.id is null then return jsonb_build_object('ok', false, 'error', 'unknown_order'); end if;
  if o.status = 'paid' then return jsonb_build_object('ok', true, 'duplicate', true, 'kind', o.kind); end if;
  update public.zfind_billing_orders set status = 'paid', paid_at = now(), stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id) where id = p_order;
  -- Payé, même si la réservation de 35 min avait expiré : l'emplacement est dû.
  update public.zfind_highlights set status = 'scheduled', hold_expires_at = null where order_id = p_order and status <> 'scheduled';
  update public.zfind_agency_features set status = 'scheduled', hold_expires_at = null where order_id = p_order and status <> 'scheduled';
  if o.kind in ('seller_lead', 'seller_lead_qualified') then
    -- Le contact revient à l'agence qui a payé, sauf s'il a été attribué entre-temps
    -- (réservation expirée puis reprise) : signalé à l'Admin pour remboursement.
    update public.zfind_estimation_requests
       set partner_id = o.partner_id, status = 'assigned', assigned_at = now(), sold_at = now(),
           sale_order_id = p_order, sale_hold_partner_id = null, sale_hold_expires_at = null,
           forwarded_at = null, forward_attempts = 0, updated_at = now()
     where id = (o.details->>'request_id')::uuid and partner_id is null and sold_at is null;
    if not found then
      v_conflict := true;
      update public.zfind_billing_orders set details = details || jsonb_build_object('conflict', 'contact déjà attribué : à rembourser') where id = p_order;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'kind', o.kind, 'partner_id', o.partner_id, 'conflict', v_conflict);
end;
$$;
revoke all on function public.zfind_order_paid(uuid, text) from public, anon, authenticated;
grant execute on function public.zfind_order_paid(uuid, text) to service_role;

create or replace function public.zfind_order_processing(p_order uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.zfind_billing_orders set status = 'processing' where id = p_order and status = 'pending';
  update public.zfind_highlights set hold_expires_at = now() + interval '10 days' where order_id = p_order and status = 'held';
  update public.zfind_agency_features set hold_expires_at = now() + interval '10 days' where order_id = p_order and status = 'held';
  update public.zfind_estimation_requests set sale_hold_expires_at = now() + interval '10 days'
   where sale_order_id = p_order and sold_at is null and sale_hold_partner_id is not null;
$$;
revoke all on function public.zfind_order_processing(uuid) from public, anon, authenticated;
grant execute on function public.zfind_order_processing(uuid) to service_role;

create or replace function public.zfind_order_released(p_order uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_status not in ('canceled', 'failed') then raise exception 'order_status' using errcode = '22023'; end if;
  update public.zfind_billing_orders set status = p_status where id = p_order and status in ('pending', 'processing');
  if found then
    update public.zfind_highlights set status = 'canceled' where order_id = p_order and status = 'held';
    update public.zfind_agency_features set status = 'canceled' where order_id = p_order and status = 'held';
    -- De nouveau en vente.
    update public.zfind_estimation_requests set sale_order_id = null, sale_hold_partner_id = null, sale_hold_expires_at = null, updated_at = now()
     where sale_order_id = p_order and sold_at is null;
  end if;
end;
$$;
revoke all on function public.zfind_order_released(uuid, text) from public, anon, authenticated;
grant execute on function public.zfind_order_released(uuid, text) to service_role;

-- ------------------------------------------------------------ Admin : pas d'attribution d'un contact réservé ou vendu
create or replace function public.zfind_admin_assign_estimation(p_id uuid, p_partner_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.zfind_estimation_requests;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_row from public.zfind_estimation_requests where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_row.sold_at is not null then
    raise exception 'sold' using errcode = '22023', hint = 'Ce contact a été acheté par une agence.';
  end if;
  if v_row.sale_hold_expires_at is not null and v_row.sale_hold_expires_at > now() then
    raise exception 'on_hold' using errcode = '22023', hint = 'Une agence est en train de payer ce contact.';
  end if;
  if p_partner_id is not null then
    if not (v_row.agency_consent and v_row.mode = 'owner') then
      raise exception 'no_consent' using errcode = '22023', hint = 'The owner did not agree to be put in touch with an agency.';
    end if;
    if not exists (select 1 from public.partners where id = p_partner_id and status = 'active') then
      raise exception 'partner_inactive' using errcode = '22023';
    end if;
  end if;
  update public.zfind_estimation_requests
     set partner_id = p_partner_id,
         status = case when p_partner_id is null then 'new' else 'assigned' end,
         assigned_at = case when p_partner_id is null then null else now() end,
         forwarded_at = case when p_partner_id is distinct from v_row.partner_id then null else forwarded_at end,
         forward_attempts = case when p_partner_id is distinct from v_row.partner_id then 0 else forward_attempts end,
         updated_at = now()
   where id = p_id
   returning * into v_row;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.zfind_admin_assign_estimation(uuid, uuid) from public, anon;
grant execute on function public.zfind_admin_assign_estimation(uuid, uuid) to authenticated;
