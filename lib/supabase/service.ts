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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set — cannot create service role client");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — service role client cannot be created");

  serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return serviceClient;
}
