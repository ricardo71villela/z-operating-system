-- ============================================================
-- Z FIND — Partner media asset bootstrap SELECT convergence v1
--
-- Runtime E2E finding:
--
-- Partner upload flow:
--   1. upload Storage object under an owned path;
--   2. INSERT media_assets ... RETURNING/SELECT id;
--   3. INSERT listing_media/development_media association.
--
-- The Partner INSERT policy on media_assets already validates the
-- owner through original_storage_path.
--
-- The previous Partner SELECT policy exposed media_assets only
-- after an association already existed. PostgREST applies SELECT
-- RLS to INSERT ... RETURNING, creating a bootstrap cycle:
--
--   media_asset id required to create association
--   association required to SELECT returned media_asset id
--
-- Convergence:
-- Preserve linked-asset visibility and additionally expose metadata
-- when original_storage_path itself belongs to an owner controlled
-- by the authenticated Partner.
--
-- No anon expansion.
-- No INSERT/UPDATE/DELETE expansion.
-- No Storage policy change.
-- No Z Mobility / vehicle-images change.
-- ============================================================

drop policy if exists "partner: view own media assets"
  on public.media_assets;

create policy "partner: view own media assets"
on public.media_assets
for select
to authenticated
using (
  public.zfind_partner_can_manage_media_path(
    original_storage_path
  )
  or
  exists (
    select 1
    from public.listing_media lm
    where lm.media_asset_id = media_assets.id
      and public.zfind_partner_controls_listing(
        lm.listing_id
      )
  )
  or
  exists (
    select 1
    from public.development_media dm
    where dm.media_asset_id = media_assets.id
      and public.zfind_partner_owns_development(
        dm.development_id
      )
  )
);
