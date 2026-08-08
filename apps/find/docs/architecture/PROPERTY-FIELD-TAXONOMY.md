# Z Find — Taxonomia Completa de Campos (Propriedades e Empreendimentos)

**Estado:** Documento de referência. Nenhuma migração criada ainda — isto é a lista completa, categorizada, para decidirmos juntos o que entra e em que ordem.

**Fontes reais, não memória:**
- **RESO Data Dictionary** (Real Estate Standards Organization) — o standard usado por centenas de MLS na América do Norte, e cada vez mais citado internacionalmente como referência de interoperabilidade de dados imobiliários.
- **Decreto-Lei 101-D/2020** (Portugal) — obrigação legal do Certificado Energético em anúncios.
- A ficha real de imóvel da Z Imobiliária, já inspecionada (`numberOfRooms`, `numberOfBathroomsTotal`, `floorSize`).

---

## 0. Como isto se encaixa na arquitetura já construída

A Migration 0004 já criou o mecanismo — falta usá-lo:
- **Colunas "core"** — em `properties`, para atributos que **toda** propriedade tem e que são frequentemente usados como filtro de pesquisa (quartos, área, ano).
- **`property_features` + `features`** — para atributos **opcionais, binários** (tem/não tem), filtráveis (piscina, elevador, garagem).
- **`properties.attributes` (jsonb)** — só para o que é genuinamente raro ou específico de nicho, nunca um critério de filtro.

---

## 1. Obrigatório por lei em Portugal — prioridade máxima

| Campo | Onde vai | Porquê |
|---|---|---|
| **Classe Energética** | Coluna core, `properties.energy_rating`, enum exato: `A+`, `A`, `B`, `B-`, `C`, `D`, `E`, `F` (8 classes, não um intervalo — `B-` é uma classe própria, é o limiar mínimo obrigatório para construção nova) | **Legalmente obrigatório em todo o anúncio**, DL 101-D/2020 art. 22º/24º. Coimas até €3.740. Hoje não existe no Z Find — risco de conformidade real, não só lacuna de produto. |
| Número do Certificado (SCE) | Coluna core, `properties.energy_certificate_number` | Exigido no anúncio desde a revisão de 2020 do decreto-lei — não basta mostrar a letra, o número do certificado tem de constar. |

**Nota, peso legal diferente — não confundir com o Certificado Energético:** pesquisei também a "Licença de Utilização". Ao contrário do Certificado Energético, as fontes **não são consistentes** — desde o Simplex Urbanístico (DL 10/2024) deixou de ser formalmente obrigatória na escritura, mas continua a ser pedida na prática por bancos para financiamento. Mais importante: **não encontrei nenhuma fonte a exigir que conste do anúncio em si**, ao contrário do Certificado Energético. Por isso, proponho-a como campo de referência útil (`properties.license_number`, opcional), não como requisito legal de anúncio — categorias diferentes, tratadas com o rigor que cada uma merece.

---

## 1.5. Localização exata — hoje só temos zona genérica

| Campo | Nome sugerido | Porquê |
|---|---|---|
| Morada completa | `street_address` (novo) | Sem isto, nunca há mapas reais nem indicação exata — hoje só sabemos a zona. |
| Latitude / Longitude | `latitude`, `longitude` (novos, numeric) | Pré-requisito direto para qualquer mapa — item já identificado em falta no diagnóstico de zonas. |
| Código postal | `postal_code` (novo) | Padrão em qualquer ficha, útil para validação de morada. |
| Distrito/Região | já coberto indiretamente por `zones_lite.city`/`country_iso`, mas **falta o nível intermédio** | Portugal tem Distrito entre Concelho e País — `zones_lite` hoje não modela isto explicitamente; fica registado como gap conhecido, não resolvido nesta migração (ligação à Geography completa, já identificada no `PROPERTY-DOMAIN-DIAGNOSIS.md`). |

---



