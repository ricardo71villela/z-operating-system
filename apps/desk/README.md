# Z Desk — LEGACY CLAUDE FOUNDATION — NOT ZOS AUTHORITY

> **ARCHIVED PROVENANCE ONLY — DO NOT MERGE THIS BRANCH.**
>
> This branch (`feature/z-desk-foundation`) is the historical Claude-developed Z Desk foundation created from an old `main` authority. Its original pre-notice tip is preserved at `archive/zdesk-claude-foundation-20260823`.
>
> The canonical Z Desk integration authority is `feature/zdesk-zos-convergence-v1`, tracked by Issue #60 and `apps/desk/docs/ZOS-INTEGRATION-AUDIT-2026-08-23.md` on that branch.
>
> In particular, do not carry `desk_tenants` / `desk_users`, caller-trusted `tenantId` / `createdBy`, Desk-local migration authority, or the old root workspace/lockfile changes directly into ZOS. They must be converged with canonical `zos.persons`, `zos.organisations`, `zos.memberships`, integrated migrations and session-derived authorization first.

---

# Historical Z Desk source description

Z Desk é a agenda unificada da ZOS: caixa de entrada única (e-mail + WhatsApp) fundida com um motor de calendário, notas sempre ligadas à conversa que as originou, e um método de organização nativo ao fluxo de comunicação — não um to-do genérico colado por cima da inbox. Produto B2B — dirigido a equipas e profissionais que gerem comunicação e agenda através de múltiplos canais.

## Razão de existir (não é "mais uma inbox unificada")

- **Agenda por contexto**: organiza por cliente/thread/projeto, não só por cronologia.
- **Notas que nascem ligadas**: uma nota de reunião nasce já amarrada à thread/evento/contacto que a originou — nunca um documento solto (`desk_notes`, ver ADR-0002).
- **Estado por mensagem, não to-do genérico**: cada mensagem tem um estado explícito do ciclo de decisão (`pending_decision`, `awaiting_reply`, `action_pending`, `resolved`).
- **Prioridade por relação**: cruza o histórico do contacto (`desk_contacts.relationship_tier`) com o conteúdo da mensagem — "urgente" de um cliente recorrente pesa diferente de "urgente" de um lead frio.
- **Blocos de follow-up sugeridos**: além de reuniões, a IA sugere blocos de agenda para threads pendentes há muito tempo (`desk_events.event_type = 'follow_up_block'`), com a mesma disciplina humano-no-loop.

Ver `docs/architecture/ADR-0002-v1-scope-expansion.md` para o histórico desta decisão.

## Arquitetura

```text
Gmail API / Microsoft Graph API ──┐
                                   ├──▶ Sync Workers (BullMQ) ──▶ Thread (canal unificado)
WhatsApp Cloud API (webhook) ─────┘                                     │
                                                                         ▼
                                                          AI Triage (sumarização, prioridade,
                                                          deteção de intenção de reunião,
                                                          confidence_score)
                                                                         │
                                                                         ▼
                                                          Event Draft (sugestão) ──▶ confirmação humana ──▶ Event
                                                                         │
                                                                         ▼
                                                  Calendar Engine (fonte de verdade) ◀──sync──▶ Google/Outlook Calendar
                                                                         │
                                                                         ▼
                                                              Z Desk aplicações (web)
```

Decisão de fundação (ver `docs/architecture/ADR-0001`): v1 opera em modo **humano-no-loop** — a IA sugere, nunca marca sozinha. O schema já guarda `confidence_score` por sugestão, preparando a evolução futura para autonomia parcial sem remodelar dados.

## Estrutura do projeto

- `src/app/[locale]/` — Next.js (App Router) + next-intl, aplicação web do Z Desk.
- `backend/` — serviço NestJS: webhooks do WhatsApp, sync de e-mail/calendário, filas (BullMQ), camada de IA (triagem e sugestão).
- `supabase/migrations/` — schema reprodutível histórico do protótipo (não é a autoridade integrada ZOS).
- `docs/architecture/` — decisões e modelo de domínio específicos do Z Desk.

## Idiomas

- 6 idiomas: `fr` (default), `en`, `es`, `pt`, `it`, `de`.
- As vistas históricas incluem Home, Hoje, Calendário, Gestão de tarefas e Pessoal.

## Auth & isolamento multi-tenant — histórico, não autoridade atual

Esta branch contém `desk_tenants`, `desk_users` e RLS próprios. Estes elementos são **fonte histórica** e precisam de convergência para as autoridades canónicas ZOS antes de integração.

## Integrações históricas

- E-mail: Gmail API + Microsoft Graph API.
- WhatsApp: Meta WhatsApp Business Cloud API.
- Calendário: Google Calendar API + Microsoft Graph Calendar API.
- OAuth/token, autorização por organização e calendar callbacks exigem hardening conforme Issue #60.

## Local setup histórico

```bash
npm install
npm run dev
npm run dev --prefix backend
```

Credenciais privilegiadas e segredos OAuth nunca devem ser expostos ao browser.
