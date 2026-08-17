# Testes do My Studio

Testes automatizados que correm a app dentro de um **Chromium real** (via
Electron) — não são apenas verificação de sintaxe. Foi assim que encontrámos
e corrigimos bugs reais nesta app, incluindo um `ReferenceError` no arranque
que impedia toda a inicialização de correr, e nunca teria aparecido só com
verificação de sintaxe.

## O que os testes cobrem

**`run-tests.js`** — funcional, ~40 verificações:
upload de fotos e vídeos, recorte inteligente, categorias e ficha de produto
universal (imóveis, carros, viagens, moda, cosmética, ou rótulos 100% livres),
arrastar para reordenar fotos, desfazer/refazer, **persistência local com
recarregamento real simulado**, kits de marca, todos os formatos × templates
× filtros, exportações (PNG / ZIP / PDF / produção em massa), vista em
grelha, partilha, tradução multi-idioma, IA a falhar sem rebentar a página,
e acessibilidade básica.

**`run-mobile-check.js`** — visual/layout a 390×844 (tamanho de telemóvel):
overflow horizontal, cabeçalho, pré-visualização, modais, e se tocar numa
foto continua a selecioná-la mesmo estando marcada como "arrastável". Tira
3 screenshots reais para revisão visual em `test-output/`.

## Como usar

1. Coloca `run-tests.js`, `run-mobile-check.js` e `package.json` na mesma
   pasta do `my-studio.html`.
2. Instala as dependências (só precisas de fazer isto uma vez — descarrega
   o Electron, pode demorar um pouco):
   ```
   npm install
   ```
3. Corre os testes:
   ```
   npm test           # testes funcionais — my-studio.html
   npm run test:mobile  # verificação de layout em telemóvel
   ```

Também podes apontar para qualquer outro ficheiro (por exemplo, uma versão
que estejas a testar antes de substituir a de produção):
```
node_modules/.bin/electron --no-sandbox --disable-gpu --ozone-platform=headless run-tests.js caminho/para/outro.html
```

## Sobre as flags `--no-sandbox --disable-gpu --ozone-platform=headless`

Já vêm incluídas nos scripts do `package.json`. Servem para os testes
correrem em qualquer sítio — incluindo servidores/CI sem ecrã. Num
computador normal, com sessão gráfica própria, são inofensivas; se preferes
não usar `--no-sandbox` (é a mais permissiva das três) e não estiveres a
correr como root/num CI, podes removê-la do `package.json`.

## O que significa "ignorado" (⏭️) no resultado

Os testes de exportação em ZIP e PDF dependem de duas bibliotecas carregadas
por CDN (JSZip e jsPDF) — se a máquina que corre os testes não tiver acesso
à internet nesse momento, esses testes ficam marcados como **ignorados**,
não como falhados. Corre com ligação à internet para os validar também.

## Quando correr isto

- Sempre que alterares o `my-studio.html`, antes de o publicares.
- Depois de atualizar dependências (JSZip, jsPDF).
- Ideal para meter num pipeline de CI (GitHub Actions, etc.) — o processo
  termina com código de saída `1` se algum teste falhar, `0` se passar tudo.

## Limitações conhecidas (não cobertas por estes testes)

- Arrastar-e-largar tátil num telemóvel real (o teste confirma que o toque
  simples continua a funcionar, mas não simula um gesto de arrastar dedo).
- Comportamento real da API `FaceDetector` num browser que a implemente —
  nenhum Chromium testado aqui a suporta, por isso o recorte inteligente
  usa sempre o modo de reserva (contraste + tom de pele).
- A Web Share API só é testada pelo caminho de recurso (download), porque
  o Chromium usado nestes testes não a expõe.
- Ligação real ao backend de IA (`/api/ai`) — só confirmamos que uma falha
  de rede não rebenta a página, não testamos uma resposta real da API.
- Escolher pasta local (File System Access API) — exige interação manual
  do utilizador com um seletor nativo do sistema operativo, por isso não é
  testável de forma automática; o teste confirma apenas que, em browsers
  sem suporte, a app mostra um aviso em vez de rebentar.
