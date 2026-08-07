# Z Find — Achados no Código-Fonte Real da Z Imobiliária
## (repositório `ricardo71villela/z-imoveis`, inspecionado diretamente)

**Estado:** Nota técnica. Nenhum código copiado ou alterado no Z Find ainda — apenas inspeção e registo do que é genuinamente reutilizável.

---

## O que é este projeto, em termos concretos

Um site multi-página estático (não uma SPA como o Z Find), deployado na Vercel — cada empreendimento, cada artigo de blog, cada idioma é um ficheiro `.html` próprio (ex.: `empreendimento-bloom-11.html` / `-en.html` / `-fr.html`). 367 ficheiros na raiz do repositório. Arquitetura muito diferente do Z Find — mas isso não importa para o que interessa aqui: **padrões de produto e de UX**, não a forma como o código está organizado.

---

## 3 achados genuinamente reutilizáveis

### 1. `ai.js` — proxy seguro à API da Anthropic (Vercel Function)

Um ficheiro de 49 linhas: recebe o pedido do browser, injeta a chave da API a partir de uma variável de ambiente do servidor (nunca exposta ao browser), valida origem e tamanho do pedido, chama a Anthropic, devolve a resposta. Isto é exatamente a peça de infraestrutura que faltaria para qualquer funcionalidade de IA descrita no `PRODUCT-AUDIT-V1.md` — e já está resolvida, testada em produção, pronta a adaptar para o Z Find (Vercel também é o destino já combinado para o Z Find, depois do code freeze do Admin).

### 2. `studio.html` — disciplina de IA que já bate certo com a nossa

Uma "Content Studio" que transforma secções de um artigo já publicado em slides de carrossel para Instagram, via IA. O que importa não é a funcionalidade em si — é a regra explícita no prompt do sistema:

> "REGRA ABSOLUTA: só podes usar factos que estejam no texto fornecido. Não inventes números, datas, nomes nem características. Se um facto não estiver lá, não existe."

Isto é, palavra por palavra, a mesma disciplina que apliquei em todo o Z Find (nunca fabricar dados, nunca inventar métricas). Encontrar isto já implementado, de forma independente, é a melhor confirmação possível de que a distinção que fiz no `PRODUCT-AUDIT-V1.md` — "IA para reescrever conteúdo real: sim; IA para inventar avaliações: não" — é a correta e a que já funciona na prática. Também confirma o mecanismo certo: sempre requer revisão humana antes de publicar ("revê antes de publicar"), nunca publicação automática.

### 3. Padrões de UX do Admin que validam, com código real, a crítica já feita

Sem eu saber, este Admin já resolve vários dos itens específicos do `ADMIN-EXPERIENCE-REDESIGN.md`:
- **Combo de zona pesquisável** (escrever para filtrar) em vez de um `<select>` simples — diretamente aplicável ao editor de Propriedades/Empreendimentos do Z Find.
- **Lightbox de imagem** (`openImgLightbox`/`closeImgLightbox`) — exatamente o que recomendei na secção 2.7 do documento de Admin.
- **Grelha de fotos ordenável genérica** (`makeSortableGrid`, parametrizável) — o Z Find já tem arrastar-para-reordenar funcional, mas este é mais reutilizável entre diferentes tipos de media.
- **Confirmação de eliminação com modal próprio** (`askConfirm`) em vez do `confirm()` nativo do browser que o Z Find usa hoje — pequeno, mas mais profissional.
- **Toast de feedback** (`showToast`) em vez da caixa de estado estática que o Z Find usa.
- **Modo escuro** (`toggleTheme`) — não crítico, mas mostra o nível de polimento que já existe noutro produto nosso.

---

## Uma diferença de modelo de dados que vale registar

`zonesCache` neste projeto tem `name_pt`, `name_en`, `name_fr` como campos separados por zona — mais rico do que o `zones_lite.name` único do Z Find (que, como já documentado, é uma simplificação deliberada do MVP). Não é uma ação a tomar agora — só confirma, com mais um exemplo real, que quando a Geography completa for ligada à base de dados (item já no roadmap do `PROPERTY-DOMAIN-DIAGNOSIS.md`), nomes de zona multilíngues fazem parte natural dessa evolução.

---

## O que NÃO fiz

Não copiei nenhum código para o Z Find. Não alterei nada. Isto é só o registo do que encontrei, para decidirmos juntos, com factos em vez de suposições, quais destes padrões vale a pena adaptar e quando — provavelmente ligado à Fase que envolve Vercel, já combinada como próximo passo depois do code freeze do Admin.
