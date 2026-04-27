/**
 * Service role bypasses RLS — use only from server-side trusted code.
 *
 * Typed inserts (e.g. task_remarks) still use `Database["public"]["Tables"][...]` at call sites.
 * Supabase generics expect a generated schema; full file uses `any` on the client handle to avoid `insert()` collapsing to `never`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serviceClient: SupabaseClient<any> | null = null;

export function getServiceSupabaseClient(): SupabaseClient<any> {
  if (serviceClient) return serviceClient;

  serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  return serviceClient;
}
