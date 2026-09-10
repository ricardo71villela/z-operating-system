# Radar Léman — site estático

Este ficheiro `index.html` é uma exportação estática e autónoma (sem build, sem
dependências de servidor) do dashboard "Radar Léman" — análise de
prospeção imobiliária para os concelhos de Thonon-les-Bains / Évian-les-Bains
(74200 / 74500).

## Origem dos dados

Gerado a partir do pipeline em
`apps/intelligence/pipelines/prospection-immobiliere-74200-74500/`.
Os dados (BAN, DVF, DPE ADEME, Cadastre, Géorisques, RNB) estão incorporados
diretamente no HTML (blobs base64) — não há chamadas a APIs em runtime.

**Estado desta exportação:** ver `claude/auditoria-radar-leman-2026-09-07.md`
no projeto ZOS para o estado detalhado e o histórico de correções (terreno,
DPE, janela DVF, limiares de prioridade, andar/complemento para apartamentos).

## Deploy no Vercel

Esta pasta não tem build step. No Vercel:

1. Criar um **novo** projeto Vercel (não reutilizar o projeto `z-studio-web`
   já ligado à raiz do repositório).
2. **Root Directory** → `apps/intelligence/radar-leman-web`
3. **Framework Preset** → "Other" (site estático)
4. Build Command / Output Directory → deixar em branco (não há build)

Para atualizar o site depois de uma nova execução do pipeline, basta
substituir este `index.html` e fazer `git push` — o Vercel fará redeploy
automaticamente.

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
