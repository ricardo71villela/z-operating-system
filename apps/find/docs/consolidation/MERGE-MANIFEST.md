# Sprint B — Corrected Patch — Merge Manifest

**Revision 6 (Verification Script Correction Only — real Supabase execution feedback):** migration 0001 was successfully applied to the real staging project. The verification script failed at TEST 5 with `ERROR 42501: permission denied for table leads`, exposing two real defects in the *verification document only* — the migration itself was not touched.

## Changed in Revision 6 (1 file only)
- `docs/consolidation/MIGRATION-0001-VERIFICATION.md` — two corrections:
  1. TESTS 5/6 now correctly expect `permission denied` (`insufficient_privilege` / `42501`) for anon SELECT on `leads`/`searches`, not "0 rows, no error" — anon has no GRANT at all on these tables, so the privilege check fails before RLS is ever evaluated. The prior expectation was simply wrong, and real execution caught it.
  2. Every expected-failure assertion (9 total: leads SELECT, searches SELECT, listings INSERT, listings UPDATE, duplicate published listing, missing currency, invalid currency format, invalid translation status, invalid publication status) rewritten from `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` to a PL/pgSQL `DO $$ ... EXCEPTION WHEN <specific condition> THEN RAISE NOTICE ... WHEN OTHERS THEN RAISE; END $$;` block. `ROLLBACK TO SAVEPOINT` requires the *client* to issue it as a separate command after observing an error — impossible when a whole script is submitted as one batch, which is exactly how the real Supabase SQL Editor execution failed. Each `DO` block now catches its error *inside* Postgres itself, regardless of submission method, and emits an explicit `RAISE NOTICE 'TEST N PASSED: ...'` for an auditable trail.

## Unchanged in Revision 6
- `supabase/migrations/0001_product_backbone.sql` — **not modified**, per explicit instruction. The migration was correct; only the verification script's expectations and mechanism were wrong.
- `docs/consolidation/WEEK-1-EXECUTION-GUIDE.md` — not modified. Test count is unchanged (still 24; the failure tests were corrected, not added/removed), and the guide never referenced `SAVEPOINT` directly.
- Everything else from Revision 5.

## Static validation performed
- Exactly one `begin;`, exactly one `rollback;`, zero `commit;` anywhere.
- Zero remaining SQL `SAVEPOINT` statements (2 remaining textual matches are both explanatory prose/comments referencing the *old, removed* approach, not live SQL — confirmed by direct inspection).
- All 9 required `DO` blocks confirmed, each with: an `EXCEPTION` handler, a `WHEN OTHERS THEN RAISE;` re-raise (so a genuinely unexpected error is never silently swallowed), an explicit `RAISE EXCEPTION` if the forbidden/invalid operation unexpectedly succeeds, and a `RAISE NOTICE` on the expected pass.
- Parentheses balanced (130 open / 130 close).

## On the "was test data left behind?" question
No — guaranteed by transaction semantics, not by luck. The old script's error occurred inside an open `begin;` block that never reached `commit;`; Postgres automatically discards every change made inside a transaction block that ends without an explicit commit, whether by an unhandled error, a session disconnect, or any other non-commit termination. See the response accompanying this delivery for the direct confirmation query result.

## Credential scrub confirmation
Zero occurrences of the real Supabase URL or publishable key — reconfirmed after this revision.
