# Radar Léman / ImmoRadar — site protegido por password

Dashboard "Radar Léman" — análise de prospeção imobiliária para os concelhos
de Thonon-les-Bains / Évian-les-Bains (74200 / 74500). Desde 10/set, o acesso
exige password (ver secção "Proteção por password" abaixo) — deixou de ser
um site estático simples, por isso a estrutura da pasta mudou.

## Estrutura (11/set — protegido por password, em pedaços, com fichas PDF)

```
radar-leman-web/
  private/
    dashboard.html          <- o dashboard gerado pelo pipeline (nunca servido diretamente)
    chunks/                 <- dashboard.html dividido em pedaços < 4,5 MB (gerado, ver abaixo)
    fichas/                 <- fichas PDF individuais em base64, agrupadas em pedaços (gerado, ver abaixo)
  api/
    _auth.js                <- valida a password (partilhado, não é uma rota)
    index.js                <- Vercel Function: valida a password, devolve a página que monta o dashboard
    chunk.js                <- Vercel Function: devolve um pedaço de dashboard.html, também com password
    ficha.js                 <- Vercel Function: devolve uma ficha PDF individual (?n=0..1667), também com password
  scripts/
    split-dashboard.js      <- gera private/chunks/ a partir de private/dashboard.html
    split-fichas.py         <- gera private/fichas/ a partir de uma pasta de PDFs (ver abaixo)
  public/.gitkeep            <- pasta de saída estática, propositadamente vazia
  vercel.json                 <- liga tudo: todos os pedidos passam pelas funções
```

## Origem dos dados

Gerado a partir do pipeline em
`apps/intelligence/pipelines/prospection-immobiliere-74200-74500/`.
Os dados (BAN, DVF, DPE ADEME, Cadastre, Géorisques, RNB) estão incorporados
diretamente no HTML (`private/dashboard.html`, blobs base64) — não há
chamadas a APIs em runtime.

**Estado desta exportação:** ver `claude/auditoria-radar-leman-2026-09-07.md`
no projeto ZOS para o estado detalhado e o histórico de correções (terreno,
DPE, janela DVF, limiares de prioridade, andar/complemento para apartamentos,
fichas PDF).

## Proteção por password (10/set, corrigida a 10/set — ver "Porquê em pedaços")

Porque não bastava JavaScript no browser: o dashboard tem todos os dados
(moradas, valores, argumentário) embutidos no próprio ficheiro HTML — uma
verificação só em JavaScript no browser entregaria esse ficheiro inteiro ao
visitante antes de sequer pedir a password, bastando ver o código-fonte da
página para contornar. Por isso o `index.html` deixou de ser servido
diretamente: passou a viver em `private/dashboard.html`, e uma Vercel
Function só o devolve depois de validar a password no servidor. Isto
funciona no plano gratuito (Hobby) — a proteção nativa da Vercel para isto
("Password Protection") só existe no plano Pro, por US$20/mês por projeto.

**Porquê em pedaços (chunks):** a Vercel limita a **4,5 MB** o corpo da
resposta de qualquer Function — e `dashboard.html` já passa dos 5 MB (tende
a crescer ainda mais com o dataset). A primeira versão desta proteção
tentava devolver o ficheiro inteiro numa função só, e por isso falhava com
`FUNCTION_INVOCATION_FAILED` mesmo com a password certa. A correção: o
`private/dashboard.html` é dividido em pedaços de ~1,5 MB
(`scripts/split-dashboard.js` → `private/chunks/`), cada um bem abaixo do
limite. `api/index.js` devolve uma página pequena que, já autenticada, pede
cada pedaço a `api/chunk.js` (o browser reenvia a password automaticamente
nesses pedidos — assim funciona o HTTP Basic Auth) e remonta o dashboard
completo no ecrã. Cada pedaço continua protegido pela mesma password, não só
o primeiro pedido. As fichas PDF (secção seguinte) usam o mesmo mecanismo.

**Como ativar, no dashboard Vercel:**

1. **Settings → Environment Variables** → adicionar `RADAR_PASSWORD` com a
   password que quiseres (aplicar a "Production" pelo menos). Esta variável
   nunca fica escrita no repositório git.
2. **Settings → Build & Deployment → Output Directory** → mudar de vazio
   para `public` (a pasta `public/` está vazia de propósito — é o que
   impede qualquer ficheiro de ser servido diretamente sem passar pela
   função).
3. Fazer um redeploy (o próximo `git push` já trata disto).
4. Testar: ao abrir o site, o browser deve pedir utilizador+password (o
   utilizador pode ser qualquer coisa, só a password conta), e a seguir deve
   aparecer uma barra de progresso breve antes do dashboard.

