-- 0024_matching.sql
-- Z Jobs — motor de relevância candidato <-> oferta (packages/domain/src/rules/matching.ts).
--
-- Resolve a lacuna identificada na auditoria de produto: toda a energia
-- anterior foi para "esta oferta é verdadeira" (salário fixo, empregador
-- identificado, tabela oficial) — nada para "esta oferta é boa para ti".
--
-- Esta migration só adiciona a peça do lado do EMPREGADOR: quantos
-- candidatos no mercado têm preferências declaradas compatíveis com esta
-- oferta, SEM NUNCA expor candidatos individuais — só o número agregado,
-- mesmo princípio de privacidade de employer_public_metrics (0015). O
-- lado do candidato (ofertas ordenadas por relevância) não precisa de
-- nenhuma função nova — corre inteiramente em JS via
-- packages/domain/src/rules/matching.ts, usando dados já lidos com o
-- consentimento do próprio candidato.
--
-- NOTA DE ÂMBITO: esta função agregada só usa correspondência de
-- preferências DECLARADAS (tipo de contrato, regime, fase de carreira,
-- salário) — nunca competências (texto livre demais para agregar em SQL
-- com fiabilidade). O motor do lado do candidato já inclui competências
-- (packages/domain/src/rules/matching.ts) — só esta contagem agregada
-- para o empregador é que fica mais estreita, de propósito.

begin;

create or replace function candidate_pool_insight(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  v_contract_type text;
  v_work_regime text;
  v_pillar text;
  v_salary_max numeric;
  v_salary_min numeric;
  v_salary_currency text;
  v_total_open_candidates int;
  v_matching_candidates int;
begin
  select contract_type, work_regime, pillar,
         coalesce(salary_max, salary_min), salary_min, salary_currency
    into v_contract_type, v_work_regime, v_pillar, v_salary_max, v_salary_min, v_salary_currency
  from job_offers where id = p_offer_id;

  if v_contract_type is null then
    return jsonb_build_object('error', 'oferta não encontrada');
  end if;

  select count(*) into v_total_open_candidates
  from candidate_profiles
  where is_open_to_offers = true and visibility <> 'private';

  select count(*) into v_matching_candidates
  from candidate_profiles cp
  where cp.is_open_to_offers = true
    and cp.visibility <> 'private'
    and (
      cardinality(cp.desired_contract_types) = 0
      or v_contract_type = any(cp.desired_contract_types::text[])
    )
    and (
      cp.desired_work_regime is null
      or cp.desired_work_regime = v_work_regime::work_regime
      or v_work_regime = 'remote'
      or (cp.desired_work_regime = 'remote' and v_work_regime = 'hybrid')
      or (cp.desired_work_regime = 'hybrid' and v_work_regime = 'remote')
    )
    and (
      v_pillar = 'professional_careers'
      or (v_pillar = 'first_jobs' and cp.interested_in_first_job)
      or (v_pillar = 'senior_careers' and cp.interested_in_senior_roles)
      or (not cp.interested_in_first_job and not cp.interested_in_senior_roles and not cp.interested_in_interim)
    )
    and (
      cp.desired_salary_min is null
      or cp.desired_salary_currency is distinct from v_salary_currency
      or cp.desired_salary_min <= v_salary_max
    );

  return jsonb_build_object(
    'totalOpenCandidatesOnPlatform', v_total_open_candidates,
    'matchingCandidatesEstimate', v_matching_candidates,
    'scopeNote', 'Estimativa baseada só em preferências declaradas (contrato, regime, fase de carreira, salário) — não inclui correspondência de competências. Nunca identifica candidatos individuais.'
  );
end;
$$;

comment on function candidate_pool_insight is
  'SECURITY DEFINER: só assim consegue agregar sobre candidate_profiles
   apesar do RLS restringir a visibilidade normal a cada candidato. Nunca
   devolve linhas individuais, só contagens — ver nota de âmbito acima.';

commit;
