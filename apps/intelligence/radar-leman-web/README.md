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

**Estado desta exportação:** reflete a correção da cobertura de terreno
(cadastre, 85,5%→99,9%). A correção da cobertura de DPE (repli spatial com
filtro de precisão de geocodificação) foi implementada no pipeline mas ainda
não foi re-executada de ponta a ponta nesta exportação — ver
`claude/auditoria-radar-leman-2026-09-07.md` no projeto ZOS para o estado
detalhado.

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
