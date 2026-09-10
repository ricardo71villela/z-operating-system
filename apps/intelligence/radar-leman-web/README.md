# Radar Léman / Radar Immobilier — site protegido por password

Dashboard "Radar Léman" — análise de prospeção imobiliária para os concelhos
de Thonon-les-Bains / Évian-les-Bains (74200 / 74500). Desde 10/set, o acesso
exige password (ver secção "Proteção por password" abaixo) — deixou de ser
um site estático simples, por isso a estrutura da pasta mudou.

## Estrutura (10/set — protegido por password, em pedaços)

```
radar-leman-web/
  private/
    dashboard.html          <- o dashboard gerado pelo pipeline (nunca servido diretamente)
    chunks/                 <- dashboard.html dividido em pedaços < 4,5 MB (gerado, ver abaixo)
  api/
    _auth.js                <- valida a password (partilhado, não é uma rota)
    index.js                <- Vercel Function: valida a password, devolve a página que monta o dashboard
    chunk.js                <- Vercel Function: devolve um pedaço de dashboard.html, também com password
  scripts/
    split-dashboard.js      <- gera private/chunks/ a partir de private/dashboard.html
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
DPE, janela DVF, limiares de prioridade, andar/complemento para apartamentos).

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
o primeiro pedido.

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

## Domínio próprio: radar-immobilier.online

Domínio já comprado (10/set). Para o ligar ao projeto Vercel:

1. No dashboard Vercel, abrir o projeto do Radar Léman (não o
   `z-studio-web`) → **Settings → Domains**.
2. Adicionar `radar-immobilier.online` (e, se quiseres, `www.radar-immobilier.online`).
3. O Vercel mostra os registos DNS a criar no sítio onde o domínio foi
   comprado — normalmente um registo `A` (para o domínio de raiz) a apontar
   para `76.76.21.21`, e/ou um `CNAME` (para `www`) a apontar para
   `cname.vercel-dns.com`. Os valores exatos aparecem sempre no ecrã do
   Vercel no momento de adicionar o domínio — usar esses, não os daqui.
4. Depois de criar os registos no painel do registador do domínio, o Vercel
   valida automaticamente (pode demorar de minutos a algumas horas,
   conforme a propagação DNS) e emite o certificado HTTPS sozinho.

Até o domínio próprio estar validado, o site continua acessível em
`https://radar-leman.vercel.app/` — os dois endereços passam a apontar para
o mesmo deploy depois do passo 4.
