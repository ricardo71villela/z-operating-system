-- Z Jobs — daily job alert emails, v1
--
-- Daily job alert emails.
--
-- A candidate's alerts are private (RLS: owner only), but the daily send
-- runs without a signed-in user. Two narrow SECURITY DEFINER functions give
-- the API exactly what it needs and nothing more: the list of alerts due
-- (id, owner, saved search, since when) and a way to record that an alert
-- was emailed. Only the API runtime role may call them.
--
-- Idempotent: safe to run again.

begin;

alter table jobs.job_alerts add column if not exists last_notified_at timestamptz;

-- published_at was never filled in; the API now sets it when an offer is
-- published. Offers already published get their last update as best value.
update jobs.job_offers set published_at = updated_at
where status = 'published' and published_at is null;

-- Alerts to process: active, not emailed in the last 20 hours (one email a
-- day at most). `since` is the start of the window for new offers.
create or replace function jobs.job_alerts_due(p_limit integer default 200)
returns table (alert_id uuid, user_id uuid, query_params jsonb, since timestamptz)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select a.id, a.user_id, a.query_params, coalesce(a.last_notified_at, a.created_at)
  from jobs.job_alerts a
  where a.is_active
    and (a.last_notified_at is null or a.last_notified_at < now() - interval '20 hours')
  order by coalesce(a.last_notified_at, a.created_at)
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

create or replace function jobs.mark_job_alert_notified(p_alert_id uuid, p_at timestamptz)
returns void
language sql
volatile
security definer
set search_path = pg_catalog
as $$
  update jobs.job_alerts set last_notified_at = p_at where id = p_alert_id;
$$;

revoke all on function jobs.job_alerts_due(integer) from public, anon, authenticated;
revoke all on function jobs.mark_job_alert_notified(uuid, timestamptz) from public, anon, authenticated;
grant execute on function jobs.job_alerts_due(integer) to jobs_runtime;
grant execute on function jobs.mark_job_alert_notified(uuid, timestamptz) to jobs_runtime;

commit;

-- Check: select count(*) from jobs.job_alerts_due(10);
