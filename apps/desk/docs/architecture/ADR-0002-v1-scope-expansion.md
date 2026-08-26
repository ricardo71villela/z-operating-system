# ADR-0002: v1 expande de "unificador + sugestão de evento" para sistema de organização nativo (agenda por contexto, notas ligadas, estado por mensagem)

## Status
Accepted

## Date
2026-08-23

## Context
O ADR-0001 definiu a v1 como: caixa unificada (e-mail + WhatsApp) + IA a sugerir eventos, sempre com confirmação humana. Essa decisão sobre autonomia da IA mantém-se.

Discutida a razão de existir do Z Desk face a concorrência genérica (Superhuman, Front, Missive), identificou-se que replicar apenas "inbox unificada com IA" não é suficientemente diferenciado. O valor original está em três frentes que a v1 inicial não cobria:

1. Uma agenda que organiza por contexto (cliente/thread/projeto), não só cronologia.
2. Um bloco de notas que nasce ligado à conversa/evento de origem, nunca solto.
3. Um método de organização nativo ao fluxo de comunicação (estado por mensagem, prioridade por relação) em vez de um to-do genérico colado por cima da inbox.

Sem estas três frentes, o produto compete diretamente com ferramentas estabelecidas sem vantagem clara. Com elas, o Z Desk deixa de ser "mais uma inbox unificada" e passa a ter uma tese de produto própria.

## Decision
A v1 passa a incluir, como núcleo (não como roadmap futuro):

- **Estado por mensagem**: cada `desk_message` transporta um estado explícito do fluxo de decisão (`pending_decision`, `awaiting_reply`, `action_pending`, `resolved`), substituindo a noção de prioridade isolada por um ciclo de vida da conversa.
- **Notas ligadas**: nova entidade `desk_notes`, sempre associada a pelo menos uma origem (thread, evento ou contacto) — nunca um documento solto. Suporta transcrição de notas de voz do WhatsApp como origem.
- **Prioridade por relação**: `desk_contacts` passa a guardar sinais de relação (nº de threads, data da última interação, categoria de relação) para a IA ponderar prioridade pelo histórico do contacto, não só pelo texto da mensagem.
- **Eventos do tipo "bloco de follow-up"**: além de reuniões, `desk_events` passa a suportar blocos sugeridos de resposta a threads pendentes, com a mesma disciplina humano-no-loop do ADR-0001 (`source='ai_suggested'`, `status='draft'`).

O princípio do ADR-0001 mantém-se intocado: nada disto autoriza a IA a confirmar sozinha — apenas amplia o que ela pode sugerir e como a informação se organiza.

## Consequences
- O schema de fundação cresce antes de qualquer integração real (Gmail/WhatsApp/Calendar) estar ligada — aceitável, é mais barato agora do que depois de haver dados em produção.
- A v1 deixa de ser um MVP mínimo classicamente enxuto; o critério de "pronto para lançar" passa a incluir estas três frentes, não só o unificador.
- Ganha-se uma tese de produto defensável (razão de existir) em troca de mais superfície a construir antes do primeiro lançamento.
- Decisões de posicionamento de mercado (vertical imobiliário/serviços como cunha inicial, integração com outros verticais ZOS) permanecem como hipóteses não validadas — não fazem parte deste ADR, que é só sobre âmbito técnico da v1.

## Alternatives Considered
- **Manter v1 enxuta, tratar isto como v2**: rejeitada por decisão explícita — o risco de lançar um produto indiferenciado pesou mais do que o risco de atrasar o lançamento.
- **Escolher só 1-2 destas frentes para a v1**: rejeitada — as três frentes reforçam-se mutuamente (estado por mensagem alimenta a agenda por contexto; notas ligadas dependem do grafo thread/evento/contacto já existente), pelo que fazer só uma isolada perderia parte do valor.

---
Nota: este ADR é imutável depois de "Accepted". Uma mudança de direção regista-se como um novo ADR que o substitui — nunca como edição a este ficheiro.
