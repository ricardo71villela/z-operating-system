# Z Fashion — Supabase Deployment Authority

## Purpose
Defines how Z Fashion database changes relate to the shared ZOS Supabase environment without coupling repository architecture to any one development assistant, local machine or execution sandbox.

## Integrated source authority

All Z Fashion database changes that are intended to participate in the shared ZOS database live under:

```text
infrastructure/supabase/migrations/
```

That directory is the integrated ZOS Supabase migration authority. Z Fashion does not maintain a second production migration authority inside `apps/fashion/`.

## CI authority

Repository CI is **validation-only** unless a workflow explicitly states otherwise.

The current ZOS/Fashion PostgreSQL workflows:

- create a disposable PostgreSQL database;
- stub only the Supabase-specific roles/schemas/functions required for local CI;
- apply the complete integrated migration chain in timestamp order;
- run Fashion and cross-product assertions;
- use no live Supabase service credentials;
- perform no production database mutation.

A green ephemeral PostgreSQL run proves migration compatibility with the tested chain. It does not prove that the migration has been applied to production.

## Live deployment gate

A live/shared Supabase mutation is a separate operational action and must never be inferred from source merge or CI success alone.

Before any live migration:

1. the exact commit/migration authority must be identified;
2. the complete integrated migration chain must be green on the converged source tree;
3. the schema/RLS impact must be reviewed;
4. the operator must use an authorized Supabase deployment mechanism;
5. production credentials must remain outside source control;
6. the resulting live migration state must be observed and recorded explicitly.

Supported operational mechanisms may include an authenticated Supabase CLI workflow or an approved provider-native integration, but no mechanism becomes authoritative merely by being convenient. Governance must know which mechanism is actually being used.

## Tool independence

Development tools and AI assistants may differ in network access, credentials and runtime capabilities. Those limitations are execution-context details, not product architecture.

The repository therefore records **what must be true** (source authority, CI validation, explicit live gate) rather than hard-coding whether one named tool can or cannot reach a provider.

## Current Z Fashion state

Z Fashion source includes integrated migrations and PostgreSQL validation contracts. That source state is not itself evidence of a live Z Fashion production migration.

## Status

Operational authority document.

## Last Updated

2026-08-21