**Para mudar a password mais tarde**: só editar o valor de `RADAR_PASSWORD`
nas Environment Variables e fazer redeploy — não precisa de tocar em código.

## Atualizar o dashboard depois de uma nova execução do pipeline

Já não basta substituir `private/dashboard.html` — é preciso regerar os
pedaços a seguir:

```
cd apps/intelligence/radar-leman-web
node scripts/split-dashboard.js
git add -A
git commit -m "Radar Immobilier: novo dashboard"
git push
```

`scripts/split-dashboard.js` não tem dependências (Node puro) — corre com
qualquer Node instalado na máquina.

## Fichas PDF individuais (11/set)

Cada morada de Prioridade A tem um link "Télécharger la fiche PDF" no
dashboard (dentro do detalhe de cada linha da tabela), que abre
`/api/ficha?n=<índice>` — a mesma password do dashboard aplica-se, pedido a
pedido. O `<índice>` (0 a 1667, ordenado por score decrescente) fica
embutido no próprio `private/dashboard.html`, como uma coluna extra
(`fichaIdx`) nas linhas de Prioridade A — as de Prioridade B não têm fiche
gerada ainda, por isso não mostram o link.

As fichas em si (geradas por
`apps/intelligence/pipelines/prospection-immobiliere-74200-74500/src/fiche_pdf.py`)
são convertidas para base64 e agrupadas em `private/fichas/shard-N.js`
(~50 fichas por pedaço, module.exports = array de strings base64), com
`private/fichas/index.js` a juntar tudo num único array indexado 0..1667.
`api/ficha.js` decodifica a ficha pedida e devolve-a como `application/pdf`
— cada resposta é uma única ficha (~20-30 KB), bem abaixo do limite de
4,5 MB da Vercel, por isso não precisa de paginação como o dashboard.

**Dados da agência ainda por preencher**: as fichas atuais têm
`[Votre agence]` / `[téléphone]` / `[email]` / `[adresse]` como marcador em
`fiche_pdf.py::CABINET` — a atualizar quando o Ricardo confirmar os dados
reais da DECORDIER IMMOBILIER (só editar esse dicionário e regerar, ver
abaixo — não precisa de tocar em mais nada).

**Como regerar** (nova password/agência, ou para gerar a Prioridade B):

1. Editar `CABINET` em `fiche_pdf.py` (nome, telefone, email, morada), ou
   ajustar o filtro de prioridade em `scripts/split-fichas.py` para incluir
   a banda B.
2. Correr `fiche_pdf.py` sobre `output/prospection_prioritaire.csv` (precisa
   de WeasyPrint + `pango` instalados — no Mac isto ficou bloqueado pelo
   macOS 12 já não ser suportado pelo Homebrew; a alternativa usada foi
   correr num ambiente Linux, ex. `apt install` dos pacotes pango e
   `pip install weasyprint`).
3. `python3 scripts/split-fichas.py` (lê a pasta de PDFs gerados, escreve
   `private/fichas/`).
4. Se o número de fichas mudou, também é preciso voltar a embutir a coluna
   `fichaIdx` no `private/dashboard.html` (mapeamento morada → índice) e
   regenerar `private/chunks/` com `node scripts/split-dashboard.js`.
5. `git add -A && git commit -m "..." && git push`.

## Deploy no Vercel

Esta pasta não tem build step tradicional (as "funções" são só JavaScript,
sem compilação). No Vercel:

1. Criar um **novo** projeto Vercel chamado, por exemplo, `radar-leman` (não
   reutilizar o projeto `z-studio-web`, que já está ligado à raiz do
   repositório e é usado por outra app do monorepo — se apareceres na lista
   de deployments do Vercel e vires um build a instalar centenas de pacotes
   npm, `sharp`, etc., estás a ver o `z-studio-web` por engano, não este
   projeto).
2. **Root Directory** → `apps/intelligence/radar-leman-web`
3. **Framework Preset** → "Other" (site estático)
4. **Output Directory** → `public` (ver secção acima — importante, sem isto
   a proteção não funciona)
5. Build Command → deixar em branco

O `index.html` antigo, na raiz desta pasta, já não é usado e já foi removido
do repositório.

## Domínio próprio: immoradar.online

Domínio comprado na amen.fr e ligado ao projeto Vercel (11/set) — DNS
validado, HTTPS emitido automaticamente pela Vercel. O site responde nos
dois endereços: `https://immoradar.online/` e `https://radar-leman.vercel.app/`.

(Nota: um domínio `radar-immobilier.online` tinha sido considerado antes e
chegou a ser adicionado ao projeto Vercel por preparação, mas nunca foi
comprado — pode aparecer como "Invalid Configuration" em Settings → Domains
até ser removido de lá; não afeta o funcionamento do site.)
