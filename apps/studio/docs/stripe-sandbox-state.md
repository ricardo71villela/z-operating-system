# Z Studio — Stripe sandbox state

Account display name: `environnement de test Z Studio`

This document records non-secret test-resource identifiers only. It does not contain API keys, webhook secrets or customer data.

## Product
- `prod_V6vQHl1tOiyBaP` — Z Studio Access
- livemode: false

## Recurring EUR prices
- weekly €5.99: `price_1U6haiLelsX3mv7ivtJpIntG`
- monthly €14.99: `price_1U6haqLelsX3mv7i60H6VWAH`
- annual €119.99: `price_1U6hayLelsX3mv7iJ7kluTSE`

Suggested sandbox runtime env mapping:
- `STRIPE_ENVIRONMENT=sandbox`
- `STRIPE_PRICE_WEEKLY=price_1U6haiLelsX3mv7ivtJpIntG`
- `STRIPE_PRICE_MONTHLY=price_1U6haqLelsX3mv7i60H6VWAH`
- `STRIPE_PRICE_ANNUAL=price_1U6hayLelsX3mv7iJ7kluTSE`

## Still pending
- hosted commercial runtime URL
- sandbox webhook endpoint/signing secret (must point at that exact runtime)
- Billing Portal configuration (the connected API currently exposes portal configuration reads but not configuration creation)
- server secret/env installation
- end-to-end sandbox checkout

No live Stripe resource was created by this preparation gate.
