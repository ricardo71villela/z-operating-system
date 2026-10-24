# Z Jobs — empresas que vão contratar (La Bonne Boîte)

Lista dos estabelecimentos com **forte potencial de contratação** nos
próximos meses, segundo a France Travail (API La Bonne Boîte v2). Serve para
escolher primeiro, entre as 225 000 empresas de `zjobs_empresas`, as que vão
recrutar. Tabela `zjobs_recrutamento` e vista `zjobs_empresas_a_recrutar` no
Supabase ZOS (migração
`infrastructure/supabase/migrations/20261024120000_z_jobs_recrutamento_v1.sql`).

## Como recolhe

Para cada departamento (centro das empresas da base, raio de 50 km) e cada
grande domínio de profissões do ROME (A a N), lê as páginas de resultados
(ordenados por potencial) enquanto houver estabelecimentos com forte
potencial. Guarda um por SIRET, com as profissões e os domínios em que
recruta, o potencial (0-100), o número de assalariados e a cidade. No fim
de uma passagem completa, os que deixaram de aparecer ficam
`active = false`.

A API não dá e-mails nem telefones. O campo `accepts_email_applications`
diz só se a empresa aceita candidaturas espontâneas por e-mail.

Limite da API: 2 pedidos por segundo. Uma passagem completa leva algumas
horas.

## Quando corre

Todos os meses (dia 2, às 04:00 UTC), ou à mão em *Actions → «Z Jobs —
La Bonne Boîte»*. Para um teste rápido: `dept = 74`, `domain = F`.

## Segredos (GitHub → Settings → Secrets → Actions)

- `FRANCE_TRAVAIL_CLIENT_ID`, `FRANCE_TRAVAIL_CLIENT_SECRET`: aplicação
  francetravail.io com a API «La Bonne Boîte v2» (expiram a 24/10/2027).
- `ZFIND_SUPABASE_SERVICE_KEY`: já existe.

## Usar

```sql
select name, city, employee_band, etablissements_a_recrutar, hiring_potential_max, domains
  from public.zjobs_empresas_a_recrutar
 where not do_not_contact
 order by hiring_potential_max desc, etablissements_a_recrutar desc
 limit 100;
```
