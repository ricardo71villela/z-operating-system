# Radar Léman / Radar Immobilier — site protegido por password

Dashboard "Radar Léman" — análise de prospeção imobiliária para os concelhos
de Thonon-les-Bains / Évian-les-Bains (74200 / 74500). Desde 10/set, o acesso
exige password (ver secção "Proteção por password" abaixo) — deixou de ser
um site estático simples, por isso a estrutura da pasta mudou.

## Estrutura (10/set — protegido por password)

```
radar-leman-web/
  private/dashboard.html   <- o dashboard em si (nunca servido diretamente)
  api/index.js             <- Vercel Function: valida a password, só depois devolve o HTML
  public/.gitkeep           <- pasta de saída estática, propositadamente vazia
  vercel.json                <- liga tudo: todos os pedidos passam pela função
  index.html (antigo)        <- já não é usado, pode ser removido do repositório
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

## Proteção por password (10/set)

Porque não bastava JavaScript no browser: o dashboard tem todos os dados
(moradas, valores, argumentário) embutidos no próprio ficheiro HTML — uma
verificação só em JavaScript no browser entregaria esse ficheiro inteiro ao
visitante antes de sequer pedir a password, bastando ver o código-fonte da
página para contornar. Por isso o `index.html` deixou de ser servido
diretamente: passou a viver em `private/dashboard.html`, e uma Vercel
Function (`api/index.js`) só o devolve depois de validar a password no
servidor. Isto funciona no plano gratuito (Hobby) — a proteção nativa da
Vercel para isto ("Password Protection") só existe no plano Pro, por
US$20/mês por projeto.

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
   utilizador pode ser qualquer coisa, só a password conta).

**Para mudar a password mais tarde**: só editar o valor de `RADAR_PASSWORD`
nas Environment Variables e fazer redeploy — não precisa de tocar em código.

## Deploy no Vercel

Esta pasta não tem build step tradicional (a "função" é só JavaScript, sem
compilação). No Vercel:

1. Criar um **novo** projeto Vercel (não reutilizar o projeto `z-studio-web`
   já ligado à raiz do repositório).
2. **Root Directory** → `apps/intelligence/radar-leman-web`
3. **Framework Preset** → "Other" (site estático)
4. **Output Directory** → `public` (ver secção acima — importante, sem isto
   a proteção não funciona)
5. Build Command → deixar em branco

Para atualizar o dashboard depois de uma nova execução do pipeline, basta
substituir `private/dashboard.html` e fazer `git push` — o Vercel fará
redeploy automaticamente. O `index.html` antigo, na raiz desta pasta, já não
é usado — pode ser removido com `git rm index.html`.

## Domínio próprio: radar-immobilier.online

Domínio já comprado (10/set). Para o ligar ao projeto Vercel:

1. No dashboard Vercel, abrir o projeto do Radar Léman → **Settings → Domains**.
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
