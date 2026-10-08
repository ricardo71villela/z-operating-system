-- ============================================================
-- Radar Léman (immoradar.online) — seguimento das moradas prospetadas
--
-- Uma linha por morada (chave = morada completa, como no dashboard) :
-- estado do contacto, nota livre, data para voltar a contactar e data do
-- último correio enviado. Escrita/leitura SÓ pelas Vercel Functions do site
-- (chave service_role) : RLS ativo e nenhuma política, por isso nem a chave
-- pública (anon/authenticated) vê estas linhas.
-- Não guarda nenhum dado pessoal de proprietários.
-- ============================================================

create table if not exists public.radar_suivi (
  adresse     text primary key,
  statut      text,
  note        text,
  relance_le  date,
  courrier_le date,
  updated_at  timestamptz not null default now(),
  constraint radar_suivi_statut_chk check (statut is null or statut in
    ('courrier', 'relance', 'repondu', 'rdv', 'mandat', 'refus', 'ne_plus')),
  constraint radar_suivi_adresse_len check (char_length(adresse) between 3 and 300),
  constraint radar_suivi_note_len check (note is null or char_length(note) <= 2000)
);

create index if not exists radar_suivi_relance_idx on public.radar_suivi (relance_le) where relance_le is not null;

alter table public.radar_suivi enable row level security;
revoke all on table public.radar_suivi from anon, authenticated;
grant select, insert, update on table public.radar_suivi to service_role;
