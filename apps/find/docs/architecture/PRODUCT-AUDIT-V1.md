# Z FIND — PRODUCT AUDIT V1

**Autor:** Claude, no papel de fundador técnico / CPO / CTO / Chief UX Designer / Chief Data Architect.
**Estado:** Documento estratégico. Zero código, zero migrations, zero componentes.

---

## 0. Antes do diagnóstico: onde vou concordar sem reservas, e onde vou discordar de propósito

Vou fazer a auditoria brutal que pediste — sem diplomacia, sem proteger trabalho que fiz eu próprio. Mas uma auditoria honesta também tem de dizer não a partes do que pediste, ou não é honesta, é só entusiasmo. Duas coisas ficam claras já:

**Concordo sem reservas com a correção de perspetiva mais importante deste briefing:** construí o Z Find quase inteiramente do lado do comprador (pesquisa, página de imóvel, contacto) e do lado do operador interno (Admin). **Não construí nada, em nenhum momento, do lado de quem paga.** Uma agência, promotor ou fundo não tem hoje nenhuma razão específica para escolher o Z Find em vez do Idealista, porque a plataforma nunca lhes ofereceu nada que o Idealista não ofereça também. Isto é o diagnóstico mais importante deste documento, e vem primeiro.

**Vou discordar abertamente de partes da lista "sem limites".** Nomeadamente: avaliação automática, score de investimento, yield, TIR, cash-flow, e previsão de valorização, construídos como estão descritos (automáticos, imediatos, sem base de dados de transações reais) — não são um diferenciador, são um risco reputacional. Um analista da JLL ou da CBRE tem o próprio modelo de underwriting; mostrar-lhe um número automático e não fundamentado destrói confiança instantaneamente, não constrói. Explico isto em detalhe na secção 7. Não é recusa por preguiça — é a mesma pergunta que o próprio mandato pede que eu aplique: "esta decisão continuará correta daqui a 10 anos?" Um número de investimento errado, mostrado a um fundo, não é recuperável com uma correção depois.

---

## 1. Diagnóstico Completo

### O produto que existe hoje, com precisão

- **Portal público**: Homepage, Pesquisa, Página de Imóvel, Página de Empreendimento, Página de Parceiro, fluxo de contacto (direto/qualificado/assistido) — tudo ligado a dados reais do Supabase.
- **Admin interno**: CRUD de propriedades, empreendimentos, parceiros, gestão de fotos, traduções, publicar/despublicar, leads (só leitura). Crítica de UX já entregue em documento separado (`ADMIN-EXPERIENCE-REDESIGN.md`).
- **Ninguém externo à equipa Z Find tem qualquer acesso à plataforma além de: visitantes anónimos (portal público) e a própria equipa (Admin).**

Esta última frase é o diagnóstico central. Não existe hoje **nenhum** produto para o cliente que paga.

---

## 2. Tudo o que está errado

1. **Não existe portal do parceiro.** `profiles.role` já modela `'partner_user'` desde a Migration 0002 — a intenção sempre existiu, nunca foi construída. Uma agência não pode entrar, ver os seus próprios imóveis, editar, ver leads recebidos, ou ver desempenho. Isto sozinho torna impossível vender a "Grandes redes imobiliárias" ou "Fornecedores de CRM" — o topo da tua própria lista de clientes.
2. **Zero SEO real.** Confirmado e documentado no Sprint 1.4: sem JSON-LD, sem canonical, sem hreflang, sem breadcrumbs, sem meta description dinâmica. Para uma plataforma cuja vantagem competitiva depende de tráfego orgânico atrair ambos os lados do mercado, isto é grave — e o custo de o adiar aumenta todos os meses (SEO é composto, não linear).
3. **Zero analytics para o anunciante.** Uma agência não vê quantas pessoas viram o seu anúncio, quantos guardaram, qual a taxa de conversão em contacto. Isto é o mínimo que qualquer portal profissional oferece hoje — sem isto, nunca haverá argumento para pagar mais do que o Idealista cobra.
4. **Zero mecanismo de destaque pago.** `listings.channel` distingue `standard`/`offmarket`, mas não existe "premium", "destaque", ou qualquer conceito de posição paga — o próprio modelo de negócio descrito no briefing (anúncios, destaques, subscrições) não tem hoje nenhum lugar para viver no esquema de dados.
5. **Zero deteção de duplicados.** Cada imóvel é inserido manualmente via Admin, um a um. Não há mecanismo nenhum que impeça duas agências de publicarem o mesmo imóvel físico como dois anúncios distintos — um problema estrutural do mercado português que o briefing identifica corretamente como prioritário.
6. **Zero documentos anexos.** Já identificado no documento de Admin — sem lugar para plantas, certidões energéticas, cadernos de encargos.
7. **Zero API ou integração com CRM.** Para "Fornecedores de CRM" (prioridade 3 da tua lista), não existe nenhuma superfície de integração — nem importação, nem exportação, nem webhook.
8. **`readiness_score` existe no esquema desde a Migration 0001, nunca implementado** (comentário explícito no código: "Listing Quality Engine scoring, NOT implemented yet"). A intenção de pontuar qualidade antes de publicar já estava desenhada — falta construir.
9. **Sem noção de resposta/tempo de resposta do parceiro.** Um lead é registado, mas nada mede se o parceiro respondeu, em quanto tempo, ou se converteu. Portais profissionais vendem isto como valor central.

