# Z Studio — Stripe sandbox state

Account display name: `environnement de test Z Studio`

This document records non-secret test-resource identifiers only. It does not contain API keys, webhook secrets or customer data.

## Product
- `prod_V6vQHl1tOiyBaP` — Z Studio Access
- livemode: false

## Recurring EUR prices — DESATUALIZADO, preço mudou (ver nota abaixo)
- weekly €5.99: `price_1U6haiLelsX3mv7ivtJpIntG`
- monthly €14.99: `price_1U6haqLelsX3mv7i60H6VWAH`
- annual €119.99: `price_1U6hayLelsX3mv7iJ7kluTSE`

> **⚠️ Preço-alvo mudou em 2026-09-07** (decisão de posicionamento face ao
> Canva Pro/Adobe Express): weekly €3.99, monthly €9.99, annual €89.99 — ver
> `commercial/store-products.v1.json`, que já reflete os novos valores. Os
> `price_...` acima foram criados no Stripe sandbox com os valores ANTIGOS —
> objetos Price no Stripe são imutáveis, por isso não dá para só editar o
> valor. É preciso criar 3 novos Price no Stripe (sandbox, e mais tarde live)
> aos novos valores e atualizar os IDs aqui e no mapeamento de env abaixo.
> Isto não foi feito a partir daqui por não haver acesso ao Stripe.

Suggested sandbox runtime env mapping (IDs por recriar aos novos preços — ver nota acima):
- `STRIPE_ENVIRONMENT=sandbox`
- `STRIPE_PRICE_WEEKLY=price_1U6haiLelsX3mv7ivtJpIntG` (€5.99 — substituir por um novo Price a €3.99)
- `STRIPE_PRICE_MONTHLY=price_1U6haqLelsX3mv7i60H6VWAH` (€14.99 — substituir por um novo Price a €9.99)
- `STRIPE_PRICE_ANNUAL=price_1U6hayLelsX3mv7iJ7kluTSE` (€119.99 — substituir por um novo Price a €89.99)

## Still pending
- hosted commercial runtime URL
- sandbox webhook endpoint/signing secret (must point at that exact runtime)
- Billing Portal configuration (the connected API currently exposes portal configuration reads but not configuration creation)
- server secret/env installation
- end-to-end sandbox checkout

No live Stripe resource was created by this preparation gate.
