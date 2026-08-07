# Z Find — Experiência dos Dois Lados
## Publicador e Leitor, com o Z Living em mente

**Estado:** Documento estratégico. Zero código, zero migrations.
**Fonte real:** pesquisa direta sobre zimobiliaria.pt (a Z Imobiliária é nossa — reutilizo o que for útil, com atribuição clara do que encontrei e onde).

---

## 0. O que encontrei na Z Imobiliária, concretamente — não especulação

Fui ver a sério. Quatro padrões reais, confirmados:

1. **Páginas de zona dedicadas para SEO** — ex. `zimobiliaria.pt/imoveis-boavista.html`: preço médio por tipologia (T2 ~€460.000), acesso a metro, "porquê esta zona", contexto local, CTA. **O Z Find não tem nenhuma página equivalente hoje** — a Pesquisa é só filtros, sem uma única página de zona indexável.

2. **Simulador de investimento baseado em regras fiscais reais**, não em estimativa especulativa — AL vs. Arrendamento Tradicional, com IMT, IMI, IRS, financiamento, e 3 cenários (conservador/base/otimista). Isto confirma exatamente o que já defendi no `PRODUCT-AUDIT-V1.md`: simuladores baseados em fórmulas fiscais conhecidas são seguros de construir agora; avaliação automática especulativa não é.

3. **"Pedir Avaliação Gratuita" é um pedido, não um número instantâneo** — vai para um consultor humano. É o mesmo padrão seguro, aplicado ao pedido de avaliação: gera lead qualificado, nunca expõe um número que a empresa não consegue defender.

4. **Conteúdo editorial sério, orientado a comprador internacional** — guias sobre Golden Visa, NIF, fiscalidade de não residentes, escolas internacionais, processo de licenciamento AL, sempre com CTA de WhatsApp persistente ("💬 Falar com um Consultor").

**A lição central, dita de forma direta: a Z Imobiliária vende confiança e conhecimento especializado, não só listagens.** É isso que "melhor experiência" significa aqui — não mais funcionalidades, mais autoridade percebida em cada página.

---

## 1. Lado de quem lê (comprador/arrendatário)

### O que falta, com prioridade

**1.1 — Páginas de zona (SEO + confiança).** Uma página por zona já coberta em `zones_lite` (hoje: Boavista, Foz do Douro, Cedofeita, Matosinhos Sul) — preço médio real (calculado a partir dos nossos próprios listings publicados, não inventado), contexto de transportes/serviços, e os imóveis atuais dessa zona. Isto é SEO composto (item nº2 do roadmap já aprovado) e prova social ao mesmo tempo — mata dois problemas com uma única funcionalidade.

**1.2 — Simulador de investimento baseado em regras fiscais reais.** Exatamente o padrão da Z Imobiliária: IMT + IMI + IRS + financiamento, sem inventar rentabilidade. Isto está alinhado com o Item 2 da tabela de discordância do `PRODUCT-AUDIT-V1.md` ("Construir só o IMT primeiro") — a evidência real da Z Imobiliária confirma que vale a pena ir um pouco mais longe (IMT+IMI+IRS juntos), desde que continue a ser fórmula pública, não estimativa.

**1.3 — Pedido de avaliação como geração de lead, não como número automático.** Mesmo padrão da Z Imobiliária, aplicado ao visitante que quer VENDER (hoje o Z Find só serve quem quer COMPRAR/ARRENDAR — não existe nenhum fluxo para o lado do proprietário). Isto é, na prática, o primeiro ponto de contacto com o futuro Z Living também (quem quer arrendar a sua casa precisa do mesmo fluxo de "pedir avaliação/gestão").

**1.4 — Conteúdo editorial mínimo, honesto, específico.** Não um blog genérico — guias curtos e verificáveis (processo de compra para estrangeiro, NIF, o que é o Golden Visa hoje) que já demonstrámos, com o Sprint 1.4, saber tratar dados com rigor em vez de inventar. O mesmo rigor aplica-se a conteúdo editorial: cada afirmação fiscal/legal tem de ser verificável, nunca aproximada.

