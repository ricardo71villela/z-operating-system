# Phase 4R — Commercial Property Taxonomy v1

## Status

This document locks the initial Z Find Commercial Property subtype
vocabulary.

It is subordinate to the Phase 4R Architecture Contract and does not
change the locked top-level Property classes:

- `residential`
- `commercial`
- `land`

`commercial` remains a Property class. It is never a literal Property
subtype.

## 1. Classification principle

A Property subtype describes the physical / sectorial identity of the
Property.

It does not describe:

- how the Property is sold or rented;
- the Listing transaction;
- Listing distribution;
- the operating model of an investment product;
- a Development identity.

The canonical relationship is:

    Property
    └── property_class
        └── subtype

The database continues deriving `property_class` from the authoritative
subtype taxonomy.

Browser callers do not own `property_class`.

## 2. Commercial Property subtypes v1

The initial Commercial vocabulary is exactly:

| Order | Code | Meaning |
|---:|---|---|
| 1 | `office` | Office Property / office premises |
| 2 | `retail` | Retail Property / shop premises |
| 3 | `industrial_logistics` | Industrial, warehouse or logistics Property |
| 4 | `hospitality` | Hotel and hospitality Property |

These codes are language-neutral canonical identifiers.

Localized labels belong to the presentation / i18n layer and are not
database taxonomy truth.

## 3. Normalization guidance

The following concepts normalize to the canonical v1 subtype:

    shop        -> retail
    store       -> retail

    warehouse   -> industrial_logistics
    logistics   -> industrial_logistics
    industrial  -> industrial_logistics

    hotel       -> hospitality
    aparthotel  -> hospitality
    hostel      -> hospitality
    resort      -> hospitality

These aliases are semantic guidance for future import/search work.

They are not additional canonical subtype rows.

## 4. Operating and investment models

The following concepts are explicitly NOT Property subtypes in v1:

- BTR
- PBSA
- Senior Living

They describe operating / investment models and may be orthogonal to
the physical Property classification.

Example:

    Property class:  residential
    Subtype:         apartment
    Operating model: BTR

The physical identity must not be destroyed merely because the asset
participates in a particular investment strategy.

No operating-model schema is introduced by R2.4.

## 5. Structural concepts that are not Commercial subtypes

The following are not canonical Commercial Property subtypes.

### `commercial`

This is the parent Property class.

### `development`

A Development remains a first-class domain entity.

A Development is not a Property subtype.

### `building`

`building` is too structurally generic to be a canonical subtype in
this vocabulary.

### `mixed_use`

Mixed-use describes composition or use across components and must not
be collapsed into one physical Property subtype in v1.

## 6. Deferred concepts

R2.4 deliberately does not classify the following concepts:

- healthcare
- clinic
- medical
- coworking
- restaurant
- serviced apartments

Their correct modelling may involve subtype, use, operating model,
features, attributes, or a combination of those dimensions.

They require a later explicit semantic decision before becoming
canonical taxonomy data.

## 7. Hospitality decision

Older exploratory Property-domain documentation considered Hospitality
as a possible top-level asset class.

That concept is superseded by the locked Phase 4R classification:

    residential | commercial | land

Therefore the v1 model is:

    property_class = commercial
    subtype        = hospitality

It is not a fourth top-level Property class.

## 8. Industrial / logistics decision

R2.4 uses one initial canonical subtype:

    industrial_logistics

rather than prematurely splitting:

    industrial
    warehouse
    logistics

These concepts overlap in international real-estate classification and
may later be represented through finer attributes or an explicitly
versioned taxonomy expansion.

The v1 contract does not prevent future subtype evolution.

## 9. Marketplace independence

Commercial Property classification remains independent from Listing
commercial terms.

The following remain Listing concerns:

    transaction_type = sale | rent
    rental_period    = monthly | seasonal | yearly

Historical distribution/channel migration work remains separate from
Property classification.

`updateListingCommercial` means commercial terms of a Listing. It does
not mean Property class = Commercial.

## 10. R2.4 scope

R2.4A locks semantics only.

It does NOT:

- mutate the database;
- seed Property subtypes;
- change Property write RPC signatures;
- change Listing semantics;
- change Representation semantics;
- change Development semantics;
- change public search;
- introduce operating-model fields;
- touch Z Mobility.

The database seed is a separate forward-only R2.4B step.
