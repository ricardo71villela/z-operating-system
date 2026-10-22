\set ON_ERROR_STOP on
begin;

-- Seed: one active Z Find agency with one user and one published listing.
-- Triggers are bypassed for the fixture only (listing compliance needs a
-- full property record that is irrelevant to visit authority).
set local session_replication_role = replica;
insert into auth.users(id,email) values
  ('e1111111-1111-4111-8111-111111111101','agent-one@example.test'),
  ('e1111111-1111-4111-8111-111111111102','agent-two@example.test'),
  ('e1111111-1111-4111-8111-111111111103','outsider@example.test')
on conflict(id) do nothing;
insert into public.partners(id,name,role,status) values
  ('e2222222-2222-4222-8222-222222222201','Agence Visite Test','agency','active'),
  ('e2222222-2222-4222-8222-222222222202','Autre Agence','agency','active');
insert into public.profiles(id,partner_id,role) values
  ('e1111111-1111-4111-8111-111111111101','e2222222-2222-4222-8222-222222222201','partner_user'),
  ('e1111111-1111-4111-8111-111111111102','e2222222-2222-4222-8222-222222222201','partner_user'),
  ('e1111111-1111-4111-8111-111111111103','e2222222-2222-4222-8222-222222222202','partner_user');
insert into public.properties(id,subtype,property_class) values
  ('e3333333-3333-4333-8333-333333333301','apartment','residential');
insert into public.representations(id,target_type,property_id,partner_id,status) values
  ('e4444444-4444-4444-8444-444444444401','property','e3333333-3333-4333-8333-333333333301','e2222222-2222-4222-8222-222222222201','active');
insert into public.listings(id,representation_id,channel,price_current,currency_iso,status,transaction_type) values
  ('e5555555-5555-4555-8555-555555555501','e4444444-4444-4444-8444-444444444401','standard',350000,'EUR','published','sale'),
  ('e5555555-5555-4555-8555-555555555502','e4444444-4444-4444-8444-444444444401','standard',350000,'EUR','draft','sale');
insert into public.listing_content(listing_id,locale,title) values
  ('e5555555-5555-4555-8555-555555555501','fr','Appartement 3 pièces vue lac');
set local session_replication_role = origin;

do $$
declare
  v_listing uuid := 'e5555555-5555-4555-8555-555555555501';
  v_slots timestamptz[];
  v_res jsonb;
  v_req uuid;
  v_link jsonb;
  v_link2 jsonb;
  v_other jsonb;
  v_ws uuid;
  v_member uuid;
  v_failed boolean;
  v_n integer;
