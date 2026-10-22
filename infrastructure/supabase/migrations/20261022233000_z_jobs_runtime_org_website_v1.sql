-- Z Jobs — let the API save an organisation's website, v1
--
-- The company's public page (PUT /organizations/:id/public-profile) lets the
-- organisation's owners and admins set their website. The API connects as
-- zjobs_app (member of jobs_runtime), which can update company_profiles but
-- has no UPDATE right on jobs.organizations at all.
--
-- Only the two columns the API writes are granted. Who may change them is
-- still decided by the existing policy organizations_update_members
-- (owners and admins of the organisation, or platform staff).
--
-- Idempotent: safe to run again.

grant update (website, updated_at) on jobs.organizations to jobs_runtime;

-- Check (expected: website true, legal_name false):
-- select has_column_privilege('jobs_runtime', 'jobs.organizations', 'website', 'update') as website,
--        has_column_privilege('jobs_runtime', 'jobs.organizations', 'legal_name', 'update') as legal_name;
