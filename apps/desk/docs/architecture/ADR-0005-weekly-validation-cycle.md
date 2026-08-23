# ADR-0005: horário tem vista semanal e mensal; cada semana é validada com 15 dias de antecedência, com desvios pontuais a ajustar o mapa mensal

## Status
Accepted

## Date
2026-08-23

## Context
O ADR-0004 modelou o horário como um único padrão semanal recorrente (`desk_work_schedules`) e derivou o mapa mensal diretamente dele. Isso não cobre uma necessidade real: o padrão recorrente é o *default*, mas uma semana concreta pode precisar de ajuste (uma pessoa troca um dia, entra mais tarde uma vez, etc.) sem alterar o padrão permanente de todas as semanas seguintes. Foi pedido explicitamente um ciclo onde cada semana é validada com 15 dias de antecedência, e o mapa mensal se ajusta a partir daí.

## Decision
Duas entidades novas, complementares ao `desk_work_schedules` já existente:

- **`desk_schedule_validations`** — uma linha por pessoa por semana (`week_start_date` = segunda-feira dessa semana), `status` (`pending` → `validated`). Um worker semanal (mesmo padrão dos workers de sync já existentes — repetível via BullMQ) cria automaticamente a linha `pending` para a semana que começa daqui a 15 dias, para cada pessoa do tenant. Validar é uma ação humana (`POST /personnel/schedule-validations/:id/validate`), nunca automática.
- **`desk_schedule_overrides`** — um desvio pontual (uma data específica, não um dia da semana recorrente) que substitui o padrão de `desk_work_schedules` só nesse dia. Criado durante a validação de uma semana, quando o padrão recorrente não se aplica nessa semana em concreto.

**Precedência ao calcular o estado de um dia** (usada tanto na vista semanal como no mapa mensal): ausência aprovada (`desk_absences`) > desvio pontual (`desk_schedule_overrides`) > padrão recorrente (`desk_work_schedules`). Uma ausência aprovada vence sempre; um desvio só é consultado se não houver ausência; o padrão recorrente é o último recurso.

**Duas vistas, uma fonte de verdade:**
- `GET /personnel/weekly-view` — uma semana, por pessoa, com o estado efetivo de cada dia (já resolvida a precedência acima) e o estado de validação dessa semana.
- `GET /personnel/monthly-map` (já existente, ADR-0004) — passa a consultar também `desk_schedule_overrides` na mesma resolução de precedência, não só o padrão recorrente.

Nenhuma das duas vistas guarda o resultado — ambas continuam derivadas, calculadas no pedido.

## Consequences
- O worker de criação automática de validações pendentes precisa de correr sempre (mesmo padrão dos workers de sync de e-mail/calendário) — se parar, semanas deixam de ser propostas para validação, mas nada quebra silenciosamente: a vista semanal simplesmente mostra "por validar" indefinidamente até alguém reparar.
- Não existe ainda notificação a avisar a pessoa de que tem uma semana à espera de validação — mesma lacuna já assumida no ADR-0003 para missões atribuídas.
- A validação em si não impede o horário de ser consultado — uma semana `pending` continua a mostrar o padrão recorrente por defeito; validar é sobre confirmar ou desviar, não sobre desbloquear a visibilidade.

## Alternatives Considered
- **Guardar o mapa mensal calculado, em vez de derivado**: rejeitada — um desvio ou ausência criados depois teriam de disparar recálculo explícito; derivar no pedido evita esse problema de sincronização, ao custo de mais uma consulta por leitura (aceitável ao volume esperado).
- **Um único horário por semana, sem padrão recorrente de fundo**: rejeitada — obrigaria a criar manualmente todas as semanas desde o início, quando a maioria das semanas segue o padrão sem qualquer desvio.

---
Nota: este ADR é imutável depois de "Accepted". Uma mudança de direção regista-se como um novo ADR que o substitui — nunca como edição a este ficheiro.
