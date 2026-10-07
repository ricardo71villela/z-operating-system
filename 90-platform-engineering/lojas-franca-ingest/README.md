# Lojas França — Ingestão de Dados (Z Fashion)

Base de dados das lojas francesas dos setores roupa, calçado, marroquinaria,
desporto, cosmética e perfumes, para as convidar a abrir um Corner no Z Fashion.

**Nota de exceção:** este domínio (`90-platform-engineering`) contém aqui
código de aplicação, o que é uma exceção deliberada à convenção geral do
z-operating-system (que é, por defeito, "no application code"). Justificação:
protótipo inicial, migra para `apps/fashion` quando o volume de código o justificar.

## Estrutura

```
lojas-franca-ingest/
├── requirements.txt
├── src/
│   ├── common.py         # cliente REST do Supabase (service_role) e utilitários
│   ├── fetch_sirene.py   # SIRENE/INSEE → tabela lojas (uma linha por loja)
│   └── enrich_osm.py     # contactos: OpenStreetMap + site da loja
└── tests/
    └── test_lojas.py     # testes sem rede
```

## Fluxo

1. `fetch_sirene.py` — API pública recherche-entreprises (SIRENE/INSEE),
   código NAF × departamento (a API não devolve mais de 10 000 resultados
   por pesquisa). Uma linha por loja (SIRET), não só a sede. Pessoas que se
   opuseram à difusão dos seus dados (estatuto « P ») nunca entram. Carrega
   departamento a departamento; numa passagem completa, as lojas que deixaram
   de aparecer ficam `ativo = false` (nunca apagadas).
2. `enrich_osm.py` — telefone, site e e-mail via OpenStreetMap e, se preciso,
   a página inicial do site. Cada loja é tentada uma vez.

Agendado semanalmente via `.github/workflows/ingest-lojas-franca.yml`
(também pode correr à mão no separador Actions: passos, departamento,
quantidade a enriquecer).

| NAF | Setor |
|---|---|
| 47.71Z | roupa |
| 47.72A | calçado |
| 47.72B | marroquinaria |
| 47.64Z | desporto |
| 47.75Z | cosmética e perfumes |

## Segredos

- `ZFIND_SUPABASE_SERVICE_KEY` — chave secreta do servidor do Supabase ZOS
  (a mesma da ingestão das agências do Z Find). Já não é usado `SUPABASE_DB_URL`.

Requer a migração `20261007210000_lojas_franca_service_role_v1.sql`
(dá ao service_role leitura e escrita na tabela `lojas`).

Testes: `python tests/test_lojas.py`
