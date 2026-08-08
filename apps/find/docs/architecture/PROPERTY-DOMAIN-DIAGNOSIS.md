# Z Find — Diagnóstico do Property Domain e Proposta de Evolução

**Autor:** Claude, no papel de Chief Product Officer / Chief Technology Officer / Chief Data Architect, conforme mandato atribuído.
**Estado:** Documento técnico. Zero código, zero migrations, zero tabelas criadas.

---

## 0. Antes de tudo: uma discordância que registo aqui, com justificação

O mandato original pedia um "Universal Property Model" — hotelaria, PBSA, BTR, Senior Living, Healthcare, logística, industrial, retail, escritórios, portfolios, qualquer país, qualquer sistema jurídico, desenhado para nunca mais precisar de alterar o esquema.

**Não vou propor isso, e explico exatamente porquê, com factos concretos deste projeto:**

O Z Find ainda não publicou um único imóvel real através do Admin, para um visitante real, com a Migration 0002 aplicada ao Supabase real. Não temos ainda um único dado de uso real sobre onde o modelo atual efetivamente dói. Desenhar hoje para 14 classes de ativo e qualquer sistema jurídico do mundo é resolver um problema que ainda não apareceu, ao preço de complexidade que se paga em cada sprint seguinte — não é rigor de arquiteto, é sobre-engenharia disfarçada de visão.

Nenhuma das plataformas citadas como referência (Zillow, CoStar, LoopNet, Rightmove) nasceu com um modelo universal. O CoStar começou por escritórios comerciais nos EUA. O Zillow começou por avaliação residencial. Cresceram para o resto ao longo de décadas, financiados por receita real que validava cada expansão.

**O que proponho em vez disso:** um diagnóstico honesto do que está realmente errado hoje, uma evolução do modelo que resolve essas lacunas concretas, e um **ponto de extensão desenhado deliberadamente** para que adicionar hotelaria, logística, ou qualquer vertical futura seja uma operação aditiva e barata — sem pré-construir o conteúdo dessas verticais antes de haver um cliente real a pedi-las.

Se depois de leres isto continuares a achar que devíamos construir as 14 verticais agora, diz-me e faço esse exercício também — mas não seria, na minha avaliação honesta, a decisão certa para o Z Find neste momento.

---

## 1. Diagnóstico do Modelo Atual

Modelo real (migration 0001), não uma reconstrução de memória:

```sql
properties(id, subtype, typology, area_sqm, floor, zone_lite_id, development_id, created_at)
developments(id, name, promoter_partner_id, zone_lite_id, created_at)
representations(id, target_type, property_id, development_id, partner_id, status, start_date, end_date)
listings(id, representation_id, channel, price_current, currency_iso, price_is_from, status, readiness_score)
```

### 1.1 — O que está genuinamente bem desenhado (não deitar fora)

- **`representations` separa "quem representa este ativo no mercado" do ativo em si.** Isto é correto e profissional — é como qualquer CRM imobiliário sério modela a relação agência↔imóvel, distinta do imóvel em si.
- **`listings` separa "a oferta comercial" (preço, moeda, canal, estado de publicação) do ativo físico.** Também correto — um mesmo ativo pode, em teoria, ter ofertas comerciais diferentes ao longo do tempo sem alterar o que ele *é*.
- **`target_type` em `representations`** já mostra um padrão extensível: hoje distingue `property`/`development`, mas a forma (discriminador + FK condicional) generaliza-se a mais tipos de alvo sem redesenho.
- **`media_assets`/`media_variants`**, **`listing_content`** (traduções) — já são agnósticos ao tipo de ativo, reutilizáveis por qualquer vertical futura sem alteração.
- **`currency_iso` é texto validado por formato**, não um enum fechado — já suporta qualquer moeda ISO sem alteração de esquema.

### 1.2 — O que está realmente errado ou incompleto

**Problema 1 — `subtype` é um enum fechado ao nível da base de dados.**
```sql
subtype text not null check (subtype in ('apartment', 'villa', 'land'))
```
Adicionar "escritório" ou "armazém" exige `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT` — uma migration por cada subtipo novo. Isto é atrito real e evitável.

