# Z Find — base das agências imobiliárias (FR / BE / LU)

Base de prospeção de todos os profissionais da transação imobiliária em França,
Bélgica e Luxemburgo, para a angariação da oferta Z Find Pro.
Tabela `zfind_agencias` no Supabase ZOS (migração
`infrastructure/supabase/migrations/20261003180000_z_find_agencias_prospection_v1.sql`).

## Fontes

| País | Fonte principal | Atividade | O que dá |
| --- | --- | --- | --- |
| França | SIRENE / RNE via [recherche-entreprises.api.gouv.fr](https://recherche-entreprises.api.gouv.fr) (sem chave) | NAF 68.31Z | Todos os estabelecimentos ativos: nome, insígnia, SIRET, morada, GPS, forma jurídica, pessoa singular ou coletiva |
| Bélgica | Dados abertos BCE / KBO (ficheiro mensal «Full», conta gratuita) | NACE-BEL 68.311 | Unidades de estabelecimento ativas, morada e, quando declarados, telefone, e-mail, site |
| Luxemburgo | OpenStreetMap (`office` ou `shop` = `estate_agent`) | — | Agências mapeadas, com contactos quando existem |

Contactos (e-mail, telefone, site), só por métodos gratuitos:
1. o registo (BCE) e o OpenStreetMap (FR e BE: só para completar a agência do registo, nunca substituir um contacto);
2. o site da própria agência: página inicial e página de contacto / mentions légales, respeitando o `robots.txt`.

Cada contacto guarda a origem (`*_source`) e a data (`enriched_at`).

## Tipos

| `type` | Significado |
| --- | --- |
| `agency` | Agência independente (pessoa coletiva) |
| `network_agency` | Agência sob insígnia de uma rede (Orpi, Century 21, Laforêt, ERA…), coluna `network` |
| `network_hq` | Sede de uma rede (IAD, Safti, Capifrance, Foncia…) |
| `independent` | Mandatário ou agente independente (pessoa singular) |

## Regras de prospeção por e-mail (coluna `email_outreach_allowed`)

- **França:** permitido para todos os profissionais (B2B), sem consentimento prévio, se a mensagem disser respeito à profissão, com identificação do remetente, origem dos dados e ligação de desinscrição (CNIL).
- **Bélgica e Luxemburgo:** sem consentimento prévio, só para **pessoas coletivas**; nunca para uma pessoa singular (mandatário/independente).
- **Sempre:** quem pedir para sair fica com `do_not_contact = true` e nunca mais recebe e-mails. A primeira mensagem diz de onde vêm os dados.

## Pôr a funcionar

1. Aplicar a migração no Supabase ZOS (SQL Editor, ou já aplicada pelo Claude).
2. No GitHub: *Settings → Secrets and variables → Actions → New repository secret*
   - `ZFIND_SUPABASE_SERVICE_KEY` = a chave secreta (`sb_secret_…`) do projeto ZOS — a mesma do Vercel.
   - (Bélgica, opcional) `KBO_ZIP_URL` = endereço direto do zip «Full» da BCE.
3. *Actions → «Z Find — ingestão das agências» → Run workflow.* Para um teste rápido: `steps = fr`, `fr_dept = 74`.

### Bélgica sem endereço direto
A BCE não permite descarregar sem conta. Duas vias:
- criar a conta gratuita em <https://kbopub.economie.fgov.be/kbo-open-data>, descarregar o `KboOpenData_…_Full.zip` e correr no Mac
  `ZFIND_SUPABASE_SERVICE_KEY=… python src/fetch_be_kbo.py --zip ~/Downloads/KboOpenData_…_Full.zip`;
- ou pedir ao SPF Économie o acesso SFTP (gratuito) para automatizar.

## Correr à mão

```bash
pip install -r requirements.txt
python tests/test_agencias.py                # testes, sem rede
python src/fetch_fr_sirene.py --dept 74 --dry-run
python src/fetch_osm.py --country LU --dry-run
```

## Limites conhecidos

- E-mails: só os que a agência publica. Muitos mandatários não publicam e-mail (as redes usam formulários) — ficam com morada e tipo, sem e-mail.
- França: a API pode não listar todos os estabelecimentos de uma empresa muito grande num mesmo departamento; o resumo da execução indica quantas empresas têm 10 ou mais (grandes redes integradas), para verificar.
- Luxemburgo: só as agências presentes no OpenStreetMap.
- Nenhum dado é apagado: um estabelecimento que desaparece do registo fica `active = false`.
