-- ============================================================
-- Z FIND — e-mail alerts and agency reviews v1
-- ============================================================
-- 1. zfind_alert_subscriptions
--    Search alerts (new listings matching a saved search, weekly) and
--    value alerts (the estimate of an owner's property after each official
--    price update). Double opt-in: a row is 'pending' until the visitor
--    clicks the confirmation link; every e-mail carries a one-click
--    unsubscribe. Retention (enforced by the weekly job): unconfirmed rows
--    30 days, unsubscribed rows 30 days, inactive subscriptions 3 years
--    (CNIL guidance for prospects). Only the server functions (service
--    role) read or write this table: no anon/authenticated access at all.
--
-- 2. zfind_partner_reviews
--    Reviews of partner agencies, only from visitors who really contacted
--    the agency through Z Find and agreed to be invited (verified_contact).
--    Life cycle: invited → pending (submitted) → published | rejected
--    (moderated by Z Find). The invitation e-mail is erased as soon as the
--    review is submitted or after 60 days. The public reads published
--    reviews only, and only the non-personal columns.
--
-- Additive only. No change to existing tables.
-- ============================================================

create table if not exists public.zfind_alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('search', 'value')),
  email text not null check (length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'),
  lang text not null default 'fr' check (lang in ('fr', 'en')),
  criteria jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
  token uuid not null default gen_random_uuid() unique,
  consent_text text not null check (length(consent_text) between 10 and 600),
  consent_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  last_sent_at timestamptz,
  last_reference text,
  sent_count integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.zfind_alert_subscriptions is
  'Z Find e-mail alerts (search / value), double opt-in, server-only access. See migration 20260930120000.';

create index if not exists idx_zfind_alerts_status_kind on public.zfind_alert_subscriptions (status, kind);
create index if not exists idx_zfind_alerts_email on public.zfind_alert_subscriptions (lower(email));

alter table public.zfind_alert_subscriptions enable row level security;
revoke all on public.zfind_alert_subscriptions from anon, authenticated;

create table if not exists public.zfind_partner_reviews (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  status text not null default 'invited' check (status in ('invited', 'pending', 'published', 'rejected')),
  rating smallint check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1200),
  author_label text check (author_label is null or char_length(author_label) between 1 and 60),
  lang text not null default 'fr' check (lang in ('fr', 'en')),
  verified_contact boolean not null default true,
  invite_email text check (invite_email is null or length(invite_email) <= 254),
  invite_token uuid not null default gen_random_uuid() unique,
  moderation_token uuid not null default gen_random_uuid() unique,
  send_after timestamptz not null default (now() + interval '7 days'),
  invite_sent_at timestamptz,
  submitted_at timestamptz,
  published_at timestamptz,
  partner_reply text check (partner_reply is null or char_length(partner_reply) <= 1200),
  partner_replied_at timestamptz,
  created_at timestamptz not null default now(),
  constraint zfind_reviews_submitted_shape check (status = 'invited' or (rating is not null and author_label is not null))
);

comment on table public.zfind_partner_reviews is
  'Reviews of Z Find partner agencies from verified contacts; public reads published rows, non-personal columns only.';

create index if not exists idx_zfind_reviews_partner_published on public.zfind_partner_reviews (partner_id, published_at desc) where status = 'published';
create index if not exists idx_zfind_reviews_invites on public.zfind_partner_reviews (status, send_after) where status = 'invited';

alter table public.zfind_partner_reviews enable row level security;
revoke all on public.zfind_partner_reviews from anon, authenticated;

grant select (id, partner_id, listing_id, rating, comment, author_label, lang, verified_contact, published_at, partner_reply, partner_replied_at)
  on public.zfind_partner_reviews to anon, authenticated;

drop policy if exists "public read published reviews" on public.zfind_partner_reviews;
create policy "public read published reviews" on public.zfind_partner_reviews
  for select to anon, authenticated
  using (status = 'published');
