# ADR-0004: Z Desk inclui gestão de pessoal — horários de trabalho e mapa de férias/ausências

## Status
Accepted

## Date
2026-08-23

## Context
Discutida a hipótese de um mapa mensal de horários do pessoal, identificou-se valor real e uma ligação direta ao que já existe: o quadro de tarefas (ADR-0003) atribui missões a colegas sem qualquer noção de quem está disponível; o calendário (ADR-0001/ADR-0002) sabe de reuniões mas não sabe se uma pessoa está de férias nesse dia. Sem gestão de pessoal, ambas as funcionalidades atribuem/agendam às cegas.

Identificou-se também o risco oposto: isto aproxima-se de gestão de RH, que não é o mesmo produto que "caixa de entrada + agenda + tarefas". A decisão aqui é incluir a fatia que serve diretamente as outras funcionalidades do Z Desk (disponibilidade), não construir um módulo de RH completo (processamento de férias, aprovações formais, integração com folha de salários).

## Decision
Duas entidades novas, deliberadamente simples:

- **`desk_work_schedules`** — padrão semanal recorrente de horário de trabalho por pessoa (dia da semana + hora de início/fim). Não são registos de ponto, é o horário esperado.
- **`desk_absences`** — intervalos de datas em que uma pessoa não está disponível (`type`: `vacation`, `sick`, `other`), com `status` (`requested`, `approved`) — um pedido simples, não um fluxo de aprovação com múltiplos níveis.

O "mapa mensal" é uma vista agregada sobre estas duas tabelas (`GET /personnel/monthly-map`), não uma terceira entidade — para um dia e uma pessoa, cruza o horário recorrente com qualquer ausência ativa nesse dia.

Esta informação passa a estar disponível para a IA cruzar ao sugerir atribuição de missões e ao propor reuniões — mas, tal como todo o resto no Z Desk, isso é trabalho para quando a IA for ligada (deixado para o fim, por decisão já tomada), não implementado agora.

## Consequences
- Introduz uma terceira dimensão de "estado da pessoa" (além do seu `role` de acesso e da sua carga de missões) — a UI tem de deixar claro que são coisas diferentes.
- Sem fluxo de aprovação de férias com hierarquia — qualquer membro do tenant pode marcar a sua própria ausência como `approved` diretamente. Aprovação por um `owner`/`admin` é TODO, não bloqueia esta v1.
- Sem integração com processamento de salários, cálculo de dias de férias restantes, ou calendário de feriados nacionais — fora de âmbito deliberado (é gestão de RH, não gestão de pessoal operacional).

## Alternatives Considered
- **Não construir isto agora, esperar por um módulo de RH dedicado**: rejeitada por decisão explícita — o valor imediato é a disponibilidade cruzada com tarefas/calendário, que só um módulo de RH completo levaria demasiado tempo a entregar.
- **Modelar disponibilidade só como um campo booleano "disponível hoje"**: rejeitada — perde a informação de padrão semanal (quem trabalha que dias) e a distinção entre tipos de ausência, que a UI (mapa mensal) precisa para ser útil.

---
Nota: este ADR é imutável depois de "Accepted". Uma mudança de direção regista-se como um novo ADR que o substitui — nunca como edição a este ficheiro.
