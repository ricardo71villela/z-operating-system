import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client — backend only, never exposed to the browser.
 * Bypasses RLS deliberately: the backend enforces tenant scoping explicitly
 * in each query instead of relying on session-based policies.
 */
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } },
);
