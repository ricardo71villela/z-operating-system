-- ============================================================
-- Z Fashion — Onboarding Transition Guard v1
-- Shared ZOS database (infrastructure/supabase)
--
-- Mirrors fashion-domain/src/onboarding.js's ALLOWED_TRANSITIONS
-- exactly. Until now, onboarding_status on fashion.partners could be
-- set to any value via a plain UPDATE — the state machine only
-- existed in application code. This closes that gap the same way
-- fashion_partners_active_requires_feed_tier already closed the
-- activation gate.
-- ============================================================

create or replace function fashion.check_onboarding_transition() returns trigger as $$
declare
  v_allowed boolean;
begin
  if new.onboarding_status = old.onboarding_status then
    return new; -- no-op update to other columns, not a transition
  end if;

  v_allowed := case old.onboarding_status
    when 'applied' then new.onboarding_status = 'under_review'
    when 'under_review' then new.onboarding_status in ('approved', 'rejected')
    when 'approved' then new.onboarding_status = 'active'
    when 'active' then new.onboarding_status = 'suspended'
    when 'suspended' then new.onboarding_status = 'active'
    when 'rejected' then false -- terminal state, mirrors onboarding.js exactly
    else false
  end;

  if not v_allowed then
    raise exception 'cannot move from "%" to "%" — this transition is not in fashion-domain/src/onboarding.js''s ALLOWED_TRANSITIONS', old.onboarding_status, new.onboarding_status;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger fashion_partners_check_onboarding_transition
  before update on fashion.partners
  for each row execute function fashion.check_onboarding_transition();

comment on function fashion.check_onboarding_transition() is 'Mirrors onboarding.js ALLOWED_TRANSITIONS. rejected is terminal — matches the JS state machine, where the only path back from rejected would be a brand-new application, never a status flip.';
