# Z Fashion Web — Preview

Static customer-facing storefront preview for Z Fashion.

## Purpose

This surface makes the existing Z Fashion domain tangible without pretending that live commerce is activated. It demonstrates:

- editorial homepage;
- All Sale multi-partner discovery;
- Partner Corners;
- product detail and size selection;
- Wishlist;
- multi-partner cart composition;
- member/private-sale entry point;
- PT / EN / FR / ES / IT / DE presentation;
- responsive mobile/desktop behaviour;
- ZOS endorsed branding.

## Safety boundary

This preview is intentionally backend-independent.

- no live Supabase writes;
- no production Auth;
- no Stripe credentials or checkout;
- no stock reservation;
- no order creation;
- no production deployment implied;
- product/catalogue content is demonstrative.

The final production `fashion-web` must replace the preview dataset with canonical Z Fashion APIs and preserve Partner-owned stock authority, ZOS identity authority and server-side checkout/payment controls.
