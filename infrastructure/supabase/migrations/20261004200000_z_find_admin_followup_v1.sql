-- ============================================================
-- Z FIND — Admin follow-up: owner estimation requests, enquiry
-- follow-up (answered / 24 h reminder), review moderation in the Admin,
-- photo import from the agency's file links.
--
-- 1. zfind_estimation_requests: every estimation request sent from the
--    site is kept (until now it only existed in an e-mail). The Admin
--    sees them, assigns an owner's request to ONE agency — only when the
--    owner ticked the separate « mise en relation » consent — and records
--    the follow-up. The agency receives it by e-mail (/api/lead-notify).
-- 2. leads.responded_at / reminder_sent_at: the agency marks an enquiry
--    « répondue » in its panel; enquiries without an answer after 24 h
--    get one reminder e-mail and are flagged in the Admin.
-- 3. zfind_admin_reviews() / zfind_admin_moderate_review(): moderation
--    in the Admin (the e-mail links keep working).
-- 4. zfind_media_import_queue: photo links from an imported file, fetched
--    and attached to the draft listing by /api/media-import (server).
-- Server-only functions are granted to service_role; Admin functions
-- check is_admin(); the partner function checks ownership.
-- ============================================================

-- ------------------------------------------------------------ 1. estimation requests
create table if not exists public.zfind_estimation_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  mode text not null check (mode in ('owner', 'buyer')),
  lang text not null default 'fr' check (lang in ('fr', 'en')),
  market text check (market is null or char_length(market) <= 8),
  commune_code text check (commune_code is null or char_length(commune_code) <= 20),
  place text check (place is null or char_length(place) <= 160),
  name text check (name is null or char_length(name) <= 120),
  email text not null check (char_length(email) <= 200),
  phone text check (phone is null or char_length(phone) <= 40),
  project text check (project is null or char_length(project) <= 20),
  alerts boolean not null default false,
  agency_consent boolean not null default false,
  property jsonb not null default '{}'::jsonb,
  estimate jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'assigned', 'contacted', 'closed')),
  partner_id uuid references public.partners (id) on delete set null,
  assigned_at timestamptz,
  forwarded_at timestamptz,
  forward_attempts smallint not null default 0,
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  updated_at timestamptz not null default now(),
  -- An owner's contact details reach an agency only with the owner's separate consent.
  constraint zfind_estimation_assign_needs_consent check (partner_id is null or (agency_consent and mode = 'owner'))
);

comment on table public.zfind_estimation_requests is
  'Estimation requests from zfind.online (owners and buyers). Written by the server; read and followed up by the Admin only.';

create index if not exists idx_zfind_estimations_created on public.zfind_estimation_requests (created_at desc);
create index if not exists idx_zfind_estimations_forward on public.zfind_estimation_requests (assigned_at) where status = 'assigned' and forwarded_at is null;

alter table public.zfind_estimation_requests enable row level security;
revoke all on public.zfind_estimation_requests from anon, authenticated;
grant select, insert, update, delete on public.zfind_estimation_requests to service_role;
grant select on public.zfind_estimation_requests to authenticated;
drop policy if exists "admin read estimation requests" on public.zfind_estimation_requests;
create policy "admin read estimation requests" on public.zfind_estimation_requests
  for select to authenticated using (public.is_admin());

-- Assign an owner's request to one agency (or clear it with p_partner_id null).
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

