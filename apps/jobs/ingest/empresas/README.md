# Z Jobs — base dos empregadores (França)

Base de prospeção das empresas que contratam, para trazer as primeiras
ofertas de emprego ao Z Jobs. Tabela `zjobs_empresas` no Supabase ZOS
(migração `infrastructure/supabase/migrations/20261023200000_z_jobs_empresas_prospection_v1.sql`).

## O que entra

Uma linha por empresa (SIREN), com a morada da **sede**, a partir da API pública
[recherche-entreprises.api.gouv.fr](https://recherche-entreprises.api.gouv.fr)
(dados oficiais SIRENE/INSEE + RNE, sem chave):

- empresas **ativas** com **10 ou mais assalariados** (escalões INSEE 11 a 53);
- setor (código e secção NAF), escalão de efetivos e o ano desse escalão,
  categoria (PME / ETI / GE), número de estabelecimentos abertos;
- associação e ESS assinaladas (ficam na base: também contratam).

Ficam de fora: administração pública (secção O), organizações
extraterritoriais (U), famílias empregadoras (T), serviços públicos e pessoas
coletivas de direito público, empresários em nome individual, e as empresas
em difusão parcial do SIRENE (opuseram-se à difusão e à prospeção).

| Escalão | Assalariados |
| --- | --- |
| 11 | 10-19 |
| 12 | 20-49 |
| 21 | 50-99 |
| 22 | 100-199 |
| 31 | 200-249 |
| 32 | 250-499 |
| 41 | 500-999 |
| 42 | 1000-1999 |
| 51 | 2000-4999 |
| 52 | 5000-9999 |
| 53 | 10 000 e mais |

## Como recolhe

A API devolve no máximo 10 000 resultados por pesquisa. A recolha percorre
secção NAF × escalão; uma combinação acima do limite é dividida por região e,
se preciso, por departamento. Uma empresa encontrada várias vezes é guardada
uma só vez. No fim de uma passagem completa e sem erros, as empresas que
deixaram de aparecer (fechadas, ou abaixo de 10 assalariados) ficam
`active = false` — nada é apagado.

## Quando corre

Uma vez por trimestre (1 de janeiro, abril, julho e outubro), ou à mão no
separador Actions. O registo muda devagar: o escalão de efetivos do SIRENE só
é atualizado uma vez por ano.

## Regras de prospeção

- **França, B2B:** e-mail permitido sem consentimento prévio se a mensagem
  disser respeito à atividade da empresa (recrutamento), com identificação do
  remetente, origem dos dados e ligação de desinscrição (CNIL).
- Quem pedir para sair fica `do_not_contact = true` e nunca mais é contactado.

## Limites conhecidos

- **Sem contactos por agora.** O registo não publica e-mail, telefone nem site
  das empresas. As colunas de contacto existem e ficam vazias até haver uma
  fonte de contactos (por exemplo as ofertas publicadas na API France Travail,
  que pede uma conta gratuita).
- **Só França.** Bélgica (BCE) e Luxemburgo (RCS) não publicam o número de
  assalariados nos dados abertos; ficam para uma versão seguinte.
- O escalão de efetivos do SIRENE tem um a dois anos de atraso (coluna
  `employee_band_year`).

## Pôr a funcionar

1. Aplicar a migração no Supabase ZOS (SQL Editor).
2. Nada a configurar no GitHub: o workflow usa o segredo
   `ZFIND_SUPABASE_SERVICE_KEY`, que já existe (é a mesma chave do projeto ZOS).
3. *Actions → «Z Jobs — ingestão das empresas (FR)» → Run workflow.* Para um
   teste rápido: `section = F`, `band = 22` (construção, 100-199 assalariados).
   Depois, sem filtros, para a base completa (algumas horas).

## Correr à mão

```bash
pip install -r requirements.txt
python tests/test_empresas.py                         # testes, sem rede
python src/fetch_fr_sirene.py --section F --band 22 --dry-run
```