---

## 3. Tudo o que está em falta (construído do zero, não corrigido)

- **Portal do Parceiro** — login próprio (já existe `partner_user` no schema), os seus próprios imóveis/empreendimentos, leads recebidos, desempenho, faturação.
- **Camada de monetização** — pacotes de anúncio, destaques pagos, subscrição profissional, ligados a `partners` (que já tem `status`, `enquiry_policy` — falta o resto).
- **Deteção de duplicados** — ver secção 6, é o item que o briefing marca como obrigatório, e concordo que deve ser prioritário.
- **SEO real** — implementação completa, não os "melhoramentos de baixo custo" que ficaram deliberadamente fora de âmbito no Sprint 1.4/1.5.
- **Analytics de anúncio** — vistas, guardados, taxa de conversão, por listing e agregado por parceiro.
- **Documentos anexos** — reutilizando a mesma infraestrutura de storage já existente para fotos.
- **Quality Score antes de publicar** — usa a coluna `readiness_score` já prevista, define os critérios (fotos mínimas, descrição mínima, traduções completas, preço definido).

---

## 4. Tudo o que deve desaparecer

Sinceramente, pouco. O que já existe está, na sua maioria, bem desenhado (ver secção 6). O que deveria desaparecer não é código, é **hábito de processo**: a disciplina "Sprint 1.X, uma tarefa técnica de cada vez, sem parar para perguntar se é o produto certo" que já identificámos juntos como o erro estrutural dos Sprints 1.1–1.7. Não é uma tabela para apagar — é a forma como decidimos o que construir a seguir.

---

## 5. Tudo o que deve ser reconstruído

- **O Admin** — já coberto em detalhe no documento anterior (`ADMIN-EXPERIENCE-REDESIGN.md`). Não repito aqui.
- **O modelo de "quem é o utilizador"** — hoje o sistema só conhece "admin" e "visitante anónimo". Precisa de reconhecer genuinamente "parceiro autenticado" como um terceiro papel de primeira classe, não um valor de enum nunca usado.

---

## 6. Tudo o que deve permanecer (dito com a mesma honestidade que o resto)

- **`representations`/`listings` separados** — desenho correto, permite exatamente a camada de monetização que falta (um `listing` pode ganhar um "tier" sem tocar no ativo em si).
- **`listing_content` multilíngue** — já pronto para PT/EN/FR, extensível por INSERT.
- **`media_assets`/`media_variants`/storage assinado** — infraestrutura sólida, correta, reutilizável para documentos e para o portal do parceiro sem alteração.
- **`enquiry_policy` (direct/qualified/assisted)** — isto é, na verdade, um diferenciador genuíno já construído e subutilizado: nenhum portal português oferece hoje um mecanismo de contacto "assistido" desenhado como camada de qualificação. Vale a pena destacar isto no marketing, não só na engenharia.
- **`packages/geography/`** — modelo multi-país já pensado corretamente, só não ligado à base de dados ainda (ver documento anterior).
- **`packages/import-engine/matching-policy.js`** — nota de precisão: isto resolve correspondência de **entidades geográficas** durante importação (ex: reconciliar "Porto" vindo de duas fontes de dados diferentes), não deteção de imóveis duplicados. É um padrão de engenharia reutilizável e bem pensado, mas não é o motor de dedup que o briefing pede — esse teria de ser construído de raiz, informado pelo mesmo rigor de "corroboração exige revisão manual" que este módulo já demonstra.

---

