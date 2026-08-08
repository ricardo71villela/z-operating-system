-- 0026_terms_acceptance.sql
-- Z Jobs — nunca houve, até agora, nenhum registo de que alguém aceitou
-- os Termos de Serviço. Isto corrige isso — a versão importa, porque os
-- termos podem mudar (secção 13 dos Termos de Serviço), e precisamos de
-- saber a que versão exata cada pessoa deu o consentimento.

begin;

alter table persons
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

comment on column persons.terms_version is
  'Identificador da versão dos Termos de Serviço aceite (ex: "2026-08-05").
   Nunca inferido — só preenchido quando a pessoa aceita explicitamente
   no registo. NULL significa que a pessoa ainda não aceitou nenhuma
   versão, mesmo que a conta já exista (contas anteriores a esta
   migration).';

commit;
