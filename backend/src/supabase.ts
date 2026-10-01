import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

let adminClient: SupabaseClient | undefined;
let authClient: SupabaseClient | undefined;

// Service role: bypasses RLS. Used for all table access, so author IDs stay server-side.
export function admin() {
  adminClient ??= createClient(env().SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY, options);
  return adminClient;
}

// Anon key: used only for Supabase Auth (sign up, sign in, refresh), never for tables.
export function auth() {
  authClient ??= createClient(env().SUPABASE_URL, env().SUPABASE_ANON_KEY, options);
  return authClient.auth;
}
