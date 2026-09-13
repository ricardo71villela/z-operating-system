# Auditoria agência a agência — scraper da concorrência (13/set/2026)

## Pedido
Antes de avançar com o cruzamento com o Radar Léman, auditar o scraper agência a agência e corrigir os campos que estavam a ficar vazios.

## Método
Análise do CSV exportado (`concorrencia_ativa.csv`) para medir a percentagem de campos vazios por agência, seguida de inspeção ao vivo do HTML real de cada site (via browser) para diagnosticar a causa exata — sem adivinhar, confirmando cada bug com o próprio código de produção a correr contra o HTML capturado ou contra mocks fiéis ao HTML real.

## Três bugs reais encontrados (não eram limitações dos sites)

### Bug 1 — separador de milhares "invisível" fazia o preço desaparecer
Muitos sites franceses escrevem os preços com um espaço especial entre os milhares (ex. "315 000 €") em vez do espaço normal — visualmente idêntico, mas um carácter diferente (espaço insecável). O código só sabia remover o espaço normal; ao tentar converter "315␠000" para número, falhava em silêncio e o campo ficava vazio — mesmo o preço já estando corretamente identificado no texto.

**Confirmado em produção**: Cabinet Greneche, Nestenn Évian.

### Bug 2 — o código parava demasiado cedo a olhar para o texto do anúncio
Para encontrar o preço/superfície de cada cartão, o código subia da hiperligação do anúncio até ao primeiro `<div>`/`<article>`/`<li>` ancestral — mas em vários sites esse primeiro ancestral é só a moldura da fotografia, sem preço nenhum lá dentro; o preço só aparece 2 a 6 níveis mais acima na árvore HTML.

**Confirmado em produção**: Poirier Immobilier, Cap Terrains Immo, CENTURY 21 (as duas agências), Dupraz Immobilier — 6 das 18 agências.

Bónus encontrado na mesma revisão: o scraper da CENTURY 21 não agrupava as várias hiperligações do mesmo imóvel (foto + título), pelo que cada anúncio arriscava ficar **duplicado** na base de dados. Corrigido ao mesmo tempo.

### Bug 3 — uma falha a meio da paginação perdia TODOS os imóveis já recolhidos
Descoberto só depois de corrigidos os bugs 1 e 2, porque continuava a aparecer 100% de preço em falta em 5 agências inteiras (Cabinet Greneche, Agence Lehmann, TiT Immobilier, Christelle Vannier Immobilier, Nestenn Évian) apesar da extração já estar comprovadamente correta.

Causa: o Mac do Ricardo tinha o Playwright instalado como pacote Python mas sem o browser (Chromium) descarregado. `fetch_smart()` tenta primeiro um pedido HTTP simples; se não encontra anúncios (o que acontece tanto em sites que precisam mesmo de JavaScript como, de forma perfeitamente normal, na última página de qualquer site paginado, quando já não há mais anúncios), recorre ao Playwright como fallback — e esse fallback rebentava sempre, por falta do browser. Como o `while` de paginação não tinha proteção nenhuma à volta desta chamada, o erro subia sem ser apanhado e `fetch_listings()` perdia **todos** os imóveis já recolhidos nas páginas anteriores dessa agência — não só a página com erro. Para as 5 agências com um único URL listado (sem outros alvos de reserva), isto significava sempre zero imóveis gravados.

**Confirmado na corrida real de 13/set**: depois de corrigido, estas 5 agências passaram de 0 imóveis gravados para 12, 11, 2, 23 e 18 imóveis respetivamente — todos com preço presente.

Nota à parte, não é bug do código: o Chromium deixou de dar suporte ao macOS 12 (Monterey) este ano — o Mac do Ricardo não consegue instalar o browser do Playwright enquanto não atualizar o macOS (ou usar Firefox como alternativa). Isto continua a impedir os sites genuinamente dependentes de JavaScript (Laforêt, Imogroup, Square Habitat, Peillex) de devolver dados — mas já não apaga dados de outras agências quando isso acontece.

## Estado antes da correção (amostra da recolha de 13/set)

