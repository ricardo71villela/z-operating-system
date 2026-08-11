-- ============================================================
-- Z FIND — MIGRATION 0016 — Verification Audit Invariant
-- ============================================================
-- Verification assessments are durable audit records.
--
-- An existing assessment must never be rewritten into a new outcome.
-- Changes in verification state are represented by NEW assessments:
--
--   pending -> new verified assessment
--   verified -> new expired assessment
--   failed  -> new verified assessment after reassessment
--
-- This preserves historical evidence, provenance, confidence,
-- assessor identity and temporal validity.
--
-- partners.trust_level remains only a legacy marketplace projection.
-- Verification truth remains in verification_assessments.
-- ============================================================


-- Application roles may read and append assessments, but must never
-- rewrite or delete historical assessments.
revoke update, delete
on verification_assessments
from authenticated;


-- Defense-in-depth database invariant.
-- Even if privileges are broadened later, historical assessments
-- cannot be silently mutated without an explicit schema change.

create function public.zfind_reject_verification_assessment_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception
    'verification_assessments are append-only; create a new assessment instead of updating or deleting an existing one'
    using errcode = '55000';

  return old;
end;
$$;


create trigger verification_assessments_append_only
before update or delete on verification_assessments
for each row
execute function public.zfind_reject_verification_assessment_mutation();


revoke all
on function public.zfind_reject_verification_assessment_mutation()
from public;


comment on table verification_assessments
is 'Append-only verification audit records. New outcomes must be represented by new assessments; existing assessments are immutable.';

comment on function public.zfind_reject_verification_assessment_mutation()
is 'Protects verification audit history by rejecting UPDATE and DELETE operations on existing assessments.';
