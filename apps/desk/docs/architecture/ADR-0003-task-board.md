# ADR-0003: Z Desk inclui um quadro de tarefas — pessoais e missões atribuídas a colegas

## Status
Accepted

## Date
2026-08-23

## Context
O ADR-0002 desenhou deliberadamente o `desk_messages.state` como alternativa a um sistema de tarefas genérico — o ciclo de vida de uma conversa, não uma lista de afazeres. Isso mantém-se correto para o que uma mensagem *é*, mas deixa um vazio real: nada no produto cobre trabalho que não nasce diretamente de uma mensagem, nem trabalho que uma pessoa atribui a outra dentro da equipa. Um estado de mensagem não tem título próprio, prazo, nem responsável — não pode fazer esse papel.

Foi pedido explicitamente: deve existir um quadro visual onde apareçam tanto tarefas pessoais como missões atribuídas a empregados.

## Decision
Nova entidade `desk_tasks`, independente de `desk_messages` mas opcionalmente ligável a uma thread de origem:

- **Tarefa pessoal**: `assigned_to = created_by` — o próprio criador é o responsável.
- **Missão**: `assigned_to != created_by` — atribuída explicitamente a um colega dentro do mesmo tenant.
- `task_type` (`personal` | `mission`) fica gravado explicitamente na escrita, em vez de ser sempre recalculado por comparação — mesmo padrão já usado em `desk_events.event_type`, mais simples de consultar num quadro.
- Quadro em três colunas (`status`: `todo`, `in_progress`, `done`) — um quadro Kanban, não uma lista plana.
- Uma tarefa pode nascer ligada a uma thread (`thread_id` opcional) — ex.: "isto tornou-se uma tarefa a partir desta conversa" — sem que isso mude o estado da mensagem em si; os dois ciclos de vida (mensagem e tarefa) permanecem independentes.
- `source` (`manual` | `ai_suggested`) já preparado para o dia em que a IA propuser tarefas a partir de mensagens — mas, tal como `desk_events`, uma tarefa `ai_suggested` teria de seguir a mesma disciplina humano-no-loop do ADR-0001. Nenhum worker cria tarefas hoje; o campo existe só para não obrigar a migração futura.

## Consequences
- Introduz uma segunda superfície de "trabalho por fazer" além do estado de mensagem — aceitável porque cobrem coisas diferentes (conversa vs. trabalho atribuível), mas exige que a UI deixe claro que não são a mesma lista.
- Sem gestão de permissões por `role` ainda (ver ADR anterior sobre `desk_users.role` não ser usado em políticas RLS) — qualquer membro do tenant pode atribuir uma missão a qualquer colega do mesmo tenant. Restringir por papel é TODO, não bloqueia o v1.
- Sem notificação a quem recebe uma missão — a pessoa só a vê se abrir o quadro. Notificações ficam fora de âmbito deste ADR.

## Alternatives Considered
- **Reaproveitar `desk_messages.state` para tarefas**: rejeitada — confundiria o ciclo de vida de uma conversa com o de um item de trabalho atribuível a outra pessoa, exatamente o que o ADR-0002 evitou deliberadamente.
- **Tarefas só pessoais, sem atribuição a colegas**: rejeitada — foi pedido explicitamente que o quadro cubra também missões atribuídas.

---
Nota: este ADR é imutável depois de "Accepted". Uma mudança de direção regista-se como um novo ADR que o substitui — nunca como edição a este ficheiro.
