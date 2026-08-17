# Z Studio — Permanent Store Identity

Status: **FROZEN**
Effective date: **2026-08-17**
Decision gate: **A1.2B-R0 — ZOS Permanent Identity Freeze**

## 1. Canonical product and publisher identity

- Product display name: **Z Studio**
- Ecosystem / publisher brand: **ZOS**
- Expanded technical publisher label: **Z Operating System**
- Permanent reverse-DNS namespace: **`com.zoperatingsystem`**
- Permanent Z Studio store identifier: **`com.zoperatingsystem.zstudio`**

This identifier is the canonical target for both Apple bundle identity and Android application/package identity before any first production store submission.

## 2. Ecosystem namespace convention

All first-party ZOS products that require a store/application identifier should use:

`com.zoperatingsystem.<product>`

Examples reserved as naming convention only:

- Z Studio → `com.zoperatingsystem.zstudio`
- Z Find → `com.zoperatingsystem.zfind`
- Z Jobs → `com.zoperatingsystem.zjobs`
- Z Mobility → `com.zoperatingsystem.zmobility`

These examples define the technical naming convention; they do not assert that an App Store Connect App ID, Google Play package, trademark, legal entity, or domain has already been created or reserved.

## 3. Z Studio migration authority

The current provisional identifier `com.mystudio.app` is **DO NOT SHIP** and must be removed from all store-identity surfaces before the first store build is submitted.

A1.2B-R1 is authorized to migrate only the store-identity surfaces required for a coherent native application identity, including:

- Capacitor `appId`
- Android `namespace`
- Android `applicationId`
- Android Java package and source path for `MainActivity`
- Android `package_name`
- Android `custom_url_scheme`
- iOS Debug `PRODUCT_BUNDLE_IDENTIFIER`
- iOS Release `PRODUCT_BUNDLE_IDENTIFIER`
- CI assertions that prevent `com.mystudio.app` from returning to store-identity surfaces
- repository safeguards preventing signing keystores from being committed

## 4. Legacy internal names are not store identity

Internal historical names such as the root npm package name `my-studio` or the generated file name `app/my-studio.html` are not, by themselves, Apple or Android store identifiers.

They must not be renamed opportunistically as part of A1.2B-R1 unless a build or platform requirement proves that a rename is necessary. Any broader internal rename belongs to a separate, explicitly scoped cleanup gate.

## 5. Signing and store-account boundary

This freeze does **not** create or modify:

- Apple Developer / App Store Connect App IDs
- provisioning profiles or certificates
- Google Play Console applications
- Android upload/release keystores
- store listings, prices, subscriptions, or releases

Those actions require their own release gates after the repository identity migration is green.

## 6. Change control

`com.zoperatingsystem.zstudio` is now the permanent repository authority for Z Studio store identity.

Changing this decision requires an explicit new identity-migration gate. It must not be changed as an incidental refactor, build fix, branding change, or deployment change.
