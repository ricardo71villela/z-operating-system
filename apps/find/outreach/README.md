# ZOS — prospeção por e-mail (agências do Z Find)

Envio automático, todos os dias úteis, dos e-mails de apresentação do Z Find
às agências da base `zfind_agencias` que podem receber prospeção
(`email_outreach_allowed`). As sedes das redes ficam de fora: são trabalhadas
à parte (`zfind_redes`).

**Não usa o Resend.** As regras do Resend proíbem o primeiro contacto a quem
não pediu para receber; a conta que envia os e-mails do Z Find, do Z Desk e
do Z Jobs não pode correr esse risco. O envio faz-se por SMTP a partir de uma
**caixa dedicada num domínio separado** (por exemplo `zfind-pro.fr`).

## Como funciona

Cada passagem (GitHub Action «ZOS — prospeção por e-mail», dias úteis às
07:30 UTC):

1. **Lê a caixa de correio** (IMAP, opcional): uma resposta para as relances
   dessa agência; uma devolução (endereço inexistente) bloqueia o endereço;
   «STOP» ou «désinscrire» marca «não contactar». As respostas automáticas
   (ausência) são ignoradas.
2. **Limite do dia, com aquecimento da caixa nova:** 10 e-mails no primeiro
   dia, mais 5 por dia útil, até `OUTREACH_DAILY_LIMIT` (40 por defeito).
3. **Relances primeiro:** relance 1 cinco dias úteis depois do 1.º contacto
   (no mesmo fio, «Re:»), relance 2 sete dias úteis depois. Nunca depois de
   uma resposta, devolução ou desinscrição.
4. **Depois, novos contactos:** um só por endereço (várias agências com o
   mesmo e-mail recebem um só), primeiro as que também têm telefone.
5. Cada envio fica em `zos_outreach_sends` com um jeton; o link
   «Ne plus recevoir» (`zfind.online/api/prospection-optout`) e o
   cabeçalho `List-Unsubscribe` (com o *one-click* da Gmail / Yahoo) marcam
   «não contactar» todas as linhas com esse endereço.
6. Pausa de 30 a 90 segundos entre e-mails.

Os textos (francês, «vous») estão em `src/messages.py`. Cada e-mail leva no
rodapé o nome e a morada da empresa que envia, de onde vem o endereço e como
deixar de receber, como pede a CNIL para a prospeção B2B.

## Segurança

Nunca envia sem as três condições: variável `OUTREACH_ENABLED = true`, a
caixa SMTP configurada e a identidade da empresa (`OUTREACH_LEGAL_NAME`,
`OUTREACH_POSTAL_ADDRESS`). Sem elas, faz uma **simulação**: mostra três
e-mails de exemplo e quantos seriam enviados, sem escrever nada na base.

## Pôr a funcionar

1. **Domínio e caixa:** comprar um domínio separado e criar uma caixa
   (Google Workspace ou Zoho Mail), com SPF, DKIM e DMARC configurados.
   Deixar a caixa "aquecer" uma ou duas semanas com uso normal antes do
   primeiro envio.
2. **Supabase:** aplicar a migração
   `infrastructure/supabase/migrations/20261024100000_zos_prospection_outreach_v1.sql`.
3. **GitHub → Settings → Secrets and variables → Actions:**
   - *Secrets:* `OUTREACH_SMTP_USER`, `OUTREACH_SMTP_PASSWORD` (palavra-passe
     de aplicação da caixa). `ZFIND_SUPABASE_SERVICE_KEY` já existe.
   - *Variables:* `OUTREACH_SMTP_HOST` (ex. `smtp.gmail.com`, `smtp.zoho.eu`),
     `OUTREACH_SMTP_PORT` (465), `OUTREACH_IMAP_HOST` (ex. `imap.gmail.com`,
     `imap.zoho.eu`), `OUTREACH_FROM_EMAIL`, `OUTREACH_FROM_NAME`,
     `OUTREACH_SIGNATURE` (linhas separadas por `\n`), `OUTREACH_LEGAL_NAME`,
     `OUTREACH_POSTAL_ADDRESS`, e por fim `OUTREACH_ENABLED = true`.
4. *Actions → «ZOS — prospeção por e-mail» → Run workflow* com «Simulação»
   marcada, para ler os três e-mails de exemplo; depois sem simulação, com
   `limit = 3`, para um primeiro envio real controlado.

## Correr à mão

```bash
pip install -r requirements.txt
python tests/test_outreach.py              # testes, sem rede
python src/outreach.py --dry-run           # simulação (precisa da chave da base)
```

## Seguir os resultados

```sql
select step, status, count(*) from public.zos_outreach_sends
 where campaign = 'zfind-agences-v1' group by 1, 2 order by 1, 2;
```
