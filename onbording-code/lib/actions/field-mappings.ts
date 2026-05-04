"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WebhookEndpoint = {
  id: string;
  source_name: string;
  channel: "meta" | "google" | "website";
  endpoint_url: string;
  is_active: boolean;
};

export type FieldMapping = {
  id: string;
  endpoint_id: string;
  incoming_json_key: string;
  target_db_column: string;
  transformation_rule: string | null;
  fallback_value: string | null;
  is_active: boolean;
  created_at: string;
};

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) throw new Error("Unauthenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile as { role: string } | null)?.role;
  if (role !== "admin") throw new Error("Unauthorized: admin required");

  return supabase;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getWebhookEndpoints(): Promise<
  { ok: true; endpoints: WebhookEndpoint[] } | { ok: false; error: string }
> {
  try {
    const supabase = await requireAdmin();
    const { data, error } = await supabase
      .from("webhook_endpoints")
      .select("id, source_name, channel, endpoint_url, is_active")
      .order("created_at", { ascending: true });

    if (error) return { ok: false, error: error.message };
    return { ok: true, endpoints: (data ?? []) as WebhookEndpoint[] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function getFieldMappingsForEndpoint(
  endpointId: string,
): Promise<{ ok: true; mappings: FieldMapping[] } | { ok: false; error: string }> {
  try {
    if (!endpointId) return { ok: true, mappings: [] };
    const supabase = await requireAdmin();
    const { data, error } = await supabase
      .from("field_mappings")
      .select(
        "id, endpoint_id, incoming_json_key, target_db_column, transformation_rule, fallback_value, is_active, created_at",
      )
      .eq("endpoint_id", endpointId)
      .order("created_at", { ascending: true });

    if (error) return { ok: false, error: error.message };
    return { ok: true, mappings: (data ?? []) as FieldMapping[] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

const upsertMappingSchema = z.object({
  endpoint_id: z.string().uuid(),
  incoming_json_key: z.string().min(1).max(120).trim(),
  target_db_column: z.string().min(1).max(120).trim(),
  transformation_rule: z.string().max(60).trim().nullable().optional(),
  fallback_value: z.string().max(255).trim().nullable().optional(),
});

export async function upsertFieldMapping(
  input: z.infer<typeof upsertMappingSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const parsed = upsertMappingSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Invalid input: " + JSON.stringify(parsed.error.flatten().fieldErrors) };
    }

    const supabase = await requireAdmin();
    const { data, error } = await supabase
      .from("field_mappings")
      .upsert(
        {
          endpoint_id: parsed.data.endpoint_id,
          incoming_json_key: parsed.data.incoming_json_key,
          target_db_column: parsed.data.target_db_column,
          transformation_rule: parsed.data.transformation_rule ?? null,
          fallback_value: parsed.data.fallback_value ?? null,
          is_active: true,
        },
        { onConflict: "endpoint_id,incoming_json_key" },
      )
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, id: (data as { id: string }).id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function deleteFieldMapping(
  mappingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!mappingId) return { ok: false, error: "Missing mapping ID" };
    const supabase = await requireAdmin();
    const { error } = await supabase
      .from("field_mappings")
      .delete()
      .eq("id", mappingId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function toggleFieldMapping(
  mappingId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await requireAdmin();
    const { error } = await supabase
      .from("field_mappings")
      .update({ is_active: isActive })
      .eq("id", mappingId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
