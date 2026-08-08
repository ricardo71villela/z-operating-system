# Aplicar Migrations 0002 + 0003 + 0004 — Checklist Único

Este documento **estende** `SPRINT-1.7-VALIDATION-CHECKLIST.md` (já entregue) — não o substitui. As secções 1 (segurança pré-migração), 4 (utilizador admin), e 5 (ambiente local) desse documento continuam válidas tal como estão. Aqui está só o que muda por seres agora **três** migrações em sequência, não uma.

---

## 1. Ordem exata de aplicação

**Uma de cada vez, nunca todas coladas na mesma caixa do SQL Editor.** Cada uma depende da anterior já ter corrido com sucesso.

1. `supabase/migrations/0002_admin_access.sql`
2. `supabase/migrations/0003_seed_zones.sql`
3. `supabase/migrations/0004_partner_monetization_extensibility.sql`

Corre cada uma, confirma sucesso, **só depois** avanças para a seguinte. Se a 0002 falhar, não corras a 0003/0004 — para e diagnostica primeiro (secção 11 do checklist original).

---

## 2. Verificação específica da 0003 (zonas)

```sql
select name, city, country_iso from zones_lite where country_iso = 'PT' order by city, name;
```
**PASS:** exatamente 4 linhas — Boavista/Porto, Cedofeita/Porto, Foz do Douro/Porto, Matosinhos Sul/Matosinhos.

```sql
select conname from pg_constraint where conname = 'zones_lite_name_city_country_key';
```
**PASS:** 1 linha (confirma que `ON CONFLICT DO NOTHING` é real, não cosmético).

---

## 3. Verificação específica da 0004 (a nova, revista)

```sql
select table_name, column_name from information_schema.columns
where table_schema = 'public' and table_name in ('listings','properties')
and column_name in ('tier','rental_period','attributes','dedup_hash')
order by table_name, column_name;
```
**PASS:** 4 linhas exatas — `listings.rental_period`, `listings.tier`, `properties.attributes`, `properties.dedup_hash`.

```sql
select tablename, policyname, roles, cmd from pg_policies
where schemaname = 'public' and tablename in ('features','property_features','seller_leads')
order by tablename, policyname;
```
**PASS:** 6 linhas no total — `features` (2: leitura pública + admin completo), `property_features` (2: leitura pública + admin completo), `seller_leads` (2: inserção anónima + leitura admin).

**Este é o teste mais importante desta migração especificamente** — confirma que a correção do bug de RLS (encontrada na revisão, antes de aplicar) está realmente em vigor. Se aparecerem menos de 6 políticas, **não confies que `features`/`property_features` sejam legíveis** — volta a verificar antes de continuares.

```sql
select proname from pg_proc where proname = 'is_own_partner';
```
**PASS:** 1 linha. A função existe, mas **nenhuma política a usa ainda** — isto é esperado e correto (fica pronta para quando o Portal do Parceiro for construído a sério, não antes).

### Teste funcional real — confirma que features/property_features são mesmo legíveis
```sql
insert into features (code, label) values ('has_pool', 'Piscina') returning id;
```
Copia o `id` devolvido, depois:
```sql
select * from features where code = 'has_pool';
```
**PASS:** a linha aparece. Se isto falhar com erro de permissão, a política de leitura não está a funcionar como esperado — para e não avances para a validação operacional completa.

---

## 4. Teste negativo específico da 0004

Repete o padrão da secção 9 do checklist original, agora também para `seller_leads`:

```bash
curl 'https://SEU-PROJETO.supabase.co/rest/v1/seller_leads?select=*' \
  -H "apikey: SUA_ANON_KEY_PUBLICA"
```
**PASS:** erro de permissão — `anon` só pode inserir, nunca ler pedidos de avaliação de outras pessoas (mesmo padrão de `leads`).

```bash
curl -X POST 'https://SEU-PROJETO.supabase.co/rest/v1/seller_leads' \
  -H "apikey: SUA_ANON_KEY_PUBLICA" \
  -H "Content-Type: application/json" \
  -d '{"intent":"sell","name":"Teste de validação"}'
```
**PASS:** sucesso (201) — confirma que o fluxo de pedido de avaliação, quando for construído, vai ter onde inserir.

---

## 5. Sign-off adicional

| Item | Estado |
|---|---|
| Migration 0003 aplicada | PASS / FAIL / NOT TESTED |
| Migration 0004 aplicada | PASS / FAIL / NOT TESTED |
| 4 zonas reais confirmadas | PASS / FAIL / NOT TESTED |
| 6 políticas RLS da 0004 confirmadas (não só os GRANTs) | PASS / FAIL / NOT TESTED |
| Teste funcional features/property_features | PASS / FAIL / NOT TESTED |
| seller_leads: INSERT anónimo permitido, SELECT anónimo negado | PASS / FAIL / NOT TESTED |
| is_own_partner() existe, sem política a usá-la ainda | PASS / FAIL / NOT TESTED |

Junta esta tabela à do checklist original antes de considerares tudo validado.
