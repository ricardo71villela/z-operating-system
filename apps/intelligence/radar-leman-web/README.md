# Radar Léman / ImmoRadar — site protegido por password

Dashboard "Radar Léman" — análise de prospeção imobiliária para os concelhos
de Thonon-les-Bains / Évian-les-Bains (74200 / 74500), Cervens / Draillant /
Orcier / Perrignier (74550) e Sciez (74140) — 31 comunas desde 7/out. Desde 10/set, o acesso
exige password (ver secção "Proteção por password" abaixo) — deixou de ser
um site estático simples, por isso a estrutura da pasta mudou.

## Estrutura (11/set — protegido por password, em pedaços, com fichas PDF)

```
radar-leman-web/
  private/
    dashboard.html          <- o dashboard gerado pelo pipeline (nunca servido diretamente)
    chunks/                 <- dashboard.html dividido em pedaços < 4,5 MB (gerado, ver abaixo)
    fichas-data/            <- dados de cada morada para a ficha PDF (~6 MB, gerado por build-fichas-data.js)
  api/
    _auth.js                <- valida a password (partilhado, não é uma rota)
    index.js                <- Vercel Function: valida a password, devolve a página que monta o dashboard
    chunk.js                <- Vercel Function: devolve um pedaço de dashboard.html, também com password
    ficha.js                 <- Vercel Function: gera a ficha PDF de uma morada a pedido (?n=fichaIdx), com password
    _fiche-pdf.js            <- desenho da ficha (PDFKit, fonte Arimo em api/_fonts/)
  scripts/
    split-dashboard.js      <- gera private/chunks/ a partir de private/dashboard.html
    build-fichas-data.js    <- gera private/fichas-data/ a partir de private/dashboard.html
    update-from-pipeline.py <- atualiza private/dashboard.html a partir da pasta output/ do pipeline
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

## Seguimento das moradas e cartas em lote (8/out)

- **Seguimento:** no detalhe de cada morada há um bloco « Suivi du contact »
  (estado, data para voltar a contactar, nota). Os estados aparecem como
  etiqueta na lista e há um filtro « Suivi » (não contactadas, a relançar
  nos próximos 7 dias, courrier envoyé, RDV, mandat…).
- **Cartas:** caixas de seleção em cada linha (e « selecionar a página »,
  ou « Préparer les courriers de cet itinéraire » no itinerário do dia).
  « Textes des courriers (à copier) » mostra o texto de cada carta
  « Au propriétaire » (sem cabeçalho), com « Copier » / « Tout copier », para
  colar no modelo Word da agência (papel timbrado). « Fiches d'estimation
  (PDF) » dá as fichas a juntar. No detalhe de cada morada, « Texte du
  courrier » faz o mesmo para uma só morada (sem a marcar). As cartas em lote
  marcam as moradas « Courrier envoyé » com a data do dia; as marcadas « Ne
  plus contacter » são sempre retiradas. Máx. 100 por vez. (A API aceita
  ainda `format: "pdf"` — carta + ficha num só PDF.)
- Nenhum nome de proprietário é usado (dados públicos apenas); a carta e a
  ficha dizem como deixar de receber correio.

Configuração (uma vez):
1. Supabase → SQL Editor: correr
   `infrastructure/supabase/migrations/20261008230000_radar_leman_suivi_v1.sql`.
2. Vercel → projeto radar-leman → Settings → Environment Variables:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (obrigatórias para o
   seguimento) e, para assinar as cartas e as fichas: `RADAR_AGENCE_NOM`,
   `RADAR_AGENCE_CONTACT`, `RADAR_SIGNATAIRE`, `RADAR_AGENCE_VILLE`
   (opcional `RADAR_AGENCE_BASELINE`). Sem elas aparecem `[Votre agence]`…
3. Redeploy.

O código do ecrã está em `private/dashboard.html` (aplicado por
`scripts/patch-dashboard-suivi.py`, idempotente) e nas funções
`api/suivi.js`, `api/lettres.js`, `api/_lettre-pdf.js`.

## Fichas PDF geradas a pedido (8/out)

Cada morada tem um link "Télécharger la fiche PDF" no detalhe da linha, que
abre `/api/ficha?n=<fichaIdx>` (mesma password). Até 8/out as ~27 000 fichas
eram PDFs guardados em base64 no repositório (`private/fichas/`, cerca de
700 MB a cada atualização). Agora `api/ficha.js` desenha a ficha no momento
(PDFKit, ~5 ms, ~17 KB) a partir de `private/fichas-data/` — só os campos
que a ficha mostra, ~6 MB no total. Conteúdo e apresentação iguais aos de
`fiche_pdf.py` do pipeline.

- Para mudar o texto ou o aspeto da ficha: `api/_fiche-pdf.js`.
- Dados da agência (`[Votre agence]`, `[téléphone]`…): constante `CABINET`
  em `api/_fiche-pdf.js`.
- Depois de mudar `private/dashboard.html`: `node scripts/build-fichas-data.js`.
- As dependências (`pdfkit`) estão em `package.json`; a Vercel instala-as
  sozinha. Localmente: `npm install`.

Nota: o histórico do git continua a guardar as fichas antigas (o repositório
não encolhe por apagar a pasta); só as próximas atualizações deixam de o
fazer crescer.

## Atualizar o site a partir do pipeline (8/out)

`scripts/update-from-pipeline.py` atualiza o dashboard a partir da pasta
`output/` do pipeline (moradas, comunas, indicadores e, se existir,
terrenos livres — só das comunas tratadas nessa execução; as outras mantêm
os terrenos já publicados). Depois: `node scripts/split-dashboard.js` e
`node scripts/build-fichas-data.js`.

No GitHub: Actions → "Z Intelligence — Prospection Immobiliere" → Run
workflow → escolher um ramo (não `main`) e marcar **publicar_site**. Opção
**terrenos**: `nenhum` (por defeito), `novas` (Sciez e as 4 comunas do 74550,
~10 min) ou `todas` (31 comunas, várias horas). O
workflow corre o pipeline, atualiza o site e faz commit nesse ramo; basta
depois abrir/fazer merge do pull request.

## Correção das superfícies (8/out)

As superfícies (sobretudo das moradias) ficavam muito abaixo da realidade:
o repli espacial dava a cada morada a venda DVF mais próxima a menos de
40 m, muitas vezes a de um vizinho (até 19 moradas com a mesma venda de um
apartamento de 60 m²). Agora: venda ligada pela parcela cadastral, senão
por proximidade recíproca (uma venda = uma morada), e a superfície
habitável medida no DPE tem prioridade sobre a dos ficheiros fiscais
(DVF). A origem aparece no detalhe de cada morada (coluna `sourceSurface`).

## Atualização de 7/out — Sciez e 74550

Dados da execução do pipeline de 5/out (31 comunas, 27 758 moradas,
2 812 em Prioridade A). O artefacto do pipeline não traz `dashboard.html`
nem as fichas todas, por isso:

- `_LEADS_B64`, `_STATS_B64` e `_KPIS_B64` foram recalculados a partir de
  `mailing_complet.csv` e `stats_marche_communes.csv` (mesmas colunas de
  sempre); `_TERRENOS_B64` ficou igual (26 comunas de origem).
- As fichas existentes mantêm o índice (`fichaIdx` 0..23366, mesma morada →
  mesma ficha). As 4 429 moradas novas têm fichas novas, nos índices
  23367..27795, acrescentadas em `private/fichas/` sem tocar nos pedaços
  antigos. `api/ficha.js` aceita agora `n` de 0 a 27795.

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
