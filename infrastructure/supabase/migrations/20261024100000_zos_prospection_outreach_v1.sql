-- ============================================================
-- ZOS — prospection par e-mail : journal des envois et désinscription, v1
--
-- L'envoi est fait par apps/find/outreach (GitHub Action « ZOS —
-- prospection par e-mail »), depuis une boîte dédiée sur un domaine séparé,
-- avec la clé secrète du projet. Cette migration ne fait que préparer :
--
-- 1. public.zos_outreach_sends : une ligne par e-mail envoyé (1er contact,
--    relance 1, relance 2), avec un jeton unique pour le lien
--    « ne plus recevoir ». Sert aussi à ne jamais écrire deux fois la même
--    étape à la même cible, et à arrêter les relances après une réponse,
--    un retour en erreur (bounce) ou une désinscription.
--
-- 2. public.zos_outreach_opt_out(jeton) : appelée par la page
--    zfind.online/api/prospection-optout. Marque « ne pas contacter »
--    (do_not_contact) toutes les lignes qui ont cette adresse dans
--    zfind_agencias et zjobs_empresas, et passe ses envois en opted_out.
--    Réservée au rôle serveur.
--
-- Accès : rôle serveur complet ; administrateurs Z Find (is_admin()) en
-- lecture ; rien pour anon / authenticated.
-- Idempotent : peut être relancé.
-- ============================================================

create table if not exists public.zos_outreach_sends (
  id uuid primary key default gen_random_uuid(),
  campaign text not null,
  target_table text not null check (target_table in ('zfind_agencias', 'zjobs_empresas')),
  target_id text not null,
  email text not null,
  step smallint not null check (step between 1 and 3),
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'bounced', 'replied', 'opted_out')),
  token uuid not null default gen_random_uuid() unique,
  message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (campaign, target_table, target_id, step)
);

create index if not exists zos_outreach_sends_email_idx on public.zos_outreach_sends (lower(email));
create index if not exists zos_outreach_sends_campaign_idx on public.zos_outreach_sends (campaign, step, status);

comment on table public.zos_outreach_sends is
  'ZOS — e-mails de prospection envoyés (1er contact + 2 relances), un jeton par envoi pour la désinscription.';
comment on column public.zos_outreach_sends.status is
  'queued (avant envoi), sent, failed (refusé par le serveur SMTP), bounced (retour en erreur), replied (réponse reçue : plus de relance), opted_out (désinscription)';

alter table public.zos_outreach_sends enable row level security;
revoke all on table public.zos_outreach_sends from anon, authenticated;
grant select, insert, update, delete on table public.zos_outreach_sends to service_role;
grant select on table public.zos_outreach_sends to authenticated;

drop policy if exists "admin read outreach" on public.zos_outreach_sends;
create policy "admin read outreach" on public.zos_outreach_sends
  for select to authenticated using (public.is_admin());

create or replace function public.zos_outreach_opt_out(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_already boolean;
begin
  select lower(email), status = 'opted_out' into v_email, v_already
    from public.zos_outreach_sends where token = p_token;
  if v_email is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update public.zfind_agencias
     set do_not_contact = true, do_not_contact_at = coalesce(do_not_contact_at, now()), updated_at = now()
   where lower(email) = v_email and not do_not_contact;

  update public.zjobs_empresas
     set do_not_contact = true, do_not_contact_at = coalesce(do_not_contact_at, now()), updated_at = now()
   where lower(email) = v_email and not do_not_contact;

  update public.zos_outreach_sends
     set status = 'opted_out', updated_at = now()
   where lower(email) = v_email and status <> 'opted_out';

  return jsonb_build_object('ok', true, 'already', coalesce(v_already, false));
end;
$$;

revoke all on function public.zos_outreach_opt_out(uuid) from public, anon, authenticated;
grant execute on function public.zos_outreach_opt_out(uuid) to service_role;

comment on function public.zos_outreach_opt_out(uuid) is
  'Désinscription de la prospection : do_not_contact sur toutes les lignes de cette adresse (agences, entreprises) et envois en opted_out.';

-- Vérification (attendu : true, false, false) :
-- select has_function_privilege('service_role', 'public.zos_outreach_opt_out(uuid)', 'execute'),
--        has_function_privilege('anon', 'public.zos_outreach_opt_out(uuid)', 'execute'),
--        has_table_privilege('anon', 'public.zos_outreach_sends', 'select');
