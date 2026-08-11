-- ============================================================
-- Z FIND — MIGRATION 0017 — Observation Audit Invariant
-- ============================================================
-- Data Observations preserve source, time, validity and provenance.
--
-- Their factual payload is immutable once recorded.
-- Lifecycle metadata may still evolve:
--
--   status
--   valid_to
--
-- Corrections to facts must be represented by a NEW observation,
-- optionally superseding the previous observation.
--
-- Observation evidence is append-only.
-- ============================================================


-- Historical observations must never be deleted.
revoke delete
on data_observations
from authenticated;


-- Evidence rows are immutable once attached to an observation.
-- Additional evidence must be appended as a new row.
revoke update, delete
on observation_evidence
from authenticated;


-- ------------------------------------------------------------
-- Observation payload guard
-- ------------------------------------------------------------

create function public.zfind_guard_data_observation_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'data_observations cannot be deleted; archive or supersede the observation instead'
      using errcode = '55000';
  end if;

  if
    new.id is distinct from old.id
    or new.entity_type is distinct from old.entity_type
    or new.organisation_id is distinct from old.organisation_id
    or new.partner_id is distinct from old.partner_id
    or new.property_id is distinct from old.property_id
    or new.development_id is distinct from old.development_id
    or new.listing_id is distinct from old.listing_id
    or new.metric_code is distinct from old.metric_code
    or new.value_jsonb is distinct from old.value_jsonb
    or new.unit is distinct from old.unit
    or new.currency_iso is distinct from old.currency_iso
    or new.locale is distinct from old.locale
    or new.source_id is distinct from old.source_id
    or new.confidence is distinct from old.confidence
    or new.observed_at is distinct from old.observed_at
    or new.valid_from is distinct from old.valid_from
    or new.provenance is distinct from old.provenance
    or new.created_at is distinct from old.created_at
  then
    raise exception
      'data_observations factual payload is immutable; create a new observation instead'
      using errcode = '55000';
  end if;

  -- Only status and valid_to may change.
  return new;
end;
$$;


create trigger data_observations_audit_guard
before update or delete on data_observations
for each row
execute function public.zfind_guard_data_observation_mutation();


revoke all
on function public.zfind_guard_data_observation_mutation()
from public;


-- ------------------------------------------------------------
-- Observation evidence guard
-- ------------------------------------------------------------

create function public.zfind_reject_observation_evidence_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception
    'observation_evidence is append-only; attach new evidence instead of updating or deleting an existing row'
    using errcode = '55000';

  return old;
end;
$$;


create trigger observation_evidence_append_only
before update or delete on observation_evidence
for each row
execute function public.zfind_reject_observation_evidence_mutation();


revoke all
on function public.zfind_reject_observation_evidence_mutation()
from public;


comment on table data_observations
is 'Provenance-aware observations. Factual payload is immutable; only lifecycle status and valid_to may evolve. Existing observations cannot be deleted.';

comment on table observation_evidence
is 'Append-only evidence attached to data observations. Existing evidence rows are immutable.';

comment on function public.zfind_guard_data_observation_mutation()
is 'Protects Observation factual payload while allowing status and valid_to lifecycle changes.';

comment on function public.zfind_reject_observation_evidence_mutation()
is 'Protects Observation evidence as append-only audit material.';
