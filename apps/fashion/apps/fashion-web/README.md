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

## Live catalogue (task 13)

`zfashion-config.js` holds the address of the Z Fashion API (`apiBaseUrl`, empty by default). While it is empty the site shows its demonstration catalogue. Once set:

- `customer-live.js` takes over the catalogue pages (`/nouveautes`, `/femme`, `/homme`, `/enfant`, `/sport`, `/accessoires`, `/beaute`, `/soldes`, `/recherche`, `/vente-privee`, `/produit/:id`, `/corners`, `/corner/:id`), `/favoris` and `/panier`, from `GET /catalog/listing` (priced products of active stores, newest first). The other layers hand over through `ZFashionLive.owns(route)`.
- `home-live.js` puts the 8 newest real pieces and the real Corners on the home page, and turns the bag, favourites and search buttons into links to their pages.
- Product URLs are `/produit/<product id>`; other sizes of the same style are links to their own product. Site pages come from `fashion-domain/src/storefront.js` (Femme/Homme by gender, Enfant for children-only items, Sport, Accessoires, Beauté).
- The bag stays in the browser until checkout; quantities are capped at 10 per line, like the API. The demonstration ribbon and footer note are removed.
- Every value from the API is escaped before it is inserted (`esc()`); only `https` image addresses are used.
- The API must list the site origin in `FASHION_ALLOWED_ORIGINS`.

## Live checkout (task 14)

`customer-checkout.js` registers on the live layer (same `apiBaseUrl` switch):

| Page | What happens |
| --- | --- |
| `/checkout` | Sign-in if needed (`/connexion?next=/checkout`, the bag is kept), then the browser bag is copied to the server cart. Stock or availability changes are shown with a one-click fix. |
| `/checkout/livraison` | Choose or add a shipping address (France; 5-digit postcode). |
| `/checkout/revision` | Lines per boutique, address, total; terms of sale must be accepted; **Commander et payer** creates the order (`POST /clients/:id/checkout`, stock held 30 min). |
| `/checkout/paiement` | Stripe Payment Element (Stripe.js from `js.stripe.com`, publishable key from the API). Card data goes to Stripe only. Shows until when the pieces are reserved. |
| `/checkout/confirmation?order=` | Waits for the Stripe webhook to mark the order paid, then empties the bag; a declined payment offers to try again. |
| `/compte/commandes`, `/compte/commandes/:id`, `/compte/adresses` | Real orders (status, parcel per boutique, delivery address, "finish payment" while the hold lasts) and addresses. |

All calls carry the customer's Supabase session token; the API checks that the account in the URL is the caller's.

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
- real customer sign-in is active (`customer-auth.js`: e-mail code, account created on first sign-in, client registered through `public.zfashion_ensure_client()`); `/compte/*` requires a session — the account data shown there is still demonstrative;
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
