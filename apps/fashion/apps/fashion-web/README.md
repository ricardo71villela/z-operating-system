# Z Fashion Web — Preview

Customer-facing storefront and full customer-site Preview for Z Fashion.

## Current authority

The visually validated homepage remains the root authority at `/` and is not replaced by the full-site foundation.

The full customer-site phase adds dedicated customer routes behind `customer-shell.html`, `customer-routes.js`, `customer-site.js` and `customer-pages.css`.

### Language authority

- French is the default language on first visit.
- Customers may explicitly choose FR / PT / EN / ES / IT / DE.
- The explicit choice is persisted locally and is independent of market/location.
- No browser-language, IP, GeoIP or country-code locale forcing is used.

### Brand authority

- Z Fashion is the visible product brand.
- The approved Z Fashion mark is isolated at the left side of the desktop header while `Fashion` remains optically centred.
- The approved white-tile mark is used on dark footer backgrounds.
- ZOS appears only as the institutional footer endorsement, translated with the selected language.

## Full customer-site route foundation

The Preview currently defines 38 customer route authorities across five groups.

### Commerce

- `/nouveautes`
- `/femme`
- `/homme`
- `/enfant`
- `/sport`
- `/accessoires`
- `/beaute`
- `/soldes`
- `/recherche`
- `/produit/:slug`
- `/corners`
- `/corner/:slug`
- `/vente-privee`

### Customer

- `/favoris`
- `/panier`
- `/connexion`
- `/compte`
- `/compte/profil`
- `/compte/adresses`
- `/compte/commandes`
- `/compte/commandes/:id`
- `/compte/retours`
- `/compte/suivi`

### Checkout UX

- `/checkout`
- `/checkout/livraison`
- `/checkout/paiement`
- `/checkout/revision`
- `/checkout/confirmation`

### Service

- `/livraisons`
- `/retours-remboursements`
- `/aide`
- `/contact`

### Legal

- `/mentions-legales`
- `/cgv`
- `/conditions-utilisation`
- `/confidentialite`
- `/cookies`
- `/consentement`

## Existing storefront capabilities

The root storefront demonstrates:

- editorial homepage;
- multi-partner discovery;
- Partner Corners;
- product detail and size selection;
- Wishlist;
- multi-partner cart composition;
- member/private-sale entry point;
- FR / PT / EN / ES / IT / DE presentation;
- responsive mobile/desktop behaviour.

## Safety boundary

This phase remains Preview-only and backend-independent for customer commerce actions.

- no live Supabase writes;
- no production Auth;
- no payment credentials or real checkout;
- no stock reservation;
- no order creation;
- no production deployment implied;
- product/catalogue and account data are demonstrative.

The production `fashion-web` must progressively bind these route authorities to canonical Z Fashion APIs while preserving Partner-owned stock authority, ZOS identity authority and server-side checkout/payment controls behind explicit release gates.

## Contracts

- `tests/storefront-contract.test.js`
- `tests/final-polish-contract.test.js`
- `tests/full-customer-site-contract.test.js`

The full customer-site contract emits `Z_FASHION_FULL_CUSTOMER_SITE_FOUNDATION=PASS` when the 38-route foundation, six-language authority, route rewrites, branding and Preview safety boundaries remain intact.
