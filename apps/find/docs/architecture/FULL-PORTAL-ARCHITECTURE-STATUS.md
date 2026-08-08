# Z Find — Estado Real vs. Arquitetura Completa de Portal

**Como este documento foi feito:** cada afirmação "existe"/"não existe" foi verificada diretamente contra o código e o schema reais nesta sessão — não é memória, é `grep` contra ficheiros reais. Onde não tenho certeza, digo.

---

## 1. Frontend Público

| Item | Estado |
|---|---|
| Pesquisa, filtros | ✅ Feito — Sprint 1.3, com dedup real |
| Detalhe do imóvel/empreendimento | ✅ Feito |
| Mapas | ❌ **Não existe.** Migration 0005 já tem `latitude`/`longitude` em `properties`, mas nenhuma UI de mapa foi construída — nem no site público nem no Admin. |
| **Autenticação e perfis (visitante/comprador)** | ❌ **Não existe.** Confirmei agora: o botão "SIGN IN" no site público é **decorativo** — HTML puro, zero JavaScript associado. `profiles.role` só aceita `'admin'` ou `'partner_user'`; não há papel de "comprador" no schema. |
| SEO | ✅ Feito — páginas estáticas, JSON-LD, hreflang |
| Performance | ⚠️ Nunca medido/otimizado a sério (Lighthouse, etc.) — funcional, não validado |
| Mobile-first | ⚠️ Responsivo por CSS geral, nunca testado/desenhado mobile-first deliberadamente |

## 2. Partner Dashboard (Portal do Parceiro)

| Item | Estado |
|---|---|
| Gestão de imóveis (CRUD) | ⚠️ **Existe, mas só no Admin interno** — nenhum parceiro externo consegue lá entrar. `is_own_partner()` foi criada na Migration 0004, **nunca ligada a nenhuma política RLS real**. |
| Leads, mensagens, pipeline | ⚠️ Leads existem e têm dados reais; **mensagens/pipeline não existem** — hoje é só lista + estado (novo/contactado/fechado). |
| Estatísticas e relatórios | ❌ Não existe nada, nem para admin nem para parceiro. |
| Permissões de equipa | ❌ Não existe — `partner_user` é um papel único, sem granularidade dentro de um parceiro. |

**Este continua a ser o maior item em falta**, exatamente como identificado desde o início.

## 3. Buyer Portal

| Item | Estado |
|---|---|
| Registo de compradores | ❌ Não existe (ver Autenticação acima) |
| Alertas personalizados | ❌ Não existe — confirmei, zero menção a "alert"/"saved search" no schema |
| Favoritos e listas | ❌ Não existe — zero menção a "favorite"/"watchlist" no schema |
| Mensagens com parceiros | ❌ Não existe |

**Nada disto foi construído.** Zero por cento.

## 4. Ad Engine

| Item | Estado |
|---|---|
| Destaques, premium, boost | ⚠️ `listings.tier` existe (`standard`/`featured`), mas é **só uma coluna vazia** — nenhuma lógica de negócio, nenhuma UI, nenhum efeito real na pesquisa/ordenação. |
| Orçamentos, segmentação, duração | ❌ Não existe |
| Tracking (impressões, cliques, leads) | ❌ Não existe — leads em si existem, mas sem tracking de impressões/cliques a montante |
| Integração com Partner Dashboard | ❌ N/A, o Partner Dashboard em si não existe |

## 5. CRM Integration Layer

| Item | Estado |
|---|---|
| Sincronização de imóveis/leads/mensagens | ❌ Não existe |
| Conectores modulares | ❌ Não existe |
| Webhooks + API REST + filas | ❌ **Nada disto existe.** Confirmei agora: zero menção a webhook/fila/RabbitMQ/Kafka em todo o código real (só um comentário antigo, já removido, sobre um webhook *futuro* para regenerar páginas SEO). |
| Logs e gestão de conflitos | ❌ Não existe |

**Esta camada inteira está a zero.** Era já sabido (`PRODUCT-AUDIT-V1.md`: "Fornecedores de CRM" é prioridade 3 da lista de clientes, mas sem nenhuma superfície de integração), mas vale a pena dizê-lo aqui sem rodeios.

## 6. Backoffice

| Item | Estado |
|---|---|
| Administração da plataforma | ✅ Feito — o Admin que construímos, com a taxonomia completa de campos |
| Auditoria e controlo de qualidade | ❌ Não existe — sem logs de quem mudou o quê |
| Monitorização de campanhas | ❌ N/A, não há campanhas (Ad Engine não existe) |
| Gestão de integrações | ❌ N/A, não há integrações (CRM Layer não existe) |

## 7. Backend/API Layer

| Item | Estado |
|---|---|
| Endpoints REST gerais | ✅ Via Supabase PostgREST automático (não construído à mão, mas funcional e real) |
| `/ads`, `/crm-sync`, `/crm-webhooks` | ❌ Não existem — não há necessidade de os construir enquanto o Ad Engine e o CRM Layer não existirem |
| AdService, CRMConnectorService, SyncOrchestrator | ❌ Não existem, mesma razão |
| Filas (RabbitMQ/Kafka) | ❌ Não existe nenhuma infraestrutura de filas — tudo é síncrono hoje |
| Autenticação JWT + RBAC | ⚠️ Existe via Supabase Auth (JWT nativo) + RLS (que faz o papel de RBAC ao nível da base de dados) — funcional para Admin, **nunca desenhado para múltiplos papéis de comprador/parceiro/equipa** |

---

## Resumo honesto, sem otimismo

Das 7 camadas listadas, **2 estão genuinamente avançadas** (Frontend Público, Backoffice/Admin), **1 está parcial** (Backend/API, via Supabase), e **4 estão a zero ou quase zero** (Partner Dashboard como portal externo, Buyer Portal, Ad Engine, CRM Integration Layer).

O Z Find de hoje é, com precisão: **um portal de pesquisa público bem construído + uma ferramenta de gestão interna bem construída**. Tudo o resto desta lista — o que transforma isto num portal imobiliário completo, self-service, com monetização e integrações — está por fazer.
