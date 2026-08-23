# Z Desk

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

- `src/` — Next.js (App Router) + next-intl, aplicação web do Z Desk.
- `backend/` — serviço NestJS: webhooks do WhatsApp, sync de e-mail/calendário, filas (BullMQ), camada de IA (triagem e sugestão).
- `supabase/migrations/` — schema reprodutível (tenants, threads, messages, events, integrations).
- `docs/architecture/` — decisões e modelo de domínio específicos do Z Desk.

## Quadro de tarefas (ADR-0003)

- `desk_tasks` — tarefas pessoais (`task_type='personal'`, `assigned_to = created_by`) e missões atribuídas a colegas (`task_type='mission'`, `assigned_to != created_by`)
- Quadro Kanban de três colunas: `todo`, `in_progress`, `done`
- `POST /tasks`, `GET /tasks?tenantId=&assignedTo=` (agrupado por coluna), `POST /tasks/:id/move`, `POST /tasks/:id/reassign`, `PATCH /tasks/:id`, `DELETE /tasks/:id`
- Independente do estado de mensagem (`desk_messages.state`) por decisão explícita — cobrem coisas diferentes: ciclo de vida de uma conversa vs. trabalho atribuível a alguém

- RLS ativado em todas as tabelas de domínio, com políticas escritas (`20260823004000_z_desk_rls_policies.sql`) — `desk_current_user_tenant_id()` mapeia a sessão Supabase auth ao tenant via `desk_users`
- `desk_integrations` fica deliberadamente sem políticas de cliente — contém `oauth_tokens`; só o backend (service-role key) lhe acede
- `POST /auth/bootstrap-tenant` — cria o primeiro tenant + utilizador `owner` para uma sessão Supabase auth nova; idempotente
- Convite de novos membros para um tenant existente ainda não está construído (TODO)

## Integrações previstas na v1

- E-mail: Gmail API + Microsoft Graph API (OAuth2, polling a cada 5 min — push/webhooks fica para depois)
- WhatsApp: Meta WhatsApp Business Cloud API (webhook)
- Calendário: Google Calendar API + Microsoft Graph Calendar API (pull a cada 5 min + push no momento da confirmação humana de um evento)

### Onboarding de integrações

- `POST /integrations/whatsapp/connect` — liga um número (token gerado manualmente no Meta Business Manager; Embedded Signup fica para depois)
- `GET /integrations/email/{gmail,microsoft}/authorize` → `callback` — OAuth completo, cria/atualiza a linha em `desk_integrations`
- `GET /integrations/calendar/{google,microsoft}/authorize` → `callback` — OAuth iniciado; troca de código por token ainda por implementar (`TODO` explícito no controller)

### Fluxo de eventos

- IA sugere (`desk_events.status='draft'`) — nunca confirma sozinha (ADR-0001)
- `POST /events/:id/confirm` — ação humana; dispara push para o(s) calendário(s) externo(s) ligado(s)
- `POST /events/:id/reject` — cancela a sugestão
- Eventos vindos de fora (`source='external_sync'`) entram já confirmados — não há nada para o humano decidir num evento que já existe no calendário real

## Local setup

```bash
npm install
cp .env.example .env.local   # se aplicável
npm run dev            # frontend (apps/desk)
npm run dev --prefix backend  # backend NestJS
```

Credenciais de service-role do Supabase e segredos OAuth (Google/Microsoft/Meta) são exigidos apenas no backend — nunca expostos ao browser.