Alinhados com o RESO Data Dictionary (`BedroomsTotal`, `BathroomsFull`, `BathroomsHalf`, `LivingArea`, `LotSizeArea`, `YearBuilt`), traduzidos para o nosso contexto:

| Campo | Nome sugerido | Porquê é "core" e não feature |
|---|---|---|
| Quartos | `bedrooms` (int) | Critério de filtro nº1 em qualquer portal, confirmado na ficha real da Z Imobiliária (`numberOfRooms`). |
| Número de salas | `living_rooms` (int, default 1) | Distinto de quartos — um imóvel com sala + escritório separado do open-space é uma diferença real de valor. |
| Casas de banho | `bathrooms` (int) — **um único número, não dividido** | **Correção feita ao rever este documento**: a proposta inicial copiava o RESO à letra (`BathroomsFull`/`BathroomsHalf` separados), mas a ficha real da Z Imobiliária mostra "WC: 5", um número único — é assim que o mercado português preenche isto na prática. Seguir o standard americano sem confirmar contra a prática real teria criado um campo que ninguém preenche corretamente. |
| Área útil (m²) — Au | já existe (`area_sqm`) | Soma de todos os compartimentos, medida pelo **perímetro interior** das paredes. É o número que se "vai efetivamente usar". |
| Área bruta privativa (m²) — ABP | `gross_private_area_sqm` (novo) | Medida pelo **perímetro exterior** + espessura de paredes, inclui varandas fechadas/marquises, caves/sótãos privativos. **Consta na Caderneta Predial**, é a base do VPT/IMI. Não inclui garagem nem arrumos — esses são ABD. |
| Área bruta dependente (m²) — ABD | `dependent_area_sqm` (novo) | Espaços cobertos e fechados de uso exclusivo mas **acessórios** — é aqui, tecnicamente, que **garagem e arrumos vivem**, não na área privativa. Frequentemente confundido em anúncios, por isso vale a pena ter o campo certo. |
| Área bruta total (m²) | **calculada** (ABP + ABD), não guardada como coluna própria | Evita inconsistência — nunca se guarda um número que é sempre igual à soma de outros dois. |
| Área de implantação (m²) — para Empreendimentos | `footprint_area_sqm` (novo, em `developments`) | Área ocupada pelo edifício no terreno — distinta da área de construção total (que soma todos os pisos). |
| Área de terreno / logradouro (m²) | `plot_area_sqm` (novo) | RESO: `LotSizeArea`. Sem isto, um terreno, moradia com jardim, ou empreendimento nunca aparece corretamente descrito. |

**Correção feita nesta revisão, a pedido direto:** a versão anterior só tinha "área útil" e um vago "área bruta/total" — não distinguia Área Bruta **Privativa** de Área Bruta **Dependente**, que são conceitos legalmente distintos em Portugal (Código do IMI), e é exatamente onde garagens e arrumos se enquadram tecnicamente. Sem esta distinção, o Z Find estaria a cometer o mesmo erro de ambiguidade que os próprios artigos do setor identificam como fonte de confusão generalizada nos anúncios portugueses.
| Ano de construção | `year_built` (novo) | RESO: `YearBuilt`. Também informa "Estado" indiretamente. |
| Estado de conservação | `condition` (novo, enum: novo/usado/a_renovar/renovado) | Muito citado em qualquer mercado, PT incluído. |

---

## 2.6. Financeiro factual — só declarado, nunca calculado por nós

| Campo | Nome sugerido | Porquê / limite |
|---|---|---|
| Condomínio mensal | `condo_fee_monthly` (novo) | Custo real declarado pelo vendedor/agência, factual. |
| IMI anual | `imi_annual` (novo) | Idem — valor que já consta na Caderneta Predial do vendedor, nunca estimado por nós. |
| Valor Patrimonial (VPT) | `taxable_value` (novo) | Idem, factual, vem da Caderneta Predial. |
| Condições de pagamento | `payment_terms` (texto livre) | Descrição, não um número calculado. |
| Aceita permuta | `accepts_trade` (boolean) | Simples, factual. |

