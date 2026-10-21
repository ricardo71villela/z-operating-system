import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Refreshes the Supabase session on every page request and writes the
 * renewed cookies on the response. Server Components cannot write
 * cookies, so without this the session silently expires after the
 * access-token lifetime (1 h) and every page falls back to
 * "session unavailable".
 *
 * Returns undefined when Supabase is not configured (nothing to check),
 * null when there is no valid session, the user id otherwise.
 */
export async function refreshSession(request: NextRequest, response: NextResponse): Promise<string | null | undefined> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return undefined;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  try {
    const { data, error } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    return !error && typeof sub === "string" && sub ? sub : null;
  } catch {
    return null;
  }
}
