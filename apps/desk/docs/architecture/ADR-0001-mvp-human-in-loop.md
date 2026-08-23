# ADR-0001: Z Desk v1 opera em modo humano-no-loop, com schema preparado para autonomia parcial

## Status
Accepted

## Date
2026-08-23

## Context
Z Desk propõe-se a unificar e-mail e WhatsApp numa só caixa de entrada e sugerir/marcar compromissos com IA a partir dessas mensagens. Existem dois níveis possíveis de automação na v1:

- **Humano-no-loop**: a IA sugere um evento; o utilizador confirma sempre antes de ser criado no calendário.
- **Autonomia parcial**: a IA marca sozinha quando a confiança na interpretação é alta, escalando para confirmação apenas em casos ambíguos.

O público-alvo é B2B — confiança do cliente profissional é crítica desde o primeiro contacto com o produto. Marcar um compromisso errado sozinha tem custo reputacional desproporcional ao benefício de poupar um clique nesta fase.

## Decision
A v1 do Z Desk lança em modo humano-no-loop: a IA nunca cria um evento sem confirmação explícita do utilizador. Cada sugestão de evento é persistida com um `confidence_score`, mesmo não sendo usado para decisão autónoma nesta fase — apenas para instrumentação e para preparar a evolução futura sem remodelar o schema.

## Consequences
- Reduz risco de erro visível ao cliente na fase de validação do produto.
- Permite lançar mais depressa (menos superfície de testes de segurança/confiança na IA).
- Adia o argumento de venda "a agenda organiza-se sozinha" para uma fase posterior.
- A introdução futura de autonomia parcial (ADR subsequente) não exige migração de dados, apenas mudança de política de decisão sobre o campo já existente.

## Alternatives Considered
- **Autonomia parcial desde a v1**: rejeitada nesta fase — exigiria motor de scoring de confiança validado, logs de decisão auditáveis e mecanismo de desfazer robusto antes de qualquer exposição a clientes reais, atrasando o lançamento sem validação prévia do unificador em si.
- **Sem sugestão nenhuma (apenas caixa unificada, sem IA)**: rejeitada — perde-se a proposta de valor diferenciadora face a um cliente de e-mail/WhatsApp comum.

---
Nota: este ADR é imutável depois de "Accepted". Uma mudança de direção regista-se como um novo ADR que o substitui — nunca como edição a este ficheiro.