**Preço anterior / Histórico de preços — não é um campo, é uma tabela:**
`price_history(id, listing_id, price, currency_iso, recorded_at)` — porque é uma série ao longo do tempo, nunca um valor único a substituir. Populada automaticamente sempre que `listings.price_current` mudar (trigger ou lógica de aplicação — decisão de implementação, não de schema).

**Recuso deliberadamente, mesma razão do `PRODUCT-AUDIT-V1.md`:** "Estimativa de renda" e "Rentabilidade" só entram como **valor declarado pelo vendedor**, explicitamente rotulado como estimativa do anunciante — nunca calculado ou validado pelo Z Find. Um número de rentabilidade que pareça vir de nós, sem dados reais de transações a sustentá-lo, é risco de credibilidade, não valor.

---

 — três conceitos de "piso" que não são o mesmo, e onde paro na completude de compartimentos

**Piso já existe** (`properties.floor`, desde a migração original) — mas só responde a **uma** pergunta: em que piso está a fração. Não responde a duas outras, genuinamente diferentes:

| Campo | Nome sugerido | Porquê é diferente do `floor` já existente |
|---|---|---|
| Nº de pisos que o próprio imóvel ocupa | `unit_floors` (novo, default 1) | Um duplex ocupa 2, um triplex ocupa 3 — isto não é "em que piso está", é "quantos pisos tem por dentro". |
| Nº total de pisos do edifício | `building_floors` (novo, em `developments` — o edifício, não a fração) | Contexto relevante ("5º de 6" é muito diferente de "5º de 20"), e pertence ao edifício, não a cada unidade individualmente. |

**Sobre compartimentos ("tudo o que uma casa e um apartamento têm") — decisão deliberada de onde paro:**

Adiciono como `features` (binário, pesquisável) os compartimentos que são genuinamente distintos e comuns de encontrar como critério de busca:
- Escritório / Gabinete
- Lavandaria
- Hall de entrada
- Closet / Roupeiro

**O que não faço, e digo porquê:** não vou modelar sala, cozinha, quartos individuais, cada casa de banho, um por um, com metragem própria — isso deixaria de ser "descrever um imóvel" e passaria a ser "desenhar a planta arquitetónica dele". Nem a ficha real da Z Imobiliária que inspecionei faz isso (a riqueza dela vem de fotos e descrição, não de uma lista compartimento a compartimento). Se a experiência mostrar que isto é mesmo necessário, é exatamente para isso que existe `attributes` (jsonb) — descrição livre, sem forçar uma coluna nova por cada divisão possível de uma casa.



Binário (tem/não tem), filtráveis. Lista compilada do RESO (`Appliances`, `PoolFeatures`, `ParkingFeatures`, `AccessibilityFeatures`) cruzada com o que é comum em anúncios portugueses:

**Exterior/estrutura:**
- Elevador
- Piscina
- Varanda
- Terraço
- Jardim

**Estacionamento e arrumos — separados, não um único "garagem" genérico, a pedido direto:**
- Garagem Box (lugar individual fechado e trancável — distinto de um lugar aberto)
- Lugar de Garagem Coberto (interior, sem box próprio)
- Lugar de Garagem Descoberto (exterior)
- Lugar para Bicicleta
- Arrumos / Arrecadação (o espaço de armazenamento em si, distinto de qualquer lugar de estacionamento)

**Correção feita nesta revisão, a pedido direto:** a versão anterior tinha só "Garagem / Lugar de estacionamento" e "Arrecadação" como duas linhas genéricas — não distinguia um box fechado de um lugar aberto, nem interior de exterior, nem previa bicicletas. Cada um destes é um espaço fisicamente diferente, com valor de mercado diferente, e um comprador pesquisa por eles de forma distinta ("quero garagem box", não só "quero estacionamento").

**Orientação solar:**
- Nascente
- Poente
- Norte
- Sul

**Correção feita ao rever este documento:** a versão inicial tinha "notas de exposição solar" metida em `attributes` (jsonb, para o que é raro e nunca filtrável). Estava errado — orientação solar é um critério de pesquisa comum e estruturado no mercado português, tem de estar em `features`, pesquisável, não escondida.

