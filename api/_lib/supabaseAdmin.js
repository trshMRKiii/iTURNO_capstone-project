import { createClient } from "@supabase/supabase-js";

// Service-role key: full read/write, bypasses RLS. Lives only in Vercel's
// server-side env vars (never VITE_-prefixed, never shipped to the browser).
// The frontend never talks to Supabase directly — every remote read/write
// goes through these serverless functions so authorization stays in one
// place instead of being split between RLS policies and app code.
let client = null;

export function supabaseAdmin() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured");
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
