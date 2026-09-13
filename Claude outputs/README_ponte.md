# Ponte de cruzamento Radar Léman ↔ scraper da concorrência (13/set/2026)

## O que foi construído

`ponte_radar_leman_concorrencia.py` — cruza por área, com as margens acordadas:
- **Terreno**: até 1% de diferença.
- **Superfície habitável**: até 2,5% de diferença.
- Sempre exige também **mesma cidade** e **mesmo tipo de imóvel**, e **nº de divisões igual** quando existir dos dois lados.

Três cruzamentos, porque são três conjuntos de dados diferentes no Radar Léman:
1. Terrenos livres ↔ anúncios de "Terreno" da concorrência.
2. Moradas "Maison" ↔ anúncios de "Casa" (exclui parcela partilhada — lotissement/copropriedade horizontal).
3. Moradas "Appartement" ↔ anúncios de "Apartamento" (só área habitável — terreno não se aplica a frações).

11 testes automáticos (`test_ponte.py`, todos a passar) cobrem os casos principais e as decisões de desenho (exclusão de parcela partilhada, divisões incompatíveis descartam o candidato, reserva quando a área do terreno não está no campo esperado).

## Corri contra dados reais (com uma ressalva importante)

Corri já contra o `prospection_prioritaire.csv`/`terrenos_livres_potencial.csv` reais e o `concorrencia_ativa.csv` — mas este último ainda é o ficheiro **anterior à correção dos bugs de preço/área** (ainda não correste o scraper de novo). Ainda assim, os resultados já revelam algo importante que vale a pena veres antes de correres de novo:

### Achado honesto: área sozinha não identifica um apartamento de forma única

Para **casas**, o cruzamento ficou razoável: 13 anúncios da concorrência com candidatos, entre 1 e 58 moradas por anúncio (a maioria com poucos candidatos).

Para **apartamentos**, a ambiguidade é grande: 99 anúncios com candidatos, alguns com **mais de 50 moradas do Radar Léman a bater dentro da margem de 2,5%** para o mesmo anúncio. Isto não é um bug — é uma limitação real de comparar só a área: Thonon/Évian têm milhares de apartamentos, e muitos agrupam-se nos mesmos tamanhos "típicos" (T2 ~45-51 m², T3 ~65-70 m², etc.), por isso uma área sozinha nunca vai apontar para UM apartamento específico, só para um conjunto de candidatos prováveis.

Isto bate certo com o que já estava documentado no próprio código do scraper desde o início — a intenção original era sempre dar-te "um segundo ponto de referência para reconheceres o mesmo apartamento", não substituir a tua verificação manual.

### Sugestão

Para apartamentos, a saída da ponte deveria funcionar como uma **lista curta ordenada** (os candidatos mais prováveis primeiro) para revisares tu, não como um cruzamento automático de confiança. Se quiseres reduzir mais a ambiguidade automaticamente, a opção mais eficaz seria acrescentar o preço como filtro adicional (largo, ex. ±20%, só para eliminar os casos claramente incompatíveis) — mas isso é uma decisão tua, não avancei com isso sem confirmar.

Para casas e terrenos, a margem de 1% no terreno (um número oficial do cadastro) já dá resultados bem mais firmes.

## Nota técnica: sessão sem ligação ao teu Mac neste momento

A ligação desta sessão ao teu computador caiu a meio do trabalho (acontece por vezes, volta sozinha) — por isso não consegui gravar os ficheiros diretamente na pasta `imoveis-scraper` como fiz antes. Estão aqui para descarregares:
- `ponte_radar_leman_concorrencia.py` → coloca em `~/Downloads/imoveis-scraper/` (ou onde preferires manter este código)
- `test_ponte.py` → mesma pasta
- `candidatos_cruzamento_EXEMPLO_dados_antigos.csv` — só para veres o formato; não é para usar a sério, porque vem dos dados antigos do scraper

## Próximos passos

1. Corres `python3 test_scrapers_audit.py` e `python -m src.main` no teu Mac (correção dos bugs de preço, ainda pendente).
2. Exportas o `imoveis` atualizado do Supabase para CSV (ou digo-te como ligar a ponte diretamente ao Supabase, se preferires).
3. Corro a ponte outra vez com os dados corrigidos e confirmamos os números reais.
4. Decidimos juntos se queres o filtro de preço para apertar mais os candidatos de apartamentos.