**Climatização/conforto:**
- Ar condicionado
- Aquecimento central
- Painéis solares

**Acessibilidade:**
- Acesso para mobilidade reduzida

**Mobiliário:**
- Mobilado
- Cozinha equipada — semi-equipada (enum, não só sim/não, a pedido: distingue os dois níveis)

**Conforto e segurança adicionais, da lista que enviaste:**
- Lareira
- Domótica
- Estores elétricos
- Vidros duplos
- Isolamento térmico
- Isolamento acústico
- Sistema de segurança
- Internet fibra
- Churrasqueira
- Despensa (distinta de arrumos — arrumos é para armazenamento geral, despensa é junto à cozinha)

**Carregamento de veículo elétrico — dois estados reais, distintos, confirmados numa ficha da Z Imobiliária:**
- Carregamento Elétrico (já instalado e funcional — "lugar de garagem privativo com carregamento elétrico")
- Pré-instalação para Carregador VE (infraestrutura elétrica pronta, carregador ainda não instalado — "pré-instalação para carregador VE")

**Porque são dois campos, não um:** são propostas de valor diferentes para um comprador — "já tenho isto pronto a usar" vs. "vou ter de instalar o carregador eu próprio, mas a instalação elétrica já está feita". Confundir os dois seria repetir o mesmo erro que já corrigi na área bruta privativa/dependente.

**Vista — enum, não binário:**
- `view_type`: mar / rio / cidade / serra / campo / nenhuma

---

## 3.6. Referências externas e identificadores

| Campo | Nome sugerido | Porquê |
|---|---|---|
| ID no portal (nosso) | já existe (`properties.id`) | — |
| Referência comercial da agência | `agency_reference` (novo, texto) | Código próprio que a agência usa internamente — útil para reconciliar com o CRM dela. |
| ID de portal externo (Idealista, Imovirtual, etc.) | `external_ids` (novo, jsonb: `{"idealista": "123", "imovirtual": "456"}`) | Vai para jsonb, não colunas fixas — a lista de portais externos muda, não é core do nosso modelo. |

---



---

## 3.5. Plantas no Admin — o que já existe, o que falta

**Já existe, sem precisar de migração:** `media_assets.media_type` já aceita `'document'` desde a migração original (`'image' | 'video' | 'document'`). Uma planta pode ser guardada hoje, tecnicamente, na mesma infraestrutura de storage que já construímos para fotos.

**O que falta, e precisa mesmo de uma coluna nova:** `listing_media`/`development_media` (as tabelas que ligam uma foto a um imóvel) não têm forma nenhuma de distinguir "isto é uma planta" de "isto é uma foto de marketing normal" — hoje é tudo a mesma galeria. Sem essa distinção, uma planta apareceria misturada com fotos do imóvel, o que é confuso tanto para quem gere no Admin como para quem vê no site público.

**Proposta:** `listing_media.category` / `development_media.category` (novo, texto, `'photo'` por omissão, `'floor_plan'` como segundo valor) — aditivo, mesma tabela, mesmo padrão já estabelecido.

**Decisão deliberada:** não abro uma migração avulsa só para isto agora. Junta-se à mesma migração futura que vai implementar toda esta taxonomia de campos — é exatamente a disciplina de "uma migração revista, não várias soltas" que já seguimos para a 0004.

**No Admin, a experiência otimizada** que pediste: uma secção própria "Plantas", visualmente separada da galeria de "Fotos" (não misturada), reutilizando exatamente o mesmo mecanismo de upload/storage já construído — zero infraestrutura nova, só uma categoria nova e uma secção de UI própria.



## 4. Campos específicos de Empreendimento (não de unidade individual)

Hoje `developments` só tem Nome e Zona — praticamente nada. Fui verificar contra uma ficha real de empreendimento (Alma Living, Z Imobiliária) antes de confirmar esta lista — o mesmo rigor já aplicado às Propriedades.

