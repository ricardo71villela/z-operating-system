# Z Find Admin — Experience Redesign

**Autor:** Claude, no papel de CPO/CTO/Chief Data Architect.
**Estado:** Documento técnico e de produto. Zero código, zero migrations.
**Pergunta que orienta tudo:** *Este Admin parece uma plataforma que custa milhões de euros, ou parece um CRUD técnico?*

**Resposta honesta, sem filtro: parece um CRUD técnico.** Construí-o eu, no Sprint 1.7, deliberadamente assim — "poucos cliques, zero animação desnecessária" era a instrução explícita do brief nessa altura, e cumpri-a à letra. Mas cumprir a instrução à letra foi, em si, um erro de julgamento meu: entendi "rapidez" como "ausência de design", quando rapidez e qualidade visual não são opostos. Este documento corrige isso.

---

## 1. Abrir o Admin pela primeira vez — o que um parceiro da JLL veria

Login: um formulário centrado, 360px, sombra subtil, sem logótipo, sem marca, sem nada que diga "isto é o Z Find". Depois do login: uma barra lateral preta, texto cinzento, sem ícones — parece um painel de administração de um fórum phpBB de 2008, não uma plataforma imobiliária de investimento.

As tabelas são `<table>` HTML puras, com `border-bottom` e `background:#fafafa` no hover. Zero hierarquia visual. Zero indicação de que "publicado" é bom e "draft" precisa de atenção, além de uma etiqueta verde/cinzenta minúscula.

**Isto não sobreviveria a 90 segundos numa reunião com a Savills.** Não porque a funcionalidade esteja errada — está — mas porque a primeira impressão de um Admin *é* a primeira impressão da plataforma inteira, e este Admin comunica "protótipo interno", não "software que vale a pena licenciar".

---

## 2. Desmontagem completa, área a área

### 2.1 — Navegação
**Hoje:** 5 links de texto numa coluna preta, sem agrupamento, sem indicação de onde estás para além de uma classe `.active` quase impercetível.
**Problema:** não há hierarquia entre "coisas que uso todos os dias" (Leads, Propriedades) e "coisas que configuro raramente" (Parceiros). Não há atalho, não há pesquisa global, não há contexto (nome do utilizador logado, nome da organização).
**Redesenho:** navegação em duas zonas — *Operação diária* (Dashboard, Propriedades, Empreendimentos, Leads) e *Configuração* (Parceiros) — separadas visualmente. Cabeçalho com o nome de quem está logado e um atalho de pesquisa global (⌘K), que qualquer utilizador de software profissional já espera existir em 2026.

### 2.2 — Editor de Propriedades
**Hoje:** uma única coluna vertical — bloco "Details" (subtype/tipologia/área/piso/zona), depois separadores de idioma PT/EN/FR empilhados por baixo, depois a grelha de fotos por baixo disso. Tudo em scroll vertical infinito, sem noção de progresso nem de secções.
**Problema:** um utilizador que gere 200 propriedades vai fazer este scroll centenas de vezes por semana. Não há indicação visual de "o que falta preencher antes de poder publicar". Não há preview de como a propriedade vai aparecer no site público.
**Redesenho:** editor em separadores horizontais fixos no topo — *Detalhes* | *Traduções* | *Fotos* | *Publicação* — cada um com um indicador de completude (✓ ou contagem de campos em falta). Painel lateral fixo (não scroll) com um preview em miniatura do cartão como aparece na Pesquisa pública, atualizado em tempo real à medida que se edita.

### 2.3 — Editor de Empreendimentos
**Hoje:** exatamente a mesma estrutura de Propriedades, sem nada que reconheça que um empreendimento tem uma dimensão que uma propriedade não tem — a lista de unidades.
**Problema:** a tabela de unidades existe (herdada do site público), mas no Admin não há forma de a gerir a partir daqui — criar uma unidade nova dentro de um empreendimento obriga a sair para "Propriedades" e ligar manualmente pelo campo `development_id`. Isto é um fluxo de trabalho invertido para quem gere um empreendimento com 40 unidades.
**Redesenho:** separador dedicado *Unidades* dentro do editor de Empreendimento, com criação em massa (mesma tipologia repetida N vezes, ex. "criar 8 unidades T2 do piso 3 ao 10") e visão de progresso de publicação por unidade (quantas publicadas, quantas em rascunho) num único relance.

### 2.4 — Separadores e grupos de campos
**Hoje:** os três idiomas partilham o mesmo `.detail-panel`, escondidos via `display:none`, sem indicação de quais têm conteúdo preenchido e quais estão vazios.
**Redesenho:** cada separador de idioma mostra um badge (✓ completo / ⚠ incompleto / vazio) — um promotor internacional que só preenche inglês precisa de ver isso de relance, não de clicar nos três separadores para descobrir.

