"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const sourceSchema = z.enum(["meta", "google", "website"]);

export type LeadColumnMeta = {
  column_name: string;
  data_type: string;
};

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

export async function getLatestWebhookPayload(
  source: z.infer<typeof sourceSchema>,
): Promise<{ ok: true; payload: Record<string, unknown> | null } | { ok: false; error: string }> {
  try {
    const parsed = sourceSchema.safeParse(source);
    if (!parsed.success) {
      return { ok: false, error: "Invalid source" };
    }

    const supabase = await requireAdmin();

    const { data, error } = await supabase
      .from("webhook_logs")
      .select("raw_payload")
      .eq("source", parsed.data)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[getLatestWebhookPayload]", error.message);
      return { ok: false, error: error.message };
    }

    const row = data as { raw_payload: Record<string, unknown> | null } | null;
    const raw = row?.raw_payload;
    if (raw == null || typeof raw !== "object") {
      return { ok: true, payload: null };
    }

    return { ok: true, payload: raw as Record<string, unknown> };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function getDatabaseSchema(): Promise<
  { ok: true; columns: LeadColumnMeta[] } | { ok: false; error: string }
> {
  try {
    const supabase = await requireAdmin();

    const { data, error } = await supabase.rpc("get_leads_columns");

    if (error) {
      console.error("[getDatabaseSchema]", error.message);
      return { ok: false, error: error.message };
    }

    const rows = (data ?? []) as Array<{ column_name: string; data_type: string }>;
    const columns = rows.map((r) => ({
      column_name: r.column_name,
      data_type: r.data_type,
    }));

    return { ok: true, columns };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}
