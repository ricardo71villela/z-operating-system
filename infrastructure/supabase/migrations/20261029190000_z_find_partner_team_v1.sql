-- Z Find — équipe d'une agence : plusieurs utilisateurs par agence.
--
-- Le responsable de l'agence (le premier compte de l'agence) invite ses
-- collègues par e-mail depuis l'espace Partner (« Équipe ») ; chacun crée
-- son propre mot de passe et accepte l'invitation (lien envoyé par
-- api/lead-notify.js). Un membre retiré garde son compte mais n'a plus
-- accès à l'agence. Tout passe par des fonctions ; aucune table n'est
-- lisible directement par le navigateur. Idempotent, sans suppression.

create table if not exists public.zfind_partner_invitations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  email text not null check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  sent_at timestamptz,
  send_attempts smallint not null default 0,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz
);
create unique index if not exists zfind_partner_invitations_open_idx
  on public.zfind_partner_invitations (partner_id, lower(email))
  where accepted_at is null and revoked_at is null;
alter table public.zfind_partner_invitations enable row level security;
revoke all on public.zfind_partner_invitations from public, anon, authenticated;
grant select, update on public.zfind_partner_invitations to service_role;

-- Agence de l'utilisateur connecté et s'il en est le responsable (premier compte créé).
create or replace function public.zfind_partner_team_context()
returns table (partner_id uuid, is_owner boolean)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.partner_id from public.profiles p
     where p.id = auth.uid() and p.role = 'partner_user' and p.partner_id is not null
  ), owner as (
    select p.id
      from public.profiles p join auth.users u on u.id = p.id
     where p.partner_id = (select partner_id from me) and p.role = 'partner_user'
     order by u.created_at, p.id
     limit 1
  )
  select (select partner_id from me), coalesce((select id from owner) = auth.uid(), false)
   where exists (select 1 from me);
$$;
revoke all on function public.zfind_partner_team_context() from public, anon, authenticated;

-- L'équipe : membres et invitations en attente.
create or replace function public.zfind_partner_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_owner uuid;
begin
  select * into v_ctx from public.zfind_partner_team_context();
  if v_ctx.partner_id is null then
    raise exception 'Accès réservé aux comptes agence.' using errcode = '42501';
  end if;
  select p.id into v_owner from public.profiles p join auth.users u on u.id = p.id
   where p.partner_id = v_ctx.partner_id and p.role = 'partner_user' order by u.created_at, p.id limit 1;
  return jsonb_build_object(
    'is_owner', v_ctx.is_owner,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', p.id, 'email', u.email, 'is_owner', p.id = v_owner, 'is_me', p.id = auth.uid(),
                                          'joined_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at) order by u.created_at)
        from public.profiles p join auth.users u on u.id = p.id
       where p.partner_id = v_ctx.partner_id and p.role = 'partner_user'), '[]'::jsonb),
    'invitations', case when v_ctx.is_owner then coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'created_at', i.created_at, 'expires_at', i.expires_at, 'sent', i.sent_at is not null) order by i.created_at desc)
        from public.zfind_partner_invitations i
       where i.partner_id = v_ctx.partner_id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()), '[]'::jsonb)
      else '[]'::jsonb end
  );
end;
$$;
revoke all on function public.zfind_partner_team() from public, anon;
grant execute on function public.zfind_partner_team() to authenticated;

-- Inviter un collègue (responsable seulement). Une invitation renvoyée repart pour 14 jours.
create or replace function public.zfind_partner_invite(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  select * into v_ctx from public.zfind_partner_team_context();
  if v_ctx.partner_id is null then
    raise exception 'Accès réservé aux comptes agence.' using errcode = '42501';
  end if;
  if not v_ctx.is_owner then
    raise exception 'Seul le responsable de l’agence peut inviter des collègues.' using errcode = '42501';
  end if;
  if v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'Adresse e-mail invalide.' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles p join auth.users u on u.id = p.id
              where p.partner_id = v_ctx.partner_id and p.role = 'partner_user' and lower(u.email) = v_email) then
    raise exception 'Cette personne fait déjà partie de l’équipe.' using errcode = '23505';
  end if;
  if (select count(*) from public.profiles p where p.partner_id = v_ctx.partner_id and p.role = 'partner_user') >= 50 then
    raise exception 'Une agence compte au plus 50 utilisateurs.' using errcode = '54000';
  end if;
  if (select count(*) from public.zfind_partner_invitations i where i.partner_id = v_ctx.partner_id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) >= 20 then
    raise exception 'Trop d’invitations en attente (20 au plus).' using errcode = '54000';
  end if;
  update public.zfind_partner_invitations i
     set expires_at = now() + interval '14 days', sent_at = null, send_attempts = 0, invited_by = auth.uid()
   where i.partner_id = v_ctx.partner_id and lower(i.email) = v_email and i.accepted_at is null and i.revoked_at is null
  returning i.id into v_id;
  if v_id is null then
    insert into public.zfind_partner_invitations (partner_id, email, invited_by)
    values (v_ctx.partner_id, v_email, auth.uid())
    returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id, 'email', v_email);
