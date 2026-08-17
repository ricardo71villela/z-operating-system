# Phase 0 — Baseline

Data: 12 de agosto de 2026 (dentro desta sessão de trabalho).

## Inventário

| Peça | Localização neste repo | Linhas/tamanho | Estado |
|---|---|---|---|
| App principal | `app/my-studio.html` | 3.109 linhas | Fonte de verdade a partir de agora |
| Wrapper nativo | `native/` (ios, android, www) | — | Gerado por `npx cap sync` a partir de `www/` |
| Testes | `tests/run-tests.js`, `run-mobile-check.js` | 164 verificações | Reproduzível — ver abaixo |
| Legal | `legal/*.html` | — | Rascunhos, com placeholders por preencher |
| PWA | `pwa/manifest.webmanifest`, `sw.js`, ícones | — | — |
| Golden renders | `goldens/*.png` | 18 imagens | Gerados nesta Phase 0, ver abaixo |

## Testes — reprodutibilidade confirmada

Corrido numa pasta limpa, sem nada reaproveitado do ambiente de trabalho:

```
mkdir clean-room-test && cd clean-room-test
cp {run-tests.js, run-mobile-check.js, package.json} .
cp app/my-studio.html .
npm install --no-audit --no-fund   →  added 13 packages in 4s
npm test                            →  RESULTADO: 164 passaram, 0 falharam, 0 ignorados (de 164)
```

## Golden renders — o que protegem

18 imagens em `goldens/`, geradas com conteúdo sintético determinístico (mesmo gradiente,
mesmo texto, sempre "Golden Reference Title" / "123.456€" / "Porto" / "Golden Badge"):

- `formato-{feed45,square,story,wide,pin}-classico.png` — os 5 formatos, template Clássico
- `template-{classico,editorial,minimalista}-feed45.png` — os 3 templates de foto única
- `colagem-{2,4,6,8}fotos.png` — as 4 disposições de grelha da Colagem
- `antesdepois.png`
- `categoria-imoveis-certificado.png` — certificado energético + ficha
- `categoria-viagens-estrelas.png`
- `categoria-gastronomia-alergenios.png`
- `categoria-moda-tamanhos.png`
- `estado-vazio.png` — placeholder sem foto

**Uso pretendido:** antes de qualquer alteração ao renderer (`drawListing`, `smartCoverDraw`,
`drawGridTextBand`, etc.), gerar o mesmo conjunto outra vez e comparar pixel a pixel. Uma
diferença inesperada é sinal de regressão visual — exatamente a proteção que faltava e que a
auditoria pediu antes de qualquer refactor tocar no renderer.

**Limitação honesta:** esta comparação ainda é manual (eu a olhar lado a lado). Não é
`pixelmatch` automatizado — isso fica para a Phase 1/2, quando a suite de testes for
reestruturada.

## Git

Repositório inicializado em `mystudio-repo/`, primeiro commit nesta Phase 0 como ponto de
recuperação seguro. Antes desta sessão, o projeto não tinha controlo de versões nenhum —
confirmei com `git status` a partir dos diretórios de trabalho antes de criar este repo.

## O que NÃO foi feito nesta fase (fica para Phase 1+)

- Nenhuma modularização do ficheiro principal
- Nenhuma correção de bugs (incluindo o `parseEuroNumber` — fica documentado, não corrigido ainda)
- Nenhuma alteração ao `package.json` do projeto nativo
- Nenhuma mudança ao backend de IA (continua inexistente)

Isto foi deliberado — a Phase 0 é só o ponto de partida seguro, não correções.
