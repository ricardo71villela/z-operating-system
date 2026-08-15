# Z Find — Phase 4R Architecture Contract

Status: **LOCKED**

This contract defines the target architecture that Phase 4 must converge toward.

The historical Git and migration record is immutable. The purpose of Phase 4R is
not to rewrite history, but to make the current system converge forward-only
toward the architecture that would have been selected had the final product
requirements existed on Day 1.

The machine-readable companion authority is:

`apps/find/config/phase4r-architecture-contract.json`

---

## 1. Public language contract

Z Find has exactly six public languages:

- FR — French
- EN — English
- PT — Portuguese
- ES — Spanish
- DE — German
- IT — Italian

French is the default public language.

`x-default` resolves to French.

Portuguese has one public identity only:

`/pt/`

Persisted Portuguese content remains:

`pt-PT`

There is no separate Brazilian Portuguese public product.

Every new Phase 4 public surface must ship simultaneously in all six languages.

This includes:

- navigation;
- labels;
- filters;
- search;
- Property pages;
- Development pages;
- Unit/Property pages;
- Zones;
- Favorites;
- forms;
- validation messages;
- empty states;
- errors;
- metadata;
- canonical URLs;
- hreflang;
- Open Graph metadata;
- JSON-LD;
- sitemap output.

A Phase 4 surface implemented in only a subset of the six languages is
incomplete and must fail its completeness gate.

Admin and Partner interfaces themselves do not need six translated UI shells,
but both must support authoring and managing public content for all six locales.

---

## 2. Domain identity

The following are distinct domain concepts:

`Property != Listing != Representation`

A Property is the real-estate asset identity.

A Representation records who is authorised to represent that asset.

A Listing contains a commercial offer made through a Representation.

The same Property may therefore have more than one Listing over time or may
support different transaction offers without creating duplicate Property
identity.

Canonical public identity belongs to the Property, not to the Listing.

A lead generated from an offer must nevertheless target the actual selected
`listing_id`.

---

## 3. Property classification

Property classification has two levels:

`property_class`

and

`subtype`

The locked top-level classes are:

- `residential`
- `commercial`
- `land`

Commercial is a Property class.

Commercial is **not** a Listing channel.

Commercial is **not** the literal subtype `commercial`.

Commercial subtypes will be class-scoped and may evolve independently without
overloading the top-level classification axis.

Examples may later include concepts such as office, retail, logistics or
hospitality, but the exact commercial subtype vocabulary is not locked by R1.

Existing residential concepts such as apartment and villa remain Property
subtypes.

Land belongs to the land Property class.

---

## 4. Development model

A Development is a first-class domain entity.

A Development is not a Property subtype.

A Development can have:

- its own public identity;
- its own canonical public page;
- its own content;
- its own media;
- its own Representation and Listing where required;
- multiple unit Properties.

A unit inside a Development is a Property.

A published unit may therefore have its own canonical Property page while
retaining its parent `development_id`.

---

## 5. Transaction model

Listing transaction intent is:

- `sale`
- `rent`

Rental period vocabulary remains:

- `monthly`
- `seasonal`
- `yearly`

Invariant:

`transaction_type = sale -> rental_period IS NULL`

Invariant:

`transaction_type = rent -> rental_period IS NOT NULL`

The Rental foundation remains valid and must not be collapsed into Property
classification.

---

## 6. Zero Off-market target architecture

Off-market is not part of the target Z Find product.

It must not exist in the final:

- public marketplace;
- navigation;
- filters;
- search state;
- Property cards;
- Property pages;
- Development pages;
- metadata;
- structured data;
- Admin authoring;
- Partner authoring;
- target Listing model.

The historical `listings.channel` column and historical migrations remain
temporarily for compatibility while Phase 4R performs an
expand -> migrate -> contract transition.

No historical migration may be edited.

The target architecture does not retain a Listing channel dimension merely to
store the single value `standard`.

