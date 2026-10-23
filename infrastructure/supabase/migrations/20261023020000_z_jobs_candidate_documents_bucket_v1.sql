-- Z Jobs — private Storage bucket for candidates' documents (CVs, letters), v1
--
-- Until now the API wrote uploaded files to the local disk of the server.
-- On Vercel that disk is temporary and not shared between instances, so a
-- CV could disappear after a deploy or be missing on the next request.
-- The API now stores them in Supabase Storage (fileStorageService.ts)
-- when it runs against this database with its server-side secret key.
--
-- The bucket is private and has no Storage policies on purpose: only the
-- API (secret key) reads and writes it, and the API checks who may download
-- a document (the candidate, or platform staff). Candidate erasure deletes
-- the files after the database transaction commits.
--
-- Idempotent: safe to run again.

insert into storage.buckets (id, name, public)
values ('jobs-candidate-documents', 'jobs-candidate-documents', false)
on conflict (id) do update set public = false;

-- Check (expected: one row, public = false):
-- select id, public from storage.buckets where id = 'jobs-candidate-documents';
