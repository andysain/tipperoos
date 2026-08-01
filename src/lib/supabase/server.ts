import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client. Never import this from a Client Component —
// it holds the service_role key. All reads/writes go through Server
// Components or Route Handlers, never a direct browser call.
export function createServerSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
