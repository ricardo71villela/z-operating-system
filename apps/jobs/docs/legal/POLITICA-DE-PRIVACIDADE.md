# Política de Privacidade — Z Jobs / Z Find

**Última atualização: [a preencher na publicação]**
**Estado: rascunho para revisão jurídica — ver aviso no fim do documento.**

Esta política explica que dados pessoais recolhemos, porquê, durante quanto tempo, e os direitos que tens sobre eles — em conformidade com o Regulamento Geral de Proteção de Dados (RGPD), aplicável nos cinco países onde operamos.

## 1. Quem é o responsável pelo tratamento

[A preencher: identidade legal e sede da empresa responsável, na revisão jurídica.]

## 2. Que dados recolhemos, e porquê

| Dado | Porquê | Base legal (RGPD Art. 6.º) |
|---|---|---|
| Nome, email, password (hash) | Criar e autenticar a tua conta | Execução de contrato |
| Perfil profissional (experiência, formação, competências, línguas) | Mostrar-te a empregadores e calcular relevância de ofertas | Execução de contrato |
| Documentos (CV, portefólio) | Que possas candidatar-te | Execução de contrato |
| Histórico de candidaturas | Que empregadores e tu acompanhem o processo | Execução de contrato |
| Dados de faturação (só para donos de organização) | Cumprir obrigações fiscais | Obrigação legal |
| Registo de auditoria de pontuação de candidato | Cumprir o Artigo 12.º do AI Act | Obrigação legal |

**Nunca recolhemos, para efeitos de pontuação de candidato**: idade, género, nacionalidade, ou qualquer característica protegida — mesmo que estivessem disponíveis no teu perfil (ver secção 9 dos Termos de Serviço).

## 3. Nunca vendemos os teus dados

Não vendemos, alugamos, nem partilhamos os teus dados pessoais com terceiros para fins de marketing. Os teus dados são visíveis a:
- Ti próprio, sempre.
- Empregadores verificados, apenas conforme a visibilidade que escolheste no teu perfil (privado / só candidaturas / visível a empregadores verificados / público).
- A nós, para operar a plataforma.

## 4. Medidas de segurança técnica — factos concretos, não promessas genéricas

- **Password**: nunca guardada em texto simples — hash com scrypt.
- **Sessões**: tokens de sessão guardados como hash, nunca o token em si.
- **Segurança ao nível da base de dados (Row-Level Security)**: cada pedido à base de dados é autenticado individualmente; um candidato nunca consegue ver dados privados de outro candidato ao nível da própria base de dados, não só da interface.
- **Dados sensíveis do candidato** (telefone, morada, data de nascimento) vivem numa tabela à parte do resto do perfil, nunca legível diretamente por organizações sem consentimento explícito.

## 5. Quanto tempo guardamos os teus dados

- **Perfil e candidaturas**: enquanto a tua conta estiver ativa, ou até pedires o apagamento (secção 8).
- **Registo de auditoria de pontuação de candidato**: mínimo de 6 meses, por obrigação legal (Artigo 12.º do AI Act) — mesmo que peças o apagamento da conta antes disso.
- **Registos de faturação** (donos de organização): retenção fiscal obrigatória, tipicamente vários anos consoante o país — ver secção 8 para o detalhe de como isto interage com um pedido de apagamento.

## 6. Cookies e rastreio

[A preencher na revisão jurídica, consoante as ferramentas de análise e marketing efetivamente usadas em produção — nenhuma foi ainda decidida ao nível técnico neste momento.]

## 7. Transferências internacionais

Operamos em cinco países da União Europeia. [A preencher: se e como os dados são transferidos para fora do Espaço Económico Europeu, consoante a infraestrutura de alojamento escolhida em produção.]

## 8. O teu direito ao esquecimento — como funciona, exatamente

Podes pedir o apagamento dos teus dados pessoais a qualquer momento, através da tua conta. Isto não é um gesto simbólico — é um processo real, tecnicamente implementado, que:

1. **Apaga imediatamente** a tua experiência profissional, formação, competências, línguas e documentos — sem exceção.
2. **Anonimiza** o teu registo principal (nome, avatar, resumo profissional) — substituídos por marcadores anónimos. O registo em si mantém-se, para não quebrar a integridade de candidaturas já submetidas, mas deixa de te identificar.
3. **Anonimiza** o teu histórico de candidaturas — o empregador mantém o registo de que uma candidatura existiu (útil para auditoria de não-discriminação), mas sem qualquer campo que te identifique.
4. **Termina todas as tuas sessões ativas** — deixas de conseguir entrar com a conta antiga, imediatamente.

**Exceções reais, não arbitrárias**, previstas no Artigo 17.º, n.º 3 do RGPD:
- Se fores dono de uma organização com faturas emitidas, esses registos são retidos pelo prazo legal de retenção fiscal do teu país.
- Se tiveres um processo de denúncia em aberto (como denunciante ou denunciado), os dados relevantes são retidos até o processo estar resolvido, para preservar o direito de defesa da outra parte.
- Se tiveres sido avaliado por pontuação de candidato nos últimos 6 meses, esse registo específico de auditoria é retido até ao fim do prazo legal mínimo (Artigo 12.º do AI Act).

Em qualquer destes casos, dizemos-te exatamente qual foi retido e porquê — nunca um apagamento parcial silencioso.

## 9. Os teus outros direitos, além do apagamento

- **Acesso**: podes pedir uma cópia de todos os dados que temos sobre ti.
- **Retificação**: podes corrigir dados incorretos diretamente no teu perfil, a qualquer momento.
- **Portabilidade**: podes pedir os teus dados num formato estruturado, para os levar para outro serviço.
- **Oposição**: podes opor-te a determinados tratamentos, incluindo à pontuação automatizada — ver secção 9 dos Termos de Serviço, que já garante que essa pontuação nunca decide sozinha.
- **Reclamação**: tens o direito de apresentar reclamação junto da autoridade de proteção de dados do teu país (em Portugal, a CNPD).

## 10. Menores

A plataforma não se destina a menores da idade mínima legal de trabalho no respetivo país. Não recolhemos intencionalmente dados de menores abaixo dessa idade.

## 11. Alterações a esta política

Alterações materiais são comunicadas com antecedência razoável antes de entrarem em vigor.

## 12. Contacto

[A preencher: contacto do responsável pelo tratamento e, se aplicável, do Encarregado de Proteção de Dados (DPO), na revisão jurídica.]

---

## Aviso importante

**Este documento foi escrito por um sistema de IA, não por um advogado, e não constitui aconselhamento jurídico.** As secções técnicas (4, 5, 8) descrevem com exatidão mecanismos que foram genuinamente implementados e testados na plataforma — não são promessas genéricas de marketing. Mas antes de ser publicado como a política de privacidade real do Z Jobs, este documento precisa de:
- Revisão por um advogado especializado em proteção de dados nos cinco países de lançamento.
- Preenchimento das secções 1, 6, 7 e 12, que dependem de decisões de infraestrutura e negócio ainda não tomadas.
- Confirmação de que a autoridade de supervisão referida (CNPD) é a adequada, consoante a sede legal final da empresa.