### O que já está bem e não precisa de mudar
- Fluxo de contacto (direto/qualificado/assistido) — já é mais sofisticado do que qualquer coisa que vi nesta pesquisa.
- Traduções PT/EN/FR já prontas para o mesmo género de conteúdo internacional que a Z Imobiliária serve.

---

## 2. Lado de quem publica (agência, promotor, proprietário)

Isto liga diretamente à Fase 1 do roadmap já aprovado (**Portal do Parceiro**) — não é uma ideia nova, é a mesma prioridade, agora com evidência concreta do que "bom" parece:

**2.1 — Onboarding com o mesmo padrão "pedir avaliação/gestão"** que vimos na Z Imobiliária, mas para agências/promotores que querem anunciar: um formulário de entrada simples, resposta humana, não um wizard de auto-serviço complexo logo à partida — reduz o atrito de conversão que faz uma agência experimentar o Z Find.

**2.2 — Distinção visível entre "self-service" e "gestão completa"**, exatamente como a Z Imobiliária oferece para AL ("pode ser gerido pelo proprietário, ou totalmente delegado"). Aplicado ao Z Find: uma agência pequena pode querer publicar ela própria (Admin/Portal do Parceiro); um proprietário privado pode preferir que a nossa equipa trate de tudo. Isto não exige nova arquitetura — é uma decisão de produto sobre como apresentamos o mesmo Portal do Parceiro a públicos diferentes.

**2.3 — WhatsApp como canal, não só formulário.** Confirmado como padrão dominante em todo o setor português (não só na Z Imobiliária) — todos os exemplos que pesquisei usam WhatsApp como CTA primário. O Z Find usa hoje um modal de formulário. Vale considerar WhatsApp como opção adicional de contacto — não substituindo o fluxo atual (que já tem qualificação estruturada, algo que WhatsApp por si só não dá), mas como atalho para quem prefere.

---

## 3. Z Living — o que isto significa, sem comprometer cedo demais

O Z Living (arrendamento) vai partilhar mais do que parece à primeira vista com o que descrevo acima:

- **O simulador AL vs. Tradicional da Z Imobiliária já é, literalmente, o domínio do Z Living** — comparar arrendamento tradicional com AL é exatamente a decisão que um proprietário de arrendamento enfrenta. Vale desenhar este simulador agora pensando nos dois produtos, não construí-lo duas vezes.
- **Páginas de zona** (1.1) servem os dois produtos sem alteração — preço médio de arrendamento é só mais uma métrica na mesma página.
- **O que NÃO faço agora:** desenhar o modelo de dados de arrendamento em si (contratos, cauções, duração, renovação) — isso é specific ao Z Living e prematuro construir sem um cliente real desse produto ainda. Fica fora deste documento, deliberadamente.

---

## 4. Prioridade concreta, ligada ao roadmap já aprovado

| Item | Liga a | Porquê agora |
|---|---|---|
| Páginas de zona | Fase 2 (SEO), já aprovada | Reutiliza dados que já existem (`zones_lite`, listings publicados) — custo baixo, composto ao longo do tempo |
| Simulador IMT+IMI+IRS | Fase 3, revisão do item recusado no Product Audit | Evidência real da Z Imobiliária mostra que é seguro e valioso, desde que baseado em fórmula pública |
| Pedido de avaliação (lead do lado do proprietário) | Novo, mas barato — reutiliza o Lead Service já construído no Sprint 1.6 | Serve o Z Find hoje E prepara terreno para o Z Living, sem construir nada específico de arrendamento ainda |
| Portal do Parceiro com dois modos (self-service / gerido) | Fase 1, já aprovada, sem mudar prioridade | A pesquisa só confirma como apresentar, não muda a ordem |

---

## Nota final

Não encontrei nada na Z Imobiliária que exija reabrir o modelo de dados. O que encontrei confirma a ordem já decidida no `PRODUCT-AUDIT-V1.md`, com mais evidência concreta do que "bom" parece em cada item, e acrescenta uma peça que faltava: um fluxo de lead para quem quer VENDER/ARRENDAR, não só para quem quer comprar — que hoje simplesmente não existe no Z Find.