## 7. Onde discordo da lista "sem limites" — com justificação, não recusa vaga

| Pedido | Posição |
|---|---|
| Avaliação automática, score de investimento, TIR, yield, cash-flow, previsão de valorização | **Não construir agora, como descrito.** Sem uma base de dados de transações reais e comparáveis verificados, qualquer número automático mostrado a um fundo ou consultora é um risco de credibilidade, não um ganho. A versão certa disto vem depois de existir dados reais suficientes para ser honesto — construir a fachada antes dos dados é o erro que este mandato me pede explicitamente para evitar. |
| Simuladores IMT/financiamento/AL/BTR/PBSA | **Construir só o IMT primeiro** (Portugal, regras públicas, fórmula conhecida, zero risco de estar "quase certo"). Os restantes dependem de pressupostos financeiros que variam por instituição — publicá-los errados é pior do que não os ter. |
| IA para descrições/títulos/traduções | **Diferenciador fraco.** Todos os concorrentes já têm ou vão ter uma versão disto em breve — não é isto que faz uma agência mudar de portal. Vale construir por eficiência interna (menos tempo a preencher), não como argumento comercial. |
| IA aplicada a routing de leads / deteção de duplicados | **Diferenciador real.** Aqui a IA aplica-se a um problema que os concorrentes portugueses não resolvem bem — vale investir aqui primeiro, não em geração de texto. |
| Quality Score antes de publicar | **Concordo, e a base já existe** (`readiness_score`). Prioridade alta, custo baixo. |
| Duplicados | **Concordo, é o item certo a priorizar.** Ver secção 6 para a distinção com o que já existe. |

---

## 8. Prioridades por Impacto Comercial

| # | Item | Porquê é o mais urgente |
|---|---|---|
| 1 | **Portal do Parceiro** (login, os seus imóveis, leads, desempenho básico) | Sem isto, não há produto nenhum para o cliente que paga — é o pré-requisito de tudo o resto na lista de clientes. |
| 2 | **SEO real** | Composto ao longo do tempo — cada mês de atraso é tráfego orgânico permanentemente perdido. |
| 3 | **Analytics de anúncio para o parceiro** | É o argumento comercial mais direto para justificar preço acima do Idealista. |
| 4 | **Quality Score antes de publicar** | Custo baixo (coluna já existe), sinal de profissionalismo imediato. |
| 5 | **Deteção de duplicados** | Alto valor percebido, mas exige desenho cuidadoso — não é uma tarde de trabalho. |
| 6 | **Camada de monetização** (destaques, pacotes) | Sem receita não há negócio — mas só faz sentido depois de haver parceiros ativos a usar o portal próprio (item 1). |
| 7 | **Documentos anexos** | Alto valor para fundos/promotores especificamente, baixo custo de construção (reutiliza infraestrutura existente). |
| 8 | **API/CRM** | Importante para o topo da lista de clientes, mas só depois de haver produto suficientemente maduro para valer a pena integrar. |

---

## 9. Roadmap

**Fase 1 — Fundação para quem paga.** Portal do Parceiro (login, os seus ativos, leads, desempenho básico). Sem isto, nada do resto do modelo de negócio descrito no briefing tem onde viver.

**Fase 2 — Compostos ao longo do tempo.** SEO real. Começa a valer a partir do dia em que é lançado, cada mês de atraso é permanente.

**Fase 3 — Argumento comercial direto.** Analytics de anúncio + Quality Score — dão à agência uma razão concreta para preferir o Z Find, mensurável desde o primeiro dia de uso.

**Fase 4 — Diferenciador estrutural.** Deteção de duplicados, desenhada com o mesmo rigor de "corroboração exige revisão humana" que já existe em `matching-policy.js`.

**Fase 5 — Receita.** Camada de monetização (destaques, pacotes, subscrições), agora com parceiros ativos e dados de desempenho reais para justificar preço.

**Fase 6 — Expansão.** Documentos anexos, API/CRM, ligação da Geography completa a um segundo país — nesta ordem, cada um só quando o anterior já estiver a gerar valor real, não antes.

---

## Nota final

Este documento diz que sim a muito do que pediste, e diz que não a uma parte específica e justificada. Isso é intencional — é exatamente o mandato que me deram: não proteger trabalho feito, mas também não validar tudo sem crítica. Se preferires que eu desenvolva primeiro qualquer uma destas fases em detalhe técnico, digo-o claramente antes de escrever código.
