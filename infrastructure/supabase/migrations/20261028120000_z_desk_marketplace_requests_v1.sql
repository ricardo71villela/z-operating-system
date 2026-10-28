-- ============================================================
-- Z DESK — Demandes des marketplaces (Z Desk Lite) v1
--
-- Z Desk Lite, inclus dans l'abonnement Z Find, réunit dans une seule
-- boîte « Demandes » toutes les demandes reçues sur les annonces de
-- l'agence : demandes de contact (bouton « Contacter ») et demandes de
-- visite. L'agence répond par téléphone, e-mail ou WhatsApp en un clic,
-- puis marque la demande « traitée » ou « close » ; le statut est celui
-- de public.leads, donc l'espace agence Z Find, les rappels e-mail et
-- les statistiques de réponse restent d'accord avec Z Desk.
--
-- Le pont agence Z Find → Z Desk est celui des visites
-- (20261023100000_z_desk_zfind_visits_v1) : partners.zos_organisation_id
-- ↔ desk.workspaces.organisation_id. L'espace vient toujours de la
-- session vérifiée par le backend Z Desk (fonctions service_role).
--
-- La fonction renvoie une colonne « source » ('z_find') pour que les
-- candidatures Z Jobs rejoignent la même boîte sans changer le contrat.
-- ============================================================

-- ------------------------------------------------------------ list (service)
create or replace function public.zdesk_marketplace_requests(p_workspace_id uuid, p_status text default null)
returns table (
  source text, id uuid, kind text, status text, created_at timestamptz, responded_at timestamptz,
  name text, email text, phone text, message text,
  item_id uuid, item_title text, transaction_type text, price numeric, currency text
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'z_find'::text,
         l.id,
         case l.contact_type when 'visit' then 'visit' else 'contact' end,
         l.status, l.created_at, l.responded_at,
         l.name, l.email, l.phone, l.message,
         li.id,
         (select lc.title from public.listing_content lc
           where lc.listing_id = li.id and coalesce(btrim(lc.title), '') <> ''
           order by (lc.locale = 'fr') desc, lc.locale limit 1),
         li.transaction_type, li.price_current, li.currency_iso
    from public.leads l
    join public.listings li on li.id = l.listing_id
    join public.representations r on r.id = li.representation_id
    join public.partners pa on pa.id = r.partner_id
    join desk.workspaces w on w.organisation_id = pa.zos_organisation_id
   where w.id = p_workspace_id
     and (p_status is null or l.status = p_status)
   order by (l.status = 'new') desc, l.created_at desc
   limit 300;
$$;

revoke all on function public.zdesk_marketplace_requests(uuid, text) from public, anon, authenticated;
grant execute on function public.zdesk_marketplace_requests(uuid, text) to service_role;

-- ------------------------------------------------------------ unread count (service)
create or replace function public.zdesk_marketplace_requests_summary(p_workspace_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'new', count(*) filter (where l.status = 'new'),
    'latestAt', max(l.created_at)
  )
    from public.leads l
    join public.listings li on li.id = l.listing_id
    join public.representations r on r.id = li.representation_id
    join public.partners pa on pa.id = r.partner_id
    join desk.workspaces w on w.organisation_id = pa.zos_organisation_id
   where w.id = p_workspace_id;
$$;

revoke all on function public.zdesk_marketplace_requests_summary(uuid) from public, anon, authenticated;
grant execute on function public.zdesk_marketplace_requests_summary(uuid) to service_role;

-- ------------------------------------------------------------ status (service)
create or replace function public.zdesk_set_marketplace_request_status(
  p_workspace_id uuid,
  p_member_id uuid,
  p_source text,
  p_request_id uuid,
  p_status text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lead uuid;
begin
  if not exists (
    select 1 from desk.workspace_members
     where id = p_member_id and workspace_id = p_workspace_id and status = 'active'
  ) then
    raise exception 'Not an active member of this workspace' using errcode = '42501';
  end if;
  if p_source is distinct from 'z_find' then
    raise exception 'Unknown source' using errcode = '22023';
  end if;
  if p_status not in ('new', 'contacted', 'closed') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;

  select l.id into v_lead
    from public.leads l
    join public.listings li on li.id = l.listing_id
    join public.representations r on r.id = li.representation_id
    join public.partners pa on pa.id = r.partner_id
    join desk.workspaces w on w.organisation_id = pa.zos_organisation_id
   where l.id = p_request_id and w.id = p_workspace_id
   for update of l;
  if v_lead is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  update public.leads
     set status = p_status,
         responded_at = case when p_status = 'new' then responded_at else coalesce(responded_at, now()) end
   where id = v_lead;

  return jsonb_build_object('source', 'z_find', 'id', v_lead, 'status', p_status);
end;
$$;

revoke all on function public.zdesk_set_marketplace_request_status(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.zdesk_set_marketplace_request_status(uuid, uuid, text, uuid, text) to service_role;
