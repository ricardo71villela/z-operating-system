import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
}

export const supabaseAdmin = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const deskAdmin = supabaseAdmin.schema('desk');
export const zosAdmin = supabaseAdmin.schema('zos');
