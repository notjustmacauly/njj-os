import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client that uses the service role key. SERVER-ONLY — never import
 * from a "use client" file. Bypasses RLS, used for narrow operations that
 * legitimately need full access (e.g. reading auth.users from the Team page).
 *
 * If SUPABASE_SERVICE_ROLE_KEY is not set, `createAdminClient` returns null
 * so callers can fall back gracefully (the Team page just renders without
 * emails / last_sign_in instead of crashing).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
