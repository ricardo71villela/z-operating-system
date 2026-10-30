-- ============================================================
-- Z Find — fotografias dos anúncios : 20 no máximo, tratamento no servidor v1
--
-- 1. 20 fotografias no máximo por anúncio (listing_media) e por
--    programa (development_media), verificado pela própria base
--    (declencheur), qualquer que seja a origem : espaço Partner,
--    Admin, importação, fluxo automático.
-- 2. Bucket « listing-media » : só imagens, 30 MB no máximo por
--    ficheiro enviado (o original é tratado pelo servidor e depois
--    apagado ; o que fica guardado pesa tipicamente 200 a 600 KB).
-- 3. zfind_media_upload_check : o servidor (/api/media/photo) pergunta,
--    com a sessão de quem envia, se ela pode juntar uma foto a este
--    anúncio / programa e quantas já existem.
-- Idempotent, sem supressão.
-- ============================================================

create or replace function public.zfind_media_max_per_owner()
returns integer language sql immutable set search_path = '' as $$ select 20 $$;

-- ------------------------------------------------------------ 1. limite (base)
create or replace function public.zfind_media_limit_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_count integer;
begin
  if tg_table_name = 'listing_media' then
    v_owner := new.listing_id;
    perform pg_advisory_xact_lock(hashtext('zfind_media:' || v_owner::text));
    select count(*) into v_count from public.listing_media where listing_id = v_owner;
  else
    v_owner := new.development_id;
    perform pg_advisory_xact_lock(hashtext('zfind_media:' || v_owner::text));
    select count(*) into v_count from public.development_media where development_id = v_owner;
  end if;
  if v_count >= public.zfind_media_max_per_owner() then
    raise exception 'media_limit' using errcode = 'P0001',
      hint = format('%s photos au maximum par annonce.', public.zfind_media_max_per_owner());
  end if;
  return new;
end;
$$;
revoke all on function public.zfind_media_limit_check() from public, anon, authenticated;

drop trigger if exists zfind_listing_media_limit on public.listing_media;
create trigger zfind_listing_media_limit before insert on public.listing_media
  for each row execute function public.zfind_media_limit_check();
drop trigger if exists zfind_development_media_limit on public.development_media;
create trigger zfind_development_media_limit before insert on public.development_media
  for each row execute function public.zfind_media_limit_check();

-- ------------------------------------------------------------ 2. bucket
update storage.buckets
   set file_size_limit = 31457280,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/tiff', 'image/heic', 'image/heif', 'image/svg+xml']
 where id = 'listing-media';

-- ------------------------------------------------------------ 3. contrôle avant traitement (session de l'expéditeur)
create or replace function public.zfind_media_upload_check(p_kind text, p_owner uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
  v_count integer;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  if p_kind = 'listing' then
    v_allowed := public.is_admin() or public.zfind_partner_controls_listing(p_owner);
    select count(*) into v_count from public.listing_media where listing_id = p_owner;
  elsif p_kind = 'development' then
    v_allowed := public.is_admin() or public.zfind_partner_owns_development(p_owner);
    select count(*) into v_count from public.development_media where development_id = p_owner;
  else
    return jsonb_build_object('ok', false, 'error', 'kind');
  end if;
  if not coalesce(v_allowed, false) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v_count >= public.zfind_media_max_per_owner() then
    return jsonb_build_object('ok', false, 'error', 'media_limit', 'count', v_count, 'max', public.zfind_media_max_per_owner());
  end if;
  return jsonb_build_object('ok', true, 'count', v_count, 'max', public.zfind_media_max_per_owner(), 'admin', public.is_admin());
end;
$$;
revoke all on function public.zfind_media_upload_check(text, uuid) from public, anon;
grant execute on function public.zfind_media_upload_check(text, uuid) to authenticated;