begin
  -- Slots: Monday-Saturday, 9:00-18:00 starts, Paris time, from tomorrow.
  select array_agg(slot_start order by slot_start) into v_slots from public.zfind_visit_slots(v_listing, 14);
  if coalesce(cardinality(v_slots),0) < 100 then raise exception 'Expected ~120 slots, got %', cardinality(v_slots); end if;
  if exists (select 1 from unnest(v_slots) s where extract(isodow from s at time zone 'Europe/Paris') = 7
                or extract(hour from s at time zone 'Europe/Paris') not between 9 and 18
                or (s at time zone 'Europe/Paris')::date <= (now() at time zone 'Europe/Paris')::date) then
    raise exception 'Slot outside opening hours or not in the future';
  end if;
  if exists (select 1 from public.zfind_visit_slots('e5555555-5555-4555-8555-555555555502', 14)) then
    raise exception 'Unpublished listing offered visit slots';
  end if;

  -- Public request validation.
  v_res := public.zfind_request_visit(v_listing,'Acheteur','bad-email','+33 6 00 00 00 00',v_slots[1:2]);
  if v_res->>'error' <> 'invalid_email' then raise exception 'Invalid e-mail accepted: %', v_res; end if;
  v_res := public.zfind_request_visit(v_listing,'Acheteur','a@example.test','abc',v_slots[1:2]);
  if v_res->>'error' <> 'invalid_phone' then raise exception 'Invalid phone accepted: %', v_res; end if;
  v_res := public.zfind_request_visit(v_listing,'Acheteur','a@example.test','+33 6 00 00 00 00',v_slots[1:4]);
  if v_res->>'error' <> 'invalid_slots' then raise exception 'Four slots accepted: %', v_res; end if;
  v_res := public.zfind_request_visit(v_listing,'Acheteur','a@example.test','+33 6 00 00 00 00',array[now() + interval '3 hours']);
  if v_res->>'error' <> 'slot_unavailable' then raise exception 'Arbitrary slot accepted: %', v_res; end if;
  v_res := public.zfind_request_visit('e5555555-5555-4555-8555-555555555502','Acheteur','a@example.test','+33 6 00 00 00 00',v_slots[1:1]);
  if v_res->>'error' <> 'listing_unavailable' then raise exception 'Unpublished listing accepted a request: %', v_res; end if;

  v_res := public.zfind_request_visit(v_listing,'Acheteur Un','A@Example.test','+33 6 00 00 00 00',v_slots[1:3],'Disponible le matin','en');
  if (v_res->>'ok')::boolean is not true then raise exception 'Valid request refused: %', v_res; end if;
  v_req := (v_res->>'id')::uuid;
  if not exists (select 1 from public.leads l join public.zfind_visit_requests v on v.lead_id = l.id
                  where v.id = v_req and l.contact_type = 'visit' and l.email = 'a@example.test' and l.message like '%Visit request%') then
    raise exception 'Visit request did not create its Z Find lead';
  end if;
  v_res := public.zfind_request_visit(v_listing,'Acheteur Un','a@example.test','+33 6 00 00 00 00',v_slots[4:4]);
  if v_res->>'error' <> 'already_requested' then raise exception 'Duplicate open request accepted: %', v_res; end if;

  -- Agency bridge: first user owns the Z Desk Lite workspace, second joins it.
  v_link := public.zdesk_link_zfind_partner('e1111111-1111-4111-8111-111111111101','agent-one@example.test');
  v_link2 := public.zdesk_link_zfind_partner('e1111111-1111-4111-8111-111111111102','agent-two@example.test');
  if v_link->>'role' <> 'owner' or v_link2->>'role' <> 'member' or v_link->>'workspaceId' <> v_link2->>'workspaceId' then
    raise exception 'Partner users not linked to one workspace with owner/member roles: % %', v_link, v_link2;
  end if;
  if public.zdesk_link_zfind_partner('e1111111-1111-4111-8111-111111111101','agent-one@example.test')->>'workspaceMemberId' <> v_link->>'workspaceMemberId' then
    raise exception 'Linking is not idempotent';
  end if;
  if public.zdesk_link_zfind_partner('d0000000-0000-4000-8000-000000000000','nobody@example.test') is not null then
    raise exception 'Non-partner user was linked';
  end if;
  v_ws := (v_link->>'workspaceId')::uuid;
  v_member := (v_link2->>'workspaceMemberId')::uuid;
  if (select count(*) from public.zdesk_identity_for_auth_user('e1111111-1111-4111-8111-111111111102') where membership_id is not null) <> 1 then
    raise exception 'Linked user has no active ZOS membership';
  end if;

  -- Workspace isolation: another agency sees nothing and cannot decide.
  v_other := public.zdesk_link_zfind_partner('e1111111-1111-4111-8111-111111111103','outsider@example.test');
  select count(*) into v_n from public.zdesk_visit_requests((v_other->>'workspaceId')::uuid);
  if v_n <> 0 then raise exception 'Other agency sees foreign visit requests'; end if;
  v_failed := false;
  begin
    perform public.zdesk_decide_visit((v_other->>'workspaceId')::uuid,(v_other->>'workspaceMemberId')::uuid,v_req,'confirm',v_slots[1]);
  exception when no_data_found then v_failed := true;
  end;
  if not v_failed then raise exception 'Other agency decided a foreign visit'; end if;
  v_failed := false;
  begin
    perform public.zdesk_decide_visit(v_ws,(v_other->>'workspaceMemberId')::uuid,v_req,'confirm',v_slots[1]);
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Foreign member acted inside the agency workspace'; end if;

  select count(*) into v_n from public.zdesk_visit_requests(v_ws, 'requested');
  if v_n <> 1 then raise exception 'Agency does not see its request'; end if;

  -- Confirm only a proposed slot.
  v_failed := false;
  begin
    perform public.zdesk_decide_visit(v_ws,v_member,v_req,'confirm',v_slots[5]);
  exception when invalid_parameter_value then v_failed := true;
  end;
  if not v_failed then raise exception 'Confirmed a slot the buyer did not propose'; end if;

  v_res := public.zdesk_decide_visit(v_ws,v_member,v_req,'confirm',v_slots[2]);
  if v_res->>'status' <> 'confirmed' or v_res->>'buyerEmail' <> 'a@example.test' or v_res->>'language' <> 'en'
     or v_res->>'listingTitle' <> 'Appartement 3 pièces vue lac' then
    raise exception 'Unexpected confirmation payload: %', v_res;
  end if;
  if not exists (select 1 from desk.events where id = (v_res->>'eventId')::uuid and workspace_id = v_ws
                   and event_type = 'visit' and status = 'confirmed' and starts_at = v_slots[2]) then
    raise exception 'Confirmed visit is not in the agency Z Desk calendar';
  end if;
  if (select l.status from public.leads l join public.zfind_visit_requests v on v.lead_id = l.id where v.id = v_req) <> 'contacted' then
    raise exception 'Z Find lead not marked contacted';
  end if;
  if exists (select 1 from public.zfind_visit_slots(v_listing, 14) where slot_start = v_slots[2]) then
    raise exception 'Confirmed slot still offered to other buyers';
  end if;

  v_failed := false;
  begin
    perform public.zdesk_decide_visit(v_ws,v_member,v_req,'decline');
  exception when object_not_in_prerequisite_state then v_failed := true;
  end;
  if not v_failed then raise exception 'Decided visit was decided again'; end if;

  -- Decline path.
  v_res := public.zfind_request_visit(v_listing,'Acheteur Deux','b@example.test','0450000000',array[v_slots[3]]);
  v_res := public.zdesk_decide_visit(v_ws,v_member,(v_res->>'id')::uuid,'decline',null,'Bien sous offre');
  if v_res->>'status' <> 'declined' or v_res->>'reason' <> 'Bien sous offre' then raise exception 'Decline failed: %', v_res; end if;

  -- No direct table access for API roles.
  if has_table_privilege('anon','public.zfind_visit_requests','select') or has_table_privilege('authenticated','public.zfind_visit_requests','select') then
    raise exception 'Visit requests readable by API roles';
  end if;
  if has_function_privilege('anon','public.zdesk_decide_visit(uuid,uuid,uuid,text,timestamptz,text)','execute')
     or has_function_privilege('authenticated','public.zdesk_link_zfind_partner(uuid,text)','execute') then
    raise exception 'Service-only visit functions exposed';
  end if;
  if not has_function_privilege('anon','public.zfind_request_visit(uuid,text,text,text,timestamptz[],text,text)','execute') then
    raise exception 'Public visit request not callable without an account';
  end if;
end; $$;

rollback;
