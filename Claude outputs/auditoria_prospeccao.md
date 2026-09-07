# Auditoria — Pipeline de Prospeção Imobiliária (74200/74500)

Data: 2026-09-06 · Baseada no código completo (13 módulos Python) + inspeção do output real da última execução (2 766 moradas, 26 comunas).

## 1. O que a ferramenta já faz bem

- **Zero dados pessoais**: só endereço + dados públicos de transação (DVF) e energéticos (DPE). Cumpre RGPD por desenho, não por remendo.
- **Prospeção postal, não telefónica/SMS**: evita todo o regime Bloctel/consentimento que se aplicaria a chamadas ou e-mail. É a via mais segura legalmente — vale a pena manter assim enquanto o canal for a carta.
- **Argumentação coletiva** ("Le Propriétaire, [morada]"), nunca nominativa — testada (`test_argumentaire.py`).
- **DPE como sinal principal**: cobre o ponto cego do DVF (imóveis nunca vendidos) e liga a um gatilho real (proibição de arrendamento G/F/E). Cobertura DPE no output: **88%** das moradas.
- Os dois bugs reais encontrados na depuração (paginação DPE truncada, janela DVF mal calculada) já estão corrigidos e validados em execução real.

## 2. O que está a limitar a eficácia — por impacto

### 2.1. O maior problema: falta argumento de mais-valia em 88% dos alvos
No ficheiro `prospection_prioritaire.csv` (2 766 moradas):
- Só **13,5%** têm ≥3 comparáveis de rua.
- **87,7%** ficam sem `argument_prudent` (a frase "os imóveis comparáveis valorizaram X% desde a sua compra") preenchida.

Isto é o coração comercial da ferramenta — é o que transforma uma carta fria num argumento com números. Sem ele, a carta cai para "só" o argumento DPE (que também não existe quando não há DPE). Vale mais investir aqui do que em qualquer outra coisa: alargar o raio/fallback de comparáveis (hoje cai para a média da comuna em 514 casos, mas mesmo assim não gera argumento — vale rever o limiar em `argumentaire.py`/`pricing.py` que exige comparáveis de rua específicos).

### 2.2. O score não diferencia dentro do grupo "B"
- 2 662 das 2 766 moradas (96%) caem em "B — Prioridade alta", com scores entre 50 e 63 (amplitude real ~13 pontos).
- Só 104 moradas atingem "A — Prioridade máxima".
- Isto confirma o alerta que já tinha aparecido no diagnóstico ("amplitude de scores insuficiente"): não é um bug de código, é falta de sinais discriminantes. Com 2 662 alvos "B" e nenhuma ordem interna útil, quem for ligar/enviar cartas não sabe por onde começar dentro desse bloco.
- Sugestão concreta: acrescentar 1–2 sinais novos com peso pequeno (ex.: nº de anos desde a última obra/licença se disponível via Cadastre, ou normalizar o score por percentil dentro de cada comuna em vez de escala fixa 0–100) só para espalhar o bloco B.

### 2.3. Falta cache de downloads (e o texto do diagnóstico mente sobre isso)
`diagnostic.py` afirma que "os dados já descarregados são reaproveitados" — não é verdade, não existe nenhum mecanismo de cache no código. Cada execução volta a descarregar BAN (departamento inteiro), DVF (4 anos) e todos os DPE por comuna. Isto é desperdício de tempo/banda a cada corrida e vai pesar mais à medida que se expandir a novas comunas.

### 2.4. Suite de testes existe mas não corre em lado nenhum
`test_pricing.py` e `test_argumentaire.py`, mais os autotestes de `normalize.py` e `scoring.py`, são bons e cobrem casos reais (incluindo os dois bugs corrigidos) — mas não estão ligados a `intelligence:test` nem a nenhum workflow do GitHub Actions. Hoje, uma regressão como as duas que apanhámos manualmente passaria despercebida até à próxima execução real.

### 2.5. Trabalho pendente por integrar no GitHub
As correções da depuração (`http_utils.py`, `ingest_ban.py`/`ingest_dvf.py`, as duas revisões de `config.py`, `enrich_dpe.py`) estão validadas no seu Mac mas ainda não foram commitadas/enviadas para o GitHub. Isto é risco puro — se perder essa máquina ou pasta, perde as correções.

## 3. Recomendações, por ordem de impacto

1. **Alargar a cobertura do argumento de valorização** (2.1) — maior alavanca comercial disponível, hoje 88% das cartas saem sem o número de mais-valia.
2. **Espalhar o score dentro do grupo B** (2.2) — sem isto, a lista de 2 662 alvos "prioridade alta" não ajuda a decidir por onde começar.
3. **Fazer o commit/push das correções pendentes** (2.5) — risco de perda de trabalho, deve ser resolvido primeiro que tudo o resto que envolva código novo.
4. **Adicionar cache real de downloads** e corrigir o texto do diagnóstico (2.3) — ganho operacional simples.
5. **Ligar os testes existentes ao `intelligence:test`/CI** (2.4) — protege os dois bugs já corrigidos de voltarem sem serem notados.
6. **Explorar as fontes já sugeridas no próprio README** ("Pistes d'extension"): Cadastre (dados de parcela/propriedade), Géorisques (riscos — outro argumento de venda), RNB — podem subir a taxa de correspondência BAN/DVF/DPE e dar mais sinais ao score.
7. **PDF das fichas**: já está a tentar `weasyprint` primeiro, mas falta a biblioteca nativa `libgobject` no seu Mac (macOS 12, seria uma instalação pesada via Homebrew). Recomendo gerar os PDFs através do GitHub Actions (Ubuntu tem as dependências nativas mais simples de instalar) em vez de continuar a tentar no Mac.
8. **Decisão de negócio em aberto**: os pesos de `SCORING` (config.py) são uma escolha estratégica sua, não técnica — agora com a distribuição real de scores em mãos (50–88, concentrado em 52–63), pode ajustá-los com dados reais em vez de às cegas.

## 4. Números-chave desta execução

| Métrica | Valor |
|---|---|
| Moradas no ficheiro prioritário | 2 766 |
| Segmento POTENCIAL_ELEVADO | 2 661 |
| Segmento POTENCIAL_MÉDIO | 105 |
| Prioridade A (máxima) | 104 |
| Prioridade B (alta) | 2 662 |
| Score mín / mediana / máx | 50 / 55 / 88 |
| Cobertura DPE | 88% |
| Cobertura última venda (DVF) | 34% |
| ≥3 comparáveis de rua | 13,5% |
| Sem argumento de mais-valia | 87,7% |
| "Passoire thermique" (E/F/G) | 1 616 (58%) |