Once all runtime and deployed code no longer depends on `listings.channel`,
the column may be removed by a new forward-only migration.

---

## 7. Public information architecture

The locked top-level marketplace intents are conceptually:

- Buy
- Rent
- Invest
- Developments

Their actual public route vocabulary is locale-specific.

Property classification and user intent are independent axes.

For example, Commercial may be bought or rented.

Developments remain first-class entities and must not be represented in the
domain model as a fake Property subtype merely because a search interface can
display Properties and Developments together.

---

## 8. Canonical public pages

One published Property must resolve to one canonical Property identity.

If the Property has multiple commercial offers, those offers belong to the
same Property page.

A published Development must have its own canonical public page.

A published unit Property may have its own canonical page and retain its
relationship to the parent Development.

The browser-visible URL, canonical URL, shareable URL, SEO URL and lead source
must converge on the same public identity.

---

## 9. Routing and SEO

Human-readable locale-aware routes are the target runtime model.

Hash routing is transitional legacy behaviour and must not become the
foundation of new Phase 4 pages.

The same six-language authority must govern:

- runtime routes;
- canonical generation;
- hreflang;
- x-default;
- sitemap generation;
- metadata generation.

French is the root/default authority.

There must not be one page model for users and a separate competing page model
for SEO.

---

## 10. Publication contract

The target authoring flow is:

Partner/Admin creates asset

-> Property or Development identity

-> Representation

-> Listing

-> factual/content/media authoring

-> six-language completeness as required

-> review/readiness

-> publication

-> canonical public page

-> sitemap/indexability

Publication lifecycle authority remains server-controlled.

Partner ownership and lifecycle boundaries remain protected.

---

## 11. Security invariants to preserve

Phase 4R must preserve the security work already completed.

In particular:

- RLS remains enabled;
- service_role is never used to prove RLS;
- Partner ownership remains server-derived;
- lifecycle authority is not broadened;
- protected/published/history/evidence records are retired or archived safely;
- SECURITY DEFINER functions retain explicit authorisation;
- SECURITY DEFINER functions retain `search_path = pg_catalog`;
- identifiers remain fully qualified where required;
- Z Mobility storage and `vehicle-images` are outside this migration scope.

Public visibility continues to require the valid marketplace publication
invariant rather than client-side trust.

---

## 12. Migration strategy

Historical migrations are immutable.

Every correction is forward-only.

Potentially destructive convergence follows:

`expand -> migrate -> validate -> contract`

Never:

`drop/rename first -> repair runtime afterwards`

Schema contraction such as removal of `listings.channel` occurs only after the
deployed runtime is proven not to depend on it.

---

## 13. Terminology

The word Commercial has one domain meaning:

a Property classification.

Existing implementation terminology such as:

`Commercial terms`

or:

`updateListingCommercial`

refers to Listing offer/transaction terms and must later converge toward
unambiguous terminology such as Listing terms or Offer terms.

This rename must preserve compatibility until callers and database functions
have converged.

---

## 14. Phase 4R ordering

The foundation realignment order is:

R0 — Live Data Snapshot  
R1 — Architecture Contract  
R2 — Property Taxonomy Foundation  
R3 — Remove Off-market From New Code  
R4 — Six-Language Convergence  
R5 — Language Completeness Gate  
R6 — Listing Terminology Cleanup  
R7 — Public Visibility Regression  
R8 — Canonical Router  
R9 — SEO Unification

Only after R0-R9 are validated should normal marketplace implementation resume
with Homepage, Search, Property, Development and Unit flagship surfaces.

---

## 15. Non-negotiable regression rule

A Phase 4 change is not complete merely because its happy path works.

It is complete only when it preserves the existing validated:

- domain boundaries;
- lifecycle;
- atomicity;
- ownership;
- RLS;
- media;
- Rental semantics;
- history/evidence;
- responsive behaviour;
- deployment contract;

and satisfies this Phase 4R architecture contract.