create or replace function public.zfind_admin_set_estimation_status(p_id uuid, p_status text, p_note text default null)
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
  if p_status is not null and p_status not in ('new', 'contacted', 'closed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.zfind_estimation_requests
     set status = coalesce(p_status, status),
         admin_note = case when p_note is null then admin_note else nullif(btrim(left(p_note, 1000)), '') end,
         updated_at = now()
   where id = p_id
   returning * into v_row;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.zfind_admin_set_estimation_status(uuid, text, text) from public, anon;
grant execute on function public.zfind_admin_set_estimation_status(uuid, text, text) to authenticated;

-- Agency e-mail addresses: the same set as for enquiries (accounts + sign-up e-mail).
create or replace function public.zfind_partner_recipients(p_partner_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array(
    select distinct lower(x.e) from (
      select u.email::text as e
        from public.profiles pf join auth.users u on u.id = pf.id
       where pf.partner_id = p_partner_id and pf.role = 'partner_user'
      union
      select s.email from public.zfind_partner_signups s
       where s.partner_id = p_partner_id and s.status <> 'rejected'
    ) x
    where x.e is not null and x.e <> ''
  );
$$;

revoke all on function public.zfind_partner_recipients(uuid) from public, anon, authenticated;
grant execute on function public.zfind_partner_recipients(uuid) to service_role;

create or replace function public.zfind_pending_estimation_forwards(p_limit integer default 20)
returns table (
  request_id uuid, created_at timestamptz, lang text, market text, place text,
  name text, email text, phone text, project text, property jsonb, estimate jsonb,
  partner_id uuid, partner_name text, recipients text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.created_at, r.lang, r.market, r.place, r.name, r.email, r.phone, r.project, r.property, r.estimate,
         pa.id, pa.name, public.zfind_partner_recipients(pa.id)
    from public.zfind_estimation_requests r
    join public.partners pa on pa.id = r.partner_id and pa.status = 'active'
   where r.status = 'assigned' and r.forwarded_at is null and r.forward_attempts < 5
     and r.agency_consent and r.mode = 'owner'
   order by r.assigned_at
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function public.zfind_pending_estimation_forwards(integer) from public, anon, authenticated;
grant execute on function public.zfind_pending_estimation_forwards(integer) to service_role;

create or replace function public.zfind_mark_estimations_forwarded(p_ids uuid[], p_delivered boolean)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.zfind_estimation_requests
     set forwarded_at = case when p_delivered then now() else forwarded_at end,
         forward_attempts = forward_attempts + case when p_delivered then 0 else 1 end,
         updated_at = now()
   where id = any (coalesce(p_ids, '{}'::uuid[])) and forwarded_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.zfind_mark_estimations_forwarded(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.zfind_mark_estimations_forwarded(uuid[], boolean) to service_role;

-- ------------------------------------------------------------ 2. enquiry follow-up
alter table public.leads add column if not exists responded_at timestamptz;
alter table public.leads add column if not exists reminder_sent_at timestamptz;

-- The agency marks one of ITS enquiries answered (contacted) or closed.
create or replace function public.zfind_partner_set_lead_status(p_lead_id uuid, p_status text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_partner uuid;
  v_row public.leads;
begin
  if p_status not in ('contacted', 'closed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  select partner_id into v_partner from public.profiles where id = auth.uid() and role = 'partner_user';
  if v_partner is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.leads l
     set status = p_status, responded_at = coalesce(l.responded_at, now())
    from public.listings li join public.representations r on r.id = li.representation_id
   where l.id = p_lead_id and li.id = l.listing_id and r.partner_id = v_partner
   returning l.* into v_row;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'responded_at', v_row.responded_at);
end;
$$;

revoke all on function public.zfind_partner_set_lead_status(uuid, text) from public, anon;
grant execute on function public.zfind_partner_set_lead_status(uuid, text) to authenticated;

create or replace function public.zfind_admin_set_lead_status(p_lead_id uuid, p_status text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.leads;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('new', 'contacted', 'closed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.leads
     set status = p_status,
         responded_at = case when p_status = 'new' then null else coalesce(responded_at, now()) end
   where id = p_lead_id
   returning * into v_row;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'responded_at', v_row.responded_at);
end;
$$;

revoke all on function public.zfind_admin_set_lead_status(uuid, text) from public, anon;
grant execute on function public.zfind_admin_set_lead_status(uuid, text) to authenticated;

-- Admin list: each Z Find enquiry with its listing, agency and the 24 h flag.
create or replace function public.zfind_admin_leads(p_status text default null, p_limit integer default 300)
returns table (
  id uuid, created_at timestamptz, contact_type text, name text, email text, phone text, message text,
  status text, notified_at timestamptz, responded_at timestamptz, reminder_sent_at timestamptz,
  listing_id uuid, listing_title text, partner_id uuid, partner_name text, overdue boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select l.id, l.created_at, l.contact_type, l.name, l.email, l.phone, l.message,
         l.status, l.notified_at, l.responded_at, l.reminder_sent_at,
         li.id,
         (select lc.title from public.listing_content lc
           where lc.listing_id = li.id and coalesce(btrim(lc.title), '') <> ''
           order by (lc.locale = 'fr') desc, lc.locale limit 1),
         pa.id, pa.name,
         (l.status = 'new' and l.created_at < now() - interval '24 hours')
    from public.leads l
    join public.listings li on li.id = l.listing_id
    join public.representations r on r.id = li.representation_id
    left join public.partners pa on pa.id = r.partner_id
   where p_status is null
      or (p_status = 'overdue' and l.status = 'new' and l.created_at < now() - interval '24 hours')
      or l.status = p_status
   order by l.created_at desc
   limit greatest(1, least(coalesce(p_limit, 300), 1000));
end;
$$;

revoke all on function public.zfind_admin_leads(text, integer) from public, anon;
grant execute on function public.zfind_admin_leads(text, integer) to authenticated;

-- Server: enquiries still unanswered 24 h after being sent to an active agency (one reminder).
create or replace function public.zfind_pending_lead_reminders(p_limit integer default 50)
returns table (
  lead_id uuid, created_at timestamptz, contact_type text, name text, email text, phone text,
  listing_title text, partner_name text, recipients text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.created_at, l.contact_type, l.name, l.email, l.phone,
         (select lc.title from public.listing_content lc
           where lc.listing_id = li.id and coalesce(btrim(lc.title), '') <> ''
           order by (lc.locale = 'fr') desc, lc.locale limit 1),
         pa.name, public.zfind_partner_recipients(pa.id)
    from public.leads l
    join public.listings li on li.id = l.listing_id
    join public.representations r on r.id = li.representation_id
    join public.partners pa on pa.id = r.partner_id and pa.status = 'active'
   where l.status = 'new' and l.notified_at is not null and l.reminder_sent_at is null
     and l.created_at < now() - interval '24 hours' and l.created_at > now() - interval '7 days'
   order by l.created_at
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.zfind_pending_lead_reminders(integer) from public, anon, authenticated;
grant execute on function public.zfind_pending_lead_reminders(integer) to service_role;

create or replace function public.zfind_mark_lead_reminders(p_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.leads set reminder_sent_at = now()
   where id = any (coalesce(p_ids, '{}'::uuid[])) and reminder_sent_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.zfind_mark_lead_reminders(uuid[]) from public, anon, authenticated;
grant execute on function public.zfind_mark_lead_reminders(uuid[]) to service_role;

-- ------------------------------------------------------------ 3. review moderation
create or replace function public.zfind_admin_reviews(p_status text default 'pending')
returns table (
  id uuid, partner_id uuid, partner_name text, listing_id uuid, status text, rating smallint,
  comment text, author_label text, lang text, submitted_at timestamptz, published_at timestamptz,
  partner_reply text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select rv.id, rv.partner_id, pa.name, rv.listing_id, rv.status, rv.rating, rv.comment, rv.author_label, rv.lang,
         rv.submitted_at, rv.published_at, rv.partner_reply, rv.created_at
    from public.zfind_partner_reviews rv
    left join public.partners pa on pa.id = rv.partner_id
   where rv.status <> 'invited' and (p_status is null or rv.status = p_status)
   order by coalesce(rv.submitted_at, rv.created_at) desc
   limit 300;
end;
$$;

revoke all on function public.zfind_admin_reviews(text) from public, anon;
grant execute on function public.zfind_admin_reviews(text) to authenticated;

create or replace function public.zfind_admin_moderate_review(p_id uuid, p_decision text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_decision not in ('publish', 'reject') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  update public.zfind_partner_reviews
     set status = case when p_decision = 'publish' then 'published' else 'rejected' end,
         published_at = case when p_decision = 'publish' then coalesce(published_at, now()) else null end
   where id = p_id and status in ('pending', 'published', 'rejected')
   returning status into v_status;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_id, 'status', v_status);
end;
$$;

revoke all on function public.zfind_admin_moderate_review(uuid, text) from public, anon;
grant execute on function public.zfind_admin_moderate_review(uuid, text) to authenticated;

-- ------------------------------------------------------------ 4. photo import queue
create table if not exists public.zfind_media_import_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  url text not null check (url ~* '^https?://' and char_length(url) <= 2000),
  position smallint not null default 0 check (position between 0 and 99),
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts smallint not null default 0,
  error text check (error is null or char_length(error) <= 300),
  media_asset_id uuid references public.media_assets (id) on delete set null,
  claimed_at timestamptz,
  done_at timestamptz,
  unique (listing_id, url)
);

comment on table public.zfind_media_import_queue is
  'Photo links from an imported agency file; the Admin queues them, /api/media-import fetches and attaches them.';

create index if not exists idx_zfind_media_queue_pending on public.zfind_media_import_queue (created_at) where status in ('pending', 'processing');

alter table public.zfind_media_import_queue enable row level security;
revoke all on public.zfind_media_import_queue from anon, authenticated;
grant select, insert, delete on public.zfind_media_import_queue to authenticated;
grant select, insert, update, delete on public.zfind_media_import_queue to service_role;
drop policy if exists "admin manage media import queue" on public.zfind_media_import_queue;
create policy "admin manage media import queue" on public.zfind_media_import_queue
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Server: claim a few links to fetch (stale claims are retried, at most 3 attempts).
create or replace function public.zfind_claim_media_imports(p_limit integer default 4)
returns setof public.zfind_media_import_queue
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  return query
  update public.zfind_media_import_queue q
     set status = 'processing', claimed_at = now(), attempts = q.attempts + 1
   where q.id in (
     select x.id from public.zfind_media_import_queue x
      where x.attempts < 3
        and (x.status = 'pending' or (x.status = 'processing' and x.claimed_at < now() - interval '5 minutes'))
      order by x.created_at, x.position
      limit greatest(1, least(coalesce(p_limit, 4), 20))
      for update skip locked)
  returning q.*;
end;
$$;

revoke all on function public.zfind_claim_media_imports(integer) from public, anon, authenticated;
grant execute on function public.zfind_claim_media_imports(integer) to service_role;
