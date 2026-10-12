import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only client using the service role key. Never import from client components.
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
