# ADR-0007: exportação de horários por WhatsApp + registo de faltas (justificadas/injustificadas)

## Status
Accepted

## Date
2026-08-23

## Context
Dois pedidos distintos, ambos sobre gestão de pessoal:

1. Os horários validados devem chegar aos funcionários automaticamente por WhatsApp, não só ficar visíveis dentro do Z Desk.
2. Falta em falta — o schema (`desk_absences`) só distinguia `vacation`/`sick`/`other`. Nenhum destes é o mesmo que uma **falta**: ausência não planeada de um dia de trabalho esperado, que pode vir a ser justificada ou não. Tratar isto como `other` perderia a distinção que a gestão de pessoal precisa de fazer.

## Decision

**Exportação por WhatsApp**
- `desk_users` passa a ter `whatsapp_number` (opcional) — o número pessoal da pessoa, distinto do número de negócio do tenant já usado para falar com clientes.
- O envio reaproveita a integração WhatsApp já ligada ao tenant (`desk_integrations`, `provider='whatsapp'`) como remetente — não se cria uma segunda ligação só para isto.
- **Automático no momento da validação**: quando uma semana é validada (`POST /personnel/schedule-validations/:id/validate`), o horário resultante dessa pessoa para essa semana é enviado por WhatsApp de seguida, best-effort — se a pessoa não tiver `whatsapp_number` associado, ou o tenant não tiver integração WhatsApp ativa, a validação em si não falha; o envio é ignorado silenciosamente (registado em log, não bloqueia).
- Também disponível como ação manual (`POST /personnel/schedules/:userId/export-whatsapp`), para reenvio pontual sem esperar por uma nova validação.

**Faltas**
- `desk_absences.type` estende-se com `falta_justificada` e `falta_injustificada`, ao lado de `vacation`/`sick`/`other` já existentes — não um campo booleano à parte, mesmo padrão de enum já usado no resto do schema.
- Continuam a contar para a resolução de disponibilidade (ADR-0004/0005) da mesma forma que `vacation`/`sick` — uma falta, justificada ou não, significa que a pessoa não esteve disponível nesse dia.
- Sem fluxo de justificação a posteriori nesta fase — a falta nasce já com o tipo que descreve a situação (`falta_justificada` ou `falta_injustificada`); mudar de uma para outra depois de registada é uma edição normal do registo, não um estado de aprovação separado.

## Consequences
- Primeira vez que o Z Desk envia mensagens por WhatsApp, não só recebe — usa o mesmo número de negócio para clientes e para comunicação interna com a equipa. Se isto vier a ser um problema (ex.: confundir clientes com mensagens de equipa no mesmo número), separar os números é uma decisão futura, não resolvida aqui.
- Falha de envio (número inválido, integração caída) nunca deve impedir a validação de uma semana — a disciplina "ação humana não é bloqueada por infraestrutura de envio" mantém-se.
- Sem confirmação de leitura nem reenvio automático em caso de falha — a pessoa vê a mensagem se e quando abrir o WhatsApp; não há garantia de entrega para além do que a própria API da Meta oferece.

## Alternatives Considered
- **Segunda integração WhatsApp só para comunicação interna**: rejeitada por agora — adicionaria complexidade de onboarding sem benefício comprovado; reavaliar se se tornar necessário.
- **Falta como campo booleano `justified` em vez de tipo próprio**: rejeitada — quebraria a consistência com o resto do schema, onde toda a distinção de categoria de ausência já vive no campo `type`.

---
Nota: este ADR é imutável depois de "Accepted". Uma mudança de direção regista-se como um novo ADR que o substitui — nunca como edição a este ficheiro.