**Problema 2 — não existe mecanismo de atributos específicos por vertical.**
`typology` (texto livre, pensado para "T2"/"T3" português) e `area_sqm` (um único número) não descrevem um hotel (nº de quartos, tarifa média), um armazém (altura ao teto, docas de carga), ou um escritório (nº de postos, planta). Isto **é** a limitação estrutural real — não a ausência de 14 tabelas, mas a ausência de **um mecanismo de extensão**.

**Problema 3 — não existe conceito de Portfolio.**
Uma coleção de ativos não relacionados (ex: um fundo com 12 imóveis em 4 cidades) não tem representação nenhuma no modelo atual. `development_id` só liga unidades DENTRO do mesmo empreendimento — não é a mesma coisa.

**Problema 4 — `zones_lite` é deliberadamente Portugal-only.**
Isto está documentado e é uma simplificação consciente, não um bug escondido — o módulo `packages/geography/geography.js` já suporta País→Região→Cidade→Zona multi-país, mas a base de dados usa uma tabela simplificada (`zones_lite`) só para acelerar o MVP. **Isto é o gap mais fácil de resolver quando for realmente necessário** — o caminho já existe, só não foi ligado à BD ainda.

**Problema 5 — não há noção de tenure/regime jurídico.**
"Freehold" vs "leasehold", ou o equivalente português (propriedade plena vs direito de superfície), não existe em lado nenhum. Relevante assim que se sai de Portugal ou se entra em comercial/industrial.

### 1.3 — O que NÃO é um problema real (contrariamente ao que o mandato original assumia)

- **Multi-moeda** já funciona (`currency_iso` por listing).
- **Multi-idioma** já funciona (`listing_content` por locale, 3 idiomas ativos, arquitetura pronta para mais via INSERT, não schema change).
- **Separar ativo de oferta comercial** já está feito corretamente.

---

## 2. Modelo Conceptual Novo

### 2.1 — Princípio orientador

**Não reescrever o que funciona. Adicionar exatamente um mecanismo de extensão, mais um nível de classificação, mais um conceito de agrupamento (Portfolio) — e nada mais, até haver procura real por mais.**

### 2.2 — Entidades

```
asset_classes            (novo, tabela de referência — substitui o CHECK enum)
  id, code, label, parent_class   -- ex: 'residential', 'land', 'hospitality' (futuro)

property_subtypes        (novo, tabela de referência — substitui o CHECK enum de subtype)
  id, code, asset_class_id, label -- ex: 'apartment'→residential, 'hotel_room'→hospitality (futuro)

properties                (existente, evoluído)
  id, subtype_id (FK, não mais enum), typology, area_sqm, floor,
  zone_lite_id, development_id, attributes jsonb, created_at
                           ^^^^^^^^^^^^^^^^ novo — atributos específicos de vertical,
                           sem forçar uma coluna nova por cada tipo de dado futuro

portfolios                (novo)
  id, name, owner_partner_id, created_at

portfolio_items           (novo, tabela de junção)
  portfolio_id, target_type ('property'|'development'), property_id, development_id
                           -- mesmo padrão de discriminador já usado em representations

developments, representations, listings, listing_content,
media_assets, media_variants, listing_media, development_media  (inalterados)
```

### 2.3 — Relações

- `properties.subtype_id` → `property_subtypes.id` → `property_subtypes.asset_class_id` → `asset_classes.id`
  (hierarquia de classificação, extensível por INSERT, nunca por ALTER TABLE)
- `properties.attributes` (jsonb) — pares chave/valor específicos do subtipo, validados na aplicação (services/admin.js), não na base de dados — mantém a BD simples, a validação de forma evolui sem migration.
- `portfolios` 1—N `portfolio_items`, cada item aponta para uma property OU development existente, exatamente como `representations` já faz.
- Todo o resto do grafo (representations→listings→listing_content, media) **não muda**.

### 2.4 — Justificação de cada decisão

