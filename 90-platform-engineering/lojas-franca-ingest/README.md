# Lojas França — Ingestão de Dados

Aplicação de ingestão de dados para construir uma base de dados de lojas em
França nos setores de roupa, calçado, marroquinaria, desporto, cosmética e
perfumes, com o objetivo de as convidar a subscrever o marketplace.

**Nota de exceção:** este domínio (`90-platform-engineering`) contém aqui
código de aplicação, o que é uma exceção deliberada à convenção geral do
z-operating-system (que é, por defeito, "no application code"). Justificação:
[preencher — ex. "protótipo inicial, migra para repo próprio quando o volume
de código justificar"].

## Estrutura

```
lojas-franca-ingest/
├── requirements.txt
└── src/
    ├── fetch_sirene.py        # ingestão a partir da API pública recherche-entreprises (SIRENE/INSEE)
    └── dedupe_and_load.py     # dedupe por SIRET + upsert no Supabase (Postgres)
```

## Fluxo

1. `fetch_sirene.py` — obtém lojas ativas por código NAF (roupa, calçado,
   marroquinaria, desporto, cosmética/perfumes) via API pública, gera CSV.
2. `dedupe_and_load.py` — lê o CSV mais recente, remove duplicados por SIRET,
   insere/atualiza (upsert) na tabela `lojas` do Supabase.

Agendado semanalmente via `.github/workflows/ingest-lojas-franca.yml`
(também pode ser corrido manualmente a partir do separador Actions do repo).

## Variáveis de ambiente / secrets necessários

- `SUPABASE_DB_URL` — connection string do Postgres do Supabase
  (Project Settings → Database → Connection string → URI, modo "Session pooler")
