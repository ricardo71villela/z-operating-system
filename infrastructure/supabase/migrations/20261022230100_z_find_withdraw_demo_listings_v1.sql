-- Z Find — withdraw the demonstration data from the public site, v1
--
-- Production still shows the listings created for tests and demonstrations
-- (2026-07 to 2026-10). Visitors must only see real listings, so:
--   * the 7 published listings of the two demo partners are archived
--     (no longer visible: the public visibility functions require 'published');
--   * the demo partners are set to inactive.
-- Nothing is deleted: rows, media and history stay, and the change can be
-- undone (see the end of the file). Presentations keep working with the
-- site's demonstration mode (?demo=1), which never reads these rows.
--
-- Partners concerned (all created by the Z Find team):
--   694d73a3-0281-4a4c-bea8-e9c21bafcb0c  Z Find France — Agence Démo
--   8bad32e4-2aff-4b26-aaea-ab140314265b  Horizon Développement — Démo
--   23f8cb70-84b7-4764-954b-322a617f40ac  Z Teste                       (already archived)
--   a2aa9791-3cbe-4399-909c-7175ce9899e9  Z Find France QA — NON PUBLIC (already inactive)
--   63cb9894-7f9a-4c42-8843-5e3f4d7d63c5  TEST Z FIND SARL              (already inactive)
--
-- Idempotent: safe to run again.

begin;

update public.listings
   set status = 'archived'
 where status = 'published'
   and id in (
     '44766096-ced5-49a6-af5f-b504289e38d1',
     'b24eb6c5-6cc8-47ba-9dd6-a848d0d61874',
     '95d45377-9e37-400a-b9ce-98fcf8331f63',
     'f057e7a2-24e5-4551-a42c-97b971881399',
     '4cba19fe-8de9-4c70-a485-ba24bc4a1fcf',
     'e67a6355-e795-4027-ac7d-0692901f358a',
     '639365f4-d32a-4ea5-a0e8-6871d81f6916'
   );

update public.partners
   set status = 'inactive'
 where id in (
   '694d73a3-0281-4a4c-bea8-e9c21bafcb0c',
   '8bad32e4-2aff-4b26-aaea-ab140314265b',
   '23f8cb70-84b7-4764-954b-322a617f40ac'
 );

commit;

-- Check (expected: 0 published listings, 0 active partners).
-- select (select count(*) from public.listings where status = 'published') as published_listings,
--        (select count(*) from public.partners where status = 'active') as active_partners;
--
-- Undo (republishing goes through the compliance check again):
-- update public.partners set status = 'active'
--  where id in ('694d73a3-0281-4a4c-bea8-e9c21bafcb0c', '8bad32e4-2aff-4b26-aaea-ab140314265b', '23f8cb70-84b7-4764-954b-322a617f40ac');
-- update public.listings set status = 'published'
--  where id in ('44766096-ced5-49a6-af5f-b504289e38d1', 'b24eb6c5-6cc8-47ba-9dd6-a848d0d61874', '95d45377-9e37-400a-b9ce-98fcf8331f63',
--               'f057e7a2-24e5-4551-a42c-97b971881399', '4cba19fe-8de9-4c70-a485-ba24bc4a1fcf', 'e67a6355-e795-4027-ac7d-0692901f358a',
--               '639365f4-d32a-4ea5-a0e8-6871d81f6916');