### 2.5 — Fluxo de criação
**Hoje:** "+ New property" abre um formulário inline minúsculo por cima da lista, com 4 campos, "Create", e depois — silêncio. O utilizador tem de clicar na linha nova na tabela para continuar a preencher.
**Problema:** isto é dois passos desconexos disfarçados de um. Nenhuma plataforma profissional faz um utilizador "adivinhar" que precisa de clicar outra vez para continuar o que acabou de começar.
**Redesenho:** um wizard de criação em 3 passos claros — *Tipo e localização* → *Detalhes e preço* → *Fotos e publicação* — com a opção de sair a meio e retomar depois (o registo já existe em rascunho desde o passo 1), mas sem o "buraco" de UX atual entre criar e continuar.

### 2.6 — Anexar documentos
**Hoje: não existe.** Não há forma de anexar uma planta, uma certidão energética, um caderno de encargos. Para um fundo ou promotor, isto é frequentemente mais crítico do que as fotos.
**Redesenho:** um separador *Documentos* por propriedade/empreendimento, com upload simples (reutilizando exatamente o mesmo mecanismo de storage já existente para fotos — não é uma segunda infraestrutura), categorizado por tipo (planta, certidão, licença), com controlo de visibilidade (interno vs. anexo ao site público).

### 2.7 — Gestão de Media
**Hoje:** funcionalmente correto — upload, arrastar para reordenar, definir capa, eliminar. Isto é o que já funciona bem no back-end.
**Problema visual:** miniaturas de 110×80px numa grelha `flex-wrap` sem espaçamento generoso, sem lightbox para ver em tamanho real, sem indicação de peso/dimensões do ficheiro, sem aviso se uma foto tem resolução baixa demais para um anúncio de luxo.
**Redesenho:** grelha maior, com lightbox ao clicar, indicador de resolução (com aviso visual se abaixo de um mínimo recomendado), e um estado de "a processar" claro durante o upload em vez do atual `showStatus('success', 'Uploading…')` genérico.

### 2.8 — Gestão de Traduções
**Hoje:** dois campos (título, descrição) por idioma, texto simples, sem contagem de caracteres, sem indicação de SEO (ex: título demasiado longo para um resultado de pesquisa Google).
**Redesenho:** contador de caracteres com aviso quando ultrapassa o recomendado para SEO, e — mais importante — um botão "traduzir automaticamente a partir de X" como ponto de partida (nunca publicação automática, sempre revisão humana antes de publicar) para acelerar preencher os 3 idiomas em vez de escrever três vezes do zero.

### 2.9 — Experiência para um promotor
**Hoje:** o Admin trata um promotor institucional exatamente da mesma forma que trata uma agência de uma pessoa só. Não há dashboard de portfolio ("as tuas 4 empreendimentos, 62 unidades, 38% publicadas"), não há exportação de relatório, não há vista agregada.
**Redesenho:** uma vista "Meu Portfolio" para o papel `promoter` (já existe `partners.role` no schema) com métricas agregadas — total de unidades, publicadas vs. rascunho, leads recebidos por empreendimento — antes mesmo de entrar em qualquer edição individual.

---

## 3. Problemas de modelo de dados encontrados durante esta análise (referenciados, não alterados agora)

- Não existe tabela para documentos anexos — nenhuma equivalente a `media_assets` para PDFs/plantas. Precisa de decisão própria (reutilizar `media_assets` com um `media_type='document'`, ou tabela dedicada).
- `partners.role` já distingue `agency`/`promoter` mas o Admin não usa essa distinção em lado nenhum da experiência — puro desperdício de um dado que já existe.
- Não há campo de "unidades totais" agregado em `developments` — a contagem tem de ser sempre calculada por junção com `properties`, o que é correto tecnicamente mas lento de mostrar num dashboard de portfolio em tempo real; pode justificar uma coluna materializada mais tarde.

---

## 4. O que NÃO mudaria

- A separação Propriedade/Empreendimento na navegação — está certa.
- O mecanismo de upload/storage/URLs assinadas — já é sólido e correto, só a apresentação visual precisa de trabalho.
- Publicar/Despublicar sem eliminar — o princípio está certo, só falta comunicá-lo melhor visualmente (hoje é só uma tag de texto).

---

## 5. Prioridade honesta

Se só puder haver uma próxima ação: **o wizard de criação (2.5) e o preview em tempo real (2.2)** são os dois itens que mais mudam a perceção de "ferramenta interna" para "produto acabado" — são os pontos onde um utilizador passa mais tempo, e onde a diferença entre CRUD técnico e software profissional é mais visível instantaneamente. Documentos anexos (2.6) é o gap funcional mais crítico para uma conversa com um fundo, mesmo sendo visualmente menos dramático.

Não escrevi código nem migrations, como pedido. Este documento é a base para decidirmos juntos a ordem certa antes de eu tocar em qualquer implementação.
