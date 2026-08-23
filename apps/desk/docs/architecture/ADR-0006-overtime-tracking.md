# ADR-0006: registo de horas extraordinárias, com total acumulado no mapa mensal

## Status
Accepted

## Date
2026-08-23

## Context
A gestão de pessoal (ADR-0004/0005) cobre horário esperado, ausências e desvios pontuais — mas nada regista horas trabalhadas *a mais* do que o horário previsto. Foi pedido um espaço para lançar horas extraordinárias e contabilizá-las no fim do mês.

## Decision
Nova entidade `desk_overtime_entries` — um lançamento por data, com número de horas e nota opcional, e um estado simples (`pending` → `approved`), mesmo padrão já usado em `desk_absences`. Não substitui nem recalcula o horário (`desk_work_schedules`/`desk_schedule_overrides`) — é um registo aditivo, somado por cima.

O total do mês não é armazenado — é somado no pedido a partir dos lançamentos aprovados desse mês, e passa a vir incluído na resposta de `GET /personnel/monthly-map` (um valor por pessoa), além de um endpoint próprio (`GET /personnel/overtime`) para consultar/listar os lançamentos individuais que compõem esse total.

## Consequences
- Só horas `approved` contam para o total — um lançamento `pending` existe mas não é contabilizado, para o total do mês não incluir horas ainda não confirmadas.
- Sem ligação a processamento de salários ou compensação (banco de horas, pagamento) — consistente com a fronteira já traçada no ADR-0004: isto é registo operacional, não um módulo de RH/folha de pagamento.
- Sem limite máximo de horas nem alerta de excesso — pode ser adicionado depois, não bloqueia este registo.

## Alternatives Considered
- **Guardar o total do mês como campo persistido**: rejeitada — mesma razão do mapa mensal em si (ADR-0004/0005): um lançamento aprovado depois teria de disparar recálculo explícito; somar no pedido evita esse problema de sincronização.

---
Nota: este ADR é imutável depois de "Accepted". Uma mudança de direção regista-se como um novo ADR que o substitui — nunca como edição a este ficheiro.