end;
$$;
revoke all on function public.zfind_partner_invite(text) from public, anon;
grant execute on function public.zfind_partner_invite(text) to authenticated;

create or replace function public.zfind_partner_revoke_invitation(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ctx record;
begin
  select * into v_ctx from public.zfind_partner_team_context();
  if v_ctx.partner_id is null or not v_ctx.is_owner then
    raise exception 'Seul le responsable de l’agence peut gérer les invitations.' using errcode = '42501';
  end if;
  update public.zfind_partner_invitations set revoked_at = now()
   where id = p_id and partner_id = v_ctx.partner_id and accepted_at is null and revoked_at is null;
end;
$$;
revoke all on function public.zfind_partner_revoke_invitation(uuid) from public, anon;
grant execute on function public.zfind_partner_revoke_invitation(uuid) to authenticated;

-- Retirer un membre (responsable seulement, jamais lui-même) : son compte n'a plus accès à l'agence.
create or replace function public.zfind_partner_remove_member(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ctx record;
begin
  select * into v_ctx from public.zfind_partner_team_context();
  if v_ctx.partner_id is null or not v_ctx.is_owner then
    raise exception 'Seul le responsable de l’agence peut retirer un membre.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Le responsable ne peut pas se retirer lui-même.' using errcode = '22023';
  end if;
  update public.profiles set partner_id = null
   where id = p_user_id and partner_id = v_ctx.partner_id and role = 'partner_user';
  if not found then
    raise exception 'Ce membre ne fait pas partie de l’équipe.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.zfind_partner_remove_member(uuid) from public, anon;
grant execute on function public.zfind_partner_remove_member(uuid) to authenticated;

-- Accepter une invitation : le compte connecté (même e-mail que l'invitation) rejoint l'agence.
create or replace function public.zfind_partner_accept_invitation(p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_inv public.zfind_partner_invitations%rowtype;
  v_email text;
  v_profile public.profiles%rowtype;
  v_partner public.partners%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour accepter l’invitation.' using errcode = '42501';
  end if;
  select * into v_inv from public.zfind_partner_invitations where token = p_token for update;
  if not found or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    raise exception 'invitation_invalid' using errcode = 'P0002';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is distinct from lower(v_inv.email) then
    raise exception 'invitation_other_email' using errcode = '42501';
  end if;
  select * into v_partner from public.partners where id = v_inv.partner_id;
  if v_partner.id is null or v_partner.status = 'suspended' then
    raise exception 'invitation_invalid' using errcode = 'P0002';
  end if;
  select * into v_profile from public.profiles where id = auth.uid() for update;
  if v_profile.id is not null and v_profile.role = 'admin' then
    raise exception 'invitation_admin_account' using errcode = '42501';
  end if;
  if v_profile.id is not null and v_profile.partner_id is not null and v_profile.partner_id <> v_inv.partner_id then
    raise exception 'invitation_other_agency' using errcode = '23505';
  end if;
  if v_inv.accepted_at is not null and v_inv.accepted_by is distinct from auth.uid() then
    raise exception 'invitation_invalid' using errcode = 'P0002';
  end if;
  insert into public.profiles (id, partner_id, role) values (auth.uid(), v_inv.partner_id, 'partner_user')
  on conflict (id) do update set partner_id = excluded.partner_id, role = 'partner_user';
  update public.zfind_partner_invitations set accepted_at = coalesce(accepted_at, now()), accepted_by = auth.uid() where id = v_inv.id;
  return jsonb_build_object('status', 'joined', 'partner_id', v_inv.partner_id, 'partner_name', v_partner.name);
end;
$$;
revoke all on function public.zfind_partner_accept_invitation(uuid) from public, anon;
grant execute on function public.zfind_partner_accept_invitation(uuid) to authenticated;

-- Serveur (api/lead-notify.js) : invitations à envoyer, puis marquées envoyées.
create or replace function public.zfind_pending_team_invitations(p_limit integer default 50)
returns table (id uuid, email text, token uuid, partner_name text, inviter_email text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.email, i.token, pa.name, u.email::text, i.expires_at
    from public.zfind_partner_invitations i
    join public.partners pa on pa.id = i.partner_id
    left join auth.users u on u.id = i.invited_by
   where i.sent_at is null and i.accepted_at is null and i.revoked_at is null and i.expires_at > now() and i.send_attempts < 5
   order by i.created_at
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
revoke all on function public.zfind_pending_team_invitations(integer) from public, anon, authenticated;
grant execute on function public.zfind_pending_team_invitations(integer) to service_role;

create or replace function public.zfind_mark_team_invitation(p_id uuid, p_sent boolean)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.zfind_partner_invitations
     set sent_at = case when p_sent then now() else sent_at end,
         send_attempts = send_attempts + 1
   where id = p_id;
$$;
revoke all on function public.zfind_mark_team_invitation(uuid, boolean) from public, anon, authenticated;
grant execute on function public.zfind_mark_team_invitation(uuid, boolean) to service_role;