**Achado real, a barra de especificações visível de um empreendimento tem só 2 itens:**
```
30 Frações   |   T1+1,T2+1 Tipologias
```

| Campo | Nome sugerido | Estado de validação |
|---|---|---|
| Nº total de frações | `total_units` (novo) | **Confirmado** contra a ficha real — "30 Frações", termo exato a usar na UI é "Frações", não "unidades". |
| Tipologias disponíveis | **não é coluna nova** — calculado a partir das `properties` já ligadas ao empreendimento (`distinct typology`) | **Confirmado** como conceito real ("T1+1,T2+1 Tipologias" na ficha), mas guardá-lo como campo próprio arriscaria desalinhar do que as unidades reais dizem. Fica como valor calculado, nunca duplicado. |
| Data prevista de conclusão | `expected_completion` (novo, date) | **Não confirmado nesta ficha específica** — não apareceu na página inspecionada. Mantenho por ser prática comum em pré-venda no setor em geral, mas sinalizado como menos verificado que o resto. |
| Fase do projeto | `project_phase` (novo, enum: planning/construction/completed) | Idem — não confirmado nesta ficha específica. |
| Promotor (nome público) | `developer_name` (novo) | Idem — não confirmado nesta ficha específica. |
| Nº de pisos do edifício | `building_floors` (novo) | Idem — não confirmado nesta ficha específica (já coberto na secção 2.5, mantenho aqui por ser do edifício). |
| Área de implantação | `footprint_area_sqm` (novo) | Idem — não confirmado nesta ficha específica (já coberto na secção 2, mantenho aqui por contexto). |

**Diferença honesta em relação à secção de Propriedades:** aqui só 2 dos 7 campos propostos foram confirmados diretamente contra uma ficha real — os restantes são inferências razoáveis da prática geral do setor (pré-venda costuma anunciar conclusão/fase), não verificadas com a mesma força de evidência. Registo isto explicitamente em vez de apresentar tudo com a mesma confiança.

---

## 3.7. Multimédia — expandir para lá de fotos

`media_assets.media_type` já aceita `'image' | 'video' | 'document'` — o schema já suporta o essencial. O que falta é a experiência no Admin para cada tipo:

| Tipo | Já suportado tecnicamente? | O que falta |
|---|---|---|
| Fotos HD | Sim, funcional desde o Sprint 1.7 | — |
| Vídeo | Sim (`media_type='video'`), nunca usado na UI | Secção própria no Admin, player no site público. |
| Tour 360 | Não diretamente — normalmente é um link externo (Matterport, Kuula), não um ficheiro | `properties.tour_360_url` (novo, texto), não um upload. |
| Plantas | Ver secção 3.5 — `category` novo em `listing_media`. | |
| Renderizações 3D | Mesmo mecanismo que fotos, `media_type='image'`, categorizado como `'rendering'` junto com `'floor_plan'` na mesma coluna `category`. | |

---

## 4.5. Lacuna estrutural encontrada ao verificar "em ambos os casos"

A pergunta sobre carregamento elétrico "em ambos os casos" (Propriedade e Empreendimento) expôs algo que nenhuma revisão anterior tinha apanhado: **a Migration 0004 criou `property_features`, mas nunca criou o equivalente para Empreendimentos.** Hoje, um empreendimento não tem forma nenhuma de dizer "este condomínio tem piscina comum" ou "há carregamento elétrico partilhado na garagem do prédio" — só as unidades individuais têm features.

**Correção, mesma tabela `features`, nova tabela de junção:**
```sql
create table development_features (
  development_id uuid not null references developments(id),
  feature_id uuid not null references features(id),
  primary key (development_id, feature_id)
);
```
Espelha exatamente `property_features` — mesma tabela `features` partilhada entre os dois (uma feature como "Piscina" serve tanto para descrever a piscina privada de uma moradia como a piscina comum de um condomínio, com o mesmo `feature_id`).

---

## 4.7. Tipos de Parceiro — o mesmo erro do `subtype`, encontrado outra vez

