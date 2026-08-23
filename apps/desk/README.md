# Z Desk

Z Desk é a agenda unificada da ZOS: caixa de entrada única (e-mail + WhatsApp) fundida com um motor de calendário, com IA a fazer triagem, sumarização e sugestão de compromissos. Produto B2B — dirigido a equipas e profissionais que gerem comunicação e agenda através de múltiplos canais.

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

## Multi-tenant

Cada tenant representa uma organização (equipa/empresa cliente). Todas as tabelas de domínio referenciam `tenant_id`; nenhuma query de aplicação deve atravessar tenants.

## Integrações previstas na v1

- E-mail: Gmail API + Microsoft Graph API (OAuth2)
- WhatsApp: Meta WhatsApp Business Cloud API (webhook)
- Calendário: Google Calendar API + Microsoft Graph Calendar API (sync bidirecional)

## Local setup

```bash
npm install
cp .env.example .env.local   # se aplicável
npm run dev            # frontend (apps/desk)
npm run dev --prefix backend  # backend NestJS
```

Credenciais de service-role do Supabase e segredos OAuth (Google/Microsoft/Meta) são exigidos apenas no backend — nunca expostos ao browser.
