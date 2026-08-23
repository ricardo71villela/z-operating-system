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

- `src/app/[locale]/` — Next.js (App Router) + next-intl, aplicação web do Z Desk.
- `backend/` — serviço NestJS: webhooks do WhatsApp, sync de e-mail/calendário, filas (BullMQ), camada de IA (triagem e sugestão).
- `supabase/migrations/` — schema reprodutível (tenants, threads, messages, events, integrations, pessoal).
- `docs/architecture/` — decisões e modelo de domínio específicos do Z Desk.

## Idiomas

- 6 idiomas obrigatórios: `fr` (default), `en`, `es`, `pt`, `it`, `de` — mesmo padrão do Z Mobility (`next-intl`, `localePrefix: "always"`)
- `middleware.ts` na raiz — construído corretamente aqui; verificado que **não existe** no Z Mobility (auditado ao copiar o padrão), pelo que a deteção/redireção de idioma lá pode não funcionar sem visita direta a um URL com prefixo
- Traduções em `src/messages/{fr,en,es,pt,it,de}.json` — cobrem a homepage e a vista "Hoje"; as restantes vistas (calendário, tarefas, pessoal) continuam só com mockups HTML em português, ainda não implementadas como código React
- Testado: `next build` gera as 6 rotas (`/fr`, `/en`, `/es`, `/pt`, `/it`, `/de` e as respetivas `/today`) com sucesso

## Gestão de pessoal (ADR-0004 + ADR-0005)

- `desk_work_schedules` — horário semanal recorrente por pessoa (dia + hora início/fim) — o *default*
- `desk_schedule_overrides` — desvio pontual a uma data específica, substitui o padrão só nesse dia
- `desk_absences` — férias/baixa/falta/outro (ver ADR-0007), com intervalo de datas e estado (`requested`/`approved`)
- `desk_schedule_validations` — uma linha por pessoa por semana; um worker diário cria automaticamente a validação `pending` para a semana que começa daqui a 15 dias; validar (`POST /personnel/schedule-validations/:id/validate`) é sempre ação humana, nunca automática
- **Precedência ao resolver um dia** (partilhada entre vista semanal e mapa mensal): ausência aprovada > desvio pontual > padrão recorrente
- `GET /personnel/weekly-view?tenantId=&weekStart=&userId=` — uma semana; sem `userId` devolve o **geral** (todas as pessoas do tenant, tantas quantas existirem em `desk_users` — nunca um número fixo); com `userId`, a vista **individual** dessa pessoa
- `GET /personnel/monthly-map?tenantId=&year=&month=&userId=` — mesmo par geral/individual, à escala do mês; inclui `overtimeTotals` (horas extraordinárias aprovadas do mês, por pessoa — ADR-0006)
- O quadro de pessoal e as vistas de horário partilham a mesma consulta a `desk_users` — adicionar ou remover alguém do tenant reflete-se automaticamente em ambos, sem número codificado
- Deliberadamente sem hierarquia de aprovação, sem calendário de feriados, sem integração com processamento de salários — é gestão de pessoal operacional, não um módulo de RH

### Horas extraordinárias (ADR-0006)

- `desk_overtime_entries` — um lançamento por data, com horas e nota; estado `pending`/`approved`
- Só horas `approved` contam para o total do mês — um lançamento pendente existe mas não é somado
- `POST /personnel/overtime`, `GET /personnel/overtime?tenantId=&userId=&year=&month=`, `POST /personnel/overtime/:id/approve`, `DELETE /personnel/overtime/:id`
- `GET /personnel/overtime/monthly-total` — o mesmo total já embutido em `monthly-map`, disponível também isolado
- Total nunca armazenado, somado no pedido a partir dos lançamentos aprovados — mesmo padrão do resto da gestão de pessoal

### Exportação de horários por WhatsApp + faltas (ADR-0007)

- `desk_users.whatsapp_number` — número pessoal da pessoa, distinto do número de negócio do tenant
- Exportação **automática**: ao validar uma semana (`POST /personnel/schedule-validations/:id/validate`), o horário resultante é enviado por WhatsApp de seguida, best-effort — sem número associado ou sem integração ativa, a validação não falha, o envio é só ignorado
- Reenvio manual: `POST /personnel/schedules/:userId/export-whatsapp`
- Reaproveita a integração WhatsApp já ligada ao tenant como remetente — não cria uma segunda ligação
- `desk_absences.type` estende-se com `falta_justificada` e `falta_injustificada` — distintas de férias/baixa, mesma lógica de contagem para disponibilidade

## Quadro de gestão de tarefas (ADR-0003)

- `desk_tasks` — tarefas pessoais (`task_type='personal'`, `assigned_to = created_by`) e missões atribuídas a colegas (`task_type='mission'`, `assigned_to != created_by`)
- Quadro Kanban de três colunas: `todo`, `in_progress`, `done`
- `POST /tasks`, `GET /tasks?tenantId=&assignedTo=` (agrupado por coluna), `POST /tasks/:id/move`, `POST /tasks/:id/reassign`, `PATCH /tasks/:id`, `DELETE /tasks/:id`
- Independente do estado de mensagem (`desk_messages.state`) por decisão explícita — cobrem coisas diferentes: ciclo de vida de uma conversa vs. trabalho atribuível a alguém

### Mapa de carga cruzado (tarefas + pessoal)

- `GET /personnel/workload-map?tenantId=&weekStart=` — cruza `desk_tasks` (missões abertas/em curso por pessoa) com a disponibilidade da semana (mesma resolução de `weekly-view`)
- Devolve contagens em bruto por pessoa (`tasksOpen`, `tasksInProgress`, `missionsOpen`, `availableDaysThisWeek`, `absentDaysThisWeek`) — **não** um sinalizador "sobrecarregado" pré-calculado; onde fica o limiar (ex.: "2+ missões em curso e ≤2 dias disponíveis") é decisão de produto/UI, não lógica fixa no backend
- Primeira vista do Z Desk que combina duas áreas construídas em separado (ADR-0003 + ADR-0004/0005) sem exigir schema novo

## Auth & isolamento multi-tenant

- RLS ativado em todas as tabelas de domínio, com políticas escritas (`20260823004000_z_desk_rls_policies.sql`) — `desk_current_user_tenant_id()` mapeia a sessão Supabase auth ao tenant via `desk_users`
- `desk_integrations` fica deliberadamente sem políticas de cliente — contém `oauth_tokens`; só o backend (service-role key) lhe acede
- `POST /auth/bootstrap-tenant` — cria o primeiro tenant + utilizador `owner` para uma sessão Supabase auth nova; idempotente
- Convite de novos membros para um tenant existente ainda não está construído (TODO)

## Integrações previstas na v1

- E-mail: Gmail API + Microsoft Graph API (OAuth2, polling a cada 5 min — push/webhooks fica para depois)
- WhatsApp: Meta WhatsApp Business Cloud API (webhook para receber, Cloud API para enviar — ver ADR-0007)
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
