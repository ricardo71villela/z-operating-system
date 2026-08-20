# Z Fashion — Acting on the Real Supabase Project

## Purpose
Defines how Z Fashion's database changes actually reach the live shared
Supabase project (https://supabase.com/dashboard/project/dcdggqyazdddrfuzwavw),
given a hard constraint: Claude's execution sandbox has an outbound network
allowlist that does not include Supabase's domains, so migrations and
queries can never be run against the live project from within a Claude
session — regardless of credentials provided. This is not a policy choice
to be persuaded around; it is a network boundary of the sandbox itself.

## What was checked before writing this
Every existing GitHub Actions workflow in this repository
(`.github/workflows/*.yml`) was inspected for how other verticals (Z Jobs,
Z Find, Z Studio) handle this. None of them reference any `secrets.*` value
at all — every CI job validates against an ephemeral Postgres container
spun up inside the workflow run, or against fixture values
(`SUPABASE_URL: https://example.supabase.co`). No vertical currently
deploys to the live Supabase project via a GitHub Actions pipeline with
stored credentials. `fashion-postgres.yml` follows that exact convention —
it validates the Z Fashion migration and `fashion-partner`'s real Postgres
integration test against a fresh, disposable database on every push/PR,
and holds no secrets.

## How a real deploy to the live project actually happens
Two options, neither of which involves Claude at any point:

1. **Supabase's native GitHub integration** (recommended, matches how
   Supabase itself expects this to work): link this repository to the
   `dcdggqyazdddrfuzwavw` project once, in the Supabase dashboard
   (Project Settings → Integrations → GitHub), pointing it at
   `infrastructure/supabase/migrations`. Once linked, Supabase applies new
   migration files automatically on merge to `main` — no GitHub Secrets, no
   custom pipeline, Supabase's own infrastructure pulls from GitHub.
2. **Manual `supabase db push`**, run locally by whoever has the Supabase
   CLI authenticated against the project — a one-time `supabase link
   --project-ref dcdggqyazdddrfuzwavw` followed by `supabase db push`
   whenever a new migration file needs to go live.

## What Claude can and cannot do here
- **Can**: write migration files, validate them end-to-end against a local
  or CI-ephemeral Postgres instance (as done for
  `20260821090000_z_fashion_database_foundation_v1.sql`), write and
  validate application code (`db.js`) that will run correctly the moment
  it's pointed at a real `DATABASE_URL`, and write/validate CI workflows
  that check migrations on every push.
- **Cannot**: query, migrate, or otherwise reach the live Supabase project
  from a Claude session, under any credential — no API key or connection
  string changes this, because the constraint is the sandbox's network
  allowlist, not authorization.

## Status
Draft — operational, not a design document.

## Last Updated
2026-08-20