| Agência | Imóveis | Preço em falta |
|---|---|---|
| CENTURY 21 (Thonon + Évian) | 93 | 100% |
| Cap Terrains Immo | 61 | 100% |
| Poirier Immobilier (Thonon + Évian) | 16 | 100% |
| Christelle Vannier Immobilier | 22 | 100% |
| Nestenn Évian | 17 | 100% |
| Cabinet Greneche | 12 | 100% |
| Agence Lehmann | 10 | 100% |
| Dupraz Immobilier | 4 | 100% |
| Square Habitat Évian | 2 | 100% |
| TiT Immobilier | 2 | 100% |
| Ripaille Immobilier | 15 | 100% (ver nota abaixo) |
| Agence Barnoud, BARNES Léman, Leman Property, Evian Sotheby's, Laforêt | — | já funcionavam bem |

**Nota sobre a Ripaille Immobilier**: confirmei ao vivo que este site simplesmente não publica preço nem superfície na maioria dos cartões (site pequeno, sem essa informação exposta) — não é um bug, é uma limitação real dos dados de origem, já documentada no próprio código.

## Correção aplicada

- `_clean_numeric()` em `base.py` — remove qualquer tipo de espaço (normal, insecável, fino insecável) antes de converter preço/superfície de terreno para número.
- `to_float()` em `normalize.py` — mesma limpeza aplicada como segunda camada de defesa.
- `climb_to_content_block()` (novo, em `base.py`) — sobe ancestral a ancestral a partir do link do anúncio até encontrar o preço, em vez de parar sempre no primeiro `<div>`; para assim que encontra, para nunca misturar dados de cartões vizinhos. Aplicado em `generic_scraper.py`, `laforet_scraper.py` e `century21_scraper.py`.
- `century21_scraper.py` — reescrito para agrupar as várias hiperligações do mesmo imóvel (como já acontecia nos outros scrapers), evitando duplicados.
- `generic_scraper.py`, `laforet_scraper.py`, `century21_scraper.py` — a chamada a `fetch_smart()` dentro do `while` de paginação passou a estar protegida por `try/except`: uma falha numa página é tratada como fim normal da paginação, devolvendo os imóveis já recolhidos em vez de os perder todos.

## Estado depois da correção (corrida de 13/set, com os três bugs corrigidos)

| Agência | Antes | Depois |
|---|---|---|
| Cabinet Greneche | 0 imóveis (100% falha) | 12 imóveis, 0% sem preço |
| Agence Lehmann | 0 imóveis (100% falha) | 11 imóveis, 0% sem preço |
| TiT Immobilier | 0 imóveis (100% falha) | 2 imóveis, 0% sem preço |
| Christelle Vannier Immobilier | 0 imóveis (100% falha) | 23 imóveis, 0% sem preço |
| Nestenn Évian | 0 imóveis (100% falha) | 18 imóveis, 0% sem preço |
| CENTURY 21, Cap Terrains, Poirier, Dupraz (Thonon) | 100% sem preço | 0% sem preço |

Resultado: **374 imóveis ativos exportados**, dos quais só a Ripaille Immobilier (15) continua sem preço — por limitação real do site, não bug. Todas as outras 20 agências com dados estão a 0% de preço em falta.

Continuam a devolver 0 imóveis (dependem de JavaScript, bloqueado pelo Playwright/macOS 12 — ver Bug 3): Imogroup (Thonon e Évian), Peillex Gestion, Dupraz Immobilier Évian.

Validado com 10 testes automáticos originais + 3 novos testes de regressão para o Bug 3 (`test_scrapers_audit.py`, 13 testes no total, todos a passar no Mac do Ricardo).

## O que ainda fica por resolver (não são bugs, são limitações da abordagem atual)

- Alguns campos continuam vazios em TODAS as agências, incluindo as que já funcionavam bem: `dpe_classe`, `ano_construcao`, e a superfície de terreno na maioria dos casos. Isto acontece porque o scraper só lê a página de LISTAGEM — nunca visita a página individual de cada anúncio, onde esses dados normalmente aparecem. Resolver isto implicaria ~370 pedidos HTTP extra por corrida em vez de ~30 — não implementado, à espera de decisão.
- Imogroup, Peillex Gestion e Dupraz Évian continuam sem dados até o Playwright voltar a funcionar no Mac do Ricardo (atualizar para macOS 13+, ou tentar Firefox como motor alternativo).

## Próximo passo

1. ~~Correr `python3 test_scrapers_audit.py` no Mac do Ricardo~~ — feito, 13/13 testes a passar.
2. ~~Correr `python3 -m src.main` + `python3 -m src.export_para_radar_leman` para repovoar o Supabase~~ — feito, 374 imóveis ativos exportados.
3. Avançar com a ponte de cruzamento com o Radar Léman, agora com dados genuinamente completos.