`partners.role` tem hoje um CHECK fechado: só `'agency'` e `'promoter'`. Isto é exatamente o mesmo anti-padrão já identificado para `subtype` — e a prova está no meu próprio `PRODUCT-AUDIT-V1.md`, onde **"Fornecedores de CRM" é a prioridade nº3** da lista de clientes, mas o schema nem consegue representar isso hoje.

**A lista completa de tipos de cliente já identificada** (secção "Os clientes do Z Find" do `PRODUCT-AUDIT-V1.md`), que o schema devia conseguir representar:
1. Agência (já existe)
2. Promotor (já existe)
3. Particular / Proprietário privado — **em falta**
4. Fornecedor de CRM — **em falta**
5. Fundo — **em falta**
6. Asset Manager — **em falta**
7. Banco — **em falta**
8. Consultor independente — **em falta**

**Correção, mesma disciplina já aplicada a `subtype`:** tabela de referência `partner_types` (código + rótulo), não outro CHECK fechado — adicionar um tipo novo passa a ser um INSERT, nunca outra migração.

**Transição segura, sem partir o Admin já construído:** adiciono `partners.partner_type_id` (nova FK, nullable), preencho a partir do `role` existente (`'agency'`→agência, `'promoter'`→promotor). **Não removo `role`** nesta migração — o Admin que já construímos lê e escreve esse campo diretamente; mudar isso é trabalho de UI para outra altura, não uma decisão de schema a forçar agora.

---



Genuinamente raro ou de cauda longa, nunca um critério de filtro esperado:
- Referência cadastral
- Detalhes de servidão/ónus

---

## 6. O que fica de fora, por agora — e porquê

- **Campos específicos de arrendamento** (caução, duração de contrato) — pertencem ao Z Living, ainda sem cliente real, mesma disciplina já aplicada antes.
- **Campos de comercial/industrial/hotelaria** (docas de carga, nº de quartos de hotel) — mesma disciplina do `PROPERTY-DOMAIN-DIAGNOSIS.md`: o mecanismo de extensão já existe (`asset_classes`/`attributes`), o conteúdo específico só quando houver procura real.

## 6.5. Os "campos avançados" (Zillow/Realtor/Idealista Pro) — resposta detalhada, não uma linha genérica

A lista final enviada tinha: Score de mercado, Estimativa de valorização, Comparáveis automáticos, Histórico de transações, Demografia da zona, Risco sísmico, Risco de cheias, Walk Score, Transit Score, Bike Score. Trato cada categoria com o rigor que merece, não como um bloco só:

**Recuso construir — mesma razão do `PRODUCT-AUDIT-V1.md`, sem exceção:**
- Score de mercado, Estimativa de valorização, Comparáveis automáticos — números que pareceriam vir do Z Find sem dados reais de transações a sustentá-los. Risco de credibilidade, não falta de capacidade técnica.

**Adiado, não recusado — são factuais, só não temos a fonte ligada ainda:**
- Histórico de transações, Demografia da zona, Risco sísmico, Risco de cheias — existem em fontes públicas reais (Finanças, INE, LNEC). Fica registado como "desejável, sem fonte ligada", não como recusa por princípio. Quando ligarmos uma fonte real, entra.

**Bloqueado por marca registada, não por escolha nossa:**
- Walk Score, Transit Score, Bike Score são produtos comerciais da Redfin/Walk Score Inc. Não posso simplesmente "adicionar" isto como campo nosso — seria pagar pela API deles (integração paga a negociar), ou construir um equivalente próprio **sem lhe poder chamar esses nomes**. Fica fora da migração, registado como decisão de negócio a tomar noutro momento, não uma coluna a criar.

---

## Próximo passo

Isto é só a lista. Antes de eu desenhar a migração (novas colunas em `properties`/`developments` + popular `features`), confirma:
1. Concordas com a categorização (core vs. feature vs. jsonb)?
2. Algum campo que falte, específico do que já viste noutros portais?