| Decisão | Porquê |
|---|---|
| `asset_classes`/`property_subtypes` como tabelas, não enums | Adicionar um subtipo passa a ser um INSERT (como já acontece com `system_languages`), não uma migration. Zero risco, reversível, consistente com o padrão já estabelecido no projeto. |
| `attributes jsonb`, não colunas por vertical | Uma tabela com 40 colunas nullable (a maioria sempre vazia) é pior para performance, legibilidade e integridade do que um jsonb validado na aplicação. É também o padrão que qualquer sistema real (Airbnb, Zillow) usa para atributos de cauda longa. |
| `portfolios` como tabela nova, não reutilizar `developments` | Um Portfolio não tem geografia única nem promotor único — é uma estrutura diferente. Forçá-lo dentro de `developments` corromperia o significado de "empreendimento". |
| Não tocar em `representations`/`listings`/`media`/`listing_content` | Já estão corretamente desenhados e são agnósticos ao tipo de ativo — reescrevê-los seria risco sem benefício. |
| Não ligar `zones_lite` à Geography completa agora | Não há ainda procura real por um segundo país. O caminho existe (`packages/geography/`) e fica documentado como o próximo passo natural quando a procura aparecer — não antes. |

---

## 3. Estratégia de Migração — Sem Perda de Dados

Tudo abaixo é **estritamente aditivo**. Nenhuma coluna existente é removida, nenhum dado existente muda de forma.

1. Criar `asset_classes`, `property_subtypes` (novas tabelas, populadas com os 3 subtypes atuais + a classe 'residential' e 'land').
2. Adicionar `properties.subtype_id` (nullable inicialmente) + `properties.attributes jsonb default '{}'`.
3. Backfill: `update properties set subtype_id = (lookup pelo subtype de texto atual)`.
4. Só depois do backfill confirmado: tornar `subtype_id` `not null`, e (numa migration posterior, não na mesma) considerar descontinuar a coluna `subtype` de texto — sem pressa, sem quebrar nada entretanto (pode coexistir indefinidamente).
5. Criar `portfolios`, `portfolio_items` — tabelas novas, sem interferência com o resto.
6. Zero alteração a RLS/GRANTs de tabelas existentes; políticas novas só para as tabelas novas, seguindo exatamente o padrão de `is_admin()` já estabelecido na Migration 0002.

---

## 4. Riscos

- **Validação de `attributes jsonb` fica na aplicação, não na BD** — exige disciplina em `services/admin.js` para não deixar entrar lixo. Mitigação: um pequeno schema de validação por `subtype_id`, versionado no código, testado como qualquer outro serviço.
- **Tentação de encher `attributes` com tudo** em vez de promover campos genuinamente comuns a colunas próprias — mitigação: revisão explícita antes de cada vertical nova ("isto é específico deste subtipo, ou devia ser uma coluna partilhada?").
- **Portfolio é um conceito novo sem cliente a pedi-lo ainda** — proponho-o porque resolve uma lacuna real e é barato (2 tabelas, padrão já conhecido), não porque seja urgente. Se preferires, fica fora do roadmap imediato.

## 5. Benefícios

- Adicionar um subtipo novo (ex: "moradia geminada") deixa de exigir migration.
- Uma vertical genuinamente nova (ex: hotelaria) tem, desde já, um sítio correto para viver (`asset_classes` + `attributes`) sem exigir uma segunda arquitetura paralela.
- Nada do que já funciona (Homepage, Search, Property, Development, Leads, Admin) precisa de ser tocado para isto acontecer — é uma evolução aditiva, testável isoladamente.

## 6. Roadmap de Implementação

1. **Migration 0004** — `asset_classes`, `property_subtypes`, backfill, `attributes jsonb`. Zero UI nova ainda.
2. **`services/admin.js`** — validação de `attributes` por `subtype_id`, formulário do Admin passa a ler o subtipo dinamicamente da tabela em vez de um `<select>` fixo.
3. **Migration 0005** (só quando houver procura real) — `portfolios`, `portfolio_items`.
4. **Ligação a Geography completa** (só quando houver um segundo país real a onboardar) — documentado aqui como o próximo passo natural, não implementado agora.

---

**Nota final, honesta:** este documento não te dá as 14 verticais que o mandato original pedia. Dá-te o mecanismo para adicionares qualquer uma delas, uma de cada vez, quando houver um cliente real a pagar por ela — que é, na minha avaliação como arquiteto responsável por este produto, a decisão que continuará correta daqui a 10 anos, exatamente o teste que o próprio mandato pede que eu aplique.
